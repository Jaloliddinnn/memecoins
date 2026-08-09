import { NextRequest, NextResponse } from 'next/server';
import { getClusterTrackRecord } from '@/lib/analysis/clusterScore';

/**
 * GET /api/clusters/:id
 * Returns a wallet cluster's historical pump/dump track record — the
 * core "have they run coins up before, or do they always drain to zero"
 * lookup surfaced in the dashboard's cluster risk panel.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const track = await getClusterTrackRecord(params.id);
  if (!track) {
    return NextResponse.json({ error: 'Cluster not found' }, { status: 404 });
  }
  return NextResponse.json(track);
}
