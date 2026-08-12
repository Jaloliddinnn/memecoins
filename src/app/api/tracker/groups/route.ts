import { NextResponse } from 'next/server';
import { listGroups } from '@/lib/tracker/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json({ groups: await listGroups() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database unreachable';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
