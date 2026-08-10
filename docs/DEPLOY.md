# Deploying Migration Check

The app is a standard Next.js 14 App Router project. It needs three environment
variables and no build-time database access.

## Environment variables

| Variable | Where it comes from |
|---|---|
| `DATABASE_URL` | Neon → your project → Connection string → **Pooled**. Must end in `?sslmode=require`. |
| `HELIUS_API_KEY` | Helius dashboard → API keys |
| `HELIUS_RPC_URL` | `https://mainnet.helius-rpc.com` |

`DIRECT_URL` and `HISTORICAL_WINDOW_MINUTES` are only used by the older
`/dashboard` view and Prisma migrations — the signal tool does not need them.

---

## Railway (recommended)

Railway is the better host for this app because the analysis can take 15–40
seconds on a busy pool and Railway does not cap request duration.

1. railway.app → **New Project** → **Deploy from GitHub repo** → pick this repo
2. Set the branch to the one you want to deploy
3. **Variables** → add `DATABASE_URL`, `HELIUS_API_KEY`, `HELIUS_RPC_URL`
4. **Settings → Networking → Generate Domain**

`railway.json` already pins the build and start commands, so nothing else is
needed.

---

## Vercel

1. vercel.com → **Add New → Project** → import this repo
2. Framework preset: **Next.js** (auto-detected)
3. Add the three environment variables under **Environment Variables**
4. Deploy

### ⚠ Timeout caveat

Analysing a pool takes **2–20 seconds normally, up to ~40 on a very busy pool**.
`vercel.json` requests `maxDuration: 60` for the signal route, but the ceiling
your account actually gets depends on your plan — on the free tier a long
analysis can be cut off mid-request and you will see a network error in the app.

If that happens, either deploy on Railway instead or upgrade the Vercel plan.
The app itself is identical on both.

---

## Add it to your iPhone home screen

The app is built mobile-first for a 390pt-wide screen (iPhone 13 Pro) and
declares the iOS web-app meta tags, so it runs full-screen without Safari
chrome:

1. Open the deployed URL in **Safari**
2. Tap **Share** → **Add to Home Screen**
3. Open it from the icon — no address bar, respects the notch and home indicator

---

## Local development

```bash
cp .env.example .env.local   # then fill in the three values
npm install
npm run dev                  # http://localhost:3000
```

Production build check:

```bash
npm run build && npm run start
```

## Health check

```bash
curl -X POST http://localhost:3000/api/signal \
  -H 'Content-Type: application/json' \
  -d '{"mint":"Sa8vzg3oSmXzMKZQXpAgzMqGdFW6NukDh2R9pFmpump","group":"jinpachi"}'
```

Expected: `verdict: "SKIP"`, `retention: 0.859`, `blockZeroSol: 50.39`. Those
values are the ones recorded for that coin in the backtest, so if they come back
different the chain data path has broken.
