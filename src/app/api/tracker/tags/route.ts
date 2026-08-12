import { NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import { countTags, deleteTag, saveTags } from '@/lib/tracker/db';
import type { TagType } from '@/lib/tracker/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID: TagType[] = ['insider', 'outsider', 'lp', 'untagged'];

export async function GET() {
  try {
    return NextResponse.json({ total: await countTags() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database unreachable';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let body: { addresses?: string[]; tag?: TagType; label?: string; notes?: string; tokenMint?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const addresses = (body.addresses ?? []).map((a) => a.trim()).filter(Boolean);
  const tag = body.tag;
  if (!addresses.length) return NextResponse.json({ error: 'No addresses given' }, { status: 400 });
  if (!tag || !VALID.includes(tag)) {
    return NextResponse.json({ error: 'Pick a valid tag' }, { status: 400 });
  }
  for (const a of addresses) {
    try {
      new PublicKey(a);
    } catch {
      return NextResponse.json({ error: `Not a valid Solana address: ${a}` }, { status: 400 });
    }
  }

  try {
    const saved = await saveTags(
      addresses.map((address) => ({
        address,
        tag,
        label: body.label?.trim() || undefined,
        notes: body.notes?.trim() || undefined,
        tokenMint: body.tokenMint,
      }))
    );
    return NextResponse.json({ saved });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Write failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const address = new URL(request.url).searchParams.get('address');
  if (!address) return NextResponse.json({ error: 'address required' }, { status: 400 });
  try {
    await deleteTag(address);
    return NextResponse.json({ deleted: address });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Delete failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
