# Building the 2 SOL coat-tail sniper — what it actually takes

*Research + on-chain measurement, 2026-09-07. Read section 2 before spending any money.*

---

## 1. The good news: the launch is telegraphed

You already track the ~20 SOL stacker wallets. It turns out the group tells you a launch is
coming **before the coin exists**. Traced on `AK5CZgxC…` (ANONWIFHAT) and verified on four
more coins:

| When | What happens | Observable? |
| --- | --- | --- |
| **T − 7.9 min** | Dev wallet funded ~6.2 SOL from Binance `5tzFkiKs…` | ✅ |
| **T − 6.8 min** | **Four fresh stacker wallets** created, funded **0.995 SOL each from Binance, in the same second** | ✅ |
| **T − 20s to T − 5 min** | Each stacker receives **~24.00 SOL** (native + wrapped) from a **single-use** relay wallet | ✅ |
| **T − 0** | Coin created; the four fire ~20 SOL each; the curve completes; the sniper appends 2.05 SOL | — |

Measured warning windows across five coins:

| Coin | 1 SOL seeding | 24 SOL war chest |
| --- | --- | --- |
| `AK5CZgxC` (ANONWIFHAT) | T−405s | T−309s |
| `4ARfNELr` | T−76s to T−82s | **T−20s to T−27s** |
| `7ZiuVbZ6` | T−172s to T−179s | T−135s to T−148s |
| `3EKyGKhN` | T−1978s (33 min) | single funding |
| `hvbN1SER` | reused wallets (60 lifetime txs) | — |

**The 24 SOL war chest is the trigger.** Four wallets each receiving ~24 SOL within seconds
of each other has no innocent explanation, and the tightest gap observed is still 20 seconds.
Some stacker sets are reused across coins (60 lifetime transactions) — those are the ones you
already have.

Every one of these funding events is a plain transfer you can watch for **free**. This part
is real, it is yours, and most snipers do not have it because they have not identified the
group.

---

## 2. The bad news: the trade is slot 0 or nothing

I measured the median trade price by **slot** (400ms each) after pool genesis, across 10 of
his coins:

| Slot | ms after genesis | Median market cap | vs his entry |
| --- | --- | --- | --- |
| **+0** | 0ms | **$43,018** | — |
| **+1** | 400ms | $46,933 | **+13.5%** |
| +2 | 800ms | $48,103 | +11.5% |
| +3 | 1200ms | $49,661 | +21.5% |
| +5 | 2000ms | $49,032 | +13.6% |

**One slot late costs you 13.5% of an 18% move.** His median gain is +17.9%; round-trip
friction is ~5%. Enter at slot +1 and you have roughly 4% of edge against 5% of cost —
**structurally negative before you place a single trade.**

This is the whole feasibility question, and it kills the cheap path:

> A standard Yellowstone gRPC subscription delivers the block **after it is built**. You
> fire in slot +1 at the earliest. At slot +1 you are not sniping — you are the exit
> liquidity for the people who were in slot 0.

**Paying a higher fee does not fix this.** Priority fee decides ordering *among transactions
the leader already has*. If your transaction reaches the leader after the block is packed,
no fee gets you in. The binding constraint is **arrival time**, not price.

---

## 3. What he is almost certainly doing

You cannot react to the 20 SOL buys — they are in the same block as the create. But you can
do the thing that makes that race winnable:

1. **Pre-identify the four stacker wallets** from the funding signal (§1). Now you are not
   watching all of pump.fun; you are watching four specific addresses.
2. **Subscribe to those four addresses on a pre-block feed.** When one of them submits a buy,
   the transaction carries the mint address. That is your first sight of the coin.
3. **Fire immediately into the same slot** through a low-latency relay.

This explains why he is *always* ordered 5th–7th, right behind them, and never 2nd or 3rd:
he is reacting to them inside the slot, not predicting them.

His measured stack: his own deployed program `4RoVsR9z…` (one instruction, ATA pre-created),
**Nozomi** (186 buys) and **Astralane** (19), ~0.045 SOL priority fee, ~0.025 SOL tip.
**25% of his transactions still fail.** Others in the same cohort fail 59% and 92% of the time.

---

## 4. Infrastructure, with 2026 prices

### The pre-block feed — this is the hard part right now

**Jito ShredStream shut down on 5 September 2026** — two days ago. That was the standard
50–200ms pre-block feed. Current options:

| Option | Notes | Price |
| --- | --- | --- |
| **DoubleZero Edge** | Jito's own recommended migration path; free trial | varies |
| **OrbitFlare shreds** | 9 regions, 60-min free trial | **$500/mo** standard region, **$1,000/mo** premium |
| Run your own validator/shred receiver | Full control, real ops burden | node cost + time |

### Post-block feeds — cheap, and **not sufficient** for this trade (see §2)

| Provider | Price |
| --- | --- |
| Chainstack Yellowstone gRPC | from **$49/mo** (1 stream) |
| rpc edge Trader | from **$249/mo** |
| Shyft | $199 / $349 / $649 |
| Helius LaserStream | **$499/mo** — note: *not* Yellowstone-compatible, own SDK and wire format |
| Dedicated gRPC node | **$1,800–2,200/mo** |

