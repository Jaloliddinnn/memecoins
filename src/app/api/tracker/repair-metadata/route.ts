import { NextResponse } from 'next/server';
import { listCoins, saveCoin } from '@/lib/tracker/db';
import { getTokenMetadata } from '@/lib/tracker/holders';
import { isIpfsUrl, isPreferredGateway, normalizeImageUri } from '@/lib/tracker/image';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** Re-resolving a backlog of coins costs several round trips each. */
export const maxDuration = 300;

const CONCURRENCY = 4;

/**
 * Does the URL actually serve bytes? A stored logo can be non-empty and still
 * dead — the previous sweep only looked for MISSING urls, so a row pointing at
 * a retired host or an unreachable gateway reported as "nothing to fix" while
 * the avatar stayed blank.
 */
async function loads(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      headers: { Range: 'bytes=0-0' },
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function GET() {
  try {
    const coins = await listCoins(1000);

    let rehosted = 0;
    let refetched = 0;
    let stillBroken = 0;
    const samples: Array<{ symbol: string; before?: string; after?: string; why: string }> = [];
    let cursor = 0;

    async function worker() {
      for (;;) {
        const c = coins[cursor++];
        if (!c) return;

        const before = c.logoURI;
        try {
          // 1. Cheapest fix first: the CID is fine, the gateway is not.
          //    Rewriting the host needs no network call at all.
          if (before && isIpfsUrl(before) && !isPreferredGateway(before)) {
            const rewritten = normalizeImageUri(before);
            if (rewritten && rewritten !== before) {
              c.logoURI = rewritten;
              await saveCoin(c);
              rehosted++;
              if (samples.length < 8) {
                samples.push({ symbol: c.symbol, before, after: rewritten, why: 'gateway rewritten' });
              }
              continue;
            }
          }

          // 2. Otherwise only re-resolve when something is actually wrong:
          //    no logo, unknown identity, or a URL that will not load.
          const needsWork =
            c.name === 'Unknown' ||
            c.symbol === '???' ||
            !before ||
            !before.trim() ||
            !(await loads(before));
          if (!needsWork) continue;

          const meta = await getTokenMetadata(c.mint);
          const changed =
            (meta.name !== 'Unknown' && meta.name !== c.name) ||
            (meta.symbol !== '???' && meta.symbol !== c.symbol) ||
            (!!meta.logoURI && meta.logoURI !== before);

          if (!changed) {
            stillBroken++;
            if (samples.length < 8) {
              samples.push({ symbol: c.symbol, before, why: 'no working logo found for this mint' });
            }
            continue;
          }

          if (meta.name !== 'Unknown') c.name = meta.name;
          if (meta.symbol !== '???') c.symbol = meta.symbol;
          if (meta.logoURI) c.logoURI = meta.logoURI;
          await saveCoin(c);
          refetched++;
          if (samples.length < 8) {
            samples.push({ symbol: c.symbol, before, after: c.logoURI, why: 'refetched' });
          }
        } catch {
          stillBroken++;
        }
      }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    const fixed = rehosted + refetched;
    return NextResponse.json({
      message:
        `Checked ${coins.length} · ${rehosted} re-hosted · ${refetched} refetched` +
        (stillBroken ? ` · ${stillBroken} still unresolved` : '') +
        ` · fixed ${fixed}.`,
      rehosted,
      refetched,
      stillBroken,
      samples,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Repair failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
