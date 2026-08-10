import { NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import { analyze } from '@/lib/signals/engine';
import { GROUPS, type GroupId } from '@/lib/signals/groups';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** Pool pagination + Helius batch parsing can take a while on a busy pool. */
export const maxDuration = 60;

function isValidMint(value: string): boolean {
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  let body: { mint?: string; group?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const mint = (body.mint ?? '').trim();
  const group = (body.group ?? '') as GroupId;

  if (!mint) {
    return NextResponse.json({ error: 'Paste a contract address' }, { status: 400 });
  }
  if (!isValidMint(mint)) {
    return NextResponse.json(
      { error: 'That is not a valid Solana address' },
      { status: 400 }
    );
  }
  if (!GROUPS[group]) {
    return NextResponse.json({ error: 'Pick a group first' }, { status: 400 });
  }

  try {
    const result = await analyze(mint, group);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Analysis failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
