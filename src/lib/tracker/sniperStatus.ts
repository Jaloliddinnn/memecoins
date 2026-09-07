/**
 * Live status and event log for the sniper bot.
 *
 * The bot runs headless somewhere else — a laptop, a VPS, a Railway service.
 * It pushes here so the panel can show what it is doing without SSH, which
 * matters because the number that decides whether any of this works (the slot
 * delta) only appears in its logs.
 *
 * SERVER ONLY. Holds no secrets.
 */

import { neon } from '@neondatabase/serverless';

export interface SniperStatus {
  /** Wall clock of the bot's last heartbeat. */
  seenAt: number;
  mode: 'DRY' | 'LIVE';
  connected: boolean;
  wallet: string;
  balanceSol: number;
  targets: number;
  /** Buys attempted. */
  fired: number;
  /** Landed in the same slot as the target — the number that matters. */
  slot0: number;
  /** Landed a slot or more late. */
  late: number;
  /** Never landed at all. */
  missed: number;
  openPositions: number;
  realisedSol: number;
  feed: string;
  note?: string;
}

export interface SniperEvent {
  id?: number;
  at: number;
  kind: 'fire' | 'land' | 'late' | 'exit' | 'miss' | 'info' | 'error';
  mint?: string;
  message: string;
  data?: Record<string, unknown>;
}

function db() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Missing DATABASE_URL');
  return neon(url);
}

const num = (v: unknown, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

export async function getStatus(): Promise<SniperStatus | null> {
  const sql = db();
  const rows = (await sql('SELECT status, updated_at FROM sniper_status WHERE id = 1')) as Array<{
    status: unknown;
    updated_at: string | number;
  }>;
  const row = rows[0];
  if (!row) return null;
  return { ...(row.status as SniperStatus), seenAt: num(row.updated_at) };
}

export async function putStatus(status: Partial<SniperStatus>): Promise<number> {
  const sql = db();
  const now = Date.now();
  await sql(
    `INSERT INTO sniper_status (id, status, updated_at) VALUES (1, $1, $2)
     ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, updated_at = EXCLUDED.updated_at`,
    [JSON.stringify(status), now]
  );
  return now;
}

export async function listEvents(limit = 50): Promise<SniperEvent[]> {
  const sql = db();
  const rows = (await sql(
    'SELECT id, at, kind, mint, message, data FROM sniper_events ORDER BY at DESC, id DESC LIMIT $1',
    [Math.min(Math.max(limit, 1), 200)]
  )) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: num(r.id),
    at: num(r.at),
    kind: (r.kind as SniperEvent['kind']) ?? 'info',
    mint: (r.mint as string) ?? undefined,
    message: String(r.message ?? ''),
    data: (r.data as Record<string, unknown>) ?? undefined,
  }));
}

export async function addEvents(events: SniperEvent[]): Promise<number> {
  if (!events.length) return 0;
  const sql = db();
  for (const e of events.slice(0, 50)) {
    await sql('INSERT INTO sniper_events (at, kind, mint, message, data) VALUES ($1,$2,$3,$4,$5)', [
      e.at || Date.now(),
      e.kind || 'info',
      e.mint ?? null,
      String(e.message ?? '').slice(0, 500),
      e.data ? JSON.stringify(e.data) : null,
    ]);
  }
  // The feed is a rolling window, not an archive — the bot can emit thousands
  // of lines a day and nobody scrolls past the last few hundred.
  await sql(
    'DELETE FROM sniper_events WHERE id NOT IN (SELECT id FROM sniper_events ORDER BY at DESC, id DESC LIMIT 500)'
  );
  return events.length;
}
