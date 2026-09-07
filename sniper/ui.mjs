#!/usr/bin/env node
/**
 * Local control panel.
 *
 *     npm start        ->  opens http://127.0.0.1:4321
 *
 * Everything setup.mjs asks at a prompt, in a browser form instead: wallet,
 * endpoints, relays, targets, size, fees. Plus start/stop and a live log.
 *
 * Bound to 127.0.0.1 ONLY, and it says so on the page. That is the whole reason
 * the private key can live here at all — this server is not reachable from
 * anywhere but this machine, unlike the deployed /sniper panel, which
 * deliberately cannot see or set a key.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Keypair, Connection } from '@solana/web3.js';
import bs58 from 'bs58';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.join(HERE, '.env');
const CONFIG_PATH = path.join(HERE, 'config.json');
const PORT = Number(process.env.UI_PORT ?? 4321);

const ENV_KEYS = [
  'PRIVATE_KEY', 'RPC_URL', 'GRPC_URL', 'GRPC_TOKEN',
  'ASTRALANE_URL', 'ASTRALANE_TIP', 'NOZOMI_URL', 'NOZOMI_TIP',
  'PANEL_URL', 'SNIPER_TOKEN',
];

const CONFIG_DEFAULTS = {
  targets: [], minTargetSol: 1, buySol: 2, priorityFeeSol: 0.06, tipSol: 0.055,
  maxSlippagePercent: 35, holdSeconds: 20, maxConcurrent: 1, dailyStopLossSol: -3,
  curveFractionSold: 0.99, computeUnitLimit: 250000, enabled: true,
};

function readEnv() {
  const out = {};
  if (!fs.existsSync(ENV_PATH)) return out;
  for (const line of fs.readFileSync(ENV_PATH, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
    if (m && ENV_KEYS.includes(m[1])) out[m[1]] = m[2];
  }
  return out;
}

function writeEnv(values) {
  const merged = { ...readEnv(), ...values };
  const body = ENV_KEYS.map((k) => `${k}="${merged[k] ?? ''}"`).join('\n');
  fs.writeFileSync(ENV_PATH, `# Written by the local control panel. Secrets — never commit.\n${body}\n`, {
    mode: 0o600,
  });
}

function readConfig() {
  try {
    return { ...CONFIG_DEFAULTS, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) };
  } catch {
    return { ...CONFIG_DEFAULTS };
  }
}

function writeConfig(next) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify({ ...readConfig(), ...next }, null, 2));
}

// ---------------------------------------------------------------------------
// The bot process
// ---------------------------------------------------------------------------

let child = null;
let logs = [];
let mode = null;

function pushLog(line) {
  const text = String(line).replace(/\s+$/, '');
  if (!text) return;
  logs.push({ at: Date.now(), text });
  if (logs.length > 400) logs = logs.slice(-400);
}

function startBot(dry) {
  if (child) return { error: 'Already running' };
  const args = ['index.mjs'];
  if (dry) args.push('--dry');
  logs = [];
  mode = dry ? 'DRY' : 'LIVE';
  pushLog(`--- starting: node ${args.join(' ')} ---`);

  child = spawn(process.execPath, args, { cwd: HERE, env: process.env });
  child.stdout.on('data', (b) => String(b).split('\n').forEach(pushLog));
  child.stderr.on('data', (b) => String(b).split('\n').forEach(pushLog));
  child.on('exit', (code) => {
    pushLog(`--- bot exited (code ${code}) ---`);
    child = null;
    mode = null;
  });
  return { ok: true };
}

function stopBot() {
  if (!child) return { error: 'Not running' };
  child.kill('SIGTERM');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const PAGE = /* html */ `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sniper control panel</title>
<style>
  :root{--bg:#0a0a0c;--surface:#141417;--surface2:#1c1c20;--text:#f5f5f7;--dim:#8e8e93;
        --blue:#0a84ff;--green:#30d158;--red:#ff453a;--amber:#ff9f0a;--line:rgba(255,255,255,.09)}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--text);
       font:15px/1.45 -apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif}
  .wrap{max-width:760px;margin:0 auto;padding:24px 18px 80px}
  h1{font-size:30px;letter-spacing:-.02em;margin:0 0 2px}
  .sub{color:var(--dim);font-size:13px;margin-bottom:22px}
  h2{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--dim);margin:26px 0 8px}
  label{display:block;margin-bottom:12px}
  label>span{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--dim);margin-bottom:5px}
  input,textarea{width:100%;background:var(--surface2);border:0;border-radius:11px;padding:12px 13px;
       color:var(--text);font:15px/1.4 inherit;outline:none}
  input:focus,textarea:focus{box-shadow:0 0 0 2px var(--blue) inset}
  textarea{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px;min-height:86px;resize:vertical}
  .row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .hint{font-size:11.5px;color:var(--dim);margin:-7px 0 12px;line-height:1.45}
  button{border:0;border-radius:13px;padding:14px 18px;font:600 15px inherit;cursor:pointer;color:#fff}
  .primary{background:var(--blue)} .go{background:var(--green);color:#04210d}
  .stop{background:var(--red)} .ghost{background:var(--surface2);color:var(--text)}
  button:disabled{opacity:.45;cursor:default}
  .bar{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}
  .card{background:var(--surface);border-radius:16px;padding:14px 15px;margin-top:12px}
  .warn{background:rgba(255,159,10,.12);color:var(--amber);border-radius:12px;padding:11px 13px;font-size:12.5px;line-height:1.5;margin-top:12px}
  .ok{background:rgba(48,209,88,.12);color:var(--green);border-radius:12px;padding:11px 13px;font-size:12.5px;margin-top:12px}
  .err{background:rgba(255,69,58,.12);color:var(--red);border-radius:12px;padding:11px 13px;font-size:12.5px;margin-top:12px}
  #log{background:#000;border-radius:14px;padding:13px;height:340px;overflow:auto;
       font:12px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;word-break:break-word}
  .dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:7px;vertical-align:middle}
  .mono{font-family:ui-monospace,Menlo,monospace;font-size:12px;color:var(--dim);word-break:break-all}
  @media(max-width:520px){.row{grid-template-columns:1fr}}
</style></head><body><div class="wrap">

<h1>Sniper</h1>
<div class="sub">Local control panel — this page is only reachable from this computer.</div>

<div class="card">
  <div><span class="dot" id="dot" style="background:var(--dim)"></span><b id="state">Stopped</b></div>
  <div class="mono" id="walletLine" style="margin-top:6px"></div>
  <div class="bar">
    <button class="go" id="startDry">Start test run</button>
    <button class="primary" id="startLive">Start for real</button>
    <button class="stop" id="stop" disabled>Stop</button>
  </div>
  <div class="hint" style="margin:10px 0 0">A test run builds and signs everything but sends nothing. Do that first.</div>
</div>

<h2>Wallet</h2>
<label><span>Private key of a burner wallet</span>
  <input id="PRIVATE_KEY" type="password" placeholder="paste, or press Generate"></label>
<div class="bar" style="margin:-4px 0 6px"><button class="ghost" id="gen">Generate a new wallet</button></div>
<div class="hint">Never leaves this computer. Fund it with only what you can lose.</div>

<h2>Feed &amp; endpoints</h2>
<label><span>gRPC URL — the eyes</span><input id="GRPC_URL" placeholder="http://84.32.104.38:10001"></label>
<div class="hint">Use <b>http://</b> for IP-whitelisted feeds like AllenHark, <b>https://</b> for token ones. Join the host and port from their console.</div>
<label><span>gRPC token (blank for IP-whitelisted)</span><input id="GRPC_TOKEN" placeholder="leave empty"></label>
<label><span>RPC URL</span><input id="RPC_URL" placeholder="https://mainnet.helius-rpc.com/?api-key=..."></label>

<h2>Relays — the legs (optional for a test run)</h2>
<div class="row">
  <label><span>Astralane URL</span><input id="ASTRALANE_URL" placeholder="http://ams.gateway.astralane.io/iris?api-key=..."></label>
  <label><span>Astralane tip account</span><input id="ASTRALANE_TIP" placeholder="astra..."></label>
  <label><span>Nozomi URL</span><input id="NOZOMI_URL"></label>
  <label><span>Nozomi tip account</span><input id="NOZOMI_TIP"></label>
</div>

<h2>Targets</h2>
<label><span>Wallets to copy — one per line</span><textarea id="targets"></textarea></label>
<div class="hint">The scammers' ~20 SOL wallets now change every coin, so they go stale within hours. The snipers do not change — copying them puts you in the same block.</div>
<div class="bar" style="margin:-4px 0 0"><button class="ghost" id="useSnipers">Use the known snipers</button></div>

<h2>Trade</h2>
<div class="row">
  <label><span>SOL per trade</span><input id="buySol" type="number" step="0.1"></label>
  <label><span>Hold seconds</span><input id="holdSeconds" type="number"></label>
  <label><span>Priority fee (SOL)</span><input id="priorityFeeSol" type="number" step="0.001"></label>
  <label><span>Tip per relay (SOL)</span><input id="tipSol" type="number" step="0.001"></label>
  <label><span>Ignore target buys under (SOL)</span><input id="minTargetSol" type="number" step="0.5"></label>
  <label><span>Max slippage (%)</span><input id="maxSlippagePercent" type="number"></label>
  <label><span>Max open positions</span><input id="maxConcurrent" type="number"></label>
  <label><span>Daily stop loss (SOL)</span><input id="dailyStopLossSol" type="number"></label>
</div>
<div id="feeNote" class="hint"></div>

<div class="bar"><button class="primary" id="save">Save settings</button></div>
<div id="msg"></div>

<h2>Live log</h2>
<div id="log"></div>

</div><script>
const $ = (id) => document.getElementById(id);
const ENV = ['PRIVATE_KEY','RPC_URL','GRPC_URL','GRPC_TOKEN','ASTRALANE_URL','ASTRALANE_TIP','NOZOMI_URL','NOZOMI_TIP'];
const CFG = ['buySol','holdSeconds','priorityFeeSol','tipSol','minTargetSol','maxSlippagePercent','maxConcurrent','dailyStopLossSol'];
const SNIPERS = ['HyMGBFBi1H9vZcSHoevPcvkAmHiKxspAYjfnJhiz7JZd','FEUa5TK22AyRyyjKpd2bCx7se1Eczmt7AFxdS6dUfHz4'];

function say(kind, text){ $('msg').innerHTML = '<div class="'+kind+'">'+text+'</div>'; }

function feeNote(){
  const per = (+$('priorityFeeSol').value||0) + (+$('tipSol').value||0);
  const size = +$('buySol').value||0;
  const pct = size ? (per/size*100).toFixed(1) : '0';
  let verdict = per > 0.101 ? 'above every sniper measured on these coins.'
    : 'below the 0.101 SOL that buys a 0% failure rate.';
  $('feeNote').textContent = per.toFixed(4)+' SOL per attempt — '+pct+'% of the position, '+verdict;
}

async function load(){
  const r = await fetch('/api/state'); const d = await r.json();
  for (const k of ENV) $(k).value = d.env[k] || '';
  for (const k of CFG) $(k).value = d.config[k];
  $('targets').value = (d.config.targets||[]).join('\\n');
  $('walletLine').textContent = d.wallet ? 'Wallet ' + d.wallet + '  ·  ' + d.balance.toFixed(4) + ' SOL' : 'No wallet set yet';
  feeNote();
  paint(d);
}

function paint(d){
  const on = d.running;
  $('dot').style.background = on ? 'var(--green)' : 'var(--dim)';
  $('state').textContent = on ? ('Running · ' + d.mode) : 'Stopped';
  $('stop').disabled = !on; $('startDry').disabled = on; $('startLive').disabled = on;
}

async function save(){
  const env = {}; for (const k of ENV) env[k] = $(k).value.trim();
  const config = { targets: $('targets').value.split(/[\\s,]+/).filter(Boolean) };
  for (const k of CFG) config[k] = Number($(k).value);
  const r = await fetch('/api/save', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({env,config})});
  const d = await r.json();
  if (d.error) return say('err', d.error);
  say(d.warnings && d.warnings.length ? 'warn' : 'ok', d.warnings && d.warnings.length ? d.warnings.join(' ') : 'Saved.');
  load();
}

$('save').onclick = save;
$('gen').onclick = async () => {
  const r = await fetch('/api/generate', {method:'POST'}); const d = await r.json();
  $('PRIVATE_KEY').value = d.secret;
  say('ok', 'New wallet ' + d.address + ' — send SOL there before running for real. Press Save.');
};
$('useSnipers').onclick = () => { $('targets').value = SNIPERS.join('\\n'); };
$('startDry').onclick = async () => { await save(); await fetch('/api/start?dry=1',{method:'POST'}); };
$('startLive').onclick = async () => {
  if (!confirm('This spends real SOL on every fire. Continue?')) return;
  await save(); await fetch('/api/start',{method:'POST'});
};
$('stop').onclick = () => fetch('/api/stop',{method:'POST'});
for (const k of ['priorityFeeSol','tipSol','buySol']) $(k).addEventListener('input', feeNote);

let seen = 0;
setInterval(async () => {
  const r = await fetch('/api/logs?since=' + seen); const d = await r.json();
  paint(d);
  if (d.lines.length) {
    const box = $('log');
    const stick = box.scrollTop + box.clientHeight >= box.scrollHeight - 30;
    box.textContent += d.lines.map(l => l.text).join('\\n') + '\\n';
    seen = d.next;
    if (stick) box.scrollTop = box.scrollHeight;
  }
}, 1000);
load();
</script></body></html>`;

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

