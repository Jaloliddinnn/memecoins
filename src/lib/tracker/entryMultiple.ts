/**
 * "How many X did it do?" — peak market cap divided by the entry.
 *
 * `entryPoints` is free text the operator types while saving a coin
 * ("15k, 20k", "$10k", "5k or 10k"), so it has to be parsed before it can be
 * divided. Everything here is forgiving about format and silent about input
 * it cannot read — a mistyped entry should show no multiple, never a wrong one.
 */

/** `$15k` · `20,000` · `1.5m` — number, optional k/m/b suffix. */
const MONEY = /\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*([kmb])?/gi;

/**
 * Pulls every money-ish figure out of a free-text field.
 *
 * A bare number under 1,000 is read as thousands: nothing in this app trades
 * at a sub-$1,000 market cap (a PumpSwap pool opens around $80k and even the
 * groups that drain to the floor bottom out at $1,500–2,000), so "15" means
 * 15k, not fifteen dollars. Without that, one lazy entry silently produces a
 * 8,200x instead of 8.2x.
 */
export function parseMoneyList(input?: string | null): number[] {
  if (!input) return [];
  const out: number[] = [];

  for (const match of input.matchAll(MONEY)) {
    const digits = match[1];
    if (!digits) continue;

    let value = Number(digits.replace(/,/g, ''));
    if (!Number.isFinite(value) || value <= 0) continue;

    const suffix = match[2]?.toLowerCase();
    if (suffix === 'k') value *= 1e3;
    else if (suffix === 'm') value *= 1e6;
    else if (suffix === 'b') value *= 1e9;
    else if (value < 1000) value *= 1e3;

    out.push(value);
  }

  return out;
}

export interface EntryMultiple {
  entry: number;
  /** peak / entry */
  x: number;
}

/** One multiple per entry point, cheapest entry (so, biggest X) first. */
export function entryMultiples(
  entryPoints: string | null | undefined,
  peakUsd: number | null | undefined
): EntryMultiple[] {
  if (!peakUsd || !Number.isFinite(peakUsd) || peakUsd <= 0) return [];
  return parseMoneyList(entryPoints)
    .map((entry) => ({ entry, x: peakUsd / entry }))
    .filter((m) => Number.isFinite(m.x) && m.x > 0)
    .sort((a, b) => b.x - a.x);
}

/** `12x` · `8.2x` · `0.4x` — decimals only where they carry information. */
export function formatMultiple(x: number): string {
  if (!Number.isFinite(x) || x <= 0) return '—';
  if (x >= 10) return `${Math.round(x)}x`;
  return `${x.toFixed(1)}x`;
}

/** Compact money for entry labels: `$15k`, `$1.2M`, `$850`. */
export function formatEntry(value: number): string {
  if (value >= 1e6) return `$${(value / 1e6).toFixed(value >= 1e7 ? 0 : 1)}M`;
  if (value >= 1e3) return `$${Math.round(value / 1e3)}k`;
  return `$${Math.round(value)}`;
}

/**
 * One-line summary for a coin row. A single entry keeps its price for
 * context; several collapse to the range, so the row stays scannable.
 */
export function summarizeMultiples(multiples: EntryMultiple[]): string | null {
  const best = multiples[0];
  if (!best) return null;
  if (multiples.length === 1) return `${formatMultiple(best.x)} from ${formatEntry(best.entry)}`;
  const worst = multiples[multiples.length - 1];
  if (!worst) return null;
  return `${formatMultiple(worst.x)}–${formatMultiple(best.x)}`;
}
