/**
 * Tagged-wallet lookup over Neon's HTTP driver.
 *
 * HTTP rather than TCP because serverless/edge runtimes cannot hold a pooled
 * Postgres connection, and the sandbox this was developed in blocks raw 5432.
 */

import { neon } from '@neondatabase/serverless';

export interface WalletTag {
  address: string;
  label: string | null;
  tag: string | null;
}

function db() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Missing DATABASE_URL');
  return neon(url);
}

/**
 * Look up only the wallets we actually saw in the pool, rather than pulling all
 * 24k rows on every request. Chunked to keep the parameter list sane.
 */
export async function lookupWallets(
  addresses: string[]
): Promise<Map<string, WalletTag>> {
  const unique = [...new Set(addresses.filter(Boolean))];
  if (!unique.length) return new Map();

  const sql = db();
  const found = new Map<string, WalletTag>();

  for (let i = 0; i < unique.length; i += 500) {
    const chunk = unique.slice(i, i + 500);
    const rows = (await sql(
      'SELECT address, label, tag FROM tagged_wallets WHERE address = ANY($1)',
      [chunk]
    )) as WalletTag[];
    for (const row of rows) found.set(row.address, row);
  }

  return found;
}

/** Total tagged-wallet count per label — used for the DB health readout. */
export async function labelCounts(): Promise<Array<{ label: string; n: number }>> {
  const sql = db();
  const rows = (await sql(
    'SELECT label, COUNT(*)::int AS n FROM tagged_wallets GROUP BY label ORDER BY n DESC'
  )) as Array<{ label: string | null; n: number }>;
  return rows
    .filter((r): r is { label: string; n: number } => Boolean(r.label))
    .map((r) => ({ label: r.label, n: Number(r.n) }));
}

export interface KnownCoin {
  symbol: string | null;
  outcome: string | null;
  maxMarketCapUsd: number | null;
  walletGroup: string | null;
  devAddress: string | null;
}

/** Known outcome for a mint, if we have already analysed it. */
export async function knownCoin(mint: string): Promise<KnownCoin | null> {
  try {
    const sql = db();
    const rows = (await sql(
      `SELECT symbol, outcome, max_market_cap_usd, wallet_group, dev_address
         FROM coin_stats WHERE mint = $1 LIMIT 1`,
      [mint]
    )) as Array<{
      symbol: string | null;
      outcome: string | null;
      max_market_cap_usd: number | string | null;
      wallet_group: string | null;
      dev_address: string | null;
    }>;
    const row = rows[0];
    if (!row) return null;
    return {
      symbol: row.symbol,
      outcome: row.outcome,
      maxMarketCapUsd:
        row.max_market_cap_usd !== null ? Number(row.max_market_cap_usd) : null,
      walletGroup: row.wallet_group,
      devAddress: row.dev_address,
    };
  } catch {
    return null;
  }
}
