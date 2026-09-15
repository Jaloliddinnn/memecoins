# Work order 1 — fix the fallback, shrink the transaction

**Context:** this follows your own diagnostic report of 2026-09-15. All
file:line references below are yours. Nothing here contradicts that report
except where explicitly marked.

**Do these four in order. Do not start the on-chain program. Do not move the
server.** Those are later work orders.

---

## Settled since your report — you can stop treating these as UNKNOWN

**1. Program IDs cannot be resolved from a lookup table.** Confirmed empirically
against both winners' live transactions:

```
6A59APPs: 14 static keys | instruction programIdIndex = [9, 10, 10, 13]
LfEcaUf7: 13 static keys | instruction programIdIndex = [7, 8, 8, 9]
```

No index reaches the lookup range. Your caveat in H3 was correct and your
~790 / ~650 byte estimates already assume it. **Build against that assumption —
no test cycle needed.**

**2. `6A59APPs` does run its own program.** The wallet
`6A59APPsPXCBbMZJsAKfMSf1tiXnYFxWM4Ho3b78dAeP` is a plain System account — you
were right — but the program it *calls* is real:

```
ESQHZej9SVn8fmXZQvB3h7f2Pp2qLT2iwP82KD1CCLig   executable, BPFLoaderUpgradeable
QECRnxRggfBRxE65mtJ7q7gCLQTMwQ1ZdUWUNEg2yZi    executable, BPFLoaderUpgradeable
```

Both cheap winners are own-program operators. G2's conclusion needs that
amendment.

---

## TASK 1 — Give the pool leg its own trigger (highest value)

**The problem, from your E1:** the pool buy fires when we observe someone else's
PumpSwap buy and clone it. We are therefore structurally behind whoever we copy.
Measured: their buy at position 891, ours at 1149.

**The fix:** fire the pool leg from our own derivation at detection time, on the
same trigger as the curve leg. Never wait for another wallet.

You already have everything needed — your Appendix derives all 26 PumpSwap
accounts from the mint alone, verified against two coins and simulated with
`err: null`.

**Requirements:**

1. On a target-buy detection, build and sign **both** transactions:
   - curve buy (pump.fun), as today
   - pool buy (PumpSwap `BuyExactQuoteIn`), from your own derivation
2. Send **both immediately**, in parallel, through the existing `broadcast()`
   fan-out.
3. **Delete the `armed` / observe-a-competitor path entirely.** It cannot be
   made fast; it is the defect.
4. `creator` comes from the bonding-curve account
   (`PDA["bonding-curve", mint]`, bytes 49..81). If that read is on the hot
   path, cache it or take it from the create instruction in the same shred
   batch — say in your reply which you chose and why.

**Two corrections to your Section E recommendations:**

- **Do not halve the size on each leg.** At the moment we detect the stack, the
  PumpSwap pool usually does not exist yet — migration comes later. The pool leg
  will simply fail cheaply most of the time, and will only land in exactly the
  case we currently lose. Fire both at full size.
- **Do not use the durable nonce.** You correctly noted it serialises the two
  legs. That is disqualifying here.

**Acceptance:** on a live launch, log both legs sent from one detection, with
the delta between them under 2ms. No transaction we send may reference another
wallet's observed pool buy.

---

## TASK 2 — Address lookup table

**Now:** `src/build.rs:220` uses `Transaction::new_with_payer` — a legacy
transaction with no ALT field.

1. Switch to `VersionedTransaction` with
   `v0::Message::try_compile(payer, &ixs, &[alt], blockhash)`.
2. **Phase 1 — today:** reference the public table
   `AnV2JwqW4rR5ZmAcmHzeBs3rZR8hbfchW8SEP9kfzAzF`. Verified not deactivated,
   36 entries, covers 12 of the 17 constants. No ownership required.
3. **Phase 2 — this week:** create our own table with all 16 constants from
   your C2 inventory, including the 4 fee accounts and our 2 ATAs that the
   public table lacks. Then stop depending on someone else's account.

**Acceptance:** print `bincode::serialize(&tx).len()` in `selftest`. Phase 1
must land under **800 bytes**; phase 2 under **700**.

---

## TASK 3 — Pre-fund the wSOL account

Instructions 3, 4 and 5 (`ATA create`, `System transfer`, `SyncNative`) exist
only because `wsol_already_funded` is false at `src/build.rs:209`.

Create and fund the wSOL ATA once, out of band. Keep a top-up path, but never
on the hot path.

**Acceptance:** top-level instruction count drops from 8 to 5, and `selftest`
confirms the byte reduction.

---

## TASK 4 — Stop overpaying on compute units

Measured actual usage from your C7: **curve 93,712 CU, pool 116,990 CU**.
Configured limit: **140,000**. Priority fee is charged on the *requested*
limit, so the curve path overpays by roughly a third.

Set per-path limits with ~10% headroom: **curve 105,000, pool 130,000.**

**Acceptance:** same `CU_PRICE_MICROLAMPORTS`, measurably lower fee per attempt
on the curve path.

---

## TASK 5 — Instrumentation (do this alongside, not after)

From your B2/B3, ~30 lines.

1. Capture `Instant::now()` in the `udp.rs` receive loop and thread it through
   the callback. Yes, this means a third parameter on the closure — do it.
2. Log `t0→t1→t2→t3→t4` per launch.
3. Replace the self-referential slot metric at `main.rs:460`. As you noted, it
   compares the shred stream against itself and prints 0 even when uniformly
   late. Log our shred-arrival wall clock against the RPC-reported block time
   for that slot instead.

**Acceptance:** one real log line showing all five timestamps and the honest
slot delta.

---

## Out of scope for this work order

- The on-chain program (later; 3–5 days, 2–4 SOL)
- Moving the server (later; note Hetzner has **no Frankfurt region** — nearest
  are Nuremberg/Falkenstein, ~5ms to Frankfurt, not ~1ms)
- Matching on the hardcoded stack amounts (coverage win, not a latency win)

---

## Report back with

1. Byte count before and after, from `selftest`.
2. Instruction count before and after.
3. Where `creator` is now read from, and whether it touches the hot path.
4. One live-launch log line showing both legs sent from a single detection.
5. Anything in Task 1 that turned out harder than this order assumes.

**One more thing worth flagging from your own numbers:** your relay accept times
were fra-sender 80.7ms, ams-sender 64.0ms, **plain RPC 44.3ms**. The unpaid path
beat both paid ones. That is not part of this work order, but measure it again
once instrumentation lands.
