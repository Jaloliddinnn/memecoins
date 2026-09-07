/**
 * Coat-tail sniper.
 *
 *   watch N scammer wallets  ->  one of them opens a block-0 stack
 *   ->  clone their buy for our size  ->  fan out to every relay
 *   ->  sell everything HOLD_SECONDS later
 *
 * Run it with --dry first. Seriously. --dry does the full path including
 * building and signing, and stops before the send, so you can watch it react
 * to real launches for a day and read the "would have fired at slot +N" line.
 * If that line says +1 or worse, your feed is too slow and the trade loses
 * money — see docs/Sniper Build Plan.md §2.
 */

import { Connection, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import {
  TARGETS, MIN_TARGET_SOL, BUY_SOL, MAX_SOL_MULTIPLIER, HOLD_SECONDS,
  MAX_CONCURRENT, DAILY_STOP_LOSS, RPC_URL, GRPC_URL, GRPC_TOKEN,
  PUMP_SWAP, SELL_DISCRIMINATOR, loadWallet, DRY_RUN,
} from './config.mjs';
import { findTargetBuy, cloneBuy, cloneSell } from './clone.mjs';
import { BlockhashCache, fanOut } from './send.mjs';

const wallet = loadWallet();
const connection = new Connection(RPC_URL, 'confirmed');
const blockhashes = new BlockhashCache(connection);

const state = { open: 0, realised: 0, fired: 0, landed: 0, missed: 0 };
const seen = new Set();

function log(...args) {
  console.log(new Date().toISOString().slice(11, 23), ...args);
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

async function onTargetBuy({ target, targetWallet, targetSlot }) {
  if (seen.has(target.mint)) return;
  seen.add(target.mint);

  if (target.maxSolCost < MIN_TARGET_SOL) {
    log(`skip ${target.mint.slice(0, 8)} — target only committed ~${target.maxSolCost.toFixed(1)} SOL`);
    return;
  }
  if (state.open >= MAX_CONCURRENT) {
    log(`skip ${target.mint.slice(0, 8)} — already holding ${state.open}`);
    return;
  }
  if (state.realised <= DAILY_STOP_LOSS) {
    log(`STOPPED — daily loss limit hit (${state.realised.toFixed(3)} SOL)`);
    return;
  }

  const t0 = Date.now();
  const blockhash = blockhashes.value;
  if (!blockhash) return log('no cached blockhash yet — skipping');

  const { instruction, ata, tokenProgram, mint } = cloneBuy({
    target,
    buyer: wallet.publicKey,
    solIn: BUY_SOL,
    maxSolMultiplier: MAX_SOL_MULTIPLIER,
  });

  state.open++;
  state.fired++;
  log(
    `FIRE ${target.mint} — target ${targetWallet.slice(0, 8)} committed ` +
      `${target.maxSolCost.toFixed(1)} SOL, we send ${BUY_SOL}`
  );

  try {
    const { signature, sent, dry } = await fanOut({
      payer: wallet,
      instructions: [instruction],
      blockhash,
    });
    log(`  built+sent in ${Date.now() - t0}ms via [${sent.join(', ') || 'dry'}] ${signature}`);
    if (dry) {
      state.open--;
      await reportWouldHaveLanded(targetSlot, mint);
      return;
    }
    await settle({ signature, mint, ata, tokenProgram, targetSlot });
  } catch (err) {
    state.open--;
    state.missed++;
    log(`  send failed: ${err.message}`);
  }
}

/**
 * In dry mode we cannot know our slot, so measure the next best thing: how far
 * the price has already moved by the time we could have acted. This is the
 * number that decides whether the whole operation is viable.
 */
async function reportWouldHaveLanded(targetSlot, mint) {
  await new Promise((r) => setTimeout(r, 2500));
  try {
    const current = await connection.getSlot('confirmed');
    log(`  [dry] target landed in slot ${targetSlot}; we reacted ~${current - targetSlot} slots later`);
  } catch {
    /* informational only */
  }
}

// ---------------------------------------------------------------------------
// Exit
// ---------------------------------------------------------------------------

async function settle({ signature, mint, ata, tokenProgram, targetSlot }) {
  try {
    await connection.confirmTransaction(signature, 'confirmed');
  } catch {
    state.open--;
    state.missed++;
    return log(`  MISSED — buy never confirmed (${signature.slice(0, 16)})`);
  }

  const tx = await connection.getTransaction(signature, {
    maxSupportedTransactionVersion: 0,
    commitment: 'confirmed',
  });
  const delta = tx.slot - targetSlot;
  if (delta === 0) state.landed++;
  else state.missed++;
  log(`  LANDED in slot ${tx.slot} (target was ${targetSlot}, delta +${delta})`);
  if (delta > 0) {
    log('  ⚠ one slot late costs ~13.5% of an ~18% move — this trade is likely underwater');
  }

  setTimeout(() => exit({ mint, ata, tokenProgram }), HOLD_SECONDS * 1000);
}

/** Find any recent PumpSwap sell on this mint and clone its account list. */
async function findSellTemplate(mint) {
  const sigs = await connection.getSignaturesForAddress(new PublicKey(mint), { limit: 60 });
  for (const s of sigs) {
    if (s.err) continue;
    const tx = await connection.getTransaction(s.signature, {
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed',
      encoding: 'json',
    });
    if (!tx) continue;
    const keys = [
      ...tx.transaction.message.accountKeys,
      ...(tx.meta?.loadedAddresses?.writable ?? []),
      ...(tx.meta?.loadedAddresses?.readonly ?? []),
    ];
    for (const ix of tx.transaction.message.instructions) {
      if (keys[ix.programIdIndex] !== PUMP_SWAP) continue;
      const data = Buffer.from(bs58.decode(ix.data));
      if (data.subarray(0, 8).toString('hex') !== SELL_DISCRIMINATOR) continue;
      if (ix.accounts.length < 12) continue;
      return { template: ix, keys };
    }
  }
  return null;
}

async function exit({ mint, ata, tokenProgram }) {
  try {
    const balance = await connection.getTokenAccountBalance(ata);
    const raw = balance.value.amount;
    if (raw === '0') {
      state.open--;
      return log(`  nothing to sell on ${mint.toBase58().slice(0, 8)}`);
    }

    const found = await findSellTemplate(mint.toBase58());
    if (!found) {
      state.open--;
      return log(`  ⚠ no PumpSwap sell template found for ${mint.toBase58().slice(0, 8)} — SELL MANUALLY`);
    }

    const instruction = cloneSell({
      template: found.template,
      keys: found.keys,
      seller: wallet.publicKey,
      tokenAmountRaw: raw,
    });

    const { signature, sent } = await fanOut({
      payer: wallet,
      instructions: [instruction],
      blockhash: blockhashes.value,
    });
    log(`  EXIT sent via [${sent.join(', ') || 'dry'}] ${signature}`);
  } catch (err) {
    log(`  ⚠ EXIT FAILED on ${mint.toBase58()} — SELL MANUALLY: ${err.message}`);
  } finally {
    state.open--;
  }
}

// ---------------------------------------------------------------------------
// Feed
// ---------------------------------------------------------------------------

async function watchGrpc() {
  const { default: Client, CommitmentLevel } = await import('@triton-one/yellowstone-grpc');
  const client = new Client(GRPC_URL, GRPC_TOKEN || undefined, undefined);
  const stream = await client.subscribe();

  stream.on('data', (chunk) => {
    const tx = chunk?.transaction?.transaction;
    if (!tx) return;
    try {
      const message = tx.transaction?.message;
      if (!message) return;
      const keys = [
        ...message.accountKeys.map((k) => bs58.encode(k)),
        ...(tx.meta?.loadedWritableAddresses ?? []).map((k) => bs58.encode(k)),
        ...(tx.meta?.loadedReadonlyAddresses ?? []).map((k) => bs58.encode(k)),
      ];
      const hit = TARGETS.find((t) => keys.includes(t));
      if (!hit) return;
      const target = findTargetBuy({ message }, keys);
      if (!target) return;
      onTargetBuy({
        target,
        targetWallet: hit,
        targetSlot: Number(chunk.transaction.slot),
      });
    } catch (err) {
      log('stream parse error:', err.message);
    }
  });

  stream.on('error', (err) => {
    log('gRPC stream error, reconnecting in 2s:', err.message);
    setTimeout(watchGrpc, 2000);
  });

  await new Promise((resolve, reject) => {
    stream.write(
      {
        accounts: {},
        slots: {},
        transactions: {
          targets: { accountInclude: TARGETS, accountExclude: [], accountRequired: [] },
        },
        blocks: {},
        blocksMeta: {},
        entry: {},
        accountsDataSlice: [],
        commitment: CommitmentLevel.PROCESSED,
      },
      (err) => (err ? reject(err) : resolve())
    );
  });

  log(`gRPC subscribed — watching ${TARGETS.length} wallets at PROCESSED commitment`);
}

// ---------------------------------------------------------------------------

async function main() {
  if (!TARGETS.length) throw new Error('TARGET_WALLETS is empty — nothing to watch');
  if (!RPC_URL) throw new Error('RPC_URL missing');

  log(`wallet   ${wallet.publicKey.toBase58()}`);
  log(`balance  ${((await connection.getBalance(wallet.publicKey)) / 1e9).toFixed(3)} SOL`);
  log(`targets  ${TARGETS.length}`);
  log(`size     ${BUY_SOL} SOL, hold ${HOLD_SECONDS}s, max ${MAX_CONCURRENT} concurrent`);
  log(DRY_RUN ? 'MODE     DRY RUN — nothing will be sent' : 'MODE     LIVE — real money');

  if (!GRPC_URL) {
    throw new Error(
      'GRPC_URL missing. A plain RPC websocket delivers the block after it is built, ' +
        'which puts you a slot behind and loses money — see docs/Sniper Build Plan.md §2.'
    );
  }
  await watchGrpc();

  setInterval(() => {
    const rate = state.fired ? ((state.landed / state.fired) * 100).toFixed(0) : '—';
    log(`stats  fired=${state.fired} landed=${state.landed} missed=${state.missed} slot0=${rate}% open=${state.open}`);
  }, 60_000);
}

process.on('unhandledRejection', (err) => log('unhandled:', err?.message ?? err));
main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
