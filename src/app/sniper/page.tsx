'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SniperConfig } from '@/lib/tracker/sniperConfig';

/** What each sniper on these coins actually pays, and what it buys them. */
const FEE_BENCHMARKS = [
  { label: '41Lur83…C3od', fee: 0.05, tip: 0.0513, fails: '0%', good: true },
  { label: 'HyMGBFBi…', fee: 0.046, tip: 0.0247, fails: '25%', good: false },
  { label: '5hQ38HKk…', fee: 0.0002, tip: 0.0047, fails: '59%', good: false },
  { label: 'FEUa5TK…Hz4', fee: 0, tip: 0.0047, fails: '92%', good: false },
];

function Field({
  label,
  hint,
  value,
  onChange,
  step = 'any',
  suffix,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (v: number) => void;
  step?: string;
  suffix?: string;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-dim)]">
        {label}
      </span>
      <span className="mt-1.5 flex items-center gap-2 rounded-xl bg-[var(--surface-2)] px-3">
        <input
          type="number"
          inputMode="decimal"
          step={step}
          value={Number.isFinite(value) ? value : ''}
          onChange={(e) => onChange(Number(e.target.value))}
          className="tnum min-w-0 flex-1 bg-transparent py-3 text-[16px] outline-none"
        />
        {suffix && <span className="text-[13px] text-[var(--text-dim)]">{suffix}</span>}
      </span>
      {hint && <span className="mt-1 block text-[11px] leading-[1.45] text-[var(--text-dim)]">{hint}</span>}
    </label>
  );
}

