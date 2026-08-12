import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    return NextResponse.json({ error: 'Missing DATABASE_URL' }, { status: 500 });
  }

  const sql = neon(url);

  try {
    await sql`ALTER TABLE coin_stats ADD COLUMN IF NOT EXISTS entry_points text;`;
    await sql`ALTER TABLE coin_stats ADD COLUMN IF NOT EXISTS dip_mcap text;`;
    
    return NextResponse.json({ success: true, message: 'Migration applied successfully' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Migration failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
