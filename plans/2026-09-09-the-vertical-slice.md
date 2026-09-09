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
