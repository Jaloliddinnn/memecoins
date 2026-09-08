# Build prompt — Solana copy-trade sniper

Paste everything below into your coding agent. It is written to be executed, not
discussed. Every number in it was measured on-chain, not estimated.

---

## 0. Your role

Build a Solana copy-trading sniper bot that runs on my laptop (macOS), controlled
from a local web page in my browser. I never want to touch a terminal after the
first install.

Work in `~/sniper`. Do not create a GitHub repo. Do not ask me to run commands
you could have put behind a button.

Before writing code, read §7 (Known traps). Every item there is a bug that was
already hit and cost hours. Most of them fail **silently** — the bot looks like
it is working and quietly loses money.

---

## 1. What this bot does, and why

### The market

Organised groups launch scam memecoins on pump.fun. Their pattern is fixed:

1. A dev wallet creates the coin.
2. In the **same block**, 4 wallets each buy ~19–21 SOL.
3. That forces the bonding curve to ~99.1% completion instantly, pinning the
   opening market cap at ~$40,000.
4. Retail buys the "already pumping" chart. The group sells into it.
5. Most of these coins die at $50–60k.

### The opportunity

A separate class of trader — the *snipers* — buy ~2 SOL in the same block as the
stack, then sell 15–30 seconds later for 20–50%. They are not part of the scam;
they are farming it. One tracked wallet
(`HyMGBFBi1H9vZcSHoevPcvkAmHiKxspAYjfnJhiz7JZd`) makes $300–1000/day this way.

This bot copies them: watch a sniper's wallet, and when they buy a brand-new
coin, buy the same coin in the same block.

### The one number that decides everything

Measured across their coins:

| Slot | Delay | Median market cap | vs. entry |
|------|-------|-------------------|-----------|
| +0   | 0ms   | $43,018           | — |
| +1   | 400ms | $46,933           | **+13.5%** |

The move being farmed is ~18%. Round-trip friction is ~5%. **One slot late eats
13.5% of an 18% move and the trade stops working.**

So the bot must produce this measurement before it ever spends money:

```
target slot N, we were ready ~D slot(s) later
```

- `D = 0` → viable, go live.
- `D ≥ 1` → the feed is too slow; going live just donates fees.

Build the dry-run mode that produces `D` **first**. It is the product. The
trading is the easy part.

### Position sizing (measured over 216 of their coins)

| Size | Win rate | Mean ROI |
|------|----------|----------|
| ~2 SOL | 89.5% | 12.89% |
| ~5 SOL | 60.7% | 7.35% |

All eight of their worst trades were 5 SOL. A bigger buy moves a seconds-old
pool against your own fill. Default to 2 SOL. Warn above 3, do not block.

### What the competition pays per buy

| Wallet | Priority fee | Tip | Failure rate |
|--------|--------------|-----|--------------|
| `41Lur83…C3od` | 0.0500 | 0.0513 | **0%** |
| `HyMGBFBi…`    | 0.0460 | 0.0247 | 25% |
| `5hQ38HKk…`    | 0.0002 | 0.0047 | 59% |
| `FEUa5TK…Hz4`  | 0.0000 | 0.0047 | 92% |

~0.101 SOL total buys a 0% failure rate. Default to 0.115 split 52% priority /
48% tip.

Caveat, do not over-generalise this table: at least one wallet
(`HhZvraK3x5zL4otbr4Dti2PeEVSWppPtPCeMnxsRgpap`) reaches slot 0 paying 0.007 SOL
by using a specialised service. Fees buy *ordering*, not *arrival* (§4.3).

---

## 2. Hard constraints

1. **The private key never leaves the machine.** It lives in `~/sniper/.env`,
   mode `0600`. The control panel binds to `127.0.0.1` only. Never make the key
   readable from any endpoint that could be exposed.
2. **No terminal after install.** Config, start, stop, and *updating the bot
   itself* are buttons.
3. **Everything autosaves as you type.** No Save button. See trap §7.13.
4. **Dry-run must be genuinely safe** — build and sign the transaction, then
   stop before sending. This exercises the whole path so the measurement is real.
5. **Manual exit is the default.** The bot buys and does not sell. Optional
   timed auto-sell, off unless asked.
6. **Never invent safety rails I did not ask for.** Position caps and stop
   losses default to OFF. Surface warnings; do not refuse to start.

---

## 3. Stack

