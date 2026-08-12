/**
 * Types ported from the Tool-Memecoin scanner.
 *
 * Kept structurally identical to the original so the existing `tagged_wallets`
 * and `coin_stats` rows round-trip unchanged — the two apps share one database.
 */

export type TagType = 'insider' | 'outsider' | 'lp' | 'untagged';

export type CoinOutcome = 'pumped' | 'dumped' | 'pump_and_dump' | 'neutral';

export interface WalletTag {
  address: string;
  tag: TagType;
  label?: string;
  notes?: string;
  tokenMint?: string;
  clusterParent?: string;
  createdAt?: number;
  updatedAt?: number;
}

export type WalletTagMap = Record<string, WalletTag>;

export interface TokenHolder {
  rank: number;
  tokenAccount: string;
  ownerAddress: string;
  uiAmount: number;
  solValue: number;
  usdValue: number;
  percentOfTotal: number;
  tag: TagType;
  isLiquidityPool: boolean;
  poolName?: string;
  label?: string;
  notes?: string;
  isDev?: boolean;
}

export interface TokenMetadata {
  mint: string;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: number;
  priceNative: number;
  priceUsd: number;
  marketCapUsd: number;
  liquidityUsd: number;
  liquiditySol: number;
  logoURI?: string;
  dexPoolAddress?: string;
  dexName?: string;
  isPumpFun?: boolean;
  creatorAddress?: string;
}

export interface HolderMetrics {
  totalSupply: number;
  circulatingSupply: number;

  insiderAmount: number;
  insiderSol: number;
  insiderUsd: number;
  insiderPercent: number;
  insiderCount: number;

  outsiderAmount: number;
  outsiderSol: number;
  outsiderUsd: number;
  outsiderPercent: number;
  outsiderCount: number;

  lpAmount: number;
  lpSol: number;
  lpUsd: number;
  lpPercent: number;
  lpCount: number;

  untaggedAmount: number;
  untaggedSol: number;
  untaggedUsd: number;
  untaggedPercent: number;
  untaggedCount: number;

  top10Percent: number;
  top10Sol: number;

  /**
   * Outsider Volume Ratio — the share of the *real* (non-LP, non-insider)
   * float held by wallets we have not tied to the operation. High is good.
   */
  outsiderRatio: number;
}

export interface ScanResult {
  metadata: TokenMetadata;
  holders: TokenHolder[];
  metrics: HolderMetrics;
  /** Cluster labels seen among this coin's holders, with hit counts. */
  groupsPresent: Array<{ label: string; count: number }>;
  scannedAt: number;
  elapsedMs: number;
}

export interface CoinStats {
  mint: string;
  name: string;
  symbol: string;
  walletGroup?: string;
  outcome: CoinOutcome;
  logoURI?: string;

  marketCapUsd: number;
  maxMarketCapUsd: number;
  durationMinutes: number;

  insiderCount: number;
  insiderPercent: number;
  insiderSol: number;
  outsiderCount: number;
  outsiderPercent: number;
  lpSol: number;
  lpPercent: number;
  holderCount: number;
  priceUsd: number;
  liquiditySol: number;
  totalSupply: number;
  devAddress?: string;
  isPumpFun: boolean;

  notes?: string;
  snapshotAt: number;
  createdAt?: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Dev profiler
// ---------------------------------------------------------------------------

export interface DevCreatedCoin {
  mint: string;
  name: string;
  symbol: string;
  description?: string;
  imageUri?: string;
  isMigrated: boolean;
  marketCapUsd: number;
  marketCapSol: number;
  createdTimestamp: number;
  replyCount: number;
  raydiumPool?: string;
}

export interface DevProfile {
  walletAddress: string;
  username?: string;
  profileImage?: string;
  bio?: string;
  totalCoinsCreated: number;
  migratedCoins: number;
  deadCoins: number;
  migrationRate: number;
  totalMarketCapUsd: number;
  riskRating: 'CRITICAL_SCAMMER' | 'HIGH_RISK' | 'MODERATE' | 'HIGH_SUCCESS';
  riskLabel: string;
  coins: DevCreatedCoin[];
}
