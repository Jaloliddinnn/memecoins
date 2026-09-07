#!/usr/bin/env node
/**
 * Interactive setup. Run this on the machine the bot will run on:
 *
 *     node setup.mjs
 *
 * It writes .env (secrets, never leaves this machine) and config.json
 * (everything you tune, safe to edit later from the web panel).
 *
 * The private key is deliberately NOT settable from the web app. A key pasted
 * into a public URL is a key you have given away.
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { fileURLToPath } from 'node:url';
import { Keypair, Connection } from '@solana/web3.js';
import bs58 from 'bs58';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.join(HERE, '.env');
const CONFIG_PATH = path.join(HERE, 'config.json');

const rl = readline.createInterface({ input: stdin, output: stdout });
const ask = async (q, fallback) => {
  const suffix = fallback !== undefined && fallback !== '' ? ` [${fallback}]` : '';
  const answer = (await rl.question(`${q}${suffix}: `)).trim();
  return answer || (fallback ?? '');
};
const askNumber = async (q, fallback) => {
  for (;;) {
    const value = Number(await ask(q, String(fallback)));
    if (Number.isFinite(value)) return value;
    console.log('  needs to be a number');
  }
};
const askYes = async (q, fallback = true) => {
  const answer = (await ask(`${q} (y/n)`, fallback ? 'y' : 'n')).toLowerCase();
  return answer.startsWith('y');
};

function parseKey(raw) {
  const trimmed = raw.trim();
  const bytes = trimmed.startsWith('[')
    ? Uint8Array.from(JSON.parse(trimmed))
    : bs58.decode(trimmed);
  if (bytes.length !== 64) throw new Error(`expected 64 bytes, got ${bytes.length}`);
  return Keypair.fromSecretKey(bytes);
}

function isAddress(value) {
  try {
    return bs58.decode(value.trim()).length === 32;
  } catch {
    return false;
  }
}

console.log('\n  Coat-tail sniper — setup\n  ' + '-'.repeat(40) + '\n');

// ---------------------------------------------------------------------------
// 1. Wallet
// ---------------------------------------------------------------------------

const existingEnv = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
const envValue = (key) => existingEnv.match(new RegExp(`^${key}="?([^"\n]*)"?$`, 'm'))?.[1] ?? '';

let keypair = null;
if (envValue('PRIVATE_KEY')) {
  try {
    keypair = parseKey(envValue('PRIVATE_KEY'));
    console.log(`  Existing wallet: ${keypair.publicKey.toBase58()}`);
    if (!(await askYes('  Replace it?', false))) {
      /* keep it */
    } else {
      keypair = null;
    }
  } catch {
    keypair = null;
  }
}

while (!keypair) {
  console.log('\n  Paste the PRIVATE KEY of a BURNER wallet.');
  console.log('  Base58 (Phantom "export private key") or a [1,2,3,...] array.');
  console.log('  Fund it with what you can lose today. Nothing else should be in it.\n');
  const raw = await ask('  private key');
  if (!raw) {
    if (await askYes('  Generate a brand new wallet instead?', true)) {
      keypair = Keypair.generate();
      console.log(`\n  Generated: ${keypair.publicKey.toBase58()}`);
      console.log('  SEND SOL TO THAT ADDRESS before running the bot.\n');
    }
    continue;
  }
  try {
    keypair = parseKey(raw);
    console.log(`  Wallet: ${keypair.publicKey.toBase58()}`);
  } catch (err) {
    console.log(`  Not a valid key (${err.message}) — try again.`);
  }
}

// ---------------------------------------------------------------------------
// 2. Endpoints
// ---------------------------------------------------------------------------

console.log('\n  Endpoints');
console.log('  ' + '-'.repeat(40));
const rpcUrl = await ask('  RPC URL', envValue('RPC_URL'));

console.log('\n  gRPC (Yellowstone/Geyser) is what makes this work. A plain RPC');
console.log('  websocket hands you the block AFTER it is built, so you fire one');
console.log('  slot late — and one slot costs ~13.5% of an ~18% move.');
console.log('  Chainstack from $49/mo, rpc edge from $249, Shyft from $199.\n');
console.log("  Include the protocol: https://host:443 for TLS feeds, or");
console.log("  http://host:port for plain IP-whitelisted ones (AllenHark's gRPC");
console.log('  proxy is this kind — use http:// and leave the token blank).');
const grpcUrl = await ask('  gRPC URL', envValue('GRPC_URL'));
const grpcToken = await ask('  gRPC token (blank if none)', envValue('GRPC_TOKEN'));

console.log('\n  Relays — the express lanes to the validator.');
console.log('  Astralane (Iris) is plain JSON-RPC sendTransaction, so it drops straight in.');
console.log('  Minimum tip is 10,000 lamports; tip accounts are REGION-SPECIFIC.');
console.log('    https://edge.astralane.io/iris?api-key=KEY       global edge');
console.log('    http://fr.gateway.astralane.io/iris?api-key=KEY   Frankfurt');
console.log('    http://ams.gateway.astralane.io/iris?api-key=KEY  Amsterdam');
console.log('    http://ny.gateway.astralane.io/iris?api-key=KEY   New York\n');
const astraUrl = await ask('  Astralane URL (blank to skip)', envValue('ASTRALANE_URL'));
const astraTip = astraUrl
  ? await ask('  Astralane tip account for that region', envValue('ASTRALANE_TIP'))
  : '';
