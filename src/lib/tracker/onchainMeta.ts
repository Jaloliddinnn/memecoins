/**
 * Token metadata read straight off the mint account — no vendor API involved.
 *
 * Every hosted source we use can and does disappear: DexScreener drops a pair
 * the moment liquidity is pulled (it returns `pairs: null`, not just a missing
 * image), and pump.fun retired `frontend-api.pump.fun` outright — it now
 * answers HTTP 530, which is what silently blanked every newly-saved coin's
 * logo. The chain itself is the one source that cannot be switched off.
 *
 * Current pump.fun mints are SPL Token-2022 and carry their metadata INLINE in
 * the mint account via the `tokenMetadata` extension — there is no legacy
 * Metaplex metadata PDA to read (deriving one returns a null account). The
 * extension holds name, symbol and a `uri` pointing at the metadata JSON,
 * whose `image` field is the logo.
 */

import { PublicKey } from '@solana/web3.js';
import { getConnection } from '@/lib/solana/connection';
import { normalizeImageUri } from './image';

export interface OnChainMeta {
  name?: string;
  symbol?: string;
  logoURI?: string;
}

interface TokenMetadataExtension {
  extension?: string;
  state?: { name?: string; symbol?: string; uri?: string };
}

/**
 * Returns whatever the mint account itself can tell us. Never throws — a
 * missing extension, an unreachable IPFS gateway or a malformed JSON body all
 * just mean "no answer from this source", and the caller falls through.
 */
export async function onChainTokenMeta(mint: string): Promise<OnChainMeta> {
  try {
    const conn = getConnection();
    const info = await conn.getParsedAccountInfo(new PublicKey(mint));
    const data = info.value?.data;
    if (!data || !('parsed' in data)) return {};

    const extensions = (data.parsed as { info?: { extensions?: TokenMetadataExtension[] } })?.info
      ?.extensions;
    const state = extensions?.find((e) => e.extension === 'tokenMetadata')?.state;
    if (!state) return {};

    const out: OnChainMeta = {};
    if (state.name) out.name = state.name;
    if (state.symbol) out.symbol = state.symbol;

    // The `uri` is the metadata JSON, not the image — one more hop to get the
    // logo. Bounded, because IPFS gateways are routinely slow or down.
    const uri = normalizeImageUri(state.uri);
    if (!uri) return out;

    const res = await fetch(uri, {
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    });
    if (!res.ok) return out;

    const json = (await res.json()) as { image?: string; name?: string; symbol?: string };
    const image = normalizeImageUri(json?.image);
    if (image) out.logoURI = image;
    return out;
  } catch {
    return {};
  }
}
