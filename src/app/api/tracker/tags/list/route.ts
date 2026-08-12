import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import type { TagType, WalletTag } from '@/lib/tracker/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Paged listing for the wallet manager, and a full dump for export.
 * 24k rows is too many to ship to a phone in one response, so the UI pages it.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const label = params.get('label')?.trim();
  const search = params.get('q')?.trim();
  const all = params.get('all') === '1';
  const limit = all ? 100_000 : Math.min(Number(params.get('limit') ?? 100), 500);
  const offset = Number(params.get('offset') ?? 0);

  const url = process.env.DATABASE_URL;
  if (!url) return NextResponse.json({ error: 'Missing DATABASE_URL' }, { status: 500 });

  try {
    const sql = neon(url);
    const where: string[] = [];
    const args: unknown[] = [];
    if (label) {
      args.push(label);
      where.push(`label = $${args.length}`);
    }
    if (search) {
      args.push(`%${search}%`);
      where.push(`(address ILIKE $${args.length} OR label ILIKE $${args.length})`);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countRows = (await sql(
      `SELECT COUNT(*)::int AS n FROM tagged_wallets ${clause}`,
      args
    )) as Array<{ n: number }>;

    args.push(limit, offset);
    const rows = (await sql(
      `SELECT address, tag, label, notes, token_mint, created_at, updated_at
         FROM tagged_wallets ${clause}
        ORDER BY updated_at DESC NULLS LAST
        LIMIT $${args.length - 1} OFFSET $${args.length}`,
      args
    )) as Array<Record<string, unknown>>;

    const wallets: WalletTag[] = rows.map((r) => ({
      address: String(r.address),
      tag: (r.tag as TagType) ?? 'untagged',
      label: (r.label as string) ?? undefined,
      notes: (r.notes as string) ?? undefined,
      tokenMint: (r.token_mint as string) ?? undefined,
      createdAt: r.created_at ? Number(r.created_at) : undefined,
      updatedAt: r.updated_at ? Number(r.updated_at) : undefined,
    }));

    return NextResponse.json({ total: Number(countRows[0]?.n ?? 0), wallets });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Query failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
