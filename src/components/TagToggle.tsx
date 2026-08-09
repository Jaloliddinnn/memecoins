'use client';

import { useState, useTransition } from 'react';
import type { TagType } from '@/types';

const TAG_STYLES: Record<TagType, string> = {
  insider: 'bg-insider/20 text-insider border-insider',
  outsider: 'bg-outsider/20 text-outsider border-outsider',
  mev_bot: 'bg-mevbot/20 text-mevbot border-mevbot',
};

const TAG_LABELS: Record<TagType, string> = {
  insider: 'Insider',
  outsider: 'Outsider',
  mev_bot: 'MEV/Bot',
};

interface TagToggleProps {
  walletAddress: string;
  currentTag: TagType | null;
  onTagged?: (tag: TagType | null) => void;
}

/**
 * The 3-way [Insider] [Outsider] [MEV/Bot] toggle next to each holder row.
 * Clicking the already-active tag clears it; clicking another tag re-tags
 * the wallet. POSTs straight to /api/tag, which upserts into
 * tagged_wallets — every future scan of any token that includes this
 * wallet will pick the tag back up automatically.
 */
export function TagToggle({ walletAddress, currentTag, onTagged }: TagToggleProps) {
  const [tag, setTag] = useState<TagType | null>(currentTag);
  const [isPending, startTransition] = useTransition();

  function handleClick(next: TagType) {
    const resolved = tag === next ? null : next;
    setTag(resolved);
    startTransition(async () => {
      try {
        if (resolved === null) {
          await fetch(`/api/tag?walletAddress=${walletAddress}`, { method: 'DELETE' });
        } else {
          await fetch('/api/tag', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ walletAddress, tagType: resolved }),
          });
        }
        onTagged?.(resolved);
      } catch {
        setTag(currentTag); // revert on failure
      }
    });
  }

  return (
    <div className="flex gap-1" aria-busy={isPending}>
      {(Object.keys(TAG_LABELS) as TagType[]).map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => handleClick(t)}
          disabled={isPending}
          className={`rounded border px-2 py-0.5 text-xs transition-opacity disabled:opacity-50 ${
            tag === t ? TAG_STYLES[t] : 'border-zinc-700 text-zinc-500 hover:border-zinc-500'
          }`}
        >
          {TAG_LABELS[t]}
        </button>
      ))}
    </div>
  );
}
