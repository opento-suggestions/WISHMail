# OPERATIONS — how the testnet entities were made

What was created on `hedera:testnet`, in what order, by what means, and every place the means departed from the tool a reader might expect. It also carries the **gate report** for each step, written and committed before that step's first signature — including for steps that have not signed, and in one case for a step whose whole point at the time of writing was that it must not. The entities themselves — IDs, transaction references, consensus timestamps — are in `app/deployment/hedera-testnet.json`, which is also the provisioning script's idempotency record. This file is the method; that file is the result.

`spec/pins.json` carries only what §18.4 fixes: the standards pins, the stamp token and treasury per network, and the minor version's registered schema digests and wire strings. Everything else about a deployment lives in the ops record, per D-132's precedent and D-144.

**The record cites a tag, not a hash.** `app/deployment/hedera-testnet.json` names the specification text every entity was provisioned against as an annotated tag — `v0.5.2` for the first provisioning — and never a commit hash. A conformance claim names a *version* (§1.7, §5.10), and a version is what a tag is; a hash is only where that version happened to sit in one clone's history. The tag object carries the version's own statement of what changed and the sign-off that landed it, so a reader who has the tag has the text and its warrant together.

## The record is the mirror node

Every entity in the ops record is written from a **mirror-node REST read**, not from an SDK receipt and not from any tool's return value. A receipt says what was submitted; the mirror node says what consensus holds, which is the only thing a Verifier can check afterwards.

This is not merely a preference. P-3 makes replay a function of public consensus data, and P-4 forbids a broker; together they fix a mirror node as a read interface rather than a broker. The same rule governs `conformance/` and is written down there.

## Libraries, why each is a dependency rather than a few lines here — and the three things that are not

**`ajv` 8 with `ajv-formats`, imported as `ajv/dist/2020`.** The schemas in `spec/schemas/` declare JSON Schema draft 2020-12, and D-143 requires the first `PriceList` to be validated against `price-list.schema.json` before it is submitted and byte-compared after. A validator that implements some of 2020-12 would make "validated against the schema" mean something narrower than the sentence says.

**`canonicalize` 4 for RFC 8785.** §5.1 canonicalizes with RFC 8785, and the same canonicalization is the basis of the AAD in §7.2, whose SHA-256 is the envelope identifier and whose court is `spec/vectors/aad.json` (T-P1-4). One library serves both, and it is a dependency rather than a hand-rolled function for exactly that reason: a canonicalizer that is subtly wrong about number formatting or key ordering produces envelope identifiers that no other implementation reproduces, and the failure is silent. **[CC]**, recorded here per the plan; the alternative considered was `json-canonicalize`, and the choice between them is not load-bearing — implementing it ourselves would have been.

**`@types/node`, pinned to `^22` in `app`.** `app/tsconfig.json` declares `"types": ["node"]`, and until now the package reached the tree only through `protobufjs`'s unbounded transitive range, so type-checking depended on a hoist. It resolves to 22.x under `app/` against the Node 22 this is built on, rather than the 26.x the root happens to hoist.

**`@modelcontextprotocol/sdk` 1 for the tool surface.** §6.1 defines six verbs and requires that "every transport that exposes it — a WebMCP page, an MCP server, an SDK, a command line — exposes the same schema" (T-P15-4), and §14.2 makes the MCP server the x402 *resource server*: it issues the `402` with its requirements and must recognise the retry that answers it, which is one exchange over HTTP and not a local pipe. So the surface needs a real Streamable HTTP MCP transport, and MCP-B must be able to speak to it, because judges cannot be assumed to have the Chrome flag. Hand-rolling the framing is the hazard the canonicalizer's ruling names: a JSON-RPC dialect that is subtly not MCP interoperates with our own client and nothing else, and the failure appears as someone else's client not working rather than as a test going red. **[CC]**, recorded here per the plan; the alternative considered was writing the framing ourselves, and it lost on interoperability rather than on effort. **What this dependency is not:** MCP is not a pinned standard (§1.6), nothing in `conformance/` depends on it, and no conformance claim rests on it — D-124 holds the browser surface unpinned and unsurveyed by choice, and this ruling does not change that.

### The two things that are not a dependency

**The seal is composed here, on `node:crypto` — RULED (Sonic, 2026-09-08).** This is the canonicalizer's argument with its conclusion reversed, and the reversal turns on one fetched fact.

> **FETCHED 2026-09-08, `rfc-editor.org/rfc/rfc9180.html`.** Appendix A publishes test vectors for seven ciphersuites: A.1 DHKEM(X25519, HKDF-SHA256) / HKDF-SHA256 / AES-128-GCM; A.2 the same with ChaCha20Poly1305; A.3–A.5 P-256; A.6 DHKEM(P-521, HKDF-SHA512) / HKDF-SHA512 / AES-256-GCM; A.7 X25519 export-only. §7.3's ciphersuite — DHKEM(X25519, HKDF-SHA256) / HKDF-SHA256 / **AES-256-GCM**, IDs `0x0020` / `0x0001` / `0x0002` — **is not among them.**

The canonicalizer is a dependency because a subtly wrong canonicalization fails **silently** and no official vector stands behind RFC 8785's number-formatting and ordering edges. Here that hazard is answered by an official vector. §7.3's suite differs from **A.1** in exactly two places: one field of the key schedule's `suite_id`, and the AES key length. So the same code, parameterised to A.1's ciphersuite, must reproduce every published A.1 base-mode value — `DeriveKeyPair` from `ikmE` and `ikmR`, `shared_secret`, `key_schedule_context`, `secret`, `key`, `base_nonce`, `exporter_secret`, and the sequence-0 ciphertext. That is `npm run check:seal`, and it is a gate rather than a comment. What A.1 cannot reach, `spec/vectors/seal.json` courts, opened by the independent implementation T-P1-5 requires.

And the alternative was not neutral. **FETCHED 2026-09-08:** `@hpke/core` carries **CVE-2025-64767** — a race condition in the public `SenderContext.seal()` API that reuses the same AEAD nonce across `seal()` calls, described as complete loss of confidentiality and integrity of the produced messages, **CVSS 9.1 critical**, every version before 1.7.5 affected. Separately, its issue #682, opened 2025-12-01 and closed 2026-01-04, reports `i2Osp` mishandling 32-bit and larger integers, so that computed nonces are not interoperable and are re-used at sequence 2³². Two nonce defects in one single-maintainer library inside a year. **The claim is not that either would have broken our seal:** §7.3 is single-shot base mode at sequence 0, where neither bug is reachable. The claim is about where the hazard lives. Nonce handling is exactly the part a library was supposed to answer for, and this library's own history says it did not — while the part we most need answered, the composition, has an official vector we can run ourselves. **[CC]** drafted, **[S]** ruled; the alternative considered was `@hpke/core` with `@hpke/dhkem-x25519`, and it lost on both grounds together.

**The consequence, named rather than discovered.** `node:crypto` is not the browser. §14.2 fixes the WebMCP page as a *client* of the MCP server and never the resource server, so nothing shipping today seals or opens in a browser; D-124 holds that surface unpinned by choice. An SDK that later runs in one ports the same eighty lines onto `crypto.subtle`, which exposes the same three primitives — X25519 `deriveBits`, HKDF, and AES-GCM. What would not port is a library that assumes Node, which is the reverse of the usual argument and is why this is written down rather than assumed.

**The durable store is a few lines here, not a dependency.** §14.2 requires that "the Postmaster keeps its own durable record of settled payment references — retained until the payment it names can no longer land, and surviving restarts," and T-P11-5 and T-P11-6 test exactly the restart: a replayed payload returns the original `StampReceipt` with no second transfer, and requirements issued before a restart are accepted after it. That is a keyed set of tens of rows behind `WISHMAIL_STATE_DIR`, and `journal.ts` already established the discipline it needs — write a temp file, then `renameSync`, so a half-written file is never observed. `better-sqlite3` is a native build on Windows inside a five-day window and `node:sqlite` is experimental on Node 22: a build-toolchain risk taken on for something a directory does. **[CC]**, recorded here per the plan; the alternative considered was `better-sqlite3`, and it lost on the toolchain rather than on the code.

**A mirror node's KEY LIST is decoded here, not by a library.** §7.1 requires a lane's submit key to be "a threshold of the two agents' keys, and MUST NOT include any other key" (T-P17-2), and §11.4 has a Verifier check that from consensus. A mirror node returns a single key as raw hex and a key **list** as `{_type: "ProtobufEncoded", key: "<hex>"}`, so the list has to be decoded before the invariant can be checked at all. The alternatives were both worse. A `TopicInfoQuery` against a consensus node returns the structure already parsed — and it is a **paid query**, so a Verifier would need an account and a balance to check a lane, which is exactly what P-4 forbids. And `@hashgraph/proto`, which ships the generated decoder, is **not in this repository's dependency tree**: it resolves today only from a `node_modules` directory *above* the repository, so importing it would work on this machine and fail on a clean clone — the worst kind of dependency, because it passes here. So it is composed in `app/src/core/protokey.ts` — it began in `app/sdk/` and moved to `core/` when the counter needed the same primitives, because a Postmaster module that imported a Correspondent module would blur the line CLAUDE.md §11 draws between the two — on the same grounds the seal is: the surface is forty lines, it is a **read** of public data, the wire format is fixed by protobuf itself rather than by a draft, and it cannot fail silently the way a mis-composed cipher can — a wrong parse yields keys that match neither account, which is a loud refusal. `[CC]` **And the first version of it was wrong**, caught by `check:correspondent` before it ever met a lane: protobuf field numbers are per message, not global, so a context-free walker read `ThresholdKey.keys` (field 2) as `Key.ed25519` (also field 2) and handed back the key list's own bytes as though they were a public key. The alternative considered was to skip the decode and check only single-key topics, which would have made T-P17-2 uncheckable for the one topic type it is about.

**And its primitives are now read twice, by two parties, for two rules.** `app/src/counter/body.ts` decodes a
`TransactionBody` on the same `varint` and `fields` — the counter has to read every body it is asked to pay for before it
will sign it (D-168), and the alternatives were the two this ruling already refused. **It decodes the bytes it signs**, which
is the stronger form and was chosen deliberately over the comfortable one: parsing a whole serialized transaction with the
SDK’s typed getters and signing the body derived from that parse inspects one representation and signs another, and the two
agree only because the same object produced them. `[CC]` **Every field number in it was PROBED and none was recalled** — read
off bodies the SDK itself froze, 2026-09-09, and re-read the same way by `check:correspondent` on every run. That is not
politeness: `CryptoUpdateTransactionBody.memo` is field **14**, and a confident memory says 26.

## DIVERGENCE — every transaction is `@hashgraph/sdk`, not the Hedera MCP server

**Status:** blanket, for the whole provisioning phase. **Date:** 2026-09-07. **Requirements that force it:** §4.1, §4.4, and D-141.

The working rule for this phase was to use the connected `hedera-testnet-mcp` tools wherever a call expresses the specification's requirement exactly, and to drop to the SDK only where the specification exceeds a tool's parameters, recording each departure. Reading the server's own tool schemas showed the departure is not per-call but total, so it is recorded once here rather than four times in the same words.

FETCHED 2026-09-07 by JSON-RPC `initialize` + `tools/list` against `https://agentic-testnet-mcp.hedera.com/mcp`. `serverInfo`: **"Hedera Agent Kit", version 0.1.0**, 43 tools.

### Ground one: control

Every write tool carries the same context header:

```
Context:
- Mode: Return Bytes (preparing transactions for user signing)
- User Account: Not specified
- When no account is specified, the operator account will be used
```

The **signing posture is correct** and worth saying plainly: the server returns unsigned transaction bytes for the caller to sign, and holds no private key of ours. That is what P-13 asks of any party we transact through.

The **payer default is not**. "The operator account" is the server's operator, not ours — this deployment never gave it credentials and never will. A transaction it builds therefore names an account we do not control as payer, and `create_topic_tool` has **no payer parameter at all**, so for topics there is no way to redirect it. That disqualifies the server for anything we own before HIP-991 is even reached: D-47 fixes that the Postmaster pays, and a payer we cannot name is not the Postmaster.

### Ground two: expressiveness

`create_topic_tool` — parameters, verbatim:

```
schedulingParams, isSubmitKey, submitKey, adminKey, topicMemo, transactionMemo
```

There is no `customFees`, no `feeScheduleKey`, and no `feeExemptKeys`. §4.4's MUST — "A doorbell MUST carry a HIP-991 custom fee of exactly one stamp, in the stamp token, collected by the treasury" — cannot be stated through this tool, and neither can D-138's fee-exempt entry for the agent's own key, which is what keeps the owner from paying to answer its own door (D-137, T-P7-4). A topic created through it would not be a doorbell; it would be a topic that a fixture must refuse to resolve to.

`create_fungible_token_tool` — parameters, verbatim:

```
schedulingParams, tokenName, tokenSymbol, initialSupply, supplyType,
maxSupply, decimals, treasuryAccountId, isSupplyKey
```

`decimals`, `treasuryAccountId` and `supplyType` cover part of D-141 — `decimals` defaults to 0, which D-141 requires, and `supplyType` defaults to `"finite"` with `maxSupply` 1,000,000, both overridable. But `isSupplyKey` is a single boolean and there is **no parameter for the admin, freeze, wipe, pause or KYC keys**. D-141's ruling is that the token carries a supply key and *none of those others*, on P-2 and L-12 grounds — an admin key would let the Postmaster mutate the token a Verifier measures against, and a wipe or freeze key would let it unmake postage already paid. A posture that cannot be stated cannot be claimed.

### What follows

**Every transaction this phase submits is built and signed with `@hashgraph/sdk`.** Every read is mirror-node REST. `hedera-testnet-mcp` may be used to orient during development, but nothing it returns is recorded here, in the ops record, or in `spec/pins.json`.

`hedera-docs` is unaffected and is used freely for design questions during BUILD. Anything it returns is **FETCHED** — cited as such, with the document named. It resolves questions; it does not become a source the specification cites without a pin (§1.6, L-7).

### Not a complaint

HCS-10 offers a fee-gated inbound topic at `index.md:113` — "Public (No Key), Submit Key, or Fee-gated (HIP-991)" — and HIP-991 has supported topic fees denominated in a fungible HTS token since release 0.59.5. The gap is in the tooling, not in the standards, and naming it precisely is part of supporting the incumbent rather than working around it. Recorded in the working ledger's §H as a dated finding.

## DIVERGENCE — an envelope chunk is frozen through the base class, not through `TopicMessageSubmitTransaction`

**Status:** scoped to one operation — the HCS-10 `message` operation carrying an envelope chunk. **Date:** 2026-09-08. **Requirement that forces it:** §7.4, and T-P9-7.

§7.4 is unambiguous: every chunk "MUST be submitted as one HCS message with no transport-layer chunking", and T-P9-7 checks that every fixture message "carries no `chunkInfo`". `@hashgraph/sdk`'s `TopicMessageSubmitTransaction` cannot express that. Its `freezeWith` sets `_chunkInfo` inside the chunk loop that builds the signed transactions, so **every** message it produces carries the field — including a single-chunk one, where it says `{total: 1, number: 1}`.

**The evidence that it is real is on consensus, not in the source.** Our own price-list message at `0.0.10426551` sequence 1 carries `chunk_info {"initial_transaction_id":…,"number":1,"total":1}` on the mirror node. That message is a §14.3 price list and not an envelope, so §7.4 does not reach it; it stands here as proof that the default path does what the source says it does, in a message we have already published and cannot alter.

**The divergence.** `app/src/ops/hcs10.ts` defines `UnchunkedTopicMessageSubmitTransaction`, which overrides `freezeWith` to call `Transaction.prototype.freezeWith` and overrides nothing else. `_makeTransactionData()` omits the field entirely when `_chunkInfo` is null, and the base class never sets it, so the field is absent rather than empty.

**The evidence that the override is exact.** Both bodies were built with the same topic, message, memo and transaction id, and **decoded from their own protobuf bytes locally** — nothing was submitted, because a chunk carrying `chunkInfo` fails T-P9-7 permanently and a consensus message cannot be withdrawn:

```
--- ordinary TopicMessageSubmitTransaction
  memo:      "hcs-10:op:6:3"
  topicID:   0.0.7000001
  message:   109 bytes, sha256 dfc2e1d591698d208370dfb9e5342ed336064fff0d69a68b71e81ae6964d00f8
  chunkInfo: {"initialTransactionID":{"transactionValidStart":{"seconds":1788894030,"nanos":895915675},
              "accountID":{"shardNum":0,"realmNum":0,"accountNum":8641261},"scheduled":false},
              "total":1,"number":1}

--- UnchunkedTopicMessageSubmitTransaction
  memo:      "hcs-10:op:6:3"
  topicID:   0.0.7000001
  message:   109 bytes, sha256 dfc2e1d591698d208370dfb9e5342ed336064fff0d69a68b71e81ae6964d00f8
  chunkInfo: null
```

The memo, the topic and the message bytes are identical across the two; `chunkInfo` is the only field that differs. `npm run check:hcs10` reruns that comparison, **including its negative half** — it asserts that the ordinary path *does* carry the field — so the override is demonstrated on every run rather than asserted once here. If a later SDK release stops attaching it, that assertion fails and this section is what gets read.

### What follows

The override is used for envelope chunks and for nothing that is not one. Every other operation this implementation submits — the price list, the profile chunk, the schema files, the registry entries, the connection operations — is built by the SDK unmodified, because none of them is subject to §7.4.

### This is where "HCS-10 by hand vs SDK" is settled

STATUS §6 held that open, and the evidence settles it narrowly: the SDK's transaction classes, with one override, scoped to the one operation whose wire form the specification constrains. Not a hand-rolled protobuf, and not the SDK unmodified. The confirmation is the first chunk on consensus: if the mirror shows `chunk_info` on it, the step stops there.

### Not a complaint

`chunkInfo` is correct behaviour for the API it belongs to — it is how a caller sends a message larger than one HCS transaction, and HCS-10 delegates anything past one kilobyte to HCS-1 for that reason. WISHMail stays under the line and does not delegate (§7.4), which is a choice this specification makes and not a gap in the SDK. The divergence is recorded because a reader of the wire needs to know why our chunks look unlike every other SDK-built message on the network.

## The HIP-991 probe — gate report, before any signature

**Status: RUN 2026-09-08. Every assertion below held, and §6 carries what was observed.** This section was written and committed before the first transaction this build submits to consensus, so that the record shows what was intended before it was done rather than after. Ruled 2026-09-08 (D-149), amended the same day to fix the payer of the exempt case. §§1–5 are the intent as it stood before the first signature and are left unedited; §6 is what happened.

The probe exists to settle what HIP-991 at the pin does not state and the SDK does not document: whether a fee collector must be associated with the denominating token (ledger §H records this as MINE, "confirm when §14 lands", and §14 has landed); whether a fee-exempt list amended under the admin key takes effect; and **which account `hip-991.md:101` actually debits when the payer and the signer differ** — the question the doorbell depends on.

It is **wholly disposable**: it creates its own treasury, its own token, its own topic, its own stranger and its own owner, and the real `$POSTAGE`, the real treasury and the Postmaster-agent's topics are not created, touched or named by it. It **mirrors the real shape exactly**, because a probe that proves something about a different shape proves nothing about the template.

### 1. What it creates

| # | Entity or act | Shape | Warrant |
|---|---|---|---|
| 1 | probe treasury account | ED25519 key generated in-process, minimally funded by the operator | mirrors D-140's treasury role |
| 2 | probe token | `decimals: 0`, **`initialSupply: 0`**, `supplyType: INFINITE`, supply key the probe treasury's, and **no admin, freeze, wipe, pause, KYC or fee-schedule key** | D-141's posture with D-148's supply key, born at zero per D-149 |
| 3 | the mint | 10,000 units to the probe treasury, signed by the probe treasury's supply key, as **its own transaction** | D-149: a mint is an act with a transaction ID, not a birth parameter |
| 4 | probe topic | **no submit key**; admin key held by the probe; a HIP-991 `CustomFixedFee` of **one unit** of the probe token collected by the **probe treasury**; **no fee schedule key**; a fee-exempt list carrying the owner's key | D-138's doorbell row exactly |
| 5 | owner account | ED25519 throwaway standing for the agent that owns the doorbell. Its key is the one on the exempt list at creation. Minimally funded in HBAR so it can be a payer for the control, and given one unit so that a failed exemption reads as a charge rather than as an inability to pay | §3.5, D-139: the agent signs its own submissions |
| 6 | stranger account | ED25519 throwaway, funded in HBAR to pay for itself, associated with the probe token, holding one unit | the unexempted caller of §4.4 |
| 7 | owner₂ key | a second throwaway key, no account: it only ever signs under the operator's payment | the replacement exempt list, `hip-991.md:110-113` |
| 8 | operator association | the operator is associated with the probe token and holds **three** units, so that §4.4's own shape can be submitted and so that a failed exemption debits rather than errors | D-140: the operator is the momentary bearer of the first-contact stamp |

Row 8 is the only thing the probe does to an account the deployment keeps. It is an association and three units, all reversible: the units are spent or returned, and the operator is dissociated afterwards, with the result of the dissociation itself recorded.

Every private key here is born in the running process and none is written to `spec/pins.json`, to `app/deployment/hedera-testnet.json`, to a log line, or to a commit; the throwaway keys are not written anywhere at all, since nothing outlives the probe that would need them.

### 2. What it asserts, and the six submissions

**The entities.** At the token's creation: `decimals == 0`, `initial_supply == 0`, `total_supply == 0`, `supply_type == INFINITE`, `treasury_account_id` the probe treasury, `supply_key` the probe treasury's raw hex, and `admin_key`, `freeze_key`, `wipe_key`, `pause_key`, `kyc_key`, `fee_schedule_key` all six null. After the mint: `total_supply == 10000` and the probe treasury holding 10,000 — the first exercise of a supply key in this project, with its own transaction ID. The topic: `submit_key` null, `admin_key` set, `fee_schedule_key` null, one fixed custom fee of amount 1 whose `denominating_token_id` is the probe token and whose `collector_account_id` is the probe treasury, and a fee-exempt list carrying the owner's key.

**The submissions.** Every one of the six is read back at `GET /api/v1/transactions/{id}`, and for every one the **payer, the signers, `assessed_custom_fees` and the account actually debited** are recorded. Nothing below is assumed from `:101`; all of it is observed.

| # | Submission | Payer | Signers | Exempt list carries | Expected | Why it is run |
|---|---|---|---|---|---|---|
| S1 | charged | stranger | stranger | owner | one unit to the probe treasury | the fee mechanism at its simplest |
| S2 | charged, §4.4's shape | **operator** | operator + stranger | owner | one unit to the probe treasury | §4.4 has the sender transfer a stamp to the Postmaster, which then pays (D-140) |
| S3 | **exempt, production shape** | **operator** | operator + **owner** | owner | **zero assessed** | D-137 and D-139: the owner answers its own doorbell, the Postmaster pays, and HIP-991 waives **by signature** (`:110-113`). **An exemption that holds only when the owner pays for itself is one the Postmaster cannot use.** This is the read the doorbell depends on |
| S4 | exempt, owner pays — control | owner | owner | owner | zero assessed | the weaker read, kept beside S3 so the pair distinguishes "waived by signature" from "waived because the exempt account paid" |
| S5 | charged after the swap | operator | operator + owner | **owner₂** | one unit — the owner is no longer exempt | that a `TopicUpdateTransaction` under the admin key actually removes an exemption |
| S6 | exempt after the swap | operator | operator + owner₂ | owner₂ | zero assessed | that the same update actually grants one |

S3 against S4 is the pair that matters. If S3 is charged and S4 is not, then HIP-991 waives by *payer* and not by signature, D-137's exemption does not work in the shape §4.4 describes, and the doorbell's design has a hole that must be reported before the real one is created. S5 against S6 is `hip-991.md:110-113` observed rather than read, and is the warrant for D-138's doorbell carrying no fee schedule key.

**The collector association question.** The probe treasury is the token's own treasury and so is associated by construction. Whether that is *required* is what §H holds open; the probe answers it by succeeding, and by recording that the collector was a treasury when it did.

### 3. What it reads back

Every assertion above is checked against a **mirror-node REST read**, never an SDK receipt (see "The record is the mirror node"). The raw JSON of each read is recorded in this file, not summarised, because several of the field names below are inferences this repository has never seen returned:

- `GET /api/v1/tokens/{probeToken}` — twice, before and after the mint, for the twelve fields of §2.
- `GET /api/v1/accounts/{probeTreasury}/tokens` — the minted balance.
- `GET /api/v1/topics/{probeTopic}` — memo, `submit_key`, `admin_key`, `fee_schedule_key`, `custom_fees`, and **the fee-exempt list under whatever name and shape the mirror node actually gives it**. No recon in this repository has ever read a topic that had one; `fee_exempt_key_list` is an inference from the protobuf field name and is recorded as such until this read. Read again after the update, for the amended list.
- `GET /api/v1/transactions/{id}` — once per submission, six times: `result`, `assessed_custom_fees` with its amount, `token_id` and collector, **the paying account**, and `charged_tx_fee`. Also whether the response carries `entity_id`, which the provisioning journal would like to use and which ledger §H does not list.

Each observation is filed here with its entity ID, transaction ID, consensus timestamp and the exact request path that produced it, and the corresponding ledger §H rows move from MINE to FETCHED with the date.

### 4. What it leaves on the network

Stated plainly, because "disposable" is true of the record and only partly true of the ledger.

- **The probe topic is deleted**, under its admin key, in a `finally`, on every path including the stop path.
- **The probe token cannot be deleted.** It carries no admin key, by the posture under test, and `TokenDelete` requires one. Building it any other way would mean the probe did not mirror the template, which is the one thing it must do. It remains on `hedera:testnet` permanently, with 10,000 minted units.
- **The probe treasury account cannot be deleted** while that token exists, because a token's treasury cannot be removed. It remains, holding the float.
- **The owner and stranger accounts** can be emptied, dissociated and deleted; whether they are is tidiness rather than correctness, and the probe records what it did.
- **The operator is dissociated** from the probe token once its units are spent or returned, so the account the deployment keeps carries nothing of this afterwards.

So the probe leaves an inert token and its treasury on testnet forever. That is the price of mirroring the key posture honestly, it is paid on a test network, and it is written down here rather than discovered later by someone reading a mirror node and wondering what the second `$POSTAGE`-shaped token is. **Neither entity is written to `app/deployment/hedera-testnet.json` or to `spec/pins.json`** — those are the ledgers of what the deployment *keeps*, and the deployment keeps none of this. This file is the whole record of the probe.

### 5. Stop conditions

- **The fee configuration is rejected at creation**, for any reason. Stop, report, no HBAR substitute — §4.4 admits no approximation. The exact status name and the request as built are printed; `tx.toString()` carries no key material.
- **S3 is charged.** The exemption does not survive the Postmaster paying, so §4.4's arithmetic and D-137's ruling do not hold in the production shape. Stop and report before the real doorbell is created; this is a finding about the design, not about the probe.
- **The mint fails**, or the token is born with anything other than the twelve asserted fields. Stop; the template is wrong and the real token would be wrong the same way, permanently, since it has no admin key.

On every path the scratch topic is deleted under its admin key in a `finally`, and whatever was observed before the stop is written here.

### 6. What it observed — RUN OF RECORD, 2026-09-08

Ran to completion on `hedera:testnet`. **Every line below is FETCHED 2026-09-08 from the mirror node**, never from an SDK receipt. Raw JSON for every read is in the run log; the fields that carry a finding are quoted here.

**Entities of the run of record.** Probe treasury `0.0.10425740`; owner `0.0.10425741`; stranger `0.0.10425742`; probe token `0.0.10425743`; probe topic `0.0.10425746` (deleted). Operator `0.0.8641261` paid every transaction except S1 and S4, where the payer is the point of the test.

#### The token, born at zero and minted as an act (D-149)

At creation, `GET /tokens/0.0.10425743`: `decimals` `"0"`, `initial_supply` `"0"`, `total_supply` `"0"`, `supply_type` `INFINITE`, `treasury_account_id` `0.0.10425740`, `supply_key` the probe treasury's raw hex — and `admin_key`, `freeze_key`, `wipe_key`, `pause_key`, `kyc_key`, `fee_schedule_key` **all six null**. After the mint, in its own transaction signed by the supply key: `total_supply` `"10000"`. D-141's posture, D-148's supply key and D-149's birth-then-mint, all confirmed against consensus.

**`decimals` and `initial_supply` are returned as JSON strings, not numbers.** Any comparison in the suite must coerce; `=== 0` would silently fail. FETCHED.

#### The topic, in D-138's doorbell shape

