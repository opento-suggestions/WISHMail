# Changelog

Format: Keep a Changelog. Versions are the specification's (§1.7): `major.minor` on the wire, `patch` for text and tests. Attribution: **[S]** Sonic (human), **[C]** Claude in chat (drafting, ledger), **[CC]** Claude Code (reconnaissance, agentic). Decisions are `D-n` in `spec/CONFORMANCE_TESTS_v0_5.md` §B; tests are `T-<P-ID>-<n>` in §A.

## [0.5.1] — 2026-09-07

A patch: text and tests within minor version `0.5`. **No wire string changes** — the AAD's `v`, the HPKE `info`, the schemas' `$id`s and `spec/pins.json`'s `wireStrings` all stay at `0.5` (§1.7). Two schemas change, which a patch permits **only because nothing is registered under HCS-13 yet**: §1.7 says a patch "changes no wire string, and once a minor version's schemas are registered it changes no schema," and `registeredSchemas` in `spec/pins.json` is null throughout (T-P9-9). After registration the same corrections would be 0.6. The register stays at 83 (78 core + 5 extension) and the extract-and-diff passes both ways.

The repository's **first `CHANGED` markers**, which D-131 set the convention up for: `D-135` on §1.6, `D-136` on §5.4 and §14.3, and `D-135, D-136` on §18.2's index.

### Added

- **§1.6 pins HIP-991 and HIP-423** (D-135) **[S]** ruling, **[CC]** fetch and text. Both rows read `Final · n/a`. FETCHED 2026-09-07 from `hashgraph/hedera-improvement-proposal`: HIP-991 @ `03701720`, `HIP/hip-991.md`, blob `179b61be…`, sha256 `772a8504…`, release 0.59.5; HIP-423 @ `0c4f195b`, `HIP/hip-423.md`, blob `f5fbb1d4…`, sha256 `2bcf4d7c…`, release v0.57.0. `spec/pins.json`'s `hips` block filled to the standards shape. **This closed a real exposure:** every property the doorbell of §4.4 depends on — a fee denominated in a fungible HTS token, the fee-exempt key list, the fee schedule key — had entered this repository as assertion in its own ADRs, and Q-12 was closed and the stamp made fungible on that basis. D-020, D-044 and D-049 gain the citation beside their inference and are not edited away. Two facts were nowhere recorded before the fetch: that a topic created without a fee schedule key can never gain one (`:97`), and that HIP-991 waives a fee **by signature** (`:110-113`).
- **`StampReceipt.rate`** (D-136), `{source, pair, value, at}`, present exactly when the method that bought the stamps is priced by reference. Closes §14.3's "the receipt records the rate used and when," which §5.4 had given no field for — a gap raised at the outfitting and carried in `stamp-receipt.schema.json`'s `$comment` until now.
- **`rate.reference {amount, asset}`** in §14.3 (D-136). T-P11-4's third branch — "the referenced rate applied to the reference price" — had named a reference price that was not a field of anything. It is one now, so the test **becomes true rather than being changed**, and three pricing branches map to three fields exactly.

### Changed

