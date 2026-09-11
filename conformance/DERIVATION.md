# The derivation table — where every conformance body comes from

**Written 2026-09-10, before any body was written.** This is the plan and the record. A body not in this
table is not written, and a row's entry here is what its body is allowed to do.

`spec/CONFORMANCE_TESTS_v0_5.md` §A is the register: **87 rows, 82 core and 5 extension.** This file adds
nothing to it and takes nothing from it. §A's sketch is the scope of each test; this says what fixture
reaches that sketch, what the body expects, and why the expectation follows from the specification's text
rather than from the implementation's behaviour.

**The code is the defendant, not the judge.** A body is derived from the §A sketch and the MUST it courts.
Where the sketch and the code disagree, the body follows the sketch, fails, and the failure is a finding
brought rather than adjusted. A body written from `verify.ts` or `send.ts` would prove that the
implementation agrees with itself, which nobody doubted.

---

## The six kinds of fixture, and which need a ruling

| Kind | What it is | Needs a ruling? |
|---|---|---|
| **captured** | One of the four correspondences in `conformance/fixtures/`, byte for byte as a mirror node returned it. | No |
| **altered** | A deliberately altered copy of captured bytes, with the alteration named in the body. | No |
| **reconstructed** | A §5 or §6.5 object rebuilt from captured bytes where the capture cannot itself produce it — because producing it needs a key the capture deliberately does not carry. Used once (T-P1-9). | No, but flagged |
| **artifact** | A repository file the sketch itself names: `spec/vectors/*.json`, `spec/schemas/`, `spec/pins.json`, `LIMITATIONS.md`, `app/src/release.ts`, the tool-schema tables, the report. | No — the sketch names the file |
| **model** | The modelled ledger, `app/src/tools/memory.ts`, stood up by `conformance/support/world.ts`. | Ruled 2026-09-11; §E carries it, §F what it reached |
| **none** | Nothing reaches the sketch. The row is not expanded and the reason is named. | — |

**`model` was the open question when section A was written**, so no row below it is expanded against the
model and ten are marked `model — pending`. **It was ruled the same night and §E carries the ruling**:
permitted for a clause whose sketch is behaviour — a refusal, an ordering, a window, a price computation —
in any class; refused for any clause whose claim is replay of consensus; every model-backed body marked
`model` in the report and counting toward no profile claim.

## Three rules this table follows

1. **A body covers its whole sketch, or it says which clause it could not reach and fails.** A partial body
   that passed would tell the register something false. Rows below marked **partial** are expanded, do all
   the reachable work, and then fail naming the clause that is out of reach. They count as `expanded` and as
   `failed`, and a claim is made off `passed` alone, so nothing is over-claimed by them.
2. **The registered bodies share fixtures with the twenty-two `check:*` courts and share no code that
   decides a verdict.** A fixture loader is plumbing; an assertion is not. The duplication is deliberate.
3. **"Not expanded, because X" is a correct line on the harness.** A body that faked X would not be.

---

## A. The table

Class letters: **P** POSTMASTER · **C** CORRESPONDENT · **R** RECIPIENT · **V** VERIFIER · **all**.

### P-1 — Binding (12 rows)

