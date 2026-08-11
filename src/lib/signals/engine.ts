/**
 * The verdict engine.
 *
 * Applies the group-specific rule from /docs to live pool data and returns a
 * BUY / SKIP / WAIT decision plus the evidence behind it.
 *
 * Every threshold here traces to a backtest in the dossiers. Nothing is
 * invented. Where a rule is weak (Pochi), the engine says so rather than
 * pretending to a confidence it does not have.
 */

import {
  GROUPS,
  type GroupId,
  JINPACHI_MIN_RETENTION,
  JINPACHI_MIN_STACK_SOL,
  JINPACHI_SNIPE_AMOUNTS,
  BAOJIN_MIN_BUY_SOL,
  BAOJIN_VOLUME_BOT_SOL,
  migrationMcap,
} from './groups';
import {
  allSignatures,
  buildSwaps,
  fetchDevInfo,
  median,
  parseSignatures,
  poolFromChain,
  resolvePool,
  solUsdPrice,
  type Swap,
} from './chain';
import { knownCoin, lookupWallets, type WalletTag } from './taggedWallets';

export type Verdict = 'BUY' | 'SKIP' | 'WAIT' | 'NO_POOL' | 'UNKNOWN';

export interface Check {
  id: string;
  label: string;
  /** null = could not be evaluated. */
  pass: boolean | null;
  value: string;
  detail: string;
}

export interface BigBuy {
  t: number;
  sol: number;
  wallet: string;
  label: string | null;
}

export interface AnalysisResult {
  mint: string;
  group: GroupId;
  groupName: string;
  verdict: Verdict;
  headline: string;
  reasoning: string;
  confidence: 'high' | 'medium' | 'low';

  symbol: string | null;
  name: string | null;
  pool: string | null;
  poolOpen: number | null;
  ageSec: number | null;
  decideAtSec: number;
  entryWindowSec: number;

  solUsd: number;
  migrationMcapUsd: number;
  openMcapUsd: number | null;
  currentMcapUsd: number | null;
  liquidityUsd: number | null;
  peakMcapUsd: number | null;
  multipleFromMigration: number | null;

  checks: Check[];

  blockZeroSol: number;
  blockZeroAmounts: number[];
  snipeFingerprintMatch: boolean;
  retention: number | null;
  taggedBuyers: number;
  taggedBuysOverThreshold: number;
  bigBuys: BigBuy[];
  volumeBotWallets: number;
  totalSwaps: number;
  groupSharePct: number | null;

  dev: string | null;
  devBuySol: number | null;
  devPct: number | null;

  known: Awaited<ReturnType<typeof knownCoin>>;
  warnings: string[];
  elapsedMs: number;
}

const EARLY_WINDOW_SEC = 300;
/** Max signatures parsed inside the entry window before we start sampling. */
const DENSE_CAP = 2000;
/** Safety ceiling on pagination. A fresh migration is far below this. */
const SIGNATURE_CAP = 60_000;

