/**
 * Coat-tail sniper.
 *
 *   watch the target wallets  ->  one opens a block-0 buy
 *   ->  clone their instruction for our size  ->  fan out to every relay
 *   ->  sell holdSeconds later, or leave the bag for you when holdSeconds is 0
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
import { record, setStatus, startReporting } from './report.mjs';

let wallet;
try {
  wallet = loadWallet();
} catch (err) {
  // Thrown at module load, before main()'s handling — so catch it here and say
  // the one useful thing instead of a stack trace. This is the first thing a
  // new user sees in the control panel's log.
  console.error(`\n  ${err.message}\n  Set a wallet at the top of the control panel and press Save.\n`);
  process.exit(1);
}
const connection = new Connection(RPC_URL, 'confirmed');
const blockhashes = new BlockhashCache(connection);

let config = readConfig();
const state = { open: 0, fired: 0, slot0: 0, late: 0, missed: 0, realised: 0, startedAt: Date.now() };
const seenMints = new Set();

const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);

/** Log locally and push to the panel in one call. */
const report = (kind, message, extra) => {
  log(message);
  record(kind, message, extra);
};

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

let onConnectionChange = () => {};

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
  // Both rails are opt-in: 0 means the user turned them off.
  if (config.maxConcurrent > 0 && state.open >= config.maxConcurrent) {
    return log(`skip ${target.mint.slice(0, 8)} — already holding ${state.open}`);
  }
  if (config.dailyStopLossSol < 0 && state.realised <= config.dailyStopLossSol) {
    // In manual mode nothing is ever credited back, so this number is total
    // spend rather than PnL. Say which one it is, or the line reads as a loss.
    return log(
      config.holdSeconds > 0
        ? `STOPPED — daily stop loss hit (${state.realised.toFixed(3)} SOL)`
        : `STOPPED — spent ${Math.abs(state.realised).toFixed(3)} SOL on buys, ` +
          `the budget. Sell your bags, then restart to reset it.`
    );
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
  report(
    'fire',
    `FIRE — target ${targetWallet.slice(0, 8)} committed ~${target.maxSolCost.toFixed(1)} SOL, ` +
      `we buy ${config.buySol} SOL (ceiling ${built.maxSol.toFixed(3)})`,
    { mint: target.mint, targetWallet, targetSol: target.maxSolCost, ourSol: config.buySol }
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
      report(
        behind > 0 ? 'late' : 'land',
        `DRY: ready ~${behind} slot(s) after the target` +
          (behind > 0 ? ' — too slow to profit at this distance' : ' — same slot'),
        { mint: target.mint, behind, targetSlot }
      );
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
    return report('miss', `MISSED — buy never landed (${signature.slice(0, 12)}…)`, { mint: built.mint.toBase58() });
  }
  if (tx.meta?.err) {
    state.open--;
    state.missed++;
    return report('miss', `REVERTED — ${JSON.stringify(tx.meta.err).slice(0, 120)}`, { mint: built.mint.toBase58() });
  }

  const behind = tx.slot - targetSlot;
  if (behind <= 0) state.slot0++;
  else state.late++;
  const spent = (tx.meta.preBalances[0] - tx.meta.postBalances[0]) / 1e9;
  state.realised -= spent;
  report(
    behind > 0 ? 'late' : 'land',
    `LANDED slot ${tx.slot}, ${behind === 0 ? 'same slot as the target' : `+${behind} slot(s) late`}, spent ${spent.toFixed(4)} SOL`,
    { mint: built.mint.toBase58(), behind, spent }
  );

  if (config.holdSeconds > 0) {
    setTimeout(() => exit(built), config.holdSeconds * 1000);
    return;
  }

  // Manual mode. The bot is done with this coin — it will never sell it. Free
  // the concurrency slot now, or maxConcurrent would jam after the first buy
  // and the bot would sit there watching launches go by.
  state.open--;
  report('hold', `HOLDING ${built.mint.toBase58()} — sell it yourself`, {
    mint: built.mint.toBase58(),
    manual: true,
  });
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
      return report('error', `No PumpSwap sell template found — SELL MANUALLY`, { mint });
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
        report('exit', `EXIT filled +${got.toFixed(4)} SOL — day PnL ${state.realised.toFixed(4)} SOL`, { mint, got });
      } else {
        report('error', `EXIT did not confirm — SELL MANUALLY`, { mint });
      }
    }
  } catch (err) {
    report('error', `EXIT FAILED — SELL MANUALLY: ${err.message}`, { mint });
  } finally {
    state.open--;
  }
}

// ---------------------------------------------------------------------------
// Feed
// ---------------------------------------------------------------------------

