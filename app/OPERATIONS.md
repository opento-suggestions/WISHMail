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

**A mirror node's KEY LIST is decoded here, not by a library.** §7.1 requires a lane's submit key to be "a threshold of the two agents' keys, and MUST NOT include any other key" (T-P17-2), and §11.4 has a Verifier check that from consensus. A mirror node returns a single key as raw hex and a key **list** as `{_type: "ProtobufEncoded", key: "<hex>"}`, so the list has to be decoded before the invariant can be checked at all. The alternatives were both worse. A `TopicInfoQuery` against a consensus node returns the structure already parsed — and it is a **paid query**, so a Verifier would need an account and a balance to check a lane, which is exactly what P-4 forbids. And `@hashgraph/proto`, which ships the generated decoder, is **not in this repository's dependency tree**: it resolves today only from a `node_modules` directory *above* the repository, so importing it would work on this machine and fail on a clean clone — the worst kind of dependency, because it passes here. So it is composed in `app/sdk/protokey.ts`, on the same grounds the seal is: the surface is forty lines, it is a **read** of public data, the wire format is fixed by protobuf itself rather than by a draft, and it cannot fail silently the way a mis-composed cipher can — a wrong parse yields keys that match neither account, which is a loud refusal. `[CC]` **And the first version of it was wrong**, caught by `check:correspondent` before it ever met a lane: protobuf field numbers are per message, not global, so a context-free walker read `ThresholdKey.keys` (field 2) as `Key.ed25519` (also field 2) and handed back the key list's own bytes as though they were a public key. The alternative considered was to skip the decode and check only single-key topics, which would have made T-P17-2 uncheckable for the one topic type it is about.

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
| `.env` (git-ignored) | the three private keys, `OPERATOR_ID`, `HEDERA_NETWORK`, `WISHMAIL_STATE_DIR`, `MCP_BIND`, `MCP_PORT`, an optional `MIRROR_NODE_URL` | secrets, which network, and where things run |
| `app/src/ops/networks.ts` | per-network constants keyed by `HEDERA_NETWORK` — mirror URL, USDC asset, facilitator and its fee payer, rate source, fee caps — **each with its citation** | true of the *network*, not of our deployment on it |
| `spec/pins.json` | §18.4's set: the standards pins, and the stamp token and treasury per network | §4.1 puts the stamp token there, and T-P9-2 gates every claim on it |
| `app/deployment/<network>.json` | every other fact about one deployment | a pin is a fact about a specification version; this is a fact about one deployment of it (D-144) |

`OPERATOR_ID` is the one account id in `.env`, and it belongs there because it is an **input** to provisioning rather than a product of it — the single account this deployment did not create (D-140: reused). Every other entity id is read from the ops record for the selected network, and the token id additionally from `spec/pins.json` per §4.1.

**Removed from `.env` and `.env.example`:** `POSTAGE_TOKEN_ID` and `PRICE_TOPIC_ID` (entity ids, and both held literal placeholder text from an earlier project); the three `AGENT_*_TOPIC_ID` names and `TREASURY_ID`/`AGENT_ID` (entity ids); `HEDERA_RPC_URL`, `POSTAGE_ADDR` and `OPERATOR_EVM_ADDR` (EVM coordinates, and there is no Solidity and no contract in this project); and `OPERATOR_HEX_KEY`, which was a **second encoding of a secret already present** — a duplicate of a private key is strictly worse than useless, since it doubles the surface without adding a capability. `MIRROR_NODE_URL` survives as a blank optional override; its default is now the network table's.

**Added:** `HEDERA_NETWORK`, which `networkConstants()` refuses when it names a network §15.5 leaves undeployed, so selecting `mainnet` stops the run rather than half-provisioning it; and `WISHMAIL_STATE_DIR`, `MCP_BIND`, `MCP_PORT`. `WISHMAIL_STATE_DIR` is §14.2's durable record: D-109 fixes that the MCP server holds the 402 state and accepts only requirements it issued, and T-P11-5 and T-P11-6 test that the state survives a restart — a replayed payload returns the original `StampReceipt` with no second transfer, and requirements issued before a restart are accepted after it. In-memory state fails both tests.