- **Node.js ≥ 18**, ESM (`"type": "module"`). No TypeScript, no build step.
- `@solana/web3.js` ^1.98
- `@triton-one/yellowstone-grpc` ^1.3 — the data feed
- `bs58`, `dotenv`, `bip39`, `ed25519-hd-key`
- **No web framework.** Node's built-in `http` module. The UI is one HTML string
  in one file.

`package.json` **must** contain:

```json
"overrides": { "uuid": "^11.1.0" }
```

Without it the install breaks on `ERR_REQUIRE_ESM` (§7.11). Commit the lockfile.

### File layout

```
~/sniper/
  .env            secrets, mode 0600, never committed
  config.json     tunables, rewritten by the panel
  package.json
  ui.mjs          control panel + process supervisor   -> npm start
  index.mjs       the bot itself
  clone.mjs       instruction cloning + curve maths
  send.mjs        transaction assembly + relay fan-out
  config.mjs      config load/validate, secrets, relay list
  probe.mjs       feed diagnostics
  up.sh           install + launch + auto-restart wrapper
```

---

## 4. How it works

### 4.1 The core trick: clone, don't construct

Do **not** build the pump.fun buy instruction from scratch. Constructing 18
accounts with correct signer/writable flags is where bots silently break.

Instead: take the target's own buy instruction off the wire and swap only the
three accounts that identify the buyer.

```
index 5  -> your associated token account
index 6  -> your pubkey (signer)
index 13 -> your user_volume_accumulator PDA
```

Everything else — global config, fee recipient, mint, bonding curve, its ATA,
programs, the creator vault, the global volume accumulator — is already correct
because the target's transaction was accepted by the chain.

Then rewrite the instruction data: same 8-byte discriminator, your own `amount`
and `maxSolCost`.

You must also **prepend `createAssociatedTokenAccountIdempotent`** for your ATA.
It will not exist for a coin that is seconds old (§7.3).

### 4.2 Deriving account flags

The feed gives you a compiled message. To rebuild it you need each account's
signer/writable flags. Derive them from the header — do not guess:

```js
export function accountFlags({ header, staticKeyCount, loadedWritableCount, totalKeys }) {
  const { numRequiredSignatures: signers,
          numReadonlySignedAccounts: roSigned,
          numReadonlyUnsignedAccounts: roUnsigned } = header;
  return (index) => {
    if (index < staticKeyCount) {
      const isSigner = index < signers;
      const isWritable = isSigner
        ? index < signers - roSigned
        : index < staticKeyCount - roUnsigned;
      return { isSigner, isWritable };
    }
    // Address-lookup-table accounts: writable ones come first, then readonly.
    return { isSigner: false, isWritable: index - staticKeyCount < loadedWritableCount };
  };
}
```

Getting one flag wrong produces a transaction that fails on-chain with a useless
error. Four were wrong in the first version (§7.4).

### 4.3 Arrival vs ordering — understand this before tuning fees

Two separate problems decide whether a snipe lands:

- **ARRIVAL** — does the transaction reach the block leader before it packs the
  block? **Relays fix this. Money does not.** If you arrive after the block
  closes, no bid gets you in.
- **ORDERING** — among transactions the leader already holds, who goes first?
  **The priority fee fixes this.**

So: fan out to every relay simultaneously *and* bid above the competition. The
same signed transaction arriving five times is deduplicated by the network —
redundancy is free.

### 4.4 Feed: what to subscribe to

Yellowstone gRPC, `CommitmentLevel.PROCESSED`, filtered by `accountInclude` on
the target wallets.

**Build the request with `SubscribeRequest.fromPartial({...})`.** A hand-written
object literal omits fields (`transactionsStatus`, `ping`, `fromSlot`) and fails
serialization with `Cannot convert undefined or null to object`, which reads
exactly like a network fault and is not (§7.7).

```js
const request = SubscribeRequest.fromPartial({
  transactions: {
    targets: {
      accountInclude: config.targets,
      accountExclude: [],
      accountRequired: [],
      vote: false,
      failed: false,
    },
  },
  commitment: CommitmentLevel.PROCESSED,
});
stream.write(request, (err) => (err ? reject(err) : resolve()));
```

Detect a target buy by: the transaction touches a target wallet, calls the
pump.fun program, and carries the `buy` discriminator. Deduplicate by mint —
you will see the same mint more than once.

