/**
 * Pushes status and events to the phone panel.
 *
 * The bot runs headless and the number that decides whether any of this works
 * — how many slots late we were — only exists in its logs. This puts it on a
 * screen you actually look at.
 *
 * Every failure here is swallowed. A panel that is down must never stop the
 * bot trading, and must never add latency to the path that races a block:
 * events are queued and flushed on a timer, never awaited inline.
 */

import { PANEL_URL, PANEL_TOKEN } from './config.mjs';

const queue = [];
let latest = null;
let lastError = 0;

export function record(kind, message, extra = {}) {
  if (!PANEL_URL) return;
  queue.push({
    at: Date.now(),
    kind,
    mint: extra.mint,
    message: String(message).slice(0, 500),
    data: Object.keys(extra).length ? extra : undefined,
  });
  // Guard against unbounded growth if the panel is unreachable for hours.
  if (queue.length > 200) queue.splice(0, queue.length - 200);
}

export function setStatus(status) {
  latest = status;
}

async function flush() {
  if (!PANEL_URL) return;
  if (!latest && !queue.length) return;

  const events = queue.splice(0, 50);
  const url = `${PANEL_URL.replace(/\/$/, '')}/api/sniper/status${
    PANEL_TOKEN ? `?token=${encodeURIComponent(PANEL_TOKEN)}` : ''
  }`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: latest ?? undefined, events }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`panel returned ${res.status}`);
  } catch (err) {
    // Put the events back so nothing is lost to a blip, and complain at most
    // once a minute so a dead panel does not drown the real log.
    queue.unshift(...events);
    if (Date.now() - lastError > 60_000) {
      lastError = Date.now();
      console.warn(`[panel] ${err.message} — will retry`);
    }
  }
}

export function startReporting(intervalMs = 10_000) {
  if (!PANEL_URL) return null;
  const timer = setInterval(flush, intervalMs);
  timer.unref?.();
  return timer;
}
