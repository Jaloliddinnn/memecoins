'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ScanResult, TagType, TokenHolder } from '@/lib/tracker/types';
import { SaveCoinSheet } from '@/components/tracker/SaveCoinSheet';
import { TagSheet } from '@/components/tracker/TagSheet';
import { DevProfileSheet } from '@/components/tracker/DevProfileSheet';
import { WalletHistorySheet } from '@/components/tracker/WalletHistorySheet';
import { TimeTravelSheet } from '@/components/tracker/TimeTravelSheet';
import { TopTradersSheet } from '@/components/tracker/TopTradersSheet';

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

type Snapshot = { at: number; mode: string; warnings: string[] } | null;

export default function ScanPage() {
  const [mint, setMint] = useState('');
  const [data, setData] = useState<ScanResult | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [excludeLp, setExcludeLp] = useState(true);
  const [filter, setFilter] = useState<'all' | TagType>('all');
  const [toast, setToast] = useState<string | null>(null);

  const [editing, setEditing] = useState<TokenHolder | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [devOpen, setDevOpen] = useState<string | null>(null);
  const [walletOpen, setWalletOpen] = useState<string | null>(null);
  const [timeOpen, setTimeOpen] = useState(false);
  const [tradersOpen, setTradersOpen] = useState(false);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 3200);
  };

  /** Live scan. */
  const run = useCallback(
    async (target?: string, lp?: boolean) => {
      const value = (target ?? mint).trim();
      if (!value || loading) return;
      setLoading(true);
      setError(null);
      setProgress('Reading holders…');
      try {
        const res = await fetch('/api/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mint: value, excludeLp: lp ?? excludeLp }),
        });
        const json = await res.json();
        if (!res.ok) setError(json.error ?? 'Scan failed');
        else {
          setData(json as ScanResult);
          setSnapshot(null);
        }
      } catch {
        setError('Network error — try again.');
      } finally {
        setLoading(false);
        setProgress('');
      }
    },
    [mint, excludeLp, loading]
  );

  /** Historical rewind. */
  const rewind = useCallback(
    async (unixSeconds: number) => {
      const value = mint.trim();
      if (!value) return;
      setTimeOpen(false);
      setLoading(true);
      setError(null);
      setProgress('Rewinding — replaying transactions back to that slot…');
      try {
        const res = await fetch('/api/tracker/timetravel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mint: value, timestamp: unixSeconds, excludeLp }),
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.hint ? `${json.error} — ${json.hint}` : (json.error ?? 'Rewind failed'));
          setData(null);
          setSnapshot(null);
        } else {
          setData(json as ScanResult);
          setSnapshot({
            at: unixSeconds,
            mode: json.scanMode ?? 'HISTORICAL',
            warnings: json.diagnostics?.warnings ?? [],
          });
        }
      } catch {
        setError('Network error during rewind.');
      } finally {
        setLoading(false);
        setProgress('');
      }
    },
    [mint, excludeLp]
  );

  const applyTag = useCallback(
    async (addresses: string[], tag: TagType, label?: string, notes?: string) => {
      const res = await fetch('/api/tracker/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addresses, tag, label, notes, tokenMint: data?.metadata.mint }),
      });
      const json = await res.json();
      if (!res.ok) return flash(json.error ?? 'Save failed');
      flash(`Tagged ${addresses.length} wallet${addresses.length === 1 ? '' : 's'} as ${tag}`);
      setEditing(null);
      if (!snapshot) run(data?.metadata.mint);
    },
    [data, run, snapshot]
  );

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
    <main className="mx-auto min-h-dvh w-full max-w-[430px] px-4 pb-28 pt-3 lg:max-w-6xl lg:px-6 lg:pb-10 lg:pt-6">
      <header className="flex items-baseline justify-between px-1 pb-4">
        <h1 className="text-[26px] font-bold tracking-[-0.02em] lg:text-[32px]">Holders</h1>
        <span className="text-[11px] text-[var(--text-dim)]">insider / outsider</span>
      </header>

      {/* Search */}
      <section className="space-y-2 lg:flex lg:items-center lg:gap-3 lg:space-y-0">
        <div className="flex flex-1 items-center gap-2 rounded-2xl bg-[var(--surface-2)] px-3.5 py-1">
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

        <div className="flex gap-2 lg:shrink-0">
          <button
            type="button"
            onClick={() => run()}
            disabled={loading || !mint.trim()}
            className="flex min-h-[54px] flex-1 items-center justify-center rounded-2xl bg-[var(--blue)] px-6 text-[17px] font-semibold text-white transition active:scale-[0.985] disabled:bg-[var(--surface-2)] disabled:text-[var(--text-dim)] lg:min-h-[48px] lg:text-[15px]"
          >
            {loading ? 'Scanning…' : 'Scan'}
          </button>
          <button
            type="button"
            onClick={() => setTimeOpen(true)}
            disabled={!mint.trim() || loading}
            className="min-h-[54px] shrink-0 rounded-2xl bg-[var(--surface-2)] px-4 text-[14px] font-semibold text-[var(--text-dim)] disabled:opacity-40 lg:min-h-[48px]"
          >
            ⏱ Time
          </button>
        </div>
      </section>

      {loading && progress && (
        <p className="mt-2 px-1 text-center text-[11.5px] text-[var(--text-dim)] lg:text-left">
          {progress}
        </p>
      )}

      {snapshot && (
        <div
          className="rise mt-3 flex items-center justify-between gap-3 rounded-2xl px-4 py-3"
          style={{
            background: 'rgba(255,159,10,0.09)',
            border: '1px solid rgba(255,159,10,0.24)',
          }}
        >
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--amber)]">
              {snapshot.mode} snapshot
            </div>
            <p className="text-[12.5px] text-[var(--text)]">
              {new Date(snapshot.at * 1000).toLocaleString()}
            </p>
            {snapshot.warnings.map((w) => (
              <p key={w} className="mt-1 text-[11.5px] text-[var(--text-dim)]">
                {w}
              </p>
            ))}
          </div>
          <button
            type="button"
            onClick={() => run(data?.metadata.mint)}
            className="shrink-0 text-[12.5px] font-semibold text-[var(--blue)]"
          >
            Back to live
          </button>
        </div>
      )}

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
        <div className="rise mt-5 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-start lg:gap-5">
          {/* Left column on desktop */}
          <div className="space-y-3">
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

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const next = !excludeLp;
                    setExcludeLp(next);
                    if (!snapshot) run(data.metadata.mint, next);
                  }}
                  className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                  style={{
                    background: excludeLp ? 'rgba(10,132,255,0.16)' : 'var(--surface-2)',
                    color: excludeLp ? 'var(--blue)' : 'var(--text-dim)',
                  }}
                >
                  {excludeLp ? 'LP excluded' : 'LP included'}
                </button>
                {data.metadata.creatorAddress && (
                  <button
                    type="button"
                    onClick={() => setDevOpen(data.metadata.creatorAddress!)}
                    className="rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-dim)]"
                  >
                    Dev profile
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setTradersOpen(true)}
                  className="rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-dim)]"
                >
                  Top traders
                </button>
                <button
                  type="button"
                  onClick={() => setSaveOpen(true)}
                  className="ml-auto rounded-full px-3 py-1.5 text-[12px] font-semibold text-white"
                  style={{ background: 'var(--green)' }}
                >
                  Save coin
                </button>
              </div>
            </section>

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
          </div>

          {/* Right column on desktop */}
          <div className="mt-3 space-y-2 lg:mt-0">
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

            <section className="glass overflow-hidden rounded-2xl">
              <div className="flex items-center justify-between border-b hairline px-4 py-2.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--text-dim)]">
                  {shown.length} holders
                </span>
                <span className="text-[10.5px] text-[var(--text-dim)]">tap to tag</span>
              </div>
              <ul className="divide-y divide-[var(--hairline)] lg:max-h-[70vh] lg:overflow-y-auto">
                {shown.slice(0, 200).map((h) => (
                  <li key={h.ownerAddress}>
                    <button
                      type="button"
                      onClick={() => setEditing(h)}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left active:bg-white/5 lg:hover:bg-white/5"
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
              {shown.length > 200 && (
                <div className="px-4 py-2.5 text-center text-[11px] text-[var(--text-dim)]">
                  Showing first 200 of {shown.length}
                </div>
              )}
            </section>

            <p className="px-1 pb-2 text-center text-[11px] text-[var(--text-dim)]">
              {data.holders.length} holders in {(data.elapsedMs / 1000).toFixed(1)}s
            </p>
          </div>
        </div>
      )}

      {editing && (
        <TagSheet
          holder={editing}
          onClose={() => setEditing(null)}
          onApply={(tag, label, notes) => applyTag([editing.ownerAddress], tag, label, notes)}
          onOpenHistory={() => {
            const addr = editing.ownerAddress;
            setEditing(null);
            setWalletOpen(addr);
          }}
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

      {devOpen && (
        <DevProfileSheet
          address={devOpen}
          onClose={() => setDevOpen(null)}
          onScanCoin={(m2) => {
            setDevOpen(null);
            setMint(m2);
            run(m2);
          }}
        />
      )}

      {walletOpen && (
        <WalletHistorySheet
          address={walletOpen}
          tagLabel={data?.holders.find((h) => h.ownerAddress === walletOpen)?.label}
          onClose={() => setWalletOpen(null)}
          onScanCoin={(m2) => {
            setWalletOpen(null);
            setMint(m2);
            run(m2);
          }}
          onTag={(tag) => applyTag([walletOpen], tag)}
        />
      )}

      {timeOpen && <TimeTravelSheet onClose={() => setTimeOpen(false)} onApply={rewind} />}

      {tradersOpen && data && (
        <TopTradersSheet
          mint={data.metadata.mint}
          onClose={() => setTradersOpen(false)}
          onOpenWallet={(a) => {
            setTradersOpen(false);
            setWalletOpen(a);
          }}
        />
      )}

      {toast && (
        <div className="fixed inset-x-4 bottom-24 z-[60] mx-auto max-w-[400px] lg:bottom-6">
          <div className="glass rise rounded-2xl px-4 py-3 text-[13px]">{toast}</div>
        </div>
      )}
    </main>
  );
}
