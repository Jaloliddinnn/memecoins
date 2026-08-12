'use client';

import { useEffect, useState } from 'react';
import { Sheet } from './Sheet';
import type { DevProfile } from '@/lib/tracker/types';

const RISK: Record<DevProfile['riskRating'], string> = {
  CRITICAL_SCAMMER: 'var(--red)',
  HIGH_RISK: 'var(--amber)',
  MODERATE: 'var(--text-dim)',
  HIGH_SUCCESS: 'var(--green)',
};

const money = (v: number) =>
  v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(2)}M` : `$${Math.round(v).toLocaleString()}`;

const ago = (ts: number) => {
  const d = Math.floor((Date.now() - ts) / 1000);
  if (d < 60) return `${d}s`;
  if (d < 3600) return `${Math.floor(d / 60)}m`;
  if (d < 86400) return `${Math.floor(d / 3600)}h`;
  return `${Math.floor(d / 86400)}d`;
};

export function DevProfileSheet({
  address,
  onClose,
  onScanCoin,
}: {
  address: string;
  onClose: () => void;
  onScanCoin: (mint: string) => void;
}) {
  const [data, setData] = useState<DevProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    setData(null);
    setError(null);
    fetch(`/api/tracker/dev?address=${encodeURIComponent(address)}`)
      .then((r) => r.json())
      .then((j) => (j.error ? setError(j.error) : setData(j as DevProfile)))
      .catch(() => setError('Lookup failed'));
  }, [address]);

  const coins = data ? (showAll ? data.coins : data.coins.slice(0, 12)) : [];

  return (
    <Sheet title="Dev profile" subtitle={address} onClose={onClose} wide>
      {error && (
        <p className="py-6 text-center text-[13px]" style={{ color: 'var(--red)' }}>
          {error}
        </p>
      )}
      {!data && !error && (
        <p className="py-8 text-center text-[13px] text-[var(--text-dim)]">
          Reading launch history…
        </p>
      )}

      {data && (
        <div className="space-y-3">
          <div
            className="rounded-2xl px-4 py-3"
            style={{ background: `${RISK[data.riskRating]}18`, border: `1px solid ${RISK[data.riskRating]}44` }}
          >
            <div
              className="text-[11px] font-bold uppercase tracking-[0.06em]"
              style={{ color: RISK[data.riskRating] }}
            >
              {data.riskRating.replace('_', ' ')}
            </div>
            <p className="mt-1 text-[13px] leading-[1.45]">{data.riskLabel}</p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { l: 'Launches', v: String(data.totalCoinsCreated) },
              { l: 'Migrated', v: String(data.migratedCoins), c: 'var(--green)' },
              { l: 'Dead', v: String(data.deadCoins), c: 'var(--red)' },
              { l: 'Rate', v: `${data.migrationRate.toFixed(1)}%` },
            ].map((s) => (
              <div key={s.l} className="rounded-xl bg-[var(--surface-2)] px-3 py-2.5">
                <div className="text-[10px] uppercase tracking-[0.05em] text-[var(--text-dim)]">
                  {s.l}
                </div>
                <div
                  className="tnum mt-0.5 text-[18px] font-semibold"
                  style={{ color: s.c ?? 'var(--text)' }}
                >
                  {s.v}
                </div>
              </div>
            ))}
          </div>

          {data.username && (
            <p className="text-[12.5px] text-[var(--text-dim)]">
              pump.fun: <span className="text-[var(--text)]">{data.username}</span>
              {data.bio ? ` — ${data.bio}` : ''}
            </p>
          )}

          <div className="glass overflow-hidden rounded-2xl">
            <div className="border-b hairline px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--text-dim)]">
              Coins ({data.coins.length})
            </div>
            <ul className="divide-y divide-[var(--hairline)]">
              {coins.map((c) => (
                <li key={c.mint}>
                  <button
                    type="button"
                    onClick={() => onScanCoin(c.mint)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left active:bg-white/5"
                  >
                    <span
                      aria-hidden
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: c.isMigrated ? 'var(--green)' : 'var(--red)' }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium">
                        {c.symbol}{' '}
                        <span className="text-[var(--text-dim)]">{c.name}</span>
                      </span>
                      <span className="block truncate font-mono text-[10.5px] text-[var(--text-dim)]">
                        {c.mint}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="tnum block text-[13px] font-semibold">
                        {money(c.marketCapUsd)}
                      </span>
                      <span className="tnum block text-[10.5px] text-[var(--text-dim)]">
                        {ago(c.createdTimestamp)} ago
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {!showAll && data.coins.length > 12 && (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="w-full px-4 py-3 text-[12.5px] font-semibold text-[var(--blue)]"
              >
                Show all {data.coins.length}
              </button>
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
}
