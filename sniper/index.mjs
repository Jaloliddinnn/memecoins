/**
 * Coat-tail sniper.
 *
 *   watch the target wallets  ->  one opens a block-0 buy
 *   ->  clone their instruction for our size  ->  fan out to every relay
 *   ->  sell everything holdSeconds later
 *
 * Run `node setup.mjs` first, then `node index.mjs --dry` for a day.
 *
 * --dry does the whole path including building and signing and stops before the
 * send, then prints how many slots behind the target we reacted. That number is
 * the entire business: one slot late costs ~13.5% of an ~18% move against ~5%
 * round-trip friction. See docs/Sniper Build Plan.md §2.
 */

import { Connection, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import {
  readConfig, writeConfig, validate, RPC_URL, GRPC_URL, GRPC_TOKEN, RELAYS,
  loadWallet, DRY_RUN, computeUnitPrice, PANEL_URL, pullPanelConfig,
} from './config.mjs';
import {
  findTargetBuy, cloneBuy, cloneSell, findPumpSwapSell, accountFlags,
} from './clone.mjs';
import { BlockhashCache, fanOut } from './send.mjs';

const wallet = loadWallet();
const connection = new Connection(RPC_URL, 'confirmed');
const blockhashes = new BlockhashCache(connection);

let config = readConfig();
const state = { open: 0, fired: 0, slot0: 0, late: 0, missed: 0, realised: 0, startedAt: Date.now() };
const seenMints = new Set();

const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);

/**
 * Hot reload from disk, and — if PANEL_URL is set — from the phone panel.
 *
 * A rejected config is never adopted: the running settings stay in force and
 * the reason is logged. Silently trading on an invalid config is worse than
 * trading on a stale one.
 */
function adopt(next, source) {
  if (JSON.stringify(next) === JSON.stringify(config)) return;
  const errors = validate(next);
  if (errors.length) return log(`config from ${source} REJECTED: ${errors.join(' ')}`);
  config = next;
  log(
    `config reloaded from ${source} — ${config.targets.length} target(s), ${config.buySol} SOL, ` +
      `${(config.priorityFeeSol + config.tipSol).toFixed(4)} SOL/attempt, ` +
      `${config.enabled ? 'ARMED' : 'PAUSED'}`
  );
}

setInterval(() => adopt(readConfig(), 'disk'), 3000).unref?.();

if (PANEL_URL) {
  setInterval(async () => {
    try {
      const remote = await pullPanelConfig();
      if (remote) {
        adopt({ ...readConfig(), ...remote }, 'panel');
        writeConfig(remote);
      }
    } catch (err) {
      log('panel poll failed:', err.message);
    }
  }, 5000).unref?.();
}

// ---------------------------------------------------------------------------
// Decoding a streamed transaction into a uniform shape
// ---------------------------------------------------------------------------

const b58 = (v) => (typeof v === 'string' ? v : bs58.encode(v));

