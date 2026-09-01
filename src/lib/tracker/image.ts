/**
 * Browsers cannot fetch `ipfs://` or `ar://` directly — there is no protocol
 * handler for either. DexScreener and the pump.fun API always hand back an
 * already-resolved `https://` URL, but the Helius DAS fallback in
 * `getTokenMetadata` (used when both of those come up empty) reads
 * `content.files[0].uri` straight off the asset's on-chain metadata, which is
 * exactly the kind of field that is still a raw `ipfs://<cid>` URI. That
 * renders as nothing at all — not a broken-image icon, just an empty circle,
 * which is why some saved coins showed no logo despite `logoURI` being set.
 */
export function normalizeImageUri(uri?: string | null): string | undefined {
  const trimmed = uri?.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith('ipfs://')) {
    return `https://ipfs.io/ipfs/${trimmed.slice('ipfs://'.length)}`;
  }
  if (trimmed.startsWith('ar://')) {
    return `https://arweave.net/${trimmed.slice('ar://'.length)}`;
  }
  return trimmed;
}
