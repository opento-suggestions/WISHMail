# Five gates and a recorded take, signed

**Certified mail for agents on Hedera. Every act below was submitted to consensus, read back from a mirror node, and
recorded before the next one ran.** Each identifier links to HashScan, where the record is the network's and not ours.

Ledger `hedera:testnet` · specification **0.5.13**, tagged `v0.5.13` · ETHOnline 2026.

> **This file is a reading, not a record.** The records are `app/OPERATIONS.md` — one gate report and one run of
> record per signed act, in the order they happened — and `ENTITIES.md`, which is generated. Where this file and
> those disagree, they win. It exists because five gates spread across eight thousand lines of operations log are
> hard to read end to end, and a reader who wants the whole shape should not have to assemble it.

| | |
|---|---|
| Gates run | **5** — provisioning, the letter loop, the whole of `send()` in one call, a model at the controls, and a brand-new wallet — with **the recorded take** beneath them |
| Correspondents | **9** — every one bought through the counter, its account created by the transfer that paid for it |
| Letters delivered | **7** across **5 lanes** — two plain, one of them a reply; and **five certified**, each with a return receipt published by the recipient's own signature |
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
freeze the smallest new field is a new minor version — so a finding that would need one is recorded and deferred
rather than coded around. **Two findings stand recorded and unpatched for exactly that reason, and both are 0.6
candidates waiting on a minor version rather than on a decision.**

**Ledger §G-20** is the worked example, and Gate One below is it measuring itself: the provisioned path cannot be
*rate*-priced while the `PriceList` schema is frozen, so 0.5 ships a flat ℏ number, and a flat number cannot track a
fee schedule that is denominated in dollars and charged in ℏ. The doorbell prices in the three gates below — 26.32,
26.61, 26.90 ℏ on three consecutive days — are that finding stated as measurements.

**Ledger §G-29** is the other, and it is the one a reader of the evidence should know about. §8.5 has reassembly
record every off-chain, unrooted, conflicting **and duplicate** chunk without using it, but §5.10’s
`CorrespondenceEntry` carries `chunks` and `offChain` and no third list. So a duplicate is recorded by the walk and
dropped by the bundle — a correspondence somebody replayed forty times and one nobody touched produce identical
evidence, byte for byte — and an envelope with chunks but **no chunk 0 at all** gets no entry, because an entry
reaches its chunks only through an `Envelope` and the registered Envelope schema requires all fifteen of its fields,
none of which an envelope with no header has. Neither is reachable without a field the frozen schemas lack. **This is
the freeze working as designed rather than a defect concealed**: the alternative was to invent values for fields that
have none, which would put a fiction in the one document a stranger is supposed to be able to check.

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
| A plain letter, A2 → B — first contact: the doorbell rung, the lane opened | `cd9dc8f4…` | 1 | 1 stamp + 1 at the door | SETTLED |
| A certified letter, A2 → B — 4,408 bytes, the Emancipation Proclamation | `514e5045…` | 10 | 3, nothing rung | **ACKED** |
| A reply, B → A2 — on the same lane, nothing rung | `bc1bd61e…` | 1 | 1, nothing rung | SETTLED |

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
evidence digest both times — which is `check:captured`'s assertion and names no row of the register — and each
narrative carried the digest of the bundle it was read from (**T-P3-4**).

**What that is not is T-P3-1, and the difference is worth stating plainly.** T-P3-1 asks for replay *by a fresh
Verifier at a different patch revision of the same minor version, at a different time and through a different mirror
node*, equalling the reference evidence byte for byte. Running one implementation twice shows the replay is
**deterministic** — which T-P3-1 presupposes and is not satisfied by. **This deployment does not discharge T-P3-1,
because it has one implementation and that test compares two.** The offline court meets one of its four conditions
and says so: it re-reads Gate Three's bytes while standing at another patch of 0.5 and requires the digest not to
move. The remaining three wait on somebody else's Verifier, which is the point of publishing the specification.

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

**Standing and the receipt are two axes, and this table keeps them apart.** An envelope's standing is what its
evidence binds to; a receipt's status is a fact about the receipt. §11.5 is explicit that the receipt does not lower
the standing — an invalid one is a fact about the receipt — and nothing raises it. Every envelope in every bundle
below stands `unverified`, for the one reason above and no other.

| Correspondence reconciled | Envelopes | Standing | Receipts | Digest | Reproduces from |
|---|---|---|---|---|---|
| Gate Two, checkpoint one | 1 | unverified | none requested | `8d30dfdc…` | `v0.5.10` |
| Gate Two, checkpoint two | 2 | unverified | 1 **acked** | `00229e6f…` | `v0.5.10` |
| Gate Two, after the reply | 3 | unverified | 1 **acked** | `1c4359e5…` | `v0.5.11` |
| Gate Three | 1 | unverified | 1 **acked** | `34b314c4…` | **every 0.5.x** |

