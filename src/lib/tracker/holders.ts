/**
 * Holder scanner — server-side port of Tool-Memecoin's `solana.ts`.
 *
 * Runs on the server, not in the browser. The original shipped the Neon
 * connection string to every visitor via `VITE_NEON_DATABASE_URL`; here the
 * database is only ever touched from API routes.
 */

import { PublicKey } from '@solana/web3.js';
import { getConnection, heliusRpcUrl } from '@/lib/solana/connection';
import { devProfilerService } from './devProfiler';
import type {
  HolderMetrics,
  TagType,
  TokenHolder,
  TokenMetadata,
  WalletTagMap,
} from './types';

/** How many holders the table shows. The original targeted 400. */
export const TOTAL_HOLDERS_TARGET = 400;

/**
 * Addresses that are infrastructure, not participants. Anything here is LP and
 * is excluded from the insider/outsider split.
 */
export const KNOWN_SPECIAL_WALLETS: Record<string, { name: string; tag: TagType }> = {
  '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P': { name: 'Pump.fun Program', tag: 'lp' },
  EJnL5crs31tRiyUsoKLi4nUQ8ncy1VKyBtAXfKxw8phx: { name: 'PumpSwap Pool', tag: 'lp' },
  '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1': { name: 'Raydium Authority V4', tag: 'lp' },
  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8': { name: 'Raydium AMM Program', tag: 'lp' },
  srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX: { name: 'OpenBook DEX', tag: 'lp' },
  pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA: { name: 'PumpSwap AMM', tag: 'lp' },
};

/** Token metadata: identity from chain, price from DexScreener. */
export async function getTokenMetadata(mint: string): Promise<TokenMetadata> {
  const conn = getConnection();
  const meta: TokenMetadata = {
    mint,
    name: 'Unknown',
    symbol: '???',
    decimals: 6,
    totalSupply: 0,
    priceNative: 0,
    priceUsd: 0,
    marketCapUsd: 0,
    liquidityUsd: 0,
    liquiditySol: 0,
    isPumpFun: mint.toLowerCase().endsWith('pump'),
  };

  // Supply + decimals straight from the mint account.
  try {
    const supply = await conn.getTokenSupply(new PublicKey(mint));
    meta.decimals = supply.value.decimals;
    meta.totalSupply = Number(supply.value.uiAmountString ?? supply.value.uiAmount ?? 0);
  } catch {
    /* leave defaults */
  }

  // Price / liquidity / name from DexScreener.
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, {
      cache: 'no-store',
    });
    if (res.ok) {
      const json = (await res.json()) as {
        pairs?: Array<{
          dexId?: string;
          pairAddress?: string;
          priceNative?: string;
          priceUsd?: string;
          marketCap?: number;
          liquidity?: { usd?: number; base?: number; quote?: number };
          baseToken?: { name?: string; symbol?: string };
          info?: { imageUrl?: string };
        }>;
      };
      const pairs = json.pairs ?? [];
      const pair =
        pairs.find((p) => p.dexId === 'pumpswap') ??
        pairs.find((p) => p.dexId === 'raydium') ??
        pairs[0];
      if (pair) {
        meta.name = pair.baseToken?.name || meta.name;
        meta.symbol = pair.baseToken?.symbol || meta.symbol;
        meta.priceNative = Number(pair.priceNative ?? 0);
        meta.priceUsd = Number(pair.priceUsd ?? 0);
        meta.marketCapUsd = pair.marketCap ?? 0;
        meta.liquidityUsd = pair.liquidity?.usd ?? 0;
        meta.liquiditySol = pair.liquidity?.quote ?? 0;
        meta.dexPoolAddress = pair.pairAddress;
        meta.dexName = pair.dexId;
        meta.logoURI = pair.info?.imageUrl;
      }
    }
  } catch {
    /* price stays 0 — the UI shows dashes rather than fake numbers */
  }

  // Fallback for missing metadata (Pump.fun or Helius DAS)
  if (meta.name === 'Unknown' || meta.symbol === '???' || !meta.logoURI) {
    if (meta.isPumpFun) {
      try {
        const pRes = await fetch(`https://frontend-api.pump.fun/coins/${mint}`, { cache: 'no-store' });
        if (pRes.ok) {
          const pJson = await pRes.json();
          meta.name = pJson.name || meta.name;
          meta.symbol = pJson.symbol || meta.symbol;
          meta.logoURI = pJson.image_uri || meta.logoURI;
        }
      } catch { /* ignore */ }
    }

    if (meta.name === 'Unknown' || meta.symbol === '???' || !meta.logoURI) {
      try {
        const hRes = await fetch(heliusRpcUrl(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 'das-asset',
            method: 'getAsset',
            params: { id: mint },
          }),
          cache: 'no-store',
        });
        if (hRes.ok) {
          const hJson = await hRes.json();
          const content = hJson.result?.content;
          meta.name = content?.metadata?.name || meta.name;
          meta.symbol = content?.metadata?.symbol || meta.symbol;
          meta.logoURI = content?.links?.image || content?.files?.[0]?.uri || meta.logoURI;
        }
      } catch { /* ignore */ }
    }
  }

  // Creator, for the dev row and the dev profiler.
  //
  // Pump.fun is asked first because it is authoritative and costs one request.
  // The on-chain path is the fallback, and it has to page: getSignaturesForAddress
  // returns NEWEST first, so on a curve with more than one page of history the
  // last element of a single call is not the create transaction, it is an
  // arbitrary mid-life trade — and its signer is some random sniper, who then
  // gets profiled as the dev.
  meta.creatorAddress = (await devProfilerService.getCreatorForMint(mint).catch(() => null)) ?? undefined;

  if (!meta.creatorAddress) {
    try {
      const [curve] = PublicKey.findProgramAddressSync(
        [Buffer.from('bonding-curve'), new PublicKey(mint).toBuffer()],
        new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P')
      );

      let before: string | undefined;
      let oldest: { signature: string } | undefined;
      // Bounded: a curve that needs more than 20 pages is not worth the credits
      // for one optional field.
      for (let page = 0; page < 20; page++) {
        const sigs = await conn.getSignaturesForAddress(curve, { limit: 1000, before });
        if (sigs.length === 0) break;
        oldest = sigs[sigs.length - 1];
        if (sigs.length < 1000) break;
        before = oldest?.signature;
      }

      if (oldest) {
        const tx = await conn.getParsedTransaction(oldest.signature, {
          maxSupportedTransactionVersion: 0,
        });
        const payer = tx?.transaction.message.accountKeys.find((k) => k.signer)?.pubkey;
        if (payer) meta.creatorAddress = payer.toBase58();
      }
    } catch {
      /* creator is optional */
    }
  }

  return meta;
}

