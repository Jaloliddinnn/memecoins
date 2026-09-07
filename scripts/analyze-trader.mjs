#!/usr/bin/env node
/*
 * analyze-trader.mjs — profile a single Solana wallet's last N traded coins.
 *
 *   HELIUS_API_KEY=... node scripts/analyze-trader.mjs <wallet> [--coins 20] [--pages 30]
 *
 * Answers, per coin and in aggregate:
 *   - what he trades through (program IDs + Helius `source`, plus the fee
 *     wallets he pays, which is what actually identifies the bot/terminal)
 *   - what every trade costs him: base fee, priority fee, Jito tip
 *   - entry size, exit ladder shape, hold time
 *   - realized PnL over the last 24h, fees included
 *
 * Everything is reconstructed from the wallet's own balance deltas, so it holds
 * across pump.fun, PumpSwap, Raydium, Meteora, Jupiter and any custom router.
 */

const WSOL = 'So11111111111111111111111111111111111111112';
const LAMPORTS = 1e9;
const DUST = 1e-6;

// ---------------------------------------------------------------------------
// Known addresses. Only labels I am confident about — anything else is printed
// raw and left for you to identify, which is the point of the report.
// ---------------------------------------------------------------------------
const PROGRAMS = {
  '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P': 'pump.fun bonding curve',
  pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA: 'PumpSwap AMM',
  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8': 'Raydium AMM v4',
  CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK: 'Raydium CLMM',
  CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C: 'Raydium CPMM',
  LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo: 'Meteora DLMM',
  Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB: 'Meteora Pools',
  JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4: 'Jupiter aggregator v6',
  ComputeBudget111111111111111111111111111111: 'ComputeBudget (priority fee)',
  '11111111111111111111111111111111': 'System',
  TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA: 'SPL Token',
  ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL: 'Associated Token Account',
};

const JITO_TIP_ACCOUNTS = new Set([
  '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
  'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe',
  'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
  'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
  'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh',
  'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
  'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
  '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT',
]);

// ---------------------------------------------------------------------------
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58decode(str) {
  const bytes = [0];
  for (const ch of str) {
    const v = B58.indexOf(ch);
    if (v < 0) return null;
    let carry = v;
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry) { bytes.push(carry & 0xff); carry >>= 8; }
  }
  for (const ch of str) { if (ch !== '1') break; bytes.push(0); }
  return Uint8Array.from(bytes.reverse());
}

/**
 * Priority fee, read off the ComputeBudget instructions the tx actually carries.
 * SetComputeUnitPrice (tag 3) is micro-lamports per CU; SetComputeUnitLimit
 * (tag 2) is the CU ceiling. Without an explicit limit the runtime defaults to
 * 200k CU per instruction, so that is the fallback.
 */
function priorityFeeLamports(tx) {
  let price = null, limit = null;
  for (const ix of tx.instructions || []) {
    if (ix.programId !== 'ComputeBudget111111111111111111111111111111') continue;
    const d = b58decode(ix.data || '');
    if (!d || d.length === 0) continue;
    const view = new DataView(d.buffer, d.byteOffset, d.byteLength);
    if (d[0] === 3 && d.length >= 9) price = Number(view.getBigUint64(1, true));
    if (d[0] === 2 && d.length >= 5) limit = view.getUint32(1, true);
  }
  if (price == null) return { lamports: 0, price: null, limit };
  const cu = limit ?? 200_000;
  return { lamports: (price * cu) / 1e6, price, limit: cu };
}

function tipLamports(tx, wallet) {
  let jito = 0, other = [], recipients = [];
  for (const t of tx.nativeTransfers || []) {
    if (t.fromUserAccount !== wallet) continue;
    if (JITO_TIP_ACCOUNTS.has(t.toUserAccount)) { jito += t.amount; recipients.push([t.toUserAccount, t.amount]); }
    // a small outbound transfer that is not the swap itself: a bot's fee cut
    else if (t.amount > 0 && t.amount <= 0.05 * LAMPORTS) { other.push([t.toUserAccount, t.amount]); recipients.push([t.toUserAccount, t.amount]); }
  }
  return { jito, other, recipients };
}

// ---------------------------------------------------------------------------
// Overridable so the pipeline can be exercised against a local mock.
const HELIUS_BASE = process.env.HELIUS_TX_BASE || 'https://api.helius.xyz';