Each bundle is over the whole lane at the moment it was read, which is why the envelope count grows down the first
three rows: the reply's bundle reconciles all three letters on lane `0.0.10464056`, not just the reply.

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
  test bodies written            53
  tests passing                  44
  classes claimed              none
```

The suite emits that report honestly rather than suppressing it, and **the middle two numbers moved on 2026-09-11
while the last one did not** — which is the whole point of it. Eighty-seven tests are named by the specification's
own `Conformance:` notes and keyed to the invariants they serve. Fifty-three now have bodies, written from the
register's own sketches and never from the implementation — *the code is the defendant, not the judge* — and on their
first run they found **eleven defects in the reference implementation**, every one since fixed and each proved by the
body that found it. Of the forty-three that fail, thirty-four have no body and say so by name, and nine are bodies
failing on a clause they cite. **A failing body is a finding brought, not a chore**, and none is made to pass by
narrowing it.

**And still no class is claimed, which is correct output rather than a shortfall.** A class passes only when its
suite passes in full, and every class includes VERIFIER — so **T-P3-1 alone would keep every class from passing
here.** It asks for replay by a fresh Verifier *at a different patch revision of the same minor version, at a
different time, through a different mirror node*, equal byte for byte. Running one implementation twice shows the
replay is deterministic, which T-P3-1 presupposes and is not satisfied by. **This deployment has one
implementation and that test compares two.** That is not a defect to be closed here; it is what publishing a
specification is for, and the remaining three conditions wait on somebody else's Verifier. Silence claims nothing
(§1.5), so this release is silent.

Alongside it, **twenty-four offline checks are green** — the reference implementation's own courts, which run with no
network at all. They appraise the real captured bytes of the correspondences above and refuse altered copies: a
changed header, a settlement whose memo names another envelope, a settlement affixed by an account the chunks do not
name, a lane born at a third party's door, a lane whose key list carries a third key.

Two of those alterations are **measured as invisible** rather than asserted as refused, because under a release
claiming no profile the lane-provenance check never runs. The check asserts that nothing moves — not the standing,
not even the digest — which turns a limitation into a number. The day this release claims a profile, those two
assertions flip and the check reports it by failing.

What this deployment does not defend, in full: [`LIMITATIONS.md`](../LIMITATIONS.md).

---

## Gate Zero, the second — a model drives it, 2026-09-12

**The first gate not driven by a CLI.** Six instructions in two goose windows, one per turn, one pass, no stop:
both agents provisioned on fresh homes, a lane born, one certified letter with a return receipt, opened and
signed for. It matters because every gate before it was driven by code we wrote for the purpose, and a tool
surface that only its author can operate has not been tested.

| | |
|---|---|
| DemoAgentY2, recipient | [`0.0.10489361`](https://hashscan.io/testnet/account/0.0.10489361) — doorbell [`0.0.10489363`](https://hashscan.io/testnet/topic/0.0.10489363), manifest [`0.0.10489371`](https://hashscan.io/testnet/topic/0.0.10489371) |
| DemoAgentX2, sender | [`0.0.10489394`](https://hashscan.io/testnet/account/0.0.10489394) — doorbell [`0.0.10489395`](https://hashscan.io/testnet/topic/0.0.10489395) |
| the lane | [`0.0.10489454`](https://hashscan.io/testnet/topic/0.0.10489454) |
| the schedule | [`0.0.10489457`](https://hashscan.io/testnet/schedule/0.0.10489457) — executed `1789176191.217453809` |
| a stranger reads | digest `fca22d10b1f5a6dbbf8209748bab90730e46f46081608fee35eb523f4db37848`, state ACKED |

**All five stamp predictions matched exactly**, and §4.4’s hop — a sender whose operator holds no stamp buying
the ring from the agent itself — fired on consensus for the first time.

### Divergence — the letter is one character short

The letter landed at 69 bytes where the operator script asked for 70. Nothing in the implementation did it: the
model altered the payload **in the tool call, before the server saw a byte**. Recorded and not repaired, because
the repair is not in this code. What it cost was one diagnosis that later turned out to be wrong — it was read
as truncation, and Gate Four proved it is not.

---

## Gate Four — the brand-new wallet, 2026-09-11

**The question four gates could not ask.** Every operator wallet until now had unlimited automatic token
association slots, so one branch of the provisioning path — the one that associates the wallet with `$POSTAGE`
explicitly — had **never executed against the network**. Gate Four ran two agents on wallets created minutes
earlier with **zero** slots.

**It fired, on both operators**, at `0.67094579` ℏ each, after each agent’s purchase and before that
agent’s first topic — including on the recipient’s, who never rings a doorbell and therefore ends associated
with a balance of zero. One association bought for nothing, predicted in the report and measured in the run.

| | |
|---|---|
| DemoAgentY4, recipient | [`0.0.10493463`](https://hashscan.io/testnet/account/0.0.10493463) — manifest [`0.0.10493477`](https://hashscan.io/testnet/topic/0.0.10493477) |
| DemoAgentX4, sender | [`0.0.10493552`](https://hashscan.io/testnet/account/0.0.10493552) |
| the lane | [`0.0.10493664`](https://hashscan.io/testnet/topic/0.0.10493664) |
| the schedule | [`0.0.10493669`](https://hashscan.io/testnet/schedule/0.0.10493669) — executed `1789191546.406458105` |
| a stranger reads | digest `d452d9b70d1cfaf28780591a4738d0f13eaace7a19d5821c33a5ad2e3b1ffd94`, state ACKED |

**Zero transactions name the recipient** (P-16, measured rather than asserted), and the Postmaster netted
**+27.06223486 ℏ** over the gate.

### Divergence — the model retypes the payload, and this is the proof

The letter reads *"Certified agent mail,proven on Hedera."* — 38 bytes where the script asked for 39. The space
after the comma is gone. **It is the same length as the literal and it carries base64 padding the literal does
not have**, which is what proves the second Gate Zero’s 69-byte letter was never a truncation: **the model
re-encodes the sentence from its own reading of it rather than copying the string.** Length was never the
mechanism, and shortening the sentence was never the fix.

Every weld holds over the bytes actually sent: the AAD hashed them, the seal sealed them, the settlement named
that envelope and no other, the recipient opened it byte for byte, and the receipt executed. **It was found in
one glance**, and only because a fix landed hours earlier that made `inbox` return base64 a card could render
as text instead of a Node `Buffer` rendered as decimal — which is why a card a human can read is a safety
property and not a courtesy.

---

## The recorded take — and the letter arrives intact, 2026-09-12

**The run at the top of the README, and the first letter in three attempts to arrive byte-identical.** Two more
brand-new wallets, a model at the controls, and one new step in the operator script: **a read-back before the
irreversible one**. The model repeats the payload, calls no tool, and a human compares 52 characters before a
stamp moves — because a letter cannot be withdrawn once it is sent. That single step is the only thing that
changed, and the defect that fired twice did not fire.

| | |
|---|---|
| DemoAgentY5, recipient | [`0.0.10509139`](https://hashscan.io/testnet/account/0.0.10509139) — doorbell [`0.0.10509142`](https://hashscan.io/testnet/topic/0.0.10509142), manifest [`0.0.10509148`](https://hashscan.io/testnet/topic/0.0.10509148) |
| DemoAgentX5, sender | [`0.0.10509170`](https://hashscan.io/testnet/account/0.0.10509170) — doorbell [`0.0.10509173`](https://hashscan.io/testnet/topic/0.0.10509173), **never rung** |
| the lane | [`0.0.10509262`](https://hashscan.io/testnet/topic/0.0.10509262) |
| the letter | `Certified agent mail proven on Hedera.` — 38 bytes, one chunk, ciphertext 54 |
| the ack | [`1789244564.149812104`](https://hashscan.io/testnet/transaction/0.0.10492957-1789244556-177581616) |
| the receipt, one nanosecond later | [`1789244564.149812105`](https://hashscan.io/testnet/transaction/0.0.10492954-1789244459-853579572) |
| the schedule | [`0.0.10509266`](https://hashscan.io/testnet/schedule/0.0.10509266) |
| a stranger reads | digest `3245fa580c7aff4288af2c0a951febf491303533241657e56e05716984f6dd2f`, state ACKED |

**Every stamp row matched the prediction exactly** — the sender ends with 9, the recipient with 12, both
operators with 0, and the treasury down a net 21. The Postmaster netted **+27.06329700 ℏ**.

### Divergence — six topics to announce one lane

The doorbell is correct: **one** request and **one** answer, and the answer names the lane above. But the
acceptor created **six** connection topics to get there, and five stand empty and abandoned, costing
2.69040835 ℏ.

The mechanism is a rule this repository had already written down, in the one path that did not obey it. The
acceptor creates the topic, then confirms its submit key from a mirror node **before** announcing it — which is
right, and is there so that a malformed lane is never announced. But it reads the mirror **once**: a topic the
mirror has not yet ingested reads as absent, the check fails, and the attempt throws **after the topic is
permanent and before it is announced**. Five seconds later the request is still unanswered, so it is answered
again — by creating another topic.

**Nothing about the letter, the receipt, the settlement or the schedule is affected**, and the five are
unreachable from any evidence a Verifier reads. They are also **deletable** — each carries the recipient’s own key
as its admin key — unlike the residue an earlier gate left, whose topics name no owner and have no admin key at
all. Recorded and not repaired; the mechanism is at file:line in the run of record.

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
$ npm run verify -- --lane 0.0.10509262
```

No key, no account, no stamp, no home. That is the second of WISHMail's two claims, and it is the one that is free
forever.
