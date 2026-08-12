import { PublicKey } from '@solana/web3.js';
import { KNOWN_SPECIAL_WALLETS } from './holders';
import { heliusRpcUrl } from '@/lib/solana/connection';
import { devProfilerService } from './devProfiler';
import type { TagType, TokenHolder, TokenMetadata, WalletTagMap } from './types';

/*
 * PORTED FROM Tool-Memecoin `src/services/historicalScanner.ts`, unchanged
 * except for three things that had to move server-side:
 *   - the RPC URL now comes from HELIUS_API_KEY on the server, not localStorage
 *   - `toDashboardShape` takes the tag map as an argument instead of reading a
 *     browser cache, because there is no localStorage on the server
 *   - `TokenHolder` here has no `rawAmount` / `percentOfCirculating`, so those
 *     two fields are dropped from the mapped rows
 * The replay algorithm itself is untouched.
 */

/**
 * ============================================================================
 * HISTORICAL POINT-IN-TIME SCANNER
 * ============================================================================
 *
 * WHY THIS FILE EXISTS / HOW IT ACTUALLY WORKS
 * --------------------------------------------
 * Solana exposes no "account state at slot N" RPC. Validators prune AccountsDB,
 * so `getAccountInfo`, `getTokenAccountsByOwner` and the Helius DAS API can only
 * ever answer "right now". (`minContextSlot` is a freshness floor, not a
 * time-travel parameter.) Historical balances therefore have to be *derived*.
 *
 * This engine derives them by REVERSE-REPLAY, which is exact and cheap:
 *
 *   For any token account, if it was never touched between targetSlot and now,
 *   its balance at targetSlot is identical to its balance now.
 *
 * So we:
 *   1. Anchor on live state (one DAS call -> every current token account).
 *   2. Pull only the transaction window (targetSlot, now] for the mint + pools.
 *   3. For each token account touched in that window, keep the `preTokenBalance`
 *      of the EARLIEST transaction that touched it. That is exactly the balance
 *      the account held at targetSlot.
 *   4. Untouched accounts keep their live value, which is already correct.
 *
 * Using live DAS as the anchor is NOT "falling back to live data" -- it is the
 * terminal condition of an exact rewind. The distinction that matters is the
 * strict rule below, which this module enforces with hard failures.
 *
 * STRICT RULE (enforced)
 * ----------------------
 * In HISTORICAL mode nothing live is ever surfaced. Price, market cap and
 * liquidity come exclusively from on-chain state at or before the target slot,
 * and SOL/USD comes from a minute-resolution historical quote. If any of those
 * cannot be resolved this module THROWS. It never silently degrades to
 * DexScreener / current reserves, because a silent degrade is precisely the bug
 * this replaces.
 *
 * PERFORMANCE
 * -----------
 *   - signatures: paged 1,000 per call
 *   - transactions: JSON-RPC array batches sized to the per-second budget
 *   - MEASURED: Helius bills a batch per ELEMENT, not per round trip, so the
 *     limiter counts method calls. Wall clock is therefore roughly
 *     (window transactions / rps) seconds -- ~3.5 min for a 2,000-tx window on
 *     a 10 rps free key, and proportionally faster on a paid plan.
 *   - the fold is order-independent, so chunks are processed as they stream in
 *     rather than buffering the window (~20 KB of JSON per transaction)
 *   - work is bounded by `maxTransactions`; exceeding it throws rather than
 *     silently truncating (truncation would produce confidently wrong balances)
 */

// ---------------------------------------------------------------------------
// Public contract
// ---------------------------------------------------------------------------

export interface HistoricalScanResult {
  scanMode: 'LIVE' | 'HISTORICAL';
  slotNumber?: number;
  timestampUsed: string;
  tokenInfo: {
    priceInSol: number;
    marketCapUsd: number;
    marketCapSol: number;
    totalLiquiditySol: number;
  };
  holders: Array<{
    walletAddress: string;
    tokenBalance: number;
    solValue: number;
    supplyPercentage: number;
    isDev: boolean;
    isLiquidityPool: boolean;
  }>;
  /** Provenance. Optional, but the UI uses it to prove which mode produced a card. */
  diagnostics?: ScanDiagnostics;
}

export interface ScanDiagnostics {
  mint: string;
  decimals: number;
  totalSupply: number;
  solUsdPrice: number;
  /** How the price/market-cap figures were derived. */
  priceSource: 'PUMP_BONDING_CURVE_EVENT' | 'AMM_POOL_RESERVES' | 'DEXSCREENER_LIVE';
  /** Slot of the trade the historical price was read from. */
  priceSlot?: number;
  signaturesScanned?: number;
  transactionsReplayed?: number;
  accountsRewound?: number;
  elapsedMs: number;
  /** Non-fatal caveats worth surfacing to the operator. */
  warnings: string[];
}

export interface ScanOptions {
  /** Unix SECONDS. Omit/null for LIVE mode. */
  targetTimestamp?: number | null;
  /** Skips a pump.fun lookup when the caller already knows the creator. */
  devAddress?: string | null;
  onProgress?: (message: string) => void;
  /** Requests per second ceiling. Helius free tier is 10. */
  requestsPerSecond?: number;
  /** Abort threshold for the replay window. */
  maxTransactions?: number;
  /** Rows returned. Percentages are always computed against full supply. */
  maxHolders?: number;
  rpcUrl?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PUMP_FUN_PROGRAM = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const WSOL_MINT = 'So11111111111111111111111111111111111111112';

/** sha256("event:TradeEvent")[0..8] -- pump.fun's anchor event tag. */
const TRADE_EVENT_DISCRIMINATOR = 'bddb7fd34ee661ee';
/** sha256("anchor:event")[0..8] -- wrapper anchor puts on `emit_cpi!` self-invokes. */
const ANCHOR_CPI_EVENT_TAG = 'e445a52e51cb9a1d';

/**
 * pump.fun seeds its curve with 30 virtual SOL. Real (withdrawable) SOL is
 * therefore virtualSolReserves - 30. Used only to report liquidity.
 */
const PUMP_INITIAL_VIRTUAL_SOL = 30;

/** Average slot time. Only a starting guess for interpolation; refined by probes. */
const APPROX_SLOT_MS = 400;

/** 429s are expected on a metered key and are recovered from, not fatal. */
const MAX_RPC_ATTEMPTS = 8;

const DEFAULTS = {
  /**
   * Helius free tier advertises 10 rps but meters by credit, and a
   * `getTransaction` sweep burns credits far faster than a `getSlot` poll — so
   * the honest starting point is well under the advertised number. The limiter
   * halves this on its own when the key pushes back; TRACKER_RPS raises the
   * ceiling for a paid key.
   */
  requestsPerSecond: Number(process.env.TRACKER_RPS) > 0 ? Number(process.env.TRACKER_RPS) : 5,
  maxTransactions: 20_000,
  maxHolders: 400,
};

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class HistoricalScanError extends Error {
  readonly hint?: string;

  constructor(message: string, hint?: string) {
    super(message);
    this.name = 'HistoricalScanError';
    this.hint = hint;
  }
}

/**
 * Sliding-window limiter, measured in METHOD CALLS rather than HTTP requests.
 *
 * Verified against Helius: a JSON-RPC array batch is billed per element, not per
 * round trip. A 100-call batch on a 10 rps key returns 429 immediately. So a
 * batch must reserve one token per sub-call.
 */
class RateLimiter {
  private hits: number[] = [];
  private readonly ceiling: number;
  private rps: number;
  private throttledAt = 0;

