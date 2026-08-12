import { devProfilerService } from './devProfiler';

/*
 * PORTED FROM Tool-Memecoin `src/services/walletHistory.ts`.
 * Only the Helius key lookup changed: it reads the server env instead of a
 * custom RPC saved in localStorage. The balance-delta reconstruction is intact.
 */

const WSOL = 'So11111111111111111111111111111111111111112';
const FALLBACK_HELIUS_KEY = process.env.HELIUS_API_KEY || '';

export type CoinStatus = 'migrated' | 'bonding' | 'unknown';

/** One traded token, reconstructed from on-chain balance deltas. */
export interface TokenTradeRow {
  mint: string;
  symbol?: string;
  name?: string;
  logoURI?: string;
  /** Display name, de-duplicated with #1/#2 when several mints share a symbol. */
  displayName: string;
  status: CoinStatus;
  /** Where the migrated/bonding verdict came from, so it can be spot-checked. */
  statusSource?: 'pump.fun' | 'dexscreener';
  boughtQty: number;
  soldQty: number;
  remainingQty: number;
  solSpent: number;
  solReceived: number;
  pnlSol: number;
  pnlPercent: number;
  trades: number;
  firstTime: number;
  lastTime: number;
  isOpen: boolean;
  /** Tokens arrived without the wallet paying SOL (airdrop, bundle push, routing). */
  receivedFree: boolean;
}

export interface WalletHistory {
  address: string;
  scannedTxs: number;
  truncated: boolean;
  coinLimit: number;
  totalMintsSeen: number;
  tokens: TokenTradeRow[];
  totalSolSpent: number;
  totalSolReceived: number;
  realizedPnlSol: number;
  openFlowSol: number;
  netSolDelta: number;
  winners: number;
  losers: number;
  openPositions: number;
  solPriceUsd: number;
  /** True when the wallet rarely pays its own fees — a router/vault, not a trader. */
  isRouterLike: boolean;
  selfPaidRatio: number;
  buckets: { over500: number; from200to500: number; from0to200: number; from0toNeg50: number; underNeg50: number };
}

const heliusKey = (): string => FALLBACK_HELIUS_KEY;

const DUST = 1e-6;

