/**
 * Group definitions — the trading rules distilled from the dossiers in /docs.
 *
 * Each group has a different playbook because each runs different bots. A rule
 * from one group applied to another produces garbage (see docs/JINPACHI Bin 20.md
 * §13 — Baojin's ">=3 SOL tagged buy" fires on 14 of 16 JINPACHI coins because
 * JINPACHI hardcodes three >=3 SOL buys into block 0).
 */

export type GroupId = 'jinpachi' | 'baojin' | 'pochi';

export interface GroupConfig {
  id: GroupId;
  /** Display name, matches tagged_wallets.label where applicable. */
  name: string;
  /** Exchange + SOL per dev, decoded from the operator's own naming convention. */
  funding: string;
  /** tagged_wallets.label values that belong to this operation. */
  dbLabels: string[];
  /** One-line description of how they operate. */
  tactic: string;
  /** Seconds after pool open when the verdict can be computed. */
  decideAtSec: number;
  /** How long after pool open the entry is still considered actionable. */
  entryWindowSec: number;
  /** Confidence in the rule, from the dossier backtests. */
  confidence: 'high' | 'medium' | 'low';
  /** Backtest headline. */
  backtest: string;
  /** Hard skip conditions the user should know before pasting anything. */
  hardSkips: string[];
}

export const GROUPS: Record<GroupId, GroupConfig> = {
  jinpachi: {
    id: 'jinpachi',
    name: 'JINPACHI Bin 20',
    funding: 'Binance · 20 SOL/dev',
    dbLabels: [
      'JINPACHI BIN 20',
      'JINPACHI BIN 20 (Parent)',
      'ChubbyDog Bin 20',
      'ChubbyDog Bin 20 (Parent)',
    ],
    tactic:
      'A bot buys a hardcoded ~50 SOL in the migration block, so every coin opens at ~$80k (2.55x). You can never buy the floor.',
    decideAtSec: 45,
    entryWindowSec: 15 * 60,
    confidence: 'medium',
    backtest: '16 coins · 5 entries · worst x1.43 · mean x4.26 · best skip x1.32',
    hardSkips: [
      'Dev buy ≥36% of supply — 0 winners in 8 coins',
      'No block-0 stack (<40 SOL) — their own bot skipped it',
      'Price bleeds below 90% in the first 45s',
    ],
  },
  baojin: {
    id: 'baojin',
    name: 'Baojin Mex 35',
    funding: 'MEXC · 35 SOL/dev',
    dbLabels: ['Baojin Mex 35'],
    tactic:
      'Migrates 5+ coins/day. Runs a 1,831-wallet volume-bot fleet with hardcoded 0.002074080 SOL buys to fake activity once a coin is already elevated.',
    decideAtSec: 0,
    entryWindowSec: 30 * 60,
    confidence: 'high',
    backtest: '32 coins · 14 signals · median x2.12 · worst x1.19 · 0 losers · fwd 3/3',
    hardSkips: [
      'Buyer not in tagged_wallets — without the DB check this rule is noise',
      'Holding past the timer — every coin ends at $1,500–$2,000',
    ],
  },
  pochi: {
    id: 'pochi',
    name: 'Pochi Bin 30',
    funding: 'Binance · 30 SOL/dev',
    dbLabels: ['Pochi Bin 30', 'Pochi Bin 30 (Parent)', 'Pochi'],
    tactic:
      '5 devs, 120 launches, 11.7% migrate. No block-0 snipe bot — coins open near 1.00x, so entry is genuinely cheap. Only one coin per session gets pushed.',
    decideAtSec: 0,
    entryWindowSec: 5 * 60,
    confidence: 'low',
    backtest: '14 coins · no validated signal for WHICH coin gets pushed',
    hardSkips: [
      'Entering after +15s — by then it is already 1.7–2.3x',
      'Assuming the median outcome — 3 of 13 coins never passed 1.2x',
    ],
  },
};

export const GROUP_LIST = Object.values(GROUPS);

// ---------------------------------------------------------------------------
// Hard constants — verified on-chain, see docs/JINPACHI Bin 20.md §6
// ---------------------------------------------------------------------------

/** PumpSwap LP opening deposit. */
export const LP_OPEN_SOL = 84.99;
export const LP_OPEN_TOKENS = 206_900_000;
export const CURVE_K = LP_OPEN_SOL * LP_OPEN_TOKENS;
export const TOTAL_SUPPLY = 1e9;

/** Migration market cap in SOL terms (410.8 SOL). */
export const MIGRATION_MCAP_SOL = 410.8;

/** JINPACHI block-0 snipe bot — fingerprint on AMOUNTS, not addresses. */
export const JINPACHI_SNIPE_AMOUNTS = [17.96, 16.63, 15.81];
export const JINPACHI_MIN_STACK_SOL = 40;
export const JINPACHI_MIN_RETENTION = 0.9;

/** Baojin signal threshold. */
export const BAOJIN_MIN_BUY_SOL = 3;

/** Baojin volume-bot fingerprint. */
export const BAOJIN_VOLUME_BOT_SOL = 0.00207408;

/**
 * Market cap after X SOL is bought out of a freshly opened PumpSwap pool.
 * Constant product: mcap = (84.99 + X)^2 / k * supply * solUsd
 */
export function mcapAfterBuy(solIn: number, solUsd: number): number {
  return ((LP_OPEN_SOL + solIn) ** 2 / CURVE_K) * TOTAL_SUPPLY * solUsd;
}

/** The migration market cap in USD at a given SOL price. */
export function migrationMcap(solUsd: number): number {
  return mcapAfterBuy(0, solUsd);
}
