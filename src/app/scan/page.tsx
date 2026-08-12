'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ScanResult, TagType, TokenHolder } from '@/lib/tracker/types';
import { SaveCoinSheet } from '@/components/tracker/SaveCoinSheet';
import { TagSheet } from '@/components/tracker/TagSheet';

const TAG_COLOR: Record<TagType, string> = {
  insider: 'var(--red)',
  outsider: 'var(--green)',
  lp: 'var(--blue)',
  untagged: 'var(--text-dim)',
};

function money(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${Math.round(v).toLocaleString()}`;
  if (v > 0 && v < 1) return `$${v.toFixed(4)}`;
  return `$${Math.round(v)}`;
}

function tokens(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return v.toFixed(0);
}

function Metric({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="rounded-2xl bg-[var(--surface-2)] px-3 py-2.5">
      <div className="text-[10.5px] uppercase tracking-[0.06em] text-[var(--text-dim)]">
        {label}
      </div>
      <div className="tnum mt-1 text-[19px] font-semibold" style={{ color: color ?? 'var(--text)' }}>
        {value}
      </div>
      {sub && <div className="tnum mt-0.5 text-[11px] text-[var(--text-dim)]">{sub}</div>}
    </div>
  );
}

export default function ScanPage() {
  const [mint, setMint] = useState('');
  const [data, setData] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [excludeLp, setExcludeLp] = useState(true);
  const [filter, setFilter] = useState<'all' | TagType>('all');
  const [editing, setEditing] = useState<TokenHolder | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 3000);
  };

  const run = useCallback(
    async (target?: string, lp?: boolean) => {
      const value = (target ?? mint).trim();
      if (!value || loading) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mint: value, excludeLp: lp ?? excludeLp }),
        });
        const json = await res.json();
        if (!res.ok) setError(json.error ?? 'Scan failed');
        else setData(json as ScanResult);
      } catch {
        setError('Network error — try again.');
      } finally {
        setLoading(false);
      }
    },
    [mint, excludeLp, loading]
  );

  const applyTag = useCallback(
    async (addresses: string[], tag: TagType, label?: string, notes?: string) => {
      const res = await fetch('/api/tracker/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addresses, tag, label, notes, tokenMint: data?.metadata.mint }),
      });
      const json = await res.json();
      if (!res.ok) {
        flash(json.error ?? 'Save failed');
        return;
      }
      flash(`Tagged ${addresses.length} wallet${addresses.length === 1 ? '' : 's'} as ${tag}`);
      setEditing(null);
      // Re-scan so the metrics reflect the new tag rather than guessing locally.
      run(data?.metadata.mint);
    },
    [data, run]
  );

  // Deep link from the Saved tab: /scan?mint=…  Read from location rather than
  // useSearchParams so the page stays statically rendered (no Suspense needed).
  const autoRan = useRef(false);
  useEffect(() => {
    if (autoRan.current) return;
    const q = new URLSearchParams(window.location.search).get('mint');
    if (q) {
      autoRan.current = true;
      setMint(q);
      run(q);
    }
  }, [run]);

  const shown = useMemo(() => {
    if (!data) return [];
    if (filter === 'all') return data.holders;
    return data.holders.filter((h) =>
      filter === 'lp' ? h.tag === 'lp' || h.isLiquidityPool : h.tag === filter
    );
  }, [data, filter]);

  const m = data?.metrics;

  return (
    <main className="mx-auto min-h-dvh w-full max-w-[430px] px-4 pb-28 pt-3">
      <header className="flex items-baseline justify-between px-1 pb-4">
        <h1 className="text-[26px] font-bold tracking-[-0.02em]">Holders</h1>
        <span className="text-[11px] text-[var(--text-dim)]">insider / outsider</span>
      </header>

      <section className="space-y-2">
        <div className="flex items-center gap-2 rounded-2xl bg-[var(--surface-2)] px-3.5 py-1">
          <input
            value={mint}
            onChange={(e) => setMint(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && run()}
            placeholder="Paste mint…"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="go"
            className="min-w-0 flex-1 bg-transparent py-3 font-mono text-[15px] outline-none placeholder:font-sans placeholder:text-[var(--text-dim)]"
          />
          {mint ? (
            <button
              type="button"
              onClick={() => setMint('')}
              aria-label="Clear"
              className="shrink-0 px-2 py-2 text-[17px] leading-none text-[var(--text-dim)]"
            >
              ×
            </button>
          ) : (
            <button
              type="button"
              onClick={async () => {
                try {
                  const t = await navigator.clipboard.readText();
                  if (t) setMint(t.trim());
                } catch {
                  setError('Clipboard blocked — paste manually.');
                }
              }}
              className="shrink-0 rounded-lg px-2.5 py-2 text-[13px] font-semibold text-[var(--blue)] active:opacity-60"
            >
              Paste
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => run()}
          disabled={loading || !mint.trim()}
          className="flex min-h-[54px] w-full items-center justify-center rounded-2xl bg-[var(--blue)] text-[17px] font-semibold text-white transition active:scale-[0.985] disabled:bg-[var(--surface-2)] disabled:text-[var(--text-dim)]"
        >
          {loading ? 'Scanning…' : 'Scan holders'}
        </button>
      </section>

      {error && (
        <div
          className="rise mt-4 rounded-2xl px-4 py-3.5 text-[13px]"
          style={{
            background: 'rgba(255,69,58,0.09)',
            border: '1px solid rgba(255,69,58,0.24)',
            color: 'var(--red)',
          }}
        >
          {error}
        </div>
      )}

      {data && m && (
        <div className="rise mt-5 space-y-3">
          {/* Token header */}
          <section className="glass rounded-2xl px-4 py-3.5">
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-[16px] font-semibold">
                  {data.metadata.name}{' '}
                  <span className="text-[var(--text-dim)]">{data.metadata.symbol}</span>
                </div>
                <div className="truncate font-mono text-[11px] text-[var(--text-dim)]">
                  {data.metadata.mint}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="tnum text-[17px] font-semibold">
                  {money(data.metadata.marketCapUsd)}
                </div>
                <div className="text-[10.5px] text-[var(--text-dim)]">mcap</div>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  const next = !excludeLp;
                  setExcludeLp(next);
                  run(data.metadata.mint, next);
                }}
                className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                style={{
                  background: excludeLp ? 'rgba(10,132,255,0.16)' : 'var(--surface-2)',
                  color: excludeLp ? 'var(--blue)' : 'var(--text-dim)',
                }}
              >
                {excludeLp ? 'LP excluded' : 'LP included'}
              </button>
              <button
                type="button"
                onClick={() => setSaveOpen(true)}
                className="rounded-full px-3 py-1.5 text-[12px] font-semibold text-white"
                style={{ background: 'var(--green)' }}
              >
                Save coin
              </button>
            </div>
          </section>

          {/* Metrics */}
          <section className="grid grid-cols-2 gap-2">
            <Metric
              label="Insider"
              value={`${m.insiderPercent.toFixed(2)}%`}
              sub={`${m.insiderCount} wallets · ${m.insiderSol.toFixed(1)} SOL`}
              color="var(--red)"
            />
            <Metric
              label="Outsider"
              value={`${m.outsiderPercent.toFixed(2)}%`}
              sub={`${m.outsiderCount} wallets · ${m.outsiderSol.toFixed(1)} SOL`}
              color="var(--green)"
            />
            <Metric
              label="Untagged"
              value={`${m.untaggedPercent.toFixed(2)}%`}
              sub={`${m.untaggedCount} wallets`}
            />
            <Metric
              label="Liquidity"
              value={`${m.lpPercent.toFixed(2)}%`}
              sub={`${m.lpCount} pools · ${m.lpSol.toFixed(1)} SOL`}
              color="var(--blue)"
            />
            <Metric
              label="Outsider ratio"
              value={`${m.outsiderRatio.toFixed(1)}%`}
              sub="of real float"
              color={m.outsiderRatio < 10 ? 'var(--red)' : 'var(--green)'}
            />
            <Metric label="Top 10" value={`${m.top10Percent.toFixed(1)}%`} sub="excl. LP" />
          </section>

          {/* Groups present */}
          {data.groupsPresent.length > 0 && (
            <section className="glass rounded-2xl px-4 py-3.5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--text-dim)]">
                Known groups in this coin
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {data.groupsPresent.map((g) => (
                  <span
                    key={g.label}
                    className="rounded-lg bg-[var(--surface-2)] px-2 py-1 text-[12px]"
                  >
                    {g.label} <span className="tnum text-[var(--text-dim)]">{g.count}</span>
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Filter */}
          <div className="grid grid-cols-5 gap-1 rounded-2xl bg-[var(--surface-2)] p-1">
            {(['all', 'insider', 'outsider', 'untagged', 'lp'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`min-h-[38px] rounded-xl text-[11.5px] font-semibold capitalize transition ${
                  filter === f ? 'bg-[var(--blue)] text-white' : 'text-[var(--text-dim)]'
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          {/* Holder list */}
          <section className="glass overflow-hidden rounded-2xl">
            <div className="flex items-center justify-between border-b hairline px-4 py-2.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--text-dim)]">
                {shown.length} holders
              </span>
              <span className="text-[10.5px] text-[var(--text-dim)]">tap to tag</span>
            </div>
            <ul className="divide-y divide-[var(--hairline)]">
              {shown.slice(0, 150).map((h) => (
                <li key={h.ownerAddress}>
                  <button
                    type="button"
                    onClick={() => setEditing(h)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left active:bg-white/5"
                  >
                    <span className="tnum w-7 shrink-0 text-[11px] text-[var(--text-dim)]">
                      {h.rank}
                    </span>
                    <span
                      aria-hidden
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: TAG_COLOR[h.tag] }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-[12.5px] text-[var(--text)]">
                        {h.ownerAddress.slice(0, 6)}…{h.ownerAddress.slice(-5)}
                      </span>
                      {(h.label || h.poolName) && (
                        <span className="block truncate text-[10.5px] text-[var(--text-dim)]">
                          {h.label ?? h.poolName}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="tnum block text-[13px] font-semibold">
                        {h.percentOfTotal.toFixed(2)}%
                      </span>
                      <span className="tnum block text-[10.5px] text-[var(--text-dim)]">
                        {tokens(h.uiAmount)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {shown.length > 150 && (
              <div className="px-4 py-2.5 text-center text-[11px] text-[var(--text-dim)]">
                Showing first 150 of {shown.length}
              </div>
            )}
          </section>

          <p className="px-1 pb-2 text-center text-[11px] text-[var(--text-dim)]">
            Scanned {data.holders.length} holders in {(data.elapsedMs / 1000).toFixed(1)}s
          </p>
        </div>
      )}

      {editing && (
        <TagSheet
          holder={editing}
          onClose={() => setEditing(null)}
          onApply={(tag, label, notes) => applyTag([editing.ownerAddress], tag, label, notes)}
        />
      )}

      {saveOpen && data && (
        <SaveCoinSheet
          scan={data}
          onClose={() => setSaveOpen(false)}
          onSaved={(msg) => {
            setSaveOpen(false);
            flash(msg);
          }}
        />
      )}

      {toast && (
        <div className="fixed inset-x-4 bottom-24 z-50 mx-auto max-w-[400px]">
          <div className="glass rise rounded-2xl px-4 py-3 text-[13px]">{toast}</div>
        </div>
      )}
    </main>
  );
}
