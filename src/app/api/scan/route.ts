import { NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import { calculateMetrics, fetchHolders, getTokenMetadata } from '@/lib/tracker/holders';
import { getTagsFor } from '@/lib/tracker/db';
import type { ScanResult, WalletTagMap } from '@/lib/tracker/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
  const started = Date.now();
  let body: { mint?: string; excludeLp?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const mint = (body.mint ?? '').trim();
  const excludeLp = body.excludeLp ?? true;
  if (!mint) return NextResponse.json({ error: 'Paste a contract address' }, { status: 400 });
  try {
    new PublicKey(mint);
  } catch {
    return NextResponse.json({ error: 'That is not a valid Solana address' }, { status: 400 });
  }

  try {
    const metadata = await getTokenMetadata(mint);

    // Two passes: fetch holders once with no tags to learn the addresses, look
    // those up, then classify. Cheaper than pulling all 24k tag rows.
    const bare = await fetchHolders(mint, metadata, {});
    const tags: WalletTagMap = await getTagsFor(bare.map((h) => h.ownerAddress)).catch(
      () => ({}) as WalletTagMap
    );
    const holders = await fetchHolders(mint, metadata, tags);
    const metrics = calculateMetrics(holders, metadata.totalSupply, excludeLp);

    const counts = new Map<string, number>();
    for (const h of holders) {
      const label = tags[h.ownerAddress]?.label;
      if (label) counts.set(label, (counts.get(label) ?? 0) + 1);
    }

    const result: ScanResult = {
      metadata,
      holders,
      metrics,
      groupsPresent: [...counts.entries()]
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count),
      scannedAt: Date.now(),
      elapsedMs: Date.now() - started,
    };
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Scan failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
