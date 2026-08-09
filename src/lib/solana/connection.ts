import { Connection } from '@solana/web3.js';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required env var ${name}. Copy .env.example to .env.local and fill it in.`
    );
  }
  return value;
}

let cachedConnection: Connection | null = null;

/**
 * Shared Helius RPC connection. Reused across requests (in the same
 * server process) to avoid re-establishing HTTP keep-alive on every call —
 * matters at the free tier's 10 RPS ceiling.
 */
export function getConnection(): Connection {
  if (cachedConnection) return cachedConnection;
  const apiKey = requireEnv('HELIUS_API_KEY');
  const base = process.env.HELIUS_RPC_URL ?? 'https://mainnet.helius-rpc.com';
  cachedConnection = new Connection(`${base}/?api-key=${apiKey}`, 'confirmed');
  return cachedConnection;
}

export function heliusRpcUrl(): string {
  const apiKey = requireEnv('HELIUS_API_KEY');
  const base = process.env.HELIUS_RPC_URL ?? 'https://mainnet.helius-rpc.com';
  return `${base}/?api-key=${apiKey}`;
}
