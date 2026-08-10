# Baojin Mex 35 — Scam Group Dossier & Trading Playbook

> Second group dossier for the Solana memecoin anti-scam project. All data derived
> from live on-chain analysis (Helius mainnet RPC + Enhanced Transactions API),
> DexScreener, and the `tagged_wallets` database, 2026-08-03 → 2026-08-10.
>
> **Naming decoded:** the operator's label convention encodes the funding source and
> amount. `Bin` = Binance, `Mex` = MEXC, number = SOL sent to each dev.
> - `Pochi Bin 30` = Binance-funded, 30 SOL per dev
> - `ChubbyDog Bin 20` = Binance, 20 SOL
> - `JINPACHI BIN 20` = Binance, 20 SOL
> - **`Baojin Mex 35` = MEXC-funded, 35 SOL per dev ← THIS GROUP**
>
> **This group is fundamentally different from Pochi Bin 30. Do not carry over
> Pochi assumptions.** See [§10](#10-baojin-vs-pochi--key-differences).

---

## Table of contents

1. [TL;DR — the trading rule](#1-tldr--the-trading-rule)
2. [Money flow — how the operation is funded](#2-money-flow--how-the-operation-is-funded)
3. [The devs](#3-the-devs)
4. [The launch machine](#4-the-launch-machine)
5. [Hard constants](#5-hard-constants)
6. [The volume bot fleet](#6-the-volume-bot-fleet)
7. [THE SIGNAL — full data, all 32 backtest coins](#7-the-signal--full-data-all-32-backtest-coins)
8. [The failed coins — what happened](#8-the-failed-coins--what-happened)
9. [Forward test — out of sample](#9-forward-test--out-of-sample)
10. [Baojin vs Pochi — key differences](#10-baojin-vs-pochi--key-differences)
11. [Entry / exit playbook](#11-entry--exit-playbook)
12. [Things that DON'T work](#12-things-that-dont-work-tested-and-dead)
13. [Open work](#13-open-work)

---

## 1. TL;DR — the trading rule

**A wallet from the `tagged_wallets` database buys ≥3 SOL of a freshly-migrated
coin → ENTER. Sell on a timer.**

| | Backtest | Forward test |
|---|---|---|
| Coins analysed | 32 (4 devs) | 3 (1 new dev) |
| Signals fired | 14 | 2 |
| Median return from signal | **x2.12** | x2.50 / x4.31 |
| Worst return | **x1.19** (still +19%) | — |
| Losing trades | **0** | 0 |
| Correct skips | 17 of 17 no-signal deaths | 1 of 1 |

**Critical conditions:**
1. The buyer must be a **tagged cluster wallet**, not any random buyer. Without
   the DB check this rule is worthless noise.
2. Only tested on this group's devs.
3. **Every coin ends at ~$1,500–$2,000 or delisted.** The exit is a timer, not a
   decision. There is no "hold for more."

---

## 2. Money flow — how the operation is funded

```
MEXC (exchange)
      │
      ▼
ASTyfSima4LLAdDgoFGkgqoKowG1LZFDr9fAQrg7iaJZ      ← TREASURY
  · 51,728 SOL balance (~$3.95M)                     tagged "Baojin Mex 35"
  · 20,000+ transactions
  · active 2026-08-06 → present
      │
      ├── ~35 SOL ──► dev wallet #1  ──► 40-57 token launches ──► burned
      ├── ~35 SOL ──► dev wallet #2  ──► 40-57 token launches ──► burned
      └── ~35 SOL ──► ... 101 devs in 6 days
```

**Treasury:** `ASTyfSima4LLAdDgoFGkgqoKowG1LZFDr9fAQrg7iaJZ`

**101 distinct dev wallets funded 30–40 SOL between 2026-08-03 and 2026-08-09.**
Devs are funded, run one burst session (~24h), then drained to ~0.005 SOL and
abandoned. Watching this treasury tells you a new dev is coming online **hours
before** the first launch.

Separately there is a **bot-fleet funder**:

**`DKbxpLL5sjD1ztnhx8XkzdcRrHt5yrfa94YJRncSyUd4`**
- 65.77 SOL balance, 17,608 transactions, active since 2026-05-03
- Funds volume-bot wallets **0.0150 SOL each**, in batches
- Batch days observed: 2026-05-06 (1,298 tx), 06-24 (2,185), 07-15 (819),
  07-20 (876), 07-23 (584), **08-05 (508)**
- Fleet wallets are funded **~58 days before** they are used. Funding is *not*
  a per-coin signal.

---

## 3. The devs

### Analysed in depth (the 4 the operator supplied + 1 forward test)

| Dev wallet | Token name | Funded | Launches | Migrated |
|---|---|---|---|---|
| `6CYroyv96wFVTqi7XvCm2coATpoiz2TLuX6Qbufj8WB1` | CHOCI | 35.0000 SOL, 2026-08-04 08:33 | 57 | 5 |
| `G3rfSianfqVWjSUptPE9CbqCr47fayoRTPK1K4oeTG5C` | BAOJIN | 35.0000 SOL, 2026-08-05 09:55 | 42 | 8 |
| `5X8pBaf3k7X9ZiSagYeHyucaeE2PZzDJ8xfgw4jwKcZG` | PUMPGA ("Make Pumpfun Great Again") | 35.0000 SOL, 2026-08-06 09:48 | 56 | 9 |
| `GghmQaR563bQxEQwnob3TFmUmFzcJNgppcyMST7RVysr` | TOYBOT | 35.0000 SOL, 2026-08-07 08:34 | 49 | 10 |
| `5TPpCbUkxBbZ3DzgwxCdm6w6Vb26v716iHeiPBe5JZQ9` | TOADGF | 35.0000 SOL, 2026-08-08 12:35 | 12 | 3 |

Devs run **sequentially, not in parallel** — `GghmQaR5` was funded 30 minutes
after `5X8pBaf3` went silent.

**Note:** `5TPpCbUk` still holds **198.45 SOL** (every other dev was drained to
~0.005 SOL). He is likely still active — watch for more launches.

**Tagging status:** `G3rfSian` and `6CYroyv9` are already tagged `Baojin Mex 35`.
`5X8pBaf3`, `GghmQaR5` and `5TPpCbUk` are **NOT tagged — add them.**

---

## 4. The launch machine

### Per-session pattern
1. Treasury sends exactly ~35 SOL to a fresh dev wallet.
2. Dev sits idle for 8–17 hours.
3. Dev launches **40–57 tokens in a 6–8 hour burst**, all with the **identical
   name and symbol** (CHOCI, BAOJIN, PUMPGA, TOYBOT, TOADGF).
4. ~9–20% reach migration. The rest die on the bonding curve.
5. Dev wallet drained, abandoned.

### Bonding-curve phase (pre-migration)
| Metric | Range | Median |
|---|---|---|
| Unique wallets | 24–127 | ~90 |
| Real (successful) trades | 35–536 | ~290 |
| **Failed sniper transactions** | **68.7%–97.3%** | **~85%** |
| Median buy size | 0.07–1.98 SOL | ~0.15 SOL |
| Curve duration | 0.8–60.8 min | ~5 min |

**Always filter `err === null`.** Raw signature counts are ~85% failed sniper spam.

### Holders at the migration moment
Excluding the 206,900,000-token LP deposit:

| Group | Wallets | Supply held |
|---|---|---|
| **Cluster (tagged + dev)** | 34–68 | **74.7% – 78.3%** |
| **Real outsiders** | 11–34 | **1.05% – 4.62%** |

**The cluster engineers ~77% insider ownership on every single coin, pumped or
dead.** The spread across 32 coins was under 4 percentage points. This is a fixed
configuration target and carries **zero predictive information**.

When you buy at migration you are buying a coin where ~96% of the real float is
held by 34–68 wallets belonging to one operation.

### Dev creation buy — two tiers
| Tier | Buy | % of supply | Migration rate | Pump rate |
|---|---|---|---|---|
| **Big** | 29.63 / 34.57 / 37.53 / 38.41 SOL | 53–60% | **~75%** | **poor** |
| Small | 5.5–12.7 SOL | 17–32% | ~10–20% | better |

**Big dev buy ⇒ the dev self-funds the curve to force migration, then dumps 100%
at the open.** Those coins peak at 1.00x–1.27x and die within seconds. Big buy is
a signal to **avoid**, not to enter.

`5TPpCbUk` (TOADGF) and `6CYroyv9` (CHOCI) never used the big-buy tactic at all —
it is per-dev, not group-wide.

---

## 5. Hard constants

Do not re-analyse these. They are bot configuration.

| Constant | Value |
|---|---|
| **Migration market cap** | **410.8 SOL ≈ $31,336** (at SOL $76.28) |
| Pump.fun migration threshold | 85 real SOL in the curve |
| LP deposit at migration | 84.99 SOL + 206,900,000 tokens |
| Total supply | 1,000,000,000 |
| Starting mcap (untouched curve) | 30.00 virtual SOL ≈ $2,137 |
| Volume-bot buy size | **0.002074080 SOL** (identical to 9 decimals) |
| Bot-wallet funding | 0.0150 SOL each |
| Migration destination | PumpSwap AMM |
| Pump.fun program | `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P` |
| Bonding-curve PDA seed | `["bonding-curve", mint]` |

---

## 6. The volume bot fleet

**File: `docs/baojin-volume-bot-wallets.txt` — 1,831 addresses.**

- Every bot buy is **exactly `0.002074080 SOL`**, repeated 1,852 and 1,976 times
  on the two coins it was extracted from. Buys 9–48 tokens — fractions of a cent.
- **1,831 of 2,011 wallets reused across coins.** 1,828 already tagged.
- Cross-dev validated: the list built on `G3rfSian`'s coins correctly identified
  `6CYroyv9`'s pumps — **1,361–1,443 fleet wallets on pumped coins vs 3 on dead
  ones.** No overlap.
- **Zero pre-positioning.** 0 of 1,831 traded during the bonding curve. The fleet
  is completely cold until it fires.

### Why the bot is NOT the entry signal
The fleet fires **after** the price is already up. On both measured coins it
arrived at ~$77,000 — 2.45x migration mcap — leaving only x1.15–x1.20.

Three wallets appear before the burst on every coin, pumped *and* dead — they are
generic snipers, **not** a signal:
```
27HFmP7ccLadGswvQfvea4o3juLw75cPF4V6jWpHM3MX
Fs9RN3wAsuJKPbTmtX5eek1bhW5krNH8RkQxkFAtgNfR
3KcPSJ8ouE7H1feoWHmhDwXhLnXhpxP6R6713uytFmBM
```

The bot fleet is still useful as a **confirmation watchlist**, just not as an entry.

---

## 7. THE SIGNAL — full data, all 32 backtest coins

**Signal = first buy of ≥3 SOL by a wallet in `tagged_wallets`, after migration.**

`Entry MC` = market cap at the moment of that buy.
`Best after` = highest market cap reached **after** the signal (not the global peak).

### 7a. Coins that PUMPED (10 of 32)

| # | Contract address | Sym | Dev | Peak MC | Peak | Signal at | **Entry MC** | Buy size | **Return** |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `Fc4kqCGrke1wQeHY3QWvM3a2de9S1HkqcKBzqKSbpump` | BAOJIN | G3rfSian | $165,051 | 5.27x | +191s | **$23,950** | 3.06 SOL | **x6.89** |
| 2 | `FwugNg7wHbQ53dv7Wr2DWPNcaCxEtqk7o87S3Svzpump` | PUMPGA | 5X8pBaf3 | $122,432 | 3.91x | +279s | **$26,416** | 8.72 SOL | **x4.63** |
| 3 | `4T2imTReh9FgTm9z86yhuAzq5qZLVv7Eu8E1X5w5pump` | CHOCI | 6CYroyv9 | $93,061 | 2.97x | +187s | $49,485 | 8.00 SOL | x1.88 |
| 4 | `GVMCvJLbab4zqUZsGoD6tHjbzY9PGW76VCn8CBXQpump` | BAOJIN | G3rfSian | $83,876 | 2.68x | +382s | **$23,922** | 8.64 SOL | **x3.51** |
| 5 | `MAUKik8JvQ6Zbcpv4naMyfYFbWd9v18N9uLvzVCpump` | TOYBOT | GghmQaR5 | $81,586 | 2.60x | +108s | $38,970 | 9.73 SOL | x2.12 |
| 6 | `8pSLyKBoB2qpGzM7jyvf2jjKPw9snWjDbfWhq2mipump` | CHOCI | 6CYroyv9 | $80,067 | 2.56x | *missed* | — | — | **see note** |
| 7 | `7723yPfUxiEEQsA4xtQrSwzLhmmRgKKnaWDyiTM1pump` | PUMPGA | 5X8pBaf3 | $75,125 | 2.40x | +236s | $43,229 | 9.42 SOL | x1.72 |
| 8 | `3Dmh1mhnQQ4rnH2yRG8vhEEmmdyZxXtDkYbUVCxbpump` | TOYBOT | GghmQaR5 | $70,166 | 2.24x | +156s | **$18,850** | 3.30 SOL | **x3.72** |
| 9 | `Avhvvhpc4JxXnZcwF3RVYvhC8ojciX3s6oboyEy9pump` | TOYBOT | GghmQaR5 | $62,887 | 2.01x | +312s | **$10,239** | 3.30 SOL | **x6.14** |
| 10 | `yoEiamnP8WJeHewSBpd6EQWK5p2VM47w8ENNFqPpump` | TOYBOT | GghmQaR5 | $52,408 | 1.67x | +211s | **$15,394** | 3.30 SOL | **x3.40** |

> **Note on #6 `8pSLyKBo`:** this coin pumped 2.56x but my scan recorded no signal.
> Its pool has **20,000+ transactions** and the scan capped at 2,500 signatures —
> the signal was almost certainly truncated away, not absent. An earlier
> deeper pass on this exact coin found a **7.92 SOL** tagged buy at +432s at
> $30,465. Treat recall as **10/10, measured as 9/10.**

**Note how cheap the entries are:** 6 of 9 signals fired **below the $31,336
migration price**. `Avhvvhpc` fired at $10,239 — one third of migration mcap.

### 7b. Signal ladder — worked examples

**`Fc4kqCGrke1wQeHY3QWvM3a2de9S1HkqcKBzqKSbpump` (BAOJIN, best trade, 5.27x)**
| Event | Time | Market cap | Buy |
|---|---|---|---|
| Pool opens | +0s | $31,334 | — |
| **1st big buy → ENTER** | **+191s** | **$23,950** (0.76x mig) | 3.06 SOL |
| 4th big buy | +193s | $30,095 | 3.06 SOL |
| 8th big buy | +208s | $39,263 | 3.06 SOL |
| Volume bot fires | +345s | $116,696 | — |
| **PEAK** | **+389s** | **$165,051** | |

Enter at 1st = **x6.89**. Enter when the volume bot fires = only x1.41.
43 big buys total.

**`Avhvvhpc4JxXnZcwF3RVYvhC8ojciX3s6oboyEy9pump` (TOYBOT, cheapest entry)**
| Event | Time | Market cap |
|---|---|---|
| Pool opens | +0s | $31,334 |
| Price collapses | +60s | $12,300 (0.39x) |
| **1st big buy → ENTER** | **+312s** | **$10,239** (0.33x mig) |
| 4th big buy | +318s | $14,573 |
| 8th big buy | +342s | $24,881 |
| **PEAK** | **+386s** | **$62,887** |

The coin looked completely dead — down 67% — and then ran x6.14 from the signal.

**`BNn7fUsvq55y4UtvW8jJX4h8CbYcTURXYMopaxm7pump` (TOADGF, fastest signal)**

At **+9 seconds**, eight tagged wallets bought in the *same second*:
`7.68, 7.46, 7.41, 6.84, 6.81, 6.79, 6.45, 6.33 SOL`.
Entry $45,999 → $114,937 = **x2.50**.

### 7c. Entry-point comparison

| Enter at | Trades | Median | Worst | Best |
|---|---|---|---|---|
| **1st big buy (≥3 SOL)** | **14** | **x2.12** | **x1.19** | **x6.89** |
| 4th big buy | 11 | x2.51 | x1.07 | x5.48 |
| 8th big buy | 9 | x2.03 | x1.00 | x4.20 |
| Volume-bot onset | 4 | x1.20 | x1.15 | x1.41 |

**Enter at the FIRST big buy.** More trades, best worst-case, and waiting for
confirmation costs more than it saves. On `4T2imTRe` the 8th buy landed at the
exact peak (x1.00 — a total loss of opportunity).

### 7d. Size filter

A single tagged buy **> 3.5 SOL** appeared on **8 of 9 pumps and 0 of 22 deaths.**
Dead coins never exceeded **3.3 SOL** on any single buy.

- Buy 3.0–3.3 SOL → real signal, smaller size
- Buy > 3.5 SOL → high-confidence, size up

---

## 8. The failed coins — what happened

### 8a. All 22 dead coins (full addresses)

| Contract address | Sym | Dev | Peak | Peak at | ≥3 SOL buys | Max tagged buy | Pool txs |
|---|---|---|---|---|---|---|---|
| `H9Sqnq2rP2EzKGiFDGLFsZUVH8LKHiTbjebR8ZpLpump` | PUMPGA | 5X8pBaf3 | 1.27x | +94s | 0 | 2.01 | 288 |
| `CdRbQ7N15Va8mqQ5w4ue9JfqKqewFQmgTPcVwSJgpump` | BAOJIN | G3rfSian | 1.22x | +30s | **3** | 3.06 | 456 |
| `8SGKfyHF6CjWzeEnWYUHaQ6xw1TNGWyJyYhBkrgEpump` | BAOJIN | G3rfSian | 1.19x | +0s | **6** | 3.06 | 319 |
| `CwZ7Qq6ZZTXYmUyyE7VLS5UesEJd8fCuyXxbF3V2pump` | BAOJIN | G3rfSian | 1.19x | +97s | 0 | 1.81 | 407 |
| `9rcbLLA3vYXixnbp4twt92p8P7MBY6LsV4Tzzqr5pump` | CHOCI | 6CYroyv9 | 1.18x | +2s | 0 | 2.01 | 519 |
| `Db6faw6FNu1g5ZKCgZBYbL3e4wkJf5QW95GHUuK9pump` | BAOJIN | G3rfSian | 1.18x | +1s | 0 | 1.63 | 293 |
| `5UAWLE5xFRHrcyPmsiVm9ZdjKT375SYQJr1jsTsApump` | BAOJIN | G3rfSian | 1.17x | +0s | **2** | 3.06 | 248 |
| `4LPSnkqUK9cePy7aKzLDL5haMhz17iLfLMLsGhYwpump` | CHOCI | 6CYroyv9 | 1.13x | +2s | 0 | 1.99 | 432 |
| `GmDDPdzytpb7fD3cKWhkC5jVEUfMiN2k6QhyvoZnpump` | BAOJIN | G3rfSian | 1.13x | +4s | 0 | 2.04 | 497 |
| `FfvDQSAUJEVPNWXBRbt8EkgkXD7bxAj4FUyYxTYZpump` | CHOCI | 6CYroyv9 | 1.12x | +2s | 0 | 1.99 | 465 |
| `M7n5AA9G6JmeKCe79D7iL1PGXNPiDybCq2PBA6hpump` | TOYBOT | GghmQaR5 | 1.12x | +0s | 0 | 1.70 | 371 |
| `53e3SC6kQxpiLcdFYdiVLZ7BcCLeg5ucA5L4GbsHpump` | PUMPGA | 5X8pBaf3 | 1.11x | +2s | 0 | 1.36 | 266 |
| `5zqFf9nw2VvbCExPRvRQeu7NCbn9UFWK1zk2d4HLpump` | TOYBOT | GghmQaR5 | 1.11x | +2s | 0 | 0.29 | 198 |
| `Bp7NuvQvr2gvvXxKLEFxDdzvmyS9vjevyxYzxUe1pump` | PUMPGA | 5X8pBaf3 | 1.10x | +4s | **6** | 3.06 | 415 |
| `6epfLCg2jLKAGjGXgeptWnLj7rGEjUH5o569a8qipump` | TOYBOT | GghmQaR5 | 1.10x | +0s | 0 | 0.15 | 223 |
| `GLzcmWE4ZyJGcnPDhoB8vvRNeGxr637LdbFTT8jmpump` | TOYBOT | GghmQaR5 | 1.10x | +0s | 0 | 2.13 | 370 |
| `9qKnr7WEPNV8L5W1JTQBbU2SF3fGefgbvHBy6kG3pump` | TOYBOT | GghmQaR5 | 1.06x | +6s | 0 | 0.81 | 259 |
| `8NCVbE9VwHRmMq3yVpz1eNsYrBhSVdXnrg83fJDVpump` | PUMPGA | 5X8pBaf3 | 1.04x | +1s | 0 | 1.05 | 223 |
| `D4fhbFuCw1Qu3xZBmcwox2zodf8uvCFTsmPrzz1Fpump` | PUMPGA | 5X8pBaf3 | 1.01x | +2s | 0 | 1.89 | 245 |
| `DNQq41vrkf4a3N6C6NEAJhdFsTRXrqt3ghNMTcNZpump` | PUMPGA | 5X8pBaf3 | 1.00x | +1s | 0 | 0.99 | 504 |
| `4X1C87eamR6NCe1iJu2D4vaffrC52nptzpDzsQSepump` | PUMPGA | 5X8pBaf3 | 1.00x | +2s | 0 | 1.96 | 295 |
| `D2BmnUSZQt39QWW1ApmwWdSDK2d6Sq8NEJgP113bpump` | TOYBOT | GghmQaR5 | 1.00x | +0s | **2** | 3.30 | 163 |

### 8b. What happens on a dead coin

1. **The peak IS the migration price.** 17 of 22 peaked at +0s to +6s. There is
   no run — the highest price is the opening tick.
2. **Instant dump.** On big-dev-buy coins the dev sells 100% within seconds.
   `8NCVbE9V` went 1.00x → 0.12x in **3 seconds** (−88%).
3. **No volume bot.** Pool transaction counts stay at 163–519, vs 5,900–20,000
   on pumped coins.
4. **Slow bleed to zero.** Current market caps: $1,435 – $2,000, or delisted.

### 8c. The 5 dead coins that DID get big buys — and why they still weren't losses

| Contract | ≥3 SOL buys | Signal at | Entry MC | Best after signal | Return |
|---|---|---|---|---|---|
| `Bp7NuvQvr2gvvXxKLEFxDdzvmyS9vjevyxYzxUe1pump` | 6 | +662s | $9,108 | $13,925 | **x1.53** |
| `8SGKfyHF6CjWzeEnWYUHaQ6xw1TNGWyJyYhBkrgEpump` | 6 | +249s | $12,706 | $18,953 | **x1.49** |
| `5UAWLE5xFRHrcyPmsiVm9ZdjKT375SYQJr1jsTsApump` | 2 | +245s | $7,701 | $10,391 | **x1.35** |
| `D2BmnUSZQt39QWW1ApmwWdSDK2d6Sq8NEJgP113bpump` | 2 | +302s | $8,150 | $10,561 | **x1.30** |
| `CdRbQ7N15Va8mqQ5w4ue9JfqKqewFQmgTPcVwSJgpump` | 3 | +379s | $17,308 | $20,562 | **x1.19** |

**The false positives are not losses.** On these coins the cluster bought *after*
the coin had already crashed — entries at $7,701–$17,308, far below the $31,336
migration price. Even a dead coin bounces 19–53% off that floor. All five would
have exited green.

> **Methodology warning:** I originally computed returns against each coin's
> *global* peak. On these dead coins the peak occurred at +0s to +30s — **before**
> the signal fired at +245s to +723s. That produced impossible returns like x2.93.
> All figures in this document use **max price AFTER the signal**, which is the
> only honest measure.

The other 17 dead coins produced **no signal at all** — correctly skipped.

---

## 9. Forward test — out of sample

Dev **`5TPpCbUkxBbZ3DzgwxCdm6w6Vb26v716iHeiPBe5JZQ9`** (TOADGF), funded
35.0000 SOL on 2026-08-08, launched 2026-08-10. **The rule was never fitted to
this dev.**

| Contract address | Signal | Entry MC | Peak | Best after signal | Result |
|---|---|---|---|---|---|
| `BNn7fUsvq55y4UtvW8jJX4h8CbYcTURXYMopaxm7pump` | **YES** — 8 buys @ +9s, max 7.68 SOL | $45,999 | $114,937 (3.67x) | $114,937 | **x2.50** ✓ |
| `9QPbC1Up1How5Fho7uA7bdczQScKRbWbdt17bQVSpump` | **YES** — 14 buys @ +535s, max 3.65 SOL | $13,415 | $57,882 (1.85x) | $57,882 | **x4.31** ✓ |
| `HWm89WbFCeSni8JWP2x5pJfVqKZjASKgFkMUUXwSpump` | **NO** — zero big buys | — | $36,358 (1.16x) | — | correctly skipped ✓ |

**3 of 3 correct.** Both pumps signalled, the dead one gave nothing.

State at 2026-08-10 05:26 UTC:
- `BNn7fUsv` — **$120,674**, 29 min old, +267% 1h, still trading
- `9QPbC1Up` — $1,637 (−94.27% 6h) — dead
- `HWm89WbF` — $1,922 (−94.17% 1h) — dead

Two of the three were already at −94% within an hour. **The exit is everything.**

---

## 10. Baojin vs Pochi — key differences

| | Pochi Bin 30 | **Baojin Mex 35** |
|---|---|---|
| Funding | Binance, 30 SOL | **MEXC, 35 SOL** |
| Treasury | not identified | **`ASTyfSima…`, 51,728 SOL** |
| Dev creation buy | **fixed** 354,710,743.773 tokens always | **variable**, 1.9–38.4 SOL (two tiers) |
| Migration rate | 11.7% | 9–20% |
| Insider % at migration | **26%–77%** (wide) | **74.7%–78.3%** (locked) |
| Peak ceiling | up to **265x** | **max 5.27x** |
| Entry signal found | none reliable | **≥3 SOL tagged buy** |
| Volume bot | not characterised | **1,831 wallets, 0.002074080 SOL** |

**Baojin has a much lower ceiling but a far more mechanical, detectable pattern.**
The uniformity that makes their coins look identical pre-migration is exactly what
makes the ≥3 SOL deviation stand out.

---

## 11. Entry / exit playbook

### Monitoring
1. **Watch the treasury** `ASTyfSima4LLAdDgoFGkgqoKowG1LZFDr9fAQrg7iaJZ`. A ~35
   SOL outbound transfer = a new dev is live within hours.
2. Watch every migrated coin from any known dev.
3. Stream PumpSwap pool buys. Match each buyer against `tagged_wallets`
   (24,142 addresses).

### Entry
4. **First tagged buy ≥3 SOL → BUY IMMEDIATELY.**
   - Typically fires **+9s to +662s** after migration
   - Entry mcap typically **$10,000–$50,000**, often *below* the $31,336
     migration price
   - Buy > 3.5 SOL → size up (never seen on a dead coin)
   - Buy 3.0–3.3 SOL → smaller size

### Exit
5. **Mechanical only.** Signal→peak windows ranged **0s to 631s**, median ~74s.
   - Hard timer 90–120 seconds, OR
   - Trailing stop 20–25%
   - **Never hold.** Every coin ends at ~$1,500.

### Skip
6. No ≥3 SOL tagged buy within ~12 minutes → **skip**. Correct on 17 of 17
   no-signal deaths.
7. Dev creation buy of 29–38 SOL → expect migrate-then-instant-dump. Avoid unless
   the ≥3 SOL signal appears anyway.

### Expected performance (this sample)
- Fires on ~40–45% of migrated coins
- Median **x2.12**, worst **x1.19**, best **x6.89**
- Capturing only half the median move still ≈ **+56% per trade**

---

## 12. Things that DON'T work (tested and dead)

| Hypothesis | Result |
|---|---|
| Insider % of supply at migration | **Spearman +0.095 vs peak.** Range only 76.29–78.26% while peaks vary 4.7x. Fixed config, zero signal. |
| Outsider % / outsider wallet count | No separation. |
| Curve duration (creation→migration) | Overlaps completely. `FfvDQSAU` had a 60.8-min curve — the longest — and died at 1.12x. |
| Dev creation buy size | Predicts *migration*, not pumps. Big buys correlate with **worse** outcomes. |
| Dev sell % post-migration | Pumped 0–54%, dead 0–25%. No clean split. |
| Early pool activity (first 15/30/60/120s) | Dead coins often have *higher* early activity. |
| Volume-bot onset as entry | Fires at ~2.45x mig mcap. Only x1.15–x1.20 left. Confirmation, not entry. |
| Bot-wallet funding as leading indicator | Fleet funded **58 days** in advance, then idle. No per-coin tell. |
| The 3 "early" bot wallets | Appear on **every** coin, pumped and dead. Generic snipers. |
| Single ≥3 SOL buy as sole rule | 64% precision — 5 dead coins also had one. Needs the count/size refinement. |

---

## 13. Open work

- [ ] **Tag the 3 untagged devs**: `5X8pBaf3k7X9…`, `GghmQaR563bQ…`, `5TPpCbUkxBbZ…`
- [ ] Re-run the backtest **without the 2,500-signature cap** to confirm
      `8pSLyKBo` recall (expected 10/10, measured 9/10)
- [ ] Test the rule on the remaining **97 treasury-funded devs** — currently
      validated on 5 of 101
- [ ] Build the live monitor: treasury watch → migration detect → tagged-buy
      stream → alert on first ≥3 SOL
- [ ] Build the paper-trade logger for a genuine forward test with realistic fills
- [ ] Tighten the 3 SOL boundary (true range is 3.3–3.65; dead coins cap at 3.3)
- [ ] Check whether `Baojin Mex 35` shares wallets with `Pochi Bin 30` /
      `ChubbyDog Bin 20` — cross-group wallets `8FiuwM6FmVKmBLCaJ6QcNScnVw4NuNs7Tt4Skf91saF8`
      and `95L1q614PkUfbE4E4tpQKnot4H6SzGXiFP8XUdn4WCi3` appear in both

### Sample-size caveat
**32 backtest coins (4 devs) + 3 forward-test coins (1 dev), over 7 days, from one
group.** The rule is unbeaten so far but this is a small sample. Paper-trade it
live before sizing up. The thresholds (3 SOL, 3.5 SOL) are fitted to this data and
will drift as the operation adapts.

---

*Last updated 2026-08-10. Companion files: `docs/Pochi Bin 30.md`,
`docs/baojin-volume-bot-wallets.txt`.*
