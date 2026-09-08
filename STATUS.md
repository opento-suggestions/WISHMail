# STATUS — WISHMail, ETHOnline 2026

The one file in this repository where ordering is allowed. Specification: 0.5.4 — frozen at 0.5.0 on 2026-09-07, patched to 0.5.1 the same day (D-135 – D-138), and on 2026-09-08 to 0.5.2 (D-145 – D-148), 0.5.3 (D-150, D-151) and 0.5.4 (D-152); wire strings carry `0.5`. Window: Sept 4 – 16. Register: **RECORD** = Sonic said it; **MINE** = Claude's lean, unratified; **FETCHED** = from a recon, dated.

## 1. Scope line (RECORD)

The Excalidraw map is the ratified scope: **green/blue = BUILD, orange = STRETCH, dashed = SPEC or VENUE.** Full product is the judging posture; the registry layer is load-bearing. Do not re-propose scoping down.

**The spec and the BUILD are not the same document** (Sonic, 2026-09-07): *the spec survives ongoing development; the BUILD is for this window.* A scope question is therefore answered twice and not once — what this window ships, and what the specification says. Where the BUILD is narrower, it defers a claim and says so in LIMITATIONS rather than widening the specification to fit, and rather than inventing a deployment artifact to make a claim true. The first instance is the POSTMASTER claim's deferral on T-P16-1, §4 below.

## 2. Build set, as ranked by Sonic (RECORD, D-23; carried from v0.3 §17 with the spec's current names)

**Hard deliverables.** Core (resolve / postage / consensus) · resolvers `hcs14` (§9.2), `dns` (§9.3), `nanda` (§9.4) · HCS-11 declaration + HCS-2 profile registry (§9.2) · HCS-13 schema registration (§5.11) · WebMCP page · MCP server · MCP-B bridge (judges cannot be assumed to have the Chrome flag) · TypeScript SDK + CLI · demo: two agents corresponding, Claude as outside Verifier · `AGENTS.md` footnote · HOL Guard scan if feasible.

**Stretch, in Sonic's order.** HOL registration once registrable (now: `hol` profile §9.5 reads consensus; self-registration on the testnet anchor §4.6, D-110 — whether the profile is BUILD or STRETCH is the map's call, not this file's) → HCS-25 reputation signals (**closed**: refused in §16.8; a score off consensus never touches a standing). Mandate lineage is held (§16.8).

**Spec-only.** A2A AgentCard (held, §16.8) · Q-10 NANDA attestation slot (§19.4) · Q-11 postage classes (§19.3) · other ledgers / CLPR (§16.7, §19.3) · AAIF and NANDA-Town mappings (in the 09-04 research, not in the spec) · USPS/PES grounding (§17, done).

**Out.** Broker dependency · Solidity · broadcast · agentgateway · ANS cert chain · NANDA Index write path · private hands.

Demo shape: offered in v0.3, not chosen (v0.3 §19 item 3). Open for Sonic.

## 3. Dependency order (MINE — what must exist before what; not a schedule)

