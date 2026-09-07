# Coat-tail sniper

Watches the scammer wallets that open the ~20 SOL block-0 stack. When one of
them buys, this clones their buy for your size, fans it out to every relay, and
sells 20 seconds later.

## How it works

The core trick is that it does **not** hand-build pump.fun's buy instruction.
It takes the target's own instruction — which is correct by definition, because
it is about to land — and swaps only the three accounts that belong to the
buyer:

| index | account | swapped to |
| --- | --- | --- |
| 5 | associated user | your token account |
| 6 | user (signer) | you |
| 13 | user volume accumulator | your PDA |

Everything else is copied verbatim: global config, fee recipient, creator vault,
fee program, event authority, and the token program — which is **Token-2022** on
these launches, not the classic one. Hardcoding that list is how most bots break
the week pump.fun changes it.

Verified against a real 20.6 SOL stacker buy on `AK5CZgxC…pump`; all five PDA
derivations reproduce the on-chain account list exactly.

The exit uses the same trick: it finds any recent PumpSwap sell on the mint and
clones its pool and vault accounts. By exit time the coin has migrated, because
the stack completes the bonding curve inside the creation block.

## Install

```bash
cd sniper
npm install
cp .env.example .env    # then fill it in
```

## Run it in dry mode first — this is not optional

```bash
node index.mjs --dry
```

`--dry` does everything including building and signing, then stops before the
send. Leave it running for a day against real launches and read this line:

```
[dry] target landed in slot N; we reacted ~D slots later
```

**If D is 0, you have a business. If D is 1 or more, you do not.** One slot
(400ms) costs ~13.5% of an ~18% move against ~5% round-trip friction — the trade
is underwater before you place it. Full measurement in
`docs/Sniper Build Plan.md` §2.

That check costs you nothing. Skipping it costs you real money to learn the same
thing.

## Then run it live

```bash
node index.mjs
```

Watch the `stats` line. `slot0=%` is the only number that matters.

## The two problems, and which one money solves

**Arrival** — does your transaction reach the leader before it packs the block?
Relays fix this. Money does not. If you arrive late, no fee gets you in.

**Ordering** — among transactions the leader already holds, who goes first?
Priority fee fixes this, which is why the measured failure rates read like a
price list:

| Wallet | Fee | Tip | Failures |
| --- | --- | --- | --- |
| `41Lur83…C3od` | 0.0500 | 0.0513 | **0%** |
| `HyMGBFBi…` | 0.0460 | 0.0247 | 25% |
| `5hQ38HKk…` | 0.0002 | 0.0047 | 59% |
| `FEUa5TK…Hz4` | 0.0000 | 0.0047 | 92% |

The defaults in `.env.example` put you at ~0.115 SOL/attempt, above all of them.

## Size

`BUY_SOL=2.0`. Do not raise it. From the sniper's own record across 216 coins:

| Size | Win rate | ROI |
| --- | --- | --- |
| ~2 SOL | **89.5%** | **12.89%** |
| ~5 SOL | 60.7% | 7.35% |

All eight of his worst trades were 5 SOL positions. A bigger buy moves a
seconds-old pool against your own fill.

## Keeping TARGET_WALLETS fresh

The stack wallets rotate roughly every four coins. A fresh set is created and
funded shortly before each launch:

- **T−7.9 min** dev wallet funded from Binance
- **T−6.8 min** four fresh wallets funded ~1 SOL each from Binance, same second
- **T−20s to T−5 min** each receives ~24 SOL from a single-use funder
- **T−0** the coin is created and they fire

So the live signal is: **three or more fresh wallets each receiving 20–26 SOL
within 60 seconds of each other.** Pipe that into `TARGET_WALLETS`. Some sets are
reused across coins and those you already have.

## What will go wrong

- **You will land in slot +1.** That is the expected outcome on anything short of
  a pre-block feed. `--dry` tells you for free.
- **The exit can fail.** If no PumpSwap sell template is found, the bot logs
  `SELL MANUALLY` and gives up. Watch for that line.
- **The group changes the pattern.** The funding signature is behavioural, not
  structural. It goes dark the day they notice.
- **You are late to this trade.** At least five wallets already run it on the
  same coins, and the best has a zero failure rate. You are racing them, not the
  scammers.
