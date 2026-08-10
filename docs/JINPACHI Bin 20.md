# JINPACHI Bin 20 — Scam Group Dossier & Trading Playbook

> Third group dossier for the Solana memecoin anti-scam project. All data derived from
> live on-chain analysis (Helius mainnet RPC + Enhanced Transactions API), DexScreener,
> and the `tagged_wallets` database. Analysis window **2026-08-02 → 2026-08-10**.
>
> **Naming decoded:** the operator's label convention encodes funding source and amount.
> `Bin` = Binance, `Mex` = MEXC, number = SOL sent to each dev.
> - `Pochi Bin 30` = Binance-funded, 30 SOL per dev
> - `Baojin Mex 35` = MEXC-funded, 35 SOL per dev
> - **`JINPACHI BIN 20` = Binance-funded, 20 SOL per dev ← THIS GROUP**
> - `ChubbyDog Bin 20` = same funding tier, overlapping wallet fleet (see [§4](#4-jinpachi-vs-chubbydog--same-operation))
>
> **This group is fundamentally different from Baojin Mex 35. The Baojin "≥3 SOL tagged
> buy" rule does NOT transfer here** — it fires on nearly every coin because this group
> hardcodes a ~50 SOL buy into block 0 of every single migration. See [§13](#13-things-that-dont-work).

---

## Table of contents

1. [TL;DR — the trading rule](#1-tldr--the-trading-rule)
2. [Money flow — how the operation is funded](#2-money-flow--how-the-operation-is-funded)
3. [The devs](#3-the-devs)
4. [JINPACHI vs ChubbyDog — same operation](#4-jinpachi-vs-chubbydog--same-operation)
5. [The launch machine](#5-the-launch-machine)
6. [Hard constants — the $80k law](#6-hard-constants--the-80k-law)
7. [The block-0 snipe bot](#7-the-block-0-snipe-bot)
8. [The pusher wallet — `8mndMJC1`](#8-the-pusher-wallet--8mndmjc1)
9. [Complete coin table — all 16 migrations](#9-complete-coin-table--all-16-migrations)
10. [The winners — coin by coin](#10-the-winners--coin-by-coin)
11. [The losers — coin by coin](#11-the-losers--coin-by-coin)
12. [The backtest](#12-the-backtest)
13. [Things that DON'T work](#13-things-that-dont-work)
14. [Entry / exit playbook](#14-entry--exit-playbook)
15. [Methodology & analysis traps](#15-methodology--analysis-traps)
16. [Open work](#16-open-work)

---

## 1. TL;DR — the trading rule

**Two checks, both resolved by second 45 after the pool opens.**

| # | Check | Threshold |
|---|---|---|
| **A** | Sum of buys in the **migration block (block 0)** | must be **≥ 40 SOL** (typically 47–52) |
| **B** | Median price over **+15 s to +45 s** ÷ end-of-block-0 price | must be **≥ 0.90** |

**Both pass → enter at +45 s. Either fails → skip, no exceptions.**

### Backtest result (n=16 migrations, 6 dev wallets, 2026-08-02 → 2026-08-10)

| | Count | Worst | Mean | Median |
|---|---|---|---|---|
| **ENTERED** | 5 | **x1.43** | **x4.26** | x2.00 |
| **SKIPPED** | 11 | — | x1.16 | best skip was only **x1.32** |

**Zero overlap.** Every trade beat every skip. Zero losing trades.

### Critical conditions

1. **You cannot buy at migration.** The $31,334 migration price does not exist for a human.
   The group's bot buys ~50 SOL in block 0, landing the price at **~$80,000** before anyone
   can react. Your realistic floor is $76k–$82k.
2. **Returns above are measured to peak, which you cannot hit.** The exit is unsolved —
   see [§14](#14-entry--exit-playbook).
3. **n=16 over 8 days from one operation.** This is evidence, not proof. The 0.90 threshold
   was chosen after seeing the data. Trade small, log every fire.
4. **Every coin dies.** Terminal state is **$1,384–$1,930** (LP left thin) or **exactly $0**
   (LP pulled). Drawdown from peak is **98.0%–100.0%** on all 15 resolved coins.

---

## 2. Money flow — how the operation is funded

Two exchange hot wallets seed the dev wallets. Both send **~20 SOL** — the "Bin 20" in
the group name.

```
Binance (exchange)
      │
      ├─► 5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9
      │     · 667,313 – 688,347 SOL balance
      │     · MIS-TAGGED "Pochi Bin 30" in tagged_wallets ← THIS TAG IS WRONG
      │     · funds: 2ZVMUZte, 4jLwj3Fa, Ae6maBjV
      │
      └─► 6LY1JzAFVZsP2a2xKrtU6znQMQ5h4i7tocWdgrkZzkzF
            · 175,665 SOL balance
            · NOT TAGGED
            · funds: 91UM7tdX, 9MRhaPS8
```

> ### ⚠ Database correction
> `5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9` is tagged **"Pochi Bin 30"** in
> `tagged_wallets`. **It is not a group wallet.** It holds ~670,000 SOL and services
> withdrawals for every group in the database. Treating a hit on it as a group signal
> will produce constant false positives. Same for `6LY1JzAF…` at 175,665 SOL.
> Both should be re-tagged as exchange infrastructure.

**Funding amounts observed:** 19.9990 / 19.9850 / 19.8509 SOL. The variance is withdrawal
fees, not different tiers.

**Separate capital pool for the pump itself** — see [§8](#8-the-pusher-wallet--8mndmjc1).
The 20 SOL dev float and the ~7,000 SOL push capital are completely different money.

---

## 3. The devs

Six dev wallets identified. **None of them are in `tagged_wallets`** — they are fresh
burners, created, drained, abandoned.

| Dev wallet | Launches | Migrated | Rate | Funded | Window | Balance now |
|---|---|---|---|---|---|---|
| `2ZVMUZteEmL6NQ1oDimiWFWTrUALp2G325X4EDFFRkXV` | 27 | 4 | 14.8% | 19.9990 (`5tzFkiKsc…`) | 29.5 h | 0.0055 SOL |
| `9MRhaPS8T9EEidrjStKBQLVYz1f8Zyg8EkfXZwhZPsBA` | 13 | 2 | 15.4% | 19.8509 (`6LY1JzAF…`) | 64.1 h | 21.7115 SOL |
| `Ae6maBjVDHysTDJqRi3vZdoEkCVzdVpSjBQN57wnqDED` | 11 | 4 | 36.4% | 19.9990 (`5tzFkiKsc…`) | 20.8 h | 0 |
| `4jLwj3FaQRLfMCbFrp7ckF8jScPxqZ5myLS81GNNSJS5` | 10 | 1 | 10.0% | 19.9990 (`5tzFkiKsc…`) | 27.5 h | 0 |
| `91UM7tdXMB1MdjE3aSbWiUAKTvnxbSNDwFpD1DTj4BaB` | 4 | 4 | **100%** | 19.9850 (`6LY1JzAF…`) | 20.1 h | 0 |
| `3ReqHX4KZGTxNRbgTWqJUurACmKhpJ1QVjL9PETt871E` | ? | ≥1 | — | not traced | live | 4.4510 SOL |

**Total: 65+ launches, 16 migrations (~24%).**

### Dev lifecycle

1. Receive ~20 SOL from an exchange hot wallet.
2. Launch 4–27 tokens over 20–30 hours, all with the **same ticker** (JINPACHI, PEEKO,
   SOS, CHUBBYDOG). Names are recycled per-dev, not per-coin.
3. Drain to zero. Abandon. Never reused.

**The dev's 20 SOL cannot fund a 40% dev buy ten times.** `2ZVMUZte` spent 18.4403 SOL on
each of launches #17–26 with only 20 SOL of capital — it sells its own bag back out before
the next launch. It is a capital treadmill, not a conviction position.

---

## 4. JINPACHI vs ChubbyDog — same operation

`tagged_wallets` distribution:

| Label | Wallets |
|---|---|
| JINPACHI BIN 20 | **16,538** |
| Baojin Mex 35 | 3,344 |
| Pochi Bin 30 | 2,188 |
| ChubbyDog Bin 20 | 1,548 |
| Pochi | 496 |
| JINPACHI BIN 20 (Parent) | 2 |
| ChubbyDog Bin 20 (Parent) | 1 |
| Pochi Bin 30 (Parent) | 1 |

**These are one operation with two labels.** Evidence:

- The **bonding curve** on JINPACHI coins is filled predominantly by **ChubbyDog Bin 20**
  wallets. On `Yv2taGqR…` the pre-migration mix was ChubbyDog 35 / Pochi 5 / JINPACHI 4.
- **Post-migration** flips to JINPACHI BIN 20 dominance (4,276 events vs ChubbyDog 1,368).
- The **same block-0 snipe amounts** (17.96 / 16.63 / 15.81 SOL) appear on both
  CHUBBYDOG-ticker and JINPACHI-ticker coins.
- `91UM7tdX` launches CHUBBYDOG-ticker coins but is grouped `JINPACHI BIN 20` in
  `coin_stats`.

**Practical consequence:** the curve-fill crew and the post-migration push crew are
*different sub-fleets of the same operation*. Do not treat a ChubbyDog wallet hit as a
different group.

---

## 5. The launch machine

### Dev buy percentage is the pre-migration filter

This is the one signal available **before** a coin ever migrates.

| Dev buy % of supply | Coins migrated | Passed entry filter | Best result |
|---|---|---|---|
| **0.13% – 0.33%** | 5 | 4 | **x10.42** |
| **13.49% – 18.34%** | 3 | 1 | x2.00 |
| **36.35% – 67.44%** | 8 | **0** | x1.32 |

**Dev buy ≥ 36% → 0 for 8.** Not one coin with a large dev buy ever produced a real move.
Mechanically obvious: a 40% dev bag *is* the exit liquidity. The dev doesn't need the coin
to pump — it needs the coin to migrate so it can sell into the block-0 snipe.

**Dev buy < 20% is necessary but not sufficient** — 4 wins out of 8 such coins.

### Observed dev-buy configurations

| Dev | Dev buy | Supply % |
|---|---|---|
| `2ZVMUZte` launches #1–16 | 0.0936 SOL | 0.33% |
| `2ZVMUZte` launches #17–26 | 18.4403 SOL | 40.85% |
| `2ZVMUZte` launch #27 | 14.4779 SOL | ~32% |
| `4jLwj3Fa` launches #1–4 | 9.1583 SOL | 25.1% |
| `4jLwj3Fa` launch #7 | 8.0184 SOL | 22.6% |
| `4jLwj3Fa` launches #5,6,8,9,10 | 0.0936 SOL | 0.33% |
| `9MRhaPS8` all 13 launches | 18.4403 SOL | 40.85% |
| `91UM7tdX` launches #1–3 | 15.3695 SOL | 36.35% |
| `91UM7tdX` launch #4 | 49.6932 SOL | 66.91% |
| `Ae6maBjV` launches #1,2 | 4.3125 SOL | 13.49% |
| `Ae6maBjV` launch #3 | 50.7530 SOL | 67.44% |
| `Ae6maBjV` launches #4–6 | 6.1866 SOL | 18.34% |
| `Ae6maBjV` launches #7–11 | 18.4765 SOL | 40.90% |

**`9MRhaPS8` ran 40.85% on all 13 launches and produced zero winners.** A dev running only
large dev buys can be skipped wholesale.

### Curve duration is NOT a signal

| Coin | Curve life | Result |
|---|---|---|
| `Yv2taGqR…` PEEKO | **30 seconds** | **x10.42** |
| `vKMkWJhh…` | **170.3 minutes** | **x5.64** |
| `HpZSFUgE…` | 3.3 minutes | live, x3.37+ |
| `vL6EzTJs…` | 1.0 minute | x1.43 |
| `Sa8vzg3o…` | 9.1 minutes | x1.17 |
| `S1sq9Zgc…` | 1.1 minutes | x1.01 |

A 30-second curve and a 170-minute curve produced the two biggest winners. **Do not filter
on curve duration.** (An earlier draft of this analysis proposed a "skip sub-10-minute
curves" rule from an n=4 sample. It was wrong and would have excluded the single best coin.)

---

## 6. Hard constants — the $80k law

Every PumpSwap pool opens with the identical LP deposit:

```
84.99 SOL  +  206,900,000 tokens
k = 84.99 × 206.9e6 = 1.75843e10
opening market cap = $31,334   (at SOL = $76.28)
```

The group's bot then buys a **hardcoded ~50 SOL in the same block**. Constant product:

```
mcap(X) = (84.99 + X)² / k × 1e9 × SOL_USD

X = 50.40 SOL  →  $79,516   (2.54x)
```

### Predicted $79,516. Measured across 14 coins:

| Opening mcap | Coins | Stack |
|---|---|---|
| $76,447 | `HyBnJpXf…`, `F1xq2MJp…`, `G8DhoYCb…` | 47.63 SOL |
| $78,154 | `8TLYzcqr…`, `FjBnB9fB…`, `GS6ACPZq…` | 50.60 SOL |
| $79,885 | `HpZSFUgE…` | 51.50 SOL |
| $80,087 | `j1pepvNc…` | 50.39 SOL |
| $80,273 | `vKMkWJhh…` | 51.50 SOL |
| $80,343 | `Yv2taGqR…` | 51.50 SOL |
| $80,388 | `GjYBaN1k…` | 50.60 SOL |
| $80,621 | `CUYMG3SR…` | 51.50 SOL |
| $81,452 | `J9gsnena…` | 52.37 SOL |
| $81,613 | `vL6EzTJs…` | 50.39 SOL |

**Three SOS coins open at exactly $76,447. Three CHUBBYDOG coins at exactly $78,154.**
Identical to the dollar — because the same stack on the same LP is arithmetic, not a market.

### The two exceptions prove the rule

| Coin | Open | Why |
|---|---|---|
| `Sa8vzg3o…` | $69,059 | insiders sold **inside block 0**, absorbing part of the snipe |
| `S1sq9Zgc…` | $36,486 | **stack never fired** — only 6.84 SOL of random outsider buys |

### Lookup table

| Block-0 SOL | Resulting mcap | x from migration |
|---|---|---|
| 0 | $31,334 | 1.00x |
| 10 | $39,142 | 1.25x |
| 20 | $47,817 | 1.53x |
| 30 | $57,359 | 1.83x |
| 40 | $67,769 | 2.16x |
| **50.4** | **$79,516** | **2.54x** |
| 60 | $91,192 | 2.91x |
| 75 | $111,037 | 3.54x |
| 100 | $148,450 | 4.74x |
| 150 | $239,542 | 7.64x |
| 200 | $352,323 | 11.24x |

**Other groups will have a different constant.** Pochi and Baojin use different stack sizes,
so their opening price is not $80k. The formula transfers; the number does not.

### Slippage on your entry

Post-snipe the pool holds ~135 SOL.

| Your size | Price impact |
|---|---|
| 1 SOL | 1.5% |
| 2 SOL | 3.0% |
| 5 SOL | 7.6% |
| 10 SOL | 15.5% |

**1–2 SOL is clean. Above ~5 SOL you eat your own edge.**

---

## 7. The block-0 snipe bot

Three wallets fire in the migration block with **byte-identical hardcoded amounts**:

```
17.96 SOL
16.63 SOL
15.81 SOL
─────────
50.40 SOL total
```

A fourth bot adding **1.11 SOL** appears on coins from 2026-08-05 onward, giving 51.50 SOL.

### The wallets rotate. The amounts do not.

**Original set** (2026-08-05 → 08-06):

| Amount | Wallet |
|---|---|
| 17.96 SOL | `57iqvzfEkoBgXV2ekgwB3rYuRThmga2V6L4xVjefhPXz` |
| 16.63 SOL | `E5M5iGdR4h3F8Yq5dtFREvEGdkWD6JKqiSPZCjqPZwTr` |
| 15.81 SOL | `5ji3ede8kFCakSrJcUkfHADLrdKtvZk3H3UboZSfUhsG` |

**Rotated set** (2026-08-08 → 08-10):

| Amount | Wallet |
|---|---|
| 17.96 SOL | `9pBc3CcJRLXYuZEJJbCmgDFMHedHCPWcvLmcRX1HASMz` |
| 16.63 SOL | `dsHBCppAb8jXLf4PePUdjW4XU6hvTDQC2dT7N7EdFCj` |
| 15.81 SOL | `Do6z8VkJmEK4xvPvU2hCw45rtyGsBWxD5cM595QCABKx` |

> ### 🔑 Fingerprint on AMOUNTS, not ADDRESSES
> Your 24,142-row `tagged_wallets` list goes stale within days. The config file does not.
> A detector keyed on wallet addresses will silently stop firing. A detector keyed on
> `17.96 / 16.63 / 15.81 SOL in the migration block` survives rotation.

### The stack has zero predictive value on its own

It fired on **14 of 16** migrations — the x10.42 winner and the x1.01 rug alike. It is an
automatic seeding routine, not a conviction bet.

**Its absence, however, IS a signal.** `S1sq9Zgc…` got only 6.84 SOL (three random
outsiders at 1.76 / 1.09 / 3.99 SOL). Their own bot skipped it. Result: x1.01. **No stack
= they have already decided not to work this coin.** Available at +0 seconds.

---

## 8. The pusher wallet — `8mndMJC1`

```
8mndMJC1CqaDqhJb6Pcs4hvhyjp6hwhBvW6o6nVpkT6i
  tagged: JINPACHI BIN 20
  balance: 92.96 SOL
  active: 2026-08-05 → 2026-08-10 (ongoing)
  shuttle wallet: 8uKtN37NEeG5mUFkYhsf9d8dNXXQFSfeb6UfEWgmgDAG
```

**In its entire life it has touched exactly 5 mints.**

| Mint | Buys / Sells | SOL in | SOL out | Net | Span | Outcome |
|---|---|---|---|---|---|---|
| `vKMkWJhhRfG7Yh82AqESD3PxTraZNZueTsnKRtspump` | 1761 / 1679 | 7,046 | 6,977 | **−69** | 22.5 h | **x5.64** |
| `Yv2taGqRuL9YNrWEGW5Tz9EuYjNzVikEspKzaRqpump` | 1430 / 1176 | 6,040\* | 5,959\* | **−81** | 20.1 h | **x10.42** |
| `HpZSFUgEbzXe9AP2xdCik3pYBTifTr5tPTMrq65bpump` | 17 / 10 | 26.6 | 27.8 | +1.2 | 35 min | live |
| `j1pepvNcHwMCaJqzidYNa1iP4KEcgZLDa7mQSDupump` | 20 / 10 | 12.1 | 11.3 | −0.8 | 12 min | x1.06 |
| `ApBJY8Zx4Zeigc3AZHYMQaeipQLwHb8AT5LbPoLXYkDg` | 1 / 0 | 0 | 0 | 0 | — | noise |

\*undercount — the wallet-history endpoint caps at 12,000 txs; pool-side data is larger.

### What it actually is

Buys ≈ sells. Net PnL **−69 and −81 SOL** on the two winners. **It is not trading — it is a
wash-trade engine** manufacturing volume to walk the price up while the ~44 insider wallets
distribute into it. Cost of running a pump: **~75 SOL**.

The `8uKtN37NEeG5mUFkYhsf9d8dNXXQFSfeb6UfEWgmgDAG` shuttle received 8,660 SOL from 8mnd and
sent 8,107 SOL back to 8mnd — **no third party**. It exists to keep any single balance from
looking large. It is not a treasury.

### Ramp rate — campaign vs probe

Cumulative SOL committed after its first buy:

| Coin | +5 m | +15 m | +30 m | +60 m | +120 m | Result |
|---|---|---|---|---|---|---|
| `Yv2taGqR…` | 32 | 138 | 362 | **842** | 1,731 | x10.42 |
| `vKMkWJhh…` | 5 | 11 | 11 | **341** | 1,294 | x5.64 |
| `HpZSFUgE…` | 6 | 10 | 21 | **31** | 31 | live |
| `j1pepvNc…` | 9 | 12 | 12 | **12** | 12 | x1.06 |

At +60 min the separation is **341 & 842 SOL vs 31 & 12 SOL** — a 10–27x gap, cleanly split.

### But it is NOT a tradeable entry signal

By the time 8mnd has committed 300+ SOL the move has already happened:

| Coin | Price at 8mnd's first ≥3 SOL buy | Left to peak |
|---|---|---|
| `Yv2taGqR…` | $207,903 (+64.8 m) | x4.27 |
| `vKMkWJhh…` | ~$299,000 (+65.4 m) | x1.59 |
| `j1pepvNc…` | $52,758 (+22.5 m) | x1.15 |

And its presence alone is only **50% precision** — it also touched `j1pepvNc…` (died) and
`HpZSFUgE…`.

**Use 8mnd to identify the operation, not to time an entry.**

---

## 9. Complete coin table — all 16 migrations

Sorted by return from the +45 s entry. `r` = median price +15–45 s ÷ end-of-block-0 price.

| # | Contract | Sym | Dev | Dev buy | Stack | Open | **r** | Verdict | Peak | Peak at | **Return** | Now |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `Yv2taGqRuL9YNrWEGW5Tz9EuYjNzVikEspKzaRqpump` | PEEKO | `4jLwj3Fa` | 0.33% | 51.50 | $80,343 | **1.008** | ✅ PASS | $844,159 | +375.6 m | **x10.42** | $1,872 |
| 2 | `vKMkWJhhRfG7Yh82AqESD3PxTraZNZueTsnKRtspump` | JINPACHI | `2ZVMUZte` | 0.33% | 51.50 | $80,273 | **0.999** | ✅ PASS | $465,507 | +1133.5 m | **x5.64** | $1,907 |
| 3 | `HpZSFUgEbzXe9AP2xdCik3pYBTifTr5tPTMrq65bpump` | ? | `3ReqHX4K` | 0.13% | 51.50 | $79,885 | **0.923** | ✅ PASS | $255,894+ | live | **x3.37+** | **LIVE** |
| 4 | `CUYMG3SR4fscGkYrnre5A4bZpsmr9Y8kfJvuRKV4pump` | SOS | `Ae6maBjV` | 18.34% | 51.50 | $80,621 | **0.979** | ✅ PASS | $160,145 | +23.6 m | **x2.00** | $1,897 |
| 5 | `vL6EzTJs62HwYzSb9supKTxfd2qUcET3jwcDpTgpump` | JINPACHI | `2ZVMUZte` | 0.33% | 50.39 | $81,613 | **1.016** | ✅ PASS | $123,479 | +8 m | **x1.43** | $0 |
| 6 | `GjYBaN1k27cYbvPTFjchjsrcEjSqkijnn7msJkkYpump` | CHUBBYDOG | `91UM7tdX` | 36.35% | 50.60 | $80,388 | 0.428 | ❌ REJECT | $80,881 | +0 m | x1.32 | $1,427 |
| 7 | `GS6ACPZqDXK8Mmje7DVYJ7S8nnS3bPsMisyDjj2xpump` | CHUBBYDOG | `91UM7tdX` | 66.91% | 50.60 | $78,154 | 0.430 | ❌ REJECT | $81,076 | +0 m | x1.25 | $0 |
| 8 | `FjBnB9fBnkbfV817ZWWXvEqnhSkEGr8LS28WAn3gpump` | CHUBBYDOG | `91UM7tdX` | 36.35% | 50.60 | $78,154 | 0.425 | ❌ REJECT | $80,387 | +0 m | x1.23 | $0 |
| 9 | `HyBnJpXf21cfBCMqbvifvHcYhWZiKvNmRXTovqcdpump` | SOS | `Ae6maBjV` | 13.49% | 47.63 | $76,447 | 0.522 | ❌ REJECT | $79,104 | +0.1 m | x1.21 | $1,414 |
| 10 | `F1xq2MJpcPvURbEppWx6PACsisAWyp17kNxJgZMMpump` | SOS | `Ae6maBjV` | 67.44% | 47.63 | $76,447 | 0.631 | ❌ REJECT | $79,041 | +0.1 m | x1.21 | $0 |
| 11 | `8TLYzcqrPfPKXFcuKYBiB2VfVjYBpf9ogK2q3CWypump` | CHUBBYDOG | `91UM7tdX` | 36.35% | 50.60 | $78,154 | 0.431 | ❌ REJECT | $80,387 | +0 m | x1.20 | $1,424 |
| 12 | `Sa8vzg3oSmXzMKZQXpAgzMqGdFW6NukDh2R9pFmpump` | JINPACHI | `2ZVMUZte` | 0.33% | 50.39 | $69,059 | 0.859 | ❌ REJECT | $69,059 | +0 m | x1.17 | $1,389 |
| 13 | `J9gsnenahdpLUKeyyBzRWjKygZm6wAFNuXVBioJipump` | JINPACHI | `9MRhaPS8` | 40.85% | 52.37 | $81,452 | 0.716 | ❌ REJECT | $81,452 | +0 m | x1.07 | $1,384 |
| 14 | `j1pepvNcHwMCaJqzidYNa1iP4KEcgZLDa7mQSDupump` | JINPACHI | `9MRhaPS8` | 40.85% | 50.39 | $80,087 | 0.795 | ❌ REJECT | $80,087 | +0 m | x1.06 | $1,430 |
| 15 | `G8DhoYCbr7Zvvp1A8uyYd74DSDLesSCCc4haQv15pump` | SOS | `Ae6maBjV` | 13.49% | 47.63 | $76,447 | 0.632 | ❌ REJECT | $80,788 | +0.1 m | x1.05 | $1,410 |
| 16 | `S1sq9ZgcDxeT9NsT7AdGVoiEhg64gBFaxTi14xnpump` | JINPACHI | `2ZVMUZte` | 40.85% | **6.84** | $36,486 | 1.002 | ❌ REJECT (no stack) | $38,294 | +0.6 m | x1.01 | $0 |

**Worst pass x1.43. Best reject x1.32. No overlap.**

---

## 10. The winners — coin by coin

### 🥇 `Yv2taGqRuL9YNrWEGW5Tz9EuYjNzVikEspKzaRqpump` — PEEKO — **x10.42**

| | |
|---|---|
| Dev | `4jLwj3FaQRLfMCbFrp7ckF8jScPxqZ5myLS81GNNSJS5` (1 of 10 launches migrated) |
| Created | 2026-08-05 04:58:51 UTC |
| Pool open | 2026-08-05 04:59:21 UTC |
| **Curve life** | **30 seconds** |
| Pool | `EJnL5crs31tRiyUsoKLi4nUQ8ncy1VKyBtAXfKxw8phx` |
| Dev buy | 0.0936 SOL (0.33%) |
| Pool signatures | 33,327 ok / 34,647 total |
| Pool life | 122.6 h |
| Volume-bot wallets | 1,178 |
| **Peak** | **$888,178 (28.34x from migration)** at +245.7 min |
| DB recorded peak | $892,392 ✓ |
| **Now** | **$1,872 — 99.8% drawdown** |

**Pre-migration:** 287 curve sigs (76.3% failed sniper spam), 68 real trades, 60 traders,
62 buys vs 6 sells. 54 real holders at migration — **44 ours (78.30%), 10 outsiders (1.01%),
insider share 98.7%**.

Top holders: `ForapMTg4SKR9rHxrfRHL3p1ZD9UeVnStXMEqHY5Ws4C` 26.05% (JINPACHI BIN 20),
`7LBoKCAqv6BYBzNm2uFWckerWqjjBByQG1EcRDZTpAmZ` 15.01% (ChubbyDog Bin 20).

Group mix pre-migration: ChubbyDog 35 / Pochi 5 / JINPACHI 4.
Post-migration: **JINPACHI 4,276 / ChubbyDog 1,368 / Pochi 173**.

**Price path:**

| Time | Mcap | x from migration |
|---|---|---|
| +0 s | $80,343 | 2.56x |
| +30 min | $126,247 | 4.03x |
| +50 min | $127,543 | 4.07x |
| +63 min | $190,458 | 6.08x |
| +76 min | $375,147 | 11.97x |
| +120 min | $822,379 | 26.24x |
| **+245.7 min** | **$888,178** | **28.34x** |
| +8 h | $146,905 | 4.69x |
| +12 h | $164,123 | 5.24x |
| +24 h | $1,849 | 0.06x |

**The pump was a 26-minute grind from 4.07x to 12x, not a single candle.** Plenty of time
to enter mid-move. Then it held ~26x for two hours before collapsing to zero within 24 h.

---

### 🥈 `vKMkWJhhRfG7Yh82AqESD3PxTraZNZueTsnKRtspump` — JINPACHI — **x5.64**

| | |
|---|---|
| Dev | `2ZVMUZteEmL6NQ1oDimiWFWTrUALp2G325X4EDFFRkXV` (4 of 27 migrated) |
| Created | 2026-08-06 06:25:46 UTC |
| Pool open | 2026-08-06 09:16:02 UTC |
| **Curve life** | **170.3 minutes** |
| Pool | `F4BbTPpmKyro2mkmK9DanoWk4fXcs8X7aszBFierBA9` |
| Dev buy | 0.0936 SOL (0.33%) |
| Pool signatures | 41,455 ok / 43,685 total |
| Pool life | 93.0 h |
| Volume-bot wallets | 327 |
| **Peak** | **$474,465 (15.14x)** at +1133 min (18.9 h) |
| DB recorded peak | $486,909 ✓ |
| **Now** | **$1,907 — 99.6% drawdown** |

**Pre-migration:** 1,798 curve sigs (91.0% failed), 162 real trades, 97 traders. 46 real
holders — **40 ours (78.71%), 6 outsiders (0.60%), insider share 99.2%**.

**93 ≥3 SOL tagged buys**, of which **90 came after block 0** — the only coin in the
`2ZVMUZte` set where big buying continued. `8mndMJC1…` alone accounts for 63 of them,
sizes 15–25 SOL, starting +65.4 min.

**Price path:**

| Time | Mcap | x |
|---|---|---|
| +0 s | $80,273 | 2.56x |
| +60 s | $76,669 | 2.45x |
| +30 min | $146,646 | 4.68x |
| +60 min | $298,898 | 9.54x |
| +180 min | $359,631 | 11.48x |
| **+1133 min** | **$474,465** | **15.14x** |
| +24 h | $1,962 | 0.06x |

**Took 18.9 hours to peak.** Still at 8.57x twelve hours in. Then dead within 24 h.

---

### 🥉 `HpZSFUgEbzXe9AP2xdCik3pYBTifTr5tPTMrq65bpump` — **x3.37+ — LIVE**

| | |
|---|---|
| Dev | `3ReqHX4KZGTxNRbgTWqJUurACmKhpJ1QVjL9PETt871E` |
| Created | 2026-08-10 07:53:42 UTC |
| Pool open | 2026-08-10 07:56:58 UTC |
| **Curve life** | **3.3 minutes** |
| Pool | `G6dG1ddxuNVeTtoZR8Kn5ycYfsxmm1mt4HCT9vEjRp4N` |
| Dev buy | 0.0988 SOL (0.13%) |
| Curve sigs | 136 |
| Open | $79,885 |
| r (+15–45 s) | **0.923 → PASS** |
| Current | **$255,894, liquidity $37,222** |

**Out-of-sample live confirmation.** Passed both filters. Block-0 stack fired with the
**rotated** wallet set. 8mnd began working it at 08:30 (+33 min) with probe-sized capital
(~31 SOL by +45 min), yet the coin ran anyway — showing 8mnd's commitment size is **not**
required for a move.

Hourly txns at time of writing: **1,555 buys vs 1,122 sells** — the near-1:1 wash signature.

**Unresolved. Do not count this as a confirmed hit until it completes.**

---

### `CUYMG3SR4fscGkYrnre5A4bZpsmr9Y8kfJvuRKV4pump` — SOS — **x2.00**

| | |
|---|---|
| Dev | `Ae6maBjVDHysTDJqRi3vZdoEkCVzdVpSjBQN57wnqDED` (4 of 11 migrated) |
| Created | 2026-08-04 08:05:21 UTC |
| Dev buy | 6.1866 SOL (18.34%) |
| Open | $80,621 |
| **Peak** | **$160,145** at +23.6 min |
| DB peak | $177,094 |
| **Now** | **$1,897 — 98.8% drawdown** |

> ### ⚠ This one is unstable — treat it as a soft hit
> Scores **0.979** on the +15–45 s window but **0.780** on +30–90 s and **0.738** on the
> 60-second minimum. **Under two of four measurement definitions it would be rejected.**
> It dipped hard, then recovered. It is the weakest of the five passes.

---

### `vL6EzTJs62HwYzSb9supKTxfd2qUcET3jwcDpTgpump` — JINPACHI — **x1.43**

| | |
|---|---|
| Dev | `2ZVMUZteEmL6NQ1oDimiWFWTrUALp2G325X4EDFFRkXV` |
| Created | 2026-08-06 05:51:18 UTC |
| **Curve life** | **1.0 minute** |
| Dev buy | 0.0936 SOL (0.33%) |
| Open | $81,613 |
| **Peak** | **$123,479 (3.94x)** at +8 min |
| **Now** | **$0 — LP pulled, 100% drawdown** |

Pre-migration: 49 real holders — 37 ours (78.87%), 12 outsiders (0.44%), **insider share
99.4%**. Only 3 ≥3 SOL tagged buys ever — the block-0 trio, **zero after block 0** across
48.7 hours of pool life.

**The worst-case pass.** Held its opening price (r=1.016), moved to 3.94x in 8 minutes, then
died. Marginal but still green. This is what the floor of the strategy looks like.

---

## 11. The losers — coin by coin

All eleven rejects share one behaviour: **price collapses within the first 60 seconds and
never recovers.** Ten of eleven peaked at **+0 to +0.6 minutes** — meaning the block-0 snipe
*was* the peak, and everything after was distribution.

### The ChubbyDog cluster — `91UM7tdX`, 4 of 4 migrated, 0 wins

| Contract | Dev buy | Open | r | Peak | Return | Now |
|---|---|---|---|---|---|---|
| `GjYBaN1k27cYbvPTFjchjsrcEjSqkijnn7msJkkYpump` | 36.35% | $80,388 | 0.428 | $80,881 | x1.32 | $1,427 |
| `GS6ACPZqDXK8Mmje7DVYJ7S8nnS3bPsMisyDjj2xpump` | 66.91% | $78,154 | 0.430 | $81,076 | x1.25 | $0 |
| `FjBnB9fBnkbfV817ZWWXvEqnhSkEGr8LS28WAn3gpump` | 36.35% | $78,154 | 0.425 | $80,387 | x1.23 | $0 |
| `8TLYzcqrPfPKXFcuKYBiB2VfVjYBpf9ogK2q3CWypump` | 36.35% | $78,154 | 0.431 | $80,387 | x1.20 | $1,424 |

**A 100% migration rate with a 0% win rate.** This dev launched exactly four coins, forced
all four through the curve with 36–67% dev buys, and dumped every one. Retention **0.425–0.431
on all four** — the price lost 57% within 45 seconds every single time. This is the purest
example of a manufactured migration: the migration exists only to open a pool to sell into.

### The SOS cluster — `Ae6maBjV`, 4 of 11 migrated, 1 win

| Contract | Dev buy | Open | r | Peak | Return | Now |
|---|---|---|---|---|---|---|
| `HyBnJpXf21cfBCMqbvifvHcYhWZiKvNmRXTovqcdpump` | 13.49% | $76,447 | 0.522 | $79,104 | x1.21 | $1,414 |
| `F1xq2MJpcPvURbEppWx6PACsisAWyp17kNxJgZMMpump` | **67.44%** | $76,447 | 0.631 | $79,041 | x1.21 | $0 |
| `G8DhoYCbr7Zvvp1A8uyYd74DSDLesSCCc4haQv15pump` | 13.49% | $76,447 | 0.632 | $80,788 | x1.05 | $1,410 |

All three opened at **exactly $76,447** (47.63 SOL stack). The 67.44% dev-buy coin
(`F1xq2MJp…`) is the group's largest dev bag observed and produced nothing.

### The `9MRhaPS8` cluster — 2 of 13 migrated, 0 wins

| Contract | Dev buy | Open | r | Peak | Return | Now |
|---|---|---|---|---|---|---|
| `J9gsnenahdpLUKeyyBzRWjKygZm6wAFNuXVBioJipump` | 40.85% | $81,452 | 0.716 | $81,452 | x1.07 | $1,384 |
| `j1pepvNcHwMCaJqzidYNa1iP4KEcgZLDa7mQSDupump` | 40.85% | $80,087 | 0.795 | $80,087 | x1.06 | $1,430 |

**Every one of this dev's 13 launches used a 40.85% dev buy. Zero winners.** Both migrations
peaked at **+0 minutes**.

`j1pepvNc…` is instructive: it lost **22% in 15 seconds** ($80,087 → $62,764) and never
recovered. `8mndMJC1…` did show up at +22.5 min and bought 4.11 and 4.72 SOL — **a false
positive for any rule based on 8mnd's presence or on "≥3 SOL after block 0"**. It committed
only 12 SOL total and quit after 12 minutes.

### The `2ZVMUZte` rejects

| Contract | Dev buy | Open | r | Peak | Return | Now |
|---|---|---|---|---|---|---|
| `Sa8vzg3oSmXzMKZQXpAgzMqGdFW6NukDh2R9pFmpump` | 0.33% | $69,059 | 0.859 | $69,059 | x1.17 | $1,389 |
| `S1sq9ZgcDxeT9NsT7AdGVoiEhg64gBFaxTi14xnpump` | 40.85% | $36,486 | 1.002 | $38,294 | x1.01 | $0 |

**`Sa8vzg3o…` is the closest call in the dataset** — r = 0.859 against a 0.90 threshold. It
opened depressed at $69,059 (insiders sold inside block 0) and peaked at **+0 seconds**.
The full 50.39 SOL stack landed but could not lift it, because insiders were selling into
the same block. It had 3 ≥3 SOL tagged buys, **zero after block 0**, across 87.9 hours.

**`S1sq9Zgc…` is the no-stack case.** Only 6.84 SOL of block-0 buying from three random
outsiders (1.76 / 1.09 / 3.99 SOL). It opened at $36,486 instead of $80k. Its retention was
*excellent* (1.002) — **which is exactly why filter A exists**. Without the stack check,
this coin passes filter B and delivers x1.01. 40.85% dev buy, zero group support, dead.

---

## 12. The backtest

**Universe:** all 16 known JINPACHI/ChubbyDog migrations, 2026-08-02 → 2026-08-10, 6 devs.
Sources: `coin_stats` (13 rows) + 3 coins traced on-chain and absent from the DB.

**Method:** full signature pagination to pool genesis (never capped), failed transactions
filtered, price reconstructed by pairing the largest token transfer with the largest WSOL
transfer per transaction, dust below 1,000 tokens discarded, sanity cap $50M. Peak measured
**after** the entry timestamp only.

### Results by filter

| Filter | In | Mean | Worst | Out | Best rejected |
|---|---|---|---|---|---|
| r ≥ 0.99 (retention only) | 5 | x4.10 | x1.01 | 10 | x1.32 |
| **r ≥ 0.90 + stack ≥ 40 SOL** | **5** | **x4.26** | **x1.43** | **11** | **x1.32** |
| 8mnd present | 4 | x4.62 | x1.06 | 12 | x1.32 |
| Dev buy < 20% | 8 | x2.93 | x1.05 | 8 | x1.32 |

### Robustness — four definitions of retention

| Definition | Threshold | In | Mean | Worst | Best rejected |
|---|---|---|---|---|---|
| median +15–45 s | ≥0.90 | 5 | x4.10 | x1.01 | x1.32 |
| median +30–90 s | ≥0.90 | 4 | x4.63 | x1.01 | **x2.00** |
| median +60–180 s | ≥0.90 | 5 | x4.10 | x1.01 | x1.32 |
| minimum over 0–60 s | ≥0.90 | 4 | x4.63 | x1.01 | **x2.00** |

**The direction holds in all twelve combinations.** The +15–45 s window is chosen because
it is the only definition that captures all four resolved movers. The two definitions that
reject `CUYMG3SR…` produce a higher mean but lose a x2.00.

### Honest limitations

1. **n=16, 5 trades.** Thin.
2. **The 0.90 threshold was selected after seeing the data.** Boundary is narrow: worst pass
   0.923, best reject 0.859. Mitigating factor: 9 of 11 rejects sit at 0.42–0.80, far below
   the line, so it is not a knife-edge for most of the sample.
3. **`CUYMG3SR…` flips to a reject under 2 of 4 definitions.** Discount it.
4. **`HpZSFUgE…` is unresolved.** Its x3.37 could improve or evaporate.
5. **Returns are measured to peak, which is unachievable.** See below.
6. One operation, an 8-day window, five ticker families.

---

## 13. Things that DON'T work

Tested and dead. Do not rebuild these.

| Idea | Why it fails |
|---|---|
| **Baojin's "≥3 SOL tagged buy → enter"** | Fires on 14 of 16 coins because the block-0 stack *is* three ≥3 SOL tagged buys. Precision collapses to ~21%. |
| **"4th ≥3 SOL buy after block 0"** | Better (3 fires, 2 big winners) but produced a confirmed false positive on `j1pepvNc…` at x1.15, and missed `HpZSFUgE…` entirely. Superseded by the retention rule. |
| **Insider / outsider ratio** | Locked at **98.7%–99.4%** across all measured coins. The x10.42 winner and the x1.01 rug are indistinguishable. It is a config file, not a market signal. |
| **Insider % of supply** | Locked at **78.30%–78.87%**. Same problem. |
| **Curve duration** | 30 seconds → x10.42. 170 minutes → x5.64. No relationship. |
| **Dev sell timing** | Devs with near-identical dump timing produced wildly different outcomes. The dev often holds part of the bag until the group dumps. |
| **8mnd's presence** | 50% precision — it also touched a coin that died and one still unresolved. |
| **8mnd's commitment size** | Separates perfectly at +60 min, but by then price is at 9.5x–26x and only x1.08–x1.59 remains. Too late to trade. |
| **Volume-bot detection** | Bot activity correlates with outcome (327 and 1,178 wallets on the winners vs 12–24 on duds) but only *starts* once the market cap is already elevated. Confirmation, not entry. |
| **Block-0 stack presence alone** | Fires on 14 of 16. Its *absence* is the signal, not its presence. |
| **Tagging by wallet address** | The snipe wallets rotated completely between 08-06 and 08-08. Amounts did not. |

---

## 14. Entry / exit playbook

### Entry

```
1. Watch for PumpSwap pool creation on a pump.fun mint.

2. FILTER A — sum all buys in the migration block.
     >= 40 SOL (expect 47-52, ideally amounts 17.96 / 16.63 / 15.81)  → continue
     <  40 SOL                                                        → SKIP

3. Record P0 = price at the END of block 0.  (expect $76k-$82k)

4. FILTER B — median price over +15s to +45s = P1.
     P1 / P0 >= 0.90  → ENTER at +45s
     P1 / P0 <  0.90  → SKIP

5. Size 1-2 SOL. Never above 5.
```

**Pre-filter your watchlist before migration:** skip any dev whose launches use a **≥36%
dev buy**. That was 0 for 8. `9MRhaPS8` (40.85% on all 13 launches) and `91UM7tdX`
(36–67% on all 4) could have been ignored wholesale.

**Implementation:** you need P0 and the +15–45 s window in hand by second 45. Polling
DexScreener is too slow. This requires a **Geyser or websocket subscription** on PumpSwap
pool creation.

### Exit — UNSOLVED

**This is now the binding constraint, and I have no backtested answer.**

Peak timings on the five passes:

| Coin | Peak at | Return to peak |
|---|---|---|
| `vL6EzTJs…` | +8 min | x1.43 |
| `HpZSFUgE…` | +9.8 min (so far) | x3.37+ |
| `CUYMG3SR…` | +23.6 min | x2.00 |
| `Yv2taGqR…` | **+375.6 min** | x10.42 |
| `vKMkWJhh…` | **+1133.5 min** | x5.64 |

**Two peaked inside 10 minutes. Two took 6 and 19 hours.** There is no way to know at entry
which one you are holding. A fixed hold time is a coin flip between x10 and x1.

**Every single coin ends at $1,384–$1,930 or exactly $0.** Drawdown from peak is 98.0%–100.0%
across all 15 resolved coins. There is no "hold for more" — only "sell before the rug."

**Untested starting point** (judgment, not a backtest result):

| Tranche | Trigger |
|---|---|
| ⅓ | at x1.5 — locks the worst observed case |
| ⅓ | at x3 |
| ⅓ | trailing stop 30% off the running peak |

**Test this before trusting it.**

---

## 15. Methodology & analysis traps

Every one of these produced a wrong answer during this investigation.

| # | Trap | Fix |
|---|---|---|
| 1 | **Signature pagination caps.** `getSignaturesForAddress` returns **newest-first**. A 40,000 cap on a 43,685-signature pool silently truncates the *oldest* records, so `sigs[0]` is not the pool open. This shifted `vKMkWJhh…`'s timeline by 52 minutes and reported the wrong peak. | Always page to genesis. Cross-check: time-to-migration should equal curve duration. |
| 2 | **Failed transactions.** 76%–97% of bonding-curve signatures are **failed sniper spam**. Counting them looks like frantic wash trading. | `filter(s => !s.err)` |
| 3 | **Migration timestamp from the curve.** The bonding curve keeps receiving dust and failed txs after migration. Using its last signature reported a 57-second curve as 31.9 minutes. | Use pool creation time (DexScreener `pairCreatedAt` or the pool's oldest signature). |
| 4 | **Reading current state as history.** A coin at $1,900 today may have hit $888,178. | Always reconstruct the peak from swap data. Never infer from current mcap. |
| 5 | **Measuring returns from the global peak.** On dead coins the peak is at +0 s but the signal fires later, producing impossible returns like x2.93. | Measure max price **after** the entry timestamp only. |
| 6 | **Price at "+0 s" is ambiguous.** Multiple swaps share the block-0 timestamp; whichever sorts first gives an arbitrary intermediate fill. Reported $51,430 and $80,273 for the same coin. | Take the **max** price at t=0 for end-of-block-0. |
| 7 | **Single-point retention is noisy.** Sparse trades make "price at +60 s" unstable. `CUYMG3SR…` reads 0.979 or 0.738 depending on the window. | Use a **median over a window**, and test multiple windows before trusting a threshold. |
| 8 | **Silent exception swallowing.** A caught RPC error left `complete: undefined`, dropping a known winner from the sample. | Log every caught exception. |
| 9 | **Wallet-history endpoint caps.** Helius Enhanced returns at most 12,000 txs, newest-first. 8mnd's per-coin totals were undercounts. | Prefer pool-side data for totals. |
| 10 | **Rate-limited price oracle returning null.** Produced `Infinity` market caps. | Hardcode a fallback SOL price. |
| 11 | **Dust transfers.** Sub-1,000-token transfers produce absurd implied prices. | Filter `tokenAmount < 1000`, sanity-cap at $50M. |
| 12 | **Trusting DB tags.** `5tzFkiKsc…` is tagged "Pochi Bin 30" and is a Binance hot wallet with 670,000 SOL. | Sanity-check every tagged wallet's balance and tx count. |

### Reference constants

```javascript
const PUMP    = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const WSOL    = 'So11111111111111111111111111111111111111112';
const SOL_USD = 76.28;          // fix this per analysis run
const SUPPLY  = 1e9;

// bonding curve PDA
seeds = ['bonding-curve', mintPubkey]

// curve account layout
//   [0..8)   discriminator
//   u64 LE × 5: virtualTokenReserves, virtualSolReserves,
//               realTokenReserves, realSolReserves, tokenTotalSupply
//   u8 complete

// migration
85 real SOL  →  410.8 SOL market cap  =  $31,336
LP deposit   =  84.99 SOL + 206,900,000 tokens
k            =  1.75843e10

// post-snipe price
mcap(X) = (84.99 + X)² / k × 1e9 × SOL_USD
```

---

## 16. Open work

| Priority | Task |
|---|---|
| **1** | **Backtest exits** on the 5 passing coins — trailing stops at 20/30/40% off running peak vs fixed holds at 10/30/60 min vs thirds. This is worth more than more entry data. |
| **2** | Resolve `HpZSFUgE…` and log its final outcome. |
| 3 | Extend the backtest to Pochi Bin 30 and Baojin Mex 35 migrations. Same AMM math, different stack size → different opening constant. Target n ≥ 50. |
| 4 | Build the live watcher: Geyser subscription on PumpSwap pool creation, keyed on block-0 amounts (17.96 / 16.63 / 15.81), computing P1/P0 by +45 s. |
| 5 | Trace dev `3ReqHX4KZGTxNRbgTWqJUurACmKhpJ1QVjL9PETt871E` — launch count, funding source, other migrations. |
| 6 | Re-tag `5tzFkiKsc…` and `6LY1JzAF…` as exchange infrastructure, not group wallets. |
| 7 | Tag the six dev wallets in `tagged_wallets` — currently all untagged. |
| 8 | Enumerate the JINPACHI volume-bot fleet by buy-size fingerprint, as was done for Baojin's 1,831 wallets. |
| 9 | Paper-trade the rule forward for 20+ coins before committing real size. |

---

*Compiled 2026-08-10. All figures from on-chain data at time of analysis; SOL priced at
$76.28. n=16 — this is evidence, not proof.*
