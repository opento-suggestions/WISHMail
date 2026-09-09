# LIMITATIONS — WISHMail reference implementation

This document is required of every release that claims conformance (spec §1.5, §15.4; test T-P15-2). It carries one section for each limitation L-1 through L-14 of spec §15.3, in order, stating how the limitation applies to this release. A section that claims a limitation does not apply names the conformance test that shows why. Nothing here weakens the specification; it says where this deployment stands under it.

Fields marked `[fill at deployment]` are filled when the testnet artifacts exist and before any conformance claim is made (T-P9-2).

**What this release covers, and whose decision that is.** The build for the ETHOnline window covers **pre-funded operator paths only**. Deferred by our own scoping, not by anything Hedera or the specification does: the `x402-usdc` purchase leg; Postmaster-paid carry for an agent's own submissions, so **T-P4-2 is untested**; the WebMCP send side; `dns` and `nanda` in the letter path; HCS-25; and key rotation. Each is named below in the section it belongs to, and each says the same thing: the specification describes the full product and this deployment ships less of it, so it defers the claim rather than widening the specification to fit or inventing a deployment artifact to make a claim true (STATUS §1; CLAUDE.md §11).

**The entities exist as of 2026-09-08.** Sixteen entities stand on `hedera:testnet`. Eleven were provisioned against the text tagged `v0.5.2`: the stamp token and treasury below, the price topic below, and the reference Postmaster-agent's account `0.0.10426206` with its doorbell `0.0.10426553`, log `0.0.10426554` and manifest `0.0.10426591`. Five more were provisioned against `v0.5.4` — the `hcs14` declaration: the HCS-2 declaration registry `0.0.10428113`, the HCS-1 profile file `0.0.10428178`, its chunk, the registry's current entry naming the file, and the account memo `hcs-11:hcs://2/0.0.10428113`. The full record, with each entity's creation transaction and consensus timestamp and the mirror-node read that confirmed it, is `app/deployment/hedera-testnet.json`; the method is `app/OPERATIONS.md`. **This does not make a claim possible**: `spec/pins.json` carries twenty-eight unfilled pins — the `registeredSchemas` entries, two per schema for fourteen — and T-P9-2 refuses a report while any pin is unfilled. An undeployed ledger tag has no pin, so `hedera:mainnet` carries no entry and its absence is not an unfilled one (D-154). Fields marked `[fill at claim]` remain unfilled for that reason.

| Field | Value |
|---|---|
| Release | wishmail-reference `[fill at deployment]` |
| Specification | 0.5.5 |
| Classes claimed | `[fill at claim]` (VERIFIER, CORRESPONDENT, RECIPIENT, POSTMASTER — only suites that passed in full, T-P15-3). **POSTMASTER is deferred at this release on T-P16-1** — see the note under L-11 |
| Profiles claimed | `[fill at claim]` of `hcs14`, `dns`, `nanda`, `hol` |
| Extensions claimed | none |
| Ledger tags deployed | `hedera:testnet` only (§15.5) |
| Stamp token | `$POSTAGE` on `hedera:testnet`, token ID `0.0.10426208`, treasury `0.0.10426205` (provisioned 2026-09-08 against tag `v0.5.2`; `spec/pins.json`) |
| Price topic | `0.0.10426551` (memo `wishmail:prices:1`); the first `PriceList` is sequence 1 |
| Payment methods | `x402-usdc` via the x402.org facilitator, `https://x402.org/facilitator`, scheme `exact`, network `hedera:testnet`, asset USDC `0.0.429274` (6 decimals), facilitator fee payer `0.0.9185802`, no signup or key (D-132); `hbar` |
| Registry anchors read | HOL testnet anchor `0.0.6913983` (§9.5); mainnet anchors not read |
| Conformance run | suite version `[fill at claim]`, date `[fill at claim]`, report digest `[fill at claim]` |

## L-1 — No forward secrecy

Compromise of an epoch's private key exposes every envelope sealed to that epoch, past and future, until rotation, and every past one forever (F-2). This release seals with HPKE base mode (§7.3) and claims no forward secrecy. Rotation is by epoch (§7.6); the SDK retains every epoch's key it has generated. No mitigation is offered beyond rotation.

## L-2 — Metadata is public

Doorbells, lanes, settlements, postmarks, receipts, and slips are readable by anyone, forever (F-1). This release publishes nothing beyond what the specification requires on consensus, and hides nothing that it requires. Who wrote to whom, when, how often, with what postage, and whether a hand signed is public. Content is not.

## L-3 — Operator visibility is total and symmetric

Confidentiality ends at each operating estate (§15.1). Whoever runs a sender's agent holds its plaintext; whoever runs a recipient's holds its key. This release defends nothing against an Operator on either end and names no Operator in any proof.

## L-4 — Account-key rotation strands lanes

A lane's threshold key names the two agents' account keys literally (§7.1, F-8). An agent that rotates its Hedera account key can read but no longer sign on lanes created before the rotation; new mail needs a new lane born from the doorbell. This release does not migrate lanes and does not attempt to; it reports the condition through `SEND_LANE_INVALID` and re-rings.

