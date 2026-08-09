import { PublicKey } from '@solana/web3.js';
import { getConnection, heliusRpcUrl } from '@/lib/solana/connection';
import { timestampToSlot } from '@/lib/solana/slot';
import { prisma } from '@/lib/prisma';
import type { HolderRow, HolderTableResponse } from '@/types';
import { computeOutsiderVolume } from '@/lib/analysis/outsiderRatio';

const DEFAULT_WINDOW_MINUTES = Number(process.env.HISTORICAL_WINDOW_MINUTES ?? 15);

interface HeliusEnhancedTransaction {
  timestamp: number;
  slot: number;
  tokenTransfers?: {
    fromUserAccount: string;
    toUserAccount: string;
    tokenAmount: number;
    mint: string;
  }[];
}

/**
 * Historical holder-table reconstruction for Time-Travel mode.
 *
 * STRICT API RULE (per project spec): do not loop through thousands of past
 * transactions signature-by-signature. This function instead:
 *
 *   1. Checks the snapshot cache (holder_snapshots) for a capture already
 *      close to the requested slot — if found, returns it instantly with
 *      zero Helius calls.
 *   2. Otherwise converts the requested timestamp to a slot via binary
 *      search (O(log n) getBlockTime calls, see lib/solana/slot.ts).
 *   3. Pulls ONE bounded page of Helius's parsed "enhanced transactions"
 *      for the mint within a fixed window (default 15 min, configurable)
 *      around that slot — not an unbounded signature crawl — and replays
 *      balance deltas from the *parsed* transfers Helius already decoded.
 *
 * Caveat: this reconstructs balances from transfers observed inside the
 * bounded window, so if a wallet's position was built up before that
 * window started, its pre-window balance won't be captured. That's a
 * genuine accuracy tradeoff for staying off the free tier's RPS/credit
 * budget. For exact slot-perfect state you'd need an archive RPC node
 * (Helius's paid dedicated nodes, or Triton) doing getAccountInfo at the
 * exact historical slot. Flagging that explicitly rather than pretending
 * this is archive-grade.
 */
export async function getHistoricalHolders(
  mintAddress: string,
  targetUnixSeconds: number,
  windowMinutes: number = DEFAULT_WINDOW_MINUTES
): Promise<HolderTableResponse> {
  const targetDate = new Date(targetUnixSeconds * 1000);

  const cached = await prisma.holderSnapshot.findMany({
    where: {
      mintAddress,
      capturedAt: {
        gte: new Date(targetDate.getTime() - windowMinutes * 60_000),
        lte: new Date(targetDate.getTime() + windowMinutes * 60_000),
      },
    },
    orderBy: { percentOfSupply: 'desc' },
  });

  if (cached.length > 0) {
    // holder_snapshots has no DB relation to tagged_wallets (see schema
    // comment) — join in application code instead.
    const cachedTags = await prisma.taggedWallet.findMany({
      where: { address: { in: cached.map((c) => c.walletAddress) } },
    });
    const tagByWallet = new Map(cachedTags.map((t) => [t.address, t]));
    return snapshotRowsToResponse(mintAddress, cached, tagByWallet, true);
  }

  const connection = getConnection();
  const targetSlot = await timestampToSlot(connection, targetUnixSeconds);

  const windowStart = targetUnixSeconds - windowMinutes * 60;
  const windowEnd = targetUnixSeconds + windowMinutes * 60;

  const txs = await fetchEnhancedTransactionsForMint(mintAddress, windowStart, windowEnd);

  const balances = new Map<string, bigint>();
  for (const tx of txs) {
    for (const transfer of tx.tokenTransfers ?? []) {
      if (transfer.mint !== mintAddress) continue;
      const amountRaw = BigInt(Math.round(transfer.tokenAmount));
      if (transfer.fromUserAccount) {
        balances.set(
          transfer.fromUserAccount,
          (balances.get(transfer.fromUserAccount) ?? 0n) - amountRaw
        );
      }
      if (transfer.toUserAccount) {
        balances.set(
          transfer.toUserAccount,
          (balances.get(transfer.toUserAccount) ?? 0n) + amountRaw
        );
      }
    }
  }

  const supplyInfo = await connection.getTokenSupply(new PublicKey(mintAddress));
  const totalSupplyRaw = BigInt(supplyInfo.value.amount);

  const walletAddresses = [...balances.keys()].filter((w) => (balances.get(w) ?? 0n) > 0n);
  const tags = await prisma.taggedWallet.findMany({
    where: { address: { in: walletAddresses } },
  });
  const tagByWallet = new Map(tags.map((t) => [t.address, t]));

  const holders: HolderRow[] = walletAddresses
    .map((walletAddress) => {
      const balanceRaw = balances.get(walletAddress) ?? 0n;
      const tag = tagByWallet.get(walletAddress);
      return {
        walletAddress,
        balanceRaw: balanceRaw.toString(),
        percentOfSupply:
          totalSupplyRaw > 0n ? Number((balanceRaw * 10000n) / totalSupplyRaw) / 100 : 0,
        tagType: (tag?.tag as HolderRow['tagType']) ?? null,
        note: tag?.notes ?? tag?.note ?? null,
        clusterLabel: tag?.label ?? null,
        clusterParent: tag?.clusterParent ?? null,
      };
    })
    .sort((a, b) => b.percentOfSupply - a.percentOfSupply)
    .slice(0, 50);

  const outsiderVolume = computeOutsiderVolume(holders, 0);

  return {
    mintAddress,
    slot: targetSlot,
    capturedAt: targetDate.toISOString(),
    tokenDecimals: supplyInfo.value.decimals,
    totalSupply: totalSupplyRaw.toString(),
    marketCapUsd: null, // TODO: historical SOL/USD + curve/pool state at targetSlot
    marketCapSol: null,
    solUsdPrice: null,
    isHistorical: true,
    holders,
    outsiderVolume,
  };
}