**The names kept the spelling `app/src` already used** (`*_DER_KEY` rather than `*_KEY`), per the ruling that the tiering binds and the spelling does not. The suffix says what the value is — the DER form `PrivateKey.fromStringDer` reads.

**Requested finding: no path in `app/src` reads an entity id from the environment.** The audit is `grep -rE "process\.env|readSecret\(|envHas\(" app/src`, and its whole output is `identity.ts` reading the three `*_DER_KEY` names, `env.ts` reading `OPERATOR_ID`, `HEDERA_NETWORK`, `MIRROR_NODE_URL`, `WISHMAIL_STATE_DIR`, `MCP_BIND` and `MCP_PORT`, and `probe.ts` reading `PROBE_OUT` for its own log path. Entity ids already came from the ops record through `Ctx.tokenId()`, `Ctx.treasuryId()` and `Ctx.agentId()`, so nothing had to move — the ruling ratifies what the code already did rather than correcting it.

**The first `PriceList` is now a committed file**, `app/price-list.hedera-testnet.json`, which the script submits. What the Postmaster charges is reviewable as a document rather than read out of a function. Exactly three fields are filled at run time, because they cannot be known at commit time: `stampToken.tokenId` and `stampToken.treasury` from the ops record, and `methods[].payTo` from `OPERATOR_ID`. They are `null` in the file, and the schema's account-id pattern means a fill that did not happen is caught by validation rather than published. `asset`, `facilitator` and `rate.source` are asserted against `networks.ts` before submission, so the file and the table cannot drift apart unnoticed. The refactor is byte-neutral: the canonical message is the same 563 bytes with the same sha256 `20aa3b01…` as the literal it replaced.

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

**Status: GATED, NOT RUN. NOTHING IS SIGNED.** Written and committed before the first transaction, on the rule the probe and Steps 2, 3 and 4 followed. What follows is what it will create, what it will assert from the mirror, what it writes and where, how it is idempotent, and every way it stops.

**One thing in it is blocked, and it is named here rather than discovered on the day.** The purchase cannot produce a `StampReceipt` that validates against the schema Step 4 froze — ledger **§G-19**, and §6 below has it in full. Everything else in this step is built and green. The block is a specification question and it is Sonic's.

### 0. The parties, and which of them is which

Three human roles and two agents (CLAUDE.md §11). **OPERATOR** is us: treasury, the `$POSTAGE` supply key, the price topic, the Postmaster-agent, and the counter. **C1OPERATOR** and **C2OPERATOR** are the two Correspondents' operators, each bringing a funded testnet wallet. **Correspondent A** and **Correspondent B** are the agents. *The agent signs; the operator pays* (§3.5).

Those three words are **demo labels, not identifiers**. They appear in `app/` as no value, constant, default, enum member or filename; every operator-specific value a Correspondent reads comes from that operator's own configuration file. The repository ships `app/sdk/config.template.json` and never a filled one; `.gitignore` covers a filled home and `npm run p13:check` is what keeps a key out of `app/` regardless — it now watches the Correspondent's field names as well as the Postmaster's environment names.

**The purchases are real sales at sequence 2's prices, and they are the counter's first.** Nothing in the demo is a fixture funded on the side.

### 1. What it creates, in the forced order

Per agent, and D-159 as amended is what forces the order. Nothing may be reordered: the account must exist before it can own a topic, the profile must be final before the topic whose memo is its digest can be created, and the registration must name a registry that exists.