function decode(streamed) {
  const inner = streamed.transaction ?? streamed;
  const message = inner.transaction?.message ?? inner.message;
  if (!message) return null;

  const staticKeys = (message.accountKeys ?? []).map(b58);
  const loadedWritable = (streamed.meta?.loadedWritableAddresses ?? []).map(b58);
  const loadedReadonly = (streamed.meta?.loadedReadonlyAddresses ?? []).map(b58);
  const keys = [...staticKeys, ...loadedWritable, ...loadedReadonly];

  const flagsFor = accountFlags({
    header: message.header,
    staticKeyCount: staticKeys.length,
    loadedWritableCount: loadedWritable.length,
    totalKeys: keys.length,
  });

  // gRPC hands instruction account indexes as a Buffer; JSON RPC as an array.
  const instructions = (message.instructions ?? []).map((ix) => ({
    programIdIndex: ix.programIdIndex,
    accounts: Array.isArray(ix.accounts) ? ix.accounts : Array.from(ix.accounts ?? []),
    data: Buffer.from(ix.data ?? []),
  }));

  return { message: { instructions }, keys, flagsFor };
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

async function onTargetBuy({ target, targetWallet, targetSlot }) {
  if (seenMints.has(target.mint)) return;
  seenMints.add(target.mint);

  if (!config.enabled) return log(`paused — skipping ${target.mint.slice(0, 8)}`);
  if (target.maxSolCost < config.minTargetSol) {
    return log(`skip ${target.mint.slice(0, 8)} — target only committed ~${target.maxSolCost.toFixed(1)} SOL`);
  }
  if (state.open >= config.maxConcurrent) {
    return log(`skip ${target.mint.slice(0, 8)} — already holding ${state.open}`);
  }
  if (state.realised <= config.dailyStopLossSol) {
    return log(`STOPPED — daily stop loss hit (${state.realised.toFixed(3)} SOL)`);
  }
  if (blockhashes.stale) return log('skip — blockhash is stale, RPC may be down');

  const t0 = Date.now();
  const built = cloneBuy({
    target,
    buyer: wallet.publicKey,
    solIn: config.buySol,
    maxSolMultiplier: 1 + config.maxSlippagePercent / 100,
    curveFractionSold: config.curveFractionSold,
  });

  state.open++;
  state.fired++;
  log(
    `FIRE ${target.mint} | target ${targetWallet.slice(0, 8)} committed ~${target.maxSolCost.toFixed(1)} SOL | ` +
      `we buy ${config.buySol} SOL for ~${Math.round(built.estimatedTokens).toLocaleString()} tokens ` +
      `(ceiling ${built.maxSol.toFixed(3)})`
  );

  try {
    const result = await fanOut({
      payer: wallet,
      instructions: built.instructions,
      blockhash: blockhashes.value,
      config,
    });
    log(`  built+signed in ${Date.now() - t0}ms, sent via [${result.sent.join(', ') || 'DRY'}]`);

    if (result.dry) {
      state.open--;
      const now = await connection.getSlot('processed').catch(() => targetSlot);
      const behind = now - targetSlot;
      state.slot0 += behind <= 0 ? 1 : 0;
      state.late += behind > 0 ? 1 : 0;
      log(`  [dry] target slot ${targetSlot}, we were ready ~${behind} slot(s) later` +
        (behind > 0 ? '  ⚠ too slow to profit — see README' : '  ✓ same slot'));
      return;
    }
    await settle({ signature: result.signatures[0], built, targetSlot });
  } catch (err) {
    state.open--;
    state.missed++;
    log(`  send failed: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Confirmation and exit
// ---------------------------------------------------------------------------

async function settle({ signature, built, targetSlot }) {
  let tx = null;
  for (let i = 0; i < 20 && !tx; i++) {
    await new Promise((r) => setTimeout(r, 500));
    tx = await connection
      .getTransaction(signature, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' })
      .catch(() => null);
  }

  if (!tx) {
    state.open--;
    state.missed++;
    return log(`  MISSED — buy never landed (${signature.slice(0, 16)}…)`);
  }
  if (tx.meta?.err) {
    state.open--;
    state.missed++;
    return log(`  REVERTED — ${JSON.stringify(tx.meta.err).slice(0, 120)}`);
  }

  const behind = tx.slot - targetSlot;
  if (behind <= 0) state.slot0++;
  else state.late++;
  const spent = (tx.meta.preBalances[0] - tx.meta.postBalances[0]) / 1e9;
  state.realised -= spent;
  log(`  LANDED slot ${tx.slot} (target ${targetSlot}, +${behind}) spent ${spent.toFixed(4)} SOL`);
  if (behind > 0) log('  ⚠ a slot late — this trade is probably underwater before it starts');

  setTimeout(() => exit(built), config.holdSeconds * 1000);
}

/** Find any recent PumpSwap sell on this mint and lift its pool accounts. */
async function findSellTemplate(mint) {
  const sigs = await connection.getSignaturesForAddress(new PublicKey(mint), { limit: 80 });
  for (const s of sigs) {
    if (s.err) continue;
    const tx = await connection
      .getTransaction(s.signature, {
        maxSupportedTransactionVersion: 0,
        commitment: 'confirmed',
        encoding: 'json',
      })
      .catch(() => null);
    if (!tx) continue;
    const decoded = decode({
      transaction: { message: tx.transaction.message },
      meta: {
        loadedWritableAddresses: tx.meta?.loadedAddresses?.writable ?? [],
        loadedReadonlyAddresses: tx.meta?.loadedAddresses?.readonly ?? [],
      },
    });
    if (!decoded) continue;
    decoded.message.instructions = tx.transaction.message.instructions.map((ix) => ({
      programIdIndex: ix.programIdIndex,
      accounts: ix.accounts,
      data: bs58.decode(ix.data),
    }));
    const accounts = findPumpSwapSell(decoded);
    if (accounts) return accounts;
  }
  return null;
}

async function exit(built) {
  const mint = built.mint.toBase58();
  try {
    const balance = await connection.getTokenAccountBalance(built.ata);
    if (balance.value.amount === '0') return log(`  nothing to sell on ${mint.slice(0, 8)}`);

    const accounts = await findSellTemplate(mint);
    if (!accounts) {
      return log(`  ⚠ no PumpSwap sell template for ${mint} — SELL MANUALLY`);
    }

    const sell = cloneSell({
      accounts,
      seller: wallet.publicKey,
      tokenAmountRaw: balance.value.amount,
    });
    const result = await fanOut({
      payer: wallet,
      instructions: sell.instructions,
      blockhash: blockhashes.value,
      config,
    });
    log(`  EXIT sent via [${result.sent.join(', ') || 'DRY'}] ${result.signatures[0]}`);

    if (!result.dry) {
      const tx = await connection
        .getTransaction(result.signatures[0], { maxSupportedTransactionVersion: 0, commitment: 'confirmed' })
        .catch(() => null);
      if (tx && !tx.meta?.err) {
        const got = (tx.meta.postBalances[0] - tx.meta.preBalances[0]) / 1e9;
        state.realised += got;
        log(`  EXIT filled, +${got.toFixed(4)} SOL | day PnL ${state.realised.toFixed(4)} SOL`);
      } else {
        log(`  ⚠ EXIT did not confirm on ${mint} — SELL MANUALLY`);
      }
    }
  } catch (err) {
    log(`  ⚠ EXIT FAILED on ${mint} — SELL MANUALLY: ${err.message}`);
  } finally {
    state.open--;
  }
}

// ---------------------------------------------------------------------------
// Feed
// ---------------------------------------------------------------------------

async function watchGrpc() {
  const mod = await import('@triton-one/yellowstone-grpc');
  const Client = mod.default?.default ?? mod.default;
  const CommitmentLevel = mod.CommitmentLevel ?? mod.default?.CommitmentLevel;

  const client = new Client(GRPC_URL, GRPC_TOKEN || undefined, undefined);
  const stream = await client.subscribe();

  stream.on('data', (chunk) => {
    if (!chunk?.transaction) return;
    try {
      const decoded = decode(chunk.transaction);
      if (!decoded) return;
      const hit = config.targets.find((t) => decoded.keys.includes(t));
      if (!hit) return;
      const target = findTargetBuy(decoded);
      if (!target) return;
      onTargetBuy({ target, targetWallet: hit, targetSlot: Number(chunk.transaction.slot) });
    } catch (err) {
      log('stream parse error:', err.message);
    }
  });

  stream.on('error', (err) => {
    log('gRPC error, reconnecting in 2s:', err.message);
    setTimeout(() => watchGrpc().catch((e) => log('reconnect failed:', e.message)), 2000);
  });

  await new Promise((resolve, reject) => {
    stream.write(
      {
        accounts: {}, slots: {}, blocks: {}, blocksMeta: {}, entry: {}, accountsDataSlice: [],
        transactions: {
          targets: { accountInclude: config.targets, accountExclude: [], accountRequired: [], vote: false, failed: false },
        },
        commitment: CommitmentLevel.PROCESSED,
      },
      (err) => (err ? reject(err) : resolve())
    );
  });

  log(`gRPC subscribed — ${config.targets.length} wallets at PROCESSED commitment`);
}

// ---------------------------------------------------------------------------

async function main() {
  const errors = validate(config);
  if (errors.length) {
    console.error('\nConfiguration problems:\n  ' + errors.join('\n  ') + '\n\nRun `node setup.mjs`.\n');
    process.exit(1);
  }
  if (!RPC_URL) throw new Error('RPC_URL missing — run `node setup.mjs`');
  if (!RELAYS.length) throw new Error('No relays configured — run `node setup.mjs`');
  if (!GRPC_URL) {
    throw new Error(
      'GRPC_URL missing. A plain RPC websocket delivers the block after it is built, ' +
        'putting you a slot behind — which loses money. See docs/Sniper Build Plan.md §2.'
    );
  }

  const balance = (await connection.getBalance(wallet.publicKey)) / 1e9;
  const perAttempt = config.priorityFeeSol + config.tipSol;

  log(`wallet    ${wallet.publicKey.toBase58()}`);
  log(`balance   ${balance.toFixed(4)} SOL`);
  log(`targets   ${config.targets.length}  ${config.targets.map((t) => t.slice(0, 6)).join(' ')}`);
  log(`size      ${config.buySol} SOL, hold ${config.holdSeconds}s, max ${config.maxConcurrent} open`);
  log(`fees      ${perAttempt.toFixed(4)} SOL/attempt (${config.priorityFeeSol} priority + ${config.tipSol} tip) ` +
    `= ${computeUnitPrice(config.priorityFeeSol, config.computeUnitLimit).toLocaleString()} µlamports/CU`);
  log(`relays    ${RELAYS.map((r) => r.name).join(', ')}`);
  log(DRY_RUN ? 'MODE      DRY RUN — nothing will be sent' : 'MODE      LIVE — real money');

  if (balance < config.buySol + perAttempt) {
    log(`⚠ balance is below one trade (${(config.buySol + perAttempt).toFixed(3)} SOL needed)`);
  }

  await watchGrpc();

  setInterval(() => {
    const attempts = state.slot0 + state.late;
    const rate = attempts ? ((state.slot0 / attempts) * 100).toFixed(0) : '—';
    log(`stats  fired=${state.fired} slot0=${state.slot0} late=${state.late} missed=${state.missed} ` +
      `slot0Rate=${rate}% open=${state.open} pnl=${state.realised.toFixed(4)} SOL`);
  }, 60_000).unref?.();
}

process.on('unhandledRejection', (e) => log('unhandled:', e?.message ?? e));
main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
