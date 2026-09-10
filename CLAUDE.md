# CLAUDE.md — WISHMail

You are building WISHMail: certified mail for agents on Hedera, and a bridge between registries — HOL ↔ NANDA first, other ledgers by extension. You are working with Sonic (Nick Altemeyer). This file is what binds you in this repository. Read it before anything else, every session.

## 1. The documents, and their order

1. `spec/WISHMAIL_SPEC_v0_5.md` — **the only normative document.** Version 0.5.9 — frozen at 0.5.0 on 2026-09-07, patched to 0.5.1 the same day (D-135 – D-138), to 0.5.2 (D-145 – D-148), 0.5.3 (D-150, D-151) and 0.5.4 (D-152) on 2026-09-08, and on 2026-09-09 to 0.5.5 (D-157, D-159, D-160, D-161), 0.5.6 (D-159 amended, D-163), 0.5.7 (D-166), 0.5.8 (D-167) and 0.5.9 (D-167’s §10.2 text); wire strings carry `0.5`, because a patch changes none (§1.7). Every implementation decision is measured against it. Where any other file disagrees with it, the spec wins.
2. `spec/CONFORMANCE_TESTS_v0_5.md` — the working ledger. Section A is the test register (86 tests: 81 core + 5 extension) you build the suite from. Section B is the decision record D-42 – D-167 and the source of the ADRs. Section H is verified facts about the pinned standards with file:line. Sections D–G are open-item status and the build-phase list. Nothing in it is normative.
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

**Every named test exists.** Section A of the ledger lists 86. Each becomes one test file, keyed by its ID, serving the invariant in its P-ID. Tests are not expanded in scope beyond their sketch without a decision. Extension tests (T-P2-3, T-P5-5, T-P6-6, T-P11-7, T-P12-7) bind only a release that claims the extension; build them last or not at all.

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

## 11. The MVP build, and the line between us and an operator

This section is the 2026-09-09 rulings (D-156 – D-165). It governs `app/` for this window. Where it and the spec appear to differ, the spec is what binds and this is what we ship.

**Roles, and the vocabulary.** Three human roles: **OPERATOR** — us, running the Postmaster: treasury, the `$POSTAGE` supply key, the price topic, the Postmaster-agent, the counter. **C1OPERATOR** and **C2OPERATOR** — the two Correspondents' operators, each bringing a funded testnet wallet. Beside them, **Correspondent A** and **B**, the agents. *The agent signs; the operator pays.* Use these words consistently in ADRs, STATUS, README, LIMITATIONS, plans, and commit messages.

**"Operator" is a word of §3.3 and survives in prose only.** §3.3 fixes an *Operator* as "the human or organization behind an agent", and all three roles above are Operators in that sense — we are the Postmaster-agent's. What is **not** an Operator is an account, and the repository used to call the Postmaster's payer account one: `OPERATOR_ID`, `OPERATOR_DER_KEY`, `env.operatorId`, `ctx.operator`. Two roles under one word, in a codebase where a Correspondent's payer now appears in the same call, is how a key gets read from the wrong side. **Identifiers name the role**: `POSTMASTER_PAYER_ID` and `POSTMASTER_PAYER_DER_KEY` in the environment, `postmasterPayerId` / `postmasterPayer` in the Postmaster's code, `homePayerId` / `homePayer` in the Correspondent's, and `payer` in a Correspondent's config — which is what §3.5 has always called it. **HCS-10's `operator_id` keeps its name**: it is a pinned standard's field and it names the agent, not a person, which §2.2 already says in as many words.

**Config boundary.** Every private key, every payer wallet, and every operator-specific value the Correspondent MCP reads comes from that operator's own configuration file or environment — never from code. `OPERATOR`, `C1OPERATOR`, `C2OPERATOR` are **demo labels, not identifiers**: they must not appear in `app/` as a value, constant, default, enum member, or filename. A third party plugs in its own keys and its own payer from its own configuration. The repository ships a config **template** for a Correspondent; a filled config is gitignored, and `npm run p13:check` is what keeps it that way. `app/deployment/<network>.json` is the Postmaster's ops record only — no Correspondent entity ID goes in it.

