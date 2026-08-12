# Soltracker

Two tools against organised Pump.fun / PumpSwap scam groups, in one phone-first
web app:

1. **Migration Check** — pick the scam group, paste a freshly migrated
   contract, get a **buy / skip / unknown** verdict from that group's
   specific on-chain rules.
2. **Holder tracker** — the scanner from
   [Tool-Memecoin](https://github.com/Jaloliddinnn/Tool-Memecoin), ported
   whole: live holder table, insider/outsider tagging against 24k labelled
   wallets, dev profiler, wallet history, top traders, and time travel to any
   past moment.

Everything works on a phone (bottom tab bar, bottom sheets) and on a laptop
(top nav, two-column layouts).

## Why the group has to be picked by hand

The three groups tracked so far do not share a playbook, so no single rule set
covers them. The rules live in `src/lib/signals/groups.ts` and come from the
dossiers in [`docs/`](docs/) — each one is a full on-chain writeup of a group's
money flow, wallet fleet, bot fingerprints, and per-coin outcomes.

| Group | Funding | The rule in one line |
| --- | --- | --- |
| **JINPACHI Bin 20** | Binance, 20 SOL/dev | A bot buys a hardcoded ~50 SOL in the migration block, so every coin opens at ~$80k. You can never buy the floor. |
| **Baojin Mex 35** | MEXC, ~35 SOL/dev | Entry is gated on a retention window, not on the open. |
| **Pochi Bin 30** | Binance, 30 SOL/dev | Documented, **not tradeable** — see below. |

### Pochi is deliberately marked "do not trade"

The dossier's headline "10 of 13 coins reached ≥1.95x" is **peak-based** and
unreachable in practice. Backtesting realistic exits — fixed multiples,
timed exits, trailing stops — every strategy lost money (best x0.98; trailing
stops went 6 for 6 losers). The group is kept in the app for wallet
attribution, not for entries.

**The exit problem is unsolved for all three groups.** The rules say when an
entry is *not* obviously doomed. They do not tell you when to sell.

## What each screen does

| Screen | Path | What it is |
| --- | --- | --- |
| **Signal** | `/` | Group picker + contract input → verdict, with the hard-skip rules for the selected group listed underneath. |
| **Holders** | `/scan` | Holder table with insider/outsider/LP tagging, group hit counts, dev profiler, top traders, time travel. |
| **Saved** | `/coins` | Coins you've snapshotted, with your `pumped` / `dumped` / `pump_and_dump` outcome labels. |
| **Wallets** | `/tags` | The 24k tagged wallets: search, filter by group, bulk add, JSON import/export. |

## Architecture

```
Next.js 14 App Router (TS, Tailwind) — no ORM, no client-side DB access
        │
        ├── /api/signal              group rules → buy / skip / unknown
        ├── /api/scan                live holder scan
        └── /api/tracker/
              ├── tags, tags/list    wallet tags (read, write, paged export)
              ├── coins              saved coin snapshots
              ├── groups             cluster labels + wallet counts
              ├── dev                dev profiler (pump.fun launch history)
              ├── wallet             per-wallet trade history and PnL
              ├── top-traders        biggest winners/losers on a mint
              └── timetravel         holder state at an arbitrary past time
        │
@neondatabase/serverless (HTTP) ── Neon Postgres
Helius (RPC + Enhanced Transactions) ── Solana mainnet
```

Two tables, both pre-existing and shared with the original tool:
`tagged_wallets` (~24k rows, `address` is the PK — one tag per wallet
globally) and `coin_stats` (one row per tracked launch, including the curated
`outcome` ground truth). `wallet_group` on a coin joins to
`tagged_wallets.label` **by string value**, not by a foreign key — if tagging
conventions drift, a lookup silently returns "no history" instead of matching.

### Credentials are server-side only

The original tool read `VITE_NEON_DATABASE_URL` in the browser, which shipped
full read/write database credentials to anyone who opened the page. In this
port nothing under `src/lib/tracker/` is importable from a client component;
every read and write goes through an `/api` route.

## Time travel

`src/lib/tracker/historicalScanner.ts` reconstructs holder state at a past
timestamp by **reverse replay**: anchor on live DAS holdings, replay the
window `(targetSlot, now]`, and take the earliest `preTokenBalance` seen for
each touched account. It never crawls signature history from genesis, and it
throws rather than quietly degrading to live data — a snapshot that silently
became "now" is worse than a visible failure.

Rate limiting is adaptive. Helius meters by credit rather than by a clean
requests-per-second ceiling, and a `getTransaction` sweep burns credits far
faster than the advertised rate suggests, so the limiter halves itself on
every 429 and creeps back up after 30 seconds of clean traffic. A deep rewind
on a busy pool gets slow, not broken. `TRACKER_RPS` raises the ceiling for a
paid key.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in DATABASE_URL and HELIUS_API_KEY
npm run dev
```

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | Neon **pooled** connection string. The app talks to Neon over HTTP, so it works where a raw TCP connection to 5432 would not. |
| `HELIUS_API_KEY` | yes | RPC + Enhanced Transactions. |
| `HELIUS_RPC_URL` | no | Defaults to `https://mainnet.helius-rpc.com`. |
| `TRACKER_RPS` | no | Starting request rate for historical scans (default 5). Raise it on a paid key. |

Deployed on Railway; `main` auto-deploys. Nixpacks already runs `npm ci`, so
`railway.json` must **not** set a `buildCommand` — a second `npm ci` fails
with `EBUSY` trying to remove the mounted `node_modules/.cache` volume.

## Known limits

- **Exits are not modelled.** See above. This is the biggest open risk.
- **Busy pools get sampled.** Past a density cap the engine samples one buy in
  N and says so. A "no signal" verdict on a sampled pool is not conclusive,
  and the UI returns `UNKNOWN` rather than a confident skip.
- **Dev-buy share is unverified.** The on-chain read disagreed with ground
  truth badly enough (0.27% vs a true 40.85%) that it was pulled out of the
  verdict. It is displayed, labelled unverified, and not scored.
- **Wallet history and top traders are capped** at a bounded number of parsed
  transactions and report `truncated: true` when they hit it, rather than
  looping through thousands of signatures.