- **Prices are decimal strings in the asset's natural unit** (D-136) **[S]**: never atomic units, which bake a network's decimals into a document a Verifier reads, and never JSON numbers, since §5.1 canonicalizes under RFC 8785 and a float is a hazard. Conversion to atomic units happens when the x402 `PAYMENT-REQUIRED` is issued.
- **A rate-priced method carries `rate` in place of `unitPrice`, never both** (D-136). A published `unitPrice` on a rate-priced method is a number nobody charges, which §14.3's own MUST forbids. A bundle's price follows its method's pricing basis — the method's asset when fixed-priced, the reference asset when rate-priced — so one bundle of twelve for $1.00 is offered on both legs alike (§4.5).
- **§14.3's two pipes are read differently** (D-136). `payTo | facilitator` is **inclusive**, because §14.2 has the `PAYMENT-REQUIRED` carry the Postmaster's receiving address — which *is* `payTo` — so an x402 method needs it alongside `facilitator`. `unitPrice | rate` is **exclusive**. `price-list.schema.json` had encoded the first as `oneOf` at the outfitting; that was an over-reading by **[CC]** and would have rejected the very message this deployment publishes. Now `anyOf` and `oneOf` respectively.
- **T-P7-4 tests that an owner's answer costs nothing** (D-137) **[S]**. FETCHED from the pinned HCS-10 blob: `index.md:498` has an agent send `connection_created` "on its own Inbound Topic," memo `hcs-10:op:4:1` (`:522`, topic type 1 = inbound per `:362`). Unexempted, a recipient pays a stamp to answer its own doorbell — so §4.4's "owes nothing to answer" is false and, more sharply, so is its arithmetic: "first contact therefore costs one stamp to ring" becomes two. The row tests the outcome, not the mechanism; §4.4's exemption stays a MAY. No requirement added, nothing to invalidate (T-P9-2 blocks every claim), so not a minor bump.
- **T-P17-1 follows the declared policy for each topic type** (D-138) **[S]**. §4.6's "owned by keys the agent generated" means the *admin* key; the row's "admin/submit keys set to the agent's keys" over-read it, and **no doorbell could satisfy it** — an inbound topic must accept a stranger's `connection_request`. The pinned HCS-10 text is explicit (`index.md:113-114`): inbound is "Public (No Key), Submit Key, or Fee-gated (HIP-991)", outbound "Has submit key (only agent can write)". D-138 carries the key policy as a table, and because the reference Postmaster provisions its own agent by the customer path, that table is the template every provisioned agent inherits.
- Ledger §B rows **D-135 – D-138**; §H rows for HIP-991, HIP-423, the HCS-10 key configurations, and SaucerSwap — the last being its first entry in the register, having appeared twice in the whole repository until now, both times as an unfilled preference.
- §18.2's ADR index states its own criterion — a decision that shaped no sentence of the document is not indexed — and gains D-135 and D-136, which did. D-132, D-133, D-134, D-137 and D-138 stay out, unchanged in effect from the outfitting's note.
- Version strings: `README.md`, `STATUS.md`, `LIMITATIONS.md`, `CONTRIBUTING.md`, `CLAUDE.md`, the ledger's title and resume block. §18.2's "D-125 Frozen as 0.5.0" row is history and stands.

### Fixed

- Ledger §B row ordering: **D-88** sat between D-131 and D-132, and **D-65** between D-81 and D-82. Both returned to sequence; §B is now D-42 – D-138 ascending with no gaps. **[CC]** (D-65 was not in the reported defect list and was found by the ordering check.)
- The ledger's title read `# WISHMail v0.4.2 — Working ledger` against a v0.5 filename and a 0.5.0 text.

### Deferred, not fixed

- **The POSTMASTER claim is deferred on T-P16-1** (RECORD **[S]**). The MVP BUILD covers pre-funded Hedera accounts only, so both published methods are on `hedera:testnet` and §14.2's MUST — at least one method requiring no pre-funded Hedera account — is unmet. Stated in LIMITATIONS under L-11 and in STATUS §4. **No non-Hedera method was invented to make the claim true.**
- **The §14.2 / L-11 seam is logged, not patched.** §14.2 says that on a Hedera network the buyer "has an account already"; L-11 says the keyless leg "is satisfied on `hedera:testnet` through this facilitator." Both cannot hold. Ledger §G item 8 carries it with both citations for the next specification pass; §19.3 is the identified home, and writing it there in this patch would have added a third `CHANGED` marker.

## [Unreleased]

### 2026-09-07 — the tooling rule for Phase B, settled against the agent kit's own schemas **[S]** ruling, **[CC]** reconnaissance

No normative change; no specification sentence and no test moves. This records how the Postmaster's testnet entities will be made, before any of them is made.

