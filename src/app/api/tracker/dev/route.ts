import { NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import { devProfilerService } from '@/lib/tracker/devProfiler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get('address')?.trim();
  if (!address) return NextResponse.json({ error: 'address required' }, { status: 400 });
  try {
    new PublicKey(address);
  } catch {
    return NextResponse.json({ error: 'Not a valid Solana address' }, { status: 400 });
  }
  try {
    return NextResponse.json(await devProfilerService.fetchDevProfile(address));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Profile lookup failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
