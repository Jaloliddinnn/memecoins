'use client';

import { useState } from 'react';
import { Sheet } from './Sheet';

const PRESETS = [
  { label: '15 min ago', mins: 15 },
  { label: '1 hour ago', mins: 60 },
  { label: '6 hours ago', mins: 360 },
  { label: '24 hours ago', mins: 1440 },
  { label: '3 days ago', mins: 4320 },
  { label: '7 days ago', mins: 10080 },
];

/** Local datetime string for the picker's default value. */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function TimeTravelSheet({
  onClose,
  onApply,
}: {
  onClose: () => void;
  onApply: (unixSeconds: number) => void;
}) {
  const [custom, setCustom] = useState(toLocalInput(new Date(Date.now() - 3600_000)));

  return (
    <Sheet
      title="Time travel"
      subtitle="Reconstruct the holder table at a past moment"
      onClose={onClose}
    >
      <p className="mb-3 text-[12.5px] leading-[1.5] text-[var(--text-dim)]">
        Solana has no “state at slot N” call, so this rewinds: it anchors on live
        balances, replays every transaction back to your target slot, and takes each
        account&apos;s pre-balance. Price and market cap come only from on-chain state at
        or before that slot — if any of it can&apos;t be resolved the scan fails rather
        than quietly showing you live numbers.
      </p>

      <div className="grid grid-cols-2 gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => onApply(Math.floor((Date.now() - p.mins * 60_000) / 1000))}
            className="min-h-[46px] rounded-xl bg-[var(--surface-2)] text-[13.5px] font-medium active:opacity-70"
          >
            {p.label}
          </button>
        ))}
      </div>

      <label className="mt-4 block text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-dim)]">
        Exact time
      </label>
      <input
        type="datetime-local"
        value={custom}
        max={toLocalInput(new Date())}
        onChange={(e) => setCustom(e.target.value)}
        className="mt-1.5 w-full rounded-xl bg-[var(--surface-2)] px-3 py-3 text-[15px] outline-none"
      />

      <button
        type="button"
        onClick={() => {
          const ms = new Date(custom).getTime();
          if (Number.isFinite(ms)) onApply(Math.floor(ms / 1000));
        }}
        className="mt-3 min-h-[52px] w-full rounded-2xl bg-[var(--blue)] text-[16px] font-semibold text-white"
      >
        Rewind to this moment
      </button>

      <p className="mt-3 text-[11px] leading-[1.5] text-[var(--text-dim)]">
        Cost scales with how busy the coin was, not with how far back you go: ~10
        minutes on a hot pool is about a minute of replay. If the window is too big
        for the RPC key it gives up after ~4 minutes and tells you the rate it
        managed — it will not hand you a half-replayed table.
      </p>
    </Sheet>
  );
}
