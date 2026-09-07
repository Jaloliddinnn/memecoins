/**
 * Instruction cloning.
 *
 * The trick this bot rests on: we do NOT hand-build pump.fun's buy
 * instruction. We take the target's own instruction — correct by definition,
 * because it is about to land — and swap only the three accounts that belong
 * to the buyer:
 *
 *   index  5  associated user   -> our token account
 *   index  6  user (signer)     -> us
 *   index 13  user vol. accum.  -> our PDA
 *
 * Everything else is copied verbatim: global config, fee recipient, creator
 * vault, fee program, event authority, and the token program — which is
 * Token-2022 on these launches, not the classic one.
 *
 * Writability and signer flags are READ OFF the source transaction rather than
 * guessed. An earlier version inferred them and got 4 of 18 wrong (accounts 0,
 * 2, 10 and 16 are read-only and were being marked writable), which is enough
 * to have the transaction rejected.
 *
 * Verified against a real 20.627 SOL stacker buy on AK5CZgxC…pump.
 */

import { PublicKey, TransactionInstruction } from '@solana/web3.js';
import { PUMP_FUN, PUMP_SWAP, BUY_DISCRIMINATOR, SELL_DISCRIMINATOR } from './config.mjs';

export const ATA_PROGRAM = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
export const TOKEN_2022 = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
export const TOKEN_CLASSIC = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const SYSTEM = new PublicKey('11111111111111111111111111111111');

/** Positions in pump.fun's `buy` account list that belong to the buyer. */
const BUY_USER_ATA = 5;
const BUY_USER = 6;
const BUY_TOKEN_PROGRAM = 8;
const BUY_USER_VOLUME = 13;

// ---------------------------------------------------------------------------
// Bonding-curve maths — pump.fun's constant product
// ---------------------------------------------------------------------------

const VIRTUAL_TOKENS = 1_073_000_000;
const VIRTUAL_SOL = 30;
const K = VIRTUAL_TOKENS * VIRTUAL_SOL;
const REAL_RESERVE = 793_100_000;

/**
 * How many tokens `solIn` buys once `fractionSold` of the real reserve is gone.
 *
 * pump.fun's `buy(amount, max_sol_cost)` charges the curve price for EXACTLY
 * `amount` tokens and reverts if that exceeds `max_sol_cost`. So the token
 * figure has to be right — an earlier version passed u64::MAX, which asks the
 * curve to price 18 quintillion tokens and reverts every single time.
 *
 * Undershooting is safe (we simply buy less than intended); overshooting
 * reverts and burns the fee. So this is deliberately biased low, and checked
 * against a real fill: it predicts 4,995,574 tokens for the 1.975309 SOL that
 * actually bought 5,173,311 — 3.4% conservative.
 */
export function tokensForSol(solIn, fractionSold) {
  const sold = REAL_RESERVE * Math.min(Math.max(fractionSold, 0), 0.999);
  const virtualTokens = VIRTUAL_TOKENS - sold;
  const virtualSol = K / virtualTokens;
  return (solIn * virtualTokens) / (virtualSol + solIn);
}

// ---------------------------------------------------------------------------
// Account metadata, taken from the source transaction
// ---------------------------------------------------------------------------

/**
 * Rebuild each account's real `isSigner` / `isWritable` from the message
 * header, exactly as the runtime does:
 *
 *   signers      [0, numRequiredSignatures)
 *   writable     signers before numRequiredSignatures - numReadonlySigned,
 *                non-signers before length - numReadonlyUnsigned
 *   LUT-loaded   writable ones first, then readonly
 */
export function accountFlags({ header, staticKeyCount, loadedWritableCount, totalKeys }) {
  const { numRequiredSignatures: signers, numReadonlySignedAccounts: roSigned,
    numReadonlyUnsignedAccounts: roUnsigned } = header;

  return (index) => {
    if (index < staticKeyCount) {
      const isSigner = index < signers;
      const isWritable = isSigner
        ? index < signers - roSigned
        : index < staticKeyCount - roUnsigned;
      return { isSigner, isWritable };
    }
    return { isSigner: false, isWritable: index - staticKeyCount < loadedWritableCount };
  };
}

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
 * `CreateIdempotent` on the associated token program.
 *
 * The buy reverts without this — our token account does not exist yet. The
 * targets carry the same instruction in their own transactions. Idempotent
 * rather than plain create so a retry on an existing account is a no-op
 * instead of a revert.
 */