const nozomiUrl = await ask('  Nozomi URL (blank to skip)', envValue('NOZOMI_URL'));
const nozomiTip = nozomiUrl ? await ask('  Nozomi tip account', envValue('NOZOMI_TIP')) : '';

// ---------------------------------------------------------------------------
// 3. Trading
// ---------------------------------------------------------------------------

const existingConfig = fs.existsSync(CONFIG_PATH)
  ? JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
  : {};

console.log('\n  Trading');
console.log('  ' + '-'.repeat(40));
console.log('  Target wallets to copy. Paste one, or several separated by commas.\n');

let targets = [];
for (;;) {
  const raw = await ask('  target wallet(s)', (existingConfig.targets ?? []).join(','));
  targets = raw.split(',').map((s) => s.trim()).filter(Boolean);
  const bad = targets.filter((t) => !isAddress(t));
  if (!targets.length) console.log('  need at least one');
  else if (bad.length) console.log(`  not valid addresses: ${bad.join(', ')}`);
  else break;
}

const buySol = await askNumber('  SOL per trade', existingConfig.buySol ?? 2.0);
if (buySol > 3) {
  console.log('\n  ⚠ Measured across 216 of his coins: ~2 SOL wins 89.5% at 12.89% ROI,');
  console.log('    ~5 SOL wins 60.7% at 7.35%, and all eight of his worst trades were');
  console.log('    5 SOL. A bigger buy moves a seconds-old pool against your own fill.\n');
  if (!(await askYes(`  Keep ${buySol} SOL anyway?`, false))) {
    console.log('  Set it lower in config.json or re-run setup.');
  }
}

console.log('\n  Fees. What the competition actually pays per buy:');
console.log('     41Lur83…C3od   0.0500 fee + 0.0513 tip  ->   0% failures');
console.log('     HyMGBFBi…      0.0460 fee + 0.0247 tip  ->  25% failures');
console.log('     5hQ38HKk…      0.0002 fee + 0.0047 tip  ->  59% failures');
console.log('     FEUa5TK…Hz4    0.0000 fee + 0.0047 tip  ->  92% failures\n');
const priorityFeeSol = await askNumber('  priority fee (SOL)', existingConfig.priorityFeeSol ?? 0.06);
const tipSol = await askNumber('  tip per relay (SOL)', existingConfig.tipSol ?? 0.055);

const total = priorityFeeSol + tipSol;
console.log(`\n  -> ${total.toFixed(4)} SOL per attempt, ${((total / buySol) * 100).toFixed(1)}% of a ${buySol} SOL position.`);
if (total > buySol * 0.25) console.log('  ⚠ Over 25% of the position. The trade cannot pay for itself at that ratio.');
else if (total > 0.101) console.log('  You would outbid every sniper measured on these coins.');
else console.log('  ⚠ Below the 0.101 SOL that buys a 0% failure rate.');

const holdSeconds = await askNumber('\n  hold seconds before selling', existingConfig.holdSeconds ?? 20);
const maxConcurrent = await askNumber('  max positions at once', existingConfig.maxConcurrent ?? 1);
const dailyStopLossSol = await askNumber('  daily stop loss (SOL, negative)', existingConfig.dailyStopLossSol ?? -3);
const minTargetSol = await askNumber('  ignore target buys below (SOL)', existingConfig.minTargetSol ?? 10);
const maxSlippagePercent = await askNumber('  max slippage (%)', existingConfig.maxSlippagePercent ?? 35);

// ---------------------------------------------------------------------------
// 4. Write
// ---------------------------------------------------------------------------

const env = `# Written by setup.mjs. Secrets only — never commit this file.
PRIVATE_KEY="${bs58.encode(keypair.secretKey)}"
RPC_URL="${rpcUrl}"
GRPC_URL="${grpcUrl}"
GRPC_TOKEN="${grpcToken}"
NOZOMI_URL="${nozomiUrl}"
NOZOMI_TIP="${nozomiTip}"
ASTRALANE_URL="${astraUrl}"
ASTRALANE_TIP="${astraTip}"
`;
fs.writeFileSync(ENV_PATH, env, { mode: 0o600 });

const config = {
  ...existingConfig,
  targets,
  minTargetSol,
  buySol,
  priorityFeeSol,
  tipSol,
  maxSlippagePercent,
  holdSeconds,
  maxConcurrent,
  dailyStopLossSol,
  curveFractionSold: existingConfig.curveFractionSold ?? 0.99,
  computeUnitLimit: existingConfig.computeUnitLimit ?? 250_000,
  enabled: true,
};
fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));

console.log(`\n  Wrote .env (mode 600) and config.json`);

if (rpcUrl) {
  try {
    const balance = await new Connection(rpcUrl, 'confirmed').getBalance(keypair.publicKey);
    console.log(`  Balance: ${(balance / 1e9).toFixed(4)} SOL`);
    const perTrade = buySol + total;
    if (balance / 1e9 < perTrade) {
      console.log(`  ⚠ Not enough for one trade (needs ~${perTrade.toFixed(3)} SOL). Fund it first.`);
    }
  } catch {
    console.log('  Could not check the balance — is the RPC URL right?');
  }
}

console.log('\n  Next: node index.mjs --dry');
console.log('  Leave it running for a day and read the "slots behind" line.');
console.log('  0 means go live. 1 or more means your feed is too slow to profit.\n');

rl.close();
