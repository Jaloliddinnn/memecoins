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
<title>Sniper</title>
<style>
  :root{--bg:#0a0a0c;--s1:#141417;--s2:#1c1c20;--tx:#f5f5f7;--dim:#8e8e93;
        --blue:#0a84ff;--green:#30d158;--red:#ff453a;--amber:#ff9f0a;--line:rgba(255,255,255,.08)}
  *{box-sizing:border-box;margin:0}
  html,body{height:100%;overflow:hidden}
  body{background:var(--bg);color:var(--tx);
       font:13px/1.35 -apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif;
       display:flex;flex-direction:column}

  header{display:flex;align-items:center;gap:14px;padding:10px 16px;border-bottom:1px solid var(--line);flex:none}
  header h1{font-size:17px;letter-spacing:-.01em}
  .pill{display:flex;align-items:center;gap:6px;background:var(--s2);border-radius:999px;padding:5px 11px;font-size:11.5px}
  .dot{width:7px;height:7px;border-radius:50%;background:var(--dim);flex:none}
  .wl{font-family:ui-monospace,Menlo,monospace;font-size:11px;color:var(--dim);
      overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:340px}
  .spacer{flex:1}
  button{border:0;border-radius:9px;padding:8px 14px;font:600 12.5px inherit;cursor:pointer;color:#fff;white-space:nowrap}
  .go{background:var(--green);color:#04210d}.primary{background:var(--blue)}
  .stop{background:var(--red)}.ghost{background:var(--s2);color:var(--tx)}
  button:disabled{opacity:.4;cursor:default}

  main{flex:1;display:grid;grid-template-columns:1fr 1fr 1.15fr;gap:12px;padding:12px 16px;min-height:0}
  .col{display:flex;flex-direction:column;gap:9px;min-height:0;overflow:auto}
  .col::-webkit-scrollbar{width:0}
  h2{font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--dim);margin-top:2px}
  label{display:block}
  label>span{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--dim);margin-bottom:3px}
  input,textarea{width:100%;background:var(--s2);border:0;border-radius:9px;padding:8px 10px;
       color:var(--tx);font:13px/1.3 inherit;outline:none}
  input:focus,textarea:focus{box-shadow:0 0 0 2px var(--blue) inset}
  textarea{font-family:ui-monospace,Menlo,monospace;font-size:11px;resize:none;height:66px}
  .g2{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .hint{font-size:10.5px;color:var(--dim);line-height:1.4}
  .msg{border-radius:9px;padding:8px 10px;font-size:11.5px;line-height:1.45}
  .warn{background:rgba(255,159,10,.13);color:var(--amber)}
  .ok{background:rgba(48,209,88,.13);color:var(--green)}
  .err{background:rgba(255,69,58,.13);color:var(--red)}
  #log{flex:1;min-height:0;background:#000;border-radius:11px;padding:10px;overflow:auto;
       font:11px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;word-break:break-word}
  @media(max-width:1100px){main{grid-template-columns:1fr 1fr}#logCol{grid-column:1/-1}}
</style></head><body>

<header>
  <h1>Sniper</h1>
  <div class="pill"><span class="dot" id="dot"></span><b id="state">Stopped</b></div>
  <div class="wl" id="walletLine">No wallet</div>
  <div class="spacer"></div>
  <button class="go" id="startDry">Test run</button>
  <button class="primary" id="startLive">Go live</button>
  <button class="stop" id="stop" disabled>Stop</button>
  <button class="ghost" id="save">Save</button>
</header>

<main>
  <div class="col">
    <h2>Wallet</h2>
    <label><span>Private key (burner)</span><input id="PRIVATE_KEY" type="password" placeholder="paste, or generate"></label>
    <button class="ghost" id="gen">Generate a new wallet</button>
    <div class="hint">Never leaves this computer.</div>

    <h2>Feed — the eyes</h2>
    <label><span>gRPC URL</span><input id="GRPC_URL" placeholder="http://84.32.104.38:10001"></label>
    <div class="hint"><b>http://</b> for IP-whitelisted (AllenHark), <b>https://</b> for token feeds.</div>
    <label><span>gRPC token</span><input id="GRPC_TOKEN" placeholder="blank if IP-whitelisted"></label>
    <label><span>RPC URL</span><input id="RPC_URL" placeholder="https://mainnet.helius-rpc.com/?api-key=..."></label>
    <div id="msg"></div>
  </div>

  <div class="col">
    <h2>Relays — the legs</h2>
    <label><span>Astralane URL</span><input id="ASTRALANE_URL" placeholder="http://ams.gateway.astralane.io/iris?api-key=..."></label>
    <label><span>Astralane tip account</span><input id="ASTRALANE_TIP" placeholder="astra..."></label>
    <label><span>Nozomi URL</span><input id="NOZOMI_URL"></label>
    <label><span>Nozomi tip account</span><input id="NOZOMI_TIP" placeholder="noz..."></label>

    <h2>Targets</h2>
    <label><textarea id="targets" placeholder="one wallet per line"></textarea></label>
    <button class="ghost" id="useSnipers">Use the known snipers</button>
    <div class="hint">The scammers&rsquo; ~20 SOL wallets change every coin. The snipers do not, and buy in the same block.</div>
  </div>

  <div class="col" id="logCol">
    <h2>Trade</h2>
    <div class="g2">
      <label><span>SOL per trade</span><input id="buySol" type="number" step="0.1"></label>
      <label><span>Hold seconds</span><input id="holdSeconds" type="number"></label>
      <label><span>Priority fee</span><input id="priorityFeeSol" type="number" step="0.001"></label>
      <label><span>Tip per relay</span><input id="tipSol" type="number" step="0.001"></label>
      <label><span>Ignore buys under</span><input id="minTargetSol" type="number" step="0.5"></label>
      <label><span>Max slippage %</span><input id="maxSlippagePercent" type="number"></label>
      <label><span>Max open</span><input id="maxConcurrent" type="number"></label>
      <label><span>Daily stop (SOL)</span><input id="dailyStopLossSol" type="number"></label>
    </div>
    <div class="hint" id="feeNote"></div>
    <h2>Live log</h2>
    <div id="log"></div>
  </div>
</main>

<script>
const $ = (id) => document.getElementById(id);
const ENV = ['PRIVATE_KEY','RPC_URL','GRPC_URL','GRPC_TOKEN','ASTRALANE_URL','ASTRALANE_TIP','NOZOMI_URL','NOZOMI_TIP'];
const CFG = ['buySol','holdSeconds','priorityFeeSol','tipSol','minTargetSol','maxSlippagePercent','maxConcurrent','dailyStopLossSol'];
const SNIPERS = ['HyMGBFBi1H9vZcSHoevPcvkAmHiKxspAYjfnJhiz7JZd','FEUa5TK22AyRyyjKpd2bCx7se1Eczmt7AFxdS6dUfHz4'];

const say = (kind, text) => { $('msg').innerHTML = '<div class="msg ' + kind + '">' + text + '</div>'; };

function feeNote(){
  const per = (+$('priorityFeeSol').value||0) + (+$('tipSol').value||0);
  const size = +$('buySol').value||0;
  const pct = size ? (per/size*100).toFixed(1) : '0';
  $('feeNote').textContent = per.toFixed(4) + ' SOL per attempt — ' + pct + '% of the position, ' +
    (per > 0.101 ? 'above every sniper measured on these coins.' : 'below the 0.101 that buys a 0% failure rate.');
}

function paint(d){
  const on = d.running;
  $('dot').style.background = on ? 'var(--green)' : 'var(--dim)';
  $('state').textContent = on ? ('Running · ' + d.mode) : 'Stopped';
  $('stop').disabled = !on; $('startDry').disabled = on; $('startLive').disabled = on;
}

async function load(){
  const d = await (await fetch('/api/state')).json();
  for (const k of ENV) $(k).value = d.env[k] || '';
  for (const k of CFG) $(k).value = d.config[k];
  $('targets').value = (d.config.targets||[]).join('\\n');
  $('walletLine').textContent = d.wallet ? d.wallet + '  ·  ' + d.balance.toFixed(3) + ' SOL' : 'No wallet';
  feeNote(); paint(d);
}

async function save(){
  const env = {}; for (const k of ENV) env[k] = $(k).value.trim();
  const config = { targets: $('targets').value.split(/[\\s,]+/).filter(Boolean) };
  for (const k of CFG) config[k] = Number($(k).value);
  const d = await (await fetch('/api/save', {method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({env,config})})).json();
  if (d.error) { say('err', d.error); return false; }
  say(d.warnings.length ? 'warn' : 'ok', d.warnings.length ? d.warnings.join(' ') : 'Saved.');
  load(); return true;
}

$('save').onclick = save;
$('gen').onclick = async () => {
  const d = await (await fetch('/api/generate', {method:'POST'})).json();
  $('PRIVATE_KEY').value = d.secret;
  say('ok', 'New wallet ' + d.address + ' — send SOL there before going live, then Save.');
};
$('useSnipers').onclick = () => { $('targets').value = SNIPERS.join('\\n'); };
$('startDry').onclick = async () => { if (await save()) fetch('/api/start?dry=1',{method:'POST'}); };
$('startLive').onclick = async () => {
  if (!confirm('This spends real SOL on every fire. Continue?')) return;
  if (await save()) fetch('/api/start',{method:'POST'});
};
$('stop').onclick = () => fetch('/api/stop',{method:'POST'});
for (const k of ['priorityFeeSol','tipSol','buySol']) $(k).addEventListener('input', feeNote);

let seen = 0;
setInterval(async () => {
  const d = await (await fetch('/api/logs?since=' + seen)).json();
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
