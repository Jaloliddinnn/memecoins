import type { HolderRow, OutsiderVolumeResult } from '@/types';

/**
 * True Outsider Volume = Total Pool SOL - Insider Tagged SOL.
 *
 * We attribute pool SOL to each holder proportional to their share of
 * supply (a reasonable approximation absent a full order-flow ledger), then
 * subtract whatever fraction insiders + MEV bots are estimated to hold.
 * `outsiderRatio` is the headline number for the dashboard: how much of
 * the coin's apparent liquidity is real external money vs. the team's own
 * bags circulating through the curve.
 */
export function computeOutsiderVolume(
  holders: HolderRow[],
  totalPoolSol: number
): OutsiderVolumeResult {
  const insiderPct = sumPercent(holders, 'INSIDER');
  const mevBotPct = sumPercent(holders, 'MEV_BOT');

  const insiderTaggedSol = totalPoolSol * (insiderPct / 100);
  const mevBotTaggedSol = totalPoolSol * (mevBotPct / 100);
  const trueOutsiderVolumeSol = Math.max(0, totalPoolSol - insiderTaggedSol - mevBotTaggedSol);

  return {
    totalPoolSol,
    insiderTaggedSol,
    mevBotTaggedSol,
    trueOutsiderVolumeSol,
    outsiderRatio: totalPoolSol > 0 ? trueOutsiderVolumeSol / totalPoolSol : 0,
  };
}

function sumPercent(holders: HolderRow[], tag: HolderRow['tagType']): number {
  return holders.filter((h) => h.tagType === tag).reduce((acc, h) => acc + h.percentOfSupply, 0);
}
