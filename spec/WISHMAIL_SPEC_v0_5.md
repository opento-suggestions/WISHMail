# WISHMail — Specification v0.5.1

**Status:** Frozen 2026-09-07 for the repository; the text every conformance claim against version 0.5 is measured by. A normative change to this text after this date carries a `CHANGED` marker naming its decision, and the CHANGELOG records the diff.
**Date:** 2026-09-07
**Pins:** standards and x402 pinned (§1.6); HOL anchor topics listed (§9.5); `SCHEDULE_MAX_LIFETIME` filled; the stamp token is filled at first deployment (§4.1, §19.2). No conformance claim is valid against this version until every pin is filled.
**Ledger:** decisions D-42 onward, the conformance-test register, and open items are kept in `CONFORMANCE_TESTS_v0_5.md` beside this file; nothing there is normative.
**Requirement language:** RFC 2119 / RFC 8174. Uppercase key words bind; every other sentence binds nothing.
**Conformance:** every MUST, MUST NOT, REQUIRED, SHALL, and SHALL NOT in this document carries a `Conformance:` note naming at least one test in `conformance/`, keyed to the invariant it serves.

---

## Contents

1. Scope and conformance — landed
2. Terminology — landed
3. Actors — landed
4. The stamp and the two services — landed
5. Data objects and schemas — landed
6. The six tools — landed
7. Envelope and binding — landed
8. State machine — landed
9. Resolution profiles — landed
10. Postmark, return receipt, attempted-delivery slip — landed
11. Replay and appraisal — landed
12. Invariants P-1 – P-17 — landed
13. Failure modes F-1 – F-11 — landed
14. Payments — landed
15. Threat model and limitations
16. Extensions — landed
17. Postal grounding
18. Appendices
19. Open questions

---

## 1. Scope and conformance

### 1.1 What WISHMail is

WISHMail is certified mail for agents. It is a convention for sealed envelopes carried inside HCS-10 message operations, together with a certified layer — resolution proof, postmark, return receipt, attempted-delivery slip — such that any party can reconstruct a correspondence from public consensus data alone and appraise what each proof rests on.

WISHMail sells two claims, separately. Origin: a stamped envelope is welded to its settlement event and to the witnessed resolution of its address; an envelope that was misresolved or mis-settled does not open. Story: a correspondence is a chain of proofs on public topics, replayable by anyone from this specification alone.

This specification defines: (a) the stamp — one directed envelope, to one witnessed-resolved address, at one price; (b) the sealed envelope, and its chunking, as a `data` payload convention on HCS-10 `message` operations; (c) the resolution proof, its binding into the envelope's AAD, and the AAD's binding into the envelope's settlement; (d) the postmark, the return receipt, and the attempted-delivery slip; (e) replay and appraisal; (f) the six-tool surface — `resolve`, `buy_stamp`, `send`, `inbox`, `ack`, `verify`; (g) resolution profiles, one document each; (h) the conformance classes and claims of §1.4 and §1.5.

### 1.2 What WISHMail is not

WISHMail defines no transport. HCS-10 defines the transport; WISHMail defines only what rides inside it.

WISHMail operates no registry. Registries are external, read-only, and plural; WISHMail never adjudicates between them.

WISHMail claims no forward secrecy. History is decryptable by its keyholders by design; §15 declares what is exposed.

WISHMail delivers nothing to a recipient's hand. Consensus witnesses; recipients read. This specification defines no push or notification surface.

WISHMail carries no broadcast. A stamp buys one envelope to one address.

WISHMail does not certify unstamped HCS-10 messaging and makes no claim about it. WISHMail certifies messaging; it does not monopolize it (§17).

### 1.3 Requirement language

The key words MUST, MUST NOT, REQUIRED, SHALL, SHALL NOT, SHOULD, SHOULD NOT, RECOMMENDED, MAY, and OPTIONAL in this document are to be interpreted as described in RFC 2119 and RFC 8174 when, and only when, they appear in all capitals. A sentence without an uppercase key word binds nothing.

Every MUST, MUST NOT, REQUIRED, SHALL, and SHALL NOT in this document carries a `Conformance:` note naming at least one test in the conformance suite, keyed to the invariant (§12) the requirement serves. A requirement with no named test is a defect in this specification, not a requirement.

### 1.4 Conformance classes

WISHMail names four conformance classes. Each names an actor (§3) and the invariants it is tested against.

```
VERIFIER        reconstructs and appraises correspondence from public
                consensus data. Requires no key, stamp, account,
                credential, or Postmaster.
                Implements: verify.

CORRESPONDENT   sends certified mail; holds its own keys; reads its own
                lanes. Includes VERIFIER.
                Implements: resolve, buy_stamp, send, inbox, ack, verify.

RECIPIENT       receives certified mail and nothing else — a post-office
                box. Holds its own keys; declares coordinates under at
                least one profile; requires no stamp. Includes VERIFIER.
                Implements: inbox, ack, verify.

POSTMASTER      issues the stamp (§4); sells stamps; accepts envelopes;
                relays postmarks; reconciles correspondence on request.
                A courier: transports bytes, attests nothing.
                Includes VERIFIER.
                Implements the service side of buy_stamp, send, verify.

        +---------------+   +-------------+   +-------------+
        | CORRESPONDENT |   |  RECIPIENT  |   | POSTMASTER  |
        +-------+-------+   +------+------+   +------+------+
                |                  |           =======+=======  the pedestal:
                |                  |                  |         issues the stamp
        +-------+------------------+------------------+-------+
        |                       VERIFIER                      |
        |             the floor: every class verifies         |
        +-----------------------------------------------------+
```

An implementation MAY claim more than one class. Every class includes VERIFIER; no class includes another.

VERIFIER conformance MUST be achievable with no private broker, API key, credit, Hedera account, stamp, or recipient key configured.
`Conformance:` T-P4-1.

A CORRESPONDENT MUST implement at least one resolution profile (§9). No particular profile is REQUIRED.
`Conformance:` T-P5-1 — the CORRESPONDENT suite passes with each supported profile enabled as the sole profile.

A RECIPIENT MUST declare coordinates under at least one resolution profile (§9). No particular profile is REQUIRED.
`Conformance:` T-P5-2 — the RECIPIENT suite passes with each supported profile as the sole declared profile.

Resolution profiles are an axis orthogonal to class. A claim names the profiles the implementation resolves through (CORRESPONDENT), declares under (RECIPIENT, and any CORRESPONDENT that also receives), or appraises (VERIFIER). A CORRESPONDENT that declares under no profile receives no mail. A VERIFIER that cannot re-obtain a profile's inputs appraises that profile's proofs as unverified (§11) and remains conforming.

```
Class / invariant matrix               V   C   R   P
P-1   Binding                          x   x   x   x
P-2   No Postmaster authority          .   .   .   x
P-3   Public-data replay               x   x   x   x
P-4   No broker                        x   x   x   x
P-5   Registry-plural                  x   x   x   x
P-6   Resolution witnessed             x   x   x   x
P-7   Stamp precedes send              .   x   x   x
P-8   Key epochs                       .   x   x   .
P-9   Strict HCS-10                    x   x   x   x
P-10  Directed only                    .   x   .   x
P-11  Uniform postage                  .   .   .   x
P-12  Declared vs appraised            x   x   x   x
P-13  Never hold the soul              .   x   x   x
P-14  Affidavit, not gate              .   x   x   x
P-15  Category honesty                 x   x   x   x
P-16  Lane equality                    .   .   .   x
P-17  Mutability at birth              .   x   x   x
```

### 1.5 Conformance claims

A release that claims conformance MUST publish a conformance claim naming: the specification version; each class claimed; the resolution profiles claimed per class; the pinned revisions (§1.6) tested against; and the conformance-suite version and date of the passing run.
`Conformance:` T-P15-1.

A release that claims conformance MUST ship a LIMITATIONS document (§15).
`Conformance:` T-P15-2.

A claim MUST NOT name a class whose suite did not pass in full.
`Conformance:` T-P15-3.

A claim is scoped to the classes, profiles, and pins it names. Silence claims nothing.

### 1.6 Pinned standards revisions

WISHMail rides on standards that are Draft. A pin is a content identifier for a standard's text: the git blob of the standard's file at a named commit in its canonical repository. The canonical repository of the HCS standards is `hiero-ledger/hiero-consensus-specifications`; this specification conforms to the text at commit `7046156c85eaaf29e149fa10232964d33a58d34e`, file by file:

<!-- CHANGED: D-135 -->
```
Standard     Role in WISHMail                     Status      Pin (path · git blob)
HCS-10       transport                            Draft       docs/standards/hcs-10/index.md · 0cb5d2eb6b98e12e4b44fa8c4fea6e10937b615a
HCS-14       agent ID (uaid:aid / uaid:did)       Draft       docs/standards/hcs-14/index.md · 969de3aa2fccaea10f50165f82620ae6172b017d
HCS-11       profile declaration                  Draft       docs/standards/hcs-11.md       · aa5ba9ede21b31cb84dde93e119302fd5ae127a9
HCS-13       schema registry                      Draft       docs/standards/hcs-13.md       · 07f1ac67b344d6655b98ce8196b3053fe1b4f566
HCS-1        HCS-11 profile storage (§9)          Published   docs/standards/hcs-1.md        · 0d8cca5f0adac613a149244e769672ea3060328a
HCS-2        declaration registry (§9.2)          Published   docs/standards/hcs-2.md        · dc0ad9a1a052f4a9f2ee750161d61f7f8d28ef07
HOL registry anchor topics (§9.5)                  —           deployment facts, listed in §9.5; the broker's API is not a dependency
x402 v2      purchase leg (§14)                   —           x402-foundation/x402 @ 0c04a84eeceace349397274c5785c9ca7fcf9474:
               core specification                             specs/x402-specification-v2.md · 3b4631af0684748966eafcdf6a6a90a8cbbf7198
               HTTP transport                                 specs/transports-v2/http.md · a21213c02706208b2268a5fdab7dc6d5b468edbd
               exact scheme                                   specs/schemes/exact/scheme_exact.md · fe27f3c2a971fcc8325c9f65c85bc19f8f93271f
               exact scheme, Hedera                           specs/schemes/exact/scheme_exact_hedera.md · ee3860ccdf351b22a1186c08660cf6929a54d0f6
HIP-991      fee-gated topics                     Final       hashgraph/hedera-improvement-proposal @ 03701720a5d689ef6b0f0ac5f7b8e991d4b595b2:
                                                             HIP/hip-991.md · 179b61beed7bc25aec32515f079f253f73895485
HIP-423      long-term schedules (§10.4)          Final       hashgraph/hedera-improvement-proposal @ 0c4f195b464342ff7b8629cb26b278ee323a9ca6:
                                                             HIP/hip-423.md · f5fbb1d437179b7fb6a6ad853c59b12c04d43633
SCHEDULE_MAX_LIFETIME   maximum schedule lifetime, all networks          Network     5,356,800 s (62 days)
```

`spec/pins.json` carries the same pins with each file's SHA-256 beside its blob.

A release MUST declare the revision of each pinned standard it was tested against, and those revisions MUST equal the pins of the specification version it claims.
`Conformance:` T-P9-1.

A claim MUST NOT be made against a specification version whose pins in §1.6 are unfilled.
`Conformance:` T-P9-2 — the suite refuses to produce a report while `spec/pins.json`, which tracks §1.6, contains an unfilled pin.

### 1.7 Versioning

This specification is versioned `major.minor.patch`, independently of any implementation. A change to a conformance test that would invalidate a previously conforming implementation is a new minor version at least. A schema change without a corresponding specification change is not a change to WISHMail.

The wire carries `major.minor` and nothing finer: the AAD's `v` (§7.2), the HPKE `info` string (§7.3), and the `schemaRef` an envelope declares (§5.11) name a minor version, and the schemas registered under HCS-13 for that minor version are its schemas. A patch revision amends text and tests within a minor version; it changes no wire string, and once a minor version's schemas are registered it changes no schema. A change that would do either is a new minor version.

A release claiming a patch revision MUST use the wire strings of, and ship schemas whose digests equal those registered for, the minor version the patch belongs to.
`Conformance:` T-P9-9 — `spec/pins.json` records the minor version's registered schema digests and wire strings; a release claiming any patch of that minor version ships `spec/schemas/` with equal digests and passes T-P1-4 and T-P1-5 against the minor version's vectors.

---

## 2. Terminology

### 2.1 How to read this section

A term defined here carries that meaning everywhere it appears in this document. Names in code font are tool names or schema fields. The postal words are the normative vocabulary. §2.4 maps each to its counterpart in the Ontologic Protocol's vocabulary; §2.4 is informative, and a reader who never opens that paper loses nothing normative. This section contains no requirement.

### 2.2 Terms

#### Parties

**agent** — a party that sends or receives certified mail, identified by an address and holding its own keys.

**Operator** — the human or organization behind an agent. The Operator is visible to the correspondence (§15): the right to open mail is the right to open mail.

**Correspondent** — an agent that sends certified mail and reads its own lanes. A conformance class (§1.4).

**Recipient** — an agent that receives certified mail and nothing else: a post-office box. A conformance class (§1.4).

**Postmaster** — the service: issues and sells stamps, accepts envelopes, relays postmarks, reconciles on request. A courier: it transports bytes and attests nothing; nothing it says is a postmark; its compromise can delay, never forge. A conformance class (§1.4).

**Consensus** — the consensus service of the ledger a ledger tag names, acting as witness. On Hedera, the Consensus Service and the Token Service. The only party whose word is a postmark.

**Verifier** — any party that reconstructs and appraises a correspondence from public consensus data alone, requiring no key, stamp, account, or credential. An **Independent Verifier** is a Verifier that is neither party to the correspondence nor the Postmaster. A conformance class, and the floor of every other (§1.4).

**Registry** — an external, read-only source that a resolution profile queries to turn an address into coordinates. Registries are plural; WISHMail never adjudicates between them.

**Assembler** — the sender-side component of a Correspondent that performs assembly. The Assembler is the Correspondent's own; it is never the Postmaster's.

**courier** — a party whose compromise can delay but cannot forge: it transports bytes and attests nothing. The Postmaster is a courier.

#### Places

**topic** — an HCS consensus topic. Every topic on which envelopes travel is one HCS-10 defines.

**doorbell** — an agent's HCS-10 inbound topic, where connection requests land. A doorbell is fee-gated: it is not a public forum (P-7).

**lane** — an HCS-10 connection topic between exactly two agents, identified by ledger tag and topic ID, open from the consensus timestamp of its `connection_created` operation until a `close_connection` from either party. Chunks and return receipts travel on the lane. Where more than one lane exists between two agents, *the* lane between them is the earliest-created open one (§7.1).

**log** — an agent's HCS-10 outbound topic: its public record of what it sent, including its connection requests.

**mirror node** — a public read interface to consensus data. Any mirror node yields the same bytes; a mirror node is not a broker.

**ledger tag** (`ledgerTag`) — the identifier of the ledger on which a topic, stamp, or postmark lives. WISHMail assumes no two of these share a ledger (§16).

#### Objects

**address** — a typed identifier that a resolution profile can turn into coordinates: `uaid:aid:…` and `uaid:did:…` (HCS-14), `dns:<fqdn>` (DNS), a NANDA URN at an index (NANDA), or an HCS-11 account. An address is a claim; the postmark records whose claim.

**coordinates** (`MailCoordinates`) — what a sender needs to post to an agent: its account, its doorbell, its current encryption public key and key epoch, its ledger tag, and the resolution proof and profile under which these were obtained.

**stamp** — a unit of postage: one unit of the stamp token, issued by the Postmaster, held by an agent, unaddressed until affixed, and consumed by the delivery of the one envelope it is affixed to. Every stamp costs the same. The stamp is one token (§4); no other token is a stamp.

**affix** — to settle postage for one envelope by transferring its weight in stamps to the Postmaster's treasury under a memo that names the envelope. An affixed stamp is directed: it names one lane and one resolution, and no other.

**weight** — the postage an envelope requires, in stamps, determined by its size and by nothing else (§4.2).

**ounce** — the unit of weight: `OUNCE_BYTES` of ciphertext (§7). An envelope of up to one ounce weighs one stamp.

**treasury** — the account that holds the stamp token's unissued supply and receives affixed stamps.

**postage** — stamps, as the price of carriage; the token they are units of is `$POSTAGE` (§4.1). Postage is *bought* from the Postmaster (§14), *affixed* to an envelope (§4.3), and *due* when an envelope carries fewer stamps than its weight.

**settlement reference** (`txRef`) — the identifier of the transfer that affixed an envelope's stamps. Every chunk of the envelope carries it.

**envelope** — a sealed message: ciphertext chunks together with the declared profile, the resolution proof, the settlement reference, the ledger tag, and the schema reference. One envelope, one stamp, one address.

**sealed** — encrypted under a single-use content key, itself wrapped for the recipient's published key, with the AAD bound in. A sealed envelope opens only for the keyholder and only when its AAD verifies (§7).

**AAD** — the additional authenticated data of an envelope: a hash over the lane, the resolution proof, and a nonce the sender chooses, so that no two envelopes share one. The settlement's memo carries the AAD hash; the weld runs from settlement to envelope. Decryption fails closed if the AAD does not verify, or if the settlement the envelope names does not carry it (P-1).

**chunk** — one HCS-10 `message` operation whose `data` carries one slice of an envelope together with the envelope's identifier, the slice's index, the slice count, and the digest of the next slice; chunk 0 also carries the header, including the digest of the whole ciphertext. The chunks of an envelope form a chain from the header: each commits the next, so that a slice not committed by the one before it is not of the envelope (§7.4, §11.3). A chunk is sized so that HCS-10 carries it inline (§7). An envelope is one or more chunks, all on the lane; WISHMail stores no part of an envelope anywhere else.

**HRL** — an HCS-1 resource locator, `hcs://1/<topicId>`. WISHMail encounters HRLs where HCS-11 account memos point at profiles (§9); an envelope never carries one.

**key epoch** (`keyEpoch`) — a monotonic counter over an agent's published encryption keys. Old keys are retained so history stays readable (P-8).

**schema reference** (`schemaRef`) — the HCS-13 identifier of the schema version an envelope declares (§5).

**evidence bundle** — the output of reconciliation: every transaction, message, running hash, and signature a Verifier used, with each proof's declared and appraised standing.

**narrative** — the human-readable account of a correspondence, produced from an evidence bundle. The bundle is the evidence; the narrative is its reading.

#### Proofs

**proof** — a sealed record of four parts — rule, inputs, output, meaning — hashed together, so that anyone holding the rule and the inputs can recompute the output and the hash, and anyone can look up the meaning's canonical location to confirm what consensus recorded. A proof guarantees the record, not the referent: what was attested is guaranteed to have been attested, not guaranteed true. Four kinds of proof occur in WISHMail; each after the first consumes the one before it (§10).

**resolution proof** — the proof that an address became these coordinates under a named profile at a stated time. Its hash is bound into the AAD, so an envelope whose resolution proof is forged or altered does not open (P-1, P-6).

**postmark** — Consensus's record that a chunk was submitted to a lane: topic, sequence number, consensus timestamp, running hash, ledger tag. Nothing else is a postmark (P-2). The postmark is the witness of the second proof in the chain, the proof of posting, whose parts §10 fixes.

**return receipt** — the recipient's signed acknowledgment, witnessed by consensus, that a specific envelope opened with its AAD verified. It binds the postmark it acknowledges and cannot be re-worn for any other envelope. Requested on the lane, signed by the recipient alone, paid by the sender (§10.4).

**attempted-delivery slip** — a proof of absence: the consensus-timestamped connection request together with the sender's log entry, attesting that first contact was attempted and no lane answered within the window. Expiry is not silence. A slip carries no negative claim about the recipient.

**canonical location** — the structured locator, recorded in a proof's meaning, at which the proof's manifest is found on consensus data.

**manifest** — the full four-part proof, published where its canonical location says; what an object naming a proof by `{hash, uri}` dereferences to.

**manifest topic** — an agent's own HCS topic, keyed to the agent alone, on which it publishes the manifests of the proofs it makes (§9.1).

**snapshot** — the bytes a rule read from a source that is not on consensus, carried in the manifest so the proof recomputes from the manifest alone (§9.1).

#### Acts

**resolve** — turn an address into coordinates and a resolution proof under a named profile. Tool: `resolve`.

**assembly** — the Correspondent's act of producing a sealed envelope from coordinates and their resolution proof, a stamp, and a payload, binding the lane and the resolution proof into the AAD, affixing the stamps under that AAD, and sealing the payload against it. Assembly is where the binding fires. Tools: `buy_stamp`; `send`, up to submission.

**delivery** — the settlement of an envelope on the lane: every chunk has a consensus timestamp and the stamp is consumed. Delivery is to the lane, never to the recipient's hand. The only proof that a recipient took an envelope is a return receipt.

**blind delivery** — delivery with no return receipt requested. The base service.

**first contact** — the case in which no lane yet exists between sender and recipient. In strict HCS-10 a lane cannot exist until the recipient answers the doorbell; a first-contact `send` either completes the handshake or returns an attempted-delivery slip.

**open** — the recipient's decryption of an envelope with its AAD verified. Tool: `inbox`.

**acknowledge** — the recipient's production of a return receipt. Tool: `ack`. A recipient cannot acknowledge what did not bind.

**replay** — the recomputation of a proof from its rule and inputs, from public data. The syntactic half of appraisal.

**lookup** — the dereference of a proof's canonical location to confirm what consensus recorded. The semantic half of appraisal.

**reconciliation** — the reconstruction, from public consensus data alone, of who posted which envelope to whom and when, with every proof appraised. Reconciliation reconstructs which envelope, never what it said. Output: an evidence bundle and a narrative. Tool: `verify`.

#### Appraisal

**appraisal** — replay together with lookup, yielding a proof's appraised standing.

**declared** — what the sender stated at assembly: the resolution profile, its trust class, and its endorsements.

**appraised** — what a Verifier established by appraisal. Appraised never exceeds declared (P-12).

**trust class** (`trustClass`) — the kind of witness a proof's verification terminates in, declared per profile: `math` (pure recomputation from public data), `economic-game` (a bond and a challenge window), `hardware-TEE` (a vendor attestation chain), or `social-committee` (the honesty of a signer set).

**endorsement** (`statusProfile`) — a statement of what a proof could not see, per input: `missing`, `vague`, `blurred`, `stale`, `timed-out`, or `withheld`. Endorsements are orthogonal to trust class: a proof states both what its verification rests on and what it was blind to.

**unverified** — the appraised standing of a proof a Verifier could not recompute. A downgrade, never an error.

**witnessed** — recorded on consensus under a postmark. A witnessed proof's existence, ordering, and attribution are settled; its truth is not.

#### Conformance

**class** — one of VERIFIER, CORRESPONDENT, RECIPIENT, POSTMASTER (§1.4).

**profile** (resolution profile) — a named rule, at a pinned revision, for turning an address into coordinates and a resolution proof, with a declared trust class (§9). Distinct from `statusProfile`, which this document calls an endorsement.

**pin** — a content identifier for a standard's text (§1.6).

**release** — a versioned artifact of an implementation.

**claim** (conformance claim) — the document by which a release claims conformance (§1.5).

**declaration** — the object an agent publishes under a profile so that it can be resolved: account, doorbell, log, manifest topic, encryption key, epoch (§9.1). To *declare* is to publish it.

**test** — a conformance test, keyed `T-<P-ID>-<n>` (§2.5).

### 2.3 Words this specification reserves

*Resolution* is the act of turning an address into coordinates, and nothing else. The reconstruction of a correspondence is *reconciliation*; its mechanism is *replay*; its verdict is *appraisal*.

*Delivery* is to the lane. No sentence in this document says an envelope was delivered to a recipient; a return receipt says a recipient opened it.

A *postmark* is Consensus's record. The Postmaster relays postmarks and issues none.

*Reconciliation* answers who, whom, when, and which envelope. It never answers what was said; that belongs to the keyholders.

An *envelope* lives on the lane. Every chunk of it is a `message` operation on the lane; no part of its content is stored on any other topic or referenced from elsewhere.

