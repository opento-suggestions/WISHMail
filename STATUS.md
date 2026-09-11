# STATUS — WISHMail, ETHOnline 2026

The one file in this repository where ordering is allowed. Specification: 0.5.9 — frozen at 0.5.0 on 2026-09-07, patched to 0.5.1 the same day (D-135 – D-138), on 2026-09-08 to 0.5.2 (D-145 – D-148), 0.5.3 (D-150, D-151) and 0.5.4 (D-152), and on 2026-09-09 to 0.5.5 (D-157, D-159, D-160, D-161), 0.5.6 (D-159 amended, D-163), 0.5.7 (D-166), 0.5.8 (D-167) and 0.5.9 (D-167’s §10.2 text), 0.5.10 on 2026-09-09 (D-169, D-170), and 0.5.11 on 2026-09-10 (D-171: a lane binds from either party’s doorbell; D-172: T-P1-8 as the ledger can show it); wire strings carry `0.5`. Window: Sept 4 – 16. Register: **RECORD** = Sonic said it; **MINE** = Claude's lean, unratified; **FETCHED** = from a recon, dated.

## 1. Scope line (RECORD)

The Excalidraw map is the ratified scope: **green/blue = BUILD, orange = STRETCH, dashed = SPEC or VENUE.** Full product is the judging posture; the registry layer is load-bearing. Do not re-propose scoping down.

**The spec and the BUILD are not the same document** (Sonic, 2026-09-07): *the spec survives ongoing development; the BUILD is for this window.* A scope question is therefore answered twice and not once — what this window ships, and what the specification says. Where the BUILD is narrower, it defers a claim and says so in LIMITATIONS rather than widening the specification to fit, and rather than inventing a deployment artifact to make a claim true. The first instance is the POSTMASTER claim's deferral on T-P16-1, §4 below.

## 2. Build set, as ranked by Sonic (RECORD, D-23; carried from v0.3 §17 with the spec's current names)

**Hard deliverables.** Core (resolve / postage / consensus) · resolvers `hcs14` (§9.2), `dns` (§9.3), `nanda` (§9.4) · HCS-11 declaration + HCS-2 profile registry (§9.2) · HCS-13 schema registration (§5.11) · WebMCP page · MCP server · MCP-B bridge (judges cannot be assumed to have the Chrome flag) · TypeScript SDK + CLI · demo: two agents corresponding, Claude as outside Verifier · `AGENTS.md` footnote · HOL Guard scan if feasible.

**Stretch, in Sonic's order.** ~~HOL registration once registrable~~ **`hol` is BUILD, and it LANDED 2026-09-10** (RECORD, Sonic): the §9.5 profile reads consensus, self-registration on the testnet anchor is done under §4.6 and D-110, and **A2 and B both resolve under it with no `blurred`** — which is the acceptance test, because §9.5 assigns `blurred` where the registration's payer is not the address's own account. → HCS-25 reputation signals (**closed**: refused in §16.8; a score off consensus never touches a standing). Mandate lineage is held (§16.8).

**Spec-only.** A2A AgentCard (held, §16.8) · Q-10 NANDA attestation slot (§19.4) · Q-11 postage classes (§19.3) · other ledgers / CLPR (§16.7, §19.3) · AAIF and NANDA-Town mappings (in the 09-04 research, not in the spec) · USPS/PES grounding (§17, done).

**Out.** Broker dependency · Solidity · broadcast · agentgateway · ANS cert chain · NANDA Index write path · private hands.

Demo shape: offered in v0.3, not chosen (v0.3 §19 item 3). Open for Sonic.

## 3. Dependency order (MINE — what must exist before what; not a schedule)

```
0  repo outfitting: layout, DCO, Conventional Commits, CHANGELOG, ADR backfill D-1..41,
   spec/pins.json from provenance/recon/pins.draft.json, spec/schemas/ (14 files), CLAUDE.md   [DONE 09-07]
1  primitives: RFC 8785 canonical JSON; SHA-256; HPKE RFC 9180 (X25519/HKDF-SHA256/AES-256-GCM);
   AAD build + id; chunker/chain (§7.4); reassembly walk (§8.5, §11.3)
   -> spec/vectors/aad.json, seal.json generated here and cross-checked (T-P1-4, T-P1-5)
2  VERIFIER: mirror-node reader; §8.5 state; §11.4 appraisal; §11.5 standing + reasons;
   §11.7 bundle + digest; narrative templates. Runs on fixtures with nothing configured (T-P4-1).
   The exception corpus of T-P3-2 is built alongside.
3  RECIPIENT: keys in-process; declaration under hcs14 (HCS-2 registry + HCS-11/HCS-1 file);
   manifest topic; inbox; ack via ScheduleSign (§10.4)
4  CORRESPONDENT: resolvers hcs14 -> dns -> nanda (-> hol); resolve; send (§6.4 steps 1-7);
   slips; resumption (§8.7)
5  POSTMASTER: $POSTAGE token (HTS, supply key); treasury; price topic (§14.3); buy_stamp hbar leg
   (§14.2, atomic) then x402-usdc leg with facilitator; provisioning (§4.6); durable payment record
6  surfaces: MCP server (resource server of §14.2) -> SDK -> CLI -> WebMCP page (+ MCP-B bridge),
   identical tool schema on each (T-P15-4)
7  conformance report, claim (§5.10), LIMITATIONS filled, pins filled -> first claim
```

VERIFIER before anything that writes: it is the floor of every class, it needs no testnet artifact, and it is the court the other classes are tried in.

## 4. Deployment pins to fill (§19.2)

| Pin | Where recorded | Status |
|---|---|---|
| `$POSTAGE` token ID + treasury, `hedera:testnet` | `spec/pins.json`, §4.1 table, LIMITATIONS | **filled 09-08** — token `0.0.10426208`, treasury `0.0.10426205`, provisioned against tag `v0.5.2`. Two nulls closed; **thirty remain**, so T-P9-2 still blocks every claim |
| Price topic (`wishmail:prices:1`) | claim `prices`, LIMITATIONS | **filled 09-08** — `0.0.10426551`, submit and admin keys the operator’s (D-142); the first `PriceList` is sequence 1, canonical under RFC 8785, no `validFrom` (D-145) |
| x402 facilitator for `hedera:testnet` | price list `methods[].facilitator`, LIMITATIONS L-11 | **filled (D-132, RECORD 09-07)** — x402.org: `https://x402.org/facilitator`, scheme `exact`, `hedera:testnet`, USDC `0.0.429274` (6 dp), fee payer `0.0.9185802`, no signup. `hedera:mainnet`: none anywhere |
| `hbar` leg `rate.source` | price list `methods[].rate`, LIMITATIONS | **fetched 09-07** — `https://api.saucerswap.finance/tokens`, pair `HBAR/USD`, read as HBAR's `priceUsd` at `id: "0.0.0"` (ledger §H). Written into the price list when it is published; the reader is `buy_stamp`'s, downstream |
| Reference Postmaster price numbers | price topic | RECORD (ledger E, Q-6; bundle on both legs, Sonic 09-07): $0.10 USDC per stamp; bundle of 12 for $1.00 on **both** methods; the `hbar` leg carries `rate.reference` of $0.10 USD and no `unitPrice` (D-136); fallback, if the rate source fails, a fixed unit price at HBAR = $0.07 |
| Registered schema digests (14) + wire strings | `spec/pins.json` (T-P9-9) | unfilled until HCS-13 registration |
| HIP-991, HIP-423 | §1.6, `spec/pins.json` | **filled 09-07 (D-135)** — both were `n/a`; every doorbell property had been second-hand from our own ADRs |

**Deferred claim (RECORD, Sonic 09-07).** The MVP BUILD covers **pre-funded Hedera accounts only**, so the first price list carries exactly the two `hedera:testnet` methods and the **POSTMASTER claim is deferred on T-P16-1**. §14.2's MUST — "At least one method the Postmaster offers MUST require no pre-funded Hedera account of the buyer" — is unmet by this deployment, and that is stated rather than dodged: no non-Hedera method is invented to make the claim true. Stated in LIMITATIONS where §15.5 expects it. The underlying contradiction between §14.2 and L-11 is a spec question, not a build item, and is logged in ledger §G item 8 for the next spec pass; it was deliberately **not** patched in 0.5.1 or 0.5.2.

## 5. Build facts the spec does not carry

**Environment.** One Hedera testnet operator account for the Postmaster (key generated in-process, never committed); one for each demo agent (generated by the SDK at provisioning — P-13). Mirror node: the public testnet mirror (verify the current base URL before use — FETCH). Testnet HBAR from the portal faucet. `.env.example` lists names only, values blank.

