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
| **SENDER** | `demoagentx5` | `~/.wishmail/demo/gz5-x` | DemoAgentX5 | `0.0.10492954` |
| **RECIPIENT** | `demoagenty5` | `~/.wishmail/demo/gz5-y` | DemoAgentY5 | `0.0.10492957` |

**Those are the ONLY two WISHMail entries in `config.yaml`, and both are `--dry-run`.** Every earlier pair was
**removed outright rather than repointed**: `demoagentx`/`demoagenty` (the second Gate Zero, on `gz2-x`/`gz2-y`)
and `demoagentx4`/`demoagenty4` (Gate Four, on `gz4-x`/`gz4-y`) no longer exist. The reason is the hazard a
repoint leaves behind — a same-name edit that silently fails to take (a restart not done, a `.bak` reloaded)
points a `--live` window at a home the gate has **spent**, where a plain `buy_stamp` without `provision`
**succeeds and spends**. A name that is gone cannot load a stale target; it either exists or it does not.
`gz-x` and `gz-y` are the damaged homes from 2026-09-11 and are wired to nothing. They never go live again.

**`gz6-x`/`gz6-y` are the spare and carry NO entry** — operators `0.0.10492960` and `0.0.10492962`, born under
GATE FUND on the same terms. They are wired only if this take is spoiled, by the same remove-and-rename.

`demoagenty5` ships `enabled: false`, and that is the discipline and not a fault: in each window, open the
extension list and **turn the other one off**.

Both entries carry `available_tools: [buy_stamp, resolve, send, inbox, ack]`, which is goose's own allowlist
(`crates/goose/src/agents/extension.rs:394-420`: empty means all, non-empty means only those). `generate_mailbox`,
`register_agent` and `verify` are deliberately **not** on it — see the note at the end.

---

# PART A — THE DRY REHEARSAL — RUN AND PASSED, 2026-09-11

**Part A is history and is kept for the shape.** It ran on `gz-x` and `gz-y` and it did its job: it found that the
model serialises object arguments as JSON strings, which killed `send`, and that is now fixed and courted
(`app/OPERATIONS.md`, Gate Zero Part A). A3 re-run under Goose Desktop returns the would-do card.

**The steps below reference `gz-x`/`gz-y`, which no goose entry has pointed at since 2026-09-11, and their
expectations are the DAMAGED-home ones.** Do not read A1 or A4 as predictions for the take: on `gz5` A1 returns
`holder` as a **public key** rather than an account, and A4 refuses with `INBOX_MIRROR_UNREACHABLE` rather than
returning `[]`. **B0 below is the rehearsal for this take** — it is A1 on the right home with the card read for
the two fields that identify it — so Part A is read for its shape and B0 is the step that is run.

**The check that this is DRY: the first `buy_stamp` card must say DRY / would-do.** If it does not, or if you see a
connection error to `127.0.0.1:4600`, that window is not in DRY — **stop**.

### A1 — SENDER window

> Call the `buy_stamp` tool once with exactly these arguments and show me the whole result: `count` 12, `provision`
> true, `payment` `{"method": "hbar"}`, `holder` `{"publicKey": "self"}`. Do not call any other tool. Then stop.

**Expect:** a card saying `DRY RUN — buy_stamp would buy 12 stamp(s) and provision this agent's mailbox`, with
`"holder": {"account": "0.0.10487063"}` and `"buyer": "0.0.10450880"`. Nothing is signed.

**Why `account` and not a public key:** `gz-x` is a **damaged home**. Its account `0.0.10487063` was created on
2026-09-11 by the run that also left it four unusable topics, so it is no longer a fresh agent and `buy_stamp`
reports the account it has rather than the key it would have bought one with. On a fresh home this line reads
`"holder": {"publicKey": "…"}` instead. Either way, **the card saying DRY is the check**. **stop**

### A2 — SENDER window

> Call the `resolve` tool once with `address` `0.0.10462700` and `profile` `hcs14`. Show me the coordinates it
> returns. Then stop.

**Expect:** real coordinates for DemoAgentA2 — a doorbell, a manifest topic and a proof hash. This is a live mirror
read and it works in DRY, because resolving pays nothing and needs nothing (P-4). **stop**

### A3 — SENDER window

> Call the `send` tool once. For `coordinates`, pass the coordinates object from the previous `resolve` result
> unchanged. For `payload`, pass exactly
> `VGhpcyBsZXR0ZXIgaXMgY2VydGlmaWVkLCBhbmQgaXRzIHJlY2VpcHQgd2lsbCBiZSBzaWduZWQgb24gY29uc2Vuc3VzLg==`. Set
>
> *(That is the OLD demo sentence. Part A is history and keeps it. The live payload is now the shorter
> literal in B4 — see the truncation finding there.)*
> `returnReceipt` to true. Then stop.

