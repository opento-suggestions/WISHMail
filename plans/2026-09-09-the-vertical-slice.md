# The vertical slice — the Correspondent, the counter, the first letter

**2026-09-09, post-freeze.** Written before Gate One's report and left as the record of what was planned, in the shape of the plans before it. HEAD at the start was `b12e1cc`, tag `v0.5.9`, tree clean.

## What this window builds, and its two gates

The demo is one vertical slice: two Correspondents provisioned through the counter, a certified letter between them on `hedera:testnet`, opened, acknowledged, and reconciled by a stranger. It has two gates, and the rule is the one every step since the probe has followed — **the report is written and committed before the first signature.**

- **Gate One** — two Correspondents provisioned through the counter. Report in `app/OPERATIONS.md` under Step 5.
- **Gate Two** — the letter, the receipt, and `verify` from a third, empty home. Report under Step 6, which was Step 5 when the letter was next.

Nothing signs before the first; nothing beyond the first gate's scope signs before the second.

**§1.7 has fired.** The fourteen schemas of `spec/schemas/` are registered on consensus as of Step 4, so no file in it moves again under 0.5. Anything this window needs that a schema does not carry is a **§G entry and a 0.6 candidate**, reported and not coded around. One thing was: §G-19.

## The line this plan drew before writing anything

**Where the code goes.** `app/sdk/` is the Correspondent — the process, not the home. A home directory is the operator's and lives outside the repository; `app/sdk/config.template.json` is what ships. `app/src/counter/` is the Postmaster's counter. `app/tsconfig.json` takes `sdk/**` into the same program, so both are typechecked by one `tsc` and the Correspondent imports the ops modules by relative path rather than through a build.

**What may be reused, and what must be.** `send`, `inbox` and `verify` are already written against `tools/consensus.ts`, so "for real" means a second implementation of that port and not a second `send`. D-147's six rows were written twice the moment a Correspondent needed them, so they were lifted into `app/src/ops/template.ts` first and both provisioners point at it — the `hcs1File` lesson, applied before it could cost anything rather than after.

**What must be composed here.** A mirror node returns a key list as protobuf, and §7.1's threshold lane cannot be checked without decoding it. The two alternatives are a paid `TopicInfoQuery`, which P-4 forbids a Verifier to need, and `@hashgraph/proto`, which resolves only from a `node_modules` above this repository and would therefore pass here and fail on a clean clone. Forty lines, in `sdk/protokey.ts`, with a ruling beside the seal's.

## The order, and what forces it

D-159 as amended, per agent, and nothing may reorder it:

```
   boot            keys born once, in the agent's own process (D-165)
     |
   buy_stamp       holder = the agent's PUBLIC KEY, provision = true.
     |             Three legs, one transaction: the price from the operator,
     |             the stamps from the treasury to the alias — which CREATES
     |             the account — and the registration fee into it.
   generate_mailbox  six topics, the declaration, and the resolver run on
     |               this run's own output before it returns
   register_agent    on the HOL anchor, THE AGENT as payer
     |
   resolve         self, under hcs14 AND hol, with no `blurred`
```

The last line is the whole point of the third leg. §9.5 assigns `blurred` where a registration's payer is not the address's account, and every agent on the testnet anchor today carries it — all 380 messages were paid by one broker account. Ours must not, and T-P13-4 is the test.

## What was expected to be hard, and what actually was

**Expected:** the two-round-trip purchase, because §14.2's exchange has the resource server issue requirements it must later recognize. It was straightforward once the buyer returned a **signature** rather than a signed transaction: "never accept a body it did not build" stops being a comparison and becomes the absence of a second body. One node account is pinned before the freeze so a purchase is one body and one signature.

**Not expected:** that the provisioned path cannot be sold at all. §5.4 requires the receipt's `provisioning` line to name a doorbell and a manifest topic, on the warrant that they are "the entities the Postmaster created for the holder" — and D-159 as amended has the agent create them, afterwards, itself. Found by building the counter and running the reader on the writer's output before that output could be signed, which is the whole reason CLAUDE.md §9 has that rule, and this time it caught the defect **before** a transfer rather than after one. Raised as §G-19 with two candidate answers; the counter refuses, before signing, reading the required list out of the registered schema so a later ruling lifts the refusal by itself.

**Also not expected:** that a context-free protobuf walker would read `ThresholdKey.keys` as `Key.ed25519`, because both are field 2. `check:correspondent` caught it on the first run. Field numbers are per message, not global.

## Verification, before the gate

