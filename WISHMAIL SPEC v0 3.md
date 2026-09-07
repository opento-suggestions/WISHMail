# WISHMail — Spec v0.3 (Consolidation Ledger)

**Date:** Friday, 2026-09-04 (ETHOnline 2026, Day 1)
**Status:** HISTORICAL LEDGER. Non-normative. Consolidates Spec Skeleton v0.1 (2026-08-10), Spec Skeleton v0.2 (2026-08-10), the Session Handoff of 2026-09-04, and the decisions of the Project session later the same day. **Nothing in this document binds.** It exists so that v0.4 — the authoritative, indicative-register, RFC 2119 specification of *what WISHMail is* — can be written against a single complete record with every brick's provenance visible.
**Placement:** lives in the Claude Project only. Not committed to the repo (Sonic, 2026-09-04: clutter; the build and the spec are not the same artifact). The video may tell the story of "why we arrived on day one with a v0.4 spec."
**Supersedes:** v0.1, v0.2, and the handoff *as sources for v0.4*. It does not delete them; it accounts for them.
**Author:** Claude Fable 5.1, in session with Sonic (Nick Altemeyer).

*The uniform did the work before the infrastructure existed.*

---

## 0. Register and reading order

**Register convention** (Sonic's STATUS ledger; trace-spec posture): **RECORD** = Sonic said or ratified it, with date. **FETCHED** = pulled from the web; may drift. **MINE** = Claude's inference, lean, or proposal; not a decision. Every table row and paragraph below carries one of these, explicitly or by section heading. MINE is never presented as RECORD.

**Reading order for the v0.4 author:** §2 (posture) → §3 (the proof primitive) → §4 (actors) → §5 (tools) → §10 (invariant wall with concordance) → §11 (failure modes) → §12 (open questions) → §13 (decisions) → §18 (what v0.4 must contain) → §19 (open items). Everything else is supporting record.

**ID namespaces:** **P-** invariants · **F-** failure modes · **Q-** open questions · **D-** decisions. Chosen in v0.1 to avoid collision with Witness Required (W-series) and the Ontologic Coprocessor spec (I-series, A-/B-series).

---

## 1. Corrections to the record (RECORD of what the files actually say; logged before anything else)

1. **The handoff misdescribed v0.2.** Handoff §2.5 states v0.2 added "Registries actor + Q-10 (NANDA profile)." The v0.2 text contains neither; the v0.1→v0.2 diff shows only: §2.7 strict HCS-10 conformance, threat model into §6, Q-1/2/4/5/8 closed, F-6 reframed, F-9 added, HIP-991 first-contact note in §4.1, retention policy added to LIMITATIONS, `REQUESTED` pre-state added to §7. The Registries actor (typed, plural) and Q-10 originate in the **2026-09-04 handoff session**, not in v0.2. Corrected here.
2. **Both skeletons are dated 2026-08-10**, not Aug 10/11 as the handoff says.
3. **The handoff's D-series is out of order** (D-21, D-22, D-23 appear before D-19, D-20). IDs are unchanged; order is repaired in §13.
4. **The Ontologic whitepaper file in the Project is a zip archive** (15 page JPEGs + 15 text files), not a PDF, despite the `.pdf` extension. Content read in full; file should be re-exported before it goes anywhere a PDF reader is expected.
5. **v0.2 §7 "Webhook events mirror transitions"** describes a push component; v0.2 F-7 and §2.4 exclude push from v1. Tension logged as open item 19.10; not resolved here.
6. **Sponsor actor / sponsored genesis** (v0.2 §3, §4.2, §5) does not appear in the ratified actor set (§4). Logged as open item 19.11; not resolved here.
7. Earlier corrections already logged in the handoff and carried: "four buckets / named three" (D-2); "HCS-14 isn't in your catalog" (false; §9 item 11 closed).

---

## 2. Thesis and posture (RECORD; consolidated)

### 2.1 Thesis (v0.2 §1; handoff §2.1)
Certified mail for agents. Explicitly *not* Signal: no forward-secrecy claim; history is intentionally decryptable. The standard sells two claims, separately:

- **Origin — stamping:** witnessed provenance of an entity's statement, welded to its settlement event via txRef/AAD binding.
- **Story — resolution:** deterministic reconstruction of a correspondence from public consensus data alone. Replay, not push; this dissolves the uptime liability.

The receipt is the product. Mail is a trust institution; the postmark is the uniform. Brin's *The Postman* is the attached motif.

### 2.2 The bridge thesis (handoff §1.1, RECORD late 2026-09-04) — the headline
WISHMail is a bridge between silos: HOL ↔ NANDA explicitly first; other ledgers via CLPR. Registry-plural is the product's identity, not a defensive property. Sonic: *"The product **is** plural registries."* Posture line ratified verbatim: **"Require no moat; support every incumbent."** Incumbents are used, not shunned — *"business not personal"* — but no broker may ever be *required* for conformance (P-4 holds unchanged).

### 2.3 Design posture (v0.2 §2, reconfirmed 2026-09-04)
1. Honor the standards, ignore the moat. 2. Certified mail, not Signal. 3. Affidavit, not gate. 4. Replay, not push. 5. Never hold the soul. 6. Token-as-ledger (1 credit = 1 stamp, burned on use). 7. Strict HCS-10 conformance — WISHMail defines only what rides *inside* (sealed envelope as a `data` payload convention on `message` operations) plus the certified layer (stamping, postmarks, return receipts, resolution). No transport of our own invention.

### 2.4 The scoping principle and the definition of a stamp (handoff §4, RECORD)
*"A stamp needs exactly three things from the outside world: resolve, postage, consensus."* Everything else is a resolution profile, a distribution channel, or a venue (four buckets: Core / Resolution Profile / Distribution Channel / Venue — D-2).

**A stamp is one directed envelope, to one witnessed-resolved address, at one price** (P-6, P-10, P-11 read together). Every tool is a verb acting on that noun.

### 2.5 Start Fresh (handoff §1, RECORD)
Nothing was published or built before the window. The rule bites on code and public project artifacts, not on prior thinking. Prior thinking (v0.1/v0.2, the Ontologic paper of 2026-05-31, the coprocessor spec) may guide; prior code may not. The build originates in-window; the build's own version numbering starts at v0.1 when it begins, independent of the spec version (Sonic, 2026-09-04: "I'm assuming").

### 2.6 Judging posture (handoff §1, RECORD)
Full product is the judging posture (Attestify/Apex lesson). The registry / resolution layer is load-bearing. Do not re-propose minimal-demo scoping.

---

## 3. The proof primitive — RIOM (RECORD 2026-09-04 where marked; paper summarized; MINE where marked)

### 3.1 Source
*The Ontologic Protocol — A Primitive for Deterministically Verifiable Proof-of-Reasoning*, N. Altemeyer, Ontologic Reclamation Group, 2026-05-31. Companion: *Ontologic Coprocessor Architecture Specification* Draft v0.2 (2026-07-20; v0.1 carried verbatim), and *The Witness Ladder* positioning note (2026-06-23). All three are prior thinking; the paper is published and citable.

**The primitive:** `morpheme = h(R ‖ I ‖ O ‖ M)` — Rule, Input, Output, Meaning, sealed in one hash, deterministically replayable by any third party, witnessed on a hashgraph consensus topic. R commits the binding to a Level of Abstraction (Floridi): whatever R is silent on does not belong to the morpheme. M is the reasoner's *declaration* of meaning plus a canonical URI by which the morpheme is located in the semiotic chain. Two verifications: **syntactic** (recompute from R and I; check the hash) and **semantic** (dereference M's URI; confirm the attestation the consensus chain recorded). *The protocol guarantees the record, not the referent. The attestation is guaranteed truthful; what's attested is not guaranteed true.* Authority is bestowed by witnesses, not asserted by the reasoner. Affidavit, not brain scan.

