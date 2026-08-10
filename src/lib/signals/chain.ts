/**
 * Chain data layer for the live signal engine.
 *
 * Everything here is written for a *freshly migrated* coin, where the pool has
 * a few hundred to a few thousand signatures. Full pagination to genesis is
 * mandatory — `getSignaturesForAddress` returns newest-first, so a truncated
 * fetch silently loses the pool open and every timestamp shifts.
 * See docs/JINPACHI Bin 20.md §15 trap #1.
 */

import { PublicKey } from '@solana/web3.js';
import { getConnection, heliusRpcUrl } from '@/lib/solana/connection';

export const WSOL_MINT = 'So11111111111111111111111111111111111111112';

export interface PoolInfo {
  pool: string;
  pairCreatedAt: number | null;
  marketCapUsd: number | null;
  liquidityUsd: number | null;
  priceUsd: number | null;
  symbol: string | null;
  name: string | null;
}

export interface ParsedTx {
  signature: string;
  timestamp: number;
  type?: string;
  feePayer?: string;
  tokenTransfers?: Array<{
    mint?: string;
    tokenAmount?: number;
    fromUserAccount?: string;
    toUserAccount?: string;
  }>;
  nativeTransfers?: Array<{
    amount?: number;
    fromUserAccount?: string;
    toUserAccount?: string;
  }>;
}

export interface Swap {
  /** Seconds since pool open. */
  t: number;
  /** Implied fully-diluted market cap in USD. */
  mcap: number;
  /** SOL value of the swap. */
  sol: number;
  /** true = buy from pool, false = sell into pool. */
  isBuy: boolean;
  /** The wallet on the non-pool side. */
  actor: string | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const PUMP_PROGRAM = new PublicKey(
  '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'
);

export function bondingCurvePda(mint: string): string {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('bonding-curve'), new PublicKey(mint).toBuffer()],
    PUMP_PROGRAM
  );
  return pda.toBase58();
}

/** Resolve the PumpSwap pool + live market data via DexScreener. */
export async function resolvePool(mint: string): Promise<PoolInfo | null> {
  try {
    const res = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${mint}`,
      { cache: 'no-store' }
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      pairs?: Array<{
        dexId?: string;
        pairAddress?: string;
        pairCreatedAt?: number;
        marketCap?: number;
        priceUsd?: string;
        liquidity?: { usd?: number };
        baseToken?: { symbol?: string; name?: string };
      }>;
    };
    const pairs = json.pairs ?? [];
    const pair =
      pairs.find((p) => p.dexId === 'pumpswap') ??
      pairs.find((p) => p.dexId === 'raydium') ??
      pairs[0];
    if (!pair?.pairAddress) return null;
    return {
      pool: pair.pairAddress,
      pairCreatedAt: pair.pairCreatedAt ? Math.floor(pair.pairCreatedAt / 1000) : null,
      marketCapUsd: pair.marketCap ?? null,
      liquidityUsd: pair.liquidity?.usd ?? null,
      priceUsd: pair.priceUsd ? Number(pair.priceUsd) : null,
      symbol: pair.baseToken?.symbol ?? null,
      name: pair.baseToken?.name ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Fallback pool resolution for coins DexScreener has dropped (LP pulled, $0
 * liquidity). The AMM's token vault is one of the largest accounts; its owner
 * is the pool.
 */
export async function poolFromChain(mint: string): Promise<string | null> {
  try {
    const curve = bondingCurvePda(mint);
    const { sigs } = await allSignatures(curve, 30_000);
    const ok = sigs.filter((s) => !s.err);
    if (!ok.length) return null;

    // The migration is near the end of the curve's life and moves the full
    // 206,900,000-token LP allocation into the new pool.
    const tail = ok.slice(-12).map((s) => s.signature);
    const parsed = await parseSignatures(tail);

    const candidates: string[] = [];
    for (const tx of parsed) {
      for (const t of tx.tokenTransfers ?? []) {
        const amount = t.tokenAmount ?? 0;
        if (t.mint === mint && amount > 200e6 && amount < 215e6 && t.toUserAccount) {
          candidates.push(t.toUserAccount);
        }
      }
    }
    if (!candidates.length) return null;

    // A candidate is either the pool account or the pool's SPL token vault.
    // Once liquidity is pulled the vault is closed, so a candidate that no
    // longer exists is a vault and must not be treated as the pool.
    const conn = getConnection();
    const unique = [...new Set(candidates)].filter((c) => c !== curve);
    const infos = await conn.getMultipleParsedAccounts(
      unique.map((c) => new PublicKey(c))
    );

    let vaultOwner: string | null = null;
    for (let i = 0; i < unique.length; i++) {
      const candidate = unique[i];
      const info = infos.value[i];
      if (!candidate || !info) continue; // closed account — a spent vault
      if ('parsed' in info.data) {
        // Live SPL token account: the pool is its owner.
        const owner = (info.data.parsed as { info?: { owner?: string } })?.info?.owner;
        if (owner && owner !== curve) vaultOwner = owner;
      } else {
        // Program-owned state account that is not a token account: the pool.
        return candidate;
      }
    }
    return vaultOwner;
  } catch {
    return null;
  }
}

/**
 * Page every signature for an address back to genesis.
 * `cap` is a safety ceiling, not a target — if we hit it the caller must treat
 * the oldest record as unreliable.
 */
export async function allSignatures(
  address: string,
  cap = 20_000
): Promise<{ sigs: Array<{ signature: string; blockTime: number; err: unknown }>; truncated: boolean }> {
  const conn = getConnection();
  const key = new PublicKey(address);
  let before: string | undefined;
  const out: Array<{ signature: string; blockTime: number; err: unknown }> = [];
  let truncated = false;

  while (out.length < cap) {
    let page;
    try {
      page = await conn.getSignaturesForAddress(key, { limit: 1000, before });
    } catch {
      await sleep(400);
      try {
        page = await conn.getSignaturesForAddress(key, { limit: 1000, before });
      } catch {
        break;
      }
    }
    if (!page.length) break;
    for (const s of page) {
      if (s.blockTime) {
        out.push({ signature: s.signature, blockTime: s.blockTime, err: s.err });
      }
    }
    const last = page[page.length - 1];
    if (!last) break;
    before = last.signature;
    if (page.length < 1000) break;
    if (out.length >= cap) {
      truncated = true;
      break;
    }
  }

  out.sort((a, b) => a.blockTime - b.blockTime);
  return { sigs: out, truncated };
}

/** Batch-parse signatures through the Helius Enhanced Transactions API. */
export async function parseSignatures(signatures: string[]): Promise<ParsedTx[]> {
  const apiKey = process.env.HELIUS_API_KEY;
  if (!apiKey) throw new Error('Missing HELIUS_API_KEY');
  const url = `https://api.helius.xyz/v0/transactions?api-key=${apiKey}`;
  const out: ParsedTx[] = [];

  for (let i = 0; i < signatures.length; i += 100) {
    const batch = signatures.slice(i, i + 100);
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactions: batch }),
        cache: 'no-store',
      });
      if (res.status === 429) {
        await sleep(600 * (attempt + 1));
        continue;
      }
      if (!res.ok) break;
      const json = (await res.json()) as ParsedTx[];
      out.push(...json);
      break;
    }
  }
  return out;
}

