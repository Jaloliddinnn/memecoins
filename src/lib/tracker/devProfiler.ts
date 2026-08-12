import type { DevCreatedCoin, DevProfile } from './types';

/*
 * PORTED FROM Tool-Memecoin `src/services/devProfiler.ts`.
 * Runs on the server, so the browser CORS-proxy fallback chain is gone — a
 * direct call to pump.fun works and does not leak the request through a third
 * party. Helius key reads from the server env.
 */

/** Loose shape of the pump.fun API payloads we read. */
export interface PumpJson {
  [key: string]: unknown;
  creator?: string;
  username?: string;
  profile_image?: string;
  bio?: string;
  mint?: string;
  name?: string;
  symbol?: string;
  description?: string;
  image_uri?: string;
  complete?: boolean;
  raydium_pool?: string;
  usd_market_cap?: number | string;
  market_cap?: number | string;
  created_timestamp?: number | string;
  reply_count?: number | string;
  real_sol_reserves?: number | string;
}

export class DevProfilerService {
  /**
   * Helper to fetch data with robust CORS fallbacks:
   * 1. Local Vite proxy (/api/pump/...)
   * 2. Direct Pump.fun API
   * 3. Public CORS proxies (corsproxy.io, allorigins)
   */
  public async fetchPumpJson(path: string): Promise<PumpJson | null> {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const directUrl = `https://frontend-api-v3.pump.fun${cleanPath}`;

    const candidates = [directUrl];

    for (const url of candidates) {
      try {
        const res = await fetch(url, {
          signal: AbortSignal.timeout(5000),
          headers: {
            Accept: 'application/json',
          },
        });
        if (res.ok) {
          const data = (await res.json()) as PumpJson | null;
          if (data) return data;
        }
      } catch {
        // continue to next fallback candidate
      }
    }
    return null;
  }

  /**
   * Fetches the creator address for a given token mint
   */
  public async getCreatorForMint(mintAddress: string): Promise<string | null> {
    try {
      const data = await this.fetchPumpJson(`/coins/${mintAddress}`);
      return data?.creator ? String(data.creator) : null;
    } catch (e) {
      console.warn('Could not fetch token creator from Pump.fun API', e);
    }
    return null;
  }

