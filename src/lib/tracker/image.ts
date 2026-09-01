/**
 * Image URL normalisation.
 *
 * Two separate problems, both of which end as a blank avatar:
 *
 * 1. Browsers cannot fetch `ipfs://` or `ar://` — there is no protocol handler.
 *    The Helius DAS fallback reads `content.files[0].uri` off on-chain
 *    metadata, which is exactly the kind of field that is still a raw
 *    `ipfs://<cid>`.
 *
 * 2. Public IPFS gateways vary wildly. Measured on one pump.fun logo (1.7 MB):
 *    pump.mypinata.cloud 1.9s, ipfs.io 6.9s, gateway.pinata.cloud timed out,
 *    cloudflare-ipfs.com refused the connection outright. A logo stored
 *    against a slow or dead gateway is a logo the user never sees, so every
 *    IPFS URL is rewritten to the one gateway measured to be fast — pump.fun's
 *    own, which is where these files are pinned in the first place.
 */

/** Fastest gateway measured, and the origin pump.fun pins to. */
export const IPFS_GATEWAY = 'https://pump.mypinata.cloud/ipfs';

/** `/ipfs/<cid>[/path]` on any host, so a gateway swap keeps sub-paths intact. */
const GATEWAY_PATH = /\/ipfs\/([^?#]+)/i;

export function normalizeImageUri(uri?: string | null): string | undefined {
  const trimmed = uri?.trim();
  if (!trimmed) return undefined;

  if (trimmed.startsWith('ipfs://')) {
    return `${IPFS_GATEWAY}/${trimmed.slice('ipfs://'.length).replace(/^ipfs\//, '')}`;
  }
  if (trimmed.startsWith('ar://')) {
    return `https://arweave.net/${trimmed.slice('ar://'.length)}`;
  }

  // Already an https gateway URL: keep the CID, standardise the host.
  if (/^https?:\/\//i.test(trimmed)) {
    const match = trimmed.match(GATEWAY_PATH);
    if (match?.[1]) return `${IPFS_GATEWAY}/${match[1]}`;
    return trimmed;
  }

  return trimmed;
}

/** True when the URL is IPFS content already pointed at the preferred gateway. */
export function isPreferredGateway(uri?: string | null): boolean {
  return Boolean(uri && uri.startsWith(`${IPFS_GATEWAY}/`));
}

/** True when the URL is IPFS content, wherever it is currently hosted. */
export function isIpfsUrl(uri?: string | null): boolean {
  return Boolean(uri && (uri.startsWith('ipfs://') || GATEWAY_PATH.test(uri)));
}