**Expect:** `SEND_UNRESOLVED: this agent has no account yet; the purchase creates it (§4.6, HIP-542)`. **That refusal
is the pass** — `gz-x` has no mailbox, and the point of the step is that `send` accepted the coordinates handed
straight from `resolve`. **stop**

### A4 — RECIPIENT window

> Call the `inbox` tool once with no arguments. Then stop.

**Expect:** `[]` — an empty inbox.

**Why empty and not a refusal:** `gz-y` is a **damaged home** too. It has a doorbell, `0.0.10487067`, left by the
2026-09-11 run, and `inbox` reads it and finds nothing on it. On a fresh home this instead returns
`INBOX_MIRROR_UNREACHABLE: this agent has no doorbell on consensus; buy a mailbox first (§4.6)` — where the mirror
is reachable and the agent simply has no door, and the code names the wrong cause (recorded, not fixed). **stop**

### A5 — RECIPIENT window

> Call the `ack` tool once with `envelopeId` `0000000000000000000000000000000000000000000000000000000000000000`.
> Then stop.

**Expect:** a refusal — there is no such envelope and no lane. Nothing is signed. **stop**

**End of Part A.** If every card above matched, the model can be driven. If any did not, that is the finding and
Part B does not start.

---

# PART B — THE LIVE SEQUENCE (real ℏ)

**Do not start Part B on `gz-x`, `gz-y`, `gz2-x` or `gz2-y`.** The first pair are debug homes and the second pair
are **spent**: D-165 refuses `provision: true` on an agent that already has an account, and a plain `buy_stamp`
without `provision` on a spent home would **succeed and spend**. Part B runs on fresh homes only.

**GATE FOUR IS RUN AND GREEN** (2026-09-11, on `gz4-x`/`gz4-y`). It asked whether a brand-new wallet survives
the lifecycle and the answer is yes: `ensurePayerHoldsStamps`' `TokenAssociateTransaction` branch
(`app/sdk/mailbox.ts`) executed against the network for the first time in five gates, on **both** operators,
after each purchase and before each first topic.

**The next live act is THE RECORDED TAKE**, on **`gz5-x` (DemoAgentX5, SENDER)** and **`gz5-y` (DemoAgentY5,
RECIPIENT)**, whose operators are `0.0.10492954` and `0.0.10492957` — brand-new, zero association slots, 250 ℏ
each, born under GATE FUND and never provisioned. **`gz6-x`/`gz6-y` are the spare**, on `0.0.10492960` and
`0.0.10492962`, for a take spoiled by something outside this code. The take runs on **the HEAD Gate Four ran
on**, and nothing lands between.

**Before any of it: the counter must be up** (`npm run counter`) and its banner must say
`the counter is at http://127.0.0.1:4600/`. `buy_stamp` needs it; nothing else does. In LIVE a connection error to
`127.0.0.1:4600` means the **counter has died**, not that the window is DRY — the DRY heuristic inverts here.

**Both windows must be restarted with `--live`**, and that restart IS the gate.

**You will not see a banner inside goose, and that is not a fault.** goose **discards** the extension's stderr —
it is not in the conversation and it is not in goose's own logs. The banner is proved in a terminal beforehand,
and inside goose the proof is **B0**.

### B0 — EACH window, before anything else — which home am I actually driving?

> Call the `buy_stamp` tool once with exactly these arguments and show me the whole result: `count` 12, `provision`
> true, `payment` `{"method": "hbar"}`, `holder` `{"publicKey": "self"}`. Do not call any other tool. Then stop.

**In DRY this is a rehearsal and signs nothing.** Read two fields off the card and nothing else:

| field | must read | if it reads this instead — **STOP** |
|---|---|---|
| `holder` | `{"publicKey": "<a long hex string>"}` | `{"account": "0.0.…"}` — this home already has an agent; it is a **spent** home |
| `buyer` | `0.0.10492957` in the RECIPIENT window, `0.0.10492954` in the SENDER window | anything else. `0.0.10450879/80` is a demo operator; `0.0.10492952/53` is Gate Four's, already spent; `0.0.10492960/62` is the spare |

`holder` names the agent and `buyer` names the operator, so **one card proves which `config.json` and which
`keystore.json` this window loaded.** Either field wrong is a stop, and no instruction below may be run.

**This is also the DRY check.** The card must say `DRY RUN — buy_stamp would …`. When you restart `--live`, the
same call is the real purchase: **in LIVE a "would do" card means the flag did not arrive — stop.** **stop**

### B1 — RECIPIENT window (`gz5-y`), first, because her watcher must be running before he rings

> Call the `buy_stamp` tool once with exactly these arguments and show me the whole result: `count` 12, `provision`
> true, `payment` `{"method": "hbar"}`, `holder` `{"publicKey": "self"}`. Do not call any other tool. Then stop.

**Expect:** this takes a minute or more — **an association**, one transfer, five topics, the profile's chunks, a
registry entry and an account memo. The card is a **StampReceipt**: `txRef`, a `price` of about 43 ℏ, and `holder`
naming the account the purchase created. **Write that account id down — it is DemoAgentY5's address, and it is
what the sender needs.**

