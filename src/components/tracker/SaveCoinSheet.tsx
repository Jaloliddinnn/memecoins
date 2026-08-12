'use client';

import { useEffect, useState } from 'react';
import type { CoinOutcome, ScanResult } from '@/lib/tracker/types';

const OUTCOMES: Array<{ id: CoinOutcome; label: string; color: string }> = [
  { id: 'pumped', label: 'Pumped', color: 'var(--green)' },
  { id: 'dumped', label: 'Dumped', color: 'var(--red)' },
  { id: 'pump_and_dump', label: 'Pump & dump', color: 'var(--amber)' },
  { id: 'neutral', label: 'Neutral', color: 'var(--text-dim)' },
];

export function SaveCoinSheet({
  scan,
  onClose,
  onSaved,
}: {
  scan: ScanResult;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [outcome, setOutcome] = useState<CoinOutcome>('neutral');
  const [group, setGroup] = useState(scan.groupsPresent[0]?.label ?? '');
  const [groups, setGroups] = useState<string[]>([]);
  const [peak, setPeak] = useState(String(Math.round(scan.metadata.marketCapUsd || 0)));
  const [duration, setDuration] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/tracker/groups')
      .then((r) => r.json())
      .then((j) => setGroups((j.groups ?? []).map((g: { label: string }) => g.label)))
      .catch(() => undefined);
  }, []);

  const save = async () => {
    setBusy(true);
    setError(null);
    const m = scan.metrics;
    try {
      const res = await fetch('/api/tracker/coins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mint: scan.metadata.mint,
          name: scan.metadata.name,
          symbol: scan.metadata.symbol,
          walletGroup: group.trim() || undefined,
          outcome,
          logoURI: scan.metadata.logoURI,
          marketCapUsd: scan.metadata.marketCapUsd,
          maxMarketCapUsd: Number(peak) || scan.metadata.marketCapUsd,
          durationMinutes: Number(duration) || 0,
          insiderCount: m.insiderCount,
          insiderPercent: m.insiderPercent,
          insiderSol: m.insiderSol,
          outsiderCount: m.outsiderCount,
          outsiderPercent: m.outsiderPercent,
          lpSol: m.lpSol,
          lpPercent: m.lpPercent,
          holderCount: scan.holders.length,
          priceUsd: scan.metadata.priceUsd,
          liquiditySol: scan.metadata.liquiditySol,
          totalSupply: scan.metadata.totalSupply,
          devAddress: scan.metadata.creatorAddress,
          isPumpFun: scan.metadata.isPumpFun ?? false,
          notes: notes.trim() || undefined,
          snapshotAt: scan.scannedAt,
        }),
      });
      const json = await res.json();
      if (!res.ok) setError(json.error ?? 'Save failed');
      else onSaved(`Saved ${scan.metadata.symbol || 'coin'} to ${group || 'ungrouped'}`);
    } catch {
      setError('Network error');
    } finally {
      setBusy(false);
    }
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
        className="rise relative max-h-[88dvh] w-full overflow-y-auto rounded-t-3xl border-t hairline bg-[var(--surface)] px-4 pt-4"
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
      >
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-white/20" />
        <div className="mb-3 text-[17px] font-semibold">
          Save {scan.metadata.symbol || 'coin'}
        </div>

        <label className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-dim)]">
          Outcome
        </label>
        <div className="mt-1.5 grid grid-cols-2 gap-2">
          {OUTCOMES.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => setOutcome(o.id)}
              className="min-h-[46px] rounded-xl text-[14px] font-semibold transition"
              style={{
                background: outcome === o.id ? `${o.color}26` : 'var(--surface-2)',
                color: outcome === o.id ? o.color : 'var(--text-dim)',
              }}
            >
              {o.label}
            </button>
          ))}
        </div>

        <label className="mt-3 block text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-dim)]">
          Group
        </label>
        <input
          value={group}
          onChange={(e) => setGroup(e.target.value)}
          list="tracker-groups"
          placeholder="e.g. Pochi Bin 30"
          className="mt-1.5 w-full rounded-xl bg-[var(--surface-2)] px-3 py-3 text-[15px] outline-none placeholder:text-[var(--text-dim)]"
        />
        <datalist id="tracker-groups">
          {groups.map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-dim)]">
              Peak mcap $
            </label>
            <input
              value={peak}
              onChange={(e) => setPeak(e.target.value)}
              inputMode="numeric"
              className="tnum mt-1.5 w-full rounded-xl bg-[var(--surface-2)] px-3 py-3 text-[15px] outline-none"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-dim)]">
              Duration (min)
            </label>
            <input
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              inputMode="numeric"
              placeholder="0"
              className="tnum mt-1.5 w-full rounded-xl bg-[var(--surface-2)] px-3 py-3 text-[15px] outline-none placeholder:text-[var(--text-dim)]"
            />
          </div>
        </div>

        <label className="mt-3 block text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-dim)]">
          Notes
        </label>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="what happened"
          className="mt-1.5 w-full rounded-xl bg-[var(--surface-2)] px-3 py-3 text-[15px] outline-none placeholder:text-[var(--text-dim)]"
        />

        {error && (
          <p className="mt-3 text-[12.5px]" style={{ color: 'var(--red)' }}>
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="mt-4 min-h-[52px] w-full rounded-2xl bg-[var(--blue)] text-[16px] font-semibold text-white disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save to database'}
        </button>
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
