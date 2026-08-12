'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { CoinOutcome, CoinStats } from '@/lib/tracker/types';

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
    <main className="mx-auto min-h-dvh w-full max-w-[430px] px-4 pb-28 pt-3 lg:max-w-6xl lg:px-6 lg:pb-10 lg:pt-6">
      <header className="flex items-baseline justify-between px-1 pb-4">
        <h1 className="text-[26px] font-bold tracking-[-0.02em] lg:text-[32px]">Saved</h1>
        <span className="tnum text-[11px] text-[var(--text-dim)]">{coins.length} coins</span>
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
      <div className="mt-2 grid grid-cols-5 gap-1 rounded-2xl bg-[var(--surface-2)] p-1">
        {(['all', 'pumped', 'dumped', 'pump_and_dump', 'neutral'] as const).map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => setOutcome(o)}
            className={`min-h-[36px] rounded-xl text-[11px] font-semibold transition ${
              outcome === o ? 'bg-[var(--blue)] text-white' : 'text-[var(--text-dim)]'
            }`}
          >
            {o === 'pump_and_dump' ? 'P&D' : o === 'all' ? 'All' : OUTCOME_STYLE[o].label}
          </button>
        ))}
      </div>

      <div className="mt-2 flex items-center justify-between px-1">
        <span className="tnum text-[11.5px] text-[var(--text-dim)]">
          {filtered.length} shown · {stats.pumped} pumped · {stats.dumped} dumped · peak{' '}
          {money(stats.peak)}
        </span>
        <button
          type="button"
          onClick={() =>
            setSortKey((k) => (k === 'saved' ? 'peak' : k === 'peak' ? 'insider' : 'saved'))
          }
          className="text-[11.5px] font-semibold text-[var(--blue)]"
        >
          {sortKey === 'saved' ? 'Newest' : sortKey === 'peak' ? 'Peak' : 'Insider %'}
        </button>
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

      <ul className="mt-3 grid gap-2 lg:grid-cols-2 xl:grid-cols-3">
        {filtered.map((c) => {
          const o = OUTCOME_STYLE[c.outcome];
          return (
            <li key={c.mint} className="glass rounded-2xl px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-[15px] font-semibold">
                    {c.symbol || c.name || 'Unknown'}
                  </div>
                  <div className="truncate font-mono text-[10.5px] text-[var(--text-dim)]">
                    {c.mint}
                  </div>
                </div>
                <span
                  className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
                  style={{ background: `${o.color}22`, color: o.color }}
                >
                  {o.label}
                </span>
              </div>

              <div className="mt-2.5 grid grid-cols-3 gap-2">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.05em] text-[var(--text-dim)]">
                    Peak
                  </div>
                  <div className="tnum text-[13.5px] font-semibold">
                    {money(c.maxMarketCapUsd)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.05em] text-[var(--text-dim)]">
                    Insider
                  </div>
                  <div className="tnum text-[13.5px] font-semibold" style={{ color: 'var(--red)' }}>
                    {c.insiderPercent.toFixed(1)}%
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.05em] text-[var(--text-dim)]">
                    Outsider
                  </div>
                  <div
                    className="tnum text-[13.5px] font-semibold"
                    style={{ color: 'var(--green)' }}
                  >
                    {c.outsiderPercent.toFixed(1)}%
                  </div>
                </div>
              </div>

              <div className="mt-2.5 flex items-center justify-between gap-2">
                <span className="truncate text-[11px] text-[var(--text-dim)]">
                  {c.walletGroup || 'ungrouped'}
                  {c.durationMinutes > 0 && ` · ${c.durationMinutes}m`}
                </span>
                <div className="flex shrink-0 gap-3">
                  <Link
                    href={`/scan?mint=${c.mint}`}
                    className="text-[12px] font-semibold text-[var(--blue)]"
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
                    className="text-[12px] font-semibold"
                    style={{ color: 'var(--red)' }}
                  >
                    Delete
                  </button>
                </div>
              </div>

              {c.notes && (
                <p className="mt-2 text-[12px] leading-[1.45] text-[var(--text-dim)]">{c.notes}</p>
              )}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