  constructor(rps: number) {
    this.ceiling = Math.max(1, rps);
    this.rps = this.ceiling;
  }

  get capacity(): number {
    return this.rps;
  }

  get throttled(): boolean {
    return this.rps < this.ceiling;
  }

  /**
   * Halve the rate after a 429.
   *
   * Helius keys are credit-metered, not a clean fixed rps, so the configured
   * rate is a guess that a heavy `getTransaction` run can outrun. Backing off
   * alone does not help — the next chunk goes out at the same doomed rate and
   * burns another six attempts. Dropping the rate makes the scan finish slowly
   * instead of failing outright.
   */
  throttle(): void {
    this.rps = Math.max(1, Math.floor(this.rps / 2));
    this.throttledAt = Date.now();
  }

  /** Creep back up after 30s of clean traffic, so one blip is not permanent. */
  relax(): void {
    if (this.rps >= this.ceiling) return;
    if (Date.now() - this.throttledAt < 30_000) return;
    this.rps = Math.min(this.ceiling, this.rps + 1);
    this.throttledAt = Date.now();
  }

  async acquire(cost = 1): Promise<void> {
    let remaining = cost;
    while (remaining > 0) {
      const now = Date.now();
      this.hits = this.hits.filter((t) => now - t < 1000);

      const free = this.rps - this.hits.length;
      if (free > 0) {
        const take = Math.min(free, remaining);
        for (let i = 0; i < take; i++) this.hits.push(now);
        remaining -= take;
        if (remaining === 0) return;
      }

      const oldest = this.hits[0] ?? now;
      await sleep(Math.max(20, 1000 - (now - oldest) + 5));
    }
  }
}

const B58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const B58_MAP: Record<string, number> = {};
for (let i = 0; i < B58_ALPHABET.length; i++) B58_MAP[B58_ALPHABET[i] as string] = i;

/** Self-contained base58 decode; avoids pulling bs58 in just for event blobs. */
function bs58Decode(input: string): Uint8Array {
  const bytes: number[] = [0];
  for (const ch of input) {
    const val = B58_MAP[ch];
    if (val === undefined) throw new Error(`invalid base58 char "${ch}"`);
    let carry = val;
    for (let j = 0; j < bytes.length; j++) {
      carry += (bytes[j] as number) * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (let k = 0; k < input.length && input[k] === '1'; k++) bytes.push(0);
  return new Uint8Array(bytes.reverse());
}

function base64Decode(input: string): Uint8Array {
  const bin = atob(input);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function readU64LE(bytes: Uint8Array, offset: number): bigint {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getBigUint64(offset, true);
}

function rawToUi(raw: bigint, decimals: number): number {
  return Number(raw) / Math.pow(10, decimals);
}

// ---------------------------------------------------------------------------
// RPC layer
// ---------------------------------------------------------------------------

interface RpcCall {
  method: string;
  params: unknown[];
}

class RpcClient {
  private readonly url: string;
  private readonly limiter: RateLimiter;

  constructor(url: string, limiter: RateLimiter) {
    this.url = url;
    this.limiter = limiter;
  }

  /**
   * Single call. Unlike `batch`, a JSON-RPC error here is fatal: the callers of
   * `call` are the scan's preconditions (supply, slot, price), and letting one
   * collapse to `null` produces a confident wrong diagnosis further down —
   * a rate-limited `getTokenSupply` came back as "Is that a valid SPL mint?".
   */
  async call<T>(method: string, params: unknown[]): Promise<T> {
    const errors: string[] = [];
    const [result] = await this.batch<T>([{ method, params }], (_, message) =>
      errors.push(message)
    );
    const failure = errors[0];
    if (failure !== undefined) {
      throw new HistoricalScanError(`RPC error on ${method}: ${failure}`);
    }
    if (result === undefined) {
      throw new HistoricalScanError(`RPC returned no result for ${method}`);
    }
    return result;
  }

  /**
   * JSON-RPC array batching.
   *
   * Batch width is pinned to the per-second budget: since Helius charges per
   * element, a wider batch buys nothing but a 429. At the default 10 rps this
   * is one round trip of 10 calls per second, which also keeps the browser from
   * buffering tens of megabytes of transaction JSON at once.
   */
  async batch<T>(
    calls: RpcCall[],
    onItemError?: (index: number, message: string) => void
  ): Promise<T[]> {
    if (calls.length === 0) return [];
    const out: T[] = [];

    // Width is read per chunk, not once: a 429 mid-run narrows the limiter and
    // every subsequent chunk must shrink with it.
    for (let i = 0; i < calls.length; ) {
      const width = Math.max(1, Math.min(100, this.limiter.capacity));
      const chunk = calls.slice(i, i + width);
      const body = chunk.map((c, idx) => ({
        jsonrpc: '2.0',
        id: i + idx,
        method: c.method,
        params: c.params,
      }));

      let parsed: any = null;
      let lastError = '';

      for (let attempt = 0; attempt < MAX_RPC_ATTEMPTS; attempt++) {
        // One token per sub-call -- Helius bills batches per element.
        await this.limiter.acquire(chunk.length);
        try {
          const res = await fetch(this.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });

          if (res.status === 429) {
            // Narrow the pipe, then wait. Capped at 8s: past that the delay
            // costs more than the extra headroom buys, and the throttled rate
            // is what actually clears the 429s.
            this.limiter.throttle();
            await sleep(Math.min(8000, 500 * Math.pow(2, attempt)));
            lastError = 'rate limited (429)';
            continue;
          }
          if (!res.ok) {
            lastError = `HTTP ${res.status}`;
            await sleep(250 * (attempt + 1));
            continue;
          }

          parsed = await res.json();
          this.limiter.relax();
          break;
        } catch (e: any) {
          lastError = e?.message || 'network error';
          await sleep(250 * (attempt + 1));
        }
      }

      if (!parsed) {
        throw new HistoricalScanError(
          `RPC batch failed after ${MAX_RPC_ATTEMPTS} attempts (${chunk[0]?.method}): ${lastError}`,
          lastError.includes('429')
            ? 'The RPC key is rate limited. Lower TRACKER_RPS, wait a minute, or use a key with more headroom.'
            : 'Check HELIUS_RPC_URL / HELIUS_API_KEY and the endpoint status.'
        );
      }

      const rows = Array.isArray(parsed) ? parsed : [parsed];
      // Batch responses may come back out of order; id maps back to position.
      const byId = new Map<number, any>();
      for (const row of rows) byId.set(row.id, row);

      for (let idx = 0; idx < chunk.length; idx++) {
        const row = byId.get(i + idx);
        // A per-item error (e.g. "slot was skipped") is data, not a failure —
        // but hand it to the caller, which may care.
        if (row?.error && onItemError) {
          onItemError(i + idx, String(row.error?.message ?? row.error));
        }
        out.push((row?.result ?? null) as T);
      }

      i += chunk.length;
    }

    return out;
  }
}

// ---------------------------------------------------------------------------
// Step 1: timestamp -> slot
// ---------------------------------------------------------------------------

/**
 * Resolves the greatest confirmed slot whose block time is <= targetUnix.
 *
 * Slot/time is near-linear, so we interpolate first (converges in a handful of
 * probes) and only then binary-search the remaining window. Skipped slots are
 * handled by asking `getBlocks` for the nearest slot that was actually produced.
 */
async function resolveSlotForTimestamp(
  rpc: RpcClient,
  targetUnix: number,
  onProgress?: (m: string) => void
): Promise<number> {
  onProgress?.('Resolving Solana slot for target timestamp...');

  const currentSlot = await rpc.call<number>('getSlot', [{ commitment: 'confirmed' }]);
  const currentTime = await blockTimeOf(rpc, currentSlot);

  if (currentTime === null) {
    throw new HistoricalScanError('Could not read the current block time from the RPC.');
  }
  if (targetUnix >= currentTime) {
    throw new HistoricalScanError(
      'The selected time is not in the past.',
      'Pick a UTC date/time earlier than the current chain time, or use Scan Now.'
    );
  }

  // --- interpolation phase -------------------------------------------------
  let estimate = currentSlot - Math.floor(((currentTime - targetUnix) * 1000) / APPROX_SLOT_MS);
  estimate = Math.max(1, estimate);

  let probeTime: number | null = null;
  for (let i = 0; i < 8; i++) {
    const probeSlot = await nearestProducedSlot(rpc, estimate);
    if (probeSlot === null) break;

    probeTime = await blockTimeOf(rpc, probeSlot);
    if (probeTime === null) break;

    const driftSec = targetUnix - probeTime;
    if (Math.abs(driftSec) <= 5) {
      estimate = probeSlot;
      break;
    }
    const next = probeSlot + Math.floor((driftSec * 1000) / APPROX_SLOT_MS);
    estimate = Math.max(1, Math.min(currentSlot, next));
  }

  // --- exact phase ---------------------------------------------------------
  // Bracket the estimate and binary-search the produced slots inside it.
  const span = 4000; // ~27 min of slots; comfortably covers interpolation error
  let lo = Math.max(1, estimate - span);
  let hi = Math.min(currentSlot, estimate + span);

  const produced = await rpc.call<number[]>('getBlocks', [lo, hi]);
  if (!produced || produced.length === 0) {
    throw new HistoricalScanError(
      'RPC returned no produced blocks around the target time.',
      'This usually means the endpoint lacks archival history that far back. A Helius paid plan or another archive RPC is required.'
    );
  }

  let left = 0;
  let right = produced.length - 1;
  let answer = -1;

  while (left <= right) {
    const mid = (left + right) >> 1;
    const t = await blockTimeOf(rpc, produced[mid] as number);
    if (t === null) {
      // Unreadable block time: treat as too new and keep searching lower.
      right = mid - 1;
      continue;
    }
    if (t <= targetUnix) {
      answer = mid;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  if (answer === -1) {
    throw new HistoricalScanError(
      'Target time is older than the archival range this RPC can serve.',
      'Choose a more recent time or point the app at an archive RPC.'
    );
  }

  const slot = produced[answer];
  if (slot === undefined) {
    throw new HistoricalScanError('Could not resolve a produced slot for that timestamp.');
  }
  onProgress?.(`Target slot resolved: ${slot.toLocaleString()}`);
  return slot;
}

async function blockTimeOf(rpc: RpcClient, slot: number): Promise<number | null> {
  const t = await rpc.call<number | null>('getBlockTime', [slot]);
  return typeof t === 'number' ? t : null;
}

/** `getBlockTime` errors on skipped slots, so find one that was actually produced. */
async function nearestProducedSlot(rpc: RpcClient, slot: number): Promise<number | null> {
  const blocks = await rpc.call<number[]>('getBlocks', [Math.max(1, slot), slot + 150]);
  return blocks && blocks.length > 0 ? (blocks[0] as number) : null;
}

// ---------------------------------------------------------------------------
// Step 2: historical SOL/USD (minute resolution)
// ---------------------------------------------------------------------------

/**
 * Market cap in USD is meaningless if it is priced with today's SOL. Binance
 * klines give free minute-granularity history with no API key; CoinGecko is the
 * fallback. Both failing is fatal in historical mode by design.
 */
async function fetchHistoricalSolUsd(targetUnix: number): Promise<number> {
  const ms = targetUnix * 1000;

  try {
    const url =
      `https://api.binance.com/api/v3/klines?symbol=SOLUSDT&interval=1m` +
      `&startTime=${ms - 60_000}&endTime=${ms + 60_000}&limit=2`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (res.ok) {
      const rows = await res.json();
      // kline row: [openTime, open, high, low, close, ...]
      const close = Array.isArray(rows) && rows.length > 0 ? parseFloat(rows[rows.length - 1][4]) : NaN;
      if (Number.isFinite(close) && close > 0) return close;
    }
  } catch {
    // fall through to CoinGecko
  }

  try {
    const from = targetUnix - 3600;
    const to = targetUnix + 3600;
    const url = `https://api.coingecko.com/api/v3/coins/solana/market_chart/range?vs_currency=usd&from=${from}&to=${to}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const data = await res.json();
      const points: Array<[number, number]> = data?.prices || [];
      if (points.length > 0) {
        // Nearest sample to the target instant.
        let best: [number, number] = points[0] as [number, number];
        for (const p of points) {
          if (Math.abs(p[0] - ms) < Math.abs(best[0] - ms)) best = p;
        }
        if (Number.isFinite(best[1]) && best[1] > 0) return best[1];
      }
    }
  } catch {
    // fall through to the throw
  }

  throw new HistoricalScanError(
    'Could not resolve the historical SOL/USD price for that minute.',
    'Binance and CoinGecko were both unreachable. Historical mode refuses to price market cap with the live SOL rate.'
  );
}

// ---------------------------------------------------------------------------
// Live state anchor (Helius DAS)
// ---------------------------------------------------------------------------

interface AccountBalance {
  owner: string;
  raw: bigint;
}

/** tokenAccount -> { owner, raw }. One DAS page per 1,000 accounts. */
async function fetchLiveTokenAccounts(
  rpcUrl: string,
  limiter: RateLimiter,
  mint: string,
  onProgress?: (m: string) => void
): Promise<Map<string, AccountBalance>> {
  const map = new Map<string, AccountBalance>();
  let page = 1;

  for (;;) {
    await limiter.acquire();
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'das-token-accounts',
        method: 'getTokenAccounts',
        params: { mint, page, limit: 1000, options: { showZeroBalance: false } },
      }),
    });

    if (!res.ok) {
      throw new HistoricalScanError(
        `Helius DAS getTokenAccounts failed with HTTP ${res.status}.`,
        'getTokenAccounts is a Helius DAS extension; a non-Helius RPC will not serve it.'
      );
    }

    const data = await res.json();
    if (data.error) {
      throw new HistoricalScanError(`Helius DAS error: ${data.error.message || 'unknown'}.`);
    }

    const accounts = data.result?.token_accounts;
    if (!Array.isArray(accounts) || accounts.length === 0) break;

    for (const acc of accounts) {
      if (!acc?.address || !acc?.owner) continue;
      map.set(acc.address, { owner: acc.owner, raw: BigInt(acc.amount || 0) });
    }

    onProgress?.(`Anchoring on live state: ${map.size.toLocaleString()} token accounts...`);
    if (accounts.length < 1000) break;
    page++;
    if (page > 60) break; // 60k accounts is far past anything this dashboard ranks
  }

  return map;
}

// ---------------------------------------------------------------------------
// Step 3: the replay window
// ---------------------------------------------------------------------------

interface SignatureRow {
  signature: string;
  slot: number;
  blockTime?: number | null;
  err?: unknown;
}

/**
 * Collects every signature above `afterSlot` for the given addresses.
 *
 * The mint alone is not sufficient: legacy Raydium AMM v4 swaps reference only
 * the pool vaults, not the mint. Passing pool/vault addresses alongside the mint
 * closes that gap. Results are de-duplicated by signature.
 */
async function collectSignaturesAfterSlot(
  rpc: RpcClient,
  addresses: string[],
  afterSlot: number,
  maxTransactions: number,
  onProgress?: (m: string) => void
): Promise<SignatureRow[]> {
  const seen = new Map<string, SignatureRow>();

  for (const address of addresses) {
    let before: string | undefined;

    for (;;) {
      const params: any[] = [address, { limit: 1000, ...(before ? { before } : {}) }];
      const rows = await rpc.call<SignatureRow[]>('getSignaturesForAddress', params);
      if (!rows || rows.length === 0) break;

      let crossedBoundary = false;
      for (const row of rows) {
        if (row.slot <= afterSlot) {
          crossedBoundary = true;
          continue;
        }
        if (row.err) continue; // failed txs moved nothing
        if (!seen.has(row.signature)) seen.set(row.signature, row);
      }

      onProgress?.(
        `Mapping replay window: ${seen.size.toLocaleString()} transactions since target slot...`
      );

      if (seen.size > maxTransactions) {
        throw new HistoricalScanError(
          `The replay window exceeds ${maxTransactions.toLocaleString()} transactions.`,
          'That target time is too far back for on-the-fly reconstruction. Pick a more recent time, or move this scan to a pre-indexed balance-history provider (Dune, Flipside, Vybe, Bitquery).'
        );
      }

      if (crossedBoundary || rows.length < 1000) break;
      const lastRow = rows[rows.length - 1];
      if (!lastRow) break;
      before = lastRow.signature;
    }
  }

  return Array.from(seen.values());
}

interface RewindEntry {
  slot: number;
  owner: string;
  raw: bigint;
}

/**
 * Streams the replay window and folds it straight into a rewind map.
 *
 * For every token account we keep the PRE balance of the EARLIEST transaction
 * that touched it inside the window. That value is by definition the balance the
 * account held at targetSlot. Keeping the minimum slot makes the fold
 * order-independent, so chunks can be processed as they arrive instead of
 * buffering the whole window (a 2,000-tx window is ~40 MB of parsed JSON).
 *
 * Ties inside a single slot are not resolvable -- the RPC exposes no intra-block
 * index -- but a sub-400 ms ordering error is immaterial to a holder snapshot.
 */
async function replayWindowToSlot(
  rpc: RpcClient,
  signatures: string[],
  mint: string,
  requestsPerSecond: number,
  onProgress?: (m: string) => void
): Promise<{ rewind: Map<string, RewindEntry>; transactionsReplayed: number }> {
  const rewind = new Map<string, RewindEntry>();
  let replayed = 0;

  const width = Math.max(1, Math.min(100, requestsPerSecond));
  const startedAt = Date.now();

  for (let i = 0; i < signatures.length; i += width) {
    const chunk = signatures.slice(i, i + width);

    const txs = await rpc.batch<any>(
      chunk.map((sig) => ({
        method: 'getTransaction',
        params: [
          sig,
          { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'confirmed' },
        ],
      }))
    );

    for (const tx of txs) {
      const meta = tx?.meta;
      if (!meta || meta.err) continue;
      replayed++;

      const pre: any[] = meta.preTokenBalances || [];
      const post: any[] = meta.postTokenBalances || [];
      if (pre.length === 0 && post.length === 0) continue;

      // jsonParsed merges lookup-table addresses into accountKeys, so
      // accountIndex resolves correctly for versioned transactions too.
      const keys: any[] = tx?.transaction?.message?.accountKeys || [];
      const slot: number = tx.slot ?? Number.MAX_SAFE_INTEGER;

      // Unify pre and post balances by account index.
      const accountsInTx = new Map<number, { owner: string; preAmount: string }>();

      for (const p of pre) {
        if (p.mint === mint && p.owner) {
          accountsInTx.set(p.accountIndex, { owner: p.owner, preAmount: p.uiTokenAmount?.amount ?? '0' });
        }
      }

      for (const p of post) {
        if (p.mint === mint && p.owner) {
          // If an account is in post but wasn't in pre, it means it was created in this transaction,
          // or its previous balance was 0. So its pre-transaction balance is '0'.
          if (!accountsInTx.has(p.accountIndex)) {
            accountsInTx.set(p.accountIndex, { owner: p.owner, preAmount: '0' });
          }
        }
      }

      for (const [accountIndex, data] of accountsInTx.entries()) {
        const keyEntry = keys[accountIndex];
        const tokenAccount = typeof keyEntry === 'string' ? keyEntry : keyEntry?.pubkey;
        if (!tokenAccount) continue;

        const existing = rewind.get(tokenAccount);
        // We process from newest to oldest. If existing slot is < current slot,
        // we already found an older transaction for this account, so keep it.
        // If existing.slot === slot, the current tx is older within the same block, so overwrite!
        if (existing && existing.slot < slot) continue;

        rewind.set(tokenAccount, {
          slot,
          owner: data.owner,
          raw: BigInt(data.preAmount),
        });
      }
    }

    const done = Math.min(i + width, signatures.length);
    const elapsed = Date.now() - startedAt;
    const etaSec = done > 0 ? Math.round(((elapsed / done) * (signatures.length - done)) / 1000) : 0;
    onProgress?.(
      `Replaying ledger: ${done.toLocaleString()} / ${signatures.length.toLocaleString()} txs` +
        (etaSec > 2 ? ` (~${etaSec}s remaining)` : '')
    );
  }

  return { rewind, transactionsReplayed: replayed };
}

/** Overlays the rewind onto the live anchor. Untouched accounts are already correct. */
function applyRewind(
  liveAccounts: Map<string, AccountBalance>,
  rewind: Map<string, RewindEntry>
): Map<string, AccountBalance> {
  const balances = new Map<string, AccountBalance>(liveAccounts);
  for (const [tokenAccount, entry] of rewind) {
    balances.set(tokenAccount, { owner: entry.owner, raw: entry.raw });
  }
  return balances;
}

// ---------------------------------------------------------------------------
// Step 4: price / market cap at the target slot
// ---------------------------------------------------------------------------

interface PricePoint {
  priceInSol: number;
  liquiditySol: number;
  source: ScanDiagnostics['priceSource'];
  slot: number;
  /** Vault owner for a migrated pool, or the bonding curve. Tagged as LP. */
  poolAddresses: string[];
}

/**
 * Reads price from the last trade at or before the target slot.
 *
 * pump.fun (pre-migration): the TradeEvent carries virtual reserves, which is
 * the only correct way to price a bonding curve -- real reserves alone omit the
 * virtual offset and produce a badly wrong number.
 *
 * Migrated (PumpSwap / Raydium): constant-product spot price from the pool's own
 * WSOL and token vault balances as recorded in that transaction's post-balances.
 */
async function derivePriceAtSlot(
  rpc: RpcClient,
  mint: string,
  decimals: number,
  targetSlot: number,
  jumpSig?: string,
  onProgress?: (m: string) => void
): Promise<PricePoint> {
  onProgress?.('Reading bonding curve / pool reserves at target slot...');

  const bondingCurve = PublicKey.findProgramAddressSync(
    [new TextEncoder().encode('bonding-curve'), new PublicKey(mint).toBuffer()],
    PUMP_FUN_PROGRAM
  )[0].toBase58();

  // Walk backwards from the target slot until a priceable trade turns up.
  for (const address of [mint, bondingCurve]) {
    let before: string | undefined = jumpSig;

    for (let page = 0; page < 6; page++) {
      const rows = await rpc.call<SignatureRow[]>('getSignaturesForAddress', [
        address,
        { limit: 1000, ...(before ? { before } : {}) },
      ]);
      if (!rows || rows.length === 0) break;

      const candidates = rows.filter((r) => r.slot <= targetSlot && !r.err);

      if (candidates.length > 0) {
        // Search in chunks of 20 to avoid blasting the RPC, but don't give up
        // until we actually find a trade.
        for (let i = 0; i < candidates.length; i += 20) {
          const chunk = candidates.slice(i, i + 20);
          const txs = await rpc.batch<any>(
            chunk.map((r) => ({
              method: 'getTransaction',
              params: [
                r.signature,
                { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'confirmed' },
              ],
            }))
          );

          // Newest first -- the closest trade at or before the target slot wins.
          const ordered = txs.filter(Boolean).sort((a, b) => (b.slot || 0) - (a.slot || 0));

          for (const tx of ordered) {
            const curve = readPumpTradeEvent(tx, mint, decimals);
            if (curve) {
              return { ...curve, slot: tx.slot, poolAddresses: [bondingCurve] };
            }
            const amm = readAmmReserves(tx, mint, decimals);
            if (amm) {
              return { ...amm, slot: tx.slot, poolAddresses: amm.poolAddresses };
            }
          }
        }
      }

      if ((rows[rows.length - 1]?.slot ?? 0) <= targetSlot) {
        // If we processed all candidates in this page (which goes past targetSlot)
        // and found no trade, we must continue to the next page, but we must use
        // the last candidate as the 'before' cursor.
        // Actually, if we are here, we already checked all transactions past the target slot
        // in this page. We just need to fetch the next page.
      }
      const lastRow = rows[rows.length - 1];
      if (!lastRow) break;
      before = lastRow.signature;
    }
  }

  throw new HistoricalScanError(
    'No priceable trade found at or before the target slot.',
    'Historical mode will not price a snapshot with live reserves. Try a time after the token started trading, or a more recent target.'
  );
}

/** Parses pump.fun's anchor TradeEvent out of logs (`emit!`) or CPI data (`emit_cpi!`). */
function readPumpTradeEvent(
  tx: any,
  mint: string,
  decimals: number
): Omit<PricePoint, 'slot' | 'poolAddresses'> | null {
  const blobs: Uint8Array[] = [];

  for (const line of (tx?.meta?.logMessages as string[]) || []) {
    if (!line.startsWith('Program data: ')) continue;
    try {
      blobs.push(base64Decode(line.slice('Program data: '.length).trim()));
    } catch {
      /* not our event */
    }
  }

  for (const group of (tx?.meta?.innerInstructions as any[]) || []) {
    for (const ix of group?.instructions || []) {
      if (ix?.programId !== PUMP_FUN_PROGRAM.toBase58() || typeof ix?.data !== 'string') continue;
      try {
        blobs.push(bs58Decode(ix.data));
      } catch {
        /* not our event */
      }
    }
  }

  for (const raw of blobs) {
    let body = raw;
    // Strip the emit_cpi! wrapper tag when present.
    if (body.length >= 8 && toHex(body.subarray(0, 8)) === ANCHOR_CPI_EVENT_TAG) {
      body = body.subarray(8);
    }
    if (body.length < 8 || toHex(body.subarray(0, 8)) !== TRADE_EVENT_DISCRIMINATOR) continue;

    const payload = body.subarray(8);
    // Stable prefix: mint(32) sol(8) token(8) isBuy(1) user(32) ts(8) vSol(8) vTokens(8)
    if (payload.length < 105) continue;

    const eventMint = new PublicKey(payload.subarray(0, 32)).toBase58();
    if (eventMint !== mint) continue;

    const virtualSol = readU64LE(payload, 89);
    const virtualTokens = readU64LE(payload, 97);
    if (virtualSol === 0n || virtualTokens === 0n) continue;

    const solReserve = Number(virtualSol) / 1e9;
    const tokenReserve = rawToUi(virtualTokens, decimals);

    return {
      priceInSol: solReserve / tokenReserve,
      liquiditySol: Math.max(0, solReserve - PUMP_INITIAL_VIRTUAL_SOL),
      source: 'PUMP_BONDING_CURVE_EVENT',
    };
  }

  return null;
}

/**
 * Constant-product spot price for a migrated pool. Finds the WSOL vault and the
 * token vault sharing one owner in this transaction's post-balances.
 */
function readAmmReserves(
  tx: any,
  mint: string,
  decimals: number
): (Omit<PricePoint, 'slot'> & { poolAddresses: string[] }) | null {
  const post: any[] = tx?.meta?.postTokenBalances || [];
  if (post.length === 0) return null;

  const byOwner = new Map<string, { token?: number; wsol?: number }>();

  for (const entry of post) {
    if (!entry?.owner) continue;
    const ui = entry.uiTokenAmount?.uiAmount;
    if (typeof ui !== 'number' || ui <= 0) continue;

    const bucket = byOwner.get(entry.owner) || {};
    if (entry.mint === mint) bucket.token = Math.max(bucket.token || 0, ui);
    else if (entry.mint === WSOL_MINT) bucket.wsol = Math.max(bucket.wsol || 0, ui);
    byOwner.set(entry.owner, bucket);
  }

  // Deepest WSOL side wins. A routing wallet can momentarily hold both sides,
  // but never at pool depth; the floor discards dust pairs outright.
  let best: { owner: string; token: number; wsol: number } | null = null;
  for (const [owner, b] of byOwner) {
    if (!b.token || !b.wsol || b.wsol < 0.05) continue;
    if (!best || b.wsol > best.wsol) best = { owner, token: b.token, wsol: b.wsol };
  }
  if (!best) return null;

  void decimals; // post-balances are already UI-scaled

  return {
    priceInSol: best.wsol / best.token,
    liquiditySol: best.wsol,
    source: 'AMM_POOL_RESERVES',
    poolAddresses: [best.owner],
  };
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

class HistoricalScannerService {
  /**
   * Single entry point for both modes.
   *
   * LIVE       -> DAS holders + DexScreener pricing.
   * HISTORICAL -> slot resolution, reverse-replay holders, on-chain price at
   *               slot, minute-accurate SOL/USD. Throws rather than degrading.
   */
  public async scanToken(mint: string, options: ScanOptions = {}): Promise<HistoricalScanResult> {
    const startedAt = Date.now();
    const {
      targetTimestamp = null,
      devAddress = null,
      onProgress,
      requestsPerSecond = DEFAULTS.requestsPerSecond,
      maxTransactions = DEFAULTS.maxTransactions,
      maxHolders = DEFAULTS.maxHolders,
      rpcUrl = heliusRpcUrl(),
    } = options;

    const warnings: string[] = [];
    const limiter = new RateLimiter(requestsPerSecond);
    const rpc = new RpcClient(rpcUrl, limiter);

    // Supply & decimals. Fixed-supply memecoins make current == historical; if
    // the mint authority is still live we say so rather than pretending.
    const supplyResp = await rpc.call<any>('getTokenSupply', [mint]);
    if (!supplyResp?.value) {
      throw new HistoricalScanError(
        'Could not read the token supply. Is that a valid SPL mint?',
        `Mint queried: ${mint}`
      );
    }
    const decimals: number = supplyResp.value.decimals;
    const totalSupply: number =
      supplyResp.value.uiAmount ?? Number(supplyResp.value.amount) / Math.pow(10, decimals);

    const creator = devAddress || (await devProfilerService.getCreatorForMint(mint).catch(() => null));

    if (targetTimestamp) {
      const mintInfo = await rpc.call<any>('getAccountInfo', [mint, { encoding: 'jsonParsed' }]);
      if (mintInfo?.value?.data?.parsed?.info?.mintAuthority) {
        warnings.push(
          'Mint authority is still active, so supply may have changed since the target time. Percentages use current supply.'
        );
      }
      return this.scanHistorical({
        rpc,
        rpcUrl,
        limiter,
        mint,
        decimals,
        totalSupply,
        creator,
        targetTimestamp,
        requestsPerSecond,
        maxTransactions,
        maxHolders,
        warnings,
        startedAt,
        onProgress,
      });
    }

    return this.scanLive({
      rpcUrl,
      limiter,
      mint,
      decimals,
      totalSupply,
      creator,
      maxHolders,
      warnings,
      startedAt,
      onProgress,
    });
  }

  // -- LIVE -----------------------------------------------------------------

  private async scanLive(ctx: {
    rpcUrl: string;
    limiter: RateLimiter;
    mint: string;
    decimals: number;
    totalSupply: number;
    creator: string | null;
    maxHolders: number;
    warnings: string[];
    startedAt: number;
    onProgress?: (m: string) => void;
  }): Promise<HistoricalScanResult> {
    const { rpcUrl, limiter, mint, decimals, totalSupply, creator, maxHolders, warnings, startedAt, onProgress } = ctx;

    onProgress?.('Fetching live holders from Helius DAS...');
    const accounts = await fetchLiveTokenAccounts(rpcUrl, limiter, mint, onProgress);

    onProgress?.('Fetching live price from DexScreener...');
    let priceInSol = 0;
    let solUsd = 0;
    let liquiditySol = 0;
    const poolAddresses: string[] = [];

    try {
      const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, {
        signal: AbortSignal.timeout(6000),
      });
      if (res.ok) {
        const data = await res.json();
        const pair = data?.pairs?.[0];
        if (pair) {
          priceInSol = parseFloat(pair.priceNative) || 0;
          const priceUsd = parseFloat(pair.priceUsd) || 0;
          if (priceInSol > 0 && priceUsd > 0) solUsd = priceUsd / priceInSol;
          liquiditySol = pair.liquidity?.quote || 0;
          if (pair.pairAddress) poolAddresses.push(pair.pairAddress);
        }
      }
    } catch {
      warnings.push('DexScreener was unreachable; live price is unavailable.');
    }

    if (priceInSol <= 0) warnings.push('No live price found for this mint (no indexed pair).');

    return this.assemble({
      scanMode: 'LIVE',
      timestampUsed: new Date().toISOString(),
      balances: accounts,
      mint,
      decimals,
      totalSupply,
      creator,
      priceInSol,
      solUsd,
      liquiditySol,
      poolAddresses,
      maxHolders,
      diagnostics: {
        mint,
        decimals,
        totalSupply,
        solUsdPrice: solUsd,
        priceSource: 'DEXSCREENER_LIVE',
        elapsedMs: Date.now() - startedAt,
        warnings,
      },
    });
  }

  // -- HISTORICAL -----------------------------------------------------------

  private async scanHistorical(ctx: {
    rpc: RpcClient;
    rpcUrl: string;
    limiter: RateLimiter;
    mint: string;
    decimals: number;
    totalSupply: number;
    creator: string | null;
    targetTimestamp: number;
    requestsPerSecond: number;
    maxTransactions: number;
    maxHolders: number;
    warnings: string[];
    startedAt: number;
    onProgress?: (m: string) => void;
  }): Promise<HistoricalScanResult> {
    const {
      rpc, rpcUrl, limiter, mint, decimals, totalSupply, creator,
      targetTimestamp, requestsPerSecond, maxTransactions, maxHolders, warnings, startedAt, onProgress,
    } = ctx;

    // 1. timestamp -> slot
    const targetSlot = await resolveSlotForTimestamp(rpc, targetTimestamp, onProgress);



    // 3. historical SOL/USD (throws if unresolvable)
    onProgress?.('Fetching historical SOL/USD rate for that minute...');
    const solUsd = await fetchHistoricalSolUsd(targetTimestamp);

    // 4. anchor on live state
    const liveAccounts = await fetchLiveTokenAccounts(rpcUrl, limiter, mint, onProgress);

    // 5. Collect signatures for the mint first, so we can use the oldest signature to jump
    // straight to the target slot for pricing (avoids unbounded backwards paging).
    let signatures = await collectSignaturesAfterSlot(
      rpc, [mint], targetSlot, maxTransactions, onProgress
    );

    // The oldest transaction in the window (if any) is at the end of the array.
    const jumpSig =
      signatures.length > 0 ? signatures[signatures.length - 1]?.signature : undefined;

    // 6. price + liquidity strictly at that slot
    const price = await derivePriceAtSlot(rpc, mint, decimals, targetSlot, jumpSig, onProgress);

    // 7. If the pricing discovered pool addresses, fetch their signatures too and merge.
    const extraAddresses = price.poolAddresses.filter((addr) => !KNOWN_SPECIAL_WALLETS[addr] && addr !== mint);
    if (extraAddresses.length > 0) {
      const extraSigs = await collectSignaturesAfterSlot(
        rpc, extraAddresses, targetSlot, maxTransactions, onProgress
      );
      // Merge and deduplicate
      const seen = new Set(signatures.map((s) => s.signature));
      for (const sig of extraSigs) {
        if (!seen.has(sig.signature)) {
          signatures.push(sig);
          seen.add(sig.signature);
        }
      }
      // Re-sort combined signatures newest-to-oldest (descending slot)
      signatures.sort((a, b) => b.slot - a.slot);
    }

    let rewindMap = new Map<string, RewindEntry>();
    let transactionsReplayed = 0;

    if (signatures.length > 0) {
      const replay = await replayWindowToSlot(
        rpc, signatures.map((s) => s.signature), mint, requestsPerSecond, onProgress
      );
      rewindMap = replay.rewind;
      transactionsReplayed = replay.transactionsReplayed;

      if (transactionsReplayed < signatures.length * 0.98) {
        warnings.push(
          `${(signatures.length - transactionsReplayed).toLocaleString()} transactions in the window could not be fetched; a few accounts may be slightly off.`
        );
      }
    }

    onProgress?.('Rewinding balances to target slot...');
    const balances = applyRewind(liveAccounts, rewindMap);
    const accountsRewound = rewindMap.size;

    warnings.push(
      'Balances are reconstructed by ledger replay. Plain SPL `transfer` (unchecked) instructions omit the mint from account keys and are not indexed against it; trades and `transferChecked` are fully covered.'
    );

    return this.assemble({
      scanMode: 'HISTORICAL',
      slotNumber: targetSlot,
      timestampUsed: new Date(targetTimestamp * 1000).toISOString(),
      balances,
      mint,
      decimals,
      totalSupply,
      creator,
      priceInSol: price.priceInSol,
      solUsd,
      liquiditySol: price.liquiditySol,
      poolAddresses: price.poolAddresses,
      maxHolders,
      diagnostics: {
        mint,
        decimals,
        totalSupply,
        solUsdPrice: solUsd,
        priceSource: price.source,
        priceSlot: price.slot,
        signaturesScanned: signatures.length,
        transactionsReplayed,
        accountsRewound,
        elapsedMs: Date.now() - startedAt,
        warnings,
      },
    });
  }

  // -- shared assembly ------------------------------------------------------

  private assemble(input: {
    scanMode: 'LIVE' | 'HISTORICAL';
    slotNumber?: number;
    timestampUsed: string;
    balances: Map<string, AccountBalance>;
    mint: string;
    decimals: number;
    totalSupply: number;
    creator: string | null;
    priceInSol: number;
    solUsd: number;
    liquiditySol: number;
    poolAddresses: string[];
    maxHolders: number;
    diagnostics: ScanDiagnostics;
  }): HistoricalScanResult {
    const {
      scanMode, slotNumber, timestampUsed, balances, mint, decimals, totalSupply,
      creator, priceInSol, solUsd, liquiditySol, poolAddresses, maxHolders, diagnostics,
    } = input;

    // Collapse token accounts into owners.
    const byOwner = new Map<string, bigint>();
    for (const { owner, raw } of balances.values()) {
      if (raw <= 0n) continue;
      byOwner.set(owner, (byOwner.get(owner) || 0n) + raw);
    }

    const lpSet = new Set(poolAddresses);
    for (const [addr, meta] of Object.entries(KNOWN_SPECIAL_WALLETS)) {
      if (meta.tag === 'lp') lpSet.add(addr);
    }

    // For Pump.fun tokens, we strictly use 1B supply to match Axiom's FDV-based Market Cap logic,
    // regardless of whether it's on the bonding curve or migrated to a DEX.
    const historicalSupply = mint.endsWith('pump') ? 1_000_000_000 : totalSupply;
    const holders = Array.from(byOwner.entries())
      .map(([walletAddress, raw]) => {
        const tokenBalance = rawToUi(raw, decimals);
        return {
          walletAddress,
          tokenBalance,
          solValue: tokenBalance * priceInSol,
          supplyPercentage: historicalSupply > 0 ? (tokenBalance / historicalSupply) * 100 : 0,
          isDev: !!creator && walletAddress === creator,
          isLiquidityPool: lpSet.has(walletAddress),
        };
      })
      .sort((a, b) => b.tokenBalance - a.tokenBalance)
      .slice(0, maxHolders);

    // The dev belongs in the table even at a zero balance -- "dev already sold"
    // is the single most valuable signal a rug snapshot can carry.
    if (creator && !holders.some((h) => h.walletAddress === creator)) {
      holders.push({
        walletAddress: creator,
        tokenBalance: 0,
        solValue: 0,
        supplyPercentage: 0,
        isDev: true,
        isLiquidityPool: false,
      });
    }

    const marketCapSol = historicalSupply * priceInSol;

    return {
      scanMode,
      slotNumber,
      timestampUsed,
      tokenInfo: {
        priceInSol,
        marketCapUsd: marketCapSol * solUsd,
        marketCapSol,
        totalLiquiditySol: liquiditySol,
      },
      holders,
      diagnostics,
    };
  }
}

export const historicalScanner = new HistoricalScannerService();

// ---------------------------------------------------------------------------
// Adapter for the existing dashboard
// ---------------------------------------------------------------------------

/**
 * Maps a scan result onto the app's TokenHolder / TokenMetadata shapes and
 * re-applies the saved insider/outsider tag database. Lives here so App.tsx
 * needs no knowledge of the scanner's internals.
 */
export function toDashboardShape(
  result: HistoricalScanResult,
  base: TokenMetadata,
  savedTags: WalletTagMap = {}
): { metadata: TokenMetadata; holders: TokenHolder[] } {

  const metadata: TokenMetadata = {
    ...base,
    priceNative: result.tokenInfo.priceInSol,
    priceUsd:
      result.diagnostics && result.diagnostics.solUsdPrice > 0
        ? result.tokenInfo.priceInSol * result.diagnostics.solUsdPrice
        : base.priceUsd,
    marketCapUsd: result.tokenInfo.marketCapUsd,
    liquiditySol: result.tokenInfo.totalLiquiditySol,
    liquidityUsd:
      result.tokenInfo.totalLiquiditySol * (result.diagnostics?.solUsdPrice || 0),
  };

  const solUsd = result.diagnostics?.solUsdPrice || 0;

  const holders: TokenHolder[] = result.holders.map((h, index) => {
    const stored = savedTags[h.walletAddress];

    let tag: TagType;
    if (h.isLiquidityPool) tag = 'lp';
    else if (stored?.tag) tag = stored.tag;
    else if (h.isDev) tag = 'insider';
    else tag = 'outsider';

    return {
      rank: index + 1,
      tokenAccount: h.walletAddress,
      ownerAddress: h.walletAddress,
      uiAmount: h.tokenBalance,
      solValue: h.solValue,
      usdValue: h.solValue * solUsd,
      percentOfTotal: h.supplyPercentage,
      tag,
      isLiquidityPool: h.isLiquidityPool,
      poolName: h.isLiquidityPool ? KNOWN_SPECIAL_WALLETS[h.walletAddress]?.name || 'Liquidity Pool' : undefined,
      notes: stored?.notes,
      label: stored?.label || (h.isDev ? 'Token Creator (Dev)' : undefined),
      isDev: h.isDev,
    };
  });

  return { metadata, holders };
}
