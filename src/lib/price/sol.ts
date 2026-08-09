let cachedPrice: { value: number; fetchedAt: number } | null = null;
const CACHE_MS = 30_000;

/**
 * SOL/USD spot price. Uses CoinGecko's free public endpoint (no key
 * required) with a 30s in-memory cache, since neither Pump.fun nor Helius
 * free tier exposes a SOL/USD oracle directly. Swap for Pyth/Switchboard
 * on-chain price if you need something more resilient than a REST call.
 */
export async function getSolUsdPrice(): Promise<number> {
  if (cachedPrice && Date.now() - cachedPrice.fetchedAt < CACHE_MS) {
    return cachedPrice.value;
  }

  const res = await fetch(
    'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
    { next: { revalidate: 30 } }
  );
  if (!res.ok) {
    if (cachedPrice) return cachedPrice.value; // serve stale rather than throw
    throw new Error(`Failed to fetch SOL/USD price: ${res.status}`);
  }
  const json = (await res.json()) as { solana?: { usd?: number } };
  const value = json.solana?.usd;
  if (typeof value !== 'number') {
    if (cachedPrice) return cachedPrice.value;
    throw new Error('Unexpected SOL/USD price response shape');
  }

  cachedPrice = { value, fetchedAt: Date.now() };
  return value;
}