export async function analyze(mint: string, group: GroupId): Promise<AnalysisResult> {
  const started = Date.now();
  const cfg = GROUPS[group];
  const warnings: string[] = [];

  const [solUsd, poolInfo, known] = await Promise.all([
    solUsdPrice(),
    resolvePool(mint),
    knownCoin(mint),
  ]);

  const migMcap = migrationMcap(solUsd);

  const base: AnalysisResult = {
    mint,
    group,
    groupName: cfg.name,
    verdict: 'NO_POOL',
    headline: 'Not migrated yet',
    reasoning:
      'No PumpSwap pool found for this mint. Either it is still on the bonding curve, or it never migrated. There is nothing to trade until the pool opens.',
    confidence: cfg.confidence,
    symbol: known?.symbol ?? null,
    name: null,
    pool: null,
    poolOpen: null,
    ageSec: null,
    decideAtSec: cfg.decideAtSec,
    entryWindowSec: cfg.entryWindowSec,
    solUsd,
    migrationMcapUsd: migMcap,
    openMcapUsd: null,
    currentMcapUsd: null,
    liquidityUsd: null,
    peakMcapUsd: null,
    multipleFromMigration: null,
    checks: [],
    blockZeroSol: 0,
    blockZeroAmounts: [],
    snipeFingerprintMatch: false,
    retention: null,
    taggedBuyers: 0,
    taggedBuysOverThreshold: 0,
    bigBuys: [],
    volumeBotWallets: 0,
    totalSwaps: 0,
    groupSharePct: null,
    dev: null,
    devBuySol: null,
    devPct: null,
    known,
    warnings,
    elapsedMs: 0,
  };

  // DexScreener drops pairs once liquidity is pulled, so fall back to chain.
  let pool = poolInfo?.pool ?? null;
  if (!pool) {
    pool = await poolFromChain(mint);
    if (pool) {
      warnings.push(
        'DexScreener has no live pair — liquidity was likely pulled. Pool resolved on-chain; current price is unavailable.'
      );
    }
  }

  if (!pool) {
    base.elapsedMs = Date.now() - started;
    return base;
  }

  // ---- pull the pool's full history, oldest first -------------------------
  const { sigs, truncated } = await allSignatures(pool, SIGNATURE_CAP);
  const ok = sigs.filter((s) => !s.err);
  if (!ok.length) {
    base.pool = pool;
    base.reasoning = 'Pool exists but has no successful transactions yet.';
    base.verdict = 'WAIT';
    base.headline = 'Pool just opened';
    base.elapsedMs = Date.now() - started;
    return base;
  }

  const poolOpen = poolInfo?.pairCreatedAt ?? ok[0]?.blockTime ?? 0;
  const nowSec = Math.floor(Date.now() / 1000);
  const ageSec = nowSec - poolOpen;

  if (truncated) {
    // We paged back SIGNATURE_CAP records and never reached genesis, so the
    // migration block is missing and every block-0 metric would be wrong.
    // Returning SKIP here would be a confident answer built on absent data.
    base.pool = pool;
    base.ageSec = ageSec;
    base.poolOpen = poolOpen;
    base.symbol = poolInfo?.symbol ?? known?.symbol ?? null;
    base.currentMcapUsd = poolInfo?.marketCapUsd ?? null;
    base.liquidityUsd = poolInfo?.liquidityUsd ?? null;
    base.verdict = 'UNKNOWN';
    base.headline = 'Pool too large to analyse';
    base.reasoning = `This pool has more than ${SIGNATURE_CAP.toLocaleString()} transactions, so the migration block could not be reached and the block-0 stack cannot be measured. This tool is built for coins that just migrated — by the time a pool is this busy the entry window is long gone.`;
    base.warnings = warnings;
    base.elapsedMs = Date.now() - started;
    return base;
  }

  // Parse densely across the whole window in which this group's signal can
  // fire — NOT a fixed 5 minutes. JINPACHI decides at +45s, but a Baojin
  // signal routinely lands 7-10 minutes in, and a 5-minute scan reports
  // "no signal" on a coin that had 13 qualifying buys.
  const denseWindow = Math.max(EARLY_WINDOW_SEC, cfg.entryWindowSec);
  const inWindow = ok.filter((s) => s.blockTime <= poolOpen + denseWindow);

  let early = inWindow;
  if (inWindow.length > DENSE_CAP) {
    // Too busy to parse exhaustively inside the budget. Spread the sample so a
    // qualifying buy is unlikely to be missed, and say so — a "no signal"
    // result from a sampled window is weaker evidence than one from a full scan.
    const stride = Math.ceil(inWindow.length / DENSE_CAP);
    early = inWindow.filter((_, i) => i % stride === 0);
    warnings.push(
      `Very busy pool: ${inWindow.length.toLocaleString()} transactions inside the entry window, sampled 1 in ${stride}. A "no signal" result here is not conclusive — re-run in a few seconds.`
    );
  }

  const later = ok.filter((s) => s.blockTime > poolOpen + denseWindow);
  const step = Math.max(1, Math.floor(later.length / 200));
  const sampled = later.filter((_, i) => i % step === 0);

  const txs = await parseSignatures([...early, ...sampled].map((s) => s.signature));
  const swaps = buildSwaps(txs, mint, pool, poolOpen, solUsd);

  // ---- block 0 ------------------------------------------------------------
  const blockZero = swaps.filter((s) => s.t === 0);
  const blockZeroBuys = blockZero.filter((s) => s.isBuy && s.sol >= 1);
  const blockZeroSol = blockZeroBuys.reduce((sum, s) => sum + s.sol, 0);
  const blockZeroAmounts = blockZeroBuys.map((s) => Number(s.sol.toFixed(2)));
  const openMcap = blockZero.length ? Math.max(...blockZero.map((s) => s.mcap)) : null;

  const snipeFingerprintMatch = JINPACHI_SNIPE_AMOUNTS.every((amount) =>
    blockZeroAmounts.some((a) => Math.abs(a - amount) < 0.25)
  );

  // ---- retention over +15..+45s ------------------------------------------
  const windowPrices = swaps.filter((s) => s.t >= 15 && s.t <= 45).map((s) => s.mcap);
  const windowMedian = median(windowPrices);
  const retention =
    openMcap && windowMedian ? Number((windowMedian / openMcap).toFixed(3)) : null;

  // ---- wallet tagging -----------------------------------------------------
  const actors = swaps.map((s) => s.actor).filter((a): a is string => Boolean(a));
  let tagMap = new Map<string, WalletTag>();
  try {
    tagMap = await lookupWallets(actors);
  } catch {
    warnings.push('Tagged-wallet database unreachable — group attribution unavailable.');
  }

  const inGroup = (addr: string | null) => {
    if (!addr) return false;
    const label = tagMap.get(addr)?.label;
    return label ? cfg.dbLabels.includes(label) : false;
  };

  const taggedActors = new Set(actors.filter((a) => tagMap.has(a)));
  const groupActors = new Set(actors.filter(inGroup));
  const groupShare = actors.length
    ? Number(((actors.filter(inGroup).length / actors.length) * 100).toFixed(1))
    : null;

  const bigBuys: BigBuy[] = swaps
    .filter((s) => s.isBuy && s.sol >= BAOJIN_MIN_BUY_SOL && inGroup(s.actor))
    .map((s) => ({
      t: s.t,
      sol: Number(s.sol.toFixed(2)),
      wallet: s.actor as string,
      label: tagMap.get(s.actor as string)?.label ?? null,
    }));

  const bigBuysAfterBlockZero = bigBuys.filter((b) => b.t > 0);

  const volumeBotWallets = new Set(
    swaps
      .filter((s) => s.sol > 0 && s.sol < BAOJIN_VOLUME_BOT_SOL * 5 && s.actor)
      .map((s) => s.actor as string)
  ).size;

  const peak = swaps.length ? Math.max(...swaps.map((s) => s.mcap)) : null;
  const currentMcap = poolInfo?.marketCapUsd ?? null;

  const dev = await fetchDevInfo(mint).catch(() => null);

  // ---- assemble -----------------------------------------------------------
  const result: AnalysisResult = {
    ...base,
    symbol: poolInfo?.symbol ?? known?.symbol ?? null,
    name: poolInfo?.name ?? null,
    pool,
    poolOpen,
    ageSec,
    openMcapUsd: openMcap,
    currentMcapUsd: currentMcap,
    liquidityUsd: poolInfo?.liquidityUsd ?? null,
    peakMcapUsd: peak,
    multipleFromMigration: currentMcap ? Number((currentMcap / migMcap).toFixed(2)) : null,
    blockZeroSol: Number(blockZeroSol.toFixed(2)),
    blockZeroAmounts,
    snipeFingerprintMatch,
    retention,
    taggedBuyers: taggedActors.size,
    taggedBuysOverThreshold: bigBuysAfterBlockZero.length,
    bigBuys: bigBuys.slice(0, 12),
    volumeBotWallets,
    totalSwaps: swaps.length,
    groupSharePct: groupShare,
    dev: dev?.dev ?? null,
    devBuySol: dev?.devBuySol ?? null,
    devPct: dev?.devPct ?? null,
    warnings,
    elapsedMs: 0,
  };

  const decided =
    group === 'jinpachi'
      ? decideJinpachi(result, groupActors.size)
      : group === 'baojin'
        ? decideBaojin(result, bigBuys)
        : decidePochi(result);

  decided.elapsedMs = Date.now() - started;
  return decided;
}

