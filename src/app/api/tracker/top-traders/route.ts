import { NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import { topTradersService } from '@/lib/tracker/topTraders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const mint = new URL(request.url).searchParams.get('mint')?.trim();
  if (!mint) return NextResponse.json({ error: 'mint required' }, { status: 400 });
  try {
    new PublicKey(mint);
  } catch {
    return NextResponse.json({ error: 'Not a valid Solana address' }, { status: 400 });
  }
  try {
    // Flattened, not nested under another `traders` key — the sheet reads
    // `traders` as the array, and wrapping the whole result object in it made
    // every scan render as "No trades found".
    const result = await topTradersService.fetchTopTraders(mint);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Top-trader scan failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
