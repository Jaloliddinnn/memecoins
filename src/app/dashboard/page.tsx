'use client';

import { useState } from 'react';
import type { DumpRiskAssessment, HolderTableResponse } from '@/types';
import { HolderTable } from '@/components/HolderTable';
import { TimeTravelPicker } from '@/components/TimeTravelPicker';
import { ClusterRiskPanel } from '@/components/ClusterRiskPanel';

type ScanResponse = HolderTableResponse & { riskAssessment: DumpRiskAssessment | null };

export default function DashboardPage() {
  const [mint, setMint] = useState('');
  const [timestamp, setTimestamp] = useState<number | null>(null);
  const [data, setData] = useState<ScanResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleScan() {
    if (!mint.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ mint: mint.trim() });
      if (timestamp) params.set('timestamp', String(timestamp));
      const res = await fetch(`/api/holders?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Scan failed');
      setData(json as ScanResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Memecoin Holder Tracker & Anti-Scam Dashboard</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Pump.fun / PumpSwap holder tracking, wallet tagging, and cluster dump-risk scoring.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <input
          value={mint}
          onChange={(e) => setMint(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleScan()}
          placeholder="Token mint address"
          className="w-96 rounded border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-sm"
        />
        <button
          onClick={handleScan}
          disabled={loading}
          className="rounded bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 disabled:opacity-50"
        >
          {loading ? 'Scanning…' : 'Scan'}
        </button>
        <TimeTravelPicker onSelect={setTimestamp} />
      </div>

      {error && (
        <p className="mt-4 rounded border border-insider/40 bg-insider/10 px-3 py-2 text-sm text-insider">
          {error}
        </p>
      )}

      {data && (
        <div className="mt-8 space-y-6">
          <div className="flex flex-wrap gap-6 text-sm text-zinc-400">
            <span>
              Slot: <span className="font-mono text-zinc-200">{data.slot}</span>
            </span>
            <span>
              Market Cap:{' '}
              <span className="font-mono text-zinc-200">
                {data.marketCapUsd !== null ? `$${data.marketCapUsd.toLocaleString()}` : '—'}
              </span>
            </span>
            <span>
              Mode:{' '}
              <span className="font-mono text-zinc-200">
                {data.isHistorical ? 'Time-Travel' : 'Live'}
              </span>
            </span>
          </div>

          <ClusterRiskPanel risk={data.riskAssessment} outsiderVolume={data.outsiderVolume} />
          <HolderTable data={data} />
        </div>
      )}
    </main>
  );
}