**The payer seam, and its remote half is now exercised.** Every consensus submission an agent makes is constructed *agent signs, payer signs*, with the payer an injected signer. Nothing above the seam may know which. **Under a provisioning purchase the payer is REMOTE** (D-168): for each frozen body the agent has signed, the Correspondent sends the body bytes and the purchase reference to the counter and receives the Postmaster’s payer signature, and the transaction id names the Postmaster as payer. That is §6.1’s carry, and it is why the seam was built as a seam and not as a shortcut — the same `generateMailbox` runs over a local wallet and a carried one, unchanged. Everything **outside** a purchase is paid by that agent’s own operator, from that operator’s own configuration (§4.4, §6.1, D-157, L-5).

**Provisioning order** (D-159, amended the same day, and D-168), per agent: boot the keys in the agent’s own process → **`buy_stamp` with `provision`**, which is the whole of §4.6’s provisioned path — the three-legged transfer, then the mailbox with the counter as payer, then the receipt — → `register_agent`, the agent as its own payer and signer → `resolve` its own address under `hcs14` and `hol`. **The purchase is one atomic transaction with three legs**: ℏ from the buyer to the Postmaster for the price, `$POSTAGE` from the treasury to the agent's public-key alias, and the registration fee in ℏ from the Postmaster to that same alias. The account is *bought, not funded*, and is born holding stamps and exactly one fee. The agent holds ℏ once, to sign its own name on the anchor, and never again. The price list prices the fee (`provisioning.registrationFee`) and the receipt records it, so a Verifier sees it as a leg of the purchase and not as a gift. `generate_mailbox` and `register_agent` live on the Correspondent MCP and are **not** among §6.1's six; they are §4.6 affordances and no class is tested against them. **`generate_mailbox` is the SELF-PROVISIONED path** — an agent that brings its own account and pays for its own mailbox — and the demo does not say it: `buy_stamp` with `provision` does the whole thing and returns the receipt (D-168). `register_agent` emits `{p, op, account_id, uaid, t_id, m}` — the pinned fields plus the two the deployed anchor's readers parse; the pin forbids no additional field (D-164, ledger §H).

**An agent that outlives the demo** (D-165). **The Correspondent home directory is the agent's identity**: config (the operator's payer, the network, runtime locations), keystore (the account key, and every epoch's X25519 key, retained — §7.6, L-1), and the durable store (sent envelopes for F-3 retry, pending receipt requests, the inbox cursor). A fresh home is a new agent; an existing home is a returning one. **Keys are born once**, on first run, into the keystore; every later boot loads them. A process that regenerated on boot would make every restart a new agent.

**Every provisioning verb is idempotent against consensus, not against local state.** `generate_mailbox` first resolves the agent's own address under `hcs14` and does nothing if coordinates exist; `register_agent` first resolves under `hol` and does nothing if a registration by this account exists; `buy_stamp` with `provision` refuses if the holder's account already exists, so a returning agent buys without it. A wiped local file never causes a second doorbell or a duplicate registration — and a duplicate registration is not merely waste: §9.5 assigns `vague` where more than one names an address. This is §9's write-the-reader-with-the-writer applied to provisioning: **the resolver is the reader**, and a local file is a cache of consensus, never an authority over it.

**Lanes are reused, never re-rung.** §7.1: the earliest-created open lane between two agents is *the* lane, for `send`, `inbox` and replay. The doorbell watcher decides by reading the doorbell for requests with no `connection_created`, so it too is idempotent from consensus. A second letter to the same recipient rings nothing. Rotation stays out of the MVP, and nothing built here may make it harder — no local assumption that there is only ever one epoch.

**One template, three readers** (D-162). The lines `send` logs as consensus facts land, the text block `send` returns beside its structured `Postmark`, and `narrate()`'s sentences over a bundle come from one template file. Same sentence, three readers. **None of the three may imply receipt or delivery** — §2.3 reserves *delivery* for the lane, and §11.8 forbids turning silence into refusal. goose renders tool-call cards and final payloads and does *not* render `notifications/progress`, so the Correspondent's own log is the live surface and the result's text block is the retrospective one.

**MVP scoping, and who is named for it.** This window covers pre-funded operator paths only. Deferred: the `x402-usdc` purchase leg; Postmaster-pays carry for an agent's own submissions, so **T-P4-2 is untested**; carry exists only inside `buy_stamp`; the WebMCP send side; `dns` and `nanda` in the letter path; HCS-25; rotation. **LIMITATIONS names our scoping as the reason for each — never Hedera, never the spec.** A deferred claim is honest; a widened specification or an invented deployment artifact is not.

**Probes are disposable.** Throwaway keys; the inert 2026-09-08 probe token and its treasury where reusable; never the real `$POSTAGE` and never the real doorbell. Each probe gets its own small gate report before anything signs.
