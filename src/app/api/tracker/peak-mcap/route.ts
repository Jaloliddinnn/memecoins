import { NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import { computePeakMarketCap } from '@/lib/tracker/peakMcap';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** Pages a pool's full signature history — can take a while on an old, busy pool. */
export const maxDuration = 120;

export async function POST(request: Request) {
  let body: { mint?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const mint = (body.mint ?? '').trim();
  if (!mint) return NextResponse.json({ error: 'mint required' }, { status: 400 });
  try {
    new PublicKey(mint);
  } catch {
    return NextResponse.json({ error: 'Not a valid Solana address' }, { status: 400 });
  }

  try {
    const result = await computePeakMarketCap(mint);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Peak scan failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