```
0  repo outfitting: layout, DCO, Conventional Commits, CHANGELOG, ADR backfill D-1..41,
   spec/pins.json from recon/pins.draft.json, spec/schemas/ (14 files), CLAUDE.md   [DONE 09-07]
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

**Stack (MINE, unratified).** TypeScript throughout — the MCP server, SDK, CLI, and WebMCP page share one language and one tool schema. `@hashgraph/sdk` for HTS/HCS/schedules. An HPKE library implementing RFC 9180 with the §7.3 ciphersuite (verify test vectors against the RFC's). An RFC 8785 canonicalizer (verify against the RFC's examples; §5.1 depends on byte-exact output). No Solidity, no contracts.

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

**Blocking now:** which canonical key order WISHMail **emits** for its own declaration (ledger §G item 12) — the `hcs14` declaration is written, gated and unsigned behind it. D-152 settled which orders a rule *accepts* (both, normative first) and the census narrowed the candidates; what remains is one permanent choice, because an HCS-1 file topic has no admin key.

Demo shape · HCS-10 by hand vs SDK · which classes the first claim names · whether `hol` is BUILD on the map · the running-hash integrity check (L-10: implement or not) · submitting the HCS-14 proposal for the NANDA email `nativeId` (D-112, repo item).

**Closed since.** The x402 testnet facilitator — D-132, 09-07: x402.org, `hedera:testnet` only. LICENSE — Apache 2.0, stated as a non-negotiable in `CLAUDE.md` §3 and present in the repository since the initial commit; `CONTRIBUTING.md` and `README.md` name it, and contributions are certified under DCO 1.1 with no CLA.

**Where the build stands — 2026-09-08, end of Step 3.** Everything below is done and pushed to `main`.

- **Phase A** — the 0.5.1 patch (D-135 – D-138), tagged `v0.5.1`.
- **Phase B Step 1** — ADRs D-139 – D-144, written before the first transaction. Writing them surfaced three defects in the frozen text, raised as ledger §G items 9 – 11 rather than patched.
- **Phase A′** — the 0.5.2 patch (D-145 – D-148), which is the answer to them: `validFrom` dropped from the `PriceList`; §4.6's `Conformance:` note corrected to name the admin key, with §A's T-P17-1 row amended to match; the provisioning template given its fifth row, the HCS-2 declaration registry topic; and `$POSTAGE` given a supply key on the treasury. **Tagged `v0.5.2` at `21cb3c2`** — the text every entity is provisioned against, and the tag the ops record cites.
- **The HIP-991 probe** (D-149) — wholly disposable, run 2026-09-08. It settled four things by observation rather than reading, all in ledger §H: the fee is debited from the transaction **payer**; the waiver is **by signature and not by payer**, so an owner answering its own doorbell costs the Postmaster nothing (§4.4, D-137, D-139); the exempt list is amendable under the **admin key alone**, which is why D-138's doorbell row stands with no fee schedule key; and `fee_exempt_key_list` is the mirror node's real field name.
- **Phase B Step 2** — the eleven entities on `hedera:testnet`, under a full gate reported before any signature. Treasury `0.0.10426205`, postmaster-agent `0.0.10426206`, `$POSTAGE` `0.0.10426208` (born at zero, ten thousand minted as its own act), both associations, price topic `0.0.10426551`, the first `PriceList` at sequence 1, doorbell `0.0.10426553`, log `0.0.10426554`, manifest `0.0.10426591`. Both halves of the acceptance test pass. `spec/pins.json` closed exactly two nulls.
- **Phase A″** — the 0.5.3 patch (D-150, D-151), **tagged `v0.5.3`**. D-150 is a specification change and it exists because Step 3 needed it: §4.6's `Conformance:` note required every provisioned topic to carry the agent's **admin** key, and HCS-1 marks a file topic that has one invalid and ignores it (`hcs-1.md:48-49`, a fact that had been in ledger §H since the recon). As landed, no HCS-11 profile file could be provisioned conformantly, so §9.2's whole `hcs14` declare surface was unreachable. The note now excepts the case where the pinned standard forbids an admin key — objectively, so a declared policy cannot reach the exception — and D-147's template gains a sixth row. D-151 narrows `conformance/README.md`'s over-wide reading of P-13 so that `spec/vectors/seal.json` can carry the recipient key T-P1-5 needs, and widens the P-13 gate, which `AGENT_X25519_DER_KEY` would have walked straight past.
- **Phase B Step 3 — the wiring.** `spec/vectors/aad.json` and `seal.json` exist and every value in them recomputes. The seal is composed on `node:crypto` rather than taken as a dependency (RECORD, Sonic 09-08): RFC 9180 publishes no vector for §7.3's ciphersuite, but A.1 shares its KEM and KDF, so `npm run check:seal` runs the same code at A.1's parameters and reproduces every published value. `app/src/` gains `core/` (canonical JSON, the AAD, HPKE, the seal, HCS-14), `schema/` (one ajv registry for §18.5's fourteen), `state/` (§14.2's durable record), `mcp/` (the six tools of §6.1, bodies returning `NOT_IMPLEMENTED`), and `release.ts`, which declares 0.5.3 and claims nothing. `conformance/` gains the runner, the register parser, the report writer and 83 test files, none expanded, every one failing with its T-ID and the invariant it serves.
- **Phase A‴** — the 0.5.4 patch (**D-152**), tagged `v0.5.4`. Sonic asked for a census before ruling §G-12, and it is unanimous: of the fourteen newest `uaid:aid:` registrations on the testnet anchor `0.0.6913983` plus `0.0.7124407`, **15 of 15 reproduce under HCS-14's example key order and none under the order it calls normative** — the newest (2025-11-18, `proto=a2a`, `registry=hashgraph-online`) beside `0.0.7124407`'s (2025-10-24, `proto=hcs-10`, `registry=hol`). Ruled regardless of §G-12: every rule **accepts either order, normative first**, and reports which matched under `observations.agentIdOrder` — an observation, so it moves no standing (§9.1, §11.6). T-P6-3 and T-P6-5 each gain a legacy-order fixture agent. The defect is drafted for upstream submission at ledger §G.5(b) and stated in LIMITATIONS L-7.
- **Step 3 stops before its signatures, and the stop is the finding.** The `hcs14` declaration is gated in `app/OPERATIONS.md` §Step 3 — written before any transaction, as the probe and Step 2 were — and §6 of that report says why nothing was signed. HCS-14 contradicts itself about the canonical key order of the six fields an agent identifier is hashed from, and the two orders give different identifiers for the same agent; its own test vectors publish the expected value as a literal placeholder, so it courts nothing. Checked against the ledger instead: a live testnet agent's on-chain identifier reproduces under the standard's example order and not under the order it calls normative. It blocks because the profile's digest is the HCS-1 topic's memo, which cannot be changed once the topic exists. **Ledger §G item 12; Sonic rules.**

**What is not done, and what it blocks.** `spec/pins.json` still carries **thirty** unfilled pins — the twenty-eight `registeredSchemas` entries, which wait on HCS-13 registration, and the two `hedera:mainnet` fields, which wait on a network §15.5 leaves undeployed. **T-P9-2 refuses a report while any pin is unfilled, so no conformance claim is possible yet**, and the runner prints that refusal rather than working around it. None of the 83 tests is expanded: every one exists and every one fails, naming what it is for. The six tool bodies return `NOT_IMPLEMENTED`. There is no SDK, no CLI, no WebMCP page, no MCP-B bridge, and no resolver — `hcs14`, `dns` and `nanda` are all unbuilt, and the HTTP transport §14.2's `402` exchange needs lands with `buy_stamp`'s body rather than before it. The `hcs14` declaration is gated and unsigned, on ledger §G item 12.

**Two operational rules earned the hard way, 2026-09-08.**

- **Unbuffered output on every long-running script.** Never `| tail` or `| head` a run: they buffer until exit, so a fast, loud failure is indistinguishable from a hang. Redirect to a log file and read the file. This cost two killed runs during Step 2.
- **A machine-readable file of record is edited surgically, never re-serialised.** `spec/pins.json` is §1.6's machine-readable form and a reviewer must be able to see that exactly two values moved. `pinStampToken` edits one line and refuses to write if that line is not in its expected form.

**`HCS-10 by hand vs SDK` stays open, and Step 2 found a fact that bears on it.** `TopicMessageSubmitTransaction.freezeWith` attaches `chunkInfo` to **every** message, including a single-chunk one — the loop runs at `s = 1` and sets `{total: 1, number: 1}`, cleared only after the signed transactions are built. §7.4 requires **no `chunkInfo`** on an HCS-10 envelope chunk, so that class cannot carry envelopes as-is. It was fine for the price list, which is not an envelope. Reported, not acted on: the decision governs the operation grammar that carries envelopes, and it is still Sonic's.