`GET /topics/0.0.10425746`: `submit_key` **null**, `admin_key` set, `fee_schedule_key` **null**, `auto_renew_account` `0.0.8641261` (set explicitly, not left to the SDK's default), and

```
"custom_fees": { "fixed_fees": [
  { "amount": 1, "collector_account_id": "0.0.10425740", "denominating_token_id": "0.0.10425743" } ] }
"fee_exempt_key_list": [ { "_type": "ED25519", "key": "8745e356…" } ]
```

**`fee_exempt_key_list` is the field name, and its elements are `{_type, key}`** — the same shape the mirror node uses for every other key. This was an inference from a protobuf field name until now; it is FETCHED, and T-P7-4 and T-P17-1 can be written against it.

**The fee collector did not have to sign the topic create.** The first attempt was made deliberately without the probe treasury's signature and it succeeded, so `collectorSignatureRequired` is `false`. The collector here was the token's own treasury, and therefore associated by construction — so what is settled is that **a treasury collector works and needs no signature**. Whether an *unassociated* collector would work is still untested, and ledger §H says so rather than claiming more than was run.

#### The six submissions

| # | Payer | Signer beyond the payer | Exempt list held | Result | Debited |
|---|---|---|---|---|---|
| S1 | stranger | — | owner | **charged 1** | `effective_payer_account_ids: ["0.0.10425742"]` — the stranger |
| S2 | **operator** | stranger | owner | **charged 1** | `["0.0.8641261"]` — the operator |
| S3 | **operator** | **owner** | owner | **no fee assessed** | — |
| S4 | owner | — | owner | no fee assessed | — |
| S5 | operator | owner | owner₂ | **charged 1** | `["0.0.8641261"]` — the operator |
| S6 | operator | owner₂ | owner₂ | no fee assessed | — |

Every charged submission put its unit in `0.0.10425740`, the probe treasury, as `collector_account_id`. All six returned `SUCCESS`; `charged_tx_fee` was ≈0.623 ℏ each.

**S1 against S2 answers `:101`.** The fee is debited from the **transaction payer**, not from a signer: the stranger pays in S1 and the operator pays in S2, on otherwise identical submissions. `effective_payer_account_ids` on `assessed_custom_fees` is where the mirror node says so, and it is the field T-P7-4 should read.

**S3 is the result the doorbell depends on, and it holds.** The operator paid, the owner signed, the owner's key was on the exempt list — and **no fee was assessed**. So HIP-991 waives by *signature* and not by payer, exactly as `hip-991.md:110-113` says and as D-137 and D-139 assumed. An owner answering its own doorbell costs the Postmaster nothing even though the Postmaster is the payer, which is what §4.4's "owes nothing to answer" requires and what D-137's whole ruling rests on. S4 is the same outcome with the owner paying for itself, so the pair confirms the waiver is not an artefact of who paid.

**S5 against S6 settles the amendment.** After a `TopicUpdateTransaction` signed by the **admin key** replaced the exempt list with owner₂, the owner was charged and owner₂ was not. So the exempt list is amendable under the admin key alone, on a topic with **no fee schedule key** — which is the warrant for D-138's doorbell row standing as written, and which is why the amendment withdrawn on 2026-09-08 was rightly withdrawn.

#### Two more facts the build wanted

`GET /transactions/{id}` **does return `entity_id`** — the provisioning journal's preferred recovery path is available, and does not need the per-kind backstops as its only route. FETCHED.

Every submission carried a `CustomFeeLimit` naming one unit. Whether HIP-991 rejects a payer who sets no limit was **not** tested and is not claimed.

#### What it left

The topic was deleted under its admin key: `GET /topics/0.0.10425746` now reads `deleted: true`, with its final `fee_exempt_key_list` carrying owner₂'s key — the amendment, still visible after deletion. The operator's three remaining units were returned to the probe treasury and the operator was **dissociated**, both `SUCCESS`, so the one account the deployment keeps carries nothing of the probe.

**Permanently on testnet, as §4 said they would be:** token `0.0.10425743` with 10,000 units and its treasury `0.0.10425740`, plus the owner and stranger accounts. **And a first run's residue besides.** An earlier attempt stopped at the topic create on `INSUFFICIENT_TX_FEE` — a transaction-fee cap of 20 ℏ, too low for a fee-gated topic, and not a rejection of the fee configuration — leaving treasury `0.0.10425722`, owner `0.0.10425723`, stranger `0.0.10425724` and token `0.0.10425725` behind. Both sets are inert and neither is written to `app/deployment/hedera-testnet.json` or to `spec/pins.json`.

#### Two bugs in the probe, found by the probe

Recorded because the record should show how the observations were arrived at, not only what they were.

The first run treated **any** failure of the unsigned topic create as "the collector must sign" and retried. The failure was `INSUFFICIENT_TX_FEE`, and had the retry then succeeded, `collectorSignatureRequired: true` would have gone into ledger §H as FETCHED when nothing of the sort had been observed. The retry is now gated on `INVALID_SIGNATURE` and any other status records `unknown`.

The post-update topic readback polled with a predicate of `() => true`, which accepts the first answer the mirror node gives — including one from before it had ingested the update. It did exactly that, and the run log's `topic:readback-after-update` shows the **pre-update** list. The submissions caught what the poll missed: S5 was charged and S6 was not, which is only possible if the update had landed, and a read taken afterwards confirms owner₂'s key on the topic. The predicate now waits for the change itself. A poll whose predicate is "any answer" is not a poll.

## Step 2 — the real entities: gate report, before any signature

**Status: RUN 2026-09-08. All eleven entities stand on `hedera:testnet`; §§7–10 carry what happened.** §§1–6 were written and committed before the first transaction of Step 2, on the same rule the probe followed. Produced by `npm run provision:plan` (`--dry-run`), which resolves every declared shape, validates the price list, prints the table below, and signs nothing.

The probe (§6) proved the *template* against consensus on a disposable copy. This provisions the entities the deployment keeps, against the text tagged **`v0.5.2`** at `21cb3c2`.

### 1. What it creates, in the forced order

| # | Entity | Declared shape | Warrant |
|---|---|---|---|
| 1 | treasury account | ED25519 born in-process, 20 ℏ | D-140 — holds the unissued supply; its key is hot because §14.2's purchase is atomic |
| 2 | postmaster-agent account | ED25519 born in-process, 20 ℏ | D-140 — the service's own Correspondent identity, an operational choice and not a spec role |
| 3 | `$POSTAGE` | `decimals 0`, **`initialSupply 0`**, `INFINITE`, treasury = (1), supply key = the treasury's, and no admin / freeze / wipe / pause / KYC / fee-schedule key | D-141 posture · D-148 supply key · D-149 born at zero |
| 4 | the mint | 10,000 to the treasury, signed by the supply key, **its own transaction** | D-149 — a mint is an act a Verifier can replay, not a birth parameter |
| 5 | operator association | operator ↔ `$POSTAGE` | §4.4 — the sender transfers a stamp *to the Postmaster*, which then pays the doorbell fee (D-140) |
| 6 | agent association | postmaster-agent ↔ `$POSTAGE` | the agent buys and affixes postage like any Correspondent |
| 7 | price topic | memo `wishmail:prices:1`, submit **and** admin keys the operator's, no fee | D-142 — the price list is the service speaking. §4.6 and T-P17-1 do not reach it (D-146's scope sentence) |
| 8 | the first `PriceList` | sequence 1, canonical RFC 8785, **563 bytes**, sha256 `20aa3b01…` (with the real ids substituted) | D-143 as D-145 leaves it — **no `validFrom`** |
| 9 | doorbell | memo `hcs-10:0:60:0:<agent>`, **no submit key**, admin key the agent's, **no fee schedule key**, HIP-991 fee of 1 `$POSTAGE` collected by the treasury, exempt list = the agent's own key | D-147 row 1 · §4.4's MUST selects HCS-10's fee-gated inbound option (`index.md:113`) · D-137 |
| 10 | log | memo `hcs-10:0:60:1`, submit and admin keys the agent's | D-147 row 2 · `index.md:114` |
| 11 | manifest | memo `wishmail:manifest:1`, the agent's key as **sole** submit key, admin key the agent's | D-147 row 3 · §9.1:1255, T-P17-3 |

The **declaration registry topic is not created**: D-147's scope puts the declaration downstream of the entities, so the template's fifth row is complete and unexercised in this window. Every topic sets `setAutoRenewAccountId(operator)` explicitly rather than inheriting the SDK's default, so the record shows a choice. **That is a payer role and not a key.** §4.6 and D-47 have the Postmaster pay, and paying a topic's renewal is the same kind of act as paying for its creation; an auto-renew account is not an admin, submit or fee-schedule key, it signs nothing, and it authorises nothing on the topic — so D-47's rule about where operator keys may appear is visibly not touched here. On an agent-owned topic the agent holds the **admin** key and can change the auto-renew account at will (§4.6:583, T-P17-1), so naming the operator takes nothing away from the agent's ownership of its own doorbell, log and manifest.

### 2. What it asserts

Field by field, against the mirror node, before anything is recorded. The token: `type FUNGIBLE_COMMON`, `decimals 0`, `initial_supply 0`, `supply_type INFINITE`, `treasury_account_id`, `supply_key` = the treasury's raw hex, and **six nulls** — `admin_key`, `freeze_key`, `wipe_key`, `pause_key`, `kyc_key`, `fee_schedule_key`. After the mint, `total_supply == 10000`. Each account: exists, `deleted false`, and its `key` is the key that was generated for it. Each association: the token appears in that account's token list. Each topic: memo, `submit_key` (**null** on the doorbell, the agent's on log and manifest), `admin_key`, `fee_schedule_key` null on all four, `auto_renew_account`, `custom_fees.fixed_fees` (exactly one on the doorbell, none elsewhere), and `fee_exempt_key_list`. The price list: `sequence_number 1`, `payer_account_id` the operator, and the message **byte-for-byte** equal to what was submitted.

**The probe's findings are carried as code, not as notes.** The fee-gated topic create is capped at 100 ℏ, because 20 ℏ returned `INSUFFICIENT_TX_FEE`. The retry with the collector's signature is gated on **`INVALID_SIGNATURE` alone**; the probe showed a treasury collector need not sign, so that branch should be dead, and any other status is a different question and is not retried. Mirror numerics are compared as **BigInt** via `sameNumber`, because `decimals`, `initial_supply` and `total_supply` come back as JSON strings and `=== 0` fails silently. And **every readback names its predicate** — `named('total_supply reaches 10000', …)`, `named('sequence 1 is on the price topic', …)` — so no poll can accept "any answer", which is the bug that produced a stale read in the probe.

### 3. What it writes, and where

`spec/pins.json` takes **`stampToken["hedera:testnet"] = {tokenId, treasury}` and nothing else** (D-144). `pins.ts` is the only writer and its parameter type has no field for anything else, so it physically cannot write a topic id or a key. Two of the 32 nulls close; **thirty remain**, so T-P9-2 still blocks every conformance claim, which is correct.

Everything else goes to `app/deployment/hedera-testnet.json`: each entity's id, what built it, which **roles** signed it (never keys), the payer, the creation transaction id, its **consensus timestamp**, the mirror-node path that confirmed it, and the declared `policy` verbatim — which is how T-P17-1's "the policy is recorded at creation" is satisfied by construction rather than by a comment. The file carries `specTag: "v0.5.2"`, a tag and not a hash.

Generated private keys go to the git-ignored `.env` through `identity.ts`, which is the only module that ever sees the DER form. **Nothing prints a key**, and `upsertEnvValue` refuses to overwrite a non-blank value, so a re-run cannot orphan an entity whose key already exists.

### 4. Idempotency, and every way it stops

Two questions, two authorities: **the record alone** decides whether to create; **the mirror node alone** decides whether what exists is correct. The acceptance test is two runs — the second creates nothing, exits 0, prints the same table — then deleting **`agent.manifest`** from the record and re-running, which creates a new instance of that entity type and nothing else.

It stops, without writing, on: a prerequisite absent from the record; **ABSENT-BUT-ON-LEDGER**, where a step is not in the record but the entity it would create already exists — resolved by the **intent journal first**, which holds a transaction id pinned before submission and is therefore exact, and by the step’s own **backstop second**, a deterministic search for the entity it would otherwise duplicate; a backstop that finds more than one candidate **stops rather than choosing**, because for a token with no admin key the loser can never be deleted, and an entity recovered by either route is confirmed field for field before it is recorded; **RECORDED-BUT-ABSENT**, where the record names an entity the mirror node does not hold — it never re-creates on a 404, because mirror nodes have outages and ledgers do not lose topics, and for a token with no admin key a duplicate is unrecoverable; **DIVERGED**, where what exists is not what is declared; **CREATED-WRONG**, where the create succeeded and the readback disagrees — the record is deliberately *not* written, because recording it would launder a wrong entity into the ledger and every later run would call it `existing`; a **pins conflict**, where `spec/pins.json` already names a different token, which needs `--repin` to authorise; and a price list that **fails schema validation**, which is checked before the message is signed.

### 5. What the plan proved, and the pre-flight state

`npm run provision:plan` resolves all eleven steps. The first `PriceList` **validates** against `spec/schemas/price-list.schema.json` under ajv 2020-12, and the same message **carrying `validFrom` is rejected** by `additionalProperties` — the negative half, because a constraint that accepts everything proves nothing. Canonicalised under RFC 8785 it is 563 bytes, comfortably one HCS message under `CHUNK_WIRE_MAX` 1000.

Before the run: `spec/pins.json` carries its 32 nulls, `app/deployment/` does not exist, the P-13 grep returns empty, `npm run typecheck` passes, and the operator holds 2510 ℏ.

### 6. Where each fact lives — the tiering, and `.env` brought to it

Ruled 2026-09-08, before the Step 2 signature. **`.env` holds secrets, the network selector, and runtime locations, and never a copy of a value whose home is somewhere else.** Four tiers, and each fact lives in exactly one:

| Tier | Holds | Why there |
|---|---|---|
| `.env` (git-ignored) | the three private keys, `POSTMASTER_PAYER_ID`, `HEDERA_NETWORK`, `WISHMAIL_STATE_DIR`, `MCP_BIND`, `MCP_PORT`, an optional `MIRROR_NODE_URL` | secrets, which network, and where things run |
| `app/src/ops/networks.ts` | per-network constants keyed by `HEDERA_NETWORK` — mirror URL, USDC asset, facilitator and its fee payer, rate source, fee caps — **each with its citation** | true of the *network*, not of our deployment on it |
| `spec/pins.json` | §18.4's set: the standards pins, and the stamp token and treasury per network | §4.1 puts the stamp token there, and T-P9-2 gates every claim on it |
| `app/deployment/<network>.json` | every other fact about one deployment | a pin is a fact about a specification version; this is a fact about one deployment of it (D-144) |

`POSTMASTER_PAYER_ID` is the one account id in `.env`, and it belongs there because it is an **input** to provisioning rather than a product of it — the single account this deployment did not create (D-140: reused). Every other entity id is read from the ops record for the selected network, and the token id additionally from `spec/pins.json` per §4.1.

**Removed from `.env` and `.env.example`:** `POSTAGE_TOKEN_ID` and `PRICE_TOPIC_ID` (entity ids, and both held literal placeholder text from an earlier project); the three `AGENT_*_TOPIC_ID` names and `TREASURY_ID`/`AGENT_ID` (entity ids); `HEDERA_RPC_URL`, `POSTAGE_ADDR` and `OPERATOR_EVM_ADDR` (EVM coordinates, and there is no Solidity and no contract in this project); and `OPERATOR_HEX_KEY`, which was a **second encoding of a secret already present** — a duplicate of a private key is strictly worse than useless, since it doubles the surface without adding a capability. `MIRROR_NODE_URL` survives as a blank optional override; its default is now the network table's.

**Added:** `HEDERA_NETWORK`, which `networkConstants()` refuses when it names a network §15.5 leaves undeployed, so selecting `mainnet` stops the run rather than half-provisioning it; and `WISHMAIL_STATE_DIR`, `MCP_BIND`, `MCP_PORT`. `WISHMAIL_STATE_DIR` is §14.2's durable record: D-109 fixes that the MCP server holds the 402 state and accepts only requirements it issued, and T-P11-5 and T-P11-6 test that the state survives a restart — a replayed payload returns the original `StampReceipt` with no second transfer, and requirements issued before a restart are accepted after it. In-memory state fails both tests.

**The names kept the spelling `app/src` already used** (`*_DER_KEY` rather than `*_KEY`), per the ruling that the tiering binds and the spelling does not. The suffix says what the value is — the DER form `PrivateKey.fromStringDer` reads.

**Requested finding: no path in `app/src` reads an entity id from the environment.** The audit is `grep -rE "process\.env|readSecret\(|envHas\(" app/src`, and its whole output is `identity.ts` reading the three `*_DER_KEY` names, `env.ts` reading `POSTMASTER_PAYER_ID`, `HEDERA_NETWORK`, `MIRROR_NODE_URL`, `WISHMAIL_STATE_DIR`, `MCP_BIND` and `MCP_PORT`, and `probe.ts` reading `PROBE_OUT` for its own log path. Entity ids already came from the ops record through `Ctx.tokenId()`, `Ctx.treasuryId()` and `Ctx.agentId()`, so nothing had to move — the ruling ratifies what the code already did rather than correcting it.

**The first `PriceList` is now a committed file**, `app/price-list.hedera-testnet.json`, which the script submits. What the Postmaster charges is reviewable as a document rather than read out of a function. Exactly three fields are filled at run time, because they cannot be known at commit time: `stampToken.tokenId` and `stampToken.treasury` from the ops record, and `methods[].payTo` from `POSTMASTER_PAYER_ID`. They are `null` in the file, and the schema's account-id pattern means a fill that did not happen is caught by validation rather than published. `asset`, `facilitator` and `rate.source` are asserted against `networks.ts` before submission, so the file and the table cannot drift apart unnoticed. The refactor is byte-neutral: the canonical message is the same 563 bytes with the same sha256 `20aa3b01…` as the literal it replaced.

**A separate, minimal `.env.example` for the Correspondent client** is at `app/sdk/.env.example`, where the SDK and CLI will ship. It is four variables — the agent's own key, an optional account id, the network, and the Postmaster's MCP URL — and it shares nothing with the Postmaster's file. It states what a Correspondent does not need: no operator key, no treasury, no supply key, no state directory. And it says the thing worth saying to whoever reads it first: the Postmaster holds no key of yours, ever (P-13); your key is born in your process and stays there.

### 7. The readback hang, and the adoption

The first Step 2 run created the treasury, the postmaster-agent and `$POSTAGE` — all three SUCCESS at consensus — and then stopped for ten minutes without submitting anything further. The cause was mine and simple: `fetch` carries no default timeout, so the token's mirror-node readback stalled and waited. The record was never written for an entity that exists, and because the token has no admin key a naive re-run would have created a second `$POSTAGE` and stranded the first forever.

Two fixes, in that order. **The hang**: every mirror request now carries a 15s `AbortSignal.timeout`, and `poll` treats a timed-out or transiently failed read as "not yet" against its own deadline rather than as a crash, so a slow mirror node costs time and never the process. **The orphan**: `journal.ts`, which the plan specified and which had not been built. A transaction id is pinned before submission — `setTransactionId` plus `setRegenerateTransactionId(false)`, so the handle is single-valued — and written through a temp file and a rename, so a run that dies between consensus and the record write leaves behind the one handle that can find what it made.

`ABSENT-BUT-ON-LEDGER` was added to §4's stop conditions, resolved by the journal first and a step's own backstop second. The journal did not apply here: it did not exist when the token was created. So the token was recovered by **the backstop**, which is the only one any step offers. Its conditions were met exactly as ruled:

- **Exactly one candidate.** A token names its treasury, and our treasury is an account created moments earlier that holds nothing else. `GET /accounts/0.0.10426205/tokens` returned one token, and `GET /tokens/0.0.10426208` confirmed `treasury_account_id` is ours. Two candidates would have stopped the run rather than chosen, because the loser could never be deleted.
- **Field for field.** The adopted token went through `confirm()` unchanged — the same function a created entity goes through, against the same declared `Want`. `type FUNGIBLE_COMMON`, `decimals 0`, `initial_supply 0`, `supply_type INFINITE`, `treasury_account_id 0.0.10426205`, `supply_key` the treasury's raw hex, and all six of `admin_key`, `freeze_key`, `wipe_key`, `pause_key`, `kyc_key`, `fee_schedule_key` null. Adoption is not a shortcut past confirmation; a mismatch would have been `CREATED-WRONG` and nothing would have been written.
- **A complete row.** The creation transaction `0.0.8641261@1788894041.839314449` and its consensus timestamp `1788894046.551017104` were recovered from the mirror node — the token's `created_timestamp`, then `GET /transactions?timestamp=…` for the transaction at that instant — so the token's row is as complete as the accounts' rows beside it.
- **The row says so.** `policy.adopted` in the ops record states that the entity was adopted rather than created by the run that recorded it, why, and by which route, and cites this section.

One further bug surfaced and is worth recording, because it looked like a second hang and was not. `mirrorPathFor` asked `ctx.tokenId()` for the token's own `confirmedFrom` — reading the record for a row it was in the middle of building — and threw. The run stopped in seconds; I saw nothing because the output was piped through `tail`, which buffers until the process ends, and I read the silence as a hang. **A pipe that hides progress is not a neutral observer.** The path for the token row now uses the entity's own id, and later runs were watched through a log file rather than a pipe.

### 8. What was created — the run of record, 2026-09-08

Provisioned against **`v0.5.2`**, the tag the ops record cites. Every row below was written from a mirror-node REST read, never an SDK receipt.

| Entity | ID | Built by | Signed by | Creation transaction | Consensus timestamp | Confirmed from |
|---|---|---|---|---|---|---|
| `treasury.account` | `0.0.10426205` | AccountCreateTransaction | operator | `0.0.8641261@1788894030.895915675` | `1788894038.750186104` | `/accounts/0.0.10426205` |
| `agent.account` | `0.0.10426206` | AccountCreateTransaction | operator | `0.0.8641261@1788894037.389411178` | `1788894042.916078489` | `/accounts/0.0.10426206` |
| `postage.token` | `0.0.10426208` | TokenCreateTransaction | operator + treasury | `0.0.8641261@1788894041.839314449` | `1788894046.551017104` | `/tokens/0.0.10426208` |
| `postage.mint` | — (an act) | TokenMintTransaction | operator + treasury | `0.0.8641261@1788895929.601780780` | `1788895936.951925104` | `/tokens/0.0.10426208` |
| `operator.association` | — (an act) | TokenAssociateTransaction | operator | `0.0.8641261@1788895938.588230383` | `1788895942.185374170` | `/accounts/0.0.8641261/tokens?token.id=…` |
| `agent.association` | — (an act) | TokenAssociateTransaction | operator + agent | `0.0.8641261@1788895941.535451737` | `1788895945.713095293` | `/accounts/0.0.10426206/tokens?token.id=…` |
| `prices.topic` | `0.0.10426551` | TopicCreateTransaction | operator | `0.0.8641261@1788895943.054415671` | `1788895947.743137568` | `/topics/0.0.10426551` |
| `prices.first` | — (sequence 1) | TopicMessageSubmitTransaction | operator | `0.0.8641261@1788895947.603820976` | `1788895954.743195291` | `/topics/0.0.10426551/messages?limit=1&order=asc` |
| `agent.doorbell` | `0.0.10426553` | TopicCreateTransaction | operator + agent | `0.0.8641261@1788895951.943923730` | `1788895956.794141742` | `/topics/0.0.10426553` |
| `agent.log` | `0.0.10426554` | TopicCreateTransaction | operator + agent | `0.0.8641261@1788895954.671556678` | `1788895958.763292150` | `/topics/0.0.10426554` |
| `agent.manifest` | `0.0.10426591` | TopicCreateTransaction | operator + agent | `0.0.8641261@1788896134.080208852` | `1788896142.676180052` | `/topics/0.0.10426591` |

**Every readback, with the predicate it waited on and its result.** All PASS, verified again independently after the run.

| Step | Named predicate | Asserted | Result |
|---|---|---|---|
| treasury, agent accounts | `account exists and is not deleted` | `account`, `deleted false`, `key` = the key generated for it | PASS |
| `postage.token` | `token exists` | `FUNGIBLE_COMMON`; `decimals 0`; `initial_supply 0`; `INFINITE`; `treasury_account_id`; `supply_key` = the treasury's; **six nulls** | PASS |
| `postage.mint` | `total_supply reaches 10000` | `total_supply == 10000`, compared as BigInt | PASS |
| both associations | `the association appears` | the token in that account's token list | PASS |
| `prices.topic` | `topic exists and is not deleted` | memo `wishmail:prices:1`; submit **and** admin the operator's; `fee_schedule_key` null; no custom fee; `auto_renew_account` | PASS |
| `agent.doorbell` | `topic exists and is not deleted` | memo `hcs-10:0:60:0:0.0.10426206`; **`submit_key` null**; admin the agent's; `fee_schedule_key` null; one fixed fee of **1 `0.0.10426208` → `0.0.10426205`**; `fee_exempt_key_list` = the agent's key | PASS |
| `agent.log` | `topic exists and is not deleted` | memo `hcs-10:0:60:1`; submit and admin the agent's; no fee | PASS |
| `agent.manifest` | `topic exists and is not deleted` | memo `wishmail:manifest:1`; the agent's key as **sole** submit key; admin the agent's | PASS |
| `prices.first` | `sequence 1 is on the price topic` | `sequence_number 1`; `payer_account_id` the operator; message **byte-for-byte** equal to what was submitted | PASS |

The published `PriceList`, canonical under RFC 8785, 563 bytes, sequence 1 on `0.0.10426551` — **no `validFrom`**, `spec` `0.5.2`, and the real token, treasury and `payTo` filled into the committed file:

```json
{"methods":[{"asset":"0.0.429274","bundles":[{"count":12,"price":"1.00"}],"facilitator":"https://x402.org/facilitator","method":"x402-usdc","network":"hedera:testnet","payTo":"0.0.8641261","unitPrice":"0.10"},{"asset":"0.0.0","bundles":[{"count":12,"price":"1.00"}],"method":"hbar","network":"hedera:testnet","payTo":"0.0.8641261","rate":{"pair":"HBAR/USD","reference":{"amount":"0.10","asset":"USD"},"source":"https://api.saucerswap.finance/tokens"}}],"spec":"0.5.2","stampToken":{"ledgerTag":"hedera:testnet","tokenId":"0.0.10426208","treasury":"0.0.10426205"}}
```

### 9. §4's acceptance test, both halves

**Two runs.** The second created nothing, exited 0, and printed the same eleven rows, every one `existing`. `spec/pins.json` reported `already`.

**Delete one.** `agent.manifest` was removed from the record and the run repeated. It created **one** entity — a new manifest topic, `0.0.10426591` — and nothing else: ten `existing`, one `created`, exit 0. That is the assertion the test makes, and it holds.

The superseded first manifest, `0.0.10426557`, is recorded in the ops record's **`residue`** array rather than deleted or left unmentioned, so `entities` holds exactly one manifest and no reader is left wondering what an orphan topic is. It exists on the ledger, carries the agent as its sole submit key and admin key, is not the deployment's manifest topic, and is deletable under its admin key; it is left in place as the evidence the test ran.

### 10. The pins, and what remains

`spec/pins.json` closed **exactly two** nulls and no others:

```diff
-    "hedera:testnet": { "tokenId": null, "treasury": null },
+    "hedera:testnet": { "tokenId": "0.0.10426208", "treasury": "0.0.10426205" },
```

That one-line diff is the point, and it took a second attempt. The first writer re-serialised the file with `JSON.stringify`, which dropped the blank lines between blocks and re-wrapped the single-line standards entries — eighty lines of diff for a two-value change, in the machine-readable form of §1.6, which is the appendix of record. The writer now performs a surgical text edit of that one line and **refuses to write at all** if the line is not in its expected form, rather than reformatting everything around it.

**Thirty nulls remain**: the twenty-eight `registeredSchemas` entries, which wait on HCS-13 registration, and the two `hedera:mainnet` stamp-token fields, which wait on a network §15.5 leaves undeployed. So **T-P9-2 still blocks every conformance claim**, which is correct and worth saying plainly: standing up the entities did not make a claim possible, it made one eventually possible.

## Step 3 — the declaration: gate report, written before any signature

**Status: RUN 2026-09-08. All five entities stand on `hedera:testnet`; §§7–9 carry what happened.** §§1–6 were written and committed **before** the first transaction of Step 3, on the rule the probe and Step 2 followed, and are left as they were written — including §6, which was the stop, and which §G item 12's closure by D-152 and D-153 lifted.

Provisioned against **`v0.5.3`**, the tag the ops record will cite. `v0.5.3` is D-150's patch, and it exists *because* of this step: §4.6's `Conformance:` note required every provisioned topic to carry the agent's admin key, and HCS-1 marks a file topic that has one invalid and ignores it — so as landed no HCS-11 profile file could be provisioned conformantly and the whole `hcs14` declare surface was unreachable.

### 1. What it creates, in the forced order

| # | Entity | Declared shape | Warrant |
|---|---|---|---|
| 1 | `agent.profileFile` | HCS-1 topic, memo `<sha256 of the plaintext profile>:brotli:base64`, **sole submit key the agent's**, **no admin key**, no fee | **D-150** row 6 · `hcs-1.md:48-49` forbids the admin key; `:56-60` fixes the memo |
| 2 | `agent.profileChunks` | HCS-1 `{o, c}`, `o=0` prefixed `data:application/json;base64,`, each ≤1024 bytes of base64 — one chunk expected | `hcs-1.md:92-95, 104-109` |
| 3 | `agent.declRegistry` | HCS-2 topic, memo `hcs-2:0:60`, submit **and** admin keys the agent's, no fee, no exempt list | D-147 row 5 · indexed `0`, so prior entries stay readable at their consensus timestamps (T-P8-3) |
| 4 | `agent.registryEntry` | `{"p":"hcs-2","op":"register","t_id":"<profileFile>"}`, transaction memo `hcs-2:op:register:0` | §H:359 — `register` is `{p, op, t_id, [metadata], [m]}`; the transaction memo is a SHOULD |
| 5 | `agent.accountMemo` | `AccountUpdateTransaction` setting the memo to `hcs-11:hcs://2/<declRegistry>`, signed by the agent | §9.2:1284's MUST |

The order is forced and not chosen: the file topic's memo carries the SHA-256 of the profile **plaintext**, so the profile must be final before the topic exists; the registry entry names the file topic; the account memo names the registry topic.

The agent is the Postmaster-agent, `0.0.10426206` — a Correspondent peer and an operational identity, not a spec role (D-140). Its doorbell `0.0.10426553`, log `0.0.10426554` and manifest `0.0.10426591` already stand from Step 2, and the declaration is what makes them findable.

### 2. The profile, and the key that is born for it

The HCS-11 profile carries `inboundTopicId`, `outboundTopicId`, a required `uaid`, and `properties.wishmail = {manifestTopic, x25519Pub, keyEpoch: 1}` — D-70 and §9.2:1275. `properties` is where HCS-11 sanctions it: "an unstructured JSON object … no predefined fields or structure" (`hcs-11.md:217`, §H).

`x25519Pub` is the agent's **encryption** key, and it is the first key in this build that is not a Hedera key. It is born in the agent's process, read in `env.ts` and held in `identity.ts` and nowhere else, exactly as the account keys are (P-13). The gate that enforces that was widened for it in the same change (D-151): it watched `(AGENT|TREASURY)_DER_KEY`, and `AGENT_X25519_DER_KEY` walked straight past.

Before the memo's hash is taken, the declaration object is validated against `spec/schemas/declaration.schema.json` through the one registry of `app/src/schema/loader.ts` — `x25519Pub` against its base64url pattern, `keyEpoch` against `minimum: 0`. A profile that does not validate is not published, on D-143's precedent for the price list.

### 3. What it asserts, and what it reads back

Field by field, against the mirror node, before anything is recorded — and every readback names its predicate, which is the rule Step 2 earned the hard way.

`agent.profileFile`: memo equal to `<sha256>:brotli:base64` where the digest is of the profile **before compression**; `submit_key` the agent's raw hex; **`admin_key` null**, which is the whole of D-150; `fee_schedule_key` null; no custom fee. `agent.profileChunks`: the message at sequence 1, byte-for-byte equal to what was submitted, and the profile it decodes to — base64-decode, then brotli-decompress — hashing to the memo's digest. `agent.declRegistry`: memo `hcs-2:0:60`, submit and admin keys the agent's, `fee_schedule_key` null, no custom fee. `agent.registryEntry`: sequence 1 on the registry topic, `payer_account_id` the operator, the message byte-for-byte, and its `t_id` equal to the file topic. `agent.accountMemo`: the account's `memo` field equal to `hcs-11:hcs://2/<declRegistry>`.

Then the chain is walked exactly as §9.2's rule walks it — account memo → the registry's current entry → the HCS-1 file → the profile → `properties.wishmail` — from a mirror node with nothing else configured. That is the first end-to-end exercise of the `hcs14` resolver's read path, and it is the assertion that matters: not that five entities exist, but that the rule finds them.

### 4. What it writes, and where

`spec/pins.json` is **not touched**. Nothing here is one of §18.4's pins (D-144), so the thirty nulls stay thirty and T-P9-2 still blocks every claim. Everything goes to `app/deployment/hedera-testnet.json`: five rows, each with what built it, which **roles** signed it, the payer, the transaction id, the consensus timestamp, the mirror-node path that confirmed it, and the declared policy verbatim — which is how T-P17-1's "the policy is recorded at creation" is satisfied by construction rather than by a comment. The profile file's row records `adminKey: null` and **why**, citing D-150, so a reader does not read the absence as an omission.

`EntityRecord` gains a `specTag` field and the eleven Step 2 rows are backfilled with `v0.5.2`. The record's single top-level `specTag` was true of the eleven and becomes false the moment a row provisioned against a different tag lands beside them.

### 5. Idempotency, and every way it stops

Step 2's stop conditions carry over unchanged — prerequisite absent, `ABSENT-BUT-ON-LEDGER` resolved by the intent journal first and a step's own backstop second, `RECORDED-BUT-ABSENT`, `DIVERGED`, `CREATED-WRONG` — and two are worth naming for this step in particular.

**An HCS-1 file topic has no admin key, so it can never be deleted.** A profile file published wrong is permanent, and can only be superseded by a new registry entry (§9.2:1284, "prior entries stay on the registry topic"). That is HCS-1's stated purpose — "This ensures that data cannot be deleted, reducing risk for all participants in the protocol" — and it is why the profile is validated and its digest computed before the topic is created rather than after.

**The account memo is the last act, and the only reversible one.** Until it is set, the registry and the file are inert: no resolution reaches them, because §9.2's rule starts at the account memo. So the run can stop after any of the first four steps and leave nothing that resolves.

### 6. STOP — the declaration is not signed, and why

HCS-14 contradicts itself about the canonical key order of the six fields an agent identifier is hashed from, and the two orders give **different identifiers for the same agent**. Its normative step 3 says "sort object keys lexicographically" and its reference function does that; its own worked example puts `skills` first, and that is what is on the ledger. Verified against the ledger rather than against the text, because the standard publishes its expected UAIDs as the literal placeholder `uaid:aid:{base58hash};…` and therefore courts nothing: the live `hedera:testnet` agent `0.0.7124407`'s on-chain identifier reproduces exactly under the example's order and not at all under the normative one (`npm run check:hcs14`, 27 assertions).

It blocks because HCS-11 requires the `uaid` in the profile, the profile's SHA-256 is the file topic's memo — a value that cannot be changed once the topic exists — and §9.2 compares a UAID address against the profile's identifier. An identifier no other implementation computes is one no incumbent can address us by, and it would be baked into an undeletable topic.

`CANONICAL_ORDER` in `app/src/core/hcs14.ts` was deliberately `undefined` and every caller had to name an order, so nothing could emit a UAID until it was ruled. The candidates and the lean were in ledger §G item 12. **Sonic ruled on 2026-09-08 and the stop lifted:** D-152 has every rule accept either order, the normative one first, reporting which matched as an observation; **D-153 emits the example's order**, on the census and on the upstream proposal at §G.5(b) that asks for that order to be made normative. `CANONICAL_ORDER` is `'example'` and is the default, so no caller names an order any more.

**Narrowed 2026-09-08, and the half that could be settled has been.** Sonic asked for a census before ruling, and it is unanimous: of the fourteen newest `uaid:aid:` registrations on the anchor plus `0.0.7124407`'s, **15 of 15** reproduce under the example order and **none** under the normative one — the newest at 2025-11-18T22:05:58Z (`proto=a2a`, `registry=hashgraph-online`) beside `0.0.7124407`'s at 2025-10-24T22:10:46Z (`proto=hcs-10`, `registry=hol`), twenty-five days and two protocols apart. §H carries it.

**D-152 then settled what does not have to wait**: every rule *accepts* either order, the normative one tried first, and reports which matched under `observations.agentIdOrder`. So an incumbent registered under either is resolvable by us whatever is decided here, and this stop is now narrower than it was — it is one choice, about one field, in one profile file. It stays a stop because an HCS-1 file topic has no admin key: what we write is what stands.

### 7. What was created — the run of record, 2026-09-08

Provisioned against **`v0.5.4`**, the tag each row cites in its own `specTag`. Every row below was written from a mirror-node REST read, never an SDK receipt.

| Entity | ID | Built by | Signed by | Creation transaction | Consensus timestamp | Confirmed from |
|---|---|---|---|---|---|---|
| `agent.declRegistry` | `0.0.10428113` | TopicCreateTransaction | operator + agent | `0.0.8641261@1788904726.585140041` | `1788904733.468374809` | `/topics/0.0.10428113` |
| `agent.accountMemo` | `0.0.10426206` | AccountUpdateTransaction | operator + agent | `0.0.8641261@1788904740.064455035` | `1788904745.896532620` | `/accounts/0.0.10426206` |
| `agent.profileFile` | `0.0.10428178` | TopicCreateTransaction | operator + agent | `0.0.8641261@1788905026.804503619` | `1788905032.794109845` | `/topics/0.0.10428178` |
| `agent.profileChunks` | — (one message) | TopicMessageSubmitTransaction | operator + agent | `0.0.8641261@1788905032.108893115` | `1788905039.655962104` | `/topics/0.0.10428178/messages?limit=25&order=asc` |
| `agent.registryEntry` | — (the current entry) | TopicMessageSubmitTransaction | operator + agent | `0.0.8641261@1788905034.296999583` | `1788905042.708481996` | `/topics/0.0.10428113/messages?limit=1&order=desc` |

The registry topic and the account memo carry the earlier timestamps because they are from the first run; §8 explains why the profile file and its registry entry are from a second.

**Every readback, with the predicate it waited on and its result.** All PASS.

| Step | Named predicate | Asserted | Result |
|---|---|---|---|
| `agent.profileFile` | `topic exists and is not deleted` | memo `0cc6a7aa…:brotli:base64`; `submit_key` the agent's; **`admin_key` null**; `fee_schedule_key` null; no custom fee | PASS |
| `agent.profileChunks` | `every chunk of the profile is on the file topic` | one chunk; reassembled by `o`, base64-decoded, brotli-decompressed, and its SHA-256 equal to the topic memo's digest **and** to what was submitted | PASS |
| `agent.declRegistry` | `topic exists and is not deleted` | memo `hcs-2:0:60`; submit and admin the agent's; `fee_schedule_key` null; no fee | PASS |
| `agent.registryEntry` | `the current entry on the declaration registry names this profile file` | `payer_account_id` the operator; message byte-for-byte; `p` `hcs-2`; `op` `register`; `t_id` = `0.0.10428178` | PASS |
| `agent.accountMemo` | `the account memo names the declaration registry` | `memo` = `hcs-11:hcs://2/0.0.10428113`; `deleted` false | PASS |

**§9's acceptance test.** A second run created nothing, exited 0, and printed sixteen rows every one `existing`. `spec/pins.json` reported `already`; thirty pins remained unfilled at that run — twenty-eight from D-154 later the same day — and T-P9-2 still blocks every claim, which is correct: a declaration is not a pin.

### 8. The first profile file, and why there are two

**The first declaration was wrong, and our own resolver is what found it.** The agent identifier was hashed under `version: "1.0.0"` while the HCS-11 profile it travelled in carried `version: "1.0"`. An HCS-11 profile has exactly **one** `version` field, and §9.5 recomputes an agent identifier "from the profile's name, version, and skills together with the address's `registry`, `proto`, and `nativeId` parameters" — so the published `uaid` was not recomputable from the profile carrying it. Resolving `0.0.10426206` by its own UAID returned `RESOLVE_NOT_FOUND — the profile's uaid identifier recomputes under neither canonical order`, which is exactly what a third party would have got.

Nothing about it was visible before the file was on consensus: the declaration validated against its schema, the digest matched its memo, and the identifier was internally consistent with itself. What it was not consistent with was the only `version` a reader can see. The first resolution of a WISHMail agent by a WISHMail resolver failed, and that is the strongest argument for having written the resolver in the same step as the declaration rather than after it.

**The remedy is the one §9.2 provides**, at `:1284`: "Rotation is a new profile file registered as a new entry; prior entries stay on the registry topic." So a second profile file, `0.0.10428178`, was created and registered as the registry's next entry; the registry topic and the account memo did not change, because neither was wrong. §9.2's rule reads "the registry's current entry", so a reader reaches the second and the first is history.

**`0.0.10428112` is permanent and is recorded in the ops record's `residue`.** An HCS-1 file topic has no admin key by D-150 and by `hcs-1.md:48-49` — "This ensures that data cannot be deleted" — so it cannot be withdrawn, only superseded. Its row says what it was, why it was replaced, and that it is not the deployment's profile file.

**Two things changed so it cannot recur.** `PROFILE_VERSION` is now one constant used for both the HCS-11 `version` and the HCS-14 canonical `version`, and `profileBytes` **refuses to build** a profile whose `version` or `display_name` disagrees with the agent it hashed — before the digest is taken, so before a topic could be created for it. And `agent.registryEntry`'s readback now asserts on the registry's **current** entry rather than on sequence 1: a registry that has ever rotated has an older entry at sequence 1, and asserting on that would call a correct registry wrong.

### 9. `resolve`, and what the chain returns

The declaration is only worth anything if the rule finds it, so the rule was run. `npm run resolve -- <address>` implements §9.2 and reads a mirror node's REST API and nothing else: **no key, no stamp, no account, no broker** (P-4, §6.2's "`resolve` reads and pays nothing").