### 4.5 Speed ceiling — know what you are buying

```
websocket  <  normal gRPC  <  shred gRPC  <  raw UDP shreds
```

Normal Yellowstone gRPC emits **after the block executes**. That is structurally
one slot late. Shreds are the fragments validators broadcast **while the block is
being built**.

Build for normal gRPC first — it is a URL. If the measurement says `D ≥ 1`,
the answer is a shred-backed feed, not a more expensive normal one.

Providers (mainnet gRPC; most "free tiers" are devnet-only, which is useless):
Chainstack ~$49/mo, NOWNodes ~€20/mo with a free tier, Shyft $199/mo,
rpc edge $249/mo, Helius $499/mo. Jito ShredStream shut down 2026-09-05;
AllenHark and DoubleZero sell replacements.

---

## 5. On-chain reference

Verify these against a real transaction before trusting them.

### Programs

```
pump.fun         6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P
PumpSwap AMM     pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA
Token-2022       TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb
Associated Token ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL
```

**pump.fun coins use Token-2022, not classic SPL Token.** Using the classic
program id produces an ATA at the wrong address and the buy fails (§7.5).
Read the token program from the cloned instruction rather than hardcoding it.

### Instructions

```
pump.fun buy     discriminator 66063d1201daebea
                 args (amount u64, maxSolCost u64), 18 accounts
PumpSwap sell    discriminator 33e685a4017f83ad
                 args (baseAmountIn u64, minQuoteOut u64), 24 accounts
```

### PDAs

```
bonding curve             ["bonding-curve", mint]                  under pump.fun
user volume accumulator   ["user_volume_accumulator", userPubkey]  under pump.fun
global volume accumulator ["global_volume_accumulator"]            under pump.fun
associated token account  [owner, tokenProgram, mint]              under ATA program
```

### Bonding curve maths

```
virtual SOL reserve      30 SOL
virtual token reserve    1,073,000,000
k                        32,190,000,000
real token reserve       793,100,000

marketCap(sold) = k / (1_073_000_000 - sold)^2 * 1e9
```

Tokens you receive for `solIn`, given the curve is `fractionSold` through:

```js
export const VIRTUAL_TOKENS = 1_073_000_000;
export const K = 32_190_000_000;
export const REAL_RESERVE = 793_100_000;

export function tokensForSol(solIn, fractionSold) {
  const sold = REAL_RESERVE * Math.min(Math.max(fractionSold, 0), 0.999);
  const virtualTokens = VIRTUAL_TOKENS - sold;
  const virtualSol = K / virtualTokens;
  return (solIn * virtualTokens) / (virtualSol + solIn);
}
```

Default `fractionSold = 0.99` — the block-0 stack completes the curve to a
measured 99.1%. This estimate only sets `amount`; `maxSolCost` is the real
protection.

### Compute unit price

```js
const microLamports = Math.floor((priorityFeeSol * 1e9 * 1e6) / computeUnitLimit);
```

`1e9` lamports per SOL, `1e6` micro-lamports per lamport, divided by the CU
limit. Getting this wrong by 1000× is easy and invisible (§7.1). Default CU
limit 250,000 — comfortable for buy + ATA creation.

### Relays

**Nozomi (Temporal)** — `https://<region>.nozomi.temporal.xyz/?c=<API_KEY>`,
regions `ams1 fra2 lon1 ewr1 ash1 pit1 lax1 tyo1 sgp1`. Plain JSON-RPC
`sendTransaction`, so it drops straight in.

Minimum tip **0.001 SOL**. Below that it is **dropped silently, with no error** —
it presents as a missed launch. Warn at startup if the tip falls under it.

Bake in all 17 tip accounts and **pick one at random per transaction**. Their
docs require this: everyone tipping the same account write-locks it, and a
write-locked tip account slows the exact thing you are paying for (§7.10).