interface RawHolder {
  owner: string;
  tokenAccount: string;
  uiAmount: number;
}

/**
 * Fetch holders two ways and merge:
 *   1. `getTokenLargestAccounts` — the top 20, always accurate
 *   2. Helius DAS `getTokenAccounts` — up to 1,000 more
 * A wallet holding several token accounts is summed into one row.
 */
export async function fetchHolders(
  mint: string,
  metadata: TokenMetadata,
  tags: WalletTagMap
): Promise<TokenHolder[]> {
  const conn = getConnection();
  const divisor = 10 ** metadata.decimals;
  const owners = new Map<string, RawHolder>();

  try {
    const largest = await conn.getTokenLargestAccounts(new PublicKey(mint));
    const addresses = largest.value.map((a) => a.address);
    if (addresses.length) {
      const infos = await conn.getMultipleParsedAccounts(addresses);
      infos.value.forEach((info, i) => {
        if (!info || !('parsed' in info.data)) return;
        const parsed = info.data.parsed as {
          info?: { owner?: string; tokenAmount?: { uiAmount?: number } };
        };
        const owner = parsed.info?.owner;
        const ui = parsed.info?.tokenAmount?.uiAmount;
        const acct = addresses[i];
        if (owner && typeof ui === 'number' && acct) {
          owners.set(owner, { owner, tokenAccount: acct.toBase58(), uiAmount: ui });
        }
      });
    }
  } catch {
    /* fall through to DAS */
  }

  try {
    const res = await fetch(heliusRpcUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'das',
        method: 'getTokenAccounts',
        params: { mint, page: 1, limit: 1000 },
      }),
      cache: 'no-store',
    });
    if (res.ok) {
      const json = (await res.json()) as {
        result?: { token_accounts?: Array<{ owner?: string; address?: string; amount?: string }> };
      };
      for (const acc of json.result?.token_accounts ?? []) {
        if (!acc.owner || !acc.address) continue;
        const ui = Number(acc.amount ?? 0) / divisor;
        if (ui <= 0) continue;
        const existing = owners.get(acc.owner);
        if (existing) {
          // Only add when it is a different token account, or we double-count
          // the balance already taken from getTokenLargestAccounts.
          if (existing.tokenAccount !== acc.address) existing.uiAmount += ui;
        } else {
          owners.set(acc.owner, { owner: acc.owner, tokenAccount: acc.address, uiAmount: ui });
        }
      }
    }
  } catch {
    /* whatever we already have is what we show */
  }

  const sorted = [...owners.values()].sort((a, b) => b.uiAmount - a.uiAmount);

  return sorted.slice(0, TOTAL_HOLDERS_TARGET).map((h, i) => {
    const special =
      KNOWN_SPECIAL_WALLETS[h.owner] ?? KNOWN_SPECIAL_WALLETS[h.tokenAccount];
    const isPool =
      Boolean(special) || h.owner === metadata.dexPoolAddress;
    const isDev = Boolean(metadata.creatorAddress && h.owner === metadata.creatorAddress);
    const stored = tags[h.owner];

    let tag: TagType = 'untagged';
    if (isPool) tag = 'lp';
    else if (stored?.tag) tag = stored.tag;
    else if (isDev) tag = 'insider';

    const poolName = special?.name ?? (isPool ? 'Liquidity Pool' : undefined);

    return {
      rank: i + 1,
      tokenAccount: h.tokenAccount,
      ownerAddress: h.owner,
      uiAmount: h.uiAmount,
      solValue: h.uiAmount * metadata.priceNative,
      usdValue: h.uiAmount * metadata.priceUsd,
      percentOfTotal:
        metadata.totalSupply > 0 ? (h.uiAmount / metadata.totalSupply) * 100 : 0,
      tag,
      isLiquidityPool: isPool,
      poolName,
      label: stored?.label ?? (isDev ? 'Token Creator (Dev)' : poolName),
      notes: stored?.notes,
      isDev,
    };
  });
}