/**
 * Reconstruct swaps from parsed transactions.
 *
 * Price = (max WSOL transferred) / (max token transferred) per tx. Dust below
 * 1,000 tokens is discarded and anything implying >$50M is treated as a parse
 * artifact — both filters exist because sub-dust transfers produce absurd
 * implied prices. See docs/JINPACHI Bin 20.md §15 trap #11.
 */
export function buildSwaps(
  txs: ParsedTx[],
  mint: string,
  pool: string,
  poolOpen: number,
  solUsd: number
): Swap[] {
  const swaps: Swap[] = [];

  for (const tx of txs) {
    const transfers = tx.tokenTransfers ?? [];
    const tokenLegs = transfers.filter(
      (t) => t.mint === mint && (t.tokenAmount ?? 0) > 0
    );
    const solLegs = transfers.filter(
      (t) => t.mint === WSOL_MINT && (t.tokenAmount ?? 0) > 0
    );
    if (!tokenLegs.length || !solLegs.length) continue;

    const tokenAmount = Math.max(...tokenLegs.map((t) => t.tokenAmount ?? 0));
    const solAmount = Math.max(...solLegs.map((t) => t.tokenAmount ?? 0));
    if (tokenAmount < 1000) continue;

    const mcap = (solAmount / tokenAmount) * 1e9 * solUsd;
    if (!Number.isFinite(mcap) || mcap <= 0 || mcap > 50e6) continue;

    const first = tokenLegs[0];
    if (!first) continue;
    const isBuy = first.fromUserAccount === pool;
    const actor = (isBuy ? first.toUserAccount : first.fromUserAccount) ?? null;

    swaps.push({
      t: tx.timestamp - poolOpen,
      mcap,
      sol: solAmount,
      isBuy,
      actor,
    });
  }

  swaps.sort((a, b) => a.t - b.t);
  return swaps;
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? null;
}

/** Live SOL/USD with a hardcoded fallback — a null price yields Infinity mcaps. */
export async function solUsdPrice(): Promise<number> {
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
      { cache: 'no-store' }
    );
    if (res.ok) {
      const json = (await res.json()) as { solana?: { usd?: number } };
      if (typeof json.solana?.usd === 'number') return json.solana.usd;
    }
  } catch {
    /* fall through */
  }
  return 76.28;
}

/**
 * Dev wallet + dev buy, read from the bonding curve's opening transactions.
 *
 * Returns null rather than zero when it cannot be determined. A fabricated 0%
 * would silently pass the "dev buy < 36%" check, which is exactly the kind of
 * confident-but-wrong answer this tool must not produce.
 */
export async function fetchDevInfo(
  mint: string
): Promise<{ dev: string; devBuySol: number; devPct: number } | null> {
  try {
    const { sigs } = await allSignatures(bondingCurvePda(mint), 30_000);
    const ok = sigs.filter((s) => !s.err);
    if (!ok.length) return null;

    const parsed = await parseSignatures(ok.slice(0, 5).map((s) => s.signature));
    parsed.sort((a, b) => a.timestamp - b.timestamp);

    for (const tx of parsed) {
      const dev = tx.feePayer;
      if (!dev) continue;
      const received = (tx.tokenTransfers ?? []).find(
        (t) => t.mint === mint && t.toUserAccount === dev && (t.tokenAmount ?? 0) > 0
      );
      const spent = Math.max(
        0,
        ...(tx.nativeTransfers ?? [])
          .filter((n) => n.fromUserAccount === dev)
          .map((n) => (n.amount ?? 0) / 1e9),
        0
      );
      // Require both legs — tokens out and SOL in — or this is somebody else's
      // ordinary buy rather than the creation transaction.
      if (received && spent > 0) {
        return {
          dev,
          devBuySol: spent,
          devPct: ((received.tokenAmount ?? 0) / 1e9) * 100,
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}

export { heliusRpcUrl };