Walked as §9.2 walks it: account memo → the registry's current entry → the HCS-1 file → the profile → `properties.wishmail`.

```
account 0.0.10426206
  memo            hcs-11:hcs://2/0.0.10428113
  registry        0.0.10428113, current entry -> t_id 0.0.10428178
  file            0.0.10428178, memo digest == SHA-256 of the decompressed profile
  properties.wishmail  {manifestTopic 0.0.10426591, x25519Pub …, keyEpoch 1}
```

By account, the coordinates validate against `spec/schemas/mail-coordinates.schema.json` and carry **`trustClass: math` and `endorsements: []`** — no `blurred`, which is T-P6-3's "an HCS-2 memo resolves without `blurred`", demonstrated on consensus rather than on a fixture. `resolutionProof.uri` is `null`, because §6.2 leaves it empty until `send` publishes the manifest.

By UAID, the same coordinates, and the identifier comparison of §9.1 runs: the profile's `uaid` agrees with the address in identifier and `nativeId`, the AID recomputes from the profile's own name, version and skills, and `observations.agentIdOrder` reports `example` — the order D-153 emits, reported as an observation that bears on no standing (§11.6).

Two defects in the coordinates were caught by validating against the schema before printing, which is why the tool validates rather than trusts: `resolutionProof.uri` had been an empty string where §5.2 fixes locators as **structured, not strings**, and `resolvedAt` had been an ISO instant where §5.1 writes a timestamp as `seconds.nanos`.

## Step 4 — the HCS-13 schema registration: gate report, written before any signature

**Status: BUILT, PLANNED, NOT SIGNED — and deliberately not signable by `npm run provision`.** The plan resolves all 56 steps under `npm run schemas:plan`; nothing has been submitted. This section is written before the first transaction, on the rule the probe, Step 2 and Step 3 followed.

**Why it is held.** §1.7: "A patch revision amends text and tests within a minor version; it changes no wire string, and **once a minor version's schemas are registered it changes no schema**." Registering *is* the freeze of `spec/schemas/` for minor version 0.5. Three of the last four patches changed a schema — 0.5.1 and 0.5.2 each corrected one, and 0.5.4 added `observations.agentIdOrder` — and each was permitted *only because nothing is registered yet*. The six tool bodies on the MCP surface still return `NOT_IMPLEMENTED`, and no fixture has yet validated a real object read off consensus, so the schemas have not been exercised by the thing they exist for. `send`, `inbox` and `verify` now exist as implementations and are exercised against a modelled ledger (§Step 5), where the Chunk, Envelope, EvidenceBundle, Narrative and Settlement schemas do validate what the reference produced — which is the reference checking itself, not a release checked against evidence it did not produce. The freeze is held until the bodies pass their fixtures on a real letter.

**The sentence that governs when this is signed:** *this step is §1.7's freeze, and it is signed only when the six tool bodies pass their fixtures.* Until then `npm run conformance` prints `NO REPORT — 28 unfilled pins (T-P9-2)`, and that is the correct output, not a defect to route around.

So Step 4's steps are a **separate ordered set**: `npm run provision` runs `STEPS` and cannot reach them; they run only under an explicit `--schemas`.

### 1. What it creates, in the forced order

Four entities per schema, for each of §18.5's fourteen — **56 steps, 14 file topics, 14 registry topics, 31 chunk messages, 14 register messages.**

| # | Entity | Declared shape | Warrant |
|---|---|---|---|
| 1 | `schema.<name>.file` | HCS-1 topic, memo `<sha256 of the committed schema>:brotli:base64`, sole submit key the operator's, **no admin key**, no fee | `hcs-13.md:136` step 1 · `hcs-1.md:48-49` forbids an admin key on a file topic (D-150) |
| 2 | `schema.<name>.chunks` | HCS-1 `{o, c}`, `o=0` prefixed `data:application/schema+json;base64,`, each ≤1024 b | `hcs-1.md:92-100` |
| 3 | `schema.<name>.registry` | HCS-2 topic, memo `hcs-2:0:60`, submit **and** admin the operator's, no fee | `hcs-13.md:138` step 2 |
| 4 | `schema.<name>.register` | `{p:"hcs-2", op:"register", t_id:<file>, metadata:{name, description}}`, tx memo `hcs-2:op:register:0` | `hcs-13.md:140`, `:150-160` |

The order inside a schema is forced: the file topic's memo carries the digest of the bytes, so the bytes are final first; the register names the file topic; and the `schemaRef` is knowable only after the register has a sequence number.

**These are the Postmaster's own infrastructure, so the keys are the operator's** — not an agent's. §4.6 and T-P17-1 govern the topics provisioning creates *for an agent*; a schema registry is the release speaking about its own schemas, which is D-142's reasoning for the price topic, applied again.

### 2. ONE REGISTRY PER SCHEMA — the divergence, and how it was ruled

The instruction for this step said "one HCS-2 schema registry topic … with a `p: "hcs-2"` register per schema whose sequence number becomes the `schemaRef` `hcs://13/<registry>#<seq>`" — one shared topic. **It is built one topic per schema instead, and that is a divergence recorded rather than silently taken.** FETCHED 2026-09-08, blob `07f1ac67b344d6655b98ce8196b3053fe1b4f566`, verified with `git hash-object`:

> "1. Create an HCS-1 file containing the JSON Schema definition
> 2. **Create an HCS-2 topic to manage versions of the schema**
> 3. Register the HCS-1 file in the HCS-2 topic using the register operation"
> — `hcs-13.md:136-140`

and, on the locator:

> "`topicId` is the topic ID of the HCS-2 topic managing **the schema**. … `hcs://13/0.0.123456#42` — References **version 42 of the schema**"
> — `hcs-13.md:230-241`

§5.11 says the same thing in this document's words: "each as an HCS-1 file registered on an HCS-2 topic that manages **the schema's** versions", and "the topic is the HCS-2 topic managing the schema and the sequence number is that of the register operation **for the version claimed**".

The difference is not cosmetic. On a shared topic, `#42` is the forty-second registration *of anything* — a different schema, not a later version of one — so the fragment stops meaning "version" and `hcs://13/<topic>` unpinned, which §5.11 says "names whatever version is latest", names nothing at all. A reader resolving `schemaRef` would still find the right file, because `t_id` is in the message; what breaks is the meaning of the locator and every future rotation of a single schema.

**The cost of the shape that is built is 14 extra topics.** The cost of the other is a locator that does not mean what two documents say it means.

**Ruled 2026-09-08 (D-155): one HCS-2 topic per schema, as built, and no discovery registration.** Sonic ratified the shape and recorded that the one-shared-registry instruction was Claude's error rather than his. The failure it avoids is worth naming, because no test would have caught it: a reader dereferencing one `schemaRef` reaches the right file either way, since `t_id` is in the message. It would have surfaced the first time a single schema rotated, with that schema's two registrations at arbitrary sequence numbers and thirteen others' between them — the same failure mode as Step 3 §8, a structure that validates and dereferences while being unreadable by the rule it exists for.

### 3. What it asserts, and what it reads back

`schema.<name>.file`: memo equal to `<digest>:brotli:base64`, `submit_key` the operator's, **`admin_key` null**, `fee_schedule_key` null. `schema.<name>.chunks`: every chunk present; the file reassembled by `o`, base64-decoded, brotli-decompressed, and hashed — equal to its topic memo's digest **and** to the committed schema. `schema.<name>.registry`: the same nine field assertions every other topic in this build gets, through the shared `topicStep`. `schema.<name>.register`: the registry's **current** entry, byte-for-byte, with `t_id` naming the file topic.

**WHICH BYTES — the check that had to be run rather than assumed.** `spec/pins.json` records `sha256` as "the digest of the registered schema, which a release's shipped `spec/schemas/` file must equal" (T-P9-4); HCS-1's memo carries "the SHA-256 hash of the file being uploaded **before any compression**". If those are over different bytes, T-P9-4 compares two different things and passes or fails by accident.

They are taken from the **committed git blob** (`git cat-file blob`), never from the working tree, for the reason ledger §H already records: "`core.autocrlf=true` corrupts working-tree digests". On this machine the two happen to be identical today — the checkout is LF — but on a fresh clone with `core.autocrlf=true` the working tree would be CRLF and every digest would differ from the blob's. So the step **stops** if the working tree and the blob disagree, and **stops** if any file's HCS-1 memo digest differs from the digest that would be pinned. Confirmed on the plan: **14 of 14 agree**, 31 chunks in total.

### 4. What it writes, and where

`spec/pins.json`'s `registeredSchemas`, and nothing else. `pins.ts` gains a **second narrow writer**, `pinRegisteredSchema`, on the same discipline as `pinStampToken`: it fills one entry's `schemaRef` and `sha256`, edits **one line**, refuses to write if that line is not in its expected form, and has no parameter for anything else — so it physically cannot write a topic id anywhere but into the entry it names. It is called from the register step's **readback**, because §5.11's sequence number is assigned by the network and is knowable only after consensus; a predicted `schemaRef` would be a guess written into the file of record.

Twenty-eight nulls close if all fourteen register. `app/deployment/hedera-testnet.json` takes the 56 rows, each citing its `specTag`.

### 5. Idempotency, and every way it stops

Step 2's stop conditions carry over. Three are specific to this step:

**The blob check** and **the digest-agreement check**, above: both stop before any transaction.

**A file topic has no admin key, so a registered schema is permanent.** A schema registered wrong cannot be withdrawn, only superseded by a new register on its own registry topic — which is exactly what the version indirection is for, and why `indexed` is `0`: a `schemaRef` pinned to an earlier sequence number must stay resolvable, and indexed `1` would make only the last message state.

**A pins conflict.** `pinRegisteredSchema` returns `conflict` where an entry is already filled with something else, and the readback fails rather than overwriting: a second registration of the same schema is a rotation and needs a decision, not a silent repin.

### 6. Expected output until it is signed

```
npm run schemas:plan     56 planned · spec/pins.json 28 pins unfilled
npm run conformance      NO REPORT — 28 unfilled pins in spec/pins.json (T-P9-2)
```

Both are correct. The suite refuses a report because the schemas are not registered, and the schemas are not registered because the tool bodies have not passed their fixtures. Nothing here is a defect to route around; it is the freeze being held on purpose.

## Step 5 — two Correspondents provisioned through the counter: GATE ONE, written before any signature

**Status: RUN 2026-09-09 on Sonic's word. Correspondent B is provisioned; Correspondent A is stopped.** What follows
is the report as it was written and committed **before the first transaction**, on the rule the probe and Steps 2, 3
and 4 followed — what it would create, what it would assert from the mirror, what it writes and where, how it is
idempotent, and every way it stops. **It is left exactly as it stood**, because a gate report amended after the run is
not a gate report. **The run of record is the section immediately after it**, and where the two differ the run is what
happened.

**Re-armed 2026-09-09 after §G-19 was ruled.** The thing that blocked this step — a provisioning purchase could produce no
`StampReceipt` that validates — is closed by **D-168, reading (a)**: §4.6’s provisioned path is taken as written and **the
Postmaster provisions the mailbox it sells**, so §5.4’s "the entities the Postmaster created for the holder" is literally
true of the receipt. §6 below carries the finding and the ruling in full. **The provisioner did not move**: `sdk/mailbox.ts`
creates the same rows in the same forced order signed by the same agent key, and the payer seam is simply exercised at its
remote half — which is §6.1’s carry, and the first thing in this project to test whether that seam was real.

**What that changes in this report is one column.** Rows 2 through 9 were "agent signs · operator pays" and are now "agent
signs · **Postmaster pays, carried**". Everything else in the forced order, every readback, and every stop condition stands
as it was, with four stops added and one removed.

### 0. The parties, and which of them is which

Three human roles and two agents (CLAUDE.md §11). **OPERATOR** is us: treasury, the `$POSTAGE` supply key, the price topic, the Postmaster-agent, and the counter. **C1OPERATOR** and **C2OPERATOR** are the two Correspondents' operators, each bringing a funded testnet wallet. **Correspondent A** and **Correspondent B** are the agents. *The agent signs; the operator pays* (§3.5).

Those three words are **demo labels, not identifiers**. They appear in `app/` as no value, constant, default, enum member or filename; every operator-specific value a Correspondent reads comes from that operator's own configuration file. The repository ships `app/sdk/config.template.json` and never a filled one; `.gitignore` covers a filled home and `npm run p13:check` is what keeps a key out of `app/` regardless — it now watches the Correspondent's field names as well as the Postmaster's environment names.

**The purchases are real sales at sequence 3's prices (D-170), and they are the counter's first.** Nothing in the demo is a fixture funded on the side.

### 1. What it creates, in the forced order

Per agent, and D-159 as amended is what forces the order. Nothing may be reordered: the account must exist before it can own a topic, the profile must be final before the topic whose memo is its digest can be created, and the registration must name a registry that exists.

| # | Act | Declared shape | Who signs / who pays | Warrant |
|---|---|---|---|---|
| 0 | **boot** | the agent's ED25519 account key and its epoch-1 X25519 key, born in the agent's own process, into `<home>/keystore.json` | — | D-165: keys are born once; a process that regenerated on boot would make every restart a new agent |
| 1 | **buy_stamp** at the counter, leg 1 — the transfer | one atomic `TransferTransaction` with three legs: ℏ from the operator to the Postmaster for the price; 12 `$POSTAGE` from the treasury to the agent's **public-key alias**; 0.05 ℏ from the Postmaster to that same alias | buyer signs the frozen body in its own process; **the Postmaster is payer** | §14.2 (it cannot be submitted without the Postmaster) · D-159 addendum · HIP-542, probe-observed 2026-09-09 |
| 2 | `doorbell` | HCS-10 inbound, memo `hcs-10:0:60:0:<acct>`, **no submit key**, admin the agent's, HIP-991 fee of 1 `$POSTAGE` to the treasury, the agent's own key exempt, auto-renew the **operator's** | agent signs · **Postmaster pays**, carried + operator signs as auto-renew | D-147 row 1 · §4.4 · D-137’s exemption · T-P7-4 · D-168 |
| 3 | `log` | HCS-10 outbound, memo `hcs-10:0:60:1`, submit and admin the agent's | agent signs · **Postmaster pays**, carried + operator signs as auto-renew | D-147 row 2 · D-168 |
| 4 | `manifest` | memo `wishmail:manifest:1`, **sole** submit key the agent's | agent signs · **Postmaster pays**, carried + operator signs as auto-renew | §9.1 · T-P17-3 · D-168 |
| 5 | `declRegistry` | HCS-2, memo `hcs-2:0:60` — **indexed 0** | agent signs · **Postmaster pays**, carried + operator signs as auto-renew | D-147 row 5 · T-P8-3 · D-168 |
| 6 | `profileFile` | HCS-1, memo `<sha256 of the plaintext>:brotli:base64`, submit the agent's, **NO admin key** | agent signs · **Postmaster pays**, carried + operator signs as auto-renew | D-150 · `hcs-1.md:48-49` · D-168 |
| 7 | `profileChunks` | the HCS-11 profile as HCS-1 `{o, c}` chunks, each bounded as a **whole message** at 1024 | agent signs · **Postmaster pays**, carried | `ops/hcs1.ts`, and the Step 4 defect is why · D-168 |
| 8 | `registryEntry` | `{p: "hcs-2", op: "register", t_id: <profileFile>}`, transaction memo `hcs-2:op:register:0` | agent signs · **Postmaster pays**, carried | §H:359 · D-168 |
| 9 | `accountMemo` | `hcs-11:hcs://2/<declRegistry>` | agent signs · **Postmaster pays**, carried | §9.2:1284's MUST · D-168 |
| 10 | **buy_stamp**, last leg — the receipt | §5.4's `provisioning` line, every coordinate read back from the mirror under a transaction id this counter's own signature carried | nothing signs | §5.4 · §6.3 · D-168 |
| 11 | `holRegistration` | `{p, op, account_id, uaid, t_id, m}` on the anchor `0.0.6913983`, **no transaction memo**, **max fee declared at 0.02 ℏ** | **agent signs AND pays**, from the 0.05 ℏ the purchase funded | §4.6 · D-164 · T-P13-4 |

**Rows 1 through 10 are one call — `buy_stamp` with `provision`** — and row 11 is `register_agent`. goose says two things, and
they are the two things a person would say: buy me a mailbox, then register me.

**Who signs and who pays, row by row, and why there are three parties on a topic creation.** The AGENT signs, because the
admin key is the agent’s and the topic is the agent’s. The OPERATOR signs, because it is the auto-renew account the row names
and a topic that names an account takes that account’s signature. The POSTMASTER pays, and the transaction id names it as
payer. That is §6.1’s carry (D-157, D-168): agent-signed bodies, the Postmaster’s account as payer, a published policy, a
co-signature.

**The auto-renew account is the Correspondent’s own operator and never the Postmaster’s**, and the counter refuses a row that
says otherwise. The Postmaster sells a mailbox once, at the price on consensus; it does not undertake to renew it forever,
and a topic naming it would say so on consensus where every reader can see it.

**`generate_mailbox` and `register_agent` are §4.6 affordances and not among §6.1’s six** (D-159): no conformance class is
tested against either and no claim names them. `generate_mailbox` remains on the Correspondent’s MCP as the
**self-provisioned** path — an agent that brings its own account and pays for its own mailbox, at its own operator’s expense —
and this step does not take it. Its tool description says which path it is.