async function fetchPage(wallet, key, before) {
  const url = `${HELIUS_BASE}/v0/addresses/${wallet}/transactions` +
    `?api-key=${key}&limit=100${before ? `&before=${before}` : ''}`;
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (r.ok) return r.json();
    if (r.status === 429) { await new Promise((s) => setTimeout(s, 1000 * 2 ** attempt)); continue; }
    throw new Error(`Helius ${r.status}: ${(await r.text()).slice(0, 200)}`);
  }
  throw new Error('Helius rate-limited after 5 attempts');
}

async function enrich(mints) {
  const out = new Map();
  for (let i = 0; i < mints.length; i += 30) {
    try {
      const r = await fetch(
        `https://api.dexscreener.com/latest/dex/tokens/${mints.slice(i, i + 30).join(',')}`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (!r.ok) continue;
      const d = await r.json();
      for (const p of d?.pairs || []) {
        const m = p?.baseToken?.address;
        if (m && !out.has(m)) out.set(m, { symbol: p.baseToken.symbol, mcap: p.marketCap || p.fdv, dex: p.dexId });
      }
    } catch { /* names are cosmetic */ }
  }
  return out;
}

// ---------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  const wallet = args.find((a) => !a.startsWith('--'));
  const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? Number(args[i + 1]) : d; };
  const coinLimit = flag('coins', 20);
  const maxPages = flag('pages', 30);
  const key = process.env.HELIUS_API_KEY;

  if (!wallet) { console.error('usage: node scripts/analyze-trader.mjs <wallet> [--coins 20] [--pages 30]'); process.exit(1); }
  if (!key) { console.error('HELIUS_API_KEY is not set'); process.exit(1); }

  const now = Math.floor(Date.now() / 1000);
  const day = now - 86400;

  const coins = new Map();
  const programCount = new Map();
  const sourceCount = new Map();
  const feeWallets = new Map();
  const day24 = { txs: 0, swaps: 0, fee: 0, prio: 0, jito: 0, botFees: 0, solDelta: 0, in: 0, out: 0 };
  let scanned = 0, before = '', truncated = false, selfPaid = 0, payerSeen = 0;
  const prioSamples = [];
  const allTx = [];

  for (let page = 0; page < maxPages; page++) {
    const txs = await fetchPage(wallet, key, before);
    if (!Array.isArray(txs) || txs.length === 0) break;
    scanned += txs.length;

    for (const tx of txs) {
      if (!tx) continue;
      if (tx.feePayer) { payerSeen++; if (tx.feePayer === wallet) selfPaid++; }
      if (tx.transactionError) continue;

      const ts = tx.timestamp || 0;
      const self = (tx.accountData || []).find((a) => a.account === wallet);
      let solDelta = (self?.nativeBalanceChange || 0) / LAMPORTS;

      const tokenDeltas = new Map();
      for (const a of tx.accountData || []) {
        for (const tb of a.tokenBalanceChanges || []) {
          if (tb.userAccount !== wallet) continue;
          const dec = tb.rawTokenAmount?.decimals ?? 0;
          const amt = Number(tb.rawTokenAmount?.tokenAmount || 0) / 10 ** dec;
          if (!Number.isFinite(amt) || amt === 0) continue;
          if (tb.mint === WSOL) solDelta += amt;
          else tokenDeltas.set(tb.mint, (tokenDeltas.get(tb.mint) || 0) + amt);
        }
      }

      const fee = (tx.feePayer === wallet ? tx.fee || 0 : 0);
      const prio = priorityFeeLamports(tx);
      const tips = tipLamports(tx, wallet);
      const isSwap = tokenDeltas.size > 0;

      for (const ix of tx.instructions || []) {
        if (!ix.programId) continue;
        programCount.set(ix.programId, (programCount.get(ix.programId) || 0) + 1);
      }
      if (tx.source) sourceCount.set(tx.source, (sourceCount.get(tx.source) || 0) + 1);
      for (const [addr, amt] of tips.recipients) {
        const cur = feeWallets.get(addr) || { count: 0, lamports: 0 };
        cur.count++; cur.lamports += amt;
        feeWallets.set(addr, cur);
      }

      if (ts >= day) {
        day24.txs++;
        if (isSwap) day24.swaps++;
        day24.fee += fee; day24.prio += prio.lamports; day24.jito += tips.jito;
        day24.botFees += tips.other.reduce((s, [, a]) => s + a, 0);
        day24.solDelta += solDelta;
        if (solDelta < 0) day24.out += -solDelta; else day24.in += solDelta;
      }
      if (isSwap && prio.price != null) prioSamples.push(prio.price);
      if (isSwap) allTx.push({ ts, sig: tx.signature, sol: solDelta, fee, prio: prio.lamports, jito: tips.jito, src: tx.source });

      if (!isSwap) continue;

      for (const [mint, qty] of tokenDeltas) {
        let c = coins.get(mint);
        if (!c) {
          c = { mint, buys: 0, sells: 0, solIn: 0, solOut: 0, qtyIn: 0, qtyOut: 0, first: ts, last: ts,
                fee: 0, prio: 0, jito: 0, botFee: 0, sources: new Set(), buySizes: [], sellSizes: [] };
          coins.set(mint, c);
        }
        const share = tokenDeltas.size;
        c.first = c.first ? Math.min(c.first, ts) : ts;
        c.last = Math.max(c.last, ts);
        c.fee += fee / share; c.prio += prio.lamports / share;
        c.jito += tips.jito / share;
        c.botFee += tips.other.reduce((s, [, a]) => s + a, 0) / share;
        if (tx.source) c.sources.add(tx.source);
        if (qty > 0) {
          c.buys++; c.qtyIn += qty;
          if (solDelta < 0) { c.solIn += -solDelta / share; c.buySizes.push(-solDelta / share); }
        } else {
          c.sells++; c.qtyOut += -qty;
          if (solDelta > 0) { c.solOut += solDelta / share; c.sellSizes.push(solDelta / share); }
        }
      }
    }

    before = txs[txs.length - 1].signature;
    if (txs.length < 100) break;
    if (coins.size >= coinLimit) { truncated = true; break; }
    if (page === maxPages - 1) truncated = true;
  }

  const rows = [...coins.values()].sort((a, b) => b.last - a.last).slice(0, coinLimit);
  const names = await enrich(rows.map((r) => r.mint));

  const fmt = (n, d = 4) => Number(n).toFixed(d);
  const sol = (lamports) => fmt(lamports / LAMPORTS, 6);
  const ago = (t) => `${((now - t) / 3600).toFixed(1)}h ago`;
  const dur = (s) => (s < 90 ? `${s}s` : s < 5400 ? `${(s / 60).toFixed(1)}m` : `${(s / 3600).toFixed(1)}h`);
  const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

  const L = [];
  L.push(`# Wallet ${wallet}`);
  L.push(`scanned ${scanned} txs${truncated ? ' (stopped early — coin limit hit)' : ''}, ${coins.size} distinct mints seen`);
  L.push(`fee-payer on ${payerSeen ? ((selfPaid / payerSeen) * 100).toFixed(0) : 0}% of its txs (low = router/vault, not a trader)`);
  L.push('');

  L.push('## Last ' + rows.length + ' coins');
  L.push('| # | coin | mint | first buy | held | buys | sells | SOL in | SOL out | PnL SOL | PnL % | fee | prio | jito | bot fee | venue |');
  L.push('|--|--|--|--|--|--|--|--|--|--|--|--|--|--|--|--|');
  rows.forEach((c, i) => {
    const pnl = c.solOut - c.solIn;
    const meta = names.get(c.mint);
    const open = c.qtyIn - c.qtyOut > Math.max(DUST, c.qtyIn * 0.01);
    L.push(`| ${i + 1} | ${meta?.symbol || '?'}${open ? ' (OPEN)' : ''} | ${c.mint.slice(0, 6)}… | ${ago(c.first)} | ${dur(c.last - c.first)} | ${c.buys} | ${c.sells} | ${fmt(c.solIn)} | ${fmt(c.solOut)} | ${fmt(pnl)} | ${c.solIn > 0 ? fmt((pnl / c.solIn) * 100, 1) : '—'} | ${sol(c.fee)} | ${sol(c.prio)} | ${sol(c.jito)} | ${sol(c.botFee)} | ${[...c.sources].join(',') || '?'} |`);
  });
  L.push('');

  const closed = rows.filter((c) => c.qtyIn - c.qtyOut <= Math.max(DUST, c.qtyIn * 0.01));
  const wins = closed.filter((c) => c.solOut - c.solIn > 0);
  const grossPnl = rows.reduce((s, c) => s + c.solOut - c.solIn, 0);
  const allCost = rows.reduce((s, c) => s + c.fee + c.prio + c.jito + c.botFee, 0);
  const allBuys = rows.flatMap((c) => c.buySizes);
  const holds = closed.map((c) => c.last - c.first);

  L.push('## Shape of the strategy');
  L.push(`- entry size: median ${fmt(median(allBuys))} SOL, min ${fmt(allBuys.length ? Math.min(...allBuys) : 0)}, max ${fmt(allBuys.length ? Math.max(...allBuys) : 0)} (${allBuys.length} buy legs)`);
  L.push(`- buys per coin: median ${median(rows.map((c) => c.buys))}; sells per coin: median ${median(rows.map((c) => c.sells))} (>1 = laddered exit)`);
  L.push(`- hold time on closed positions: median ${dur(median(holds))}`);
  L.push(`- closed: ${closed.length}, winners ${wins.length} (${closed.length ? ((wins.length / closed.length) * 100).toFixed(0) : 0}%)`);
  L.push(`- gross PnL across these ${rows.length} coins: ${fmt(grossPnl)} SOL; fees+tips ${sol(allCost)} SOL; net ${fmt(grossPnl - allCost / LAMPORTS)} SOL`);
  L.push(`- priority-fee price: median ${median(prioSamples).toLocaleString()} micro-lamports/CU over ${prioSamples.length} swaps`);
  L.push('');

  L.push('## Last 24h');
  L.push(`- ${day24.txs} txs, ${day24.swaps} swaps`);
  L.push(`- SOL out ${fmt(day24.out)}, SOL in ${fmt(day24.in)}`);
  L.push(`- net native SOL delta (this is the honest number — fees and tips already inside): ${fmt(day24.solDelta)} SOL`);
  L.push(`- of which cost: base+priority fee ${sol(day24.fee)}, priority component ${sol(day24.prio)}, Jito tips ${sol(day24.jito)}, bot/terminal fees ${sol(day24.botFees)}`);
  L.push(`- cost per swap: ${day24.swaps ? sol((day24.fee + day24.jito + day24.botFees) / day24.swaps) : 0} SOL`);
  L.push('');
  L.push('Caveat: the 24h delta counts coins still open at their cost, not their value.');
  L.push('Positions opened before the window and sold inside it inflate it; the reverse deflates it.');
  L.push('');

  L.push('## What he trades through');
  L.push('| program | txs | label |');
  L.push('|--|--|--|');
  [...programCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)
    .forEach(([p, n]) => L.push(`| ${p} | ${n} | ${PROGRAMS[p] || '**unlabelled — likely the bot/router itself**'} |`));
  L.push('');
  L.push('Helius `source` tags: ' + ([...sourceCount.entries()].sort((a, b) => b[1] - a[1]).map(([s, n]) => `${s}×${n}`).join(', ') || 'none'));
  L.push('');
  L.push('## Wallets he pays a cut to (this is what names the bot)');
  L.push('| recipient | payments | total SOL | note |');
  L.push('|--|--|--|--|');
  [...feeWallets.entries()].sort((a, b) => b[1].lamports - a[1].lamports).slice(0, 10)
    .forEach(([a, v]) => L.push(`| ${a} | ${v.count} | ${sol(v.lamports)} | ${JITO_TIP_ACCOUNTS.has(a) ? 'Jito tip account' : 'search this address on solscan — it is the terminal/bot fee wallet'} |`));

  const out = L.join('\n');
  console.log(out);
  const fs = await import('node:fs');
  fs.writeFileSync(`trader-${wallet.slice(0, 6)}.md`, out);
  fs.writeFileSync(`trader-${wallet.slice(0, 6)}.json`, JSON.stringify(
    { wallet, scanned, day24, coins: rows.map((c) => ({ ...c, sources: [...c.sources] })), programs: [...programCount], feeWallets: [...feeWallets] }, null, 2));
  console.error(`\nwrote trader-${wallet.slice(0, 6)}.md and .json`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