  /**
   * Fetches full developer profile, created coins, migration statistics, and risk rating
   */
  public async fetchDevProfile(walletAddress: string): Promise<DevProfile> {
    const cleanWallet = walletAddress.trim();
    let username: string | undefined;
    let profileImage: string | undefined;
    let bio: string | undefined;

    // 1. Fetch User Profile Details from Pump.fun
    try {
      const userData = await this.fetchPumpJson(`/users/${cleanWallet}`);
      if (userData) {
        username = userData.username ? String(userData.username) : undefined;
        profileImage = userData.profile_image ? String(userData.profile_image) : undefined;
        bio = userData.bio ? String(userData.bio) : undefined;
      }
    } catch {
      // ignore
    }

    // 2. Fetch all coins created by this developer with pagination (up to 200 coins)
    const rawCoinsMap = new Map<string, PumpJson>();
    let offset = 0;
    const limit = 50;
    let hasMore = true;

    while (hasMore && offset <= 200) {
      try {
        const batch = await this.fetchPumpJson(
          `/coins?creator=${cleanWallet}&limit=${limit}&offset=${offset}&sort=created_timestamp&order=DESC&includeNsfw=true`
        );

        const list = batch as unknown as PumpJson[] | null;
        if (Array.isArray(list) && list.length > 0) {
          for (const c of list) {
            if (c.mint) {
              rawCoinsMap.set(c.mint, c);
            }
          }
          if (list.length < limit) {
            hasMore = false;
          } else {
            offset += limit;
          }
        } else {
          hasMore = false;
        }
      } catch {
        hasMore = false;
      }
    }

    // 3. Fallback: Query Helius Enhanced API for on-chain CREATE transactions
    // in case developer created coins outside pump.fun or pump indexer is lagging
    try {
      const heliusKey = process.env.HELIUS_API_KEY || '';
      const heliusUrl = `https://api.helius.xyz/v0/addresses/${cleanWallet}/transactions?api-key=${heliusKey}&type=CREATE&limit=50`;
      const hRes = await fetch(heliusUrl, { signal: AbortSignal.timeout(6000) });
      if (hRes.ok) {
        const createTxs = (await hRes.json()) as Array<{
          tokenTransfers?: Array<{ mint?: string }>;
        }>;
        if (Array.isArray(createTxs)) {
          for (const tx of createTxs) {
            if (tx.tokenTransfers && Array.isArray(tx.tokenTransfers)) {
              for (const tt of tx.tokenTransfers) {
                if (tt.mint && !rawCoinsMap.has(tt.mint)) {
                  // Try to fetch coin details for this mint
                  try {
                    const coinInfo = await this.fetchPumpJson(`/coins/${tt.mint}`);
                    if (coinInfo && coinInfo.mint) {
                      rawCoinsMap.set(String(coinInfo.mint), coinInfo);
                    }
                  } catch {
                    // ignore
                  }
                }
              }
            }
          }
        }
      }
    } catch {
      // ignore
    }

    const rawCoins = Array.from(rawCoinsMap.values());

    // If 0 coins found:
    if (rawCoins.length === 0) {
      return {
        walletAddress: cleanWallet,
        username,
        profileImage,
        bio,
        totalCoinsCreated: 0,
        migratedCoins: 0,
        deadCoins: 0,
        migrationRate: 0,
        totalMarketCapUsd: 0,
        riskRating: 'MODERATE',
        riskLabel: 'No token launches found for this developer address',
        coins: [],
      };
    }

    // 4. Process each coin
    const coins: DevCreatedCoin[] = rawCoins.map((c) => {
      const isMigrated = c.complete === true || Boolean(c.raydium_pool);
      return {
        mint: String(c.mint),
        name: String(c.name || 'Unnamed Token'),
        symbol: String(c.symbol || 'COIN').replace('$', ''),
        description: c.description ? String(c.description) : undefined,
        imageUri: c.image_uri ? String(c.image_uri) : undefined,
        isMigrated,
        marketCapUsd: Number(c.usd_market_cap || 0),
        marketCapSol: Number(c.market_cap || 0),
        createdTimestamp: Number(c.created_timestamp || Date.now()),
        replyCount: Number(c.reply_count || 0),
        raydiumPool: c.raydium_pool ? String(c.raydium_pool) : undefined,
      };
    });

    // Sort coins by createdTimestamp descending (newest first)
    coins.sort((a, b) => b.createdTimestamp - a.createdTimestamp);

    // 5. Compute Developer Aggregated Metrics
    const totalCoinsCreated = coins.length;
    const migratedCoins = coins.filter((c) => c.isMigrated).length;
    const deadCoins = totalCoinsCreated - migratedCoins;
    const migrationRate = totalCoinsCreated > 0 ? (migratedCoins / totalCoinsCreated) * 100 : 0;
    const totalMarketCapUsd = coins.reduce((acc, c) => acc + c.marketCapUsd, 0);

    // 6. Calculate Risk Score & Rating
    let riskRating: DevProfile['riskRating'] = 'MODERATE';
    let riskLabel = 'Moderate Risk: Few token launches recorded';

    if (totalCoinsCreated >= 3 && migrationRate <= 25) {
      riskRating = 'CRITICAL_SCAMMER';
      riskLabel = `🚨 CRITICAL: Serial Curve Spammer (${(100 - migrationRate).toFixed(0)}% Rug Rate - ${deadCoins} Failed Coins)`;
    } else if (totalCoinsCreated >= 2 && migrationRate < 50) {
      riskRating = 'HIGH_RISK';
      riskLabel = `⚠️ High Risk: Low Graduation Rate (${migrationRate.toFixed(0)}% Migrated)`;
    } else if (totalCoinsCreated >= 2 && migrationRate >= 50) {
      riskRating = 'HIGH_SUCCESS';
      riskLabel = `🟢 Proven Developer: High Graduation Rate (${migrationRate.toFixed(0)}% Migrated)`;
    } else if (totalCoinsCreated === 1 && migratedCoins === 1) {
      riskRating = 'HIGH_SUCCESS';
      riskLabel = `🟢 100% Migration: Single coin launched and bonded to DEX`;
    } else if (totalCoinsCreated === 1 && deadCoins === 1) {
      riskRating = 'HIGH_RISK';
      riskLabel = `⚠️ Single Unmigrated Coin: Still on bonding curve or abandoned`;
    }

    return {
      walletAddress: cleanWallet,
      username,
      profileImage,
      bio,
      totalCoinsCreated,
      migratedCoins,
      deadCoins,
      migrationRate,
      totalMarketCapUsd,
      riskRating,
      riskLabel,
      coins,
    };
  }

  /**
   * Relative time formatter (e.g., "2 hours ago", "3 days ago")
   */
  public formatRelativeTime(timestamp: number): string {
    if (!timestamp) return 'Unknown';
    const now = Date.now();
    const diff = Math.floor((now - timestamp) / 1000);

    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`;
    return new Date(timestamp).toLocaleDateString();
  }
}

export const devProfilerService = new DevProfilerService();