| # | Act | Declared shape | Who signs / who pays | Warrant |
|---|---|---|---|---|
| 0 | **boot** | the agent's ED25519 account key and its epoch-1 X25519 key, born in the agent's own process, into `<home>/keystore.json` | — | D-165: keys are born once; a process that regenerated on boot would make every restart a new agent |
| 1 | **buy_stamp** at the counter | one atomic `TransferTransaction` with three legs: ℏ from the operator to the Postmaster for the price; 12 `$POSTAGE` from the treasury to the agent's **public-key alias**; 0.05 ℏ from the Postmaster to that same alias | buyer signs its own leg in its own process; **the Postmaster is payer** | §14.2 (it cannot be submitted without the Postmaster) · D-159 addendum · HIP-542, probe-observed 2026-09-09 |
| 2 | `doorbell` | HCS-10 inbound, memo `hcs-10:0:60:0:<acct>`, **no submit key**, admin the agent's, HIP-991 fee of 1 `$POSTAGE` to the treasury, the agent's own key exempt | agent signs · operator pays | D-147 row 1 · §4.4 · D-137's exemption · T-P7-4 |
| 3 | `log` | HCS-10 outbound, memo `hcs-10:0:60:1`, submit and admin the agent's | agent · operator | D-147 row 2 |
| 4 | `manifest` | memo `wishmail:manifest:1`, **sole** submit key the agent's | agent · operator | §9.1 · T-P17-3 |
| 5 | `declRegistry` | HCS-2, memo `hcs-2:0:60` — **indexed 0** | agent · operator | D-147 row 5 · T-P8-3 |
| 6 | `profileFile` | HCS-1, memo `<sha256 of the plaintext>:brotli:base64`, submit the agent's, **NO admin key** | agent · operator | D-150 · `hcs-1.md:48-49` |
| 7 | `profileChunks` | the HCS-11 profile as HCS-1 `{o, c}` chunks, each bounded as a **whole message** at 1024 | agent · operator | `ops/hcs1.ts`, and the Step 4 defect is why |
| 8 | `registryEntry` | `{p: "hcs-2", op: "register", t_id: <profileFile>}`, transaction memo `hcs-2:op:register:0` | agent · operator | §H:359 |
| 9 | `accountMemo` | `hcs-11:hcs://2/<declRegistry>` | agent · operator | §9.2:1284's MUST |
| 10 | `holRegistration` | `{p, op, account_id, uaid, t_id, m}` on the anchor `0.0.6913983`, **no transaction memo** | **agent signs AND pays** | §4.6 · D-164 · T-P13-4 |

Rows 2–9 are one act — `generate_mailbox` — and row 10 is `register_agent`. Both are **§4.6 affordances and not among §6.1's six** (D-159): no conformance class is tested against either, no claim names them, and a Correspondent that brought its own topics would call neither. They live on the Correspondent's MCP because the topics are the agent's and the agent signs each one.

**Row 10 is the one place an agent pays.** "An agent's account never holds ℏ, with one exception" — this is it, and it is why the purchase funds exactly one fee and no more (§3.9: funding is a payment and not a party). The payer seam is deliberately *not* used: the whole value of the act is that the mirror records **this account** as the payer, and a borrowed payer would put `blurred` on every `hol` resolution of this agent forever.

**One act is not in the table because it is not always needed.** `generate_mailbox` associates the OPERATOR's account with `$POSTAGE` on first run if it is not already, paid by the operator. §4.4's doorbell fee is debited from the **payer** of the submission (HIP-991), so when the operator pays for the agent's connection request the stamp leaves the operator's account — which means the operator must be able to hold one (D-157). The agent's own account needs no association: HIP-542 creates it with unlimited auto-associations, which the probe observed, so the stamp transfer associates it as it arrives. The config template says so.

### 2. What it asserts, and what it reads back

Every readback is a mirror-node REST read with a **named predicate**, never an SDK receipt.

**Per topic**, against the shape it was created under: the memo; the submit key, or its absence; the admin key, or its **null**; a null fee-schedule key; the auto-renew account; the custom-fee list — one fixed fee of one unit of the pinned token to the treasury on the doorbell, and **zero fees** on every other row; and the fee-exempt key list. The declared shape and the asserted shape are **one object**, from `src/ops/template.ts`, so a row cannot be created under one description and checked against another.