// ---------------------------------------------------------------------------
// JINPACHI Bin 20 — stack >=40 SOL AND retention >=0.90 at +15..45s
// ---------------------------------------------------------------------------

function decideJinpachi(r: AnalysisResult, groupWallets: number): AnalysisResult {
  const stackPass = r.blockZeroSol >= JINPACHI_MIN_STACK_SOL;
  const retPass = r.retention !== null ? r.retention >= JINPACHI_MIN_RETENTION : null;

  r.checks = [
    {
      id: 'stack',
      label: 'Block-0 snipe stack',
      pass: stackPass,
      value: `${r.blockZeroSol.toFixed(2)} SOL`,
      detail: stackPass
        ? `Their bot fired${r.snipeFingerprintMatch ? ' — exact 17.96/16.63/15.81 fingerprint matched' : ''}. Needs ≥${JINPACHI_MIN_STACK_SOL} SOL.`
        : `Only ${r.blockZeroSol.toFixed(2)} SOL bought in the migration block. Their own bot skipped this coin — they are not working it.`,
    },
    {
      id: 'retention',
      label: 'Price held +15–45s',
      pass: retPass,
      value: r.retention !== null ? `${(r.retention * 100).toFixed(1)}%` : '—',
      detail:
        r.retention === null
          ? 'Not enough trades in the +15–45s window yet.'
          : retPass
            ? `Held ${(r.retention * 100).toFixed(1)}% of the block-0 price. Insiders are not dumping into the snipe.`
            : `Bled to ${(r.retention * 100).toFixed(1)}% of the block-0 price. Insiders are selling. Needs ≥90%.`,
    },
    {
      id: 'devbuy',
      label: 'Dev buy (unverified)',
      pass: null,
      value: r.devPct !== null ? `~${r.devPct.toFixed(2)}%` : 'unknown',
      detail:
        'Read from the earliest reachable bonding-curve transaction, which is not always the creation tx — so this figure is unreliable and does NOT affect the verdict. Check the dev buy on pump.fun yourself: ≥36% of supply went 0-for-8 in the backtest.',
    },
    {
      id: 'group',
      label: 'Group wallets active',
      pass: groupWallets > 0 ? true : null,
      value: `${groupWallets}`,
      detail: `${groupWallets} distinct JINPACHI/ChubbyDog wallets traded this pool. Confirms attribution, not direction.`,
    },
  ];

  if (r.ageSec !== null && r.ageSec < r.decideAtSec) {
    r.verdict = 'WAIT';
    r.headline = `Wait ${r.decideAtSec - r.ageSec}s`;
    r.reasoning = `The retention check needs price data from +15s to +45s. Pool is only ${r.ageSec}s old. Re-run at +45s.`;
    return r;
  }

  if (!stackPass) {
    r.verdict = 'SKIP';
    r.headline = 'No snipe stack';
    r.reasoning = `Only ${r.blockZeroSol.toFixed(2)} SOL was bought in the migration block, against a ≥40 SOL threshold. On this group that means their own bot did not fire — they have already decided not to push this coin. The one coin in the backtest that opened without a stack returned x1.01.`;
    return r;
  }

  if (retPass === false) {
    r.verdict = 'SKIP';
    r.headline = 'Bleeding out';
    r.reasoning = `Price fell to ${((r.retention ?? 0) * 100).toFixed(1)}% of its block-0 level within 45 seconds. Every coin in the backtest that bled below 90% capped at x1.32, and the worst went to zero. Insiders are distributing into the snipe right now.`;
    return r;
  }

  if (retPass === null) {
    r.verdict = 'WAIT';
    r.headline = 'Not enough trades';
    r.reasoning = 'No swaps landed in the +15–45s window, so retention cannot be computed. Give it a few more seconds and re-run.';
    return r;
  }

  const late = r.ageSec !== null && r.ageSec > r.entryWindowSec;
  r.verdict = late ? 'SKIP' : 'BUY';
  r.headline = late ? 'Signal valid but late' : 'ENTER';
  r.reasoning = late
    ? `Both filters passed, but the pool is ${Math.round((r.ageSec ?? 0) / 60)} minutes old. The backtested entry is at +45s. Entering now means paying whatever the push has already added.`
    : `Both filters passed. Stack was ${r.blockZeroSol.toFixed(2)} SOL and price held ${((r.retention ?? 0) * 100).toFixed(1)}% through the first 45 seconds. In the backtest this combination produced 5 entries with a worst case of x1.43 and a mean of x4.26, while every rejected coin capped at x1.32. Size 1–2 SOL — above 5 SOL slippage eats the edge.`;
  return r;
}