*Operator* is the human or organization behind an agent. HCS-10's `operator_id` field, `inboundTopicId@accountId`, identifies the agent itself; this document never calls that field an operator.

To *declare* is what an agent does: publish its declaration under a profile. *Declared*, of a proof, is what the sender stated about it — its trust class and endorsements — as against what a Verifier *appraised* (P-12). The two are different acts by different parties and share a root only.

*Proof* is the normative word for a sealed four-part record. *Morpheme*, the Ontologic Protocol's word for the same object, appears in §2.4 and in informative text only.

### 2.4 Correspondence with the Ontologic Protocol (informative)

WISHMail's proofs are instances of the Ontologic primitive h(R‖I‖O‖M): a Rule, its Input, the resulting Output, and a statement of Meaning with a canonical URI, sealed in one hash and witnessed on a consensus topic. The table gives the correspondence. It binds nothing.

```
WISHMail                         Ontologic Protocol                 Where
proof                            morpheme; morpheme proof           paper §4
rule / inputs / output /         R / I / O / M                      paper §4
  meaning
canonical location               M's canonical URI                  paper §4
replay                           syntactic verification             paper §4
lookup                           semantic verification              paper §4
resolution proof                 resolution morpheme                §10
postmark, with its envelope      postmark morpheme                  §10
return receipt                   receipt morpheme                   §10
attempted-delivery slip          absence morpheme                   coprocessor I-4
assembly                         the binding event                  paper §1, §4
witnessed                        authority bestowed by witnesses    paper §3
declared / appraised             Invariant B-1                      coprocessor §3.1
trust class                      trust class                        coprocessor §3.1
endorsement                      statusProfile                      coprocessor §3.2
courier                          courier (trust class math)         coprocessor §3.1
cannot acknowledge what did      captioned testimony                coprocessor §3.4, I-8
  not bind
Verifier                         auditor / mirror node              coprocessor §1
Consensus                        Hashsphere                         paper §5
```

Informative references: N. Altemeyer, *The Ontologic Protocol — A Primitive for Deterministically Verifiable Proof-of-Reasoning*, Ontologic Reclamation Group, 2026-05-31; *Ontologic Protocol — Coprocessor Architecture Specification*, Draft v0.2, 2026-07-20.

### 2.5 Identifiers

`P-n` invariants (§12). `F-n` failure modes (§13). `Q-n` open questions (§19). `D-n` decisions (§18, ADR index). `T-<P-ID>-n` conformance tests. Profile identifiers are fixed in §9. Failure codes returned by tools are `UPPER_SNAKE` and fixed in §6.

---

## 3. Actors

### 3.1 The actor set

```
Actor           Role                                        Class          Trust posture
Correspondent   originates envelopes; its Assembler binds   CORRESPONDENT  holds its own keys
Recipient       receives, opens, acknowledges               RECIPIENT      holds its own keys
Operator        the human or organization behind an agent   —              visible (§15)
Registries      address -> coordinates, one per profile;    —              external, read-only,
                typed and plural                                           plural; trust class
                                                                           declared per profile
Postmaster      issues and sells stamps; pays and carries;  POSTMASTER     courier: trust class
                relays postmarks; reconciles on request                    math; delay only
Consensus       witnesses; the only source of a postmark    —              terminal
                                                                           disinterestedness
Verifier        reconciles from public data alone           VERIFIER       keyless, brokerless
Payment         x402 facilitator; USDC and HBAR legs        —              external (§14)
  networks
```

### 3.2 Four verbs

The Assembler binds. Consensus witnesses. The Verifier reconciles. The Postmaster carries.

```
   Registries --resolve--> Assembler --binds--> sealed envelope, signed by the sender
   (read-only)             (the Correspondent's)          |
                                                          | the Postmaster carries
                                                          | (pays; attests nothing)
                                                          v
   Verifier <--public data-- Consensus <----------------- lane (HCS-10 connection topic)
   reconciles               witnesses: postmark           |
   (replay + lookup)                                      v
                                                   Recipient opens (AAD verifies)
                                                   Recipient acknowledges (return receipt)
```

No actor performs another's verb. A Postmaster that bound would hold a sender's key; a Postmaster that witnessed would be a postmark; an Assembler that witnessed itself would be self-attesting. The grammar is the separation of powers, and P-2 follows from it.

### 3.3 Correspondent, Recipient, Operator, Assembler

A **Correspondent** is an agent that sends. It resolves an address, holds a stamp, assembles a sealed envelope, submits it to the lane under its own signature, and reads its own lanes for return receipts. Its **Assembler** is the component that binds: it computes the AAD from the lane, the resolution proof, and a fresh nonce; affixes the envelope's weight under that AAD; and seals the payload against it. The Assembler is the reasoner in the correspondence; what it binds, Consensus witnesses.

A **Recipient** is an agent that receives and nothing else. It declares coordinates under at least one profile, holds its own decryption keys, answers its doorbell, opens envelopes with the AAD verified, and acknowledges them when the sender has funded a return receipt. A Recipient needs no stamp. An agent that both sends and receives is a Correspondent that also declares (§1.4).

An **Operator** is the human or organization behind an agent. The Operator is visible to the correspondence: the right to open mail is the right to open mail, and confidentiality terminates at the operating estate (§15). An Operator acting for its agent under HCS-10's operator pattern is delegated authority; mandate lineage for that delegation is an extension (§16).

Every agent generates its own keys. A Correspondent or Recipient MUST generate its private keys in its own process and MUST NOT accept a private key from any other party.
`Conformance:` T-P13-2 — no tool input, schema field, or service endpoint in the suite carries private-key material; key generation in the reference SDK executes in the agent's process.

### 3.4 Registries

A **Registry** is an external, read-only source that a resolution profile queries to turn an address into coordinates and a resolution proof. Registries are typed and plural: the HCS-14 universal agent ID with its HCS-11 declaration and HCS-2 declaration registry (native); a name in the DNS, read at a `_wishmail` leaf (§9.3); a NANDA index; the HOL Registry, supported as one of several and appraised as a downgrade because its answers are not replayable from public data (P-12); and the A2A AgentCard, as an extension (§16). Each is one profile in §9, with a declared trust class.

WISHMail reads registries and adjudicates between none. Where two registries disagree about one address, the envelope names the profile it resolved through and commits that resolution into the AAD; the disagreement is a recorded fact (P-6). Nothing in WISHMail writes to a registry except an agent declaring its own coordinates (§9).

No registry is REQUIRED of any class (P-5; T-P5-1, T-P5-2).

### 3.5 The Postmaster

The **Postmaster** is the service. It issues the stamp and sells it (§4, §14); it pays for and carries submissions to consensus; it relays postmarks; it reconciles on request. The Postmaster is the holder of the stamp's supply key (§4): there is one stamp, and the Postmaster is whoever issues it.

The Postmaster's trust class is that of a **courier**: `math`. It transports bytes and attests nothing. Its compromise can delay a submission; it cannot forge one, because it holds no key that governs any agent's topic, and it cannot forge a postmark, because only Consensus produces one. Nothing the Postmaster says is a postmark (P-2).

The Postmaster pays; the agent signs. A submission to a lane, doorbell, or log MUST be signed by the key that governs that topic, which is the agent's. The Postmaster MAY be the transaction payer and MUST NOT be a signer of that key.
`Conformance:` T-P2-1 — every lane message the suite produces is signed by the sending agent's submit key; a submission bearing only Postmaster keys is rejected at the network.

The Postmaster MUST NOT hold a private key of any agent: not a decryption key, not a topic key, not an account key.
`Conformance:` T-P13-1 — the service's key store and code path contain no agent private-key material; provisioning delivers coordinates, never secrets.

The Postmaster is bound by the universal-service posture of §17. It MUST accept for carriage every envelope that is properly stamped and properly addressed, and MUST NOT distinguish among such envelopes by their content, their sender, their recipient, or the profile they resolved through.
`Conformance:` T-P2-2 — envelopes whose ciphertext is arbitrary bytes are carried identically; T-P5-3 — envelopes resolved through each supported profile are carried identically; T-P4-2 — a Correspondent configured with nothing but stamps and its own keys completes `send` through the reference Postmaster.

The Postmaster's refusal or delay leaves no mark on consensus. What it cannot do is hide a delivery that happened or invent one that did not: every submission that reaches the lane is witnessed, and every first contact that fails leaves an attempted-delivery slip. §15 declares the Postmaster's liveness bound.

The Postmaster holds nothing it does not have to. What it sees, what it keeps, and for how long are stated in §15.

### 3.6 Consensus

**Consensus** is the witness. It orders and timestamps every submission and produces the only object this document calls a postmark. It witnesses that a sealed envelope was submitted, by whom, to which lane, and when; it witnesses nothing about the envelope's content or truth. Its authority rests on having no stake in what any envelope means.

On Hedera, Consensus is the Consensus Service for postmarks and the Token Service for stamps. Under the cross-ledger extension (§16), a postmark carries a ledger tag and the witness is the consensus of the ledger so tagged.

### 3.7 The Verifier

A **Verifier** reconciles: from the topics alone, it reconstructs who posted which envelope to whom and when, replays each proof, looks up each proof's canonical location, and appraises. An **Independent Verifier** is a Verifier that is neither party to the correspondence nor the Postmaster. It is a first-class actor of this specification, not a courtesy: the standard exists so that an Independent Verifier can do this from the specification alone, holding no key, stamp, account, or credential (P-3, P-4; T-P4-1).

The Postmaster's reconciliation has no standing above an Independent Verifier's. For the same topics and the same window, the Postmaster's evidence bundle MUST equal an Independent Verifier's, byte for byte.
`Conformance:` T-P3-1 — replay by a fresh Verifier with no configuration equals the reference Postmaster's bundle for the suite's fixture correspondence.

### 3.8 Payment networks

Payment networks are external. An x402 facilitator settles the USDC leg; the HBAR leg settles on Hedera. At least one leg requires no pre-funded Hedera account (P-16). §14 states the legs.

### 3.9 Parties this specification does not name

This specification names no **Sponsor**. A stamp is a bearer token, unaddressed until affixed; whoever pays for it may hand it to any agent. Provisioning an agent's topics is a Postmaster service whose payer may be anyone, and whose product is coordinates, never secrets (§4, §14). Funding is a payment, not a party.

This specification names no **Herald**. Export of a postmark or return receipt into another standard's attestation slot is an extension (§16).

This specification names no adjudicator. Between registries, between correspondents, and about content, there is none.

---

## 4. The stamp and the two services

### 4.1 The stamp

A stamp is one directed envelope, to one witnessed-resolved address, at one price (P-6, P-10, P-11, read together). Every tool in this document is a verb acting on that noun.

The stamp is one token, `$POSTAGE`: a fungible token on the Hedera Token Service, identified by the token ID pinned below, whose unit is a stamp. Its supply key is held by the Postmaster; the Postmaster is whoever holds it. A stamp is a bearer unit: it belongs to whichever account holds it, whether bought from the Postmaster (§14), collected at a doorbell (§4.4), or received from another agent. A stamp is unaddressed until it is affixed.

```
Network     Stamp token ID     Treasury account
mainnet     [unpinned]         [unpinned]
testnet     [unpinned]         [unpinned]
```

No token other than the stamp is postage. A Postmaster MUST NOT accept, and a Verifier MUST NOT appraise as postage, a settlement made in any other token.
`Conformance:` T-P11-1 — a settlement in any other token is rejected at `send`; at replay it appraises as unstamped.

A claim MUST NOT be made against a specification version whose stamp token is unpinned for the network claimed; `spec/pins.json` records the token ID and treasury beside the standards pins of §1.6.
`Conformance:` T-P9-2.

### 4.2 Weight

An envelope's weight is the postage it requires, in stamps. Weight is a function of the envelope's ciphertext size and of nothing else: not the sender, not the recipient, not the profile, not the content.

```
weight(envelope) = max(1, ceil(ciphertext_bytes / OUNCE_BYTES))
```

`OUNCE_BYTES` is fixed in §7 and pinned with the specification version. An envelope of up to one ounce weighs one stamp; a heavier envelope weighs more, ounce by ounce, at the same price per ounce. Weight is the post office's scale, and it is the only scale: the stamp knows how heavy a letter is and does not know what it says.

An envelope that carries fewer stamps than its weight is postage-due. The Postmaster MUST NOT carry a postage-due envelope, and a Verifier MUST appraise a postage-due envelope as unstamped.
`Conformance:` T-P7-3 — an envelope affixed with fewer stamps than its weight is rejected at `send`; a fixture envelope whose settlement is short appraises as unstamped at replay.

Postage for an envelope is its weight plus the return-receipt fee of one stamp when a return receipt is requested (§6, §10). Excess postage is carried and not returned.

### 4.3 Affixing: how postage is settled

Postage for an envelope is settled by affixing: a single transfer of the envelope's weight in stamps from the sender's account to the treasury. The sender signs the transfer as the owner of the stamps; the Postmaster MAY pay its network fee (D-47). The transfer's memo carries the envelope's AAD hash (§7), so the settlement names the envelope and the envelope names its settlement: the transfer's transaction identifier is the envelope's settlement reference, carried by every chunk.

An envelope MUST be affixed before any chunk of it is submitted — the settlement's consensus timestamp earlier than chunk 0's — by exactly one transfer, signed by the sender, carrying the envelope's AAD hash in its memo.
`Conformance:` T-P7-1 — a chunk submitted with no settlement reference, with one whose memo does not equal the envelope's AAD hash, or with one whose consensus timestamp is not earlier than chunk 0's, is rejected at `send` and appraises as unstamped at replay.

A settlement MUST NOT be claimed by more than one envelope. Where two envelopes carry the same settlement reference, the one whose first chunk has the earlier consensus timestamp is stamped and the other is unstamped.
`Conformance:` T-P7-2 — a second envelope submitted against an already-claimed settlement is rejected at `send`; a fixture pair sharing a settlement appraises as one stamped, one unstamped, by consensus order.

A stamp is affixed when the transfer executes and consumed when the envelope it settles reaches SETTLED (§8). Consumption is a fact of the lane, not a token operation. A settlement whose envelope never reaches the lane is an orphan (F-3): the stamps remain affixed to that envelope and to no other, and the sender may submit that envelope against that settlement at any later time. Nothing is refunded and nothing is lost; the letter is still stamped, still on the counter. The Postmaster MAY burn consumed stamps from its treasury; a burn is bookkeeping and attests nothing.

### 4.4 First contact: the doorbell

An agent's doorbell is not a public forum (P-7). It charges one stamp to ring.

A doorbell MUST carry a HIP-991 custom fee of exactly one stamp, in the stamp token, collected by the treasury. An agent MAY exempt keys from its doorbell's fee.
`Conformance:` T-P7-4 — every fixture doorbell's custom fee is one unit of the pinned stamp token with the treasury as its collector; a connection request submitted without the fee is rejected at the network; a doorbell whose fee names another collector fails provisioning and is not a doorbell any fixture resolves to.

The fee is charged to the transaction payer. Under D-47 the payer is the Postmaster, so a first-contact `send` first transfers one stamp from the sender to the Postmaster — bearer custody in transit, not key custody — and the Postmaster's connection request pays the doorbell's fee to the treasury, where the stamp is consumed (§14.4). The recipient is paid nothing to be knocked on and owes nothing to answer; what it receives is the request. First contact therefore costs one stamp to ring and, once the lane exists, the envelope's weight to send, and every one of those stamps is consumed.

### 4.5 Uniform postage

A stamp costs the same regardless of which registry resolved the recipient (P-11). The Postmaster MUST sell stamps at one published price schedule — a price per stamp, and any price per bundle of stamps — identical for every buyer and independent of any profile, address, or recipient.
`Conformance:` T-P11-2 — `buy_stamp` prices identically across three profiles, three addresses, and two buyers in the suite; postage for a fixture envelope of given weight is identical regardless of the profile it resolved through.

The schedule is published by the Postmaster on consensus (§14.3) and its numbers are not fixed by this specification. Uniformity is what the specification fixes; the number is a decision the specification records as open (Q-6).

### 4.6 Provisioning

An agent needs an account, a doorbell, a log, a manifest topic, and a declaration under at least one profile before it can send or receive. It gets them one of two ways, and a conforming implementation offers both as configuration.

An agent that already holds Hedera keys and an account — in a KMS, a TEE, a wallet, or an environment of its own — brings them: it creates its own topics under HCS-10, declares its own coordinates, and asks the Postmaster for nothing but stamps. This is the self-provisioned path.

An agent that has never touched Hedera is provisioned: it generates its keys in its own process, submits their public halves, and the Postmaster pays to create the account, the doorbell, the log, the manifest topic, and — under the native profile — the declaration registry and profile file, with those keys as their owners. The agent receives coordinates and receives no secret. This is the Postmaster-provisioned path, and it is a paid convenience of carriage, not of custody: in both paths the private keys are born where the agent runs and stay there.

Where a registry anchor admits submissions from any account (§9.5), provisioning MAY prepare the agent's registration for the agent to submit under its own key, as payer, and MAY fund that fee; the agent resolves under `hol` without `blurred` because the account that paid for the registration is the account it names. The registration is the agent's, not the Postmaster's: the Postmaster never signs or submits it.
`Conformance:` T-P13-4 — a fixture provisioned with registration has a `register` operation on the anchor whose payer and `account_id` are both the agent's account, and resolves under `hol` without `blurred`; no registration in the suite is paid by the Postmaster.

A provisioned account, topic, or profile MUST be owned by keys the agent generated. The Postmaster MUST NOT retain any key to it.
`Conformance:` T-P13-1; T-P17-1 — every topic the suite provisions has its admin and submit keys set to the agent's keys per the declared policy, and the policy is recorded at creation.

A first-time CORRESPONDENT needs no funded Hedera account to buy stamps (P-16). A stamp transfer to the agent's public-key alias creates the account that holds them, owned by the agent's key, paid by the Postmaster.
`Conformance:` T-P16-1 — `buy_stamp` succeeds for a buyer with no pre-existing Hedera account; the resulting account is owned by the buyer's key.

Whoever pays for provisioning pays for it (D-48); the product is the same, and so is the custody. The Postmaster MAY price the provisioned path; the price is published beside postage (§14). Provisioning is never required (the first path above), so its price binds no one who brings their own.

### 4.7 The two services

WISHMail is two services, priced on two principles.

**Stamping** is market-dominant, in the vocabulary of PAEA: uniform per stamp, blind to registry, blind to content, capped by publication rather than by negotiation. Every envelope pays its weight and nothing else. Weight is the only tier this specification defines. Service classes — faster, tracked, insured — are declared as a competitive tier and not defined here (Q-11).

**Reconciliation** is competitive. `verify` is free as a verb, forever: anyone may replay the topics and appraise every proof without paying anyone (P-3, P-4). A narrative service — one that assembles the evidence bundle into a reading, hosts it, or vouches for it — MAY charge for the reading. It may not charge for the evidence, because the evidence is public.

Unstamped HCS-10 messaging is not WISHMail's business. Private hands carry what they carry; WISHMail certifies mail, it does not monopolize it (§17).

---

## 5. Data objects and schemas

### 5.1 Conventions

Objects are JSON. Field names are camelCase, except on the wire, where a chunk uses short keys to stay inside one HCS message (§5.6). Binary values are base64url without padding (RFC 4648 §5), as in JOSE. Hedera identifiers appear in their canonical string forms: entities as `0.0.N`, transactions as `0.0.N@seconds.nanos`, consensus timestamps as `seconds.nanos`; a running hash is carried as the mirror node returns it. A ledger tag is `hedera:mainnet` or `hedera:testnet`; any other is defined by an extension that pins the standards its ledger's lanes, manifests, settlements, and anchors ride on (§16.7), and a tag no claimed extension defines names no ledger.

`send` MUST reject an envelope whose AAD names a ledger tag that neither this document nor an extension the release claims defines, and a Verifier MUST appraise such an envelope unbound.
`Conformance:` T-P9-11 — an envelope whose AAD names an undefined ledger tag is rejected at `send` and appraises unbound at replay.

Every hash in this document is SHA-256, written as lowercase hex, computed over the canonical JSON (RFC 8785) of an object with the hash field itself absent. There is no other hashing rule: where the Ontologic notation writes h(R‖I‖O‖M), this document computes SHA-256 over the canonical JSON of `{rule, inputs, output, meaning}`. Concatenation is a notation, not a construction.

The AAD follows the JWE precedent (RFC 7516 §5.1): it is a protected header, and its bytes are the canonical JSON of the header's fields. The AAD hash is SHA-256 over those bytes and is the envelope's identifier.

Two kinds of object appear below. **Authored** objects are produced by an actor and validated against a schema. **Observed** objects are what a Verifier reads off consensus — postmarks, settlements — and are described here so that bundles have one vocabulary; nobody authors them, and their schemas describe rather than constrain.

### 5.2 Proof

Every proof in WISHMail has one shape. §10 fixes what each part contains for each kind.

```
Proof
  rule          {id, revision}           what fired: a profile at its pin, or a
                                          WISHMail rule at this specification's version
  inputs        {digest, locator,        digest of the canonical input bytes; a
                 snapshot?}               structured locator that dereferences to them
                                          (form per §9 / §10); for inputs not on
                                          consensus, a snapshot of the bytes read (§9.1)
  output        {digest} | value         what the rule produced
  meaning       {statement, uri,         the reasoner's statement of what the output
                 trustClass,              means; the canonical location; what its
                 endorsements[]}          verification rests on; what it could not see
  hash          sha256                    over rule, inputs, output, meaning
```

A proof travels by reference: an object that names a proof carries `{hash, uri}`, and the full proof — its manifest — is dereferenced at `uri`, never carried in-band (D-26). Locators and canonical locations are structured, not strings: on Hedera, `{ledgerTag, topicId, sequenceNumber}` names one message and `{ledgerTag, txRef}` names one transaction. The HRL grammar of HCS-1 (`hcs://<standard>/<topicId>`) names files, not messages, and is used only where a standard uses it.

### 5.3 MailCoordinates

Authored by `resolve`; consumed by the Assembler.

```
MailCoordinates
  address          string       the typed address, as resolved
  profile          string       profile identifier (§9)
  ledgerTag        string
  account          string       the agent's account (HCS-10 operator_id; §10)
  doorbell         string       inbound topic
  log              string       outbound topic (optional)
  x25519Pub        base64       current encryption public key
  keyEpoch         integer
  resolutionProof  {hash, uri}
  trustClass       enum         math | economic-game | hardware-TEE | social-committee
  endorsements     [enum]       missing | vague | blurred | stale | timed-out | withheld
  resolvedAt       timestamp    query time, as bound into the proof's inputs
```

### 5.4 StampReceipt and Settlement

`StampReceipt` is authored by `buy_stamp`. `Settlement` is observed: it is the affixing transfer as consensus recorded it (§4.3).

<!-- CHANGED: D-136 -->
```
StampReceipt                            Settlement (observed)
  ledgerTag     string                    ledgerTag           string
  tokenId       string                    txRef               string   settlement reference
  amount        integer   stamps bought   from                string   the sender's account
  txRef         string    the purchase    to                  string   the treasury
  price         {amount, currency}        amount              integer  stamps affixed
  rate?         {source, pair,            memo                string   "wishmail:" + aadHash
                 value, at}               consensusTimestamp  timestamp
  holder        string    account or
                          public-key
                          alias
```

`rate` is present exactly when the method that bought these stamps is priced by reference to another asset (§14.3): `value` is the rate the Postmaster read and `at` is when it read it.

### 5.5 Envelope

The envelope is the assembled object: what the Assembler produces and what a Recipient or Verifier reconstructs from chunks. It is not itself transmitted; its chunks are.

```
Envelope
  ledgerTag         string
  lane              string       connection topic
  profile           string
  resolutionProof   {hash, uri}
  nonce             base64url    16 bytes, fresh per envelope
  aad               bytes        canonical JSON of {p:"wishmail", v, l, lane, rp, nc}
                                  (§7.2)
  aadHash           sha256       over `aad`; the envelope identifier
  keyEpoch          integer      the recipient key epoch sealed against
  ephemeralPub      base64url    the sender's ephemeral X25519 public key
  ciphertextDigest  sha256       over the whole ciphertext
  ciphertextBytes   integer
  weight            integer      stamps (§4.2)
  settlementRef     string       txRef of the affixing transfer
  schemaRef         string       HCS-13 reference (§5.11)
  chunkCount        integer
```