### 3.2 WISHMail is RIOM applied to agentic correspondence (RECORD, Sonic 2026-09-04: "RIOM is universal, and this is an implementation into agentic correspondence")

**Three morphemes, each consuming the prior** (RECORD: "You caught it. That's the shared shape."):

| Morpheme | R | I | O | M |
|---|---|---|---|---|
| **Resolution** (`resolve`) | the resolution-profile rule, pinned revision (e.g. HCS-14 → HCS-11 → coordinates) | the typed address + the registry's canonical response bytes + query time | `MailCoordinates` | "these are the certified-mail coordinates of X under profile P" + canonical URI |
| **Postmark** (`send`, witnessed by Consensus) | the WISHMail send rule at spec version v | the resolution morpheme hash + stamp `txRef` + ciphertext digest | the consensus receipt (topic, sequence, timestamp) | "an envelope was directed to X; postage paid" + HCS message URI |
| **Return receipt** (`ack`) | the ack rule | the postmark morpheme hash | the recipient's signature | "opened" + URI |

Resolution → postmark → receipt is the paper's §7 chain (Fig. 1 → Fig. 2 → Fig. 3): each binding consumes the prior's output as its input. A correspondence *is* a chain of morphemes; `verify` walks the chain. (Field breakdown per row is MINE; the three-morpheme shape is RECORD.)

### 3.3 The AAD is the binding, literally (RECORD: "Yes!")
Prior: `AAD = hash(topicId ‖ txRef)` (v0.2 P-2). Handoff D-1: `hash(topicId ‖ txRef ‖ resolutionProof)`. **Now:** `resolutionProof` *is* the resolution morpheme — `AAD = hash(topicId ‖ txRef ‖ h(R‖I‖O‖M)_resolve)`. A misresolved envelope refuses to open (P-1, P-6).

### 3.4 "Decompiler built in" — the item-2 resolution (RECORD; mechanism confirmed by Sonic 2026-09-04)
Sonic (2026-09-04): *"we use RIOM and make morpheme hashes, with the decompiler built in when using our application. It'll likely live in the schema as a field."* Confirmed: the envelope carries the morpheme hash and M's canonical URI as schema fields; the **manifest** (R pointer, I canonical bytes or digest, O, M) lives behind the morpheme proof hash and is **dereferenced, not carried** — by any verifier, and by our own tool as well (Sonic: "manifest is dereferenced, lives in the morpheme proof hash, and is dereferenced (by our tool as well)"). The handoff's sizing question ("what accompanies the envelope so a stranger can recompute") dissolves into "is I dereferenceable from public data": for HCS-14/HCS-11 a mirror-node URL (replayable indefinitely); for DNS an answer replayable while the record stands; for a broker response, not dereferenceable without a key. By-reference only; no in-band manifest transport (item 16 closed).

### 3.5 P-12 is B-1 + B-2 (RECORD: "P-12: agree")
Declared-versus-appraised is the coprocessor spec's **Invariant B-1 (Declared witness strength)** and **B-2 (statusProfile orthogonality)** instantiated for mail. Each resolution profile carries a **trust class** (coprocessor §3.1 taxonomy: `math` / `economic-game` / `hardware-TEE` / `social-committee`); a resolution that cannot be re-obtained carries a **statusProfile** entry (`missing` / `vague` / `blurred` / `stale` / `timed-out` / `withheld`). "Appraised never exceeds declared" = a verifier cannot climb higher on the witness ladder than the I lets them. Witness-ladder vocabulary: public HCS = terminal disinterestedness; a registrar = interested party; a broker = self-witnessed. Per-profile class assignments (MINE, to confirm in v0.4): consensus-public resolution near `math`; DNS and AgentFacts near `social-committee`; broker-sourced `social-committee` with statusProfile `withheld`.

### 3.6 The Postmaster's trust class (RECORD: "let's name the Postmaster's trust class explicitly")
The Postmaster is a **courier** in the coprocessor §3.1 sense: trust class `math`, transports bytes, attests nothing, blast radius **delay only** — cannot forge a postmark. This is P-2 (relays, never mints), P-13 (never hold the soul), and P-4 (no broker) in one sentence. The *sender's SDK* is the reasoner; Consensus is the witness. v0.4 states this explicitly.

### 3.7 F-6 is I-4 (RECORD: "If it's the same sentence, we should bring it forward")
The attempted-delivery slip is an **absence morpheme** (coprocessor I-4: "Expiry is not silence... the system attests what it could not see"). statusProfile `timed-out`. Absence is published; absence carries no negative claim about the recipient. F-6 text rewritten in §11 with this sentence brought forward.

### 3.8 The ack is captioned testimony (MINE, offered; not contradicted)
Coprocessor I-8: the subject binds into I, so a proof re-worn under another subject is *unconstructible*. The envelope's postmark hash binds into the receipt's I; a receipt cannot be re-worn for a different envelope. F-11 (binding mismatch) is therefore closed by construction, and "you cannot ack what did not bind" is an invariant, not a courtesy.

### 3.9 Mandate lineage (RECORD: "orange at best")
Coprocessor I-9 maps onto HCS-10's operator-for-agent pattern (an operator submitting on an agent's behalf is delegated authority; a `mandateHash` in M is the ledger-native form of the HOL Guard trust ladder). SPEC mention at most; STRETCH ceiling; not a deliverable.