**The template is now one spelling for both provisioners.** `ops/steps.ts` stands up the Postmaster's own agent with these six rows and `sdk/mailbox.ts` stands up a Correspondent with them, and they read the same functions. That is the `hcs1File` lesson applied before it costs anything: two provisioners that agreed about a doorbell's fee today and disagreed about its exempt list tomorrow would be the same failure with a permanent artefact at the end of it.

**Per purchase**: the transfer reads back SUCCESS from the mirror; the `$POSTAGE` credit names an account; that account is the one the agent's key owns, found by `GET /accounts?account.publickey=…` and refused if two exist under one key; and the receipt validates against the **registered** `StampReceipt` schema before it is returned.

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

- `buy_stamp` with `provision` is not attempted where an account already exists under the agent's key; a returning agent buys without it.
- `generate_mailbox` resolves the agent's own address under `hcs14` **first**. Coordinates come back → it creates nothing and says so.
- `register_agent` reads the anchor **first**. A registration by this account → nothing.
- the doorbell watcher derives what is answered by reading the doorbell: every `connection_created` names the `connection_id` of the request it answered, so a restart re-derives it and answers nothing twice.

**It stops, before or instead of signing, on every one of these:**

1. the home's config is missing any field, or names `hedera:mainnet`, which §15.5 leaves undeployed;
2. **§G-19** — a `provision: true` purchase, refused before anything is signed, because §5.4 requires two fields this purchase cannot name;
3. the price topic carries no message, or the method asked for is not on the current one (§14.3 forbids charging under an unpublished price);
4. the quote has expired, or its reference has already settled a purchase (T-P11-5);
5. two accounts on this ledger are owned by the agent's key — refusing to choose, because choosing wrongly strands one;
6. any topic's readback disagrees with the shape it was created under, in any field;
7. the profile file topic already holds messages this run did not write — an HCS-1 topic has no admin key, so nothing there can be corrected;
8. a chunk would exceed 1024 bytes **on the wire**, wrapper included;
9. the declaration this run wrote does not resolve under §9.2, or resolves to coordinates this run did not create;
10. the registration's payer on the mirror is not this agent's account;
11. either agent resolves under `hol` **with `blurred`**;
12. the receipt does not validate against the registered `StampReceipt` schema.

**A refusal leaves no mark** (§3.5): every refusal above happens before a submission, except (10) and (12), which are reported with what did land because a transfer on consensus cannot be withdrawn.

### 5. What is built, and what is checked before the gate

Built: `app/sdk/` — the home directory and its record, the keystore, the live `Consensus` over a mirror node and the payer seam, the counter client, `generate_mailbox`, `register_agent`, the doorbell watcher, the stdio MCP server, and the provisioning driver. `app/src/counter/` — §14.3's pricing read from consensus, the three-legged purchase, and the Streamable HTTP MCP server serving `buy_stamp`, `verify` and `resolve`. `app/src/resolve/hol.ts` — §9.5's rule, which Gate One needs because "resolve self under `hol`" is step 5 of the order.

`npm run check:correspondent` is **52 assertions with no network and no key**: D-147's six rows from the one template; a mirror-node key list decoded so §7.1's threshold lane can be checked at all; §14.3's arithmetic in integers with bundles at exactly their count; the §G-19 refusal read out of the registered schema; one sentence template that implies no delivery and no receipt; the doorbell rule over messages alone; and a home directory that is the agent — keys born once, loaded ever after.

The rest of the battery is unchanged and green: typecheck, `p13:check`, `check:register` (86 both ways), `check:schemas`, `check:vectors`, `check:seal`, `check:hcs14`, `check:chunk`, `check:envelope`, `check:hcs10`, `check:store`, `check:mcp`, `check:letter`, `check:prefreeze`, `check:freeze`.

### 6. §G-19 — the one thing that blocks the purchase, in full

§5.4 gives `provisioning? {price, registrationFee?, account, doorbell, log?, manifestTopic, declRegistry?, profileFile?}` and the registered schema makes `price`, `account`, `doorbell` and `manifestTopic` **required**. §5.4's own sentence says why: "the fields after it are the entities **the Postmaster created for the holder**". §6.3's postcondition is a receipt "carrying a `provisioning` line **exactly when** `provision` was true".

