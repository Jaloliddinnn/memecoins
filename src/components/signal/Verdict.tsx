'use client';

import type { AnalysisResult, Check, Verdict } from '@/lib/signals/engine';

const TONE: Record<Verdict, { color: string; bg: string; ring: string; word: string }> = {
  BUY: {
    color: 'var(--green)',
    bg: 'rgba(48, 209, 88, 0.11)',
    ring: 'rgba(48, 209, 88, 0.30)',
    word: 'BUY',
  },
  SKIP: {
    color: 'var(--red)',
    bg: 'rgba(255, 69, 58, 0.10)',
    ring: 'rgba(255, 69, 58, 0.28)',
    word: 'SKIP',
  },
  WAIT: {
    color: 'var(--amber)',
    bg: 'rgba(255, 159, 10, 0.10)',
    ring: 'rgba(255, 159, 10, 0.28)',
    word: 'WAIT',
  },
  NO_POOL: {
    color: 'var(--text-dim)',
    bg: 'rgba(255, 255, 255, 0.05)',
    ring: 'rgba(255, 255, 255, 0.14)',
    word: 'NO POOL',
  },
  UNKNOWN: {
    color: 'var(--text-dim)',
    bg: 'rgba(255, 255, 255, 0.05)',
    ring: 'rgba(255, 255, 255, 0.14)',
    word: "CAN'T TELL",
  },
};

