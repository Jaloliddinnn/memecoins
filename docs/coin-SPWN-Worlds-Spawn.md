# SPWN "Worlds Spawn" — `SPWNfybn8bjGuwMSgVX5BSvEmnFyHeoyc1Mdhx4bSf1`

*On-chain analysis, 2026-09-07.*

## Verdict

**Dead coin, 25 days old, and a Pochi Bin 30 failure.** Nothing to trade. It never
migrated, it died 20 hours after launch, and the only wallet that made real money was
the dev.

## The facts

| | |
| --- | --- |
| Name / symbol | Worlds Spawn / SPWN |
| Token program | **Token-2022** (`TokenzQdBNb…`), not classic SPL |
| Supply | 1,000,000,000 (6 decimals) |
| Mint authority | `null` ✅ |
| Freeze authority | `null` ✅ |
| Created | **2026-08-13 02:00:20 UTC** |
| Last activity | **2026-08-13 22:21:22 UTC** |
| Lifespan | **20.4 hours** |
| Migrated to PumpSwap | **Never** — died on the bonding curve |
| Peak market cap | **1,162.5 SOL ≈ $122k** at +43.6 minutes |
| Total signatures | 1,770 — of which **1,531 failed (86.5%)** |
| Unique traders | **44** (14 profitable, 30 losers) |

86.5% of all transactions on this coin failed. That is a bot war over a pool that
never had real volume behind it — 44 wallets in total, ever.

## The dev's whole life, in seven transactions

`4eT8gevfN4f1fujf5cpmqbFBQD7WYs3n79ceUyVMQZvq` — 7 transactions, 3h36m alive, now
holding **0.000 SOL**.

| Time (UTC) | Action | SOL |
| --- | --- | --- |
| 01:44:24 | Funded from `5tzFkiKscXHK…` | **+29.999** |
| 02:00:20 | Creates SPWN **and buys 299,844,384 tokens — 30% of supply** | −11.792 |
| 02:59:26 | Dumps (16 min after the $122k peak) | **+21.594** |
| 05:17:07 | Sells the dust | +0.307 |
| 05:19:25 | Closes token account, reclaims rent | +0.442 |
| 05:20:14 | Sends everything to `DGRyMRyS6TMX…`, wallet dies | **−40.550** |

**Dev profit: 40.55 out − 30.00 in = +10.55 SOL** — and he is the #1 winner on his own
coin by a factor of two over the next-best wallet.

Note the collection wallet `DGRyMRyS6TMX2imrR3R9F7VbkfsWvBwPcxzci58Vvt8m` also appears in
the loser list at **−2.04 SOL over 2 trades**. That is not a bad trade; it is the cost of
manufacturing buy pressure.

## Group attribution

`5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9`, which funded the dev with **29.999 SOL**,
is tagged in the database as `insider / Pochi Bin 30`.

The **29.999 SOL** is the real signature — it matches Pochi's documented 30 SOL-per-dev
funding exactly, and the dev created the coin **16 minutes later**.

> ⚠️ **But see the data-quality warning below.** `5tzFkiKs…` is Binance's Solana hot
> wallet, not a scam paymaster. The attribution here rests on the exact 29.999 SOL amount
> and the 16-minute gap, not on the tag.

## Data-quality warning: exchange hot wallets are tagged as insiders

Five exchange hot wallets are currently tagged `insider` in `tagged_wallets`:

| Exchange | Address | Current tag |
| --- | --- | --- |
| **Binance** | `5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9` | insider / Pochi Bin 30 |
| **Coinbase** | `H8sMJSCQxfKiFTCfDR3DUMLPwcRbM61LGFJ8N4dK3WjS` | insider / Pochi Bin 30 |
| **Coinbase** | `GJRs4FwHtemZ5ZE9x3FNvJ8TMwitKTh21yxdRPqn7npE` | insider / Pochi Bin 30 |
| **Kraken** | `AobVSwdW9BbpMdJvTqeCN4hPAmh4rHm7vwLnQ5ATSyrS` | insider / Pochi Bin 30 |
| **MEXC** | `ASTyfSima4LLAdDgoFGkgqoKowG1LZFDr9fAQrg7iaJZ` | insider / Baojin Mex 35 |

Binance's wallet holds **1,801,772 SOL (~$189M)** and pushes a withdrawal roughly every
3 seconds at random sizes. It is not a group wallet.

**Why this matters:** every wallet that has ever withdrawn from Binance, Coinbase, Kraken
or MEXC now looks one hop from a "known insider". Any funding-trace that lands on one of
these should read as *"funded from an exchange"*, never as *"same group"*. These five rows
should be relabelled `lp`/`exchange` or excluded from cluster attribution — otherwise
insider percentages and group hit-counts read higher than the evidence supports.
