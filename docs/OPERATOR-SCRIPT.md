# OPERATOR SCRIPT — driving WISHMail from goose, one instruction per turn

**What this is.** The exact words to paste into a goose window, in order, one per turn, with the card each should
return. It exists because the model does **not** figure the flow out: on 2026-09-11 an unscripted model invented four
address forms, passed JSON objects as strings, and called `generate_mailbox` on a home with no account — which put
eight topics on `hedera:testnet` that nobody can delete (`app/OPERATIONS.md`, the Gate Zero divergence). The operator
drives; the model executes one instruction at a time.

**The rule for every step: paste ONE instruction, read the card, and stop.** Every step below ends with the word
**stop** for that reason. If a card does not match, do not paste the next one — say what it said.

**One extension per goose window.** Two in one window is one agent holding two mailboxes, which is not two agents.
The per-home lock cannot catch it: two homes take two different locks and both start happily.

---

## Part 0 — the two windows

| Window | Extension | Home | Agent | Operator |
|---|---|---|---|---|
| **SENDER** | `demoagentx` | `~/.wishmail/demo/gz-x` | DemoAgentX | `0.0.10450880` |
| **RECIPIENT** | `demoagenty` | `~/.wishmail/demo/gz-y` | DemoAgentY | `0.0.10450879` |

In each window, open the extension list and **turn the other one off**.

Both entries carry `available_tools: [buy_stamp, resolve, send, inbox, ack]`, which is goose's own allowlist
(`crates/goose/src/agents/extension.rs:394-420`: empty means all, non-empty means only those). `generate_mailbox`,
`register_agent` and `verify` are deliberately **not** on it — see the note at the end.

---

# PART A — THE DRY REHEARSAL (`gz-x` and `gz-y`, signs nothing)

`gz-x` and `gz-y` are **debug homes now and never go live again**. Both goose entries are `--dry-run`. The purpose of
Part A is to prove the model can be driven through the shape of the flow before a single ℏ is spent on the real one.

**The check that this is DRY: the first `buy_stamp` card must say DRY / would-do.** If it does not, or if you see a
connection error to `127.0.0.1:4600`, that window is not in DRY — **stop**.

### A1 — SENDER window

> Call the `buy_stamp` tool once with exactly these arguments and show me the whole result: `count` 12, `provision`
> true, `payment` `{"method": "hbar"}`, `holder` `{"publicKey": "self"}`. Do not call any other tool. Then stop.

**Expect:** a card saying `DRY RUN — would buy 12 stamp(s) and provision this agent's mailbox`, with a `holder`
naming a `publicKey` beginning `22cd19c2` and a `buyer` of `0.0.10450880`. Nothing is signed. **stop**

### A2 — SENDER window

> Call the `resolve` tool once with `address` `0.0.10462700` and `profile` `hcs14`. Show me the coordinates it
> returns. Then stop.

**Expect:** real coordinates for DemoAgentA2 — a doorbell, a manifest topic and a proof hash. This is a live mirror
read and it works in DRY, because resolving pays nothing and needs nothing (P-4). **stop**

### A3 — SENDER window

> Call the `send` tool once. For `coordinates`, pass the coordinates object from the previous `resolve` result
> unchanged. For `payload`, pass exactly
> `VGhpcyBsZXR0ZXIgaXMgY2VydGlmaWVkLCBhbmQgaXRzIHJlY2VpcHQgd2lsbCBiZSBzaWduZWQgb24gY29uc2Vuc3VzLg==`. Set
> `returnReceipt` to true. Then stop.

**Expect:** `SEND_UNRESOLVED: this agent has no account yet; the purchase creates it (§4.6, HIP-542)`. **That refusal
is the pass** — `gz-x` has no mailbox, and the point of the step is that `send` accepted the coordinates handed
straight from `resolve`. **stop**

### A4 — RECIPIENT window

> Call the `inbox` tool once with no arguments. Then stop.

**Expect:** `INBOX_MIRROR_UNREACHABLE: this agent has no doorbell on consensus; buy a mailbox first (§4.6)`. The
mirror is reachable; the agent has no door. The code names the wrong cause and that is recorded, not fixed. **stop**

### A5 — RECIPIENT window

> Call the `ack` tool once with `envelopeId` `0000000000000000000000000000000000000000000000000000000000000000`.
> Then stop.

**Expect:** a refusal — there is no such envelope and no lane. Nothing is signed. **stop**

**End of Part A.** If every card above matched, the model can be driven. If any did not, that is the finding and
Part B does not start.

---

# PART B — THE LIVE SEQUENCE (real ℏ)

**Do not start Part B on `gz-x` or `gz-y`.** Those are debug homes now and never go live again. Part B runs on
**fresh homes**, and it is the same six instructions whichever gate is running:

- **The next live act is a SECOND GATE ZERO** — the demo operators we already own (`0.0.10450879`,
  `0.0.10450880`), with **fresh homes** carrying no residue. It re-asks the question the first Gate Zero could not
  answer: does goose drive this server through the golden path.
- **Gate Four comes after it** — two **brand-new** operator wallets Sonic creates and funds, with no history at
  all. It asks its own question: whether a brand-new wallet survives the lifecycle.

Neither home exists yet. When the wallets do, the homes are written the way `gz-x` and `gz-y` were, the roles stay
the same (X sends, Y receives), and this file is re-pointed at them. **Each gate has its own gate report and its own
fill-in, and neither is the one above.**

