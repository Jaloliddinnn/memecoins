/**
 * Sniper settings, shared between the phone panel and the bot process.
 *
 * SERVER ONLY, and deliberately holds no secrets. The bot's private key lives
 * in its own .env on the machine it runs on and is never readable or writable
 * from here — a key pasted into a public URL is a key you have given away.
 */

import { neon } from '@neondatabase/serverless';

export interface SniperConfig {
  targets: string[];
  minTargetSol: number;
  buySol: number;
  priorityFeeSol: number;
  tipSol: number;
  maxSlippagePercent: number;
  holdSeconds: number;
  maxConcurrent: number;
  dailyStopLossSol: number;
  curveFractionSold: number;
  computeUnitLimit: number;
  enabled: boolean;
}

export const DEFAULT_CONFIG: SniperConfig = {
  targets: [],
  minTargetSol: 10,
  buySol: 2,
  priorityFeeSol: 0.06,
  tipSol: 0.055,
  maxSlippagePercent: 35,
  holdSeconds: 20,
  maxConcurrent: 1,
  dailyStopLossSol: -3,
  curveFractionSold: 0.99,
  computeUnitLimit: 250_000,
  enabled: false,
};

function db() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Missing DATABASE_URL');
  return neon(url);
}

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * Reject anything the bot would choke on, plus two economic guards that have
 * cost real money elsewhere: fees that cannot be paid back out of the position,
 * and a size the measured data says halves the win rate.
 */
export function validateConfig(input: SniperConfig): string[] {
  const errors: string[] = [];

  if (!input.targets.length) errors.push('Add at least one target wallet.');
  for (const t of input.targets) {
    if (!BASE58.test(t)) errors.push(`Not a valid wallet address: ${t.slice(0, 12)}…`);
  }
  if (input.targets.length > 20) errors.push('More than 20 targets — the gRPC filter gets slow.');

  if (!(input.buySol > 0)) errors.push('Trade size must be more than 0 SOL.');
  if (input.buySol > 10) errors.push('Trade size above 10 SOL is refused.');
  if (input.priorityFeeSol < 0 || input.tipSol < 0) errors.push('Fees cannot be negative.');

  const perAttempt = input.priorityFeeSol + input.tipSol;
  if (perAttempt > input.buySol * 0.25) {
    errors.push(
      `Fees are ${perAttempt.toFixed(3)} SOL against a ${input.buySol} SOL position ` +
        `(${((perAttempt / input.buySol) * 100).toFixed(0)}%). The trade cannot pay for itself.`
    );
  }

  if (!(input.holdSeconds > 0)) errors.push('Hold time must be more than 0 seconds.');
  if (input.holdSeconds > 600) errors.push('Hold time above 10 minutes — these coins are dead by then.');
  if (!(input.maxConcurrent >= 1)) errors.push('Max concurrent must be at least 1.');
  if (input.dailyStopLossSol > 0) errors.push('Daily stop loss should be negative.');
  if (!(input.curveFractionSold > 0 && input.curveFractionSold < 1)) {
    errors.push('Curve fraction must be between 0 and 1.');
  }
  if (!(input.computeUnitLimit >= 50_000 && input.computeUnitLimit <= 1_400_000)) {
    errors.push('Compute unit limit must be between 50,000 and 1,400,000.');
  }
  return errors;
}

/** Non-fatal things worth saying out loud on the panel. */
export function configWarnings(input: SniperConfig): string[] {
  const warnings: string[] = [];
  const perAttempt = input.priorityFeeSol + input.tipSol;

  if (perAttempt < 0.101) {
    warnings.push(
      `${perAttempt.toFixed(4)} SOL/attempt is below the 0.101 that buys a 0% failure rate ` +
        `on these coins. At 0.005 the measured failure rate is 92%.`
    );
  }
  if (input.buySol > 3) {
    warnings.push(
      'Measured over 216 coins: ~2 SOL wins 89.5% at 12.89% ROI, ~5 SOL wins 60.7% at 7.35%. ' +
        'A bigger buy moves a seconds-old pool against your own fill.'
    );
  }
  if (input.holdSeconds > 60) {
    warnings.push('His median hold is 15–30s. Past a minute you are holding through the dump.');
  }
  return warnings;
}

export async function getSniperConfig(): Promise<{ config: SniperConfig; updatedAt: number }> {
  const sql = db();
  const rows = (await sql('SELECT config, updated_at FROM sniper_config WHERE id = 1')) as Array<{
    config: unknown;
    updated_at: string | number;
  }>;
  const row = rows[0];
  if (!row) return { config: DEFAULT_CONFIG, updatedAt: 0 };
  return {
    config: { ...DEFAULT_CONFIG, ...(row.config as Partial<SniperConfig>) },
    updatedAt: Number(row.updated_at) || 0,
  };
}

export async function saveSniperConfig(config: SniperConfig): Promise<number> {
  const sql = db();
  const now = Date.now();
  await sql(
    `INSERT INTO sniper_config (id, config, updated_at) VALUES (1, $1, $2)
     ON CONFLICT (id) DO UPDATE SET config = EXCLUDED.config, updated_at = EXCLUDED.updated_at`,
    [JSON.stringify(config), now]
  );
  return now;
}
