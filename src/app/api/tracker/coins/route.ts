import { NextResponse } from 'next/server';
import { deleteCoin, listCoins, saveCoin, updateCoinFields } from '@/lib/tracker/db';
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

/**
 * Edit the hand-entered fields on an already-saved coin, without re-scanning.
 * Only the keys present in the body are touched — see `updateCoinFields`.
 */
export async function PATCH(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const mint = String(body.mint ?? '').trim();
  if (!mint) return NextResponse.json({ error: 'mint required' }, { status: 400 });

  const patch: Partial<CoinStats> = {};

  if ('outcome' in body) {
    const outcome = body.outcome as CoinOutcome;
    if (!OUTCOMES.includes(outcome)) {
      return NextResponse.json({ error: 'Invalid outcome' }, { status: 400 });
    }
    patch.outcome = outcome;
  }
  if ('walletGroup' in body) patch.walletGroup = String(body.walletGroup ?? '').trim();
  if ('entryPoints' in body) patch.entryPoints = String(body.entryPoints ?? '').trim();
  if ('dipMcap' in body) patch.dipMcap = String(body.dipMcap ?? '').trim();
  if ('notes' in body) patch.notes = String(body.notes ?? '').trim();

  // Numbers are stored as numbers: a blank field means zero, not null, so the
  // list's sorting and peak arithmetic never meet a NaN.
  if ('maxMarketCapUsd' in body) {
    const n = Number(body.maxMarketCapUsd);
    if (!Number.isFinite(n) || n < 0) {
      return NextResponse.json({ error: 'Peak market cap must be a number' }, { status: 400 });
    }
    patch.maxMarketCapUsd = n;
  }
  if ('durationMinutes' in body) {
    const n = Number(body.durationMinutes);
    if (!Number.isFinite(n) || n < 0) {
      return NextResponse.json({ error: 'Duration must be a number' }, { status: 400 });
    }
    patch.durationMinutes = Math.round(n);
  }

  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  try {
    const found = await updateCoinFields(mint, patch);
    if (!found) return NextResponse.json({ error: 'Coin not found' }, { status: 404 });
    return NextResponse.json({ updated: mint, patch });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Update failed';
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
