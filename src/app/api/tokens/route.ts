import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/tokens?group=<walletGroup>
 * Lists tracked launches from `coin_stats`, optionally filtered to a
 * cluster's wallet_group — this doubles as same-day cohort tracking
 * (multiple mints from the same cluster launched close together) since
 * wallet_group is already the human-assigned grouping key in your data.
 */
export async function GET(req: NextRequest) {
  const group = req.nextUrl.searchParams.get('group');

  const tokens = await prisma.coinStat.findMany({
    where: group ? { walletGroup: group } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return NextResponse.json(tokens.map(serializeCoinStat));
}

/**
 * PATCH /api/tokens
 * Body: { mint: string, ...fields }
 * Updates lifecycle fields (outcome, maxMarketCapUsd, etc.) as you observe
 * them — this is what feeds the cluster track record over time.
 */
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.mint !== 'string') {
    return NextResponse.json({ error: 'Body must include mint' }, { status: 400 });
  }
  const { mint, ...updates } = body;

  const token = await prisma.coinStat.update({
    where: { mint },
    data: { ...updates, updatedAt: BigInt(Date.now()) },
  });

  return NextResponse.json(serializeCoinStat(token));
}

function serializeCoinStat(t: Awaited<ReturnType<typeof prisma.coinStat.findFirst>>) {
  if (!t) return t;
  return {
    ...t,
    snapshotAt: t.snapshotAt?.toString() ?? null,
    createdAt: t.createdAt?.toString() ?? null,
    updatedAt: t.updatedAt?.toString() ?? null,
  };
}