### 3.10 Vocabulary posture (RECORD)
*"WISHMail can use morpheme / morpheme proof colloquially, referencing the paper. Ideally we keep it there but this isn't an advertisement for the protocol. It's a demonstration. So if we have to make it more 'legible' for the average user, we should."* Consequence for v0.4: normative text uses the postal words — resolution proof, postmark, return receipt, attempted-delivery slip — and a glossary maps each to its morpheme with the paper as an **informative reference** (RECORD: "So is the informative reference"). A reader who never opens the paper still understands the spec.

---

## 4. Actors (RECORD; ratified 2026-09-04 in the Excalidraw exercise and confirmed verbally in the Project session: "I'm good with the actor set and the six verbs")

| Actor | Role | Notes |
|---|---|---|
| **Sender agent** | originates an envelope | its SDK is the *reasoner* that binds |
| **Recipient agent** | UAID-addressed; its lanes receive envelopes | holds its own keys (P-13) |
| **Operator** (human/org behind each agent) | visible per the threat model | "the right to open mail is the right to open mail" |
| **Registries** (typed, plural; external, read-only) | HCS-14 UAID (Hedera-native) · ANS / DNS · NANDA Index / AgentFacts · HOL Registry (deferred; supported as one-of-multiple, never required) | P-5; each is a resolution profile with a declared trust class (§3.5) |
| **Postmaster** (the service) | sells stamps over x402, accepts envelopes, relays postmarks, assembles receipts on request; holds nothing it doesn't have to | **trust class: courier / `math`; blast radius delay-only** (§3.6). USO-analog: accept any properly stamped, properly addressed envelope; uniform price; never adjudicate content; witness, don't deliver |
| **Consensus** (HCS/HTS) | the witness | the only actor whose word is a postmark (P-2) |
| **Independent Resolver** | anyone replaying topics from the spec alone | first-class, keyless, brokerless (P-3, P-4) |
| *Payment networks* (external) | x402 facilitator; USDC and HBAR legs | P-16 lane equality |

v0.2's **Sponsor** actor and *sponsored genesis* surface are not in the ratified set — open item 19.11.

---

## 5. The six tools (RECORD of the surface as agreed 2026-09-04; field-level detail MINE unless marked)

