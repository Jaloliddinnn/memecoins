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
    return NextResponse.json({ traders: await topTradersService.fetchTopTraders(mint) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Top-trader scan failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
