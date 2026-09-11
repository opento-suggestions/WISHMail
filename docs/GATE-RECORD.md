# Three gates, signed

**Certified mail for agents on Hedera. Every act below was submitted to consensus, read back from a mirror node, and
recorded before the next one ran.** Each identifier links to HashScan, where the record is the network's and not ours.

Ledger `hedera:testnet` · specification **0.5.12**, tagged `v0.5.12` · ETHOnline 2026.

> **This file is a reading, not a record.** The records are `app/OPERATIONS.md` — one gate report and one run of
> record per signed act, in the order they happened — and `ENTITIES.md`, which is generated. Where this file and
> those disagree, they win. It exists because three gates spread across two thousand lines of operations log are
> hard to read end to end, and a reader who wants the whole shape should not have to assemble it.

| | |
|---|---|
| Gates run | **3** — provisioning, the letter loop, and the whole of `send()` in one call |
| Correspondents | **3** — bought through the counter, each resolving under two registry profiles |
| Letters delivered | **4** — two plain, one certified with a return receipt, one reply |
| Classes claimed | **0** — silence claims nothing (§1.5), and the reason is at the end |

---

## What a gate is here

Nothing signs on `hedera:testnet` until its gate report is written and committed — what it creates, what it asserts
from the mirror, what it writes and where, how it is idempotent, and every way it stops — **and Sonic has said the
word.** After the run a *run of record* goes beneath that report with every transaction id and every mirror readback,
and **the gate report is left exactly as it stood.** One amended after the fact is not a gate report; it is a
description of the past written by someone who already knew the answer.

That discipline is why the divergences below are still here. Several acts went differently from how they were
predicted. Each is named where it happened rather than tidied away, because a record that contains only successes is
not evidence of anything.

---

## The deployment

Provisioned once and unchanged since. A stamp is an HTS fungible token with **zero decimals** — postage is counted,
never divided — and it has no admin key, no freeze key, no pause key and no wipe key. What it cannot do is the point.

