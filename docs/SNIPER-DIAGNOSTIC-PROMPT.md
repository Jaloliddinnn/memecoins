# Diagnostic interrogation — Solana sniper bot

**Paste this to your coding agent. It answers; it does not change code yet.**

---

## Rules for you, the agent

1. **Answer every question with evidence**: file path + line number, the actual
   value, or real log output. Not "yes, it's optimised."
2. **If you don't know, say "UNKNOWN"** and say what you'd have to run to find
   out. A wrong confident answer here costs real money.
3. **Do not refactor anything yet.** This is diagnosis only.
4. Where a question asks for a number, give the number.

---

## Measured facts about this bot (from on-chain forensics)

These are not guesses. They came from reading the actual blocks.

**Wallet:** `G5KYKCEz7pzm4LJV18WWCgrr9XryStaR6fJhn8XWRqjo`

**The test snipe** — coin `7rkfBAGXZsJQZjJv8b1smbV4Tjfh9TC8pHbVeESopump`,
launch block `446058693`:

| # | Who | Bytes | Accounts (static + lookup table) | Instr | Fee | Result |
|---|---|---|---|---|---|---|
| 573 | competitor LfEcaUf7 | **700** | 14 + **14** | 5 | 0.000030 | ok |
| 744 | competitor HyMGBFBi | 806 | 17 + **16** | 5 | 0.050005 | ok |
| **752** | **US** | **867** | 21 + **0** | 5 | 0.042005 | **FAILED** |
| 757 | competitor HyMGBFBi | 1021 | 24 + **22** | 4 | 0.010005 | ok |
| **1149** | **US** | **1130** | 28 + **0** | **8** | 0.042005 | ok |

Conclusions already established:

- We **did** land in the coin's creation block. Our detection speed is not the
  main problem.
- We use **no Address Lookup Tables**. Everyone beating us does.
- Our winning transaction is **1130 bytes** against a 1232-byte protocol limit.
- Our curve buy failed, then our PumpSwap fallback took **397 block positions
  (~136 ms)**. A competitor's equivalent fallback took **13 positions**.
- Total fees 0.084 SOL to buy 0.053 SOL of token.
- The bot runs on a VPS in **Helsinki**. The shred feed is AllenHark
  **Frankfurt**.

Background on how landing works, so your answers are framed correctly:

- **Gate 1 — admission.** Did the packet reach the leader before the block
  closed? Only proximity and connection privilege matter. Fees do nothing.
- **Gate 2 — ordering.** Among packets the leader holds at that moment, the
  priority fee sorts them.
- **Gate 3 — execution.** Tokens may already be gone. High fee still fails.

---

## SECTION A — The feed (highest priority)

**A1.** What exactly are we connected to for detection? Give the endpoint URL
(redact the key) and the crate/library. Is it:
 - (a) Yellowstone gRPC / Geyser — **emits after the block executes**
 - (b) raw UDP shreds via a `shredstream-proxy` process
 - (c) a plain RPC websocket
 - (d) polling

**A2.** Is there a **separate process** running (`shredstream-proxy` or
similar) that receives UDP and forwards to a local port? Give the systemd unit
or command line. **If no such process exists, we are on (a) and cannot be in
slot 0.**

**A3.** If gRPC: what `CommitmentLevel` is in the subscribe request — processed,
confirmed, or finalized? Paste the subscribe request construction.

**A4.** What triggers a buy? Be precise:
 - the coin's **create** instruction appearing?
 - one of the 4 stacker wallets buying ~20 SOL?
 - the mint address appearing anywhere?
 - something else?

Paste the matching/filter code.

**A5.** From the moment bytes arrive from the feed to the moment we have the
mint as a usable value — what happens? List every step. Is there any
deserialization of the whole block, any clone of large buffers, any regex, any
allocation in that path?

---

## SECTION B — Timing instrumentation

**B1.** Do we currently timestamp any stage of the pipeline? If yes, paste a
real log line from a live launch.

**B2.** If not: what would it take to log these five timestamps per launch?
```
t0  first byte of the shred/message received
t1  mint extracted
t2  transaction built
t3  transaction signed
t4  handed to the sender
```
**This is the single most important missing measurement.** Without it every
other answer is a guess.

