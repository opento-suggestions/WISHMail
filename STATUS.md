# STATUS — WISHMail, ETHOnline 2026

The one file in this repository where ordering is allowed. Specification: 0.5.1 — frozen at 0.5.0 on 2026-09-07 and patched the same day (D-135 – D-138); wire strings carry `0.5`. Window: Sept 4 – 16. Register: **RECORD** = Sonic said it; **MINE** = Claude's lean, unratified; **FETCHED** = from a recon, dated.

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
| `$POSTAGE` token ID + treasury, `hedera:testnet` | `spec/pins.json`, §4.1 table, LIMITATIONS | unfilled — T-P9-2 blocks any claim until filled |
| Price topic (`wishmail:prices:1`) | claim `prices`, LIMITATIONS | unfilled |
| x402 facilitator for `hedera:testnet` | price list `methods[].facilitator`, LIMITATIONS L-11 | **filled (D-132, RECORD 09-07)** — x402.org: `https://x402.org/facilitator`, scheme `exact`, `hedera:testnet`, USDC `0.0.429274` (6 dp), fee payer `0.0.9185802`, no signup. `hedera:mainnet`: none anywhere |
| `hbar` leg `rate.source` | price list `methods[].rate`, LIMITATIONS | **fetched 09-07** — `https://api.saucerswap.finance/tokens`, pair `HBAR/USD`, read as HBAR's `priceUsd` at `id: "0.0.0"` (ledger §H). Written into the price list when it is published; the reader is `buy_stamp`'s, downstream |
| Reference Postmaster price numbers | price topic | RECORD (ledger E, Q-6; bundle on both legs, Sonic 09-07): $0.10 USDC per stamp; bundle of 12 for $1.00 on **both** methods; the `hbar` leg carries `rate.reference` of $0.10 USD and no `unitPrice` (D-136); fallback, if the rate source fails, a fixed unit price at HBAR = $0.07 |
| Registered schema digests (14) + wire strings | `spec/pins.json` (T-P9-9) | unfilled until HCS-13 registration |
| HIP-991, HIP-423 | §1.6, `spec/pins.json` | **filled 09-07 (D-135)** — both were `n/a`; every doorbell property had been second-hand from our own ADRs |

**Deferred claim (RECORD, Sonic 09-07).** The MVP BUILD covers **pre-funded Hedera accounts only**, so the first price list carries exactly the two `hedera:testnet` methods and the **POSTMASTER claim is deferred on T-P16-1**. §14.2's MUST — "At least one method the Postmaster offers MUST require no pre-funded Hedera account of the buyer" — is unmet by this deployment, and that is stated rather than dodged: no non-Hedera method is invented to make the claim true. Stated in LIMITATIONS where §15.5 expects it. The underlying contradiction between §14.2 and L-11 is a spec question, not a build item, and is logged in ledger §G item 8 for the next spec pass; it was deliberately **not** patched in 0.5.1.

## 5. Build facts the spec does not carry

**Environment.** One Hedera testnet operator account for the Postmaster (key generated in-process, never committed); one for each demo agent (generated by the SDK at provisioning — P-13). Mirror node: the public testnet mirror (verify the current base URL before use — FETCH). Testnet HBAR from the portal faucet. `.env.example` lists names only, values blank.

**Stack (MINE, unratified).** TypeScript throughout — the MCP server, SDK, CLI, and WebMCP page share one language and one tool schema. `@hashgraph/sdk` for HTS/HCS/schedules. An HPKE library implementing RFC 9180 with the §7.3 ciphersuite (verify test vectors against the RFC's). An RFC 8785 canonicalizer (verify against the RFC's examples; §5.1 depends on byte-exact output). No Solidity, no contracts.

**HCS-10 by hand or by SDK — decision candidate for Sonic (MINE lean: by hand).** Hashgraph Online publishes a standards SDK; using it would make conformance to *its* reading of HCS-10 rather than to the pinned blob. Strict HCS-10 (P-9) argues for writing the operations ourselves against `hcs-10/index.md @ 0cb5d2eb` and testing them against the recon's file:line facts in ledger §H. Either way, the memo table of §6.1 and the 1000-byte line of §7.4 are ours to enforce.

**Facts already fetched (ledger §H, 2026-09-06)** — read before touching these areas: Mirror Node REST fields for schedules (`executed_timestamp`, `signatures[].public_key_prefix`) that T-P1-8 and §11.4 depend on; the running-hash construction (v3, SHA-384) for the optional integrity check; the HOL registration chain (`register` op → `t_id` HCS-2 topic → HCS-1 file) and the testnet anchor `0.0.6913983`; x402's Hedera `exact` scheme (base64 partially-signed `TransferTransaction`, payer-signature hardening 2026-07-03); NANDA v2 `/api/v1/resolve` (no auth to read; JWT + email/DNS verification to register). If a needed fact isn't in §H, fetch at the pinned commit and file it there with the date.

**Fixtures and vectors.** `spec/vectors/aad.json` and `seal.json` are generated by the reference and must be opened by an independent implementation (T-P1-5); a second, minimal implementation of §7.2–§7.3 in another language inside `conformance/` satisfies "independent." The exception corpus (T-P3-2) is enumerated in the spec: orphan, partial, unrooted chunk, foreign chunk before the sender's, duplicate, conflicting `n`, late settlement, closed lane, duplicate receipt, receipt before the nth chunk. Fixtures are recorded testnet data or synthesized mirror responses; either way they are files, and the VERIFIER suite reads them with no network.

**Conformance report and claim.** The suite emits one report per class; the claim (§5.10 `ConformanceClaim`) names its digest. `LIMITATIONS.md` is checked for L-1 – L-14 in order (T-P15-2). No claim while any pin is unfilled (T-P9-2).

**Demo.** Two agents corresponding across two registries (the bridge: one declared under `hcs14`, one under `nanda` or `dns`), a first contact with a slip, a return receipt, and `verify` run by a Verifier with nothing configured — Claude as the outside Verifier, reading the narrative. Shape unchosen (RECORD: offered, not chosen).

## 6. Open for Sonic

Demo shape · HCS-10 by hand vs SDK · which classes the first claim names · whether `hol` is BUILD on the map · the running-hash integrity check (L-10: implement or not) · submitting the HCS-14 proposal for the NANDA email `nativeId` (D-112, repo item).

**Closed since.** The x402 testnet facilitator — D-132, 09-07: x402.org, `hedera:testnet` only. LICENSE — Apache 2.0, stated as a non-negotiable in `CLAUDE.md` §3 and present in the repository since the initial commit; `CONTRIBUTING.md` and `README.md` name it, and contributions are certified under DCO 1.1 with no CLA.

**Next.** HCS/HTS operations — the ingredients the spec recipe calls for, before any WISHMail code: the `$POSTAGE` token and its treasury (§4.1), the price topic (§14.3, memo `wishmail:prices:1`), and the per-agent topics of §4.6 (doorbell with its HIP-991 one-stamp fee collected by the treasury, log, manifest topic with memo `wishmail:manifest:1`). `hedera-testnet-mcp` is connected and is for this. `HCS-10 by hand vs SDK` decides how the operations that *carry envelopes* are written; it does not block creating a token or a topic.
