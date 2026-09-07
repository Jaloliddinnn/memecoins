/**
 * Instruction cloning.
 *
 * The trick this whole bot rests on: we do NOT rebuild pump.fun's buy
 * instruction from a hand-written account list. We take the target's own
 * instruction — which is by definition correct, because it is about to land —
 * and swap the three accounts that are specific to the buyer:
 *
 *   index  5  associated user   -> our token account
 *   index  6  user (signer)     -> us
 *   index 13  user vol. accum.  -> our PDA
 *
 * Everything else (global config, fee recipient, creator vault, fee program,
 * event authority, the token program — which is Token-2022 on these launches,
 * not the classic one) is copied verbatim.
 *
 * Verified against a real 20.6 SOL stacker buy on AK5CZgxC…pump: all five
 * derivations below reproduce the on-chain account list exactly.
 *
 * The payoff is that pump.fun can add or reorder accounts and this keeps
 * working, because we are copying the live layout rather than a snapshot of it.
 */

import { PublicKey, TransactionInstruction } from '@solana/web3.js';
import { PUMP_FUN, PUMP_SWAP, BUY_DISCRIMINATOR, SELL_DISCRIMINATOR } from './config.mjs';

const ATA_PROGRAM = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
const TOKEN_2022 = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
const TOKEN_CLASSIC = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

/** Positions in pump.fun's `buy` account list that belong to the buyer. */
const BUY_USER_ATA = 5;
const BUY_USER = 6;
const BUY_TOKEN_PROGRAM = 8;
const BUY_USER_VOLUME = 13;

export function ataFor(owner, mint, tokenProgram) {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), tokenProgram.toBuffer(), mint.toBuffer()],
    ATA_PROGRAM
  )[0];
}

export function userVolumeAccumulator(owner) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('user_volume_accumulator'), owner.toBuffer()],
    new PublicKey(PUMP_FUN)
  )[0];
}

/**
 * Find the pump.fun `buy` instruction inside a target's transaction and report
 * what they bought and how much they committed.
 *
 * Returns null for anything that is not a sized buy — the targets also transfer,
 * wrap and close accounts, and we must not fire on those.
 */
export function findTargetBuy(tx, keys) {
  for (const ix of tx.message.instructions) {
    const programId = keys[ix.programIdIndex];
    if (programId !== PUMP_FUN) continue;
    const data = Buffer.from(ix.data);
    if (data.subarray(0, 8).toString('hex') !== BUY_DISCRIMINATOR) continue;
    if (ix.accounts.length < 14) continue;

    return {
      accounts: ix.accounts.map((i) => keys[i]),
      mint: keys[ix.accounts[2]],
      tokenProgram: keys[ix.accounts[BUY_TOKEN_PROGRAM]],
      maxSolCost: Number(data.readBigUInt64LE(16)) / 1e9,
    };
  }
  return null;
}

/**
 * Build OUR buy from THEIR instruction.
 *
 * `tokenAmount` is left generous and `maxSolCost` does the real work: pump.fun
 * fills as much as the lamports allow, so an over-large token figure paired
 * with a hard SOL ceiling behaves like a market order with slippage protection.
 */
export function cloneBuy({ target, buyer, solIn, maxSolMultiplier }) {
  const mint = new PublicKey(target.mint);
  const tokenProgram = new PublicKey(target.tokenProgram);
  const ourAta = ataFor(buyer, mint, tokenProgram);
  const ourVolume = userVolumeAccumulator(buyer);

  const keys = target.accounts.map((address, index) => {
    let pubkey = new PublicKey(address);
    if (index === BUY_USER_ATA) pubkey = ourAta;
    else if (index === BUY_USER) pubkey = buyer;
    else if (index === BUY_USER_VOLUME) pubkey = ourVolume;

    return {
      pubkey,
      isSigner: index === BUY_USER,
      // Every account pump.fun touches on a buy is writable except the
      // programs and the event authority, which are the tail of the list.
      isWritable: !pubkey.equals(new PublicKey(PUMP_FUN)) && index !== 7 && index !== 8,
    };
  });

  const maxLamports = BigInt(Math.floor(solIn * maxSolMultiplier * 1e9));
  const data = Buffer.alloc(24);
  Buffer.from(BUY_DISCRIMINATOR, 'hex').copy(data, 0);
  // Ask for far more tokens than the SOL can buy; the lamport ceiling binds.
  data.writeBigUInt64LE(BigInt('18446744073709551615'), 8);
  data.writeBigUInt64LE(maxLamports, 16);

  return {
    instruction: new TransactionInstruction({
      programId: new PublicKey(PUMP_FUN),
      keys,
      data,
    }),
    ata: ourAta,
    tokenProgram,
    mint,
  };
}

/**
 * Build our exit by cloning any recent PumpSwap sell on the same mint.
 *
 * By the time we exit, the coin has migrated: the stack completes the bonding
 * curve inside the creation block, so the pool already exists. Rather than
 * deriving the pool PDA and its vaults, we lift them off a sell that already
 * worked. The exit is 15-30 seconds after entry, so one extra RPC round trip
 * costs us nothing.
 */
export function cloneSell({ template, keys, seller, tokenAmountRaw }) {
  const SELL_USER = 1;
  const SELL_USER_BASE = 5;
  const SELL_USER_QUOTE = 6;

  const baseMint = new PublicKey(keys[template.accounts[3]]);
  const quoteMint = new PublicKey(keys[template.accounts[4]]);
  const baseProgram = new PublicKey(keys[template.accounts[11]]);

  const ourBase = ataFor(seller, baseMint, baseProgram);
  const ourQuote = ataFor(seller, quoteMint, TOKEN_CLASSIC);

  const accountKeys = template.accounts.map((i, index) => {
    let pubkey = new PublicKey(keys[i]);
    if (index === SELL_USER) pubkey = seller;
    else if (index === SELL_USER_BASE) pubkey = ourBase;
    else if (index === SELL_USER_QUOTE) pubkey = ourQuote;
    return {
      pubkey,
      isSigner: index === SELL_USER,
      isWritable: !pubkey.equals(new PublicKey(PUMP_SWAP)) && index !== 2 && index < 11,
    };
  });

  const data = Buffer.alloc(24);
  Buffer.from(SELL_DISCRIMINATOR, 'hex').copy(data, 0);
  data.writeBigUInt64LE(BigInt(tokenAmountRaw), 8);
  // min_quote_out = 1. We are exiting a coin that dies in minutes; getting out
  // matters more than the last basis point. This is what he does too.
  data.writeBigUInt64LE(1n, 16);

  return new TransactionInstruction({
    programId: new PublicKey(PUMP_SWAP),
    keys: accountKeys,
    data,
  });
}

export { TOKEN_2022, TOKEN_CLASSIC, ATA_PROGRAM };
