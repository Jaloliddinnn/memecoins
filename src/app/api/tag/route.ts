import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/tag
 * Body: { walletAddress: string, tagType: 'insider'|'outsider'|'mev_bot', notes?: string, label?: string, clusterParent?: string }
 *
 * Upserts a wallet tag into the real `tagged_wallets` table (address is
 * the primary key — one tag applies globally to a wallet, matching your
 * existing data). Because scammers reuse the same wallet cluster for ~a
 * month, this is the write side of the "auto-recognize known wallets on
 * every future scan" feature — the read side is the tag join in
 * lib/helius/holders.ts.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.walletAddress !== 'string' || typeof body.tagType !== 'string') {
    return NextResponse.json(
      { error: 'Body must include walletAddress (string) and tagType (string)' },
      { status: 400 }
    );
  }

  const { walletAddress, tagType, notes, label, clusterParent } = body as {
    walletAddress: string;
    tagType: string;
    notes?: string;
    label?: string;
    clusterParent?: string;
  };

  if (!['insider', 'outsider', 'mev_bot'].includes(tagType)) {
    return NextResponse.json({ error: 'tagType must be insider, outsider, or mev_bot' }, { status: 400 });
  }

  const now = BigInt(Date.now());

  const wallet = await prisma.taggedWallet.upsert({
    where: { address: walletAddress },
    update: {
      tag: tagType,
      notes: notes ?? undefined,
      label: label ?? undefined,
      clusterParent: clusterParent ?? undefined,
      updatedAt: now,
    },
    create: {
      address: walletAddress,
      tag: tagType,
      notes,
      label,
      clusterParent,
      createdAt: now,
      updatedAt: now,
    },
  });

  // BigInt fields (createdAt/updatedAt) don't serialize via JSON.stringify
  // by default, so convert them to strings before responding.
  return NextResponse.json(serializeWallet(wallet));
}

/**
 * DELETE /api/tag?walletAddress=<address>
 * Removes a tag (e.g. corrected a misclick).
 */
export async function DELETE(req: NextRequest) {
  const walletAddress = req.nextUrl.searchParams.get('walletAddress');
  if (!walletAddress) {
    return NextResponse.json({ error: 'Missing required "walletAddress" query param' }, { status: 400 });
  }
  await prisma.taggedWallet.delete({ where: { address: walletAddress } }).catch(() => null);
  return NextResponse.json({ ok: true });
}

function serializeWallet(w: Awaited<ReturnType<typeof prisma.taggedWallet.upsert>>) {
  return {
    ...w,
    createdAt: w.createdAt?.toString() ?? null,
    updatedAt: w.updatedAt?.toString() ?? null,
  };
}
