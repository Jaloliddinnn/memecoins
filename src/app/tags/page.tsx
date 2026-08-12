'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TagType, WalletTag } from '@/lib/tracker/types';
import { WalletHistorySheet } from '@/components/tracker/WalletHistorySheet';

const TAG_COLOR: Record<TagType, string> = {
  insider: 'var(--red)',
  outsider: 'var(--green)',
  lp: 'var(--blue)',
  untagged: 'var(--text-dim)',
};

const PAGE = 100;

export default function TagsPage() {
  const [groups, setGroups] = useState<Array<{ label: string; count: number }>>([]);
  const [group, setGroup] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [wallets, setWallets] = useState<WalletTag[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkTag, setBulkTag] = useState<TagType>('insider');
  const [bulkLabel, setBulkLabel] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast((t) => (t === m ? null : t)), 3200);
  };

  useEffect(() => {
    fetch('/api/tracker/groups')
      .then((r) => r.json())
      .then((j) => setGroups(j.groups ?? []))
      .catch(() => undefined);
  }, []);

  const load = useCallback(
    (reset = false) => {
      setLoading(true);
      const off = reset ? 0 : offset;
      const params = new URLSearchParams({ limit: String(PAGE), offset: String(off) });
      if (group !== 'all') params.set('label', group);
      if (query.trim()) params.set('q', query.trim());
      fetch(`/api/tracker/tags/list?${params}`)
        .then((r) => r.json())
        .then((j) => {
          if (j.error) return setError(j.error);
          setError(null);
          setTotal(j.total ?? 0);
          setWallets((prev) => (reset ? j.wallets : [...prev, ...j.wallets]));
          setOffset(off + PAGE);
        })
        .catch(() => setError('Could not reach the database'))
        .finally(() => setLoading(false));
    },
    [group, query, offset]
  );

  // Reload from the top whenever the filter changes.
  useEffect(() => {
    setOffset(0);
    const t = setTimeout(() => load(true), query ? 300 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group, query]);

  const submitBulk = async () => {
    const addresses = bulkText
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!addresses.length) return flash('Paste at least one address');
    setBusy(true);
    const res = await fetch('/api/tracker/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ addresses, tag: bulkTag, label: bulkLabel.trim() || undefined }),
    });
    const j = await res.json();
    setBusy(false);
    if (!res.ok) return flash(j.error ?? 'Save failed');
    flash(`Saved ${j.saved} wallet${j.saved === 1 ? '' : 's'}`);
    setBulkText('');
    setAddOpen(false);
    setOffset(0);
    load(true);
  };

  const exportJson = async () => {
    setBusy(true);
    try {
      const params = new URLSearchParams({ all: '1' });
      if (group !== 'all') params.set('label', group);
      const res = await fetch(`/api/tracker/tags/list?${params}`);
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      const blob = new Blob([JSON.stringify(j.wallets, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `wallet-tags-${group === 'all' ? 'all' : group.replace(/\s+/g, '-')}-${
        new Date().toISOString().split('T')[0]
      }.json`;
      a.click();
      URL.revokeObjectURL(url);
      flash(`Exported ${j.wallets.length.toLocaleString()} wallets`);
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setBusy(false);
    }
  };

  const importJson = async (file: File) => {
    setBusy(true);
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      // Accept both an array of rows and the old { address: {...} } dictionary.
      const rows: WalletTag[] = Array.isArray(parsed)
        ? (parsed as WalletTag[])
        : Object.values(parsed as Record<string, WalletTag>);

      const byKey = new Map<string, string[]>();
      for (const r of rows) {
        if (!r?.address || !r?.tag) continue;
        const key = `${r.tag}||${r.label ?? ''}`;
        byKey.set(key, [...(byKey.get(key) ?? []), r.address]);
      }
      let saved = 0;
      for (const [key, addresses] of byKey) {
        const [tag, label] = key.split('||');
        for (let i = 0; i < addresses.length; i += 200) {
          const res = await fetch('/api/tracker/tags', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              addresses: addresses.slice(i, i + 200),
              tag,
              label: label || undefined,
            }),
          });
          const j = await res.json();
          if (res.ok) saved += j.saved ?? 0;
        }
      }
      flash(`Imported ${saved.toLocaleString()} wallets`);
      setOffset(0);
      load(true);
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Import failed — is it valid JSON?');
    } finally {
      setBusy(false);
    }
  };

  const chips = useMemo(
    () => [{ label: 'all', count: groups.reduce((s, g) => s + g.count, 0) }, ...groups],
    [groups]
  );

  return (
    <main className="mx-auto min-h-dvh w-full max-w-[430px] px-4 pb-28 pt-3 lg:max-w-5xl lg:px-6 lg:pb-10 lg:pt-6">
      <header className="flex items-baseline justify-between px-1 pb-4">
        <h1 className="text-[26px] font-bold tracking-[-0.02em] lg:text-[32px]">Wallets</h1>
        <span className="tnum text-[11px] text-[var(--text-dim)]">
          {total.toLocaleString()} tagged
        </span>
      </header>

      <div className="flex items-center gap-2 rounded-2xl bg-[var(--surface-2)] px-3.5 py-1">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search address or group…"
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

      {/* Swipeable single row on a phone; wraps on a laptop, where a hidden
          horizontal scrollbar would just clip the group names. */}
      <div className="-mx-4 mt-3 overflow-x-auto px-4 lg:mx-0 lg:overflow-visible lg:px-0">
        <div className="flex w-max gap-1.5 pb-1 lg:w-auto lg:flex-wrap">
          {chips.map((g) => (
            <button
              key={g.label}
              type="button"
              onClick={() => setGroup(g.label)}
              className={`whitespace-nowrap rounded-full px-3 py-2 text-[12.5px] font-medium transition ${
                group === g.label
                  ? 'bg-[var(--blue)] text-white'
                  : 'bg-[var(--surface-2)] text-[var(--text-dim)]'
              }`}
            >
              {g.label === 'all' ? 'All' : g.label}{' '}
              <span className="tnum opacity-70">{g.count.toLocaleString()}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => setAddOpen((v) => !v)}
          className="min-h-[44px] flex-1 rounded-xl bg-[var(--blue)] text-[14px] font-semibold text-white"
        >
          {addOpen ? 'Close' : 'Add wallets'}
        </button>
        <button
          type="button"
          onClick={exportJson}
          disabled={busy}
          className="min-h-[44px] flex-1 rounded-xl bg-[var(--surface-2)] text-[14px] font-semibold text-[var(--text-dim)] disabled:opacity-50"
        >
          Export
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="min-h-[44px] flex-1 rounded-xl bg-[var(--surface-2)] text-[14px] font-semibold text-[var(--text-dim)] disabled:opacity-50"
        >
          Import
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importJson(f);
            e.target.value = '';
          }}
        />
      </div>

      {addOpen && (
        <section className="rise glass mt-3 rounded-2xl px-4 py-3.5">
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            rows={4}
            placeholder="Paste addresses — one per line, or comma separated"
            className="w-full resize-y rounded-xl bg-[var(--surface-2)] px-3 py-3 font-mono text-[13px] outline-none placeholder:font-sans placeholder:text-[var(--text-dim)]"
          />
          <input
            value={bulkLabel}
            onChange={(e) => setBulkLabel(e.target.value)}
            placeholder="Group label (e.g. Baojin Mex 35)"
            className="mt-2 w-full rounded-xl bg-[var(--surface-2)] px-3 py-3 text-[15px] outline-none placeholder:text-[var(--text-dim)]"
          />
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            {(['insider', 'outsider', 'lp', 'untagged'] as TagType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setBulkTag(t)}
                className="min-h-[42px] rounded-xl text-[12px] font-semibold capitalize transition"
                style={{
                  background: bulkTag === t ? `${TAG_COLOR[t]}26` : 'var(--surface-2)',
                  color: bulkTag === t ? TAG_COLOR[t] : 'var(--text-dim)',
                }}
              >
                {t === 'untagged' ? 'Clear' : t}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={submitBulk}
            disabled={busy}
            className="mt-2 min-h-[48px] w-full rounded-xl bg-[var(--blue)] text-[15px] font-semibold text-white disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save wallets'}
          </button>
        </section>
      )}

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

      <ul className="mt-3 divide-y divide-[var(--hairline)] overflow-hidden rounded-2xl border hairline">
        {wallets.map((w) => (
          <li key={w.address} className="bg-[var(--surface)]">
            <div className="flex items-center gap-3 px-4 py-2.5">
              <span
                aria-hidden
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: TAG_COLOR[w.tag] }}
              />
              <button
                type="button"
                onClick={() => setHistoryFor(w.address)}
                className="min-w-0 flex-1 text-left"
              >
                <span className="block truncate font-mono text-[12.5px]">
                  {w.address.slice(0, 8)}…{w.address.slice(-6)}
                </span>
                <span className="block truncate text-[10.5px] text-[var(--text-dim)]">
                  {w.label ?? 'no group'} · {w.tag}
                </span>
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!confirm(`Remove tag for ${w.address.slice(0, 8)}…?`)) return;
                  const res = await fetch(
                    `/api/tracker/tags?address=${encodeURIComponent(w.address)}`,
                    { method: 'DELETE' }
                  );
                  if (res.ok) {
                    setWallets((p) => p.filter((x) => x.address !== w.address));
                    setTotal((t) => t - 1);
                  }
                }}
                className="shrink-0 text-[11.5px] font-semibold"
                style={{ color: 'var(--red)' }}
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>

      {wallets.length < total && (
        <button
          type="button"
          onClick={() => load(false)}
          disabled={loading}
          className="mt-3 min-h-[48px] w-full rounded-2xl bg-[var(--surface-2)] text-[14px] font-semibold text-[var(--blue)] disabled:opacity-50"
        >
          {loading ? 'Loading…' : `Load more (${(total - wallets.length).toLocaleString()} left)`}
        </button>
      )}

      {historyFor && (
        <WalletHistorySheet
          address={historyFor}
          tagLabel={wallets.find((w) => w.address === historyFor)?.label}
          onClose={() => setHistoryFor(null)}
          onScanCoin={(m) => {
            window.location.href = `/scan?mint=${m}`;
          }}
          onTag={async (tag) => {
            await fetch('/api/tracker/tags', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ addresses: [historyFor], tag }),
            });
            flash(`Tagged as ${tag}`);
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