class WalletHistoryService {
  private async getSolPriceUsd(): Promise<number> {
    try {
      const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${WSOL}`, {
        signal: AbortSignal.timeout(4000),
      });
      if (r.ok) {
        const d = await r.json();
        const p = parseFloat(d?.pairs?.[0]?.priceUsd);
        if (Number.isFinite(p) && p > 0) return p;
      }
    } catch {
      /* price is cosmetic */
    }
    return 0;
  }

  /**
   * Resolves names and migration status for the (small) set of coins on screen.
   *
   * DexScreener covers migrated pairs; pump.fun's API is the only place that
   * names a coin still sitting on its bonding curve, and its `complete` /
   * `raydium_pool` fields are the authoritative migration signal.
   */
  private async enrichTokens(rows: TokenTradeRow[]): Promise<void> {
    // 1. DexScreener in batches of 30
    for (let i = 0; i < rows.length; i += 30) {
      const batch = rows.slice(i, i + 30);
      try {
        const r = await fetch(
          `https://api.dexscreener.com/latest/dex/tokens/${batch.map((b) => b.mint).join(',')}`,
          { signal: AbortSignal.timeout(6000) }
        );
        if (!r.ok) continue;
        const d = await r.json();
        for (const pair of d?.pairs || []) {
          const row = batch.find((b) => b.mint === pair?.baseToken?.address);
          if (!row || row.symbol) continue;
          row.symbol = (pair.baseToken.symbol || '').replace('$', '');
          row.name = pair.baseToken.name;
          if (pair.info?.imageUrl) row.logoURI = pair.info.imageUrl;
          // A live non-pumpfun pair means it graduated off the curve
          if (pair.dexId && !/pump/i.test(pair.dexId)) {
            row.status = 'migrated';
            row.statusSource = 'dexscreener';
          }
        }
      } catch {
        /* fall through to pump.fun */
      }
    }

    // 2. pump.fun for anything unnamed or of unknown status (few, so per-coin is fine)
    const needsPump = rows.filter((r) => !r.symbol || r.status === 'unknown');
    await Promise.all(
      needsPump.map(async (row) => {
        try {
          const coin = await devProfilerService.fetchPumpJson(`/coins/${row.mint}`);
          if (!coin) return;
          if (!row.symbol && coin.symbol) row.symbol = String(coin.symbol).replace('$', '');
          if (!row.name && coin.name) row.name = String(coin.name);
          if (!row.logoURI && coin.image_uri) row.logoURI = String(coin.image_uri);
          if (row.status === 'unknown') {
            row.status = coin.complete || coin.raydium_pool ? 'migrated' : 'bonding';
            row.statusSource = 'pump.fun';
          }
        } catch {
          /* leave as unknown */
        }
      })
    );

    // 3. Distinct mints that share a symbol get numbered, newest first
    const bySymbol = new Map<string, TokenTradeRow[]>();
    for (const r of rows) {
      const key = (r.symbol || '').toLowerCase();
      if (!key) continue;
      if (!bySymbol.has(key)) bySymbol.set(key, []);
      bySymbol.get(key)!.push(r);
    }
    for (const [, group] of bySymbol) {
      if (group.length < 2) continue;
      group.sort((a, b) => b.lastTime - a.lastTime);
      group.forEach((r, idx) => {
        r.displayName = `${r.symbol} #${idx + 1}`;
      });
    }
    for (const r of rows) {
      if (!r.displayName) r.displayName = r.symbol || `${r.mint.slice(0, 4)}…${r.mint.slice(-4)}`;
    }
  }

  /**
   * Rebuilds a wallet's recent trading history from Helius enriched transactions.
   *
   * Figures come from the wallet's own balance deltas (native + WSOL) rather
   * than from parsing swap routes, so they hold across pump.fun, PumpSwap,
   * Raydium, Jupiter and aggregator routers alike. Pagination stops as soon as
   * `coinLimit` distinct tokens have been seen, which is what keeps it fast.
   */
  public async fetchWalletHistory(
    address: string,
    opts: { coinLimit?: number; maxPages?: number; onProgress?: (scanned: number, coins: number) => void } = {}
  ): Promise<WalletHistory> {
    const coinLimit = opts.coinLimit ?? 10;
    const maxPages = opts.maxPages ?? 8;
    const key = heliusKey();

    const perMint = new Map<string, TokenTradeRow>();
    let before = '';
    let pages = 0;
    let scannedTxs = 0;
    let netSolDelta = 0;
    let truncated = false;
    let selfPaid = 0;
    let payerSeen = 0;

    while (pages < maxPages) {
      const url =
        `https://api.helius.xyz/v0/addresses/${address}/transactions` +
        `?api-key=${key}&limit=100${before ? `&before=${before}` : ''}`;

      let txs: any[] = [];
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
        if (!r.ok) break;
        txs = await r.json();
      } catch {
        break;
      }
      if (!Array.isArray(txs) || txs.length === 0) break;

      scannedTxs += txs.length;

      for (const tx of txs) {
        if (!tx || tx.transactionError) continue;
        if (tx.feePayer) {
          payerSeen++;
          if (tx.feePayer === address) selfPaid++;
        }

        const self = (tx.accountData || []).find((a: any) => a.account === address);
        let solDelta = (self?.nativeBalanceChange || 0) / 1e9;

        const tokenDeltas = new Map<string, number>();
        for (const a of tx.accountData || []) {
          for (const tb of a.tokenBalanceChanges || []) {
            if (tb.userAccount !== address) continue;
            const dec = tb.rawTokenAmount?.decimals ?? 0;
            const amt = Number(tb.rawTokenAmount?.tokenAmount || 0) / 10 ** dec;
            if (!Number.isFinite(amt) || amt === 0) continue;
            // Wrapped SOL is money, not a position
            if (tb.mint === WSOL) solDelta += amt;
            else tokenDeltas.set(tb.mint, (tokenDeltas.get(tb.mint) || 0) + amt);
          }
        }
        if (tokenDeltas.size === 0) continue;

        netSolDelta += solDelta;
        const time = tx.timestamp || 0;

        for (const [mint, qty] of tokenDeltas) {
          const row =
            perMint.get(mint) ||
            ({
              mint, displayName: '', status: 'unknown' as CoinStatus, statusSource: undefined,
              boughtQty: 0, soldQty: 0, remainingQty: 0, solSpent: 0, solReceived: 0,
              pnlSol: 0, pnlPercent: 0, trades: 0, firstTime: time, lastTime: time,
              isOpen: false, receivedFree: false,
            } as TokenTradeRow);

          row.trades++;
          row.firstTime = row.firstTime ? Math.min(row.firstTime, time) : time;
          row.lastTime = Math.max(row.lastTime, time);

          if (qty > 0) {
            row.boughtQty += qty;
            if (solDelta < 0) row.solSpent += -solDelta / tokenDeltas.size;
          } else {
            row.soldQty += -qty;
            if (solDelta > 0) row.solReceived += solDelta / tokenDeltas.size;
          }
          perMint.set(mint, row);
        }
      }

      before = txs[txs.length - 1].signature;
      pages++;
      opts.onProgress?.(scannedTxs, perMint.size);

      if (txs.length < 100) break;
      // Enough distinct coins collected — stop early. This is the speed win.
      if (perMint.size >= coinLimit) {
        truncated = true;
        break;
      }
      if (pages === maxPages) truncated = true;
    }

    const totalMintsSeen = perMint.size;

    // Keep only the most recently traded `coinLimit` coins
    let tokens = [...perMint.values()].sort((a, b) => b.lastTime - a.lastTime).slice(0, coinLimit);

    for (const t of tokens) {
      t.remainingQty = t.boughtQty - t.soldQty;
      t.isOpen = t.remainingQty > Math.max(DUST, t.boughtQty * 0.01);
      t.pnlSol = t.solReceived - t.solSpent;
      t.pnlPercent = t.solSpent > 0 ? (t.pnlSol / t.solSpent) * 100 : 0;
      t.receivedFree = t.solSpent <= DUST && t.boughtQty > 0;
    }

    await this.enrichTokens(tokens);
    const solPriceUsd = await this.getSolPriceUsd();

    tokens = tokens.sort((a, b) => b.pnlSol - a.pnlSol);

    const closed = tokens.filter((t) => !t.isOpen && !t.receivedFree);
    const buckets = { over500: 0, from200to500: 0, from0to200: 0, from0toNeg50: 0, underNeg50: 0 };
    for (const t of closed) {
      const p = t.pnlPercent;
      if (p >= 500) buckets.over500++;
      else if (p >= 200) buckets.from200to500++;
      else if (p >= 0) buckets.from0to200++;
      else if (p >= -50) buckets.from0toNeg50++;
      else buckets.underNeg50++;
    }

    const selfPaidRatio = payerSeen > 0 ? selfPaid / payerSeen : 1;

    return {
      address,
      scannedTxs,
      truncated,
      coinLimit,
      totalMintsSeen,
      tokens,
      totalSolSpent: tokens.reduce((s, t) => s + t.solSpent, 0),
      totalSolReceived: tokens.reduce((s, t) => s + t.solReceived, 0),
      realizedPnlSol: closed.reduce((s, t) => s + t.pnlSol, 0),
      openFlowSol: tokens.filter((t) => t.isOpen).reduce((s, t) => s + t.pnlSol, 0),
      netSolDelta,
      winners: closed.filter((t) => t.pnlSol > 0).length,
      losers: closed.filter((t) => t.pnlSol <= 0).length,
      openPositions: tokens.filter((t) => t.isOpen).length,
      solPriceUsd,
      isRouterLike: payerSeen >= 20 && selfPaidRatio < 0.2,
      selfPaidRatio,
      buckets,
    };
  }
}

export const walletHistoryService = new WalletHistoryService();