// ---------------------------------------------------------------------------
// Baojin Mex 35 — a tagged wallet buys >=3 SOL post-migration
// ---------------------------------------------------------------------------

function decideBaojin(r: AnalysisResult, bigBuys: BigBuy[]): AnalysisResult {
  const signal = bigBuys.length > 0;
  const first = bigBuys[0] ?? null;

  r.checks = [
    {
      id: 'taggedbuy',
      label: 'Tagged wallet bought ≥3 SOL',
      pass: signal,
      value: `${bigBuys.length} buy${bigBuys.length === 1 ? '' : 's'}`,
      detail: signal
        ? `First at +${first?.t}s for ${first?.sol} SOL. This is the signal — 14 fires across 32 coins, median x2.12, zero losers.`
        : 'No tagged Baojin wallet has bought ≥3 SOL yet. Without this the rule does not fire.',
    },
    {
      id: 'dbcheck',
      label: 'Buyer is in tagged_wallets',
      pass: signal ? true : null,
      value: signal ? 'confirmed' : '—',
      detail:
        'Critical condition — the same buy from an untagged wallet is meaningless noise.',
    },
    {
      id: 'volbot',
      label: 'Volume-bot fleet',
      pass: null,
      value: `${r.volumeBotWallets} wallets`,
      detail:
        'Micro-buy bots (0.002074080 SOL fingerprint). They appear only after the cap is already elevated — informational, never an entry.',
    },
    {
      id: 'group',
      label: 'Group share of traders',
      pass: null,
      value: r.groupSharePct !== null ? `${r.groupSharePct}%` : '—',
      detail: 'Share of swap actors tagged as Baojin Mex 35.',
    },
  ];

  if (!signal) {
    r.verdict = 'SKIP';
    r.headline = 'No signal yet';
    r.reasoning =
      'No wallet tagged Baojin Mex 35 has bought ≥3 SOL since migration. In the backtest, 17 of 17 coins that never produced this signal died. Keep watching — the signal can still fire.';
    return r;
  }

  const late = r.ageSec !== null && r.ageSec > r.entryWindowSec;
  r.verdict = late ? 'SKIP' : 'BUY';
  r.headline = late ? 'Signal fired but stale' : 'ENTER';
  r.reasoning = late
    ? `The signal fired at +${first?.t}s but the pool is now ${Math.round((r.ageSec ?? 0) / 60)} minutes old. This group's exit is a timer, not a decision — entering late leaves you holding into the dump.`
    : `A tagged Baojin wallet bought ${first?.sol} SOL at +${first?.t}s. Backtest: 32 coins, 14 signals, median x2.12, worst x1.19, zero losers, and 3 of 3 on the forward test. Exit on a timer — every coin in this group ends at $1,500–$2,000.`;
  return r;
}

