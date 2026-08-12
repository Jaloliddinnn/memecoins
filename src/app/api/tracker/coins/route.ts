import { NextResponse } from 'next/server';
import { deleteCoin, listCoins, saveCoin } from '@/lib/tracker/db';
import type { CoinOutcome, CoinStats } from '@/lib/tracker/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OUTCOMES: CoinOutcome[] = ['pumped', 'dumped', 'pump_and_dump', 'neutral'];

export async function GET() {
  try {
    return NextResponse.json({ coins: await listCoins() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database unreachable';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let body: Partial<CoinStats>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!body.mint) return NextResponse.json({ error: 'mint required' }, { status: 400 });
  const outcome = (body.outcome ?? 'neutral') as CoinOutcome;
  if (!OUTCOMES.includes(outcome)) {
    return NextResponse.json({ error: 'Invalid outcome' }, { status: 400 });
  }

  const now = Date.now();
  const stats: CoinStats = {
    mint: body.mint,
    name: body.name ?? '',
    symbol: body.symbol ?? '',
    walletGroup: body.walletGroup,
    outcome,
    logoURI: body.logoURI,
    marketCapUsd: body.marketCapUsd ?? 0,
    maxMarketCapUsd: body.maxMarketCapUsd ?? 0,
    durationMinutes: body.durationMinutes ?? 0,
    insiderCount: body.insiderCount ?? 0,
    insiderPercent: body.insiderPercent ?? 0,
    insiderSol: body.insiderSol ?? 0,
    outsiderCount: body.outsiderCount ?? 0,
    outsiderPercent: body.outsiderPercent ?? 0,
    lpSol: body.lpSol ?? 0,
    lpPercent: body.lpPercent ?? 0,
    holderCount: body.holderCount ?? 0,
    priceUsd: body.priceUsd ?? 0,
    liquiditySol: body.liquiditySol ?? 0,
    totalSupply: body.totalSupply ?? 0,
    devAddress: body.devAddress,
    isPumpFun: body.isPumpFun ?? false,
    entryPoints: body.entryPoints,
    dipMcap: body.dipMcap,
    notes: body.notes,
    snapshotAt: body.snapshotAt ?? now,
    createdAt: body.createdAt,
    updatedAt: now,
  };

  try {
    await saveCoin(stats);
    return NextResponse.json({ saved: stats.mint });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Write failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const mint = new URL(request.url).searchParams.get('mint');
  if (!mint) return NextResponse.json({ error: 'mint required' }, { status: 400 });
  try {
    await deleteCoin(mint);
    return NextResponse.json({ deleted: mint });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Delete failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
