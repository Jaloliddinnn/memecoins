import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/tokens?cohort=<launchCohortKey>
 * Lists tracked tokens, optionally filtered to a same-name launch cohort
 * (multiple mints from the same cluster launched the same day) so the UI
 * can show which sibling is diverging first.
 */
export async function GET(req: NextRequest) {
  const cohort = req.nextUrl.searchParams.get('cohort');

  const tokens = await prisma.token.findMany({
    where: cohort ? { launchCohortKey: cohort } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { cluster: true },
  });

  return NextResponse.json(tokens);
}

/**
 * PATCH /api/tokens
 * Body: { mintAddress: string, ...fields }
 * Updates lifecycle fields (status, migratedAt, peakMcapUsd, etc.) as you
 * observe them — this is what feeds the cluster track record over time.
 */
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.mintAddress !== 'string') {
    return NextResponse.json({ error: 'Body must include mintAddress' }, { status: 400 });
  }
  const { mintAddress, ...updates } = body;

  const token = await prisma.token.update({
    where: { mintAddress },
    data: updates,
  });

  return NextResponse.json(token);
}
