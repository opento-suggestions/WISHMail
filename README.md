# WISHMail

**Certified mail for agents, on Hedera.**

WISHMail is a convention for sealed envelopes carried inside HCS-10 message operations, together with a certified layer — resolution proof, postmark, return receipt, attempted-delivery slip — such that any party can reconstruct a correspondence from public consensus data alone and appraise what each proof rests on.

It sells two claims, separately.

**Origin.** A stamped envelope is welded to its settlement event and to the witnessed resolution of its address. An envelope that was misresolved or mis-settled does not open.

**Story.** A correspondence is a chain of proofs on public topics, replayable by anyone from the specification alone — with no key, no stamp, no account, no credential, and no broker.

ETHOnline 2026 submission. Specification **0.5.13**; frozen at 0.5.0 on 2026-09-07 and patched thirteen times since. Wire
strings carry `0.5`, because a patch changes none (§1.7). Deployed on `hedera:testnet` and no other ledger.

## The proof, on `hedera:testnet`

**One certified letter, sent by an agent and signed for by another, with every step on public consensus.**
Run under goose on 2026-09-12, on two wallets that were minutes old and held nothing but ℏ.

### The receipt, one nanosecond after the signature

| | |
|---|---|
| the recipient signs the scheduled receipt | [`1789244564.149812104`](https://hashscan.io/testnet/transaction/0.0.10492957-1789244556-177581616) |
| the network executes it, and the receipt lands | [`1789244564.149812105`](https://hashscan.io/testnet/transaction/0.0.10492954-1789244459-853579572) |

The network executes the schedule **the instant her signature is the last one needed**. Note whose transaction
id the receipt carries: **the sender’s**. She signed for her own letter and was charged nothing for it, which is
invariant P-16 visible on the ledger rather than asserted in prose.

- **The schedule** [`0.0.10509266`](https://hashscan.io/testnet/schedule/0.0.10509266) — `executed_timestamp` is not null, three signatures
- **The receipt manifest** at sequence 1 of [`0.0.10509148`](https://hashscan.io/testnet/topic/0.0.10509148), **her own** manifest topic,
  chained back to chunk 0: *"0.0.10509139 opened this envelope with its AAD verified."*
- **The lane** [`0.0.10509262`](https://hashscan.io/testnet/topic/0.0.10509262) — its submit key is a threshold of exactly the two agents’ keys
- **The envelope** `3051fb6090d254cbb610470f722633fb119cd83aaa84ffae3ce19db98a113f8e`
- **The letter** `Certified agent mail proven on Hedera.` — 38 bytes, one chunk, sealed to 54

### The two agents, and everything they own

| | **DemoAgentY5** — recipient | **DemoAgentX5** — sender |
|---|---|---|
| account | [`0.0.10509139`](https://hashscan.io/testnet/account/0.0.10509139) | [`0.0.10509170`](https://hashscan.io/testnet/account/0.0.10509170) |
| doorbell (HCS-10 inbound) | [`0.0.10509142`](https://hashscan.io/testnet/topic/0.0.10509142) | [`0.0.10509173`](https://hashscan.io/testnet/topic/0.0.10509173) — **0 messages** |
| log (HCS-10 outbound) | [`0.0.10509145`](https://hashscan.io/testnet/topic/0.0.10509145) | [`0.0.10509176`](https://hashscan.io/testnet/topic/0.0.10509176) |
| manifest | [`0.0.10509148`](https://hashscan.io/testnet/topic/0.0.10509148) | [`0.0.10509177`](https://hashscan.io/testnet/topic/0.0.10509177) |
| declaration registry (HCS-2) | [`0.0.10509152`](https://hashscan.io/testnet/topic/0.0.10509152) | [`0.0.10509179`](https://hashscan.io/testnet/topic/0.0.10509179) |
| profile file (HCS-1) | [`0.0.10509153`](https://hashscan.io/testnet/topic/0.0.10509153) | [`0.0.10509181`](https://hashscan.io/testnet/topic/0.0.10509181) |
| operator wallet | [`0.0.10492957`](https://hashscan.io/testnet/account/0.0.10492957) | [`0.0.10492954`](https://hashscan.io/testnet/account/0.0.10492954) |

**His doorbell holds zero messages.** He rang hers; nobody rang his. A doorbell is not a mailbox, and an agent
that only sends never has one rung.

### The Postmaster

The stamp [`0.0.10426208`](https://hashscan.io/testnet/token/0.0.10426208), its treasury [`0.0.10426205`](https://hashscan.io/testnet/account/0.0.10426205), the price list on
[`0.0.10426551`](https://hashscan.io/testnet/topic/0.0.10426551) (four published schedules), and the payer [`0.0.8641261`](https://hashscan.io/testnet/account/0.0.8641261) that carries every
mailbox it sells. **Neither agent’s account existed until the transfer that created it**, and the Postmaster
holds no key of either (P-13).

### Read it back yourself, holding nothing

```
$ npm run verify -- --lane 0.0.10509262
  holding  no key · no account · no stamp · no counter · no home
  bundle digest   3245fa580c7aff4288af2c0a951febf491303533241657e56e05716984f6dd2f
  state           ACKED          receipt   acked
  APPRAISED       unverified     reasons   T-P12-4
```

**`unverified` is the correct answer and not a shortfall.** This release claims no resolution profile, so a
Verifier may not rank the resolution any higher than that — §1.5: silence claims nothing. The digest is stable:
two readings of the same lane agree, and the clock the reading was taken at is deliberately outside it.

**Earlier gates, their lanes and their agents:** [`docs/GATE-RECORD.md`](docs/GATE-RECORD.md).
**Every entity, generated and link-checked:** [`ENTITIES.md`](ENTITIES.md).

## What this does not do

**Stated here rather than found later.** Every line below is a scoping decision of ours inside a five-day
window, and none of them is a limitation of Hedera, of x402, or of the specification.

**It does not meet the Hedera x402 track qualification as written.** The `x402-usdc` method is published on
consensus in **every** `PriceList` sequence (asset USDC `0.0.429274`, facilitator x402.org, pinned to x402 v2
at `x402-foundation/x402`), it is accepted by `buy_stamp`’s input schema, it is priced by the Postmaster’s
quote path, and it is fully specified in §14.2 — where **T-P11-5** and **T-P11-6** court the exchange itself and
**T-P16-1** is the invariant the POSTMASTER class is deferred on. What is **not** built is this release’s side of
it: the `402` with its `PAYMENT-REQUIRED` requirements, the `PAYMENT-SIGNATURE` retry, facilitator
settlement, and the durable payment-reference record that survives a restart. **The Blocky402 facilitator is
referenced nowhere in this repository.** That was a scoping decision of **2026-09-09** (the MVP rulings, CLAUDE.md
§11), following the 2026-09-07 ruling that this window covers pre-funded operator paths only: the HBAR leg was
built first to prove the messaging layer end to end on consensus before a second payment rail was added.
**The demonstrated paid request settles in ℏ through the Postmaster’s own counter, and not through x402.**
One further exactness, recorded in ledger §G-34 and `LIMITATIONS.md` L-11: the published method is *priced*
by the counter, and a purchase made without `provision` would settle that price in ℏ rather than in USDC.
It is unreachable from an agent’s own surface and the error runs against the Postmaster, but it is a fault and
it is written down.

**It claims no conformance class.** `RELEASE.classes` is empty, and §1.5 is explicit that silence claims
nothing. The reason is not shyness: **T-P3-1 requires a second, independent implementation** — a fresh Verifier at
another patch, at another time, through another mirror node, reaching the same bytes — and this deployment is one
implementation. Every conformance class includes VERIFIER, so that single row keeps every class from passing in
full. That is what publishing a specification is for, and it is not a shortfall we can close by ourselves.

**It claims no resolution profile, so the demonstration letter appraises `unverified`.** That is the **correct**
output under §9.6 and not a failure: a Verifier may rank a resolution no higher than the profiles the release
claims, and this one claims none. The reason code is `T-P12-4`, and it is the same answer a stranger gets.

**Three registry profiles are specified and are not in the letter path.** `dns` and `nanda` are defined in
§9 with their trust classes and are not wired into `send` in this window. The **A2A AgentCard** is named as an
extension candidate and **held** (§16.8, D-128): it has no profile of its own until a release wants one.

**It runs on `hedera:testnet` and nowhere else.** `hedera:mainnet` is defined in the specification and
undeployed; any other ledger tag is refused.

**It provides no forward secrecy**, and it says so rather than implying otherwise.

**It proves availability, never consumption.** A return receipt is the recipient’s own signature witnessed by
consensus — it proves the envelope was resolved, settled, opened and signed for. It does not prove, and this
protocol cannot prove, that a human or an agent then *acted* on it. §2.3 reserves *delivery* for the lane, and
nothing here turns silence into refusal.
## The golden path

**Provision → buy → resolve → send → inbox → ack → verify.** Six tools, one letter. What follows is what the run above
actually did, with its own measured costs.

**1. `buy_stamp` with `provision` — the agent is bought, not funded.** One atomic transfer with three legs:
ℏ from the buyer to the Postmaster for the price; twelve `$POSTAGE` from the treasury to the agent’s **public-key
alias**, which is the leg that *creates the account* (HIP-542); and 0.05 ℏ from the Postmaster into that same
alias so the agent can pay for its own name on the registry. **The Postmaster pays and the agent signs**, every
topic creation included. Measured: 43.41849606 ℏ each, plus 0.67092479 ℏ for the operator to associate the
token first.

**2. `resolve` — an address becomes coordinates, with nothing configured.** The sender walks the recipient’s
account memo to an HCS-2 registry, the registry to an HCS-1 profile, and the profile to a doorbell and a key
epoch — and keeps the proof. **That proof’s hash goes inside the envelope’s AAD**, so an envelope carries the
resolution it was addressed by.

**3. `send` — one sealed envelope, welded to what it cost.** The sender’s operator held no stamp, so §4.4’s
hop moved one from the agent to its operator; the ring on her doorbell consumed it as an HIP-991 fee to the
treasury; her watcher answered and **the lane was born on her side**; two stamps settled to the treasury under a
memo naming *this envelope and no other*; chunk 0 landed; and a `ScheduleCreate` put the receipt in escrow.
`send` returns chunk 0’s postmark **before anyone signs** — a postmark is not a delivery.

**4. `inbox` — it opens, or it does not.** The recipient rebuilds the AAD from the header and the lane it
arrived on. That must hash to the envelope’s identifier, and the seal is authenticated against it, so **an
envelope that was misresolved or mis-settled does not open** — it is reported unbound, not decrypted anyway.

**5. `ack` — the recipient signs, and the network publishes.** She signs the scheduled receipt; it executes
the instant her signature completes it; and the manifest is published to **her own** topic, naming what she
opened and chaining back to chunk 0. She pays nothing and no stamp of hers moves.

**6. `verify` — a stranger reconciles the whole thing.** No key, no account, no stamp, no home, no broker.
Reassembly is a walk on bytes rather than on clocks, and every claim is ranked no higher than the evidence
supports: **appraised never exceeds declared**, and missing evidence downgrades rather than erroring.

### What counts as done

**Not `send` returning, and not any card.** Green is two facts on a mirror node, read afterward:

1. the schedule’s `executed_timestamp` is **not null**, and
2. the receipt manifest is on the **recipient’s own** manifest topic, at a sequence number, hashing to what the
   schedule carried, chained back to chunk 0’s postmark.

## How to read this repository

It is large because it keeps its evidence. **Seven files carry almost all of it:**

| file | what it is |
|---|---|
| [`spec/WISHMAIL_SPEC_v0_5.md`](spec/WISHMAIL_SPEC_v0_5.md) | **the only normative document.** Where anything else disagrees with it, it wins |
| [`docs/GATE-RECORD.md`](docs/GATE-RECORD.md) | the whole shape in one file, with a HashScan link on every id. **Start here** |
| [`app/OPERATIONS.md`](app/OPERATIONS.md) | the record itself: one gate report before every signature, one run of record beneath it |
| [`ENTITIES.md`](ENTITIES.md) | every entity on `hedera:testnet`. Generated; `npm run check:entities` fails on a hand-edit |
| [`conformance/DERIVATION.md`](conformance/DERIVATION.md) | why each test expects what it expects — written before any body was |
| [`LIMITATIONS.md`](LIMITATIONS.md) | what this deployment does not defend, named as our scoping and never as the ledger’s |
| [`CHANGELOG.md`](CHANGELOG.md) | every change, with who made it |

**The history is preserved on purpose, and that is why the record is long.** A gate report is written and
committed *before* the first signature it authorises, and it is **never amended afterwards** — a correction goes
in the run of record beneath it, dated, and the original stands as it was. So every signed act on
`hedera:testnet` has a prediction written before it and a measurement written after, and anyone can compare
the two. What looks like bloat is the provenance; deleting it would cost exactly the thing the repository is
for.

**Divergences are recorded, not quietly repaired.** Two live ones, both with their mechanism at file:line:

- **The model retypes a payload instead of copying it.** Twice on consensus a letter landed altered — once a
  character short, once the same length with padding the literal did not have, which is what proved it was
  re-encoding and never truncation. The fix is a read-back step before the irreversible one, and **the letter
  above is the first to arrive byte-identical**.
- **The lane-birth path reads the mirror once** where reading twice would have cost nothing, so a topic not yet
  ingested reads as malformed and the answer is retried — by creating another topic. One run left five empty
  ones. They are deletable, unlike an earlier gate’s residue, and the arithmetic closes to a thousandth of an ℏ.

**A failing conformance body is a finding brought, not a chore.** 44 of 87 pass; the bodies were written from a
table drafted before any of them existed — *the code is the defendant, not the judge* — and on their first run
they found eleven defects in this implementation, every one now fixed and proved by the body that found it. Of
the 43 that do not pass, 34 are registered rows with no body that say so, and 9 are bodies failing on a clause
they name. **None is made to pass by narrowing it.**

**Three registers run through the record**, so a reader can tell whose claim is whose: **RECORD** — Sonic ruled
it; **FETCHED** — taken from a dated, cited source; **MINE** — the model’s own inference, unruled.

## The earlier correspondents

**Nine agents have bought a mailbox on `hedera:testnet`, and seven letters have travelled between them across
five lanes.** The two above are the newest. Beside them stand the Postmaster’s own entities — the treasury and
the `$POSTAGE` token, the price topic with four published schedules, the Postmaster-agent’s six topics, and the
fourteen JSON Schemas of §5, each registered as an HCS-1 file on its own HCS-2 topic — and the first three
Correspondents, each an agent whose account did not exist until the transfer that created it:

```
A2   0.0.10462700   doorbell 0.0.10462704   log 0.0.10462708   manifest 0.0.10462713
B    0.0.10452127   doorbell 0.0.10452149   log 0.0.10452150   manifest 0.0.10452154
C    0.0.10468684   doorbell 0.0.10468687   log 0.0.10468689   manifest 0.0.10468692

A2 -- 0.0.10464056 --> B        three letters, both directions, one lane
B  -- 0.0.10468898 --> C        first contact and a return receipt, in ONE send() call
```

Each signed every one of its own topic creations in its own process and **the Postmaster paid for all eight** — that
is §6.1's carry — and each then paid for its own name on the HOL registry anchor out of the 0.05 ℏ its purchase
funded, so that §9.5 assigns it no `blurred`. All three resolve under `hcs14` and `hol`, and each `StampReceipt`
names every entity the Postmaster created for it, at a rate any stranger can re-obtain from a mirror node at the
receipt's own timestamp.

**The whole of it, read end to end — every act, with its HashScan link: [`docs/GATE-RECORD.md`](docs/GATE-RECORD.md).**
That is a reading; the records themselves are `app/OPERATIONS.md`, one gate report and one run of record per signed
act, where a gate report is never amended after its run.

**Every id, with a HashScan link: [`ENTITIES.md`](ENTITIES.md).** It is generated from `app/deployment/` and
`spec/pins.json` — `npm run check:entities` fails if it is ever hand-edited — and it has a second table headed
**RESIDUE — NOT OPERATING**, because three `$POSTAGE`-shaped tokens exist on this testnet and exactly one is the stamp.

## Where conformance actually stands

**Eighty-seven tests registered, fifty-three written, forty-four passing. No class claimed. A report is emitted.**

```
$ npm run conformance
  register        87 tests (82 core + 5 extension), §A
  files           87 present, 0 missing, 0 unregistered
  selected        87
  passed          44
  failed          43
  report          conformance/reports/all.json
  reportDigest    51453eea7d11dee8a5cfa71b84de826682d8283c543be48ec65c95625daeb6ec
```

**That is the honest state and not a failure**, and the difference matters: the suite is the eighty-seven tests the
specification's own `Conformance:` notes name — one file each, every one keyed to the invariant it serves — and they
are written as failing stubs first because a test that exists only after the code it checks is a test shaped by the
code. **Of the 43 that do not pass, 34 are registered rows with no body that throw `NOT EXPANDED` naming what
they are for, and 9 are bodies failing on a clause they name.** On their first run the expanded bodies found
eleven defects in this implementation, every one now fixed and proved by the body that found it. **A failing
body is a finding brought, and none of them is made to pass by narrowing it.** What changed at 0.5.10 is that the *report* is now permitted at all: T-P9-2 refuses a conformance claim while any
pin in `spec/pins.json` is null, and the last of those closed when the fourteen schemas were registered on consensus.
The register grew by one at 0.5.12, when a requirement §11.4 had always stated was found to have no test of its own
and got one (D-176).
**`RELEASE.classes` is empty, so this release claims nothing** (§1.5: silence claims nothing), and a build guard makes
it an error to claim a class beside a `NOT_IMPLEMENTED` body.

## Running it

Node 20 or newer (`engines.node` is `>=20`; this was built and run on 22). `npm install` at the root.

```
npm run counter        # the Postmaster's counter: Streamable HTTP MCP on 127.0.0.1:4600
                       #   buy_stamp, verify, resolve  (§14.2's resource server)
                       #   needs .env — see .env.example

npm run correspondent  # ONE AGENT: stdio MCP, for goose. Its keys are born in it and
                       #   stay in it; the Postmaster holds none of them, ever (P-13).
                       #   Point goose at this as a stdio extension.

npm run correspondent:provision:plan -- <home>
                       # DRY RUN, and the default: read consensus, submit nothing,
                       #   print who pays for each row of the mailbox.

npm run correspondent:provision -- <home>
                       # LIVE — buys a mailbox and registers a name. D-159's order,
                       #   every step idempotent against consensus.
```

**Every driver that can sign defaults to DRY RUN**, and goes live only when `--live` arrives in its own `argv` —
which it prints, with the whole of `argv`, *before it reads a key*. The `--live` flag is baked into the script string
where no forwarding can lose it. That inversion was bought: on 2026-09-10 an appended `--dry-run` was eaten by a root
script's nested `npm run … --workspace app`, the driver printed LIVE, and a Correspondent was provisioned
unauthorised. The run is recorded as a divergence in `app/OPERATIONS.md`, not tidied away.

**A home directory IS the agent** (D-165): its config is the operator's, its keystore holds keys born on first run, and
a fresh home is a new agent. Copy `app/sdk/config.template.json` to `<home>/config.json` and fill it in; the repository
ships a template and never a filled one, and `npm run p13:check` is what keeps it that way.

**To verify, you need none of this.** `verify` reads a mirror node and a mirror node is a read interface, not a broker
— no key, no account, no stamp, no credential (P-4).

**Where to look next:** what is built and in what order, [`STATUS.md`](STATUS.md) · what this deployment does not
defend, [`LIMITATIONS.md`](LIMITATIONS.md) · what changed and why, [`CHANGELOG.md`](CHANGELOG.md) · the only normative
document, [`spec/WISHMAIL_SPEC_v0_5.md`](spec/WISHMAIL_SPEC_v0_5.md) · the rules a change is made under,
[`CONTRIBUTING.md`](CONTRIBUTING.md).

## What it is not

WISHMail defines no transport — HCS-10 does, and WISHMail defines only what rides inside it. It operates no registry; registries are external, read-only, and plural, and WISHMail never adjudicates between them. It claims no forward secrecy. It delivers nothing to a recipient's hand: consensus witnesses, recipients read, and there is no push or notification surface. It carries no broadcast — a stamp buys one envelope to one address. And it does not certify unstamped HCS-10 messaging, or make any claim about it.

## The six tools

```
resolve      an address -> coordinates and a resolution proof, under a named profile
buy_stamp    stamps from the Postmaster, in USDC over x402 or in HBAR
send         one sealed envelope to one resolved address
inbox        read your own lanes; open what binds
ack          acknowledge an envelope that opened: produce its return receipt
verify       reconcile a correspondence from consensus alone — free, forever
```

## The shape of it

```
   registries --resolve--> Assembler --binds--> sealed envelope, signed by the sender
   (read-only)             (the sender's)               |
                                                        | the Postmaster carries
                                                        | (pays; attests nothing)
                                                        v
   Verifier <--public data-- Consensus <--------------- lane (HCS-10 connection topic)
   reconciles               witnesses: postmark         |
   (replay + lookup)                                    v
                                                 recipient opens (AAD verifies)
                                                 recipient acknowledges (return receipt)
```

No actor performs another's verb. The Assembler binds, Consensus witnesses, the Verifier reconciles, the Postmaster carries. That grammar is the separation of powers the whole design rests on.

## The repository

```
spec/           WISHMAIL_SPEC_v0_5.md — the only normative document
                CONFORMANCE_TESTS_v0_5.md — the working ledger; nothing in it is normative
                schemas/  fourteen JSON Schemas, one per data object
                vectors/  aad.json, seal.json — the court for T-P1-4 and T-P1-5
                pins.json the machine-readable form of the pinned standards
                adr/      one architecture decision record per decision, D-1 onward
conformance/    the suite: one test per T-<P-ID>-<n>, keyed to the invariant it serves
app/            the reference implementation: MCP server, WebMCP page, SDK, CLI, resolvers
provenance/     read-only history: where the design came from, the venue's rules, and
                recon/ — dated fetches of the standards and the pins drafted from them.
                Binds nothing; the specification governs, in every particular
plans/          the plans this build was directed by. Binds nothing; artifacts, not rules
docs/           readings of the record, for a reader who wants the shape rather than
                the log. Binds nothing; app/OPERATIONS.md and ENTITIES.md are the records
ENTITIES.md     every entity on hedera:testnet, and which of them operate. Generated
```

**Start here:** `spec/WISHMAIL_SPEC_v0_5.md`. Read §1 (scope, classes, pins), §2 (vocabulary — the names in code are these names), then §5 through §12.

Contributing, and the rules a change is made under: `CONTRIBUTING.md`. What this deployment does not defend: `LIMITATIONS.md`. What is built, and in what order: `STATUS.md`.

## Conformance

Four classes, on one floor.

```
        +---------------+   +-------------+   +-------------+
        | CORRESPONDENT |   |  RECIPIENT  |   | POSTMASTER  |
        +-------+-------+   +------+------+   +------+------+
                |                  |           =======+=======  the pedestal:
                |                  |                  |         issues the stamp
        +-------+------------------+------------------+-------+
        |                       VERIFIER                      |
        |             the floor: every class verifies         |
        +-----------------------------------------------------+
```

VERIFIER conformance is achievable with no private broker, API key, credit, Hedera account, stamp, or recipient key configured. That is not a courtesy; it is the point. A mirror node is a read interface, not a broker, and evidence never depends on which one you read.

Seventeen invariants (P-1 – P-17), eighty-seven conformance tests, and no MUST without a test. A conformance claim names the classes, profiles, and pins it was measured against; silence claims nothing.

## Status

The specification is frozen and the Postmaster’s deployment stands on `hedera:testnet` as **seventy-five rows in `app/deployment/hedera-testnet.json`**, each with the transaction that made it and the mirror-node read that confirmed it: the `$POSTAGE` token and its treasury, the price topic carrying **four** `PriceList` messages, the reference agent's doorbell, log and manifest, its `hcs14` declaration — an HCS-2 registry, an HCS-1 profile file, and the account memo that points at them — and, since 2026-09-09, the **fourteen schemas of §18.5 registered under HCS-13**, each with a file topic, its chunks, a registry and a `register` entry. `resolve` walks the declaration chain back from consensus with nothing configured, and every `schemaRef` resolves to bytes identical to `spec/schemas/`. The schemas are now **frozen**: §1.7 lets a patch change no registered schema, so the smallest field in any of the fourteen is a new minor version.

**No conformance claim is valid yet**, and the reason has changed. `spec/pins.json` has no unfilled pin, so T-P9-2 permits a report and the suite writes one — and that report records **44 passes and 43 failures**, of which 34 are registered rows with no body. T-P15-3 lets a claim name no class whose suite did not pass in full. Registering the schemas made a claim checkable, not true.

**Five gates have run on `hedera:testnet`**, each under a gate report committed before its first signature and each with a run of record beneath it: a mailbox bought through the counter (2026-09-09), the letter loop with a return receipt and a reply (2026-09-10), the whole of §6.4 in one `send()` call (2026-09-10), a brand-new wallet carried through the whole lifecycle (2026-09-11), and the first gate driven by a model rather than a CLI (2026-09-12). **Beneath them is the recorded take** (2026-09-12), the correspondence at the top of this file. Read end to end: [`docs/GATE-RECORD.md`](docs/GATE-RECORD.md).

Where the build stands, and what is not built: `STATUS.md` §6. What was provisioned, with each entity's creation transaction and the mirror-node read that confirmed it: `app/deployment/hedera-testnet.json`. The method, and every departure from a tool's default path: `app/OPERATIONS.md`.

## How this was built

Written with Claude Code, under direction. Disclosed here because ETHGlobal's rules ask for it, and because this repository's own rule is that every change be explainable with the agent closed — the commit message says what changed and why in terms of the specification's sections and the test it serves, and a reviewer with no access to any AI can follow it (`CONTRIBUTING.md`, "The AI clause").

**The division of labour.** Every ruling is Sonic's. The specification's frozen text, the scope line, and all one hundred and seventy-eight decision records — `spec/adr/`, D-1 – D-178, of which the ledger's §B holds D-42 onward — are his rulings; nothing became normative because a model proposed it. Claude drafted specification and ledger prose against those rulings, ran the dated reconnaissance now in `provenance/recon/`, wrote the TypeScript under `app/src/`, and ran the provisioning against `hedera:testnet`. Where Claude's own inference stands unruled it is marked **MINE** in the ledger, distinct from **RECORD** (Sonic said it) and **FETCHED** (from a dated, cited source) — a register kept precisely so that a reader can tell which is which without asking.

**Where to look, four places.**

- `CLAUDE.md` — the standing instruction, at the root, read at the start of every session. It is the prompt.
- `plans/` — the per-window plans, verbatim as approved, with a README mapping each to the commits that executed it.
- `CHANGELOG.md` — attribution per entry, under the key at the top of the file: **[S]** Sonic, **[C]** Claude in chat, **[CC]** Claude Code.
- The git history — every commit carries `Signed-off-by:` under the DCO and `Co-Authored-By:` the model that assisted it, and the history is incremental by construction.

**Nothing is reused.** All work here began after ETHOnline 2026 opened. No code was imported, ported, or paraphrased from any earlier WISHMail or related repository; the prior thinking that guided the design is in `provenance/`, labelled as provenance and binding nothing. Third-party code is declared in the two `package.json` files: `@hashgraph/sdk` for every transaction, `@modelcontextprotocol/sdk` for the tool surface, `ajv` and `ajv-formats` for JSON Schema, `canonicalize` for RFC 8785, and `dotenv`. The canonicalizer is a library rather than a hand-rolled one because `spec/vectors/aad.json` is the court and one implementation must serve both the price list and the envelope. The seal went the other way: RFC 9180 base mode is composed here on `node:crypto`, because the RFC publishes no vector for §7.3's ciphersuite and Appendix A.1 — which shares its KEM and KDF — can be run through the same code as a court. Both rulings are written out in `app/OPERATIONS.md`, in the same form and with opposite conclusions.

**No key material anywhere.** Keys are born in the agent's process and never leave it; `.gitignore` matches `.env*` with `!.env.example` negated back in, and `npm run p13:check` is the grep that keeps it that way (P-13).

## License

Apache 2.0. See `LICENSE`. Contributions are certified under the Developer Certificate of Origin 1.1 (`DCO`); commit with `git commit -s`.
