'use client';

import { useState } from 'react';

interface TimeTravelPickerProps {
  onSelect: (unixSeconds: number | null) => void;
}

/**
 * Lets the user pick a past UTC timestamp ("right before a dump") instead
 * of scanning live. Emits null to go back to live mode.
 */
export function TimeTravelPicker({ onSelect }: TimeTravelPickerProps) {
  const [enabled, setEnabled] = useState(false);
  const [value, setValue] = useState('');

  return (
    <div className="flex items-center gap-2 text-sm text-zinc-400">
      <label className="flex items-center gap-1.5">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            setEnabled(e.target.checked);
            if (!e.target.checked) onSelect(null);
          }}
        />
        Time-Travel Mode
      </label>
      {enabled && (
        <input
          type="datetime-local"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            const ms = Date.parse(`${e.target.value}Z`);
            if (!Number.isNaN(ms)) onSelect(Math.floor(ms / 1000));
          }}
          className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-100"
        />
      )}
    </div>
  );
}
