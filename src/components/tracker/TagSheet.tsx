'use client';

import { useState } from 'react';
import type { TagType, TokenHolder } from '@/lib/tracker/types';

const OPTIONS: Array<{ tag: TagType; label: string; color: string }> = [
  { tag: 'insider', label: 'Insider', color: 'var(--red)' },
  { tag: 'outsider', label: 'Outsider', color: 'var(--green)' },
  { tag: 'lp', label: 'LP', color: 'var(--blue)' },
  { tag: 'untagged', label: 'Clear', color: 'var(--text-dim)' },
];

export function TagSheet({
  holder,
  onClose,
  onApply,
  onOpenHistory,
}: {
  holder: TokenHolder;
  onClose: () => void;
  onApply: (tag: TagType, label?: string, notes?: string) => void | Promise<void>;
  onOpenHistory?: () => void;
}) {
  const [label, setLabel] = useState(holder.label ?? '');
  const [notes, setNotes] = useState(holder.notes ?? '');
  const [busy, setBusy] = useState(false);

  const apply = async (tag: TagType) => {
    setBusy(true);
    await onApply(tag, label.trim() || undefined, notes.trim() || undefined);
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <div
        className="rise relative w-full rounded-t-3xl border-t hairline bg-[var(--surface)] px-4 pt-4"
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
      >
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-white/20" />

        <div className="mb-3">
          <div className="font-mono text-[13px] break-all">{holder.ownerAddress}</div>
          <div className="tnum mt-1 text-[12px] text-[var(--text-dim)]">
            {holder.percentOfTotal.toFixed(3)}% of supply · rank {holder.rank}
          </div>
        </div>

        <label className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-dim)]">
          Group label
        </label>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Baojin Mex 35"
          className="mt-1.5 w-full rounded-xl bg-[var(--surface-2)] px-3 py-3 text-[15px] outline-none placeholder:text-[var(--text-dim)]"
        />

        <label className="mt-3 block text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-dim)]">
          Notes
        </label>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="optional"
          className="mt-1.5 w-full rounded-xl bg-[var(--surface-2)] px-3 py-3 text-[15px] outline-none placeholder:text-[var(--text-dim)]"
        />

        <div className="mt-4 grid grid-cols-2 gap-2">
          {OPTIONS.map((o) => (
            <button
              key={o.tag}
              type="button"
              disabled={busy}
              onClick={() => apply(o.tag)}
              className="min-h-[50px] rounded-2xl text-[15px] font-semibold transition active:scale-[0.98] disabled:opacity-50"
              style={{ background: `${o.color}22`, color: o.color }}
            >
              {o.label}
            </button>
          ))}
        </div>

        {onOpenHistory && (
          <button
            type="button"
            onClick={onOpenHistory}
            className="mt-2 min-h-[48px] w-full rounded-2xl bg-[var(--surface-2)] text-[15px] font-semibold text-[var(--blue)]"
          >
            View trade history
          </button>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-2 min-h-[48px] w-full rounded-2xl bg-[var(--surface-2)] text-[15px] font-medium text-[var(--text-dim)]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