export default function SniperPage() {
  const [config, setConfig] = useState<SniperConfig | null>(null);
  const [token, setToken] = useState('');
  const [tokenRequired, setTokenRequired] = useState(false);
  const [targetsText, setTargetsText] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setToken(localStorage.getItem('sniperToken') ?? '');
  }, []);

  const load = useCallback(
    async (auth: string) => {
      const res = await fetch(`/api/sniper/config${auth ? `?token=${encodeURIComponent(auth)}` : ''}`);
      const json = await res.json();
      if (!res.ok) return setError(json.error ?? 'Could not load');
      setConfig(json.config);
      setTargetsText((json.config.targets ?? []).join('\n'));
      setWarnings(json.warnings ?? []);
      setTokenRequired(Boolean(json.tokenRequired));
      setError(null);
    },
    []
  );

  useEffect(() => {
    load(localStorage.getItem('sniperToken') ?? '');
  }, [load]);

  const set = <K extends keyof SniperConfig>(key: K, value: SniperConfig[K]) =>
    setConfig((c) => (c ? { ...c, [key]: value } : c));

  async function save() {
    if (!config) return;
    setSaving(true);
    setStatus(null);
    setError(null);
    const targets = targetsText
      .split(/[\s,]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    const next = { ...config, targets };
    try {
      const res = await fetch(`/api/sniper/config${token ? `?token=${encodeURIComponent(token)}` : ''}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Save failed');
      } else {
        setConfig(json.config);
        setWarnings(json.warnings ?? []);
        setStatus(`Saved. The bot picks this up within 5 seconds.`);
        localStorage.setItem('sniperToken', token);
      }
    } catch {
      setError('Network error.');
    } finally {
      setSaving(false);
    }
  }

  if (!config) {
    return (
      <main className="mx-auto min-h-dvh w-full max-w-[430px] px-4 pb-28 pt-3 lg:max-w-3xl lg:px-6 lg:pt-6">
        <h1 className="text-[32px] font-bold tracking-[-0.02em]">Sniper</h1>
        <p className="mt-4 text-[13px] text-[var(--text-dim)]">{error ?? 'Loading…'}</p>
        {error && (
          <div className="mt-4 space-y-2">
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Access token"
              className="w-full rounded-xl bg-[var(--surface-2)] px-3 py-3 text-[16px] outline-none"
            />
            <button
              type="button"
              onClick={() => load(token)}
              className="min-h-[48px] w-full rounded-2xl bg-[var(--blue)] text-[16px] font-semibold text-white"
            >
              Unlock
            </button>
          </div>
        )}
      </main>
    );
  }

  const perAttempt = config.priorityFeeSol + config.tipSol;
  const feePercent = config.buySol > 0 ? (perAttempt / config.buySol) * 100 : 0;

  return (
    <main className="mx-auto min-h-dvh w-full max-w-[430px] px-4 pb-28 pt-3 lg:max-w-3xl lg:px-6 lg:pb-10 lg:pt-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-[32px] font-bold tracking-[-0.02em]">Sniper</h1>
        <span className="text-[12px] text-[var(--text-dim)]">copy-trade settings</span>
      </header>

      {/* Master switch */}
      <button
        type="button"
        onClick={() => set('enabled', !config.enabled)}
        className="mt-4 flex min-h-[60px] w-full items-center justify-between rounded-2xl px-4 text-left"
        style={{ background: config.enabled ? 'rgba(48,209,88,0.14)' : 'var(--surface-2)' }}
      >
        <span>
          <span className="block text-[15px] font-semibold">
            {config.enabled ? 'Armed' : 'Paused'}
          </span>
          <span className="block text-[11.5px] text-[var(--text-dim)]">
            {config.enabled ? 'The bot will fire on the next target buy' : 'The bot watches but does not trade'}
          </span>
        </span>
        <span
          className="relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors"
          style={{ background: config.enabled ? 'var(--green)' : 'rgba(120,120,128,0.32)' }}
        >
          <span
            className="absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white transition-all"
            style={{ left: config.enabled ? 22 : 2 }}
          />
        </span>
      </button>

      {/* Targets */}
      <section className="mt-5">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-dim)]">
          Target wallets
        </h2>
        <textarea
          value={targetsText}
          onChange={(e) => setTargetsText(e.target.value)}
          rows={4}
          spellCheck={false}
          placeholder={'Paste one wallet per line.\nThese are the ~20 SOL block-0 buyers.'}
          className="mt-1.5 w-full rounded-xl bg-[var(--surface-2)] px-3 py-3 font-mono text-[13px] outline-none placeholder:font-sans placeholder:text-[var(--text-dim)]"
        />
        <p className="mt-1 text-[11px] leading-[1.45] text-[var(--text-dim)]">
          One is enough. These rotate every few coins — a fresh set appears 20 seconds to 5
          minutes before each launch, each wallet funded with ~24 SOL.
        </p>
      </section>

      {/* Size */}
      <section className="mt-5 grid grid-cols-2 gap-3">
        <Field
          label="Trade size"
          suffix="SOL"
          value={config.buySol}
          onChange={(v) => set('buySol', v)}
          hint="His is 2.05."
        />
        <Field
          label="Hold"
          suffix="sec"
          value={config.holdSeconds}
          onChange={(v) => set('holdSeconds', v)}
          hint="His median is 15–30s."
        />
      </section>

      {config.buySol > 3 && (
        <p
          className="mt-3 rounded-xl px-3 py-2.5 text-[12px] leading-[1.5]"
          style={{ background: 'rgba(255,159,10,0.12)', color: 'var(--amber, #ff9f0a)' }}
        >
          Over 216 of his coins: <b>~2 SOL wins 89.5%</b> at 12.89% ROI, <b>~5 SOL wins 60.7%</b> at
          7.35%. All eight of his worst trades were 5 SOL — a bigger buy moves a seconds-old pool
          against your own fill.
        </p>
      )}

      {/* Fees */}
      <section className="mt-5">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-dim)]">
          Fees
        </h2>
        <div className="mt-1.5 grid grid-cols-2 gap-3">
          <Field
            label="Priority fee"
            suffix="SOL"
            step="0.001"
            value={config.priorityFeeSol}
            onChange={(v) => set('priorityFeeSol', v)}
          />
          <Field
            label="Tip per relay"
            suffix="SOL"
            step="0.001"
            value={config.tipSol}
            onChange={(v) => set('tipSol', v)}
          />
        </div>

        <div className="mt-3 rounded-2xl bg-[var(--surface-2)] p-3">
          <div className="flex items-baseline justify-between">
            <span className="text-[13px]">Per attempt</span>
            <span className="tnum text-[17px] font-semibold">
              {perAttempt.toFixed(4)} SOL
              <span className="ml-1.5 text-[12px] font-normal text-[var(--text-dim)]">
                {feePercent.toFixed(1)}% of position
              </span>
            </span>
          </div>
          <div className="mt-3 space-y-1.5">
            {FEE_BENCHMARKS.map((b) => {
              const total = b.fee + b.tip;
              const beaten = perAttempt > total;
              return (
                <div key={b.label} className="flex items-center justify-between text-[11.5px]">
                  <span className="font-mono text-[var(--text-dim)]">{b.label}</span>
                  <span className="tnum flex items-center gap-2">
                    <span className="text-[var(--text-dim)]">{total.toFixed(4)}</span>
                    <span style={{ color: b.good ? 'var(--green)' : 'var(--red)' }}>{b.fails} fail</span>
                    <span style={{ color: beaten ? 'var(--green)' : 'var(--text-dim)' }}>
                      {beaten ? 'beaten' : '—'}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mt-2.5 text-[11px] leading-[1.45] text-[var(--text-dim)]">
            The failure rate is a price list. Fees decide ordering among transactions the leader
            already holds — they do not help if you arrive after the block is packed.
          </p>
        </div>
      </section>

      {/* Risk */}
      <section className="mt-5">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-dim)]">
          Risk
        </h2>
        <div className="mt-1.5 grid grid-cols-2 gap-3">
          <Field
            label="Max open"
            value={config.maxConcurrent}
            step="1"
            onChange={(v) => set('maxConcurrent', v)}
          />
          <Field
            label="Daily stop"
            suffix="SOL"
            value={config.dailyStopLossSol}
            onChange={(v) => set('dailyStopLossSol', v)}
            hint="Negative."
          />
          <Field
            label="Ignore buys under"
            suffix="SOL"
            value={config.minTargetSol}
            onChange={(v) => set('minTargetSol', v)}
            hint="Targets also transfer and wrap."
          />
          <Field
            label="Max slippage"
            suffix="%"
            value={config.maxSlippagePercent}
            onChange={(v) => set('maxSlippagePercent', v)}
          />
        </div>
      </section>

      {tokenRequired && (
        <section className="mt-5">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-dim)]">
            Access token
          </h2>
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            type="password"
            className="mt-1.5 w-full rounded-xl bg-[var(--surface-2)] px-3 py-3 text-[16px] outline-none"
          />
        </section>
      )}

      {warnings.map((w) => (
        <p
          key={w}
          className="mt-3 rounded-xl px-3 py-2.5 text-[12px] leading-[1.5]"
          style={{ background: 'rgba(255,159,10,0.12)', color: '#ff9f0a' }}
        >
          {w}
        </p>
      ))}
      {error && (
        <p
          className="mt-3 rounded-xl px-3 py-2.5 text-[12px] leading-[1.5]"
          style={{ background: 'rgba(255,69,58,0.12)', color: 'var(--red)' }}
        >
          {error}
        </p>
      )}
      {status && (
        <p
          className="mt-3 rounded-xl px-3 py-2.5 text-[12px]"
          style={{ background: 'rgba(48,209,88,0.12)', color: 'var(--green)' }}
        >
          {status}
        </p>
      )}

      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="mt-5 min-h-[52px] w-full rounded-2xl bg-[var(--blue)] text-[16px] font-semibold text-white disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save'}
      </button>

      <p className="mt-4 text-[11px] leading-[1.5] text-[var(--text-dim)]">
        Your private key is <b>not</b> here and cannot be set from this page. It lives in the
        bot&apos;s own <code>.env</code> on the machine it runs on — run <code>node setup.mjs</code>{' '}
        there. A key pasted into a public URL is a key you have given away.
      </p>
    </main>
  );
}
