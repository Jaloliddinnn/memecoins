import { PublicKey } from '@solana/web3.js';
import type { Connection } from '@solana/web3.js';

// Pump.fun's mainnet program (well-documented publicly, in use since launch).
// Verify against current Pump.fun docs before relying on this in production —
// program upgrades or a new deployment would change this.
export const PUMP_PROGRAM_ID = new PublicKey(
  '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'
);

export interface BondingCurveState {
  virtualTokenReserves: bigint;
  virtualSolReserves: bigint;
  realTokenReserves: bigint;
  realSolReserves: bigint;
  tokenTotalSupply: bigint;
  complete: boolean;
}

/** PDA that holds a mint's bonding-curve reserve state. */
export function deriveBondingCurvePda(mint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('bonding-curve'), mint.toBuffer()],
    PUMP_PROGRAM_ID
  );
  return pda;
}

/**
 * Decodes the bonding-curve account layout:
 *   8  bytes  anchor discriminator
 *   8  bytes  virtualTokenReserves (u64 LE)
 *   8  bytes  virtualSolReserves (u64 LE)
 *   8  bytes  realTokenReserves (u64 LE)
 *   8  bytes  realSolReserves (u64 LE)
 *   8  bytes  tokenTotalSupply (u64 LE)
 *   1  byte   complete (bool)
 */
export function decodeBondingCurve(data: Buffer): BondingCurveState {
  let offset = 8; // skip discriminator
  const readU64 = (): bigint => {
    const v = data.readBigUInt64LE(offset);
    offset += 8;
    return v;
  };
  const virtualTokenReserves = readU64();
  const virtualSolReserves = readU64();
  const realTokenReserves = readU64();
  const realSolReserves = readU64();
  const tokenTotalSupply = readU64();
  const complete = data.readUInt8(offset) === 1;

  return {
    virtualTokenReserves,
    virtualSolReserves,
    realTokenReserves,
    realSolReserves,
    tokenTotalSupply,
    complete,
  };
}

export async function getBondingCurveState(
  connection: Connection,
  mint: PublicKey
): Promise<BondingCurveState | null> {
  const pda = deriveBondingCurvePda(mint);
  const info = await connection.getAccountInfo(pda);
  if (!info) return null;
  return decodeBondingCurve(info.data);
}

/** Spot price in SOL per token (UI units) from virtual reserves. */
export function priceFromCurve(state: BondingCurveState, tokenDecimals: number): number {
  const virtualSol = Number(state.virtualSolReserves) / 1e9;
  const virtualTokens = Number(state.virtualTokenReserves) / 10 ** tokenDecimals;
  if (virtualTokens === 0) return 0;
  return virtualSol / virtualTokens;
}

export function marketCapSolFromCurve(
  state: BondingCurveState,
  tokenDecimals: number
): number {
  const price = priceFromCurve(state, tokenDecimals);
  const supply = Number(state.tokenTotalSupply) / 10 ** tokenDecimals;
  return price * supply;
}
