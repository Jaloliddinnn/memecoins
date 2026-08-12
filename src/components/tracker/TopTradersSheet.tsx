'use client';

import { useEffect, useState } from 'react';
import { Sheet } from './Sheet';
import type { TraderRow } from '@/lib/tracker/topTraders';

export function TopTradersSheet({
  mint,
  onClose,
  onOpenWallet,
}: {
  mint: string;
  onClose: () => void;
  onOpenWallet: (address: string) => void;
}) {
  const [rows, setRows] = useState<TraderRow[] | null>(null);
  const [scanned, setScanned] = useState<{ txs: number; truncated: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/tracker/top-traders?mint=${encodeURIComponent(mint)}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.error) return setError(j.error);
        setRows(Array.isArray(j.traders) ? (j.traders as TraderRow[]) : []);
        setScanned({ txs: Number(j.scannedTxs) || 0, truncated: Boolean(j.truncated) });
      })
      .catch(() => setError('Scan failed'));
  }, [mint]);

  return (
    <Sheet title="Top traders" subtitle={mint} onClose={onClose} wide>
      {error && (
        <p className="py-6 text-center text-[13px]" style={{ color: 'var(--red)' }}>
          {error}
        </p>
      )}
      {!rows && !error && (
        <p className="py-8 text-center text-[13px] text-[var(--text-dim)]">
          Reconstructing trader PnL…
        </p>
      )}
      {rows && !rows.length && (
        <p className="py-8 text-center text-[13px] text-[var(--text-dim)]">No trades found.</p>
      )}
      {rows && rows.length > 0 && (
        <ul className="divide-y divide-[var(--hairline)] overflow-hidden rounded-2xl border hairline">
          {rows.map((t, i) => (
            <li key={t.address}>
              <button
                type="button"
                onClick={() => onOpenWallet(t.address)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left active:bg-white/5"
              >
                <span className="tnum w-6 shrink-0 text-[11px] text-[var(--text-dim)]">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-[12.5px]">
                    {t.address.slice(0, 6)}…{t.address.slice(-5)}
                  </span>
                  <span className="tnum block text-[10.5px] text-[var(--text-dim)]">
                    bought {t.solSpent.toFixed(2)} · sold {t.solReceived.toFixed(2)} SOL
                  </span>
                </span>
                <span
                  className="tnum shrink-0 text-[13px] font-semibold"
                  style={{ color: t.pnlSol >= 0 ? 'var(--green)' : 'var(--red)' }}
                >
                  {t.pnlSol >= 0 ? '' : '−'}
                  {Math.abs(t.pnlSol).toFixed(2)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {scanned && rows && rows.length > 0 && (
        <p className="mt-3 text-[11px] leading-[1.5] text-[var(--text-dim)]">
          From the most recent {scanned.txs.toLocaleString()} transactions.
          {scanned.truncated
            ? ' The pool is busier than that cap, so earlier trades — including the open — are not counted here.'
            : ' That covers the coin’s whole history.'}
        </p>
      )}
    </Sheet>
  );
}
