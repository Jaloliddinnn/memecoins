import type { Connection } from '@solana/web3.js';

/**
 * Converts a UTC unix timestamp to the nearest Solana slot via binary
 * search over `getBlockTime`, per the project's strict API rule: never loop
 * through historical signatures to find a point in time. Solana block time
 * is ~400ms/slot and roughly monotonic, so binary search converges in
 * O(log slotRange) RPC calls — typically 25-35 calls to narrow a slot range
 * spanning the whole chain history down to single-slot precision.
 *
 * Some slots are skipped (no block produced) and return null from
 * getBlockTime; we probe forward a few slots when that happens.
 */
export async function timestampToSlot(
  connection: Connection,
  targetUnixSeconds: number
): Promise<number> {
  let lo = 0;
  let hi = await connection.getSlot('finalized');

  const blockTimeNear = async (slot: number): Promise<number | null> => {
    for (let probe = slot; probe <= slot + 8 && probe <= hi; probe++) {
      const t = await connection.getBlockTime(probe);
      if (t !== null) return t;
    }
    return null;
  };

  const hiTime = await blockTimeNear(hi);
  if (hiTime !== null && targetUnixSeconds >= hiTime) return hi;

  const loTime = await blockTimeNear(lo);
  if (loTime !== null && targetUnixSeconds <= loTime) return lo;

  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const midTime = await blockTimeNear(mid);

    if (midTime === null) {
      // Couldn't find a produced block near mid; nudge the window and retry.
      lo = mid + 1;
      continue;
    }

    if (midTime === targetUnixSeconds) return mid;
    if (midTime < targetUnixSeconds) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }

  return lo;
}