let feedFailures = 0;
let feedGeneration = 0;
let reconnecting = false;

/**
 * gRPC status codes are not advice. Turn the three that actually happen into
 * the thing to go and do, and for an IP block fetch the address the provider
 * is really seeing — it is never the one you remember whitelisting.
 */
function diagnoseFeedError(err) {
  const text = `${err.message ?? ''} ${err.details ?? ''}`;

  if (/unauthorized ip|permission_denied/i.test(text)) {
    log('  → The feed refused this connection. Three things cause this, in the');
    log('  →  order they are worth checking:');
    log('  →  1. The subscription expired. Check the console says Active.');
    log('  →  2. The connection limit is already used. These plans often allow');
    log('  →     one; another bot, an old process, or a leaked reconnect holds');
    log('  →     it. Check "Active connections" — it should read 0 when idle.');
    log('  →  3. The IP is not whitelisted.');
    fetch('https://api.ipify.org', { signal: AbortSignal.timeout(4000) })
      .then((r) => r.text())
      .then((ip) => log(`  → This machine is going out as: ${ip.trim()}`))
      .catch(() => log('  → Could not read your public IP; run: curl ifconfig.me'));
    return;
  }
  if (/unauthenticated|invalid token|401/i.test(text)) {
    log('  → The feed rejected the token. Check "Feed token" under Advanced,');
    log('  →  or leave it blank if the feed authenticates by IP instead.');
    return;
  }
  if (/unavailable|econnrefused|enotfound|dns/i.test(text)) {
    log('  → Cannot reach the feed at all. Check the Feed URL host and port,');
    log('  →  and that it starts with http:// (plain) or https:// (TLS).');
  }
}

/**
 * Tear down the previous feed before opening another. Feeds are sold by the
 * connection — AllenHark's entry plan allows exactly one — so a reconnect that
 * leaks its predecessor spends the whole allowance on dead sockets and the
 * provider starts refusing the live one. That refusal arrives as
 * PERMISSION_DENIED, which reads like a whitelist problem and is not.
 */
let feed = { client: null, stream: null };

function closeFeed() {
  const { client, stream } = feed;
  feed = { client: null, stream: null };
  try {
    stream?.removeAllListeners?.();
    stream?.end?.();
    stream?.destroy?.();
  } catch { /* already gone */ }
  try {
    client?.close?.();
  } catch { /* already gone */ }
}

async function watchGrpc() {
  const mod = await import('@triton-one/yellowstone-grpc');
  const Client = mod.default?.default ?? mod.default;
  const CommitmentLevel = mod.CommitmentLevel ?? mod.default?.CommitmentLevel;
  const SubscribeRequest = mod.SubscribeRequest ?? mod.default?.SubscribeRequest;

  closeFeed();
  const client = new Client(GRPC_URL, GRPC_TOKEN || undefined, undefined);
  const stream = await client.subscribe();
  feed = { client, stream };

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
    onConnectionChange(false);
    // A stream can emit 'error' more than once on the way down, and each one
    // used to start its own reconnect chain — the loops multiply and bury the
    // log. One reconnect in flight at a time.
    if (reconnecting) return;
    reconnecting = true;

    const delay = Math.min(2000 * 2 ** feedFailures, 30_000);
    feedFailures++;
    report('error', `Feed dropped: ${err.message}`);
    if (feedFailures === 1) diagnoseFeedError(err);
    log(`  retrying in ${(delay / 1000).toFixed(0)}s (attempt ${feedFailures})`);

    closeFeed();
    setTimeout(() => {
      reconnecting = false;
      watchGrpc().catch((e) => log('reconnect failed:', e.message));
    }, delay);
  });

  await new Promise((resolve, reject) => {
    // Built with fromPartial rather than a hand-written literal. The request
    // has more fields than the ones that matter here (transactionsStatus, ping,
    // fromSlot), and omitting any of them fails serialization with an opaque
    // "Cannot convert undefined or null to object" — which reads like a network
    // fault and is not. fromPartial fills the rest, and keeps filling them if
    // the library adds more.
    const request = SubscribeRequest.fromPartial({
      transactions: {
        targets: {
          accountInclude: config.targets,
          accountExclude: [],
          accountRequired: [],
          vote: false,
          failed: false,
        },
      },
      commitment: CommitmentLevel.PROCESSED,
    });
    stream.write(request, (err) => (err ? reject(err) : resolve()));
  });

  onConnectionChange(true);
  report('info', `Feed connected — watching ${config.targets.length} wallet(s) at PROCESSED commitment`);

  // A subscription the provider refuses still "connects" — the handshake
  // succeeds and the rejection arrives a fraction of a second later. Resetting
  // the backoff here would call that a success and hammer the endpoint every
  // 2s forever, which is exactly what it did. Only a feed that stays up counts.
  // Tie the reset to this specific connection: closeFeed() strips listeners, so
  // a timer from a dead attempt must not clear the counter for a live one.
  const generation = ++feedGeneration;
  const settle = setTimeout(() => {
    if (generation === feedGeneration) feedFailures = 0;
  }, 30_000);
  settle.unref?.();
}

