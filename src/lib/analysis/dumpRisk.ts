import { prisma } from '@/lib/prisma';
import type { DumpRiskAssessment, DumpRiskSignal, HolderTableResponse } from '@/types';
import { getClusterTrackRecord, PUMP_THRESHOLD_USD } from '@/lib/analysis/clusterScore';

/**
 * Rule-based dump-risk score (0-100) for a token, combining the cluster's
 * historical behavior with this specific launch's live signals. This is
 * v1: transparent, auditable rules — not a black-box model — precisely so
 * you can see WHY a coin is flagged and tune weights against outcomes you
 * observe. Once dump_events accumulates real labeled outcomes, this is the
 * place to swap in a learned model without touching the callers.
 *
 * None of these signals catch the exact pre-Jito-bundle second (that needs
 * mempool/bundle simulation access this stack doesn't have on the free
 * tier) — they estimate *rising probability* ahead of it, and the
 * concurrent-sell signal catches the dump within ~1 confirmed slot of it
 * starting, which is still fast enough to matter for an outsider deciding
 * whether to keep holding.
 */
export async function assessDumpRisk(
  current: HolderTableResponse,
  opts: { recentSnapshots?: HolderTableResponse[]; rentLoopActiveNow?: boolean } = {}
): Promise<DumpRiskAssessment> {
  const signals: DumpRiskSignal[] = [];

  // Signal 1: cluster's own history says they rarely bother pumping.
  const insiderCluster = current.holders.find((h) => h.clusterId)?.clusterId ?? null;
  let clusterPumpRate: number | null = null;
  if (insiderCluster) {
    const track = await getClusterTrackRecord(insiderCluster);
    clusterPumpRate = track?.pumpRate ?? null;
  }
  signals.push({
    key: 'CLUSTER_LOW_PUMP_RATE',
    weight: 25,
    description:
      clusterPumpRate === null
        ? 'No prior launches recorded for this wallet cluster yet — unscored.'
        : `Cluster has pumped ${(clusterPumpRate * 100).toFixed(0)}% of its past launches above $${PUMP_THRESHOLD_USD.toLocaleString()}.`,
    triggered: clusterPumpRate !== null && clusterPumpRate < 0.2,
  });

  // Signal 2: insider concentration still high post-migration is a red flag
  // on its own — they haven't distributed, meaning any move is theirs to make.
  const insiderPct = current.holders
    .filter((h) => h.tagType === 'INSIDER')
    .reduce((a, h) => a + h.percentOfSupply, 0);
  signals.push({
    key: 'HIGH_INSIDER_CONCENTRATION',
    weight: 20,
    description: `Tagged insiders hold ${insiderPct.toFixed(1)}% of current supply.`,
    triggered: insiderPct >= 30,
  });

  // Signal 3: outsider inflow trend vs recent snapshots (needs history).
  const recents = opts.recentSnapshots ?? [];
  let inflowTrend: number | null = null;
  if (recents.length >= 2) {
    const first = recents[0]?.outsiderVolume.trueOutsiderVolumeSol ?? 0;
    const last = recents[recents.length - 1]?.outsiderVolume.trueOutsiderVolumeSol ?? 0;
    inflowTrend = last - first;
  }
  signals.push({
    key: 'OUTSIDER_INFLOW_STALLING',
    weight: 20,
    description:
      inflowTrend === null
        ? 'Not enough snapshot history yet to compute an inflow trend.'
        : `Outsider SOL changed by ${inflowTrend.toFixed(2)} SOL across the recent snapshot window.`,
    triggered: inflowTrend !== null && inflowTrend <= 0,
  });

  // Signal 4: the micro-dump rent-reclaim loop suddenly going quiet often
  // precedes the coordinated exit (see project playbook, tactic #3 vs #4).
  signals.push({
    key: 'RENT_LOOP_STOPPED',
    weight: 15,
    description:
      opts.rentLoopActiveNow === undefined
        ? 'Rent-reclaim loop activity not sampled for this assessment.'
        : opts.rentLoopActiveNow
          ? 'Create->swap->close micro-dump loop is still active.'
          : 'Create->swap->close micro-dump loop has gone quiet.',
    triggered: opts.rentLoopActiveNow === false,
  });

  // Signal 5: multiple cluster wallets selling within the same slot/short
  // window — the closest thing to a live alarm this stack can raise.
  const concurrentDump = await prisma.dumpEvent.findFirst({
    where: { mintAddress: current.mintAddress },
    orderBy: { detectedAt: 'desc' },
  });
  const concurrentRecent =
    concurrentDump !== null && Date.now() - concurrentDump.detectedAt.getTime() < 5 * 60_000;
  signals.push({
    key: 'CONCURRENT_CLUSTER_SELLS',
    weight: 20,
    description: concurrentRecent
      ? `Concurrent multi-wallet sell detected at slot ${concurrentDump?.slot} (within last 5 min).`
      : 'No concurrent multi-wallet sell detected recently.',
    triggered: concurrentRecent,
  });

  const riskScore = signals.reduce((acc, s) => acc + (s.triggered ? s.weight : 0), 0);

  return {
    mintAddress: current.mintAddress,
    riskScore: Math.min(100, riskScore),
    signals,
  };
}
