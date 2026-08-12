'use client';

import { useEffect, useState, useMemo } from 'react';
import { Sheet } from './Sheet';
import type { WalletHistory } from '@/lib/tracker/walletHistory';
import type { TagType } from '@/lib/tracker/types';

const sol = (v: number) => `${v >= 0 ? '' : '−'}${Math.abs(v).toFixed(2)}`;

function formatMC(usd?: number) {
  if (!usd) return 'Unknown MC';
  if (usd >= 1e6) return `$${(usd / 1e6).toFixed(1)}M MC`;
  return `$${(usd / 1e3).toFixed(0)}k MC`;
}

export function WalletHistorySheet({
  address,
  tagLabel,
  onClose,
  onScanCoin,
  onTag,
}: {
  address: string;
  tagLabel?: string;
  onClose: () => void;
  onScanCoin: (mint: string) => void;
  onTag: (tag: TagType) => void;
}) {
  const [data, setData] = useState<WalletHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [coins, setCoins] = useState(10);
  const [sortBy, setSortBy] = useState<'pnl' | 'date' | 'mcap'>('pnl');

  const sortedTokens = useMemo(() => {
    if (!data?.tokens) return [];
    return [...data.tokens].sort((a, b) => {
      if (sortBy === 'date') return b.lastTime - a.lastTime;
      if (sortBy === 'mcap') return (b.marketCapUsd ?? 0) - (a.marketCapUsd ?? 0);
      return b.pnlSol - a.pnlSol;
    });
  }, [data?.tokens, sortBy]);

  useEffect(() => {
    setData(null);
    setError(null);
    fetch(`/api/tracker/wallet?address=${encodeURIComponent(address)}&coins=${coins}`)
      .then((r) => r.json())
      .then((j) => (j.error ? setError(j.error) : setData(j as WalletHistory)))
      .catch(() => setError('History scan failed'));
  }, [address, coins]);

  return (
    <Sheet title="Wallet history" subtitle={address} onClose={onClose} wide>
      {tagLabel && (
        <p className="mb-2 text-[12px] text-[var(--text-dim)]">
          Group: <span className="text-[var(--text)]">{tagLabel}</span>
        </p>
      )}

      <div className="mb-3 grid grid-cols-4 gap-1.5">
        {(['insider', 'outsider', 'lp', 'untagged'] as TagType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onTag(t)}
            className="min-h-[40px] rounded-xl bg-[var(--surface-2)] text-[11.5px] font-semibold capitalize text-[var(--text-dim)] active:opacity-70"
          >
            {t === 'untagged' ? 'Clear' : t}
          </button>
        ))}
      </div>

      {error && (
        <p className="py-6 text-center text-[13px]" style={{ color: 'var(--red)' }}>
          {error}
        </p>
      )}
      {!data && !error && (
        <p className="py-8 text-center text-[13px] text-[var(--text-dim)]">
          Replaying balance deltas…
        </p>
      )}

      {data && (
        <div className="space-y-3">
          {data.isRouterLike && (
            <div
              className="rounded-2xl px-4 py-3 text-[12.5px]"
              style={{
                background: 'rgba(255,159,10,0.09)',
                border: '1px solid rgba(255,159,10,0.24)',
                color: 'var(--amber)',
              }}
            >
              This wallet rarely pays its own fees ({(data.selfPaidRatio * 100).toFixed(0)}%
              self-paid) — likely a router or vault, not a trader. Read the PnL with that in mind.
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              {
                l: 'Realized PnL',
                v: `${sol(data.realizedPnlSol)} SOL`,
                c: data.realizedPnlSol >= 0 ? 'var(--green)' : 'var(--red)',
              },
              { l: 'Win / loss', v: `${data.winners} / ${data.losers}` },
              { l: 'Open', v: String(data.openPositions) },
              { l: 'Txs scanned', v: data.scannedTxs.toLocaleString() },
            ].map((s) => (
              <div key={s.l} className="rounded-xl bg-[var(--surface-2)] px-3 py-2.5">
                <div className="text-[10px] uppercase tracking-[0.05em] text-[var(--text-dim)]">
                  {s.l}
                </div>
                <div
                  className="tnum mt-0.5 text-[16px] font-semibold"
                  style={{ color: s.c ?? 'var(--text)' }}
                >
                  {s.v}
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--text-dim)] mr-1">Sort:</span>
            {(['pnl', 'date', 'mcap'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSortBy(s)}
                className={`px-3 py-1.5 rounded-lg text-[11.5px] font-medium capitalize transition ${sortBy === s ? 'bg-[var(--surface-2)] text-[var(--text)]' : 'text-[var(--text-dim)] hover:bg-[var(--surface-2)]'}`}
              >
                {s === 'mcap' ? 'Market Cap' : s}
              </button>
            ))}
          </div>

          <div className="glass overflow-hidden rounded-2xl">
            <div className="border-b hairline px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--text-dim)]">
              Last {data.tokens.length} coins traded
              {data.truncated && ` · ${data.totalMintsSeen}+ seen`}
            </div>
            <ul className="divide-y divide-[var(--hairline)]">
              {sortedTokens.map((t) => (
                <li key={t.mint}>
                  <button
                    type="button"
                    onClick={() => onScanCoin(t.mint)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left active:bg-white/5"
                  >
                    <div className="relative shrink-0 flex items-center justify-center">
                      {t.logoURI ? (
                        <img src={t.logoURI} alt="" className="h-8 w-8 rounded-full object-cover bg-[var(--surface-2)]" />
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-[var(--surface-2)] flex items-center justify-center text-[10px] font-bold text-[var(--text-dim)] uppercase">
                          {t.symbol?.slice(0, 2) || '?'}
                        </div>
                      )}
                      <span
                        aria-hidden
                        className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--surface)]"
                        style={{
                          background:
                            t.status === 'migrated'
                              ? 'var(--green)'
                              : t.status === 'bonding'
                                ? 'var(--amber)'
                                : 'var(--text-dim)',
                        }}
                      />
                    </div>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium">
                        {t.displayName}
                        {t.isOpen && (
                          <span className="ml-1.5 text-[10px] text-[var(--amber)]">OPEN</span>
                        )}
                        {t.receivedFree && (
                          <span className="ml-1.5 text-[10px] text-[var(--text-dim)]">FREE</span>
                        )}
                      </span>
                      <span className="tnum block truncate text-[10.5px] text-[var(--text-dim)]">
                        {formatMC(t.marketCapUsd)} · {new Date(t.lastTime * 1000).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </span>
                      <span className="tnum block truncate text-[10.5px] text-[var(--text-dim)]">
                        in {t.solSpent.toFixed(2)} · out {t.solReceived.toFixed(2)} SOL ·{' '}
                        {t.trades} tx
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span
                        className="tnum block text-[13px] font-semibold"
                        style={{ color: t.pnlSol >= 0 ? 'var(--green)' : 'var(--red)' }}
                      >
                        {sol(t.pnlSol)}
                      </span>
                      <span className="tnum block text-[10.5px] text-[var(--text-dim)]">
                        {t.solSpent > 0 ? `${t.pnlPercent.toFixed(0)}%` : '—'}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {coins < 40 && (
            <button
              type="button"
              onClick={() => setCoins(40)}
              className="min-h-[46px] w-full rounded-2xl bg-[var(--surface-2)] text-[14px] font-semibold text-[var(--blue)]"
            >
              Scan deeper (40 coins)
            </button>
          )}
        </div>
      )}
    </Sheet>
  );
}