### 5.6 Chunk

The chunk is what travels: one HCS-10 `message` operation whose `data` is the JSON below, at or under one HCS message in size (§7). Every chunk carries enough to place itself; chunk 0 carries the header that lets a reader recover the envelope.

```
Chunk (the value of HCS-10 `data`)
  p     "wishmail"
  s     schemaRef
  id    aadHash            envelope identifier
  i     integer            index, from 0
  n     integer            chunkCount
  d     base64url          this slice of ciphertext
  nx    sha256             digest of chunk i+1's slice; absent on the last chunk
  hdr   (chunk 0 only)
    l   ledgerTag
    pr  profile
    rp  {h, u}             resolutionProof {hash, uri}
    nc  nonce
    ke  keyEpoch
    ep  ephemeralPub
    st  settlementRef
    w   weight
    h   ciphertextDigest   over the whole ciphertext
    cb  ciphertextBytes
    rr  boolean            return receipt requested
```

A reader rebuilds the AAD from `hdr` and the topic the chunk arrived on — the canonical JSON of `{p, v, l, lane, rp: rp.h, nc}` (§7.2), where `v` is the wire string of the minor version the chunk's `s` is registered under (§1.7) — hashes it, and so binds the header to the `id` every chunk carries. The chunks form a chain from the header: chunk 0 is the chunk whose header rebuilds to `id`; each later chunk is the one whose slice hashes to the `nx` of the chunk before it (§7.4). Reassembly walks the chain; completeness is a chain of `n` links; integrity is `hdr.h` over the concatenation of the slices (§11.3).

### 5.7 Postmark (observed)

```
Postmark
  ledgerTag           string
  topicId             string
  sequenceNumber      integer
  consensusTimestamp  timestamp
  runningHash         base64
  runningHashVersion  integer
  envelopeId          sha256      the chunk's `id`
  chunkIndex          integer
```

An envelope has one postmark per chunk. Where a single postmark stands for the envelope — in a return receipt, a narrative, a slip — it is the postmark of chunk 0.

### 5.8 ReturnReceipt

Authored by `ack`; its proof parts and its consensus mechanism are fixed in §10.

```
ReturnReceipt
  envelopeId       sha256        the AAD hash acknowledged
  postmarkRef      {topicId, sequenceNumber}   chunk 0's postmark
  recipient        string        the recipient's operator_id
  keyEpoch         integer       the epoch under which the envelope opened
  proof            {hash, uri}   uri: the manifest's postmark on the recipient's manifest topic
  witness          {ledgerTag, scheduleId, executedTimestamp}   §10.4
```

### 5.9 AttemptedDeliverySlip

Authored by `send` at first contact; every field is observed except `window`.

```
AttemptedDeliverySlip
  ledgerTag              string
  address                string
  profile                string
  resolutionProof        {hash, uri}
  doorbell               string
  connectionRequestSeq   integer
  consensusTimestamp     timestamp     of the connection request
  log                    string        the sender's outbound topic
  logSeq                 integer       the outbound connection_request record
  window                 integer       seconds waited
  endorsement            "timed-out"
```

### 5.10 EvidenceBundle, Narrative, ConformanceClaim

```
EvidenceBundle                                Narrative
  spec           string                         bundleDigest   sha256
  ledgerTags     [string]                       text           string
  window         {from, to}
  topics         [string]                     ConformanceClaim
  correspondence [{                             spec        string
    envelope, state,                            classes     [enum]
    chunks [Postmark],                          profiles    {class: [profileId]}
    offChain [Postmark],                        pins        {standard: pin}
    settlement?, returnReceipt?,                stampToken  {ledgerTag, tokenId, treasury}
    requests [{scheduleId, sequenceNumber,      suite       {version, date, reportDigest}
               consensusTimestamp, status}],    limitations path
    slip?,                                        prices      {ledgerTag, topicId} (§14.3)
    appraisal {                                   extensions  [string] (§16)
      declared   {trustClass, endorsements},
      appraised  {standing, reasons[]},
      resolution {standing, reasons[]},
      receipt    {status, reasons[]}
    }
  }]
  orphans        [Settlement]
  observations   {appraisedAt, mirror, drift[],   not digested; never bears
                  disagreement[], integrity?}     on state or standing (§11.6)
  digest         sha256   over the bundle with `digest` and `observations` absent
```

`state` is one of §8.3's states. `appraised.standing` is one of `verified`, `unverified`, `unstamped`, `unbound`; `resolution.standing` is `verified` or `unverified`; `receipt.status` is one of `acked`, `unclaimed`, `invalid`, `none`; every `reasons` entry names the test whose condition produced it (§11.5). Everything above `observations` is evidence: what consensus recorded, and what any Verifier computes from it identically. `observations` is what a Verifier saw at its own clock — drift, disagreement between surfaces, the time of appraisal, the integrity of the mirror it read — and is excluded from the digest because two Verifiers at two times cannot agree on it (§11.6).

### 5.11 Schemas and the schema registry

Every object in this section, and the declaration of §9.1, has a JSON Schema in `spec/schemas/`, one file per object, tracking this specification: a schema change without a corresponding specification change is not a change to WISHMail (§1.7). The schemas of a minor version (§1.7) are registered under HCS-13 at the revision pinned in §1.6: each as an HCS-1 file registered on an HCS-2 topic that manages the schema's versions. A `schemaRef` is HCS-13's version-pinned resource locator for that registration, `hcs://13/<topicId>#<sequenceNumber>`, where the topic is the HCS-2 topic managing the schema and the sequence number is that of the register operation for the version claimed. The unpinned form, `hcs://13/<topicId>`, names whatever version is latest and is never a `schemaRef`.

Every chunk MUST carry a `schemaRef` that resolves, through HCS-13, to the Chunk schema its release registered, and MUST validate against it.
`Conformance:` T-P9-3 — every fixture chunk's `schemaRef` is of the form `hcs://13/<topicId>#<sequenceNumber>` and resolves through HCS-13 at the pinned revision to a schema whose digest equals the release's shipped `Chunk` schema; every fixture chunk validates; the `Chunk` schema fixes `nx` as a top-level property, required on every chunk but the last and forbidden on the last and inside `hdr`, and `h` inside `hdr` only.

A release MUST NOT ship a schema whose digest differs from the one registered for the specification version it claims.
`Conformance:` T-P9-4 — the digest of each file in `spec/schemas/` equals the digest registered under HCS-13 for the claimed version.

A Verifier that cannot resolve a chunk's `schemaRef` reports `VERIFY_SCHEMA_UNRESOLVED` (F-9) and appraises the envelope as unverified; it does not guess a schema.

---

## 6. The six tools

### 6.1 The surface

WISHMail's tool surface is six verbs acting on one noun. Each tool is defined once, here; every transport that exposes it — a WebMCP page, an MCP server, an SDK, a command line — exposes the same schema.

```
Tool         Used by                        Reads consensus   Writes consensus   Pays
resolve      CORRESPONDENT, VERIFIER        yes               no                 nobody
buy_stamp    CORRESPONDENT | POSTMASTER     yes               yes (HTS)          the buyer
send         CORRESPONDENT | POSTMASTER     yes               yes (HCS, HTS)     the sender, in stamps;
                                                                                  the Postmaster, in fees
inbox        RECIPIENT, CORRESPONDENT       yes               no                 nobody
ack          RECIPIENT | POSTMASTER         yes               yes (HCS)          the sender, in advance
verify       VERIFIER                       yes               no                 nobody
```

A release that exposes the tool surface over more than one transport MUST expose the same tool schema on each.
`Conformance:` T-P15-4 — the tool schemas served by every transport in the release are identical after canonicalization.

Every consensus operation a tool submits MUST carry the transaction memo HCS-10 defines for that operation, and MUST carry none where HCS-10 defines none: at the pinned revision, `connection_request`, `connection_created`, `message`, and `close_connection` carry `hcs-10:op:<operation>:<topic type>`, and the `transaction` operation carries no memo.
`Conformance:` T-P9-5 — every HCS transaction the suite produces for an operation HCS-10 gives a memo carries it, of the form `hcs-10:op:{n}:{n}` matching the operation and the topic type of HCS-10's transaction-memo table; every `transaction` operation the suite produces carries an empty memo.

Failure codes are `TOOL_REASON`, uppercase, fixed below. A failure is returned only when the tool cannot produce its object. Where a tool can produce its object with a caveat, it returns the object and an endorsement (P-12); it does not fail.

### 6.2 resolve

Turn an address into coordinates and a resolution proof under a named profile.

```
resolve(address, profile?) -> MailCoordinates
```

Preconditions: `address` is well-formed for at least one profile the implementation supports; if `profile` is given, the address is of that profile's kind.

Behavior: the profile's rule (§9) is applied to the address at the current time; the registry's canonical answer is captured as the proof's inputs; coordinates are the output; the proof's meaning names the profile, its trust class, and any endorsements the rule assigns. `resolve` reads and pays nothing: it may be called by anyone, including a Verifier re-resolving during appraisal.

Postconditions: `MailCoordinates` with a resolution proof whose hash is computed and whose manifest is returned to the caller. The proof's `uri` is empty until `send` publishes the manifest (§6.4).

