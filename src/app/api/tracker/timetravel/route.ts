import { NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import { historicalScanner, toDashboardShape } from '@/lib/tracker/historicalScanner';
import { calculateMetrics, getTokenMetadata } from '@/lib/tracker/holders';
import { getTagsFor } from '@/lib/tracker/db';
import type { ScanResult, WalletTagMap } from '@/lib/tracker/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** A deep rewind can replay thousands of transactions. */
export const maxDuration = 300;

export async function POST(request: Request) {
  const started = Date.now();
  let body: { mint?: string; timestamp?: number; excludeLp?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const mint = (body.mint ?? '').trim();
  const timestamp = Number(body.timestamp);
  if (!mint) return NextResponse.json({ error: 'mint required' }, { status: 400 });
  try {
    new PublicKey(mint);
  } catch {
    return NextResponse.json({ error: 'Not a valid Solana address' }, { status: 400 });
  }
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return NextResponse.json({ error: 'timestamp (unix seconds) required' }, { status: 400 });
  }
  if (timestamp * 1000 > Date.now()) {
    return NextResponse.json({ error: 'That time is in the future' }, { status: 400 });
  }

  try {
    const base = await getTokenMetadata(mint);
    const scan = await historicalScanner.scanToken(mint, {
      targetTimestamp: timestamp,
      devAddress: base.creatorAddress ?? null,
    });

    const bare = toDashboardShape(scan, base);
    const tags: WalletTagMap = await getTagsFor(
      bare.holders.map((h) => h.ownerAddress)
    ).catch(() => ({}) as WalletTagMap);
    const shaped = toDashboardShape(scan, base, tags);

    const counts = new Map<string, number>();
    for (const h of shaped.holders) {
      const label = tags[h.ownerAddress]?.label;
      if (label) counts.set(label, (counts.get(label) ?? 0) + 1);
    }

    const result: ScanResult & { diagnostics?: unknown; scanMode?: string } = {
      metadata: shaped.metadata,
      holders: shaped.holders,
      metrics: calculateMetrics(
        shaped.holders,
        shaped.metadata.totalSupply,
        body.excludeLp ?? true
      ),
      groupsPresent: [...counts.entries()]
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count),
      scannedAt: timestamp * 1000,
      elapsedMs: Date.now() - started,
      diagnostics: scan.diagnostics,
      scanMode: scan.scanMode,
    };
    return NextResponse.json(result);
  } catch (error) {
    // The scanner throws rather than silently degrading to live data — surface
    // that verbatim so the operator knows the snapshot was refused, not faked.
    const message = error instanceof Error ? error.message : 'Historical scan failed';
    const hint =
      error && typeof error === 'object' && 'hint' in error
        ? String((error as { hint?: unknown }).hint ?? '')
        : '';
    return NextResponse.json({ error: message, hint: hint || undefined }, { status: 500 });
  }
}
