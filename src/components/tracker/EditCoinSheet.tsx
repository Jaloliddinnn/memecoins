'use client';

import { useEffect, useMemo, useState } from 'react';
import type { CoinOutcome, CoinStats } from '@/lib/tracker/types';
import { Sheet } from './Sheet';
import {
  entryMultiples,
  formatEntry,
  formatMultiple,
  multipleColor,
} from '@/lib/tracker/entryMultiple';

const OUTCOMES: Array<{ id: CoinOutcome; label: string; color: string }> = [
  { id: 'pumped', label: 'Pumped', color: 'var(--green)' },
  { id: 'dumped', label: 'Dumped', color: 'var(--red)' },
  { id: 'pump_and_dump', label: 'P&D', color: 'var(--amber)' },
  { id: 'neutral', label: 'Neutral', color: 'var(--text-dim)' },
];

function money(v: number): string {
  if (!Number.isFinite(v) || v <= 0) return '—';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${Math.round(v).toLocaleString()}`;
  return `$${Math.round(v)}`;
}

const INPUT =
  'w-full rounded-xl border hairline bg-[var(--surface-2)] px-4 py-3 text-[14.5px] outline-none transition focus:border-[var(--blue)] focus:bg-[var(--surface)] placeholder:text-[var(--text-dim)]';

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1.5 ml-1 block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[var(--text-dim)]">
      {children}
    </label>
  );
}

/**
 * Everything the operator typed when saving a coin, editable again after the
 * fact — an outcome you called too early, a group you only identified later,
 * an entry you want to correct. The scan-derived figures below the form stay
 * read-only: they come from a scan and a Rescan is what updates them.
 */
export function EditCoinSheet({
  coin,
  onClose,
  onSaved,
}: {
  coin: CoinStats;
  onClose: () => void;
  onSaved: (updated: CoinStats, message: string) => void;
}) {
  const [outcome, setOutcome] = useState<CoinOutcome>(coin.outcome);
  const [group, setGroup] = useState(coin.walletGroup ?? '');
  const [peak, setPeak] = useState(String(coin.maxMarketCapUsd || ''));
  const [duration, setDuration] = useState(String(coin.durationMinutes || ''));
  const [entryPoints, setEntryPoints] = useState(coin.entryPoints ?? '');
  const [dipMcap, setDipMcap] = useState(coin.dipMcap ?? '');
  const [notes, setNotes] = useState(coin.notes ?? '');

  const [groups, setGroups] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/tracker/groups')
      .then((r) => r.json())
      .then((j) => setGroups((j.groups ?? []).map((g: { label: string }) => g.label)))
      .catch(() => undefined);
  }, []);

  const patch = useMemo(() => {
    const next: Partial<CoinStats> = {};
    if (outcome !== coin.outcome) next.outcome = outcome;
    if (group.trim() !== (coin.walletGroup ?? '')) next.walletGroup = group.trim();
    if (entryPoints.trim() !== (coin.entryPoints ?? '')) next.entryPoints = entryPoints.trim();
    if (dipMcap.trim() !== (coin.dipMcap ?? '')) next.dipMcap = dipMcap.trim();
    if (notes.trim() !== (coin.notes ?? '')) next.notes = notes.trim();
    if ((Number(peak) || 0) !== coin.maxMarketCapUsd) next.maxMarketCapUsd = Number(peak) || 0;
    if ((Number(duration) || 0) !== coin.durationMinutes) {
      next.durationMinutes = Number(duration) || 0;
    }
    return next;
  }, [outcome, group, peak, duration, entryPoints, dipMcap, notes, coin]);

  const dirty = Object.keys(patch).length > 0;

  /** Recomputed from the draft, so the X updates as the entry or peak is edited. */
  const multiples = entryMultiples(entryPoints, Number(peak) || 0);

  const save = async () => {
    if (!dirty) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/tracker/coins', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mint: coin.mint, ...patch }),
      });
      const json = await res.json();
      if (!res.ok) setError(json.error ?? 'Update failed');
      else onSaved({ ...coin, ...patch }, `Updated ${coin.symbol || 'coin'}`);
    } catch {
      setError('Network error — try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      title={coin.symbol || coin.name || 'Unknown Coin'}
      subtitle={coin.mint}
      onClose={onClose}
    >
      <div className="space-y-4 pb-2">
        <div>
          <Label>Outcome</Label>
          <div className="grid grid-cols-4 gap-1.5">
            {OUTCOMES.map((o) => {
              const active = outcome === o.id;
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setOutcome(o.id)}
                  className="min-h-[40px] rounded-xl text-[11.5px] font-semibold transition hover:opacity-80"
                  style={{
                    background: active ? `${o.color}26` : 'var(--surface-2)',
                    color: active ? o.color : 'var(--text-dim)',
                    border: active ? `1px solid ${o.color}40` : '1px solid transparent',
                  }}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <Label>Group</Label>
          <input
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            list="edit-coin-groups"
            placeholder="e.g. Pochi Bin 30"
            className={INPUT}
          />
          <datalist id="edit-coin-groups">
            {groups.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Peak Mcap $</Label>
            <input
              value={peak}
              onChange={(e) => setPeak(e.target.value)}
              inputMode="numeric"
              placeholder="0"
              className={`tnum ${INPUT}`}
            />
          </div>
          <div>
            <Label>Duration (min)</Label>
            <input
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              inputMode="numeric"
              placeholder="0"
              className={`tnum ${INPUT}`}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Possible Entry Points</Label>
            <input
              value={entryPoints}
              onChange={(e) => setEntryPoints(e.target.value)}
              placeholder="e.g. 15k, 20k"
              className={INPUT}
            />
          </div>
          <div>
            <Label>Dip After Migration</Label>
            <input
              value={dipMcap}
              onChange={(e) => setDipMcap(e.target.value)}
              placeholder="e.g. 5k or $10k"
              className={INPUT}
            />
          </div>
        </div>

        {multiples.length > 0 && (
          <div className="overflow-hidden rounded-2xl border hairline">
            <div className="border-b hairline bg-[var(--surface-2)] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--text-dim)]">
              Entry → peak
            </div>
            <ul className="divide-y divide-[var(--hairline)]">
              {multiples.map((m) => (
                <li key={m.entry} className="flex items-center justify-between px-4 py-2.5">
                  <span className="tnum text-[13px] text-[var(--text-dim)]">
                    {formatEntry(m.entry)} → {money(Number(peak) || 0)}
                  </span>
                  <span
                    className="tnum text-[16px] font-bold"
                    style={{ color: multipleColor(m.x) }}
                  >
                    {formatMultiple(m.x)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <Label>Notes</Label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="what happened"
            rows={3}
            className={`resize-none ${INPUT}`}
          />
        </div>

        {/* Scan-derived — changed by a Rescan, not by hand. */}
        <div className="overflow-hidden rounded-2xl border hairline">
          <div className="border-b hairline bg-[var(--surface-2)] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--text-dim)]">
            From the scan
          </div>
          <div className="grid grid-cols-3 gap-2 px-4 py-3">
            {[
              { l: 'Holders', v: coin.holderCount.toLocaleString() },
              { l: 'Market cap', v: money(coin.marketCapUsd) },
              { l: 'Liquidity', v: `${coin.liquiditySol.toFixed(1)} SOL` },
              { l: 'Insider', v: `${coin.insiderPercent.toFixed(1)}%`, c: 'var(--red)' },
              { l: 'Outsider', v: `${coin.outsiderPercent.toFixed(1)}%`, c: 'var(--green)' },
              { l: 'LP', v: `${coin.lpPercent.toFixed(1)}%`, c: 'var(--blue)' },
            ].map((s) => (
              <div key={s.l}>
                <div className="text-[10px] uppercase tracking-[0.05em] text-[var(--text-dim)]">
                  {s.l}
                </div>
                <div className="tnum text-[14px] font-semibold" style={{ color: s.c ?? 'var(--text)' }}>
                  {s.v}
                </div>
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-[var(--red)]/20 bg-[var(--red)]/10 p-3 text-[13px] font-medium text-[var(--red)]">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between px-1 text-[11px] text-[var(--text-dim)]">
          <span>Saved: {new Date(coin.snapshotAt || coin.createdAt || Date.now()).toLocaleString()}</span>
          {coin.isPumpFun && <span>Pump.fun launch</span>}
        </div>

        <button
          type="button"
          onClick={save}
          disabled={busy || !dirty}
          className="flex min-h-[50px] w-full items-center justify-center rounded-2xl bg-[var(--blue)] text-[15px] font-semibold text-white transition active:scale-[0.985] disabled:bg-[var(--surface-2)] disabled:text-[var(--text-dim)]"
        >
          {busy ? 'Saving…' : dirty ? 'Save changes' : 'No changes'}
        </button>
      </div>
    </Sheet>
  );
}