Under D-159 as amended the Postmaster creates exactly one entity for the holder — the account. The doorbell and the manifest topic are the **agent's**, created afterwards, by the agent, under the agent's own key. So a receipt that carries the line fails its own schema, and a receipt that omits it contradicts §6.3 and drops `registrationFee` — the field D-159's addendum added precisely so that a Verifier sees the fee "as a leg of the purchase and not as a gift". §14.3 closes the third door: the 2 ℏ cannot be charged with `provision` false, because that price is published under `provisioning` and a Postmaster may not charge under a price it has not published.

**The code refuses rather than choosing.** `counter/purchase.ts` reads the required list out of `spec/schemas/stamp-receipt.schema.json` and refuses a `provision: true` purchase **before anything is signed**; a `provision: false` purchase works in full. Because the gate reads the schema, a 0.6 that changes it lifts the refusal by itself.

**Two candidates, and they differ in whether a minor version is needed.** **(a)** The Postmaster provisions the topics after all — §4.6's provisioned path taken literally, the Postmaster paying and the agent signing each topic creation over the counter, exactly as Steps 2 and 3 already do for the Postmaster's own agent. **No schema moves**; `buy_stamp` becomes a multi-round-trip agent-signed exchange and CLAUDE.md §11's placement of `generate_mailbox` is amended. **(b)** `doorbell` and `manifestTopic` become optional inside `provisioning`, present exactly where the Postmaster created them — **a change to a registered schema, so 0.6 and not a patch**, on fourteen files that are now frozen on consensus. Smaller change to the text, larger to the version. Ledger §G-19 carries both.

### 7. What Gate Two owes, and is not in this step

`send`, `inbox` and `ack` refuse on the Correspondent's MCP, naming Gate Two. They are built and exercised end to end against the modelled ledger (`npm run check:letter`, 63 assertions) and what they still need is the live wiring and a letter to carry. §10.4's scheduled return receipt is still unimplemented and `send` still refuses `returnReceipt` outright, for the reason Step 6 gives: postage that pays for a receipt nobody was asked for is an artefact on consensus that cannot be withdrawn.

### 8. Expected output until it is signed

```
npm run correspondent:provision -- <home> --dry-run
  reads consensus, prints what exists and what step 1 would create, and submits nothing
```

Two funded testnet wallets and two filled home directories are what this step waits on, beside §G-19 and Sonic's word.

## Step 6 — the first letter: GATE TWO, written before any signature

**Renumbered 2026-09-09.** This was Step 5 when the letter was the next thing to sign. Two Correspondents provisioned through the counter now stand before it as Gate One, so this is Step 6 and the letter is Gate Two. **§1 below is superseded in one respect and left standing as the record of what was planned**: the "fixture" it describes is the Correspondent of Step 5, its account is BOUGHT rather than funded (D-159 as amended), and its provisioning is that step's, not this one's. Rows 9-11 — the lane, the settlement, the chunks — are still this step's and are unchanged.

**Status: GATED, NOT RUN.** Nothing in this section has been submitted. Written and committed before the first transaction, on the rule the probe, Step 2 and Step 3 followed.

### 0. `send` before implementation — actors, I/O, invariants, failure modes

**Actors** (§3). The **Correspondent** is a second process: it holds its own keys, resolves, seals, affixes its own postage and signs its own submissions. The **Postmaster** pays and carries; it holds no key of the Correspondent's and attests nothing (§3.5, P-2). The **Recipient** here is the Postmaster-agent `0.0.10426206` — a Correspondent peer, not a spec role (D-140). **Consensus** produces the postmark; nothing else does. The **Verifier** is anyone, configured with nothing.

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

**The Correspondent fixture is a second OS process**, under `app/sdk/`, with its own working directory, its own `.env` from the four-variable example already committed there, and its keys born in that process. Nothing it holds is written anywhere the Postmaster reads: the Postmaster's `.env`, `app/deployment/hedera-testnet.json` and `spec/pins.json` are all outside its reach, and its own state directory is its own.