```
TEMPaMeCRFAS9EKF53Jd6KpHxgL47uWLcpFArU1Fanq
noz3jAjPiHuBPqiSPkkugaJDkJscPuRhYnSpbi8UvC4
noz3str9KXfpKknefHji8L1mPgimezaiUyCHYMDv1GE
noz6uoYCDijhu1V7cutCpwxNiSovEwLdRHPwmgCGDNo
noz9EPNcT7WH6Sou3sr3GGjHQYVkN3DNirpbvDkv9YJ
nozc5yT15LazbLTFVZzoNZCwjh3yUtW86LoUyqsBu4L
nozFrhfnNGoyqwVuwPAW4aaGqempx4PU6g6D9CJMv7Z
nozievPk7HyK1Rqy1MPJwVQ7qQg2QoJGyP71oeDwbsu
noznbgwYnBLDHu8wcQVCEw6kDrXkPdKkydGJGNXGvL7
nozNVWs5N8mgzuD3qigrCG2UoKxZttxzZ85pvAQVrbP
nozpEGbwx4BcGp6pvEdAh1JoC2CQGZdU6HbNP1v2p6P
nozrhjhkCr3zXT3BiT4WCodYCUFeQvcdUkM7MqhKqge
nozrwQtWhEdrA6W8dkbt9gnUaMs52PdAv5byipnadq3
nozUacTVWub3cL4mJmGCYjKZTnE9RbdY5AP46iQgbPJ
nozWCyTPppJjRuw2fpzDhhWbW355fzosWSzrrMYB1Qk
nozWNju6dY353eMkMqURqwQEoM3SFgEKC6psLCSfUne
nozxNBgWohjR75vdspfxR5H9ceC7XXH99xpxhVGt3Bb
```

Validate at build time that all 17 decode to 32 bytes.