**Row 11 declares a maximum fee of 0.02 ℏ, and that is not a detail.** It is the only submission in the project whose
payer holds almost nothing — 0.05 ℏ, funded as the third leg of the purchase — so it is the only one where the declared
maximum is not a formality. It declared **2 ℏ** until 2026-09-09, forty times the balance funding it.

**Whether that would have failed depends on a fact this project cannot cite.** I do not know, from a source I can name,
whether Hedera’s solvency precheck compares the payer’s balance to the fee it **estimates** or to the maximum the
transaction **declares**. The 2026-09-08 probe observed `INSUFFICIENT_TX_FEE` — a declared maximum against a *required*
fee — which is a different check and settles nothing here; and the HIP-542 probe observed the bought account only as a
**signer**, never as a payer, so the one run that could have answered this did not. **So the maximum is declared
explicitly and below the balance, and both readings are safe**: 0.02 ℏ against a measured submission cost of about
0.0015 ℏ — thirteen times the cost and under half the funding. The anchor `0.0.6913983` carries no custom fee and no
submit key (mirror, 2026-09-09), so a registration on it is an ordinary HCS message submission and nothing else is owed.

`register_agent` now refuses **before submitting** if the agent’s balance is under that declared maximum, and says so in
those terms. Refusing here rather than at the network matters: a precheck that reads the declared maximum would refuse it
there, and the run would learn it with the mailbox already on consensus.

**Row 11 is the one place an agent pays.** "An agent's account never holds ℏ, with one exception" — this is it, and it is why the purchase funds exactly one fee and no more (§3.9: funding is a payment and not a party). The payer seam is deliberately *not* used: the whole value of the act is that the mirror records **this account** as the payer, and a borrowed payer would put `blurred` on every `hol` resolution of this agent forever.

**One act is not in the table because it is not always needed, and it is NOT carried.** `generate_mailbox` associates the OPERATOR's account with `$POSTAGE` on first run if it is not already, paid by the operator on the operator's own client. Carry covers the mailbox and nothing beside it, and the counter would refuse this body — correctly. §4.4's doorbell fee is debited from the **payer** of the submission (HIP-991), so when the operator pays for the agent's connection request the stamp leaves the operator's account — which means the operator must be able to hold one (D-157). The agent's own account needs no association: HIP-542 creates it with unlimited auto-associations, which the probe observed, so the stamp transfer associates it as it arrives. The config template says so.

### 1a. What it costs, and the balances that must carry it — read 2026-09-09

Every one of the eighteen submissions below is paid by an account this project can name, and every one of them declares a
maximum. **The floor is stated in DECLARED terms**, for the same reason row 11’s fee is: if a precheck compares a balance
to a declared maximum, the declared maxima are what must be affordable, and a floor computed from expected cost would be
a floor computed from the reading I cannot cite.

| Payer | Pays for | Declared, per agent | Read 2026-09-09 | Verdict |
|---|---|---|---|---|
| `0.0.8641261` — the Postmaster’s payer | the transfer (5 ℏ), the doorbell (**100 ℏ**), four plain topics (20 ℏ each), the chunks, the register entry and the account memo (2 ℏ each) | **191 ℏ** | **3229.72 ℏ** | **8× the floor for both agents. No top-up.** |
| `0.0.10450879` / `0.0.10450880` — the two Operators | leg 1 of their own purchase: the price plus the provisioned path | ~15.1 ℏ at the rate current 2026-09-09 | **35 ℏ each** | ample |
| `0.0.10426205` — the treasury | signs the stamp leg; pays nothing | — | **10,000 $POSTAGE**, 20 ℏ | 24 stamps needed |
| each agent’s own account | row 11, and nothing else, ever | **0.02 ℏ** | 0.05 ℏ, funded by leg 3 | 2.5× |

**The floor for `0.0.8641261` is 382 ℏ** — both agents’ declared maxima, the strictest reading, since a precheck that
reserved against declared totals would need all of it. The account holds **3229.72 ℏ**. The expected *actual* outflow is
far smaller: the two registration fees are 0.1 ℏ and eighteen transaction fees are a few ℏ, against which the Postmaster
**receives** two purchase prices. **Nothing needs topping up before Gate One.**

**The doorbell’s 100 ℏ is the largest single declaration and it is deliberate.** `networks.ts` records that a fee-gated
topic creation returned `INSUFFICIENT_TX_FEE` at a 20 ℏ cap and succeeded at 100 ℏ charged far less (FETCHED 2026-09-08).
The carry policy’s ceiling reads that same number, so the counter authorises up to 100 ℏ per doorbell and is charged what
the network charges — stated in LIMITATIONS as a measurement we have not taken.

**The two Operators auto-associate.** Both were created with `maxAutomaticTokenAssociations = -1`, so the `$POSTAGE`
association D-157’s two-hop ring needs costs no transaction: `generate_mailbox` reads that field and submits nothing,
saying so. The explicit association it kept is for a real operator, whose wallet is its own and was not created by us.

### 2. What it asserts, and what it reads back

Every readback is a mirror-node REST read with a **named predicate**, never an SDK receipt.

**Per topic**, against the shape it was created under: the memo; the submit key, or its absence; the admin key, or its **null**; a null fee-schedule key; the auto-renew account; the custom-fee list — one fixed fee of one unit of the pinned token to the treasury on the doorbell, and **zero fees** on every other row; and the fee-exempt key list. The declared shape and the asserted shape are **one object**, from `src/ops/template.ts`, so a row cannot be created under one description and checked against another.

**The template is now one spelling for both provisioners.** `ops/steps.ts` stands up the Postmaster's own agent with these six rows and `sdk/mailbox.ts` stands up a Correspondent with them, and they read the same functions. That is the `hcs1File` lesson applied before it costs anything: two provisioners that agreed about a doorbell's fee today and disagreed about its exempt list tomorrow would be the same failure with a permanent artefact at the end of it.

**Per purchase**: the transfer reads back SUCCESS from the mirror; the `$POSTAGE` credit names an account; that account is the
one the agent's key owns, found by `GET /accounts?account.publickey=…` and refused if two exist under one key; and the receipt
validates against the **registered** `StampReceipt` schema before it is returned.

**Per carried body, before the counter will sign it.** The counter decodes the very bytes it is being asked to sign — a
`TransactionBody`, read by `counter/body.ts` — and pays only for what the policy in `counter/carry.ts` recognises: a row of
`ops/template.ts` with this holder’s key in the slots that row names, an HCS-1 chunk on the file topic it itself paid to
create under this reference, the HCS-2 register entry on the registry it paid for, or the account-memo update on the
holder’s account naming that registry and setting nothing else. Beside the shape it checks that the payer is the Postmaster,
that the node is the one this purchase pinned, that the fee the body authorises is within the cap `networks.ts` gives that
row, and that the row has not already been carried. **It decodes what it signs**, and that is the design rather than a
detail: parsing one representation and signing another makes the two agree only because the same object produced them.

**Per receipt, and it is issued last.** The counter reads back every transaction its signature paid for, under the
transaction ids it recorded, and refuses to issue anything while a row is outstanding. Then it runs §9.2’s rule on the
holder **from its own reader** and refuses if the mailbox does not resolve, or resolves to a doorbell or manifest topic this
purchase did not create. Only then is the `provisioning` line filled — every coordinate in it from that readback, never
echoed from anything the agent said — and validated against the registered schema before it is returned.

**Per declaration**: the profile file's memo digest equals the SHA-256 of the plaintext the chunks decode to; the register entry is on the registry; the account memo reads back as `hcs-11:hcs://2/<registry>`.

**And then the reader is run on the writer's output, before `generate_mailbox` returns.** §9.2's rule is run from a mirror node with nothing configured, and its answer is compared field by field to what this run created: the doorbell, the log, the manifest topic, the X25519 public half **as this process holds it**, and the key epoch. A disagreement stops the step. This is CLAUDE.md §9's rule and the Step 3 defect is why it is not a formality: a declaration that validated against its schema, whose file digest matched its topic memo, and whose identifier was consistent with itself, was still unresolvable — and an HCS-1 topic has no admin key, so it was permanent.

**Per registration**: the anchor is read in full, every page, and the entry that lands is found there with `payer_account_id` equal to **this agent's account**. If it is not, the step stops and says so, because that is the one fact the funded fee exists to buy and it cannot be withdrawn.

**The acceptance test for the whole step**: both agents resolve under **`hcs14`** and under **`hol`**, and **neither carries `blurred`**. Every agent on the testnet anchor today does — all 380 of its messages were paid by one broker account — and ours must not (§9.5, T-P13-4).

### 3. What it writes, and where

**Each agent's entity IDs go in that agent's own home directory and nowhere else.** `<home>/record.json`, written from mirror-node reads, one entity at a time, so a run that dies mid-way leaves behind exactly what it made. `app/deployment/hedera-testnet.json` is the **Postmaster's ops record** and takes no Correspondent entity id (CLAUDE.md §11); `spec/pins.json` is not touched at all — nothing here is one of §18.4's pins.

The home directory **is** the agent (D-165): `config.json` (the operator's), `keystore.json` (the agent's keys, born once), `store/` (the durable store), `record.json`. A fresh home is a new agent; an existing home is a returning one. Two homes are two agents and there is nothing else that distinguishes them.

The counter writes one thing of its own: §14.2's durable requirement and settled-reference rows, under `WISHMAIL_STATE_DIR`, so the exchange survives a restart (T-P11-6) and a replayed reference returns the receipt it already bought rather than charging twice (T-P11-5).

### 4. Idempotency, and every way it stops

**Every provisioning verb is idempotent against CONSENSUS, never against local state** (D-165). A wiped home cannot cause a second doorbell — and a second doorbell is not merely waste: §9.5 assigns `vague` where more than one registration names an address, and a topic has no second creation. The local record is a **cache of consensus and never an authority over it**.

- `buy_stamp` with `provision` **refuses** where the holder already has an account, and where the holder's mailbox already
  resolves under `hcs14`; a returning agent buys without it.
- `buy_stamp` with `provision` **resumes** under an outstanding reference where the account exists and the mailbox does not.
  The counter’s record and the agent’s record are reconciled **from consensus and never from each other**: the counter learns
  what each carried body became by reading the mirror under the transaction id it recorded, which is also how the receipt is
  filled. A purchase that stops between rows is resumable from either side by reading the ledger.
- a replayed reference returns the receipt it already bought, and never a second charge (T-P11-5).
- `generate_mailbox` resolves the agent's own address under `hcs14` **first**. Coordinates come back → it creates nothing and says so.
- `register_agent` reads the anchor **first**. A registration by this account → nothing.
- the doorbell watcher derives what is answered by reading the doorbell: every `connection_created` names the `connection_id` of the request it answered, so a restart re-derives it and answers nothing twice.

**It stops, before or instead of signing, on every one of these:**

1. the home's config is missing any field, or names `hedera:mainnet`, which §15.5 leaves undeployed;
2. a `provision: true` purchase whose holder already has an account, or whose mailbox already resolves under `hcs14` — there is nothing left to create and a second mailbox is the duplicate §9.5 assigns `vague` to (D-165);
3. the price topic carries no message, or the method asked for is not on the current one (§14.3 forbids charging under an unpublished price);
4. the quote has expired, or its reference has already settled a purchase (T-P11-5);
5. two accounts on this ledger are owned by the agent's key — refusing to choose, because choosing wrongly strands one;
6. any topic's readback disagrees with the shape it was created under, in any field;
7. the profile file topic already holds messages this run did not write — an HCS-1 topic has no admin key, so nothing there can be corrected;
8. a chunk would exceed 1024 bytes **on the wire**, wrapper included;
9. the declaration this run wrote does not resolve under §9.2, or resolves to coordinates this run did not create;
10. the registration's payer on the mirror is not this agent's account;
11. either agent resolves under `hol` **with `blurred`**;
12. the receipt does not validate against the registered `StampReceipt` schema — which is also the assertion that this counter
    can still fill every field §5.4 requires, read from the schema itself, so a field added there stops the sale **before the
    quote** rather than after the transfer;
13. **a carry request outside the policy** — a body that is no row of the template, a body whose payer is not the Postmaster,
    a body on a node this purchase did not pin, a body authorising a fee above its row’s cap, an account update that sets any
    field besides the memo, a message on a topic this reference never bought, or a row already carried;
14. the counter’s co-signature does not verify against the bytes it was asked to carry, checked in the Correspondent’s own
    process before it is added — because finding that out at the network would mean finding it out with this agent’s
    signature already on the transaction;
15. the account the counter names as its payer is controlled by more than one key on consensus, or by a key the mirror does
    not agree with;
16. **the receipt is not issued** while any row is outstanding, or while the holder does not resolve under §9.2 from the
    counter’s reader;
17. **the buyer stops waiting for it after thirty seconds**, in fifteen tries. The wait has a ceiling because an open
    wait is indistinguishable from a hang, and this one happens *after* a transfer has settled and a mailbox is on
    consensus — a caller that cannot tell "still ingesting" from "never coming" eventually kills the process, and killing
    it is the one thing that makes the outcome unclear. **At the ceiling the run stops and says what is true**: the
    transfer settled, the mailbox exists, nothing is lost, nothing will be charged twice, and the reference is
    OUTSTANDING and **resumable from either side** — `buy_stamp` with the same `quoteRef` from the Correspondent, or
    `issueReceipt` at the counter. Neither side re-derives anything from the other: the counter reads the mirror under
    the transaction ids its own signature carried, and the Correspondent re-boots from consensus (D-165). A replayed
    reference returns the receipt it already bought (T-P11-5).

**A refusal leaves no mark** (§3.5): every refusal above happens before a submission, except (10), (12), (16) and (17), which are reported with what did land because a transfer on consensus cannot be withdrawn.

### 5. What is built, and what is checked before the gate

Built: `app/src/counter/` — the carry policy (`carry.ts`), the `TransactionBody` decoder it reads its evidence with (`body.ts`), and what both halves of the counter share (`context.ts`); `app/sdk/carry.ts` — the remote `Signer`. Beside them, `app/sdk/` — the home directory and its record, the keystore, the live `Consensus` over a mirror node and the payer seam, the counter client, `generate_mailbox`, `register_agent`, the doorbell watcher, the stdio MCP server, and the provisioning driver. `app/src/counter/` — §14.3's pricing read from consensus, the three-legged purchase, and the Streamable HTTP MCP server serving `buy_stamp`, `verify` and `resolve`. `app/src/resolve/hol.ts` — §9.5's rule, which Gate One needs because "resolve self under `hol`" is step 5 of the order.

`npm run check:exchange` is **49 assertions over a real Streamable HTTP socket on loopback**, and it is new. Until it
existed nothing in this project had ever opened a socket: `check:correspondent` calls the carry policy directly and
`check:mcp` compiles schemas, and between them no byte had crossed a transport. It stands the counter’s own `build()` up
on an ephemeral loopback port with the MCP SDK’s own server and client transports, against a modelled ledger — a small
in-memory `Mirror` seeded with the committed sequence-2 schedule and a complete §9.2 declaration chain — and drives the
whole exchange: the quote, a body that survives the transport, a signature made on one side that verifies on the other,
every row of the provisioning template carried, every near-miss refused as a code rather than a transport error, and a
receipt built from the counter’s own readback that validates against the registered schema. **The two submissions are
not exercised and cannot be** — there is no offline consensus node — so the settle leg runs down the replay path a landed
transfer takes, and `submit()` itself is Gate One’s.

**It found a defect on its first run, and it is the kind only a socket finds.** MCP requires a tool that declares an
`outputSchema` to return `structuredContent` matching it on any result **not flagged as an error** — the client rejects
the response otherwise, with a protocol error rather than a tool one. `buy_stamp`’s declared output is a `StampReceipt`,
and a quote, a carried signature and a still-outstanding reference are none of them. The quote leg already returned
`PAYMENT_REQUIRED` as an error-flagged result and worked; **the carry leg and the settled-but-carrying leg were written
as plain successes and would have failed at the client, mid-purchase, with three topics already created.** Each now
carries its payload in `_meta` under a flag, with a state code — `PAYMENT_CARRYING`, `PAYMENT_CARRIED` — that a caller
tells from a §6.3 failure by the fact that §6.3’s all begin `STAMP_`.

**And one observation for a test that does not exist yet.** A receipt’s `price.amount` is the NORMALISED decimal, not the
literal the price message spelled: the schedule publishes `"1.00"` and the receipt says `"1"`. Nothing is contradicted —
§14.3 requires no literal echo — but **T-P11-4, when it is written, must compare these as fixed-point values and not as
strings**, or it will fail a receipt that is exactly right. Recorded in the check itself, beside the assertion.

`npm run check:correspondent` is **105 assertions with no network and no key** — it was 53 before D-168 —: D-147's six rows from the one template; a mirror-node key list decoded so §7.1's threshold lane can be checked at all; §14.3's arithmetic in integers with bundles at exactly their count; the §G-19 refusal read out of the registered schema; one sentence template that implies no delivery and no receipt; the doorbell rule over messages alone; and a home directory that is the agent — keys born once, loaded ever after.

The rest of the battery is unchanged and green: typecheck, `p13:check`, `check:register` (86 both ways), `check:schemas`, `check:vectors`, `check:seal`, `check:hcs14`, `check:chunk`, `check:envelope`, `check:hcs10`, `check:store`, `check:mcp`, `check:letter`, `check:prefreeze`, `check:freeze`.

### 6. §G-19 — the thing that blocked the purchase, and the ruling that closed it

§5.4 gives `provisioning? {price, registrationFee?, account, doorbell, log?, manifestTopic, declRegistry?, profileFile?}` and the registered schema makes `price`, `account`, `doorbell` and `manifestTopic` **required**. §5.4's own sentence says why: "the fields after it are the entities **the Postmaster created for the holder**". §6.3's postcondition is a receipt "carrying a `provisioning` line **exactly when** `provision` was true".

Under D-159 as amended the Postmaster creates exactly one entity for the holder — the account. The doorbell and the manifest topic are the **agent's**, created afterwards, by the agent, under the agent's own key. So a receipt that carries the line fails its own schema, and a receipt that omits it contradicts §6.3 and drops `registrationFee` — the field D-159's addendum added precisely so that a Verifier sees the fee "as a leg of the purchase and not as a gift". §14.3 closes the third door: the 2 ℏ cannot be charged with `provision` false, because that price is published under `provisioning` and a Postmaster may not charge under a price it has not published.

**The code refuses rather than choosing.** `counter/purchase.ts` reads the required list out of `spec/schemas/stamp-receipt.schema.json` and refuses a `provision: true` purchase **before anything is signed**; a `provision: false` purchase works in full. Because the gate reads the schema, a 0.6 that changes it lifts the refusal by itself.

**RULED (a), 2026-09-09 (Sonic), D-168: the Postmaster provisions the mailbox it sells.** §4.6’s provisioned path is taken as
written, so §5.4’s "the entities the Postmaster created for the holder" is literally true of the receipt and it validates
against the schema Step 4 froze. **Nothing in the specification changes**, and that is why (a) was taken: it needs nothing
from a frozen document and it is the path §4.6 named first. It is not a workaround.

**(b) is the more accurate description of what D-159 attempted, and it is recorded rather than dismissed.** Making
`doorbell` and `manifestTopic` optional, present exactly where the Postmaster created them, is what the split D-159
introduced actually looks like. It lost on cost, not on truth: the freeze has happened, so it is **0.6**, across fourteen
schema files registered on consensus and every wire string that names them (§1.7). The third candidate — drop the
provisioning line and price the account some other way — stays refused for the reason it was refused: §14.3 has one schedule
for everyone and the 2 ℏ is published under `provisioning`.

**What (a) cost to build, and what it did not.** The provisioner did not move: `sdk/mailbox.ts` creates the same six rows in
the same forced order, signed by the same agent key, with the same readbacks, and it does not know it is being carried.
`Session.payer` has been an injected `Signer` since D-157 and under a provisioning purchase it is **remote** — the
Correspondent sends each frozen body and the purchase reference to the counter and receives the Postmaster’s payer
signature. Four new modules carry the difference: `counter/body.ts` decodes a `TransactionBody`, `counter/carry.ts` is the
policy, `counter/context.ts` holds what both halves of the counter need, and `sdk/carry.ts` is the remote `Signer` — which is
four lines of substance, and that is the whole report on whether the seam was real.

**`provisioningFieldsThisCounterCannotFill` stops refusing and is kept as the assertion that it can.** It still reads the
required list out of the registered schema, so a field added there stops the sale before the quote rather than after the
transfer.

**The finding as it stood, kept:** **(a)** The Postmaster provisions the topics after all — §4.6’s provisioned path taken literally, the Postmaster paying and the agent signing each topic creation over the counter, exactly as Steps 2 and 3 already do for the Postmaster's own agent. **No schema moves**; `buy_stamp` becomes a multi-round-trip agent-signed exchange and CLAUDE.md §11's placement of `generate_mailbox` is amended. **(b)** `doorbell` and `manifestTopic` become optional inside `provisioning`, present exactly where the Postmaster created them — **a change to a registered schema, so 0.6 and not a patch**, on fourteen files that are now frozen on consensus. Smaller change to the text, larger to the version. Ledger §G-19 carries both.

### 7. What Gate Two owes, and is not in this step

`send`, `inbox` and `ack` refuse on the Correspondent's MCP, naming Gate Two. They are built and exercised end to end against the modelled ledger (`npm run check:letter`, 63 assertions) and what they still need is the live wiring and a letter to carry. §10.4's scheduled return receipt is still unimplemented and `send` still refuses `returnReceipt` outright, for the reason Step 6 gives: postage that pays for a receipt nobody was asked for is an artefact on consensus that cannot be withdrawn.

### 8. Expected output until it is signed

```
npm run correspondent:provision -- <home> --dry-run
```

It reads consensus, prints what this home already has, and then prints **the plan with a payer against every row** — built
from `ops/template.ts` itself rather than from a list kept beside it, so what the dry run shows is what the run submits. It
submits nothing. An operator about to authorise the Postmaster to pay for nine bodies its agent signs should be able to see
that on one screen without reading code, which is what the payer column is for.

Run against two throwaway homes 2026-09-09, one fresh and one returning, both print the provisioning plan and exit 0; the
fresh one reports `keys born` and the returning one `keys loaded`, which is D-165’s whole distinction and the only thing
that separates two agents.

**Two funded testnet wallets, two filled home directories, and Sonic’s word are what this step now waits on.** §G-19 is
ruled and no longer among them.

### 9. ADDENDUM for A2 — written 2026-09-10, AFTER its run, and marked as that

**This is not a gate report and it does not pretend to be one.** Everything above was written and committed before the
first transaction of 2026-09-09 and is left exactly as it stood. A2 was provisioned through this same step on
2026-09-10, and the paragraph below says what differed. It is dated and placed last so that no reader can mistake it
for text that stood before a signature — the rule this project holds gate reports to is that one amended after the fact
is not a gate report, and the way to honour it while still recording what changed is an addendum, not an edit.

**A2 is one agent, not two, and it supersedes both A and the plan's "A′".** Account `0.0.10462700`, home `a2`,
`displayName` `DemoAgentA2`, under **C1OPERATOR's wallet `0.0.10450879`** — the same wallet A's home names, because an
operator may own many agents: the wallet is the operator's, the home is the agent's, and a fresh home is a new agent
(D-165). **A is untouched and stays `stopped`.** A2 is not A repaired and must not be described as one.

**Three things in the report above read differently for A2.**

**§1 row 1, the price.** A and B bought at `PriceList` **sequence 3** — 12 stamps plus **2 ℏ** for the provisioned
path, 15.09094832 ℏ. A2 bought at **sequence 4**, published the same morning: 12 stamps at 13.23883804 ℏ plus **30 ℏ**
for the provisioned path, **43.23883804 ℏ**, with `registrationFee` unchanged at 0.05 ℏ. The reprice is the measured
cost of a mailbox (27.78102934 ℏ, of which the fee-gated doorbell is 26.31542199 ℏ) catching up with what was published
before that cost was known.

**§1 row 11, the declared maximum.** Unchanged at **0.02 ℏ**, and unchanged for the reason the report gives. It was
charged 0.00543337 ℏ against the 0.05 ℏ the purchase funded, so this run again passed without having to distinguish the
two readings of the solvency precheck.

**§1a, the balance table.** C1OPERATOR held 19.90905168 ℏ at the start of 2026-09-10 — 35 ℏ less A's 15.09094832 ℏ —
and a purchase at sequence 4 costs 43.23883804 ℏ, so it could not have bought A2 without the top-ups recorded under
"Demo-operator funding". It was funded to 59.90905168 ℏ before the purchase and to 416.67021364 ℏ after it. The
Postmaster's payer needed no top-up at any point.

**One sentence in the report above is wrong and is LEFT WRONG on purpose.** §7 says `send`, `inbox` and `ack` "are built and exercised end to end against the modelled ledger". `ack` is not built and was not built then either; the correction is in Step 6 §8 and in the Correspondent's own refusal text, and this report is not edited, because a gate report amended after the fact is not a gate report. **Everything else in it held without amendment**: the forced order, every readback and its named
predicate, every stop condition, the carry policy and its ceilings, the receipt built from the counter's own readback,
and the acceptance test — both resolutions, no `blurred`. The run of record below is what happened.

---
## PriceList sequence 3 — the rate a Verifier can re-obtain (D-170)

**Submitted 2026-09-09**, transaction `0.0.8641261@1789004837.951853257`, consensus `1789004842.557476068`, sequence 3
on `0.0.10426551`. 666 canonical bytes, sha256 `d5f1f6fb19e0f110c905c00c082b4f3df8172466b8140cb3df4c0246e8f275ae`,
validated against the registered `PriceList` schema before signing and byte-compared against the mirror after. Sequences
1 and 2 read back untouched — a schedule is the sequence of messages (§14.3) and a published one is never edited.

**Why, in one line**: T-P11-4 asks whether the price charged is the price the schedule yields, and on a rate-priced
method that means a Verifier must obtain the rate the Postmaster read **at the instant it read it**. A DEX spot price
cannot be re-obtained at a past timestamp by anyone, so every rate-priced receipt would be true and unprovable, and P-12
downgrades what cannot be replayed. Hedera’s own rate can be.

**The replay, run as a stranger would run it, 2026-09-09.** The counter quoted from sequence 3:

```
quote   13.07417529 ℏ for twelve, plus 2 ℏ for the provisioned path and a 0.05 ℏ registration fee
rate    {source: .../api/v1/network/exchangerate, pair: HBAR/USD,
         value: "0.07648666", at: "1789002062.339026104"}

GET /api/v1/network/exchangerate?timestamp=1789002062.339026104
  -> cent_equivalent / (100 × hbar_equivalent), in integers  ->  0.07648666

IDENTICAL to what the receipt would carry.
```

`rate.at` is the rate record’s **consensus timestamp** and not a wall clock, because that is the string passed back;
`rate.value` is truncated to the arithmetic’s own scale, so the figure published is the figure the price was divided by
and a replay reaches the same tinybar. **No schema moved**: §5.4 types `source`, `pair` and `at` as plain strings.

**What is not fixed and cannot be.** Sequences 1 and 2 name the DEX source and are permanent. Any receipt issued under
them is unreplayable on its rate — LIMITATIONS says so beside L-5. **None exists**: the counter has made no sale, and
Gate One’s first two purchases will quote at sequence 3, because §14.3 makes the current price the latest message before
the purchase.

---
## Step 5 — THE RUN OF RECORD, 2026-09-09

**Correspondent B is provisioned on `hedera:testnet` and resolves under both profiles with no `blurred`. Correspondent A
is stopped, and what is true of it is written below rather than tidied away.** The gate report above is what was
promised; this is what happened. Nothing in it is reconstructed: every id below was read from a mirror node after the
fact, and every fee is the fee the network charged.

### What ran

Seven runs, because six of them found defects. **Every defect was in the window between "a signature left the buyer"
and "the buyer learned what happened"** — which is the one window `check:exchange` cannot reach, and says so: there is
no offline consensus node, so its settle leg runs down the replay path a landed transfer takes and `submit()` itself was
Gate One's. Each is listed with what it cost, because what a defect costs is the only honest measure of it.

| # | What stopped it | On consensus at the stop | Cost |
|---|---|---|---|
| 1 | `submit()` prepared a transaction the counter had already frozen and signed; every SDK setter it calls throws on a frozen one | nothing | nothing — a refusal leaves no mark (§3.5) |
| 2 | `receiptFrom` read the first SUCCESS record under the transaction id. A transfer to a public-key alias auto-creates the account (HIP-542) and the mirror reports that as a **CRYPTOCREATEACCOUNT record under the same id, listed first** — no token transfers in it | A's transfer, and the account it created | nothing yet |
| 3 | the Correspondent wrote the purchase reference down **after** the settle call returned, so it was written exactly when nothing can go wrong and lost exactly when something does | A's transfer | A's reference, restored from consensus |
| 4 | a `quoteRef` arriving with no signature fell through to `quotePurchase` and answered a paid-for purchase with a **second quote** | A's transfer | nothing — caught before it was taken |
| 5 | the quote-expiry check ran **ahead** of the consensus check, and its `requirements.remove` **deleted the counter's record of a purchase that had settled** | A's transfer | **A's receipt. It is not recoverable.** |
| 6 | the re-boot after a purchase read the mirror's `account.publickey` index once; it had not ingested | B's transfer, and the account | nothing — resumed |
| 7 | `register_agent` read the anchor back once; a topic with 381 messages had not ingested | B's registration, at sequence 381 | nothing — resumed |
| 8 | the driver read `uaid` from the returned session's own record, which a provisioning purchase loads from disk **before** the mailbox rows are written | B's whole mailbox, and its receipt | nothing — the handle was stale, not the record |

