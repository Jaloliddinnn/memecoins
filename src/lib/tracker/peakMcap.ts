/**
 * Peak market cap — reconstructs the highest implied FDV a pool ever traded at.
 *
 * Neither Helius nor DexScreener expose an ATH field for a mint. The only way
 * to know what a coin actually peaked at is to price every swap in the pool's
 * history and take the max — the same math the Migration Check engine uses
 * (see `signals/chain.ts#buildSwaps`), just run over the pool's *entire* life
 * instead of a fixed entry window.
 *
 * This pages every signature (newest-first, capped) and parses in batches,
 * keeping a running max instead of holding every swap in memory. A capped scan
 * means the OLDEST trades were never reached — often exactly where an early
 * migration spike lives — so a truncated result says so rather than silently
 * reporting a lower number as if it were exhaustive.
 */

import {
  allSignatures,
  parseSignatures,
  poolFromChain,
  resolvePool,
  solUsdPrice,
  WSOL_MINT,
  type ParsedTx,
} from '@/lib/signals/chain';

/** Safety ceiling on signature pagination. Old, heavily-traded coins can have
 * far more history than is worth paying Helius credits to scan. */
const SIGNATURE_CAP = 20_000;
const PARSE_BATCH = 100;

export interface PeakMcapResult {
  peakMcapUsd: number | null;
  pool: string | null;
  swapsSeen: number;
  truncated: boolean;
  warnings: string[];
}

/**
 * Same dust/parse-artifact filters as `buildSwaps` — a sub-1,000-token
 * transfer or a >$50M implied mcap is noise, not a real trade.
 */
function maxMcapInBatch(txs: ParsedTx[], mint: string, solUsd: number): number {
  let max = 0;
  for (const tx of txs) {
    const transfers = tx.tokenTransfers ?? [];
    const tokenLegs = transfers.filter((t) => t.mint === mint && (t.tokenAmount ?? 0) > 0);
    const solLegs = transfers.filter((t) => t.mint === WSOL_MINT && (t.tokenAmount ?? 0) > 0);
    if (!tokenLegs.length || !solLegs.length) continue;

    const tokenAmount = Math.max(...tokenLegs.map((t) => t.tokenAmount ?? 0));
    const solAmount = Math.max(...solLegs.map((t) => t.tokenAmount ?? 0));
    if (tokenAmount < 1000) continue;

    const mcap = (solAmount / tokenAmount) * 1e9 * solUsd;
    if (!Number.isFinite(mcap) || mcap <= 0 || mcap > 50e6) continue;
    if (mcap > max) max = mcap;
  }
  return max;
}

export async function computePeakMarketCap(mint: string): Promise<PeakMcapResult> {
  const warnings: string[] = [];
  const [solUsd, poolInfo] = await Promise.all([solUsdPrice(), resolvePool(mint)]);

  let pool = poolInfo?.pool ?? null;
  if (!pool) pool = await poolFromChain(mint);
  if (!pool) {
    return {
      peakMcapUsd: null,
      pool: null,
      swapsSeen: 0,
      truncated: false,
      warnings: ['No PumpSwap pool found for this mint — it may still be on the bonding curve, or never migrated.'],
    };
  }

  const { sigs, truncated } = await allSignatures(pool, SIGNATURE_CAP);
  const ok = sigs.filter((s) => !s.err);
  if (truncated) {
    warnings.push(
      `Stopped after ${SIGNATURE_CAP.toLocaleString()} signatures without reaching the pool's first trade — the true peak may be earlier (and higher) than what was scanned.`
    );
  }

  let peak = 0;
  let swapsSeen = 0;
  for (let i = 0; i < ok.length; i += PARSE_BATCH) {
    const batch = ok.slice(i, i + PARSE_BATCH).map((s) => s.signature);
    const txs = await parseSignatures(batch);
    swapsSeen += txs.length;
    const batchMax = maxMcapInBatch(txs, mint, solUsd);
    if (batchMax > peak) peak = batchMax;
  }

  return {
    peakMcapUsd: peak > 0 ? peak : null,
    pool,
    swapsSeen,
    truncated,
    warnings,
  };
}
