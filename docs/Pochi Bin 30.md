# Pochi Bin 30 — Scam Group Dossier

> Working file for the Solana memecoin anti-scam project. Everything in here was
> derived from live on-chain data (Helius mainnet RPC + enhanced transactions API)
> and the tagged-wallet database, between 2026-08-05 and 2026-08-09.
>
> **Naming:** "Pochi Bin 30" is the operator's own label for this crew, carried over
> from the `tagged_wallets.label` column. It is the primary cluster label, but the
> same operation also uses wallets labeled `ChubbyDog Bin 20` (see
> [Cluster labels](#cluster-labels-in-the-database)).

---

## Table of contents

1. [Operator profile — who this is for](#1-operator-profile--who-this-is-for)
2. [The group: identity and infrastructure](#2-the-group-identity-and-infrastructure)
3. [The playbook — how they actually operate](#3-the-playbook--how-they-actually-operate)
4. [Hard constants (verified, do not re-litigate)](#4-hard-constants-verified-do-not-re-litigate)
5. [Complete migrated-coin dataset](#5-complete-migrated-coin-dataset)
6. [Entry-timing tables (the money data)](#6-entry-timing-tables-the-money-data)
7. [Hypotheses tested — what died and what survived](#7-hypotheses-tested--what-died-and-what-survived)
8. [Known wallets](#8-known-wallets)
9. [Methodology — how to reproduce this](#9-methodology--how-to-reproduce-this)
10. [Analysis traps I fell into](#10-analysis-traps-i-fell-into-do-not-repeat)
11. [Open questions / next work](#11-open-questions--next-work)

---

## 1. Operator profile — who this is for

**Who:** Solana memecoin trader. Trades Pump.fun tokens **after** they migrate to
PumpSwap. Not a bonding-curve sniper (currently).

**Strategy history:**
- **Before:** these scam groups used to migrate **one** coin per session. That coin
  was near-guaranteed to get pushed. Buying right after migration was reliably
  profitable.
- **Now:** they migrate **multiple** coins per session (observed: 2, 4, 5, and in one
  case 20 launches with 2 migrations). Only one gets pushed. Which one is not
  obvious at migration time.
- **Result:** the old "buy at migration" edge broke. Operator is losing on trades
  and is afraid to enter because they cannot tell which coin is the real one.

**The operator's core question:**
> "Which coin are they going to push, and can I know before they dump it to zero?"

**Operator's own working hypothesis (tested — see §7):** if real outsider traders
accumulate too much supply during the bonding curve, the scammers abandon that coin
(because those outsiders could dump on them at the top) and launch another one until
they get a coin where they control most of the supply. **This was NOT supported by
the data.**

**Operator's independent observation that proved correct:** dev-sell timing is not a
reliable signal, because a dev can hold tokens back rather than pace their selling.
They were right — see §7.

**Operator's second correct challenge:** post-migration there is often an instant
spike from snipers, then insiders sell seconds later and it drops *below* the
migration price. This forced a rebuild of the entry analysis — see §6.

**Tooling context:**
- Building a Next.js/TypeScript + Neon Postgres + Helius dashboard (this repo).
- Has a tagged-wallet database with ~24k wallets across 5 labeled crews.
- Trades manually via a mobile terminal (screenshots show a Solana trading app).
- Interested in building a sniper/automation bot (see §11).

---

## 2. The group: identity and infrastructure

### Dev wallets (coin creators) — all 5 confirmed same operation

| # | Dev wallet | Token name | Launches | Migrated | First seen |
|---|---|---|---|---|---|
| 1 | `3HEGr2RhTsGPsapbYXMhMzSX7qF3cHW4DCSKF6JofMH2` | (unnamed set) | 16 | 1 | 2026-08-05 |
| 2 | `F3i1cr6MnAn7Xq6rGN6DRDzLSCqYiy2fbarcTztoKqVP` | MOOBZ / The Mad Bull | 20 | 2 | 2026-08-06 |
| 3 | `7ymbHaQptDPSNvkMFGQdJ2niEsFgUD6GfGiYmb76pjAH` | pochi / pochi | 32 | 5 | 2026-08-06 |
| 4 | `3neM8FZ2nJK1P3MuaQEDQKF5Vs9tXe85dJjbZpyuTuJy` | Mr.POM / MRPOM | 24 | 2 | 2026-08-07 |
| 5 | `3MGGxpGBQDRtjtNpZhk3NQGrmrJRnGTgVzfrNyZuhgxN` | SADDYMIAW | 28 | 4 | 2026-08-09 |
| | **TOTAL** | | **120** | **14** | |

**Migration rate: 14 / 120 = 11.7%.** The overwhelming majority of launches die on
the bonding curve and never reach PumpSwap.

Notes:
- Dev wallets 2, 3, 5 and 4 are tagged `insider` under label `Pochi Bin 30` in the
  database. Dev 1 (`3HEGr2Rh…`) is also tagged. Dev `3MGGxpG…` was **not** in
  `tagged_wallets` at time of analysis (only in `coin_stats.dev_address`).
- Each dev wallet is used for **one burst session** then goes silent. `F3i1cr6M…`
  launched all 20 coins in a **34-minute window** and had zero activity for the
  following 3 days.

### Cluster labels in the database

| Label | Wallet count |
|---|---|
| `JINPACHI BIN 20` | 16,538 |
| `Baojin Mex 35` | 3,344 |
| `Pochi Bin 30` | 2,188 |
| `ChubbyDog Bin 20` | 1,548 |
| `Pochi` | 496 |
| `JINPACHI BIN 20 (Parent)` | 2 |
| `ChubbyDog Bin 20 (Parent)` | 1 |
| `Pochi Bin 30 (Parent)` | 1 |
| **Total tagged wallets** | **24,142** |

**Important finding:** `Pochi Bin 30` and `ChubbyDog Bin 20` wallets were observed
**dumping the same coins together**, in the same transactions windows. These "bins"
are **not separate operations** — they are either shared wallet pools or the same
entity running multiple labeled campaigns. Do not treat the labels as clean
organisational boundaries.

Cluster parent wallet (from `tagged_wallets.cluster_parent`):
`4jPuZwEba1Zw7GgCD24akuDDJxvTBux4unDpnUq6AHgr` (labeled `Pochi Bin 30 (Parent)`)

### Naming tactic

All coins in a single session share **one identical name and symbol**:
- `3MGGxpG…` → 4 migrated coins, all named **SADDYMIAW / SADDYMIAW**
- `7ymbHaQ…` → 5 migrated coins, all named **pochi / pochi**
- `F3i1cr6M…` → all 20 launches named **The Mad Bull / MOOBZ**
- `3neM8FZ…` → 2 migrated coins, both named **Mr.POM / MRPOM**

This is deliberate: a trader searching the name sees several charts and cannot tell
which contract is the live one. Always verify by **mint address**, never by name.

---

## 3. The playbook — how they actually operate

### Phase 0 — Mass launch

Dev wallet creates many tokens back-to-back in a short window (observed: 16-32
launches per dev, 20 in 34 minutes for MOOBZ). Every single launch is identical in
setup (see §4).

### Phase 1 — Bonding curve (pre-migration)

This is the phase the operator asked to understand in depth. Measured across all 14
migrated coins:

| Metric | Min | **Median** | Max |
|---|---|---|---|
| Unique wallets involved | 39 | **58** | 89 |
| Successful (real) transactions | 49 | **90** | 231 |
| Median individual buy size | 0.049 SOL | **0.099 SOL** | 2.011 SOL |
| Tagged (known) wallets involved | 16 | **27** | 38 |
| Untagged wallets involved | 18 | **28** | 51 |
| Failed transaction attempts | 766 | **1,673** | 3,204 |

**Key characteristics:**

- **~58 wallets and ~90 real trades** take a coin from creation to migration. That is
  the entire pre-migration population. It is small and enumerable.
- **Buys are tiny and irregular** — median 0.099 SOL, typical range 0.02–0.35 SOL.
  This matches the operator's description exactly ("random amounts, 0.something,
  1 or 2 SOL").
- **94.1% of all bonding-curve signature attempts are FAILED transactions.** These
  are sniper bots spamming buys that revert. Raw signature counts (800-3,300) are
  meaningless — only ~90 succeed. **Always filter on `err === null`.**
- Roughly **half** of participating wallets are already in the tagged DB.

### Phase 2 — Migration

At exactly 85 real SOL in the curve, the bonding curve completes. Pump.fun drains it
and opens a PumpSwap AMM pool. Migration always happens at the same market cap
(§4).

The opening transaction on the new pool is the **liquidity deposit**:
**84.99 SOL + 206,900,000 tokens**, priced at exactly **1.00x migration mcap**.

### Phase 3 — The opening seconds (critical, this is where the operator trades)

Observed pattern, most clearly on `JURozE3j`:

1. **+0s** — liquidity deposit lands (84.99 SOL / 206.9M tokens @ 1.00x).
2. **+1s to +4s** — swarm of ~15 micro-buys, 0.02–0.15 SOL each, many from tagged
   `Pochi Bin 30` wallets. Price barely moves (1.06–1.12x).
3. **Same wallets immediately sell the identical amounts.** Verified examples on
   `JURozE3j`: `AHbGnU8GG…` bought 157,133 tokens at +1s and sold exactly 157,133 at
   +3s. `8WQwXBsuk…` bought 173,435 at +1s, sold 173,435 at +3s. Same for
   `7afxeuesD…` and `4F6oG8vyw…`.
   **This is a wash-trading loop to paint volume/candles on the chart in the opening
   seconds.** It is not real demand.
4. **+5s onward** — if they intend to push: buy sizes jump 20-50x (0.07 SOL → 1.2-3.2
   SOL), overwhelmingly from tagged wallets. Price starts climbing.

On `Ae6xjLPm` the same structure appears but slower — the cluster accumulated at
~1.0x for a full minute (price even dipped to 0.83x at +45s) before pushing.

### Phase 4 — The push (only on the chosen coin)

Sustained buying by the tagged cluster walks the price up. Duration varies wildly:
- `JURozE3j`: peak at **+36 seconds**
- `Ae6xjLPm`: peak at **+16.9 minutes**
- `RNc9b5qK`: peak at **+49.6 minutes**
- `6ZHyei7C`: peak at **+24 hours**

### Phase 5 — The dump

Coordinated multi-wallet selling. On the losers this lands within **0.5–12 minutes**
of migration. Observed on `FrB7DYNd`: five different wallets dumping 20-35M tokens
each **in the same second** — a Jito-bundle-style exit.

**Terminal outcome: every single one of the 14 coins went to near-zero.** Not most.
All of them. Current market caps sit at $1.4K–$3.6K against peaks of $35K–$8.3M.

### Phase 6 — Post-mortem fake volume

Dead coins continue to show **hundreds to thousands** of post-migration transactions
for days. The losers show far more post-migration activity than the winner. This is
the micro-dump/wash bot continuing to fake life on a coin that is already finished.

---

## 4. Hard constants (verified, do not re-litigate)

These were checked across all 120 launches. They are bot configuration, **not
signals**. Do not waste analysis time on them again.

| Constant | Value | Notes |
|---|---|---|
| **Dev creation buy** | **354,710,743.773 tokens** | Exactly 35.47% of supply. **Identical on all 120 launches**, pushed and dumped alike, across all 5 devs, to the decimal. |
| **Total supply** | 1,000,000,000 | Standard pump.fun. |
| **Migration threshold** | **85 real SOL** | Pump.fun protocol constant. |
| **Migration market cap** | **410.8 SOL ≈ $31,336** | At SOL = $76.28. Derived: virtual SOL 30→115, virtual tokens 1.073e9 → 1.073e9×30/115 = 279,913,043. Price = 115/279.913M SOL/token → 410.8 SOL FDV. **Every coin migrates at this exact mcap.** |
| **Migration liquidity deposit** | 84.99 SOL + 206,900,000 tokens | The opening pool transaction. |
| **Starting mcap (untouched curve)** | 30.00 virtual SOL ≈ $2,137 | A dead coin sitting at exactly 30.00 vSOL never had net buying. |
| **Migration destination** | **PumpSwap AMM** | Not Raydium. |
| **Pump.fun program ID** | `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P` | |
| **Bonding curve PDA seed** | `["bonding-curve", mint]` | |

**Dev sell behaviour:** on every coin analysed, the dev eventually sold **100%** of
their 354.7M allocation. Whether they sold fast or slow does **not** predict outcome
(see §7).

---

## 5. Complete migrated-coin dataset

All 14 coins that completed the bonding curve, ordered by migration time.

| # | Migrated (UTC) | Dev | Mint | Peak MC | xMig |
|---|---|---|---|---|---|
| 1 | 2026-08-05 03:27 | NEW `3HEGr2Rh` | `RNc9b5qKEskGFmdGkNrja36oF6XSLsB4SsDPih1pump` | $777,707 | x24.82 |
| 2 | 2026-08-06 03:25 | MOOBZ `F3i1cr6M` | `JURozE3jr69rQ4fQaiztisfVrqjwAqmwq1PV3N4pump` | $74,327 | x2.37 |
| 3 | 2026-08-06 03:33 | MOOBZ `F3i1cr6M` | `Ae6xjLPmJ3D645KhEpdqD9ZtViWfccPR7UjwXymYpump` | $237,703 | x7.59 |
| 4 | 2026-08-06 04:28 | pochi `7ymbHaQ` | `HUms3YvHw9T8nBYgPbm2SnECxUPumd6WXhSWpeiupump` | $74,240 | x2.37 |
| 5 | 2026-08-06 04:40 | pochi `7ymbHaQ` | `FrB7DYNdYotZdtKaxEGPCdrhuFWhxPQ8R8RkLYGmpump` | $35,942 | x1.15 |
| 6 | 2026-08-06 04:52 | pochi `7ymbHaQ` | `8JbeD4LMSaeR8QV2DwR7MyJkZkKHNXYEUqRhVuytpump` | $92,968 | x2.97 |
| 7 | 2026-08-06 05:46 | pochi `7ymbHaQ` | `H7je14YC4CHKPUo9d9MjMq26s7cH1eSYYwTnX9hqpump` | $61,013 | x1.95 |
| 8 | 2026-08-06 05:55 | pochi `7ymbHaQ` | `7WEhHGxXQugsZTGkpgtdbWmQJMEtfGMhiVabqx4ypump` | $143,776 | x4.59 |
| 9 | 2026-08-07 03:41 | MRPOM `3neM8FZ` | `8xLm1tkgpmfpMfCebDmZ24hvS5CDS6mHVVLJFbEGpump` | $60,977 | x1.95 |
| 10 | 2026-08-07 05:38 | MRPOM `3neM8FZ` | `6ZHyei7C4yZrJvsQeBHRDGD7HXpA28sWsTuY2rnUpump` | **$8,316,967** | **x265** |
| 11 | 2026-08-09 02:44 | SADDY `3MGGxpG` | `CAk67vpYBZthKSTtCp1CF2Wnjyw6ySqr9jquAK4Jpump` | $119,613 | x3.82 |
| 12 | 2026-08-09 03:26 | SADDY `3MGGxpG` | `DLkoJmwGvBqX4qaY2L5TyhyfGEWHoFpq2BUg6ssspump` | $35,345 | x1.13 |
| 13 | 2026-08-09 03:41 | SADDY `3MGGxpG` | `4VdqrtZiH8EAX9oe5wEpYmu14ursgYYfLGRCU5bypump` | $89,111 | x2.84 |
| 14 | 2026-08-09 03:56 | SADDY `3MGGxpG` | `4cGwREM4fM6QFVz5z6Xj7cjM1hShqxFgEaVrTTA5pump` | $226,854 | x7.24 |

### Pre-migration composition per coin

`ins%` / `out%` = share of supply held at migration by tagged vs untagged wallets.

| Mint | Wallets | tagged/untagged | ins% | out% | real txs | failed sigs |
|---|---|---|---|---|---|---|
| `6ZHyei7C` | 63 | 25/38 | 34.4 | 65.6 | 103 | 1,945 |
| `RNc9b5qK` | 42 | 16/26 | 26.3 | 73.7 | 60 | 766 |
| `Ae6xjLPm` | 59 | 32/27 | 62.6 | 37.4 | 132 | 1,802 |
| `4cGwREM4` | 55 | 26/29 | 35.6 | 64.4 | 125 | 2,001 |
| `7WEhHGxX` | 45 | 25/20 | 76.9 | 23.1 | 74 | 1,890 |
| `CAk67vpY` | 60 | 30/30 | 30.3 | 69.7 | 90 | 1,330 |
| `8JbeD4LM` | 70 | 33/37 | 63.7 | 36.3 | 136 | 1,986 |
| `4VdqrtZi` | 39 | 21/18 | 32.4 | 67.6 | 49 | — |
| `HUms3YvH` | 47 | 19/28 | 58.4 | 41.6 | 56 | 1,519 |
| `JURozE3j` | 70 | 30/40 | 63.6 | 36.4 | 128 | 909 |
| `8xLm1tkg` | 58 | 33/25 | 36.2 | 63.8 | 86 | 1,087 |
| `H7je14YC` | 51 | 23/28 | 71.8 | 28.2 | 74 | 1,673 |
| `FrB7DYNd` | 53 | 27/26 | 62.6 | 37.4 | 82 | 3,204 |
| `DLkoJmwG` | 89 | 38/51 | 38.8 | 61.2 | 231 | 1,385 |

**Note the outlier:** `DLkoJmwG` had the most of everything — 89 wallets, 231 real
txs, 164 buys, 67 sells — and was the **worst performer (x1.13)**. Heaviest
pre-migration churn produced the worst result. Single data point, but it inverts the
naive "activity = health" assumption.

---

## 6. Entry-timing tables (the money data)

**All prices as a multiple of the $31,336 migration mcap.**
Timestamps measured from **true PumpSwap pool open**, not from the last bonding-curve
transaction (see §10 for why this distinction destroyed an earlier analysis).

| Coin | 0s | 3s | 5s | 15s | 1m | 2m | 5m | **Peak** |
|---|---|---|---|---|---|---|---|---|
| `RNc9b5qK` | 1.11x | 1.16x | 1.17x | 1.14x | 1.59x | 1.90x | 2.84x | **24.82x** |
| `Ae6xjLPm` | 1.00x | 1.06x | 1.07x | 1.15x | 1.29x | 2.76x | 3.57x | **7.59x** |
| `4cGwREM4` | 1.00x | 1.01x | 0.99x | 2.25x | 2.64x | 2.75x | 2.57x | **7.24x** |
| `7WEhHGxX` | 1.17x | 1.07x | 1.03x | 1.89x | 2.46x | 2.53x | 3.07x | **4.59x** |
| `CAk67vpY` | 0.98x | 1.03x | 1.03x | 1.00x | 1.66x | 1.95x | 1.38x | **3.82x** |
| `8JbeD4LM` | 1.00x | 1.07x | 1.03x | 1.67x | 2.70x | 2.42x | 1.54x | **2.97x** |
| `4VdqrtZi` | 1.41x | 1.20x | 1.16x | 1.11x | 1.52x | 1.72x | 1.93x | **2.84x** |
| `JURozE3j` | 1.06x | 1.09x | 1.14x | 1.66x | 1.91x | 0.97x | 0.19x | **2.37x** |
| `HUms3YvH` | 1.00x | 1.09x | 1.13x | 0.76x | 0.71x | 0.78x | 0.93x | **2.37x** |
| `8xLm1tkg` | 1.10x | 1.08x | 1.08x | 1.06x | 1.82x | 0.67x | 0.37x | **1.95x** |
| `H7je14YC` | 1.15x | 0.99x | 0.99x | 1.24x | 1.49x | 0.97x | 0.65x | **1.95x** |
| `FrB7DYNd` | 1.00x | 1.09x | 1.11x | 0.95x | 0.40x | 0.10x | 0.19x | **1.15x** |
| `DLkoJmwG` | 1.00x | 1.06x | 1.06x | 0.92x | 0.67x | 0.49x | 0.10x | **1.13x** |
| `6ZHyei7C` | *(truncated — unreliable)* | | | | | | | **265x** |

### Aggregate (13 coins, `6ZHyei7C` excluded — fetch truncation)

| Entry | Median entry price | Median upside to peak | ≥2x | ≥3x |
|---|---|---|---|---|
| **0s** | **1.00x** | **x2.37** | 9/13 | 5/13 |
| 3s | 1.07x | x2.38 | 9/13 | 5/13 |
| 5s | 1.07x | x2.45 | 9/13 | 5/13 |
| 15s | 1.14x | x2.43 | 7/13 | 5/13 |
| 1m | 1.59x | x1.88 | 6/13 | 3/13 |
| 2m | 1.72x | x2.43 | 9/13 | 3/13 |
| 5m | 1.38x | x2.82 | 10/13 | 6/13 |

### What this means practically

1. **There is no snipe premium at the open.** Median entry at 0s is **exactly 1.00x**
   migration mcap. 7 of 13 coins print the identical $31,334 opening tick. You can
   get in at the migration price.
2. **The 0–5 second window is flat** (1.00x → 1.07x → 1.07x). You have ~5 seconds of
   grace, not milliseconds. Waiting 5 seconds costs ~7%.
3. **+15s is the decision point.** By then coins have diverged hard — `4cGwREM4` is
   already at 2.25x while `HUms3YvH` has fallen to 0.76x.
4. **By 1 minute the median entry has risen to 1.59x** for less remaining upside
   (x1.88 vs x2.37).
5. **Every coin eventually goes to near-zero.** Entry at 0s and holding = −94% to
   −99% on all of them.
6. **Peak timing is wildly variable**: +36s, +10min, +17min, +50min, +24h. 11 of 14
   peaked within 10 minutes of migration.

**The trade is: enter near 1.00x within ~5 seconds, and exit on a rule. The exit is
where the money is made or lost, not the entry.**

---

## 7. Hypotheses tested — what died and what survived

### DEAD — dev sell timing / cadence

Original theory: they pace the dev's selling slower on the coin they intend to push.

**Falsified twice.**
- MRPOM `8xLm1tkg` (dumped, $61K peak) and `6ZHyei7C` (pumped, $8.3M peak) had
  **near-identical** dev dumps: same 354.7M allocation, 100% sold, ~7-minute window,
  starting minutes apart.
- pochi `8JbeD4LM` dumped its **entire allocation in a single transaction** (0-minute
  window) and still reached $90.9K — beating two coins with slower multi-minute dumps.

The operator called this one correctly before the data confirmed it.

### DEAD — outsider ownership at migration (operator's hypothesis)

Theory: if outsiders hold too much supply pre-migration, they abandon the coin.

**Not supported.**
- Overall Spearman rho = **+0.297** — pointing the *wrong* way (more outsider
  ownership correlated with slightly *better* performance).
- Within-dev test (the fair test, holding dev constant): **1 of 4 devs supports it.**
  pochi supports; SADDYMIAW, MRPOM, MOOBZ all contradict.
- The two biggest winners had the *highest* outsider share: `6ZHyei7C` (65.6%
  outsider, x265) and `RNc9b5qK` (73.7% outsider, x24.8).
- MRPOM's two coins had outsider shares of 65.6% vs 63.8% — nearly identical — and
  outcomes of x265 vs x1.95. The metric does not separate them.

### DEAD — cluster accumulation post-migration

Theory (from the MRPOM case): the cluster pours coordinated buy volume into the coin
they choose, and that identifies it.

Held for MRPOM `6ZHyei7C` (cluster held 78% at snapshot, later exited to 0%) but
**failed to replicate** on the pochi dev's 5 coins, where cluster presence was
statistically indistinguishable across winner and losers (0.18%–0.90% residual).

### SUSPECT — curve duration (creation → migration)

**This was the strongest signal found (Spearman rho = +0.468, best of 9 metrics),
and the long-curve rule looked clean: 3/3 long-curve coins were their dev's #1
performer, median x7.58 vs x2.37.**

**BUT the underlying timestamps were wrong.** Curve duration was computed as
`last bonding-curve signature − creation`. The bonding-curve account keeps receiving
trailing dust and failed sniper transactions long after migration, so this
overstates duration.

Verified example: `Ae6xjLPm` was reported as a **31.9-minute** curve. Its PumpSwap
pool was actually created at 03:33:45, 57 seconds after token creation at 03:32:48.
**True curve duration: 57 seconds, not 31.9 minutes.**

**Status: the curve-duration signal must be recomputed using pool-creation time
before it can be trusted or traded on.** This is the single most important
outstanding task.

### SURVIVED — the database has real predictive wallets, but is incomplete

Cross-referencing every wallet involved in large post-migration dumps on two MOOBZ
coins: **189 of 239 wallets (79%) were already in the tagged DB.** Strong
confirmation the tagging works.

**But:** of 175 "untagged" wallets across the 14 coins, only 105 (60%) traded exactly
one coin. **45 untagged wallets traded 3 or more of the 14.** Two traded **13 of 14**.
Those are scammer wallets that are not tagged, and they inflate every "outsider"
metric. See §8.

### SURVIVED — structural facts

- Migration rate 11.7%.
- 94.1% of bonding-curve signatures are failed sniper spam.
- Migration mcap and dev allocation are constants.
- Opening-seconds wash-trade loop (buy X, sell exactly X seconds later).
- All 14 coins terminate at near-zero.

---

## 8. Known wallets

### Repeat cluster wallets — appear across multiple coins, already tagged

| Wallet | Notes |
|---|---|
| `95L1q614PkUfbE4E4tpQKnot4H6SzGXiFP8XUdn4WCi3` | Top-20 holder on **all 4** SADDYMIAW coins |
| `HPfdvzbBUy2SrvLGi6kovLcnXC5Fm2t7459ifbVFB7wQ` | Top-20 holder on **all 4** SADDYMIAW coins |
| `4F6oG8vywS3LpxWCb2ARvWUwnur4JhewxALN3b5dxpo6` | 2/4 SADDYMIAW; wash-loop participant on `JURozE3j` |
| `7afxeuesDifWSJf2keqrqBYnHTa2iuq4DbmteErPCAMU` | 2/4 SADDYMIAW; wash-loop participant on `JURozE3j` |
| `ARu4n5mFdZogZAravu7CcizaojWnS6oqka37gdLT5SZn` | Executes large dumps on **both** winner and loser coins |
| `8WQwXBsukXebf74xrj4MmJPYBd…` | Confirmed wash loop: bought 173,435 @ +1s, sold 173,435 @ +3s |
| `AHbGnU8GGYJ5wCV5TGQmPcQyNN…` | Confirmed wash loop: bought 157,133 @ +1s, sold 157,133 @ +3s |
| `7UUw58fJJVf2yfA9ce1WGdc3QE…` | Three separate buys within 1 second at `Ae6xjLPm` open |
| `4jPuZwEba1Zw7GgCD24akuDDJxvTBux4unDpnUq6AHgr` | `Pochi Bin 30 (Parent)` |

### UNTAGGED wallets that should be tagged — high priority

These are **not** in `tagged_wallets` but traded many of the 14 coins. A genuine
outsider trades ~1. These are near-certainly operation wallets.

| Wallet | # of 14 coins traded |
|---|---|
| `LfEcaUf77iEhnz6gFpLqYgDb5Uk6Ekc5n69wu7Qa9Uw` | **13** |
| `56S29mZ3wqvw8hATuUUFqKhGcSGYFASRRFNT38W8q7G3` | **13** |
| `Fu4mHhkAVy6q34ZYEpERunvjNY6TUxhEZRE7ob4VFyjU` | 12 |
| `Fk6NwGEPkePFjJojkjGoR6b7aA5mzwhmsSgc1wP8opgV` | 10 |
| `3CzmEkbSuRXe2Sm7o8Hov5LoBFjAbvLDeSmSRjDzvn2S` | 9 |
| `6wfADqFbBR1jU46qBGGyPusKCR8Lwx5hFvgm4NhFH2Zu` | 9 |
| `EPKU6sxtDRuhcLuR5dZgULvXoizXgUBsBFF3bpxMc5nb` | 9 |
| `CCtzSZ59M79UpcaEhN8e3pAWuYYtqeQWy2SvQ3T5KTvZ` | 9 |
| `996Je21CJTp2oex1rBJEg8s22Uak7drGYvbF8TSywzcG` | 8 |
| `9N2CgWrC2NUPv9AcnrQr4YrTQ5eNK59ojUnThBBpk4fa` | 8 |
| `4zcoCWgnHFDfyuxiuMQaxU9dHAm2iXprY6QqGEGShMir` | 8 |
| `APTiNxN8b66Jfi9gUafihRHGoL4eDiAtkwYJy8G6y37v` | 8 |

*(33 more untagged wallets traded 3-7 of the 14; full list recoverable by re-running
the cross-coin overlap script — see §9.)*

### Known PumpSwap pools

| Mint | Pool |
|---|---|
| `Ae6xjLPm…` | `EnwztersKTUBMdXeRYtbvQSeFNvH1wdgSXrEh5tP1iLh` |
| `JURozE3j…` | `HdmL3Voc3SPj6ZDfPbEMHLTdhgBCNri7QiWBLKzrCaPx` |
| `4cGwREM4…` | `Bz4f9GE4Znuw1rHRPDkdWUX9jaZuBETjPiP69MYLjxdm` |

---

## 9. Methodology — how to reproduce this

### Data sources

- **Helius mainnet RPC** — `https://mainnet.helius-rpc.com/?api-key=<KEY>`
  (free tier: 1M credits, 10 RPS)
- **Helius Enhanced Transactions API** —
  `https://api.helius.xyz/v0/addresses/<addr>/transactions?api-key=<KEY>`
  Returns parsed `tokenTransfers` / `nativeTransfers`. Paginate with `&before=<sig>`.
- **Helius batch parse** — `POST https://api.helius.xyz/v0/transactions` with
  `{transactions: [sig, ...]}` (max 100 per call). **Essential** for reaching the
  oldest history of a busy account.
- **DexScreener** — `https://api.dexscreener.com/latest/dex/tokens/<mint>`
  Gives `pairAddress` and **`pairCreatedAt`** (authoritative pool-open timestamp).
  Note: purges dead/small tokens, so it is not always available.
- **Neon Postgres** — `tagged_wallets` and `coin_stats` tables.
  *(Credentials live in `.env.local`, which is git-ignored. Never commit them.)*

### Step-by-step

1. **Discover launches:** fetch dev wallet's enhanced transactions, filter
   `type === 'CREATE'`. The `tokenTransfers` entry to the dev gives mint + initial
   allocation.
2. **Determine migration status:** derive bonding curve PDA
   (`["bonding-curve", mint]` under the pump.fun program), `getAccountInfo`, decode.
   Layout after the 8-byte discriminator, all `u64` LE:
   `virtualTokenReserves, virtualSolReserves, realTokenReserves, realSolReserves,`
   `tokenTotalSupply`, then `u8 complete`.
   **`complete === true` means migrated.**
3. **Find the pool:** DexScreener `pairAddress`, or fall back to the owner of the
   largest token account (post-migration the pool holds 90-99% of supply).
4. **Get true migration time:** DexScreener `pairCreatedAt`, or the **oldest
   signature on the pool account**. **Do NOT use the last bonding-curve signature.**
5. **Reconstruct pre-migration activity:** `getSignaturesForAddress` on the bonding
   curve PDA gives every pre-migration trade attempt. Filter `err === null`
   (94% are failures). Parse via the batch endpoint.
6. **Reconstruct price:** for each pool transaction, pair the token transfer amount
   with the WSOL transfer amount in the same transaction:
   `price = solAmount / tokenAmount`, `mcap = price × 1e9 × solUsd`.
   **Filter out dust prints (`tokenAmount < 1000`)** — tiny trades produce garbage
   prices.
7. **Validate:** reconstructed peaks matched `coin_stats.max_market_cap_usd` on 10 of
   11 known coins within a few percent (e.g. `4cGwREM4` reconstructed $226,854 vs
   recorded $226,108 — 0.3% error).

### Rate-limit handling

Free tier is 10 RPS. Every loop needs 429 backoff (`1200ms × attempt`) plus a
~120-150ms inter-request delay. CoinGecko will also rate-limit; pin a fallback SOL
price rather than letting `null` propagate into the maths.

---

## 10. Analysis traps I fell into (do not repeat)

Recording these because each one produced a **confidently wrong conclusion** that
had to be retracted.

1. **Used last bonding-curve signature as migration time.** The curve keeps receiving
   dust and failed txs after migration. This inflated curve durations (`Ae6xjLPm`:
   reported 31.9 min, actual 57 s) and shifted entry-price measurement 20+ seconds
   late, making entries look far more inflated than they are.
   **Fix: use pool creation time.**

2. **Mistook failed sniper spam for wash trading.** Saw 700–3,300 signatures on dead
   coins and called it manufactured volume. 94% were **failed transactions**.
   **Fix: always filter `err === null`.**

3. **Read current state as "never pumped."** Checked two MOOBZ coins, saw both
   crashed, and concluded neither was pushed. `Ae6xjLPm` had actually run to $237K.
   **Fix: reconstruct the peak; never infer history from current state.**

4. **Pagination truncation on high-volume coins.** The address endpoint returns
   newest-first; with a page cap you never reach the true open on a busy pool.
   `6ZHyei7C` has 13,000+ pool signatures and its "first tradable price" of 56-69x was
   simply the oldest page I could reach. **Fix: page `getSignaturesForAddress` to the
   very beginning, then batch-parse the oldest signatures.**

5. **Quoted multiples from an unbuyable price.** Reported x265 and x24.8 measured from
   the $31.3K migration mcap without checking whether that price was actually
   obtainable. (It turned out it *was* obtainable — but that was luck, not rigour.)

6. **Silently swallowed an RPC error.** A transient failure marked `4cGwREM4`
   (a known $226K winner) as non-migrated and dropped it from the dataset.
   **Fix: never let a caught exception leave a field `undefined` without logging.**

7. **Confounded cluster identity with coin identity.** `insider %` mostly measures
   *which dev* (pochi's coins are all 58-77%, SADDYMIAW's all 30-39%), not which coin
   gets pushed. **Fix: always run within-dev comparisons, not just pooled ones.**

8. **Treated `untagged` as `outsider`.** 40% of untagged wallets traded 3+ of the 14
   coins. Every outsider-share number is contaminated.

---

## 11. Open questions / next work

### Immediate — must do before trading on any of this

- [ ] **Recompute curve duration for all 14 coins using pool-creation time**, then
      re-test whether the long-curve signal survives. It was the headline finding and
      it is currently unverified.
- [ ] **Resolve `6ZHyei7C`'s true pool open** (page its 13k+ signatures fully) and get
      its real entry price. It is the x265 outlier that dominates every aggregate.
- [ ] **Tag the 45 repeat "untagged" wallets** into `tagged_wallets`, then re-run the
      outsider-share analysis on clean data.

### Tooling

- [ ] **Exit automation** — highest value. Rule candidates from this data: sell at
      x2, or at +60s, whichever comes first. Would have been profitable on 9/13 coins
      and would have avoided every −95% hold. Build with paper-trade mode first.
- [ ] **Migration watcher** — detect PumpSwap pool creation for the 5 known dev
      wallets / tagged cluster, alert within ~1-2s. `logsSubscribe` on the pump.fun
      migration program is sufficient and free-tier viable.
- [ ] **Entry bot** — lower priority. Entry speed is worth ~7%; exit discipline is
      worth ~200%.
- [ ] Wire the live dashboard signals: cluster-wallet density in the opening seconds,
      time-since-pool-open, distance from 1.00x migration mcap.

### Research

- [ ] Do `JINPACHI BIN 20` (16,538 wallets) and `Baojin Mex 35` (3,344) share wallets
      with `Pochi Bin 30` / `ChubbyDog Bin 20`? If the bins overlap, the label
      taxonomy needs rebuilding.
- [ ] **Fund-source tracing:** who funds the "outsider" wallets on a winning coin? If
      they trace back to the same operation, outsider-share metrics are measuring the
      scammers' own laundered buy pressure. This was identified as necessary and
      never executed.
- [ ] Is the opening-seconds wash loop (buy X, sell exactly X) present on *every*
      coin, or only ones they intend to push? If it discriminates, it is a
      sub-10-second live signal — potentially the most valuable finding available.
- [ ] Bonding-curve-phase trading: the operator currently only trades post-migration.
      Pre-migration buys fill at 0.02-0.35 SOL with real price impact and no snipe
      competition. Worth modelling.

### Sample-size caveat

**n = 14 migrated coins from 5 dev wallets over 5 days.** One coin (`6ZHyei7C`,
x265) dominates every average. Medians are more honest than means throughout this
document. Treat every correlation here as a hypothesis for forward-testing, not an
established edge.

---

*Last updated: 2026-08-09. Next: repeat this analysis for the next scam group.*
