export type TagType = 'INSIDER' | 'OUTSIDER' | 'MEV_BOT';

export interface HolderRow {
  walletAddress: string;
  balanceRaw: string; // bigint serialized as string over the wire
  percentOfSupply: number;
  tagType: TagType | null;
  customNote: string | null;
  clusterId: string | null;
  clusterLabel: string | null;
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
  clusterId: string;
  label: string | null;
  totalLaunches: number;
  migratedCount: number;
  pumpedCount: number; // peak mcap exceeded PUMP_THRESHOLD_USD after migration
  dumpedCount: number;
  pumpRate: number; // pumpedCount / totalLaunches
  medianPeakMcapUsd: number | null;
  avgSlotsToFirstDump: number | null;
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
