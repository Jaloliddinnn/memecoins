/**
 * Configuration.
 *
 * Split deliberately in two:
 *
 *   .env          secrets and endpoints. Your private key lives here and
 *                 nowhere else — never in the database, never in the web app.
 *   config.json   everything you tune. Hot-reloaded every 3 seconds, so you can
 *                 change size, fees or the target from your phone and the
 *                 running bot picks it up without a restart.
 *
 * Run `node setup.mjs` to create both interactively.
 */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const CONFIG_PATH = path.join(HERE, 'config.json');

/**
 * Everything is expressed in SOL, never in micro-lamports per compute unit.
 * An earlier version asked for the raw figure and the default was wrong by a
 * factor of 1000 — it would have bid 0.00006 SOL while believing it bid 0.06,
 * and lost every race silently. Compute-unit maths belongs in code, not in a
 * config file a human edits.
 */
export const DEFAULTS = {
  /** Wallets to copy. One is fine; the block-0 stack usually has four. */
  targets: [],
  /** Ignore a target's buy below this — they also transfer and wrap. 0 = copy all. */
  minTargetSol: 0,
  /** Our position size. His is 2.05, and his own data says 5 halves the win rate. */
  buySol: 2.0,
  /** Priority fee for the whole transaction, in SOL. */
  priorityFeeSol: 0.06,
  /** Tip per relay, in SOL. Sent to each relay we fan out to. */
  tipSol: 0.055,
  /** Refuse to pay more than buySol * (1 + this/100). */
  maxSlippagePercent: 35,
  /**
   * Seconds to hold before the exit fires. His median is 15-30.
   * 0 means the bot never sells: it buys and leaves the position for you.
   */
  holdSeconds: 0,
  /** Positions open at once. 0 means no cap. */
  maxConcurrent: 0,
  /** Stop trading once realised PnL falls below this. 0 means no limit. */
  dailyStopLossSol: 0,
  /**
   * How far through the bonding curve we assume the coin is when we land.
   * The stack completes the curve inside the creation block, and 99% matches
   * the measured 99.1%. Lower it if you snipe launches that are not stacked.
   */
  curveFractionSold: 0.99,
  /** Compute-unit ceiling. 250k is comfortable for buy + ATA creation. */
  computeUnitLimit: 250_000,
  /** Master switch, so you can pause from the phone without killing the process. */
  enabled: true,
};

export function readConfig() {
  let stored = {};
  try {
    stored = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    /* first run, or mid-write — fall back to defaults */
  }
  const merged = { ...DEFAULTS, ...stored };
  merged.targets = (merged.targets ?? []).filter(Boolean);
  return merged;
}

