'use client';

import { useEffect, useState } from 'react';
import type { CoinOutcome, ScanResult } from '@/lib/tracker/types';
import { Sheet } from './Sheet';
import { entryMultiples, formatEntry, formatMultiple } from '@/lib/tracker/entryMultiple';

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
  const [dipMcap, setDipMcap] = useState('');
  const [entryPoints, setEntryPoints] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [peakBusy, setPeakBusy] = useState(false);
  const [peakNote, setPeakNote] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/tracker/groups')
      .then((r) => r.json())
      .then((j) => setGroups((j.groups ?? []).map((g: { label: string }) => g.label)))
      .catch(() => undefined);
  }, []);

  // Neither Helius nor DexScreener expose an ATH field — this pages the
  // pool's full swap history and takes the max implied mcap, same math the
  // Migration Check engine uses. It's an explicit action, not automatic on
  // open, because a busy pool's full history can take a while to page.
  const fetchPeak = async () => {
    setPeakBusy(true);
    setPeakNote(null);
    try {
      const res = await fetch('/api/tracker/peak-mcap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mint: scan.metadata.mint }),
      });
      const json = await res.json();
      if (!res.ok) {
        setPeakNote(json.error ?? 'Peak scan failed');
      } else if (json.peakMcapUsd) {
        setPeak(String(Math.round(json.peakMcapUsd)));
        setPeakNote(json.warnings?.[0] ?? null);
      } else {
        setPeakNote(json.warnings?.[0] ?? 'No priceable swaps found for this pool.');
      }
    } catch {
      setPeakNote('Network error — try again.');
    } finally {
      setPeakBusy(false);
    }
  };

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
          entryPoints: entryPoints.trim() || undefined,
          dipMcap: dipMcap.trim() || undefined,
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

  /** Measured against the peak field, which "Fetch peak" may have just filled. */
  const multiples = entryMultiples(entryPoints, Number(peak) || 0);

  const InputLabel = ({ children }: { children: React.ReactNode }) => (
    <label className="block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[var(--text-dim)] mb-1.5 ml-1">
      {children}
    </label>
  );

  return (
    <Sheet
      title={`Save ${scan.metadata.symbol || 'coin'}`}
      subtitle={scan.metadata.name}
      onClose={onClose}
    >
      <div className="space-y-4 pt-2">
        <div>
          <InputLabel>Outcome</InputLabel>
          <div className="grid grid-cols-2 gap-2">
            {OUTCOMES.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setOutcome(o.id)}
                className="min-h-[44px] rounded-xl text-[13.5px] font-semibold transition hover:opacity-80"
                style={{
                  background: outcome === o.id ? `${o.color}26` : 'var(--surface-2)',
                  color: outcome === o.id ? o.color : 'var(--text-dim)',
                  border: outcome === o.id ? `1px solid ${o.color}40` : '1px solid transparent',
                }}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <InputLabel>Group</InputLabel>
          <input
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            list="tracker-groups"
            placeholder="e.g. Pochi Bin 30"
            className="w-full rounded-xl border hairline bg-[var(--surface-2)] px-4 py-3 text-[14.5px] outline-none transition focus:border-[var(--blue)] focus:bg-[var(--surface)] placeholder:text-[var(--text-dim)]"
          />
          <datalist id="tracker-groups">
            {groups.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="mb-1.5 ml-1 flex items-center justify-between gap-2">
              <label className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[var(--text-dim)]">
                Peak Mcap $
              </label>
              <button
                type="button"
                onClick={fetchPeak}
                disabled={peakBusy}
                className="shrink-0 text-[10.5px] font-semibold text-[var(--blue)] disabled:opacity-50"
              >
                {peakBusy ? 'Scanning…' : 'Fetch peak'}
              </button>
            </div>
            <input
              value={peak}
              onChange={(e) => setPeak(e.target.value)}
              inputMode="numeric"
              placeholder="0"
              className="tnum w-full rounded-xl border hairline bg-[var(--surface-2)] px-4 py-3 text-[14.5px] outline-none transition focus:border-[var(--blue)] focus:bg-[var(--surface)] placeholder:text-[var(--text-dim)]"
            />
          </div>
          <div>
            <InputLabel>Duration (min)</InputLabel>
            <input
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              inputMode="numeric"
              placeholder="0"
              className="tnum w-full rounded-xl border hairline bg-[var(--surface-2)] px-4 py-3 text-[14.5px] outline-none transition focus:border-[var(--blue)] focus:bg-[var(--surface)] placeholder:text-[var(--text-dim)]"
            />
          </div>
        </div>

        {peakNote && (
          <p className="px-1 text-[11px] leading-[1.4] text-[var(--text-dim)]">{peakNote}</p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <InputLabel>Possible Entry Points</InputLabel>
            <input
              value={entryPoints}
              onChange={(e) => setEntryPoints(e.target.value)}
              placeholder="e.g. 15k, 20k"
              className="w-full rounded-xl border hairline bg-[var(--surface-2)] px-4 py-3 text-[14.5px] outline-none transition focus:border-[var(--blue)] focus:bg-[var(--surface)] placeholder:text-[var(--text-dim)]"
            />
            {/* Live peak/entry as you type, so the multiple is visible before
                the coin is even saved. */}
            {multiples.length > 0 && (
              <div className="mt-1.5 ml-1 flex flex-wrap gap-x-3 gap-y-1">
                {multiples.map((m) => (
                  <span key={m.entry} className="tnum text-[11px] text-[var(--text-dim)]">
                    {formatEntry(m.entry)} →{' '}
                    <span
                      className="font-bold"
                      style={{
                        color:
                          m.x >= 2 ? 'var(--green)' : m.x < 1 ? 'var(--red)' : 'var(--text)',
                      }}
                    >
                      {formatMultiple(m.x)}
                    </span>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div>
            <InputLabel>Dip After Migration</InputLabel>
            <input
              value={dipMcap}
              onChange={(e) => setDipMcap(e.target.value)}
              placeholder="e.g. 5k or $10k"
              className="w-full rounded-xl border hairline bg-[var(--surface-2)] px-4 py-3 text-[14.5px] outline-none transition focus:border-[var(--blue)] focus:bg-[var(--surface)] placeholder:text-[var(--text-dim)]"
            />
          </div>
        </div>

        <div>
          <InputLabel>Notes</InputLabel>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="what happened"
            rows={3}
            className="w-full rounded-xl border hairline bg-[var(--surface-2)] px-4 py-3 text-[14.5px] outline-none transition focus:border-[var(--blue)] focus:bg-[var(--surface)] placeholder:text-[var(--text-dim)] resize-none"
          />
        </div>

        {error && (
          <div className="rounded-xl p-3 text-[13px] font-medium text-[var(--red)] bg-[var(--red)]/10 border border-[var(--red)]/20">
            {error}
          </div>
        )}

        <div className="pt-2">
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="flex min-h-[50px] w-full items-center justify-center rounded-2xl bg-[var(--blue)] text-[15px] font-semibold text-white transition active:scale-[0.985] disabled:opacity-60"
          >
            {busy ? 'Saving…' : 'Save to database'}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