**Astralane (Iris)** — optional second relay, same JSON-RPC shape, minimum tip
10,000 lamports, **region-specific tip accounts** (do not reuse another
region's).

---

## 6. The control panel

`npm start` runs `ui.mjs`, which serves `127.0.0.1:4321`, opens the browser, and
supervises the bot as a child process.

### Layout

**One screen. No page scrolling.** Two columns: controls left, live log right.
Collapse to one column under 900px. Dark theme, system font.

Header: title · status pill (Stopped / Running·DRY / Running·LIVE) · wallet
address + balance · **the build identifier** · a small green `saved` flash ·
then buttons: **Test run**, **Go live**, **Stop**, **Update**.

Show the build id. Without it there is no way to tell whether a restart actually
took, and you will waste hours (§7.14).

### Main fields, in this order

```
1 · Your wallet        password input; private key OR 12/24-word seed phrase
2 · Feed URL           http://host:port  (plain)  or  https://host:443 (TLS)
3 · RPC URL            any standard Solana RPC
4 · Wallets to copy    textarea, one per line, + "Use the known snipers" button
5 · SOL per trade      default 2
6 · Fee per attempt    default 0.115, split 52% priority / 48% tip
7 · Max slippage %     default 35
8 · Nozomi URL         only needed to go live
```

Under `6`, a live line: `X% of the position — above/below the 0.101 SOL that
buys a 0% failure rate.`

### Advanced (collapsed, labelled "all optional, blank = off")

Feed token · Auto-sell after seconds · Ignore buys under SOL · Max open
positions · Stop after spending SOL. **All default to blank/0 = off.** Render
`0` as an empty box, not a `0` the user never typed.

### Wallet import

Accept base58, a `[1,2,...]` JSON array, or a **BIP39 seed phrase**. For a seed
phrase, derive several accounts, show each address **with its SOL balance**, and
let the user pick — only they know which one they mean. Paths:

```
m/44'/501'/0'/0'   Phantom account 1
m/44'/501'/1'/0'   Phantom account 2
m/44'/501'/0'      Solflare / CLI
m/44'/501'/0'/0'/0'
```

Also a "Generate a new wallet instead" button.

### Buttons

- **Test run** — `node index.mjs --dry`. Sends nothing.
- **Go live** — confirm dialog stating, in plain language: SOL per trade, fee,
  total cost per attempt, whether it will auto-sell, and whether any limits are
  active. Never a bare "Are you sure?".
- **Stop** — SIGTERM the child.
- **Update** — `git pull`, then restart in place. Implement by exiting with code
  `75`; `up.sh` loops and relaunches on exactly that code. The page polls until
  the server answers, then reloads itself. Refuse to update while the bot runs.

### Endpoints

```
GET  /api/state          env + config + wallet + balance + running + build
POST /api/save           merge-write .env and config.json, return warnings[]
POST /api/resolve        classify a key/seed, return derived accounts + balances
POST /api/generate       new keypair
POST /api/start?dry=1
POST /api/stop
POST /api/update
GET  /api/logs?since=N   incremental log lines
```

`/api/save` returns **warnings, never refusals**, for: fees over 25% of position,
size above 3 SOL, "ignore under" above 3 with targets set, no targets, tip under
the Nozomi minimum.

---

## 7. Known traps

Every one of these was hit for real. Most fail silently.

**7.1 — Compute unit price off by 1000×.** See the formula in §5. Verify against
a real transaction's actual fee.

**7.2 — `amount` set to `u64::MAX`.** Some builders use max-int as "no limit".
Pump.fun's `buy` takes `amount` = tokens you want. Max-int reverts *every* buy.
Compute it from the curve.

**7.3 — No ATA creation.** A coin seconds old has no token account for you.
Prepend `createAssociatedTokenAccountIdempotent`. Idempotent, so it is safe if
one already exists.

**7.4 — Wrong writability flags.** Four of eighteen were wrong initially. Derive
them (§4.2); never hand-write them.

**7.5 — Token-2022 vs classic SPL.** pump.fun uses Token-2022. Wrong program id
→ wrong ATA address → failed buy. Read it from the cloned instruction.

**7.6 — `getSignaturesForAddress` returns NEWEST first.** Taking the last element
as "the create transaction" silently profiles the wrong wallet. Page to the end
properly if you need genesis.

**7.7 — Malformed `SubscribeRequest`.** Use `fromPartial` (§4.4).

**7.8 — Leaked gRPC connections on reconnect.** Feeds are sold **per
connection** — entry plans often allow exactly **one**. If reconnect opens a new
client without closing the old, you exhaust your own allowance and the provider
starts refusing you with `PERMISSION_DENIED: Unauthorized IP` — which sends you
to the wrong console page entirely.

The wrapper `Client` has **no `close()`**. The closable channel is the
`ServiceClientImpl` at `client._client`:

```js
try { stream?.removeAllListeners?.(); stream?.end?.(); stream?.destroy?.(); } catch {}
try { client?.close?.(); client?._client?.close?.(); } catch {}
```

Also guard against multiple `error` events each starting their own reconnect
chain.

**7.9 — Backoff reset on a connect that immediately dies.** A refused
subscription still completes the handshake; the rejection lands ~200ms later.
Resetting the backoff on "connected" makes every refusal look like a first
failure — it retries every 2s forever and reprints the diagnosis each time.
Only clear the counter after a feed has **stayed up ~30s**, tied to that
connection's generation.

**7.10 — One fixed tip account.** Rotate (§5).

**7.11 — `ERR_REQUIRE_ESM` on install.** `rpc-websockets` is CommonJS and
`require`s `uuid`, resolving to ESM-only uuid v14. Fix with the `overrides` in
§3 and commit the lockfile.

**7.12 — `holdSeconds = 0` jamming the concurrency cap.** In manual mode the bot
never sells, so a position never "closes". If the open counter is only
decremented on exit, `maxConcurrent` jams after the first buy and the bot watches
every later launch go by. Release the slot as soon as the buy confirms.

Related: in manual mode nothing is ever credited back, so realised PnL only ever
falls. A "daily stop loss" then really means "stop after spending N SOL". Label
it that way or the line reads as a loss.

**7.13 — Settings that only save on a button press.** Guaranteed data loss.
Autosave, debounced ~700ms. **Exception:** never autosave a half-typed private
key — a partial paste would overwrite a working wallet. Send the key only when
it is unchanged since load, derived from a picked seed account, or confirmed
valid. Omit it otherwise and let the server keep what it has.

**7.14 — The page is compiled into the module at startup.** `git pull` changes
nothing visible until the process restarts. Show the build id in the header.

**7.15 — Misleading feed diagnostics.** Map gRPC status codes to actions:

| Symptom | Real cause | Say |
|---|---|---|
| `PERMISSION_DENIED` | expired plan, connection limit used, or IP not whitelisted | list all three, in that order; also print the machine's actual outgoing IP |
| `UNAVAILABLE: Upstream unavailable` | **provider's own backend is down** | say the settings are fine — do NOT tell the user to check their URL, which is what got them that far |
| `UNAVAILABLE` (other) | host/port/scheme wrong | check the Feed URL |
| `UNAUTHENTICATED` | bad token | check the token, or blank it for IP auth |

**7.16 — Fee-ratio checks that refuse to start.** A 0.1 SOL trade with a 0.05
fee is a deliberate small test. Warn; never block.

---

## 8. `probe.mjs`

A separate diagnostic, because "Upstream unavailable" 200ms after a clean
connect has two very different causes and the log cannot tell them apart.

Test in order of increasing demand, and report the first failure:

1. `client.getVersion()` — unary; reaches the node, needs no subscription.
2. `subscribe({})` — a subscription asking for nothing.
3. slots only.
4. the real transaction filter at `CONFIRMED`.
5. the real transaction filter at `PROCESSED` (what the bot uses).

Print the reading key:

- all fail incl. `getVersion` → provider's backend is down; their problem.
- `getVersion` passes, all subscribes fail → they authorise you but sell no
  stream on this plan.
- empty/slots pass, ours fails → our request is wrong.
- `CONFIRMED` passes, `PROCESSED` fails → `PROCESSED` is a paid tier there.

Hold each subscription open ~6s; surviving that is a pass.

---

## 9. Bot behaviour

### Startup banner

Wallet, balance, target count, size + exit mode, fee breakdown + resulting
µlamports/CU, relay list (with tip-account count), and `DRY RUN` vs
`LIVE — real money`. Warn if the balance is under one trade, or if the tip is
under a relay's minimum.

### On a target buy

1. Skip if paused, already seen this mint, target's own size below the minimum,
   concurrency cap hit (only if set), spend limit hit (only if set), or the
   cached blockhash is stale.
2. Clone the instruction, compute `amount` and `maxSolCost`.
3. Build, sign, fan out to every relay in parallel.
4. **Dry run: stop here** and log the slot delta. This is the measurement.
5. Poll for confirmation (~20 × 500ms).
6. Log `LANDED slot N, same slot as the target` / `+D slot(s) late`, and SOL spent.
7. Manual mode: log `HOLDING <mint> — sell it yourself` and free the slot.

Keep a warm blockhash refreshed every ~1.2s, marked stale after 20s. Fetching one
on the critical path costs more than the slot you are racing for.

### Stats line every 60s

```
stats fired=N slot0=N late=N missed=N slot0Rate=X% open=N pnl=X SOL
```

`slot0Rate` is the health metric. Below ~50%, the feed is the problem, not fees.

### Selling (only if auto-sell is on)

Find a recent PumpSwap sell for that mint, clone its pool accounts, swap in your
seller/ATA. If none is found, log **`SELL MANUALLY`** loudly. Never fail silently
holding a bag.

---

## 10. Acceptance criteria

Do not report done until:

1. `npm install && npm start` works from a **clean clone** on macOS with no
   errors. Test it in a fresh directory.
2. The panel loads, imports a seed phrase, shows derived accounts **with
   balances**, and lets me pick one.
3. Every field autosaves. Restarting the panel loses nothing.
4. `node probe.mjs` runs against a real endpoint and prints a clear verdict.
5. **Test run** connects to a feed and stays connected — no retry storm.
6. On a real target buy in dry mode, it prints the slot-delta line.
7. All 17 Nozomi tip accounts decode to 32 bytes; rotation is verifiably random
   across ≥100 draws.
8. `node --check` passes on every `.mjs`, **including the HTML page's inline
   `<script>`** — extract it from the served page and check it. A dangling
   `document.getElementById` reference throws on load and silently kills every
   button.
9. Every `$('id')` referenced in the inline script exists in the markup. Verify
   programmatically.
10. The Update button pulls and restarts, and the header build id changes.

### Verify against reality, not against your own code

Before claiming the buy path works, take a **real 19–21 SOL stacker buy** from
chain, run it through the cloner, and assert:

- 18 accounts, in the same order
- exactly indexes 5, 6, 13 differ
- every signer/writable flag matches for the unchanged accounts
- the discriminator is byte-identical
- the token program is Token-2022
- `maxSolCost` matches the configured slippage

A unit test that only exercises your own assumptions proves nothing here.

---

## 11. Order of work

1. `config.mjs`, `clone.mjs` + the reality check in §10. **Nothing else matters
   if the cloning is wrong.**
2. `send.mjs`, `probe.mjs`.
3. `index.mjs` dry-run path only — get the slot-delta line working.
4. `ui.mjs`, `up.sh`.
5. Live path, exit path.

Get me the `D` measurement before you write a single line of the live send path.
If `D ≥ 1`, the rest is not worth building on this feed.