1. `npm run typecheck` — clean at the root and in `app`.
2. `npm run p13:check` — the Postmaster's environment names and, now, the Correspondent's field names, each read by exactly the modules permitted to.
3. `npm run check:correspondent` — 52 assertions, no network and no key: the six rows from the one template, the key-list decoder, §14.3's arithmetic, the §G-19 refusal read from the schema, the sentence template, the doorbell rule, and a home that is the agent.
4. The rest of the battery unchanged and green, `check:letter`'s 63 included.
5. `npm run correspondent:provision -- <home> --dry-run` reads consensus, reports, and submits nothing.

## What is deliberately not in this window

`send`, `inbox` and `ack` wired to the live ledger; §10.4's schedule, which `send` still refuses outright rather than assembling an envelope whose sender paid for a receipt nobody was asked for; the `x402-usdc` leg; Postmaster-pays carry outside `buy_stamp`, so **T-P4-2 stays untested**; the WebMCP send side; `dns` and `nanda` in the letter path; HCS-25; rotation; screening at the doorbell. LIMITATIONS names our scoping as the reason for each — never Hedera, never the specification.

## Report at the end

Gate One's report, and stop. On Sonic's word, the run of record; then Gate Two's report, and stop again.

---

## Post-ruling — §G-19 answered, and the seam exercised

**2026-09-09, later the same day.** Sonic ruled §G-19 **(a)**: the Postmaster provisions the mailbox it sells. HEAD at the
start of this half was `b1638c2`, tree clean.

### The line this half drew before writing anything

**The provisioner must not move into the counter, and the ruling does not ask it to.** The topics are the agent’s, signed
with a key the Postmaster does not hold; the counter could not build those bodies if it wanted to (P-13). What moves is who
pays, and D-157 already built that as a seam. So the first question was whether the seam was real, and the answer is that
 `sdk/carry.ts` is four lines of substance and nothing above it changed.

**Where the risk actually was.** Carry without a policy is a blank cheque: an account with a balance and a signature it will
add to anything. So the work is `counter/carry.ts`, and the design question is what the policy reads. **It decodes the
bytes it signs.** The comfortable alternative — send a whole serialized transaction, parse it with the SDK’s typed getters,
sign the body derived from that parse — inspects one representation and signs another, and they agree only because the same
object produced them.

**Which meant a `TransactionBody` decoder, and therefore a court for it before a line of it was trusted.** The field numbers
were **probed** — four transactions built with the SDK, frozen offline, their bodies walked — and `check:correspondent`
re-probes them on every run by building each row with the real builder and asserting the decode. That is `core/protokey.ts`’s
lesson applied from the first line rather than after: its first version read `ThresholdKey.keys` as `Key.ed25519` because
both are field 2. And the probe earned its keep immediately — `CryptoUpdateTransactionBody.memo` is field **14**, where a
confident memory says 26.

### What was expected to be hard, and what actually was

**Expected:** the remote signer. It was four lines, because the seam was built as a seam.

**Not expected: a flat fee ceiling would have refused the doorbell.** A carried body names its own maximum fee and the
Postmaster is the account it comes out of, so a ceiling is the only thing between a published policy and an unbounded one —
and 2 ℏ looked prudent. `networks.ts` gives a fee-gated topic creation **100 ℏ**, observed to fail at 20 and to succeed at
100 charged far less. A 2 ℏ ceiling would have refused row 1 of every provisioning purchase, **after the transfer had
landed** — the one place in this exchange where a refusal is expensive rather than free. The ceiling is now per row and read
from the file the Correspondent builds the cap from. Caught offline by the check, before a signature.

**Also not expected:** that `liveConsensus` had been quietly building a `Client` of its own since it was written. The only
symptom was a `--dry-run` that printed its entire report and then never returned to the shell.

### Verification, before the gate

1. `npm run typecheck` — clean at the root and in `app`.
2. `npm run p13:check` — unchanged, both halves.
3. `npm run check:correspondent` — **105** assertions, no network and no key: the decoder against what the SDK froze, the
   carry policy paying for every row of the template and refusing every near-miss, and everything it checked before.
4. The rest of the battery unchanged and green — fifteen checks.
5. `npm run correspondent:provision -- <home> --dry-run` against two throwaway homes, one fresh and one returning: both
   print the plan with a payer against every row, and both exit 0.

### What is deliberately not in this half

Carry outside the purchase, so **T-P4-2 stays untested** and L-5 says so. The measurement of what a carried row actually
costs the Postmaster, so the authorised exposure is the network’s cap and LIMITATIONS says so. Everything Gate Two owes.

### Report at the end

Gate One’s amended report, and stop. It signs on Sonic’s word.
