// Tag values match your production `tagged_wallets.tag` data exactly
// (lowercase free text — only 'insider'/'outsider' appear so far;
// 'mev_bot' is reserved for the UI's third toggle). Validated in the app
// layer since the DB column itself isn't a constrained enum.
export type TagType = 'insider' | 'outsider' | 'mev_bot';

// Ground truth from your curated `coin_stats.outcome` column.
export type CoinOutcome = 'dumped' | 'pumped' | 'pump_and_dump';

export interface HolderRow {
  walletAddress: string;
  balanceRaw: string; // bigint serialized as string over the wire
  percentOfSupply: number;
  tagType: TagType | null;
  note: string | null;
  clusterLabel: string | null; // tagged_wallets.label
  clusterParent: string | null; // tagged_wallets.cluster_parent
}

export interface HolderTableResponse {
  mintAddress: string;
  slot: number;
  capturedAt: string; // ISO timestamp
  tokenDecimals: number;
  totalSupply: string;
  marketCapUsd: number | null;
  marketCapSol: number | null;
  solUsdPrice: number | null;
  isHistorical: boolean;
  holders: HolderRow[];
  outsiderVolume: OutsiderVolumeResult;
}

export interface OutsiderVolumeResult {
  totalPoolSol: number;
  insiderTaggedSol: number;
  mevBotTaggedSol: number;
  trueOutsiderVolumeSol: number;
  outsiderRatio: number; // trueOutsiderVolumeSol / totalPoolSol, 0-1
}

export interface ClusterTrackRecord {
  label: string;
  totalLaunches: number;
  ranUpCount: number; // outcome IN ('pumped', 'pump_and_dump') — they ran it up at some point
  neverRanUpCount: number; // outcome = 'dumped' — straight drain, never pumped
  pumpRate: number; // ranUpCount / totalLaunches
  medianPeakMcapUsd: number | null;
  medianDurationMinutes: number | null;
}

export interface DumpRiskAssessment {
  mintAddress: string;
  riskScore: number; // 0-100, higher = more likely dumping soon / already dumping
  signals: DumpRiskSignal[];
}

export interface DumpRiskSignal {
  key:
    | 'CLUSTER_LOW_PUMP_RATE'
    | 'OUTSIDER_INFLOW_STALLING'
    | 'RENT_LOOP_STOPPED'
    | 'CONCURRENT_CLUSTER_SELLS'
    | 'HIGH_INSIDER_CONCENTRATION';
  weight: number;
  description: string;
  triggered: boolean;
}