export function writeConfig(next) {
  const merged = { ...readConfig(), ...next };
  // Write-then-rename so a hot reload can never observe a half-written file.
  const tmp = `${CONFIG_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(merged, null, 2));
  fs.renameSync(tmp, CONFIG_PATH);
  return merged;
}

/** Priority fee in SOL -> micro-lamports per compute unit. */
export function computeUnitPrice(priorityFeeSol, computeUnitLimit) {
  return Math.floor((priorityFeeSol * 1e9 * 1e6) / computeUnitLimit);
}

export function validate(config) {
  const errors = [];
  if (!config.targets.length) errors.push('No target wallets set.');
  for (const t of config.targets) {
    try {
      bs58.decode(t);
      if (bs58.decode(t).length !== 32) throw new Error();
    } catch {
      errors.push(`Not a valid wallet address: ${t}`);
    }
  }
  if (!(config.buySol > 0)) errors.push('buySol must be greater than 0.');
  if (!(config.priorityFeeSol >= 0)) errors.push('priorityFeeSol must be 0 or more.');
  // Size and fee ratio are the operator's call, not ours. They are surfaced as
  // warnings in the panel; refusing to start over them just hides the button.
  // 0 is legitimate for holdSeconds — it means "buy only, I sell by hand".
  if (!(config.holdSeconds >= 0)) errors.push('holdSeconds must be 0 or more.');
  if (!(config.curveFractionSold > 0 && config.curveFractionSold < 1)) {
    errors.push('curveFractionSold must be between 0 and 1.');
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Secrets and endpoints (.env only)
// ---------------------------------------------------------------------------

export const RPC_URL = process.env.RPC_URL ?? '';
export const GRPC_URL = process.env.GRPC_URL ?? '';
export const GRPC_TOKEN = process.env.GRPC_TOKEN ?? '';

/**
 * Nozomi's 17 published tip accounts. Their docs are explicit: rotate to a
 * random one per transaction. Every client tipping the same account write-locks
 * it, and a write-locked tip account costs exactly the thing we are paying for.
 * Baked in rather than typed by hand — one mistyped address is a silent miss.
 * Source: https://use.temporal.xyz/nozomi/tipping-and-faq
 */
export const NOZOMI_TIP_ACCOUNTS = [
  'TEMPaMeCRFAS9EKF53Jd6KpHxgL47uWLcpFArU1Fanq',
  'noz3jAjPiHuBPqiSPkkugaJDkJscPuRhYnSpbi8UvC4',
  'noz3str9KXfpKknefHji8L1mPgimezaiUyCHYMDv1GE',
  'noz6uoYCDijhu1V7cutCpwxNiSovEwLdRHPwmgCGDNo',
  'noz9EPNcT7WH6Sou3sr3GGjHQYVkN3DNirpbvDkv9YJ',
  'nozc5yT15LazbLTFVZzoNZCwjh3yUtW86LoUyqsBu4L',
  'nozFrhfnNGoyqwVuwPAW4aaGqempx4PU6g6D9CJMv7Z',
  'nozievPk7HyK1Rqy1MPJwVQ7qQg2QoJGyP71oeDwbsu',
  'noznbgwYnBLDHu8wcQVCEw6kDrXkPdKkydGJGNXGvL7',
  'nozNVWs5N8mgzuD3qigrCG2UoKxZttxzZ85pvAQVrbP',
  'nozpEGbwx4BcGp6pvEdAh1JoC2CQGZdU6HbNP1v2p6P',
  'nozrhjhkCr3zXT3BiT4WCodYCUFeQvcdUkM7MqhKqge',
  'nozrwQtWhEdrA6W8dkbt9gnUaMs52PdAv5byipnadq3',
  'nozUacTVWub3cL4mJmGCYjKZTnE9RbdY5AP46iQgbPJ',
  'nozWCyTPppJjRuw2fpzDhhWbW355fzosWSzrrMYB1Qk',
  'nozWNju6dY353eMkMqURqwQEoM3SFgEKC6psLCSfUne',
  'nozxNBgWohjR75vdspfxR5H9ceC7XXH99xpxhVGt3Bb',
];

/** Nozomi silently drops anything tipping under this. No error, just a miss. */
export const NOZOMI_MIN_TIP_SOL = 0.001;

export const RELAYS = [
  process.env.NOZOMI_URL && {
    name: 'nozomi',
    url: process.env.NOZOMI_URL,
    // An override is honoured, but the built-in rotation is the better default.
    tipAccounts: process.env.NOZOMI_TIP ? [process.env.NOZOMI_TIP] : NOZOMI_TIP_ACCOUNTS,
    minTipSol: NOZOMI_MIN_TIP_SOL,
  },
  process.env.ASTRALANE_URL && {
    name: 'astralane',
    url: process.env.ASTRALANE_URL,
    tipAccounts: process.env.ASTRALANE_TIP ? [process.env.ASTRALANE_TIP] : [],
    minTipSol: 0.00001,
  },
  RPC_URL && { name: 'rpc', url: RPC_URL, tipAccounts: [] },
].filter(Boolean);

export function loadWallet() {
  const raw = process.env.PRIVATE_KEY;
  if (!raw) throw new Error('PRIVATE_KEY missing in .env — run `node setup.mjs`');
  const trimmed = raw.trim();
  const bytes = trimmed.startsWith('[')
    ? Uint8Array.from(JSON.parse(trimmed))
    : bs58.decode(trimmed);
  if (bytes.length !== 64) throw new Error('PRIVATE_KEY is not a 64-byte Solana secret key');
  return Keypair.fromSecretKey(bytes);
}

export const DRY_RUN = process.argv.includes('--dry');

/**
 * Optional: pull settings from the phone panel.
 *
 * When PANEL_URL is set the bot polls it and mirrors what it finds into
 * config.json, so you can change size, fees or the target from your phone
 * without touching the server. The panel never sees the private key.
 */
export const PANEL_URL = process.env.PANEL_URL ?? '';
export const PANEL_TOKEN = process.env.SNIPER_TOKEN ?? '';

export async function pullPanelConfig() {
  if (!PANEL_URL) return null;
  const url = `${PANEL_URL.replace(/\/$/, '')}/api/sniper/config${
    PANEL_TOKEN ? `?token=${encodeURIComponent(PANEL_TOKEN)}` : ''
  }`;
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`panel returned ${res.status}`);
  const json = await res.json();
  if (!json?.config) throw new Error('panel returned no config');
  return json.config;
}

// ---------------------------------------------------------------------------
// Program IDs
// ---------------------------------------------------------------------------

export const PUMP_FUN = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
export const PUMP_SWAP = 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA';
export const BUY_DISCRIMINATOR = '66063d1201daebea';
export const SELL_DISCRIMINATOR = '33e685a4017f83ad';
