import { NextRequest, NextResponse } from 'next/server';
import { getClusterTrackRecord } from '@/lib/analysis/clusterScore';

/**
 * GET /api/clusters/:label
 * Returns a wallet cluster's historical pump/dump track record — the
 * core "have they run coins up before, or do they always drain to zero"
 * lookup, keyed by the cluster's human-readable label (matches
 * tagged_wallets.label / coin_stats.wallet_group in your data, e.g.
 * "Pochi Bin 30"). URL-encode the label when calling this route.
 */
export async function GET(_req: NextRequest, { params }: { params: { label: string } }) {
  const track = await getClusterTrackRecord(decodeURIComponent(params.label));
  if (!track) {
    return NextResponse.json({ error: 'No coin_stats history for this cluster label' }, { status: 404 });
  }
  return NextResponse.json(track);
}
