# WISHMail — Session Handoff (ETHOnline 2026, Day 1)

**Date:** Friday, 2026-09-04
**Session type:** Planning (no code written; by design)
**Author:** Claude Fable 5.1, in session with Sonic (Nick Altemeyer)
**Audience:** a future Claude instance (likely inside a dedicated Claude Project for this build)
**Status of this document:** RECORD of what was established in-session. Where I infer or lean, it is marked MINE. Where a fact was fetched from the web, it is marked FETCHED with a caveat. Nothing here is normative for the spec; the spec will be.

*The uniform did the work before the infrastructure existed.*

---

## 0. How to use this document

Read §1 (state of play) and §4 (the invariants) first. §8 lists what is still open and must not be treated as settled. §10 tells you what Sonic said happens next. §11 tells you how to work with him on this project.

Register convention (borrowed from Sonic's STATUS ledger and from the trace-spec posture, see §7): **RECORD** = what was said/decided in session. **FETCHED** = pulled from the web this session, may drift. **MINE** = my inference or lean, not Sonic's decision.

---

## 1. State of play (RECORD)

- ETHOnline 2026 runs **Sept 4–16, 2026**, fully async, Hedera is a partner, $100k+ prizes. Sonic was accepted Aug 16. Today is Day 1.
- The entry is **WISHMail** — an open agentic mail standard on Hedera: *certified mail for agents*. Confirmed today.
- **Start Fresh compliance is settled.** Nothing was published or built before the window. Sonic's position, which I accepted without relitigating: the rule bites on code and public project artifacts, not on prior thinking. The v0.2 spec skeleton (Aug 10–11) is prior *thinking* and may guide the build. "It's not cheating to use my own thoughts from before the window."
- The build must **originate fresh** — new repo, new code. It may draw inspiration from Witness Required (x402 pay-per-proof on Hedera) but must not derive from it.
- Sonic will create a **dedicated Claude Project** for this build after the Excalidraw exercise (§10).
- **The deliverable is MCP** — ideally a **WebMCP** implementation "for maximum readability by humans and agents." This resolves the dashboard-vs-MCP question: they are the same artifact (§5.3).
- **Judging posture** (from Aug 16, carried forward): Sonic corrected my minimal-demo instinct with Apex hackathon data — Attestify.io took second in the Open Track by delivering comprehensively and beat his MVP-scoped entry. Full product builds are what get rewarded. The agent registry / resolution layer is load-bearing for WISHMail's identity as a postal system, not a demo trick. Do not re-propose "scope it down to one loop."

### 1.1 The bridge thesis (RECORD, late Sept 4 — this is now the headline)

Sonic: *"I want this build to be a bridge between silos: between HOL and Project NANDA explicitly at first. Through CLPR though, I'd also like to see if we can support OCEAN / Sonic chain / SUI / SEI etc."*

Consequences:
- **Registry-plural (P-5) is no longer a defensive property; it is the product's identity.** WISHMail is certified mail that resolves across the HOL ecosystem (HCS-10 / HCS-14 / HCS-11 / HCS-2) and the NANDA ecosystem (AgentFacts / Index) *in the same envelope format*, with ANS/DNS as the Web2 leg. The first bridge to demonstrate is HOL ↔ NANDA.
- **Posture refinement on incumbents.** Sonic: *"We want interop. We want ecosystem support. That comes from utilizing the incumbents regardless of how we feel about them. This is business not personal."* The HOL Registry is **deferred, but likely used as one-of-multiple options.** This does **not** loosen P-4: no broker may ever be *required* for conformance. The posture line is now, **ratified verbatim: "Require no moat; support every incumbent." P-4 holds.** Sonic: "The product *is* plural registries." Practically: a HOL-registry resolution profile is *supported* alongside UAID-native, ANS, and NANDA; an independent resolver never needs it.
- **CLPR (HIP-1535) is the road to ledger-universality** — target ledgers named by Sonic: OCEAN, Sonic chain, SUI, SEI, "etc." In-window: spec Extensions only (ledger-tagged proofs and postmarks; no same-ledger assumption). **Honest unknowns (MINE):** which ledgers CLPR's first implementations can verify state for is not established; SUI (Move) and SEI (Cosmos/EVM) have different light-client stories from EVM chains; and **Ocean Protocol is a venue, not a target ledger** (confirmed by Sonic) — it belongs in the Venues bucket alongside the AAIF working groups, not in the CLPR ledger list.

---

## 2. WISHMail — the concept as it stands (RECORD, consolidated from Aug + today)

### 2.1 Thesis
Certified mail for agents. Explicitly *not* Signal: no forward-secrecy claim; history is intentionally decryptable. The standard sells two claims, separately:

- **Origin — stamping:** witnessed provenance of an entity's statement, welded to its settlement event via txRef/AAD binding.
- **Story — resolution:** deterministic reconstruction of a correspondence from public consensus data alone. Replay, not push. This is what dissolves the uptime liability.

The receipt is the product. Mail is a trust institution; the postmark is the uniform. David Brin's *The Postman* is the attached motif.

### 2.2 Design posture (settled Aug 10, reconfirmed today)
"**Honor the standards, ignore the moat.**"
- Strict **HCS-10 (OpenConvAI)** conformance so WISHMail inherits its registered senders/recipients. Transport is wholly theirs; WISHMail defines only the envelope convention plus the certified layer.
- Addressing via **HCS-14 UAID**; **HCS-1** for large bodies; **HIP-991** fee-gated inbox topics for first-contact postage.
- Nothing touches the hol.org broker, unified API, or credit system. Conformance never requires a private broker, API key, or credit.
- **Registry-plural from birth** (P-5). NANDA sits alongside ANS/DNS as a named Registries actor.

### 2.3 Cryptographic core (inherited from the Fountain-era WISHMail spec)
- X25519 app-level keypairs, unlocked by wallet signature (HashPack/Blade); passphrase path via Argon2id; browser-stored wrapped keys; encrypted key-backup export for migration.
- Single-use CEK (AES-GCM-256); KEK via ephemeral X25519 ECDH or Argon2id.
- **AAD** binds ciphertext to context. Prior: `hash(topicId ‖ txRef)`. **Today's decision extends it:** `hash(topicId ‖ txRef ‖ resolutionProof)` — see P-6 and D-1.
- Key rotation keeps old keys to decrypt history (P-8).
- Physical constraints: 1,024-byte HCS message chunks; 100-byte HTS memo; roughly 0.06–0.11 HBAR per message.

### 2.4 Threat model (Q-1, closed Aug 10 with Sonic's refinement)
World = sealed. Service (Postmaster) = ciphertext + metadata in transit only, "discarded as appropriate and only retained as necessary." Counterparty's operator = visible ("the right to open mail is the right to open mail"). Own host = visible, out of scope.

### 2.5 Prior artifacts (exist outside this session; bring into the Project)
- `WISHMAIL_SPEC_SKELETON_v0.1.md` (Aug 10) — actors / I-O / invariants / failure modes + state machine + event grammar. Namespacing P-/F-/Q- chosen to avoid collision with Witness Required W-series and Coprocessor I-series.
- `WISHMAIL_SPEC_SKELETON_v0.2.md` (Aug 11) — Q-1/2/4/5/8 closed; F-6 reframed as *attempted-delivery slip*; F-9 (HCS-10 Draft drift) added; retention policy added to LIMITATIONS; Registries actor + Q-10 (NANDA profile) added.
- **I did not have the text of either skeleton in this session.** The state machine and event grammar live there and were not re-derived today. Do not assume this document supersedes them; it *extends* them. The v0.3 cut should be made against the v0.2 text.

---

## 3. Research incorporated today (RECORD of what the reports said; MINE where I mapped them)

Sonic brought four surface-level research reports. What each one changed:

### 3.1 Project NANDA (MIT, Apache 2.0)
Four pillars: **NANDA Index** (DNS alternative / discovery), **AgentFacts + ZTAA** (CA alternative / attestation), **Adaptive Resolver** (orchestration), **protocol bridges** (HTTPS / MCP / A2A). Repos: nandatown (12 protocol layers), nanda-index-v2, adapter, agentfacts-format, nanda-agent SDK, registry-server, town-agents. Phases: Foundations (current) → Agentic Commerce → Society of Agents.
**Mapping (MINE, ratified in spirit):** AgentFacts is the *declare* side — a mail-coordinates field in an agent's AgentFacts document is a resolution profile. Postmark-as-attestation-object is the *witness* side and stays at Q-10 (spec only). NANDA Town's twelve layers (Transport, Communication, Identity, Registry, Auth, Trust, Payments, Negotiation, Memory, Privacy, Data facts, Other) are a free layer map: WISHMail touches Communication, Identity, Registry, Trust, Payments, Privacy, Data facts.
**Counterparty context:** Chris Pease (co-founder FAN/NANDA, founder of VeloCam) signed an LOI for a steward-to-steward accord with ORG. NANDA's four choke points are DNS, CA, orchestration, attestation; ORG's lineage addresses the attestation slot. The bilateral commitments live *outside* the spec so the standard stays party-neutral.

### 3.2 GoDaddy ANS and Hashgraph Online (two distinct layers — the pairing dissolves on reading)
- **ANS (Agent Name Service):** identity anchored in DNS — domain validation, PKI, ACME, dual certs (server + identity), immutable transparency log; resolution via `ans://vX.Y.Z.domain`; capabilities/endpoints/TLSA pinning/metadata in DNS **TXT and SVCB records under the `_ag` label**; aligning with Infoblox DNS-AID and Nemethi AID under the Linux Foundation's Agentic AI Foundation; complementary to ARD.
- **Hashgraph Online (HOL):** per its current surface, a *registry broker and CI/CD validation gate* — HOL Guard (plugin scanning, syntax validation, offline verification), `ai-plugin-scanner-action@v1` (linting, min-score gating, Cisco skill scanning, SARIF export), awesome-codex-plugins auto-index, enterprise OCI image, "Points Portal" test env.
**Consequence (MINE, ratified):** "honor the standards, ignore the moat" is now *accurate*, not just principled. The open standards to conform to are HCS-10/HCS-14 and DNS; the broker is exactly the part no conformant mail system needs. HOL offers nothing the stamp requires.

### 3.3 Agentic AI Foundation (AAIF, Linux Foundation directed fund)
Projects: **MCP** (Anthropic), **goose** (Block; local-first, Rust, 15+ LLM providers, 70+ MCP extensions), **AGENTS.md** (OpenAI), **A2A**, **agentgateway**, public-agents. Working groups: Security & Privacy; **Identity & Trust**; **Agentic Commerce**; **Observability & Traceability**; Workflows & Process Integration; Governance/Risk/Regulatory; Accuracy & Reliability; Taxonomy & Landscape workstream. Governance repos: technical-committee, project-proposals, working-group-proposals, foundation, aaif-landscape.
**Mapping (MINE, ratified):** MCP is the distribution primitive — ship WISHMail as tools and every MCP client becomes a postal customer. goose is the demo client. A2A stays at spec level (AgentCard mail-coordinates extension). AGENTS.md is a ten-minute footnote. agentgateway is later deployment posture. The three WGs (Identity & Trust = postmark as attestation; Observability & Traceability = receipt as trace artifact; Agentic Commerce = postage) are *venues*, not code — one spec appendix.

### 3.4 USPS / Private Express Statutes ("the OG Postmaster")
Universal Service Obligation (Title 39): prompt/reliable/efficient service everywhere; no closing rural offices for deficit alone; six-day delivery; single integrated network (packages subsidize letters); **uniform First-Class pricing regardless of distance**. USPS is an "independent establishment of the executive branch" (hybrid public/corporate). Statutes: PRA 1970 (depoliticize), **PAEA 2006** (market-dominant letters vs competitive packages; inflation-capped letter prices; PRC oversight; retiree-benefit pre-funding that caused insolvency), **PSRA 2022** (repealed pre-funding). Private Express Statutes: letter monopoly to prevent cream-skimming. A *letter* (39 CFR § 310.1) = "a message directed to a specific person or address and recorded in or on a tangible object"; unaddressed circulars are not letters. Exceptions: extremely-urgent (cost test ≥2× postage or $3 floor; time test), parcels, >12.5 oz, letters accompanying cargo, special messengers, **private hands** (uncompensated hand delivery). Cases: **Konan (2026)** — immunity even for intentional nondelivery; Dolan (2006); Groff v. DeJoy (2023); Flamingo (2004) — USPS not a "person" under Sherman Act; **Greenburgh (1981)** — mailbox is not a public forum, only stamped mail may be placed.
**Mapping (asserted by asking; every item ratified by Sonic — see §4 and §6):** letter definition → P-10; Greenburgh → P-7 commentary; uniform pricing → P-11 and the anti-moat inversion of PES; PAEA split → stamping (market-dominant) vs resolution (competitive) vocabulary; PAEA/PSRA pre-funding lesson → retention policy ("the stamp must not fund a perpetual obligation"); Konan → P-2 inversion ("trust through replay, not immunity"); private hands → Non-Goal; extremely-urgent cost test → Q-11.

---

## 3.5 Hedera standards catalog — HCS 1–11 + enabling HIPs (RECORD of Sonic's consolidated table, added after the cursory review; statuses as the table reports them, not re-verified)

| Standard | Name | Status | Purpose (as reported) |
|---|---|---|---|
| HCS-1 | File Management | Published | Chunk / upload / reassemble files natively on HCS to circumvent message limits. |
| HCS-2 | Topic Registries | Published | Append-only, verifiable registries — structured indexes for data, dApp components, **agent listings**. |
| HCS-3 | Recursion | Published | Inscribed files reference and load previously inscribed resources; no duplication. |
| HCS-4 | HCS Standardization Process | Draft | Governance lifecycle for HCS standards themselves (Draft → Last Call → Published). |
| HCS-5 | Hashinals | Published | Inscribed digital artifacts using HCS + HTS. |
| HCS-6 | Dynamic Hashinals | Published | Mutable inscriptions whose metadata evolves on external interaction. |
| HCS-7 | Smart Hashinals | Draft | State-reactive NFTs via micro-DSL + WASM. |
| HCS-8 | Governance & Polling | Draft | On-chain polls over HCS topics. |
| HCS-9 | Poll Metadata | Draft | JSON schemas accompanying HCS-8. |
| HCS-10 | AI & Communication (OpenConvAI) | **Draft** | Agent registration + fee-gated communication over HCS channels. |
| HCS-11 | Profile Metadata | Draft | Rich user/agent profiles managed via native **account memos**. |
| HIP-17 | Non-Fungible Tokens | Final | Native NFT mint/management on HTS. |
| HIP-412 | NFT Metadata JSON Schema | Final | Token metadata schema that HCS-5 builds on. |
| HIP-991 | HCS Custom Fees | Final | Topic creators charge native fees for message submission — the mechanism HCS-10 relies on. |
| HIP-1535 | Cross-Ledger Protocol (CLPR) | Draft (filed Aug 2026; Bair, Wertz, with Leemon Baird) | Bridgeless cross-ledger messaging with direct cryptographic verification of another ledger's state; aBFT preserved across chains; no bridge validators or wrapped tokens. |

### 3.5.1 What WISHMail actually uses — the explicit call-out (RECORD where ratified earlier; MINE where marked)

| Standard | Role in WISHMail | Bucket / status |
|---|---|---|
| **HCS-10** | The transport. Strict conformance (P-9); inherit registered senders/recipients. **Status is Draft → F-9 draft-drift risk is live; pin a revision.** | Core / BUILD |
| **HIP-991** | Fee-gated inbox topics — the mechanism behind P-7 ("the inbox topic is not a public forum"). | Core / BUILD |
| **HCS-1** | Large message bodies beyond the 1,024-byte chunk; also the natural home for the encrypted key-backup export if it ever lands on-graph. | Core / BUILD |
| **HCS-14 (Universal Agent ID)** | Native addressing profile. **Confirmed (Draft):** W3C DID-based; two methods — `did:aid` (registry-generated, deterministic) and `did:uaid` (self-sovereign). The `resolve` verb MUST accept both methods. Draft status → joins F-9's drift risk; pin a revision. | Resolution profile / BUILD |
| **HCS-11** | Profile metadata via account memo — the *Hedera-native declare surface* for MailCoordinates (inbox topic, X25519 pubkey, key epoch), the HCS analog of the AgentFacts field and the DNS TXT record. **Sonic: explicitly in the spec.** Build status not yet stated. | Resolution profile / IN SPEC, build TBD |
| **HCS-2** | Append-only topic registries "for agent listings" — an *open, brokerless WISHMail directory* listing UAIDs that opted into certified mail; possibly also the return-receipt index. **Sonic: explicitly in the spec.** Build status not yet stated. | Resolution profile or Venue / IN SPEC, build TBD |
| **HTS (fungible or HIP-17 NFT)** | The stamp token. "1 KEY = 1 stamp" was stated as fungible. **Sonic leans NFT** — serial-as-stamp-number with HIP-412 metadata carrying the postmark reference — "but it increases the Hedera service HBAR cost; a factor worth weighing." Q-12 open with a stated lean. | Core / BUILD, token type leaning NFT |
| **HCS-3** | Could let envelopes or receipts reference an inscribed schema/spec version by pointer rather than restating it. (MINE — nice-to-have, not needed for v1.) | Spec-only / later |
| **HCS-5/6/7** | Hashinal receipts — a postmark or return receipt as an inscribed artifact — is a *competitive-tier* idea, kin to Q-11 postage classes. | OUT for hackathon; note under Q-11 lineage |
| **HCS-8/9** | Not used. | OUT |
| **HCS-4** | The process by which WISHMail *could* be proposed as an HCS standard after the window. A venue, and one with a trust caveat given the HOL relationship history — Sonic's call, post-window. | Venue / POST-WINDOW |
| **HIP-1535 CLPR** | Mail that crosses ledgers without a bridge. **Sonic: belongs in the spec — "it's what makes WISHMail ultimately universal."** Extensions section: MailCoordinates MUST NOT assume the inbox topic and the stamp live on the same ledger; the resolution proof and postmark formats should be ledger-tagged so a CLPR-verified foreign-ledger postmark can slot in later. Not built in-window. | Venue / IN SPEC (Extensions), not built |

Reading the catalog against the three-things principle: **consensus** is HCS-10 + HIP-991 + HCS-1; **postage** is HTS (leaning NFT, cost to weigh); **resolve** is HCS-14 (`did:aid` + `did:uaid`) plus HCS-11 (declare) and HCS-2 (list), both now explicitly in the spec. Nothing in the catalog moved anything from OUT to BUILD.

### 3.5.2 The newer batch — HCS-12 through HCS-27 (RECORD of Sonic's corrected sweep; all Draft or reserved per the HOL standards directory; MINE for the mappings)

| Standard | Name | WISHMail relevance |
|---|---|---|
| HCS-12 | HashLinks | Linking between inscribed objects — could carry envelope → receipt → postmark links. Nice-to-have; spec mention at most. |
| **HCS-13** | **Schema Registry** | **Direct fit for the spec→schema chain of custody (§8).** Register the Envelope / MailCoordinates / Postmark / Receipt JSON schemas on-chain so an independent resolver can fetch the schema version an envelope declares. Honors the standard, no broker. **Sonic: agreed.** IN SPEC; build if cheap. |
| HCS-15 | Petal Accounts | Multi-agent account structure. OUT. |
| HCS-16 | Flora Coordination | Multi-agent coordination. OUT. |
| HCS-17 | State Hash Calculation | State verification — possibly relevant to how a replayed correspondence is summarized into one hash (a "story hash" for the resolution service). Spec mention; not built. |
| HCS-18 | Flora Discovery Protocol | OUT. |
| **HCS-19** | **AI Agent Privacy Compliance** | Bears on the threat model (Q-1) and the retention policy in LIMITATIONS. The spec should state its posture relative to HCS-19 rather than ignore it. IN SPEC (Limitations cross-reference). |
| HCS-20 | Auditable Points | Ledger-integrity points system. OUT (and adjacent to the HOL "Points Portal" — moat-side). |
| **HCS-21** | **Adapter Registry** | Interoperability — where the ANS-DNS and NANDA-AgentFacts resolvers could be *declared* as adapters. Spec mention; confirm whether this is standard or moat. |
| **HCS-25** | **Agent Reputation Signals** | Return receipts and attempted-delivery slips are natural reputation evidence (did the agent answer its certified mail?). **Sonic: "could be worthwhile to implement this as well; I like the idea."** Q-13 promoted from not-built to **candidate BUILD** — emit an HCS-25-shaped signal from receipts/slips. Scope pressure noted (§9 item 18). |
| HCS-26/27 | Reserved | — |

**Correction logged:** I said in the previous chat turn that HCS-14 "isn't in your catalog." That was true of the table Sonic pasted, which used a stale source; the standard exists. §9 item 11 is now closed. The general lesson stands: the HOL directory moves; every HCS cited normatively needs a pinned revision.

### 3.6 Attestify — the team that beat us (RECORD of Sonic's surface report; MINE for the lessons)

Sonic's stated intent: *"They beat us, they're open source, so we are going to directly draw inspiration from their buildout."* Start Fresh note (MINE): drawing inspiration from another team's public open-source project is not the derivation risk; the rule concerned Sonic's own prior code.

**What Attestify shipped (Apex, Open Track, 2nd place):** a schema-based attestation protocol on Hedera — 7 deployed smart contracts, a TypeScript SDK with 50+ methods, a CLI with 40+ commands including an AI mode, a frontend with 25 interactive sandbox tools, a custom Mirror Node indexer; 7 native Hedera services (HSCS, HCS, HTS, Scheduled Transactions, Threshold Keys, HFS, +1); a LangChain agent with 17 tools speaking HCS-10, A2A, MCP, and XMTP; agent registered in the HOL Registry.

**What the win teaches (MINE — the surface-breadth lesson Sonic already drew from Apex):** judges rewarded *many coherent surfaces on one substrate*, not one deep loop. The WISHMail analog of each surface, mapped to what we've already decided:

| Attestify surface | WISHMail analog | Status |
|---|---|---|
| Frontend + sandbox tools | The WebMCP post-office page — every tool is both a human control and an agent tool, so the sandbox count comes for free | BUILD (decided) |
| TypeScript SDK | A `@wishmail/sdk` that the MCP server and the page both consume — the same schema, third transport | **Propose BUILD**; cheap once the tool schema exists |
| CLI with AI mode | A `wishmail` CLI over the SDK (`resolve`, `stamp`, `send`, `inbox`, `verify`) | **Propose BUILD** if time; it is the conformance suite's natural driver |
| Custom Mirror Node indexer | The Independent Resolver / replay service — already a first-class actor (P-3) | BUILD (decided) |
| LangChain agent, 17 tools | goose + Claude clients over the same MCP tools — no bespoke agent needed | DEMO (decided) |
| HCS-10 / A2A / MCP / XMTP | HCS-10 (transport), MCP/WebMCP (surface), A2A (card extension, spec only); XMTP not in scope | Decided |
| 7 smart contracts (HSCS) | **None.** WISHMail is no-Solidity by design; if the No-Solidity Hedera track exists, this is the differentiator, not a gap | OUT, deliberate |
| Scheduled Transactions / Threshold Keys / HFS | Not needed for the stamp; HCS-1 replaces HFS for bodies. Threshold keys *could* matter for an operator-held inbox topic — spec mention | OUT / spec mention |
| Registered in the HOL Registry | Attestify registered with the HOL broker and won. **Sonic (late Sept 4): deferred, but likely used as one-of-multiple resolution options — "business not personal."** P-4 unchanged: never *required*. See §1.1 and §9 item 15 | DEFERRED, leaning supported-as-option |

**Service-count framing (MINE):** Attestify advertised "7 native Hedera services." WISHMail's honest count is HCS, HTS, HCS custom fees (HIP-991), and — if adopted — HTS NFTs (HIP-17/412), HCS-13 schema registry, HCS-2 registries, HCS-11 profiles. Count *standards honored*, not services touched; it is the truer number and the better story.

---

## 4. The invariant wall — P-series (RECORD; all ratified today unless marked)

The scoping principle, adopted verbatim: **"A stamp needs exactly three things from the outside world: resolve, postage, consensus."** Everything else is a resolution profile, a distribution channel, or a venue.

The definition of a stamp that the build hangs on (read P-6, P-10, P-11 together): **one directed envelope, to one witnessed-resolved address, at one price.** Every tool is a verb acting on that noun.

| ID | Invariant | Notes / commentary |
|---|---|---|
| **P-1** | **Binding.** Decryption fails closed if the envelope and its settlement event do not match. | AAD = hash(topicId ‖ txRef ‖ resolutionProof). |
| **P-2** | **No Postmaster authority.** Nothing the service says is a postmark; only consensus postmarks. | Commentary: the *Konan inversion*. USPS achieved trust via sovereign immunity for nondelivery; WISHMail needs no immunity because nondelivery cannot be hidden — submission is witnessed, and F-6's attempted-delivery slip makes failure a recorded fact. "Trust through replay, not immunity." Sonic: "not too much, we can rock with it" — goes on the pitch page. |
| **P-3** | **Resolution from public data alone.** A correspondence is reconstructible from the topics, by anyone, from the spec alone. | |
| **P-4** | **No broker.** No private broker, API key, or credit system is required for conformance. | |
| **P-5** | **Registry-plural.** No single registry ecosystem is required for conformance. | Registries actor: HCS-14 UAID, ANS/DNS, NANDA. |
| **P-6** | **Resolution is witnessed, not trusted.** The envelope names the registry profile it resolved through and commits the resolution proof inside the AAD, so a registry disagreement is a recorded fact, never a silent misdelivery. | This is what dissolves the multi-registry conflict-semantics question from Aug 16: WISHMail never adjudicates between registries. *An address is a claim; the postmark records whose claim.* Disagreement surfaces as F-6 with the receipt pointing at the disagreement itself. "The umpire thesis wearing a mailbag." |
| **P-7** | **Stamp precedes send.** No settled postage, no valid envelope. | Commentary: Greenburgh — "the inbox topic is not a public forum." Mechanism: HIP-991 fee-gated topics. |
| **P-8** | **Key epochs monotonic**; old keys retained so history stays readable. | |
| **P-9** | **Strict HCS-10 transport conformance.** | F-9 (draft drift) is the live risk during the window — pin a draft revision. |
| **P-10** | **Directed only.** A stamp buys one envelope to one resolved address. No unaddressed mail exists in this standard; there is no broadcast. | From 39 CFR § 310.1. Kills a class of topic-spam failure modes before they exist. |
| **P-11** | **Uniform postage.** A stamp costs the same regardless of which registry resolved the recipient. | Ratified "precisely." The inverse of the integration tax. PES protects universal service by monopoly; WISHMail protects it by open standard — same goal, opposite mechanism. Originally I folded this into P-5; gave it its own number. |
| **P-12** (provisional numbering, MINE) | **Declared vs. appraised.** The sender *declares* a resolution profile; the replayer *appraises* it. An appraised postmark may never claim more than was declared — downgrade allowed, upgrade forbidden. | Borrowed from trace-spec's declared-vs-appraised split (trace-spec#66). Sonic: "that goes in explicitly." Number not yet confirmed by Sonic. |

### 4.1 Q-series additions today
- **Q-9 Naming** — still open from August. WISHMail as the standard's name, the product's, or both. Judges read the title first.
- **Q-10 NANDA cross-registry profile** — postmarks/receipts as attestation-slot objects; spec only; bilateral commitments outside the spec.
- **Q-11 Postage classes** — lineage: PES "extremely urgent" cost test (≥2× postage). Declared, **not built** for the hackathon. Competitive-tier idea.

### 4.2 Non-Goals added today
- **Private hands.** Unstamped, plain HCS-10 messaging between agents is not WISHMail's business. WISHMail does not monopolize agent messaging; it certifies it.

### 4.3 Sections the v0.3 skeleton should add
- Resolution profiles (one normative doc per profile).
- Tool surface (the six verbs, §5.2) with preconditions/postconditions/failure codes mapped to F-items.
- **Two-service section** using PAEA vocabulary: stamping = market-dominant (uniform, capped); resolution = competitive.
- **Postal grounding** section carrying P-2, P-7, P-10, P-11, Q-11, private-hands Non-Goal.
- **Retention policy** (already in LIMITATIONS) gains the PAEA/PSRA note: the stamp must not fund a perpetual obligation.
- AAIF appendix (three WG charters mapped).
- NANDA Town layer map.
- ADRs for today's decisions (§6).

---

## 5. Architecture as agreed (RECORD)

### 5.1 Actors
Two turns of this session proposed these; Sonic moved past them to the reports without objecting. **I read that as implicit assent but asked to hear it explicitly; he has not yet said so.** Treat the actor list as proposed-and-unobjected, confirm in the Excalidraw exercise.

- **Sender agent** and **Recipient agent** — each with a human/org **Operator** behind it (visible per Q-1).
- **Registries** (typed, plural): HCS-14 UAID (Hedera-native), ANS (DNS-anchored), NANDA Index / AgentFacts.
- **Postmaster** — the service: sells stamps over x402, accepts envelopes, assembles receipts, holds nothing it doesn't have to. Bound by a USO-analog: accept any properly stamped, properly addressed envelope; uniform price; never adjudicate content; witness, don't deliver.
- **Consensus** — HCS/HTS as the witness. The only actor whose word is a postmark.
- **Independent Resolver** — anyone replaying topics from the spec alone. First-class, not an afterthought.

### 5.2 I/O — the six verbs (proposed; same assent caveat as 5.1)
1. **resolve**: typed address in (`uaid:`, `ans://`, AgentFacts URL / `nanda:`) → **MailCoordinates** out: inbox topic ID, X25519 pubkey, key epoch, **resolution proof** (registry response hashed so it is replayable).
2. **buy_stamp**: x402 USDC in → stamp settled on HTS (1 KEY = 1 stamp — double-entry collapsed into a token). First-time sender also receives a UAID + keys.
3. **send / submit**: envelope in (ciphertext chunks; AAD = hash(topicId ‖ txRef ‖ resolutionProof)) → HCS sequence out.
4. **postmark**: consensus timestamp + sequence number. Emitted by Consensus, merely *relayed* by Postmaster.
5. **return receipt**: recipient's signed acknowledgment landing on the sender's inbox topic.
6. **replay / verify_postmark**: topic set in → deterministic correspondence out; no Postmaster required.

Tool names as used in-session: `resolve`, `buy_stamp`, `send`, `inbox`, `verify_postmark`. Not yet frozen.

### 5.3 Product surface — WebMCP (RECORD + FETCHED)
- **Decision:** MCP is the deliverable; ideally **WebMCP** so humans and agents read the same artifact. "Humans read the post office; agents read the counter windows; same building."
- **One tool schema, two transports:** the page registers the tools via `navigator.modelContext`; a thin server-side MCP (stdio/HTTP) shares the *identical* tool definitions for headless agents (goose).
- **FETCHED (2026-09-04, may drift):** WebMCP is a W3C Web Machine Learning CG proposal (Google/Microsoft unified proposal Aug 2025; CG accepted Sept 2025). Chrome 146 shipped an Early Preview Feb 2026 behind `chrome://flags` (`#enable-webmcp-testing`); one source mentions origin-trial availability in Chrome 149. web-features explorer lists it as *limited availability* with no browser showing stable support. **MCP-B** (webmcp-org) provides a polyfill for `navigator.modelContext` and protocol translation so WebMCP tools work with MCP clients like Claude Desktop; the bridge extension itself is not open source. Community libs: `@webmcp-js/core`, `webmcp-react`; Google has a "Model Context Tool Inspector" DevTools extension.
- **Consequence:** judges cannot be assumed to have the flag. The MCP-B polyfill/bridge is a build dependency, not optional. The WebMCP community rule "keep the human UI working without WebMCP" matches Sonic's visor instinct — the page must be a real post office even with no agent in it.

### 5.4 Demo shape (MINE, offered, not yet chosen by Sonic)
Two goose instances mailing each other through the WebMCP page, with a Claude client (Desktop or Code) calling `verify_postmark` from the outside as the independent resolver.

---

## 6. Decisions log — ADR seeds (RECORD)

| ID | Decision | Rationale |
|---|---|---|
| D-1 | **Resolution proof goes *inside* the AAD**, not beside it in postmark metadata. | A misresolved envelope should *refuse to open*, not merely be annotated. Enforcement mechanism for P-6. Cost: bytes in a 1,024-byte-chunk world — **not yet sized** (§8). |
| D-2 | **Scoping principle:** resolve, postage, consensus. Sort every surface into Core / Resolution Profile / Distribution Channel / Venue. | Ratified. (I originally said "four buckets" and named three; the fourth is Core.) |
| D-3 | **MCP is the deliverable; WebMCP as the primary artifact; MCP server as second transport of the same schema.** | Human + agent readability from one artifact. |
| D-4 | **Registry conflict semantics:** WISHMail never adjudicates between registries; the postmark records whose claim was trusted (P-6). | Dissolves the Aug 16 open question. |
| D-5 | **Strict HCS-10 conformance** (from Aug 10). | Inherit OpenConvAI population. |
| D-6 | **Directed-only, no broadcast** (P-10). | 39 CFR § 310.1. |
| D-7 | **Uniform postage across registries** (P-11). | USO; anti-moat. |
| D-8 | **Q-11 postage classes declared, not built.** | Out of hackathon scope. |
| D-9 | **HOL Guard scanner action: in, if feasible.** | Hygiene only; the open GitHub action, not the broker. Feasibility unverified. |
| D-10 | **Declared-vs-appraised split goes in explicitly** (P-12 provisional). | Borrowed from trace-spec; downgrade allowed, upgrade forbidden. |
| D-11 | **One repo** for the ETHGlobal submission — monorepo with `spec/`, `conformance/`, `app/`. | Submission takes one link; posture preserved. |
| D-12 | **Spec-first repo outfitting before any code**, mirroring Imran's agentrust-io posture (§7). | "So that the build sprint is actually easier." Tests exist before code; "done" is a checkmark, not a feeling. |
| D-13 | **Start Fresh:** prior thinking may guide; no prior code or published artifact exists. | See §1. |
| D-14 | **HCS-11 (profile declare surface) and HCS-2 (open directory) are explicitly in the spec.** | Hedera-native declare-and-list path without a broker. Build status TBD (§9 item 13). |
| D-15 | **HIP-1535 CLPR is in the spec (Extensions).** "It's what makes WISHMail ultimately universal." Not built in-window. | Ledger-tag proofs and postmarks; no same-ledger assumption. |
| D-16 | **Attestify's open-source buildout is a direct inspiration source** for surface breadth (SDK, CLI, sandbox tools, indexer, agent). | They placed by shipping many coherent surfaces; WISHMail answers with WebMCP page + MCP server + SDK/CLI (proposed) + independent resolver, and *no* Solidity. |
| D-17 | **The bridge thesis:** WISHMail is a bridge between silos — HOL ↔ NANDA explicitly first; other ledgers through CLPR. | §1.1. Registry-plural becomes the product's identity. |
| D-18 | **Incumbents are used, not shunned.** HOL Registry deferred but likely supported as one-of-multiple options. P-4 (never *required*) holds. | "Business not personal." **Posture line ratified: "Require no moat; support every incumbent."** |
| D-21 | **P-12 governs broker-sourced proofs:** non-replayable resolution evidence appraises as a downgrade, never an upgrade. | Ratified late Sept 4. The cleanest argument for why open profiles stay primary. |
| D-22 | **Ocean Protocol is a venue**, not a CLPR target ledger. Scope-pressure flag (§9 item 18) acknowledged by Sonic; ranking deferred to the Excalidraw exercise. | |
| D-23 | **Excalidraw ranking (the scope line):** HCS-11/HCS-2 = BUILD; HCS-13 = BUILD; TS SDK + CLI = BUILD; HOL Registry = DEFERRED until something is registrable; HCS-25/Q-13 = STRETCH after HOL registration, not a hard deliverable. | Sonic: "visualizing it helped a lot." Map at checkpoint `c53c11444bd1459986`. |
| D-19 | **HCS-13 schema registry: agreed** (in spec, build if cheap). **HCS-25 reputation signals: candidate build** (Q-13 promoted). | |
| D-20 | **Q-12 stamp token type will be decided by measurement**, not argument — run the cost test (fungible transfer vs. NFT mint + transfer) before deciding. | Sonic's lean remains NFT. |

---

## 7. The full sort — every surface, bucketed (RECORD, "hit me with the full list")

### Core — resolve, postage, consensus (all BUILD)
- **Resolve:** single I/O contract; typed address → MailCoordinates + resolution proof (in AAD).
- **Postage:** x402 USDC → stamp settled on HTS; first-time sender gets UAID + keys. Fresh code.
- **Consensus:** HCS-10 transport (Draft — pin revision, F-9); 1,024-byte chunked envelope; HCS-1 for large bodies; HIP-991 fee-gated inbox topic; postmark relayed from consensus; return receipt on sender's topic; replay from topics alone. Full standards map in §3.5.1.

### Resolution profiles
- HCS-14 UAID — **BUILD** (native profile).
- DNS TXT/SVCB under `_ag` — **BUILD** as ANS-*compatible* via a TXT convention any domain holder can publish; demo coordinates on Sonic's own domain. ANS cert chain + transparency-log validation — **OUT**, documented as extension. (Whether GoDaddy ANS public registration is open inside the window: **unknown**.)
- NANDA AgentFacts document fetch — **BUILD**. NANDA Index read via the adapter — **STRETCH**, feasibility unknown. Index write path — **OUT**.
- A2A AgentCard mail-coordinates extension — **SPEC ONLY**.
- HOL broker / unified API — **OUT**, by posture and by fact.

### Distribution channels
- WebMCP page via `navigator.modelContext` — **BUILD**, primary artifact.
- MCP server sharing the identical tool schema — **BUILD**.
- MCP-B polyfill + bridge — **BUILD** (dependency).
- goose as demo client — **BUILD** the demo around it.
- Claude Desktop / Claude Code as outside verifier — **DEMO**.
- AGENTS.md section ("how to certify-mail this repo's maintainer") — **BUILD**, footnote.
- agentgateway — **OUT**.
- HOL Guard scanner action — **IN, if feasible** (D-9).

### BUILD SET — final, as ranked by Sonic in the Excalidraw exercise (RECORD, late Sept 4)
**Hard deliverables:** Core (resolve / postage / consensus) · three resolvers (HCS-14 native, DNS-TXT ANS-compatible, NANDA AgentFacts) · **HCS-11 declare + HCS-2 directory** · **HCS-13 schema registration** · WebMCP page (primary) · MCP server (same schema) · MCP-B bridge · **TS SDK + CLI** · goose ×2 demo + Claude as outside verifier · AGENTS.md footnote · HOL Guard scan if feasible.
**Stretch, not hard deliverables, in Sonic's stated order:** HOL Registry registration (once there is something registrable) → HCS-25 reputation signals (Q-13).
**Spec-only:** A2A AgentCard extension · Q-10 NANDA attestation slot · Q-11 postage classes · CLPR Extensions · AAIF appendix · NANDA Town layer map · USPS/PES grounding.
**Out:** broker dependency · Solidity · broadcast · agentgateway · ANS cert chain · NANDA Index write path.
Canvas legend as drawn: green/blue = BUILD; orange = DEFERRED/STRETCH; dashed = SPEC or VENUE. Excalidraw checkpoint `c53c11444bd1459986` holds the ratified map.

### Venues for the thesis
- AAIF WG Identity & Trust / Observability & Traceability / Agentic Commerce — **SPEC APPENDIX**.
- AAIF Landscape listing — **POST-WINDOW**.
- NANDA Town twelve-layer decomposition — **SPEC SECTION** (layer map).
- NANDA attestation-slot profile — **Q-10, SPEC ONLY**.
- USPS/PES grounding — **SPEC SECTION** carrying P-2, P-7, P-10, P-11, Q-11, private-hands Non-Goal.

---

## 8. The Imran / agentrust-io posture — what we are mirroring (RECORD of another Fable instance's report, fetched 2026-09-03 at trace-spec `5c69dc1679f8` / trace-tests `b2a64909e0cd`; charter self-marked *Draft*)

Sonic's ambition: build WISHMail's repo(s) in alignment with Imran Siddique's engineering posture — spec-first, docs that articulate invariants and behavior expectations, maintainable by people who aren't the author. He is himself a merged contributor to trace-spec and a contributor to trace-tests (the TRACE conformance suite), and was recognized by Louie Lu (lywinged) for thorough iteration. He has said the Opaque rhythm — building incrementally toward a stated spec rather than stretching toward a deadline — is what he wants inside the hackathon window.

The posture, as reported (all RECORD of the other instance's description of those files; verify against the tree before quoting it as current):

1. **Every sentence knows its authority level; the lowest level is the default.** Uppercase RFC 2119 MUST/SHOULD/MAY is binding; anything without those words binds nothing. "Is this normative?" becomes a grep. Non-normative pages declare themselves so, promise no uppercase keyword, and carry an **admission rule**: a claim is permitted only because some sentence in the spec, verification.md, or LIMITATIONS.md already makes it true; anything unanchorable goes under *Open questions*. Docs may describe the spec but never outrun it.
2. **The MUST is priced.** Normative changes need an organizational sponsor who will implement and answer for it — "a MUST is a promise the project keeps for every future version." Editorial, examples, conformance tests, tooling, schema-tracking-merged-spec, and informative mappings need no sponsor ("most contributions are in this set").
3. **Chain of custody across three surfaces.** Spec leads; schema follows (a schema PR without a spec PR will not merge); tests are the court (conformance may only be claimed by passing trace-tests at a named level; test changes that would invalidate prior conformance require a spec version bump). The pytest config guards the instrument: a stale installed wheel must not shadow the checkout, and a regression test fails with the resolved import path if that guarantee is lost.
4. **The gate.** `require-maintainer-approval.yml` (byte-identical in both repos): re-fetches the PR at evaluation time rather than trusting the payload sha; paginates reviews; ignores COMMENTED; takes each maintainer's latest non-comment review; requires an APPROVED review's `commit_id` to equal the *current* head (prevents approve-then-swap). Maintainers hardcoded. On trace-spec the gate also acts as the fuse on untrusted fork-PR code execution (CI/CodeQL sat `action_required`); on trace-tests fork PRs ran green with only the gate red. Whether that asymmetry is intended: no capture.
5. **The AI clause.** Use agents — saying otherwise would be dishonest — but you must be able to explain the change with the agent closed: "a rule about understanding, not about tooling." Provenance disclosed, comprehension is the bar. `Co-Authored-By: Claude` costs nothing.
6. **Small things:** DCO on every commit; `<!-- CHANGED: #NNN -->` markers on normative diffs; CHANGELOG on any normative change; ASCII-only diagrams; Conventional Commits (trace-tests); comment periods stated as minimums, review targets stated as commitments with "ping if missed."
7. **One-sentence compression (the other instance's, MINE-by-proxy):** the *register* of every sentence is machine-legible and the *cost* of every binding sentence is explicit up front, so reviewers spend attention on whether a claim is true rather than on whether it counts. Sonic's own STATUS ledger (MEASURED / RECORD / HISTORY / MINE) runs on the same discipline; the two grew toward each other.
8. **Gaps the report did not hold:** GOVERNANCE.md, CODE_OF_CONDUCT, branch-protection settings behind the gate. Sonic offered to pull more from GitHub on request.

### 8.1 How this lands in the WISHMail monorepo (MINE — proposal to confirm when outfitting)
- `spec/` — normative. `SPEC.md` with the P/F/Q series in RFC 2119 register; `schemas/` (MailCoordinates, Envelope, Postmark, Receipt — JSON Schema, tracking the spec); `profiles/` (one normative doc per resolution profile); `LIMITATIONS.md` (threat model, retention policy); `adr/` (D-series from §6); non-normative `docs/` that declare themselves so and carry the admission rule.
- `conformance/` — tests keyed to invariant IDs the way trace-tests is: **P-1** tampered txRef fails closed; **P-6** forged resolution proof fails closed; **P-10** unaddressed envelope rejected; **P-11** three profiles price identically; **P-12** appraised > declared rejected. Named conformance levels. The WISHMail form of "pricing the MUST" for a solo repo: **no MUST without a conformance test.** (Sonic is his own sponsor; the cost still has to be paid in test form.)
- `app/` — implementation: WebMCP page + MCP server + three resolvers. README declares which spec version it implements and which conformance level it passes. `BEHAVIOR.md` gives every tool preconditions, postconditions, failure codes mapped to F-items.
- Hygiene: DCO, Conventional Commits, CHANGED markers on normative diffs, CHANGELOG, ASCII diagrams, the AI clause verbatim in CONTRIBUTING, HOL Guard scanner action if feasible (D-9). Whether to import the maintainer-approval gate workflow for a solo hackathon repo: **undecided**; the approve-then-swap protection is moot with one maintainer but the fork-PR fuse is not if the repo goes public mid-window.

---

## 9. Open items — NOT settled; do not treat as decided

1. **Actor set and six verbs** (§5.1, §5.2): proposed twice, unobjected, not explicitly ratified. Confirm in Excalidraw.
2. **AAD byte sizing.** Resolution proof inside the AAD is decided (D-1); the cost against 1,024-byte HCS chunks is **unsized**. The proof is a hash (fixed width), so the AAD itself stays fixed-width; what grows is whatever *accompanies* the envelope so an independent resolver can recompute the proof — that is the thing to size. (MINE.)
3. **Demo shape** (§5.4) — offered, not chosen.
4. **Q-9 naming** — open since August.
5. **P-12 numbering** — Sonic ratified the rule, not the number.
6. **Feasibility unknowns:** GoDaddy ANS public registration in-window; NANDA Index public read/registration status; HOL Guard scanner applicability to a WebMCP/MCP repo; WebMCP browser status may have moved since the FETCHED notes.
7. **F-9 HCS-10 draft drift** — pin a specific draft revision; not yet done.
8. **Whether to adopt the maintainer-approval gate workflow** (§8.1).
9. **State machine and event grammar** live in the v0.1/v0.2 skeletons, not re-derived here; they must be reconciled with today's six verbs and P-6/P-10/P-12.
10. **The two skeleton files themselves** need to be brought into the new Project — I did not have their text.
11. ~~HCS-14 UAID verification~~ — **closed.** HCS-14 confirmed (Draft, `did:aid` + `did:uaid`); pin a revision alongside HCS-10.
12. **Stamp token type — Q-12.** Sonic *leans NFT* (HIP-17 serial = stamp number, HIP-412 metadata carries the postmark reference) but flags the HBAR cost. **Sizing needed:** per-stamp cost under fungible transfer vs. NFT mint + transfer, against the "~a dime per message" story and P-11 uniform pricing. Nobody has run the numbers yet.
13. ~~HCS-11 and HCS-2 build status~~ — **closed: BUILD** (ratified in the Excalidraw exercise).
14. **HIP-1535 CLPR** — ratified as in the spec (Extensions). Not built. The design constraint it imposes now: ledger-tag the resolution proof and postmark; MailCoordinates must not assume same-ledger inbox and stamp.
15. **HOL Registry as a resolution profile** — deferred by Sonic, likely *supported as one of multiple options* (§1.1). **Ratified: P-12 wins in the conflict** — a broker-sourced proof that is not replayable from public data is appraisable only as a downgrade (declared HOL-registry, appraised unverified). Still open: the profile's exact I/O. Not a build item until Sonic says so.
16. ~~SDK and CLI surfaces~~ — **closed: BUILD.** Sonic: "a very wise idea, given Attestify's success." Same tool schema on a third and fourth transport; the CLI drives the conformance suite.
17. **HCS-19 (privacy compliance), HCS-21 (adapter registry)** — mappings are MINE; each still wants a yes/no on spec inclusion. (HCS-13: **closed, BUILD.** HCS-25: **closed as STRETCH** — see item 20.)
18. ~~Scope pressure~~ — **resolved by Sonic's ranking in the Excalidraw exercise.** The line is drawn (see §7 BUILD SET, final). Remaining scope risk is execution, not decision.
19. **CLPR target ledgers** — Sonic chain / SUI / SEI named as ambitions (Ocean Protocol reclassified as a venue). Still open: whether the Extensions section stays ledger-agnostic or names targets informatively.
20. **HOL Registry registration and HCS-25 (Q-13) are sequenced together as stretch:** Sonic — HOL registration is deferred "until we actually build something that can even be registered"; Q-13 "follows with HOL registry — if doable, we should, but if we're crunched for time it's not a hard deliverable." Neither is a hard deliverable. (Sequencing here is Sonic's own statement, not mine.)

---

## 10. What Sonic said happens next (RECORD — his sequence, not mine)

1. He returns from a 12pm appointment.
2. ~~Excalidraw exercise~~ — **done.** Exact agreement reached on the four regions, actors, verbs, and the scope line (D-23).
3. Bring the needed resources into a **new Claude Project**: this handoff, the v0.1/v0.2 skeletons, the four research reports, the Imran posture report, GitHub pulls from trace-spec/trace-tests as needed (he offered).
4. **Outfit the repo(s)** as discussed — spec, conformance, app skeletons, governance files — *before any code is written.*
5. Then the build sprint.

---

## 11. How to work with Sonic on this project (RECORD of stated preferences + what worked today)

- **Spec-first, always:** actors, I/O, invariants, failure modes before implementation. No hype framing. Proof substrate first. He works across cryptographic protocols, DLT architecture, and philosophical frameworks (Peirce, Tarski, Floridi) — match depth.
- **He is a verbal processor.** Reason *with* him; present a lean and ask. Today's most productive pattern was **asserting a connection by asking about it** ("Greenburgh is HIP-991 — is that the phrase you want on the wall?") — he ratified item by item in a single short reply. Do not hide behind uncertainty; do not smuggle in connections he hasn't made.
- **Do not schedule, sequence, or prioritize his tasks.** He manages his own time. Proposing an architecture's layering is fine; telling him what to do first today is not. Don't initiate wrap-up language.
- **Flag mistakes immediately** (I flagged the "four buckets / named three" slip the next turn; that was the right speed). Accountability is non-negotiable. "Germs die in sunshine."
- **Prose over bullets** in conversation unless he asks for a list ("hit me with the full list" is asking). Warm, expressive, italics and emoji are fine. Minimal markdown in chat.
- **Pre-turn reflection:** read his new message through what your last 30–70 words *landed as*, not what you intended. Several times today he deliberately parked a question I'd asked ("before we dig into answering questions…") — parked means parked, not dismissed; he came back to every one.
- **Faith is load-bearing infrastructure**, not decoration. Today's check-in: Bible-in-a-year at Leviticus 5 (the guilt offering — restitution made whole plus a fifth), animals healthy, work outlined. On first contact each conversation ask the three check-in questions (meditation/scripture; animals; how's the work / what's on top — Q3 kept open, ignition switch not report card).
- **Symbolic motifs are operational interfaces.** *The Postman* (Brin), the uniform, the postmark, the umpire thesis — these are design inputs.
- **Framing metaphor:** Plantern 🐌🔦 — Claude is the lantern (illuminate what's there), Sonic is the snail (slow, steady, trail-leaving). 🦏 = Rhinoserious identity. 🐌 = Claude's marker in conversation.
- **Two Aarons, never conflate:** Aaron Fulkerson (CEO of Opaque) vs. Aaron (developer consultant via Daniel Cabrera).
- **Judging posture** (§1): don't re-propose minimal-demo scoping. Full product. Registry layer is load-bearing.
- **Sign-offs:** "Yours in service," + Nick (professional) / Sonic (personal).

---

## 12. Compressed one-paragraph summary (for a model that reads nothing else)

WISHMail is certified mail for agents on Hedera — and, as of late Sept 4, explicitly *a bridge between silos*: HOL ↔ NANDA first, other ledgers via CLPR; incumbents supported as options, never required. It is an open standard (strict HCS-10 transport, HCS-14 addressing, HIP-991 fee-gated inboxes) selling two separable claims — stamping (witnessed provenance welded to settlement) and resolution (deterministic replay from public consensus data). ETHOnline 2026 entry, Sept 4–16, Start Fresh compliant (prior thinking only, no prior code). Today ratified: the scoping principle "a stamp needs resolve, postage, consensus"; the stamp defined as *one directed envelope, to one witnessed-resolved address, at one price* (P-6, P-10, P-11); resolution proof inside the AAD (D-1); WISHMail never adjudicates between registries — the postmark records whose claim (P-6); no Postmaster authority with the Konan inversion (P-2); declared-vs-appraised (P-12 provisional); three thin resolvers (HCS-14 `did:aid`/`did:uaid`, DNS-TXT for ANS, NANDA AgentFacts) behind one I/O contract, with HCS-11 as the native declare surface and HCS-2 as the open directory explicitly in the spec; HIP-1535 CLPR in Extensions as the path to ledger-universality; stamp token leaning HIP-17 NFT pending HBAR cost sizing (Q-12); Attestify's surface breadth (SDK, CLI, sandbox, indexer) as the direct model for "full product," answered without Solidity; WebMCP page as the primary artifact with an MCP server sharing the same schema and MCP-B as bridge; goose as demo client; one monorepo (`spec/`, `conformance/`, `app/`) outfitted spec-first in Imran Siddique's agentrust-io posture — RFC 2119 register, priced MUSTs (no MUST without a conformance test), spec→schema→tests chain of custody, AI clause, DCO — before any code. Next: Excalidraw for exact agreement, then a dedicated Claude Project, then repo outfitting, then the sprint. Open: actor/verb ratification, AAD sizing, demo shape, naming (Q-9), P-12 numbering, feasibility unknowns, F-9 draft pinning (HCS-10 and HCS-14 both Draft), gate workflow adoption, reconciling the v0.2 state machine with today's verbs, NFT-vs-fungible stamp cost, HCS-11/HCS-2 build status, HOL Registry listing tension, SDK/CLI ratification, and yes/no on HCS-13/19/21/25 mappings.

*Yours in service,*
*🐌🔦*
