import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/tag
 * Body: { walletAddress: string, tagType: 'INSIDER'|'OUTSIDER'|'MEV_BOT', customNote?: string, clusterId?: string }
 *
 * Upserts a wallet tag. Because scammers reuse the same wallet cluster for
 * ~a month, this is the write side of the "auto-recognize known wallets on
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

  const { walletAddress, tagType, customNote, clusterId } = body as {
    walletAddress: string;
    tagType: string;
    customNote?: string;
    clusterId?: string;
  };

  if (!['INSIDER', 'OUTSIDER', 'MEV_BOT'].includes(tagType)) {
    return NextResponse.json({ error: 'tagType must be INSIDER, OUTSIDER, or MEV_BOT' }, { status: 400 });
  }

  const wallet = await prisma.taggedWallet.upsert({
    where: { walletAddress },
    update: {
      tagType: tagType as 'INSIDER' | 'OUTSIDER' | 'MEV_BOT',
      customNote: customNote ?? undefined,
      clusterId: clusterId ?? undefined,
    },
    create: {
      walletAddress,
      tagType: tagType as 'INSIDER' | 'OUTSIDER' | 'MEV_BOT',
      customNote,
      clusterId,
    },
  });

  return NextResponse.json(wallet);
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
  await prisma.taggedWallet.delete({ where: { walletAddress } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