function json(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try {
    return JSON.parse(Buffer.concat(chunks).toString() || '{}');
  } catch {
    return {};
  }
}

function walletFrom(secret) {
  if (!secret) return null;
  try {
    const bytes = secret.trim().startsWith('[')
      ? Uint8Array.from(JSON.parse(secret))
      : bs58.decode(secret.trim());
    return bytes.length === 64 ? Keypair.fromSecretKey(bytes) : null;
  } catch {
    return null;
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(PAGE);
  }

  if (url.pathname === '/api/state') {
    const env = readEnv();
    const kp = walletFrom(env.PRIVATE_KEY);
    let balance = 0;
    if (kp && env.RPC_URL) {
      balance = await new Connection(env.RPC_URL, 'confirmed')
        .getBalance(kp.publicKey).then((b) => b / 1e9).catch(() => 0);
    }
    return json(res, 200, {
      env, config: readConfig(), running: Boolean(child), mode,
      wallet: kp ? kp.publicKey.toBase58() : null, balance,
    });
  }

  if (url.pathname === '/api/generate' && req.method === 'POST') {
    const kp = Keypair.generate();
    return json(res, 200, { address: kp.publicKey.toBase58(), secret: bs58.encode(kp.secretKey) });
  }

  if (url.pathname === '/api/save' && req.method === 'POST') {
    const body = await readBody(req);
    const env = body.env ?? {};
    if (env.PRIVATE_KEY && !walletFrom(env.PRIVATE_KEY)) {
      return json(res, 400, { error: 'That private key is not a valid 64-byte Solana key.' });
    }
    writeEnv(env);
    const config = body.config ?? {};
    writeConfig(config);

    const warnings = [];
    const per = (config.priorityFeeSol ?? 0) + (config.tipSol ?? 0);
    if (config.buySol && per > config.buySol * 0.25) {
      warnings.push(`Fees are ${per.toFixed(3)} SOL against a ${config.buySol} SOL position — the trade cannot pay for itself.`);
    }
    if (config.buySol > 3) {
      warnings.push('Above 3 SOL: measured over 216 coins, ~2 SOL wins 89.5% and ~5 SOL only 60.7%.');
    }
    if (config.minTargetSol > 3 && (config.targets ?? []).length) {
      warnings.push('The snipers buy about 2 SOL. With "ignore under" above 3 the bot will skip them all.');
    }
    if (!(config.targets ?? []).length) warnings.push('No target wallets — the bot has nothing to watch.');
    return json(res, 200, { ok: true, warnings });
  }

  if (url.pathname === '/api/start' && req.method === 'POST') {
    return json(res, 200, startBot(url.searchParams.get('dry') === '1'));
  }
  if (url.pathname === '/api/stop' && req.method === 'POST') {
    return json(res, 200, stopBot());
  }

  if (url.pathname === '/api/logs') {
    const since = Number(url.searchParams.get('since') ?? 0);
    return json(res, 200, {
      lines: logs.slice(since), next: logs.length, running: Boolean(child), mode,
    });
  }

  res.writeHead(404).end('not found');
});

// 127.0.0.1 only. This page holds a private key; it must never be reachable
// from the network, and binding to localhost is what guarantees that.
server.listen(PORT, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${PORT}`;
  console.log(`\n  Sniper control panel:  ${url}\n`);
  // Opening the browser is a convenience, not a requirement. Without the error
  // handler a missing `xdg-open` raises an unhandled 'error' event and takes
  // the whole server down — which is how this was first found, on a headless box.
  try {
    const opener =
      process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
    const proc = spawn(opener, [url], {
      stdio: 'ignore',
      detached: true,
      shell: process.platform === 'win32',
    });
    proc.on('error', () => console.log('  (open that link yourself — no browser command found)'));
    proc.unref();
  } catch {
    /* the URL is printed above; that is enough */
  }
});

process.on('SIGINT', () => {
  if (child) child.kill('SIGTERM');
  process.exit(0);
});
