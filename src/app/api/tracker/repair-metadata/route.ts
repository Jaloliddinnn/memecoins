import { NextResponse } from 'next/server';
import { listCoins, saveCoin } from '@/lib/tracker/db';
import { getTokenMetadata } from '@/lib/tracker/holders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/**
 * Every coin costs several network round trips (DexScreener, pump.fun v3,
 * the mint account, sometimes an IPFS metadata fetch), so a backlog of a few
 * dozen coins does not fit in the old 60s budget.
 */
export const maxDuration = 300;

/** Bounded parallelism — enough to finish, polite enough not to get rate limited. */
const CONCURRENCY = 4;

export async function GET() {
  try {
    const coins = await listCoins(1000);
    const toRepair = coins.filter(
      (c) => c.name === 'Unknown' || c.symbol === '???' || !c.logoURI || c.logoURI.trim() === ''
    );

    const results: Array<{ mint: string; name: string; symbol: string; logoURI?: string }> = [];
    let fixedCount = 0;
    let cursor = 0;

    async function worker() {
      for (;;) {
        const index = cursor++;
        const c = toRepair[index];
        if (!c) return;

        try {
          const meta = await getTokenMetadata(c.mint);

          const isFixed =
            (meta.name !== 'Unknown' && meta.name !== c.name) ||
            (meta.symbol !== '???' && meta.symbol !== c.symbol) ||
            (!!meta.logoURI && meta.logoURI !== c.logoURI);

          if (!isFixed) continue;

          if (meta.name !== 'Unknown') c.name = meta.name;
          if (meta.symbol !== '???') c.symbol = meta.symbol;
          if (meta.logoURI) c.logoURI = meta.logoURI;

          await saveCoin(c);
          fixedCount++;
          results.push({ mint: c.mint, name: c.name, symbol: c.symbol, logoURI: c.logoURI });
        } catch {
          // One unresolvable coin must not abort the whole sweep.
        }
      }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    return NextResponse.json({
      message: `Checked ${coins.length} coins · ${toRepair.length} missing metadata · fixed ${fixedCount}.`,
      fixed: results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Repair failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
