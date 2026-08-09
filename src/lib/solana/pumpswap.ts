import type { PublicKey, Connection } from '@solana/web3.js';

/**
 * TODO: PumpSwap AMM pool-reserve decoding.
 *
 * After a Pump.fun bonding curve completes (100%), the token migrates to
 * PumpSwap (Pump.fun's own AMM — NOT Raydium). Post-migration market cap
 * needs to read PumpSwap pool reserves instead of the bonding-curve PDA.
 *
 * I'm deliberately NOT shipping a guessed byte-layout here: getting a
 * reserve offset wrong silently produces a plausible-looking but *wrong*
 * market cap, which is worse than an explicit gap for a tool whose whole
 * point is catching manipulation. Before wiring this up:
 *
 *   1. Confirm the current PumpSwap program ID (mainnet).
 *   2. Get the pool account layout — either from PumpSwap's published IDL
 *      (if/when public) or by decoding a few known pool accounts against
 *      known reserve amounts (cross-check with the PumpSwap UI).
 *   3. Implement getPumpSwapPoolState() mirroring getBondingCurveState()
 *      in ./pumpfun.ts, and marketCapSolFromPool() mirroring
 *      marketCapSolFromCurve().
 *
 * Until then, callers should fetch post-migration market cap via Helius's
 * token price / DAS endpoints (less precise, but real data instead of a
 * guess) — see src/lib/price/marketCap.ts.
 */
export async function getPumpSwapPoolState(
  _connection: Connection,
  _poolAddress: PublicKey
): Promise<null> {
  return null;
}
