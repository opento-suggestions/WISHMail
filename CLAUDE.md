# CLAUDE.md — WISHMail

You are building WISHMail: certified mail for agents on Hedera, and a bridge between registries — HOL ↔ NANDA first, other ledgers by extension. You are working with Sonic (Nick Altemeyer). This file is what binds you in this repository. Read it before anything else, every session.

## 1. The documents, and their order

1. `spec/WISHMAIL_SPEC_v0_5.md` — **the only normative document.** Version 0.5.2 — frozen at 0.5.0 on 2026-09-07, patched to 0.5.1 the same day (D-135 – D-138) and to 0.5.2 on 2026-09-08 (D-145 – D-148); wire strings carry `0.5`, because a patch changes none (§1.7). Every implementation decision is measured against it. Where any other file disagrees with it, the spec wins.
2. `spec/CONFORMANCE_TESTS_v0_5.md` — the working ledger. Section A is the test register (83 tests: 78 core + 5 extension) you build the suite from. Section B is the decision record D-42 – D-148 and the source of the ADRs. Section H is verified facts about the pinned standards with file:line. Sections D–G are open-item status and the build-phase list. Nothing in it is normative.
3. `recon/` — the recon reports and pins JSONs (`pins-recon`, `nanda-recon`, `hol-x402-recon`, `openconvai-recon`, `impl-study`, all 2026-09-06) — dated fetches of the standards. Read one only when H's row isn't enough.
4. `provenance/` — `WISHMAIL SPEC v0 3.md`, the handoff, the day-one research, and the scope map. **Provenance only.** They bind nothing. The ADR backfill D-1 – D-41 is done; read them only to check what an ADR carried.
5. `STATUS.md` — the build set as Sonic ranks it, and the demo shape. The one file where "what we build first" is an ordering.
6. The Excalidraw scope map — the ratified scope line: green/blue = BUILD, orange = STRETCH, dashed = SPEC or VENUE. Do not re-propose scoping down. Full product is the judging posture, and the registry layer is load-bearing.

Read the spec in order: §1 (scope, classes, pins, versioning), §2 (vocabulary — the names in code are these names), §5 (objects and wire format), §6 (the six tools), §7 (envelope and binding), §8 (state machine), §9 (resolution profiles), §10 (the proof chain), §11 (replay and appraisal), §12 (invariants — the key every test reads backward), §14 (payments), §15 (limitations). §3, §4, §13, §16–§19 give the why. Check a file's length before reading it and read it in full; never a default truncating view.

## 2. Start Fresh

The build originates in this window (ETHOnline 2026, Sept 4–13th submission deadline). Prior thinking may guide; prior code may not. Do not import, port, or paraphrase code from any earlier WISHMail, Witness Required, or Ontologic repository. Every line here is written here.

## 3. Non-negotiables

These are stated in the spec with tests; they are repeated here because they are the things most likely to be quietly violated by a reasonable-looking shortcut.

