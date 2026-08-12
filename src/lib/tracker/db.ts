/**
 * Neon access for tags and saved coins.
 *
 * SERVER ONLY. The original Tool-Memecoin embedded the connection string in the
 * client bundle via `VITE_NEON_DATABASE_URL`, which handed full read/write
 * credentials to anyone who opened the page. Nothing here is importable from a
 * client component — all access goes through /api routes.
 */

import { neon } from '@neondatabase/serverless';
import type { CoinOutcome, CoinStats, TagType, WalletTag, WalletTagMap } from './types';

function db() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Missing DATABASE_URL');
  return neon(url);
}

const num = (v: unknown, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

/** Look up only the addresses we actually saw, not all 24k rows. */
export async function getTagsFor(addresses: string[]): Promise<WalletTagMap> {
  const unique = [...new Set(addresses.filter(Boolean))];
  if (!unique.length) return {};
  const sql = db();
  const map: WalletTagMap = {};

  for (let i = 0; i < unique.length; i += 500) {
    const rows = (await sql(
      `SELECT address, tag, label, notes, token_mint, cluster_parent, created_at, updated_at
         FROM tagged_wallets WHERE address = ANY($1)`,
      [unique.slice(i, i + 500)]
    )) as Array<Record<string, unknown>>;
    for (const r of rows) {
      const address = String(r.address);
      map[address] = {
        address,
        tag: (r.tag as TagType) ?? 'untagged',
        label: (r.label as string) ?? undefined,
        notes: (r.notes as string) ?? undefined,
        tokenMint: (r.token_mint as string) ?? undefined,
        clusterParent: (r.cluster_parent as string) ?? undefined,
        createdAt: r.created_at ? num(r.created_at) : undefined,
        updatedAt: r.updated_at ? num(r.updated_at) : undefined,
      };
    }
  }
  return map;
}

export async function saveTag(item: WalletTag): Promise<void> {
  const sql = db();
  const now = Date.now();
  await sql(
    `INSERT INTO tagged_wallets (address, tag, label, notes, token_mint, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (address) DO UPDATE SET
       tag = EXCLUDED.tag,
       label = COALESCE(EXCLUDED.label, tagged_wallets.label),
       notes = COALESCE(EXCLUDED.notes, tagged_wallets.notes),
       updated_at = EXCLUDED.updated_at`,
    [
      item.address,
      item.tag,
      item.label ?? null,
      item.notes ?? null,
      item.tokenMint ?? null,
      item.createdAt ?? now,
      now,
    ]
  );
}

export async function saveTags(items: WalletTag[]): Promise<number> {
  for (const item of items) await saveTag(item);
  return items.length;
}

export async function deleteTag(address: string): Promise<void> {
  const sql = db();
  await sql('DELETE FROM tagged_wallets WHERE address = $1', [address]);
}

/** Cluster labels with wallet counts — these are the groups a coin files under. */
export async function listGroups(): Promise<Array<{ label: string; count: number }>> {
  const sql = db();
  const rows = (await sql(
    `SELECT label, COUNT(*)::int AS n FROM tagged_wallets
      WHERE label IS NOT NULL AND label <> ''
      GROUP BY label ORDER BY n DESC`
  )) as Array<{ label: string; n: number }>;
  return rows.map((r) => ({ label: r.label, count: num(r.n) }));
}

export async function countTags(): Promise<number> {
  const sql = db();
  const rows = (await sql('SELECT COUNT(*)::int AS n FROM tagged_wallets')) as Array<{
    n: number;
  }>;
  return num(rows[0]?.n);
}

// ---------------------------------------------------------------------------
// Saved coins
// ---------------------------------------------------------------------------

const COIN_COLUMNS = `
  mint, name, symbol, wallet_group, outcome,
  market_cap_usd, max_market_cap_usd, duration_minutes,
  insider_count, insider_percent, insider_sol,
  outsider_count, outsider_percent,
  lp_sol, lp_percent, holder_count,
  price_usd, liquidity_sol, total_supply,
  dev_address, is_pump_fun, notes, logo_uri,
  snapshot_at, created_at, updated_at`;

function rowToCoin(r: Record<string, unknown>): CoinStats {
  return {
    mint: String(r.mint),
    name: (r.name as string) ?? '',
    symbol: (r.symbol as string) ?? '',
    walletGroup: (r.wallet_group as string) ?? undefined,
    outcome: ((r.outcome as CoinOutcome) ?? 'neutral') as CoinOutcome,
    logoURI: (r.logo_uri as string) ?? undefined,
    marketCapUsd: num(r.market_cap_usd),
    maxMarketCapUsd: num(r.max_market_cap_usd),
    durationMinutes: num(r.duration_minutes),
    insiderCount: num(r.insider_count),
    insiderPercent: num(r.insider_percent),
    insiderSol: num(r.insider_sol),
    outsiderCount: num(r.outsider_count),
    outsiderPercent: num(r.outsider_percent),
    lpSol: num(r.lp_sol),
    lpPercent: num(r.lp_percent),
    holderCount: num(r.holder_count),
    priceUsd: num(r.price_usd),
    liquiditySol: num(r.liquidity_sol),
    totalSupply: num(r.total_supply),
    devAddress: (r.dev_address as string) ?? undefined,
    isPumpFun: Boolean(r.is_pump_fun),
    notes: (r.notes as string) ?? undefined,
    snapshotAt: num(r.snapshot_at, Date.now()),
    createdAt: num(r.created_at, Date.now()),
    updatedAt: num(r.updated_at, Date.now()),
  };
}

export async function listCoins(limit = 300): Promise<CoinStats[]> {
  const sql = db();
  const rows = (await sql(
    `SELECT ${COIN_COLUMNS} FROM coin_stats ORDER BY COALESCE(snapshot_at, updated_at) DESC LIMIT $1`,
    [limit]
  )) as Array<Record<string, unknown>>;
  return rows.map(rowToCoin);
}

export async function getCoin(mint: string): Promise<CoinStats | null> {
  const sql = db();
  const rows = (await sql(`SELECT ${COIN_COLUMNS} FROM coin_stats WHERE mint = $1 LIMIT 1`, [
    mint,
  ])) as Array<Record<string, unknown>>;
  const row = rows[0];
  return row ? rowToCoin(row) : null;
}

export async function saveCoin(stats: CoinStats): Promise<void> {
  const sql = db();
  const now = Date.now();
  await sql(
    `INSERT INTO coin_stats (${COIN_COLUMNS}) VALUES
     ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
     ON CONFLICT (mint) DO UPDATE SET
       name = EXCLUDED.name,
       symbol = EXCLUDED.symbol,
       wallet_group = EXCLUDED.wallet_group,
       outcome = EXCLUDED.outcome,
       market_cap_usd = EXCLUDED.market_cap_usd,
       max_market_cap_usd = EXCLUDED.max_market_cap_usd,
       duration_minutes = EXCLUDED.duration_minutes,
       insider_count = EXCLUDED.insider_count,
       insider_percent = EXCLUDED.insider_percent,
       insider_sol = EXCLUDED.insider_sol,
       outsider_count = EXCLUDED.outsider_count,
       outsider_percent = EXCLUDED.outsider_percent,
       lp_sol = EXCLUDED.lp_sol,
       lp_percent = EXCLUDED.lp_percent,
       holder_count = EXCLUDED.holder_count,
       price_usd = EXCLUDED.price_usd,
       liquidity_sol = EXCLUDED.liquidity_sol,
       total_supply = EXCLUDED.total_supply,
       dev_address = EXCLUDED.dev_address,
       is_pump_fun = EXCLUDED.is_pump_fun,
       notes = EXCLUDED.notes,
       logo_uri = COALESCE(EXCLUDED.logo_uri, coin_stats.logo_uri),
       snapshot_at = EXCLUDED.snapshot_at,
       updated_at = EXCLUDED.updated_at`,
    [
      stats.mint,
      stats.name || null,
      stats.symbol || null,
      stats.walletGroup || null,
      stats.outcome,
      stats.marketCapUsd,
      stats.maxMarketCapUsd,
      Math.round(stats.durationMinutes),
      stats.insiderCount,
      stats.insiderPercent,
      stats.insiderSol,
      stats.outsiderCount,
      stats.outsiderPercent,
      stats.lpSol,
      stats.lpPercent,
      stats.holderCount,
      stats.priceUsd,
      stats.liquiditySol,
      stats.totalSupply,
      stats.devAddress || null,
      stats.isPumpFun,
      stats.notes || null,
      stats.logoURI || null,
      stats.snapshotAt,
      stats.createdAt ?? now,
      now,
    ]
  );
}

export async function deleteCoin(mint: string): Promise<void> {
  const sql = db();
  await sql('DELETE FROM coin_stats WHERE mint = $1', [mint]);
}