It reaches the Postmaster **only through the MCP server over Streamable HTTP**. That transport does not exist yet and lands in this step; §14.2 already fixes that the MCP server is the resource server and a page is a client of it, so the shape is not a choice.

| # | Entity | Declared shape | Warrant |
|---|---|---|---|
| 1 | `fixture.account` | ED25519 born **in the fixture's process**, funded by the Postmaster | §4.6's provisioned path: "it generates its keys in its own process, submits their public halves, and the Postmaster pays to create the account" |
| 2 | `fixture.doorbell` | HCS-10 inbound, memo `hcs-10:0:60:0:<acct>`, no submit key, admin the fixture's, HIP-991 fee of 1 `$POSTAGE` to the treasury, exempt list the fixture's key | D-147 row 1, §4.4 |
| 3 | `fixture.log` | HCS-10 outbound, memo `hcs-10:0:60:1`, submit and admin the fixture's | D-147 row 2 |
| 4 | `fixture.manifest` | memo `wishmail:manifest:1`, sole submit key the fixture's | §9.1, T-P17-3 |
| 5 | `fixture.declRegistry` | HCS-2, memo `hcs-2:0:60`, submit and admin the fixture's | D-147 row 5 |
| 6 | `fixture.profileFile` | HCS-1, memo `<sha256>:brotli:base64`, submit the fixture's, **no admin key** | D-150 |
| 7 | `fixture.profileChunks`, `fixture.registryEntry`, `fixture.accountMemo` | as Step 3 | §9.2:1284 |
| 8 | `fixture.funding` | a treasury transfer of `$POSTAGE` to the fixture, **recorded as fixture funding and not a sale** | `buy_stamp` is Step 6; the record says which act this was, because a receipt nobody bought would be a lie about §6.3 |
| 9 | `letter.lane` | the HCS-10 connection topic, submit key a threshold of **exactly** the two agents' keys | §7.1, T-P17-2 |
| 10 | `letter.settlement` | the affixing transfer, memo `wishmail:` + `aadHash` | §4.3, P-7 |
| 11 | `letter.chunks` | the HCS-10 `message` operations | §7.4, P-9 |

Every submission the fixture owns — its `connection_created`, its side of the lane, its declaration, its settlement, its chunks — is **signed in the fixture's process**. The Postmaster pays, as §4.6 allows, and signs nothing of the agent's.

### 2. What it asserts

**Before the letter**: the fixture's declaration resolves under `hcs14` through the Postmaster's own `resolve`, from a mirror node, returning `trustClass: math` and `endorsements: []` — and the Postmaster-agent's declaration resolves for the fixture, because a letter needs both ends findable.

**The first contact**: a `connection_request` on the recipient's doorbell whose HIP-991 fee assesses exactly **one** `$POSTAGE` to the treasury (T-P7-4); a `connection_created` **submitted by the fixture's process**; and a lane whose `submit_key` is a threshold of exactly two keys, and those two (T-P17-2), with no custom fee (T-P11-3).

**The affix**: one settlement, `to` the treasury, `amount` equal to the envelope's weight, `memo` exactly `wishmail:<aadHash>`, and a consensus timestamp **strictly earlier** than chunk 0's (T-P7-1). And the fourth weld: every chunk's `operator_id` names the settlement's `from` account (T-P1-6).

**The submission**: every message ≤1000 bytes, **no `chunkInfo`**, `data` parsing as a Chunk (T-P9-7); the transaction memo `hcs-10:op:6:3` that HCS-10's table gives a `message` on a connection topic — operation 6, topic type 3 (T-P9-5).

**The readers, on what `send` produced.** `inbox` reassembles by the chain, rebuilds the AAD from the header and the lane, checks it against `id`, fetches the settlement and checks memo and amount, and decrypts — and the payload comes back byte-identical. `verify` replays **from the mirror with no key, stamp, account or broker configured** (T-P4-1) and emits an `EvidenceBundle` whose digest is stable across two runs, plus a `Narrative` whose `bundleDigest` equals it (T-P3-4).