Failures: `RESOLVE_UNSUPPORTED_ADDRESS` (no supported profile accepts the address); `RESOLVE_PROFILE_MISMATCH`; `RESOLVE_NOT_FOUND` (the registry answers and has no record); `RESOLVE_REGISTRY_UNREACHABLE` (no answer within the profile's timeout). A stale, vague, or partially withheld answer is not a failure: it is coordinates with an endorsement.

`Conformance:` T-P5-1, T-P5-2; T-P6-1 — a resolution proof whose inputs are altered after resolution no longer hashes to the proof; T-P12-1 — a registry answer the rule cannot fully verify yields coordinates with the endorsement the rule assigns, never a failure and never a silent upgrade.

### 6.3 buy_stamp

Buy stamps from the Postmaster.

```
buy_stamp(count, payment, holder) -> StampReceipt
  payment   {method: "x402-usdc" | "hbar", ...}
  holder    {account} | {publicKey}
```

Preconditions: `count` ≥ 1; `payment.method` is one the Postmaster publishes (§14).

Behavior: the payment leg settles; the Postmaster transfers `count` stamps to `holder`. Where `holder` is a public key with no account, the transfer creates the account owned by that key (§4.6). `buy_stamp` blocks until the transfer has a consensus timestamp.

Postconditions: `count` stamps in the holder's account; a `StampReceipt` whose `txRef` is the transfer.

Failures: `STAMP_PAYMENT_FAILED`; `STAMP_PAYMENT_UNSETTLED` (paid, transfer not yet witnessed within the tool's wait; the receipt is recoverable by the payment reference); `STAMP_HOLDER_INVALID`; `STAMP_METHOD_UNSUPPORTED`.

`Conformance:` T-P11-2, T-P16-1.

### 6.4 send

Send one sealed envelope to one resolved address.

```
send(coordinates, payload, returnReceipt = false, window?) -> Postmark | AttemptedDeliverySlip
```

Preconditions: `coordinates` carry a resolution proof; the sender holds at least the envelope's postage in stamps, plus one stamp if no lane exists to the recipient; `payload` is bytes.

Behavior, in this order:

1. **Lane.** If no lane exists between sender and recipient, `send` rings the doorbell: one stamp passes to the Postmaster, the Postmaster submits the HCS-10 connection request paying that stamp as the doorbell's fee, and `send` waits up to `window` for the recipient to answer. If the lane is created, `send` continues. If the window closes, `send` returns an `AttemptedDeliverySlip` and stops; the slip is a result, not a failure (F-6).
2. **Manifest.** The sender publishes the resolution proof's manifest on its manifest topic; the message's locator becomes the proof's `uri`.
3. **Assembly.** The Assembler chooses a nonce, builds the AAD, seals the payload against it, and chunks the ciphertext (§7). The envelope's weight and postage are computed.
4. **Affix.** The sender transfers the envelope's postage in stamps to the treasury under the memo `wishmail:` + `aadHash`, signing as the stamps' owner; the transfer's `txRef` is the settlement reference (§4.3).
5. **Submit.** Every chunk is submitted to the lane as an HCS-10 `message` operation, signed by the sender's submit key, paid by the Postmaster, in index order.
6. **Settle.** `send` blocks until every chunk has a consensus timestamp.
7. **Receipt request.** When `returnReceipt` is true, `send` creates the scheduled receipt submission of §10.4 and posts the HCS-10 `transaction` operation naming it on the lane.

`send` then returns chunk 0's `Postmark` (D-30). When `returnReceipt` is true, postage includes the receipt fee, and chunk 0's header requests the receipt (§10).

Postconditions on `Postmark`: the envelope is SETTLED (§8); its stamps are consumed; its manifest is on the sender's manifest topic; its settlement is on the ledger with the AAD hash in its memo. Postconditions on `AttemptedDeliverySlip`: the connection request is on the doorbell and on the sender's log with consensus timestamps; one stamp has been consumed by the treasury as the doorbell's fee (§4.4); no envelope was assembled and no postage affixed.

Failures: `SEND_UNRESOLVED` (coordinates carry no proof); `SEND_INSUFFICIENT_STAMPS`; `SEND_TOO_HEAVY` (weight exceeds `MAX_WEIGHT`, §7); `SEND_STALE_KEY` (the coordinates' key epoch is no longer current; re-resolve; F-8); `SEND_LANE_INVALID` (the named lane is closed, carries a custom fee, or was not created from the doorbell the coordinates name; §7.1); `SEND_AFFIX_FAILED` (nothing submitted, nothing consumed); `SEND_SUBMIT_FAILED` (affixed, not fully submitted: the envelope is an orphan or partial; it may be resubmitted against the same settlement, D-52); `SEND_SETTLE_TIMEOUT` (submitted, not all chunks witnessed within the tool's wait; the envelope's state is recoverable by `verify`).

`Conformance:` T-P7-1, T-P7-2, T-P7-3, T-P9-5; T-P10-1 — an envelope with no resolution proof, or whose AAD does not name the lane it is submitted to, is rejected at `send` and appraises as unbound at replay; T-P14-1 — no tool call by one agent waits on an act of another except a first-contact `send`, which returns a slip when its window closes.

### 6.5 inbox

Read the caller's lanes; open what binds.

```
inbox(since?, lane?) -> [Delivery]
  Delivery   {envelope, opened: bool, payload?, reason?, returnReceipt?}
```

Preconditions: the caller holds the decryption keys for the epochs of the envelopes it will open.

Behavior: `inbox` reads the caller's lanes from consensus, reassembles each envelope by its chain (§11.3), and for each complete envelope: rebuilds the AAD from the header and the lane and checks it against `id`; fetches the settlement by `settlementRef` and checks that its memo carries `id` and its amount covers the postage; and decrypts against the AAD under the key of the envelope's epoch. An envelope that passes opens. An envelope that fails any check is returned unopened with a reason. For a Recipient, a delivery whose header requests a receipt carries the pending schedule from the lane's `transaction` operation, so that `ack` can sign it. For a Correspondent, `inbox` also returns the return receipts that have arrived for envelopes it sent.

`inbox` writes nothing. Reading a lane leaves no mark on it (blind delivery, D-29).

Reasons on an unopened delivery: `INBOX_INCOMPLETE` (chunks missing; F-4); `INBOX_UNBOUND` (the AAD does not verify: header, lane, or resolution proof do not agree with `id`; P-1); `INBOX_UNSTAMPED` (no settlement, memo mismatch, or postage due; P-7); `INBOX_EPOCH_UNKNOWN` (no key for the epoch); `INBOX_SCHEMA_UNRESOLVED` (F-9). None of these is a failure of the tool.

Failures: `INBOX_MIRROR_UNREACHABLE`.

`Conformance:` T-P1-1 — an envelope whose header, lane, or resolution proof is altered fails closed and is returned `INBOX_UNBOUND`; T-P1-2 — an envelope whose settlement memo does not equal its `id` fails closed and is returned `INBOX_UNSTAMPED`; T-P8-1 — an envelope sealed under a retired epoch still opens with the retained key.

### 6.6 ack

Acknowledge an envelope that opened: produce its return receipt.

```
ack(envelopeId) -> ReturnReceipt
```

Preconditions: the envelope opened in the caller's `inbox` with its AAD verified; the sender requested and funded a return receipt; the envelope has not been acknowledged.

Behavior: `ack` reads the pending schedule the lane's `transaction` operation names, checks that the scheduled receipt names the envelope identifier, chunk 0's postmark, and the epoch the envelope opened under, and signs it (ScheduleSign). Execution publishes the receipt's manifest on the recipient's manifest topic (§10.4). The sender funded it; the recipient pays nothing.

Postconditions: the receipt is witnessed; the envelope is ACKED (§8).

Failures: `ACK_NOT_OPENED` — a recipient cannot acknowledge what did not bind; `ACK_NOT_REQUESTED`; `ACK_DUPLICATE`; `ACK_SUBMIT_FAILED`.

`Conformance:` T-P1-3 — `ack` refuses an envelope that was returned unopened, for every reason in §6.5.

### 6.7 verify

Reconcile a correspondence from consensus alone.

```
verify(scope, window?, narrative = false) -> EvidenceBundle (+ Narrative)
  scope   {lane} | {envelopeId, lane} | {topics: [...]}
```

Preconditions: none. `verify` requires no key, stamp, account, or credential (P-4).

Behavior: §11. `verify` reads the topics in scope, reassembles, replays every proof it can, looks up every canonical location, and appraises. The bundle is deterministic: the same topics and window yield the same bundle, byte for byte, from any Verifier (P-3).

Postconditions: an `EvidenceBundle`; a `Narrative` if requested. Nothing is written.

Failures: `VERIFY_MIRROR_UNREACHABLE` (no consensus data, no bundle); `VERIFY_SCOPE_INVALID`. `VERIFY_SCHEMA_UNRESOLVED` (F-9) is an appraisal on an envelope, not a failure of the tool. Every other condition a Verifier can meet is an appraisal: a standing of verified, unverified, unstamped, or unbound, with the reasons that produced it named beside it — postage due is a reason under unstamped, a receipt that expired unsigned is unclaimed, and a first contact that went unanswered is a slip endorsed timed-out (§11.5). Appraisal never exceeds what was declared and never raises an error where a downgrade will do (P-12).

`Conformance:` T-P3-1, T-P4-1; T-P12-2 — for every fixture, `appraised` is at or below `declared`, and no fixture produces a tool failure for a condition that has an appraisal.

---

## 7. Envelope and binding

### 7.1 The lane

A lane is an HCS-10 connection topic. It exists between exactly two agents — the requester and the acceptor — from the consensus timestamp of the acceptor's `connection_created` operation until a `close_connection` operation from either party, and it is identified by its ledger tag and topic ID.

A lane is created by the acceptor in answer to a connection request on its doorbell, per HCS-10 at the pinned revision. Its submit key is a threshold key of the two agents' keys. Its admin key is set at creation per the acceptor's declared topic policy (P-17); no key of the Postmaster appears on it (D-47). It carries no custom fee. Its memo is HCS-10's connection-topic memo, which marks the topic non-indexed: a hint to HCS-10 readers that only the latest message matters. The hint is HCS-10's; the reading rule is this document's. A lane is mail, and every message on it is read.

An Inbox and a Verifier MUST read every message on a lane in scope, whatever the lane's memo indicates.
`Conformance:` T-P9-10 — a fixture lane whose memo carries HCS-10's non-indexed flag and holds an envelope of `n` chunks is fully reassembled by `inbox` and by the VERIFIER suite.

A lane's submit key MUST be a threshold of the two agents' keys and MUST NOT include any other key. An agent that creates a lane MUST create it with no custom fee.
`Conformance:` T-P17-2 — every fixture lane's submit key is a threshold of exactly the two agents' keys, and its admin key matches the acceptor's declared policy; T-P11-3 — every fixture lane carries no custom fee, and `send` returns `SEND_LANE_INVALID` for a lane that does.

Between two agents there may be more than one lane. The lane between a sender and a recipient — for `send`, for `inbox`, and for reconciliation — is the earliest-created open lane between them, creation time being the consensus timestamp of the `connection_created` operation on the recipient's doorbell that names the sender's account. For `send`, only a lane whose submit key includes the sender's current key counts; a lane keyed to a key the sender no longer holds is, for that sender, no lane (§7.6). A sender MAY name a different open lane explicitly; an envelope binds to the lane its AAD names, whichever that is. A Verifier discovers the lanes between two agents by the same rule, from the same doorbell.

The lane an envelope binds to MUST have been created in answer to a connection request on the doorbell its resolution proof yielded. An envelope MUST NOT be submitted on a closed lane.
`Conformance:` T-P10-2 — `send` refuses, and replay appraises unbound, an envelope whose lane's `connection_created` is not on the doorbell its coordinates name; T-P9-6 — `send` returns `SEND_LANE_INVALID` for a lane with a `close_connection` at or before submission, and replay appraises such an envelope unbound.

A lane is bidirectional: either party sends on it. The sender of a chunk is the agent whose key signed its submission, identified by the `operator_id` of the HCS-10 operation; no header field names a sender. What travels on a lane is chunks, as HCS-10 `message` operations; return receipts, by the mechanism of §10; and HCS-10's own connection operations. Nothing else this document defines. A lane's history persists after closure: a closed lane is replayable and unwritable.

### 7.2 The AAD and binding

The AAD is the envelope's protected header. Its bytes are the canonical JSON (RFC 8785) of

```
{ "p": "wishmail", "v": "0.5",
  "l": ledgerTag, "lane": topicId,
  "rp": resolutionProofHash, "nc": nonce }
```

and its SHA-256 is the envelope identifier, `id`. The nonce is 16 bytes from a cryptographically secure source, fresh for every envelope; it is not the AEAD nonce, which sealing derives, and its only job is that no two envelopes share an identifier.

The AAD names the lane and the resolution proof. The settlement's memo names the AAD. That is P-1 as this document states it: an envelope's AAD names its lane and its resolution proof, its settlement names its AAD, and decryption MUST fail closed if the AAD does not verify or if the settlement the envelope names does not carry its AAD hash.
`Conformance:` T-P1-1, T-P1-2; T-P1-4 — `spec/vectors/aad.json` gives header fields, AAD bytes, and `id` for fixture envelopes, and every class recomputes them exactly.

An envelope so bound is welded four ways: to the lane it was submitted on (an envelope on any other topic is unbound), to the resolution that led there (an envelope whose resolution proof was forged, altered, or swapped is unbound), to the postage that carried it (an envelope whose settlement does not name it is unstamped), and to the account that paid. A misresolved, misdirected, or unpaid envelope does not open.

The fourth weld is how a sender is known. A lane's submit key is a threshold of two agents' keys, and consensus records that one of them signed, not which; but the settlement is a token transfer out of one account, and the network accepted it only under that account's key, with this envelope's identifier in its memo. The sender of an envelope is therefore the account that affixed its postage — a fact the recipient cannot forge, a Verifier reads from public data, and no later change of the sender's keys can unmake.

The `operator_id` of every chunk MUST name the account from which the envelope's postage was affixed.
`Conformance:` T-P1-6 — an envelope whose chunks' `operator_id` account differs from its settlement's `from` account is returned `INBOX_UNBOUND` at `inbox` and appraises unbound at replay.

### 7.3 Sealing

Sealing is HPKE (RFC 9180), base mode, single-shot, with the ciphersuite DHKEM(X25519, HKDF-SHA256), HKDF-SHA256, AES-256-GCM:

```
(enc, ct) = Seal(pkR, info, aad, payload)
  pkR      the recipient's X25519 public key at the epoch the coordinates carry
  info     ASCII "wishmail/0.5/seal"
  aad      the AAD bytes of §7.2
  enc      -> ephemeralPub (32 bytes)
  ct       -> the ciphertext; ciphertextDigest = SHA-256(ct); ciphertextBytes = |ct|
```

Opening is `Open(enc, skR, info, aad, ct)` under the private key of the epoch the header names, and fails closed on any authentication error.

A CORRESPONDENT MUST seal with this ciphersuite and a RECIPIENT MUST open with it; an envelope MUST NOT be opened by any other means.
`Conformance:` T-P1-5 — `spec/vectors/seal.json` gives HPKE test vectors for fixture envelopes; the reference seals and an independent implementation opens, and the reverse.

One AEAD operation covers the whole payload; chunking is of the ciphertext, not of the plaintext. No forward secrecy is claimed: the private key of an epoch opens every envelope sealed against it (§15).

Sealing uses no long-term key of the sender. Base mode generates a fresh ephemeral X25519 key for every envelope and discards it; `ephemeralPub` is its public half and nothing else identifies the sender inside the seal. A CORRESPONDENT therefore has no encryption key to rotate, and sender rotation is not a case the seal must support: every envelope is already under a key that was born and retired for it. What identifies the sender is the fourth weld of §7.2, not the seal. A Correspondent that also receives holds a recipient key, and rotates it as a recipient does (§7.6).

### 7.4 Chunking

The ciphertext is sliced in order into chunks. Chunk 0 carries the header (§5.6), including the digest of the whole ciphertext; every chunk carries the identifier, its index, and the count; every chunk but the last carries the digest of the next slice.

The chunks are chained from the header. Chunk 0's header is bound to `id` by the AAD, and no party but the sender can produce a header that rebuilds to it. Chunk 0 commits chunk 1's slice by digest; chunk 1 commits chunk 2's; and so on to the last. A slice that the chunk before it did not commit is not of the envelope, whenever and by whomever it was submitted. The chain is what makes reassembly a computation on bytes rather than on clocks (§11.3): on a lane, either party can submit a chunk bearing the other's identifier, and the chain is why that submission is nothing.

Every chunk on the wire — the entire HCS-10 `message` operation, as UTF-8 JSON — MUST NOT exceed `CHUNK_WIRE_MAX` = 1000 bytes, and MUST be submitted as one HCS message with no transport-layer chunking. HCS-10 draws its line at one kilobyte and delegates anything larger to HCS-1; WISHMail stays under that line and does not delegate.
`Conformance:` T-P9-7 — every fixture message is at most 1000 bytes, carries no `chunkInfo`, and its `data` parses as a Chunk.

Every chunk of index `i < n − 1` MUST carry `nx` equal to the SHA-256 of chunk `i + 1`'s slice, and the chunk of index `n − 1` MUST NOT carry `nx`.
`Conformance:` T-P1-11 — a chunk whose `nx` is absent, or does not equal the next slice's digest, is rejected at `send`; in a fixture where a chunk bearing the envelope's `id` and index but a foreign slice reaches consensus before the sender's, the sender's chunk is canonical, the foreign chunk is recorded off-chain, and the envelope opens; a complete envelope whose slices do not concatenate to `hdr.h` is returned `INBOX_UNBOUND` and appraises unbound.

A chunk carries as much ciphertext as its budget allows; the budget depends on identifier lengths and is not fixed by this document. With the reference wrapper — the HCS-10 `message` operation carrying the Chunk as a JSON string in `data` — with mainnet-length identifiers, chunk 0 carries about 170 bytes of ciphertext, a middle chunk about 510, and the last chunk, which carries no `nx`, about 565; the figures are informative. Chunks may reach consensus in any order; reassembly is by the chain (§11.3).

### 7.5 Weight

```
OUNCE_BYTES  = 4096       ciphertext bytes per ounce
MAX_WEIGHT   = 16         ounces; 65,536 bytes of ciphertext
weight       = max(1, ceil(ciphertextBytes / OUNCE_BYTES))
postage      = weight + (rr ? 1 : 0)
```

An envelope heavier than `MAX_WEIGHT` is not sent (`SEND_TOO_HEAVY`, §6.4). What does not fit in an envelope is referenced from inside one.

### 7.6 Key epochs

The Assembler seals against the recipient key of the epoch its coordinates carry and writes that epoch in the header. An agent that declares MUST retain the private key of every epoch it has ever published, and MUST open an envelope under the key of the epoch its header names.
`Conformance:` T-P8-1; T-P8-2 — after a fixture recipient rotates, an envelope sealed against the prior epoch opens, and an envelope sealed against the new epoch opens.

A new epoch is announced by declaring new coordinates with the epoch incremented, under every profile the recipient declares (§9). A sender holding coordinates whose epoch is no longer the recipient's current one is stale (F-8); its envelope still opens.

Epochs rotate the encryption key. The account key — the Hedera key that signs submissions and settlements — is a different key, and its rotation is a different matter. Topic keys on Hedera are literal: a lane's threshold key names the two keys it was created with and does not follow an account whose key later changes. An agent that rotates its account key can still read every lane, and every envelope it ever affixed is still attributed to it (§7.2), but it can no longer submit on lanes keyed to the old key: a sender rings the doorbell again and gets a new lane; a recipient answers new rings and can no longer acknowledge on old lanes. The old lanes remain open in HCS-10's sense and replayable forever; for the rotated party they are no lane (§7.1). §15 states this limitation.

### 7.7 The receipt request

Chunk 0's `hdr.rr` = true requests a return receipt. Postage then includes the receipt fee (§4.2, §7.5). A recipient SHOULD acknowledge only envelopes whose header requests it; an unrequested receipt nevertheless counts (§8.6).

---

## 8. State machine

### 8.1 Principles

A state in this document is a fact on consensus. With one exception — DRAFT, which lives only in the Assembler — every state an envelope or a lane can be in is computable by anyone from public data, and two Verifiers computing it from the same data compute the same state (P-3). No state is a belief held by a party; no state is a message a party sends about itself.

Two axes, not one. An envelope has a **state** — how far it has travelled — and a **standing** — whether what travelled binds (§5.10, §11). The state machine below is the first axis. An envelope can be fully SETTLED and unstamped; a receipt can be witnessed and invalid. The two axes are computed separately and reported together.

Consensus time is the only clock. Every transition is dated by the consensus timestamp of the event that caused it; no party's wall clock appears anywhere. States are monotone: nothing moves backward, and no later event unmakes an earlier fact. A closed lane is still a lane that was open; a rotated key still affixed what it affixed.

There are two machines. The **lane** has a lifecycle, and the envelope's machine depends on it; the **envelope** has a lifecycle, and reconciliation reads it. Stamps, being fungible, have no individual lifecycle; the settlement that affixes them is the object with a state, and it is folded into the envelope's.

### 8.2 The lane

```
   NONE ----ring----> REQUESTED ----answer----> OPEN ----close----> CLOSED
            (sender)              (recipient)          (either party)
```

```
State       Fact on consensus                                        Evidence
NONE        no connection request from this sender on this doorbell   —
REQUESTED   an HCS-10 connection_request from the sender's account    the doorbell message and its
            has a consensus timestamp on the recipient's doorbell,    consensus timestamp; the
            and the doorbell's fee was paid                           sender's log entry
OPEN        an HCS-10 connection_created naming that request has a    the doorbell message; the
            consensus timestamp on the doorbell, and the connection   connection topic
            topic it names exists
CLOSED      an HCS-10 close_connection from either party has a        the lane message
            consensus timestamp on the lane
```

REQUESTED does not expire. The attempted-delivery slip is not a state of the lane; it is an observation of the lane in REQUESTED at the sender's window's end (§5.9). A lane that opens after the window was closed is OPEN, and the slip that was issued remains true of the time it describes: expiry is not silence, and silence is not refusal (F-6).

A recipient MAY leave a request unanswered forever; nothing in this document obliges an answer. Between two agents there may be several lanes, each with its own machine; §7.1 says which one is *the* lane.

### 8.3 The envelope

```
                        ASSEMBLY                         DELIVERY        RECONCILIATION
   +-------+  affix   +---------+  first chunk  +-----------+  nth chunk  +---------+  receipt  +-------+
   | DRAFT | -------> | STAMPED | ------------> | SUBMITTED | ----------> | SETTLED | --------> | ACKED |
   +-------+          +---------+               +-----------+             +---------+           +-------+
   local only         settlement                partial                   delivered            receipted
                      witnessed                 (F-4 until nth)           to the lane
                         |                                                    |
                         '---- no chunk ever: ORPHAN (an observation, F-3)    '---- no receipt: blind (D-29), terminal
```

```
State       Fact on consensus                                             Evidence                    Standing possible
DRAFT       none; the Assembler holds a sealed, chunked envelope           —                           —
STAMPED     a token transfer to the treasury carries the memo             the settlement (§5.4)       verified
            wishmail:<id> and has a consensus timestamp
SUBMITTED   at least one chunk with this id has a consensus timestamp     one or more postmarks       any
            on the lane the id names, and fewer than n do
SETTLED     n distinct chunks with this id have consensus timestamps      n postmarks                 any
            on the lane
ACKED       a return receipt for this id is witnessed after the nth       the receipt's witness       verified,
            chunk (§10)                                                    (§10)                       unverified
```

```
Transition               Actor          Tool         Caused by                          Dated by
DRAFT -> STAMPED         sender         send (4)     the affixing transfer reaches      the settlement's
                                                     consensus                          consensus timestamp
STAMPED -> SUBMITTED     sender         send (5)     chunk 0, or any chunk, reaches     that chunk's consensus
                                                     consensus on the lane              timestamp
SUBMITTED -> SETTLED     sender         send (5-6)   the last missing chunk reaches     the nth chunk's
                                                     consensus                          consensus timestamp
SETTLED -> ACKED         recipient      ack          the receipt is witnessed           the witness's
                                                                                        consensus timestamp
```

An envelope MUST NOT enter SUBMITTED except from STAMPED: no chunk of a conforming envelope is submitted before its settlement has reached consensus.
`Conformance:` T-P7-1.

A receipt MUST NOT move an envelope to ACKED unless the envelope is SETTLED at the receipt's consensus timestamp and its standing is verified or unverified.
`Conformance:` T-P1-7 — fixture receipts witnessed before the nth chunk, or for envelopes standing unstamped or unbound, leave the envelope's state unchanged and are reported as invalid receipts.

SETTLED is terminal for a blind envelope; ACKED is terminal. There is no state after ACKED: reconciliation does not change an envelope, and any number of Verifiers may reconcile the same envelope any number of times. Being reconciled is not a state of the envelope; it is the existence of a reading (§11), and readings are not on consensus. A reading becomes a fact only if a Verifier emits it to consensus under its own account — an attestation. This version defines no such verb; §16 describes the extension, and an envelope so attested would have a state after ACKED.

### 8.4 The three acts on the machine

Assembly is DRAFT through the submission of the last chunk: everything the sender does. Delivery is the instant of SETTLED: what consensus does, to the lane, never to a hand. Reconciliation is what a Verifier does to any state at any time; it reads the machine and writes nothing to it (D-45).

### 8.5 Deriving state from evidence

A Verifier computes the state of an envelope from the lane, the settlement, and the receipt. The computation is fixed here so that every Verifier makes the same call.

**The canonical chunk.** The canonical chunk 0 is the earliest chunk with `(id, 0)` whose header rebuilds to `id` (§5.6). For each `i` from 1, the canonical chunk is the earliest chunk with `(id, i)` whose slice hashes to the canonical chunk `i − 1`'s `nx`. Every other chunk with the same `(id, i)` is off the chain — a duplicate if its bytes equal the canonical chunk's, a foreign chunk otherwise — and is recorded in the bundle and ignored for reassembly, whatever its consensus timestamp. Until a canonical chunk 0 exists, no chunk of `id` is canonical; such chunks are recorded as unrooted. The envelope's `n` is chunk 0's; a chunk whose `n` differs from chunk 0's is a conflicting chunk: recorded, and not of this envelope.

**The settlement.** The settlement is the transaction chunk 0's `st` names. It counts only if it exists, its memo is `wishmail:<id>`, its `to` is the treasury, and its consensus timestamp is earlier than chunk 0's. A settlement that fails any of these is, for this envelope, no settlement; the envelope's standing is unstamped, and its state is computed from its chunks alone.

**The receipt.** The receipt is the earliest witnessed receipt for `id`; later receipts are duplicates, recorded and ignored. A receipt counts only under §8.3's rule.

**The state.** Given the canonical chunks, the counted settlement, and the counted receipt:

```
Evidence                                          State        Note
settlement only, no chunk on the lane             STAMPED      an orphan (F-3); reported under settlements
1..n-1 canonical chunks                           SUBMITTED    partial (F-4)
unrooted chunks only (no canonical chunk 0)       SUBMITTED    partial; n unknown
n canonical chunks                                SETTLED
n canonical chunks and a counted receipt          ACKED
chunks with no counted settlement                 SUBMITTED    standing: unstamped
                                                  or SETTLED
chunks whose AAD, lane, or operator_id do not      SUBMITTED    standing: unbound; state still
agree with id (§7.2)                               or SETTLED   describes what landed
```

A Verifier MUST compute state and standing by this section, and two Verifiers MUST agree.
`Conformance:` T-P3-2 — a fixture corpus containing an orphan, a partial envelope, an unrooted chunk, a foreign chunk that reached consensus before the sender's, a duplicate chunk, a conflicting `n`, a late settlement, an envelope on a closed lane, a duplicate receipt, and a receipt before the nth chunk yields identical `(state, standing)` from the reference and from an independent Verifier; T-P3-3 — reassembly of the corpus walks the chain — chunk 0 by its header, each later chunk by the prior's `nx` — takes the earliest chunk the chain admits at each index, and records every off-chain, unrooted, and conflicting chunk without using it.

### 8.6 What can go wrong, and what the machine says about it

**An orphan** is STAMPED with no chunk. It is not an error and it does not expire: the sender that holds the envelope may submit it at any later time against the same settlement (D-52). Nothing on consensus can reconstruct an orphan's chunks; only the sender can resume it. An orphan whose lane closes cannot be resumed on that lane, and its AAD names no other; its postage is affixed to a letter that will never be mailed.

**A partial envelope** is SUBMITTED. The sender resumes by submitting the missing chunks; the recipient's `inbox` returns it unopened as `INBOX_INCOMPLETE` until the nth chunk lands. A partial envelope whose lane closes stays partial: chunks submitted after `close_connection` are unbound (§7.1), and the envelope never reaches SETTLED.

**A late settlement** — one whose consensus timestamp is not earlier than chunk 0's — does not count. The envelope is unstamped. Paying after posting is not postage.

**A stray chunk** carries an `id` whose AAD names a different lane, or an `operator_id` whose account is not the settlement's `from`. It is not of any envelope on this lane; it is recorded as unbound.

**A receipt out of order** — before the nth chunk, or for an envelope that is unstamped or unbound — is an invalid receipt. It is recorded; the envelope's state does not change. A recipient cannot acknowledge what did not bind, and consensus records the attempt.

**A receipt nobody asked for** — for an envelope whose header did not request one — counts. The recipient chose to sign; consensus witnessed it; the envelope is ACKED and the bundle notes that the receipt was unrequested.

**Key rotation mid-flight.** A recipient's epoch rotation between SETTLED and open changes nothing: the retained key opens the envelope (§7.6). A sender's account-key rotation between STAMPED and SETTLED strands the envelope: its AAD names a lane the sender can no longer sign, and a new lane would need a new envelope. Its postage is not returned.

**A closed lane** does not close the envelopes on it. Every envelope SETTLED before `close_connection` is SETTLED; every receipt witnessed before it counts. What closure ends is submission, not history.

### 8.7 Resumption

`send` resumes rather than restarts. A CORRESPONDENT MUST retain an envelope from DRAFT until SETTLED, and a retried `send` for a STAMPED or SUBMITTED envelope MUST submit the missing chunks against the existing settlement and MUST NOT affix again.
`Conformance:` T-P7-5 — after `SEND_SUBMIT_FAILED` or `SEND_SETTLE_TIMEOUT`, a retried `send` produces no second settlement, submits only the chunks not yet witnessed, and returns the same postmark.

Retries are idempotent because chunks are: a resubmitted `(id, i)` whose original landed becomes a duplicate and is ignored. A sender that has lost the envelope has lost the ability to resume it.

### 8.8 Postage through the machine

Informatively, a stamp's life: issued by the Postmaster into circulation; held by an account; affixed to one envelope by the settlement (STAMPED); consumed when that envelope is delivered (SETTLED); optionally burned from the treasury afterward. Fungible units have no serial, so "this stamp" means "the postage this settlement affixed," and the settlement is what the machine tracks.

---

## 9. Resolution profiles

### 9.1 What a profile is

A resolution profile is a named rule, at a pinned revision, for turning an address into coordinates and a resolution proof, with a declared trust class. Each profile in this section fixes: its identifier; the addresses it accepts; the rule; the inputs, where they are located, and whether they must be snapshotted; the output; the declaration — trust class and the endorsements the rule can assign; how a recipient declares under it; its TTL; and its failures. Profiles are plural and none is required (P-5); WISHMail reads through them and adjudicates between none (P-6).

**One declaration, three surfaces.** An agent declares the same object under every profile it uses:

```
Declaration (what an agent publishes)
  v            1
  ledgerTag    string
  account      string      the recipient's Hedera account
  doorbell     string      its HCS-10 inbound topic
  log          string      its HCS-10 outbound topic (optional)
  manifestTopic string     its manifest topic (§9.1)
  x25519Pub    base64url   its current encryption key
  keyEpoch     integer
```

The native profile takes `account`, `doorbell`, and `log` from the HCS-11 profile itself and `manifestTopic`, `x25519Pub`, and `keyEpoch` from `properties.wishmail`; the other surfaces carry the whole object. A Verifier MAY report that two surfaces disagree about one account (§11); no profile reads another to resolve.

**Inputs on consensus and inputs off it.** Where a profile's inputs are on consensus, its locator re-obtains them forever and its trust class is `math`. Where they are not — a DNS answer, an HTTPS document — the manifest MUST carry a snapshot of the bytes the rule read, so that the proof's hash is recomputable from the manifest alone and what was read is witnessed; a Verifier that can re-obtain the input now reports agreement or drift (F-5), and one that cannot appraises from the snapshot and reports the proof unverified.
`Conformance:` T-P6-2 — for each profile, a fixture resolution's manifest recomputes to its hash from its locator (consensus profiles) or its snapshot (the others); a manifest for a non-consensus profile with no snapshot is rejected at `send`.

**The manifest topic.** Every agent has a manifest topic: an HCS topic of its own, created at provisioning, whose memo is `wishmail:manifest:1` and whose sole submit key is the agent's. A sender publishes the resolution proof's manifest there before assembly, as a message whose body is the manifest, `{p: "wishmail", t: "manifest", ...proof}`; the message's `{ledgerTag, topicId, sequenceNumber}` is the proof's canonical location. Nothing but manifests goes on a manifest topic, and no HCS-10 topic carries a manifest. A Verifier need not attribute a manifest: its hash is bound into the AAD, and a manifest that recomputes to that hash is the one the envelope meant, whoever published it.

A manifest topic MUST have the agent's key as its sole submit key, and a manifest MUST be one HCS message on the sender's manifest topic; where a snapshot would not fit, the manifest carries the snapshot's digest and the coordinates read, and the proof is replayable only while its source stands.
`Conformance:` T-P17-3 — every fixture manifest topic has the agent's key as its sole submit key and the memo `wishmail:manifest:1`; T-P9-8 — every fixture manifest is one HCS message at or under `CHUNK_WIRE_MAX` bytes on the sender's manifest topic, with a consensus timestamp earlier than chunk 0's.

**TTL.** Coordinates carry `resolvedAt`; each profile fixes a TTL. `send` re-resolves coordinates older than their TTL and proceeds under the fresh proof; the proof bound into the envelope is always the one current at assembly.
`Conformance:` T-P12-3 — `send` with expired coordinates produces an envelope whose resolution proof is newer than the coordinates supplied, and no failure.

```
Profile        Address                          Inputs on consensus   Trust class        Snapshot
hcs14          uaid:aid, uaid:did, 0.0.N         yes                   math               no
dns            dns:<fqdn>                        no                    social-committee   yes
nanda          nanda:<urn>@<index-host>           no                    social-committee   yes
hol            uaid (registry=hol|hashgraph-online)  yes                   math               no
a2a            (extension, §16)                  —                     —                  —
```

### 9.2 `hcs14` — the native profile

**Addresses.** An HCS-14 universal agent ID — `uaid:aid:<id>;<parameters>` or `uaid:did:<id>;<parameters>` — whose `nativeId` parameter is a Hedera account in CAIP-10 form, `hedera:<network>:0.0.N`; or a Hedera account, `0.0.N` or CAIP-10 `hedera:<network>:0.0.N`. HCS-14 orders the parameters `uid`, `registry`, `proto`, `nativeId`, `domain`, and sets `uid` to the account's HCS-10 `operator_id`, `inboundTopicId@accountId`, when the account has one.

**Rule.** Parse the address to an account: a UAID's `nativeId`, or the account itself. Read the account's memo; it MUST be an HCS-11 memo of one of two forms. `hcs-11:hcs://2/<registryTopic>` names an HCS-2 registry of profile versions: read the registry's current entry; it points at an HCS-1 file. `hcs-11:hcs://1/<fileTopic>` names an HCS-1 file directly. In either form, read the file; it is the HCS-11 profile. Take `account`, `inboundTopicId` as the doorbell, `outboundTopicId` as the log, and `properties.wishmail.{manifestTopic, x25519Pub, keyEpoch}`. If the profile carries a `uaid`, its identifier and `nativeId` MUST agree with the address when the address was a UAID; parameters outside the identifier are routing hints and are not compared. Under the second form the file is on consensus and immutable, but the binding of the account to that file at the time of resolution is a memo, and a memo's past values are not re-obtainable; the rule assigns `blurred` and carries the memo it read as a snapshot.
`Conformance:` T-P6-3 — a fixture whose memo is neither form, whose registry has no current entry, whose profile carries no `properties.wishmail`, or whose `uaid` identifier or `nativeId` disagrees with a UAID address resolves to `RESOLVE_NOT_FOUND`; a fixture whose memo names an HCS-1 file directly resolves with `blurred` and a memo snapshot; a fixture whose memo names an HCS-2 registry resolves to the coordinates its current entry's profile declares without `blurred`; each manifest recomputes from its locator (T-P6-2).

**Inputs and locator.** `{ledgerTag, account, memo, registryTopic?, registrySequence?, profileTopic, consensusTimestamp}` — under the first form, the registry entry current at the resolution's consensus timestamp and the file it names, every element on consensus and re-obtainable from any mirror node at any later time, unchanged, with no snapshot; under the second form, the file, on consensus and immutable, and the memo as read, carried as the snapshot.

**Output.** `MailCoordinates` (§5.3).

**Meaning.** `trustClass: math`. Endorsements the rule assigns: none under the first form; `blurred` under the second, for the binding and not for the file. What this rule cannot find, it fails.

**Declaring under it.** An agent declaring under `hcs14` MUST set its account memo to `hcs-11:hcs://2/<registryTopic>` where the registry is an HCS-2 topic it controls, register each profile version there, and carry `properties.wishmail` in the profile. Rotation is a new profile file registered as a new entry; prior entries stay on the registry topic.
`Conformance:` T-P8-3 — after a fixture recipient rotates, the coordinates declared before rotation are still resolvable at their consensus timestamp; a fixture that declares under this profile with a memo naming an HCS-1 file directly fails the RECIPIENT suite, since its prior declarations are not; T-P6-3; T-P17-1 — the declaring fixture's registry topic has the agent's key as its sole submit key.

**TTL.** The `ttl` of the profile, if it declares one; otherwise 3600 seconds.

**Failures.** `RESOLVE_NOT_FOUND` — no memo, no HCS-11 memo of either form, no current entry, no file, no `properties.wishmail`, or a `uaid` whose identifier or `nativeId` disagrees with the address; `RESOLVE_REGISTRY_UNREACHABLE` — no mirror node answered.

### 9.3 `dns` — a name in the DNS

**Addresses.** `dns:<fqdn>` (RFC 4501). The name is whatever the agent is called in the DNS — a DNS-AID owner name, an ANS name that is a DNS name, a plain host. WISHMail reads one leaf under it and nothing else.

**Rule.** Query `TXT` at `_wishmail.<fqdn>`. The RDATA is a tag=value list in the manner of DKIM and DMARC:

```
_wishmail.agent.example.com. 300 IN TXT (
  "v=wm1; l=hedera:mainnet; a=0.0.1234567; d=0.0.1234568;"
  "o=0.0.1234569; m=0.0.1234570; k=<x25519Pub base64url>; e=3" )
```

`v` MUST be `wm1`; `l`, `a`, `d`, `m`, `k`, `e` are the declaration's `ledgerTag`, `account`, `doorbell`, `manifestTopic`, `x25519Pub`, `keyEpoch`; `o` is the log and is optional. A multi-string TXT is concatenated per RFC 7208 §3.3 before parsing. Where the RRset holds more than one `v=wm1` record, the rule assigns `vague` and takes the record whose `e` is highest. Where the answer is DNSSEC-validated, the RRSIG chain is part of the inputs; where it is not, the rule assigns `blurred`.
`Conformance:` T-P6-4 — a fixture RRset whose record carries `v` other than `wm1` resolves to `RESOLVE_NOT_FOUND`; a multi-string TXT resolves identically to its RFC 7208 concatenation; an RRset with two `v=wm1` records yields a proof endorsed `vague` whose coordinates are the record with the higher `e`; a DNSSEC-validated fixture's proof inputs carry the RRSIG chain and an unsigned fixture's proof is endorsed `blurred`.

**Inputs, locator, snapshot.** The RRset and, if signed, its RRSIGs, as returned; the locator is `{name, type: TXT, resolver, queryTime}`; the snapshot is the RRset bytes and RRSIGs. The locator does not re-obtain the past; the snapshot does.

**Meaning.** `trustClass: social-committee` — the zone operator and, if signed, the DNSSEC chain. Endorsements: `blurred` (unsigned), `vague` (more than one record), `stale` (used after the RRset TTL elapsed).

**Declaring under it.** Publish the record above; sign the zone if you can.

**TTL.** The RRset's TTL.

**Failures.** `RESOLVE_NOT_FOUND` (NXDOMAIN, NODATA, or no `v=wm1` record); `RESOLVE_REGISTRY_UNREACHABLE` (SERVFAIL or timeout).

### 9.4 `nanda` — the NANDA v2 index

**Addresses.** `nanda:<urn>@<index-host>`, where `<urn>` is a NANDA locator as the index parses it — `urn:ai:domain:<domain>`, `urn:ai:domain:<domain>:agent:<slug>`, or `urn:ai:email:<email>` — and `<index-host>` is the host of a NANDA v2 index. The host is part of the address so that the proof names which index was asked; the profile speaks the v2 index only, and an index of another generation is not an index this profile reads.

**Rule.** `GET https://<index-host>/api/v1/resolve?locator=<urn>`, speaking the index's own `/api/v1/*` wire format and not its `/api/ard/*` mirror. The answer MUST be JSON carrying an `index_record`; the record's `status` MUST be `active`; its `metadata` object MUST carry the declaration (§9.1) under the key `org.wishmail` — for an address that names an agent, under `org.wishmail.agents.<slug>`, and for one that does not, under `org.wishmail` directly. The record is not signed, and nothing in the index is: the rule assigns `blurred` to every resolution.
`Conformance:` T-P6-2 — the `nanda` fixture's resolution recomputes from its snapshot; a fixture record that is not `active`, or whose `metadata` carries no `org.wishmail` for the address, resolves to `RESOLVE_NOT_FOUND` and produces no envelope.

**Inputs, locator, snapshot.** The response bytes as fetched; the locator is `{indexHost, urn, fetchTime}`; the snapshot is the whole `index_record`, since it always fits.

**Meaning.** `trustClass: social-committee` — the operator of the index that answered. Endorsements: `blurred` (always: no signature, no content address, no log; a past answer cannot be re-obtained by anyone); `stale` (the answer used after its `ttl_seconds` from `fetchTime` had elapsed — a discipline of this document, since the index enforces none); `withheld` (a credential was needed to read); `vague` (both an agent entry and an org entry answer one address, or the URN parsed to more than one record).

**Declaring under it.** Register the organization with the index under its own flow, and set `catalog_metadata["org.wishmail"]` (or `…["org.wishmail.agents"]` keyed by slug) to the declaration. The index operator can edit, suspend, or delete the record without trace; the declaration is a claim the operator's database repeats, and the proof says so.

**TTL.** The record's `ttl_seconds`; otherwise 86 400 seconds.

**Failures.** `RESOLVE_NOT_FOUND` (the index does not know the URN; no `index_record`; not `active`; no `org.wishmail`; a slug the `agents` map lacks); `RESOLVE_REGISTRY_UNREACHABLE`.

An agent that wants its NANDA name to reach a mailbox a Verifier can check after the fact declares under `hcs14` as well and points the NANDA declaration at the same coordinates; the `nanda` profile answers where to send now, and only a consensus profile can answer where an envelope was addressed then.

### 9.5 `hol` — agents anchored through the HOL registry broker

**Addresses.** A UAID as HCS-14 forms it whose `registry` parameter is `hol` or `hashgraph-online`, the two registry names whose anchors are on Hedera. The broker is a directory (§9.1): it is where such an agent is found, and nothing it returns is an input to resolution. A `registry` parameter is a routing hint outside the identifier; a broker that relabels an agent's registry does not change what the ledger recorded, and the rule below matches on the identifier and `nativeId`, never on the label. An address labelled `openconvai` names no anchor and is resolved by its `nativeId` under `hcs14`.

**Rule.** Locate the registration: a `register` operation on one of the registry's anchor topics (below) that names the agent — by a `uaid` whose identifier and `nativeId` are the address's, or by an `account_id` equal to the address's `nativeId` account. Read the anchor in full; the broker's record may name a sequence number, which the rule then reads on consensus. A registration that carries `t_id` names an HCS-2 topic: read its current entry; it names an HCS-1 file; read the file; it is the HCS-11 profile. A registration that carries `account_id` and no `t_id` names the agent's account: resolve the profile from the account's memo as §9.2 does, and carry that rule's endorsements. In either case the profile's `uaid`, if present, MUST agree with the address in identifier and `nativeId`; for a `uaid:aid` address the AID recomputed from the profile's name, version, and skills together with the address's `registry`, `proto`, and `nativeId` parameters MUST equal the address's identifier; and `properties.wishmail` MUST be a declaration (§9.1). Where the registration's payer is not the address's account, the rule assigns `blurred`: the registration is on consensus, and under a key that is not the agent's. Where no registration on any anchor names the address, the rule fails; the broker's own copy of an agent is not a source, and an agent the broker lists but the ledger does not is not resolvable under this profile.
`Conformance:` T-P6-5 — a fixture whose anchors carry no registration for the address, whose profile `uaid` disagrees with the address in identifier or `nativeId`, whose recomputed AID differs from a `uaid:aid` address's identifier, or whose profile lacks `properties.wishmail` resolves to `RESOLVE_NOT_FOUND`; a fixture registered by `uaid` and `t_id` under a key other than its own account's resolves with `blurred`; one registered by `account_id` resolves through §9.2 and carries that rule's endorsements beside `blurred`; one registered under its own account's key resolves without `blurred`; a fixture whose broker label differs from its anchored `registry` parameter resolves identically.

**Inputs, locator, snapshot.** The registration message and, by its shape, either the HCS-2 entry and HCS-1 file or the account memo and HCS-1 file — on consensus; the locator is `{ledgerTag, anchorTopic, sequenceNumber}` and, for the account-memo shape, §9.2's locator beside it; a snapshot only where §9.2's second form carries one.

**Meaning.** `trustClass: math` — the profile's integrity and its binding to the address are recomputed from consensus by anyone. Endorsements: `blurred` (the anchoring signature is the registry operator's, not the agent's), `vague` (more than one registration on the anchor names the address; the latest is taken).

**Anchor topics.** `hedera:mainnet`: `0.0.9297139` (the HCS-10 registry whose metadata topic `0.0.9297136` names its operator) and `0.0.10080724`; `hedera:testnet`: `0.0.6913983`. The two registry names draw on the same anchors, interleaved. An anchor is read in full, every page; the memo it carries is its operator's and binds nothing here; no anchor carries a fee.

**Declaring under it.** Carry `properties.wishmail` in the HCS-11 profile. A registration submitted through the broker is anchored under the broker's key and resolves with `blurred`; a registration the agent submits itself, on an anchor that admits it, resolves without, and provisioning offers to submit it (§4.6). An agent that also sets its own account memo to an HCS-2 profile registry (§9.2) resolves under `hcs14` without `blurred`, and that is the declaration this document recommends. A copy of the declaration in the broker's metadata is a hint for finding and never an input.

**TTL.** None: an anchored registration does not expire, and the declaration current is the profile registry's latest entry.

**Failures.** `RESOLVE_NOT_FOUND` (no registration on the anchor; `uaid` or AID mismatch; no `properties.wishmail`); `RESOLVE_REGISTRY_UNREACHABLE` (the mirror node).

### 9.6 Profiles and the Verifier

A Verifier appraises a resolution proof by replaying its rule on its inputs — from the locator where the inputs are on consensus, from the snapshot where they are not — and comparing the result to the proof's hash. It then looks up the manifest at its canonical location on the sender's manifest topic. For non-consensus profiles it MAY re-obtain the input now: agreement is reported; drift is reported as drift, and does not change what the envelope bound (F-5). A Verifier MUST implement replay for every profile it claims, SHOULD implement it for `hcs14`, and MAY leave others unverified. A Verifier that claims no profile is conforming (§1.4): it verifies binding, settlement, and postmarks, and appraises every resolution as unverified.
`Conformance:` T-P12-4 — a Verifier claiming no profile appraises every fixture's resolution as unverified, never fails, and passes the VERIFIER suite.

### 9.7 Discovery is not resolution

A directory — an HCS-2 registry listing agents by UAID, an organization's DNS-AID index, a NANDA index — is where an agent is *found*. Resolution begins after finding: with an address in hand and a profile to read it through. No profile reads a directory to resolve, and this document defines no directory.

---

## 10. Postmark, return receipt, attempted-delivery slip

### 10.1 The chain

Four proofs occur in WISHMail, and each after the first consumes the one before it: the resolution proof, the proof of posting, the return receipt, and — on the branch where no lane answers — the attempted-delivery slip.

```
   resolution proof ----> proof of posting ----> return receipt
   (§9; the address        (the envelope;         (the recipient signed
    became these            its AAD is the         for this envelope, after
    coordinates)            output; the            this postmark)
        |                   postmark witnesses)
        '--- no lane ---> attempted-delivery slip
                          (first contact attempted; no lane by the window's end)
```

Consumption is by hash: a proof's inputs name the prior proof's hash, so forging or swapping any link breaks every link after it. The AAD is where the resolution proof enters the chain (§7.2); the envelope identifier is where the proof of posting is named by everything after it.

### 10.2 The resolution proof

Its parts are fixed by its profile (§9): the rule is the profile at its pin; the inputs are what the registry answered, located or snapshotted; the output is the coordinates; the meaning names the profile, its trust class, its endorsements, and the manifest's canonical location on the sender's manifest topic. It is the only proof in the chain whose manifest is published before the envelope exists, because the AAD needs its hash.

### 10.3 The proof of posting and the postmark

The proof of posting is the envelope. Its rule is assembly at this specification's version; its inputs are chunk 0 — its header (the lane, the resolution proof's hash, the nonce, the settlement reference, the key epoch, the ephemeral key, the ciphertext digest and size, the weight, the receipt request) and its chain root, the digest of the first slice after it; its output is the AAD, which any reader recomputes from the header (§7.2); its meaning is the statement that one envelope was posted to that lane under that resolution with that postage, and its canonical location is chunk 0 itself. Its witness is the postmark: Consensus's record that the chunks were submitted, when, and in what order. The header commits the body by its digest; the chain root commits the order in which the body arrives (§7.4).

No separate manifest is published for the proof of posting. Chunk 0 is its manifest, the AAD is its output, the postmark is its witness, and the envelope identifier — the AAD's hash — is what later proofs name when they consume it. The postmark is not the output of any rule; it is what Consensus said about the output, and only Consensus can say it (P-2).

### 10.4 The return receipt

A return receipt is the recipient's signed statement that a specific envelope opened with its AAD verified, witnessed by consensus so that it can neither be denied nor re-worn.

**Parts.** Rule: receipt at this specification's version. Inputs: the envelope identifier, chunk 0's postmark, and the key epoch the envelope opened under. Output: the statement `opened`, over exactly those inputs. Meaning: the recipient's account, the canonical location of the receipt's manifest on the recipient's manifest topic, `trustClass: math`, no endorsements. Witness: the executed schedule (below) and the manifest message's postmark.

What a receipt proves, a Verifier recomputes: that the account whose key executed it is the recipient's, that it names this envelope and this postmark and no other, and that it was witnessed after delivery. What a receipt states, only the recipient could know: that the envelope opened. The proof is `math` for what it proves; `opened` is the signer's testimony, as a signature on a return-receipt card is the signer's testimony that the letter was received.

**Mechanism.** A receipt is produced by a long-term scheduled transaction (HIP-423) whose inner transaction is a submission of the receipt's manifest to the recipient's manifest topic — a topic only the recipient's key can write to. The sender, after SETTLED, creates the schedule with the manifest pre-filled, the payer designated by the sender (D-47: the Postmaster), `waitForExpiry` false, and an expiration no later than the network's maximum; it then posts HCS-10's `transaction` operation on the lane naming the schedule. The recipient's `ack` is a ScheduleSign. The instant the recipient signs, the network executes the submission: the manifest lands on the recipient's manifest topic, the schedule's record carries the recipient's signature and the execution timestamp, and the lane already carries the request. The recipient pays nothing at any step.

```
   sender (after SETTLED)                         recipient
   ---------------------------------------        ---------------------------
   ScheduleCreate{ inner: submit(receipt          inbox: sees the request on
     manifest) -> recipient.manifestTopic,        the lane
     payer: Postmaster, expiry <= max }           ack: ScheduleSign
   lane: transaction op { schedule_id }              -> executes: manifest on
                                                        recipient.manifestTopic
   Verifier: lane op -> schedule record (signatures, executed_timestamp)
             -> manifest postmark on the recipient's topic -> recompute
```

A return receipt MUST be the execution of a scheduled submission to the recipient's manifest topic, requested by an HCS-10 `transaction` operation on the lane, and signed by the recipient's key alone.
`Conformance:` T-P1-8 — a fixture receipt's schedule record shows exactly the recipient's signature, its execution timestamp follows the nth chunk's, and the executed submission's postmark is on the recipient's manifest topic; a receipt manifest submitted by any other path is not a receipt and leaves the envelope's state unchanged.

`ack` MUST NOT sign a schedule whose inner submission does not name the envelope identifier, chunk 0's postmark, and the epoch under which the envelope opened in the recipient's `inbox`.
`Conformance:` T-P1-9 — `ack` refuses a fixture schedule whose body names a different identifier, postmark, or epoch, returning `ACK_NOT_OPENED`.

The recipient MUST NOT be charged for a receipt.
`Conformance:` T-P16-2 — across the RECIPIENT suite, the recipient account's balances in HBAR and stamps are unchanged by `ack`.

**The window.** The schedule's expiration is the acknowledgment window: a sender parameter, in seconds, at most `SCHEDULE_MAX_LIFETIME` (§1.6; sixty-two days), defaulting to that maximum. A schedule that expires unsigned is deleted by the network; the lane's `transaction` operation remains, and reconciliation reports the envelope as `unclaimed` — requested, witnessed, not signed for. Unclaimed is not refused, and silence is not non-delivery (F-6): the envelope is SETTLED regardless. A sender MAY request again by creating a new schedule and posting a new `transaction` operation; each request is its own record.

### 10.5 The attempted-delivery slip

A slip is a proof of absence: first contact was attempted, and no lane had answered when the sender's window closed.

**Parts.** Rule: slip at this specification's version. Inputs: the resolution proof's hash, the doorbell, the connection request's postmark on the doorbell and its record on the sender's log, and the window. Output: `unanswered` at the request's consensus timestamp plus the window — a fact any Verifier recomputes by reading the doorbell for a `connection_created` naming that request with a consensus timestamp inside the window and finding none. Meaning: the address and profile, the endorsement `timed-out`, the statement that expiry is not silence and that nothing is claimed about the recipient, and the canonical location of the slip's manifest on the sender's manifest topic. Witness: the connection request's postmark.

`send` MUST publish the slip's manifest on the sender's manifest topic before returning a slip.
`Conformance:` T-P12-5 — a fixture first contact whose window elapses yields a slip whose manifest is on the sender's manifest topic, whose output recomputes from the doorbell, and whose appraisal is unchanged by a `connection_created` that lands after the window.

A slip is never superseded. If the lane opens later, the lane is OPEN and the slip is still true of the time it describes (§8.2). A sender that rings again produces a new request, and, if unanswered, a new slip; each is its own record.

### 10.6 What each proof can and cannot say

```
Proof                 Proves (recomputable)                        States (testimony)         Witness
resolution proof      the rule on these inputs gives these         what the registry           the manifest's postmark
                      coordinates; what was read (snapshot)         answered was true
proof of posting      this envelope, this lane, this resolution,   —                           the postmark
                      this postage; the sender (fourth weld)
return receipt        the recipient's key signed for this           the envelope opened         the executed schedule;
                      envelope after this postmark                                              the manifest's postmark
attempted-delivery    no lane answered this request within          —                           the request's postmark
slip                  this window
```

Nothing in the chain says what an envelope contained. Nothing in it says a recipient read anything. The postmark says a letter was posted; the receipt says a hand signed for it; the slip says the door was knocked on and did not open in time.

---

## 11. Replay and appraisal

### 11.1 What reconciliation is

Reconciliation is the reconstruction of a correspondence from public consensus data alone, with every proof appraised (§2.2). Its input is the consensus data in a scope over a window; its output is an evidence bundle and, on request, a narrative (§5.10); its tool is `verify` (§6.7); its actor is any Verifier (§3.7). This section fixes how a Verifier reads, reassembles, appraises, and reports, so that every Verifier does it the same way.

Two properties govern everything below. Reconciliation is keyless and brokerless: it reads what Consensus recorded and needs nothing that any party holds (P-3, P-4). And it is deterministic: the same scope and window yield the same evidence from any Verifier, at any time, byte for byte, so that no Verifier's reading stands above another's and the Postmaster's stands above no one's (P-3, §3.7).

Appraisal is two verifications performed together on each proof. **Replay** is the syntactic half: from the proof's rule and inputs, recompute its output, and from its four parts recompute its hash, and compare both to what the proof claims. **Lookup** is the semantic half: dereference the proof's canonical location and confirm that what is found there is the manifest the proof names, under a postmark. A proof that passes both is appraised *verified*. A proof that cannot be replayed, or whose manifest cannot be found or does not hash to the proof, is appraised *unverified*: a downgrade, never an error (P-12). Appraisal never asks whether what a proof states is true. It asks whether the proof recomputes, and whether Consensus recorded it.

```
                     replay (syntactic)              lookup (semantic)
   proof {hash,uri}  --> rule(inputs) == output ?    --> uri -> manifest ?
                         h(rule,inputs,output,          manifest.hash == hash ?
                           meaning) == hash ?           postmark present ?
                                  \                        /
                                   '--> both: verified  --'
                                        either fails: unverified
```

**The mirror node.** A Verifier reads consensus through a mirror node. A mirror node is a read interface, not a source: every mirror node serving a ledger yields the same messages, the same transactions, and the same running hashes, and a Verifier may read through any one of them, or through its own. A mirror node is not a broker (P-4), and reading through one requires no key, credit, or credential.

The evidence a Verifier produces MUST NOT depend on which mirror node it read through.
`Conformance:` T-P4-3 — the VERIFIER suite, run against two independent mirror nodes for the fixture ledger, produces identical evidence digests for the fixture correspondence.

### 11.2 Scope, window, and ingestion

A scope names what is reconciled (§6.7): a lane; one envelope on a lane; or a set of topics, within which every lane is reconciled. A window bounds it in consensus time: an envelope is in the window if its canonical chunk 0 has a consensus timestamp in `[from, to]`; a receipt or a slip is in the window by its own postmark.

Reconciling a lane reads more than the lane. The evidence of a correspondence lives on the topics the envelope's own references name, and a Verifier follows them from public data alone:

```
Read                                    Found from                         For
the lane                                the scope                          chunks; receipt requests
                                                                           (transaction ops); close_connection
the sender's account                    settlement.from (§7.2)             the sender
the sender's manifest topic             hdr.rp.u (§9.1)                    resolution-proof manifests;
                                                                           slip manifests
the resolution's coordinates            the resolution manifest's output   the recipient's account, doorbell
the recipient's doorbell                coordinates.doorbell               connection_request;
                                                                           connection_created (§7.1, §8.2)
the settlement                          hdr.st (§4.3)                      postage
the schedule and its record             the lane's transaction op (§10.4)  the receipt's signature and
                                                                           execution
the recipient's manifest topic          the executed submission's topic    receipt manifests
```

Nothing on that list is chosen by the Verifier or supplied to it. Each is named by something already read, beginning from the lane; a scope of topics is expanded the same way for each lane found among them.

The window bounds what is reconciled, not what is read. A settlement affixed before `from`, a `connection_created` older than the window, a manifest published a day earlier: each is read and included in the evidence of the envelope that names it.

A Verifier MUST include in the evidence every consensus fact an in-window envelope's state or standing depends on, whether or not that fact's consensus timestamp is in the window.
`Conformance:` T-P3-5 — a fixture whose settlement, `connection_created`, and resolution manifest all precede the window's `from`, with its chunks inside the window, appraises verified, and its bundle carries the settlement, the lane's creation, and the manifest.

### 11.3 Reassembly

Reassembly is the recovery of an envelope from the chunks on its lane. It is fixed in §8.5 and restated here as a walk.

Chunk 0 is the earliest chunk with `(id, 0)` whose header rebuilds to `id` (§5.6). No party but the sender can produce such a header before it is public, and any copy made after it is public reaches consensus after it, so the earliest header-valid chunk 0 is always the sender's: consensus ordering is total, and a copy cannot precede what it copies. From chunk 0, each subsequent chunk is the earliest chunk with `(id, i)` whose slice hashes to the previous canonical chunk's `nx`. A chunk that lands earlier but is not on the chain is off the chain; a chunk that lands later with the same bytes is a duplicate; neither is used. The walk ends when `n` links are found (complete) or when no chunk satisfies the next `nx` (partial, F-4).

```
   lane, in consensus order:
     (id,0) hdr ok, nx=A          <- canonical 0
     (id,1) d: H(d)=X   foreign   <- off chain (X != A); recorded
     (id,1) d: H(d)=A, nx=B       <- canonical 1
     (id,2) d: H(d)=B             <- canonical 2 (n=3, no nx)
     (id,1) d: H(d)=A, nx=B       <- duplicate; recorded
```

A complete envelope's slices, concatenated in index order, are the ciphertext; their SHA-256 is compared to `hdr.h`, their length to `hdr.cb`, and the count of chunks to `n`.

A complete envelope whose concatenated slices do not hash to `hdr.h` MUST be appraised unbound and MUST NOT be opened.
`Conformance:` T-P1-11.

The chain is what makes reassembly a computation on bytes and not on clocks. Either party to a lane can submit under its threshold key, and an envelope's identifier is public from the settlement's memo before any chunk lands; a slice the sender did not commit is nothing, whenever it lands and whoever submitted it. What remains time-dependent is only which of two byte-identical chunks is named canonical, and that has no consequence.

### 11.4 Appraising the proofs

For each envelope reassembled, a Verifier appraises the proofs of §10 in the order the chain consumes them, then the postage, then the receipt or the slip. §11.5 names the test each check answers to and says how the results combine.

**The proof of posting (binding).** Its manifest is chunk 0; its output is the AAD; its witness is the postmark (§10.3). A Verifier recomputes the AAD from the header and the lane and compares its hash to `id`; checks that the `operator_id` of every canonical chunk names the settlement's `from`; checks that the AAD's `lane` is the topic the chunks are on; checks that the lane was created in answer to a request on the doorbell the resolution's coordinates name, and that it was open at chunk 0's consensus timestamp; and checks that the header's `ke` equals the `keyEpoch` the resolution's coordinates carry. Any of these failing is a binding failure: the envelope is unbound.

The header's `ke` MUST equal the `keyEpoch` of the coordinates the envelope's resolution proof yielded; an envelope for which it does not MUST be appraised unbound and MUST NOT be opened.
`Conformance:` T-P1-10 — a fixture envelope whose header names an epoch other than the one its bound resolution yielded is returned `INBOX_UNBOUND` at `inbox` and appraises unbound at replay.

**The postage.** The settlement is read by `hdr.st` and counted by §8.5: it exists, its memo is `wishmail:<id>`, its `to` is the treasury, its consensus timestamp precedes chunk 0's, and it is in the stamp token; its amount covers the envelope's postage — weight plus one when `hdr.rr` is true; and no envelope with an earlier canonical chunk 0 names the same settlement. Any of these failing: the envelope is unstamped. A settlement that counts for no envelope in scope is an orphan and is reported under `orphans` (F-3).

**The resolution proof.** A Verifier looks it up: dereferences `hdr.rp.u` on the sender's manifest topic, reads the message there as a manifest, and compares the manifest's hash to `hdr.rp.h`; the manifest's postmark must precede chunk 0's. A Verifier replays it under the profile the manifest names, if that profile is one the Verifier claims (§9.6): from the locator for a profile whose inputs are on consensus, from the snapshot for one whose inputs are not; the recomputed output must be the coordinates the manifest carries and the recomputed hash must be `hdr.rp.h`. Where the profile is not claimed, or the snapshot is absent and the input cannot be re-obtained, or the chunk's `schemaRef` does not resolve, the resolution is appraised unverified.

The manifest's meaning carries what the sender declared: the profile, its trust class, and its endorsements. A Verifier reports these as declared and adds its own standing beside them. It does not raise a trust class, and it does not remove an endorsement: a `social-committee` proof that replays perfectly is a verified `social-committee` proof, and a `withheld` input that the Verifier happens to be able to see was still withheld from the proof (P-12).

**The return receipt.** A Verifier reads each `transaction` operation on the lane that names a schedule, and each schedule's record as consensus recorded it: whether it executed, when, under whose signature, and to which topic its inner submission wrote. For an executed schedule, the Verifier reads the receipt manifest at the executed submission's postmark on the recipient's manifest topic and recomputes the receipt (§10.4): its inputs name this `id`, this chunk 0 postmark, and this epoch; its hash matches; the signature on the schedule's record is by the key of the account the resolution's coordinates name — the record carries the signing key's prefix, and the Verifier reads that account's key from consensus and matches it; the execution follows the nth chunk. A receipt that recomputes and was witnessed after delivery, on an envelope standing verified or unverified, is the receipt: `receipt.status` is `acked` and the envelope is ACKED (§8.3). A receipt witnessed before delivery, on an envelope standing unstamped or unbound, or whose parts do not recompute, is `invalid`: recorded, the envelope's state unchanged (§8.6). A receipt for an envelope whose header did not request one counts, and the reason names it (§8.6). A request whose schedule expired unsigned is `unclaimed`. An envelope with no request and no receipt is `none`.

A Verifier MUST report a receipt request whose schedule expired unsigned as `unclaimed`, and MUST NOT report it as refused, as returned, or as undelivered.
`Conformance:` T-P15-5 — a fixture request that expired unsigned yields `receipt.status` = `unclaimed`, the envelope remains SETTLED with its standing unchanged, and the reference narrative's sentence for it is the unclaimed template and no other.

**The attempted-delivery slip.** For a slip's manifest on the sender's manifest topic, a Verifier recomputes `unanswered` by reading the doorbell for a `connection_created` naming the request with a consensus timestamp inside the window and finding none (§10.5). A `connection_created` after the window does not change the appraisal; it is reported as the lane's state (§8.2).

### 11.5 Standing

Standing is what an envelope's evidence binds to, on one axis; state is how far it travelled, on the other (§8.1). The four standings of §5.10 are ordered:

```
   verified  >  unverified  >  unstamped  >  unbound
```

An envelope's standing is the lowest that any check of §11.4 yields; every check that yields a standing below verified contributes its test to `reasons`; an envelope with no reasons is verified. The order is read as: a bound and stamped envelope whose resolution could not be replayed is still certified mail whose address is unappraised; an unstamped envelope is not certified mail; an unbound envelope does not open.

```
Check (§11.4)                                              Yields       Reason
header rebuilds to id; chain complete; slices hash to h    unbound      T-P1-1, T-P1-11, T-P3-3
operator_id names settlement.from                          unbound      T-P1-6
AAD names the lane the chunks are on                       unbound      T-P10-1
ledger tag defined here or by a claimed extension          unbound      T-P9-11
lane born from the resolution's doorbell; open at chunk 0  unbound      T-P10-2, T-P9-6
hdr.ke equals the coordinates' keyEpoch                    unbound      T-P1-10
settlement exists, memo = id, to = treasury,               unstamped    T-P7-1, T-P11-1
  precedes chunk 0, in the stamp token
settlement amount covers postage                           unstamped    T-P7-3
settlement claimed by no earlier envelope                  unstamped    T-P7-2
manifest at rp.u hashes to rp.h; postmark precedes chunk 0 unverified   T-P6-2, T-P9-8
resolution replays under a claimed profile                 unverified   T-P6-1, T-P12-4
schemaRef resolves                                         unverified   T-P9-3
```

A reason is the identifier of a conformance test: the test whose fixture exercises the condition the Verifier found. There is no reason without a test, as there is no requirement without one (§1.3). A Verifier that finds a condition this table does not name has found a defect in this specification, and reports the envelope unverified with the reason `T-P12-2`.

Per-proof standings are reported beside the envelope's: `resolution.standing` from the resolution checks alone, `receipt.status` from §11.4. The envelope's `appraised.standing` is the lowest across the binding, postage, and resolution checks; the receipt does not lower it — an invalid receipt is a fact about the receipt — and nothing raises it.

A Verifier MUST report every reason that any check yielded and MUST NOT report a standing higher than the lowest any check yielded.
`Conformance:` T-P12-2; T-P3-2 — for every fixture in the exception corpus, `reasons` is the full set the fixture was built to trigger, and `standing` is the minimum over them.

### 11.6 Observations: what the Verifier saw at its own clock

Everything in §11.2–§11.5 is computed from consensus data and is the same for every Verifier at every time. A Verifier may also look at the world as it stands now, and what it sees is an *observation*: reported under `observations` (§5.10), excluded from the evidence digest, and without bearing on any state or standing. Drift is a fact about the world at the Verifier's clock, and P-3 cannot digest a clock.

**Drift (F-5).** For a resolution under a profile whose inputs are not on consensus, a Verifier MAY re-obtain the input now — query the name, fetch the document — and compare it to the snapshot the manifest carries. It reports `agree`, `drift`, or `unreachable`, with what it obtained. Drift does not change what the envelope bound: the resolution proof in the AAD is the one that was current at assembly, and the envelope was addressed by it.

A Verifier MUST NOT change an envelope's standing, or any proof's standing, on the basis of an observation.
`Conformance:` T-P12-6 — a fixture under `dns` and one under `nanda` whose sources have changed since assembly appraise identically with and without re-obtaining, differing only in `observations.drift`; their evidence digests are equal.

**Disagreement between surfaces (§9.1).** A Verifier that claims more than one profile MAY resolve the envelope's address under each now and report where the surfaces disagree about one account. Disagreement is recorded; it is not adjudicated (P-6).

**Rotation (F-8).** A resolution proof is appraised against the declaration that was current at its consensus timestamp: under `hcs14`, the registry entry its locator names (D-70); under the other profiles, the snapshot. A declaration published later — a new epoch, a new key, a new doorbell — is not drift and is not a downgrade. A Verifier MAY report that the recipient has since declared anew, as an observation.

A Verifier MUST appraise a resolution proof against the declaration its inputs locate or snapshot, and MUST NOT lower a proof's standing because the recipient's declaration changed after `resolvedAt`.
`Conformance:` T-P8-4 — a fixture recipient rotates its epoch and re-declares after an envelope is SETTLED; the envelope's resolution appraises verified, its `ke` matches the coordinates it was sealed with, and the later declaration appears only under `observations`.

**The mirror's integrity.** A Verifier MAY check the mirror node it read through: that the sequence numbers of a topic are contiguous over the window, and that each message's running hash follows from the one before it under the ledger's construction. What it finds is reported under `observations.integrity`. This version does not require the check and does not fix the construction; a Verifier that performs it is checking its mirror, not the correspondence, and a mirror that fails it is read again through another (§11.1).

**The time of appraisal and the mirror read** are recorded under `observations` so that a reader knows when and through what the Verifier looked; they are not evidence.

### 11.7 The evidence bundle and the narrative

The bundle is what a Verifier hands over: everything it read and everything it computed, in one object any other Verifier can produce identically (§5.10).

The evidence is canonical JSON (RFC 8785). Its order is fixed: correspondence entries by the consensus timestamp of their canonical chunk 0, ties by lane topic ID and then by sequence number; within an entry, `chunks` by index, `offChain` and `requests` by consensus timestamp; `orphans` by the settlement's consensus timestamp; `reasons` in the order of the table in §11.5. The digest is SHA-256 over the evidence with `digest` and `observations` absent, and is the bundle's identifier.

Two Verifiers reconciling the same scope and window MUST produce evidence with the same digest.
`Conformance:` T-P3-1 — replay by a fresh Verifier with no configuration, run at a different time and through a different mirror node than the reference Postmaster's, equals the Postmaster's evidence for the fixture correspondence, byte for byte.

The narrative is the reading of the evidence: prose that says who posted which envelope to whom and when, what each proof rests on, what each could not see, and what standing each has. It is produced from the bundle and from nothing else; it carries the bundle's digest so that a reader can check the reading against the evidence.

A narrative MUST carry, as `bundleDigest`, the digest of the evidence it reads.
`Conformance:` T-P3-4 — for every fixture, the reference narrative's `bundleDigest` equals the digest of the bundle it was produced from, and a narrative presented with a bundle of another digest is rejected by the suite.

A narrative SHOULD state nothing the bundle does not contain. The reference implementation generates its narrative from fixed templates over bundle fields, one sentence per fact, so that this is demonstrated rather than promised; a narrative service of the competitive tier (§4.7) is bound by the MUST above and by nothing else in this section.

### 11.8 What reconciliation says, and what it does not

Reconciliation answers, from public data: who posted (the account that affixed the postage); to whom (the lane, and the account its resolution named); when (the postmarks); which envelope (its identifier); with what postage; under what resolution, at what trust class, with what endorsements; whether a hand signed for it, and when; whether a door was knocked on and did not open in time; and what standing all of that has.

It never says what an envelope contained; nothing on any topic can. It never says a recipient read anything: a receipt is the recipient's testimony that the envelope opened, and reconciliation reports the testimony as testimony (§10.6). It never says a registry's answer was true, only that it was read, snapshotted, and bound. It never turns silence into refusal, expiry into non-delivery, or an unclaimed receipt into a returned letter (F-6). And it never delivers: delivery is to the lane, and reconciliation is a reading of what the lane recorded.

```
   ingestion --> reassembly --> appraisal --> standing --> evidence --> narrative
   (§11.2)       (§11.3)        (§11.4)       (§11.5)      (§11.7)      (§11.7)
   topics the    the chain      replay +      lowest       canonical    the reading;
   envelope      from the       lookup,       wins;        JSON;        carries the
   names         header         per proof     reasons      digested     digest
                                              are tests
                                                              |
                                              observations ---'  (§11.6; not digested)
```

---

## 12. Invariants P-1 – P-17

### 12.1 How to read this section

An invariant is a property of WISHMail that every conforming implementation preserves and every conformance test serves. This section states the seventeen; it contains no requirement of its own. Every MUST in this document is keyed, through its `Conformance:` note, to the invariant it serves (§1.3), and the tests listed under each invariant below are that key read backward: the invariant is what those tests, together, hold. Where this section and a section it cites differ in wording, the citing section's requirement is what binds; this section says what it is for.

The class matrix of §1.4 says which classes are tested against which invariants. The precedence rule is P-12's: where two requirements, read together, would let an appraisal exceed a declaration, the one that keeps appraisal at or below declaration governs.

### 12.2 The wall

**P-1 — Binding.** An envelope's AAD names its lane and its resolution proof; its settlement's memo names its AAD; the `operator_id` of its chunks names its settlement's `from`; its chunks chain from its header; and its header's epoch is the one its resolution yielded. Decryption fails closed if any of these does not hold, and a return receipt binds to one envelope and one postmark and cannot be re-worn.
*Stated in:* §7.2, §7.3, §7.4, §6.5, §6.6, §8.3, §10.4, §11.3, §11.4. *Tests:* T-P1-1 – T-P1-11.

**P-2 — No Postmaster authority.** Nothing the Postmaster says is a postmark; only Consensus produces one. The Postmaster pays and carries; it signs no agent's topic and attests nothing; its compromise can delay a submission and cannot forge one. Every properly stamped, properly addressed envelope is carried alike.
*Stated in:* §3.5, §3.6, §10.3. *Tests:* T-P2-1, T-P2-2.

**P-3 — Public-data replay.** A correspondence is reconstructible from consensus data alone, by anyone, from this document alone, and deterministically: the same scope and window yield the same evidence, byte for byte, from any Verifier at any time. A Verifier holds no state, and no Verifier's reading — the Postmaster's included — stands above another's.
*Stated in:* §3.7, §8.1, §8.5, §11.1, §11.2, §11.7. *Tests:* T-P3-1 – T-P3-5.

**P-4 — No broker.** No private broker, API key, credit, Hedera account, stamp, or key is required for conformance. VERIFIER conformance is achievable with none of them configured; a mirror node is a read interface and not a broker, and evidence never depends on which one was read.
*Stated in:* §1.4, §3.5, §6.7, §11.1. *Tests:* T-P4-1 – T-P4-3.

**P-5 — Registry-plural.** No registry, and no resolution profile, is required of any class. A claim names the profiles it resolves through, declares under, or appraises; each suite passes with any one supported profile as the only one; the Postmaster carries envelopes alike whatever profile resolved them.
*Stated in:* §1.4, §3.4, §9.1, §9.6. *Tests:* T-P5-1 – T-P5-3.

**P-6 — Resolution witnessed, not trusted.** An envelope names the profile it resolved through and commits its resolution proof's hash into the AAD; the proof's manifest is on consensus before the envelope, and a non-consensus profile's inputs are snapshotted into it. A registry's answer is an input, never an authority; a disagreement between registries is a recorded fact; nothing in WISHMail adjudicates between them.
*Stated in:* §3.4, §6.2, §7.2, §9.1, §9.2, §9.3, §9.5, §9.6, §10.2, §11.6. *Tests:* T-P6-1 – T-P6-5.

**P-7 — Stamp precedes send.** A doorbell charges one stamp to ring, under a HIP-991 fee collected by the treasury. An envelope is affixed before any chunk of it is submitted — one settlement, signed by the sender, carrying the envelope's identifier, preceding chunk 0 — and one settlement stamps one envelope. Postage due is unstamped, and nothing unstamped is certified mail. A retried `send` never affixes twice.
*Stated in:* §4.2, §4.3, §4.4, §8.3, §8.7. *Tests:* T-P7-1 – T-P7-5.

**P-8 — Key epochs.** An agent's encryption keys rotate by epoch, monotonically; every key an agent has ever declared is retained, and an envelope sealed under a retired epoch opens. Every declaration is resolvable at the consensus time it was current, so a resolution made then is appraised against it, and a rotation after `resolvedAt` is never a downgrade.
*Stated in:* §7.6, §9.2, §11.6. *Tests:* T-P8-1 – T-P8-4.

**P-9 — Strict HCS-10.** Envelopes ride inside HCS-10 `message` operations on HCS-10 topics at the pinned revision, one HCS message per chunk with no transport-layer chunking; every operation carries HCS-10's memo; every chunk declares a version-pinned schema registered under HCS-13; the revisions of every pinned standard are declared and equal the specification's; no claim is made while a pin is unfilled; a patch revision changes no wire string and no registered schema; a lane is read in full whatever its memo hints; a ledger tag names a ledger only where this document or a claimed extension defines it.
*Stated in:* §1.6, §1.7, §5.1, §5.11, §6.1, §7.1, §7.4, §9.1. *Tests:* T-P9-1 – T-P9-11.

**P-10 — Directed only.** A stamp buys one envelope to one witnessed-resolved address. An envelope's AAD names the lane it travels on; the lane was born from the doorbell its resolution yielded; an envelope with no resolution proof, or on a lane not so born, is unbound. There is no unaddressed mail and no broadcast.
*Stated in:* §1.2, §4.1, §6.4, §7.1. *Tests:* T-P10-1, T-P10-2.

**P-11 — Uniform postage.** A stamp is one token and costs the same for every buyer, blind to profile, address, recipient, and content; weight is the only scale; a settlement in any other token is not postage; a lane carries no fee.
*Stated in:* §4.1, §4.2, §4.5, §7.1, §14.2, §14.3. *Tests:* T-P11-1 – T-P11-6.

**P-12 — Declared versus appraised.** The sender declares a resolution's profile, trust class, and endorsements; a Verifier appraises. Appraised never exceeds declared: a downgrade is permitted, an upgrade forbidden. What cannot be verified is unverified, never an error; what a Verifier observes at its own clock never changes a standing; an appraisal's reasons are the tests whose conditions were found. P-12 governs any conflict in this document.
*Stated in:* §2.2, §6.2, §6.7, §9.5, §9.6, §10.5, §11.4, §11.5, §11.6. *Tests:* T-P12-1 – T-P12-6.

**P-13 — Never hold the soul.** No private key of any agent — decryption, topic, or account — is ever held by the Postmaster, carried by any tool input or schema field, or accepted by an agent from any other party. Keys are born in the agent's process; provisioning delivers coordinates and never a secret.
*Stated in:* §3.3, §3.5, §4.6, §14.2. *Tests:* T-P13-1 – T-P13-4.

**P-14 — Affidavit, not gate.** No tool call by one agent waits on an act of another, except a first-contact `send`, which is bounded by a window and returns a slip when it closes. Every proof is a post-hoc witness; nothing in this document sits inside a caller's latency-critical path.
*Stated in:* §6.4, §8.2, §10.5. *Tests:* T-P14-1.

**P-15 — Category honesty.** No forward secrecy is claimed and metadata exposure is declared. A conforming release ships a LIMITATIONS document, publishes a conformance claim naming only classes whose suites passed in full, and exposes one tool schema on every transport. Every proof states what it proves apart from what it merely states; reconciliation reports testimony as testimony, an unclaimed receipt as unclaimed, and silence as silence.
*Stated in:* §1.5, §6.1, §10.6, §11.4, §11.8, §15. *Tests:* T-P15-1 – T-P15-5.

**P-16 — Lane equality.** At least one payment leg requires no pre-funded Hedera account: a first-time buyer's stamps create the account that holds them, owned by the buyer's key. A recipient pays nothing to receive and nothing to acknowledge.
*Stated in:* §3.8, §4.6, §10.4, §14. *Tests:* T-P16-1, T-P16-2.

**P-17 — Mutability at birth.** A topic's keys are set at creation under a declared policy and the policy is recorded: a lane's submit key is a threshold of exactly the two agents' keys; a manifest topic's sole submit key is its agent's; an admin key may be rotated and is never cleared. Immutability is a birth decision, not a later one.
*Stated in:* §4.6, §7.1, §9.1. *Tests:* T-P17-1 – T-P17-3.

---

## 13. Failure modes F-1 – F-11

### 13.1 How to read this section

A failure mode is a way the world can go wrong around an envelope. This section names eleven and, for each, says what fails, what WISHMail does about it, and what a Verifier reports. Like §12 it contains no requirement of its own: the mechanisms it names are stated, and tested, in the sections it cites. Three things are true of every entry. No failure changes what an envelope bound: an envelope binds at assembly and nothing after can rebind it (P-1). No failure is adjudicated: a Verifier reports the facts on consensus and the standing they yield, and nothing more (P-12, P-15). And no failure needs anyone's word to be seen: each leaves a mark that any Verifier can read, or leaves no mark at all, and this section says which (P-3).

### 13.2 The eleven

**F-1 — Metadata is public.** Who wrote to whom, when, how much, and how often is on consensus: doorbells, lanes, settlements, postmarks, receipts, and slips are all readable by anyone forever. WISHMail seals content and nothing else, and says so (§1.2, §2.3). A Verifier reports every fact of this kind and never a word of content, because there is none to read (§11.8).

**F-2 — Compromise of a recipient's key.** Whoever holds the private key of an epoch reads every envelope ever sealed to that epoch, past and future, for as long as envelopes are sealed to it. Rotation (§7.6) bounds future exposure — a new epoch's key is not derivable from the old — and does nothing for the past: every envelope sealed under the compromised epoch stays readable by whoever holds it, because no forward secrecy is claimed (§7.3, P-15). A compromise leaves no mark on consensus. A Verifier reports nothing, and no standing changes: the envelopes were bound, stamped, and delivered, and they still are.

**F-3 — Orphaned payment.** A settlement is affixed and no chunk of the envelope it names ever lands. The envelope is STAMPED, not an error, and does not expire: the sender that holds it may submit it at any time, and the settlement counts for the first envelope whose canonical chunk 0 names it (§8.3, §8.5, §8.6). A settlement that names no chunk in scope is reported under `orphans` (§5.10). Postage is spent when affixed; an orphan is postage on an envelope not yet posted, not postage lost.

**F-4 — Partial envelope.** Fewer than `n` links of the chain are on the lane. The envelope is SUBMITTED; `inbox` returns `INBOX_INCOMPLETE` with the indices found; the sender resumes by submitting the missing chunks, in any order, and a chunk resubmitted after its original landed is a duplicate (§8.6, §8.7). A slice the sender did not commit is not a chunk of the envelope, whenever and by whomever it was submitted (§7.4, §11.3). A Verifier reports the state, the canonical chunks found, and every off-chain, unrooted, or conflicting chunk it saw.

**F-5 — Registry drift.** The name, document, or entry a resolution read is changed after the envelope is sealed. Nothing moves: the resolution proof in the AAD snapshotted what the sender read, and the envelope is addressed by that (§7.2, §9.6). A Verifier that re-obtains the input now reports agreement or drift as an observation, never as a downgrade (§11.6).

**F-6 — First contact and silence.** A stranger's doorbell is rung and no lane is opened in the sender's window. Silence is not refusal and not non-delivery: it is the absence of an answer, and WISHMail records exactly that. The request is on the doorbell under a postmark; the sender's log records it; the slip binds the two and endorses itself `timed-out` (§4.4, §5.9, §10.5). A lane that opens after the window is OPEN, and the slip stands as a true statement about the window it names (§8.2). The same rule governs a receipt that was requested and never signed: `unclaimed`, and nothing more (§11.4).

**F-7 — Liveness of the Postmaster.** The Postmaster's availability is required for two things and bounded in both. It is required to sell stamps and to provision (§4.6), where its absence delays a purchase. It is required at a first-contact `send`, where it pays the doorbell's fee and submits the connection request (§6.4); a Postmaster that accepts the sender's stamp and never submits the request costs the sender that stamp and nothing else — the bound on loss is one stamp per attempted first contact, and the wait is bounded by the sender's `window`. For every other submission the Postmaster is a payer the sender may use or not (§3.5); a sender whose account can pay its own fees is never stranded. Delivery is a reading of a lane and verification a reading of consensus; neither involves the Postmaster at all (§6.5, §11.1). Its compromise can delay and cannot forge (P-2).

**F-8 — Key rotation.** An agent rotates. Its encryption keys rotate by epoch: every declared key is retained, every envelope sealed under a retired epoch opens, and a resolution made under the old declaration is appraised against that declaration, not the new one (§7.6, §9.2, §11.6). Its Hedera account key is another matter: a lane's submit key names the account keys of its two agents literally, so an agent that rotates its account key can no longer sign on any lane created before the rotation. Nothing on those lanes is lost — every envelope on them remains readable and reconcilable forever — but new mail between the same two agents needs a new lane, born again from the doorbell. A Verifier reports a later declaration as an observation and never lowers a standing for it.

**F-9 — Drift of the standards WISHMail rides on.** Four of the six standards in §1.6 are Draft, and their text may change by pull request. WISHMail conforms to a pin, not to a name: the text at the blob §1.6 names is what "HCS-10" means in this document, and a claim against this version is a claim against those blobs (§1.6, §5.11). A chunk whose `schemaRef` does not resolve at the pinned revision is appraised `VERIFY_SCHEMA_UNRESOLVED`, unverified (§6.7). A change upstream is a new pin, which is a new minor version at least (§1.7); it is never a silent change to what a conforming release does.

**F-10 — Resolution failure.** An address does not resolve: no profile handles it, no declaration is found, the declaration is malformed, or the account has no `properties.wishmail`. `resolve` fails with the failure §6.2 names, and nothing else happens: no stamp is spent, no doorbell is rung, no chunk is submitted, because resolution precedes all of them (§6.4). Resolution failure is a failure of a tool, not a state of any envelope, and leaves no mark on consensus.

**F-11 — Binding mismatch.** An envelope's parts disagree: the header does not rebuild to `id`, the chunks' `operator_id` is not the settlement's `from`, the AAD names a lane the chunks are not on, the lane was not born from the resolution's doorbell, the epoch is not the one the resolution yielded, or the slices do not hash to `hdr.h`. Decryption fails closed: `inbox` returns `INBOX_UNBOUND` and never a plaintext (§6.5, §7.2, §7.4). A Verifier appraises the envelope unbound with every reason (§11.5). The settlement that names such an envelope's `id` counts for it; postage on a malformed envelope is spent.

### 13.3 What each leaves on consensus

```
Failure   Mark on consensus                 State            Standing       Reported as
F-1       everything but content            —                —              the facts; never content
F-2       none                              unchanged        unchanged      nothing
F-3       settlement, no chunk              STAMPED          —              orphans
F-4       fewer than n links                SUBMITTED        —              state; chunks found; off-chain
F-5       none on consensus                 unchanged        unchanged      observations.drift
F-6       request; log entry; slip          REQUESTED        slip verified  slip; receipt unclaimed
F-7       none, or a request with no lane   —                —              nothing / slip
F-8       new declaration entry             unchanged        unchanged      observations
F-9       none                              —                unverified     VERIFY_SCHEMA_UNRESOLVED
F-10      none                              —                —              a tool failure; nothing
F-11      the mismatched envelope           SUBMITTED/       unbound        reasons
                                            SETTLED
```

---

## 14. Payments

### 14.1 What is paid, and to whom

Money enters WISHMail in one place: the purchase of stamps from the Postmaster (§4.1, §6.3). Everything after that is a stamp being consumed. Postage affixed to an envelope (§4.3), the doorbell's fee at first contact (§4.4), and the receipt fee inside postage (§10.4) are stamps returning to the treasury on consensus, each under a mark that says what it paid for; none of them is a second purchase, and no agent is paid by another agent's mail. The Postmaster has one other priced service, provisioning (§4.6), paid for the same way and by whoever wants it.

The Postmaster is the transaction payer for what it carries (§3.5) and for what it provisions; the network's fees for those submissions are its cost and are inside the prices it publishes. A sender that pays its own way pays its own network fees. A recipient pays nothing to receive an envelope and nothing to sign for one (P-16).

```
   buyer  --(USDC via x402, or HBAR)-->  Postmaster  --(stamps)-->  buyer's account
                                            |                          |
                                   pays network fees          affixes, rings, requests
                                   for what it carries        receipts: stamps consumed
                                                              to the treasury on consensus
```

### 14.2 The two legs

A stamp is bought by one of two methods, named in `buy_stamp` by `payment.method` (§6.3). A conforming Postmaster offers one or both.

**`x402-usdc`.** The buyer pays in USDC through the x402 protocol at the pinned revision (§1.6). The Postmaster is the resource server and `buy_stamp` is the paid resource: the first request is answered `402` with a `PAYMENT-REQUIRED` header carrying the requirements — scheme `exact`, the network and USDC asset the Postmaster publishes, the amount `count` times the unit price, and the Postmaster's receiving address; the buyer retries with a signed `PAYMENT-SIGNATURE`; a facilitator the Postmaster names verifies and settles it; the Postmaster transfers the stamps and answers with the `StampReceipt`, the settlement's `PAYMENT-RESPONSE` beside it. The network is one the price list names, in CAIP-2 form. Where it is not a Hedera network, the buyer needs no Hedera account: `holder` may be a public key, and the stamp transfer creates the account that holds them (§4.6) — this is the leg P-16 names. Where it is a Hedera network, the buyer signs a Hedera transfer of USDC and so has an account already, and the facilitator co-signs as fee payer and submits. The Postmaster keeps its own durable record of settled payment references — retained until the payment it names can no longer land, and surviving restarts — and does not rely on the scheme's replay rule for it. The resource server is the Postmaster's MCP server; a WebMCP page is a client of it and never the resource server, because the `402` and the retry that answers it are one exchange whose requirements the resource server issued and must recognize.

A Postmaster MUST accept a `PAYMENT-SIGNATURE` only against requirements it issued, and MUST issue and recognize them from one durable place.
`Conformance:` T-P11-6 — a fixture `PAYMENT-SIGNATURE` against requirements the Postmaster did not issue is rejected; one against requirements it issued before a restart is accepted after it; the WebMCP fixture page completes `buy_stamp` only through the MCP server.

**`hbar`.** The buyer pays in HBAR on Hedera. The purchase is one transaction that moves HBAR from the buyer to the Postmaster's account and stamps from the treasury to the holder, atomically: its transaction ID names the Postmaster as payer, so that it cannot be submitted without the Postmaster; its valid duration bounds how long the quoted amount stands; the buyer signs it in its own process and stops; the Postmaster signs its own leg, pays, and submits; and it settles whole or not at all. A signature on a Hedera transaction covers the whole body, so a Postmaster that altered an amount after the buyer signed would be submitting a transaction the buyer never signed, which the network rejects. A buyer on this leg has an account already; it may still name a public-key alias as `holder`.

The Postmaster MUST NOT submit a purchase transaction without the buyer's signature over the body it submits.
`Conformance:` T-P13-3 — a fixture purchase transaction with an amount changed after the buyer signed is rejected at the network and the suite records no receipt; a purchase request with no buyer signature is never submitted.

Both legs end the same way: a transfer of stamps whose `txRef` the receipt names, on consensus, readable by anyone. The purchase itself is otherwise off the record — WISHMail records postage spent, not postage bought.

At least one method the Postmaster offers MUST require no pre-funded Hedera account of the buyer.
`Conformance:` T-P16-1.

A payment reference MUST settle at most one purchase: a replayed `PAYMENT-SIGNATURE`, or a second `buy_stamp` naming the same HBAR transaction, transfers no stamps and returns the receipt of the first.
`Conformance:` T-P11-5 — replaying a fixture x402 payload, and re-submitting a fixture `hbar` purchase, each yields the original `StampReceipt` and no second transfer, before and after the fixture Postmaster is restarted; a fixture whose payment settled and whose transfer was interrupted returns `STAMP_PAYMENT_UNSETTLED` and, retried with the same reference, completes with one transfer.

### 14.3 The price list

The Postmaster publishes what it charges on consensus. The price list is a message on the Postmaster's price topic — an HCS topic whose sole submit key is the Postmaster's and whose memo is `wishmail:prices:1` — and the conformance claim names the topic as `prices` (§5.10). The price current at a purchase is the latest price message with a consensus timestamp before the purchase's; the Postmaster reads it from a mirror node at every purchase, and a Verifier reads the same message to check what was charged.

<!-- CHANGED: D-136 -->
```
PriceList
  spec           string          the specification version
  stampToken     {ledgerTag, tokenId, treasury}
  methods        [{method, network, asset, payTo?, facilitator?,
                   unitPrice? | rate? {source, pair, reference {amount, asset}},
                   bundles? [{count, price}]}]
  provisioning?  {method, unitPrice}         the provisioned path (§4.6), if offered
  validFrom      timestamp
```

`unitPrice` is the price of one stamp in the method's asset, written as a decimal string in that asset's natural unit — not in atomic units, which bake a network's decimals into a document a Verifier reads, and not as a JSON number, because the message is canonical JSON (§5.1) and a float is a hazard. A bundle is a price for a count, offered to everyone alike. A method priced by reference to another asset carries `rate` in place of `unitPrice`: `reference` is the price of one stamp in the reference asset, and `source` and `pair` name what the Postmaster reads at purchase to convert it into the amount it quotes. A method carries `unitPrice` or `rate`, never both. A bundle's price follows its method's pricing basis — the method's own asset where the method is fixed-priced, the reference asset where it is rate-priced — so that the rate converts a bundle at purchase exactly as it converts `reference`. A method names where the money goes: `payTo`, the Postmaster's receiving address, and `facilitator` where one settles the leg (§14.2); at least one is present. An `x402-usdc` method carries both, because the requirements it issues name the receiving address (§14.2). The buyer signs that amount and no other, the quote stands for the transaction's valid duration, and the receipt records the rate used and when (§5.4). Every number is the Postmaster's; this document fixes that there is one schedule, that it is on consensus before it is charged, and that it is the same for everyone (§4.5).

The Postmaster MUST publish a price message before charging under it, MUST charge exactly what the price message current at the purchase yields, and MUST NOT charge under a price it has not published.
`Conformance:` T-P11-4 — for every method the fixture Postmaster offers, `buy_stamp` charges what the price message current at the receipt's consensus timestamp yields — `count × unitPrice`, a bundle's price at its count, or the referenced rate applied to the reference price — for each of two buyers and each of three counts; a purchase attempted with no price message on the topic, or at an amount the current message does not yield, is rejected; two buyers at the same consensus time are charged the same. T-P11-2.

### 14.4 What a payment is not

A stamp is bought, held, and spent, and spending consumes it. Postage is affixed by a transfer from the sender to the treasury under the memo that names the envelope (§4.3), and that memo is the cancellation: the mark on the stamp that says it has carried something. A consumed stamp is not the recipient's, and it is not bought twice — it is postage paid, returned to the pool it was minted from, and never again this stamp. That is why the stamp is a fungible token and not a collectible (§4.1): what is spent is a unit, and a spent unit has no history to resell. The doorbell's fee is consumed the same way, collected by the treasury at the network when the request lands (§4.4): a recipient is not paid to be written to, and a sender does not pay a recipient — it pays for carriage.

A stamp is not refunded, not subscribed to, and not extended on credit; unspent stamps remain postage for as long as the token exists. A settlement is postage being spent, not bought, and is the only payment a Verifier ever reads (§8.5). Nothing in this section is required of a Verifier or of a recipient: the purchase leg is the one gate WISHMail has, and it stands at the counter, not on the road (§4.7).

---

## 15. Threat model and limitations

### 15.1 Who can do what

WISHMail's promises are made against the parties below. For each, this section says what the party can do, what it cannot, and where the document says so. A party not listed has no more reach than an observer.

**A lane peer** can submit under the lane's threshold key and can read every envelope addressed to it, which is its right. It can submit a chunk bearing the other party's identifier; the chain makes that chunk nothing (§7.4, §11.3). It can decline to sign for an envelope; that is `unclaimed`, not refusal (§11.4). It cannot make a foreign slice canonical, cannot open an envelope not sealed to its key, and cannot produce a receipt for an envelope it did not receive (§10.4).

**A sender** can affix postage and post what it likes. It cannot address an envelope without a resolution proof (§7.2), cannot present a resolution as more than it was (P-12), and cannot recover postage it has spent (§14.4). A sender that posts a malformed envelope has spent its postage on nothing (F-11).

**The Postmaster** sees, in transit, what any observer sees: ciphertext and metadata. It holds no agent's key (P-13), produces no postmark (P-2), and cannot forge, replay, or reprice: its price is on consensus before it is charged (§14.3), a purchase it submits carries the buyer's signature over the whole body (§14.2), and every submission it carries is witnessed by Consensus, not by it. It keeps what it needs to finish an act it is midway through and nothing after: a settled payment reference, until the payment it names can no longer land (§14.2); a purchase or a settlement it has been handed, until the transfer or the chunks it names are on consensus or the request is refused. It keeps no envelope, chunk, address, or resolution proof once the submission carrying them is witnessed, and it keeps no record of who wrote to whom — that record is Consensus's and anyone's (F-1). It can delay. It can decline to sell, which leaves no mark. It can lose a sender one stamp per abandoned first contact and nothing more (F-7).

**A registry operator** can answer wrongly now: the answer is snapshotted into the envelope and later disagreement is an observation (F-5). It can anchor an agent's declaration under its own key, which the resolution carries as `blurred` (§9.5). It can delist, edit, or delete without trace, which changes nothing any envelope bound and leaves no mark (§9.4). It cannot alter what an envelope was addressed by.

**A mirror node** can lie or omit. A Verifier's evidence never depends on which mirror it read (§11.1); a Verifier that suspects its mirror reads another, and may check the running hash (§11.6). A lying mirror is read around, not proven.

**The network** can be slow. It cannot reorder what it has ordered: consensus ordering is total, and every fact WISHMail relies on is a consensus fact.

**A holder of a compromised key** has the key's reach. A recipient's epoch key reads every envelope sealed to that epoch, past and future, until rotation, and every past one forever (F-2). A sender's account key can affix that sender's postage and post as that sender; it opens nothing, since nothing is sealed to it. A rotated account key strands every lane keyed to the old one (F-8).

**An Operator** reads everything its agent can read, on either end. The right to run the agent is the right to open its mail, and WISHMail's confidentiality ends at the operating estate: the sender's, because the sender holds the plaintext, and the recipient's, because the recipient holds the key. WISHMail declares this and defends nothing against it; the envelope's promise is against the carrier and the world, not against the addressee's own house. Nothing in any proof names an Operator: the fourth weld names an account (§7.2), and a receipt is an agent's key signing (§10.4).

**An observer** sees who wrote to whom, when, how often, with what postage, and whether a hand signed (F-1). It sees no content, ever.

**A Verifier** can report. It cannot bind or unbind, cannot raise a standing, and cannot stand above another Verifier (P-3, P-12).

### 15.2 What is defended, and by what

```
Threat                                        Answer                                   Where
a foreign slice under the sender's id         the chain from the header                §7.4, §11.3
an envelope addressed by nobody's word        resolution proof in the AAD              §7.2, §10.2
a receipt worn twice                          bound to one envelope, one postmark      §10.4, T-P1-7
an envelope on a lane not born of the door    lane birth checked at replay             §7.1, §11.4
postage due, or none                          unstamped; never certified mail          §4.2, §11.5
a stamp in the wrong token                    the pinned token or nothing              §4.1, T-P11-1
one payment, two purchases                    the Postmaster's durable record          §14.2, T-P11-5
a price nobody published                      the price topic, read at purchase        §14.3, T-P11-4
a purchase altered after signing              the buyer's signature over the body      §14.2, T-P13-3
a Postmaster's word offered as evidence       the Postmaster attests nothing           §3.5, P-2
a registry's word offered as evidence         snapshotted, appraised, never trusted    §9.6, §11.4
a mirror's word offered as evidence           mirror independence; running hash        §11.1, §11.6
an appraisal above its declaration            declared ≥ appraised, always             §11.5, P-12
silence offered as refusal                    slips, unclaimed receipts                §10.5, §11.4
```

### 15.3 What is declared and not defended

The limitations below are part of WISHMail. Each is numbered so that a release's LIMITATIONS document can name it.

**L-1 — No forward secrecy.** Compromise of an epoch's key exposes every envelope sealed to it; rotation bounds the future and does nothing for the past (F-2).

**L-2 — Metadata is public.** Doorbells, lanes, settlements, postmarks, receipts, and slips are readable by anyone forever (F-1).

**L-3 — Operator visibility is total and symmetric.** Confidentiality ends at each operating estate (§15.1).

**L-4 — Account-key rotation strands lanes.** A lane's threshold key names account keys literally; a rotated account needs new lanes (F-8).

**L-5 — The Postmaster's liveness is required for purchase and for first contact.** The bound on loss is one stamp per abandoned first contact; the wait is bounded by the sender's window (F-7).

**L-6 — Refusal leaves no mark.** A Postmaster that will not sell, a doorbell that does not answer, a registry that delists, a recipient that does not sign: none of these is on consensus as a refusal. WISHMail records what happened and never what was intended.

**L-7 — The standards WISHMail rides on are Draft.** Four of the six pinned standards are Draft and change by pull request; conformance is to the blobs §1.6 names, not to the names (F-9). HCS-10's own size limit is stated as one kilobyte and nowhere in bytes; WISHMail's line is 1000 bytes (§7.4).

**L-8 — Registry roots are what they are.** A NANDA index is a database served by one operator over TLS with nothing signed, logged, or snapshottable: mail addressed through `nanda` proves where the sender was told to send, not where the recipient was (§9.4). A HOL registration is on consensus under the registry operator's key, not the agent's, and is carried as `blurred`; the anchor may be dormant, and an agent the broker lists but the ledger does not is unresolvable under `hol` (§9.5). HCS-14's `registry` parameter is a routing hint and endorses nothing. An agent that wants its address provable after the fact declares under a consensus profile with its own key (§9.2).

**L-9 — Directories are neither live nor fresh by guarantee.** A broker's answer may be served from a cache tens of seconds old and its rate limits may be unpublished. Finding is not resolution; nothing a directory says is an input (§9.1).

**L-10 — A Verifier trusts its mirror unless it checks.** Mirror independence is required; running-hash verification is permitted and not required (§11.1, §11.6).

**L-11 — The USDC leg on a Hedera network is testnet-only at this version.** A public facilitator serves `hedera:testnet`; none serves `hedera:mainnet`; a mainnet USDC-on-Hedera leg needs a self-hosted facilitator. The keyless leg (P-16) runs on a non-Hedera network or on `hedera:testnet`. The upstream scheme's replay rule is a SHOULD; the Postmaster's own durable record is what prevents a second purchase (§14.2). Account creation for a keyless buyer is by the Postmaster's stamp transfer (§4.6), never by the settlement, so a facilitator's refusal to create accounts at its own expense does not reach WISHMail.

**L-12 — A stamp is fungible.** A spent unit returns to the treasury and is indistinguishable from unsold supply; "this stamp" is the unit under its postmark, not a token with a history (§4.3, §14.4).

**L-13 — Purchase, postage, and delivery are not one atomic act.** Postage is spent when affixed and consumed when the envelope settles; an envelope that never lands is an orphan whose postage is spent (F-3); a purchase is settled before stamps are held (§14.2). Each step is witnessed; the steps are not fused.

**L-14 — There is no Sponsor, no refund, no credit, and no subscription** (§3.8, §14.4).

### 15.4 The LIMITATIONS document

A release's LIMITATIONS document is where these limitations meet a particular deployment: which networks, which facilitator, which anchors, which profiles, and what the release does about each of L-1 through L-14.

A release's LIMITATIONS document MUST carry a section for each of L-1 through L-14, in order, stating how the limitation applies to that release; a release that claims a limitation does not apply to it MUST name the conformance test that shows why.
`Conformance:` T-P15-2 — `LIMITATIONS.md` is present, carries a section for each of L-1 through L-14 in order, and every claim that a limitation does not apply names a test the suite ran and passed.

### 15.5 This version's deployment

This version is deployed on `hedera:testnet` and on no other ledger. `hedera:mainnet` is a defined ledger tag (§5.1) with no deployment, no stamp token, no price topic, and no reference Postmaster at this version; a claim naming it is not a claim against this version. The reference Postmaster's price topic, stamp token, and facilitator are testnet artifacts named in its conformance claim, and its LIMITATIONS document says so under L-11.

---

## 16. Extensions

### 16.1 How to read this section

An extension is a capability this document declares and does not require. Nothing in this section binds a release that does not claim it; a release that claims an extension names it in its conformance claim under `extensions` and passes the tests named for it. An extension may add a tool, a profile, a proof, or a declaration field; it may not weaken an invariant of §12, remove a limitation of §15, or give any party a standing it lacks in the core. Where an extension and the core disagree, the core governs.

Every extension below is declared and not built at this version: its shape is fixed here so that a later release can build it without redesigning the core around it, and so that a reader knows what WISHMail intends and what it does not.

### 16.2 `attest` — a Verifier's signed appraisal

**What it is.** A Verifier's appraisal, signed and witnessed. A Verifier that has reconciled a scope publishes its appraisal on consensus, signed by its own key, so that a third party can rely on that Verifier's reading without repeating the reconciliation — and can repeat it whenever it likes, since the evidence is public.

**Actors and I/O.** `attest(scope, window) -> Attestation`, offered by a VERIFIER that claims this extension. An Attestation is a proof in the form of §10.1: its rule is appraisal at this specification's version; its inputs are the scope, the window, and the evidence digest (§11.7); its output is the appraisal of each envelope in scope — state, standing, reasons; its meaning names the Verifier and the mirror it read through; its canonical location is a message on the Verifier's own manifest topic, signed by the Verifier's key. An Attestation carries the evidence digest and nothing of the evidence; whoever wants the evidence reconciles.

**What it serves.** P-2 and P-3: the Postmaster attests nothing, and an attestation adds no standing — it is one Verifier's reading, replayable by any other. P-12: an attestation reports standings at or below what was declared, never above.

A Postmaster MUST NOT publish an Attestation, and an Attestation MUST NOT be an input to any appraisal.
`Conformance:` T-P2-3 — the reference Postmaster has no `attest` tool and its key signs no Attestation in the suite; a Verifier given a fixture Attestation that disagrees with the evidence appraises from the evidence and reports the Attestation under `observations`.

### 16.3 Key custody attestation

**What it is.** A declaration that an agent's keys live where it says — a hardware enclave, a KMS, a wallet — with evidence a Verifier can check. The core says nothing about where keys live beyond that they are born in the agent's process (P-13); this extension lets an agent say more, and lets a Verifier appraise the saying.

**Shape.** A declaration (§9.1) MAY carry `custody: {kind, attester, quote, quotedAt}`, where `quote` is an attestation document over the agent's public keys produced by an attester the release pins, and `quotedAt` is its consensus timestamp where the quote is on consensus or the time it was obtained where it is not. A resolution under a profile whose declaration carries `custody` reports it as declared. A Verifier that claims this extension replays the quote against the pinned attester root and reports the result beside the resolution's standing; a Verifier that does not, or whose replay fails, appraises `custody` as `withheld`.

**What it serves.** P-12 and P-15: custody is a declared claim with a replayable check, never a standing; a claim no one can check is `withheld`, not believed.

A Verifier MUST NOT raise an envelope's standing, or a resolution's, on the basis of a custody attestation.
`Conformance:` T-P12-7 — a fixture whose custody quote verifies and one whose quote is forged yield identical `appraised.standing`; the difference appears only in the resolution's `custody` report.

### 16.4 A spending cap on the purchase leg

**What it is.** A buyer that wants to bound what a purchase can cost — a session's ceiling, a bundle whose count is decided late, a quote in an asset whose price moves — needs the cap to live in the artifact it signs, not in a message beside it. On Hedera the `exact` scheme requires the settled amount to equal the requirement exactly, so a cap is a different primitive, not a different amount field.

**Shape.** A method `hbar-allowance` under which the buyer signs an HTS or HBAR allowance to the Postmaster's account of at most the cap, and the Postmaster settles each purchase within it by a transfer it signs alone, recording each on the receipt; and, where a facilitator offers it, an x402 scheme whose authorization carries a maximum and whose settlement reports the amount taken. Under either, the cap is what the buyer signed, and the price list (§14.3) governs what is taken from it.

**What it serves.** P-11 and P-13: what is taken is the published price and nothing else; the buyer's signature, not the Postmaster's word, bounds the exposure.

Under a capped method the Postmaster MUST NOT settle more than the cap the buyer signed, in total across every settlement against it.
`Conformance:` T-P11-7 — a fixture allowance of `n` stamps' worth admits purchases summing to `n` and rejects the one that would exceed it; the receipts sum to the allowance consumed.

### 16.5 A plain-document profile

**What it is.** A resolution profile, `document`, for an agent that publishes a declaration as a JSON document at an `https://` URL it controls: the smallest possible way to be addressable, for agents on no registry at all. Social-committee, snapshotted, `blurred` unless the document is signed by a key the profile can verify.

**Shape.** Address: the URL. Rule: fetch; the document is JSON with a top-level `wishmail` declaration (§9.1), and one that is not resolves to `RESOLVE_NOT_FOUND`; snapshot the document; assign `blurred` unless a detached signature over the document verifies against a key the URL's origin publishes at a well-known location the release pins. Meaning: `trustClass: social-committee`, the origin. TTL: the response's `max-age`, else 3600 seconds.

A release that claims `document` MUST treat it as a non-consensus profile under §9.6: replay from the snapshot, drift as an observation.
`Conformance:` T-P5-5 — the CORRESPONDENT suite passes with `document` as the sole profile; T-P12-6 extends to a `document` fixture.

### 16.6 Finding

**What it is.** A tool that turns a question into addresses: `find(query, directories) -> [address]`, reading the directories a release names — a NANDA index, the HOL broker, an HCS-2 listing, an A2A AgentCard at a well-known path. The core defines no directory and lets no directory answer resolution (§9.1); this extension gives finding a tool of its own, so that a caller can go from a name it half-knows to an address it can resolve, and so that finding and resolving stay two acts.

An address returned by `find` MUST be resolved by a profile of §9 before it is used, and nothing `find` returns MUST be an input to any resolution or appraisal.
`Conformance:` T-P6-6 — a fixture `find` result carrying forged coordinates does not alter the resolution the profile computes for the same address.

### 16.7 Other ledgers

**What it is.** A ledger tag is already a parameter of every AAD (§7.2), every locator, and every settlement. WISHMail on another ledger is the same envelope with a different tag: a resolution profile whose inputs live there, a lane and a manifest topic in that ledger's terms, a stamp token there, and an anchor for its registrations. The core is written so that nothing in §7, §8, §10, or §11 names Hedera except through the pinned standards and the tag, and it defines two tags and refuses every other (§5.1). An extension for another ledger defines its tag, pins the standards its lanes, manifests, settlements, and anchors ride on, and names that ledger's consensus as the witness of its postmarks (§3.6). Until such an extension is claimed, an envelope under any other tag is unbound (T-P9-11).

### 16.8 Held

Mandate lineage — an Operator's delegation to its agent as a proof, so that an Operator could enter the record deliberately rather than be inferred; a handoff carrier for TRACE-style provenance between agents; and the HCS-19 and HCS-21 postures are held: declared as candidates, given no shape, because nothing in the core needs them and no reader of this version should design against them. A broker-computed trust score is not an extension and will not be one: it cannot be re-derived, so it can never touch a standing.

The A2A AgentCard is held as a resolution profile: an address at a well-known path, a snapshotted document, `social-committee`; it has the shape §16.5 gives `document` and is not given one of its own until a release wants it. The `nativeId` of a NANDA email identity is held with them. HCS-14 forms a NANDA agent's `nativeId` as a domain, and a `urn:ai:email:` identity has no domain that names the agent; the forming rule is therefore a matter for HCS-14's own text, and WISHMail proposes it there — the URN as `nativeId`, the index host as `domain` — rather than stating it here. Until HCS-14 states one, WISHMail forms no UAID for such an agent, and the `nanda` profile resolves without one (§9.4).

---

## 17. Postal grounding

### 17.1 How to read this section

WISHMail's vocabulary is postal because certified mail is the settled human answer to the problem WISHMail answers for agents: proof that a specific message was posted to a specific address at a specific time, from a carrier that reads nothing and can hide nothing. This section names the postal law and practice each design choice descends from, so that a reader can judge the analogy where it holds and see where it is deliberately refused. It is informative: it contains no requirement, and where it and a normative section differ, the normative section binds. The law named is that of the United States Postal Service and of the Universal Postal Union; it is cited as the source of a design, not as a claim about any jurisdiction.

### 17.2 The letter

Postal regulation defines a letter as a message directed to a specific person or address (39 CFR §310.1); an unaddressed circular is not one. An envelope is a letter in that sense and in no other: it is directed to one resolved address, it carries one stamp, and there is no unaddressed envelope and no broadcast (P-10; §1.2, §4.1). What is not directed is not mail, and WISHMail does not carry it.

### 17.3 The mailbox is not a public forum

A residential mailbox is reserved to posted, stamped mail; a private party may not fill it with unstamped material, and the mailbox is not a public forum for that purpose (*USPS v. Council of Greenburgh Civic Associations*). An agent's doorbell is its mailbox: it charges one stamp to ring, under a fee the network collects before anything lands (P-7; §4.4). A recipient is no more obliged to answer than a resident is obliged to open the door (§8.2); what the fee secures is that only stamped mail reaches the door at all. Inside the house the rule inverts: a lane, once open between two agents, carries no fee (§7.1), because the parties to a lane are already known to each other.

### 17.4 Uniform postage and universal service

The universal service obligation (39 U.S.C. §101) requires prompt and reliable service to patrons in every area, and a uniform price for a letter regardless of the distance it travels; the rural route is not surcharged. WISHMail's geography is the registry: one stamp costs the same whichever registry resolved the recipient, whichever profile the sender read it through, and whatever the envelope contains (P-11; §4.5), and the Postmaster accepts every properly stamped, properly addressed envelope and distinguishes none by content, sender, recipient, or profile (§3.5). The obligation is what makes the service a post and not a club; it is the reason the registry layer is plural rather than chosen.

### 17.5 The two tiers

Postal law separates market-dominant products, whose prices are capped and published, from competitive products, whose prices are set freely — and walls the two apart so that a carrier with an obligation in the first cannot use it to underprice rivals in the second (the Postal Accountability and Enhancement Act; 39 U.S.C. §§3621, 3631). WISHMail's stamping is the first tier: one published schedule on consensus, capped by publication rather than by negotiation (§4.7, §14.3). Reconciliation is the second: `verify` is free as a verb, forever, and a narrative service may charge for the reading and never for the evidence (§4.7, §11.7). The private-express suspension for extremely urgent letters (39 CFR §320.6) admits a private carrier only above a price floor set against postage; a service class that WISHMail declares and does not define (Q-11) inherits that discipline — priced above the stamp, never below it.

### 17.6 The carrier does not read, and cannot hide

A sealed envelope is the carrier's business on the outside only. The Postmaster holds no key (P-13), sees ciphertext and metadata as any observer does (§15.1), and produces no postmark (P-2). Where the analogy is refused is liability. A postal carrier's immunity for the loss or miscarriage of mail — the postal exception to the Federal Tort Claims Act, 28 U.S.C. §2680(b) — extends even to intentional nondelivery (*United States Postal Service v. Konan*): the patron's remedy lies in no court, and the carrier's word about what it carried is the only record. WISHMail needs no such immunity because it has no such record. A settlement without chunks is an orphan any Verifier can see (F-3); an unanswered doorbell leaves a slip (F-6); every submission that reaches a lane is witnessed by Consensus and not by the carrier (§3.5). The Postmaster's refusal leaves no mark, and its acceptance always does. Trust in the carrier is replaced by replay of the record (P-3).

### 17.7 Certified mail, the return receipt, and the notice

Certified mail sells two things and insures nothing: proof of mailing — the receipt bearing the postmark — and, for a further fee, proof of delivery, a card the addressee signs that is returned to the sender. It never examines contents. WISHMail's proof of posting is the postmark on chunk 0 (§10.3); its return receipt is the signed card (§10.4): requested and paid by the sender, signed by the recipient alone, bound to one envelope and one postmark so it cannot be re-worn, and testimony where it says the envelope opened (P-15; §10.6). Where the carrier finds nobody home it leaves a notice of attempted delivery, which is not a refusal and not a return; WISHMail's slip is that notice (§10.5), and silence is reported as silence (F-6).

Delivery is to the box, not to the hand. A post-office box is a delivery point whose holder collects at will, and the carrier's obligation ends at the box; the RECIPIENT class is a post-office box (§1.4), the lane is the box (§2.3), and the only proof that a hand took an envelope is the card the hand signed (§8.4).

### 17.8 Private hands

The letter monopoly of the Private Express Statutes (18 U.S.C. §§1693–1699; 39 U.S.C. §§601–606) exempts a letter carried by private hands without compensation or by a messenger on a single occasion. Unstamped HCS-10 messaging is private hands: outside WISHMail's business, uncertified by it, and unclaimed by it (§1.2, §4.7). WISHMail takes the universal-service obligation and refuses the monopoly: it certifies mail and does not monopolize messaging.

### 17.9 One postal territory

The countries of the Universal Postal Union form a single postal territory for the reciprocal exchange of letter-post items (UPU Constitution, art. 1). A post carries an item addressed in another administration's system: it reads the address in that system's terms and does not adjudicate that system's addressing. Registries are addressing systems and ledgers are administrations. A sender's resolution proof names the system it read and commits what it read (P-6; §9); WISHMail adjudicates between none (P-5; §3.4); a ledger tag names the administration whose consensus witnesses a postmark (§5.1, §16.7). The bridge between silos is the bridge a post makes at a border: the item crosses, and each side's record of it is its own.

### 17.10 What a stamp does not fund

A carrier compelled to fund obligations decades ahead out of today's postage is a carrier that fails (the pre-funding mandate of the Postal Accountability and Enhancement Act and its repeal in the Postal Service Reform Act of 2022, Pub. L. 117-108 §102). A stamp buys carriage and nothing perpetual: no retention beyond what the Postmaster needs and states (§3.5, §14.2, §15), no refund, no credit, no subscription (§14.4; L-14). Postage is spent when affixed and the obligation it buys ends at the lane.

### 17.11 Concordance of postal and WISHMail terms (informative)

```
Post                               WISHMail                           Where
letter                             envelope                           §2.2, §17.2
address                            address, resolved under a profile  §2.2, §9
stamp; postage; postage due        stamp; postage; postage-due        §4.1, §4.2
mailbox                            doorbell                           §4.4, §17.3
post-office box                    RECIPIENT; the lane                §1.4, §7.1
postmark (cancellation)            postmark                           §2.2, §10.3
proof of mailing                   the postmark on chunk 0            §10.3
return-receipt card                return receipt                     §10.4
notice of attempted delivery       attempted-delivery slip            §10.5
letter carrier                     the Postmaster, as courier         §3.5
postmaster                         the Postmaster, as issuer          §3.5, §4.1
uniform rate; universal service    P-11; §3.5's acceptance rule       §4.5, §17.4
market-dominant / competitive      stamping / reconciliation          §4.7, §17.5
private hands                      unstamped HCS-10 messaging         §1.2, §17.8
single postal territory            registry plurality; ledger tags    §3.4, §16.7, §17.9
```

---

## 18. Appendices

### 18.1 How to read this section

The appendices are informative. They index the record beside this document — its decisions, its correspondence with earlier identifiers, its pins, and its repository — and bind nothing.

### 18.2 ADR index

Every decision that shaped this document is an architecture decision record, keyed `D-n`, kept in `spec/adr/` in the repository, one file each, with the reasoning, the alternatives, and the date. This index gives each its title and the sections it shaped; the ledger beside this document holds the full text of D-42 onward. Decisions D-1 through D-41 precede the ledger this document is kept beside; they are in `spec/adr/` and are not repeated here. A decision that shaped no sentence of this document is not indexed here; it is in `spec/adr/` and in the ledger.

<!-- CHANGED: D-135, D-136 -->
```
D-42   Conformance classes: VERIFIER the floor; none includes another    §1.4
D-43   Resolution reserved for address -> coordinates; reconciliation    §2.3
D-44   The pedestal: one stamp token; the Postmaster holds its supply    §3.5, §4.1
D-45   Three acts: assembly, delivery, reconciliation                    §3.2, §8.4
D-46   Chunking inside HCS-10 message operations; no HCS-1 for content   §5.6, §7.4
D-47   The Postmaster pays; the agent signs; no Postmaster key on topics §3.5, §4.3
D-48   No Sponsor; funding is a payment                                  §3.9
D-49   The stamp is fungible                                             §4.1
D-50   Weight by ciphertext size; postage-due is a fact                  §4.2, §7.5
D-51   Consumption: the doorbell fee; the affixing transfer              §4.3, §4.4
D-52   Orphans are not refunded and do not expire                        §4.3, §8.6
D-53   The AAD names lane, resolution proof, nonce; its hash is the id   §7.2
D-54   Two provisioning paths; keys born in the agent's process          §4.6
D-55   Manifests published before send; structured locators             §5.2, §9.1
D-56   One hashing rule: SHA-256 over canonical JSON                     §5.1
D-57   Provisioning may be priced, never required                        §4.6, §14.3
D-58   The six tool names                                                §6.1
D-59   The return-receipt fee is one stamp in postage                    §4.2, §7.7
D-60   The lane, deterministically                                       §7.1
D-61   Sealing is HPKE base mode                                         §7.3
D-62   Constants OUNCE_BYTES and MAX_WEIGHT                              §7.5
D-63   Four trust classes in the vocabulary                              §2.2, §9
D-64   The fourth weld: the sender is the settlement's from account      §7.2
D-65   Rotation: epochs for encryption keys; account keys are literal    §7.6, §15.3
D-66   Two machines on two axes                                          §8
D-67   Deriving state from evidence                                      §8.5
D-68   attest is an extension                                            §8.3, §16.2
D-69   The resolution profiles and the one declaration                  §9.1
D-70   Declaring under hcs14 requires the HCS-2 registry                 §9.2
D-71   Non-consensus profiles snapshot their inputs                      §9.1
D-72   The dns address and its one TXT leaf                              §9.3
D-73   The manifest topic                                                §9.1
D-74   Terms: meaning, claim, declaration                                §2.2, §2.3
D-75   The VERIFIER floor is profile-less                                §9.6
D-76   The return receipt is a ScheduleSign                              §10.4
D-77   SCHEDULE_MAX_LIFETIME                                             §1.6, §10.4
D-78   The return receipt, composed                                      §10.4
D-79   The proof of posting is chunk 0                                   §10.3
D-80   The slip's manifest precedes the slip                             §10.5
D-81   What a receipt proves and what it states                          §10.6
D-82   Evidence and observations                                         §5.10, §11.6
D-83   Header epoch must equal the resolution's                          §11.4
D-84   Mirror independence                                               §11.1, §11.6
D-85   The narrative carries the bundle's digest                         §11.7
D-86   Exactly four standings                                            §6.7, §11.5
D-87   The chain from the header                                         §5.6, §7.4, §8.5, §11.3
D-88   Standing order and reasons as test identifiers                    §11.5
D-89   Versioning: wire strings carry major.minor                        §1.7
D-90   schemaRef is HCS-13's version-pinned locator                      §5.11
D-91   Paperwork requirements keyed to P-15; pins to P-9                 §12
D-92   Pins filled from the canonical repository                         §1.6
D-93   UAID grammar                                                      §2.2, §9.2
D-94   Transaction memos bounded to what HCS-10 defines                  §6.1
D-95   Lanes are read in full                                            §7.1
D-96   CHUNK_WIRE_MAX = 1000                                             §7.4
D-97   The nanda profile is the NANDA v2 index                           §9.4
D-98   nanda: keying, address form, v2 only                              §9.4
D-99   Every profile rule carries its own conformance note              §9.2 – §9.5
D-100  The token is $POSTAGE                                            §4.1
D-101  The price list lives on consensus                                 §4.5, §14.3
D-102  The x402 leg and its pins                                         §1.6, §14.2
D-103  The HOL broker is not a dependency                                §1.6
D-104  hol reads consensus; the broker is a directory                    §9.5
D-105  The doorbell fee is consumed by the treasury                      §4.4, §14
D-106  The hbar leg                                                      §14.2
D-107  hcs14 accepts a direct HCS-1 memo                                 §9.2
D-108  hol matches identifier and nativeId, never the label              §9.5
D-109  The resource server holds the 402 state                           §14.2
D-110  Self-registration on an open anchor                               §4.6
D-111  Extensions are named on the claim                                 §5.10, §16.1
D-112  The NANDA email nativeId is held and proposed upstream            §16.8
D-113  An undefined ledger tag is refused in the core                    §5.1, §11.5
D-114  Two ledger tags                                                   §5.1, §15.5
D-115  Invariant test ranges brought current                             §12
D-116  §16 approved                                                      §16
D-117  §16.2 opens on the appraisal, unfigured                           §16.2
D-118  §17 drafted                                                    §17
D-119  §18 drafted                                                    §18
D-120  §17 approved; citations verified                               §17
D-121  §18 approved; the concordance stays, with a pointer            §18.3
D-122  What the Postmaster keeps, and for how long                    §15.1
D-123  §19 drafted                                                    §19
D-124  §19 approved; the browser surface stated as unsurveyed         §19.4
D-125  Frozen as 0.5.0; wire strings carry 0.5                        §1.7, §7.2, §7.3
D-126  Read-through corrections at the freeze                         §3.9, §4.6, §5.3, §6.4, §7.4, §10.4, §11.4, §15.5
D-127  The AAD's key names are §7.2's everywhere; v from the schema  §5.5, §5.6
D-128  The A2A AgentCard is held                                      §16.8
D-129  Four of the six pinned standards are Draft                     §13.2, §15.3
D-130  Postage is spent at affix and consumed at settlement           §15.3
D-131  CHANGED markers begin at this commit                           §1
D-135  HIP-991 and HIP-423 pinned                                     §1.6
D-136  Rate-priced methods; prices are decimal strings                §5.4, §14.3
```

### 18.3 Concordance of identifiers (informative)

Where an earlier draft of WISHMail keyed an invariant differently, this table gives the correspondence, so that a reader holding that draft can find the invariant here. It records identifiers only; the text that binds is §12's.

```
Earlier    Earlier name                  Here          Disposition
P-1        Keyless verification          P-3           merged into public-data replay
P-2        Payment–envelope binding      P-1           binding, with the AAD and the chain
P-3        Never hold the soul           P-13          widened to every agent private key
P-4        Affidavit, not gate           P-14          unchanged
P-5        Open roads only               P-4, P-5      split: no broker; registry-plural
P-6        Category honesty              P-15          unchanged in intent
P-7        Lane equality                 P-16          mechanism named
P-8        Deterministic resolution      P-3           merged; determinism carried into P-3
P-9        Mutability chosen at birth    P-17          unchanged
```

No earlier invariant is dropped; every conformance test is keyed to this document's identifiers only. The working ledger kept beside this document carries the same table with the provenance of each correspondence, and is the record where the two disagree.

### 18.4 Pins

§1.6 is the appendix of record for pins, and `spec/pins.json` is its machine-readable form: for each pinned standard, `{repo, commit, path, blobSha, sha256}`; for the stamp token, `{ledgerTag, tokenId, treasury}` per network (§4.1); for the minor version, the registered schema digests and wire strings (§1.7). The suite reads `spec/pins.json` and refuses to report while any pin is unfilled (T-P9-2).

### 18.5 Repository layout

The repository that carries this document is one monorepo in three parts.

```
spec/           this document; spec/schemas/ one JSON Schema per §5 object and the
                declaration of §9.1; spec/vectors/ (aad.json, seal.json); spec/pins.json;
                spec/adr/ (D-1 onward)
conformance/    the suite: one test per T-<P-ID>-<n>, keyed to §12; fixtures; the
                exception corpus of §8.5; the report the claim names
app/            the reference implementation: the MCP server, the WebMCP page as its
                client, the SDK, the command line, and the resolvers, each declaring
                the specification version and the classes and profiles it claims
```

The schemas in `spec/schemas/` are: `proof`, `mail-coordinates`, `stamp-receipt`, `settlement`, `envelope`, `chunk`, `postmark`, `return-receipt`, `attempted-delivery-slip`, `evidence-bundle`, `narrative`, `conformance-claim`, `declaration`, and `price-list`, one file each, named as here with the suffix `.schema.json`. The specification leads, the schemas follow, and the tests are the court.

---

## 19. Open questions

### 19.1 How to read this section

This section names what this document leaves open, and for each, what closes it. It is informative: an open question is not a requirement and not a promise, and a reader who finds a question here that a normative section appears to answer should take the normative section as the answer and this entry as the part it does not reach. Questions are grouped by where their answer comes from — a deployment, a design, or a text this document does not own.

### 19.2 Open at deployment

**The stamp token.** `$POSTAGE` is pinned per network by token identifier and treasury (§4.1). The pin is filled at the first deployment on a network and not before; until it is, no claim can be made against this version on that network (T-P9-2). The testnet pin is the first to fill.

**Mainnet.** `hedera:mainnet` is a defined tag with no deployment and no token (§15.5). What closes it is a mainnet token, a mainnet HCS-2 registry for `hcs14`, a facilitator or a self-hosted settlement for the USDC leg (L-11), and a LIMITATIONS document that says so; nothing in the design changes.

**The price schedule.** This document fixes that there is one schedule, on consensus, the same for everyone (§4.5, §14.3); the numbers on it — the unit price, the bundles, and the price of provisioning — are a deployment's, published on its price topic and named in its claim.

**The rate for the `hbar` leg.** A purchase in HBAR is priced at the published USDC price through a rate the Postmaster names on the receipt (`rate.source`, §14.2). Which source a reference Postmaster reads, and what it does when that source is unavailable, is a deployment's choice recorded in its price list and its LIMITATIONS document, not this document's.

### 19.3 Open in the design

**Postage classes (Q-11).** Weight is the only tier (§4.2). A class — a service faster, or witnessed more, or carried differently — is declared and not defined (§4.7). What closes it is an extension that names the class, states what the buyer gets that a stamp does not, prices it on consensus above the stamp and never below (§17.5), and keeps P-11 for the stamp itself.

**Governance of the pedestal (Q-7).** One party holds the supply key of the token, publishes the price list, and operates the Postmaster (§3.5, §4.1, §14.3). Who that party is, how the supply key and the price topic's submit key change hands, and whether a second party may vend stamps from the same supply are questions for a later version; delegated vending is the first of them. Nothing a Verifier does depends on the answer.

**The extensions declared in §16.** `attest`, key custody, the spending cap, the `document` profile, `find`, and any other ledger each have a shape and a test and no implementation. Each closes when a release claims it and passes its test. Other ledgers close one at a time: an extension per ledger tag, pinning that ledger's standards (§16.7); a cross-ledger proof format — CLPR or another — is a question that opens only once two tags exist.

**What is held (§16.8).** Mandate lineage, a TRACE carrier, and the HCS-19 and HCS-21 postures have no shape because nothing in the core needs them. They close when something does.

**A non-blocking `send`.** `send` returns after chunk 0 is witnessed and blocks until then (§6.4). Whether a later version returns earlier, and what it would return, is not decided; this version does not.

### 19.4 Open upstream

**The native identifier of a NANDA email identity.** HCS-14 forms a NANDA agent's `nativeId` as a domain and says nothing of `urn:ai:email:` identities. The rule is proposed to HCS-14; until its text states one, WISHMail forms no UAID for such an agent (§16.8).

**A NANDA attestation slot (Q-10).** The NANDA index has no field in which a third party's signed statement about an agent can be carried. Should one appear, §16.2's Attestation is the object that would fill it; nothing here waits on it.

**The Draft standards.** Four of the six pinned standards change by pull request (L-7). A change closes nothing here and opens nothing: conformance is to the blobs §1.6 names, and a later revision is taken up, if at all, by a later minor version with its own pins (§1.7).

**The browser-side surface.** The reference implementation's page speaks WebMCP, an early draft of a browser-native tool protocol whose text changes faster than the standards §1.6 pins. This document pins none of it and has surveyed none of it: the page is one client of the MCP server (§14.2, §18.5), no requirement here depends on it, and conformance is measured at the server and on consensus. Whether to pin it is a question for the release that ships the page, and it is open until then.

### 19.5 Not open

Some questions a reader might expect to find here are settled, and this document does not reopen them: there is no broadcast and no unaddressed envelope (P-10); no broker, key, or credit is required for conformance (P-4); no smart contract is required or used; no score computed off consensus can raise a standing (P-12, §16.8); the Postmaster attests nothing (P-2); and unstamped messaging is not WISHMail's business (§1.2). Each is a decision with a record (§18.2), not a question.

---