**Substitution ratified:** *postmark* is not a tool anyone calls — it is Consensus's output, relayed by `send` (P-2). The sixth tool is **`ack`**, the recipient's return receipt. Tool names: `resolve`, `buy_stamp`, `send`, `inbox`, `ack`, `verify`. (Handoff's `verify_postmark` → `verify`; MINE shortening, not yet frozen — Q-9 adjacent.)

**Decisions applied in the table (all RECORD 2026-09-04):** ack lands on the **connection topic (the lane)**, not the sender's inbound topic (corrects handoff §5.2 item 5) · return receipt is a **sender-paid option at `send`**; base is blind delivery; the recipient pays nothing to ack · `send` **blocks until SETTLED** ("our tool should wait to make sure it functions properly"; no non-blocking mode was recorded) · metering: only `buy_stamp` is priced by spec; `verify` as a verb is free forever; a narrative-assembly *service* may charge (PAEA split) · multi-profile `resolve` returns a **set, never a verdict**; the sender chooses and declares; the reference implementation is baseline by default and configurable.

| Tool | In → Out | Preconditions | Postconditions | Failure codes → F/P |
|---|---|---|---|---|
| **`resolve`** | typed address (`did:aid` / `did:uaid` / `ans://` / `nanda:` or AgentFacts URL / HCS-11 memo lookup), optional profile list → `MailCoordinates` {inboxTopic, x25519Pub, keyEpoch, profile, resolutionProof (morpheme hash + M URI), trustClass, statusProfile, ledgerTag} | address parses to a supported profile. **No stamp, no Postmaster, no credential** (P-4) | proof replayable from public data where the profile allows; multi-profile → set, sender declares (P-6). Broker-sourced / non-replayable → returned *tagged*, appraisal capped (P-12) | `RESOLVE_UNSUPPORTED_PROFILE` · `RESOLVE_NOT_FOUND` · `RESOLVE_UNREACHABLE` → **F-10** · `RESOLVE_PROOF_NONREPLAYABLE` (warning) → P-12 |
| **`buy_stamp`** | x402 payment (USDC leg), count → `StampReceipt` {stampId, txRef, ledgerTag, price} | payment settles. First-time sender: UAID + keys generated **client-side**, public half submitted (P-13) | stamp settled on HTS in sender's custody, **unaddressed** (direction happens at `send`, P-10). Price identical regardless of eventual profile (P-11) | `PAY_FAILED` · `STAMP_ORPHANED` → F-3 |
| **`send`** | stampId, `MailCoordinates`, payload, options {returnReceipt} → `SubmissionReceipt` {topicId, seq[], consensusTs[], txRef, aadHash, postmark, schemaRef (HCS-13)} | stamp settled *and unspent* (P-7); coordinates present with proof (P-10); keyEpoch current or explicitly overridden; first contact → HCS-10 handshake complete **or** `send` emits `connection_request` and returns the attempted-delivery slip (F-6). AAD per §3.3. >1 KB via HCS-1 HRL. If `returnReceipt`, sender funds the receipt (Q-14 mechanism) | **blocks until SETTLED**; chunks on the connection topic; stamp consumed; envelope declares profile, proof, ledgerTag, schema version; postmark relayed from consensus (P-2) | `SEND_NO_STAMP` · `SEND_STAMP_SPENT` → P-7 · `SEND_UNADDRESSED` → P-10 · `SEND_FIRST_CONTACT_PENDING` (returns slip) → F-6 · `SEND_PARTIAL` → F-4 · `SEND_KEY_EPOCH_MISMATCH` → F-8 · `SEND_PROOF_STALE` → F-5 |
| **`inbox`** | self (or coordinates), window → envelopes (decrypted client-side), slips, acks | caller holds recipient keys for the declared epochs (P-8) | every envelope opens **with AAD verified** or fails closed; a closed-fail is returned as a *recorded fact* (P-1). Doorbell requests surface as pending slips | `INBOX_BINDING_FAILED` → **F-11** · `INBOX_EPOCH_UNKNOWN` → F-8 · `INBOX_SEQUENCE_GAP` → F-4 |
| **`ack`** | envelopeRef → `ReturnReceipt` {aadHash, postmark ref, recipient signature} on the **lane** | envelope opened with AAD verified — cannot ack what did not bind (P-1, §3.8); receipt pre-funded by sender (D-29) | signed receipt on the connection topic; absence carries **no negative claim** (F-6); recipient pays nothing | `ACK_BINDING_FAILED` → F-11 · `ACK_LANE_UNAVAILABLE` → F-6 · `ACK_NOT_FUNDED` (MINE; if sender did not opt in) |
| **`verify`** (replay) | topic coordinates or UAID + window → narrative + evidence bundle + per-envelope {declared, appraised} | **nothing** — no keys, no Postmaster, no credential (P-3, P-4) | deterministic (P-3); appraisal recomputes each proof from public data; unrecomputable → appraised *unverified*; **appraised ≤ declared** (P-12) | `VERIFY_SEQUENCE_GAP` → F-4 · `VERIFY_HASH_MISMATCH` → F-11 · `VERIFY_PROOF_UNVERIFIABLE` (downgrade, not error) → P-12 · `VERIFY_SCHEMA_UNRESOLVED` → F-9 |

---

## 6. Data objects (RECORD of names; field lists MINE, for v0.4 to fix and HCS-13 to register)

`MailCoordinates` · `ResolutionProof` (morpheme hash + M URI; manifest dereferenceable) · `Stamp` / `StampReceipt` · `Envelope` (ciphertext chunks + declared profile + proof + ledgerTag + schemaRef) · `Postmark` (topic, sequence, consensus timestamp, running hash; ledger-tagged per CLPR extension) · `ReturnReceipt` · `AttemptedDeliverySlip` (the consensus-timestamped `connection_request` + sender's outbound-topic record; an absence morpheme) · `EvidenceBundle` (tx IDs, messages, running hashes, signatures, per-envelope declared/appraised) · `Narrative`. Schemas track the spec; a schema change without a spec change does not merge (§16).

---

## 7. Envelope and cryptographic core (RECORD; v0.2 §6 + handoff §2.3, AAD updated)

- X25519 app-level keypairs, unlocked by wallet signature (HashPack/Blade); passphrase path via Argon2id (human-legacy; agent-path status Q-3); browser-stored wrapped keys; encrypted key-backup export for migration (HCS-1 is the natural home if it ever lands on-graph).
- Single-use **CEK** (AES-GCM-256); **KEK** via ephemeral X25519 ECDH against the recipient's published public key, or Argon2id.
- **Binding:** txRef of the settlement transaction appears in the transfer memo and the encrypted payload; **AAD = hash(topicId ‖ txRef ‖ resolutionMorpheme)** (§3.3; P-1, P-6, D-1).
- **Chunking:** 1,024-byte HCS submissions; larger bodies compressed, split, or stored via HCS-1 and referenced by HRL (`hcs://1/topicId`) in the `data` field per HCS-10 (Q-4 closed).
- **Key rotation:** old keys retained for history decryption; rotation announced on the profile topic (P-8, F-8).
- **Physical constraints:** 1,024-byte HCS message chunks; 100-byte HTS memo; roughly 0.06–0.11 HBAR per message (handoff figure; not re-measured). Coprocessor spec notes the 2026 HCS fee revision (ConsensusSubmitMessage $0.0001 → $0.0008) — FETCHED there, not re-verified here.

---

## 8. Threat model (RECORD; Q-1 closed 2026-08-10)

Four adversary classes. **The world** — sealed (the eternal postcard becomes an eternal sealed letter). **The service (Postmaster)** — content sealed; sees ciphertext and metadata in transit only, "discarded as appropriate and retained only as necessary" (retention policy concretized in LIMITATIONS). **The counterparty's operator** — visible; declared, not defended. **One's own host/operator** — visible; out of scope. Confidentiality terminates at the operating estate. Certified mail was never secretary-proof. HCS-19 (AI Agent Privacy Compliance) posture to be stated in LIMITATIONS rather than ignored (handoff §3.5.2; yes/no still open, item 19.8).

---

## 9. State machine and event grammar (RECORD from v0.2 §7 and D-41; the tool→state mapping is MINE — proposed, unobjected)

`DRAFT → STAMPED → [REQUESTED] → SUBMITTED → SETTLED → [ACKED] → RESOLVED`

| State | v0.2 definition | Tool that produces it (MINE) |
|---|---|---|
| DRAFT | envelope composed | after `resolve` (coordinates + proof in hand) |
| STAMPED | payment settled; stamp in the sender's custody, unaddressed (D-41) | `buy_stamp` |
| REQUESTED *(first contact only)* | HCS-10 `connection_request` submitted; lane does not yet exist | `send` on first contact; returns the attempted-delivery slip (F-6) |
| SUBMITTED | all chunks submitted | `send`, interior |
| SETTLED | consensus timestamps final on all chunks; **stamp consumed** (D-41) | `send` returns here (D-30) |
| ACKED *(optional; sender-funded)* | recipient's return-receipt morpheme observed on the lane | `ack` |
| RESOLVED | narrative + evidence bundle emitted on demand | `verify` |

Wording resolved (D-41): v0.2's burn-at-STAMPED is superseded — payment *settled* at STAMPED, stamp *consumed* at SETTLED. P-10 (direction) lives at `send`. The tool→state mapping in the table remains a proposal. Webhook events (`envelope.stamped`, `envelope.settled`, `envelope.acked`, `bundle.resolved`) are carried from v0.2 as vocabulary; whether any push surface exists in v1 is open item 19.10.

---

## 10. The invariant wall — P-1 … P-17 (RECORD 2026-09-04: "Handoff wins, bringing those 5 invariants in")

### 10.1 Concordance (v0.2 → v0.3/v0.4 numbering)

| v0.2 ID | v0.2 name | New ID | Disposition |
|---|---|---|---|
| P-1 | Keyless verification | **P-3** | merged into "Resolution from public data alone" |
| P-2 | Payment–envelope binding | **P-1** | renamed "Binding"; AAD extended (§3.3) |
| P-3 | Never hold the soul | **P-13** | returned |
| P-4 | Affidavit, not gate | **P-14** | returned |
| P-5 | Open roads only | **P-4 + P-5** | split: No broker / Registry-plural |
| P-6 | Category honesty | **P-15** | returned |
| P-7 | Lane equality | **P-16** | returned |
| P-8 | Deterministic resolution | **P-3** | merged; determinism carried into P-3's wording |
| P-9 | Mutability chosen at birth | **P-17** | returned |

No v0.2 invariant is dropped. Conformance tests are keyed to the **new** IDs only.

### 10.2 The wall

| ID | Invariant | Commentary / conformance sketch (sketches MINE) |
|---|---|---|
| **P-1** | **Binding.** Decryption fails closed if the envelope and its settlement event do not match. AAD = hash(topicId ‖ txRef ‖ resolutionMorpheme). | Test: tampered txRef fails closed. |
| **P-2** | **No Postmaster authority.** Nothing the service says is a postmark; only consensus postmarks. The Postmaster is a courier (§3.6). | *Konan inversion*: "trust through replay, not immunity" — nondelivery cannot be hidden. Pitch-page line (Sonic: "we can rock with it"). |
| **P-3** | **Resolution from public data alone, deterministically.** A correspondence is reconstructible from the topics, by anyone, from the spec alone; same topics in → same bundle out; resolution holds no state. | Absorbs v0.2 P-1 and P-8. Test: replay by a fresh resolver equals the Postmaster's bundle byte-for-byte. |
| **P-4** | **No broker.** No private broker, API key, or credit system is required for conformance. | Ratified unchanged under "support every incumbent." Test: full conformance run with no credentials configured. |
| **P-5** | **Registry-plural.** No single registry ecosystem is required for conformance. | Registries actor, typed. |
| **P-6** | **Resolution is witnessed, not trusted.** The envelope names the profile it resolved through and commits the resolution morpheme inside the AAD; a registry disagreement is a recorded fact, never a silent misdelivery. WISHMail never adjudicates between registries. | *An address is a claim; the postmark records whose claim.* "The umpire thesis wearing a mailbag." Test: forged resolution proof fails closed. |
| **P-7** | **Stamp precedes send.** No settled postage, no valid envelope. | Greenburgh: "the inbox topic is not a public forum." Mechanism: HIP-991. Test: unstamped submit rejected; double-spent stamp rejected. |
| **P-8** | **Key epochs monotonic**; old keys retained so history stays readable. | |
| **P-9** | **Strict HCS-10 transport conformance.** | F-9 live during the window; pin a draft revision (HCS-10 and HCS-14). |
| **P-10** | **Directed only.** A stamp buys one envelope to one resolved address. No unaddressed mail; no broadcast. | 39 CFR § 310.1. Test: unaddressed envelope rejected. |
| **P-11** | **Uniform postage.** A stamp costs the same regardless of which registry resolved the recipient. | Ratified "precisely." Test: three profiles price identically. |
| **P-12** | **Declared vs. appraised.** The sender declares a resolution profile (with trust class and statusProfile); the replayer appraises it. Appraised may never exceed declared — downgrade allowed, upgrade forbidden. **Wins in any conflict.** | Number **confirmed** 2026-09-04 (was provisional). = coprocessor B-1 + B-2 (§3.5). Lineage: trace-spec#66. Test: appraised > declared rejected; broker-sourced proof appraises as unverified. |
| **P-13** | **Never hold the soul.** The service never possesses recipient private keys; keys are generated client-side; genesis (if any) delivers coordinates, not secrets. | Test: the service code path contains no recipient private-key material. |
| **P-14** | **Affidavit, not gate.** No spec operation is required to complete inside a caller's latency-critical path; all proofs are post-hoc witnesses. | `send` blocking until SETTLED does not violate this: it is about *callers'* hot paths, not the tool's own patience (D-30). Test: no tool is a synchronous dependency of another agent's request path. |
| **P-15** | **Category honesty.** No forward-secrecy claim; metadata exposure declared. A LIMITATIONS document ships with every conforming release. | Test: LIMITATIONS.md exists with the required sections (§17). |
| **P-16** | **Lane equality.** At least one payment leg does not require the payer to pre-hold a funded Hedera account. | x402 USDC satisfies. Test: `buy_stamp` succeeds with no Hedera account. |
| **P-17** | **Mutability chosen at birth.** Topic keys are set at creation per declared policy — admin keys can be rotated but never cleared; immutability is a birth decision. | Test: topic admin-key policy is declared at creation and recorded. |

---

## 11. Failure modes — F-1 … F-11 (RECORD; F-6 rewritten; F-10, F-11 added 2026-09-04)

| ID | Failure | Status / mitigation |
|---|---|---|
| **F-1** | Metadata exposure — sender/recipient graph, timing, sizes public forever | Declared (Q-2 closed): the address was always on the envelope. |
| **F-2** | Recipient key compromise → full history decrypts | Accepted by category (P-15). |
| **F-3** | Orphaned payment — paid, never submitted / stamp not delivered | Refund/attestation policy: **open**. |
| **F-4** | Partial envelope — chunk loss or gap | Aggregate correlation (§14); HCS-1 remedy. |
| **F-5** | Registry drift — resolution changes between send and read | Snapshot-into-postmark is now *structural* (the resolution morpheme is in the AAD); verifier behavior on drift still to specify. |
| **F-6** | **Ack ambiguity and first-contact dependency.** Silence ≠ non-delivery. In strict HCS-10 a stranger's lane cannot exist until the recipient answers the doorbell. **Expiry is not silence: the consensus-timestamped `connection_request` (plus the sender's outbound-topic record) is an attempted-delivery slip — an absence morpheme, statusProfile `timed-out`, attesting what could not be seen.** Return receipt is a sender-funded option (D-29); absence carries no negative claim. Registry disagreement also surfaces here (P-6). | Native to HCS-10; sentence brought forward from coprocessor I-4 (D-36). |
| **F-7** | Operator liveness — any push component makes a paid customer strandable | v1 excludes push; replay is immune. |
| **F-8** | Mid-thread key rotation | Retained-key policy + profile-topic announcement; verifier behavior to specify. |
| **F-9** | Standard drift — HCS-10 and HCS-14 are Draft | Each release pins the revisions it conforms to; `VERIFY_SCHEMA_UNRESOLVED` when an envelope's declared schema (HCS-13) cannot be fetched. |
| **F-10** | **Resolution failure** — registry unreachable, not found, or unsupported profile at send time | New 2026-09-04. Distinct from F-5 drift. `resolve` errors; no envelope is constructible without coordinates (P-10). |
| **F-11** | **Binding mismatch** — AAD does not verify at open or replay | New 2026-09-04. Fail closed (P-1); the failure is a recorded fact, never swallowed; receipts cannot be re-worn across envelopes (§3.8, I-8 sibling). |

---

## 12. Open questions — Q-1 … Q-14 (RECORD)

| ID | Question | Status |
|---|---|---|
| Q-1 | Threat model | **CLOSED** 2026-08-10 (§8). |
| Q-2 | Metadata | **CLOSED** 2026-08-10 — declare, with the category defense. |
| Q-3 | Agent key lifecycle (KMS/env/TEE custody; newborn enrollment handshake; fate of the passphrase path) | Open. |
| Q-4 | Body storage | **CLOSED** 2026-08-10 — HCS-1 via HRL. |
| Q-5 | HCS-10 posture | **CLOSED** 2026-08-10 — atop, strictly. |
| Q-6 | Pricing units (per-stamp x402 · per-address issuance · renewals) — menu and numbers | Open. Constrained by P-11. |
| Q-7 | Governance — steward (ORG neutral-steward pattern); whether to submit via HCS-4 / Hiero post-window | Open; post-window. |
| Q-8 | Topic topology | **CLOSED** 2026-08-10 — inherited from HCS-10 (connection topics = lanes; inbound = doorbells; outbound = sender's public log). |
| Q-9 | Naming — WISHMail as standard, product, or both; tool names not frozen | Open. |
| Q-10 | NANDA cross-registry profile — postmarks/receipts as attestation-slot objects | Spec only; bilateral commitments outside the spec. |
| Q-11 | Postage classes (PES "extremely urgent" ≥2× cost test lineage) | Declared, **not built** (D-8). Competitive tier. |
| Q-12 | Stamp token type — fungible vs HIP-17 NFT (serial = stamp number; HIP-412 metadata carries the postmark reference) | Sonic leans NFT; **decided by measurement** (D-20); numbers not yet run. |
| Q-13 | Receipts and slips as HCS-25 reputation signals | **STRETCH**, sequenced after HOL registration (D-23). |
| **Q-14** | **Scheduled-transaction return receipt.** At `send` with `returnReceipt`, the sender creates a scheduled transaction requiring the recipient's signature, fee pre-funded by the sender; the recipient's `ScheduleSign` *is* the return receipt — consensus-timestamped, sender-paid, unconstructible for any other envelope because the scheduled body carries the postmark hash. | New 2026-09-04 (Sonic's prospect; shape MINE). **Two uncertainties to FETCH:** (a) `MailCoordinates` must carry the recipient's Hedera account/key — HCS-11 likely provides it, but it becomes a required field; (b) schedule expiry — whether long-term scheduled transactions are live on mainnet and what the ceiling is. Not more than a Q-item until fetched. |

---

## 13. Decisions log — D-1 … D-41 (RECORD; ADR seeds for v0.4's `adr/`)

| ID | Decision | Rationale / note |
|---|---|---|
| D-1 | Resolution proof goes **inside** the AAD. | A misresolved envelope refuses to open. Sizing resolved by D-26. |
| D-2 | Scoping principle: resolve, postage, consensus; four buckets Core / Profile / Channel / Venue. | |
| D-3 | MCP is the deliverable; WebMCP primary; MCP server as second transport of the same schema. | |
| D-4 | WISHMail never adjudicates between registries; the postmark records whose claim (P-6). | |
| D-5 | Strict HCS-10 conformance (2026-08-10). | |
| D-6 | Directed-only, no broadcast (P-10). | 39 CFR § 310.1. |
| D-7 | Uniform postage across registries (P-11). | |
| D-8 | Q-11 postage classes declared, not built. | |
| D-9 | HOL Guard scanner action: in, if feasible. | Hygiene only; the open action, not the broker. |
| D-10 | Declared-vs-appraised goes in explicitly (P-12). | |
| D-11 | One repo — monorepo `spec/` `conformance/` `app/`. | |
| D-12 | Spec-first repo outfitting before any code (agentrust-io posture). | |
| D-13 | Start Fresh: prior thinking may guide; no prior code. | |
| D-14 | HCS-11 declare + HCS-2 directory explicitly in the spec. | Later BUILD (D-23). |
| D-15 | HIP-1535 CLPR in the spec (Extensions); not built. | Ledger-tag proofs and postmarks; no same-ledger assumption. |
| D-16 | Attestify's buildout is a direct inspiration for surface breadth; answered without Solidity. | |
| D-17 | The bridge thesis: HOL ↔ NANDA first; other ledgers via CLPR. | |
| D-18 | Incumbents used, not shunned; HOL Registry deferred, likely one-of-multiple; P-4 holds. "Require no moat; support every incumbent." | |
| D-19 | HCS-13 schema registry agreed; HCS-25 candidate build. | |
| D-20 | Q-12 decided by measurement, not argument. | |
| D-21 | P-12 governs broker-sourced proofs: downgrade never upgrade. | |
| D-22 | Ocean Protocol is a venue, not a CLPR target ledger. | |
| D-23 | Excalidraw ranking = the scope line (checkpoint `c53c11444bd1459986`); BUILD SET final (§17). | |
| **D-24** | Handoff P-numbering wins; v0.2's five orphaned invariants return as P-13–P-17; concordance §10.1. | 2026-09-04. |
| **D-25** | Actor set and six verbs ratified; handoff item 1 closed. | 2026-09-04. |
| **D-26** | Item 2 (AAD sizing) resolved: the resolution proof is a RIOM morpheme hash; the manifest lives behind the hash and is dereferenced (decompiler built into the application); proof lives in the schema as a field. | 2026-09-04. Mechanism confirmed (§3.4). |
| **D-41** | Stamp lifecycle wording: **payment settled at STAMPED; stamp consumed at SETTLED (delivery).** Stamps may be bought with no immediate use, like the post office. | 2026-09-04. "Exactly right." Resolves the v0.2 burn-at-STAMPED wording. |
| **D-27** | `ack` is the sixth tool; postmark reclassified as consensus output relayed by `send`. | 2026-09-04. |
| **D-28** | Return receipt lands on the connection topic (the lane). | 2026-09-04; corrects handoff §5.2 item 5. |
| **D-29** | Return receipt is a sender-paid option at `send`; base is blind delivery; recipient pays nothing to ack; scheduled transactions are the candidate mechanism (Q-14). | 2026-09-04. |
| **D-30** | `send` blocks until SETTLED. | 2026-09-04. "Our tool should wait to make sure it functions properly." |
| **D-31** | Metering: only `buy_stamp` is priced by spec; `verify` free as a verb; narrative-assembly service may charge (PAEA split). | 2026-09-04. |
| **D-32** | F-10 (resolution failure) and F-11 (binding mismatch) added. | 2026-09-04. |
| **D-33** | Multi-profile `resolve` returns a set; the sender chooses and declares; reference implementation baseline by default, configurable. | 2026-09-04. |
| **D-34** | P-12 is written as coprocessor B-1 + B-2 instantiated, with witness-ladder vocabulary and per-profile trust classes. | 2026-09-04. |
| **D-35** | The Postmaster's trust class is named explicitly: courier / `math`, blast radius delay-only. | 2026-09-04. |
| **D-36** | F-6 carries I-4's sentence forward: the attempted-delivery slip is an absence morpheme. | 2026-09-04. |
| **D-37** | I-9 mandate lineage (operator-for-agent) is orange at best: spec mention, never a deliverable. | 2026-09-04. |
| **D-38** | Vocabulary: postal words in normative text; morpheme / morpheme proof colloquially with the paper as informative reference. Demonstration, not advertisement. | 2026-09-04. |
| **D-39** | v0.3 = this historical ledger, Project-only, not in the repo. v0.4 = the authoritative "WISHMail is" spec, indicative register, RFC 2119, no MUST without a conformance test. BUILD SET lives in the repo's STATUS, not the spec. Build versioning starts at v0.1 independently. Video tells "why day one with v0.4." | 2026-09-04. |
| **D-40** | Three morphemes, each consuming the prior — resolution → postmark → receipt — is the shared shape between the Ontologic primitive and WISHMail. | 2026-09-04. |

---

## 14. Resolution profiles (RECORD of the set and build status; trust classes MINE per §3.5)

| Profile | Declare surface | Resolve surface | Build status | Trust class (MINE) |
|---|---|---|---|---|
| HCS-14 UAID (native) — `did:aid` (registry-generated) and `did:uaid` (self-sovereign); `resolve` accepts both | HCS-11 account-memo profile (MailCoordinates: inbox topic, X25519 pubkey, key epoch); HCS-2 open directory of opted-in UAIDs | mirror node | **BUILD** (Draft; pin revision) | ~`math` |
| ANS-compatible DNS — TXT/SVCB under the `_ag` label | any domain holder publishes a TXT convention; demo on Sonic's domain | DNS | **BUILD**; ANS cert chain + transparency log **OUT** (extension). GoDaddy ANS public registration in-window: unknown | ~`social-committee` |
| NANDA AgentFacts | mail-coordinates field in the AgentFacts document | document fetch | **BUILD**; Index read via adapter **STRETCH**; Index write **OUT** | ~`social-committee` |
| A2A AgentCard mail-coordinates extension | AgentCard | — | **SPEC ONLY** | — |
| HOL Registry | broker | broker | **DEFERRED**; supported as one-of-multiple once something is registrable; never required (P-4); appraises as a downgrade (P-12) | `social-committee`, statusProfile `withheld` |

One normative doc per profile in v0.4 (`spec/profiles/`). Reconciliation pipeline (v0.2 §11): ingestion → record-level correlation (stamp ↔ envelope ↔ chunks via txRef/AAD) → aggregate correlation (sequence continuity + running hash) → narrative assembly (the green card is an evidence bundle). Reconciliation is the premium, competitive-tier surface; the same pipeline later serves other asset classes by swapping ingestion.

---

## 15. Standards map (RECORD of the handoff's tables; statuses as reported, not re-verified)

**Used — Core:** HCS-10 (transport; Draft; pin) · HIP-991 (fee-gated inbox; P-7) · HCS-1 (large bodies) · HTS (stamp; fungible vs HIP-17/412 NFT per Q-12).
**Used — Resolution / declare:** HCS-14 (Draft; pin) · HCS-11 (declare) · HCS-2 (directory) · HCS-13 (schema registry; BUILD).
**In spec, not built:** HIP-1535 CLPR (Extensions; ledger-tag proofs and postmarks; target ledgers named as ambitions — Sonic chain, SUI, SEI; whether Extensions names them informatively or stays agnostic is open) · HCS-19 (LIMITATIONS cross-reference; yes/no open) · HCS-21 (adapter registry; standard-or-moat check open) · HCS-3, HCS-12, HCS-17 (mentions at most) · HCS-4 (post-window venue).
**Stretch:** HCS-25 reputation signals (Q-13).
**Out:** HCS-5/6/7 (hashinal receipts — Q-11 lineage), HCS-8/9, HCS-15/16/18, HCS-20 (moat-adjacent), Solidity/HSCS entirely, HFS (HCS-1 replaces), agentgateway, XMTP.
**Physical:** 1,024-byte chunk; 100-byte HTS memo.
**Service-count framing (MINE, ratified in spirit):** count *standards honored*, not services touched.

---

## 16. Product surface and repo posture (RECORD; handoff §5.3, §8, §8.1)

**Surfaces:** WebMCP page (primary; `navigator.modelContext`; the human UI must work with no agent present) · MCP server sharing the *identical* tool schema · MCP-B polyfill/bridge (dependency — judges cannot be assumed to have the Chrome flag; FETCHED 2026-09-04, may drift) · TS SDK · CLI (drives the conformance suite) · goose ×2 demo + Claude as outside verifier · AGENTS.md footnote · HOL Guard scan if feasible. Demo shape (MINE, not yet chosen): two goose instances mailing through the page; Claude calls `verify` from outside.

**Monorepo (D-11, D-12), mirroring agentrust-io:**
- `spec/` — normative. `SPEC.md` (v0.4) in RFC 2119 register; `schemas/` (JSON Schema tracking the spec; HCS-13-registered); `profiles/`; `LIMITATIONS.md`; `adr/` (D-series); `GLOSSARY.md` (postal word ↔ morpheme; paper as informative reference); non-normative `docs/` that declare themselves so and carry the admission rule (a claim is permitted only because some normative sentence already makes it true; else it goes to Open questions).
- `conformance/` — tests keyed to P-IDs (§10.2 sketches); named conformance levels; **no MUST without a conformance test** (the solo-repo form of "the MUST is priced"); test changes that would invalidate prior conformance require a spec version bump.
- `app/` — implementation; README declares spec version implemented and conformance level passed; `BEHAVIOR.md` = the §5 table in full.
- Hygiene: DCO; Conventional Commits; `<!-- CHANGED: #NNN -->` markers on normative diffs; CHANGELOG on any normative change; ASCII-only diagrams; the AI clause verbatim in CONTRIBUTING ("use agents, but every change must be explainable with the agent closed"); maintainer-approval gate workflow adoption undecided (item 19.6).
- Chain of custody: spec leads; schema follows (schema PR without spec PR does not merge); tests are the court.

---

## 17. BUILD SET — final, as ranked by Sonic (RECORD, D-23; lives in the repo's STATUS, not in v0.4)

**Hard deliverables:** Core (resolve / postage / consensus) · three resolvers (HCS-14 native, DNS-TXT ANS-compatible, NANDA AgentFacts) · HCS-11 declare + HCS-2 directory · HCS-13 schema registration · WebMCP page · MCP server · MCP-B bridge · TS SDK + CLI · goose ×2 demo + Claude as outside verifier · AGENTS.md footnote · HOL Guard scan if feasible.
**Stretch, in Sonic's order:** HOL Registry registration (once registrable) → HCS-25 reputation signals (Q-13). Mandate lineage (§3.9) sits below both.
**Spec-only:** A2A AgentCard extension · Q-10 NANDA attestation slot · Q-11 postage classes · CLPR Extensions · AAIF appendix (Identity & Trust = postmark as attestation; Observability & Traceability = receipt as trace artifact; Agentic Commerce = postage) · NANDA Town twelve-layer map (WISHMail touches Communication, Identity, Registry, Trust, Payments, Privacy, Data facts) · USPS/PES grounding.
**Out:** broker dependency · Solidity · broadcast · agentgateway · ANS cert chain · NANDA Index write path · private hands (Non-Goal: unstamped plain HCS-10 messaging is not WISHMail's business; WISHMail certifies messaging, it does not monopolize it).
Canvas legend: green/blue = BUILD; orange = STRETCH; dashed = SPEC or VENUE. Checkpoint `c53c11444bd1459986`.

**LIMITATIONS.md must contain at minimum (P-15):** F-1 statement · F-2 statement · retention policy, concrete (what is kept, how long, why; PAEA/PSRA note: the stamp must not fund a perpetual obligation) · v1 scope exclusions (push) · operator trust boundary · HCS-19 posture · any Q-item resolved by deferral.

---

## 18. What v0.4 must contain (RECORD of handoff §4.3 + 2026-09-04 decisions; ordering MINE)

Indicative register throughout; uppercase RFC 2119 binds; nothing else does. No MUST without a conformance test in `conformance/`.

1. Scope and conformance (levels; what "conforming" means; F-9 pinned revisions of HCS-10 and HCS-14).
2. Terminology and glossary (postal words; morpheme mapping; informative reference to the paper).
3. Actors (§4) with the Postmaster's trust class stated.
4. The stamp (definition; P-6/P-10/P-11) and the two services in PAEA vocabulary (stamping market-dominant / uniform / capped; resolution competitive).
5. Data objects and schemas (§6; HCS-13 registration).
6. The six tools (§5) — preconditions, postconditions, failure codes.
7. Envelope and binding (§7; AAD as morpheme binding).
8. State machine (§9, reconciled).
9. Resolution profiles (§14) — one section or file each; declared trust class and statusProfile per profile.
10. Postmark, return receipt, attempted-delivery slip (the three morphemes; §3.2).
11. Replay and appraisal (P-3, P-12).
12. Invariants P-1–P-17 (§10.2).
13. Failure modes F-1–F-11 (§11).
14. Payments (x402; P-16; Q-6 open).
15. Threat model and LIMITATIONS (§8, §17).
16. Extensions: CLPR (ledger-tagged proofs/postmarks); A2A AgentCard; NANDA attestation slot; HCS-25 signals; mandate lineage.
17. Postal grounding (P-2 Konan inversion, P-7 Greenburgh, P-10 § 310.1, P-11 USO, Q-11, private-hands Non-Goal).
18. Appendices: AAIF working-group map; NANDA Town layer map; ADR index.
19. Open questions (Q-3, Q-6, Q-7, Q-9, Q-12, Q-14 and any unanchored claim).

---

## 19. Open items — current ledger (RECORD of status; do not treat as settled)

1. ~~Actor set and six verbs~~ — **closed** (D-25).
2. ~~AAD sizing~~ — **closed** (D-26, §3.4).
3. Demo shape — offered (§16), not chosen.
4. Q-9 naming — open; tool names not frozen.
5. ~~P-12 numbering~~ — **closed** (D-24).
6. Maintainer-approval gate workflow adoption — undecided.
7. Feasibility unknowns: GoDaddy ANS public registration in-window; NANDA Index public read; HOL Guard applicability to a WebMCP/MCP repo; WebMCP browser status drift.
8. HCS-19, HCS-21 — yes/no on spec inclusion.
9. State machine — STAMPED/SETTLED wording **closed** (D-41); tool→state mapping (§9) proposed, unobjected.
10. Webhook/push vocabulary in v0.2 §7 vs F-7's no-push rule — tension logged (§1.5).
11. Sponsor actor / sponsored genesis — in v0.2, absent from the ratified actor set (§1.6).
12. F-9 pinning — specific HCS-10 and HCS-14 draft revisions not yet chosen.
13. Q-12 stamp cost measurement — not yet run.
14. Q-14 — two FETCH items (recipient account in coordinates; schedule expiry ceiling).
15. Per-profile trust-class assignments (§3.5, MINE) — confirm in v0.4.
16. ~~Manifest transport~~ — **closed**: by-reference only, dereferenced by any verifier and by our tool (§3.4).
17. HOL Registry profile exact I/O — open; not a build item until Sonic says so.
18. CLPR Extensions — ledger-agnostic vs informatively naming Sonic chain / SUI / SEI.
19. F-3 refund/attestation policy; F-5 and F-8 verifier behavior — to specify.
20. Whether `send` offers any non-blocking mode — none recorded (D-30); default is none.

---

## 20. Sources and provenance

| Source | Date | Used for |
|---|---|---|
| `WISHMAIL_SPEC_SKELETON_v0_1.md` | 2026-08-10 | original P/F/Q, actors, I/O, state machine |
| `WISHMAIL_SPEC_SKELETON_v0_2.md` | 2026-08-10 | HCS-10 posture, threat model, closures, F-6 reframe, F-9 |
| `WISHMAIL_HANDOFF_2026-09-04.md` | 2026-09-04 | bridge thesis, P-1–P-12, D-1–D-23, research mappings, BUILD SET, repo posture |
| `The_Ontologic_Protocol_Whitepaper` (zip, read in full) | 2026-05-31 | RIOM primitive; verification senses; §7 chain |
| `ontologic-coprocessor-spec-v0_2.md` | 2026-07-20 | trust classes, statusProfile, B-1/B-2/B-3, I-4, I-8, I-9, courier/notary bridge taxonomy |
| `ontologic-witness-ladder-positioning.md` | 2026-06-23 | disinterestedness; the ladder; vocabulary for P-12 |
| `POSTURE_IMRAN_AGENTRUST_2026-09-03.md`; RESEARCH_* (AAIF, ANS/HOL, Attestify, HCS catalog, NANDA, USPS/PES) | 2026-09-03/04 | as summarized in the handoff; not re-read in full this session |
| Project session, 2026-09-04 (this document's own session) | 2026-09-04 | D-24–D-41, F-10/F-11, Q-14, P-13–P-17 |
| Excalidraw checkpoint `c53c11444bd1459986` | 2026-09-04 | the ratified scope line |

*Nothing here is normative. v0.4 is where WISHMail is said.*

*Yours in service,* 🐌🔦
