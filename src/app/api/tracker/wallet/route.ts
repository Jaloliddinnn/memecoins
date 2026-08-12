import { NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import { walletHistoryService } from '@/lib/tracker/walletHistory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const address = params.get('address')?.trim();
  const coinLimit = Number(params.get('coins') ?? 10);
  if (!address) return NextResponse.json({ error: 'address required' }, { status: 400 });
  try {
    new PublicKey(address);
  } catch {
    return NextResponse.json({ error: 'Not a valid Solana address' }, { status: 400 });
  }
  try {
    const history = await walletHistoryService.fetchWalletHistory(address, {
      coinLimit: Math.min(Math.max(coinLimit, 1), 40),
    });
    return NextResponse.json(history);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'History scan failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