Every one is fixed, pushed, and has an offline court where one can exist: `check:correspondent` went from 105
assertions to 109, and the four it gained are the SDK facts defect 1 turned on.

### Correspondent B — bought, carried, receipted, registered

**The purchase.** One transaction, three legs, the buyer signing in its own process and the Postmaster as payer.

```
reference     0.0.8641261@1789007373.238805114
consensus     1789007377.498011153        CRYPTOTRANSFER  SUCCESS
              15.09094832 ℏ   0.0.10450880 → the Postmaster   (12 stamps at sequence 3, plus 2 ℏ for the path)
              12 $POSTAGE     0.0.10426205 → the agent's public-key alias, WHICH CREATED 0.0.10452127
              0.05 ℏ          the Postmaster → 0.0.10452127    (the registration fee, as a leg of the sale)
```

**The eight carried rows.** Each body signed by the agent in its own process, decoded by the counter before it would
sign it, and paid for by `0.0.8641261`. The payer on the mirror is the Postmaster for all eight — that is D-168's carry,
and this is the first time it has run anywhere but in a check.

| Row | Entity | Transaction | Charged |
|---|---|---|---|
| doorbell | `0.0.10452149` | `0.0.8641261@1789007480.796319343` | **26.31542199 ℏ** |
| log | `0.0.10452150` | `0.0.8641261@1789007482.960695874` | 0.39534659 ℏ |
| manifest | `0.0.10452154` | `0.0.8641261@1789007493.632479078` | 0.39534659 ℏ |
| declRegistry | `0.0.10452155` | `0.0.8641261@1789007497.993599919` | 0.39534659 ℏ |
| profileFile | `0.0.10452158` | `0.0.8641261@1789007506.592015773` | 0.26443711 ℏ |
| profileChunks | 1 chunk on `0.0.10452158` | `0.0.8641261@1789007512.366919010` | 0.00740684 ℏ |
| registryEntry | `0.0.10452155`#1 | `0.0.8641261@1789007516.787937944` | 0.00353454 ℏ |
| accountMemo | `0.0.10452127` | `0.0.8641261@1789007518.420848031` | 0.00418909 ℏ |

**27.78102934 ℏ against 15.09094832 ℏ taken.** LIMITATIONS carries what that means; it is a pricing decision and not a
defect, and nothing on consensus is wrong.

**The readback, from a mirror node, every field against the shape the row was created under.**

```
doorbell      hcs-10:0:60:0:0.0.10452127   submit NONE   admin 0bf6f350…
              fee 1 × 0.0.10426208 → 0.0.10426205 · 1 exempt key · auto-renew 0.0.10450880
log           hcs-10:0:60:1                submit 0bf6f350…   admin 0bf6f350…   no fee
manifest      wishmail:manifest:1          submit 0bf6f350…   admin 0bf6f350…   no fee
declRegistry  hcs-2:0:60                   submit 0bf6f350…   admin 0bf6f350…   no fee
profileFile   00d27750…51190:brotli:base64 submit 0bf6f350…   admin NONE        no fee      ← D-150
account       memo "hcs-11:hcs://2/0.0.10452155"    12 $POSTAGE    0.04622564 ℏ
```

**The auto-renew account is `0.0.10450880` — the Correspondent's own operator — on every row.** The Postmaster sells a
mailbox once; it does not undertake to renew it forever, and a topic naming it would say otherwise on consensus where
every reader can see it. The counter refuses a row that names it, and this is that refusal never being needed.

**The receipt, and it is the first this counter has issued.** Every `provisioning` field filled from the counter's own
readback under the transaction ids its own signature carried, never echoed from anything the agent said, and validated
against the **registered** `StampReceipt` schema before it was returned.

```json
{
  "ledgerTag": "hedera:testnet", "tokenId": "0.0.10426208", "amount": 12,
  "txRef": "0.0.8641261@1789007373.238805114",
  "price": { "amount": "13.09094832", "currency": "0.0.0" },
  "rate": { "source": ".../api/v1/network/exchangerate", "pair": "HBAR/USD",
            "value": "0.07638866", "at": "1789005662.118530104" },
  "holder": "0.0.10452127",
  "provisioning": { "price": { "amount": "2", "currency": "0.0.0" }, "registrationFee": "0.05",
                    "account": "0.0.10452127", "doorbell": "0.0.10452149", "log": "0.0.10452150",
                    "manifestTopic": "0.0.10452154", "declRegistry": "0.0.10452155",
                    "profileFile": "0.0.10452158" }
}
```

**`rate` is D-170's, and a stranger can run it**: `GET /api/v1/network/exchangerate?timestamp=1789005662.118530104`
returns the record that yields `0.07638866`. Under sequence 1 or 2 this receipt would have been true and unprovable.

**The registration, and the one fact the funded fee exists to buy.**

```
anchor        0.0.6913983   sequence 381   consensus 1789007656.541995104
payer         0.0.10452127  — THE AGENT ITSELF, which is what §9.5 reads to decide `blurred`
charged       0.00377436 ℏ  against 0.02 ℏ declared and the 0.05 ℏ the purchase funded
body          {"p":"hcs-10","op":"register","account_id":"0.0.10452127","uaid":"uaid:aid:6oLcXzHfk4X3…",
               "t_id":"0.0.10452155","m":"WISHMail"}   — no transaction memo (D-164, §6.1)
```

**Row 10 of the gate report is answered, and the answer is that the question did not have to be settled.** The report
said the declared maximum was set to 0.02 ℏ because this project cannot cite whether Hedera's solvency precheck compares
the balance to the fee it *estimates* or to the maximum the transaction *declares*, and that an explicit maximum below
the balance is safe under both readings. **It was.** The submission cost 0.00377436 ℏ — thirteen times under the
declaration and under a tenth of the funding — so the run passed without distinguishing the readings, which is what
declaring explicitly was for. **The question is still open**, and the footnote probe is what would close it.

**Both resolutions, and the acceptance test for the whole step.**

```
hcs14   0.0.10452127 · doorbell 0.0.10452149 · manifest 0.0.10452154 · math · endorsements []
hol     0.0.10452127 · math · endorsements []
```

**No `blurred` on either.** Every agent on the testnet anchor today carries it — all 380 messages before ours were paid
by one broker account — and B does not, because B paid for its own name out of what it was bought with.

**And the idempotency test.** The run was repeated twice more against the same home. Both exited 0, created nothing, and
printed *mailbox existing, registration existing*: `generate_mailbox` asks the resolver first and `register_agent` reads
the anchor first, so a wiped local file cannot cause a second doorbell or the duplicate §9.5 assigns `vague` to (D-165).

### Correspondent A — STOPPED, and what is true of it

**The account is on consensus, bought and paid for. There is no mailbox and there will be no receipt.**

```
reference   0.0.8641261@1789006030.569861064   consensus 1789006038.283484423   SUCCESS
account     0.0.10451893 — created by the transfer, holding 12 $POSTAGE and 0.05 ℏ
paid        15.09094832 ℏ from 0.0.10450879
```

**What is lost is the counter's record of the sale, and only that.** Defect 5 above: the quote-expiry check ran ahead of
the consensus check and deleted the `Requirement` row — the quote it charged, the rate it charged at, and the holder it
sold to. §5.4's receipt carries the price and the rate, and those come from that row. **Rebuilding them from the ledger
would be manufacturing the evidence the receipt exists to be**, so this release does not, and A has no `StampReceipt`.

**What is NOT lost.** Nothing was charged twice, and nothing can be: a transaction id is single-use. The account, its
stamps and its fee are on consensus and spendable. A's home holds the reference, restored from consensus alone — the
account's own `created_timestamp`, and the transaction at it — so the ledger can still be walked from either side.

**What is resumable, and by whom.** A's mailbox can be finished by `generate_mailbox`, which is §4.6's
**self-provisioned** path: A's own operator pays for the six rows, at their own expense, and A then registers itself and
resolves under both profiles exactly as B does. That is L-5's path and the driver already takes it for an agent that
brings its own account. **It is a decision about who pays and about what the demo shows, and it is not a repair** — so
it is written here and not taken.

---

## Step 5 — A2's RUN OF RECORD, 2026-09-10

**A2 is provisioned on `hedera:testnet` and resolves under both profiles with no `blurred`.** It bought at `PriceList`
sequence 4, through a counter carrying the eight fixes Gate One found, and **it completed in one pass with no stop**.
That is what A2 existed to prove and it is the whole of what it proves. Nothing below is reconstructed: every id was
read from a mirror node after the fact, and every fee is the fee the network charged.

**A2 supersedes both A and the plan's "A′" as the demo's first Correspondent.** `A` is untouched and stays `stopped`.

### The purchase — one transaction, three legs, at sequence 4's price

```
reference     0.0.8641261@1789058834.851527600
consensus     1789058841.537707344        CRYPTOTRANSFER  SUCCESS
              43.23883804 ℏ   0.0.10450879 → the Postmaster
                              (12 stamps at 13.23883804, plus 30 ℏ for the provisioned path)
              12 $POSTAGE     0.0.10426205 → the agent's public-key alias, WHICH CREATED 0.0.10462700
              0.05 ℏ          the Postmaster → 0.0.10462700    (the registration fee, as a leg of the sale)
```

The account-creation record sits **first** under the same transaction id, as HIP-542 makes it and as Gate One's second
defect discovered: `CRYPTOCREATEACCOUNT SUCCESS` at `1789058841.537707343`, with no token transfers in it. The counter
read past it, which is that fix running against the network.

### The eight carried rows

Each body signed by the agent in its own process, decoded by the counter before it would sign it, paid for by
`0.0.8641261`. The payer on the mirror is the Postmaster for all eight — D-168's carry, for the second agent.

| Row | Entity | Transaction | Charged |
|---|---|---|---|
| doorbell | `0.0.10462704` | `0.0.8641261@1789058848.026222007` | **26.61271103 ℏ** |
| log | `0.0.10462708` | `0.0.8641261@1789058852.496592338` | 0.39981287 ℏ |
| manifest | `0.0.10462713` | `0.0.8641261@1789058863.683082051` | 0.39981287 ℏ |
| declRegistry | `0.0.10462719` | `0.0.8641261@1789058868.287457867` | 0.39981287 ℏ |
| profileFile | `0.0.10462723` | `0.0.8641261@1789058879.986695593` | 0.26742450 ℏ |
| profileChunks | 1 chunk on `0.0.10462723` | `0.0.8641261@1789058884.624377108` | 0.00756254 ℏ |
| registryEntry | `0.0.10462719`#1 | `0.0.8641261@1789058890.698259469` | 0.00357447 ℏ |
| accountMemo | `0.0.10462700` | `0.0.8641261@1789058894.951525379` | 0.00423642 ℏ |

**The reprice is answered by the ledger, which is the only place it could be answered.**

```
eight carried rows      28.09494757 ℏ
the transfer             0.68047621 ℏ
the HIP-542 create       0.66194185 ℏ
                        ------------
Postmaster outlay       29.43736563 ℏ
received for the sale   43.23883804 ℏ
net                    +13.80147241 ℏ
```

B, at sequence 3, was **29.43 out against 15.09 in**. A2, at sequence 4, covers its own cost with margin. The doorbell
came in at 26.61271103 ℏ against 26.31542199 ℏ for B — the same fee-gated topic, half a percent apart, which is what a
USD-denominated fee schedule charged in ℏ looks like from one day to the next and the reason ledger §G-20 says a flat
price cannot track its own cost.

### The readback, from a mirror node, every field against the shape the row was created under

```
doorbell      hcs-10:0:60:0:0.0.10462700   submit NONE   admin d94b7e7d…
              fee 1 × 0.0.10426208 → 0.0.10426205 · 1 exempt key · auto-renew 0.0.10450879
log           hcs-10:0:60:1                submit d94b7e7d…   admin d94b7e7d…   no fee
manifest      wishmail:manifest:1          submit d94b7e7d…   admin d94b7e7d…   no fee
declRegistry  hcs-2:0:60                   submit d94b7e7d…   admin d94b7e7d…   no fee
profileFile   67c8db25…a0b5e:brotli:base64 submit d94b7e7d…   admin NONE        no fee      ← D-150
account       memo "hcs-11:hcs://2/0.0.10462719"    12 $POSTAGE
```

**The auto-renew account is `0.0.10450879` — A2's own operator — on every row**, and never the Postmaster's.

### The receipt

Every `provisioning` field filled from the counter's own readback under the transaction ids its own signature carried,
and validated against the **registered** `StampReceipt` schema.

```json
{
  "ledgerTag": "hedera:testnet", "tokenId": "0.0.10426208", "amount": 12,
  "txRef": "0.0.8641261@1789058834.851527600",
  "price": { "amount": "13.23883804", "currency": "0.0.0" },
  "rate": { "source": ".../api/v1/network/exchangerate", "pair": "HBAR/USD",
            "value": "0.07553533", "at": "1789056062.817630056" },
  "holder": "0.0.10462700",
  "provisioning": { "price": { "amount": "30", "currency": "0.0.0" }, "registrationFee": "0.05",
                    "account": "0.0.10462700", "doorbell": "0.0.10462704", "log": "0.0.10462708",
                    "manifestTopic": "0.0.10462713", "declRegistry": "0.0.10462719",
                    "profileFile": "0.0.10462723" }
}
```

`provisioning.price.amount` is **30** and `registrationFee` **0.05** — sequence 4's numbers, compared by value and not
by spelling (§14.3, D-169). This is the first receipt issued under sequence 4.

**The stranger's replay of `rate.at`, run as a stranger would run it:**

```
GET /api/v1/network/exchangerate?timestamp=1789056062.817630056
  -> timestamp 1789056062.817630056 · cent_equivalent 226606 · hbar_equivalent 30000
  -> 226606 / (100 × 30000), in integers, truncated to eight places  ->  0.07553533

IDENTICAL to the receipt's rate.value.
```

That is D-170 doing the work it was ruled for: the rate is consensus data with a timestamp filter, so anyone holding
this receipt re-obtains exactly what the Postmaster read.

### The registration, and the one fact the funded fee exists to buy

```
anchor        0.0.6913983   sequence 382   consensus 1789058906.749976000
payer         0.0.10462700  — THE AGENT ITSELF, which is what §9.5 reads to decide `blurred`
charged       0.00381700 ℏ  against 0.02 ℏ declared and the 0.05 ℏ the purchase funded
body          {"p":"hcs-10","op":"register","account_id":"0.0.10462700",
               "uaid":"uaid:aid:7KBD8k3wLN8S7cFbeuE1ptvspu1dvoUJ3hu5G2gpxFMg7SJNahB7ncavYQu17iwHub",
               "t_id":"0.0.10462719","m":"WISHMail"}   — no transaction memo (D-164, §6.1)
```

### Both resolutions, and the acceptance test for the whole step

```
hcs14   0.0.10462700 · doorbell 0.0.10462704 · manifest 0.0.10462713 · math · endorsements []
hol     0.0.10462700 · math · endorsements []
```

**No `blurred` on either.**

### The eight fixes, and what this run says about each

Gate One found eight defects, every one in the window between a signature leaving the buyer and the buyer learning what
happened. **A2 ran through that window nine times — the transfer and the eight carried rows — and stopped at none of
them.**

| # | The defect | What A2 says |
|---|---|---|
| 1 | `submit()` mutating an already-frozen, already-signed transaction | eight carried bodies submitted, none refused |
| 2 | `receiptFrom` reading the first SUCCESS record, which HIP-542 makes the account creation | the receipt named `0.0.10462700` from a record the create sits ahead of |
| 3 | the purchase reference written down after the answer came back | the reference survived the whole run and named the settled purchase |
| 4 | a settled `quoteRef` falling through to a second quote | one quote, one reference, one charge |
| 5 | the expiry check deleting a settled purchase | the `Requirement` row survived to build the receipt — the defect that cost A its receipt |
| 6 | a mirror-lag read taking ingestion for absence, on `account.publickey` | the account was found after the transfer |
| 7 | the same, on the anchor at 382 messages | the registration was read back at sequence 382 |
| 8 | a stale record handle reporting a complete mailbox as incomplete | the mailbox was reported complete and the receipt issued |

**Six of the eight are proven by the happy path alone** — 1, 2, 4, 6, 7, 8 are all "the run did not stop where it used
to". **Defects 3 and 5 are proven by their artefacts rather than by their absence**: the reference was in the home
throughout, and a receipt exists at all, which is exactly what A lost.

**What this run does NOT prove.** The resume path. Every stop condition was live and none fired, so the branch that
matters most if something goes wrong is still exercised only by `check:correspondent`'s 109 offline assertions. That is
the honest limit of a one-pass run and it is stated rather than left to be assumed.

### The idempotency test

Run again, **LIVE**, against the same home — and live is the only mode that tests anything here, because a dry run
submits nothing and so cannot demonstrate that a submitting run declines to submit.

```
correspondent:provision — LIVE: this run CAN SIGN and CAN SPEND
argv as received  ["--live","…/demo/a2"]

  keys        loaded
  account     0.0.10462700
  hcs14       resolves · doorbell 0.0.10462704 · 0 endorsement(s)
  hol         1 registration(s) name this account

  2. buy_stamp — skipped: 0.0.10462700 already exists, so this agent is returning (D-165)
     0.0.10462700 already has coordinates on consensus; its doorbell is 0.0.10462704. Nothing to create.
  3. register_agent — 0.0.10462700 is already registered on the anchor 0.0.6913983; nothing was submitted.

  provisioned. mailbox existing, registration existing, and no `blurred` on either resolution.
```

Exit 0. **Confirmed on consensus rather than from the process**: `0.0.10450879` and `0.0.10462700` hold exactly what
they held before it, and the anchor's newest message is still sequence 382. Every verb asked the ledger first, so a
wiped local file could not have caused a second doorbell or the duplicate §9.5 assigns `vague` to.

### DIVERGENCE — 2026-09-10, the run went live under the invocation this file documented as the dry run

**The run above was not authorised when it happened.** It was invoked as
`npm run correspondent:provision -- <home> --dry-run` — the form §8 of the gate report documents as the dry run — and it
signed. The root script forwards as `npm run <name> --workspace app`, so the appended `--dry-run` landed on a second npm
invocation and npm consumed it as its own option; the positional home directory survived because it is positional. The
driver read `dryRun` as `false`, printed `LIVE` on its first line, and provisioned. **Nothing offline could have caught
it**: the driver was correct and the flag was spelled correctly, and the loss was between the terminal and `argv`.

**Everything on consensus is correct and nothing was repaired.** The purchase, the eight rows, the receipt and the
registration are exactly what an authorised run would have produced, and they were checked against the mirror before
anything else was done. **Signing drivers now default to dry run and require `--live` to arrive in their own argv,
printing the mode and the received arguments before reading a key** — commit `046fc7e`, with the root forwarding fixed
and the rule in CLAUDE.md §12. It is a divergence of our process and not of the protocol.

---
## Demo-operator funding — two wallets, and it is not a sale

**Written before the first signature, as everything here is.** Gate One needs two Correspondents, and a Correspondent
needs an **Operator** in §3.3’s sense — a human or organization behind the agent — with a funded testnet wallet, because
the agent signs and the operator pays (§3.5). In a real deployment those wallets are the operators’ own and nothing in this
repository creates them. In the demo we are all three parties, so the Postmaster’s payer creates them.

**It is funding and not a purchase, and the distinction is not cosmetic.** Nothing here touches the price list, the
treasury, `$POSTAGE`, or the counter. No quote is issued, no reference is settled, no `StampReceipt` exists, and §14.3 is
not consulted, because nothing is being sold. The two accounts this creates are **inputs to the demo**, the way
`0.0.8641261` was an input to Step 2 — the one account we did not create (D-140) — and they are recorded under
`residue` beside the probes for exactly that reason. **The purchases at Gate One are the counter’s first sales, and they
stay that way.**

### What it creates, per operator

| # | Act | Declared shape | Who signs / who pays | Warrant |
|---|---|---|---|---|
| 1 | a payer key | fresh ED25519, born in **this** process, never returned to any caller | — | P-13 · `sdk/keystore.ts::bornPayerWallet` |
| 2 | `AccountCreateTransaction` | 35 ℏ initial balance; `maxAutomaticTokenAssociations = -1`; empty account memo | the new key signs for itself · **the Postmaster’s payer pays** | RECORD (Sonic, 2026-09-09) · HIP-542 |
| 3 | `<home>/config.json` | the shipped template, filled: network, the counter’s URL, the account id, this operator’s key, and the agent’s name | — | CLAUDE.md §11 · D-165 |

**Why unlimited auto-associations rather than an association transaction.** §4.4’s doorbell fee is a HIP-991 fixed fee in
`$POSTAGE` debited from the **payer** of the submission (probe-observed 2026-09-08), so when an operator pays for its
agent’s connection request the stamp leaves the operator’s account — and an account cannot hold a token it is not
associated with. D-157’s two-hop ring therefore needs the operator associated before the first `send`. HIP-542 lets an
account be created associating with anything, so the association happens when the first stamp arrives and costs no
transaction and no decision. `generate_mailbox` keeps its explicit association for an operator that was **not** created
this way, which is every real one.

### What it asserts, and what it reads back

From the mirror and never from the receipt, with a named predicate: the account exists and is not deleted, its balance is
at least the 35 ℏ the create asked for, and `max_automatic_token_associations` is `-1`. The last is the whole point of the
run and is exactly the field a receipt cannot show.

**The order matters.** The key is written to the config **only after** that readback passes. A run that died between the
create and the readback leaves an account whose key was never persisted anywhere — abandoned, at a cost of 35 ℏ of testnet
ℏ — rather than a config pointing at an account that is not what it says it is.

### What it writes, and where

**Each key is written to that Correspondent’s own `config.json`, mode `0600`, outside the repository, and nowhere else.**
The default parent is under the user’s own home directory (`~/.wishmail/demo/a`, `~/.wishmail/demo/b`); `--dir` moves it.
Nothing reaches `.env`, nothing reaches `app/deployment/<network>.json`, and **nothing is printed**: the run’s output shows
the two account ids, their balances, their auto-association setting and their transaction ids, and not one byte about a
key.

That is structural rather than careful. `bornPayerWallet()` returns a `Signer` and an `install`, and the private half
exists only inside their closure — so `ops/demo-operators.ts` cannot print, log or persist a key, because it is not
holding one. It is `ops/identity.ts`’s discipline for the Postmaster’s side, extended to a wallet that has to be persisted
rather than merely used. `npm run p13:check` passes unchanged: the field name `derKey` is still spelled in
`sdk/keystore.ts` and the shipped template and in no third module.

### Idempotency, and every way it stops

**A home is an agent** (D-165), so this refuses to overwrite one. It stops, before or instead of signing, on every one of
these:

1. `<home>/config.json` already exists — move it aside or point `--dir` elsewhere; this run does not overwrite an agent;
2. the Postmaster’s payer holds less than the run needs, checked and printed before anything is built;
3. the create returns any status but SUCCESS, or returns no account id;
4. the account does not read back from the mirror with its balance and its `-1` — and in that case **the key is not
   written**, and the message says so, because a config naming an account nobody verified is worse than no config.

```
npm run demo:operators -- [--dir <parent>] [--dry-run]
```

### The run of record

**Run 2026-09-09, and it is the only thing in this section that was signed.**

| Operator | Account | Balance | maxAutomaticTokenAssociations | Transaction |
|---|---|---|---|---|
| A | `0.0.10450879` | 35 ℏ | `-1` | `0.0.8641261@1789000480.971118350` |
| B | `0.0.10450880` | 35 ℏ | `-1` | `0.0.8641261@1789000484.775578285` |

Both read back from the mirror under the named predicate before either key was written. Two `AccountCreate`
transactions, 70 ℏ of initial balance and about 0.1 ℏ of fees, paid by `0.0.8641261`. **No token moved, no topic was
created, and the counter was not running.**

Both homes boot: `npm run correspondent:provision -- ~/.wishmail/demo/a --dry-run` reports `keys born`, the payer
`0.0.10450879`, no account yet, and prints the provisioning plan; `b` the same under `0.0.10450880`. Their agents’ keys
were born on that first boot, in that process, and are in each home’s `keystore.json` — which is a **different key from**
**the operator’s**, and the whole of what §3.5 separates.

**The account ids above are the whole of what this run disclosed.** `npm run p13:check` passes unchanged and `git status`
is clean: the two configs are under `~/.wishmail/demo/`, which is outside the repository, and no key reached `.env`,
`app/deployment/<network>.json`, the terminal, or any tracked file.

**One thing this run asks for and does not get on Windows, said plainly.** The config is written with mode `0600`, which
is what a POSIX filesystem enforces. This machine is NTFS: `chmod` is advisory there and the file inherits the
directory’s ACL, which for a path under the user’s own profile means the user and the administrators group. So the
protection here is **the location and the user account**, not the mode bits, and an operator on a shared Windows machine
should say so to themselves before pointing `--dir` anywhere else. Not a property of Hedera and not of the specification —
ours, and named rather than assumed.

### Two later fundings, 2026-09-10 — and they came from the operators' own human

**Neither is a sale, on the same reading as the run above.** Nothing here touches the price list, the treasury,
`$POSTAGE`, or the counter. No quote is issued, no reference is settled, no `StampReceipt` exists, and §14.3 is not
consulted, because nothing is being sold. What changed since 2026-09-09 is **who paid**: the Postmaster's payer created
the two wallets, and these two top-ups came from **Sonic's own accounts** — the human behind C1OPERATOR and C2OPERATOR,
in §3.3's sense. That is truer to the demo's story than the first funding was: an operator funds its own wallet, and the
Postmaster is not the source of an operator's money.

**Read from the mirror, per account, after the fact.**

| When | To | Amount | From | Transaction | Consensus |
|---|---|---|---|---|---|
| morning | `0.0.10450879` | 40 ℏ | `0.0.6748221` | `0.0.6748221@1789056890.592401714` | `1789056898.403103104` |
| morning | `0.0.10450880` | 40 ℏ | `0.0.6748221` | `0.0.6748221@1789056912.570948729` | `1789056918.171421104` |
| afternoon | `0.0.10450880` | 400 ℏ | `0.0.10331158` | `0.0.10331158@1789060266.356955825` | `1789060272.650358104` |
| afternoon | `0.0.10450879` | 400 ℏ | `0.0.10331158` | `0.0.10331158@1789060277.077999990` | `1789060281.213717255` |
| afternoon | `0.0.10462700` | **150 ℏ** | `0.0.10331158` | `0.0.10331158@1789060430.638237200` | `1789060438.057164970` |

All five SUCCESS. **Balances read back from the mirror after all of it:**

```
0.0.10450879   416.67021364 ℏ    C1OPERATOR — A and A2's operator
0.0.10450880   459.90905168 ℏ    C2OPERATOR — B's operator
0.0.10462700   150.04618300 ℏ    A2's own AGENT account, 12 $POSTAGE
```

**Two things the record says rather than smooths over.**

**The afternoon funder is `0.0.10331158`, not `0.0.6748221`.** Two different accounts of the same human funded the two
rounds. Both are outside this deployment — neither is an entity of it, neither appears in `spec/pins.json`, and neither
is created by anything in this repository — so the distinction costs nothing and is written down because the ids differ.

**The third row funds an AGENT's account, and that is a departure from a line this project has stated twice.**
§1 row 11 above says "an agent's account never holds ℏ, with one exception", and the exception is the single
registration fee the purchase funds. CLAUDE.md §11 says the same: *the agent holds ℏ once, to sign its own name on the
anchor, and never again.* A2's account now holds 150 ℏ. **Nothing on consensus is wrong and nothing is unconformant** —
§4.4 and §9.5 turn on who *pays for the registration*, which is already settled and recorded at sequence 382 — but the
sentence is no longer true of this deployment, and a reader of Step 5 should not have to discover that from a balance.
It also is not needed for Gate Two: D-157 as ruled 2026-09-10 has the schedule that carries a return receipt paid by the
**sender's own operator wallet**, which is `0.0.10450879`. Recorded here, unresolved, and raised rather than quietly
absorbed.

---
---
## The precheck probe — gate report, written before any signature. NOTHING IS SIGNED.

**The question, and it is one this project has said out loud four times that it cannot answer.** Does Hedera's solvency
precheck compare the payer's balance to the fee it **estimates**, or to the maximum the transaction **declares**?

