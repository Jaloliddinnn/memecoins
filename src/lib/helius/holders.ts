import { PublicKey } from '@solana/web3.js';
import { getConnection } from '@/lib/solana/connection';
import { getBondingCurveState, marketCapSolFromCurve } from '@/lib/solana/pumpfun';
import { getSolUsdPrice } from '@/lib/price/sol';
import { prisma } from '@/lib/prisma';
import type { HolderRow, HolderTableResponse } from '@/types';
import { computeOutsiderVolume } from '@/lib/analysis/outsiderRatio';

const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

/**
 * Live top-holders snapshot for a mint: getTokenLargestAccounts (top 20 by
 * protocol limit) + owner resolution + DB tag lookups, in a bounded number
 * of RPC calls (no signature-by-signature scanning).
 */
export async function getCurrentHolders(mintAddress: string): Promise<HolderTableResponse> {
  const connection = getConnection();
  const mint = new PublicKey(mintAddress);

  const [largest, supplyInfo, slot] = await Promise.all([
    connection.getTokenLargestAccounts(mint),
    connection.getTokenSupply(mint),
    connection.getSlot('confirmed'),
  ]);

  const tokenAccounts = largest.value;
  const accountInfos = await connection.getMultipleParsedAccounts(
    tokenAccounts.map((a) => a.address)
  );

  const decimals = supplyInfo.value.decimals;
  const totalSupplyRaw = BigInt(supplyInfo.value.amount);

  const owners: { walletAddress: string; balanceRaw: bigint }[] = [];
  accountInfos.value.forEach((info, i) => {
    const tokenAccount = tokenAccounts[i];
    if (!info || !('parsed' in info.data) || !tokenAccount) return;
    const parsed = info.data.parsed as {
      info: { owner: string; tokenAmount: { amount: string } };
    };
    owners.push({
      walletAddress: parsed.info.owner,
      balanceRaw: BigInt(parsed.info.tokenAmount.amount),
    });
  });

  const tags = await prisma.taggedWallet.findMany({
    where: { address: { in: owners.map((o) => o.walletAddress) } },
  });
  const tagByWallet = new Map(tags.map((t) => [t.address, t]));

  const holders: HolderRow[] = owners.map((o) => {
    const tag = tagByWallet.get(o.walletAddress);
    return {
      walletAddress: o.walletAddress,
      balanceRaw: o.balanceRaw.toString(),
      percentOfSupply:
        totalSupplyRaw > 0n ? Number((o.balanceRaw * 10000n) / totalSupplyRaw) / 100 : 0,
      tagType: (tag?.tag as HolderRow['tagType']) ?? null,
      note: tag?.notes ?? tag?.note ?? null,
      clusterLabel: tag?.label ?? null,
      clusterParent: tag?.clusterParent ?? null,
    };
  });
  holders.sort((a, b) => b.percentOfSupply - a.percentOfSupply);

  let marketCapSol: number | null = null;
  const curve = await getBondingCurveState(connection, mint).catch(() => null);
  if (curve) {
    marketCapSol = marketCapSolFromCurve(curve, decimals);
  }
  // If curve is null the token has likely already migrated to PumpSwap —
  // see src/lib/solana/pumpswap.ts TODO for post-migration mcap.

  let solUsdPrice: number | null = null;
  let marketCapUsd: number | null = null;
  try {
    solUsdPrice = await getSolUsdPrice();
    marketCapUsd = marketCapSol !== null ? marketCapSol * solUsdPrice : null;
  } catch {
    // price feed hiccup shouldn't block the holder table from rendering
  }

  const totalPoolSol = marketCapSol ?? 0;
  const outsiderVolume = computeOutsiderVolume(holders, totalPoolSol);

  return {
    mintAddress,
    slot,
    capturedAt: new Date().toISOString(),
    tokenDecimals: decimals,
    totalSupply: totalSupplyRaw.toString(),
    marketCapUsd,
    marketCapSol,
    solUsdPrice,
    isHistorical: false,
    holders,
    outsiderVolume,
  };
}

export { TOKEN_PROGRAM_ID };