- **Every transaction is `@hashgraph/sdk`; every read is mirror-node REST.** `hedera-testnet-mcp` is not used for a write we own. FETCHED 2026-09-07 by JSON-RPC against its endpoint: "Hedera Agent Kit" v0.1.0, 43 tools. Its *signing* posture is correct for P-13 — it returns unsigned bytes and holds no key of ours — but its write tools default the payer to "the operator account," which is its operator and not ours, and `create_topic_tool` has no payer parameter, so a topic it builds names an account we cannot control. D-47 fixes that the Postmaster pays; a payer we cannot name is not the Postmaster. That decides it before HIP-991 is reached.
- **Two requirements are additionally unsayable through it.** `create_topic_tool` has no `customFees`, `feeScheduleKey` or `feeExemptKeys`, so §4.4's one-stamp doorbell fee and D-138's exempt list cannot be expressed; `create_fungible_token_tool` offers one boolean about the supply key and nothing about admin, freeze, wipe, pause or KYC, so D-141's key posture cannot be expressed. Recorded once as a blanket DIVERGENCE in the new `app/OPERATIONS.md`, with both parameter lists quoted verbatim so the claim is checkable without the agent kit in hand.
- **`hedera-docs` is unaffected** and is used freely for design questions during BUILD; what it returns is FETCHED, cited with the document named, and never becomes a source the specification cites without a pin (§1.6, L-7).
- **The suite inherits the reads rule.** `conformance/README.md` now states that P-3 and P-4 together make a mirror node a read interface rather than a broker, and that nothing in `conformance/` may depend on an agent kit or any service that reads on the suite's behalf — otherwise T-P3-1's byte-identical evidence becomes a property of that service rather than of the ledger.
- Ledger §H gains the reconnaissance as a dated row. The finding is stated as a contribution rather than a complaint: HCS-10 offers a fee-gated inbound topic at `index.md:113` and HIP-991 has supported HTS-denominated topic fees since release 0.59.5, so the gap is in the tooling, not the standards, and naming it precisely is part of supporting the incumbent.
- `STATUS.md` §5 carries the rule for both servers; §6 "Next" now points at Phase B Step 1 and names its two reporting stops — the HIP-991 probe readback before the real doorbell, and the final verification report.

### 2026-09-07 — repository outfitting (STATUS.md §3 step 0; CLAUDE.md §4) **[CC]**

No normative change: `spec/WISHMAIL_SPEC_v0_5.md` is byte-identical to the frozen 0.5.0 text, and `spec/CONFORMANCE_TESTS_v0_5.md` to the ledger. The extract-and-diff passes both ways — 83 `T-P*` identifiers in the specification, 83 rows in ledger §A, none on either side alone.

