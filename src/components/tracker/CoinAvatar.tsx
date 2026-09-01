'use client';

import { useState } from 'react';

/**
 * Renders a coin's logo, falling back to letter initials when the URL is
 * missing OR fails to load.
 *
 * `logoURI` being a non-empty string was previously enough to pick the
 * `<img>` branch, with no `onError` handler — so a dead/expired IPFS link,
 * a hotlink-blocked CDN, or (before the ipfs:// normalization fix) a raw
 * `ipfs://` URI all rendered as a blank circle instead of falling back to
 * the initials, since the failure happens after render, in the browser's
 * own image fetch.
 */
export function CoinAvatar({
  logoURI,
  symbol,
  name,
  className = 'h-10 w-10 text-[12px]',
}: {
  logoURI?: string;
  symbol?: string;
  name?: string;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);

  if (!logoURI || broken) {
    const letters =
      symbol && symbol !== '???'
        ? symbol.slice(0, 2)
        : name && name !== 'Unknown'
          ? name.slice(0, 2)
          : '?';
    return (
      <div
        className={`${className} shrink-0 rounded-full bg-[var(--surface-2)] flex items-center justify-center font-bold text-[var(--text-dim)] uppercase`}
      >
        {letters}
      </div>
    );
  }

  return (
    <img
      src={logoURI}
      alt=""
      onError={() => setBroken(true)}
      /* pump.fun logos are full-size uploads (~1-2 MB) served off a public
         IPFS gateway, so a long saved-coins list would otherwise fetch tens
         of megabytes before the first row is even scrolled to. */
      loading="lazy"
      decoding="async"
      className={`${className} shrink-0 rounded-full object-cover bg-[var(--surface-2)]`}
    />
  );
}