// ---------------------------------------------------------------------------

async function main() {
  /**
   * On a platform like Railway there is no config.json — the filesystem is
   * ephemeral and setup.mjs is interactive, so it cannot be run there. The
   * settings come from the /sniper panel instead, and they have to be fetched
   * BEFORE validation or the bot exits on "no targets" and crash-loops.
   */
  if (PANEL_URL) {
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        const remote = await pullPanelConfig();
        if (remote) {
          config = { ...config, ...remote };
          writeConfig(remote);
          log(`config pulled from panel — ${config.targets.length} target(s)`);
          break;
        }
      } catch (err) {
        log(`panel unreachable (${err.message}), retrying in 6s`);
        await new Promise((r) => setTimeout(r, 6000));
      }
    }
  }

  const errors = validate(config);
  if (errors.length) {
    if (PANEL_URL) {
      // Waiting is right here: the operator fixes it on the panel and the
      // hot-reload picks it up. Exiting would just crash-loop the container.
      log('Waiting for a usable config from the panel:');
      for (const e of errors) log('  · ' + e);
      log(`Open ${PANEL_URL}/sniper, set your targets, and press Save.`);
      await new Promise((resolve) => {
        const timer = setInterval(() => {
          if (!validate(config).length) {
            clearInterval(timer);
            log('config is now valid — starting');
            resolve();
          }
        }, 5000);
      });
    } else {
      console.error('\nConfiguration problems:\n  ' + errors.join('\n  ') + '\n\nRun `node setup.mjs`.\n');
      process.exit(1);
    }
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
  log(`size      ${config.buySol} SOL, ` +
    (config.holdSeconds > 0 ? `hold ${config.holdSeconds}s` : 'MANUAL EXIT — the bot never sells') +
    `, ${config.maxConcurrent > 0 ? `max ${config.maxConcurrent} open` : 'no cap on open positions'}` +
    `, ${config.dailyStopLossSol < 0 ? `stop at ${config.dailyStopLossSol} SOL` : 'no spend limit'}`);
  log(`fees      ${perAttempt.toFixed(4)} SOL/attempt (${config.priorityFeeSol} priority + ${config.tipSol} tip) ` +
    `= ${computeUnitPrice(config.priorityFeeSol, config.computeUnitLimit).toLocaleString()} µlamports/CU`);
  log(`relays    ${RELAYS.map((r) =>
    `${r.name}${r.tipAccounts?.length > 1 ? ` (${r.tipAccounts.length} tip accounts, rotated)` : ''}`
  ).join(', ')}`);
  log(DRY_RUN ? 'MODE      DRY RUN — nothing will be sent' : 'MODE      LIVE — real money');

  if (balance < config.buySol + perAttempt) {
    log(`⚠ balance is below one trade (${(config.buySol + perAttempt).toFixed(3)} SOL needed)`);
  }
  // An under-tipped transaction is dropped without an error, so it presents as
  // a missed launch rather than a rejected send. Say it out loud at startup.
  for (const relay of RELAYS) {
    if (relay.minTipSol && config.tipSol < relay.minTipSol) {
      log(`⚠ tip ${config.tipSol} SOL is under ${relay.name}'s ${relay.minTipSol} minimum — ` +
        `it will drop these silently. Raise the fee.`);
    }
  }

  await watchGrpc();

  let grpcConnected = false;
  onConnectionChange = (up) => { grpcConnected = up; };

  const heartbeat = async () => {
    setStatus({
      mode: DRY_RUN ? 'DRY' : 'LIVE',
      connected: grpcConnected,
      wallet: wallet.publicKey.toBase58(),
      balanceSol: await connection.getBalance(wallet.publicKey).then((b) => b / 1e9).catch(() => 0),
      targets: config.targets.length,
      fired: state.fired,
      slot0: state.slot0,
      late: state.late,
      missed: state.missed,
      openPositions: state.open,
      realisedSol: state.realised,
      feed: GRPC_URL.replace(/\/\/.*@/, '//'),
    });
  };
  startReporting();
  heartbeat();
  setInterval(heartbeat, 10_000).unref?.();

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