- Layout of §18.5 created: `spec/` (with `schemas/`, `vectors/`, `adr/`), `conformance/` (with `fixtures/`, `corpus/`, `reports/`), `app/`. `WISHMAIL_SPEC_v0_5.md`, `CONFORMANCE_TESTS_v0_5.md` and `TEMPLATE.md` moved rather than copied, so that the only normative document exists once; `TEMPLATE.md` to `spec/adr/`, as its own note directed.
- `spec/adr/` backfilled: **D-1 – D-41**, one file each, `Status: carried`, from `provenance/WISHMAIL SPEC v0 3.md` §13 and the 2026-09-04 handoff. Each names the 0.5.0 sections it shaped and, where 0.5.0 changed it, what was carried and what was not — D-18 (the HOL disposition, superseded by D-103/D-104/D-108), D-20 (answered by D-49), D-28 (the receipt's mechanism, superseded by D-76/D-78), D-39 (v0.4 superseded by D-125; v0.3 now in the repository as provenance), D-41 (L-13 corrected by D-130). **D-33 was carried with a divergence against §6.2**, raised as MINE and ruled the same day — see D-133 below.
- `spec/pins.json` written as the machine-readable form of §1.6 (§18.4). All ten standards pins filled and verified against the recon drafts — six HCS blobs at `hiero-ledger/hiero-consensus-specifications @ 7046156c`, four x402 blobs at `x402-foundation/x402 @ 0c04a84e`. 32 pins are null and T-P9-2 blocks any claim: the `$POSTAGE` token and treasury on both networks, and the HCS-13 `schemaRef` and digest of all fourteen schemas.
- `spec/schemas/` stubbed: the fourteen files §18.5 names, one per §5 object and the §9.1 declaration, JSON Schema 2020-12. Observed objects (`settlement`, `postmark`) describe rather than constrain, per §5.1. Constraints not expressible in JSON Schema carry a `$comment` naming the test that holds them instead — `chunk` records that `nx` cannot be checked against `n` declaratively, so T-P1-11 and T-P9-3 are the court.
- Commit hygiene: `DCO` (Developer Certificate of Origin 1.1), `CONTRIBUTING.md` (the chain of custody, the spec-change procedure, register discipline, Conventional Commits types and scopes, the AI clause), and `.githooks/commit-msg` enforcing both. Enable with `git config core.hooksPath .githooks`.
- `README.md` rewritten; `spec/vectors/`, `conformance/` and `app/` given READMEs stating what goes in each and under what rules.
- Path references corrected after the move: `CLAUDE.md` §1 items 1, 2 and 4 and §4's layout block; `CHANGELOG.md`'s 0.5.0 link.

### 2026-09-07 — three decisions, D-132 – D-134 **[S]** rulings, **[CC]** text

None of the three amends a specification sentence, so no `CHANGED` marker is placed and the frozen 0.5.0 text is byte-identical to the initial commit. The register stays at 83 (78 core + 5 extension); the extract-and-diff passes both ways.

- **D-132 — the `x402-usdc` leg settles through the x402.org facilitator on `hedera:testnet`.** `https://x402.org/facilitator`, scheme `exact`, asset USDC `0.0.429274` (6 dp), facilitator fee payer `0.0.9185802`, no signup, key, or credit. FETCHED twice: the docs page Sonic named, 2026-09-07 (networks include `hedera:testnet` and no Hedera mainnet; testnet USDC `0.0.429274`/6 dp — that page names no fee payer and no endpoint), and the live `/supported` read of 2026-09-06 in the recon, which is where the fee payer stands. A deployment fact, not a §1.6 pin: it goes in the price list as `methods[].facilitator`, in `LIMITATIONS.md` L-11, and **not** in `spec/pins.json`. Closes the `STATUS.md` §6 item and fills its §4 row. Two limitations unsoftened: the Hedera scheme's replay rule is a SHOULD, so the Postmaster's durable record is what prevents a second purchase (T-P11-5, T-P11-6), and `hedera:mainnet` has no facilitator anywhere.
- **D-133 — `resolve` is one profile, one resolution, one proof.** Closes the divergence between carried D-33 and §6.2 that the backfill surfaced. §6.2 confirmed as written; the sender's choice is what the optional `profile` argument is for, and the choice happens before the proof is made, since by assembly the manifest is published and its hash is what the AAD commits. A multi-profile implementation calls `resolve` once per profile. `spec/adr/D-033.md` now points here instead of recording an open divergence.
- **D-134 — T-P15-3's sketch follows the D-74 reserve on *declaration* and records the substance of §1.5.** Ledger §A's row now reads for a **claim**, names `suite.reportDigest` (the field §5.10 actually gives it) rather than a `report` field no object has, and states §1.5's requirement — a claim names no class whose suite did not pass in full — keeping the digest check as the mechanism. Not a version change under §1.7: nothing conforms while T-P9-2 blocks every claim, and the test is not moved, only brought onto the requirement it always answered to.

`spec/adr/D-132.md`, `D-133.md`, `D-134.md` written; ledger §B rows added; ledger §A row T-P15-3 amended; ledger §G items 2, 3 and 4 marked done or closed. **§18.2's ADR index is not extended past D-131** — it indexes decisions that shaped the specification's text, and these three shape none of it; extending an appendix of the frozen document would carry markers for no change. **MINE**, procedural, reversible.

### 2026-09-07 — housekeeping **[CC]**

- `recon/` — the five reconnaissance reports and four pins drafts, with a README on what each is the source of and the two things to carry forward (digests are over raw git blob bytes; four of six standards are Draft).
- `provenance/` — v0.3, the handoff, the day-one USPS/PES research, and the Excalidraw scope map, with a README stating plainly that they bind nothing, that the invariant identifiers moved (§18.3's concordance), and which carried decisions were superseded.
- Path references updated for both moves: `CLAUDE.md` §1 items 3 and 4, all 41 backfilled ADRs, `spec/adr/TEMPLATE.md`, `spec/adr/D-132.md`, `spec/pins.json`'s `provenance.standardsSource`, `STATUS.md` §3 step 0, `README.md`. Ledger §H's intro now names the pins JSONs correctly — they are `*.pins.draft.json`, not `*_pins_draft.json`.
- `STATUS.md` §6: LICENSE closed (Apache 2.0, a `CLAUDE.md` §3 non-negotiable, present since the initial commit, named in `README.md` and `CONTRIBUTING.md`, DCO 1.1 and no CLA) and the facilitator closed by D-132. A **Next** paragraph names the HCS/HTS operations that come before any WISHMail code.

### 2026-09-07 — the ADR set completed to D-1 – D-134 **[S]** direction, **[CC]** text

Ninety files written, `D-042.md` – `D-131.md`, closing the gap raised earlier the same day. `spec/adr/` now holds **134 files, D-1 – D-134, no gaps**, so §18.2's "kept in `spec/adr/`, one file each" is true of the whole record and not only of the part that predates the ledger.

- **Ledger §B is the source of truth for D-42 – D-131, and each file quotes its row verbatim** under `## Decision`, unaltered. Context, Alternatives and Consequences sit beside it as Claude Code's reading, and each file says so in its own Provenance: where the reading and §B differ, §B governs; where either and the specification differ, the specification governs. Titles and shaped sections come from §18.2.
- **Tests are derived, not asserted.** Each file's `Tests:` field is the set of tests the `Conformance:` notes in that decision's shaped sections actually carry, extracted from the specification — and labelled as such, so it reads as "the tests registered in the sections this decision shaped", never as a claim that the decision added them.
- **Alternatives are recorded or absent.** Where ledger §B names a fork it is written up (D-104's social-committee fallback for unanchored agents; D-117's *affidavit* against *appraisal*; D-91's fork D; D-49's non-fungible stamp against the HIP-991 measurement). Where §B records none, the file says "None recorded" rather than inventing one.
- **`Supersedes`/`Superseded` are reciprocal across all 134 and machine-checkable.** Writing them surfaced chains that a reader of an old §B row would otherwise walk into: D-51's doorbell fee is collected *by the recipient* until D-105 makes it consumed by the treasury; D-62's `CHUNK_WIRE_MAX` is 1024 until D-96 makes it 1000; D-61's HPKE `info` is `wishmail/0.4/seal` until D-125; D-69 names an `agentfacts` profile and a social-committee `hol` until D-97/D-98 and D-104; D-53 writes the AAD as a `‖` concatenation until D-56 makes it canonical JSON, and its key names stand until D-127. Two links were overstated on the first pass and corrected: D-53 builds on D-26 without superseding it, and D-93 corrects a grammar that was no decision's content.
- `spec/adr/TEMPLATE.md` now states the coverage, the three provenances, and the reciprocity rule, with the note that a superseded ADR is never edited away — it keeps its text and gains the pointer, because the reasoning that was overtaken is the part a reader needs. Ledger §G item 4 updated to match.

No specification sentence changed; `spec/WISHMAIL_SPEC_v0_5.md` remains byte-identical to the initial commit.

### 2026-09-07 — audit pass before the first push **[CC]**

A read of every surface against its source, rather than a re-run of the checks that already passed. Eight things were wrong; all eight are fixed.

- **`spec/schemas/stamp-receipt.schema.json` carried a `rate` field that §5.4 does not give `StampReceipt`.** Added on Claude Code's own authority because §14.3 says "the receipt records the rate used and when" — which is coding around a gap instead of raising it. Removed; the schema tracks §5.4 exactly, and the gap is raised below.
- **The `Tests:` derivation under-reported six ADRs.** A bare chapter reference (`§8`, `§9`, `§14`, `§16`, `§1`) matched only the chapter's own preamble and not its subsections, and D-99's `§9.2 – §9.5` range matched only its endpoints. D-63, D-66, D-99, D-105, D-116 and D-131 now carry the right sets; the ADRs that still say "none registered" — §12, §17, §18, §19 and the rest — say it correctly, because those sections carry no `Conformance:` notes.
- **`evidence-bundle` made `observations` optional and `price-list` made `payTo`/`facilitator` both optional.** §5.10 lists `observations` without a `?` and marks only `integrity` optional inside it; §14.3 writes `payTo | facilitator` as a choice. Both now track the text.
- **`CONTRIBUTING.md`'s own example commit would have been rejected by `.githooks/commit-msg`** — scope `chunk` is not in the allowed list, and the subject was 73 bytes against a 72-byte limit. Corrected to `spec(schemas): fix nx top-level, forbidden on the last chunk` (60 bytes) and verified by running the hook against it.
- **`.gitignore` matched `*.env`, which does not catch `.env.local` or `.env.testnet`.** Under P-13 that is a live secret-leak path. Now `.env*` with `!.env.example`, verified. Node, build and editor ignores added while there.
- **`provenance/README.md` named the old invariants by their new names.** v0.3's `P-1` is *keyless verification* (merged into P-3 here), not "public-data replay"; `P-2` is *payment–envelope binding*. Corrected against §18.3, with `P-3` → `P-13` added.
- **Two unsupported claims in the carried ADRs.** D-18 called HOL "the largest Hedera agent registry" — the recon measured its Hedera-native registries at 33, 359 and 2 agents against 249,167 aggregated, so the superlative is not supportable; reworded and the measurement cited. D-19 called HCS-13 and HCS-25 "Hashgraph Online standards"; they are HCS standards, canonically in `hiero-ledger`.
- **D-9 asserted what HOL Guard is and dropped what the record qualifies.** The handoff calls it an open GitHub action doing plugin scanning and syntax validation, and marks feasibility *unverified* — with its applicability to a WebMCP/MCP repository still open as ledger §D item 7. Both restored.

Also checked and correct: all 90 verbatim §B quotes equal their ledger cell exactly (the row parser splits on `|`, so a pipe inside a row would have truncated one silently — none did); the supersession graph is reciprocal across all 134 ADRs, after correcting two overstated links (D-53 builds on D-26 without superseding it; D-93 corrects a grammar that was no decision's content); L-1 – L-14 in order; the hook rejects a bad subject and a missing sign-off.

### Raised, not ruled on

- **§5.4 against §14.3 — `StampReceipt` has no `rate`.** §14.3 requires that a receipt priced by reference to another asset record "the rate used and when"; §5.4's object has no field to record it in, and §5.10's `ConformanceClaim` does not carry it either. Either §5.4's field list is incomplete or §14.3's sentence is loose. The schema tracks §5.4 and the gap stands open. **MINE.**

### Still to do before code

- `spec/vectors/aad.json` and `seal.json` — generated at build step 1 (STATUS.md §3), court for T-P1-4 and T-P1-5.
- The 83 test files of `conformance/`.
- The HCS/HTS artifacts, and the pins they fill: the `$POSTAGE` token and treasury (§4.1), the price topic (§14.3), the per-agent topics of §4.6, and the HCS-13 registration of the fourteen schemas (§5.11).

## [0.5.0] — 2026-09-07

Initial frozen text. `CHANGED` markers begin at this commit (D-131). Wire strings: AAD `"v": "0.5"`, HPKE info `wishmail/0.5/seal`. 19 sections; 83 conformance tests named (78 core + 5 extension), none expanded; every uppercase keyword carries a `Conformance:` note naming a registered test.

### 2026-09-07
- §17 postal grounding approved as amended; every §17 citation verified manually **[S]**; *USPS v. Konan* verified by web scrape and §17.6 cites the FTCA postal exception, 28 U.S.C. §2680(b) (D-120). UPU "single postal territory" framing and the Q-11 price-floor reading approved **[S]**.
- §18 appendices approved; identifier concordance kept inline with a pointer to the ledger (D-121) **[S]**.
- §15.1 states what the Postmaster keeps and for how long; §3.5's promise made true (D-122) **[S]** ruling, **[C]** text.
- §19 open questions drafted and approved (D-123, D-124) **[C]** draft, **[S]** approval. WebMCP named as unpinned and unsurveyed by choice; D-30 (`send` blocks) held.
- Full read-through §1–§19 **[C]**: AAD key names in §5.5/§5.6 aligned to §7.2's normative `{p, v, l, lane, rp, nc}` and `v` sourced from the schemaRef's minor version (D-127); pre-D-104 "hol broker half" sentence struck from §11.4; §6.4 slip postcondition corrected to the treasury as fee collector; "five of six" Draft standards corrected to four against the pins recon (D-129); L-13 aligned to spent-at-affix / consumed-at-settlement (D-130); A2A AgentCard held in §16.8 (D-128); seven smaller text corrections (D-126); 33 `CHANGED` markers stripped (D-131).
- Frozen as 0.5.0; files renamed `WISHMAIL_SPEC_v0_5.md` / `CONFORMANCE_TESTS_v0_5.md` (D-125) **[S]** number, **[C]** freeze.
- `CLAUDE.md`, `CHANGELOG.md`, `LIMITATIONS.md`, `STATUS.md`, `TEMPLATE.md` written **[C]**.

### 2026-09-06
- Five reconnaissance reports against pinned sources **[CC]**: `pins-recon`, `nanda-recon`, `hol-x402-recon`, `openconvai-recon`, `impl-study` (+ pins JSONs). Findings filed in ledger §H with file:line.
- Pins filled from `hiero-ledger/hiero-consensus-specifications @ 7046156c` and `x402-foundation/x402 @ 0c04a84e` (D-92) **[CC]** fetch, **[S]** ratification.
- §13 failure modes and §14 payments landed and approved (D-100 – D-111): `$POSTAGE` token (D-100); price list on consensus (D-101); x402 leg BUILD with pins (D-102); HOL broker not a dependency, `hol` reads consensus (D-103, D-104, D-108); doorbell fee consumed by the treasury (D-105); `hbar` leg atomic purchase (D-106); direct HCS-1 memo under `hcs14` (D-107); resource server holds 402 state (D-109); self-registration on an open anchor (D-110); extensions named on the claim (D-111) **[S]** rulings, **[C]** text.
- §15 threat model and limitations landed and approved; §16 extensions drafted, then approved with two forks closed (D-112 – D-117): NANDA email `nativeId` rule struck as an extension and proposed upstream to HCS-14, verified against the NANDA recon (D-112); undefined-ledger-tag MUST moved to the core §5.1, T-P9-11 becomes core (D-113); two ledger tags (D-114); §12 test ranges brought current (D-115); "umpire" struck from §16.2 (D-116); §16.2 opens on "a Verifier's appraisal, signed and witnessed" (D-117) **[S]** rulings, **[C]** text.
- Also this day: `CHUNK_WIRE_MAX` = 1000 (D-96); `nanda` profile named and keyed to the NANDA v2 index (D-97, D-98); per-profile conformance notes (D-99); memo rule (D-94); lanes read in full (D-95); UAID grammar (D-93).
- v0.4.1 → v0.4.2 carry-forward; three stale ledger sketches corrected (T-P9-7, T-P9-8, T-P12-6) **[C]**.
- §17 and §18 drafted (D-118, D-119) **[C]**.

### 2026-09-05
- v0.4 §1 – §12 landed and approved (D-44 – D-91) **[S]** rulings, **[C]** text: conformance classes and the pedestal; three acts; app-level chunking, no HCS-1 for content (D-46); the Postmaster pays, the agent signs (D-47); no Sponsor (D-48); fungible stamp (D-49); weight (D-50); consumption (D-51); orphans not refunded (D-52); AAD composition (D-53); provisioning paths (D-54); one hashing rule (D-56); the six tool names (D-58); the lane, deterministically (D-60); HPKE sealing (D-61); trust classes (D-63); the fourth weld (D-64); epochs (D-65); two machines (D-66); state from evidence (D-67); `attest` as extension (D-68); profiles and the one declaration (D-69); manifest topic (D-73); ScheduleSign return receipt (D-76 – D-78); proof of posting is chunk 0 (D-79); evidence vs observations (D-82); the chain from the header (D-87); standing order and reasons as test IDs (D-88); versioning (D-89); `schemaRef` as HCS-13 HRL (D-90).

### 2026-09-04
- ETHOnline 2026 window opens (Sept 4 – 16). Start Fresh: the build originates in this window **[S]**.
- Day-1 planning: research briefs brought by Sonic — AAIF, ANS/HOL, Attestify, USPS/PES, NANDA, HCS catalog (`RESEARCH_*_2026-09-04.md`) **[S]**; Imran/AgenTrust posture note **[S]**.
- Spec skeletons v0.1 and v0.2; handoff document; v0.3 spec with invariants P-1 – P-17, failure modes F-1 – F-11, open questions Q-1 – Q-14, decisions D-1 – D-41, the six-tool surface, and the build set ranked by Sonic (D-23) **[S]** decisions, **[C]** text.
- Scope map (Excalidraw) ratified: green/blue = BUILD, orange = STRETCH, dashed = SPEC or VENUE **[S]**.
- Repo posture set: one monorepo mirroring `agentrust-io` (spec/, conformance/, app/); DCO; Conventional Commits; ASCII diagrams; the AI clause **[S]**.
- Conformance classes and the resolution/reconciliation split (D-42, D-43) **[S]**.

[Unreleased]: ./
[0.5.0]: ./spec/WISHMAIL_SPEC_v0_5.md
