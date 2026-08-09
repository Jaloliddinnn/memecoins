import { prisma } from '@/lib/prisma';
import type { ClusterTrackRecord } from '@/types';

/**
 * A launch counts as "pumped" once its peak post-migration market cap
 * clears this bar. Tune per your own read of what counts as a real run —
 * default assumes anything holding above 10x a typical ~40k bonding mcap
 * is a deliberate pump, not just curve-completion noise.
 */
export const PUMP_THRESHOLD_USD = 100_000;

/**
 * Computes a wallet cluster's historical pump-vs-dump-to-zero track record.
 * This is the core signal for your actual question: "which of their
 * same-day duplicate launches are they going to run up, and which will
 * they just drain." A cluster that's pumped 2 of its last 20 launches has
 * a ~10% pump rate — so on any given new mint from them, the base-rate
 * expectation is "dumps near zero" unless other signals (outsider inflow,
 * cohort divergence) say otherwise for THIS specific mint.
 */
export async function getClusterTrackRecord(
  clusterId: string
): Promise<ClusterTrackRecord | null> {
  const cluster = await prisma.walletCluster.findUnique({
    where: { id: clusterId },
    include: {
      tokens: { include: { dumpEvents: true } },
    },
  });
  if (!cluster) return null;

  const totalLaunches = cluster.tokens.length;
  const migratedCount = cluster.tokens.filter((t) => t.migratedAt !== null).length;
  const pumpedCount = cluster.tokens.filter(
    (t) => (t.peakMcapUsd ?? 0) >= PUMP_THRESHOLD_USD
  ).length;
  const dumpedCount = cluster.tokens.filter((t) => t.status === 'DUMPED' || t.status === 'DEAD')
    .length;

  const peaks = cluster.tokens
    .map((t) => t.peakMcapUsd)
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b);
  const medianPeakMcapUsd = peaks.length > 0 ? peaks[Math.floor(peaks.length / 2)] ?? null : null;

  const slotsToFirstDump = cluster.tokens
    .map((t) => {
      const firstDump = t.dumpEvents.sort((a, b) => Number(a.slot - b.slot))[0];
      if (!firstDump || t.bondedSlot === null) return null;
      return Number(firstDump.slot - t.bondedSlot);
    })
    .filter((v): v is number => v !== null && v >= 0);
  const avgSlotsToFirstDump =
    slotsToFirstDump.length > 0
      ? slotsToFirstDump.reduce((a, b) => a + b, 0) / slotsToFirstDump.length
      : null;

  return {
    clusterId,
    label: cluster.label,
    totalLaunches,
    migratedCount,
    pumpedCount,
    dumpedCount,
    pumpRate: totalLaunches > 0 ? pumpedCount / totalLaunches : 0,
    medianPeakMcapUsd,
    avgSlotsToFirstDump,
  };
}