- **Strict HCS-10** at the pinned blobs (§1.6; `hiero-ledger/hiero-consensus-specifications @ 7046156c`). Envelopes ride inside HCS-10 `message` operations on HCS-10 topics. One HCS message per chunk; `CHUNK_WIRE_MAX` = 1000 bytes on the whole operation; no `chunkInfo`; no HCS-1 for content (§7.4). Every operation carries HCS-10's transaction memo and none where HCS-10 defines none (§6.1).
- **The resolution proof lives inside the AAD** (§7.2). The AAD's key names are `{p, v, l, lane, rp, nc}` — exactly those, canonical JSON per RFC 8785 — and its SHA-256 is the envelope identifier. `spec/vectors/aad.json` is the court (T-P1-4).
- **No broker, key, or credit is required for conformance** (P-4). The VERIFIER suite runs with nothing configured. A mirror node is a read interface, not a broker.
- **P-12 wins any conflict.** Appraised never exceeds declared. Non-replayable evidence downgrades, never upgrades. A Verifier reports; it never errors where a downgrade will do.
- **The chain from the header** (§7.4, §8.5, §11.3). Reassembly is a walk on bytes, not clocks: chunk 0 by its header rebuilding to `id`, each later chunk by the prior's `nx`.
- **Standing order** verified > unverified > unstamped > unbound; reasons are test identifiers, in the order of §11.5's table.
- **The token is `$POSTAGE`**; stamps are consumed to the treasury, doorbell fee included (§4.3, §4.4, §14.4). No token other than the stamp is postage. The price list lives on consensus (§14.3).
- **The Postmaster pays; the agent signs** (§3.5). The Postmaster holds no agent key, ever — not a decryption key, not a topic key, not an account key (P-13). Keys are born in the agent's process. No tool input, schema field, config file, or log carries private-key material.
- **We are not a registry broker.** WISHMail reads registries and adjudicates between none. The HOL broker is a directory, never an input (§9.5, §9.7). Nothing a directory says enters a resolution.
- **Testnet only** at this version (§15.5). `hedera:mainnet` is defined and undeployed. Two ledger tags exist; any other is refused (§5.1).
- **No Solidity. No smart contract. No broadcast. No push surface.**
- **FETCH before asserting anything about a Draft standard.** Four of the six pinned standards are Draft. Conformance is to the blob §1.6 names, not to the name. If the text you need isn't in H or a recon, fetch it at the pinned commit and record the fetch with its date.
- **Apache 2.0 Licensed**.

## 4. The repository

One monorepo, mirroring `agentrust-io`:

```
spec/            WISHMAIL_SPEC_v0_5.md and CONFORMANCE_TESTS_v0_5.md; spec/schemas/ one JSON
                 Schema per §5 object and the §9.1 declaration (fourteen files, named per
                 §18.5, suffix .schema.json); spec/vectors/ (aad.json, seal.json);
                 spec/pins.json; spec/adr/ TEMPLATE.md and D-nnn.md, D-1 onward
conformance/     one test per T-<P-ID>-<n>, keyed to §12; fixtures; the §8.5 exception corpus;
                 the report a conformance claim names
app/             the reference implementation: MCP server (the resource server of §14.2),
                 the WebMCP page as its client, SDK, CLI, resolvers — each declaring the
                 spec version and the classes and profiles it claims
CHANGELOG.md · LIMITATIONS.md (fourteen sections, L-1 – L-14, in order) · STATUS.md · LICENSE
CONTRIBUTING.md · DCO · .githooks/commit-msg (git config core.hooksPath .githooks)
```

**Outfit the repo before writing code.** DCO sign-off on every commit. Conventional Commits. `CHANGELOG.md` from the first commit. ASCII diagrams, never images, in spec and docs. Schemas follow the spec; a schema change without a spec change is not a change to WISHMail (§1.7).

**Spec leads, schema follows, tests are the court.** The order of work for any feature: the spec sentence exists → the schema tracks it → the test named in its `Conformance:` note exists and fails → the implementation makes it pass. Never the reverse.

**No MUST without a test.** If you find yourself needing a requirement the spec doesn't state, that is a spec change (§5 below), not a line of code.

**Every named test exists.** Section A of the ledger lists 83. Each becomes one test file, keyed by its ID, serving the invariant in its P-ID. Tests are not expanded in scope beyond their sketch without a decision. Extension tests (T-P2-3, T-P5-5, T-P6-6, T-P11-7, T-P12-7) bind only a release that claims the extension; build them last or not at all.

**Vocabulary.** Names in code follow §2.2 and the field names of §5. A lane is a lane, a doorbell is a doorbell, an envelope is an envelope; the tools are `resolve`, `buy_stamp`, `send`, `inbox`, `ack`, `verify`; failure codes are `TOOL_REASON` as §6 fixes them. Do not introduce synonyms.

## 5. Changing the spec

The spec is frozen. It can still be wrong. When implementation shows a sentence is wrong, incomplete, or untestable:

1. Stop. Do not code around it.
2. Write the finding as a decision candidate: what the text says, what reality says, what you propose, marked MINE.
3. Sonic rules. A ruling becomes `D-nnn` in ledger section B (next number after the last row there), dated.
4. The spec text changes, with `<!-- CHANGED: D-nnn -->` on the line before the amended paragraph, and a CHANGELOG entry.
5. If a MUST is added, its `Conformance:` note names a test, and that test is registered in ledger section A the same change.
6. A change to a wire string or a registered schema is a new minor version (0.6), never a patch.

