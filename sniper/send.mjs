/**
 * Transaction assembly and fan-out.
 *
 * Two things decide whether a snipe lands, and they are different problems:
 *
 *   1. ARRIVAL  — does the transaction reach the leader before it packs the
 *                 block? Fixed by the relays, not by money.
 *   2. ORDERING — among transactions the leader already holds, who goes first?
 *                 Fixed by the priority fee, which is exactly why the failure
 *                 rates in config.mjs read like a price list.
 *
 * So: fan out to every relay simultaneously (arrival) and bid above the
 * competition (ordering). Duplicates are dropped by the network, so sending the
 * same signed transaction five times costs nothing but bandwidth.
 */

import {
  ComputeBudgetProgram,
  PublicKey,
  SystemProgram,
  Transaction,
  VersionedTransaction,
  TransactionMessage,
} from '@solana/web3.js';
import bs58 from 'bs58';
import { CU_LIMIT, CU_PRICE, TIP_SOL, RELAYS, DRY_RUN } from './config.mjs';

/**
 * Blockhashes are the one thing we cannot fetch on the critical path — a round
 * trip there would cost more than the entire slot. Keep one warm.
 */
export class BlockhashCache {
  constructor(connection, intervalMs = 1500) {
    this.connection = connection;
    this.value = null;
    this.timer = setInterval(() => this.refresh(), intervalMs);
    this.refresh();
  }
  async refresh() {
    try {
      const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
      this.value = blockhash;
    } catch {
      /* keep the previous one; a slightly stale hash still lands */
    }
  }
  stop() {
    clearInterval(this.timer);
  }
}

export function buildTransaction({ payer, instructions, blockhash, tipAccount, tipSol }) {
  const ixs = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: CU_LIMIT }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: CU_PRICE }),
  ];

  if (tipAccount) {
    ixs.push(
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: new PublicKey(tipAccount),
        lamports: Math.floor((tipSol ?? TIP_SOL) * 1e9),
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
  const body = {
    jsonrpc: '2.0',
    id: 1,
    method: 'sendTransaction',
    params: [encoded, { encoding: 'base64', skipPreflight: true, maxRetries: 0 }],
  };
  const res = await fetch(relay.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (json.error) throw new Error(`${relay.name}: ${JSON.stringify(json.error).slice(0, 120)}`);
  return json.result;
}

/**
 * Sign once per relay (each carries its own tip account) and fire them all in
 * parallel. Returns as soon as any relay accepts.
 */
export async function fanOut({ payer, instructions, blockhash }) {
  if (!RELAYS.length) throw new Error('No relays configured — see sniper/.env.example');

  const attempts = RELAYS.map((relay) => {
    const tx = buildTransaction({
      payer,
      instructions,
      blockhash,
      tipAccount: relay.tipAccount,
    });
    return { relay, tx, encoded: Buffer.from(tx.serialize()).toString('base64') };
  });

  const signature = bs58.encode(attempts[0].tx.signatures[0]);

  if (DRY_RUN) {
    console.log(
      `  [dry] would send to ${attempts.map((a) => a.relay.name).join(', ')} — sig ${signature}`
    );
    return { signature, sent: [], dry: true };
  }

  const results = await Promise.allSettled(
    attempts.map((a) => postOne(a.relay, a.encoded))
  );

  const sent = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled') sent.push(attempts[i].relay.name);
    else console.warn(`  relay ${attempts[i].relay.name} rejected: ${r.reason?.message ?? r.reason}`);
  }

  if (!sent.length) throw new Error('every relay rejected the transaction');
  return { signature, sent, dry: false };
}

export { Transaction };