**Stack.** TypeScript throughout — the MCP server, SDK, CLI, and WebMCP page share one language and one tool schema. `@hashgraph/sdk` for HTS/HCS/schedules. An RFC 8785 canonicalizer as a dependency (verified against the RFC's examples; §5.1 depends on byte-exact output). **The seal is composed here, not depended on** (RECORD, Sonic 2026-09-08): RFC 9180 base mode on `node:crypto`, with RFC 9180 Appendix A.1 as its court, because the RFC publishes no vector for §7.3's ciphersuite and the library considered had two nonce defects in a year. The reasoning is in `app/OPERATIONS.md` beside the canonicalizer's, which reaches the opposite conclusion on the same test. `@modelcontextprotocol/sdk` for the tool surface. No Solidity, no contracts.

**The two Hedera MCP servers, and what each is for (RECORD, 2026-09-07).** Settled after reading `hedera-testnet-mcp`'s own tool schemas off its endpoint (ledger §H, FETCHED 09-07).

- **`hedera-docs` — use freely during BUILD, for design questions.** Anything it returns is **FETCHED**: cite it as such and name the document it came from. It resolves a question; it never becomes a source the specification cites without a pin (§1.6, L-7).
- **`hedera-testnet-mcp` — never for a write we own.** Every transaction this project submits is built and signed with `@hashgraph/sdk`. It may be used to orient on a read, but **nothing recorded in `app/deployment/hedera-testnet.json`, in `spec/pins.json`, or in `app/OPERATIONS.md` comes from it** — the mirror node's REST response is the record.

Two independent grounds, and the first is the one that decides it. **Control:** its write tools default to "the operator account," which is *its* operator and not ours, and `create_topic_tool` has no payer parameter at all — so a topic it builds names an account we do not control, with no way to redirect it. That disqualifies it for anything we own before the second ground is reached. **Expressiveness:** `create_topic_tool` has no `customFees`, `feeScheduleKey` or `feeExemptKeys`, so §4.4's doorbell fee and D-138's exempt list cannot be stated; `create_fungible_token_tool` has one boolean about the supply key and nothing about admin, freeze, wipe, pause or KYC, so D-141's key posture cannot be stated either. Its signing posture is *correct* — it returns unsigned bytes and holds no key of ours, which is what P-13 wants — but returning bytes for a transaction that names the wrong payer does not help us.

The blanket DIVERGENCE is recorded once, in `app/OPERATIONS.md`, with the parameter lists quoted so a reviewer can check the claim without the agent kit in front of them.

**Reads are mirror-node REST, and the suite inherits that as a rule.** P-3 makes replay a function of public consensus data and P-4 forbids a broker; together they fix a mirror node as a read interface rather than a broker. Nothing in `conformance/` may depend on an agent kit or any service that reads on the suite's behalf — otherwise T-P3-1's byte-identical evidence becomes a property of that service rather than of the ledger. Written into `conformance/README.md` so the first test written inherits it.

**HCS-10 by hand or by SDK — decision candidate for Sonic (MINE lean: by hand).** Hashgraph Online publishes a standards SDK; using it would make conformance to *its* reading of HCS-10 rather than to the pinned blob. Strict HCS-10 (P-9) argues for writing the operations ourselves against `hcs-10/index.md @ 0cb5d2eb` and testing them against the recon's file:line facts in ledger §H. Either way, the memo table of §6.1 and the 1000-byte line of §7.4 are ours to enforce.

**Facts already fetched (ledger §H, 2026-09-06)** — read before touching these areas: Mirror Node REST fields for schedules (`executed_timestamp`, `signatures[].public_key_prefix`) that T-P1-8 and §11.4 depend on; the running-hash construction (v3, SHA-384) for the optional integrity check; the HOL registration chain (`register` op → `t_id` HCS-2 topic → HCS-1 file) and the testnet anchor `0.0.6913983`; x402's Hedera `exact` scheme (base64 partially-signed `TransferTransaction`, payer-signature hardening 2026-07-03); NANDA v2 `/api/v1/resolve` (no auth to read; JWT + email/DNS verification to register). If a needed fact isn't in §H, fetch at the pinned commit and file it there with the date.

**Fixtures and vectors.** `spec/vectors/aad.json` and `seal.json` are generated by the reference and must be opened by an independent implementation (T-P1-5); a second, minimal implementation of §7.2–§7.3 in another language inside `conformance/` satisfies "independent." The exception corpus (T-P3-2) is enumerated in the spec: orphan, partial, unrooted chunk, foreign chunk before the sender's, duplicate, conflicting `n`, late settlement, closed lane, duplicate receipt, receipt before the nth chunk. Fixtures are recorded testnet data or synthesized mirror responses; either way they are files, and the VERIFIER suite reads them with no network.

**Conformance report and claim.** The suite emits one report per class; the claim (§5.10 `ConformanceClaim`) names its digest. `LIMITATIONS.md` is checked for L-1 – L-14 in order (T-P15-2). No claim while any pin is unfilled (T-P9-2).

**Demo.** Two agents corresponding across two registries (the bridge: one declared under `hcs14`, one under `nanda` or `dns`), a first contact with a slip, a return receipt, and `verify` run by a Verifier with nothing configured — Claude as the outside Verifier, reading the narrative. Shape unchosen (RECORD: offered, not chosen).

## 6. Open for Sonic

~~**§G-19 is open, and it blocks Gate One's purchase.**~~ **Closed 2026-09-09 by D-168, reading (a): the Postmaster provisions the mailbox it sells.** The finding as it stood: A provisioning purchase cannot produce a `StampReceipt` that validates: §5.4 requires `doorbell` and `manifestTopic` inside `provisioning` because they are "the entities the Postmaster created for the holder", and D-159 as amended has the Postmaster create the **account** while the agent creates its own topics afterwards, under its own key. Carrying the line fails the registered schema; omitting it contradicts §6.3's "exactly when" and drops `registrationFee`; and §14.3 forbids charging the 2 ℏ with `provision` false. **The counter refuses before signing anything.** Two candidates, in ledger §G-19 and in `OPERATIONS.md` Step 5 §6: **(a)** the Postmaster provisions the topics after all — §4.6's path taken literally, the Postmaster paying and the agent signing each creation over the counter, **no schema moves**, CLAUDE.md §11's placement of `generate_mailbox` amended; **(b)** the two fields become optional — smaller change to the text, but **0.6**, on fourteen files now frozen on consensus.

**Gate One ran on 2026-09-09, on your word. The register below is what it left.**

**Step 4 is signed. What is open is the suite.** `spec/pins.json` has no null left and the harness writes a report; the report records 86 failures, because no test is expanded. The next thing that changes the report is test bodies, not entities.

**The freeze has happened and Step 4 has signed.** §G items 12 through 17 are all closed — 14 and 15 by D-157 and
D-160 at 0.5.5, 16 by D-163 at 0.5.6, and 17 by D-167 at 0.5.8. The fourteen schemas are registered on consensus and
every schema in `spec/schemas/` is frozen for the life of 0.5: after it the smallest field is 0.6.

---

## GATE ONE — the register, 2026-09-09

**Correspondent B is provisioned and clean. Correspondent A stopped after its transfer and stays exactly as it is.**
The run of record, with every transaction id and every mirror readback, is `app/OPERATIONS.md` under Step 5; this is
the register.

### B — the counter's first completed sale, eleven rows

| # | What | Id / where | Payer of record |
|---|---|---|---|
| 1 | the purchase — one transaction, three legs | `0.0.8641261@1789007373.238805114` | the Postmaster |
| 2 | the account the transfer created (HIP-542) | `0.0.10452127` | — |
| 3 | doorbell — HCS-10 inbound, HIP-991 fee, no submit key | `0.0.10452149` | `0.0.8641261` |
| 4 | log — HCS-10 outbound | `0.0.10452150` | `0.0.8641261` |
| 5 | manifest — §9.1 | `0.0.10452154` | `0.0.8641261` |
| 6 | declaration registry — HCS-2, indexed 0 | `0.0.10452155` | `0.0.8641261` |
| 7 | HCS-11 profile file — HCS-1, **no admin key** (D-150) | `0.0.10452158` | `0.0.8641261` |
| 8 | the profile, as HCS-1 chunks | 1 chunk on `0.0.10452158` | `0.0.8641261` |
| 9 | the HCS-2 register entry | `0.0.10452155`#1 | `0.0.8641261` |
| 10 | §9.2's account memo — `hcs-11:hcs://2/0.0.10452155` | on `0.0.10452127` | `0.0.8641261` |
| 11 | the registration on the HOL anchor | `0.0.6913983`#381 | **`0.0.10452127`** |

**Rows 3–10 are D-168's carry, run for the first time anywhere but in a check**: eight bodies the agent signed in its
own process, each decoded by the counter before it would sign it, each paid for by the Postmaster. **Row 11 is the one
place an agent pays**, and it is the whole reason the purchase funds exactly one fee: §9.5 assigns `blurred` where the
registration's payer is not the address's own account, and all 380 messages before ours on that anchor carry it.
Charged 0.00377436 ℏ against 0.02 ℏ declared. **The auto-renew account on every topic is `0.0.10450880` — B's own
operator, never the Postmaster's.**

**The receipt** names all eight `provisioning` fields from the counter's own readback and validates against the
registered schema. Its rate is sequence 3's: `0.07638866` at `1789005662.118530104`, which a stranger re-obtains from a
mirror node at that timestamp. **Both resolutions carry no `blurred`**, which is the acceptance test for the step. Two
further runs against the same home created nothing and exited 0.

### A — stopped, and it stays stopped (RULED, Sonic 2026-09-09)

```
account 0.0.10451893   12 $POSTAGE   0.05 ℏ   no mailbox   NO RECEIPT
paid    15.09094832 ℏ from 0.0.10450879
ref     0.0.8641261@1789006030.569861064 — restored to A's home from consensus alone
```

**A is not finished.** It is recorded as the counter's first sale that stopped, and what it taught. Its home is kept.
The receipt is permanently absent: the quote-expiry defect deleted the counter's `Requirement` row — the quote it
charged and the rate it charged at — before the receipt was built, and §5.4's receipt is built from those. **Rebuilding
them from the ledger would manufacture the evidence a receipt is**, so it was not done. Nothing was charged twice and
nothing can be.

### The eight defects, and the window they all lived in

`submit()` mutating a transaction the counter had already frozen and signed · `receiptFrom` reading the first SUCCESS
record under a transaction id, when HIP-542's account creation sits there first with no token transfers in it · the
purchase reference written down after the answer came back rather than before the signature left · a settled
`quoteRef` falling through to a second quote · the expiry check deleting a settled purchase · two mirror-lag reads
taking ingestion for absence · a stale record handle reporting a complete mailbox as incomplete.

**Every one was between "a signature left the buyer" and "the buyer learned what happened"**, which is the window no
offline check reaches, because there is no offline consensus node. All fixed and pushed. `check:correspondent` is 109
assertions, up from 105, and the four it gained are the SDK facts the first one turned on.

### The precheck, answered

**Hedera's solvency precheck compares the payer's balance to the fee it ESTIMATES, not to the maximum the transaction
DECLARES** (disposable probe, 2026-09-09; ledger §H). A throwaway account holding 0.10 ℏ submitted one HCS message
declaring **1 ℏ** — ten times its balance — and it succeeded, charged 0.00222601 ℏ; a control declaring 0.05 ℏ
succeeded identically, so the result is about the comparison and not about the account. **This project had said four
times that it could not cite this.** `register_agent`'s original 2 ℏ declaration against the 0.05 ℏ the purchase funds
would have been accepted, so **lowering it to 0.02 ℏ was defence in depth and not a fix — and it is kept**, because a
declaration is what a reader of the transaction sees on consensus, and one forty times the balance says something
false about what that agent can afford.

### The doorbell's cost, measured

**26.31542199 ℏ.** One mailbox costs the Postmaster **27.78102934 ℏ** across its eight rows and sells for
**15.09094832 ℏ**. Nothing on consensus is wrong, no fee left the ceiling the carry policy authorised, and the price
charged is the price the schedule yields — `provisioning.unitPrice` was simply set at 2 ℏ before the cost of a HIP-991
fee-gated topic was known. Repricing is a new `PriceList` message and touches no schema and no wire string.

---

## GATE TWO, CHECKPOINT ONE — the first letter, 2026-09-10

**A plain certified letter travelled from A2 to B on `hedera:testnet`, B opened it byte for byte, and a stranger
holding nothing reconstructed it from consensus alone.** One pass, no stop. The run of record is
`app/OPERATIONS.md` under Step 6.

```
lane        0.0.10464056   threshold of exactly A2's and B's keys · no custom fee
envelope    cd9dc8f41d3fa8580185652b68c960045d3961b7f83af441dc6e190d093ab0e2
settlement  0.0.10450879@1789064924.136455588  ·  memo wishmail:cd9dc8f4…
chunk 0     806 bytes · chunk_info NULL · memo hcs-10:op:6:3 · 1789064935.243142061
manifest    0.0.10462713 #1, before chunk 0
ring        one $POSTAGE assessed to the treasury from 0.0.10450879 (T-P7-4)
```

**`inbox` at B returned the payload byte-identical** and wrote nothing. **`verify` from a directory holding nothing
— no key, no account, no stamp, no counter, no home — produced the same bundle digest twice**,
`8d30dfdc4c58d6b283189dc08257f4f5bce76577efa89a50dd59fb8279255fe6`, with a narrative carrying it. That is the second
of the two claims WISHMail sells, and it is the first time it has been anything but a design intention.

**The appraisal is the one the gate report predicted before the letter: `unverified`, reason `T-P12-4`** — this
release claims no profile, so §11.4 does not replay the resolution and §9.6 makes that conforming. **T-P9-3 did not
fire**, which is Step 4's signing showing up in an appraisal for the first time. The declared trust class came back
`math` with no endorsements, reported beside the standing and never folded into it (P-12).

**`conformance/fixtures/checkpoint-one-letter.json`** holds the correspondence as the mirror returned it, and
`npm run check:captured` reaches the same standing and the same digest **with no network** (P-4). Six of seven
alterations drive the standing strictly lower; **the seventh cannot be caught by a Verifier that claims no profile**,
because T-P1-10 compares `hdr.ke` against coordinates only a replay produces — so claiming `hcs14` buys a binding
check that is dark today, not just a higher standing.

**What checkpoint one did NOT do**: `returnReceipt` was refused at `send.ts:322`, `ack` was not built, and no reply
had gone the other way. **The first two were checkpoint two's and are done below; the third is held on §G-21.**

---

## GATE TWO, CHECKPOINT TWO — the certified letter and the receipt, 2026-09-10

**A certified letter carrying a return receipt travelled from A2 to B on the lane checkpoint one opened, with nothing
rung; B opened four and a half thousand bytes of it across ten chunks; B's own signature published the receipt on B's
own topic without B paying a tinybar; and a stranger holding nothing read it back and reported the envelope ACKED.**
The run of record is `app/OPERATIONS.md` under Step 6.

```
lane        0.0.10464056    REUSED — B's doorbell held two messages before and after, A2's held zero
envelope    514e5045f706415613a6e513233f9e74007fedf7f89ed0f3b821c87ca28da2e1
payload     the Emancipation Proclamation, 4408 bytes, sha256 a5998644…
settlement  3 stamps = 2 weight + 1 receipt fee (§4.2) · 3.92 s before chunk 0 (T-P7-1)
chunks      TEN, sequences 2-11, chunk_info NULL on every one (T-P9-7)
schedule    0.0.10465145 · payer 0.0.10450879 · waitForExpiry false · 30 days
receipt     417f73b3… on B's OWN manifest topic 0.0.10452154 #1, by B's OWN signature
```

**Nothing was rung, and it is proved by an absence.** §7.1's "a second letter to the same recipient rings nothing" is
now a fact on consensus rather than a design intention, and it cost no stamp at any treasury.

**`inbox` returned the Proclamation byte for byte** — the same 4408 bytes and the same digest as the file — across ten
chunks walked by the `nx` chain, which checkpoint one's single chunk could not exercise at all.

**`ack` checked before it signed.** B recomposed the receipt manifest from three things it knew — the envelope its own
inbox opened, chunk 0's postmark, and the epoch it decrypted under — and matched it byte for byte against the bytes in
the schedule (T-P1-9). A ScheduleSign is a signature over bytes made before the signer can see what it did.

**B paid nothing** (T-P16-2), read before and after: **4,622,564 tinybar and 12 `$POSTAGE`, unchanged to the unit.**
B's *operator* paid 0.0146 ℏ for the ScheduleSign; the execution's own fee went to the payer the schedule designated.
The sender funded the receipt and the recipient signed for it.

**The envelope is ACKED** — the first state after SETTLED this deployment has produced — and the stranger said so
twice at the same bundle digest `00229e6f3d12b1302175ead37ab1460276bbf05254a8856f9a9db948685935a1`. **The appraisal is
the one predicted**: `unverified`, reason `T-P12-4`, trust class `math`, and `receipt: acked` with no reason beside it.
**The receipt did not move the standing** (§11.5); `state` alone changed.

**`conformance/fixtures/checkpoint-two-receipt.json`** holds it all, **schedule record and protobuf body included** — a
row of §11.2's ingestion table no fixture had carried. `npm run check:receipt` is 40 assertions with **no network**
(P-4), seven of them alterations that drive the receipt to `unclaimed` or `invalid` without moving the envelope's
standing by one rung.

~~**WHAT CHECKPOINT TWO DID NOT DO: the plain reply B → A2.**~~ **Done 2026-09-10, after D-171 closed §G-21 — the
register is below.** The finding as it stood: §7.1 says a lane is bidirectional and §7.1's own MUST says a reply
cannot use it, because the lane's `connection_created` is on the ACCEPTOR's doorbell while §7.1 finds a lane by
reading the RECIPIENT's, and **A2's doorbell holds zero messages**. Sending on the shared lane would make an envelope
our own Verifier appraises unbound the day it claims `hcs14`; ringing would open a second lane that cannot be undone.
**Nothing was signed and nothing was rung, and it was found by the dry run before any signature.**

**Two defects the ledger found, both fixed after the run and both in the record.** `ringStamp` moved a stamp to A2's
operator where no doorbell would be rung — nothing consumed, nothing lost, but not where §4.2 says the postage went.
And `submitMessage`'s readback could be answered by an identical OLDER message, so the manifest locator named sequence
1 where this run's manifest landed at 2 — harmless for a content-addressed manifest and not harmless anywhere a
sequence number means something.

---

## GATE TWO, THE REPLY — the letter that came back, 2026-09-10

**B wrote to A2 on the lane A2 opened, in the direction §7.1 said was possible and §7.1's own MUST forbade until
D-171. Nothing was rung, no second lane exists, and A2's doorbell still holds zero messages.** One pass, no stop.
The run of record is `app/OPERATIONS.md` under Step 6.

```
lane        0.0.10464056    REUSED, in the OTHER DIRECTION — B's doorbell held two before and after, A2's zero
envelope    bc1bd61ee97faee136f8f15f1cf0de7590bfef65446d6024982d0152fcd7e492
body        "The Proclamation arrived whole, and I have signed for it. Thank God for Lincoln."
payload     80 bytes · 1 chunk · 1 oz · ONE stamp, no receipt fee
manifest    0.0.10452154 #2 — on B's own topic, B being the sender this time
settlement  0.0.10450880@1789076237.491878073 · 4.03 s before chunk 0 (T-P7-1)
chunk 0     0.0.10464056 #13 · chunk_info NULL · operator_id 0.0.10452149@0.0.10452127
```

**The lane was found at B's own door**, and the dry run printed it before anything signed — the same line that read
`NONE — this is first contact` the day before. **§G-21 is closed by D-171** and **§G-22 by D-172**; the specification
is at **0.5.11**, tagged, and no schema and no wire string moved.

**Nothing was rung, and it is proved by two absences.** A2's doorbell `0.0.10462704` held **zero** messages before and
zero after; B's `0.0.10452149` held the same **two** it has held since checkpoint one. On this lane the `operator_id`
now points both ways: sequences 1–12 name A2, sequence 13 names B.

**A2 paid nothing and B paid one stamp.** B's agent account did not move by one tinybar across three submissions and
went 12 → 11 `$POSTAGE`; B's operator paid **0.03428711 ℏ** for all three and holds no stamp before or after — which
is the `ringStamp` fix on consensus, because no doorbell was rung and so no fee was owed. **A2's operator still holds
the stamp checkpoint two stranded there**: it is not lost, and it pays the next doorbell fee A2 owes.

**A2 found the lane at all, and that is new.** A2 never answered a door, so it has no `connection_created` of its own;
`lanesOf` now reads both kinds — the lanes an agent accepted, at its own door, and the lanes it requested, at the
doors it rang. The home said *whom*; consensus said *which lane* (D-165). `inbox` returned the 80 bytes byte for byte.

**A stranger holding nothing read the correspondence as a correspondence**, twice, at digest
`1c4359e5bf6fbbe00fc82e4e5b358500d307572891a1be89dfd47d493f13d648`: three envelopes on one lane, two affixed by A2
and one by B, the middle one still **ACKED with its receipt still acked**. The reply appraised **exactly as the gate
report predicted** — SETTLED, `unverified`, reason `T-P12-4`, receipt `none`, trust class `math`. **`T-P10-2` and
`T-P17-2` are absent because a claimless release never reaches either check**, not because the lane is right; that
the lane is right is proved offline, and LIMITATIONS L-1 says the check is dark.

**`conformance/fixtures/checkpoint-two-reply.json`** is the first fixture that carries **the lane's birth doorbell**,
which `capture` reaches by following the lane's own memo. `npm run check:reply` is **29 assertions with no network**
(P-4) and runs the binding walk on the captured bytes, told nothing about who the parties are: the lane's memo names
the door, the door's memo names its owner, the answer on it names the ringer, and the pair is the same set from
either direction. `check:letter` is **155**, up from 133. **Twenty-one checks green.**

**Three findings stand open, none of them a defect in this run.** **§G-24**: the pinned HCS-10 text says in its prose
that the acceptor writes the Outbound Connection Created record and in three of five required field descriptions that
the requester does. **One outbound record already on consensus is wrong against the pin** — A2's log `0.0.10462708` #1,
which named itself where `index.md:553` names the target and omitted two required fields; fixed forward, named in
LIMITATIONS, and not repaired, because a consensus record cannot be rewritten. **§G-25**: the evidence bundle's digest
is a function of the release's patch version, so checkpoint one's and two's digests reproduce from tag `v0.5.10` and
this one from `v0.5.11`.

---

## A2 — the register, 2026-09-10

**A2 is provisioned on `hedera:testnet` and it is the demo's first Correspondent from here on**, superseding both A
(stopped, unchanged) and the plan's "A′". Where an earlier section or a plan says `A′`, it means A2. Bought at
sequence 4's price, through a counter carrying Gate One's eight fixes, **in one pass with no stop**. The run of record
is `app/OPERATIONS.md` under Step 5.

```
account 0.0.10462700   doorbell 0.0.10462704   log 0.0.10462708   manifest 0.0.10462713
declaration registry 0.0.10462719   profile file 0.0.10462723   registration 0.0.6913983#382
home a2 · displayName DemoAgentA2 · operator wallet 0.0.10450879 (C1OPERATOR, the same wallet A's home names)
purchase 0.0.8641261@1789058834.851527600 — 43.23883804 ℏ, twelve stamps and the provisioned path at 30 ℏ
```

**Both resolutions `math`, endorsements `[]`, no `blurred`.** The receipt validates against the registered schema and
its `rate.at` replays: `GET /network/exchangerate?timestamp=1789056062.817630056` yields `0.07553533`, which is what
the receipt says (D-170). A second run against the same home created nothing and exited 0.

**The eight fixes are proven, with one honest gap.** A2 passed through the submit→learn window nine times — the
transfer and eight carried rows — and stopped at none. Six of the eight are proven by the happy path; defects 3 and 5
are proven by their artefacts, the surviving purchase reference and the existence of a receipt at all. **What is NOT
proven is the resume path**: every stop condition was live and none fired, so the branch that matters most when
something goes wrong is still exercised only by `check:correspondent`'s 109 offline assertions.

**The reprice is answered by the ledger.** A2 cost the Postmaster 29.43736563 ℏ and sold for 43.23883804 ℏ — **net
+13.80 ℏ**, where B at sequence 3 was **−12.69 ℏ**.

**DIVERGENCE.** The run went live under the invocation `app/OPERATIONS.md` documented as the dry run: the root
script's nested `npm run … --workspace app` consumed the appended `--dry-run`, the driver read `false` and printed
`LIVE`. Everything on consensus is correct and nothing was repaired. Signing drivers now default to dry run and
require `--live` to arrive in their own argv, printing the mode and the received arguments before reading a key
(`046fc7e`, CLAUDE.md §12).

---

## TOMORROW — 2026-09-10, ruled (Sonic, 2026-09-09) — **ALL FOUR ITEMS CLOSED 2026-09-10**

**This list is spent.** Its four items are signed and recorded — sequence 4, the wallet top-ups, A2, and Gate Two in
all three acts — and the Open-for-Sonic list beneath it is ruled through. What follows it is the record of the day,
not instructions for the next one. `plans/2026-09-10-gate-two.md` carried it and is now history.

**SIGNED 2026-09-10 — item 1 is done. `PriceList` sequence 4 is on `0.0.10426551`, 667 bytes, sha256
`03a553856cbae698c21c622a89f3711410dc55a7f8f1eda843134524c04330ec`, consensus `1789055861.123389104`, transaction
`0.0.8641261@1789055853.203536189`. `provisioning.unitPrice` is 30 ℏ, `registrationFee` unchanged at 0.05 ℏ, and it is the
schedule every purchase from that timestamp quotes at. Sequence 3 is history and Correspondent B is not repriced.
Run of record in `app/OPERATIONS.md`.**

1. ~~**Sequence 4, before A2.**~~ **DONE 2026-09-10.** `PriceList` sequence 4 on `0.0.10426551`, 667 bytes, sha256
   `03a553856cbae698c21c622a89f3711410dc55a7f8f1eda843134524c04330ec`, consensus `1789055861.123389104`.
   `provisioning.unitPrice` **30 ℏ**, `registrationFee` unchanged at 0.05. Sequence 3 is history.
2. ~~**Wallet top-ups, before A2.**~~ **DONE 2026-09-10, and not by the Postmaster.** Both operator wallets were
   funded from **Sonic's own accounts** — 40 ℏ each from `0.0.6748221`, then 400 ℏ each from `0.0.10331158` — and
   A2's own agent account received 150 ℏ from the same. Recorded as funding and not a sale. `0.0.10450879` holds
   416.67021364 ℏ and `0.0.10450880` holds 459.90905168 ℏ.
3. ~~**A′.**~~ **DONE 2026-09-10 — and it is A2.** See the register below.
4. ~~**Gate Two.**~~ **DONE 2026-09-10, ALL THREE ACTS** — see the three registers above. §10.4's scheduled receipt
   and `ack` are built and on consensus; the second letter went out on the same lane ringing nothing, B acked, the
   receipt landed on B's manifest topic at a 30-day window paid by the sender's own operator wallet, and `verify`
   shows the envelope ACKED. **The reply B → A2 went the other way down the same lane**, after **D-171** closed
   §G-21 and **D-172** closed §G-22 and the specification moved to **0.5.11** — nothing rung, no second lane, and
   A2's doorbell still holding zero messages.

**RULED, and the list is closed (Sonic, 2026-09-10).** Every item that stood here is answered, and **the spec changes
they oblige have LANDED as 0.5.12**, tagged `v0.5.12`: D-173 (§G-25), D-175 (§G-18) and D-176 (§G-23). **The probe
decided the version rather than the argument**, which is what the ruling required: the frozen `evidence-bundle` schema
types `spec` as a bare `{"type": "string"}` — `spec/schemas/evidence-bundle.schema.json:9-11`, verified against
`spec/pins.json` by its blob digest `248fdaae…` before it was read — so `"0.5"` is admissible, **no schema moves**,
and it is a patch.

- ~~**§G-25** — the bundle digest is a function of the release's PATCH version~~ → **the bundle's `spec` carries the
  MINOR version, `0.5`**; the patch a Verifier ran at rides in `observations.verifierSpec`, which §11.6 already keeps
  out of the digest. **LANDED as D-173 in 0.5.12.** Two things were proved before that field was written, on Sonic's
  instruction — that `observations` lies outside the digest (the specification says so three times, and `verify.ts`
  digests the evidence *before* the observations object exists) and that the frozen schema admits the key (no
  `additionalProperties` on `observations`, and the schema's own validator run over a bundle carrying it). The bundle's
  **top level** refuses an extra key, so `observations` is the only place it could go. **Every recorded digest moves
  once and never again for a patch**: `8d30dfdc…` and `00229e6f…` reproduce from `v0.5.10`, `1c4359e5…` from `v0.5.11`,
  and each run of record now says so beside its own number, as does LIMITATIONS L-1. The records are not rewritten.
- ~~**§G-24** — the pinned HCS-10 contradicts itself about who writes the Outbound Connection Created record~~ →
  **written on BOTH parties' logs**, satisfying both readings at one message each. **The outbound records are the
  primary enumeration path from the fix forward; the home's address book is the fallback for lanes whose records
  predate the fix or were never completed; consensus is the only authority on whether a lane exists.** A2's lane with
  B is a permanent counterexample — its one record is in the inbound shape and cannot be edited — the requester-side
  record sits in a submit→learn window and is best-effort, and neither log is authoritative: §7.1's rule is the
  `connection_created` on the doorbell, so every candidate is confirmed there before it counts. The contradiction is
  **recorded FETCHED**, not resolved.
- ~~**§G-23** — §11.4 requires a reason no test names~~ → **the test row is added in the 0.5.12 patch.** A MUST does
  not stay without a court (§1.3). **LANDED as D-176**: **T-P1-12** under P-1, §11.4's sentence citing it, and
  `verify` reporting it in place of the borrowed `T-P12-2`. The register is **87** (82 core + 5 extension) and the
  harness reads `register 87 · files 87 present · passed 0 · failed 87`. No row joins §11.5's table, because an
  unrequested receipt yields no standing.
- ~~**§G-20** — the provisioned path cannot be rate-priced under a frozen schema~~ → **a 0.6 candidate, and no version
  event follows it.** Shown as ruled rather than open: it waits on a minor version, not on a decision.
- ~~**§G-18** — §5.3's gloss on `resolvedAt`~~ → **folded into the 0.5.12 patch by reading (a)**, because one sentence
  closes it: "query time, reported beside the coordinates". **LANDED as D-175**, text only — no schema, no test, no
  code, and §10.2 untouched, because its exclusion of `resolvedAt` from the digest never rested on this phrase.
- ~~**the 150 ℏ in A2's own agent account**~~ → **intentional operator funding of a test deployment.** The invariant
  was mis-stated as the agent's and **it is the Postmaster's: the Postmaster never funds an agent's account beyond the
  single registration fee.** What an operator puts into its own agent is that operator's affair. `CLAUDE.md` §11
  carries the amended sentence; the two earlier phrasings stand where they are as the record of what was believed.
- ~~**which classes the first claim names**~~ → **none, until test bodies pass.** The `hcs14` path is **45 bodies**,
  and it follows Gate Three.
- ~~**whether `hol` is BUILD on the map**~~ → **BUILD, and landed 2026-09-10**: A2 and B both resolve under it with no
  `blurred`.
- ~~**the running-hash integrity check (L-10)**~~ → **not in this window.** LIMITATIONS names our timing, as it does
  everywhere else we defer.
- ~~**the HCS-14 proposal for the NANDA email `nativeId` (D-112)**~~ → **a repo item, outside this window.**
- ~~**demo shape**~~ → **Friday's own pass.**

**Still open and not on this list:** ledger **§G-8**, the P-16 seam on a Hedera network — ruled 2026-09-07 a spec
question and not a build item, and deliberately not patched since.

**What is not done, and is not pretended to be:** the `dns` and `nanda` resolvers. The CLI and the
WebMCP page. **The claim**: eighty-six tests are registered, none is expanded, zero pass, and `RELEASE.classes` is
empty — this release claims nothing, and §1.5 says silence claims nothing.

**Closed since.** The x402 testnet facilitator — D-132, 09-07: x402.org, `hedera:testnet` only. LICENSE — Apache 2.0, stated as a non-negotiable in `CLAUDE.md` §3 and present in the repository since the initial commit; `CONTRIBUTING.md` and `README.md` name it, and contributions are certified under DCO 1.1 with no CLA.

---

## The dated build history — earlier days, kept as the record

**A resume does not need what follows.** §6, GATE ONE and TOMORROW above are the whole of where the build is and what it does next; everything from here down is what was done on 2026-09-07 and 2026-09-08, kept because the record is the point.

**Where the build stands — 2026-09-08, close of day.** Everything below is done and pushed to `main`.

- **Phase A** — the 0.5.1 patch (D-135 – D-138), tagged `v0.5.1`.
- **Phase B Step 1** — ADRs D-139 – D-144, written before the first transaction. Writing them surfaced three defects in the frozen text, raised as ledger §G items 9 – 11 rather than patched.
- **Phase A′** — the 0.5.2 patch (D-145 – D-148), which is the answer to them: `validFrom` dropped from the `PriceList`; §4.6's `Conformance:` note corrected to name the admin key, with §A's T-P17-1 row amended to match; the provisioning template given its fifth row, the HCS-2 declaration registry topic; and `$POSTAGE` given a supply key on the treasury. **Tagged `v0.5.2` at `21cb3c2`** — the text every entity is provisioned against, and the tag the ops record cites.
- **The HIP-991 probe** (D-149) — wholly disposable, run 2026-09-08. It settled four things by observation rather than reading, all in ledger §H: the fee is debited from the transaction **payer**; the waiver is **by signature and not by payer**, so an owner answering its own doorbell costs the Postmaster nothing (§4.4, D-137, D-139); the exempt list is amendable under the **admin key alone**, which is why D-138's doorbell row stands with no fee schedule key; and `fee_exempt_key_list` is the mirror node's real field name.
- **Phase B Step 2** — the eleven entities on `hedera:testnet`, under a full gate reported before any signature. Treasury `0.0.10426205`, postmaster-agent `0.0.10426206`, `$POSTAGE` `0.0.10426208` (born at zero, ten thousand minted as its own act), both associations, price topic `0.0.10426551`, the first `PriceList` at sequence 1, doorbell `0.0.10426553`, log `0.0.10426554`, manifest `0.0.10426591`. Both halves of the acceptance test pass. `spec/pins.json` closed exactly two nulls.
- **Phase A″** — the 0.5.3 patch (D-150, D-151), **tagged `v0.5.3`**. D-150 is a specification change and it exists because Step 3 needed it: §4.6's `Conformance:` note required every provisioned topic to carry the agent's **admin** key, and HCS-1 marks a file topic that has one invalid and ignores it (`hcs-1.md:48-49`, a fact that had been in ledger §H since the recon). As landed, no HCS-11 profile file could be provisioned conformantly, so §9.2's whole `hcs14` declare surface was unreachable. The note now excepts the case where the pinned standard forbids an admin key — objectively, so a declared policy cannot reach the exception — and D-147's template gains a sixth row. D-151 narrows `conformance/README.md`'s over-wide reading of P-13 so that `spec/vectors/seal.json` can carry the recipient key T-P1-5 needs, and widens the P-13 gate, which `AGENT_X25519_DER_KEY` would have walked straight past.
- **Phase B Step 3 — the wiring.** `spec/vectors/aad.json` and `seal.json` exist and every value in them recomputes. The seal is composed on `node:crypto` rather than taken as a dependency (RECORD, Sonic 09-08): RFC 9180 publishes no vector for §7.3's ciphersuite, but A.1 shares its KEM and KDF, so `npm run check:seal` runs the same code at A.1's parameters and reproduces every published value. `app/src/` gains `core/` (canonical JSON, the AAD, HPKE, the seal, HCS-14), `schema/` (one ajv registry for §18.5's fourteen), `state/` (§14.2's durable record), `mcp/` (the six tools of §6.1, bodies returning `NOT_IMPLEMENTED`), and `release.ts`, which declares 0.5.3 and claims nothing. `conformance/` gains the runner, the register parser, the report writer and 83 test files, none expanded, every one failing with its T-ID and the invariant it serves.
- **Phase A‴** — the 0.5.4 patch (**D-152**), tagged `v0.5.4`. Sonic asked for a census before ruling §G-12, and it is unanimous: of the fourteen newest `uaid:aid:` registrations on the testnet anchor `0.0.6913983` plus `0.0.7124407`, **15 of 15 reproduce under HCS-14's example key order and none under the order it calls normative** — the newest (2025-11-18, `proto=a2a`, `registry=hashgraph-online`) beside `0.0.7124407`'s (2025-10-24, `proto=hcs-10`, `registry=hol`). Ruled regardless of §G-12: every rule **accepts either order, normative first**, and reports which matched under `observations.agentIdOrder` — an observation, so it moves no standing (§9.1, §11.6). T-P6-3 and T-P6-5 each gain a legacy-order fixture agent. The defect is drafted for upstream submission at ledger §G.5(b) and stated in LIMITATIONS L-7.
- **§G-12 closed by D-153, and the declaration signed.** WISHMail emits its own agent identifier under HCS-14's example order — the one 15 of 15 registrations on the anchor use, and the one §G.5(b) asks upstream to make normative. The `hcs14` declaration then landed on `hedera:testnet` against `v0.5.4`: declaration registry `0.0.10428113` (HCS-2, memo `hcs-2:0:60`, submit and admin the agent's), profile file `0.0.10428178` (HCS-1, **no admin key**, D-150), one chunk, the registry's current entry naming the file, and the account memo of `0.0.10426206` set to `hcs-11:hcs://2/0.0.10428113`. Sixteen entities now stand; a second run creates nothing.
- **The first profile file was wrong, and our own resolver found it.** The agent was hashed under `version "1.0.0"` while the HCS-11 profile carried `"1.0"`, and a profile has exactly one `version` field — so the published `uaid` was not recomputable from the profile carrying it, which is what §9.5's MUST asks of any reader. Nothing before consensus detected it: the declaration validated, the digest matched the memo, the identifier was consistent with itself. Superseded under §9.2:1284 by a second file, registered as the registry's next entry; the first is permanent and sits in the ops record's `residue`, because an HCS-1 topic has no admin key. Ledger §G item 13.
- **`resolve` works, from consensus and nothing else.** `npm run resolve -- 0.0.10426206` walks §9.2's rule — account memo → the registry's current entry → the HCS-1 file → `properties.wishmail` — with no key, stamp, account or broker configured (P-4), and returns `MailCoordinates` that validate against their schema with `trustClass: math` and **`endorsements: []`**: T-P6-3's "an HCS-2 memo resolves without `blurred`", on consensus rather than on a fixture. By UAID it also runs §9.1's comparison and reports `observations.agentIdOrder: example`.
- **Step 3 stopped before its signatures until §G-12 was ruled, and the stop was the finding.** The `hcs14` declaration is gated in `app/OPERATIONS.md` §Step 3 — written before any transaction, as the probe and Step 2 were — and §6 of that report says why nothing was signed. HCS-14 contradicts itself about the canonical key order of the six fields an agent identifier is hashed from, and the two orders give different identifiers for the same agent; its own test vectors publish the expected value as a literal placeholder, so it courts nothing. Checked against the ledger instead: a live testnet agent's on-chain identifier reproduces under the standard's example order and not under the order it calls normative. It blocks because the profile's digest is the HCS-1 topic's memo, which cannot be changed once the topic exists. **Ledger §G item 12; Sonic rules.**

- **Close of day: D-154, and Step 4 built and held.** `spec/pins.json` carries an entry per *deployed* ledger tag, so `hedera:mainnet` is removed rather than nulled and **28** pins remain — the `registeredSchemas` entries and nothing else (D-154). Step 4, the HCS-13 registration of §18.5's fourteen schemas, resolves as 56 planned steps under `npm run schemas:plan` and is a **separate ordered set `npm run provision` cannot reach**: registering is §1.7's freeze of `spec/schemas/`, and it is signed only when the six tool bodies pass their fixtures. Its gate report is `app/OPERATIONS.md` §Step 4 and records one divergence to rule — HCS-13 at the pin and §5.11 both put one HCS-2 topic per schema, not one shared registry. `CLAUDE.md` §9 gains the method rule the profile-version defect earned.


**Where the build stands — 2026-09-09, close of day.** Everything below is done and pushed to `main`; the tree is clean and `origin/main..main` is empty at each landing, which is now the rule rather than the habit.

- **D-155, and the push rule.** Step 4's divergence is ratified as built: **one HCS-2 topic per schema, no discovery registration** — HCS-13 at the pin and §5.11 both put the version registry per schema, and a shared registry would make `#<seq>` mean "the nth registration of anything" rather than "version n of this schema". The instruction that had said one shared registry was Claude's error, and D-155 records that on Sonic's word rather than manufacturing a citation for it. `CLAUDE.md` §9 gains **push per landing**: every commit goes to `origin` as it lands, with every tag, and the commit and a clean `git log origin/main..main` are reported — an unpushed commit is work only this machine has, and the point of the record is that someone else can read it.
- **The chunk chain, writer and reader in one file.** `core/chunk.ts` slices §7.4's ciphertext and `reassemble` walks §11.3's chain back. Slice sizes are **measured against the real wrapper** per chunk rather than fixed, because §7.4 says the budget "depends on identifier lengths and is not fixed by this document"; `n`'s decimal width is a fixed point, since a ten-chunk envelope needs two digits and the probe that assumed one emitted a 1001-byte chunk 0 — caught by the chunker's own closing assertions. `check:chunk` reproduces §11.3's worked example: a foreign chunk lands **before** the sender's and the sender's is still canonical, the foreign one recorded off-chain and unused.
- **Step 5's gate, written before any signature — and the `chunk_info` stop condition settled inside it.** `app/OPERATIONS.md` §Step 5 opens with `send` before implementation: actors, I/O, the eight invariants as each binds at send, F-1 – F-11 where each lands, §6.4's eight `TOOL_REASON` codes, and the 27 T-IDs the step answers, split sender-side and reader-side. §7 fixes what "done" means so the step cannot end early. The `chunk_info` defect STATUS had recorded and not acted on was confirmed **on consensus** and fixed **without a signature** — the paragraph above says how — and is now a scoped DIVERGENCE with both decoded transaction bodies as its evidence.
- **Assembly.** `core/envelope.ts` is §6.4 steps 3 and 4 out and §5.5 back: `sealEnvelope` chooses the nonce, builds §7.2's AAD, seals under §7.3 and computes §7.5's weight and postage; `affix` takes the settlement reference and produces the header, the chunks and the Envelope; `recoverEnvelope` rebuilds §5.5's object from chunk 0 and the topic it arrived on. The two-call shape is where §6.4's step order meets §5.6's `hdr.st`: the header carries the settlement reference and the header's bytes fix every slice boundary after it, so the chunking cannot precede the reference — and does not have to, because a Hedera transaction's reference is its transaction id and the payer pins that before signing, which is what `ops/journal.ts` already rests on. `affix` runs the AAD rebuild against its own header before any caller can sign it.
- **The three tool bodies, and the letter end to end.** `send` is §6.4's six steps in §6.4's order; `inbox` writes nothing and never fails where it can return, so every §6.5 reason is a returned `Delivery`; `verify` reads §11.2's ingestion, walks §11.3, appraises §11.4, orders reasons by §11.5's table and digests by §11.7 with `observations` excluded. They speak to one consensus port whose **read half has no write on it**, which is how P-4 is enforced rather than promised: a Verifier is handed a `Reader` and there is nothing in its hands to configure, key or pay for. Everything that could differ between two Verifiers is in the **scope** — the stamp token, the profiles claimed — because P-3's determinism is relative to scope. `npm run check:letter` runs the whole letter against `tools/memory.ts`, a modelled ledger that enforces submit keys, HIP-991 fees, token balances and total consensus order: **60 assertions**. The letter opens byte for byte; two Verifiers agree on the digest; the bundle, the narrative, the envelope and the settlement each validate against their registered schemas; an unanswered door yields a slip with one stamp gone and no postage. It appraises **`unverified`** with the single reason **T-P9-3** — the schema registry is built and unsigned, so no `schemaRef` resolves — which is the true statement and stays until Step 4 is signed. Step 7, the return receipt, is **refused rather than skipped**: postage would include the receipt fee and chunk 0 would request it, so an envelope assembled without §10.4's schedule is one whose sender paid for a receipt nobody was asked for.
- **The seven alterations, applied on consensus rather than in memory.** Each rewrites what is on the modelled ledger, which is a harder case than the real one: a party holding a lane key can only add a competing message, never rewrite one that landed. An altered **header** (a nonce nobody sealed against) and an altered **resolution proof hash**: `INBOX_UNBOUND`, and `verify` reports `T-P1-1`. An altered **`operator_id`**: `INBOX_UNBOUND`, `T-P1-6`. An altered **key epoch**: `INBOX_EPOCH_UNKNOWN`, `T-P1-10`. A **broken link** in the chain: `INBOX_INCOMPLETE`, `T-P3-3`. An altered **settlement memo**: `INBOX_UNSTAMPED`, and the envelope appraises unstamped. The whole envelope copied to **another topic**: `INBOX_UNBOUND`, because the lane is not in the chunk — it is the topic the chunk arrived on.
- **Two defects the readers found, both of the profile-version class.** Writing `verify` found that the `hcs14` resolver put only a **digest** in its manifest's `output`, while §11.2 reaches the recipient's account and doorbell through "the resolution manifest's output" and §11.4 replays against "the coordinates the manifest carries": a Verifier could look the manifest up and hash it and could not learn which doorbell the lane had to be born from. The output now carries the coordinates, which §5.2 permits and §11.4 requires, through one extracted builder both the resolver and the fixture use. And validating our own chunks against our own registered Chunk schema found `hdr.rp.u` typed as an optional **string** where the schema requires a structured message locator and requires it present — so every fixture chunk built to that point would have failed the schema §11.2 navigates by. Typed now as `MessageLocator` in `core/locator.ts`. Neither is a specification defect; both are what CLAUDE.md §9's method rule was written for, and both were found by running the reader on the writer's output.

**What is not done, and what it blocks — close of 2026-09-09.**

- **The Streamable HTTP transport.** The MCP server runs over stdio only. It blocks the second-process fixture, which reaches the Postmaster over that transport and no other, and it is the surface §14.2's `402` exchange is issued on, so it also blocks `buy_stamp`'s body.
- **The second-process fixture under `app/sdk/`.** A separate entry point, its own working directory, its own `.env`, keys born in that process and written nowhere the Postmaster reads (P-13). It blocks the first real letter, because there is no Correspondent to send one.
- **The first letter on `hedera:testnet`.** `send`, `inbox` and `verify` run end to end against a modelled ledger and against nothing else. Until a letter has a real postmark there is no fixture material, so it blocks the T-ID expansions below.
- **The fixture capture and the T-ID expansions.** None of the 85 tests is expanded: every one exists and every one fails, naming what it is for. The reference side of many now exists as a `check:` script, which is not the same thing and is not counted as one.
- **Step 4's signature, and the 28 pins behind it — ready, and held for authorization rather than for a condition.** `spec/pins.json` carries twenty-eight unfilled pins, the `registeredSchemas` entries, and the HCS-13 registration that fills them is built and planned at **56 steps**. §G-16 closed it at 0.5.6, `check:freeze` exits 0, and the three schemas it would otherwise freeze unexercised are exercised. What remains is a decision: registering freezes every schema in `spec/schemas/` for the life of 0.5, so after it the smallest field is 0.6. **T-P9-2 refuses a report while any pin is unfilled, so no conformance claim is possible yet**, and the runner prints that refusal rather than working around it. It is also why the first letter appraises `unverified`: no `schemaRef` resolves.
- **Still unbuilt beyond Step 5.** `buy_stamp` and `ack` return `NOT_IMPLEMENTED`; the `dns`, `nanda` and `hol` resolvers; the CLI; the WebMCP page and the MCP-B bridge; §10.4's scheduled receipt, which `send` refuses rather than skips.

**Where the build stands — 2026-09-09, GATE ONE re-armed and waiting on Sonic’s word. Nothing signed.** §G-19 is ruled and
closed. The vertical slice exists as far as the first gate: a Correspondent process whose home directory is its identity, a
counter that quotes from consensus, cannot submit a purchase without the buyer’s signature, and **pays for the mailbox it
sells** under a policy it publishes; and §9.5’s resolver. The gate report is `app/OPERATIONS.md` Step 5, amended for the new
shape before any signature, in the form Steps 2-4 follow.

- **§G-19 is closed by D-168, reading (a): the Postmaster provisions the mailbox it sells.** §4.6’s provisioned path taken as
  written, so §5.4’s "the entities the Postmaster created for the holder" is literally true and the receipt validates against
  the schema Step 4 froze. **No specification sentence, no schema, no wire string and no test changed**; the version stays
  0.5.9. Reading (b) — the two fields become optional — is the more accurate description of what D-159 attempted and is
  recorded as such; it lost on cost, being **0.6** across fourteen files now registered on consensus.
- **The payer seam’s remote half is exercised, and that is the finding worth keeping.** The provisioner did not move:
  `sdk/mailbox.ts` creates the same six rows in the same forced order signed by the same agent key, and `Session.payer` is
  simply a remote `Signer` — four lines of substance in `sdk/carry.ts`. What took the work was the counter deciding what it
  will pay for, which is where the risk lives and where a policy belongs.
- **The counter decodes the bytes it signs.** `counter/body.ts` reads a `TransactionBody` and `counter/carry.ts` pays only
  for a row of `ops/template.ts` naming this holder’s key, a chunk on the file topic it paid for, the register entry on the
  registry it paid for, or the account-memo update on the holder’s account. Every field number in the decoder was probed off
  a body the SDK froze, and `check:correspondent` re-probes them on every run.
- **`npm run check:exchange` — 49 assertions over a real Streamable HTTP socket**, the first in this project to open
  one. It found that MCP refuses a non-error result from a tool declaring an `outputSchema`, so every leg of the purchase
  but the receipt is now flagged and carries a state code. The two submissions are Gate One’s.
- **`PriceList` sequence 3 is on consensus** (D-170), and Gate One’s purchases quote at it: the `hbar` rate is now
  read from Hedera’s own exchange rate, which a mirror node serves with a timestamp filter, so a Verifier holding a
  receipt’s `rate.at` obtains exactly what the Postmaster read. Verified by replay, 2026-09-09, identical to the digit.
  Under the DEX source every rate-priced receipt would have been true and unprovable, and P-12 downgrades what cannot
  be replayed.
- **GATE ONE RAN, 2026-09-09.** **Correspondent B is provisioned on `hedera:testnet`** — bought at sequence 3's price,
  its eight mailbox rows carried and paid for by the Postmaster, its receipt issued from the counter's own readback,
  its registration on the HOL anchor at sequence 381 **paid by its own account**, and it resolves under `hcs14` and
  `hol` with **no `blurred`** on either. Account `0.0.10452127`, doorbell `0.0.10452149`, log `0.0.10452150`, manifest
  `0.0.10452154`, declaration registry `0.0.10452155`, profile file `0.0.10452158`. Two further runs against the same
  home created nothing and exited 0. **`ENTITIES.md` carries every id with a HashScan link.**
- **Correspondent A is STOPPED and its state is on consensus**: account `0.0.10451893`, bought and paid for, holding its
  12 `$POSTAGE` and its 0.05 ℏ, with no mailbox and **no receipt**. A defect deleted the counter's record of that sale —
  the quote it charged and the rate it charged at — and §5.4's receipt is built from those, so rebuilding them would be
  manufacturing the evidence the receipt exists to be. Nothing was charged twice and nothing can be. **Finishing A
  through `generate_mailbox` at its own operator's expense is L-5's self-provisioned path and a decision about who pays**,
  written in `app/OPERATIONS.md` and not taken.
- **Eight defects, every one in the window a real submission is the only way to reach**, all fixed and pushed; the run
  of record names each with what it cost. `check:correspondent` is 109 assertions, up from 105, and the four it gained
  are the SDK facts the first one turned on.
- **The doorbell costs 26.31542199 ℏ, measured for the first time.** One mailbox costs the Postmaster 27.78102934 ℏ to
  provision and sells for 15.09094832 ℏ. Nothing on consensus is wrong and no fee left its ceiling; `provisioning.price`
  was simply set before the cost of a HIP-991 fee-gated topic was known. **Repricing is a new `PriceList` message and
  touches no schema and no wire string** — a decision, in LIMITATIONS, not taken here.
- **What Gate Two owes.** `send`, `inbox` and `ack` refuse on the Correspondent’s MCP, naming the gate. They are built and
  run end to end against the modelled ledger (`check:letter`, 63 assertions); what they need is the live wiring, §10.4’s
  schedule — which `send` still refuses outright — and a letter to carry.
- **The template has one spelling now**, and so do D-162’s sentences. `app/src/ops/template.ts` holds D-147’s six rows and
  **three** readers now share it: the Postmaster’s own provisioner, the Correspondent’s, and the counter’s carry policy, which
  decides what to pay for by reading the same functions.
- `npm run check:correspondent` — **105** assertions with no network and no key, up from 53. The battery is otherwise
  unchanged and green.

**Where the build stands — 2026-09-09, Step 4 SIGNED and the schemas frozen.** On Sonic's authorization the fourteen schemas of §18.5 are registered under HCS-13 on `hedera:testnet`, all 28 pins are filled, and the second `PriceList` is sequence 2 on the price topic. **§1.7 has bitten: from here the smallest field in any of the fourteen is 0.6.**

- **Fifty-six entities, four per schema**, in the order §5.11 and HCS-13 force: the HCS-1 file topic (memo the schema's digest, **no admin key** — `hcs-1.md:48-49`, D-150), its chunks, the HCS-2 registry that manages that one schema's versions, and the `register` entry whose sequence the `schemaRef` pins. Registries carry memo `hcs-2:0:60`, **indexed 0**, so an earlier `schemaRef` never becomes unresolvable (D-155). The full table is `app/OPERATIONS.md` under Step 4's heading. Second run: `existing 56`, created nothing. Cost 9.70 ℏ including the PriceList.
- **Verified from consensus, not from a receipt.** All fourteen `schemaRef`s resolved as a Verifier resolves one — registry at that sequence → `t_id` → HCS-1 file → reassembled by `o` → decompressed — and compared byte-for-byte to `spec/schemas/`. **14 of 14 match and every digest equals its pin.** That is T-P9-4's substance, observed.
- **The first run stopped, and the defect was ours.** `hcs-1.md:92-95` says a segment is "no greater than 1024 bytes" AND that each chunk is one HCS message; a single HCS message caps at 1024, and a 1024-byte segment inside `{"o":N,"c":"…"}` is 1037. **The two sentences cannot both hold**, the SDK splits silently rather than refusing, and the run's own readback caught it — `Unterminated string in JSON at position 1024`. We now bound the whole message. A second copy of the same loop in `ops/declaration.ts` had the same bug and is collapsed into the one chunker. It had never shown because every HCS-1 file before this was one chunk. **Residue**: topic `0.0.10448375` holds three half-chunks, carries no admin key, and can never be deleted; it is in the ops record under `residue` with the reason, and nothing was ever pinned from it. Ledger §H carries the standard's contradiction.
- **The second `PriceList`, sequence 2** on `0.0.10426551`: 637 bytes, `provisioning {method: "hbar", unitPrice: "2", registrationFee: "0.05"}` — RECORD (Sonic). Sequence 1 untouched, as §14.3 requires: the schedule is the sequence of messages. **The provisioned path of §4.6 is sellable for the first time**; until a price is published §14.3 forbids charging under it.
- **The harness now produces a report, and the report says nothing passes.** `86 registered · 86 present · 86 selected · 0 passed · 86 failed`, and then, for the first time, `report conformance/reports/all.json` with `reportDigest f635da3f…`. **T-P9-2 is satisfied and T-P15-3 is not**: a claim may name no class whose suite did not pass in full, and none did — all 86 tests are registered, present and unexpanded. Registering the schemas made a claim *possible to check*; it did not make one true.

**Where the build stands — 2026-09-09, §G-17 ruled and 0.5.8.** The manifest did not fit in one HCS message for any realistic address. Sonic ruled it by a third route neither candidate named, and the freeze is ready on every axis. **Nothing was signed.**

- **The coordinates value stops travelling (D-167).** §5.2 already gave `output` as `{digest} | value`, and §10.2's "the output is the coordinates" named what the output *is*, not how the manifest carries it. The resolution proof now carries `{digest}` — the SHA-256 of the canonical JSON of the resolved fields — and never the value. §10.4's and §10.5's outputs are untouched. **The court did not move**: §11.4 already required a Verifier to replay the rule and produce coordinates, and it now hashes them and compares; a mismatch is the failure a value mismatch was, at the same standing. What is accepted, and Sonic accepted it explicitly: a manifest read off its topic is no longer a document a person can read.
- **Why neither candidate.** Raising §9.1's ceiling buys **24 bytes** — a single HCS message caps at 1024, observed and not only read (`getRequiredChunks()` is 1 at 1024 and 2 at 1025; `@hashgraph/sdk` 2.81.0's `CHUNK_SIZE = 1024`), and past it the only route is `chunkInfo`, which would cost D-96's one-message-one-locator discipline and D-163's location-by-hash lookup. Bounding `statement` alone never reached the two profiles that MUST carry a snapshot. Ledger §H carries the fetch.
- **§9.1 writes the budget down.** Computed per profile at each profile's own worst case — the largest address its grammar admits, only the endorsements its own rule assigns — the remainders are `hcs14` 131, `hol` 72, `dns` 267, `nanda` 205. **N = 70 bytes** for `meaning.statement` plus any snapshot; `proof.schema.json` bounds it there; `app/src/ops/budget.ts` is the one calculation the specification's sentence, the schema's bound and the check all read. The binding case is `hol` at a UAID with §9.2's locator beside its own.
- **Two things the ruling forced, and they are the honest cost.** **§9.2's locator gains `address`** — the rule's own first input, which a Verifier must be re-given to re-run the rule, and which moves a UAID's 168 bytes out of `output` and into the locator, so the net saving is about 110 bytes rather than 290. And **`verify`'s replay became real**: it had stopped at the registry entry because the rule was written against a mirror-node client, said so in a comment, and appraised on a partial replay anyway. §9.2's rule now runs over a `ProfileSource` — three reads of public data that both a mirror node and a Verifier's `Reader` satisfy — so `resolve` and replay are one function. The letter fixture now stands up an actual HCS-1 profile file, which it had never done: the reader is what says whether the writer wrote anything.
- **Re-measured, and one shape still does not fit.** Wire form, short address / longest address: `hcs14` **725 / 882**, `hol` **790 / 790**, `dns` **841 / 866**, `nanda` **995 / 1042**. Every shape fits but `nanda` at its longest address, 42 bytes over, and §9.1's retained snapshot-to-digest fallback is what carries it. Reported rather than trimmed, with what it costs said plainly: such a proof is witnessed rather than replayable, which `nanda`'s permanent `blurred` already declares (§9.4) and which §11.4 appraises as unverified. No schema moves for it and `nanda` is not on the letter path this window.
- **The gate.** `check:prefreeze` 35 assertions, **exit 0**. `check:freeze` 22 assertions, **exit 0** — the receipt manifest is now **508 canonical bytes** and the `ScheduleCreate` **677 unsigned**, down from 674 and 843 at 0.5.7. `schemas:plan` is **still 56 steps**; exactly one row moved, `proof` `59282cb8…` → `e4ebeaba…`, 5159 → 6198 bytes, 2 → 3 chunks. **`price-list` did not move**, because the schema already admitted a flat `provisioning.unitPrice` beside a rate-priced `methods[]` entry — confirmed by validating the filled message rather than by reading the schema.
- **The second `PriceList` is filled and unsigned.** `provisioning {method: "hbar", unitPrice: "2", registrationFee: "0.05"}` — RECORD (Sonic): two ℏ flat for the mailbox purchase, the fee funded out of it, because every cost the Postmaster incurs for provisioning is denominated in ℏ and a flat ℏ price is stable against the rate in a way a USDC-referenced one is not. The stamp's own price is untouched: `hbar` for stamps is still by rate, and T-P11-4's arithmetic for a provisioning purchase is `count × unitPrice (by rate) + 2 ℏ`.

**Where the build stands — 2026-09-09, the pre-Step-4 sweep and 0.5.7.** `npm run check:prefreeze` builds every registered shape the post-freeze build will write, from the specification's own sentences rather than from the code's habits, and validates each against the schema Step 4 would freeze. It found one gap that is fixed and one question that is not. **Nothing was signed.**

- **What held.** A rate-priced `StampReceipt` on the `hbar` leg validates whole — §14.3's "the receipt records the rate used and when" is in the schema as `{source, pair, value, at}`, all four required and closed — with the negative halves beside it and a receipt whose `holder` is a public-key alias rather than an account (P-16). All four profiles' manifests validate against `proof.schema.json` with §9's own `inputs.locator` shape for each and §9.1's snapshot rule observed both ways: `hcs14` and `hol` carry none, `dns` and `nanda` must. One `EvidenceBundle` carries a receipt in each of §5.10's four states with an invalid receipt leaving the envelope's standing untouched (P-12), a `hol` entry keeping its `blurred`, and the evidence digest unchanged by an observation at another clock (§11.7, T-P3-1).
- **What was missing, and is fixed (D-166, 0.5.7).** `MailCoordinates` did not carry the recipient's **manifest topic**, though §9.1's Declaration does and §9.2's rule reads it — the resolver kept two of that object's three fields and dropped the first. `send` needs it: §6.4's step 7 schedules §10.4's submission to *the recipient's* manifest topic and `coordinates` is all it is told. **A Verifier needs it more**: §10.4's MUST and T-P1-8 require a receipt to have landed on the recipient's manifest topic, and re-resolving at appraisal to find out which topic that is answers at the Verifier's own clock — which §11.6 and P-3 forbid from deciding a standing. Required, not optional, because an optional field would be a hole that validates. The resolver's declaration guard gains the same field: a profile missing it now resolves `RESOLVE_NOT_FOUND`, which is what T-P6-3 says should happen.
- **What is open and is Sonic's — ledger §G-17.** **A manifest does not fit in one HCS message for any realistic address.** §9.1 requires one message at or under `CHUNK_WIRE_MAX` = 1000 bytes (T-P9-8); §5.2 requires a `meaning.statement` and bounds its length nowhere; nothing reconciles the two. Measured on the **live** declaration with the 190-character statement the resolver writes: `hcs14` at an account address **997 — fits by three bytes**; at a **real 168-character UAID from the anchor, 1153**; under §9.2's second form, which T-P6-3 requires to resolve, **1056**; `hol` at that UAID **1056**. The two profiles that MUST carry a snapshot are over at every address. So **the only shape that fits is the one our own demo uses**. Emptying the statement brings the UAID case to 963, so the manifest is not structurally too large — the budget is unallocated. Two candidates, and they differ in whether Step 4 waits: **bound `statement`** in §5.2 and the schema, which is a schema change and would have to land **before** the freeze; or **give §9.1 its own ceiling** above `CHUNK_WIRE_MAX`, which a manifest topic never had to borrow — it is not an HCS-10 topic — and which changes no schema. The code takes neither and trims nothing; `check:prefreeze` prints the measurements and exits 2.
- **The freeze is still ready on the other axis.** `check:freeze` exits 0 unchanged at 22 assertions; the receipt manifest is 674 canonical bytes and the `ScheduleCreate` 843 unsigned. The whole battery is green.

**Where the build stands — 2026-09-09, the second window: 0.5.6, the probe, and the freeze re-confirmed.** Sonic ruled §G-16 and amended D-159; the patch is tagged `v0.5.6` and pushed. **One signature was made this window and it is the probe's**, on entities that belong to no deployment; the sixteen entities of 09-08 stand unchanged and Step 4 has still not signed.

- **§G-16 is closed by D-163, reading (B), corrected.** A proof's `meaning.uri` is a **location** — `{ledgerTag, topicId}`, the topic the manifest is published on — and the manifest there is found by hash, not by position. The precise message locator lives only in a **reference**: `rp.u` in the AAD, `resolutionProof.uri` in coordinates, the executed submission for a receipt. Every writer knows its topic before it writes, so nothing has to be published, re-hashed and republished; §9.1's "a manifest that recomputes to that hash is the one the envelope meant, whoever published it" stops being a remark about attribution and becomes the lookup rule. New MUST at §11.1 with **T-P6-7**, keyed to P-6 because P-6's own sentence is that the proof's manifest is on consensus before the envelope, and because every P-1 row of §11.5 yields *unbound* where this yields *unverified*. `proof.schema.json`'s `meaning.uri` narrows to the location shape — a schema change, and legal only while `registeredSchemas` is null, which is exactly why D-161 ordered the freeze to sit here.
- **What the code had taken, and what moved.** Each writer had been naming the **evidence**: the resolver the HCS-1 profile file topic, the slip its own log entry, the receipt sequence number 7 on the recipient's manifest topic — a number nobody could have known, since the manifest lands when the recipient signs and the scheduled bytes are pre-filled before that. All three now name a manifest topic. `verify` gained the lookup itself: after the reference finds a message, the topic that manifest's own `meaning.uri` names is read for a message recomputing to the same hash, and its absence is T-P6-7. **`ack` is now buildable**; it was not, because the receipt manifest it signs had no honest value for that field.
- **D-159 is amended in place: the registration fee is priced into the purchase.** Step 4 of its order folds into step 2, so the provisioning purchase is **one atomic transaction with three legs** — ℏ from the buyer to the Postmaster for the price, `$POSTAGE` from the treasury to the agent's public-key alias, and the registration fee in ℏ from the Postmaster to that same alias. The account is born holding stamps and exactly one fee, and one act leaves the demo. `PriceList` and `StampReceipt` each gain `registrationFee?`, so a Verifier reading the receipt sees the fee as a leg of the purchase and not as a gift from an account the receipt does not name; T-P11-4 is the court for both.
- **The register operation's shape is settled (D-164), and the pin permits it.** FETCHED 2026-09-09 from the pinned blob, verified by `git hash-object` and `sha256sum` both: the pinned HCS-10 has **no validation section, no additional-properties prohibition, and no statement that an operation carries only its table's fields**; `uaid` appears **nowhere in the document**, and `t_id` only in `migrate`. So `register_agent` emits `{p, op, account_id, uaid, t_id, m}` — strict to the pin, because T-P13-4 reads `account_id`; legible to the deployed, because the incumbents' readers parse the other two. Additive, and never a substitute.
- **An agent that outlives the demo (D-165).** The Correspondent home directory is the agent's identity — config, keystore, durable store. Keys are born once. **Every provisioning verb is idempotent against consensus, not against local state**: `generate_mailbox` resolves under `hcs14` first, `register_agent` under `hol`, `buy_stamp` with `provision` refuses an existing account. A wiped local file never rings a second doorbell or submits a duplicate registration — and a duplicate is not merely waste, because §9.5 answers it with `vague`. Lanes are reused, never re-rung.
- **The HIP-542 probe ran, and both questions are yes.** Nine of nine predicates, every one from the mirror node. Act 2 — one `TransferTransaction` carrying a probe-token unit and 5,000,000 tinybar to a public key with no account — landed as **two consensus records**: `CRYPTOCREATEACCOUNT` creating `0.0.10446534` and charging its 64,073,264-tinybar fee **wholly to the operator**, and the transfer carrying both legs. The new account is absent from the creation record entirely. **The account is bought, not funded**, and D-159's three-leg purchase is one act with no second half to resume. Act 4 — that account signing its unit back out with the operator as payer — returned `SUCCESS` with the fee debited from the operator alone and **the account's ℏ unchanged at 5,000,000**. D-157's payer seam is a network fact rather than an arrangement of ours. Unpredicted and recorded: the auto-created account carries `max_automatic_token_associations: -1`, which is why the token leg needed no association. **Not settled:** a *strictly* zero-balance non-payer signer, which the addendum means we never build. The run of record and the raw mirror JSON are in `app/OPERATIONS.md`; ledger §H carries the row.
- **The freeze is ready.** `npm run check:freeze` exits **0** — 22 assertions, up from 17: the three instances validate against the 0.5.6 schemas whole, a location carrying a sequence number is refused, the lookup finds the manifest by hash alone and finds nothing where nothing recomputes, and `StampReceipt` carries `registrationFee` with the no-fee and float-fee halves beside it. §10.4's measurement is honest for the first time: the receipt manifest is **674 canonical bytes**, one `ConsensusSubmitMessage`, and the whole `ScheduleCreate` freezes to **843 bytes** unsigned. `npm run schemas:plan` is **still 56 steps** with no chunk count moved; three digests moved and nothing else — `proof` `8a45b551…` → `59282cb8…` (4746 → 5159 bytes), `stamp-receipt` `8cafa55b…` → `fab65408…` (6328 → 7206), `price-list` `61d26a17…` → `f772d558…` (7087 → 7738).
- **Prepared and unsigned: the second `PriceList`.** `app/price-list-2.hedera-testnet.json`. §14.3 forbids charging under a price that is not published, so the provisioned path cannot be sold until it is on the topic. `provisioning.registrationFee` is `"0.05"` — **MINE**, from measurement rather than pricing, and reversible; `provisioning.unitPrice` is **null and Sonic's**, because ledger §E Q-6 makes the reference Postmaster's price numbers his. The first message at sequence 1 is untouched: §14.3 selects by consensus timestamp, so the schedule is the sequence and nothing is ever edited.

**Where the build stands — 2026-09-09, the pre-BUILD rulings and the 0.5.5 patch.** Sonic ruled seven things before the MVP build; the patch that carries them is tagged `v0.5.5` and pushed. **Nothing was signed**: no transaction reached `hedera:testnet` and the sixteen entities of 09-08 stand unchanged.

- **The MVP BUILD is not the full spec, and LIMITATIONS names our scoping as the reason.** Pre-funded operator paths only. Deferred: the `x402-usdc` leg; Postmaster-paid carry for an agent's own submissions, so **T-P4-2 is untested and the POSTMASTER suite does not pass in full**; the WebMCP send side; `dns` and `nanda` in the letter path; HCS-25; rotation. Each is written into LIMITATIONS in the section it belongs to, and each says the same thing: never Hedera, never the specification, ours.
- **Three roles, and the config boundary (D-156).** OPERATOR runs the Postmaster; C1OPERATOR and C2OPERATOR run the two Correspondents and each brings a funded testnet wallet; the agents hold their own keys and no ℏ. *The agent signs; the operator pays.* The three names are **demo vocabulary and never identifiers** — not a value, constant, default, enum member or filename in `app/` — because a third party plugs in its own keys from its own configuration. `CLAUDE.md` §11 carries it.
- **§G-14 closed by D-157, as a synthesis rather than for either reading.** The sender always signs the connection request; who pays for it is the sender's choice, as it is for every other submission it makes. §4.4's transfer-then-ring sentence generalizes from "the Postmaster" to "the payer" — one hop when the sender pays for itself, two when it borrows, **one stamp to the treasury either way**. D-47 is partially superseded. F-7 reads "for every submission"; L-5 narrows to a borrowed payer. §6.1 names the Postmaster's own surface and **`carry`** with it — the service side of `send`, acting on signed transaction bodies and never on envelopes — and adds **T-P2-4**, the mirror of T-P13-3: a Postmaster never submits a ring the agent did not sign. The build consequence is **the payer seam**: every submission is *agent signs, payer signs*, the payer injected, a local key now and a remote signature through `carry` later.
- **§G-15 closed by D-160, reading (a) with a filter.** §11.2 gains the treasury row, so a Verifier can see an F-3 orphan at all — a settlement is on no topic and an unposted envelope names nothing, so it is the one row not found from something already read. Filtered to senders in scope, which is what keeps P-3 from making a bundle a function of the whole ledger's traffic. **T-P3-6**. No schema change.
- **The provisioning order, and two affordances that are not verbs (D-159).** Boot → `buy_stamp` with the agent's public key as `holder`, so the transfer creates the account (*bought, not funded*) → `generate_mailbox` → fund exactly one registration fee → `register_agent`, the agent its own payer and signer → `resolve` under `hcs14` and `hol`. The order is HCS-10's, not ours. `generate_mailbox` and `register_agent` live on the Correspondent MCP and are **not** among §6.1's six.
- **The doorbell watcher (D-158) and one template for three readers (D-162).** The reference Correspondent answers every ring while its process is up — the one-stamp fee is the gate P-7 names — and screening policies are 0.6. `send`'s live log lines, its returned text block and `narrate()`'s sentences come from one template file, and none of the three may imply receipt or delivery.
- **The two read-only checks.** The HOL testnet anchor `0.0.6913983` is **open-submit**: `submit_key`, `admin_key` and `fee_schedule_key` all null, no custom fee, no exempt list — so §4.6's "admits submissions from any account" is satisfied and D-159's "one fee" is an ordinary submission fee with no HIP-991 fee to cover. It is still at sequence 380, unchanged since 2025-11-18. And HCS-10's `register` at the pin requires `account_id` and names neither `uaid` nor `t_id`, while the anchor's own newest traffic omits `account_id` entirely — we emit the pinned shape, because that is what T-P13-4 reads. Both in ledger §H, dated.
- **The freeze was prepared, and it is not ready.** `npm run check:freeze` builds one instance each of the three schemas Step 4 would close unexercised — StampReceipt with D-161's new `provisioning` line, ReturnReceipt with its §10.4 manifest, and a ConformanceClaim with every `[fill at claim]` field filled — and measures the one thing §10.4 turns on: the receipt manifest is **693 canonical bytes**, one `ConsensusSubmitMessage`, and the whole `ScheduleCreate` freezes to **862 bytes** unsigned. §10.4's mechanism holds. `npm run schemas:plan` is **still 56 steps**; one row moved, `stamp-receipt` from 2 chunks to 3, its digest `9c4b585c…` → `8cafa55b…`.
- **But the freeze check found what it was written to find, and it was not what we expected.** Nothing in this repository had ever validated a **manifest** against `spec/schemas/proof.schema.json` — the schema §5.2 fixes and Step 4 would register. Two findings. **Fixed:** §5.2 gives a proof's `inputs` as `{digest, locator, snapshot?}`, closed, and every manifest we wrote put the input material there directly; `app/src/core/proof.ts` is now the one builder, `verify`'s replay reads `inputs.locator` and `inputs.snapshot`, and `npm run resolve -- 0.0.10426206` emits the corrected shape from the live declaration. **Open, ledger §G-16, and it blocks Step 4:** §2.2 makes a canonical location the locator at which *the proof's own manifest* is found, but §5.1 hashes `meaning` into the proof, §6.2 computes that hash at `resolve` time and §6.4 step 2 publishes the manifest afterwards with the AAD already binding it — so no manifest can carry its own publication locator. Each writer names the evidence instead, and the schema catches only two of the three cases. **`ack` cannot be built until this is ruled**, and either ruling changes `proof.schema.json`, which is a patch only while `registeredSchemas` is null.

**Two operational rules earned the hard way, 2026-09-08.**

- **Unbuffered output on every long-running script.** Never `| tail` or `| head` a run: they buffer until exit, so a fast, loud failure is indistinguishable from a hang. Redirect to a log file and read the file. This cost two killed runs during Step 2.
- **A machine-readable file of record is edited surgically, never re-serialised.** `spec/pins.json` is §1.6's machine-readable form and a reviewer must be able to see that exactly two values moved. `pinStampToken` edits one line and refuses to write if that line is not in its expected form.

**`HCS-10 by hand vs SDK` is settled, 2026-09-08, and the evidence settled it narrowly.** The SDK's transaction classes are used, with **one** override scoped to the one operation whose wire form §7.4 constrains — not a hand-rolled protobuf, and not the SDK unmodified. `TopicMessageSubmitTransaction.freezeWith` sets `_chunkInfo` inside its chunk loop, so every message it produces carries the field, single-chunk ones included; our own price-list message at `0.0.10426551` sequence 1 carries it on the mirror node, which is how the defect was confirmed rather than read. `UnchunkedTopicMessageSubmitTransaction` overrides `freezeWith` to the base class's and nothing else, and `_makeTransactionData()` omits the field when it is null. Both transaction bodies were decoded from their own protobuf bytes locally, without submitting either: identical in memo, topic and message, differing only in that field. `npm run check:hcs10` reruns the comparison including its negative half. Recorded as a scoped DIVERGENCE in `app/OPERATIONS.md` beside the SDK-versus-agent-kit one.
