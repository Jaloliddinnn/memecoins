# Memecoin Holder Tracker & Anti-Scam Dashboard

Tracks Pump.fun/PumpSwap token holders in real time, lets you tag wallets
as `insider` / `outsider` / `mev_bot`, and — because scammer teams reuse the
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
        ├── /api/holders          live or historical holder table (Helius)
        ├── /api/tag              wallet tag read/write (Neon via Prisma)
        ├── /api/tokens           tracked launch lifecycle (coin_stats)
        └── /api/clusters/:label  cluster pump/dump track record
        │
Prisma ORM ── Neon (serverless Postgres)
        │
Helius API (RPC + enhanced tx) ── Solana mainnet
```

### Database schema (`prisma/schema.prisma`)

This mirrors your **real, already-populated** Neon tables (not a fresh
design) — introspected directly and copied read-only into this project's
database:

| Table              | Rows (as of copy) | Purpose                                                                 |
| ------------------ | ------------------ | ----------------------------------------------------------------------- |
| `tagged_wallets`    | 24,142              | Your manual `[Insider]/[Outsider]/[MEV/Bot]` tags. `address` is the PK — one tag per wallet, globally, matching how you've been tagging. `label` and `cluster_parent` are how wallets get grouped into a scammer team's cluster. |
| `coin_stats`        | 32                   | One row per tracked launch, including your curated **`outcome`** ground truth (`dumped` / `pumped` / `pump_and_dump`), precomputed insider/outsider %, peak market cap, duration, and `wallet_group` (the cluster's human label — joins to `tagged_wallets.label` by value, e.g. both saying "Pochi Bin 30"). |
| `holder_snapshots`  | new, empty at scaffold time | The one genuinely new table: point-in-time holder captures, populated as you scan. Backs the Time-Travel mode cache and the outsider-inflow trend signal. Not FK'd to the other two tables (a freshly-scanned wallet/mint usually isn't tagged/logged yet). |

An earlier pass of this scaffold guessed at a 5-table design
(`wallet_clusters`, `tokens`, `dump_events`, etc.) before your real schema
was available — that guess has been thrown out. Everything above matches
what's actually in Neon.

## Detection design: how risk scoring works

`src/lib/analysis/dumpRisk.ts` computes a transparent, weighted 0-100 score
from five signals (see file for exact weights/logic):

1. **Cluster pump rate** — of this cluster's past `coin_stats` launches
   (matched by `wallet_group` == the holder's `tagged_wallets.label`), what
   fraction ever had `outcome` of `pumped` or `pump_and_dump` vs. straight
   `dumped`. This uses your curated ground truth directly rather than a
   guessed market-cap threshold — your strongest signal, since you
   confirmed they recycle wallets.
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
   build after this scaffold. The signal slot exists as an opt-in flag
   `rentLoopActiveNow`; the sampler doesn't.)*
5. **Concurrent multi-wallet sells** — multiple cluster-tagged wallets
   selling within the same slot is the closest thing to a live alarm this
   stack can raise. Also an opt-in flag (`concurrentClusterSellDetected`)
   for the same reason — your production data has no dump-event log to
   query yet.

This is deliberately rule-based and auditable rather than a black box.
Once `coin_stats.outcome` accumulates more labeled launches, that's the
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
- **Rent-loop sampler & concurrent-sell detector**: both are opt-in flags
  in `assessDumpRisk()` with no live feed behind them yet — needs a
  recent-transaction-pattern watcher for the target mint/cluster.
- **`wallet_group` ↔ `label` join is a string match, not a real FK** — if
  tagging conventions ever drift (casing, spacing, renamed clusters), the
  cluster track record lookup silently returns "no history" instead of
  matching. Worth normalizing if you start relying on this heavily.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in DATABASE_URL, HELIUS_API_KEY — never commit this file
npm run db:generate
npm run dev
```

The schema already matches your real Neon tables (see above), so
`db:generate` is normally all you need. If your source tables change shape
later, `npm run db:introspect` (`prisma db pull`) will re-pull them.

Free-tier constraints this app is built around: Helius 1M credits/mo,
10 requests/sec — the holder fetch is a fixed small number of RPC calls per
scan (no unbounded loops), and historical mode is bounded by
`HISTORICAL_WINDOW_MINUTES` for the same reason.

### Data migration note

The `tagged_wallets` (24,142 rows) and `coin_stats` (32 rows) data was
copied read-only from an existing Neon project into this one's
`DATABASE_URL`, verified with matching row counts, distinct-key counts, and
a numeric checksum on both sides post-copy. The source project was never
modified. Note: this sandboxed dev environment blocks raw TCP (Postgres
wire protocol on port 5432) outbound — only HTTPS is allowed — so the
migration and schema introspection used Neon's HTTP query driver
(`@neondatabase/serverless`) instead of `psql`/`pg_dump`. Standard Prisma
(`@prisma/client`, raw TCP) is what the app itself uses at runtime — that
needs normal outbound network access, which any real dev machine or
deployment target (Vercel, etc.) has.
