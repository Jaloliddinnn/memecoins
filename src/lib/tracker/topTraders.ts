import { KNOWN_SPECIAL_WALLETS } from './holders';

const WSOL = 'So11111111111111111111111111111111111111112';
const FALLBACK_HELIUS_KEY = process.env.HELIUS_API_KEY || '';

export interface TraderRow {
  address: string;
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
  /** Sold essentially everything — invisible in a holders snapshot. */
  hasExited: boolean;
  /** Received tokens without paying SOL (airdrop / bundle push). */
  receivedFree: boolean;
}

export interface TopTradersResult {
  mint: string;
  scannedTxs: number;
  truncated: boolean;
  traders: TraderRow[];
  totalTraders: number;
  exitedCount: number;
  stillHoldingCount: number;
  totalBuyVolumeSol: number;
  totalSellVolumeSol: number;
  winners: number;
  losers: number;
}

const heliusKey = (): string => {
  return FALLBACK_HELIUS_KEY;
};

const DUST = 1e-6;

class TopTradersService {
  /**
   * Aggregates every wallet that traded a mint, from the token's own
   * transaction history.
   *
   * This is deliberately different from the holders table: a wallet that bought
   * and fully dumped holds nothing and therefore never appears as a holder, yet
   * it is often the most interesting participant. Amounts come from each
   * account's own balance deltas (native + WSOL), so the maths reconciles the
   * same way the wallet panel does.
   */
  public async fetchTopTraders(
    mint: string,
    opts: {
      maxPages?: number;
      /** Pool / program accounts that must never be counted as traders. */
      excludeAddresses?: string[];
      onProgress?: (scanned: number, traders: number) => void;
    } = {}
  ): Promise<TopTradersResult> {
    const maxPages = opts.maxPages ?? 8;
    const key = heliusKey();

    const exclude = new Set<string>([
      ...(opts.excludeAddresses || []),
      ...Object.keys(KNOWN_SPECIAL_WALLETS),
      mint,
      WSOL,
    ]);

    const map = new Map<string, TraderRow>();
    let before = '';
    let pages = 0;
    let scannedTxs = 0;
    let truncated = false;

    while (pages < maxPages) {
      const url =
        `https://api.helius.xyz/v0/addresses/${mint}/transactions` +
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
        const time = tx.timestamp || 0;

        // Per participant: SOL moved (native + wrapped) and how much of this mint
        const solByUser = new Map<string, number>();
        const tokByUser = new Map<string, number>();

        for (const a of tx.accountData || []) {
          const nat = (a.nativeBalanceChange || 0) / 1e9;
          if (nat) solByUser.set(a.account, (solByUser.get(a.account) || 0) + nat);

          for (const tb of a.tokenBalanceChanges || []) {
            const dec = tb.rawTokenAmount?.decimals ?? 0;
            const amt = Number(tb.rawTokenAmount?.tokenAmount || 0) / 10 ** dec;
            if (!Number.isFinite(amt) || amt === 0) continue;
            const user = tb.userAccount;
            if (!user) continue;
            if (tb.mint === mint) tokByUser.set(user, (tokByUser.get(user) || 0) + amt);
            else if (tb.mint === WSOL) solByUser.set(user, (solByUser.get(user) || 0) + amt);
          }
        }

        for (const [user, qty] of tokByUser) {
          if (exclude.has(user)) continue;
          const sol = solByUser.get(user) || 0;

          const row =
            map.get(user) ||
            ({
              address: user, boughtQty: 0, soldQty: 0, remainingQty: 0,
              solSpent: 0, solReceived: 0, pnlSol: 0, pnlPercent: 0,
              trades: 0, firstTime: time, lastTime: time,
              hasExited: false, receivedFree: false,
            } as TraderRow);

          row.trades++;
          row.firstTime = row.firstTime ? Math.min(row.firstTime, time) : time;
          row.lastTime = Math.max(row.lastTime, time);

          if (qty > 0) {
            row.boughtQty += qty;
            if (sol < 0) row.solSpent += -sol;
          } else {
            row.soldQty += -qty;
            if (sol > 0) row.solReceived += sol;
          }
          map.set(user, row);
        }
      }

      before = txs[txs.length - 1].signature;
      pages++;
      opts.onProgress?.(scannedTxs, map.size);
      if (txs.length < 100) break;
      if (pages === maxPages) truncated = true;
    }

    // The pool/curve sits on the other side of nearly every trade — drop it
    const poolThreshold = scannedTxs * 0.5;
    let traders = [...map.values()].filter((t) => t.trades < poolThreshold || scannedTxs < 20);

    for (const t of traders) {
      t.remainingQty = t.boughtQty - t.soldQty;
      t.pnlSol = t.solReceived - t.solSpent;
      t.pnlPercent = t.solSpent > 0 ? (t.pnlSol / t.solSpent) * 100 : 0;
      t.hasExited = t.soldQty > 0 && t.remainingQty <= Math.max(DUST, t.boughtQty * 0.01);
      t.receivedFree = t.solSpent <= DUST && t.boughtQty > 0;
    }

    traders = traders.sort((a, b) => b.pnlSol - a.pnlSol);

    const priced = traders.filter((t) => !t.receivedFree);

    return {
      mint,
      scannedTxs,
      truncated,
      traders,
      totalTraders: traders.length,
      exitedCount: traders.filter((t) => t.hasExited).length,
      stillHoldingCount: traders.filter((t) => !t.hasExited).length,
      totalBuyVolumeSol: traders.reduce((s, t) => s + t.solSpent, 0),
      totalSellVolumeSol: traders.reduce((s, t) => s + t.solReceived, 0),
      winners: priced.filter((t) => t.pnlSol > 0).length,
      losers: priced.filter((t) => t.pnlSol < 0).length,
    };
  }
}

export const topTradersService = new TopTradersService();