**Before any of it: the counter must be up** (`npm run counter`) and its banner must say
`the counter is at http://127.0.0.1:4600/`. `buy_stamp` needs it; nothing else does. In LIVE a connection error to
`127.0.0.1:4600` means the **counter has died**, not that the window is DRY — the DRY heuristic inverts here.

**Both windows must be restarted with `--live`**, and that restart IS the gate: the banner says `LIVE: this run CAN
SIGN and CAN SPEND` with the argv that carried the flag.

### B1 — RECIPIENT window, first, because her watcher must be running before he rings

> Call the `buy_stamp` tool once with exactly these arguments and show me the whole result: `count` 12, `provision`
> true, `payment` `{"method": "hbar"}`, `holder` `{"publicKey": "self"}`. Do not call any other tool. Then stop.

**Expect:** this takes a minute or more — it is one transfer, five topics, the profile's chunks, a registry entry and
an account memo. The card is a **StampReceipt**: `txRef`, a `price` of about 43 ℏ, and `holder` naming the account
the purchase created. **Write that account id down — it is DemoAgentY's address, and it is what the sender needs.**
**stop**

### B2 — SENDER window

> Call the `buy_stamp` tool once with exactly these arguments and show me the whole result: `count` 12, `provision`
> true, `payment` `{"method": "hbar"}`, `holder` `{"publicKey": "self"}`. Do not call any other tool. Then stop.

**Expect:** the same shape, a second StampReceipt, a different `holder`. **stop**

**If either B1 or B2 stops part way, call the same instruction again** — it resumes the purchase the home already
made, creates only what is missing, and never buys twice. If the counter's record of it is gone: **STOP, and do not
reconstruct the receipt.**

### B3 — SENDER window

> Call the `resolve` tool once with `address` set to the account id from step B1 and `profile` `hcs14`. Show me the
> coordinates. Then stop.

**Expect:** coordinates naming DemoAgentY's doorbell and manifest topic, and a proof hash. If this returns
`RESOLVE_NOT_FOUND`, B1 did not finish — **stop**. **stop**

### B4 — SENDER window — the letter

> Call the `send` tool once. For `coordinates`, pass the coordinates object from the previous `resolve` result
> unchanged. For `payload`, pass exactly
> `VGhpcyBsZXR0ZXIgaXMgY2VydGlmaWVkLCBhbmQgaXRzIHJlY2VpcHQgd2lsbCBiZSBzaWduZWQgb24gY29uc2Vuc3VzLg==`. Set
> `returnReceipt` to true. Then stop.

That payload is the sentence *"This letter is certified, and its receipt will be signed on consensus."* — 70 bytes,
one chunk. It is pre-encoded here so the model copies it rather than encoding it.

**Expect:** a **Postmark** — chunk 0's lane, sequence number and consensus timestamp — and a text block naming what
landed. `send` returns after the ScheduleCreate and **before anyone signs**, so a Postmark is not yet the delivery.
If it returns an `AttemptedDeliverySlip`, the recipient's watcher was not running: that is a **result, not a
failure** — one stamp is gone at her door, no postage was affixed, the request stands. **Do not send again without
saying so**: a second ring is a second stamp and a second lane, and a lane cannot be closed. **stop**

### B5 — RECIPIENT window

> Call the `inbox` tool once with no arguments. Show me the whole result. Then stop.

**Expect:** one delivery, with the sentence above as its payload and an `envelopeId`. **Write the `envelopeId`
down.** **stop**

### B6 — RECIPIENT window — signing for it

> Call the `ack` tool once with `envelopeId` set to the id from the previous result. Then stop.

**Expect:** the ack signs the scheduled receipt, and the network executes it the instant the last signature lands.
If it returns `ACK_NOT_OPENED`, the schedule's body names a different identifier, postmark or epoch — that is the
check working. **stop**

---

## WHAT GREEN LOOKS LIKE ON YOUR SIDE

**Not `send` returning, and not any card.** On your side, green is: **B4 returned a Postmark**, and **B6 returned
without refusing**. That is the end of what goose can tell you.

**The run is green when two facts are on a mirror node, and I read them after — not you:**

1. the schedule's `executed_timestamp` is **not null**, and
2. the receipt manifest is on **DemoAgentY's own manifest topic**, at a sequence number, hashing to what the
   schedule carried — chained back to chunk 0's postmark.

Tell me B6 is done and I will read both from the mirror and write the run of record.

---

## Why three tools are off the allowlist

- **`generate_mailbox`** — the self-provisioned path, for an agent that brings its own account. It is what created
  the eight orphan topics on 2026-09-11. `buy_stamp` with `provision` is the whole of §4.6's provisioned path and
  returns the receipt (D-168). Nothing in this script needs it.
- **`register_agent`** — posts this agent's registration on the HOL anchor. **It is not on the golden path**: the
  `hcs14` declaration that `resolve` and `send` rely on is published by provisioning itself (the profile, its HCS-1
  chunks, the HCS-2 register entry and §9.2's account memo), and the anchor serves the `hol` profile, which the
  letter path never consults. Turn it on only if the registration is wanted on video.
- **`verify`** — the stranger's verification is run from a command line holding no key, no account, no stamp and no
  counter (`npm run verify -- --lane <lane>`). That it needs nothing is the whole point of the step, and it is
  weaker if one of the two agents' own windows does it.