**What you will NOT see, and it is not a failure:** the `provision.associated` line announcing the
`TokenAssociateTransaction`. It goes to stderr and goose discards it. **The association is read from the mirror
afterward, and it is the thing this gate exists to see.** **stop**

### B2 — SENDER window (`gz5-x`)

> Call the `buy_stamp` tool once with exactly these arguments and show me the whole result: `count` 12, `provision`
> true, `payment` `{"method": "hbar"}`, `holder` `{"publicKey": "self"}`. Do not call any other tool. Then stop.

**Expect:** the same shape, a second StampReceipt, a different `holder`. **stop**

**If either B1 or B2 stops part way, call the same instruction again** — it resumes the purchase the home already
made, creates only what is missing, and never buys twice. If the counter's record of it is gone: **STOP, and do not
reconstruct the receipt.**

### B3 — SENDER window

> Call the `resolve` tool once with `address` set to the account id from step B1 and `profile` `hcs14`. Show me the
> coordinates. Then stop.

**Expect:** coordinates naming DemoAgentY5's doorbell and manifest topic, and a proof hash. If this returns
`RESOLVE_NOT_FOUND`, B1 did not finish — **stop**. **stop**

### B3½ — SENDER window — READ THE PAYLOAD BACK BEFORE IT IS SENT

> Repeat the payload string back to me exactly as you will send it. Do not call any tool. Then stop.

**Compare what it says, character for character, with the literal in B4 below.** If it differs by so much as one
character, say so and do not go on: correct it, and have it read the string back again.

**This step exists because the model DOES NOT COPY THE LITERAL — it re-encodes the sentence from its own reading
of it, and it has got that wrong twice on consensus.** Gate Zero the second landed
*"…signed on consensu."*, 69 bytes instead of 70. Gate Four landed *"Certified agent mail,proven on Hedera."*,
38 bytes instead of 39 — and that one was **the same length as the literal** and carried base64 padding the
literal does not have, which is the proof it was regenerated rather than truncated. A copy is byte-identical.

**The letter cannot be withdrawn once it is sent**, so this is the only place the payload can be checked. It
costs one turn. **stop**

### B4 — SENDER window — the letter

> Call the `send` tool once. For `coordinates`, pass the coordinates object from the previous `resolve` result
> unchanged. For `payload`, pass exactly
> `Q2VydGlmaWVkIGFnZW50IG1haWwgcHJvdmVuIG9uIEhlZGVyYS4=`
> — which is the sentence **`Certified agent mail proven on Hedera.`** — and set `returnReceipt` to true. Then
> stop.

**The plaintext is printed beside the base64 on purpose.** At B5 you check the rendering against **that printed
line**, not against memory.

**Why this sentence.** It carries **no punctuation with a space after it**, which is what the model lost at Gate
Four. That makes it a smaller target and **not a safe one** — the mechanism is re-encoding, not truncation, and
**B3½ above is what actually closes it.** 38 bytes, 52 characters.

**Expect:** a **Postmark** — chunk 0's lane, sequence number and consensus timestamp — and a text block naming what
landed. `send` returns after the ScheduleCreate and **before anyone signs**, so a Postmark is not yet the delivery.
If it returns an `AttemptedDeliverySlip`, the recipient's watcher was not running: that is a **result, not a
failure** — one stamp is gone at her door, no postage was affixed, the request stands. **Do not send again without
saying so**: a second ring is a second stamp and a second lane, and a lane cannot be closed. **stop**

### B5 — RECIPIENT window — and READ THE LETTER

> Call the `inbox` tool once with no arguments. Show me the whole result. Then stop.

**Expect:** one delivery, `opened: true`, **38 byte(s)**, and a rendering. Check the rendered line character for
character against the printed sentence:

```
      a RENDERING of those bytes as UTF-8 — the bytes themselves stay base64 in the result:
      | Certified agent mail proven on Hedera.
```

**If a single character is missing, the model truncated the base64 at B4.** The letter is already on consensus and
cannot be withdrawn — **stop, do not `ack`,** and say so. The take is spoiled and resumes on the spare pair.

`payload` in `structuredContent` must be a **base64 string**. If it is `{"type":"Buffer","data":[…]}` you are
running a build from before 2026-09-11 — **stop**.

**Write the `envelopeId` down.** **stop**

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
2. the receipt manifest is on **DemoAgentY5's own manifest topic**, at a sequence number, hashing to what the
   schedule carried — chained back to chunk 0's postmark.

**And, as at Gate Four:** a `TokenAssociateTransaction` for `$POSTAGE 0.0.10426208` on **each** new operator
wallet, timestamped **before** that agent's first ring. These operators also read zero slots, so it fires again.

Tell me B6 is done and I will read all of it from the mirror and write the run of record.
