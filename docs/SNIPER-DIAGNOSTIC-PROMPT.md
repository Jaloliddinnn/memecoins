# Diagnostic interrogation — Solana sniper bot (v2)

**Paste this to your coding agent. It answers; it does not change code yet.**

---

## Rules for you, the agent

1. **Every answer needs evidence**: file path + line number, the actual value,
   or real log output. Not "yes, that's handled."
2. **"UNKNOWN" is an acceptable answer** — say what you'd run to find out. A
   confident wrong answer here costs real money.
3. **Change no code.** Diagnosis only.
4. Where a question asks for a number, give the number.

---

## Part 1 — What the forensics found

Ten launches of the same scam-group pattern were read block by block. This is
measured, not guessed.

**Our wallet:** `G5KYKCEz7pzm4LJV18WWCgrr9XryStaR6fJhn8XWRqjo`

### How these launches work

1. Dev creates the coin.
2. **In the same block**, four wallets buy ~20 SOL each and consume
   **98–99.7%** of the bonding curve.
3. Whatever is left — typically **11–15M tokens** — is the entire prize, and it
   fits about **two to three buyers**.
4. Migration to PumpSwap follows, sometimes within the same slot.

Three gates decide a snipe:

- **Gate 1 — admission.** Did the packet reach the leader before the block
  closed? Only proximity and connection privilege. **Fees do nothing here.**
- **Gate 2 — ordering.** Among packets the leader holds at that moment, the
  priority fee sorts them.
- **Gate 3 — execution.** The tokens may already be gone. A high fee still fails.

### The transaction-shape finding (the big one)

From a single launch block, every sniper compared side by side:

| Who | Bytes | static+**LUT** | instr | First instruction | Fee | Result |
|---|---|---|---|---|---|---|
| **6A59APPs** | **671** | 14+**17** | **3** | **own program** | 0.00000 | ✅ |
| **LfEcaUf7** | **651** | 13+**14** | **4** | **own program** | 0.00005 | ✅ |
| BkoJZ1Jz | 750 | 15+**17** | 5 | own program | 0.124 | — |
| 9mYrAAmG | 836 | 18+**12** | 6 | ATA program | 0.005 | ✅ swap |
| GKpHrkKk | 963 | 24+**0** | 5 | ATA program | 0.020 | ❌ |
| Wkwy37td | 1043 | 22+**0** | 7 | Token program | 0.130 | ✅ |
| 4sTJsPEw | 1051 | 22+**0** | 7 | Token program | 0.013 | ❌ |
| DFd6A7cm | 1077 | 23+**0** | 7 | Token program | 0.002 | ❌ |
| 9XPMCaxt | 1085 | 23+**0** | 7 | Token program | 0.0003 | ❌ |
| **US** | **1130** | **28+0** | **8** | **setup** | 0.042 | ❌ then ✅ late |

Two clusters, and we are in the wrong one:

- **Winners:** ~650–750 bytes, **lookup tables**, 3–5 instructions, first
  instruction is **their own on-chain program**.
- **Failures:** ~960–1085 bytes, **no lookup tables**, 5–7 instructions, first
  instruction is **account setup done during the race**.

`6A59APPs` touches **31 accounts in 671 bytes**. We touch **28 accounts in 1130
bytes**. More accounts, 40% smaller — because he references a lookup table and
we write every address out in full.

We are also ~100 bytes from the 1232-byte protocol ceiling.

### Fee findings across all ten launches

- Winning fees ranged from **0.000000** to **0.150**.
- `6A59APPs` repeatedly takes large fills paying **~0.00005**.
- `ATQfqM1K` paid **0.022** and failed. `GTd7Yerc` paid **0.124** and received
  **zero tokens**. `Wkwy37td` paid **0.100** and failed by ~6ms.
- **Fee does not correlate with winning.** Arrival does.

### Our specific failure

Coin `7rkfBAGXZsJQZjJv8b1smbV4Tjfh9TC8pHbVeESopump`, block `446058693`:

