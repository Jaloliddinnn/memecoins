# The Coat-Tail Sniper — `HyMGBFBi1H9vZcSHoevPcvkAmHiKxspAYjfnJhiz7JZd`

*On-chain analysis, 2026-09-07. Data window: 7,416 signatures (2026-08-13 → 2026-09-07),
of which the most recent 1,500 were fully parsed via Helius Enhanced Transactions.
All PnL figures below are from that parsed window and are stated with their window.*

---

## 1. What he actually is

He is **not** a trader picking coins. He is a **block-0 coat-tail sniper**: a bot that
detects the scam group's own ~80 SOL opening stack *inside the coin's creation block*
and appends a 2.05 SOL buy to that same block, then exits within 30 seconds.

The whole edge is that the group's stack **mechanically guarantees** the pump. He is
not predicting anything. He is buying a known outcome.

**Verified on 12 consecutive coins.** Every one shows the same shape:

| Mint | Block-0 buyers, chronological (SOL) | His rank | His size | His net |
| --- | --- | --- | --- | --- |
| `4ARfNELrKgjT` | 19.9 · 20.8 · 19.6 · 20.6 · **2.1** · 0.2 | 5 / 6 | 2.05 | +0.230 |
| `7ZiuVbZ6UEvX` | 19.9 · 20.8 · 19.6 · 20.6 · 0.1 · **2.1** · … | 7 / 12 | 2.05 | +0.288 |
| `3EKyGKhNLJwM` | 19.7 · 19.6 · 20.6 · 20.6 · 3.0 · **2.0** · … | 6 / 9 | 2.05 | +0.179 |
| `hvbN1SERjSZb` | 0.1 · 19.6 · 19.3 · 19.0 · 19.1 · 4.1 · **2.1** · … | 7 / 9 | 2.05 | +0.269 |
| `CpbDDjHydgqk` | 19.8 · 19.2 · 18.9 · 18.8 · **2.1** · … | 7 / 12 | 2.05 | +0.101 |
| `EoNqEDMT6L6S` | 19.9 · 20.8 · 19.6 · 20.6 · **2.1** · … | 6 / 10 | 2.05 | +0.367 |
| `4YE4BcpRu4iD` | 0.1 · 19.6 · 19.3 · 19.0 · 19.1 · 1.5 · **2.1** · 5.5 | 7 / 8 | 2.05 | +0.388 |
| `AQ4adWTnA6xP` | 19.7 · 19.6 · 20.6 · 20.6 · **2.0** · … | 5 / 11 | 2.05 | +0.415 |
| `2k9AxTjKxgHi` | 0.1 · 19.6 · 19.3 · 19.0 · 19.1 · 4.1 · **2.1** · … | 7 / 9 | 2.05 | +0.495 |
| `2HBRZ6fTu31o` | 20.8 · 20.5 · 21.3 · 21.2 · **2.0** · … | 5 / 10 | 2.05 | +0.485 |

Four wallets, **~19–21 SOL each, ~80 SOL total**, always first. He is always 5th–7th.

### Why the group's stack matters

Pump.fun's bonding curve completes at roughly 85 SOL. Four buys of ~20 SOL **force the
curve to complete in the creation block itself**. On `4ARfNELr` the coin was created,
bonded, migrated to PumpSwap and traded there **within 25 slots (~10 seconds)**.

That is the machine behind your "every coin sits at ~$80k when migrated" observation.
The group is not letting the market fill the curve — they fill it themselves, in one block,
which pins the migration price exactly where their own last buy lands.

His entry price on `4ARfNELr` worked out to 3.964e-7 SOL/token × 959.4M supply
= **380 SOL market cap ≈ $40k at today's SOL price ($105)**.

---

## 2. The numbers

### Last 24 hours (verified)

| | |
| --- | --- |
| **Net profit** | **+29.19 SOL ≈ $3,066** |
| Buys | 77 |
| Sells | 130 |
| Capital cycled | 146.8 SOL |
| Return on capital deployed | **19.88%** |
| Distinct coins | 108 |
| Fees paid (tx) | 2.61 SOL |
| Tips paid (relays) | 2.38 SOL |
| Failed-tx fees burned | 0.13 SOL |

Cross-checked: **zero** transactions both receive treasury funding *and* move tokens,
so funding transfers cannot contaminate the PnL figure.

### Last 20 coins

**20 for 20 winners, +7.09 SOL total.** One buy of 2.048–2.050 SOL each, one or two sells,
**hold time 1 to 48 seconds** (median ~24s). Cost per round trip 0.071–0.097 SOL.

### Whole parsed window (~7 days, 216 coins)

| | |
| --- | --- |
| Net | **+59.50 SOL** |
| Win rate | **178 / 216 = 82.4%** |
| Median trade | +0.292 SOL |
| Best / worst | +9.248 / −4.547 SOL |
| Hold time | median 15s, p75 30s, max 336s |

### Position size is the entire edge