// ---------------------------------------------------------------------------
// Pochi Bin 30 — no validated signal; the edge is a cheap early entry
// ---------------------------------------------------------------------------

function decidePochi(r: AnalysisResult): AnalysisResult {
  const mult = r.openMcapUsd ? r.openMcapUsd / r.migrationMcapUsd : null;
  const cheap = mult !== null ? mult <= 1.25 : null;
  const early = r.ageSec !== null && r.ageSec <= 15;

  r.checks = [
    {
      id: 'cheap',
      label: 'Still near migration price',
      pass: cheap,
      value: mult !== null ? `${mult.toFixed(2)}x` : '—',
      detail:
        mult === null
          ? 'Could not read the opening price.'
          : cheap
            ? 'Opened near 1.00x — this group has no block-0 snipe bot, so the entry is genuinely cheap.'
            : 'Already above 1.25x. The cheap-entry edge is gone.',
    },
    {
      id: 'window',
      label: 'Inside the 0–15s window',
      pass: early,
      value: r.ageSec !== null ? `${r.ageSec}s old` : '—',
      detail: early
        ? 'Inside the window where the backtest showed 1.00–1.17x entries.'
        : 'Past +15s. By this point the historical table shows 1.7–2.3x, so most of the move is already gone.',
    },
    {
      id: 'nosignal',
      label: 'Which-coin signal',
      pass: null,
      value: 'none validated',
      detail:
        'No metric reliably predicts which Pochi coin gets pushed. Curve duration looked strongest but was computed on bad timestamps and still needs recomputing.',
    },
    {
      id: 'group',
      label: 'Group wallets active',
      pass: null,
      value: r.groupSharePct !== null ? `${r.groupSharePct}%` : '—',
      detail: 'Share of swap actors tagged Pochi Bin 30 — confirms attribution only.',
    },
  ];

  if (r.ageSec !== null && r.ageSec > r.entryWindowSec) {
    r.verdict = 'SKIP';
    r.headline = 'Window closed';
    r.reasoning = `Pool is ${Math.round((r.ageSec ?? 0) / 60)} minutes old. This group's only edge is entering in the first seconds at ~1.00x. There is no validated way to pick the winner after that.`;
    return r;
  }

  if (early && cheap) {
    r.verdict = 'BUY';
    r.headline = 'Cheap entry open';
    r.reasoning = `Pool is ${r.ageSec}s old and still near migration price. 10 of 13 backtested coins reached ≥1.95x from here. But be clear on the risk: there is NO validated signal for which coin gets pushed, and 3 of 13 never passed 1.2x. This is a cheap lottery ticket, not a confirmed edge — size accordingly.`;
    return r;
  }

  r.verdict = 'SKIP';
  r.headline = 'Too expensive already';
  r.reasoning = `Entry is only attractive on this group in the first ~15 seconds at close to 1.00x. Currently ${mult !== null ? `${mult.toFixed(2)}x` : 'above'} the migration price with the pool ${r.ageSec}s old.`;
  return r;
}