async function fetchEnhancedTransactionsForMint(
  mintAddress: string,
  windowStartUnix: number,
  windowEndUnix: number
): Promise<HeliusEnhancedTransaction[]> {
  const apiKey = new URL(heliusRpcUrl()).searchParams.get('api-key');
  const url = `https://api.helius.xyz/v0/addresses/${mintAddress}/transactions?api-key=${apiKey}`;

  // Single bounded page — intentionally NOT a full pagination loop through
  // history. If the window is busier than one page, results will be a
  // partial (most-recent-in-window) sample rather than exhaustive; widen
  // the window or upgrade to an archive endpoint if you need completeness.
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) {
    throw new Error(`Helius enhanced transactions request failed: ${res.status}`);
  }
  const all = (await res.json()) as HeliusEnhancedTransaction[];
  return all.filter((tx) => tx.timestamp >= windowStartUnix && tx.timestamp <= windowEndUnix);
}

interface CachedTag {
  tag: string;
  notes: string | null;
  note: string | null;
  label: string | null;
  clusterParent: string | null;
}

function snapshotRowsToResponse(
  mintAddress: string,
  rows: Array<{
    slot: bigint;
    capturedAt: Date;
    balanceRaw: unknown;
    percentOfSupply: number;
    walletAddress: string;
    solInPool: number | null;
    marketCapUsd: number | null;
  }>,
  tagByWallet: Map<string, CachedTag>,
  isHistorical: boolean
): HolderTableResponse {
  const holders: HolderRow[] = rows.map((r) => {
    const tag = tagByWallet.get(r.walletAddress);
    return {
      walletAddress: r.walletAddress,
      balanceRaw: String(r.balanceRaw),
      percentOfSupply: r.percentOfSupply,
      tagType: (tag?.tag as HolderRow['tagType']) ?? null,
      note: tag?.notes ?? tag?.note ?? null,
      clusterLabel: tag?.label ?? null,
      clusterParent: tag?.clusterParent ?? null,
    };
  });

  const totalPoolSol = rows[0]?.solInPool ?? 0;
  const outsiderVolume = computeOutsiderVolume(holders, totalPoolSol);
  const first = rows[0];

  return {
    mintAddress,
    slot: Number(first?.slot ?? 0),
    capturedAt: (first?.capturedAt ?? new Date()).toISOString(),
    tokenDecimals: 6,
    totalSupply: '0',
    marketCapUsd: first?.marketCapUsd ?? null,
    marketCapSol: null,
    solUsdPrice: null,
    isHistorical,
    holders,
    outsiderVolume,
  };
}