**B3.** Can we log the **slot number the create transaction was actually in**,
and compare it to the slot we were in at `t0`? That one comparison tells us
whether our feed is structurally too slow. How would you get it?

---

## SECTION C — The send path (Gate 1)

**C1.** How is the signed transaction actually sent? Name the exact method and
endpoint. Is it:
 - `RpcClient::send_transaction` to a normal RPC?
 - a relay (Jito / Nozomi / BlockRazor / AllenHark 0-Slot)?
 - direct QUIC to the leader's TPU port?

**C2.** Is `skip_preflight` set to **true**? Paste the `RpcSendTransactionConfig`.
If preflight is on, we are paying a full extra round trip before the
transaction even leaves. What is `max_retries` set to?

**C3.** Are we using a **staked connection / SWQoS** endpoint? Does our provider
plan include one? If UNKNOWN, say so — this is probably our biggest gap.

**C4.** Is the HTTP/QUIC client created **once at startup and reused**, or
constructed per send? Paste the construction. A fresh TLS handshake per send
costs 100 ms+.

**C5.** Do we send to **more than one** endpoint simultaneously? If not, what
would it take to fan out the same signed transaction to 2–3 senders in parallel?

**C6.** Is the send on a **blocking** call inside an async context? Is the
runtime ever stalled by a blocking RPC client?

---

## SECTION D — Transaction construction (measured problem)

**D1.** **We use zero Address Lookup Tables. Why?** Do we have an ALT created
on-chain? If not, what is required to create one and use it?

**D2.** List every account in our buy transaction and mark which are
**constant across all launches** (pump.fun program, global config, fee
recipient, PumpSwap program, Token-2022, ATA program, system program, our
wallet, our wSOL account). Those all belong in an ALT.

**D3.** Our successful buy had **8 top-level instructions** vs competitors' 4–5.
List ours in order and say which could be done **before** the launch instead of
during it — e.g. wSOL account creation, ATA creation, wrapping SOL.

**D4.** Where does the blockhash come from? Is `get_latest_blockhash()` called
**anywhere** after detection? Paste the code. Is there a background refresher,
and what is its interval?

**D5.** Is the transaction built fresh each time, or is there a **pre-built
template** with only the mint substituted? If fresh, how long does building take
(measure it)?

**D6.** How are the compute-unit limit and price set — fixed constants, config,
or computed? Paste the values. What is the CU limit, and is it tuned to actual
usage or left high?

---

## SECTION E — The fallback (our 397-position loss)

**E1.** When the bonding-curve buy fails, what happens? Paste the logic.
Specifically: **do we wait for the first transaction's result before sending
the PumpSwap one?** If yes, that is a full confirmation round trip and it is
our single biggest measured loss.

**E2.** What would it take to send the **curve buy and the PumpSwap buy at the
same instant**, without waiting? Both signed and fired together.

**E3.** If we did that and **both succeeded**, we would buy twice. Options, and
what each costs to implement:
 - accept it and halve the size on each leg
 - put the real size on the PumpSwap leg and a token amount on the curve leg
 - use a **durable nonce** shared by both so the chain guarantees only one lands

**E4.** How do we decide which venue a coin is on? Do we query on-chain state
first? If so, that is a round trip on the hot path — can it be removed?

---

## SECTION F — Infrastructure

**F1.** Confirm the VPS region, provider, and the measured RTT from it to:
 - the AllenHark Frankfurt shred endpoint
 - whatever send endpoint we use

Run `ping` / `mtr` and give real numbers.

**F2.** What is our CPU, and is the process pinned to a core? Is the Tokio
runtime multi-threaded? Any GC-like pauses, lock contention, or channel
backpressure in the hot path?

**F3.** Are UDP receive buffers tuned (`net.core.rmem_max` etc.)? Dropped shreds
show up as missed launches, not as errors. How would we detect drops?

---

## SECTION G — Honest self-assessment

**G1.** Of everything above, rank the **top 3 causes** you believe are costing
us the most milliseconds, and give your confidence in each.

**G2.** What is currently **unmeasurable** with our code as written, and what is
the smallest change that would make it measurable?

**G3.** If you had to name one thing in this codebase that would embarrass a
professional HFT engineer, what is it?

---

## Output format

Answer section by section. For each: the question number, the answer, and the
evidence (file:line, value, or log). End with G1–G3.

**Do not change any code. Do not open a PR. Answer only.**