- We **did** land in the creation block (#752). **Gate 1 passed — our detection
  is not the main problem.**
- Our curve buy failed (Gate 3 — nothing left).
- Our PumpSwap fallback landed **397 positions (~136ms) later**. A competitor's
  equivalent fallback took **13 positions**.
- Fees: **0.084 SOL total to buy 0.053 SOL of token.**

### Infrastructure

- Bot runs on a VPS in **Helsinki**. Shred feed is AllenHark **Frankfurt**.
  That is ~25ms of pointless round trip, roughly **65 block positions**.
- Winners pay near-zero fees, so their edge is **admission**, not price:
  co-location plus a privileged send path (staked/SWQoS or direct TPU).

---

## Part 2 — Questions

### SECTION A — The feed (answer first)

**A1.** What exactly are we connected to for detection? Endpoint URL (redact the
key) and the crate. Is it (a) Yellowstone gRPC — *emits after the block
executes*, (b) raw UDP shreds via a `shredstream-proxy` process, (c) an RPC
websocket, (d) polling?

**A2.** Is a **separate process** running that receives UDP shreds and forwards
to a local port? Give the systemd unit or command line. **If no such process
exists, we are on (a) and slot 0 is impossible.**

**A3.** If gRPC: what `CommitmentLevel` — processed, confirmed, or finalized?
Paste the subscribe request.

**A4.** What triggers a buy? The create instruction? A stacker wallet buying
~20 SOL? Paste the matching code.

**A5.** This group's stack amounts are **hardcoded and identical across
launches** — e.g. `19.711 / 20.689 / 19.663 / 20.699` with a `0.024` dev buy for
one bot, `20.582 / 20.260 / 20.365 / 20.130` with a `0.062` dev buy for another.
Could we match on those exact lamport values to detect a launch with zero false
positives? What would that take?

**A6.** From bytes arriving to having the mint as a usable value — list every
step. Any full-block deserialization, large clones, regex, or allocation in that
path?

---

### SECTION B — Timing instrumentation (nothing else is measurable without this)

**B1.** Do we timestamp any stage today? Paste a real log line from a live
launch.

**B2.** What would it take to log these per launch?
```
t0  first byte received from the feed
t1  mint extracted
t2  transaction built
t3  signed
t4  handed to the sender
```

**B3.** Can we log the **slot the create transaction was in** and compare it to
the slot we were in at `t0`? That single comparison separates "our feed is slow"
from "our send path is slow". How would you get it?

---

### SECTION C — Transaction shape (our measured problem)

**C1.** **We use zero Address Lookup Tables. Why?** Do we have an ALT deployed?
If not, what exactly is needed to create one and reference it?

**C2.** List every account in our buy transaction and mark which are **constant
across all launches** — pump.fun program, global config, fee recipient, PumpSwap
program, Token-2022, ATA program, system program, our wallet, our wSOL account,
our ATAs. Every one of those belongs in the ALT.

**C3.** Our winning transaction had **8 top-level instructions**; the winners
have **3–4**, and their first instruction is their own program rather than
account setup. List ours in order and mark which could be done **before** the
launch — wSOL account, ATAs, anything else.

**C4.** After the ALT and pre-created accounts, **what byte count would our
transaction be?** Give an estimate and how you'd verify it. Target: **under 750**.

**C5.** Where does the blockhash come from? Is `get_latest_blockhash()` called
**anywhere** after detection? Is there a background refresher, and at what
interval?

**C6.** Is the transaction built fresh each time, or is there a **pre-built
template** with only the mint substituted? If fresh, measure how long building
takes.

**C7.** What are the compute-unit limit and price — constants, config, or
computed? Give the values. Is the CU limit tuned to actual usage, or left high?
(Winners use 140k–500k depending on path.)

---

### SECTION D — The send path (Gate 1)

**D1.** How is the signed transaction sent? Exact method and endpoint: normal
RPC, a relay (Jito / Nozomi / BlockRazor / AllenHark 0-Slot), or direct QUIC to
the leader's TPU?

**D2.** Is `skip_preflight` **true**? Paste the config. What is `max_retries`?

**D3.** Do we have a **staked connection / SWQoS** endpoint? Does our provider
plan include one? **This is probably our single biggest gap** — the winners pay
near-zero fees, which means they are buying admission, not ordering.

**D4.** Is the HTTP/QUIC client built **once at startup and reused**, or per
send? Paste the construction.

**D5.** Do we send to more than one endpoint simultaneously? What would parallel
fan-out to 2–3 senders take?

**D6.** Any **blocking** call inside an async context? Is the Tokio runtime ever
stalled by a blocking RPC client?

---

### SECTION E — The fallback (our 397-position loss)

**E1.** When the curve buy fails, what happens? Paste the logic. **Do we wait
for the first transaction's result before sending the PumpSwap one?** If yes,
that is a full confirmation round trip and it is our largest measured loss.

**E2.** What would it take to fire the curve buy and the PumpSwap buy **at the
same instant**, both pre-signed?

**E3.** If both landed we would buy twice. Cost of each option:
 - accept it, halve the size on each leg
 - real size on the PumpSwap leg, token size on the curve leg
 - a **durable nonce** shared by both, so the chain allows only one

**E4.** Do we query on-chain state to decide the venue? That is a round trip on
the hot path — can it be removed?

**E5.** **The winners solve this inside a custom on-chain program**: read the
bonding curve, and if it is exhausted, CPI into PumpSwap instead — all in one
transaction, no second send, no waiting. How hard would that be to build in
Anchor, and what would it cost to deploy? This would eliminate our 397-position
gap entirely.

---

### SECTION F — Infrastructure

**F1.** Confirm VPS region and provider. Run `ping`/`mtr` and give **real
numbers** from it to the AllenHark Frankfurt shred endpoint and to our send
endpoint.

**F2.** CPU model, core pinning, Tokio runtime config. Any lock contention or
channel backpressure in the hot path?

**F3.** Are UDP receive buffers tuned (`net.core.rmem_max`)? Dropped shreds look
like missed launches, not errors. How would we detect drops?

---

### SECTION G — Buy vs build

**G1.** One winner (`Wkwy37td`) uses a commercial service —
`FLASHX8DrLbgeR8FcfNV1F5krxYcYMUdBkrP1EPBtxB9`, ~476 tx/min across ~37 distinct
users. What is it, what does it cost, does it expose an API we could drive from
our Rust bot, and does it include a staked send path? **Note it is not magic —
it failed one launch by ~6ms.**

**G2.** Two winners run their own deployed programs (`ESQHZej9…`,
`QECRnx…`, `4RoVsR9z…`). Rough cost and time to write and deploy an equivalent?

---

### SECTION H — Honest assessment

**H1.** Rank the **top 3** things costing us the most milliseconds, with your
confidence in each.

**H2.** What is currently **unmeasurable** with the code as written, and what is
the smallest change that makes it measurable?

**H3.** Given the winners' profile — **own program, lookup table, 3–4
instructions, under 700 bytes, near-zero fee** — what is the **cheapest change
that moves us closest to it**, and how long would it take?

---

## Output format

Section by section: question number, answer, evidence (file:line, value, or
log). Finish with H1–H3.

**Do not change any code. Do not open a PR. Answer only.**