| Test | Classes | MUST courted | Fixture | Expected | Reason it follows |
|---|---|---|---|---|---|
| T-P1-1 | R, C | §6.5 — an altered header, lane or resolution proof fails closed | **altered** — checkpoint-one, three alterations: `hdr.id`, the same chunk relocated to another topic, `hdr.rp.h` | `opened:false`, `INBOX_UNBOUND` on each | §7.2's AAD is `{p,v,l,lane,rp,nc}`; each alteration changes one of them, so the header no longer rebuilds to the `id` the chunks carry (§5.6) |
| T-P1-2 | R, C | §6.5 — settlement memo ≠ `id` | **altered** — checkpoint-one, the settlement's memo | `opened:false`, `INBOX_UNSTAMPED` | §4.3 fixes the memo as `wishmail:<id>`; a memo naming another envelope is postage for another envelope |
| T-P1-3 | R | §6.6 — `ack` refuses an envelope returned unopened, **for every §6.5 reason** | **altered** — four deliveries, one per reason | `ACK_NOT_OPENED` on each — **and a fifth reason that cannot be produced** | §6.5 names five reasons; `inbox` never returns `INBOX_SCHEMA_UNRESOLVED`. **partial — expected FAIL**, finding F-1 below |
| T-P1-4 | all | §7.2 — header fields → AAD bytes → `id` | **artifact** — `spec/vectors/aad.json` | every case recomputes `bytes` and `id` exactly, and `rebuild` goes the other way | The sketch names the file as its court |
| T-P1-5 | C, R | §7.3 — reference seals, independent opens, and the reverse | **none** | — | Needs a second implementation of §7.2–§7.3 that does not share the reference's code path. `spec/vectors/README.md` and STATUS §5 both record that it does not exist |
| T-P1-6 | R, C, V | §7.2 — chunks' `operator_id` account ≠ settlement's `from` | **altered** — checkpoint-one, `operator_id` | `INBOX_UNBOUND` at `inbox`; `unbound` with `T-P1-6` at replay | §7.2's fourth weld: the sender is the account that affixed the postage, and the chunks must be submitted by it |
| T-P1-7 | V, R | §8.3 — receipts witnessed before the nth chunk, or on an unstamped or unbound envelope | **altered** — gate-three: the execution moved before chunk 0; and the settlement broken so the standing is `unstamped` | `receipt.status` = `invalid` with `T-P1-7`; the envelope's state unchanged | §8.3's MUST: a receipt moves an envelope to ACKED only where it is SETTLED and its standing is verified or unverified |
| T-P1-8 | R, V | §10.4 — the receipt mechanism, five clauses | **captured** gate-three for the positive; **altered** for four negatives (signature removed, manifest on another topic, another recipient named, the schedule's body not a submission) | positive `acked`; each negative `invalid` with `T-P1-8` | §10.4 makes the receipt the execution of a scheduled submission to a topic only the recipient's key can write to; D-172 amended the signature clause to "among its signatures" |
| T-P1-9 | R | §10.4 — `ack` refuses a schedule whose body names a different identifier, postmark or epoch | **altered + reconstructed** — gate-three's schedule with its inner body re-pointed; a §6.5 `Delivery` rebuilt from the captured envelope | `ACK_NOT_OPENED` on each of the three | The receipt's three inputs are inside its hash (§10.4); a schedule naming any other recomputes to a different hash. **The reconstruction is flagged**: the capture carries no key, so it cannot itself produce an opened delivery |
| T-P1-10 | R, V | §11.4 — `hdr.ke` ≠ the bound resolution's `keyEpoch` | **none** | — | Compares against coordinates only a claimed-profile replay produces, and **no capture carries the registry and profile topics the replay reads** (finding F-2). Recorded already in `captured.check.ts` and LIMITATIONS L-1 |
| T-P1-11 | C, R, V | §7.4, §11.3 — three clauses: `nx` rejected at `send`; a foreign chunk landing first; slices not concatenating to `hdr.h` | **altered** — checkpoint-two-receipt's ten-chunk envelope, for clause 3 | clause 3: `INBOX_UNBOUND` and `unbound` at replay | Clause 1 needs `send` with a writer; clause 2 needs the envelope to open, which needs a key. **partial — expected FAIL** |
| T-P1-12 | V | §8.6, §11.4 — a receipt for an envelope whose `hdr.rr` is false | **altered** — gate-three with `hdr.rr` cleared | `receipt.status` = `acked`, reasons exactly `['T-P1-12']`; state and standing identical to the pristine copy | `rr` is **not** an AAD field, so clearing it leaves the binding intact — which is what makes this alteration honest. D-176 registered the row so the reason would stop being borrowed from `T-P12-2` |

### P-2 — The Postmaster is blind (4 rows)

| Test | Classes | MUST courted | Fixture | Expected | Reason |
|---|---|---|---|---|---|
| T-P2-1 | P, C | §3.5 — every lane message signed by the sending agent's key | **model — pending** | — | Consensus records the payer, never the signer (`consensus.ts`), so captured bytes cannot show who signed. The second clause needs a submission to be refused, which needs a ledger that refuses |
| T-P2-2 | P | §3.5 — arbitrary ciphertext carried identically | **none** | — | This release has no Postmaster carry for envelope chunks: carry exists only inside `buy_stamp` (MVP scoping, D-168) |
| T-P2-3 | P, V | §16.2 *(extension)* | **none** | — | Extension, and `RELEASE.extensions` is empty (§16.1, D-111). Also needs an Attestation fixture, and the reference has no `attest` tool by design |
| T-P2-4 | P | §6.1, D-157 — a Postmaster refuses at carry a request bearing only its own signature | **none** | — | Needs the counter's carry decision over a body; the counter stays down and no capture carries a carry exchange |

### P-3 — Public-data replay (6 rows)

| Test | Classes | MUST courted | Fixture | Expected | Reason |
|---|---|---|---|---|---|
| T-P3-1 | V, P | §3.7, §11.7 — replay by a **fresh Verifier at a different patch, time and mirror node**, byte for byte | **none** | — | One implementation run twice is determinism, which this test presupposes and is not satisfied by. The offline court meets one of its four conditions (another patch of 0.5); the other three wait on somebody else's Verifier |
| T-P3-2 | V, P | §8.5, §11.5 — the exception corpus, and for each fixture `reasons` is the full set it was built to trigger and `standing` the minimum over them | **altered** — a corpus of nine exception cases built into `conformance/corpus/` | each case's `reasons` exactly as built; `standing` the minimum | Clause 2 is a one-Verifier claim and is discharged. Clause 1 ("identical from reference and independent Verifier") needs the second implementation, and the **orphan** case is unreachable — §11.2's ingestion table reaches a settlement only through a chunk. **partial — expected FAIL** |
| T-P3-3 | V | §8.5 — reassembly walks the chain, takes the earliest chunk the chain admits, records off-chain, unrooted and conflicting chunks without using them | **altered** — checkpoint-two-receipt's ten chunks: a duplicate, a conflicting `n`, an unrooted chunk, a foreign chunk landing first | the walk's `chain`, `offChain` and state exactly as §8.5 fixes them | §11.3 is explicit that reassembly is a walk on bytes and not on clocks |
| T-P3-4 | V | §11.7 — every narrative's `bundleDigest` equals the digest of the bundle it came from; one presented with another bundle is rejected | **captured** — all four | equality on each; rejection when the bundle is swapped | §11.7 fixes the narrative as produced from the bundle and from nothing else. The test is itself the reader §11.7 describes |
| T-P3-5 | V | §11.2 — settlement, `connection_created` and manifest before the window's `from`, chunks inside it, **appraises verified** | **none** | — | Nothing can appraise `verified` from these captures: a claimless Verifier yields `T-P12-4`, and a claimed one yields `T-P6-1` because the profile topics are absent (F-2) |
| T-P3-6 | V | §11.2, F-3 — a settlement with no chunk, read from the treasury's inbound transfers | **none** | — | `Reader` has no method that reaches an account's transfers, and §11.2's ingestion table is closed and reaches a settlement only through a chunk. Recorded as a finding in `verify.ts`'s own header, MINE 2026-09-08 |

### P-4 — No broker, key or credit (3 rows)

| Test | Classes | MUST courted | Fixture | Expected | Reason |
|---|---|---|---|---|---|
| T-P4-1 | V | §1.4 — the VERIFIER suite passes with no credential of any kind configured | **captured** — all four, appraised with `process.env` stripped | appraisals identical to the captured ones | P-4 in as many words. The body proves the environment carries nothing and the whole VERIFIER read path still runs; "the suite passes" is the report's own statement and not a body's |
| T-P4-2 | P, C | §3.5 — a Correspondent with nothing but stamps and its own keys completes `send` through the reference Postmaster | **none** | — | Postmaster-pays carry for an agent's own submissions is deferred by MVP scoping; CLAUDE.md §11 names T-P4-2 untested in as many words |
| T-P4-3 | V | §11.1 — two independent mirror nodes, identical evidence digests | **none** | — | Every capture is from one mirror. Two `Reader`s over one mirror's bytes is not two mirrors |

### P-5 — Profiles are orthogonal (4 rows)

| Test | Classes | Fixture | Reason |
|---|---|---|---|
| T-P5-1 | C | **none** | Needs the CORRESPONDENT suite green under each supported profile as sole profile; `dns` and `nanda` are deferred from the letter path (MVP scoping) |
| T-P5-2 | R | **none** | Same, for RECIPIENT |
| T-P5-3 | P | **none** | Needs Postmaster carry (see T-P2-2) and more than one profile |
| T-P5-5 | C | **none** | Extension §16.5, unclaimed; the `document` profile is not implemented |

### P-6 — Resolution is a proof (7 rows)

| Test | Classes | MUST courted | Fixture | Expected | Reason |
|---|---|---|---|---|---|
| T-P6-1 | C, V | §6.2 — altered inputs no longer hash to the proof | **none — and the sketch is contradicted** | — | §A's sketch says the envelope "appraises **unbound**"; §11.5's table (spec line 1700) puts `T-P6-1` under **unverified**, and `verify.ts` implements the table. A sketch that contradicts the normative table is a ledger §G item, not a body edit. **Finding F-3** |
| T-P6-2 | C, V | §9.1 — a manifest recomputes to its hash from its locator; a non-consensus manifest without a snapshot is rejected at `send` | **captured** — all four manifests | each recomputes | Clause 2 needs `send` with a writer. **partial — expected FAIL** |
| T-P6-3 | C | §9.2 — the whole `hcs14` matrix | **model — pending** | — | Needs declaration, registry and profile fixtures; no capture carries them (F-2) |
| T-P6-4 | C | §9.3 — the `dns` rule | **none** | — | `dns` is deferred from this release (MVP scoping) |
| T-P6-5 | C | §9.5 — the `hol` rule | **model — pending** | — | Needs anchor and profile fixtures; the HOL anchor's messages are in no capture |
| T-P6-6 | C | §16.6 *(extension)* | **none** | — | Extension, unclaimed |
| T-P6-7 | V | §11.1, D-163 — a manifest whose `meaning.uri` names a topic where nothing recomputes appraises unverified with `T-P6-7`; one that recomputes at its own location appraises verified | **captured + altered** | the negative fires `T-P6-7`; the positive does not | The positive's "appraises verified" is unreachable — a claimless Verifier is `unverified` by `T-P12-4` and a claimed one by `T-P6-1` (F-2). **partial — expected FAIL** |

### P-7 — Postage is consumed (5 rows)

| Test | Classes | MUST courted | Fixture | Expected | Reason |
|---|---|---|---|---|---|
| T-P7-1 | P, C, V | §4.3, §8.3 — no settlement, a memo mismatch, or a settlement not earlier than chunk 0 | **altered** — three alterations of checkpoint-one | `unstamped` with `T-P7-1` on each | The `send` clause needs a writer. **partial — expected FAIL** |
| T-P7-2 | P, V | §4.3 — a pair sharing a settlement appraises one stamped, one unstamped, by consensus order | **altered** — checkpoint-two-reply, two chunk 0s pointed at one settlement | the later one `unstamped` with `T-P7-2` | `hdr.st` is not an AAD field, so re-pointing it leaves the binding intact. The `send` clause needs a writer. **partial — expected FAIL** |
| T-P7-3 | P, V | §4.2 — fewer stamps than the weight | **altered** — the settlement's amount below `headerPostage` | `unstamped` with `T-P7-3` | The `send` clause needs a writer. **partial — expected FAIL** |
| T-P7-4 | R, C | §4.4, D-105, D-137 — the doorbell's HIP-991 fee, its collector, and the owner's exemption | **captured** — the reply's doorbell `0.0.10452149` and gate-three's `0.0.10468687` | exactly one unit of the pinned stamp token, collector the treasury, the owner's key fee-exempt; and no fixture resolves to a doorbell naming another collector | Three of four clauses. "A fee-less request is rejected at the network" needs a ledger that refuses. **partial — expected FAIL** |
| T-P7-5 | C | §8.7 — a retried `send` after a failure | **model — pending** | — | Needs `send` and a ledger that fails |

### P-8 — Key epochs (4 rows)

| Test | Classes | Fixture | Reason |
|---|---|---|---|
| T-P8-1 | R | **none** | "A retired epoch" presupposes rotation, which this release does not implement (MVP scoping, §7.6) |
| T-P8-2 | R | **none** | Needs rotation |
| T-P8-3 | R | **none** | Needs rotation |
| T-P8-4 | V | **none** | Needs rotation and a post-SETTLED re-declaration |

### P-9 — Strict standards (11 rows)

| Test | Classes | MUST courted | Fixture | Expected | Reason |
|---|---|---|---|---|---|
| T-P9-1 | all | §1.6 — the release's pins equal §1.6's; the HCS-10 fixtures come from the pinned revision | **artifact + captured** — `spec/pins.json` against §1.6's table; the captured operations against the pinned forms | equality on every pin; every captured HCS-10 memo and operation in the pinned shape | §1.6 is the normative table and `pins.json` says of itself that it is the machine-readable form of it |
| T-P9-2 | all | §1.6 — the suite refuses a report while any pin is null | **artifact** — a doctored copy of `pins.json` | the null-count predicate refuses; the runner offers no override | The gate is worth more than the convenience, and there is deliberately no flag |
| T-P9-3 | all | §5.11, §7.4 — every chunk's `schemaRef` resolves through HCS-13 to the shipped Chunk schema; every chunk validates; the schema fixes `nx` and `h` | **captured + artifact** — the captures carry the HCS-2 registry `0.0.10448509` and the HCS-1 file `0.0.10448507` | the ref resolves, the digest equals `spec/schemas/chunk.schema.json`, every chunk validates, `nx` top-level only and `h` inside `hdr` only | The registration is on consensus and inside the capture, so this runs with no network |
| T-P9-4 | all | §5.11 — each file in `spec/schemas/` equals its registered digest | **artifact** — the fourteen files against `pins.registeredSchemas` | equality on all fourteen | §1.7's freeze is exactly this equality |
| T-P9-5 | P, C, R | §6.1 — every operation carries HCS-10's transaction memo, and `transaction` carries none | **none** | — | **A mirror message carries no transaction memo, and neither does the capture.** A fixture that reached them would need the mirror's transaction records. **Finding F-4**, and a capture improvement |
| T-P9-6 | C, V | §7.1 — a closed lane is `SEND_LANE_INVALID` at `send` and unbound at replay | **altered** — a `close_connection` added before chunk 0 | `laneRefusal` returns the refusal | The replay half is **dark**: `verify` consults `closedBy` only inside the claimed-profile branch. **partial — expected FAIL**, **finding F-5** |
| T-P9-7 | C, P | §7.4 — every message ≤ `CHUNK_WIRE_MAX`, no `chunkInfo`, `data` parses as a Chunk | **captured** — every message on every captured lane | all three, on all of them | `CHUNK_WIRE_MAX` = 1000 bytes on the whole operation, and the capture is the whole operation |
| T-P9-8 | C | §9.1 — every manifest is one message ≤ `CHUNK_WIRE_MAX` on the sender's manifest topic, earlier than chunk 0 | **captured** | all three | The manifest topics are in every capture |
| T-P9-9 | all | §1.7 — `pins.json` records the minor version's digests and wire strings; a release at any patch ships equal digests and passes T-P1-4 / T-P1-5 | **artifact** | the digests and wire strings hold; T-P1-4 passes | The T-P1-5 clause needs the second implementation. **partial — expected FAIL** |
| T-P9-10 | R, V | §7.1 — a non-indexed lane holding an `n`-chunk envelope is fully reassembled by `inbox` and by the VERIFIER suite | **captured** — checkpoint-two-receipt, lane memo `hcs-10:1:60:2:…`, ten chunks | ten chunk postmarks from both readers | The lane's own memo carries HCS-10's non-indexed flag, and the capture holds all ten |
| T-P9-11 | C, P, V | §5.1, D-113 — an AAD naming an undefined ledger tag | **altered** — `hdr.l` changed and the AAD and `id` re-derived across every chunk and the settlement memo | `unbound` with `T-P9-11` at replay | `l` **is** an AAD field, so the identifier must be re-derived for the envelope to bind at all — the alteration is named for exactly that reason. The `send` clause needs a writer. **partial — expected FAIL** |

### P-10 — A lane is a lane (2 rows)

| Test | Classes | MUST courted | Fixture | Expected | Reason |
|---|---|---|---|---|---|
| T-P10-1 | P, V | §6.4 — no resolution proof, or an AAD not naming the lane | **altered** — the same chunks read on another topic | `unbound` with `T-P10-1` | The AAD's `lane` is built from the topic the chunks are on, so relocation is the envelope moved. The `send` clause needs a writer. **partial — expected FAIL** |
| T-P10-2 | C, V | §7.1, D-171 — a lane born from neither party's doorbell, or absent from the doorbell its memo names; and a reply bound through the sender's own doorbell binds | **captured + altered** — the reply and gate-three for the positive walk, two alterations for the refusals | `laneBirth` walks both directions to the same party set; each alteration returns null | The replay half is **dark** under a claimless release, as `gate3.check.ts` measures and L-1 records. **partial — expected FAIL** |

### P-11 — Postage is postage (7 rows)

| Test | Classes | MUST courted | Fixture | Expected | Reason |
|---|---|---|---|---|---|
| T-P11-1 | P, V | §4.1 — a settlement in another token | **altered** — the settlement's `tokenId`, with the stamp token supplied in the scope from `pins.json` | `unstamped` with `T-P11-1` | The `send` clause needs a writer. **partial — expected FAIL** |
| T-P11-2 | P | §4.5 — `buy_stamp` prices identically across profiles, addresses and buyers | **model — pending** | — | Needs `buy_stamp` |
| T-P11-3 | R, C | §7.1 — every lane carries no custom fee; `send` returns `SEND_LANE_INVALID` for one that does | **captured + altered** | every captured lane's `customFees` is empty; `laneRefusal` refuses the altered one | `laneRefusal` takes a `Reader` and no writer, so both clauses run offline |
| T-P11-4 | P, V | §14.3, D-169 — the price the current message yields, compared by value and not by spelling | **model — pending** | — | Needs `buy_stamp` and a price-list fixture on a topic no capture carries |
| T-P11-5 | P | §14.2 | **none** | — | The x402 purchase leg is deferred (MVP scoping) |
| T-P11-6 | P | §14.2 | **none** | — | x402 and the WebMCP send side are deferred |
| T-P11-7 | P | §16.4 *(extension)* | **none** | — | Extension, unclaimed |

### P-12 — Honest degradation (7 rows)

| Test | Classes | MUST courted | Fixture | Expected | Reason |
|---|---|---|---|---|---|
| T-P12-1 | C | §6.2 — an unverifiable registry answer yields an endorsement, never a failure | **model — pending** | — | Needs resolution fixtures (F-2) |
| T-P12-2 | V | §6.7 — appraised ≤ declared; no tool failure where an appraisal exists | **captured + altered** — every fixture and every altered copy this suite builds | no throw anywhere; appraised never above declared | P-12 wins any conflict, and this is the row that says so over every case the suite has |
| T-P12-3 | C | §9.1 — `send` with expired coordinates | **model — pending** | — | Needs `send` |
| T-P12-4 | V | §9.6 — a Verifier claiming no profile appraises every resolution unverified, never fails | **captured** — all four | `resolution.standing` is `unverified` with `T-P12-4`, and nothing throws | This is what all four captures already record, and §9.6 makes it conforming rather than a shortfall |
| T-P12-5 | C, V | §10.5 — the slip | **model — pending** | — | No first contact ever timed out on this deployment, so no capture holds a slip |
| T-P12-6 | V | §11.6 — `dns` and `nanda` drift | **none** | — | Both profiles are deferred |
| T-P12-7 | V | §16.3 *(extension)* | **none** | — | Extension, unclaimed |

### P-13 — Keys stay home (4 rows)

| Test | Classes | MUST courted | Fixture | Expected | Reason |
|---|---|---|---|---|---|
| T-P13-1 | P | §3.5 — no agent private-key material in the key store or the code path | **artifact** — the same source scan `npm run p13:check` runs | no module outside `ops/env.ts` and `ops/identity.ts` names key material | P-13 is structural: a module that holds a `Signer` cannot leak a key it does not hold |
| T-P13-2 | C, R | §3.3 — no tool input, schema field or endpoint carries key material; SDK key generation runs in the agent's process | **artifact** — the fourteen schemas, the tool input schemas, the keystore | no key-bearing field anywhere; generation is local | A schema field is where this would first appear, so the schemas are where it is looked for |
| T-P13-3 | P | §14.2 — a purchase amount changed after signing | **none** | — | Needs a purchase at the counter, which stays down |
| T-P13-4 | P | §4.6, D-110 — a registration whose payer and `account_id` are both the agent's, resolving under `hol` without `blurred` | **none** | — | **The HOL anchor's messages are in no capture.** A capture improvement, like F-4 |

### P-14 — Nothing blocks (1 row)

| Test | Classes | Fixture | Reason |
|---|---|---|---|
| T-P14-1 | all | **model — pending** | The read tools' half runs over captured bytes, but the exception the sketch names — a first-contact `send` returning a slip when its window closes — needs `send` and a clock the model owns |

### P-15 — A claim is scoped (5 rows)

| Test | Classes | MUST courted | Fixture | Expected | Reason |
|---|---|---|---|---|---|
| T-P15-1 | all | §1.5 — the claim validates against its schema; every test it names exists | **artifact** — a claim built from `RELEASE` and the report | validates; every named test is a §A row with a file | §5.10 fixes the claim's shape and §1.5 its content |
| T-P15-2 | all | §1.5, §15.4 — `LIMITATIONS.md` carries L-1 – L-14 in order, and every "does not apply" names a passing test | **artifact** | fourteen sections in order; no unsupported "does not apply" | The sketch names the file |
| T-P15-3 | all | §1.5, D-134 — a claim names no class whose suite did not pass in full | **artifact** — the real report, plus constructed claims | a claim naming a class with a failure is rejected; one naming a report the suite did not produce is rejected | "Silence claims nothing" is the whole of `release.ts`, and this is the rule that keeps it honest |
| T-P15-4 | all | §6.1 — tool schemas identical across transports after canonicalization | **artifact** — `src/mcp/tools.ts` and `sdk/tools.ts` | canonically identical for all six | `sdk/tools.ts` returns the specification's own table unchanged, so the equality is by construction and this is what proves it stayed that way |
| T-P15-5 | V | §11.4 — a schedule expired unsigned yields `unclaimed`, the envelope stays SETTLED, standing unchanged, and the narrative uses the unclaimed template | **altered** — gate-three's schedule marked deleted, which is what the network does to an expired one | `receipt.status` = `unclaimed`; state SETTLED; standing unchanged; the unclaimed sentence and no other | **This row was expected to be unreachable** ("needs an expired-unsigned schedule, 30 days"). It is reachable: what a Verifier sees of an expired schedule is a deleted one, and deleting one in a copy is an alteration of captured bytes |

### P-16 — Buying is not banking (2 rows)

| Test | Classes | Fixture | Reason |
|---|---|---|---|
| T-P16-1 | P, C | **none** | Needs a purchase for a buyer with no account (HIP-542), which needs the counter and a key. Ledger §G-8 is the open seam here |
| T-P16-2 | R, P | **altered** — gate-three's schedule with the recipient named as the inner payer | The negative fires `T-P16-2` as §10.4 requires. "Balances unchanged by `ack`" needs a before and an after, which needs a ledger. **partial — expected FAIL** |

### P-17 — Keys at creation (3 rows)

| Test | Classes | MUST courted | Fixture | Expected | Reason |
|---|---|---|---|---|---|
| T-P17-1 | P, C, R | §4.6, D-138, D-146, D-150 — admin key the agent's except where the standard forbids one; remaining keys per the declared policy; the policy recorded at creation | **captured + artifact** — the captured `topicInfo` and `app/deployment/hedera-testnet.json` | every captured topic's keys as the policy declares; the HCS-1 file topic carries no admin key | The policy record for a **Correspondent's** topics lives in that agent's home, outside the repository (D-165), so the recording clause is provable for the Postmaster's topics only. **partial — expected FAIL** |
| T-P17-2 | R, V | §7.1, §11.4, D-171 — every lane's submit key is exactly the two agents' keys; replay appraises unbound where it is not | **captured + altered** | every captured lane's submit keys are exactly the two accounts' keys; `laneRefusal` refuses a third key | The replay half is **dark** for the same reason as F-5. **partial — expected FAIL** |
| T-P17-3 | C, R, P | §9.1 — every manifest topic has the agent's key as sole submit key and the memo `wishmail:manifest:1` | **captured** — `0.0.10462713`, `0.0.10452154`, `0.0.10468692` | all three, on all of them | The capture carries each manifest topic's own record |

---

## B. Counts

**By disposition**

| | Rows |
|---|---|
| Registered (§A) | **87** |
| Expanded — expected to pass in full | **29** |
| Expanded — **partial**, expected to fail on a named clause | **18** |
| **Expanded, total** | **47** |
| Not expanded | **40** |

**The forty not expanded, by reason**

| Reason | Rows |
|---|---|
| `model` — waiting on the unfilled ruling | 10 — T-P2-1, T-P6-3, T-P6-5, T-P7-5, T-P11-2, T-P11-4, T-P12-1, T-P12-3, T-P12-5, T-P14-1 |
| Extension, and `RELEASE.extensions` is empty | 5 — T-P2-3, T-P5-5, T-P6-6, T-P11-7, T-P12-7 |
| Needs a second, independent implementation | 2 — T-P1-5, T-P3-1 |
| Needs rotation (§7.6), deferred | 4 — T-P8-1, T-P8-2, T-P8-3, T-P8-4 |
| Needs a claimed-profile replay, and no capture carries the topics (F-2) | 4 — T-P1-10, T-P3-5, T-P6-3 *(also model)*, T-P12-6 *(also deferred)* |
| Needs the x402 leg or the WebMCP send side, deferred | 3 — T-P11-5, T-P11-6, T-P12-6 |
| Needs Postmaster carry of an agent's own submission, deferred | 3 — T-P2-2, T-P4-2, T-P5-3 |
| Needs a suite already green under a sole profile | 2 — T-P5-1, T-P5-2 |
| Needs the counter, a purchase, or a key | 3 — T-P2-4, T-P13-3, T-P16-1 |
| Needs a fixture the capture does not take | 3 — T-P3-6 *(treasury transfers)*, T-P9-5 *(transaction memos)*, T-P13-4 *(the HOL anchor)* |
| Needs two mirror nodes | 1 — T-P4-3 |
| The sketch contradicts §11.5 (finding F-3) | 1 — T-P6-1 |
| `dns` deferred | 1 — T-P6-4 |

*(Rows appear once in the disposition table and may appear under more than one reason above, where more
than one thing blocks them; the reason listed first in the table is the binding one.)*

**Expanded, by fixture kind**

| Kind | Rows |
|---|---|
| captured only | 9 |
| altered (with or without a captured half) | 25 |
| artifact | 13 |
| reconstructed | 1 *(T-P1-9, counted under altered above)* |
| model | 0 — **nothing is expanded against the model** |

---

## C. Findings this derivation turned up, before a line of test code

**F-1 — `inbox` never returns `INBOX_SCHEMA_UNRESOLVED`.** §6.5 (spec line 999) names five reasons on an
unopened delivery and `inbox.ts` declares all five in `DeliveryReason`, but no code path emits the fifth:
`inbox` does not read the chunk's `schemaRef` at all. A delivery whose schema does not resolve opens. The
Verifier's side of the same fact is reported (`T-P9-3`, unverified), so this is the recipient's side only.
T-P1-3's body follows the sketch and fails on it.

**F-2 — no captured fixture can support a claimed-profile replay.** Verified by running `verify` with
`claims: ['hcs14']` over all four: every envelope comes back `unverified` with `T-P6-1`, because the
account memo points at a registry topic (`0.0.10462719`, `0.0.10452155`, `0.0.10468693`) that the capture
does not hold, and the profile file topic behind it likewise. The captures were taken for the letter path
and stop at the lane, the manifests, the settlements and the schema registration. **This is the single
largest blocker in the table**: it takes T-P1-10, T-P3-5, T-P6-3, T-P6-7's positive, and the whole
resolution half of the VERIFIER suite out of reach. Closing it needs a re-capture with the profile and
registry topics included — a read of a mirror node with no key, no account and no signature, which is not
a thing tonight's standing rules permit.

**F-3 — §A's T-P6-1 sketch contradicts §11.5's table.** The sketch says an envelope with altered
resolution inputs "appraises unbound"; §11.5's table (spec line 1700) puts `T-P6-1` under **unverified**,
and §11.4's structure agrees — a resolution that does not replay leaves the envelope bound and its address
unappraised, which is the same reasoning §A's own footer gives for keying T-P6-7 to P-6 rather than P-1.
A sketch that contradicts the normative table is a ledger §G item, not a body edit.

**F-4 — a capture carries no transaction memo, so T-P9-5 has no court.** A mirror's topic message carries
contents, timestamps, a running hash and a payer; HCS-10's transaction memo is on the transaction, not the
message. `consensus.ts`'s `TopicMessage` has no field for it because nothing read it. T-P9-5 is one of
§6.1's plainest MUSTs and there is no offline fixture for it.

**F-5 — `T-P9-6` is dark under a claimless Verifier, and LIMITATIONS does not say so.** `verify.ts` calls
`closedBy` inside the claimed-profile branch, beside the doorbell walk, so a closed lane is not noticed by
a Verifier that claims no profile. L-1 records exactly this darkness for `T-P1-10` and for the lane
binding; `T-P9-6` belongs in the same sentence and is not in it.

**F-6 — T-P15-5 is reachable and was listed as unreachable.** The expectation that it needs a schedule to
expire unsigned over thirty days confuses the act with what a Verifier sees of it. What a Verifier sees is
a schedule consensus no longer holds, and a deleted schedule in an altered copy is exactly that.

---

## D. What stands between this table and a conformance claim

§1.5 and T-P15-3: a claim names no class whose suite did not pass in full. Every class includes VERIFIER
(D-42), and **T-P3-1 alone keeps VERIFIER from passing in full**, because it compares two implementations
and this deployment has one. So on tonight's work the claim stays empty whatever the count reaches, and
that is accuracy rather than modesty — the same sentence `release.ts` already carries.

Named in full, the distance from here to a claimed VERIFIER class is:

1. a second, independent implementation of §7.2–§7.3 and of §11 — T-P1-5, T-P3-1, T-P3-2's first clause;
2. a capture that carries the registry and profile topics — the whole of F-2;
3. a second mirror node — T-P4-3;
4. a route from §11.2 to the treasury's transfers — T-P3-6, and it is a §G question before it is a build one;
5. rotation — T-P8-4.

One through five are five different kinds of work, and only the second is a night's.

---

## E. ADDENDUM, 2026-09-10 night — the re-capture, and the six rows it moved

**Written after section A and against it.** Section A's rows are left exactly as they stood: each records
why it was blocked when the table was written, which is worth more than a tidy table. This section says
what changed and which rows move.

### What was captured, and what it cost

RECORD (Sonic, 2026-09-10 night): a mirror read only — the declaration registry and profile file of A2, B
and C — no key, no account, no signature; the four existing fixtures and their digests are records and are
not rewritten; the new capture stands beside them.

```
gate-three-resolved.json       lane 0.0.10468898   1 envelope    28 KB
checkpoint-two-resolved.json   lane 0.0.10464056   3 envelopes   55 KB
```

Six topics named with `--topic`: `0.0.10462719` / `0.0.10462723` (A2), `0.0.10452155` / `0.0.10452158`
(B), `0.0.10468693` / `0.0.10468695` (C) — the HCS-2 registry and the HCS-1 profile file each account's
HCS-11 memo leads to.

**The HOL anchor `0.0.6913983` was NOT captured**, and the reason is the same ruling: `hol` is deferred
from any claim, and T-P6-5 and T-P13-4 stay not expanded because of it. The anchor holds some hundreds of
messages and no body would read them. One command away if that changes.

### Two things the capture confirmed on the way past

**The extra topics do not enter the evidence.** `gate-three-resolved`'s bundle digest is
`34b314c4be0f8262bdeb613b166dfac28174a75a30d506c583f763c6f5b0c017` — **identical** to the original
gate-three capture's. `--topic` stores topics beside the evidence and `bundle.topics` still holds only
what a Verifier followed, which is what the flag was built to guarantee.

**D-173, confirmed arithmetically and not by argument.** `checkpoint-two-resolved`'s digest today is
`473cba1ba05db658c5e19929bdbfd5d96131e187fa390092830d2187a15b5374`, and the reply's run of record printed
`1c4359e5…`. The same evidence with `spec` substituted to `"0.5.11"` hashes to
`1c4359e5bf6fbbe00fc82e4e5b358500d307572891a1be89dfd47d493f13d648` — **byte for byte the number the run of
record printed**. So the only thing that moved between the two readings is the one field D-173 moved, and
every other byte of the evidence is unchanged across a re-read of the mirror at a different time. That is
the dated note beside `1c4359e5…` in `app/OPERATIONS.md` and LIMITATIONS L-1, shown rather than asserted.

### The replay completes, and reaches `verified`

```
gate-three-resolved      claims []          unverified  [T-P12-4]
                         claims ['hcs14']   VERIFIED    []          returnReceipt present
checkpoint-two-resolved  claims []          unverified  [T-P12-4]   x3
                         claims ['hcs14']   VERIFIED    []          x3, the reply among them
```

**This is the first `verified` standing this deployment has produced**, and it is worth saying exactly what
it means and what it does not. It means §11.4's resolution paragraph ran end to end offline: the account's
memo, the registry entry, the profile file, the declaration inside it, the recomputed coordinates, and the
digest the proof declares. It means D-171's symmetric binding walked the reply's lane from the sender's own
doorbell to the same pair of parties. It does **not** mean this release claims `hcs14`: `claims` is the
scope a body hands a Verifier (§6.7), and `RELEASE.profiles` is what the release says of itself. §1.5's
silence is untouched.

### The six rows that move

| Test | Was | Is | Why |
|---|---|---|---|
| T-P1-10 | not expanded | **partial** | The replay half is now reachable: `hdr.ke` altered against coordinates the rule recomputes. The `inbox` half is not, and that is a finding — see F-7 |
| T-P3-5 | not expanded | **full** | A window whose `from` follows the settlement, the `connection_created` and the manifest, with chunks inside it, now appraises `verified` |
| T-P6-7 | partial | **full** | The positive clause needed a resolution that appraises verified, and there is one |
| T-P9-6 | partial | **full** | Both clauses: `laneRefusal` gives the `send` refusal over a `Reader` alone, and the replay half fires now that the claimed-profile branch is reachable |
| T-P10-2 | partial | **full** | Same: the discovery half through `lanesBetween`, the binding half through the claimed branch |
| T-P17-2 | partial | **full** | Same: `laneRefusal` for the key list, the claimed branch for the replay |

### Revised counts

| | Rows |
|---|---|
| Registered | **87** |
| Expanded — full | **34** *(was 29)* |
| Expanded — partial | **15** *(was 18)* |
| **Expanded, total** | **49** *(was 47)* |
| Not expanded | **38** *(was 40)* |

### The model, now ruled

RECORD (Sonic, 2026-09-10 night): the modelled ledger is permitted for a clause whose sketch is
**behaviour** — a refusal, an ordering, a window, a price computation — in any class; refused for any
clause whose claim is **replay of consensus**. A row with both halves runs the model for the behaviour
clause and is an honest partial for the replay clause. Every model-backed body is marked `model` in the
report and counts toward no profile claim.

So the ten rows section A marked `model — pending` are now eligible, and so is the `rejected at send`
clause of every partial above, because a refusal is behaviour. Two of those ten stay closed for another
reason — **T-P6-5** and **T-P13-4**, because `hol` is deferred from any claim and from the venue narrative
(RECORD, same night): HOL's testnet anchor is privileged, registration works under a key found in recon,
and the production posture is unknown. Nothing is un-built — the three registrations are on consensus, the
fee is in every receipt, and `register_agent` stays in the provisioning path. LIMITATIONS says so.

### F-7, a new finding

**`inbox` cannot reach T-P1-10's first clause, and it is not clear it should.** §A requires an envelope
whose `hdr.ke` differs from its bound resolution's `keyEpoch` to be returned `INBOX_UNBOUND`. A recipient
does not replay its own resolution — `InboxContext` carries a key map and no coordinates — so what `inbox`
answers for an unknown epoch is `INBOX_EPOCH_UNKNOWN` (§6.5), and for a *known* epoch that the coordinates
do not name, it opens. Either §6.5 owes the recipient a resolution of its own address, or T-P1-10's first
clause belongs to the Verifier alone. A §G question, raised rather than coded around.

---

## F. WHERE IT LANDED, 2026-09-11 — the harness, after the fixes and the model tranche

```
$ npm run conformance
  register 87 · files 87 present · passed 44 · failed 43
  reportDigest 51453eea7d11dee8a5cfa71b84de826682d8283c543be48ec65c95625daeb6ec
```

`passed 0` on 2026-09-10 morning; `passed 30` that night; **44** now.

| | Rows |
|---|---|
| Registered | 87 |
| **Expanded** | **53** — 44 passing, 9 failing on a named clause |
| Not expanded | 34 — each with its reason, every one still throwing `NOT EXPANDED` |

**By fixture kind** (a row may carry more than one): altered 27 · captured 22 · artifact 12 · **model 9** ·
reconstructed 1.

**By class**, non-extension rows: VERIFIER 31/45 · CORRESPONDENT 24/41 · RECIPIENT 23/34 · POSTMASTER 20/37.
No class passes in full, so `RELEASE.classes` and `RELEASE.profiles` stay empty (§1.5, T-P15-3).

### The fourteen rows that flipped, and why

Eleven were **BUILD findings fixed in code**, each proved by the body that found it: T-P6-7, T-P12-2 and T-P9-11
(§11.5's reason tables, and a tool failure where the table has a rung); T-P3-3 and the conflicting-chunk case of
T-P3-2 (§8.5's fourth exception class); T-P1-3 (§6.5's fifth reason); and T-P7-2's ordering half ("earlier" decided
by a hex sort). One was a **SPEC ruling**: T-P6-1, which could not be expanded at all while §A's sketch and §11.5's
table disagreed, and which D-177 settled. The rest were **the model tranche**: T-P7-1, T-P7-2, T-P7-3, T-P10-1,
T-P16-2, T-P2-1, T-P12-3 and T-P14-1, each running its behaviour clause against `conformance/support/world.ts`.

### The nine that still fail, and what each waits on

| Test | Waits on |
|---|---|
| T-P1-10 | §G-28 — §A's `inbox` clause asks a recipient to replay its own resolution, which §6.5 gives to nobody |
| T-P1-11 | An opened envelope with a foreign chunk landing first: opening needs the recipient's key, and the clause is about what happens *after* it opens |
| T-P10-2 | A BUILD gap **not in tonight's list and not ruled**: `laneRefusal` does not walk the lane's birth, so discovery offers a lane that binding refuses |
| T-P11-1 | The model has one token — `MemoryLedger.transfer` takes no token argument, so a settlement in another one cannot be expressed honestly |
| T-P12-5 | A captured first contact that timed out and was answered late; every gate was answered inside its window |
| T-P3-2 | §G-29 — the unrooted entry and the duplicate, both 0.6 under §1.7 |
| T-P6-2 | `dns` and `nanda`, deferred from the letter path by MVP scoping |
| T-P7-4 | A ledger that refuses a fee-less request and a provisioning that fails — network refusals the model does not express |
| T-P9-9 | T-P1-5, which needs a second implementation of §7.2–§7.3 |

### What the model is permitted to do, as it was ruled and as it is used

RECORD (Sonic, 2026-09-11): permitted for a clause whose sketch is **behaviour** — a refusal, an ordering, a window,
a price computation — in any class; refused for any clause whose claim is **replay of consensus**. A row with both
halves runs the model for the behaviour clause and is an honest partial for the replay clause. Every model-backed
body is marked `model` in the report and counts toward no claim.

Nine rows use it and eight pass. The ninth, T-P12-5, is the ruling working: its CORRESPONDENT half is behaviour and
holds in full, and its VERIFIER half is replay, so the model is refused it and the row stays partial.

**Two rows the model was offered and could not honestly take**, which is the other half of the same discipline:
T-P11-1 (one token) and T-P7-4 (a network that refuses). Both say so in the body rather than approximating.

### Not moved, and checked at every step

`check:captured` and `check:receipt` pass byte-identically through all of it — `8d30dfdc…`, `00229e6f…`,
`1c4359e5…`, `34b314c4…` and `473cba1b…` are what they were. No captured letter reaches any branch that was fixed,
which is why that was the right acceptance test to be given.