| Size | n | Win rate | Net SOL | ROI |
| --- | --- | --- | --- | --- |
| < 1 SOL | 34 | 76.5% | +2.34 | 13.00% |
| **~2 SOL** | **143** | **89.5%** | **+37.06** | **12.89%** |
| ~5 SOL | 28 | 60.7% | +10.36 | 7.35% |
| > 6 SOL | 11 | 63.6% | +9.75 | 11.14% |

**Every one of his eight worst trades was a 5 SOL position.** At 2 SOL he wins 9 times in
10; at 5 SOL barely 6 in 10. A bigger buy into a seconds-old pool moves the price against
himself and worsens his own fill. The 2 SOL size is not modesty — it is the edge.

---

## 3. The stack he runs

### His own on-chain program

**`4RoVsR9zHc6ENRLDiA9gsiNPaJ1MHKVe477YS8Tdq14r`** — 594 top-level invocations.
He **upgraded it on 2026-09-03** (sig `4dqkeiCq…`), signing as the upgrade authority from
this same wallet. This is his own deployed Solana program, not a service he rents.
Every buy goes through it. It is why Helius classifies his buys as `TRANSFER/SYSTEM_PROGRAM`
rather than `SWAP` — the CPI into pump.fun is hidden inside his own instruction.

He also pre-creates token accounts in separate cheap transactions (Helius labels them
`CREATE_POOL`, 0.004–0.013 SOL each) so the buy transaction itself never has to create
an ATA — less compute, fewer bytes, faster landing.

### Low-latency submission

| Relay | Buys routed | Median tip |
| --- | --- | --- |
| **Nozomi** (`noz…` tip accounts) | 186 | ~0.001–0.003 SOL |
| **Astralane** (`astra…` tip accounts) | 19 | ~0.003–0.013 SOL |
| Plain RPC | 86 | — |

To land in the *same slot* the coin is created in, you cannot be reading confirmed blocks —
by then the slot is gone. He is reacting to the create transaction while the block is still
being built and pushing his buy straight to the current leader. That means a shred or
Geyser-grade feed plus a relay like Nozomi/Astralane.

### Exit side

Sells go out through **`FLASHX8DrLbgeR8FcfNV1F5krxYcYMUdBkrP1EPBtxB9`** (97 txs), a
third-party execution program that CPIs PumpSwap and charges a flat ~0.00204 SOL to
`5bfyoaGBX4eLg5hvXqjEZGsyB459oqAoJF33vpV8swsx`. Sell fees are trivial — 0.000015 SOL —
because the exit does not need to win a race.

### The human half — and it earns nothing

64 transactions pay **Axiom.trade**'s fee wallet (`AxiomRYAid8ZDhS1bJUAzEaNSr69aTWB9ATfdDLfUbnc`
plus its `AxiomDotTrade1111111111111111111111EventLog` memo). 31 of them are sells.

Your bot-plus-human read is right, but the split is lopsided:

- The **bot** runs all 24 UTC hours with **no dead hour**, median 15 minutes between buys.
- The **Axiom** activity is concentrated in 4 hours of the day (08, 10, 13, 23 UTC) and
  nets **+0.063 SOL across all 31 sells** — essentially zero.

The human clicks, the bot earns.

### Capital plumbing

`52L7H1e7QDqaDwemK7YGaRamKJebyiUxruRty5TpY7w9` drip-feeds the execution wallet
**exactly one position size (2.031–2.057 SOL) at a time**, ~60 times in 24 hours. Both
wallets run near empty — the execution wallet holds 12 SOL, the feeder holds 0. He is
cycling a small float fast, not sitting on a bankroll.

---

## 4. Exactly what a 2.05 SOL buy costs

Anatomy of `3rSdkaYcrzwepqqhzDv1wGZ7kw561qrHTq1DsWtsDfze…`:

| Component | SOL | Share of the buy |
| --- | --- | --- |
| Tokens actually bought | 1.975309 | 96.3% |
| **Priority + base tx fee** | **0.045087** | **2.20%** |
| Pump.fun protocol fee | 0.009383 | 0.46% |
| Pump.fun creator fee | 0.009383 | 0.46% |
| Relay tips (2 accounts) | 0.009226 | 0.45% |
| **Total** | **2.050426** | |

**Entry friction ≈ 3.66%.** Add pump.fun's ~0.95% on the sell and round-trip friction is
roughly **4.8–5%**. He nets ~12.9% per 2 SOL trade after all of it, so the raw price move
he captures is around **18% in under 30 seconds**.

The priority fee alone — **0.045 SOL, about $4.70 per attempt** — is 2.2% of the position
and is the single largest cost in the operation. Failed attempts are cheap by comparison
(56 fails in 24h cost 0.13 SOL total, median 0.001 SOL), which tells you the racing
attempts run at low priority and only the ones with a real shot pay the 0.045.

---

## 5. Can you copy this?