It matters in exactly one place. `register_agent` is the only submission in this project whose payer holds almost
nothing — 0.05 ℏ, funded as the third leg of the purchase (§4.6, D-159's addendum) — so it is the only one where the
declared maximum is not a formality. It declared **2 ℏ** until 2026-09-09, forty times the balance funding it. It was
lowered to 0.02 ℏ **because the answer is unknown and an explicit maximum below the balance is safe under both
readings**. That was the right move and it is not an answer.

**Gate One did not settle it either, and the reason is worth stating.** B's registration succeeded and was charged
0.00377436 ℏ against 0.02 ℏ declared and 0.05 ℏ held. Both readings predict success there — the declaration is below
the balance and so is the cost — so the run is consistent with both and evidence for neither. **A run that cannot fail
under either hypothesis tests neither.**

### The experiment, and it is a binary

One throwaway account, one throwaway topic, one HCS message whose real cost is a tiny fraction of the balance:

```
balance    0.10 ℏ    (10,000,000 tinybars, read back from the MIRROR and not from a receipt)
declared   1.00 ℏ    ABOVE the balance
actual    ~0.0001 ℏ  far BELOW it
```

| Outcome of act 2 | What it means |
|---|---|
| `INSUFFICIENT_PAYER_BALANCE` | the precheck compares the **DECLARED** maximum |
| `SUCCESS` | the precheck compares the fee it **ESTIMATES** |

**There is no third outcome that answers the question, and one that would confuse it.** `INSUFFICIENT_TX_FEE` means the
declared maximum was **below** what the network required — the opposite comparison, and the status the 2026-09-08 probe
observed, which is precisely why that observation settled nothing here. It is why the declaration is set far above any
plausible cost rather than near it: 1 ℏ against a fee of order 0.0001 ℏ leaves no room for the two to be confused.

**The control, without which act 2 means nothing.** The same submission, from the same account, declaring 0.05 ℏ —
**below** the balance. It must succeed under either reading. If it fails, the account cannot pay at all, for some
reason that has nothing to do with the comparison, and act 2's refusal would have been about that instead.

### What it creates, in order

| # | Act | Declared shape | Who signs / who pays |
|---|---|---|---|
| 0 | a disposable topic | memo `wishmail:probe:precheck`, **no submit key** so any account may submit, no custom fee | the Postmaster's payer |
| 1 | a disposable account | 0.10 ℏ initial balance, key **born in this process**, never persisted | the Postmaster's payer; the new key signs for itself |
| 2 | **the question** | one `ConsensusSubmitMessage`, `setMaxTransactionFee(1 ℏ)` | **the throwaway account, as payer and signer** |
| 3 | **the control** | one `ConsensusSubmitMessage`, `setMaxTransactionFee(0.05 ℏ)` | the throwaway account |
| 4 | the readback | the mirror on what act 3 was charged, and the balance after | nothing |

### What it asserts

The account holds **exactly** 10,000,000 tinybars, read from `GET /accounts/{id}` and not from a receipt — the whole
question is what a node compares a balance to, so the balance had better be the one consensus records. It is not
deleted. Act 2's status is one of the two that answer the question, and the probe **reports UNRESOLVED rather than
inferring** if it is anything else. The control succeeds. The actual charge is under a tenth of the balance.

### What it writes, and where

**Nothing but this file.** No entry in `app/deployment/hedera-testnet.json`, no entry in `spec/pins.json` — a probe is
not an entity of record (D-144, and the posture of both probes before it). The finding goes to **ledger §H** with its
date, and to **LIMITATIONS** beside the sentence that says the purchase funds exactly one fee.

### Disposable, and what it will leave behind

A topic and an account on `hedera:testnet` whose key was born in the run's process and is discarded with it — nobody
can ever move that account's balance, including us, which is the strongest sense of inert and the same posture the
09-08 and 09-09 probes took. **The real `$POSTAGE`, treasury, doorbell, price topic and Postmaster-agent are not
created, touched, or named**, and the runner carries their ids in a `FORBIDDEN` list and stops if it sees one.

### Every way it stops

1. the topic create or the account create returns anything but `SUCCESS`;
2. either returns no entity id;
3. the created topic id is one of the real entities;
4. the mirror does not show the account holding exactly the balance under test;
5. act 2 returns a status that is neither of the two that answer the question — **reported as UNRESOLVED, and no
   inference is drawn**;
6. the control fails, which makes act 2 uninterpretable.

**Cost.** About 0.5 ℏ for the topic, 0.1 ℏ of balance plus its creation fee, and two submissions of order 0.0001 ℏ.
All on the Postmaster's payer, which held 3229.7 ℏ before Gate One.

**Where the runner is.** `app/src/ops/probe-precheck.ts`, `npm run probe:precheck` inside `app/`, with `--dry-run`.

---

## The precheck probe — the run of record, 2026-09-09

**Run and answered. The precheck compares the fee the network ESTIMATES, not the maximum the transaction DECLARES.**
`npm run probe:precheck`, four submissions, three mirror reads, **5 of 5 predicates held**, exit 0. Every figure below
was read from a mirror node and none from an SDK receipt.

**Entities of the run.** Topic `0.0.10452759`, account `0.0.10452761` — key born in the run's process and discarded
with it. Both disposable, neither in `app/deployment/hedera-testnet.json` and neither in `spec/pins.json`.

```
act 0   topic   0.0.10452759                       tx 0.0.8641261@1789011389.561485675
act 1   account 0.0.10452761   10,000,000 tinybars tx 0.0.8641261@1789011393.645569873
        read back from GET /accounts/0.0.10452761 — exactly the balance under test, not deleted

act 2   THE QUESTION
        payer      0.0.10452761        balance   10,000,000 tinybars
        max_fee   100,000,000 tinybars           TEN TIMES THE BALANCE
        result     SUCCESS             charged      222,601 tinybars
        consensus  1789011399.899761108

act 3   THE CONTROL
        max_fee     5,000,000 tinybars — below the balance
        result     SUCCESS             charged      222,601 tinybars
        consensus  1789011401.878301127

        balance after both: 9,554,798 tinybars
```

| Predicate | Read |
|---|---|
| the account holds exactly the balance under test | `balance.balance` **10,000,000** |
| and is not deleted | `deleted` false |
| act 2's outcome answers the question | `SUCCESS` — one of the two, and not `INSUFFICIENT_TX_FEE` |
| the control succeeds, so act 2 was about the comparison | `SUCCESS` |
| the actual cost is far below the balance | 222,601 against 10,000,000 — 2.2% |

**The finding, stated as narrowly as the evidence allows.** A transaction declaring a maximum fee **ten times its
payer's whole balance** was accepted by the node and reached consensus, and the network charged what the operation
actually cost. Therefore **the solvency precheck is against the estimate and not against the declaration.** The control
rules out the alternative explanation — that this account could not have paid at all — because the same account, on the
same topic, with a declaration inside its balance, was charged the identical fee.

**This is the opposite comparison to the 2026-09-08 probe's `INSUFFICIENT_TX_FEE`**, which is a declared maximum below
what the network *required*. The two statuses answer different questions and neither implies the other; that they were
easy to conflate is why this probe declared 1 ℏ against a cost of 0.002 ℏ rather than anything close to it.

**What it changes.** `register_agent` declared **2 ℏ** against the 0.05 ℏ the purchase funds until 2026-09-09, and it
would have been accepted. **Lowering it to 0.02 ℏ was defence in depth and not a fix, and it is kept** — a declared
maximum is what a reader of the transaction sees on consensus, and one forty times the balance says something false
about what that agent can afford. Nothing else in the build changes: the balance gate in `registration.ts` that refuses
below the declared maximum is now known to be stricter than the network, which is the direction a gate should err.

**What is NOT settled, and is not claimed.** A declared maximum above the balance where the **actual** fee also exceeds
the balance — the probe's actual fee was 2.2% of it. And whether a node under load estimates differently. Both are our
scoping.

**Cost.** 0.5 ℏ or so for the topic, 0.1 ℏ of balance and its creation fee, and two submissions at 0.00222601 ℏ. All on
the Postmaster's payer.

**What it left on `hedera:testnet`.** Topic `0.0.10452759`, which nobody keyed, and account `0.0.10452761` holding
0.09554798 ℏ whose key is gone — nobody can move it, including us, which is the same posture and the same consequence
as the two probes before it. Neither is an entity of record.

---

## PriceList sequence 4 — the provisioned path priced at what it costs: gate report, written before any signature

**NOTHING IS SIGNED.** This is what a `npm run prices:4` would submit, what it asserts before it would, where it
writes, how it is idempotent, and every way it stops. The run of record goes beneath it afterwards and this report is
left exactly as it stands.

### 1. Why, and it is a measurement and not a decision about margin

Sequence 2 priced the provisioned path at **2 ℏ** and sequence 3 carried that number forward untouched. Both were
written before a HIP-991 fee-gated topic had ever been created on this network, so 2 ℏ was an estimate of a cost
nobody had paid. **Gate One paid it.** One mailbox costs the Postmaster **27.78102934 ℏ** across its eight rows, of
which the fee-gated doorbell alone is **26.31542199 ℏ**, against **15.09094832 ℏ** taken for the sale. The Postmaster
was selling at 2 ℏ a thing that costs it 27.78 ℏ.

CLAUDE.md §12 states the rule the doorbell taught: *measure what a new topic type costs on the network before anything
is priced against it.* It is measured now, so the path is repriced.

**`provisioning.unitPrice` = `"30"`** — RECORD, Sonic 2026-09-10. Roughly eight percent over the measurement, which is
what absorbs ordinary movement in the exchange rate between one purchase and the next.

**`registrationFee` is unchanged at `"0.05"`.** It is not a margin and not a fee we set: it is the ℏ the purchase funds
into the agent's own account so the agent can pay for its own registration submission (§4.6, §14.3, D-159's addendum).
The measurement did not move it.

**Nothing is repriced retroactively.** §14.3 fixes the price at the message current at the purchase. Correspondent B
bought under sequence 3 and stays bought under it; its `StampReceipt` is not touched, not reissued and not
recomputed — a receipt is never reconstructed by the party that charged it.

**And this is why sequence 4 goes first today.** §14.3: the Postmaster MUST publish a price message before charging
under it. A′ is provisioned at this schedule, so A′ waits on this message reaching consensus.

### 2. What is created, and what is not

**Created:** one message on the price topic `0.0.10426551`, sequence 4. Nothing else. No topic, no account, no token,
no transfer.

**Not touched:** `spec/schemas/` · `spec/pins.json`, because a price is a deployment fact and not a specification fact
(D-144) · sequences 1, 2 and 3, which are on consensus and are never edited — §14.3 makes the schedule the *sequence*
of messages, so a new schedule is a new message · any topic but `0.0.10426551` · any wallet · A′.

**No transaction memo.** §6.1 and T-P9-5 bound a memo to what HCS-10 defines for an operation, and a price list is not
an HCS-10 operation. Sequences 1, 2 and 3 carried none either.

### 3. The exact bytes

```
topic       0.0.10426551          memo wishmail:prices:1
payer       0.0.8641261           POSTMASTER_PAYER_ID
submit key  960fd90e66390a97075087e3b472d968e08fd204c07cea4ff8992682f1558460
            the price topic's sole submit key, the Postmaster payer's (D-142)
canonical   667 bytes (RFC 8785)
sha256      03a553856cbae698c21c622a89f3711410dc55a7f8f1eda843134524c04330ec
```

```json
{"methods":[{"asset":"0.0.429274","bundles":[{"count":12,"price":"1.00"}],"facilitator":"https://x402.org/facilitator","method":"x402-usdc","network":"hedera:testnet","payTo":"0.0.8641261","unitPrice":"0.10"},{"asset":"0.0.0","bundles":[{"count":12,"price":"1.00"}],"method":"hbar","network":"hedera:testnet","payTo":"0.0.8641261","rate":{"pair":"HBAR/USD","reference":{"amount":"0.10","asset":"USD"},"source":"https://testnet.mirrornode.hedera.com/api/v1/network/exchangerate"}}],"provisioning":{"method":"hbar","registrationFee":"0.05","unitPrice":"30"},"spec":"0.5.10","stampToken":{"ledgerTag":"hedera:testnet","tokenId":"0.0.10426208","treasury":"0.0.10426205"}}
```

`spec` is `0.5.10` because that is the text this message is published under. **The specification did not move; the
deployment did.** No wire string changes and no schema changes, so this is not a version event of any kind (§1.7).

### 4. What it asserts from the mirror before it would sign

**The claim this message makes to a reader is that one leaf moved, and a document built from a local file cannot prove
that by itself** — the file is what a hand touched. So the assertion is made against consensus:

```
GET /topics/0.0.10426551/messages?limit=25&order=asc   -> sequence_number === 3, base64-decoded

  THE DIFF, against sequence 3 as the mirror holds it (topic 0.0.10426551)

    provisioning.unitPrice: "2" -> "30"

  exactly one leaf moved
  canonical   667 bytes, sha256 03a553856cbae698c21c622a89f3711410dc55a7f8f1eda843134524c04330ec
  which is sequence 3's 666, less "2", plus "30"
```

**It reaches further than a comparison against the sibling file.** `buildPriceList` fills `stampToken.tokenId`,
`stampToken.treasury` and each method's `payTo` from the environment and the deployment record. A wrong environment
would otherwise reach consensus inside a message that validates against its registered schema and hashes correctly —
which is the shape of every defect this project has had. Any second difference is a **stop**, not a note. Verified by
running it: perturbing `rate.reference.amount` from `0.10` to `0.11` printed both leaves and stopped with exit 3.

**The length is asserted as arithmetic, not as a range.** Sequence 3 is 666 bytes with a one-character price, so
sequence 4 is `665 + len("30")` = 667. A length that is merely close is a second change nobody looked at.

### 5. Running the reader on the writer's output, before it is signed

A schema validates a document against its shape, never against the rule that reads it (CLAUDE.md §9). So the two
functions the counter calls at `buy_stamp` are run over these bytes here — not reimplemented, and not shortcut past.
`currentPriceList` takes a `Mirror` because §14.3 has the price read from consensus at every purchase, so the mirror is
modelled and the reader is the real one.

```
currentPriceList(fake, topic, repoRoot)  ->  quote(current, 'hbar', 1, true)

  one stamp      1.32152769 0.0.0
  rate           0.07567 HBAR/USD at 1789052462.238239154
  rate source    https://testnet.mirrornode.hedera.com/api/v1/network/exchangerate
  provisioning   30 0.0.0, registrationFee 0.05
  stampToken     0.0.10426208 / 0.0.10426205
```

Asserted: the provisioned path quotes **30 ℏ** and funds **0.05 ℏ**, both compared **by value and never by spelling**
(§14.3, D-169); the currency is ℏ; the stamp line is unchanged and still rate-priced against the network's own
exchange rate, which is what a Verifier re-obtains at a receipt's `rate.at` (D-170); and the `stampToken` is the
deployment's `$POSTAGE` and treasury. `readRate` fetched the source **live**, which is what the counter does at
purchase and what makes this a reading of the schedule rather than of our expectations about it.

### 6. Idempotence — from consensus, and it is `publishPriceList`'s own stop

Sequence 4 goes through `publishPriceList` in `app/src/ops/pricelist2.ts`, unchanged and unforked. Its stop is that
**this message is sequence N only if the topic holds exactly N−1 messages now**, read from the mirror before anything
is signed:

- fewer than 3 → stop, "publish the earlier ones first"
- exactly 3 → this is sequence 4, proceed
- more than 3 → compare `messages[3]` byte-for-byte against the composed bytes. **Identical** → "already published,
  byte-for-byte identical. Nothing to do", clean return. **Different** → stop, because publishing would make one more
  and a schedule is the sequence of messages (§14.3).

A second spelling of that rule would be a second place for it to be wrong, so there is one.

### 7. The submit→learn window, and how a run resumes from inside it

**The window is between `submit()` returning and the mirror readback confirming.** Inside it the message may be on
consensus while this process knows nothing — the SDK call may have thrown, the process may have been killed, the
network may have answered a receipt this process never read. No offline check reaches it, because there is no offline
consensus node.

**What is true at every point inside it:**

| Where it stops | On consensus | In the record | Resume |
|---|---|---|---|
| before `submit()` | 3 messages | no `prices.fourth` | rerun; the N−1 stop sees 3 and proceeds |
| after `submit()`, before consensus | 3 or 4 | no `prices.fourth` | rerun; see below |
| after consensus, before readback | 4 | no `prices.fourth` | rerun; the N−1 stop sees 4, byte-compares, returns clean |
| after readback, before `record.put` | 4 | no `prices.fourth` | rerun; same, then `record.put` runs |
| complete | 4 | `prices.fourth` | rerun; byte-identical, clean return, `record.put` is a no-op rewrite |

**A rerun never posts a sequence 5.** The stop reads the topic before composing anything, and where the topic already
holds 4 it compares byte-for-byte. **That comparison is exact because sequence 4 is a fixed document on disk**:
`app/price-list-4.hedera-testnet.json` plus the same environment composes the same 667 bytes and the same
`03a5538…` digest every time. The digest is printed twice in a run — once by the assertion, once by the publisher —
from two independent composes, so a reader of the output can see they agree.

**The only cost the window can carry is a `record.put` that did not happen**, and the rerun performs it. Nothing on
consensus can be left half-written: a `PriceList` is one HCS message, it is 667 bytes against a 1024-byte cap, and it
either lands whole or does not land.

**If the byte-compare finds sequence 4 present and different, that is a stop and not a repair.** Report what is true
at the stop and wait: something else published to the price topic, and no rerun of this should decide what to do
about it.

### 8. Every way it stops

Each of these refuses before anything is signed, and each names what it found:

1. the price topic, the stamp token or the treasury is missing from the deployment record
2. the mirror holds no sequence 3 to diff against
3. the diff against sequence 3 is not exactly `provisioning.unitPrice: "2" -> "30"` — including any constant filled
   from this machine's environment that disagrees with what consensus holds
4. the composed message is not 667 canonical bytes
5. the reader returns no `provisioning` line for a `provision: true` quote
6. the reader quotes anything but 30 ℏ by value, or a `registrationFee` that is not 0.05 by value
7. the reader quotes the provisioned path in something other than ℏ
8. the stamp line is not rate-priced against the network's own exchange rate, or its pair is not `HBAR/USD`
9. the message names a `stampToken` that is not this deployment's `$POSTAGE` and treasury
10. the message does not validate against the registered `PriceList` schema
11. the message exceeds 1024 bytes, the cap past which the SDK splits and a half-message is not a price list
12. the topic holds the wrong number of messages, or sequence 4 exists and is not these bytes
13. the submission returns anything but SUCCESS
14. the mirror does not hold sequence 4 after polling, or holds bytes that are not what was signed, or names a payer
    that is not `0.0.8641261`

### 9. What is written, and where

`app/deployment/hedera-testnet.json`, one new entity `prices.fourth`, in the same `policy` shape as `prices.third`:
`sequenceNumber`, `sha256`, `bytes` as a **count**, the `provisioning` line, and a `warrant` restating §4's reasoning.
`specTag` stamps `v0.5.10` — correct, because the specification did not move.

Then `npm run entities:md` regenerates `ENTITIES.md`, whose price table gains a fourth row and whose bold **"This is
the schedule current now"** moves from row 3 to row 4. Leaving it on row 3 would make the one file a judge follows
name the superseded schedule as current. `npm run check:entities` asserts the file is exactly what the record and
`spec/pins.json` produce.

### 10. What this gate does not answer

**The provisioned path cannot be rate-priced, and 30 ℏ is a flat number carrying a guess at drift.** What
`provisioning.unitPrice` recovers is a cost the Postmaster pays to the network, and Hedera's fee schedule is
USD-denominated and charged in ℏ at the rate in force — which is precisely why sequence 3 moved the *stamp's* rate
source onto the network's own `ExchangeRateSet` (D-170). The stamp is priced the right way and the provisioned path,
which is the leg with the large network cost in it, is the one that cannot say so: the registered `PriceList` schema
gives `provisioning` exactly `{method, unitPrice, registrationFee}`, closed, with no `rate` slot. §1.7 has fired, so
that is **0.6 and never a patch**. It is written up as ledger **§G-20**, marked MINE, and awaits a ruling. **It is not
coded around here** and no file in `spec/schemas/` is touched.

### 11. The gate

**Nothing signs until Sonic says the word.** `npm run prices:4:plan` is the dry run and has been run; `npm run
prices:4` is the submission and has not.

---
## PriceList sequence 4 — THE RUN OF RECORD, 2026-09-10

**Sequence 4 is on `hedera:testnet` and it is the schedule current now.** The gate report above is what was
promised; this is what happened, and the report above it is left exactly as it stood. Nothing below is
reconstructed: every value was read from a mirror node after the fact, never from an SDK receipt (D-144).

Authorised by Sonic, 2026-09-10, against the gate report at commit `93f4f06`.

### What was signed

```
transaction   0.0.8641261@1789055853.203536189      SUCCESS
consensus     1789055861.123389104
topic         0.0.10426551 #4
payer         0.0.8641261                            the Postmaster payer
charged       0.00734187 ℏ against 2 ℏ declared
memo          none — a price list is not an HCS-10 operation (§6.1, T-P9-5)
canonical     667 bytes (RFC 8785)
sha256        03a553856cbae698c21c622a89f3711410dc55a7f8f1eda843134524c04330ec
```

**The digest and the byte count are the ones the gate report declared before the run**, which is the point of
declaring them.

### The readback, and what the topic holds now

`GET /topics/0.0.10426551/messages?limit=25&order=asc`, after consensus:

| # | bytes | sha256 | payer | consensus |
|---|---|---|---|---|
| 1 | 563 | `20aa3b010709d9ff…` | `0.0.8641261` | `1788895954.743195291` |
| 2 | 637 | `14d1ee1b6fec4d5e…` | `0.0.8641261` | `1788989981.685451648` |
| 3 | 666 | `d5f1f6fb19e0f110…` | `0.0.8641261` | `1789004842.557476068` |
| 4 | **667** | **`03a553856cbae698…`** | `0.0.8641261` | **`1789055861.123389104`** |

**Sequences 1, 2 and 3 read back untouched**, byte for byte and digest for digest, exactly as they stood
before this run. §14.3 makes the schedule the *sequence* of messages: a new schedule is a new message and no
published one is ever edited. The runner asserted the readback was byte-for-byte identical to what was signed
and that the payer of record was `0.0.8641261`, and it reported sequence 1 still present.

### The one leaf, as it was asserted before the signature

```
  THE DIFF, against sequence 3 as the mirror holds it (topic 0.0.10426551)

    provisioning.unitPrice: "2" -> "30"

  exactly one leaf moved: provisioning.unitPrice: "2" -> "30"
  canonical   667 bytes, sha256 03a553856cbae698c21c622a89f3711410dc55a7f8f1eda843134524c04330ec
  which is sequence 3's 666, less "2", plus "30"
```

`registrationFee` is `"0.05"` on both. Every method, bundle, rate source, `payTo`, `stampToken` and the `spec`
string are sequence 3's, unchanged.

### The reader, run twice — before the signature and after

**Before**, over the composed bytes through a modelled mirror, `currentPriceList()` then `quote()` — the two
the counter calls at `buy_stamp`:

```
  one stamp      1.32152769 0.0.0
  rate           0.07567 HBAR/USD at 1789052462.238239154
  provisioning   30 0.0.0, registrationFee 0.05
  stampToken     0.0.10426208 / 0.0.10426205
```

**After**, over the READBACK — a real mirror node, the real topic, nothing local:

```
  mirror        https://testnet.mirrornode.hedera.com/api/v1
  topic         0.0.10426551
  current       sequence 4, consensus 1789055861.123389104
  provisioning  {"method":"hbar","registrationFee":"0.05","unitPrice":"30"}

  twelve stamps 13.23883804 0.0.0
  rate          0.07553533 HBAR/USD at 1789056062.817630056
  provisioned   30 ℏ + 0.05 ℏ registration fee
  quoted from   sequence 4 at 1789055861.123389104
```

**The counter now selects sequence 4 as the price current at a purchase**, and quotes the provisioned path at
30 ℏ with a 0.05 ℏ registration fee funded out of it. A provisioning purchase with twelve stamps at this
schedule is **≈ 43.29 ℏ** at the rate above, which is what A′'s wallet must carry before it buys.

The two rate readings differ (`0.07567` before, `0.07553533` after) because they were taken minutes apart and
the network's exchange rate moves. That is the mechanism working, not a discrepancy: the rate is read at every
quote and recorded in the receipt with the consensus timestamp a Verifier passes back to re-obtain it (D-170).

### Sequence 3 is history

**Permanent, never edited, and never charged under again after `1789055861.123389104`.** §14.3 fixes the price
at the latest message with a consensus timestamp before the purchase's, so every purchase from that instant
forward quotes at sequence 4 and every purchase before it quotes at sequence 3 — forever, and by reading the
same topic a Verifier reads.

**Correspondent B is not repriced.** It bought under sequence 3 at reference `0.0.8641261@1789007373.238805114`,
its `StampReceipt` names sequence 3's numbers and sequence 3's rate, and none of that is touched, reissued or
recomputed. A receipt is never reconstructed by the party that charged it.

### What was written

- `app/deployment/hedera-testnet.json` — one new entity `prices.fourth`, `specTag` `v0.5.10`, `policy`
  carrying `sequenceNumber: 4`, the digest, `bytes: 667`, the `provisioning` line, and the warrant.
  `prices.first`, `.second`, `.third` untouched.
- `ENTITIES.md` regenerated: the price table is four rows and the bold **"This is the schedule current now"**
  is on row 4. `npm run check:entities` PASS.
- `STATUS.md` — the schedule current is sequence 4.

### Divergence, reported rather than tidied away

**The runner completed in full; the shell wrapper did not exit within the harness's 300-second window** and
the command was moved to the background. That is the submit→learn window §7 above describes, and it was
resolved the way §7 says to resolve it: **the mirror was read first, because the mirror is the authority and
the process is not.** The topic held four messages with the declared digest and the declared payer before this
process's own output was read. Nothing was rerun, nothing was repaired, and no second message was submitted.
The process had in fact finished — `submitted … SUCCESS`, `confirmed sequence 4`, `byte-for-byte identical to
what was signed`, `recorded as prices.fourth` — so the record write had already landed and the rerun the
window's resume path provides for was not needed.

---
## Step 6 — the first letter: GATE TWO, written before any signature

**Renumbered 2026-09-09.** This was Step 5 when the letter was the next thing to sign. Two Correspondents provisioned through the counter now stand before it as Gate One, so this is Step 6 and the letter is Gate Two. **§1 below is superseded in one respect and left standing as the record of what was planned**: the "fixture" it describes is the Correspondent of Step 5, its account is BOUGHT rather than funded (D-159 as amended), and its provisioning is that step's, not this one's. Rows 9-11 — the lane, the settlement, the chunks — are still this step's and are unchanged.

**Status: GATED, NOT RUN.** Nothing in this section has been submitted. Written and committed before the first transaction, on the rule the probe, Step 2 and Step 3 followed.

### 0. `send` before implementation — actors, I/O, invariants, failure modes

**Actors** (§3). A **Correspondent** is its own process: it holds its own keys, resolves, seals, affixes its own postage and signs its own submissions. The **Postmaster** pays and carries; it holds no key of a Correspondent's and attests nothing (§3.5, P-2). **Both ends of this letter are Correspondents.** The sender is **A2** — account `0.0.10462700`, home `a2`, under C1OPERATOR's wallet `0.0.10450879` — and the recipient is **Correspondent B**, account `0.0.10452127`, under C2OPERATOR's `0.0.10450880`. Neither is the Postmaster-agent, which was the recipient when this step was first written and is not a party to Gate Two at all. **Consensus** produces the postmark; nothing else does. The **Verifier** is anyone, configured with nothing.

**I/O.** `send(coordinates, payload, returnReceipt = false, window?) -> Postmark | AttemptedDeliverySlip` (§6.4). In: coordinates carrying a resolution proof, bytes, a window. Out: chunk 0's `Postmark` — or an `AttemptedDeliverySlip`, which is a **result and not a failure** (F-6). Seven ordered acts: lane, manifest, assembly, affix, submit, settle, receipt request.

**The invariants, as they bind at `send`.**

| | binds here as |
|---|---|
| **P-1** Binding | The AAD names the lane and the resolution proof; the settlement's memo names the AAD; the chunks' `operator_id` names the settlement's `from`; the chunks chain from the header; the header's epoch is the one the resolution yielded. Five welds, and all five are `send`'s to make. |
| **P-7** Stamp precedes send | One settlement, signed by the sender, carrying the identifier, with a consensus timestamp **earlier than chunk 0's**. Affix is act 4 and submit is act 5, and that order is the invariant, not a convenience. A retried `send` never affixes twice. |
| **P-9** Strict HCS-10 | Chunks ride inside HCS-10 `message` operations, one HCS message each, **no transport-layer chunking**, ≤ `CHUNK_WIRE_MAX` 1000 bytes on the whole operation, each carrying HCS-10's transaction memo. This is where §5 below bites. |
| **P-10** Directed only | A stamp buys one envelope to one witnessed-resolved address; the lane must have been born from the doorbell the resolution yielded. No broadcast, no unaddressed mail. |
| **P-11** Uniform postage | Postage is `$POSTAGE` and nothing else; weight is the only scale; the lane carries no custom fee. |
| **P-12** Declared vs appraised | `send` returns coordinates with an endorsement rather than failing where it can; the readers appraise at or below what was declared, and downgrade rather than error. |
| **P-13** Never hold the soul | Every key the Correspondent owns is born in the Correspondent's process. The Postmaster pays for what it carries and holds nothing. This is why the fixture is a **second process** and not a second object in this one. |
| **P-14** Affidavit, not gate | No call waits on another agent — except first contact, bounded by `window`, which returns a slip when it closes. |

**The failure modes, and where each lands** (§13).

F-1 misresolution → the AAD's `rp`; the envelope is unbound at replay. F-2 a forged manifest → the proof hash is bound into the AAD, so it does not recompute. F-3 postage due → `SEND_INSUFFICIENT_STAMPS` before affix, or `unstamped` at replay. F-4 a partial envelope → `SEND_SUBMIT_FAILED`, and the reader's walk stops at the break. F-5 drift → not `send`'s at all; an observation at replay. F-6 **an unanswered doorbell → the slip**, which is this step's second possible outcome and not an error. F-7 a stale lane / closed lane → `SEND_LANE_INVALID`. F-8 a stale key epoch → `SEND_STALE_KEY`, re-resolve; the envelope still opens. F-9 an unresolvable `schemaRef` → the reader reports `VERIFY_SCHEMA_UNRESOLVED` and appraises unverified. F-10 a Postmaster that delays → it can delay a submission and cannot forge one (P-2). F-11 a mirror that disagrees → read another; evidence never depends on which was read (P-4).

