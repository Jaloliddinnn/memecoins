import { NextResponse } from 'next/server';
import {
  addEvents,
  getStatus,
  listEvents,
  putStatus,
  type SniperEvent,
  type SniperStatus,
} from '@/lib/tracker/sniperStatus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorised(request: Request): boolean {
  const expected = process.env.SNIPER_TOKEN;
  if (!expected) return true;
  const header = request.headers.get('authorization') ?? '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
  const query = new URL(request.url).searchParams.get('token') ?? '';
  return bearer === expected || query === expected;
}

export async function GET(request: Request) {
  if (!authorised(request)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  try {
    const [status, events] = await Promise.all([getStatus(), listEvents(60)]);
    return NextResponse.json({
      status,
      events,
      // The bot heartbeats every 10s; 45s of silence means it is gone, not slow.
      alive: status ? Date.now() - status.seenAt < 45_000 : false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not read status';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!authorised(request)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  let body: { status?: Partial<SniperStatus>; events?: SniperEvent[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    if (body.status) await putStatus(body.status);
    if (body.events?.length) await addEvents(body.events);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not save status';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
