# Coat-tail sniper

Watches wallets you choose. When one of them opens a block-0 buy on pump.fun,
this clones their buy for your size, fans it out to every relay, and sells after
your hold time.

## Setup

```bash
cd sniper
npm install
node setup.mjs
```

`setup.mjs` asks for everything and writes two files:

| File | Holds | Editable from the phone? |
| --- | --- | --- |
| `.env` (mode 600) | private key, RPC, gRPC, relays | **No — never** |
| `config.json` | targets, size, fees, hold, risk | Yes, via `/sniper` |

If you leave the private key blank it generates a fresh burner and prints the
address to fund.

## Changing settings from your phone

Open `/sniper` in your deployed app. Target wallet, trade size, priority fee,
tip, hold time, stop loss — all editable, with a live comparison against what
the competing snipers actually pay. Set `PANEL_URL` (and `SNIPER_TOKEN` on both
sides) in `.env` and the bot polls it every 5 seconds. No restart, no SSH.

**Your private key is not settable from the panel and never will be.** A key
pasted into a public URL is a key you have given away. It stays in `.env` on the
machine the bot runs on.

## Run dry first — this is not optional

```bash
node index.mjs --dry
```

`--dry` does the whole path including building and signing, stops before the
send, and prints:

```
[dry] target slot N, we were ready ~D slot(s) later
```

**D = 0 → you have a business. D ≥ 1 → you do not.** One slot (400ms) costs
~13.5% of an ~18% move against ~5% round-trip friction. Measurement in
`docs/Sniper Build Plan.md` §2.

Then:

```bash
node index.mjs
```

Watch the `stats` line. `slot0Rate` is the only number that matters.

## How the buy is built

It does **not** hand-build pump.fun's instruction. It takes the target's own
instruction — correct by definition, because it is about to land — and swaps the
three accounts that belong to the buyer:

| index | account | swapped to |
| --- | --- | --- |
| 5 | associated user | your token account |
| 6 | user (signer) | you |
| 13 | user volume accumulator | your PDA |

Everything else is copied verbatim, including the token program, which is
**Token-2022** on these launches and not the classic one. Signer and writability
flags are read off the source transaction's message header rather than inferred.

Verified against a real 20.627 SOL stacker buy on `AK5CZgxC…pump`.

## Four bugs found by auditing the first version

Worth listing, because each of them would have failed silently:

| Bug | Effect |
| --- | --- |
| Priority fee expressed in micro-lamports/CU | Default was wrong by **1000×** — bid 0.00006 SOL believing it bid 0.06, and lost every race. Fees are now entered in SOL and the conversion happens in code. |
| `amount` = `u64::MAX` | pump.fun charges the curve price for *exactly* `amount` tokens, so this always blew the `max_sol_cost` check. **Every buy would have reverted.** Now computed from the bonding curve — predicts 5,056,921 tokens for 2 SOL against a real fill of 5,173,311 for 1.975, ~2% conservative, which is the safe direction. |
| No ATA creation | Our token account does not exist, so the buy reverts. `CreateIdempotent` now runs first, as it does in the targets' own transactions. |
| Writability inferred | 4 of 18 accounts wrong (0, 2, 10, 16 are read-only). Now read from the message header — verified all 18 correct. |

## Fees

Defaults put you at ~0.115 SOL/attempt. What that buys, measured on these coins:

| Wallet | Per attempt | Failure rate |
| --- | --- | --- |
| `41Lur83…C3od` | 0.1013 | **0%** |
| `HyMGBFBi…` | 0.0707 | 25% |
| `5hQ38HKk…` | 0.0049 | 59% |
| `FEUa5TK…Hz4` | 0.0047 | 92% |

Two different problems, and only one is solved with money. **Arrival** — reaching
the leader before the block is packed — is fixed by relays; no bid helps if you
are late. **Ordering** — who goes first among transactions the leader already
holds — is fixed by the fee.

## Size

Default 2 SOL. Measured across 216 of his coins:

| Size | Win rate | ROI |
| --- | --- | --- |
| ~2 SOL | **89.5%** | **12.89%** |
| ~5 SOL | 60.7% | 7.35% |

All eight of his worst trades were 5 SOL. The panel warns you above 3.

## Keeping targets fresh

The stack wallets rotate roughly every four coins, and a fresh set is created
shortly before each launch:

- **T−7.9 min** dev wallet funded from Binance
- **T−6.8 min** four fresh wallets funded ~1 SOL each from Binance, same second
- **T−20s to T−5 min** each receives ~24 SOL from a single-use funder
- **T−0** the coin is created and they fire

So the live signal is **three or more fresh wallets each receiving 20–26 SOL
within 60 seconds of each other**. Some sets get reused across coins.

## What will go wrong

- **You will land in slot +1.** Expected on anything short of a pre-block feed.
  `--dry` tells you for free.
- **The exit can fail.** If no PumpSwap sell template is found the bot logs
  `SELL MANUALLY` and stops. Watch for that line.
- **The group changes the pattern.** The funding signature is behavioural, not
  structural. It goes dark the day they notice.
- **You are late to this trade.** At least five wallets already run it on the
  same coins, and the best has a zero failure rate. You are racing them, not the
  scammers.
