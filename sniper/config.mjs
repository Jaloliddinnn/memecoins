/**
 * Sniper configuration. Everything you tune lives here.
 *
 * Read sniper/README.md before running with real money.
 */

import 'dotenv/config';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

/**
 * The scammer wallets that open the block-0 stack with ~20 SOL.
 *
 * These ROTATE roughly every four coins, so this list goes stale. Feed it from
 * your tracker rather than editing by hand: any wallet that has just received
 * 20-26 SOL from a fresh single-use funder is a candidate.
 */
export const TARGETS = (process.env.TARGET_WALLETS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/** Ignore a target's transaction unless they are actually committing size. */
export const MIN_TARGET_SOL = Number(process.env.MIN_TARGET_SOL ?? 10);

/** Our position size. His is 2.05. His own data says 5 SOL halves the win rate. */
export const BUY_SOL = Number(process.env.BUY_SOL ?? 2.0);

/**
 * Priority fee, in micro-lamports per compute unit.
 *
 * Measured competition, per buy (2026-09-07):
 *   41Lur83...C3od  0.0500 SOL fee + 0.0513 tip  ->   0% failures
 *   HyMGBFBi...     0.0460 SOL fee + 0.0247 tip  ->  25% failures
 *   5hQ38HKk...     0.0002 SOL fee + 0.0047 tip  ->  59% failures
 *   FEUa5TK...Hz4   0.0000 SOL fee + 0.0047 tip  ->  92% failures
 *
 * The failure rate is a price list. To sit above C3od you need to beat
 * ~0.101 SOL of total spend. At 250k CU, 200,000 micro-lamports/CU = 0.05 SOL.
 */
export const CU_LIMIT = Number(process.env.CU_LIMIT ?? 250_000);
export const CU_PRICE = Number(process.env.CU_PRICE ?? 240_000);

/** Tip per relay, in SOL. Sent to every relay we fan out to. */
export const TIP_SOL = Number(process.env.TIP_SOL ?? 0.055);

/** Slippage ceiling on the buy: refuse to pay more than this multiple. */
export const MAX_SOL_MULTIPLIER = Number(process.env.MAX_SOL_MULTIPLIER ?? 1.35);

/** Hold time before the exit fires, in seconds. His median is 15-30s. */
export const HOLD_SECONDS = Number(process.env.HOLD_SECONDS ?? 20);

/** Never hold more than this many positions at once. */
export const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT ?? 1);

/** Stop the bot for the day once realised PnL drops below this (SOL). */
export const DAILY_STOP_LOSS = Number(process.env.DAILY_STOP_LOSS ?? -3);

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

export const RPC_URL = process.env.RPC_URL ?? '';
export const GRPC_URL = process.env.GRPC_URL ?? '';
export const GRPC_TOKEN = process.env.GRPC_TOKEN ?? '';

/**
 * Submission relays. Send to all of them at once — whichever reaches the
 * leader first wins, and the losers are simply dropped as duplicates.
 *
 * Tip accounts are published by each service; put the current ones here.
 */
export const RELAYS = [
  process.env.NOZOMI_URL && {
    name: 'nozomi',
    url: process.env.NOZOMI_URL,
    tipAccount: process.env.NOZOMI_TIP ?? 'TEMPaMeCRFAS9EKF53Jd6KpHxgL47uWLcpFArU1Fanq',
  },
  process.env.ASTRALANE_URL && {
    name: 'astralane',
    url: process.env.ASTRALANE_URL,
    tipAccount: process.env.ASTRALANE_TIP ?? 'astraRVUuTHjpwEVvNBeQEgwYx9w9CFyfxjYoobCZhL',
  },
  RPC_URL && { name: 'rpc', url: RPC_URL, tipAccount: null },
].filter(Boolean);

// ---------------------------------------------------------------------------
// Wallet
// ---------------------------------------------------------------------------

export function loadWallet() {
  const raw = process.env.PRIVATE_KEY;
  if (!raw) throw new Error('PRIVATE_KEY missing — see sniper/.env.example');
  const bytes = raw.trim().startsWith('[')
    ? Uint8Array.from(JSON.parse(raw))
    : bs58.decode(raw.trim());
  return Keypair.fromSecretKey(bytes);
}

/** --dry on the command line means: do everything except sign and send. */
export const DRY_RUN = process.argv.includes('--dry');

// ---------------------------------------------------------------------------
// Program IDs
// ---------------------------------------------------------------------------

export const PUMP_FUN = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
export const PUMP_SWAP = 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA';
export const BUY_DISCRIMINATOR = '66063d1201daebea';
export const SELL_DISCRIMINATOR = '33e685a4017f83ad';