### Transaction submission relays

| Relay | Notes |
| --- | --- |
| **Nozomi** (Temporal) | What he uses for 186 of 205 buys. Sub-ms regional latency claimed, 5 regions. |
| **Astralane** | His secondary route (19 buys). |
| **bloXroute** | Minimum tip **0.001 SOL** to a public tipping wallet. |
| 0slot / Jito bundles | Alternatives; Jito bundles also give MEV protection. |

Send to **two or three relays simultaneously** — that is why his transactions carry tips to
several accounts.

### Language

Rust for the executor. Every serious open-source implementation is Rust + Yellowstone gRPC:
[keidev-sol/Solana-Sniper-Rust-Bot](https://github.com/keidev-sol/Solana-Sniper-Rust-Bot)
(claims 0–1 block, Jito/Nozomi/ZeroSlot),
[coffellas-cto](https://github.com/coffellas-cto/Solana-Pumpfun-Pumpswap-Raydium-Copy-Sniper-Trading-Bot)
(wallet-monitoring copy trading),
[bogardt/sniper-bot-solana-grpc](https://github.com/bogardt/sniper-bot-solana-grpc).
Read them for the transaction construction; do not trust them with keys.

---

## 5. The staged plan — do not skip a stage

### Stage 1 — the pre-launch alarm (free, build it now)

Watch for the §1 funding signature: **≥3 fresh wallets each receiving 20–26 SOL within
60 seconds of each other**, plus outflows from Binance `5tzFkiKs…` to brand-new wallets.
Emit the four stacker addresses and start a countdown.

No money at risk. Success criterion: **it fires before ≥80% of the group's launches, with
≥20 seconds of warning.** If it does not, nothing downstream can work.

### Stage 2 — paper trading (~$49–249/mo)

Cheap Yellowstone gRPC. Subscribe to the four stacker addresses. When one buys, log:
the slot you *would* have fired in, and the market cap you *would* have paid.

Success criterion: **you would have landed in slot 0 on ≥40% of attempts.** Stage 2 tells
you the truth for ~$50 instead of finding out with real money. Expect to fail this on a
post-block feed — §2 predicts you land in slot +1. **If you consistently land in slot +1,
stop here. The math says you lose.**

### Stage 3 — shred feed + real execution ($500–1,000/mo + node)

Only if Stage 2 lands slot 0. Rust executor, pre-created ATAs, one-instruction buy, dual
relay submission, 2 SOL fixed size, hard 30-second exit.

### Stage 4 — size discipline

**Never go above 2 SOL.** From his own record: 2 SOL wins 89.5% at 12.89% ROI; 5 SOL wins
60.7% at 7.35%, and all eight of his worst trades were 5 SOL. Bigger buys move a
seconds-old pool against you.

---

## 6. Honest economics

He nets **+29 SOL (~$3,000) on a good 24 hours**, cycling ~147 SOL across 77 buys at 2.05
SOL each, with a 25% transaction failure rate. Call it $300–1,000/day.

Against that: **$1,500–3,000/month** of infrastructure before a single trade, plus the
0.045 SOL priority fee and 0.025 SOL tip on **every attempt including the failures**.

At his hit rate the business works comfortably. At half his hit rate it still works. At
slot +1 it loses money no matter how well you run it. **That single variable — which slot
you land in — is the entire business**, and Stage 2 measures it for the price of a coffee
subscription.

Two things you should not talk yourself out of:

- **You are late to this trade, not early.** There is already a cohort of at least five
  wallets doing exactly this on the same coins, and the best of them (`41Lur83…C3od`) has
  a *zero* failure rate. You are competing with them, not with the scammers.
- **The scammers can change the pattern the day they notice.** Fresh wallets, different
  amounts, a different funding path — the §1 signal is behavioural, not structural.

The part of this that is durable and cheap is Stage 1. Build that first regardless of
whether you ever build the sniper, because it is also the best pre-launch alarm you could
have for the trading you already do.

---

**Sources:** [RPC Fast — competitive sniper stack](https://rpcfast.com/blog/complete-stack-competitive-solana-sniper-bots) ·
[RPC Fast — sniping pump.fun 2026](https://rpcfast.com/blog/how-to-launches-snipe-pump) ·
[Jito ShredStream docs](https://docs.jito.wtf/lowlatencytxnfeed/) ·
[OrbitFlare — ShredStream shutdown migration](https://orbitflare.com/blog/developers/jito-shredstream-shutdown-migration-guide) ·
[Chainstack Yellowstone gRPC](https://chainstack.com/marketplace/yellowstone-grpc-geyser-plugin/) ·
[Helius pricing](https://www.helius.dev/pricing) ·
[bloXroute tipping](https://docs.bloxroute.com/solana/trader-api/introduction/tip-and-tipping-addresses) ·
[Nozomi](https://dashboard.nozomi.temporal.xyz/) ·
[Astralane](https://astralane.io/)
