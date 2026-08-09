import type { DumpRiskAssessment, DumpRiskSignal, HolderTableResponse } from '@/types';
import { getClusterTrackRecord } from '@/lib/analysis/clusterScore';

/**
 * Rule-based dump-risk score (0-100) for a token, combining the cluster's
 * historical behavior (from your curated coin_stats.outcome data) with
 * this specific launch's live signals. This is v1: transparent, auditable
 * rules — not a black-box model — precisely so you can see WHY a coin is
 * flagged and tune weights against outcomes you observe. As coin_stats
 * accumulates more labeled launches, this is the place to swap in a
 * learned model without touching the callers.
 *
 * None of these signals catch the exact pre-Jito-bundle second (that needs
 * mempool/bundle simulation access this stack doesn't have on the free
 * tier) — they estimate *rising probability* ahead of it. Two signals
 * (RENT_LOOP_STOPPED, CONCURRENT_CLUSTER_SELLS) are wired as opt-in flags
 * you pass in once you have a live watcher feeding them; until then they
 * report "not sampled" rather than silently defaulting to false.
 */
export async function assessDumpRisk(
  current: HolderTableResponse,
  opts: {
    recentSnapshots?: HolderTableResponse[];
    rentLoopActiveNow?: boolean;
    concurrentClusterSellDetected?: boolean;
  } = {}
): Promise<DumpRiskAssessment> {
  const signals: DumpRiskSignal[] = [];

  // Signal 1: cluster's own history says they rarely bother running coins up.
  const clusterLabel = current.holders.find((h) => h.clusterLabel)?.clusterLabel ?? null;
  const track = clusterLabel ? await getClusterTrackRecord(clusterLabel) : null;
  signals.push({
    key: 'CLUSTER_LOW_PUMP_RATE',
    weight: 25,
    description: track
      ? `Cluster "${track.label}" has run up ${track.ranUpCount}/${track.totalLaunches} past launches (${(track.pumpRate * 100).toFixed(0)}%); the rest went straight to dumped.`
      : clusterLabel
        ? `No coin_stats history found for cluster "${clusterLabel}" yet — unscored.`
        : 'No tagged/labeled cluster among current holders — unscored.',
    triggered: track !== null && track.pumpRate < 0.2,
  });

  // Signal 2: insider concentration still high post-migration is a red flag
  // on its own — they haven't distributed, meaning any move is theirs to make.
  const insiderPct = current.holders
    .filter((h) => h.tagType === 'insider')
    .reduce((a, h) => a + h.percentOfSupply, 0);
  signals.push({
    key: 'HIGH_INSIDER_CONCENTRATION',
    weight: 20,
    description: `Tagged insiders hold ${insiderPct.toFixed(1)}% of current supply.`,
    triggered: insiderPct >= 30,
  });

  // Signal 3: outsider inflow trend vs recent snapshots (needs history,
  // passed in by the caller from holder_snapshots).
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
  // precedes the coordinated exit (playbook step 3 -> step 4 transition).
  // Not sampled yet — needs a live instruction-pattern watcher; see README.
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
  // window — the closest thing to a live alarm this stack can raise. Not
  // sampled yet — needs a live watcher (no dump-event table in production
  // data to query); see README known gaps.
  signals.push({
    key: 'CONCURRENT_CLUSTER_SELLS',
    weight: 20,
    description:
      opts.concurrentClusterSellDetected === undefined
        ? 'Concurrent multi-wallet sell detection not sampled for this assessment.'
        : opts.concurrentClusterSellDetected
          ? 'Concurrent multi-wallet sell detected within the last few minutes.'
          : 'No concurrent multi-wallet sell detected recently.',
    triggered: opts.concurrentClusterSellDetected === true,
  });

  const riskScore = signals.reduce((acc, s) => acc + (s.triggered ? s.weight : 0), 0);

  return {
    mintAddress: current.mintAddress,
    riskScore: Math.min(100, riskScore),
    signals,
  };
}