/**
 * Roll holders up into the dashboard numbers.
 *
 * `excludeLp` removes the LP allocation from the denominator, which is what you
 * want on a pump.fun coin — otherwise the 206.9M LP deposit dilutes every
 * percentage and the insider share looks far smaller than it is.
 */
export function calculateMetrics(
  holders: TokenHolder[],
  totalSupply: number,
  excludeLp = true
): HolderMetrics {
  const acc = {
    insider: { amount: 0, sol: 0, usd: 0, count: 0 },
    outsider: { amount: 0, sol: 0, usd: 0, count: 0 },
    lp: { amount: 0, sol: 0, usd: 0, count: 0 },
    untagged: { amount: 0, sol: 0, usd: 0, count: 0 },
  };

  for (const h of holders) {
    const bucket =
      h.tag === 'lp' || h.isLiquidityPool
        ? acc.lp
        : h.tag === 'insider'
          ? acc.insider
          : h.tag === 'outsider'
            ? acc.outsider
            : acc.untagged;
    bucket.amount += h.uiAmount;
    bucket.sol += h.solValue;
    bucket.usd += h.usdValue;
    bucket.count++;
  }

  const base = excludeLp
    ? Math.max(1, totalSupply - acc.lp.amount)
    : Math.max(1, totalSupply);

  const nonLp = holders.filter((h) => h.tag !== 'lp' && !h.isLiquidityPool);
  const top10 = nonLp.slice(0, 10);
  const top10Amount = top10.reduce((s, h) => s + h.uiAmount, 0);

  // Real float = everything that is not LP. The ratio answers "how much of the
  // tradeable supply is in hands we can't tie to the operation".
  const realFloat = acc.insider.amount + acc.outsider.amount + acc.untagged.amount;
  const outsiderRatio =
    realFloat > 0 ? ((acc.outsider.amount + acc.untagged.amount) / realFloat) * 100 : 0;

  return {
    totalSupply,
    circulatingSupply: Math.max(0, totalSupply - acc.lp.amount),
    insiderAmount: acc.insider.amount,
    insiderSol: acc.insider.sol,
    insiderUsd: acc.insider.usd,
    insiderPercent: (acc.insider.amount / base) * 100,
    insiderCount: acc.insider.count,
    outsiderAmount: acc.outsider.amount,
    outsiderSol: acc.outsider.sol,
    outsiderUsd: acc.outsider.usd,
    outsiderPercent: (acc.outsider.amount / base) * 100,
    outsiderCount: acc.outsider.count,
    lpAmount: acc.lp.amount,
    lpSol: acc.lp.sol,
    lpUsd: acc.lp.usd,
    lpPercent: (acc.lp.amount / Math.max(1, totalSupply)) * 100,
    lpCount: acc.lp.count,
    untaggedAmount: acc.untagged.amount,
    untaggedSol: acc.untagged.sol,
    untaggedUsd: acc.untagged.usd,
    untaggedPercent: (acc.untagged.amount / base) * 100,
    untaggedCount: acc.untagged.count,
    top10Percent: (top10Amount / base) * 100,
    top10Sol: top10.reduce((s, h) => s + h.solValue, 0),
    outsiderRatio,
  };
}

export function shortenAddress(address: string, chars = 4): string {
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}…${address.slice(-chars)}`;
}