## L-5 — The Postmaster's liveness is required for purchase, and for a first contact whose payer the sender borrows from it

Required to sell stamps and to provision. Required at a first-contact `send` **only where the sender borrows it as payer**, in which case it pays the doorbell's fee and submits the request the sender signed (F-7, D-157). Bound on loss: one stamp per abandoned first contact. Bound on wait: the sender's `window`. For every submission — the connection request included — the Postmaster is a payer the sender may use or not; a sender that can pay its own network fees is never stranded. Delivery (`inbox`) and verification (`verify`) never involve it. This release runs one Postmaster instance on testnet with no availability guarantee.

**Carry exists in this release only inside `buy_stamp`, and that is our scoping.** §6.1 defines the Postmaster's service side of `send` as **carry** — accepting bodies the agent signed whose transaction identifier names the Postmaster as payer, checking them against a published policy, adding the payer signature and submitting. This release implements it only where §14.2's HBAR leg already requires it: inside the purchase. Every other submission an agent makes is paid by that agent's own operator, from that operator's own configuration, through the payer seam D-157 requires (`agent signs, payer signs`, the payer injected). **The consequence is that T-P4-2 — "a Correspondent configured with nothing but stamps and its own keys completes `send` through the reference Postmaster" — is untested at this release, and the POSTMASTER suite therefore does not pass in full.** Nothing in the specification is at fault and nothing in Hedera prevents it: the seam is built so that the same code path takes a remote signature, and only the remote half is unbuilt in this window.

## L-6 — Refusal leaves no mark

A Postmaster that will not sell, a doorbell that does not answer, a registry that delists, a recipient that does not sign: none is on consensus as a refusal (§15.3). This release records what happened and never what was intended; it produces slips for unanswered first contact and reports unsigned receipts as `unclaimed`, and nothing else.

## L-7 — The standards WISHMail rides on are Draft

Four of the six pinned HCS standards (HCS-10, HCS-11, HCS-13, HCS-14) are `Draft` and change by pull request; HCS-1 and HCS-2 are `Published`. This release conforms to the blobs named in §1.6 at `hiero-ledger/hiero-consensus-specifications @ 7046156c` and to `x402-foundation/x402 @ 0c04a84e`, recorded in `spec/pins.json`, and not to any later text. HCS-10's size limit is stated as one kilobyte and nowhere in bytes; this release enforces `CHUNK_WIRE_MAX` = 1000 bytes on the whole `message` operation (§7.4).

A second silence in the same standard bears on the doorbell. HCS-10 offers the inbound topic as "Public (No Key), Submit Key, or Fee-gated (HIP-991)" (`index.md:113`) and has an agent answer a connection request "on its own Inbound Topic" (`index.md:498`) — but the word "exempt" does not appear anywhere in the pinned blob. The standard therefore describes a fee-gated inbound topic without addressing that its owner must submit to it to answer, and would have the owner pay to answer its own door. This release exempts the agent's own key at the doorbell's creation, so first contact costs the one stamp §4.4 says it costs (D-137, D-138; T-P7-4).

HIP-991 and HIP-423 were carried in §1.6 as `n/a` until 2026-09-07 and are now pinned by blob (D-135). Until that fetch, every property this release's doorbell depends on — a fee denominated in a fungible HTS token, the fee-exempt key list, the fee schedule key — rested on assertions in this project's own decision records rather than on the standard's text.

A Draft standard can also contradict itself, and one of these does, in a way that changes an identifier. HCS-14 fixes the key order of the canonical JSON an agent identifier is hashed from **twice and differently**: the step it marks normative sorts the keys lexicographically, and its own worked example places `skills` first. The two are different bytes and therefore different identifiers for the same agent. Its published test vectors give the expected value as the literal placeholder `uaid:aid:{base58hash}`, so the document courts neither reading and the contradiction is invisible from the text alone. It was found by recomputation against the ledger, where every deployment follows the example: 15 of 15 registrations sampled on the testnet anchor reproduce under the example's order and none under the normative one. This release therefore compares an agent identifier under **both** orders, the normative one first, treats a match under either as agreement, and reports which matched as an observation that bears on no standing (§9.1, §11.6, D-152). The defect is drafted for submission upstream. What this cannot repair is the general case: a reader of a Draft standard cannot tell a normative sentence from a worked example when the two disagree and nothing published decides between them, and the only remedy available to us was to read what is deployed.

## L-8 — Registry roots are what they are

`nanda`: a NANDA v2 index is a database served by one operator over TLS with nothing signed, logged, or snapshottable; every `nanda` resolution is endorsed `blurred`, proves where the sender was told to send, and cannot be re-obtained by anyone later (§9.4). `hol`: a registration submitted through the broker is anchored under the registry operator's key and resolves `blurred`; the mainnet anchor has been observed silent for months; an agent the broker lists but the ledger does not is unresolvable (§9.5). `dns`: unsigned answers are `blurred`. HCS-14's `registry` parameter is a routing hint and endorses nothing. This release recommends, and its provisioning offers, declaration under `hcs14` with the agent's own key.