**And every refusal the readers owe**, against an altered copy of what was actually sent: a changed header, a wrong lane, a swapped resolution proof, a settlement memo that is not the identifier, an `operator_id` that is not the settlement's `from`, a `ke` that is not the epoch the resolution yielded, and a broken `nx` link. Each must come back unopened with the reason §6.5 names, and none may be a tool failure (P-12).

### 3. What it writes, and where

`spec/pins.json` is **not touched**. `app/deployment/hedera-testnet.json` takes the fixture's rows and the letter's, each citing its `specTag`; the fixture's own record is under its own working directory. Fixtures captured from the run — the lane's messages, the settlement, the postmarks, the manifest — go to `conformance/fixtures/`, and the tests expanded in this step read those files with no network (P-4).

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

`send`, `inbox` and `verify` are built and run end to end — against `app/src/tools/memory.ts`, a modelled ledger that enforces the four things the network enforces and this step depends on: a topic with a submit key refuses any other key, a topic with a HIP-991 fee assesses it to the collector unless the submitter is exempt, a transfer fails on a short balance, and consensus order is total. `npm run check:letter` is 60 assertions over one letter: resolved, rung through a fee-gated doorbell, answered, stamped, sealed, chunked, posted; opened by `inbox` byte for byte; reconciled by `verify` into a bundle two Verifiers agree on and a narrative carrying its digest; the bundle, the narrative, the envelope and the settlement each validated against their registered schemas; a slip where no door answered; and the seven alterations of §7 refused on consensus rather than in memory.

**The letter appraises `unverified`, with the single reason T-P9-3.** The schema registry is built and unsigned (§Step 4), so no `schemaRef` resolves, and §11.4 appraises a resolution whose `schemaRef` does not resolve as unverified. That is the true statement about this build and it holds until Step 4 is signed. It is worth saying plainly because it is the shape of a Verifier that cannot be talked into a better answer.

**Two things this step refuses rather than skips.** §6.4's step 7, the scheduled return receipt, is not implemented: postage would include the receipt fee and chunk 0's header would request it, so an envelope assembled without §10.4's schedule is one whose sender paid for a receipt nobody was asked for — an artefact that is wrong on consensus and cannot be withdrawn. `send` therefore refuses `returnReceipt` outright. And who submits the first-contact connection request is **parameterised, not decided**: ledger §G-14 states both readings, the code takes the sender-submits one by default, and `SenderContext.ringer` takes §6.4's literal one.

**What the step owed, and what of it is now built (2026-09-09).** The Streamable HTTP transport: **built**, and it is the counter (`app/src/counter/server.ts`). The second-process Correspondent under `app/sdk/` with keys born in its own process: **built**, and its home directory is its identity (D-165) rather than a `.env`. Its provisioning: **Step 5**, and it is a **real sale at sequence 2's prices** rather than funding on the side — the account is bought, not funded, which is D-159 as amended and the reason this section's §1 row 8 no longer describes what happens. What remains this step's: `send`, `inbox` and `ack` wired to the live `Consensus` rather than the modelled one; §10.4's schedule, which `send` still refuses; the letter itself on `hedera:testnet`; `verify` run from a third, empty home; the second letter on the same lane, ringing nothing; and the fixture capture and T-ID expansions keyed to that run. STATUS.md §6 carries the same list with what each blocks.

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

**Where the runner is.** `app/src/ops/probe542.ts`, `npm run probe:542` inside `app/`. It writes its raw observations to `probe542-observations.json` and its findings here.

---

## The HIP-542 probe — the run of record, 2026-09-09

**Run and answered. Both questions are yes, and the second is the one D-159 rests on.** `npm run probe:542`, five transactions, four mirror reads, **9 of 9 predicates held**. Every predicate below was read from the mirror node and none from an SDK receipt. The raw JSON for each read is in `probe542-observations.json` (gitignored, as the 09-08 probe's was); what it establishes is here.

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
