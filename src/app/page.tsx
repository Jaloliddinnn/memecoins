'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { GroupPicker } from '@/components/signal/GroupPicker';
import { VerdictView } from '@/components/signal/Verdict';
import { GROUPS, type GroupId } from '@/lib/signals/groups';
import type { AnalysisResult } from '@/lib/signals/engine';

const STORAGE_KEY = 'migration-check:group';

export default function Page() {
  const [group, setGroup] = useState<GroupId>('jinpachi');
  const [mint, setMint] = useState('');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const resultRef = useRef<HTMLDivElement>(null);

  // Remember the last group picked — you usually track one crew at a time.
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && saved in GROUPS) setGroup(saved as GroupId);
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, group);
  }, [group]);

  // Live counter so a 20s analysis does not look frozen.
  useEffect(() => {
    if (!loading) return;
    setElapsed(0);
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [loading]);

  const run = useCallback(async () => {
    const value = mint.trim();
    if (!value || loading) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mint: value, group }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Analysis failed');
      } else {
        setResult(json as AnalysisResult);
        if (navigator.vibrate) navigator.vibrate(json.verdict === 'BUY' ? [18, 60, 18] : 14);
        requestAnimationFrame(() =>
          resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        );
      }
    } catch {
      setError('Network error — check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [mint, group, loading]);

  const paste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setMint(text.trim());
    } catch {
      setError('Clipboard blocked — paste into the field manually.');
    }
  }, []);

  const cfg = GROUPS[group];

  return (
    <main className="mx-auto min-h-dvh w-full max-w-[430px] px-4 pb-28 pt-3 lg:max-w-2xl lg:pb-10 lg:pt-6">
      <header className="flex items-baseline justify-between px-1 pb-4">
        <h1 className="text-[26px] font-bold tracking-[-0.02em] lg:text-[32px]">Migration Check</h1>
        <span className="text-[11px] text-[var(--text-dim)]">post-migration</span>
      </header>

      {/* Group */}
      <section className="space-y-2">
        <label className="px-1 text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--text-dim)]">
          Scam group
        </label>
        <GroupPicker value={group} onChange={setGroup} disabled={loading} />
        <div className="glass rounded-2xl px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] font-semibold">{cfg.name}</span>
            <span className="text-[11px] text-[var(--text-dim)]">{cfg.funding}</span>
          </div>
          <p className="mt-1.5 text-[12.5px] leading-[1.45] text-[var(--text-dim)]">
            {cfg.tactic}
          </p>
          <div className="mt-2.5 flex items-center gap-2">
            <span
              className="shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
              style={{
                background:
                  cfg.confidence === 'high'
                    ? 'rgba(48,209,88,0.16)'
                    : cfg.confidence === 'medium'
                      ? 'rgba(255,159,10,0.16)'
                      : 'rgba(255,69,58,0.16)',
                color:
                  cfg.confidence === 'high'
                    ? 'var(--green)'
                    : cfg.confidence === 'medium'
                      ? 'var(--amber)'
                      : 'var(--red)',
              }}
            >
              {cfg.confidence} confidence
            </span>
            <span className="tnum text-[10.5px] text-[var(--text-dim)]">
              {cfg.backtest}
            </span>
          </div>
        </div>
      </section>

      {/* Contract */}
      <section className="mt-5 space-y-2">
        <label
          htmlFor="mint"
          className="px-1 text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--text-dim)]"
        >
          Contract address
        </label>
        <div className="flex items-center gap-2 rounded-2xl bg-[var(--surface-2)] px-3.5 py-1">
          <input
            id="mint"
            value={mint}
            onChange={(e) => setMint(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && run()}
            placeholder="Paste mint…"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="go"
            className="min-w-0 flex-1 bg-transparent py-3 font-mono text-[15px] text-[var(--text)] outline-none placeholder:font-sans placeholder:text-[var(--text-dim)]"
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
              onClick={paste}
              className="shrink-0 rounded-lg px-2.5 py-2 text-[13px] font-semibold text-[var(--blue)] active:opacity-60"
            >
              Paste
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={run}
          disabled={loading || !mint.trim()}
          className="relative flex min-h-[54px] w-full items-center justify-center rounded-2xl bg-[var(--blue)] text-[17px] font-semibold text-white transition active:scale-[0.985] disabled:bg-[var(--surface-2)] disabled:text-[var(--text-dim)]"
        >
          {loading ? `Analysing… ${elapsed}s` : 'Analyse'}
        </button>

        {loading && (
          <p className="px-1 text-center text-[11.5px] text-[var(--text-dim)]">
            Paging the pool to genesis and parsing swaps. Busy pools take 15–40s.
          </p>
        )}
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

      <div ref={resultRef} className="mt-5 scroll-mt-3">
        {result && <VerdictView result={result} />}
      </div>

      {!result && !loading && (
        <section className="mt-5 space-y-2">
          <div className="glass rounded-2xl px-4 py-3.5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--text-dim)]">
              Hard skips for {cfg.name}
            </div>
            <ul className="mt-2 space-y-1.5">
              {cfg.hardSkips.map((skip) => (
                <li
                  key={skip}
                  className="flex gap-2 text-[12.5px] leading-[1.45] text-[var(--text-dim)]"
                >
                  <span style={{ color: 'var(--red)' }}>✕</span>
                  <span>{skip}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="px-2 pt-1 text-center text-[11px] leading-[1.55] text-[var(--text-dim)]">
            Decide by +{cfg.decideAtSec}s after the pool opens. Rules come from the
            dossiers in /docs and are backed by small backtests — trade small and log
            every fire.
          </p>
        </section>
      )}
    </main>
  );
}
