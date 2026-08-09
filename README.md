# Memecoin Holder Tracker & Anti-Scam Dashboard

Tracks Pump.fun/PumpSwap token holders in real time, lets you tag wallets
as `INSIDER` / `OUTSIDER` / `MEV_BOT`, and — because scammer teams reuse the
same wallet cluster across many launches for weeks at a time — scores each
new launch against that cluster's actual historical track record: do they
usually run coins up, or drain almost all of them to zero.

## Why this exists

Pump.fun scammers rarely rug the instant a coin bonds. The typical pattern:

1. **Block 0 domination** — creator buys 30-50%+ of supply immediately via
   heavy Jito tips / priority fees.
2. **Micro-dumping** — a bot sells 3-4M tokens every 10-15s straight into
   the bonding curve, faking healthy volume to lure outside buyers. Rent is
   recycled via a tight `create account -> swap -> close account` loop.
3. **1-second mass dump** — once enough outsider SOL has accumulated, the
   remaining supply dumps across dozens of wallets in a single Jito bundle.
4. **Wallet recycling** — the same wallet cluster runs this playbook across
   dozens of tokens over ~a month.
5. **Migration** — at 100% bonding, the token migrates to **PumpSwap AMM**
   (not Raydium); some clusters keep running the coin up post-migration,
   most don't.

The open question this tool is built to answer: **for a specific cluster,
which of their (often same-day, same-name) duplicate launches are they
actually going to run up, and which are just bait?**

## Architecture

```
Next.js (App Router, TS) ── React dashboard ── Tailwind
        │
        ├── /api/holders     live or historical holder table (Helius)
        ├── /api/tag         wallet tag read/write (Neon via Prisma)
        ├── /api/tokens      tracked token lifecycle
        └── /api/clusters/:id  cluster pump/dump track record
        │
Prisma ORM ── Neon (serverless Postgres)
        │
Helius API (RPC + enhanced tx) ── Solana mainnet
```

### Database schema (`prisma/schema.prisma`)

| Table              | Purpose                                                                 |
| ------------------ | ------------------------------------------------------------------------ |
| `tagged_wallets`    | Your manual `[Insider]/[Outsider]/[MEV/Bot]` tags. Matches the original spec 1:1, plus an optional `cluster_id`. |
| `wallet_clusters`   | Groups of wallets believed to be run by the same team — the unit the dump-risk scoring actually operates on. |
| `tokens`            | Every mint scanned: creator, cluster, bonding/migration slots, peak market cap, `launch_cohort_key` for same-day duplicate-name launches. |
| `holder_snapshots`  | Point-in-time holder captures — doubles as the Time-Travel mode cache and the time series behind outsider-inflow trend detection. |
| `dump_events`       | Detected coordinated multi-wallet sells — ground truth for cluster track records. |

> **You mentioned you already have a Neon DB with 20k+ scammer wallets
> grouped into clusters.** This schema is my best guess at what that needs
> to look like structurally — before your first migration, run
> `npm run db:introspect` (`prisma db pull`) against your real
> `DATABASE_URL` to pull your actual table/column names in, then reconcile
> them against `prisma/schema.prisma` (probably just renames/type tweaks).
> Every app file reads through the Prisma model names defined there, so a
> rename is a one-file fix.

## Detection design: how risk scoring works

`src/lib/analysis/dumpRisk.ts` computes a transparent, weighted 0-100 score
from five signals (see file for exact weights/logic):

1. **Cluster pump rate** — % of this cluster's past launches that ever
   cleared a peak-market-cap bar (`PUMP_THRESHOLD_USD`, default $100k) —
   your strongest signal, since you confirmed they recycle wallets.
2. **Insider concentration** — tagged insiders still holding a large %
   post-migration means the move is entirely theirs to make.
3. **Outsider inflow trend** — comparing `holder_snapshots` over time: is
   real external SOL accelerating or flatlining? Flatlining after initial
   hype tends to precede an exit.
4. **Rent-reclaim loop cadence** — the micro-dump bot's
   `create → swap → close` loop has a steady rhythm; it going quiet often
   precedes the coordinated exit (playbook step 3 → step 4 transition).
   *(Sampling this loop's live state isn't wired up yet — it needs a
   slot-by-slot instruction-pattern watcher, which is the natural next
   build after this scaffold. The signal slot exists; the sampler doesn't.)*
5. **Concurrent multi-wallet sells** — multiple cluster-tagged wallets
   selling within the same slot is the closest thing to a live alarm this
   stack can raise (within ~1 confirmed slot, not pre-execution — the exact
   pre-bundle second needs mempool/bundle simulation access this stack
   doesn't have on Helius's free tier).

This is deliberately rule-based and auditable rather than a black box.
Once `dump_events` accumulates enough labeled real outcomes, that's the
point to swap in a learned model behind the same `assessDumpRisk()`
interface without touching any callers.

### Known gaps (honest, not hidden)

- **Post-migration (PumpSwap) market cap**: `src/lib/solana/pumpswap.ts` is
  a stub. Bonding-curve market cap (`pumpfun.ts`) is fully implemented
  against the documented reserve layout; PumpSwap's pool layout needs to be
  confirmed (program ID + account layout) before it's safe to decode —
  wrong offsets would silently produce a plausible-but-wrong number, which
  is worse than a visible gap for a scam-detection tool.
- **Historical mode accuracy**: per the spec's strict rule, we don't crawl
  signature history. We binary-search timestamp→slot (`lib/solana/slot.ts`)
  and reconstruct balances from one bounded page of Helius's parsed
  enhanced-transactions API within a configurable window
  (`HISTORICAL_WINDOW_MINUTES`, default 15). That's fast and free-tier
  friendly, but a wallet's pre-window balance won't be captured — genuinely
  archive-grade snapshots need a paid archive RPC node (`getAccountInfo` at
  an exact past slot).
- **Rent-loop sampler**: signal slot exists in `dumpRisk.ts`
  (`rentLoopActiveNow` option) but nothing populates it yet — needs a
  recent-transaction-pattern watcher for the target mint.
- **Wallet clustering**: nothing here auto-clusters wallets yet; it reads
  whatever `cluster_id` you've already assigned (your existing 20k-wallet
  dataset, once reconciled) or set manually via `/api/tag`.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in DATABASE_URL, HELIUS_API_KEY — never commit this file
npm run db:introspect        # pull your existing Neon schema, reconcile against prisma/schema.prisma
npm run db:generate
npm run dev
```

Free-tier constraints this app is built around: Helius 1M credits/mo,
10 requests/sec — the holder fetch is a fixed small number of RPC calls per
scan (no unbounded loops), and historical mode is bounded by
`HISTORICAL_WINDOW_MINUTES` for the same reason.