function money(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${Math.round(value).toLocaleString()}`;
  return `$${value.toFixed(0)}`;
}

function age(seconds: number | null): string {
  if (seconds === null) return '—';
  if (seconds < 90) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

function CheckRow({ check }: { check: Check }) {
  const mark =
    check.pass === true ? '✓' : check.pass === false ? '✕' : '·';
  const tone =
    check.pass === true
      ? 'var(--green)'
      : check.pass === false
        ? 'var(--red)'
        : 'var(--text-dim)';

  return (
    <li className="flex gap-3 px-4 py-3.5">
      <span
        aria-hidden
        className="mt-[3px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
        style={{ background: `${tone}22`, color: tone }}
      >
        {mark}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[14px] font-medium text-[var(--text)]">
            {check.label}
          </span>
          <span className="tnum shrink-0 text-[13px] font-semibold" style={{ color: tone }}>
            {check.value}
          </span>
        </div>
        <p className="mt-1 text-[12.5px] leading-[1.45] text-[var(--text-dim)]">
          {check.detail}
        </p>
      </div>
    </li>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[var(--surface-2)] px-3 py-2.5">
      <div className="text-[10.5px] uppercase tracking-[0.06em] text-[var(--text-dim)]">
        {label}
      </div>
      <div className="tnum mt-0.5 text-[15px] font-semibold text-[var(--text)]">
        {value}
      </div>
    </div>
  );
}

export function VerdictView({ result }: { result: AnalysisResult }) {
  const tone = TONE[result.verdict];

  return (
    <div className="rise space-y-3">
      {/* Verdict */}
      <section
        className="relative overflow-hidden rounded-3xl p-5"
        style={{ background: tone.bg, border: `1px solid ${tone.ring}` }}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <div
              className="text-[34px] font-bold leading-none tracking-[-0.02em]"
              style={{ color: tone.color }}
            >
              {tone.word}
            </div>
            <div className="mt-1.5 text-[15px] font-medium text-[var(--text)]">
              {result.headline}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-[11px] uppercase tracking-[0.06em] text-[var(--text-dim)]">
              {result.symbol ?? 'token'}
            </div>
            <div className="tnum text-[19px] font-semibold text-[var(--text)]">
              {money(result.currentMcapUsd)}
            </div>
            {result.multipleFromMigration !== null && (
              <div className="tnum text-[12px] text-[var(--text-dim)]">
                {result.multipleFromMigration}x from mig
              </div>
            )}
          </div>
        </div>

        <p className="mt-3.5 text-[13.5px] leading-[1.5] text-[var(--text)]/85">
          {result.reasoning}
        </p>
      </section>

      {/* Key numbers */}
      <section className="grid grid-cols-3 gap-2">
        <Stat label="Pool age" value={age(result.ageSec)} />
        <Stat
          label="Block-0"
          value={result.blockZeroSol ? `${result.blockZeroSol.toFixed(0)} SOL` : '—'}
        />
        <Stat
          label="Held 15-45s"
          value={result.retention !== null ? `${(result.retention * 100).toFixed(0)}%` : '—'}
        />
        <Stat label="Opened at" value={money(result.openMcapUsd)} />
        <Stat label="Peak seen" value={money(result.peakMcapUsd)} />
        <Stat label="Liquidity" value={money(result.liquidityUsd)} />
      </section>

      {/* Checks */}
      <section className="glass overflow-hidden rounded-2xl">
        <div className="border-b hairline px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--text-dim)]">
          {result.groupName} rule
        </div>
        <ul className="divide-y divide-[var(--hairline)]">
          {result.checks.map((check) => (
            <CheckRow key={check.id} check={check} />
          ))}
        </ul>
      </section>

      {/* Block-0 fingerprint */}
      {result.blockZeroAmounts.length > 0 && (
        <section className="glass rounded-2xl px-4 py-3.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--text-dim)]">
              Migration block buys
            </span>
            {result.snipeFingerprintMatch && (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                style={{ background: 'rgba(10,132,255,0.16)', color: 'var(--blue)' }}
              >
                BOT MATCH
              </span>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {result.blockZeroAmounts.map((amount, i) => (
              <span
                key={`${amount}-${i}`}
                className="tnum rounded-lg bg-[var(--surface-2)] px-2 py-1 text-[12px] font-medium text-[var(--text)]"
              >
                {amount} SOL
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Tagged buys */}
      {result.bigBuys.length > 0 && (
        <section className="glass overflow-hidden rounded-2xl">
          <div className="border-b hairline px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--text-dim)]">
            Tagged wallet buys ≥3 SOL
          </div>
          <ul className="divide-y divide-[var(--hairline)]">
            {result.bigBuys.map((buy, i) => (
              <li
                key={`${buy.wallet}-${buy.t}-${i}`}
                className="flex items-center justify-between gap-3 px-4 py-2.5"
              >
                <div className="min-w-0">
                  <div className="tnum text-[13px] font-medium text-[var(--text)]">
                    +{buy.t}s · {buy.sol} SOL
                  </div>
                  <div className="truncate font-mono text-[11px] text-[var(--text-dim)]">
                    {buy.wallet.slice(0, 10)}…{buy.wallet.slice(-6)}
                  </div>
                </div>
                <span className="shrink-0 text-[10.5px] text-[var(--text-dim)]">
                  {buy.label ?? 'untagged'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Context */}
      <section className="glass space-y-2.5 rounded-2xl px-4 py-3.5 text-[12.5px]">
        <div className="flex justify-between gap-3">
          <span className="text-[var(--text-dim)]">Dev buy</span>
          <span className="tnum text-[var(--text)]">
            {result.devPct !== null
              ? `${result.devPct.toFixed(2)}% · ${result.devBuySol?.toFixed(3)} SOL`
              : '—'}
          </span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-[var(--text-dim)]">Group share of traders</span>
          <span className="tnum text-[var(--text)]">
            {result.groupSharePct !== null ? `${result.groupSharePct}%` : '—'}
          </span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-[var(--text-dim)]">Volume-bot wallets</span>
          <span className="tnum text-[var(--text)]">{result.volumeBotWallets}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-[var(--text-dim)]">Swaps analysed</span>
          <span className="tnum text-[var(--text)]">{result.totalSwaps}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-[var(--text-dim)]">Migration mcap</span>
          <span className="tnum text-[var(--text)]">
            {money(result.migrationMcapUsd)} · SOL ${result.solUsd.toFixed(0)}
          </span>
        </div>
      </section>

      {result.known && (
        <section className="glass rounded-2xl px-4 py-3.5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--text-dim)]">
            Already in your database
          </div>
          <p className="mt-1.5 text-[13px] text-[var(--text)]">
            {result.known.symbol ?? 'This coin'} — outcome{' '}
            <span className="font-semibold">{result.known.outcome ?? 'unknown'}</span>
            {result.known.maxMarketCapUsd
              ? `, peak ${money(result.known.maxMarketCapUsd)}`
              : ''}
            {result.known.walletGroup ? ` · ${result.known.walletGroup}` : ''}
          </p>
        </section>
      )}

      {result.warnings.length > 0 && (
        <section
          className="rounded-2xl px-4 py-3.5"
          style={{
            background: 'rgba(255,159,10,0.08)',
            border: '1px solid rgba(255,159,10,0.22)',
          }}
        >
          {result.warnings.map((warning) => (
            <p key={warning} className="text-[12.5px] leading-[1.45] text-[var(--amber)]">
              {warning}
            </p>
          ))}
        </section>
      )}

      <p className="px-1 pb-2 text-center text-[11px] leading-[1.5] text-[var(--text-dim)]">
        Analysed in {(result.elapsedMs / 1000).toFixed(1)}s. Backtests are small samples —
        this is evidence, not certainty. Every coin in every group ends at zero.
      </p>
    </div>
  );
}