The spec's register is indicative, present tense; it never narrates its own history ("v0.5 said", "measured at", "before the chain"). History lives in the ledger. Decisions are cited in the spec sparingly, as ADR pointers.

## 6. Register discipline — in the ledger, in commit messages, in what you say to Sonic

Mark claims: **RECORD** (Sonic said it), **FETCHED** (from the web or a recon; give the date and file:line), **MINE** (your inference or lean). Never present MINE as RECORD. A MINE becomes RECORD only when Sonic says so.

When you are wrong, say so in the same turn, before he catches it. Honest uncertainty over false confidence. If you don't know, say you don't know and go fetch.

## 7. The AI clause

Use agents — subagents, tools, generation — as much as helps. But every change must be explainable with the agent closed: the commit message says what changed and why in terms of the spec's sections and the test it serves, and a reviewer with no access to any AI can follow it. If you cannot explain a diff without the conversation that produced it, the diff is not ready.

## 8. Working with Sonic

He is a verbal processor: reason with him, present a lean, and assert a connection by asking about it. Spec-first: actors, I/O, invariants, failure modes before implementation. Match his depth (cryptographic protocols, DLT, Peirce/Tarski/Floridi). Prose over bullets in conversation unless he asks for a list; this file is a list because it's a file. Do not schedule, sequence, or prioritize his tasks, do not frame items as "flag for later," and never initiate wrap-up — he manages his own time and closes when he's ready. His Christ-centered faith is load-bearing infrastructure, not decoration.

The postal motifs — the Postman, the uniform, the umpire — are the working interface between Sonic and Claude and appear in the ledger's reasoning. They do not appear in the spec, in code, in comments, or in commit messages. The spec's own postal vocabulary (§2.2, §17) is the vocabulary.

## 9. Editing method

Copy a file out before editing it. Anchor every `str_replace` on a short exact string and check that it matched exactly once — scripts abort silently on a mismatch and write nothing. After any edit to the spec or the ledger, run the extract-and-diff: every `T-P*` identifier in the spec exists as a row in ledger section A and vice versa. Present both files whenever either changed.

**A schema validates a document against its shape, not against a rule that reads it.** So every writer is built in the same step as its reader — the sealer with the opener, the declaration with the resolver, `send` with `inbox` and `verify` — and the reader is run on the writer's output *before* that output is signed or published. A document can validate, hash correctly, and be internally consistent while being unreadable by the rule it exists for, and nothing but the rule will say so.

**Push per landing.** Every commit goes to `origin` as it lands, with every tag — `git push origin main --follow-tags`. Not at the end of a session and not in a batch: an unpushed commit is work only this machine has, and the point of the record is that someone else can read it. Report the commit and confirm `git status` clean and `git log origin/main..main` empty.

The case is in `app/OPERATIONS.md`, Step 3 section 8. The first `hcs14` declaration hashed the agent's identifier under `version "1.0.0"` while the HCS-11 profile carrying it said `"1.0"`; a profile has exactly one `version` field, and section 9.5 recomputes the identifier from the profile's own name, version and skills. The declaration validated against its schema, the file's digest matched its topic memo, and the identifier was consistent with itself. It was inconsistent only with the one `version` a reader can see, and an HCS-1 topic has no admin key, so it was permanent. Running the resolver against our own address returned `RESOLVE_NOT_FOUND` and cost one transaction to correct; had the resolver come a day later it would have cost a superseded declaration and a wrong answer to every reader in between.

## 10. Things that are not open

Do not reopen: broadcast; a broker dependency; Solidity; a Postmaster that attests; a score computed off consensus that touches a standing; a token other than `$POSTAGE`; HCS-1 for envelope content; a non-blocking `send` (D-30, held); WebMCP as a normative dependency (D-124: unpinned and unsurveyed by choice, decided by the release that ships the page). Each has a record in §18.2 and ledger B. What *is* open is §19, and only §19.
