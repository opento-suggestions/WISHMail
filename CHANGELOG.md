# Changelog

Format: Keep a Changelog. Versions are the specification's (§1.7): `major.minor` on the wire, `patch` for text and tests. Attribution: **[S]** Sonic (human), **[C]** Claude in chat (drafting, ledger), **[CC]** Claude Code (reconnaissance, agentic). Decisions are `D-n` in `CONFORMANCE_TESTS_v0_5.md` §B; tests are `T-<P-ID>-<n>` in §A.

## [Unreleased]

- Repository outfitting (spec/, conformance/, app/), ADR backfill D-1 – D-41, `spec/pins.json`, `spec/schemas/`, `spec/vectors/`.

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
[0.5.0]: ./WISHMAIL_SPEC_v0_5.md
