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
  /** Ignore a target's buy below this — they also transfer and wrap. */
  minTargetSol: 10,
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
  /** Positions open at once. */
  maxConcurrent: 1,
  /** Stop trading for the day once realised PnL falls below this. */
  dailyStopLossSol: -3,
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
  if (config.buySol > 10) errors.push(`buySol ${config.buySol} is very large — 5 SOL already halves the measured win rate.`);
  if (!(config.priorityFeeSol >= 0)) errors.push('priorityFeeSol must be 0 or more.');
  if (config.priorityFeeSol + config.tipSol > config.buySol * 0.25) {
    errors.push(
      `Fees (${(config.priorityFeeSol + config.tipSol).toFixed(3)} SOL) exceed 25% of the ` +
        `position (${config.buySol} SOL). At that ratio the trade cannot pay for itself.`
    );
  }
  // 0 is legitimate — it means "buy only, I sell by hand".
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

export const RELAYS = [
  process.env.NOZOMI_URL && {
    name: 'nozomi',
    url: process.env.NOZOMI_URL,
    tipAccount: process.env.NOZOMI_TIP || null,
  },
  process.env.ASTRALANE_URL && {
    name: 'astralane',
    url: process.env.ASTRALANE_URL,
    tipAccount: process.env.ASTRALANE_TIP || null,
  },
  RPC_URL && { name: 'rpc', url: RPC_URL, tipAccount: null },
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
