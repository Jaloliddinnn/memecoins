/**
 * Transaction assembly and fan-out.
 *
 * Two separate problems decide whether a snipe lands, and only one of them is
 * solved with money:
 *
 *   ARRIVAL   does the transaction reach the leader before it packs the block?
 *             Relays fix this. A higher fee does not — if you arrive after the
 *             block is closed, no bid gets you in.
 *   ORDERING  among transactions the leader already holds, who goes first?
 *             The priority fee fixes this, which is why the measured failure
 *             rates of the competing snipers read like a price list.
 *
 * So: fan out to every relay at once, and bid above the competition. The same
 * signed transaction arriving five times is deduplicated by the network, so
 * there is no cost to redundancy.
 */

import {
  ComputeBudgetProgram,
  PublicKey,
  SystemProgram,
  VersionedTransaction,
  TransactionMessage,
} from '@solana/web3.js';
import bs58 from 'bs58';
import { RELAYS, DRY_RUN, computeUnitPrice } from './config.mjs';

/**
 * A blockhash fetch on the critical path would cost more than the slot we are
 * racing for. Keep one warm and accept that it is up to a second stale — the
 * validity window is ~60 slots.
 */
export class BlockhashCache {
  constructor(connection, intervalMs = 1200) {
    this.connection = connection;
    this.value = null;
    this.updatedAt = 0;
    this.timer = setInterval(() => this.refresh(), intervalMs);
    this.timer.unref?.();
    this.refresh();
  }
  async refresh() {
    try {
      const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
      this.value = blockhash;
      this.updatedAt = Date.now();
    } catch {
      /* keep the previous one; a slightly stale hash still lands */
    }
  }
  get stale() {
    return Date.now() - this.updatedAt > 20_000;
  }
  stop() {
    clearInterval(this.timer);
  }
}

export function buildTransaction({ payer, instructions, blockhash, tipAccount, config }) {
  const ixs = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: config.computeUnitLimit }),
    ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: computeUnitPrice(config.priorityFeeSol, config.computeUnitLimit),
    }),
  ];

  if (tipAccount && config.tipSol > 0) {
    ixs.push(
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: new PublicKey(tipAccount),
        lamports: Math.floor(config.tipSol * 1e9),
      })
    );
  }

  ixs.push(...instructions);

  const message = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: blockhash,
    instructions: ixs,
  }).compileToV0Message();

  const tx = new VersionedTransaction(message);
  tx.sign([payer]);
  return tx;
}

async function postOne(relay, encoded) {
  const res = await fetch(relay.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'sendTransaction',
      params: [encoded, { encoding: 'base64', skipPreflight: true, maxRetries: 0 }],
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (json.error) throw new Error(JSON.stringify(json.error).slice(0, 160));
  return json.result;
}

/**
 * Sign once per relay (each carries its own tip account, so each is a different
 * transaction) and fire them all in parallel.
 */
export async function fanOut({ payer, instructions, blockhash, config }) {
  if (!RELAYS.length) throw new Error('No relays configured — run `node setup.mjs`');
  if (!blockhash) throw new Error('No cached blockhash yet');

  const attempts = RELAYS.map((relay) => {
    // Rotate the tip account per transaction. Every client hammering one
    // account write-locks it, and relays publish a list for exactly this reason.
    const pool = relay.tipAccounts ?? [];
    const tipAccount = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
    const tx = buildTransaction({ payer, instructions, blockhash, tipAccount, config });
    return { relay, tx, encoded: Buffer.from(tx.serialize()).toString('base64') };
  });

  if (DRY_RUN) {
    return {
      signatures: attempts.map((a) => bs58.encode(a.tx.signatures[0])),
      sent: [],
      dry: true,
      sizes: attempts.map((a) => a.tx.serialize().length),
    };
  }

  const results = await Promise.allSettled(attempts.map((a) => postOne(a.relay, a.encoded)));

  const sent = [];
  const errors = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') sent.push(attempts[i].relay.name);
    else errors.push(`${attempts[i].relay.name}: ${r.reason?.message ?? r.reason}`);
  });

  if (!sent.length) throw new Error(`every relay rejected it — ${errors.join(' | ')}`);

  return {
    signatures: attempts.map((a) => bs58.encode(a.tx.signatures[0])),
    sent,
    errors,
    dry: false,
  };
}