| What | Id | Shape |
|---|---|---|
| `$POSTAGE`, the stamp token | [`0.0.10426208`](https://hashscan.io/testnet/token/0.0.10426208) | 0 decimals, infinite supply, no admin / freeze / pause / wipe key |
| Treasury | [`0.0.10426205`](https://hashscan.io/testnet/account/0.0.10426205) | Holds the unissued supply and collects every stamp consumed |
| Price list | [`0.0.10426551`](https://hashscan.io/testnet/topic/0.0.10426551) | Memo `wishmail:prices:1`; the schedule is the sequence of messages, four so far |
| Postmaster's own agent | [`0.0.10426206`](https://hashscan.io/testnet/account/0.0.10426206) | The Postmaster runs a Correspondent like any other, from the same template |
| Registry anchor (HOL) | [`0.0.6913983`](https://hashscan.io/testnet/topic/0.0.6913983) | Read, never brokered — nothing a directory says enters a resolution |

Fourteen JSON Schemas are registered on consensus under HCS-13 and **frozen for the life of version 0.5**. After that
freeze the smallest new field is a new minor version, which is why two findings below were raised and left unpatched
rather than coded around.

Every id, with a HashScan link: [`ENTITIES.md`](../ENTITIES.md).

---

## Gate One — an agent is bought, not funded

**2026-09-09.**

> A Correspondent is provisioned in one purchase: the buyer pays, the agent signs every body in its own process, and
> the Postmaster pays for the eight submissions that build the mailbox. The account is created by the stamp transfer
> itself and is born holding stamps and exactly one registration fee.

The purchase is **one transaction with three legs** — ℏ to the Postmaster, `$POSTAGE` from the treasury to the agent's
public-key alias, and the registration fee back to the account that transfer creates (HIP-542). Every mailbox row
after it is signed by the agent and paid for by the Postmaster, which is the payer seam working at its remote half:
nothing above the seam knows which account is paying.

**Correspondent B**, purchase [`0.0.8641261@1789007373.238805114`](https://hashscan.io/testnet/transaction/0.0.8641261@1789007373.238805114):

| Entity | Id | Charged |
|---|---|---|
| Account, created by the purchase | [`0.0.10452127`](https://hashscan.io/testnet/account/0.0.10452127) | 15.09094832 ℏ |
| Doorbell — HCS-10 inbound, fee-gated | [`0.0.10452149`](https://hashscan.io/testnet/topic/0.0.10452149) | **26.31542199 ℏ** |
| Log — HCS-10 outbound | [`0.0.10452150`](https://hashscan.io/testnet/topic/0.0.10452150) | 0.39534659 ℏ |
| Manifest topic | [`0.0.10452154`](https://hashscan.io/testnet/topic/0.0.10452154) | 0.39534659 ℏ |
| Declaration registry — HCS-2 | [`0.0.10452155`](https://hashscan.io/testnet/topic/0.0.10452155) | 0.39534659 ℏ |
| HCS-11 profile file — HCS-1, no admin key | [`0.0.10452158`](https://hashscan.io/testnet/topic/0.0.10452158) | — |

B registers its own name on the anchor, paying for that one submission out of the fee it was sold — which is the fact
§9.5 reads to decide whether a registration is `blurred`. It is not.

### Divergence — not repaired

A second Correspondent, [`0.0.10451893`](https://hashscan.io/testnet/account/0.0.10451893), is **stopped** and stays
that way. Its transfer settled; then a defect deleted the counter's record of what it had charged and at what rate,
and §5.4 builds a receipt from exactly those. So no receipt exists, **and none was reconstructed from the ledger** —
because the party that took the money is the one party who must not assemble the evidence that it was owed. The
account holds its stamps and its fee, and a transaction id is single-use, so nothing was charged twice.

### What it taught

**Eight defects stopped seven runs, and every one of them lived in the same window:** between a signature leaving the
process and the process learning what happened to it. No offline test can reach that window, because there is no
offline consensus node. Every gate report since is required to name the window for every write and say how a rerun
resumes from inside it.

**Gate One also priced itself.** The doorbell — a fee-gated HIP-991 topic, the first this deployment had ever created
— cost **26.31542199 ℏ** against a published price of 2 ℏ. The price list was republished at 30 ℏ before anything
else was sold. *Measure what a new topic type costs before pricing anything against it.*

---

## Gate Two — the letter loop, and the letter that came back

**2026-09-10.**

> Three acts on one lane between two agents: a plain letter, a certified letter whose return receipt is published by
> the recipient's own signature, and a reply travelling the other way with nothing rung.

A **lane** is an HCS-10 connection topic whose submit key is a threshold over exactly the two agents' keys.
Lane [`0.0.10464056`](https://hashscan.io/testnet/topic/0.0.10464056) was opened by A2 ringing B's doorbell and
answered by B. It carries all three letters.

```
  A2  0.0.10462700   doorbell 0.0.10462704   log 0.0.10462708   manifest 0.0.10462713
  B   0.0.10452127   doorbell 0.0.10452149   log 0.0.10452150   manifest 0.0.10452154
```

| Act | Envelope | Chunks | Postage | State |
|---|---|---|---|---|
| A plain letter, A2 → B — first contact: the doorbell rung, the lane opened | `cd9dc8f4…` | 1 | 1 + 1 fee | SETTLED |
| A certified letter, A2 → B — 4,408 bytes, the Emancipation Proclamation | `514e5045…` | 10 | 3 | **ACKED** |
| A reply, B → A2 — on the same lane, nothing rung | `bc1bd61e…` | 1 | 1 | SETTLED |

### The return receipt is the recipient's signature, and costs the recipient nothing

The sender creates a long-term scheduled transaction (HIP-423) whose inner transaction submits the receipt to a topic
only the recipient's key can write to, names the sender's side as payer, and announces it on the lane. The
recipient's acknowledgment is a single `ScheduleSign`. The instant it lands, the network executes the submission.

```
  schedule    0.0.10465145
  receipt     417f73b3…  published on B's own manifest topic 0.0.10452154 #1
  executed    1789070359.540189105
  B's balances across the ack    unchanged, in ℏ and in stamps
```

Ten chunks of ciphertext were reassembled by walking the header chain — chunk zero rebuilding to the envelope's own
identifier, each later chunk reached by the digest the one before it carries — and opened byte for byte. Reassembly
is a walk on bytes, never on clocks.

### Held at the gate — before any signature

**The reply was refused by the dry run and never submitted.** §7.1 said a lane is bidirectional and §7.1's own MUST
bound an envelope only to a lane born on the doorbell its resolution proof yielded — and an HCS-10 lane is born on
the **acceptor's** doorbell, so for a reply those two sentences pointed opposite ways.

Nothing was signed and nothing was rung. The contradiction was raised as a finding, ruled (D-171), the specification
patched to 0.5.11, the offline courts extended, and only then did the reply travel. It cost one stamp and rang
nothing, and **A2's doorbell still holds zero messages** — which is the assertion, as a count rather than an
intention.

---

## Gate Three — the whole of `send()` in one call

**2026-09-10.**

> A third Correspondent bought at the repriced schedule; then first contact and a return receipt together, in a
> single `send()` call — ring, wait, lane, manifest, postage, chunk, settle, schedule — which is §6.4 as written,
> and which this deployment had never done end to end.

**Correspondent C**, purchase [`0.0.8641261@1789088736.041814712`](https://hashscan.io/testnet/transaction/0.0.8641261@1789088736.041814712):

| Entity | Id |
|---|---|
| Account | [`0.0.10468684`](https://hashscan.io/testnet/account/0.0.10468684) |
| Doorbell | [`0.0.10468687`](https://hashscan.io/testnet/topic/0.0.10468687) |
| Log | [`0.0.10468689`](https://hashscan.io/testnet/topic/0.0.10468689) |
| Manifest | [`0.0.10468692`](https://hashscan.io/testnet/topic/0.0.10468692) |
| Declaration registry | [`0.0.10468693`](https://hashscan.io/testnet/topic/0.0.10468693) |
| HCS-11 profile file | [`0.0.10468695`](https://hashscan.io/testnet/topic/0.0.10468695) |

C was bought for **43.38282123 ℏ** against a quote of 43.29198051 ℏ written down beforehand. The two tenths of a
percent between them is the ℏ exchange rate moving between the quote and the purchase — the bundle is priced in USD
and charged in ℏ, and the receipt records the rate and the instant it was read so that a stranger can re-obtain both
(D-170). Its doorbell cost **26.90214481 ℏ**, about a percent above yesterday's, which is the same fee-gated topic
drifting.

### One call, and what it wrote

| Step | Where it landed | Consensus |
|---|---|---|
| The ring, on C's doorbell | [`0.0.10468687`](https://hashscan.io/testnet/topic/0.0.10468687) #1 | `1789089986.351132013` |
| C answers — the lane is created | [`0.0.10468898`](https://hashscan.io/testnet/topic/0.0.10468898) | `1789090055.869169322` |
| The resolution manifest, on B's topic | [`0.0.10452154`](https://hashscan.io/testnet/topic/0.0.10452154) #3 | — |
| Postage affixed — 2 stamps to the treasury | memo `wishmail:2229a6c9…` | `1789090067.539117004` |
| Chunk 0, on the lane | [`0.0.10468898`](https://hashscan.io/testnet/topic/0.0.10468898) #1 | `1789090073.365704969` |
| The receipt request, on the lane | [`0.0.10468898`](https://hashscan.io/testnet/topic/0.0.10468898) #2 | `1789090079.500349708` |
| C signs — the schedule executes | [`0.0.10468692`](https://hashscan.io/testnet/topic/0.0.10468692) #1 | `1789098271.804108896` |

```
  envelope   2229a6c909d4b6c53889d6fda5ee173ff322debec9010a6aaf9e5cb388079c01
  body       "Working hard or hardly working?"   31 bytes · 1 ounce of 16
  postage    2 stamps + 1 at the door
  schedule   0.0.10468901        receipt f38e23d8…
  B's stamps    11 -> 8          treasury  9,958 -> 9,961
  C charged     0 ℏ and 0 stamps
```

**The agent signs and the operator pays**: B's own account did not move by one tinybar across five submissions, and
the three stamps it spent are the three the treasury gained. The recipient is never charged for a receipt, and across
the acknowledgment C's balances did not move at all (T-P16-2).

### Divergences — raised, not repaired

Three things went differently from the report, **none of them on consensus**. The provisioning driver does not exit
after a run that talks to the counter — a connection is left holding the process open, isolated by the fact that a
rerun skipping the purchase exits in seconds. A command-line reader does not display a pending receipt request,
though the tool returns one. And one run's console output was lost to a buffered pipe, which is why its record was
rebuilt from the mirror instead. **Repairing any of these inside a gate is precisely what the gate exists to
prevent.**

---

## What a stranger sees, and why it says `unverified`

Every letter above was read back by a Verifier configured with **nothing** — no key, no account, no stamp, no home,
no credit and no broker. A mirror node is a read interface, not a broker (P-4). Run twice, it produced the same
evidence digest both times (T-P3-1).

```
   verified  >  [unverified]  >  unstamped  >  unbound
```

**`unverified` here is correct, and it is not a shortfall.** An envelope's standing is the lowest any check of §11.4
yields, and every check yielding below *verified* must name the conformance test whose condition produced it. These
letters name exactly one:

> **`T-P12-4`** — the release claims no resolution profile, so the Verifier did not replay the resolution.

Binding, postage and the receipt were all checked and all held. A Verifier that declines to replay a profile it does
not claim is behaving as §9.6 specifies; one that reported `verified` anyway would be claiming something it had not
done.

| Correspondence | Digest | Standing | Reproduces from |
|---|---|---|---|
| Gate Two, checkpoint one | `8d30dfdc…` | unverified | `v0.5.10` |
| Gate Two, checkpoint two | `00229e6f…` | acked | `v0.5.10` |
| Gate Two, the reply | `1c4359e5…` | unverified | `v0.5.11` |
| Gate Three | `34b314c4…` | acked | **every 0.5.x** |

The last row is the interesting one. Until 0.5.12 the digest was computed over a string carrying the release's full
patch number, which meant two independent implementations — never at the same patch — could satisfy §11.7 only by
accident. The bundle now carries the **minor** version and the reading Verifier's own patch moved to `observations`,
outside the digest (D-173), so `34b314c4…` is reproducible by any Verifier at any 0.5.x forever. The three digests
above it were computed under the older rule; they remain true of the day they were made, each run of record now says
which tag reproduces it, and **none of them was rewritten.**

---

## What this release does not claim

A conformance claim names the classes it claims, the profiles per class, the pinned standards it was tested against,
and the suite run that passed. **This release names no class at all**, and that is a deliberate statement rather than
an omission.

```
  conformance tests registered   87
  test bodies written             0
  tests passing                   0
  classes claimed              none
```

The suite emits that report honestly rather than suppressing it. Eighty-seven tests are named by the specification's
own `Conformance:` notes and keyed to the invariants they serve; none has a body yet; the harness says so. A stub
that passed would be a test that is not yet written telling the suite that it is.

Alongside it, **twenty-two offline checks are green** — the reference implementation's own courts, which run with no
network at all. They appraise the real captured bytes of the correspondences above and refuse altered copies: a
changed header, a settlement whose memo names another envelope, a settlement affixed by an account the chunks do not
name, a lane born at a third party's door, a lane whose key list carries a third key.

Two of those alterations are **measured as invisible** rather than asserted as refused, because under a release
claiming no profile the lane-provenance check never runs. The check asserts that nothing moves — not the standing,
not even the digest — which turns a limitation into a number. The day this release claims a profile, those two
assertions flip and the check reports it by failing.

What this deployment does not defend, in full: [`LIMITATIONS.md`](../LIMITATIONS.md).

---

## Reading the record yourself

Every link on this page goes to HashScan on `hedera:testnet`. Timestamps are **consensus** timestamps in
`seconds.nanoseconds`, which is the form the network assigns and the form the evidence orders by — not a clock any of
these processes kept.

Two readings are worth doing, in order.

Open lane [`0.0.10464056`](https://hashscan.io/testnet/topic/0.0.10464056) and watch the `operator_id` on its
messages point one way for twelve of them and the other way for the thirteenth: that is a correspondence rather than
a broadcast, and a stranger can tell which way each letter went from the settlements alone.

Then open C's doorbell [`0.0.10468687`](https://hashscan.io/testnet/topic/0.0.10468687), which holds exactly two
messages — a request and its answer — and A2's doorbell
[`0.0.10462704`](https://hashscan.io/testnet/topic/0.0.10462704), which holds **none at all, and never has**,
although A2 has sent two letters and received one.

```
$ npm run verify -- --lane 0.0.10468898
```

No key, no account, no stamp, no home. That is the second of WISHMail's two claims, and it is the one that is free
forever.
