import { prisma } from '@/lib/prisma';
import type { ClusterTrackRecord } from '@/types';

/**
 * A wallet cluster's historical pump-vs-dump-to-zero track record, using
 * your curated `coin_stats.outcome` ground truth instead of a guessed
 * market-cap threshold. This is the core signal for the actual question:
 * "which of their same-day duplicate launches are they going to run up,
 * and which will they just drain." A cluster that's run up 2 of its last
 * 20 launches has a ~10% pump rate — so on any given new mint from them,
 * the base-rate expectation is "dumps near zero" unless other signals
 * (outsider inflow, cohort divergence) say otherwise for THIS mint.
 *
 * Note on the join: coin_stats.wallet_group and tagged_wallets.label are
 * both human-readable cluster names (e.g. "Pochi Bin 30") set by whoever
 * tagged the data — there's no formal foreign key between them in the
 * source schema, so this is a value match, not a relational one. If your
 * tagging process ever normalizes casing/spacing, this join gets more
 * reliable; consider it a known soft spot.
 */
export async function getClusterTrackRecord(label: string): Promise<ClusterTrackRecord | null> {
  const launches = await prisma.coinStat.findMany({
    where: { walletGroup: label },
  });
  if (launches.length === 0) return null;

  const totalLaunches = launches.length;
  const ranUpCount = launches.filter(
    (l) => l.outcome === 'pumped' || l.outcome === 'pump_and_dump'
  ).length;
  const neverRanUpCount = launches.filter((l) => l.outcome === 'dumped').length;

  const peaks = launches
    .map((l) => l.maxMarketCapUsd)
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b);
  const medianPeakMcapUsd = peaks.length > 0 ? peaks[Math.floor(peaks.length / 2)] ?? null : null;

  const durations = launches
    .map((l) => l.durationMinutes)
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b);
  const medianDurationMinutes =
    durations.length > 0 ? durations[Math.floor(durations.length / 2)] ?? null : null;

  return {
    label,
    totalLaunches,
    ranUpCount,
    neverRanUpCount,
    pumpRate: totalLaunches > 0 ? ranUpCount / totalLaunches : 0,
    medianPeakMcapUsd,
    medianDurationMinutes,
  };
}

/**
 * Looks up a cluster's track record starting from a wallet address instead
 * of a label — convenience for callers holding a holder row (which has
 * clusterLabel already resolved) or a bare cluster_parent wallet.
 */
export async function getClusterTrackRecordForWallet(
  walletAddress: string
): Promise<ClusterTrackRecord | null> {
  const wallet = await prisma.taggedWallet.findUnique({ where: { address: walletAddress } });
  if (!wallet?.label) return null;
  return getClusterTrackRecord(wallet.label);
}