export function createAtaIdempotent({ payer, owner, mint, tokenProgram, ata }) {
  return new TransactionInstruction({
    programId: ATA_PROGRAM,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: ata, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SYSTEM, isSigner: false, isWritable: false },
      { pubkey: tokenProgram, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([1]),
  });
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/**
 * Find a pump.fun `buy` inside a target's transaction.
 *
 * Returns null for anything that is not a sized buy — the targets also
 * transfer, wrap and close accounts, and firing on those would be expensive.
 */
export function findTargetBuy({ message, keys, flagsFor }) {
  for (const ix of message.instructions) {
    if (keys[ix.programIdIndex] !== PUMP_FUN) continue;
    const data = Buffer.from(ix.data);
    if (data.length < 24) continue;
    if (data.subarray(0, 8).toString('hex') !== BUY_DISCRIMINATOR) continue;
    if (ix.accounts.length < 14) continue;

    return {
      accounts: ix.accounts.map((i) => ({ address: keys[i], ...flagsFor(i) })),
      mint: keys[ix.accounts[2]],
      tokenProgram: keys[ix.accounts[BUY_TOKEN_PROGRAM]],
      tokenAmount: data.readBigUInt64LE(8),
      maxSolCost: Number(data.readBigUInt64LE(16)) / 1e9,
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Cloning
// ---------------------------------------------------------------------------

/**
 * Build OUR buy from THEIR instruction, plus the ATA creation it needs.
 */
export function cloneBuy({ target, buyer, solIn, maxSolMultiplier, curveFractionSold }) {
  const mint = new PublicKey(target.mint);
  const tokenProgram = new PublicKey(target.tokenProgram);
  const ata = ataFor(buyer, mint, tokenProgram);
  const volume = userVolumeAccumulator(buyer);

  const keys = target.accounts.map((account, index) => {
    let pubkey;
    if (index === BUY_USER_ATA) pubkey = ata;
    else if (index === BUY_USER) pubkey = buyer;
    else if (index === BUY_USER_VOLUME) pubkey = volume;
    else pubkey = new PublicKey(account.address);

    return {
      pubkey,
      // Flags come from the source transaction, never inferred. The three
      // swapped accounts inherit the flags of the ones they replace, which is
      // correct: they occupy the same positional role.
      isSigner: account.isSigner,
      isWritable: account.isWritable,
    };
  });

  const tokens = tokensForSol(solIn, curveFractionSold);
  const decimals = 6; // pump.fun mints are always 6
  const amount = BigInt(Math.floor(tokens * 10 ** decimals));
  const maxLamports = BigInt(Math.floor(solIn * maxSolMultiplier * 1e9));

  const data = Buffer.alloc(24);
  Buffer.from(BUY_DISCRIMINATOR, 'hex').copy(data, 0);
  data.writeBigUInt64LE(amount, 8);
  data.writeBigUInt64LE(maxLamports, 16);

  return {
    instructions: [
      createAtaIdempotent({ payer: buyer, owner: buyer, mint, tokenProgram, ata }),
      new TransactionInstruction({ programId: new PublicKey(PUMP_FUN), keys, data }),
    ],
    ata,
    tokenProgram,
    mint,
    estimatedTokens: tokens,
    maxSol: Number(maxLamports) / 1e9,
  };
}

/**
 * Build our exit by cloning any recent PumpSwap sell on the same mint.
 *
 * By exit time the coin has migrated — the stack completes the bonding curve
 * inside the creation block — so the pool exists. Rather than deriving the
 * pool PDA and its vaults we lift them off a sell that already worked. The
 * exit is 15-30 seconds after entry, so an extra RPC round trip is free.
 */
export function cloneSell({ accounts, seller, tokenAmountRaw, minQuoteOut = 1n }) {
  const SELL_USER = 1;
  const SELL_USER_BASE = 5;
  const SELL_USER_QUOTE = 6;
  const SELL_BASE_MINT = 3;
  const SELL_QUOTE_MINT = 4;
  const SELL_BASE_PROGRAM = 11;

  const baseMint = new PublicKey(accounts[SELL_BASE_MINT].address);
  const quoteMint = new PublicKey(accounts[SELL_QUOTE_MINT].address);
  const baseProgram = new PublicKey(accounts[SELL_BASE_PROGRAM].address);

  const ourBase = ataFor(seller, baseMint, baseProgram);
  const ourQuote = ataFor(seller, quoteMint, TOKEN_CLASSIC);

  const keys = accounts.map((account, index) => {
    let pubkey;
    if (index === SELL_USER) pubkey = seller;
    else if (index === SELL_USER_BASE) pubkey = ourBase;
    else if (index === SELL_USER_QUOTE) pubkey = ourQuote;
    else pubkey = new PublicKey(account.address);
    return { pubkey, isSigner: account.isSigner, isWritable: account.isWritable };
  });

  const data = Buffer.alloc(24);
  Buffer.from(SELL_DISCRIMINATOR, 'hex').copy(data, 0);
  data.writeBigUInt64LE(BigInt(tokenAmountRaw), 8);
  data.writeBigUInt64LE(minQuoteOut, 16);

  return {
    instructions: [
      createAtaIdempotent({
        payer: seller, owner: seller, mint: quoteMint,
        tokenProgram: TOKEN_CLASSIC, ata: ourQuote,
      }),
      new TransactionInstruction({ programId: new PublicKey(PUMP_SWAP), keys, data }),
    ],
    quoteAta: ourQuote,
  };
}

export function findPumpSwapSell({ message, keys, flagsFor }) {
  for (const ix of message.instructions) {
    if (keys[ix.programIdIndex] !== PUMP_SWAP) continue;
    const data = Buffer.from(ix.data);
    if (data.length < 24) continue;
    if (data.subarray(0, 8).toString('hex') !== SELL_DISCRIMINATOR) continue;
    if (ix.accounts.length < 12) continue;
    return ix.accounts.map((i) => ({ address: keys[i], ...flagsFor(i) }));
  }
  return null;
}
