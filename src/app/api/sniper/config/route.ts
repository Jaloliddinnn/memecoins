import { NextResponse } from 'next/server';
import {
  DEFAULT_CONFIG,
  configWarnings,
  getSniperConfig,
  saveSniperConfig,
  validateConfig,
  type SniperConfig,
} from '@/lib/tracker/sniperConfig';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The bot polls this endpoint; the phone panel writes to it.
 *
 * Both are gated on SNIPER_TOKEN when it is set. This endpoint controls how
 * much money a bot spends per trade, so an unauthenticated write is somebody
 * else setting your position size. Set the variable.
 */
function authorised(request: Request): boolean {
  const expected = process.env.SNIPER_TOKEN;
  if (!expected) return true;
  const header = request.headers.get('authorization') ?? '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
  const query = new URL(request.url).searchParams.get('token') ?? '';
  return bearer === expected || query === expected;
}

export async function GET(request: Request) {
  if (!authorised(request)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }
  try {
    const { config, updatedAt } = await getSniperConfig();
    return NextResponse.json({
      config,
      updatedAt,
      warnings: configWarnings(config),
      tokenRequired: Boolean(process.env.SNIPER_TOKEN),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not read the config';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!authorised(request)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  let body: Partial<SniperConfig>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const config: SniperConfig = { ...DEFAULT_CONFIG, ...body };
  config.targets = (config.targets ?? []).map((t) => String(t).trim()).filter(Boolean);

  const errors = validateConfig(config);
  if (errors.length) return NextResponse.json({ error: errors.join(' '), errors }, { status: 400 });

  try {
    const updatedAt = await saveSniperConfig(config);
    return NextResponse.json({ config, updatedAt, warnings: configWarnings(config) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not save the config';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