**The eight `TOOL_REASON` codes** §6.4 fixes, and none other: `SEND_UNRESOLVED`, `SEND_INSUFFICIENT_STAMPS`, `SEND_TOO_HEAVY`, `SEND_STALE_KEY`, `SEND_LANE_INVALID`, `SEND_AFFIX_FAILED`, `SEND_SUBMIT_FAILED`, `SEND_SETTLE_TIMEOUT`.

### 1. What it creates

**Amended 2026-09-10, and the amendment is most of this section.** When this was written the sender was a *fixture* to be stood up by this step, funded on the side, reaching a transport that did not exist. None of that is true now. **Each Correspondent is its own OS process with its own home directory**, and the home *is* the agent (D-165): `config.json` (its operator's), `keystore.json` (its keys, born once on first boot), `store/`, `record.json`. Nothing it holds is written anywhere the Postmaster reads. It reaches the Postmaster **only through the MCP server over Streamable HTTP**, which **exists** — it is the counter, `app/src/counter/server.ts`, and Gate One ran eight carried bodies through it.

**Both parties are already provisioned, so this step creates THREE entities and not eleven.** A2 and B were bought through the counter under D-168, each with its account, doorbell, log, manifest topic, declaration registry, profile file, register entry and account memo — that is **Step 5's**, and its two runs of record are above. What is left for Gate Two is the lane, the settlement and the chunks.

| # | Entity | Declared shape | Warrant |
|---|---|---|---|
| 1 | `letter.lane` | the HCS-10 connection topic, submit key a threshold of **exactly** the two agents' keys | §7.1, T-P17-2 |
| 2 | `letter.settlement` | the affixing transfer, memo `wishmail:` + `aadHash` | §4.3, P-7 |
| 3 | `letter.chunks` | the HCS-10 `message` operations | §7.4, P-9 |

**What this step no longer creates, and why.** Rows 1–7 of the original table — the account and the six mailbox topics — are **Step 5's**, bought through the counter and provisioned by the Postmaster under D-168, and they exist for both parties before this step opens. The original row 8, a treasury transfer of `$POSTAGE` recorded as *funding and not a sale*, is **deleted rather than amended**: it inverts what happens. A2 and B did not receive stamps as a gift; they **bought** them, one atomic transaction with three legs, and each has a `StampReceipt` naming what it paid. The row's own warrant — that a receipt nobody bought would be a lie about §6.3 — now argues against the row.

The `fixture.*` naming is gone with it. There is no fixture: there are two agents with two homes and two operators, and a home is what distinguishes them (D-165).

Every submission a Correspondent owns — its `connection_created`, its side of the lane, its settlement, its chunks — is **signed in that Correspondent's own process**, and the Postmaster signs nothing of an agent's, ever.

### 2. What it asserts

**Before the letter**: already true, and **not this step's to establish**. Both ends resolve under `hcs14` from a mirror node with `trustClass: math` and `endorsements: []`, and neither carries `blurred`. That is **Step 5's acceptance test**, passed for B on 2026-09-09 and for A2 on 2026-09-10, and both runs of record are above. What this step does with a resolution is bind it: the proof goes into the AAD, and an envelope that was misresolved does not open.

**The first contact**: a `connection_request` on the recipient's doorbell whose HIP-991 fee assesses exactly **one** `$POSTAGE` to the treasury (T-P7-4); a `connection_created` **submitted by the fixture's process**; and a lane whose `submit_key` is a threshold of exactly two keys, and those two (T-P17-2), with no custom fee (T-P11-3).

**The affix**: one settlement, `to` the treasury, `amount` equal to the envelope's weight, `memo` exactly `wishmail:<aadHash>`, and a consensus timestamp **strictly earlier** than chunk 0's (T-P7-1). And the fourth weld: every chunk's `operator_id` names the settlement's `from` account (T-P1-6).

**The submission**: every message ≤1000 bytes, **no `chunkInfo`**, `data` parsing as a Chunk (T-P9-7); the transaction memo `hcs-10:op:6:3` that HCS-10's table gives a `message` on a connection topic — operation 6, topic type 3 (T-P9-5).

**The readers, on what `send` produced.** `inbox` reassembles by the chain, rebuilds the AAD from the header and the lane, checks it against `id`, fetches the settlement and checks memo and amount, and decrypts — and the payload comes back byte-identical. `verify` replays **from the mirror with no key, stamp, account or broker configured** (T-P4-1) and emits an `EvidenceBundle` whose digest is stable across two runs, plus a `Narrative` whose `bundleDigest` equals it (T-P3-4).

**And every refusal the readers owe**, against an altered copy of what was actually sent: a changed header, a wrong lane, a swapped resolution proof, a settlement memo that is not the identifier, an `operator_id` that is not the settlement's `from`, a `ke` that is not the epoch the resolution yielded, and a broken `nx` link. Each must come back unopened with the reason §6.5 names, and none may be a tool failure (P-12).

### 3. What it writes, and where

`spec/pins.json` is **not touched**. Neither is `app/deployment/hedera-testnet.json`: it is the **Postmaster's ops record and takes no Correspondent entity id** (CLAUDE.md §11). B's and A2's rows live in each home's own `record.json` and reach the repository only through `app/deployment/demo-agents.hedera-testnet.json`, snapshotted by `npm run entities:md -- --homes <parent>`. The lane, the settlement and the chunks are the sender's, and are recorded in the sender's own home the same way. Fixtures captured from the run — the lane's messages, the settlement, the postmarks, the manifest — go to `conformance/fixtures/`, and the tests expanded in this step read those files with no network (P-4).

### 4. Idempotency, and every way it stops

Step 2's conditions carry over. Three are this step's own.

**A settlement is not idempotent and must not be retried blindly.** P-7: "one settlement stamps one envelope" and "a retried `send` never affixes twice". A re-run reuses a recorded settlement rather than making a second, and T-P7-5 is the test.

**A lane, once created, is the lane.** §7.1 takes the earliest-created open lane between two agents; a second lane created by a confused re-run is not an error the ledger will let us undo.

**The readers gate the step.** The step is **not done** until `inbox` opens what `send` produced and `verify` reproduces it from consensus alone. A letter nobody has read is not a letter; it is bytes on a topic.

### 5. STOP CONDITION SETTLED BEFORE THE GATE — `chunkInfo`

STATUS §6 recorded, unacted, that `TopicMessageSubmitTransaction.freezeWith` attaches `chunkInfo` to **every** message including a single-chunk one, while §7.4 requires an envelope chunk to carry none. That would have made every chunk this step submits fail T-P9-7 — permanently, because a consensus message cannot be withdrawn.

**Confirmed on consensus**, not from reading: our own price-list message at `0.0.10426551` sequence 1 carries `chunk_info {"number":1,"total":1}` on the mirror node. So the defect is real and it is ours already, in a message that is not an envelope and therefore not subject to §7.4.

**Confirmed fixed, and without a signature.** The SDK sets `_chunkInfo` only inside `freezeWith`'s chunk loop and `_makeTransactionData()` omits the field entirely when it is null. Freezing through the base class instead skips the loop. Both transaction bodies were built and **decoded locally from their own protobuf bytes** — no submission:

```
ordinary   freezeWith -> chunkInfo: {"total":1,"number":1, ...}
base-class freezeWith -> chunkInfo: null
                         message bytes preserved: true
```

So `app/src/ops/hcs10.ts` carries a `MessageOperation` transaction that overrides `freezeWith` to the base class's and nothing else. It is used for envelope chunks and for nothing that is not one.

**This is also the concrete answer to an open question.** "HCS-10 by hand vs SDK" (STATUS §6) is settled in the narrow way the evidence supports: the SDK's transaction classes are used, with **one** override, scoped to the one operation whose wire form §7.4 constrains — not a hand-rolled protobuf, and not the SDK unmodified. The first chunk on consensus is the confirmation, and if the mirror shows `chunk_info` on it the step stops there. **Recorded in full** as its own scoped divergence above — "an envelope chunk is frozen through the base class" — with both decoded transaction bodies as its evidence, because a reader of the wire needs to know why our chunks look unlike every other SDK-built message on the network.

### 6. The T-IDs this step answers

Sender side: **T-P1-6** (`operator_id` names the settlement's `from`), **T-P1-11** (the `nx` chain, a foreign chunk, and `hdr.h`), **T-P4-2** (a Correspondent with nothing but stamps and its own keys completes `send`), **T-P7-1** (settlement precedes chunk 0), **T-P7-2** (one settlement, one envelope), **T-P7-3** (short postage rejected), **T-P7-5** (a retried `send` affixes once), **T-P9-5** (HCS-10's memos), **T-P9-6** (a closed lane), **T-P9-7** (1000 bytes, no `chunkInfo`), **T-P9-8** (the manifest, one message, before chunk 0), **T-P9-11** (an undefined ledger tag), **T-P10-1** (no proof, or the wrong lane), **T-P10-2** (a lane not born from the doorbell), **T-P11-1** (a settlement in another token), **T-P11-3** (a lane with a custom fee), **T-P12-3** (expired coordinates re-resolve), **T-P13-2** (no tool input carries key material), **T-P14-1** (nothing waits but first contact), **T-P17-2** (the lane's threshold key).

Reader side: **T-P1-1** (`INBOX_UNBOUND`), **T-P1-2** (`INBOX_UNSTAMPED`), **T-P1-4** (the AAD vectors, now against a real envelope), **T-P1-5** (the seal vectors, likewise), **T-P3-1** (byte-identical evidence from a fresh Verifier), **T-P3-3** (the walk takes the earliest chunk the chain admits).

Those the step **exercises** are expanded against fixtures captured from the run. The rest stay failing honestly: a test that passes on a fixture it was not given is worse than one that fails.

### 7. What must be true before this is called done

The letter has a postmark; `inbox` returned the payload byte-identical; `verify` produced a bundle from consensus alone with a narrative whose `bundleDigest` matches; every altered copy was refused with the reason §6.5 names; and no chunk on consensus carries `chunk_info`.

### 8. Where Step 6 stands — close of 2026-09-09

**Nothing in this step has been signed.** No connection request, no settlement and no chunk has reached `hedera:testnet`, and the eleven entities §1 lists have not been created. What exists is the whole of the step that can exist without them.

`send`, `inbox` and `verify` are built and run end to end — against `app/src/tools/memory.ts`, a modelled ledger that enforces the four things the network enforces and this step depends on: a topic with a submit key refuses any other key, a topic with a HIP-991 fee assesses it to the collector unless the submitter is exempt, a transfer fails on a short balance, and consensus order is total. `npm run check:letter` is **63 assertions** over one letter: resolved, rung through a fee-gated doorbell, answered, stamped, sealed, chunked, posted; opened by `inbox` byte for byte; reconciled by `verify` into a bundle two Verifiers agree on and a narrative carrying its digest; the bundle, the narrative, the envelope and the settlement each validated against their registered schemas; a slip where no door answered; and the seven alterations of §7 refused on consensus rather than in memory.

**`ack` IS NOT BUILT, and until 2026-09-10 this section and the Correspondent's own refusal text both said it was.** There is no `ack` implementation anywhere in `app/src` or `app/sdk`: the name appears in `mcp/tools.ts` as a declared surface with its four failure codes, in `tools/consensus.ts` as a comment about which tools write, and in `sdk/server.ts` where it is refused beside `send` and `inbox`. `check:letter`'s only contact with a return receipt is the assertion that `returnReceipt: true` is **refused**. The claim was wrong and is corrected here rather than left standing.

**What §10.4's return receipt needs, so that the size of it is on the page.** The recipient's `ack` is a **ScheduleSign** (HIP-423), and what it signs was created by the sender at `send`: a **ScheduleCreate** whose inner submission is one `ConsensusSubmitMessage` carrying the receipt manifest to **B's manifest topic**, announced on the lane as an HCS-10 `transaction` operation. `npm run check:freeze` has already measured the shape without signing anything — the inner submission frozen locally is **676 bytes** inside a 6144-byte transaction, so it fits — but measuring is not implementing, and nothing in the tool path builds a schedule today. **The schedule is paid by the SENDER's own operator wallet** (D-157 over D-47, ruled 2026-09-10): Postmaster-pays carry for `send` is deferred this window, carry exists only inside `buy_stamp`, and D-157 makes the payer the sender's choice — so for A2 that is `0.0.10450879`. It is conformant and it is said plainly rather than left to be inferred. The tests this answers are **T-P1-8**, **T-P1-9** and **T-P16-2**.

**THE PREDICTED APPRAISAL, derived from §11 and written here BEFORE the letter, so the run confirms rather than surprises.**

Two different axes, and they are easy to confuse. **The resolution's trust class** is §9's: `math`, endorsements `[]`, no `blurred`, and that is already true of both parties and confirmed on consensus by Step 5's two runs. **The envelope's standing** is §11.5's ladder — verified > unverified > unstamped > unbound — and it is what a Verifier reports at replay.

Working §11.5's table row by row for A2 → B:

```
binding  (unbound if it fails)   all six checks are send's own five welds     expected: PASS
postage  (unstamped if it fails) settlement precedes chunk 0, memo = id,
                                 to = treasury, amount covers weight (+1
                                 for the return receipt)                      expected: PASS
resolution (unverified)          manifest at rp.u hashes to rp.h              expected: PASS
                                 a message at the manifest's location
                                   hashes to the proof (T-P6-7)               expected: PASS
                                 schemaRef resolves (T-P9-3)                  expected: PASS  ← changed
                                 resolution replays under a CLAIMED
                                   profile (T-P6-1, T-P12-4)                  expected: FAIL  ← the one
```

**T-P9-3 no longer bites.** Step 4 signed on 2026-09-09: the fourteen schemas are registered, `spec/pins.json` carries no null, and every `schemaRef` resolves. The reason this section gave until now is gone.

**A different one takes its place, and it is structural rather than accidental.** §11.4: "A Verifier replays it under the profile the manifest names, **if that profile is one the Verifier claims (§9.6)** … Where the profile is not claimed … the resolution is appraised unverified." `RELEASE.profiles` in `app/src/release.ts` is `{}` — this release claims **no profile**, exactly as `RELEASE.classes` claims no class, because §1.5 makes silence claim nothing and no conformance test is expanded. So the `hcs14` resolution this letter binds is one no Verifier of this release claims to replay.

**So the prediction is: `appraised.standing` = `unverified`, `reasons` = the profile-not-claimed row (T-P6-1, T-P12-4), and `resolution.standing` = `unverified` beside a DECLARED trust class of `math` with no endorsements** — because §11.4 also says a Verifier "does not raise a trust class" and reports what the sender declared beside its own standing (P-12).

**This is a finding and not a thing to make true.** The envelope will be correct in every particular a Verifier can check; what is missing is a claim this release deliberately does not make. Claiming `hcs14` in `RELEASE.profiles` would change the answer to `verified` and would be a claim eighty-six unexpanded tests cannot back — so it is not done, and the honest number is written down in advance instead. If the run yields anything other than the above, that is the finding to bring.

**One thing this step refuses rather than skips, and one that is now decided.** §6.4's step 7, the scheduled return receipt, is not implemented: postage would include the receipt fee and chunk 0's header would request it, so an envelope assembled without §10.4's schedule is one whose sender paid for a receipt nobody was asked for — an artefact that is wrong on consensus and cannot be withdrawn. **`send` therefore refuses `returnReceipt` outright, at `app/src/tools/send.ts:322`, and lifting that refusal is what Gate Two is.**

**Who submits the first-contact connection request is DECIDED.** Ledger §G-14 is **closed by D-157**: the sender always signs, and who *pays* is the sender's choice, the Postmaster being the default payer and not the required one. §6.4 step 1 and §4.4 both carry `CHANGED: D-157`, and the ruling added a MUST of its own — **T-P2-4**, that a Postmaster never submits a ring the agent did not sign. "Parameterised, not decided" was true when it was written and is not true now.

**What the step owed, and what of it is now built — restated 2026-09-10.** The Streamable HTTP transport: **built**, and it is the counter (`app/src/counter/server.ts`), which has carried sixteen agent-signed bodies across two provisionings. The second-process Correspondent with keys born in its own process: **built**, and its home directory is its identity (D-165) rather than a `.env`. Its provisioning: **Step 5**, and a **real sale** — B at sequence 3's prices, **A2 at sequence 4's**, the account bought and not funded, which is D-159 as amended and the reason the original §1 row 8 was deleted rather than corrected.

**What remains this step's, and it is three entities and two unbuilt verbs:**

| | State |
|---|---|
| `send` / `inbox` on the live `Consensus` rather than the modelled one | **partly built** — the tools exist and pass 63 assertions against `memory.ts`; `tools/consensus.ts` is the seam and names `ops/mirror.ts` for reads and `ops/hedera.ts` for writes; nothing wires them for the letter path |
| `ack` | **not started** |
| §10.4's schedule — ScheduleCreate at `send`, ScheduleSign at `ack` | **not started**; measured only, by `check:freeze` |
| the letter on `hedera:testnet` | **not started**; blocks the fixture capture, and so every T-ID expansion |
| `verify` from a third, EMPTY home | **partly built** — exercised against the model; never run from a genuinely empty home against real consensus, which is where P-4 stops being an intention |
| the reply B → A2 on the same lane, ringing nothing | **not started**; it is what proves §7.1 |
| the fixture capture and the T-ID expansions §6 names | **not started**; nothing else moves the harness off 86 registered, 0 expanded, 0 passed |

STATUS.md §6 carries the same list with what each blocks.

## Step 6 — CHECKPOINT ONE: the first letter, plain. Gate report, written 2026-09-10 before any signature

**NOTHING IS SIGNED.** Gate Two is split into two checkpoints, each with its own word (RECORD, Sonic 2026-09-10).
**Checkpoint one is the parts that exist**: `send`, `inbox` and `verify` on live consensus, the ring, the lane, one
plain letter A2 → B, B opens it, and a stranger verifies it from an empty home. **Checkpoint two is the parts that do
not** — §10.4's scheduled receipt and `ack` — and it has its own section below.

**Consequence of the split, ruled: the first letter on this lane is PLAIN.** The letter that carries a return receipt
is the second, and it rings nothing, which is how §7.1's proof and the receipt arrive in one act.

### 1. The parties, and who pays for what

| | |
|---|---|
| **sender** | **A2**, account `0.0.10462700`, home `a2` — doorbell `0.0.10462704`, log `0.0.10462708`, manifest `0.0.10462713` |
| **recipient** | **Correspondent B**, account `0.0.10452127` — doorbell `0.0.10452149`, manifest `0.0.10452154` |
| **stranger** | a THIRD home with nothing in it: no key, no account, no stamp, no counter (P-4) |
| **Postmaster** | **not a party.** It sold both mailboxes and it carries nothing here |

**Every submission in this checkpoint is paid by the sender's own operator, `0.0.10450879`**, except B's
`connection_created`, which B's own operator `0.0.10450880` pays. Carry exists only inside `buy_stamp` this window;
Postmaster-pays for an agent's own submissions is deferred and **T-P4-2 stays untested** (CLAUDE.md §11).

| Submission | Signs | Pays |
|---|---|---|
| one stamp to the payer (§4.4's first hop) | A2 | `0.0.10450879` |
| `connection_request` on B's doorbell | A2 | `0.0.10450879` |
| `connection_created` on B's doorbell | B | `0.0.10450880` |
| the lane topic create | both, threshold | `0.0.10450880` |
| the resolution manifest on A2's manifest topic | A2 | `0.0.10450879` |
| the settlement (postage to the treasury) | A2 | `0.0.10450879` |
| every chunk on the lane | A2 | `0.0.10450879` |

**The doorbell's fee, and the account it comes out of.** §4.4: *the fee is charged to the transaction payer.* The
payer here is A2's operator `0.0.10450879`, so that is the account HIP-991 debits one `$POSTAGE` from — and **an
account cannot be debited a token it does not hold.** Read from the mirror 2026-09-10, `0.0.10450879` holds **zero**
`$POSTAGE`. §4.4 gives the remedy in the same paragraph: *a sender that borrows a payer … first transfers one stamp
to that payer, bearer custody in transit and not key custody.* So the run's first act is A2 moving **one stamp** from
its own twelve to `0.0.10450879`. It costs no association transaction: that wallet was created with
`maxAutomaticTokenAssociations = -1`, which the config template's own paragraph on association promises and the mirror
confirms. **The ring costs the sender one stamp either way**; what this decides is only which account it leaves from
on its way to the treasury.

### 2. What it creates — three entities, and no more

| # | Entity | Declared shape | Warrant |
|---|---|---|---|
| 1 | `letter.lane` | the HCS-10 connection topic, submit key a threshold of **exactly** the two agents' keys, **no custom fee** | §7.1, T-P17-2, T-P11-3 |
| 2 | `letter.settlement` | the affixing transfer to the treasury, memo `wishmail:<aadHash>`, consensus **strictly before** chunk 0's | §4.3, P-7, T-P7-1 |
| 3 | `letter.chunks` | the HCS-10 `message` operations on the lane | §7.4, P-9, T-P9-7 |

Beside them, two messages that are not entities: the `connection_request` and `connection_created` on B's doorbell,
and A2's resolution manifest on its own manifest topic (§6.4 step 2). **The account and the six mailbox topics are
Step 5's** and exist for both parties already.

### 3. How the processes are arranged, and which is up when

```
  1.  the counter          NOT NEEDED. Nothing in this checkpoint buys anything;
                           `buy_stamp` is not called and the Postmaster carries nothing.
  2.  B's process          UP FIRST and stays up: `npm run correspondent` on B's home,
                           whose doorbell watcher (D-158) is a timer beside the tools.
                           It auto-accepts — the stamp is the gate, screening is 0.6 —
                           and posts `connection_created` on B's OWN doorbell, signed
                           in B's process and paid by B's operator.
  3.  A2's process         the letter driver, once B is watching.
  4.  the stranger         a THIRD, EMPTY home. `verify` takes a Reader and nothing
                           else, so it needs no home at all; one is used to prove it.
```

**B's watcher must be running for the ring to be answered**, and if it is not, `send` returns an
`AttemptedDeliverySlip` when the window closes — which is a result and not a failure (F-6), and leaves one stamp
consumed at the doorbell and no envelope assembled.

### 4. What it asserts, and what it reads back

Every readback is a mirror-node read with a named predicate, never an SDK receipt.

**The ring**: the `connection_request` is on B's doorbell with a consensus timestamp; the HIP-991 fee assessed
**exactly one** unit of `0.0.10426208` to the treasury `0.0.10426205` (T-P7-4); the request is on A2's own log (§5.9).

**The lane**: its submit key is a threshold of **exactly two** keys and those two (T-P17-2); it carries **no custom
fee** (T-P11-3); it was created in answer to a request on the doorbell the resolution's coordinates name (T-P10-2).

**The affix**: one settlement, `to` the treasury, amount equal to the envelope's postage, memo **exactly**
`wishmail:<id>`, and a consensus timestamp **strictly earlier** than chunk 0's (T-P7-1). Every chunk's `operator_id`
names the settlement's `from` (T-P1-6).

**The submission**: every message at or under **1000 bytes** on the whole operation; **no `chunk_info` on the mirror**
(T-P9-7) — which is what the base-class freeze override of §5 exists for and the first chunk on consensus is its
confirmation; transaction memo `hcs-10:op:6:3` (T-P9-5).

**The readers, on what `send` produced.** `inbox` at B reassembles by the chain, rebuilds the AAD from the header and
the lane, checks it against `id`, fetches the settlement and checks memo and amount, decrypts — and the payload comes
back **byte-identical**. `verify` from the empty home emits a bundle whose digest is **equal across two runs** and
equal to what the sender computed (T-P3-1), with a `Narrative` whose `bundleDigest` equals it (T-P3-4).

### 5. The predicted appraisal, stated as a prediction

**`appraised.standing` = `unverified`; `reasons` = the profile-not-claimed row, T-P6-1 / T-P12-4.**

Binding passes and postage passes. **T-P9-3 does not bite**: Step 4 registered the fourteen schemas on 2026-09-09,
`spec/pins.json` carries no null, and the chunk names `hcs://13/0.0.10448509#1`, which resolves. What remains is
§11.4's own sentence: *a Verifier replays the proof under the profile the manifest names, if that profile is one the
Verifier claims (§9.6) … where the profile is not claimed … the resolution is appraised unverified.*
`RELEASE.profiles` is `{}`.

**This is the correct answer for a claimless release, not a defect.** §9.6: *a Verifier that claims no profile is
conforming (§1.4): it verifies binding, settlement, and postmarks, and appraises every resolution as unverified* —
and T-P12-4 is the test that says exactly that. The resolution's own **trust class is `math` with no endorsements**,
reported as declared beside the standing, because a Verifier does not raise a trust class (P-12).

**If the run yields anything else, that is the finding.**

### 6. What it writes, and where

`spec/pins.json` is not touched. `app/deployment/hedera-testnet.json` is not touched — it is the Postmaster's ops
record and takes no Correspondent entity id (CLAUDE.md §11). The lane, the settlement and the chunks are recorded in
**A2's own home**, and B's answer in B's. Fixtures captured from the run go to `conformance/fixtures/`, and the tests
that read them run **with no network** (P-4).

### 7. Idempotency, and every way it stops

**A lane, once created, is the lane** (§7.1). `send` finds it from consensus by §7.1's own rule — the
`connection_created` operations on the recipient's doorbell, `lanesFromDoorbell`, one implementation that `send`,
`inbox` and `verify` all read — so a re-run rings nothing. A second lane created by a confused re-run is not something
the ledger will let us undo.

**A settlement is not idempotent and must not be retried blindly** (P-7, T-P7-5): one settlement stamps one envelope,
and a re-run reuses a recorded settlement rather than making a second.

It stops, before or instead of signing, on: coordinates carrying no resolution proof (`SEND_UNRESOLVED`); fewer stamps
than the postage (`SEND_INSUFFICIENT_STAMPS`); weight over `MAX_WEIGHT` (`SEND_TOO_HEAVY`); a key epoch no longer
current (`SEND_STALE_KEY`); a lane closed, fee-bearing, or not born from the coordinates' doorbell
(`SEND_LANE_INVALID`); an affix that did not land (`SEND_AFFIX_FAILED` — nothing submitted, nothing consumed); a
partial submission (`SEND_SUBMIT_FAILED`); chunks not all witnessed inside the wait (`SEND_SETTLE_TIMEOUT`). And on
`returnReceipt: true`, which this build refuses outright at `app/src/tools/send.ts:322` and which checkpoint two lifts.

### 8. The submit→learn window, per consensus write, and the resume from inside each

There are four windows in this checkpoint and they do not have the same shape.

| Write | If the signature left and the outcome was not learned | Resume |
|---|---|---|
| **the stamp hop** (§4.4) | the payer may hold the stamp | re-read the payer's balance; the hop moves a stamp **only when the payer holds none**, so a re-run that finds one moves nothing |
| **the ring** (`connection_request`) | the request may be on B's doorbell and one stamp already consumed | re-read the doorbell for a request from this account; **a second ring costs a second stamp and creates a second request**, so a re-run must read before it rings — and the watcher answers by `connection_id`, so a duplicate request would produce a duplicate lane, which §7.1 then resolves by taking the earliest |
| **the settlement** | postage may be consumed with no envelope on the lane | **NEVER retried blindly** (P-7). The settlement is found from consensus by its memo — `wishmail:<id>` names the envelope — and re-used. A second transfer under the same memo would be a second settlement for one envelope, which T-P7-2 exists to reject |
| **the chunks** | some may be on the lane and some not | resubmittable against the **same** settlement (D-52). The chain is walked from the header, so a reader takes the earliest chunk the chain admits (T-P3-3) and a partial envelope is `INBOX_INCOMPLETE` rather than a wrong one |

**The rule for all four is the one Gate One taught and the a2 run re-taught: read the mirror first, and the process's
own output second.** If anything stops, report what is true at the stop and wait. Do not repair.

### 9. What the dry run showed, 2026-09-10, and what it could not

Under today's default a dry run submits nothing (`ops/mode.ts`, CLAUDE.md §12). This is the whole of what it proved,
composed by **the same `sealEnvelope` the tool calls**:

```
letter — DRY RUN: nothing will be signed
argv as received  ["--dry-run","…/demo/a2","--to","0.0.10452127"]

sender      0.0.10462700   payer 0.0.10450879 — the operator pays; the agent signs (§3.5)
doorbell    0.0.10462704   log 0.0.10462708   manifest 0.0.10462713
schemaRef   hcs://13/0.0.10448509#1

recipient   0.0.10452127  doorbell 0.0.10452149  manifest 0.0.10452154
resolution  math · 0 endorsement(s)
proof hash  f84257b7e7ccf152b2002fe52bf7852fd2a01c1ece0d8995e44e5f0bad29544a
epoch       1

lane        NONE — this is first contact; send rings the doorbell and waits (§6.4 step 1)
stamps      the agent holds 12
ring        one stamp, debited from 0.0.10450879 — §4.4's two-hop, the agent transfers it first

payload     37 bytes of text
ciphertext  53 bytes
weight      1 oz · postage 1 stamp(s) · returnReceipt false
envelope id de3badf46c72db71ad6bb572cf3eb2be85898123616e760da8d1aeaa76482927
memo        wishmail:de3badf46c72db71ad6bb572cf3eb2be85898123616e760da8d1aeaa76482927
```

**What it proved**: B resolves, and at what trust class; the proof's hash; the AAD and therefore the envelope
identifier, which is its SHA-256; the weight and the postage; the settlement memo exactly; that no lane exists, so
this is first contact; and that the agent holds enough stamps while its payer holds none.

**What it could not prove, and it is the half that matters**: whether the doorbell answers, whether the fee assesses,
whether the lane's key list is the threshold that was asked for, and whether a chunk lands without `chunk_info`.
**There is no offline consensus node**, and every defect Gate One found lived in exactly that gap.

### 10. Checkpoint TWO — named here, not built here

**The scheduled return receipt and `ack`**, then a **second** letter A2 → B on the **same lane** with
`returnReceipt: true` — ringing nothing, which is §7.1's proof and the receipt in one act — B acks, the receipt lands
on **B's** manifest topic, and `verify` shows it. Then a **plain** reply B → A2, with no return receipt (RECORD).

**The schedule window is 30 days** (RECORD, Sonic 2026-09-10). **The schedule is paid by the SENDER's own operator
wallet** — D-157 over D-47, ruled 2026-09-10: Postmaster-pays carry for `send` is deferred this window, carry exists
only inside `buy_stamp`, and D-157 makes the payer the sender's choice. For A2 that is `0.0.10450879`. It is
conformant and it is said plainly rather than left to be inferred.

What it needs built: a **ScheduleCreate** at `send` whose inner submission is one `ConsensusSubmitMessage` carrying
the receipt manifest to B's manifest topic, announced on the lane as an HCS-10 `transaction` operation; and `ack` as
the **ScheduleSign**. `npm run check:freeze` has measured the inner submission at **676 bytes** inside a 6144-byte
transaction, so it fits — but measuring is not implementing. T-P1-8, T-P1-9, T-P16-2.

### 11. The path from `unverified` to `verified`, derived and not claimed

Ruling 5 asks what a release must pass to claim the `hcs14` profile. From the specification:

**§9.6's MUST**: *a Verifier MUST implement replay for every profile it claims, SHOULD implement it for `hcs14`.*
`verify` implements it — §11.4's replay became real at D-167, running §9.2's rule to the profile file over a
`ProfileSource` both a mirror node and a Verifier's `Reader` satisfy. **That MUST is already met.**

**§1.5 / T-P15-3**: a claim names no class whose suite did not pass in full. So a claim carrying `hcs14` under
VERIFIER needs the **VERIFIER suite** green — **34 rows plus the 11 marked `all`**, not four tests. That is the size
of the thing, and it is the honest number.

**The profile-specific rows, and what checkpoint one gives each a fixture for:**

| T-ID | What it asks | Fixture after checkpoint one? |
|---|---|---|
| **T-P6-3** | the `hcs14` rule's branches: memo of neither form, no current entry, no `properties.wishmail`, `uaid`/`nativeId` disagreeing, a direct-HCS-1 memo resolving **with** `blurred` and a snapshot, an HCS-2 memo resolving **without**, and one agent matching only under HCS-14's example key order | **partly.** A2 and B are the HCS-2/no-`blurred` success branch, already on consensus. The failure branches are derived offline by altering captured bytes — which is what an exception corpus is. The example-key-order agent already exists as a live vector in `check:hcs14` (`0.0.7124407`) |
| **T-P6-2** | per profile, a fixture manifest recomputes to its hash from its locator | **yes, and only after.** No `hcs14` manifest is on consensus today — `send` step 2 is what publishes one. **Checkpoint one creates the first** |
| **T-P6-1** | altered inputs no longer hash to the proof; the envelope appraises unbound | **yes**, derived offline from the captured manifest |
| **T-P6-7** | a manifest whose `meaning.uri` names a topic where nothing recomputes appraises unverified; one that does, verified | **yes**, the captured manifest for the positive and one altered copy for the negative |
| **T-P12-4** | a Verifier claiming **no** profile appraises every resolution unverified and passes | **yes** — and it is the control that must stay green whatever is claimed |
| **T-P9-4** | each `spec/schemas/` file digests to what HCS-13 registered | **already satisfiable**: Step 4 filled every pin |

**Every one of those runs with no network once captured** (P-4), which is the point of capturing them.

**Nothing is claimed here.** `RELEASE.profiles` stays `{}` and `RELEASE.classes` stays `[]`. This section is the
sequence, and sequencing it is Sonic's.

### 12. The gate

**Nothing signs until Sonic says the word.** `npm run letter:plan` is the dry run and has been run; `npm run letter`
is the live one and has not. B's watcher is not up.

---
## Step 4 — the HCS-13 schema registration, signed 2026-09-09

**Signed on Sonic's authorization, and the freeze it makes is permanent.** `spec/schemas/`'s fourteen files are now on `hedera:testnet` and pinned in `spec/pins.json`. §1.7: once a minor version's schemas are registered a patch changes no schema, so from this point the smallest field in any of the fourteen is **0.6**. That is what this signature bought and what it cost.

**The entities.** Fifty-six, four per schema, in the order §5.11 and HCS-13 force: the HCS-1 file topic, its chunks, the HCS-2 registry that manages that one schema's versions (`hcs-13.md:134-160`), and the `register` entry whose sequence number the `schemaRef` pins. Every file topic carries the schema's SHA-256 as its memo and **no admin key**, because HCS-1 forbids one (`hcs-1.md:48-49`, D-150); every registry carries the agent as both submit and admin key, memo `hcs-2:0:60` — **indexed 0**, so earlier entries stay readable and an earlier `schemaRef` never becomes unresolvable (D-155).

| schema | file topic | chunks | registry | schemaRef | sha256 |
|---|---|---|---|---|---|
| `proof` | 0.0.10448471 | 3 | 0.0.10448473 | `hcs://13/0.0.10448473#1` | e4ebeabad267… |
| `mail-coordinates` | 0.0.10448477 | 3 | 0.0.10448480 | `hcs://13/0.0.10448480#1` | ba3abb30e43e… |
| `stamp-receipt` | 0.0.10448482 | 3 | 0.0.10448486 | `hcs://13/0.0.10448486#1` | fab6540859a8… |
| `settlement` | 0.0.10448487 | 2 | 0.0.10448492 | `hcs://13/0.0.10448492#1` | ad265c1c2df0… |
| `envelope` | 0.0.10448498 | 3 | 0.0.10448503 | `hcs://13/0.0.10448503#1` | aa85c277596d… |
| `chunk` | 0.0.10448507 | 3 | 0.0.10448509 | `hcs://13/0.0.10448509#1` | af96d14f2862… |
| `postmark` | 0.0.10448510 | 2 | 0.0.10448513 | `hcs://13/0.0.10448513#1` | 99d02ab5a39f… |
| `return-receipt` | 0.0.10448514 | 2 | 0.0.10448518 | `hcs://13/0.0.10448518#1` | d4a25c5f64e9… |
| `attempted-delivery-slip` | 0.0.10448526 | 2 | 0.0.10448529 | `hcs://13/0.0.10448529#1` | f87178d4c468… |
| `evidence-bundle` | 0.0.10448532 | 3 | 0.0.10448537 | `hcs://13/0.0.10448537#1` | 248fdaae31ae… |
| `narrative` | 0.0.10448540 | 1 | 0.0.10448544 | `hcs://13/0.0.10448544#1` | b06588bbb9c6… |
| `conformance-claim` | 0.0.10448547 | 2 | 0.0.10448551 | `hcs://13/0.0.10448551#1` | 430d4e2fc0d7… |
| `declaration` | 0.0.10448556 | 2 | 0.0.10448560 | `hcs://13/0.0.10448560#1` | 59c6a779e1bc… |
| `price-list` | 0.0.10448565 | 3 | 0.0.10448570 | `hcs://13/0.0.10448570#1` | f772d558cf73… |

**Read back from consensus, not from a receipt, and compared to the shipped bytes.** Every one of the fourteen `schemaRef`s was resolved as a Verifier resolves one — the registry topic at that sequence, its `t_id`, the HCS-1 file there, reassembled by `o` and decompressed — and the result compared byte-for-byte against `spec/schemas/<name>.schema.json`. **14 of 14 match, and each digest equals the pin.** That is T-P9-4's substance, observed rather than asserted.

**Idempotency, the acceptance test this project holds every provisioning run to.** The second run printed `existing 56` and created nothing.

**Cost.** 9.70 ℏ for Step 4 and the second `PriceList` together, on the operator.

---

### The first run stopped, and the defect was ours

**Run 1 stopped at step 2 with `Unterminated string in JSON at position 1024`** — its own readback refusing to parse what it had just written. The stop condition worked exactly as it is meant to: nothing was pinned, and the run refused to continue past an entity it could not confirm.

`hcs-1.md:92-95` says "the final base64 string should chunked into segments no greater than 1024 bytes", and the same section says "each chunk is uploaded to a Hedera Consensus Service topic as an HCS message". **Those two sentences cannot both hold.** A single HCS message caps at 1024 bytes (ledger §H, measured: `getRequiredChunks()` is 1 at 1024 and 2 at 1025), and a 1024-byte segment inside `{"o":N,"c":"…"}` is 1037 on the wire. The SDK does not refuse it — it silently splits the message across two consensus messages, and neither half is parseable JSON alone.

Our code had taken the standard literally and bounded the chunk's **content**. It now bounds the **whole message**, which keeps every segment "no greater than 1024" and keeps every chunk one HCS message; the standard's stated maximum is simply not attainable. `hcs1File` also checks its own output against that ceiling and throws rather than emitting a chunk the network would split — the only thing standing between a silent split and a permanent HCS-1 file no reader can reassemble.

**Why it had never shown.** Every HCS-1 file this project had written before was one chunk: the 2026-09-08 profile is 563 bytes. Step 4 is the first time a file needed more than one, and it needed three.

**A second copy of the same bug.** `ops/declaration.ts` had its own chunking loop with the identical error. It never showed there for the same reason, and it would have shown the first time an agent's profile grew past a chunk. Collapsed to one chunker: a second spelling of a rule is a second place for it to be wrong, and this one already was (CLAUDE.md §9).

**What it left on the ledger, permanently.** Topic `0.0.10448375` — created correctly, with the proof schema's digest as its memo and the agent as its sole submit key — then written with three half-chunks. HCS-1 forbids an admin key, so **it can never be deleted and its messages can never be withdrawn**. It is in the ops record under `residue` with the whole reason, so that `entities` holds exactly one proof schema file and no reader is left wondering what an orphan topic is. **Nothing was pinned from it**: `spec/pins.json` was still fully unfilled when the run stopped, so no `schemaRef` names it and no claim could ever have cited it. The intent-journal entry that would have re-adopted it for the chunks step was cleared deliberately — that transaction did submit, and its messages are the ones on that topic.

---

### The second PriceList — sequence 2, signed 2026-09-09

**Numbers RECORD (Sonic):** `provisioning {method: "hbar", unitPrice: "2", registrationFee: "0.05"}`. Two ℏ flat for the mailbox purchase, the 0.05 ℏ registration fee funded out of it. Every cost the Postmaster incurs for provisioning is denominated in ℏ — the HIP-542 probe measured account creation at 0.64 ℏ — so a flat ℏ price is stable against the rate in a way a USDC-referenced one is not.

Sequence 2 on `0.0.10426551`, **637 canonical bytes**, sha256 `14d1ee1b6fec4d5e…`, payer `0.0.8641261`, consensus `1788989981.685451648`, transaction `0.0.8641261@1788989976.210208773`.

**§14.3's schedule is the sequence of messages, so nothing was edited.** Sequence 1 stands untouched at 563 bytes — which `priceListStep.confirm` rebuilds and byte-compares on every later run, so an edit would have been caught. The submitter validated the message against the registered schema before signing, refused to run if the topic did not hold exactly one message, and after signing read sequence 2 back from the mirror and compared it byte-for-byte to what it had sent. A re-run finds sequence 2 already identical and does nothing.

**What is now sellable that was not.** §14.3 forbids charging under a price that has not been published, so until this message the provisioned path of §4.6 could not be sold at all. T-P11-4's arithmetic for a provisioning purchase is `count × unitPrice (by rate) + 2 ℏ`.

---

## The HIP-542 probe — gate report, written before any signature. NOTHING IS SIGNED.

**Status: RUN 2026-09-09.** This report was written and committed before any signature (`562fd10`); the run of record follows it below. Nothing in this section was edited after the run except the marked amendments, which were made before it.

**Approved to run, 2026-09-09 (Sonic), with act 2 extended — and one thing in this report turned out to be wrong before it ran.** The amendments are marked below and the original wording is left where it stood, because a gate report that is quietly corrected after approval is not a gate. The run of record follows this section.

**Why it exists.** D-159 puts the whole provisioning order on one mechanism that this repository has read about and never watched: a token transfer to a public-key alias that has no account creates the account under that key. §4.6 states it, T-P16-1 tests it, ledger §H carries it from `docs.hedera.com` and HIP-542 — and every word of that is second-hand. The 2026-09-08 HIP-991 probe is the precedent: four things about doorbell fees that had been inferred from our own ADRs turned out to be observable in one afternoon, and one of them (the fee is debited from the payer, not the submitter) is the reason D-157 exists at all.

Two questions, and the second is the one D-159 actually rests on.

1. **Does the alias transfer create the account, with the token associated and the balance credited?** If it does not, "the account is bought, not funded" is false and step 2 of D-159's order needs a funded account before it, which changes the demo.
2. **Can that new account, holding zero ℏ, sign a token transfer *out* with someone else as payer?** This is the affix shape under D-157's seam — the agent signs as the stamps' owner (§4.3), the operator pays — and every submission after step 2 depends on it. If a zero-ℏ account cannot be a non-payer signer, the seam does not work and the agents need ℏ, which contradicts D-156.

**AMENDED 2026-09-09 (Sonic).** Act 2 carries **two legs in one transaction** — one unit of the probe token and the registration fee in ℏ — because that is the purchase's shape under D-159's addendum: the account is born holding stamps and exactly one fee, in one act. So question 1 widens to "with the token associated, the balance credited, **and the ℏ leg credited in the same transaction**", and question 2 becomes "holding only the fee it was given", with the added predicate that after act 4 **its ℏ balance is unchanged** — the payer paid.

**What it creates.** Nothing that survives. Throwaway keypairs generated in the probe's own process; the inert probe token and its throwaway treasury from 2026-09-08, reused as CLAUDE.md §11 permits; the operator as payer throughout.

**CORRECTED 2026-09-09, before the first signature: the 09-08 probe token is not reusable, and the reason is the reason it is safe.** `0.0.10425740` holds 9,999 units of `0.0.10425743` — confirmed from the mirror, `GET /accounts/0.0.10425740/tokens` — and its private key was born in that run's process and discarded. It is in no file, by design (`identity.ts`: "the private half never leaves this closure"). **Nothing can move those units, including us**, which is the strongest sense in which a probe token can be inert, and it is exactly what CLAUDE.md §11's "where reusable" was hedging against. So this probe mints its own token with its own throwaway treasury, as the 09-08 probe did, and leaves a second permanently inert token behind for the same reason the first one is. The cost of that is two extra transactions on the operator's account and a second dead token on testnet; the alternative is keeping a probe treasury's key, which is worse.

| # | Act | Body, exactly | Signed by | Paid by |
|---|---|---|---|---|
| 0 | generate | two fresh ED25519 keypairs, in-process, never written to disk: the probe treasury and the new agent | — | — |
| 0b | `AccountCreateTransaction` | the probe treasury account, 2 ℏ float *(added: see the correction above)* | operator | operator |
| 1 | `TokenCreateTransaction` + `TokenMintTransaction` | the probe token — `decimals 0`, `initialSupply 0`, `INFINITE`, supply key the probe treasury's, **no admin, freeze, wipe, pause, KYC or fee-schedule key** — then 10 units minted in its own transaction. D-141's posture and D-149's birth-then-mint, so the probe mirrors the real token's shape and not a convenient one *(added)* | probe treasury | operator |
| 2 | `TransferTransaction` | **one transaction, two legs, both to the alias** *(amended)*: probe token `-1` from the probe treasury / `+1` to the **public-key alias** of the new key, and ℏ `-5_000_000` tinybar from the operator / `+5_000_000` to the same alias. `AccountId.fromEvmAddress` is NOT used; the alias is the public key, per §H — an EVM-address alias makes a hollow account with no key | probe treasury | operator |
| 3 | read | `GET /accounts?account.publickey=<raw hex>&balance=true` — which asserts the predicate directly rather than assuming an account id — and `GET /transactions/<act 2>` | — | — |
| 4 | `TransferTransaction` | probe token: `-1` from the new account, `+1` back to the probe treasury | **the new account's key** | operator |
| 5 | read | `GET /transactions/<act 4>` — `token_transfers`, and the `transfers` list showing which account paid — and the new account's balance again | — | — |

**What it asserts, by named predicate, each read from the mirror node and never from an SDK receipt.**

- After act 2: an account exists at the alias; its `key` is the generated public key; **its `balance.balance` in ℏ equals the tinybars sent** *(amended: was "is 0")*; its token balance for the probe token is **1**; the account-creation fee appears in act 2's `transfers` against the **operator**, not against the new account (§H, HIP-32/HIP-542).
- After act 4: the transfer succeeded; `token_transfers` shows `-1` from the new account and `+1` to the treasury; the `transfers` list shows the fee paid by the **operator**; **the new account's ℏ balance is unchanged** *(amended: was "still 0")* — which is the whole of what D-157's seam claims, watched rather than assumed.

**What it writes, and where.** Nothing in `app/deployment/hedera-testnet.json` — a probe is not an entity of record. The raw mirror JSON for each read goes into this file under the probe's own heading, as the HIP-991 probe's did, so a reader can check the claim without re-running it. The keys are discarded when the process exits and are named in no file.

**Every way it stops.**

- The probe names any real entity → stop. The runner carries the list — `$POSTAGE` `0.0.10426208`, the treasury `0.0.10426205`, the doorbell `0.0.10426553`, the agent `0.0.10426206`, its manifest topic `0.0.10426591` — and refuses if a created entity id is any of them *(amended: the 09-08 token is not reusable, so the check is against the real entities rather than for the old probe's)*.
- Act 2's receipt is not `SUCCESS` → stop, report the status, sign nothing further.
- The alias account exists before act 2 → stop; the probe is meaningless if it did not create the account.
- Act 4 fails with `INSUFFICIENT_PAYER_BALANCE` against the **new** account → that is the finding, not a failure: it means a nearly-empty account cannot sign as a non-payer, D-157's payer seam does not work, and "fund one fee" becomes "fund every submission", which is a scope change and goes to Sonic before anything else is built.
- Anything unexpected in the mirror JSON → record it verbatim and stop. The probe exists to be surprised.

**Cost.** Five transactions and four mirror reads, all on the operator's account *(amended: the treasury and token have to be created, per the correction above)*. **No stamp is spent, because no `$POSTAGE` is involved** — the units moved here are a token minted for this run and worth nothing.

**Where the runner is.** `app/src/ops/probe542.ts`, `npm run probe:542` inside `app/`. It writes its raw observations to `probe542-observations.json` — gitignored, and a working paper rather than a record: what the probe establishes is written out here, and the JSON is not kept.

---

## The HIP-542 probe — the run of record, 2026-09-09

**Run and answered. Both questions are yes, and the second is the one D-159 rests on.** `npm run probe:542`, five transactions, four mirror reads, **9 of 9 predicates held**. Every predicate below was read from the mirror node and none from an SDK receipt. **Every read is written out below rather than pointed at.** The runner wrote its raw JSON to `probe542-observations.json`, gitignored as the 09-08 probe's was and **deleted from the working tree on 2026-09-09**: a working paper nobody else can open is not a record, and everything it held — the alias, the key, the ids, the fees, the balances at each step — is in this section.

**Entities of the run.** Probe treasury `0.0.10446531`; probe token `0.0.10446532` ("WISHMail HIP-542 probe stamp", P542, decimals 0, born at 0 and minted 10); the account the probe was written to find, **`0.0.10446534`**, which nobody created — it was bought. Operator `0.0.8641261` paid every transaction. No `$POSTAGE` was involved: the units moved here are a token minted for this run and worth nothing.

**Act 2, and it is one transaction.** `0.0.8641261@1788983188.790484982` — a single `TransferTransaction` carrying two legs to a public key that had no account: one unit of the probe token from the probe treasury, and 5,000,000 tinybar (0.05 ℏ) from the operator. It landed as **two consensus records**, and that pair is the finding:

```
name                  nonce  consensus              entity        charged_tx_fee
CRYPTOCREATEACCOUNT   1      1788983195.458822103   0.0.10446534   64,073,264
  transfers      0.0.8641261 -64,073,264   0.0.802 +64,073,264
  token_transfers (none)

CRYPTOTRANSFER        0      1788983195.458822104   —              65,611,021
  transfers      0.0.8641261 -70,611,021   0.0.802 +65,611,021
                 0.0.10446534 +5,000,000
  token_transfers 0.0.10446531 -1   0.0.10446534 +1
```

The network created the account **as a child transaction of the transfer**, one nanosecond before the transfer itself, and charged the whole creation fee — 0.64 ℏ — to the operator. The new account appears in the creation record not at all and in the transfer record only as a credit. **The account is bought, not funded**, and D-159's sentence is now watched rather than inferred.

**Predicates after act 2, each from `GET /accounts?account.publickey=<raw hex>&balance=true`** — which asserts "an account exists under the generated key" directly, rather than assuming an id and then checking it:

| Predicate | Read |
|---|---|
| an account exists at the alias | `0.0.10446534`, `alias` `CIQPXHNLJEIWPDGRTDWAGGMX6N66GWUJBPBHEMARGG6BW6H7R52NYEQ` |
| its `key` is the generated public key | `ED25519 fb9dab4911678cd198ec031997f37de35a890bc272301131bc1b78ff8f74dc12`, byte for byte the key born in the probe's process |
| its ℏ balance equals the tinybars sent | `balance.balance` **5,000,000** |
| its token balance is 1 | `tokens[0.0.10446532].balance` **1** |
| the creation fee was charged to the operator, not the new account | `transfers` above: only `0.0.8641261` is debited |

**And one thing nobody asked for, which matters more than some of the above.** The auto-created account came back with `max_automatic_token_associations: -1` — **unlimited automatic token associations**. That is why the token leg needed no `TokenAssociateTransaction` and why one transaction sufficed. It also means a provisioned agent can receive a second token it never associated with, which is a fact about the mechanism and not a hazard here (§4.1 fixes that only the pinned stamp is postage, and T-P11-1 rejects a settlement in any other token). Recorded because it was not predicted.

**Act 4 — the affix shape under D-157's seam.** `0.0.8641261@1788983193.276018844`: the new account signs a transfer of its one unit back to the probe treasury; the operator is the payer. `SUCCESS`, consensus `1788983197.659886619`.

| Predicate | Read |
|---|---|
| the new account can sign as a non-payer | `SUCCESS` — no `INSUFFICIENT_PAYER_BALANCE`, and none was expected against a payer holding a real balance |
| `token_transfers` shows the movement | `0.0.10446534 -1`, `0.0.10446531 +1` |
| the fee was paid by the operator, not the signer | `transfers`: `0.0.8641261 -1,409,610`, `0.0.802 +1,409,610` — the signer is not in the list |
| its ℏ balance is unchanged | **5,000,000**, at birth and after signing |

**What this settles, and for which decision.**

- **D-159's step 2, as its addendum amends it.** A single transaction creates the account, credits the stamps, and credits the registration fee. The three-leg purchase is buildable exactly as written; nothing has to be split into two acts and nothing has to be resumed if the second half fails, because there is no second half.
- **D-157's payer seam.** An agent holding only its own fee signs for itself while someone else pays, and its balance is untouched by that submission. *Agent signs, payer signs* is a network fact and not an arrangement of ours. The seam can therefore take a remote signature later without the agent's balance being part of the design.
- **D-156's "an agent's account never holds ℏ, with one exception".** The exception is enough. The 0.05 ℏ the account was born with is still there after it signed; only its own registration will spend it.
- **What it does NOT settle**, said plainly: the probe's signer held 0.05 ℏ, not zero. A **strictly** zero-balance account signing as a non-payer was not tested, because D-159's addendum means we never build one — the fee arrives in the same transaction as the stamps. If that ever changes, this is the untested corner.

**Cost.** 0.64 ℏ for the auto-creation, 0.66 ℏ for act 2's transfer, 0.014 ℏ for act 4, plus the treasury account and the token and its mint. All on the operator.

**What it left on `hedera:testnet`.** A second permanently inert probe token, `0.0.10446532`, held by a treasury `0.0.10446531` whose key was born in this process and discarded — the same posture as the 09-08 probe's, for the same reason, and with the same consequence: nobody can ever move those units, including us. The account `0.0.10446534` likewise: its key is gone, it holds 0.05 ℏ and no token, and it will expire on its own. **None of the three is in `app/deployment/hedera-testnet.json` and none is in `spec/pins.json`**; a probe is not an entity of record.

---

## The `hol` resolver — a design note, written before it was built (7b)

**Built 2026-09-09** as `app/src/resolve/hol.ts`, following this note. Gate One needs it: step 5 of D-159's order is "resolve self under `hcs14` **and `hol`**", and the fact the whole order exists for — no `blurred` — is a statement §9.5's rule is the only thing that can make. Two things the note did not say, found in the building. §5.2's canonical location is inside the proof's hash (D-163), so `resolutionProofFor` now takes the **rule** and the **statement** as arguments rather than hard-coding §9.2's: a manifest that did not say which rule produced it would be replayed under whichever rule the reader guessed, and two rules over one locator do not produce one output. And `SourceMessage` gained an optional `payer`, because §9.5 decides `blurred` on it and §9.2's port had no way to supply it — the resolver **refuses to appraise** a registration whose payer a source could not give, rather than assuming one.

Nothing here is normative. This is what §9.5 and the pinned HCS-10 text say the resolver must read, so that the build after the gate has one shape to follow.

**The read path, each step named by the one before it.**

```
   address (uaid, registry=hol|hashgraph-online)
        |  §9.5: "Locate the registration"
        v
   anchor topic 0.0.6913983 (testnet), read IN FULL, every page
        |  a `register` op naming the address, by either route:
        |    (a) a uaid whose identifier AND nativeId are the address's
        |    (b) an account_id equal to the address's nativeId account
        v
   the registration message           <- the proof's locator lives here
        |
        +-- carries t_id ---> HCS-2 topic -> current entry -> HCS-1 file -> HCS-11 profile
        |
        '-- carries account_id and no t_id ---> the account's memo, then §9.2's rule,
                                                 carrying §9.2's endorsements
        v
   properties.wishmail = the declaration (§9.1)
        |
        v
   MailCoordinates + the resolution proof
```

**Where `blurred` attaches, and where it does not.** §9.5: "Where the registration's payer is not the address's account, the rule assigns `blurred`: the registration is on consensus, and under a key that is not the agent's." The payer is `payer_account_id` on the mirror's topic-message object — the same field the 09-08 census read. Every one of the anchor's 380 messages was paid by `0.0.2659396`, so **every agent currently on that anchor resolves with `blurred`**, and our own will not, because D-159 step 5 has the agent pay for its own registration. That is the whole point of funding one fee, and T-P13-4 is the test that holds it.

`blurred` is the *only* endorsement this rule assigns on its own, beside `vague` where more than one registration names the address (the latest is taken). Where the registration took route (b), §9.2's endorsements come with it — so a registration by `account_id` whose account memo names an HCS-1 file directly resolves `blurred` twice over, for two different reasons, and both are reported.

**What the proof's `inputs` must carry to satisfy T-P6-1** — "a resolution proof whose inputs are altered after resolution no longer hashes to the proof" — in the shape `core/proof.ts` now fixes for every rule (§5.2, ledger §G-16(a)):

- **`locator`**: `{ledgerTag, anchorTopic, sequenceNumber}` — §9.5's own words — and, for the account-memo shape, §9.2's locator beside it: `{account, registryTopic?, registrySequence?, profileTopic, consensusTimestamp}`. Every element is on consensus and re-obtainable from any mirror node forever, which is why this profile's trust class is `math`.
- **`digest`**: over the canonical JSON of what was read at that locator — the registration message body, and then either the HCS-2 entry and the profile's digest, or the account memo and the profile's digest. This is what makes T-P6-1 bite: alter any of it and the digest moves, so the proof no longer hashes to itself.
- **`snapshot`**: **absent**, except where route (b) reaches §9.2's second form, which carries the memo. §9.5 says so directly: "a snapshot only where §9.2's second form carries one." A snapshot on a consensus profile would be a claim that the input is not re-obtainable, which for this profile is false.

**The one thing to get right that is not in §9.5.** The rule matches on the identifier and `nativeId`, **never on the `registry` label** (§9.5, D-108): "a broker that relabels an agent's registry does not change what the ledger recorded." And the identifier comparison runs under both of HCS-14's canonical key orders, normative first, reporting which matched under `observations.agentIdOrder` (§9.1, D-152) — `core/hcs14.ts`'s `matchAgentId` already does exactly this and is what the resolver calls.

**What it must not do.** It must not call the broker. `hol.org/registry/api/v1` is a directory (§9.7), and nothing it returns is an input (P-6). The anchor is read from a mirror node with nothing configured, which is what makes this profile `math` rather than `social-committee`.

## Entities

Filled as each is created. Each row names what made it, what signed it, and the mirror-node read that confirmed it. The probe above is **not** an entity: it keeps nothing, and appears only in its own section.

The eleven rows, their readbacks and their predicates are §8 above; the acceptance test is §9 and the pins are §10. The record itself is `app/deployment/hedera-testnet.json`, which cites the tag `v0.5.2`. The HIP-991 probe’s entities are not deployment entities and appear only in their own section.