Honestly: **the strategy is simple, the infrastructure is not.**

### What is genuinely easy

- The signal. "Four wallets buy 19–21 SOL each in the creation block" is trivially
  detectable and needs no model.
- The sizing. 2 SOL, one position at a time, ~2 SOL of working capital.
- The exit. Dump everything within 30 seconds, no discretion.

### What actually blocks you

| Requirement | Reality |
| --- | --- |
| **Same-slot execution** | You must see the create transaction *before the block is finalised* and land your buy in it. A normal RPC websocket delivers the block after it exists — by then you are 400ms+ too late and the price has already moved 8×. Needs Jito ShredStream or a Yellowstone/Geyser gRPC feed. |
| **A relay** | Nozomi or Astralane, so your transaction reaches the current leader directly. |
| **Your own program** | His buy is one instruction with the ATA pre-created. A Jupiter or UI route is several transactions and will not fit the slot. |
| **Fee tolerance** | 0.045 SOL per attempt. If your hit rate is worse than his, fees eat you alive. |
| **Running cost** | Realistically a few hundred dollars a month for the feed plus a dedicated node or a paid gRPC endpoint, before a single trade. |

**What you cannot do:** replicate this from Axiom, Photon, BullX, Trojan or any bot that
takes a contract address you paste. By the time a coin is visible in any UI, the block-0
stack is done and the price is 8× above his fill. His 5th-place fill on `4ARfNELr` was
already 8.5× the first buyer's price — and *you* would be arriving after all of them.

### The realistic version for you

Do not try to race the block. Use the same *signal* on a slower timeframe:

1. Watch for the 4×~20 SOL creation-block stack (you can detect it after the fact, in
   seconds, with the tool you already have).
2. That stack is what forces the curve to complete and pins migration at ~$40k.
3. Your entry is then the retention rule you have already backtested — not the snipe.

You will not get his 12.9% per trade. But the signal is the same signal, and you would be
detecting a group that is currently **not in your database at all** (see below).

### One thing to steal outright

**His sizing discipline is the transferable lesson.** He proved on his own money that
going from 2 SOL to 5 SOL on the same signal cuts the win rate from 89.5% to 60.7% and the
ROI from 12.9% to 7.4%. On thin new pools, size destroys your own fill. That applies to
every trade you make on these coins, snipe or not.

---

## 6. This is a new group

I checked all 85 addresses involved — the four rotating stacker wallets, the devs, the
execution and feeder wallets — against your 24,142 tagged wallets.

**Zero matches.** This is not JINPACHI, not Baojin, not Pochi.

The stackers rotate in sets of four, roughly every four coins:

| Set | Wallets | Coins | Avg buy |
| --- | --- | --- | --- |
| A | `764x3gfqoghp76W9bgZaGJDEFF178Y9Z1wgLVMfwv5t4` · `2CG1JxkebafRXrV5Tt6x4otZE7uTGEcPkFSaam2osSpo` · `5pLJQ34R2p8i1FxywswP9YXiqo7t9AukrecR7nMmgRK2` · `HtfdvFytu4th8c7mvQMy1fqGDVkfsACMFLSZxUnoMz82` | 4 | 19.1–19.6 SOL |
| B | `ddEyaRtapYFwU5n7zUoSX8EnK4oZpkiSKMy2k5qDDWt` · `J5A4SXs9dmqZrVr77EW29ZAUkeDZVmNT99QAK86tcaPG` · `77d88eHK1SfjphZiA4LykQzJbx1Vf1VutF8FcxCe4prD` · `5UNHijVEvKh1a51W5miFQH8PQTE8c9gQVDeMcPRmDvrS` | 3 | 20.0–20.5 SOL |
| C | `8GHotSfKVf8LxeF99PPvp32BWCqtWNoq5fyHKUsgNX9E` · `88drVkaU7W1yV64QKhGUADXeUDuSCZuUXb67VGoxagnk` · `8RrLhfXb2C91fBoY79HKnQgmDRkFtcWDsa6ZEQBkv87k` · `FkCy8XCE4aijJWQvTqH9MF2QicJLYTJoLz1iw3K8Re8i` | 2 | 19.6–20.6 SOL |

Devs are one-per-coin and never reused.

Suggested label: **Stack 20 ×4** — four wallets, ~20 SOL each, creation block.

---

## 7. Open questions

- **His unwind.** Both his wallets run near empty and I found no sweep to a cold wallet in
  the parsed window. The profit is going somewhere I have not traced.
- **How he sources the create event.** Shred listener vs. gRPC vs. something else is
  inferred from the same-slot timing, not directly proven.
- **What FLASHX is.** Confirmed as an execution program CPI-ing PumpSwap for a flat
  0.00204 SOL. Whether it is a public service or his own second program is untested.
- **Lifetime PnL.** Verified for the parsed 7-day window only. His history goes back to
  2026-08-13 and the 2026-08-25/26 spike (3,615 transactions in two days) is unparsed.
