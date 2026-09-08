#!/usr/bin/env node
/**
 * Feed probe.
 *
 *     node probe.mjs
 *
 * "Upstream unavailable" 225ms after a successful connect has two very
 * different causes, and the log cannot tell them apart:
 *
 *   the provider's node is down          -> nothing we send will work
 *   the provider rejects our SUBSCRIPTION -> our request is the problem
 *
 * So ask in order of increasing demand. A unary call needs the upstream but no
 * subscription. An empty subscribe needs a subscription but no filters. Then add
 * our filters back one property at a time. The first test that fails names the
 * cause.
 */

import 'dotenv/config';
import { GRPC_URL, GRPC_TOKEN } from './config.mjs';
import { readConfig } from './config.mjs';

const config = readConfig();
const mod = await import('@triton-one/yellowstone-grpc');
const Client = mod.default?.default ?? mod.default;
const CommitmentLevel = mod.CommitmentLevel ?? mod.default?.CommitmentLevel;
const SubscribeRequest = mod.SubscribeRequest ?? mod.default?.SubscribeRequest;

if (!GRPC_URL) {
  console.log('No feed URL set. Fill in "2 · Feed URL" in the panel first.');
  process.exit(1);
}

console.log(`\n  Probing ${GRPC_URL}`);
console.log(`  token: ${GRPC_TOKEN ? 'set' : 'none (IP-whitelisted)'}\n`);

const client = () => new Client(GRPC_URL, GRPC_TOKEN || undefined, undefined);

/** Hold a subscription open for `ms` and report whether it survived. */
function trySubscribe(name, request, ms = 6000) {
  return new Promise(async (resolve) => {
    let c;
    try {
      c = client();
      const stream = await c.subscribe();
      let settled = false;
      const done = (ok, note) => {
        if (settled) return;
        settled = true;
        try { stream.removeAllListeners(); stream.destroy(); c.close?.(); c._client?.close?.(); } catch {}
        console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${note ? ` — ${note}` : ''}`);
        resolve(ok);
      };

      stream.on('error', (err) => done(false, err.message));
      stream.on('data', () => {
        if (!settled) console.log(`        (${name}: receiving data)`);
      });

      await new Promise((ok, no) => stream.write(request, (e) => (e ? no(e) : ok())));
      setTimeout(() => done(true, `stayed up ${ms / 1000}s`), ms);
    } catch (err) {
      try { c?.close?.(); } catch {}
      console.log(`  FAIL  ${name} — ${err.message}`);
      resolve(false);
    }
  });
}

// 1. Unary call. Reaches the upstream, asks for no subscription at all.
try {
  const version = await client().getVersion();
  console.log(`  PASS  getVersion — ${JSON.stringify(version).slice(0, 120)}`);
} catch (err) {
  console.log(`  FAIL  getVersion — ${err.message}`);
  console.log('\n  A unary call cannot reach the node. Nothing you configure will');
  console.log('  fix that — it is the provider\'s backend. Show them this line.\n');
  process.exit(1);
}

// 2. Empty subscription: a subscription, but asking for nothing.
await trySubscribe('subscribe (empty request)', SubscribeRequest.fromPartial({}));

// 3. Slots only — the cheapest real stream there is.
await trySubscribe(
  'subscribe (slots)',
  SubscribeRequest.fromPartial({ slots: { s: { filterByCommitment: false } } })
);

// 4. Our filter, but at CONFIRMED rather than PROCESSED. Some providers sell
//    PROCESSED as a separate tier and drop the stream instead of saying so.
await trySubscribe(
  'subscribe (our transaction filter, CONFIRMED)',
  SubscribeRequest.fromPartial({
    transactions: {
      targets: {
        accountInclude: config.targets, accountExclude: [], accountRequired: [],
        vote: false, failed: false,
      },
    },
    commitment: CommitmentLevel.CONFIRMED,
  })
);

// 5. Exactly what the bot sends.
await trySubscribe(
  'subscribe (our transaction filter, PROCESSED)  <- what the bot uses',
  SubscribeRequest.fromPartial({
    transactions: {
      targets: {
        accountInclude: config.targets, accountExclude: [], accountRequired: [],
        vote: false, failed: false,
      },
    },
    commitment: CommitmentLevel.PROCESSED,
  })
);

console.log(`
  Reading this:
    all FAIL, including getVersion  -> their backend is down. Their problem.
    getVersion passes, all subscribes fail
                                    -> they authorise you but sell no stream.
                                       Usually a plan that does not include
                                       gRPC subscriptions. Ask them directly.
    empty/slots pass, ours fails    -> our request. Send me the output.
    CONFIRMED passes, PROCESSED fails
                                    -> PROCESSED is a paid tier for them.
                                       Tell me and I will switch the bot.
`);
process.exit(0);
