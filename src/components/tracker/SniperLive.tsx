'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SniperEvent, SniperStatus } from '@/lib/tracker/sniperStatus';

const KIND_COLOR: Record<SniperEvent['kind'], string> = {
  fire: 'var(--blue)',
  land: 'var(--green)',
  exit: 'var(--green)',
  hold: 'var(--blue)',
  late: '#ff9f0a',
  miss: '#ff9f0a',
  error: 'var(--red)',
  info: 'var(--text-dim)',
};

function ago(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-xl bg-[var(--surface-2)] px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-[0.06em] text-[var(--text-dim)]">{label}</div>
      <div className="tnum mt-0.5 text-[18px] font-semibold" style={{ color: color ?? 'var(--text)' }}>
        {value}
      </div>
    </div>
  );
}

export function SniperLive({ token }: { token: string }) {
  const [status, setStatus] = useState<SniperStatus | null>(null);
  const [events, setEvents] = useState<SniperEvent[]>([]);
  const [alive, setAlive] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/sniper/status${token ? `?token=${encodeURIComponent(token)}` : ''}`,
        { cache: 'no-store' }
      );
      const json = await res.json();
      if (res.ok) {
        setStatus(json.status ?? null);
        setEvents(json.events ?? []);
        setAlive(Boolean(json.alive));
      }
    } catch {
      /* the panel is a viewer; a failed poll just shows stale data */
    } finally {
      setLoaded(true);
    }
  }, [token]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [load]);

  if (!loaded) return null;

  if (!status) {
    return (
      <section className="mt-5 rounded-2xl bg-[var(--surface-2)] p-4">
        <h2 className="text-[13px] font-semibold">Bot has never checked in</h2>
        <p className="mt-1.5 text-[11.5px] leading-[1.5] text-[var(--text-dim)]">
          Start it with <code>node index.mjs --dry</code> and set <code>PANEL_URL</code> in its
          <code> .env</code> to this site. It reports every 10 seconds.
        </p>
      </section>
    );
  }

  const attempts = status.slot0 + status.late;
  const slot0Rate = attempts ? Math.round((status.slot0 / attempts) * 100) : null;

  return (
    <section className="mt-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-dim)]">
          Live
        </h2>
        <span className="flex items-center gap-1.5 text-[11px] text-[var(--text-dim)]">
          <span
            className="inline-block h-[7px] w-[7px] rounded-full"
            style={{ background: alive ? 'var(--green)' : 'var(--red)' }}
          />
          {alive ? `${status.mode} · ${status.connected ? 'feed up' : 'feed down'}` : `offline · last seen ${ago(status.seenAt)}`}
        </span>
      </div>

      {/*
        slot0Rate is the number the whole operation turns on: one slot late
        costs ~13.5% of an ~18% move, so anything under 100% is money leaking.
      */}
      <div className="mt-2 grid grid-cols-3 gap-2">
        <Stat
          label="Same slot"
          value={slot0Rate === null ? '—' : `${slot0Rate}%`}
          color={slot0Rate === null ? undefined : slot0Rate >= 40 ? 'var(--green)' : '#ff9f0a'}
        />
        <Stat label="Fired" value={String(status.fired)} />
        <Stat
          label="Day PnL"
          value={`${status.realisedSol >= 0 ? '+' : ''}${status.realisedSol.toFixed(3)}`}
          color={status.realisedSol >= 0 ? 'var(--green)' : 'var(--red)'}
        />
        <Stat label="Late" value={String(status.late)} color={status.late ? '#ff9f0a' : undefined} />
        <Stat label="Missed" value={String(status.missed)} />
        <Stat label="Balance" value={`${status.balanceSol.toFixed(2)}`} />
      </div>

      {attempts > 0 && slot0Rate !== null && slot0Rate < 40 && (
        <p
          className="mt-2 rounded-xl px-3 py-2.5 text-[12px] leading-[1.5]"
          style={{ background: 'rgba(255,159,10,0.12)', color: '#ff9f0a' }}
        >
          Only {slot0Rate}% of attempts reach the same slot as the target. At one slot late you buy
          in at roughly the price the target sells at — the trade is underwater before it starts.
          Move closer to the feed, or try a shred-backed one.
        </p>
      )}

      <ul className="mt-3 divide-y divide-[var(--hairline)] overflow-hidden rounded-2xl border hairline">
        {events.length === 0 && (
          <li className="px-4 py-6 text-center text-[12.5px] text-[var(--text-dim)]">
            No activity yet. The bot only fires when a target wallet buys.
          </li>
        )}
        {events.map((e) => (
          <li key={e.id ?? `${e.at}-${e.message}`} className="px-3.5 py-2.5">
            <div className="flex items-baseline gap-2">
              <span
                className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.05em]"
                style={{ color: KIND_COLOR[e.kind] }}
              >
                {e.kind}
              </span>
              <span className="min-w-0 flex-1 text-[12.5px] leading-[1.45]">{e.message}</span>
              <span className="tnum shrink-0 text-[10.5px] text-[var(--text-dim)]">{ago(e.at)}</span>
            </div>
            {e.mint && (
              <a
                href={`https://pump.fun/coin/${e.mint}`}
                target="_blank"
                rel="noreferrer"
                className="mt-0.5 block truncate font-mono text-[10.5px] text-[var(--text-dim)] underline decoration-dotted"
              >
                {e.mint}
              </a>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
