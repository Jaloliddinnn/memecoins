import { NextRequest, NextResponse } from 'next/server';
import { getCurrentHolders } from '@/lib/helius/holders';
import { getHistoricalHolders } from '@/lib/helius/historicalHolders';
import { assessDumpRisk } from '@/lib/analysis/dumpRisk';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/holders?mint=<address>[&timestamp=<unixSeconds>]
 *
 * Live mode (no timestamp): queries Helius for the current top holders.
 * Time-Travel mode (timestamp given): reconstructs holders as of that UTC
 * moment per the strict bounded-window rule — see lib/helius/historicalHolders.ts.
 */
export async function GET(req: NextRequest) {
  const mint = req.nextUrl.searchParams.get('mint');
  const timestampParam = req.nextUrl.searchParams.get('timestamp');

  if (!mint) {
    return NextResponse.json({ error: 'Missing required "mint" query param' }, { status: 400 });
  }

  try {
    const result = timestampParam
      ? await getHistoricalHolders(mint, Number(timestampParam))
      : await getCurrentHolders(mint);

    // Persist a snapshot for live scans so Time-Travel mode has cache hits
    // for "right now" later, and so cluster track records accrue history.
    if (!result.isHistorical) {
      await persistSnapshot(result.mintAddress, result).catch(() => {
        // best-effort — don't fail the request if the DB write hiccups
      });
    }

    const riskAssessment = await assessDumpRisk(result).catch(() => null);

    return NextResponse.json({ ...result, riskAssessment });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

async function persistSnapshot(
  mintAddress: string,
  result: Awaited<ReturnType<typeof getCurrentHolders>>
) {
  await prisma.token.upsert({
    where: { mintAddress },
    update: {},
    create: { mintAddress },
  });

  await prisma.holderSnapshot.createMany({
    data: result.holders.map((h) => ({
      mintAddress,
      walletAddress: h.walletAddress,
      balanceRaw: h.balanceRaw,
      percentOfSupply: h.percentOfSupply,
      solInPool: result.marketCapSol,
      marketCapUsd: result.marketCapUsd,
      slot: BigInt(result.slot),
    })),
  });
}
