'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { CoinOutcome, CoinStats } from '@/lib/tracker/types';
import { CoinAvatar } from '@/components/tracker/CoinAvatar';
import { EditCoinSheet } from '@/components/tracker/EditCoinSheet';
import { entryMultiples, multipleColor, summarizeMultiples } from '@/lib/tracker/entryMultiple';

const OUTCOME_STYLE: Record<CoinOutcome, { label: string; color: string }> = {
  pumped: { label: 'Pumped', color: 'var(--green)' },
  dumped: { label: 'Dumped', color: 'var(--red)' },
  pump_and_dump: { label: 'P&D', color: 'var(--amber)' },
  neutral: { label: 'Neutral', color: 'var(--text-dim)' },
};

function money(v: number): string {
  if (!Number.isFinite(v) || v <= 0) return '—';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${Math.round(v).toLocaleString()}`;
  return `$${Math.round(v)}`;
}

const norm = (s?: string) => (s ?? '').trim().toLowerCase();

export default function CoinsPage() {
  const [coins, setCoins] = useState<CoinStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('all');
  const [outcome, setOutcome] = useState<'all' | CoinOutcome>('all');
  const [sortKey, setSortKey] = useState<'saved' | 'peak' | 'insider'>('saved');
  const [detailsFor, setDetailsFor] = useState<CoinStats | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [repairing, setRepairing] = useState(false);

  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast((t) => (t === m ? null : t)), 3200);
  };

  /**
   * Backfills name/symbol/logo for rows saved while a metadata source was
   * down — notably every coin saved after pump.fun retired its v1 API, which
   * had been the only source with a logo once DexScreener drops the pair.
   */
  const repairLogos = async () => {
    setRepairing(true);
    flash('Refetching metadata — this can take a minute…');
    try {
      const res = await fetch('/api/tracker/repair-metadata');
      const json = await res.json();
      if (json.error) flash(json.error);
      else {
        flash(json.message ?? 'Repair complete');
        load();
      }
    } catch {
      flash('Repair failed — try again.');
    } finally {
      setRepairing(false);
    }
  };

  const load = () => {
    setLoading(true);
    fetch('/api/tracker/coins')
      .then((r) => r.json())
      .then((j) => {
        if (j.error) setError(j.error);
        else setCoins(j.coins ?? []);
      })
      .catch(() => setError('Could not reach the database'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const groups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of coins) {
      const label = c.walletGroup?.trim();
      if (label) counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [coins]);

  const filtered = useMemo(() => {
    const rows = coins.filter((c) => {
      if (group === '__none__' && c.walletGroup) return false;
      if (group !== 'all' && group !== '__none__' && norm(c.walletGroup) !== norm(group)) return false;
      if (outcome !== 'all' && c.outcome !== outcome) return false;
      if (query.trim()) {
        const q = query.trim().toLowerCase();
        const hay = `${c.mint} ${c.name} ${c.symbol} ${c.walletGroup ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    return rows.sort((a, b) => {
      if (sortKey === 'peak') return b.maxMarketCapUsd - a.maxMarketCapUsd;
      if (sortKey === 'insider') return b.insiderPercent - a.insiderPercent;
      return (b.snapshotAt || b.updatedAt) - (a.snapshotAt || a.updatedAt);
    });
  }, [coins, group, outcome, query, sortKey]);

  const stats = useMemo(() => {
    const pumped = filtered.filter((c) => c.outcome === 'pumped').length;
    const dumped = filtered.filter(
      (c) => c.outcome === 'dumped' || c.outcome === 'pump_and_dump'
    ).length;
    const peak = filtered.reduce((mx, c) => Math.max(mx, c.maxMarketCapUsd), 0);
    return { pumped, dumped, peak };
  }, [filtered]);

  return (
    <main className="mx-auto min-h-dvh w-full max-w-[430px] px-4 pb-28 pt-3 lg:max-w-4xl lg:px-6 lg:pb-10 lg:pt-6">
      <header className="flex items-baseline justify-between px-1 pb-4">
        <h1 className="text-[26px] font-bold tracking-[-0.02em] lg:text-[32px]">Saved</h1>
        <div className="flex items-baseline gap-3">
          <button
            type="button"
            onClick={repairLogos}
            disabled={repairing}
            className="text-[11px] font-semibold text-[var(--blue)] disabled:opacity-50"
          >
            {repairing ? 'Fixing…' : 'Fix logos'}
          </button>
          <span className="tnum text-[11px] text-[var(--text-dim)]">{coins.length} coins</span>
        </div>
      </header>

      <div className="flex items-center gap-2 rounded-2xl bg-[var(--surface-2)] px-3.5 py-1">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search mint, name, group…"
          className="min-w-0 flex-1 bg-transparent py-3 text-[15px] outline-none placeholder:text-[var(--text-dim)]"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Clear"
            className="px-2 py-2 text-[17px] leading-none text-[var(--text-dim)]"
          >
            ×
          </button>
        )}
      </div>

      {/* Group chips */}
      <div className="-mx-4 mt-3 overflow-x-auto px-4">
        <div className="flex w-max gap-1.5 pb-1">
          {[
            { id: 'all', label: `All ${coins.length}` },
            ...groups.map(([g, n]) => ({ id: g, label: `${g} ${n}` })),
            { id: '__none__', label: 'Ungrouped' },
          ].map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => setGroup(g.id)}
              className={`whitespace-nowrap rounded-full px-3 py-2 text-[12.5px] font-medium transition ${
                group === g.id
                  ? 'bg-[var(--blue)] text-white'
                  : 'bg-[var(--surface-2)] text-[var(--text-dim)]'
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>

      {/* Outcome + sort */}
      <div className="mt-2 flex flex-wrap gap-1 rounded-2xl bg-[var(--surface-2)] p-1">
        {(['all', 'pumped', 'dumped', 'pump_and_dump', 'neutral'] as const).map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => setOutcome(o)}
            className={`flex-1 min-w-[65px] min-h-[36px] rounded-xl text-[11px] font-semibold transition ${
              outcome === o ? 'bg-[var(--blue)] text-white' : 'text-[var(--text-dim)]'
            }`}
          >
            {o === 'pump_and_dump' ? 'P&D' : o === 'all' ? 'All' : OUTCOME_STYLE[o].label}
          </button>
        ))}
      </div>

      <div className="mt-2 flex flex-col gap-2 px-1 sm:flex-row sm:items-center sm:justify-between">
        <span className="tnum text-[11.5px] text-[var(--text-dim)]">
          {filtered.length} shown · {stats.pumped} pumped · {stats.dumped} dumped · peak{' '}
          {money(stats.peak)}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] uppercase font-semibold text-[var(--text-dim)] mr-1">Sort:</span>
          {(['saved', 'peak', 'insider'] as const).map(s => (
            <button
              key={s}
              type="button"
              onClick={() => setSortKey(s)}
              className={`px-2 py-1 rounded text-[11px] font-medium transition ${sortKey === s ? 'bg-[var(--surface-2)] text-[var(--text)]' : 'text-[var(--text-dim)] hover:bg-[var(--surface-2)]'}`}
            >
              {s === 'saved' ? 'Date' : s === 'peak' ? 'Peak MC' : 'Insider %'}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div
          className="mt-4 rounded-2xl px-4 py-3.5 text-[13px]"
          style={{
            background: 'rgba(255,69,58,0.09)',
            border: '1px solid rgba(255,69,58,0.24)',
            color: 'var(--red)',
          }}
        >
          {error}
        </div>
      )}

      {loading && (
        <p className="mt-6 text-center text-[13px] text-[var(--text-dim)]">Loading…</p>
      )}

      {!loading && !filtered.length && !error && (
        <p className="mt-8 text-center text-[13px] text-[var(--text-dim)]">
          Nothing saved yet. Scan a coin on the Holders tab and tap Save coin.
        </p>
      )}

      <ul className="mt-3 grid gap-2">
        {filtered.map((c) => {
          const o = OUTCOME_STYLE[c.outcome];
          const mults = entryMultiples(c.entryPoints, c.maxMarketCapUsd);
          const mult = summarizeMultiples(mults);
          return (
            <li key={c.mint} className="glass rounded-xl px-3 py-2.5 flex flex-col gap-2">
              <div 
                className="flex flex-wrap items-center gap-x-4 gap-y-2 cursor-pointer group"
                onClick={() => setDetailsFor(c)}
              >
                <div className="flex min-w-[190px] flex-1 items-center gap-3 sm:w-[260px] sm:flex-none">
                  <CoinAvatar logoURI={c.logoURI} symbol={c.symbol} name={c.name} />
                  <div className="min-w-0 flex flex-col justify-center">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[14.5px] font-semibold truncate">
                        {c.symbol || c.name || 'Unknown'}
                      </span>
                      <span
                        className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                        style={{ background: `${o.color}22`, color: o.color }}
                      >
                        {o.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10.5px] text-[var(--text-dim)] mt-0.5 min-w-0">
                      <button
                        type="button"
                        title="Copy Address"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(c.mint);
                          flash('Address copied');
                        }}
                        className="font-mono truncate hover:text-[var(--text)] transition cursor-copy"
                      >
                        {c.mint.slice(0, 5)}…{c.mint.slice(-4)}
                      </button>
                      <span className="shrink-0 opacity-50">·</span>
                      <span className="truncate">{c.walletGroup || 'ungrouped'}</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-1 items-center gap-3 sm:gap-4">
                  {/* Peak is the number you scan a group's history by, so it
                      carries the row rather than sitting level with in/out. */}
                  <div className="w-[104px] shrink-0 text-right sm:w-[128px]">
                    <div className="text-[9px] uppercase tracking-wider text-[var(--text-dim)] mb-0.5">Peak</div>
                    <div className="tnum text-[19px] font-bold leading-none sm:text-[22px]">
                      {money(c.maxMarketCapUsd)}
                    </div>
                  </div>
                  <div className="w-[86px] shrink-0 text-right sm:w-[104px]">
                    {mult && (
                      <>
                      <div className="truncate text-[9px] uppercase tracking-wider text-[var(--text-dim)] mb-0.5">
                        {mult.label}
                      </div>
                      <div
                        className="tnum text-[19px] font-bold leading-none sm:text-[22px]"
                        style={{ color: multipleColor(mult.x) }}
                      >
                        {mult.value}
                      </div>
                      </>
                    )}
                  </div>
                  <div className="flex w-[66px] shrink-0 flex-col gap-1 text-right">
                    <div className="tnum text-[10.5px] font-semibold leading-none" style={{ color: 'var(--red)' }}>
                      <span className="text-[var(--text-dim)]">in </span>
                      {c.insiderPercent.toFixed(1)}%
                    </div>
                    <div className="tnum text-[10.5px] font-semibold leading-none" style={{ color: 'var(--green)' }}>
                      <span className="text-[var(--text-dim)]">out </span>
                      {c.outsiderPercent.toFixed(1)}%
                    </div>
                  </div>
                  {/* Outcome at a glance. Reinforces the text badge by the
                      name — never the only carrier of the status. */}
                  <span
                    title={o.label}
                    aria-hidden
                    className="ml-auto h-3.5 w-3.5 shrink-0 rounded-full"
                    style={{ background: o.color, boxShadow: `0 0 0 3px ${o.color}22` }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-[var(--hairline)] pt-2 mt-0.5">
                <span className="text-[10.5px] text-[var(--text-dim)]">
                  {c.durationMinutes > 0 ? `Tracked for ${c.durationMinutes}m` : 'No duration recorded'}
                </span>
                <div className="flex shrink-0 gap-4">
                  <Link
                    href={`/scan?mint=${c.mint}`}
                    className="text-[11.5px] font-semibold text-[var(--blue)] transition hover:opacity-80"
                  >
                    Rescan
                  </Link>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!confirm(`Delete ${c.symbol || c.mint}?`)) return;
                      const res = await fetch(
                        `/api/tracker/coins?mint=${encodeURIComponent(c.mint)}`,
                        { method: 'DELETE' }
                      );
                      if (res.ok) setCoins((prev) => prev.filter((x) => x.mint !== c.mint));
                    }}
                    className="text-[11.5px] font-semibold transition hover:opacity-80"
                    style={{ color: 'var(--red)' }}
                  >
                    Delete
                  </button>
                </div>
              </div>

              {c.notes && (
                <p className="mt-1 text-[11.5px] leading-[1.45] text-[var(--text-dim)] bg-[var(--surface-2)] p-2.5 rounded-lg">{c.notes}</p>
              )}
            </li>
          );
        })}
      </ul>

      {detailsFor && (
        <EditCoinSheet
          coin={detailsFor}
          onClose={() => setDetailsFor(null)}
          onSaved={(updated, message) => {
            setCoins((prev) => prev.map((c) => (c.mint === updated.mint ? updated : c)));
            setDetailsFor(null);
            flash(message);
          }}
        />
      )}

      {toast && (
        <div className="fixed inset-x-4 bottom-24 z-[60] mx-auto max-w-[400px] lg:bottom-6">
          <div className="glass rise rounded-2xl px-4 py-3 text-[13px] font-medium shadow-lg flex items-center justify-center">{toast}</div>
        </div>
      )}
    </main>
  );
}