## L-9 — Directories are neither live nor fresh by guarantee

A broker's answer may be cached and its rate limits unpublished. Finding is not resolution; nothing a directory says is an input to any resolution or appraisal (§9.1, §9.7). This release defines no `find` tool (an extension, §16.6) and reads no directory to resolve.

## L-10 — A Verifier trusts its mirror unless it checks

Mirror independence is required and tested (T-P4-3); running-hash verification is permitted and not required (§11.1, §11.6). This release reads through `[fill at deployment]` (testnet mirror node) by default, accepts any mirror node by configuration, and `[fill at deployment: does / does not]` implement the running-hash integrity check under `observations.integrity`.

## L-11 — The USDC leg on a Hedera network is testnet-only at this version

A public facilitator serves `hedera:testnet`; none serves `hedera:mainnet`; a mainnet USDC-on-Hedera leg would need a self-hosted facilitator. This release's `x402-usdc` method names the **x402.org facilitator** — `https://x402.org/facilitator`, scheme `exact`, network `hedera:testnet`, asset USDC `0.0.429274` (6 decimals), facilitator fee payer `0.0.9185802`, requiring no signup, API key, or credit (D-132). Its `/supported` endpoint offered `hedera:testnet` and no Hedera mainnet when read unauthenticated on 2026-09-06, and the x402 documentation lists the same on 2026-09-07; the x402 repository's own facilitator documentation marks x402.org "Testnet only", "Requirements: None", and mentions Hedera nowhere else. The keyless leg (P-16) is satisfied on `hedera:testnet` through this facilitator. The upstream scheme's replay rule is a SHOULD; this release's own durable payment-reference record is what prevents a second purchase (§14.2, T-P11-5). Account creation for a keyless buyer is by the Postmaster's stamp transfer to a public-key alias (§4.6), never by the settlement.

**This release defers the POSTMASTER claim on T-P16-1, and says why.** Both methods it offers are on `hedera:testnet`, and §14.2 states that on a Hedera network "the buyer signs a Hedera transfer of USDC and so has an account already." So neither method requires no pre-funded Hedera account, and §14.2's MUST — "At least one method the Postmaster offers MUST require no pre-funded Hedera account of the buyer" (`Conformance:` T-P16-1) — is unmet here. The reference deployment covers pre-funded Hedera accounts only at this version; it does not add a non-Hedera method to make the claim true, and it does not claim POSTMASTER until the suite passes in full (§1.5, T-P15-3).

**The `x402-usdc` leg is deferred in this window, and that is our scoping.** The facilitator, the network, the asset and the fee payer above are all established and dated (D-132); what is not built is this release's side of the exchange — the `402` with its `PAYMENT-REQUIRED` requirements, the `PAYMENT-SIGNATURE` retry, and the durable record that recognises requirements it issued across a restart (T-P11-5, T-P11-6). The MVP ships the `hbar` leg only. This is a scope decision of ours inside a five-day window; it is not a limitation of x402, of the facilitator, or of the specification, each of which is ready for it.

That leaves a seam this release records and does not resolve: §14.2's sentence above and this section's own earlier one — "The keyless leg (P-16) is satisfied on `hedera:testnet` through this facilitator" — cannot both hold. Logged as an open item in the working ledger's §G for the next specification pass; deliberately not patched at 0.5.1, 0.5.2, 0.5.3, 0.5.4 or 0.5.5.

## L-12 — A stamp is fungible

`$POSTAGE` is an HTS fungible token. A spent unit returns to the treasury and is indistinguishable from unsold supply; "this stamp" means the postage a settlement affixed, under its postmark (§4.3, §14.4). This release burns nothing by default; a burn, if performed, is bookkeeping and attests nothing.

## L-13 — Purchase, postage, and delivery are not one atomic act

Postage is spent when affixed and consumed when the envelope settles; an envelope that never lands is an orphan whose postage is spent and not lost (F-3); a purchase is settled before stamps are held (§14.2). Each step is witnessed; the steps are not fused. This release resumes rather than restarts (`send` after `SEND_SUBMIT_FAILED` or `SEND_SETTLE_TIMEOUT` submits only missing chunks against the existing settlement, T-P7-5).

## L-14 — There is no Sponsor, no refund, no credit, and no subscription

No party is named as a funder (§3.9); a stamp is not refunded, extended on credit, or subscribed to (§14.4). This release's price list carries a unit price, bundle prices, and a provisioning price, and nothing that is not a purchase.

---

Retention (P-15; §15.1): the Postmaster keeps a settled payment reference until the payment it names can no longer land; a purchase or settlement in hand until the transfer or chunks it names are on consensus or the request is refused; and nothing else. It keeps no envelope, chunk, address, resolution proof, or record of who wrote to whom once the carrying submission is witnessed. This release's retention `[fill at deployment: store, and the concrete expiry rule for payment references]`.

Not defined at this version (§1.2, §19): a push or notification surface; postage classes; a non-blocking `send`; any ledger other than `hedera:testnet` and the defined-but-undeployed `hedera:mainnet`; the HCS-19 and HCS-21 postures (held, §16.8).
