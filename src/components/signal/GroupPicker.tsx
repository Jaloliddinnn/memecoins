'use client';

import type { GroupId } from '@/lib/signals/groups';

interface Option {
  id: GroupId;
  short: string;
  funding: string;
}

const OPTIONS: Option[] = [
  { id: 'jinpachi', short: 'JINPACHI', funding: 'Bin 20' },
  { id: 'baojin', short: 'Baojin', funding: 'Mex 35' },
  { id: 'pochi', short: 'Pochi', funding: 'Bin 30' },
];

export function GroupPicker({
  value,
  onChange,
  disabled,
}: {
  value: GroupId;
  onChange: (id: GroupId) => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Scam group"
      className="grid grid-cols-3 gap-1 rounded-2xl bg-[var(--surface-2)] p-1"
    >
      {OPTIONS.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(option.id)}
            className={`flex min-h-[54px] flex-col items-center justify-center rounded-xl px-1 transition-all duration-200 disabled:opacity-40 ${
              active
                ? 'bg-[var(--blue)] text-white shadow-lg shadow-[var(--blue)]/25'
                : 'text-[var(--text-dim)] active:bg-white/5'
            }`}
          >
            <span className="text-[13px] font-semibold leading-tight">
              {option.short}
            </span>
            <span
              className={`text-[10px] leading-tight ${active ? 'text-white/75' : 'text-[var(--text-dim)]/70'}`}
            >
              {option.funding}
            </span>
          </button>
        );
      })}
    </div>
  );
}
