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

**RULED 2026-09-10 (Sonic), and the record above is left exactly as it stood.** The 150 ℏ is **intentional operator
funding of a test deployment** — C1OPERATOR's own money into C1OPERATOR's own agent — and it is neither a sale, nor a
gift from the Postmaster, nor a departure. **The invariant was mis-stated as the agent's and it is the Postmaster's:
the Postmaster never funds an agent's account beyond the single registration fee.** What an operator puts into its own
agent is that operator's affair. Nothing on consensus changes and nothing is repriced; §4.4 and §9.5 still turn on who
*pays for the registration*, settled at anchor sequence 382. `CLAUDE.md` §11 carries the amended sentence; the two
earlier phrasings — "an agent's account never holds ℏ, with one exception" in §1 row 11 above and "the agent holds ℏ
once … and never again" — stand where they are as the record of what was believed on the day.

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
| **the ring** (`connection_request`) | the ring landed and the answer is not yet visible | **a rerun waits, and spends nothing.** Before ringing, `send` reads B's doorbell from consensus for a `connection_request` whose `operator_id` is this agent's and which no `connection_created` answers. Finding one, it waits on it — polling for the lane — instead of ringing again |
| **the ring**, stale | a standing request older than the whole window, and no lane | **it becomes a slip, which is §10.5's own remedy and costs nothing.** The attempts run out against the standing request, `send` publishes the slip's manifest on the sender's manifest topic and returns the slip. It does **not** ring again |
| **the settlement** | postage may be consumed with no envelope on the lane | **NEVER retried blindly** (P-7). The settlement is found from consensus by its memo — `wishmail:<id>` names the envelope — and re-used. A second transfer under the same memo would be a second settlement for one envelope, which T-P7-2 exists to reject |
| **the chunks** | some may be on the lane and some not | resubmittable against the **same** settlement (D-52). The chain is walked from the header, so a reader takes the earliest chunk the chain admits (T-P3-3) and a partial envelope is `INBOX_INCOMPLETE` rather than a wrong one |

**The rule for all four is the one Gate One taught and the a2 run re-taught: read the mirror first, and the process's
own output second.** If anything stops, report what is true at the stop and wait. Do not repair.

### 8a. The window, as composed — and why a retry is a re-read

**RECORD, Sonic 2026-09-10.** The first-contact window folds in mirror-node lag, and on testnet that lag is real:
two of Gate One's eight defects were a read that came back empty once and was believed — the account index after a
transfer, and the anchor at 381 messages. So the window is composed as **attempts**:

```
  30 seconds per attempt · up to two retries · 90 seconds in all
  within an attempt, "answered" is read by POLLING, never by a single read
  A RETRY IS A RE-READ AND NEVER A RE-RING
```

**The doorbell is rung once per first contact.** Every attempt after the first only widens how long the sender
watches. A second ring would consume a second stamp at the treasury, give B's watcher a second request to answer, and
leave §7.1 choosing between two lanes.

**No double-ring, ever, and it is OUR thrift rather than the specification's requirement — say so.** §10.5 is
explicit the other way: *"A sender that rings again produces a new request, and, if unanswered, a new slip; each is
its own record."* Ringing twice is **conformant**. What this deployment does is read first anyway, because a second
ring spends a stamp to learn something a read would have told it. Before ringing, `send` reads B's doorbell from
consensus for a `connection_request` whose HCS-10 `operator_id` is this agent's — `inboundTopicId@accountId` — and
which no `connection_created` answers. **Consensus first, then the home's store** (D-165): a wiped local file must not
be able to cause a second ring.

**The attempt count and the outcome are reported** in the result's text block, per D-162's one-template convention —
goose renders the final card and not `notifications/progress` — and in the Correspondent's own log live.

**And this now has an offline court, which it did not before.** `tools/memory.ts` gained an ingestion-lag knob: a
topic's newest message can be withheld from the next N reads, which is exactly what a mirror node does and the one
thing consensus-as-a-data-structure could not model. `npm run check:letter` is **69 assertions**, up from 63, and the
six it gained are: a lagged `connection_created` is found by looking again rather than by ringing again; the doorbell
was rung **exactly once** across every attempt; a standing unanswered request is waited on by a second `send`, which
finds it on consensus, spends no second stamp at the door, and still leaves exactly one request on the doorbell.
**This is the class of defect no offline check had reached until now.**

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

**The envelope identifier above is a composition at dry-run time, and it will NOT be the one on consensus.** §7.2
requires a fresh nonce for every envelope and §7.3 a fresh ephemeral key, so the live run seals again and reaches a
different `id` — and the settlement memo, which is `wishmail:` plus that id, differs with it. **Its absence from the
ledger is not a defect and nobody should go looking for it.** What the dry run fixed is the shape: the weight, the
postage, the chunk count, and that the memo is the identifier and nothing else.

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
## Step 6 — CHECKPOINT ONE: THE RUN OF RECORD, 2026-09-10

**One plain certified letter travelled from A2 to B on `hedera:testnet`, B opened it byte for byte, and a stranger
holding nothing reconstructed it from consensus alone.** The gate report above is what was promised; this is what
happened, and the report is left exactly as it stood. Nothing below is reconstructed: every id was read from a mirror
node **before** the process's own output was read, which is the rule Gate One and the a2 run both taught.

Authorised by Sonic, 2026-09-10 evening, against the gate report at commit `2821470`. **It completed in one pass with
no stop.**

### The arrangement, as it ran

```
  the counter        NOT STARTED. Nothing here buys anything.
  B's process        npm run correspondent -- <b home>, up first and left up.
                     Its doorbell watcher armed before the banner printed.
  A2's driver        npm run letter -- <a2 home> --to 0.0.10452127 --live
  the stranger       npm run verify -- --lane 0.0.10464056, from a directory
                     holding nothing at all.
```

### What was signed, in order

| # | Act | Transaction | Consensus | Payer |
|---|---|---|---|---|
| 1 | one stamp to the payer (§4.4's first hop) | `0.0.10450879@1789064908.370570359` | — | `0.0.10450879` |
| 2 | `connection_request` on B's doorbell | `0.0.10450879-1789064908-008543399` | `1789064914.951353025` | `0.0.10450879` |
| 3 | `connection_created`, B's answer | — | `1789064925.372200222` | **`0.0.10450880`** |
| 4 | the lane topic | — | `1789064923.250107307` | `0.0.10450880` |
| 5 | the resolution manifest on A2's manifest topic | — | `1789064928.078590104` | `0.0.10450879` |
| 6 | the settlement | `0.0.10450879@1789064924.136455588` | `1789064932.591585104` | `0.0.10450879` |
| 7 | chunk 0 on the lane | `0.0.10450879-1789064930-720301282` | `1789064935.243142061` | `0.0.10450879` |

```
lane        0.0.10464056
envelope    cd9dc8f41d3fa8580185652b68c960045d3961b7f83af441dc6e190d093ab0e2
manifest    0.0.10462713 #1
```

### Every assertion the gate report owed, from the mirror

**The ring, and the fee it assessed.** The `connection_request` is sequence 1 on B's doorbell `0.0.10452149`, body
`{"p":"hcs-10","op":"connection_request","operator_id":"0.0.10462704@0.0.10462700"}`. Its transaction assessed

```
TOKEN 0.0.10426208   0.0.10450879  -1
TOKEN 0.0.10426208   0.0.10426205  +1
```

**Exactly one stamp, in the pinned stamp token, collected by the treasury, debited from the transaction payer** —
T-P7-4 on consensus, and §4.4's sentence about the payer demonstrated rather than quoted. The two-hop worked: A2 moved
one stamp to `0.0.10450879` first, and no association transaction was needed.

**B's answer.** Sequence 2 on the same doorbell, `connection_created` naming `connection_topic_id 0.0.10464056`,
`connected_account_id 0.0.10462700`, `connection_id 1`, **paid by `0.0.10450880`** — B's own operator, signed in B's
own process. The Postmaster is not on this page anywhere.

**The lane.**

```
memo         hcs-10:1:60:2:0.0.10452149:1
submit_key   ThresholdKey, threshold 1, over EXACTLY two keys:
               d94b7e7d8f051d32…  A2's agent key
               0bf6f35094412d8c…  B's agent key
admin_key    0bf6f35094412d8c…
custom_fees  fixed_fees: []        ← no custom fee (T-P11-3)
```

**Exactly the two agents' keys and nobody else's** (T-P17-2). The threshold is 1 because either party may post to a
lane and neither needs the other's signature to write a letter; the "exactly two" is what the test is about.

**The affix.**

```
settlement   0.0.10450879@1789064924.136455588
memo         wishmail:cd9dc8f41d3fa8580185652b68c960045d3961b7f83af441dc6e190d093ab0e2
TOKEN        0.0.10426208   0.0.10462700 -1   →   0.0.10426205 +1
consensus    1789064932.591585104
```

The memo is the identifier and nothing else. **It precedes chunk 0 by 2.65 seconds** — strictly earlier, T-P7-1.

**The submission.**

```
chunk 0      806 bytes on the wire      ← at or under CHUNK_WIRE_MAX 1000
chunk_info   null                       ← NO transport chunking (T-P9-7)
memo         hcs-10:op:6:3              ← operation 6, topic type 3 (T-P9-5)
operator_id  0.0.10462704@0.0.10462700  ← names the settlement's `from` (T-P1-6)
```

**`chunk_info: null` is the base-class freeze override of §5 confirmed on consensus for the first time.** Step 6 §5
promised that the first chunk on the ledger would be the confirmation, and if the mirror showed `chunk_info` the step
would stop there. It does not.

**The manifest** is message 1 on `0.0.10462713`, 737 bytes, at `1789064928.078590104` — **before chunk 0**, which is
what §11.4 requires of a resolution proof's postmark.

### `inbox` at B — the letter opened

```
inbox — 0.0.10452127, home b
lanes  0.0.10464056   — from consensus, by §7.1's rule

envelope   cd9dc8f41d3fa8580185652b68c960045d3961b7f83af441dc6e190d093ab0e2
opened     true
payload    "Certified mail for agents, on Hedera. Checkpoint one."
bytes      53

1 delivery(ies). inbox wrote nothing (§6.5).
```

**Byte-identical to what was sent.** B found the lane from consensus rather than from any local file, reassembled by
the chain, rebuilt the AAD from the header and the lane, checked it against `id`, fetched the settlement and checked
its memo and amount, and decrypted under epoch 1. **And it wrote nothing** — reading a lane leaves no mark on it
(D-29).

### `verify` from a stranger holding nothing

```
verify — configured with NOTHING (P-4)
mirror   https://testnet.mirrornode.hedera.com/api/v1
scope    lane 0.0.10464056
holding  no key · no account · no stamp · no counter · no home

bundle digest   8d30dfdc4c58d6b283189dc08257f4f5bce76577efa89a50dd59fb8279255fe6
correspondence  1 envelope(s)
  state         SETTLED
  APPRAISED     unverified
  reasons       T-P12-4
  DECLARED      trust class math · 0 endorsement(s)
  receipt       none

narrative.bundleDigest  8d30dfdc…   matches the bundle: true
```

**NOTE ADDED 2026-09-10, after the run and beside its own number (D-173).** The digest above reproduces from a
checkout at tag **`v0.5.10`**, and from no later one. It was computed when the evidence bundle carried the
release's full patch version in `spec`; **D-173 makes that field the MINOR version — `0.5` — and moves the
Verifier's own patch to `observations.verifierSpec`, outside the digest.** So a reader who clones HEAD and runs
`npm run verify` over these captured bytes today gets a DIFFERENT digest, and that is
the fix rather than a discrepancy: two Verifiers at two patches of 0.5 now agree, which is what §11.7 and T-P3-1
ask for and what this number could never have given. **The number is not rewritten.** It is what the network
produced that day, `conformance/fixtures/` still carries it, and `8d30dfdc…` is proved
against those captured bytes on every run of the battery — by substituting the spec string of the day and
requiring EXACT equality, which proves every other byte of the evidence unchanged. **A run against the LIVE lane
differs for a second and ordinary reason too**: lane `0.0.10464056` has carried letters since, and a bundle is
over the scope and window it was asked for — which is why a fixture, and not a live re-run, is what reproduces a
recorded digest.

**Run twice: the same digest both times** (T-P3-1), and the narrative carries it (T-P3-4). This is the second of
WISHMail's two claims, and it is the first time it has been anything but a design intention: **a correspondence
reconstructed from public consensus data by someone with no key, no account, no stamp and no credential.**

**NOTE ADDED 2026-09-10, beside the citation it corrects.** The `(T-P3-1)` on the line above **over-claims, and
the `(T-P3-4)` beside it is right.** §A gives T-P3-1 as replay *by a fresh Verifier at a different patch revision of
the same minor version, at a different time and through a different mirror node than the reference Postmaster's*,
equal byte for byte. Running THIS implementation twice, at one patch, through one mirror, shows the replay is
**deterministic** — which T-P3-1 presupposes and is not satisfied by. **This deployment does not discharge T-P3-1,
because it has one implementation and that test compares two.** T-P3-4 — every narrative's `bundleDigest` equals
the digest of the bundle it was produced from — is discharged here exactly as written. The run above is not
rewritten; what it measured is what it measured, and this says what that measurement is worth.

### The appraisal against the prediction

**The gate report predicted `unverified`, with the reason being the profile-not-claimed row, and that is what came
back.** The prediction named the row's two test ids, **T-P6-1 / T-P12-4**; the Verifier reported **T-P12-4** alone,
which is the narrower and more precise of the two and the one §9.6's own sentence names. The substance — *this release
claims no profile, so it does not replay, so the resolution is unverified* — is exactly right, and the run confirmed a
prediction rather than producing a surprise. **T-P9-3 did not fire**, which is Step 4's signing showing up in an
appraisal for the first time.

The declared trust class came back `math` with no endorsements, reported beside the standing and not folded into it —
P-12's "a Verifier does not raise a trust class", visible.

### The fixture, and the alterations offline

`conformance/fixtures/checkpoint-one-letter.json` holds the correspondence as the mirror returned it: the lane's
messages, the manifest topic, **the HCS-13 registry and the HCS-1 schema file**, the settlement, the topic records,
and the account memos and keys the bundle touched. `npm run check:captured` appraises it **with no network** and
reaches the same standing and **the same bundle digest** the network produced.

**Six of the seven alterations drive the standing strictly lower**: a changed `id`; the same chunk read on another
topic; a swapped `hdr.rp.h`; a settlement memo that is not the identifier; an `operator_id` that is not the
settlement's `from`; and a `hdr.h` the slices do not hash to. None is a tool failure — every one is an appraisal
(P-12).

**The seventh could not be caught, and that is a finding rather than a gap.** §11.5's ladder has `hdr.ke equals the
coordinates' keyEpoch` yielding unbound (T-P1-10), but §11.4 says it is compared against *the coordinates the
resolution yielded* — and this release does not replay, because it claims no profile. So an altered epoch passes
unnoticed. It is recorded as a passing assertion that says so. **Claiming `hcs14` therefore buys more than a higher
standing: it turns on a binding check that is dark today**, and that belongs beside §11's derivation in the gate
report.

### Divergences, brought rather than coded around

**The lane, the settlement and the chunks are NOT in A2's home record.** §3 of the gate report says they would be.
`CorrespondentKey` in `sdk/home.ts` is a closed union of the eleven provisioning keys with no room for a lane, so
`record.put` cannot name one. Nothing is lost — all three are on consensus and the fixture holds them — but
`ENTITIES.md` shows A2's mailbox and not its correspondence, and the gate report's §3 overstated what would be
written. Left as it is rather than widened mid-run.

**The seventh alteration is a substitute.** §11.3's chain walks chunk 0 by its header and each later chunk by the
prior's `nx`. **This letter is one chunk** — 53 bytes of payload fit in a single HCS message — so there is no `nx` to
break, and the seventh alteration exercises the other half of the same walk instead. **T-P1-11 still owes a
multi-chunk fixture**, and checkpoint one did not produce one.

**Three new CLIs were written during the run**, because the gate report named `inbox` and `verify` as parts of the
checkpoint and neither had a driver: `sdk/inbox.cli.ts`, `sdk/verify.cli.ts` and `sdk/capture.cli.ts`. **None of them
takes a mode flag and none of them can sign** — `inbox` writes nothing by §6.5, and `verify` and `capture` hold a
`Reader`, which is a type that cannot write. That is why they are exempt from CLAUDE.md §12's rule rather than
forgetful of it.

**The Correspondent MCP server is a signing surface with no dry-run mode**, and it stayed that way for this run. Its
watcher answers doors, which is the agent's ordinary business rather than a one-shot spend, and a server has no plan
mode to default to. Named here so the exemption is a decision and not an oversight.

---
## Step 6 — CHECKPOINT TWO: the certified letter, the receipt, the reply. Gate report, written 2026-09-10 before any signature

**NOTHING IS SIGNED.** Checkpoint one put a plain letter on the lane `0.0.10464056` and a stranger reconstructed it
from consensus alone. **Checkpoint two is the parts checkpoint one said it did not do**: §10.4's scheduled return
receipt, `ack`, and a second letter A2 → B carrying the receipt — ringing nothing, which is §7.1's proof and the
receipt in one act.

**One item of it is HELD AT THE GATE and it is the reply.** The plain reply B → A2 cannot be sent on the lane the two
agents share without contradicting §7.1's own MUST, and cannot be sent anywhere else without ringing a doorbell the
ruling says to ring nothing at. That is **ledger §G-21**, found by the dry run before any signature and confirmed from
the mirror; §11 below is the whole of it. Items (a) through (d) of the ruling are unaffected, conformant, and are what
this report gates.

### 1. The parties, and who pays for what

| | |
|---|---|
| **sender** | **A2**, account `0.0.10462700`, home `a2` — doorbell `0.0.10462704`, log `0.0.10462708`, manifest `0.0.10462713` |
| **recipient** | **Correspondent B**, account `0.0.10452127` — doorbell `0.0.10452149`, manifest `0.0.10452154` |
| **stranger** | a THIRD home with nothing in it: no key, no account, no stamp, no counter (P-4) |
| **the counter** | **NOT STARTED.** The quote is three stamps and A2 holds ten; nothing is bought |
| **Postmaster** | **not a party.** It sold both mailboxes and it carries nothing here |

| Submission | Signs | Pays |
|---|---|---|
| the resolution manifest on A2's manifest topic | A2 | `0.0.10450879` |
| the settlement — three stamps to the treasury | A2 | `0.0.10450879` |
| every chunk on the lane (ten of them) | A2 | `0.0.10450879` |
| the **ScheduleCreate** of §10.4 | `0.0.10450879` | `0.0.10450879` |
| the `transaction` operation on the lane | A2 | `0.0.10450879` |
| the **ScheduleSign** — `ack` | **B** | **`0.0.10450880`** |
| the schedule's **inner** submission, when it executes | B, by the ScheduleSign | **`0.0.10450879`** |

**The schedule's payer is A2's operator wallet `0.0.10450879`** — D-157 over D-47, ruled 2026-09-10. §10.4 makes it
"the payer designated by the sender" and its parenthetical names the Postmaster on D-47; D-157 is later and wider, and
Postmaster-pays carry outside `buy_stamp` is deferred this window (CLAUDE.md §11, L-5). **It is never the recipient**,
and that is refused in two places rather than assumed: `send` refuses to build the schedule at all if the payer is the
recipient, and `ack` refuses to sign one whose record names the recipient as payer (T-P16-2).

**WHO SIGNS THE ScheduleCreate, and why it is not the agent.** A ScheduleCreate's signatures are offered to the *inner*
transaction's required keys, and the inner transaction requires exactly two: B's, because the manifest goes to a topic
only B's key can write to, and the inner payer's. A2's agent key is required by neither, so adding it would put a
signature on the schedule's record that stands for nothing and makes T-P1-8's reading of that record harder. This is
the one submission in the whole build where the agent does not sign, and the reason is that there is nothing for its
signature to satisfy.

### 2. What it creates

| # | Entity | Declared shape | Warrant |
|---|---|---|---|
| 1 | the second letter's manifest | A2's resolution of B, on `0.0.10462713` | §6.4 step 2, §10.2 |
| 2 | the second letter's settlement | **three** stamps to the treasury, memo `wishmail:<id>`, strictly before chunk 0 | §4.2, §4.3, P-7, T-P7-1 |
| 3 | the second letter's chunks | **ten** HCS-10 `message` operations on `0.0.10464056` | §7.4, P-9, T-P9-7 |
| 4 | the **schedule** | HIP-423 long-term, inner = one `ConsensusSubmitMessage` of the receipt manifest to `0.0.10452154`, payer `0.0.10450879`, `waitForExpiry` false, expiry **30 days** | §10.4, T-P1-8 |
| 5 | the lane's `transaction` operation | `{p, op, operator_id, schedule_id, data}`, **no transaction memo** | HCS-10 pin, D-94, T-P9-5 |
| 6 | the **executed submission** | the receipt manifest on **B's** manifest topic `0.0.10452154` | §10.4, T-P1-8 |

**No lane is created and no doorbell is rung.** The lane exists; §7.1's rule finds it from B's doorbell, where B's
`connection_created` sits. That is the sentence of §7.1 this letter proves, and it is proved by the absence of a
`connection_request` rather than by anything positive: after this run, B's doorbell still holds exactly two messages.

### 3. What the home record does and does not get — Step 6 §3, amended to what is true

**RECORD, Sonic 2026-09-10.** The home record stays provisioning-only. §3 of checkpoint one's gate report said the
lane, the settlement and the chunks would be written to A2's own record, and they were not: `CorrespondentKey` in
`sdk/home.ts` is a closed union of the eleven provisioning keys. **That overstatement is corrected here rather than
widened.** What is true, and what this checkpoint relies on:

- **Lanes are found from consensus every time** (D-165, §7.1). Nothing is cached and nothing needs to be: a wiped home
  loses no lane.
- **Sent envelopes live in `<home>/store/envelopes/`**, keyed by envelope identifier, written **before the affixing
  transfer is submitted** and updated as `send` proceeds. That is P-7's whole reason: one settlement stamps one
  envelope, and a run that died inside the transfer's own window has either spent postage or not, and only the
  identifier can tell anyone which. It is a **cache of consensus and never an authority over it** — nothing in `send`
  reads it to decide anything, and `--resume` reads it only to learn which envelope to go and ask consensus about.
- **The letter's entities are recorded in the run of record and in the fixture capture**, which is where a reader
  without this machine can find them.

Widening `CorrespondentKey` is a nice-to-have and is **not done in this window**.

### 4. What it asserts, and what it reads back

Every readback is a mirror-node read with a named predicate, never an SDK receipt.

**No ring** (§7.1). B's doorbell `0.0.10452149` holds **exactly two** messages after the run, the same two it held
before: no new `connection_request` for either letter. A2's doorbell `0.0.10462704` holds **zero**.

**The affix.** One settlement, `to` the treasury, **amount 3** — two ounces of weight plus one receipt fee (§4.2,
§7.5) — memo **exactly** `wishmail:<id>`, consensus timestamp **strictly earlier** than chunk 0's (T-P7-1). Every
chunk's `operator_id` names the settlement's `from` (T-P1-6).

**The submission.** **Ten** chunks, every one at or under **1000 bytes** on the whole operation, **no `chunk_info`**
(T-P9-7), memo `hcs-10:op:6:3` (T-P9-5). The `nx` chain intact across all ten, which checkpoint one's one-chunk letter
could not exercise at all (T-P1-11).

**The schedule** (T-P1-8). Its record on the mirror shows: `payer_account_id` **`0.0.10450879`**, not B; `wait_for_expiry`
false; `expiration_time` 30 days out; `transaction_body` decoding to one `ConsensusSubmitMessage` **to `0.0.10452154`**
carrying the receipt manifest byte for byte; and, after `ack`, an `executed_timestamp` **after the tenth chunk's**, with
B's key prefix among the signatures.

**The receipt** (T-P1-8). The receipt manifest is message 1 on **B's** manifest topic `0.0.10452154` — a topic whose
submit key is B's account key `0bf6f350…` and nobody else's, read from the mirror 2026-09-10 — and its body recomputes
to the hash the sender pre-filled.

**B pays nothing for the receipt** (T-P16-2). B's account `0.0.10452127` holds **0.04622564 ℏ and 12 `$POSTAGE`**
before the run, read 2026-09-10. Both are read again after `ack` and **both must be unchanged**: the ScheduleSign's own
fee is B's *operator's* (`0.0.10450880`), and the inner transaction's is the schedule payer's.

**The readers.** `inbox` at B returns the Proclamation **byte-identical to the file** — 4408 bytes, sha256
`a5998644f8a86e1993244d6fb6ace1695f3f4264208c0912d5fbeaabd6f31f2a` — and carries the pending schedule beside it
(§6.5). `verify` from the empty home emits a bundle whose digest is equal across two runs (T-P3-1), with a `Narrative`
carrying it (T-P3-4).

### 5. The quote, measured before anything is bought

`npm run letter:plan` on the Proclamation, composed by **the same `sealEnvelope` the tool calls**:

```
body        emancipation_proclamation.md   (NARA text, UTF-8, CRLF as supplied)
payload     4408 bytes · sha256 a5998644f8a86e1993244d6fb6ace1695f3f4264208c0912d5fbeaabd6f31f2a
ciphertext  4424 bytes                     (+16, the AEAD tag)
chunks      10 · CHUNK_WIRE_MAX 1000 bytes per operation (§7.4)
weight      2 oz of 16 (§7.5)              — §4.2's maximum is not approached; nothing is cut
postage     3 stamp(s) = 2 weight + 1 receipt fee · returnReceipt true
envelope id 82bce897…                      (a dry-run composition; the live one differs — see §9)
receipt     schedule paid by 0.0.10450879 — never the recipient (§10.4, T-P16-2)
window      30 days = 2592000s, under SCHEDULE_MAX_LIFETIME 5356800s (§1.6)
```

**A2 holds ten stamps and the quote is three.** Sonic's fill-in — *if the quote exceeds 10, buy at the counter* — is
not reached: the counter is not started, `buy_stamp` is not called, and the Postmaster is not a party to this
checkpoint at all. Reported because a fill-in that was not needed is a fact about the run.

**§4.2's maximum is not in play.** `MAX_WEIGHT` is 16 ounces, 65,536 ciphertext bytes; the Proclamation is 2 ounces.
There is nothing to cut and nothing to ask.

### 6. The window, verified rather than recalled

**30 days is within the network's maximum.** `SCHEDULE_MAX_LIFETIME` is pinned at **5,356,800 s — 62 days** (§1.6,
D-77, ledger §H), and re-**FETCHED 2026-09-10** from `docs.hedera.com/hedera/core-concepts/scheduled-transaction`,
which gives the same number and cites `SchedulingConfig.java:35` for it. 30 days is 2,592,000 s. The driver refuses
anything over the maximum before it composes a body, and the network's own
`SCHEDULE_EXPIRATION_TIME_TOO_FAR_IN_FUTURE` stands behind that. **No stop fires.**

### 7. The `transaction` operation's shape and memo, probed at the pin

**Probed, not recalled** (CLAUDE.md §3's FETCH rule). `provenance/recon/pins-recon-2026-09-06.md`, C-5 and the
operation table at `docs/standards/hcs-10/index.md:696-714`: the `transaction` operation requires `p`, `op`,
`operator_id`, `schedule_id` and `data`, with `m` optional. **HCS-10 assigns it no operation enum and defines no
transaction memo for it** — the enum table at `index.md:366-374` stops at `6` (message) — so §6.1's rule ("MUST carry
none where HCS-10 defines none") makes its memo the empty string, which is what T-P9-5 checks and what
`ops/hcs10.ts::TRANSACTION_OP_MEMO` already was.

`data` is a free-text description of what the recipient is being asked to sign; HCS-10's own example is *"Transfer 10
HBAR to account 0.0.111222"*. Ours is **`wishmail:receipt:<envelope id>`**, and it is load-bearing rather than
decorative: it is what pairs a request with an envelope on a lane that carries more than one letter. Until 2026-09-10
`verify` attached every request on a lane to every envelope on it, which was invisible while a lane held one letter and
wrong the moment it held two.

### 8. The submit→learn window, per consensus write, and the resume from inside each

| Write | If the signature left and the outcome was not learned | Resume |
|---|---|---|
| **the manifest** (step 2) | published, unknown | harmless: a manifest is content-addressed and a duplicate is another message that recomputes to the same hash. The rerun composes a fresh envelope anyway |
| **the settlement** (step 4) | postage may be consumed with no envelope on the lane | **NEVER retried blindly** (P-7). The row in `<home>/store/envelopes/` is written **before** the transfer is submitted, so a fresh process can name the identifier; the settlement is then found on consensus by its memo — `wishmail:<id>` — and reused. A second transfer under the same memo would be a second settlement for one envelope, which T-P7-2 rejects |
| **the chunks** (step 5) | some on the lane and some not | resubmittable against the **same** settlement (D-52). The chain is walked from the header, so a partial envelope is `INBOX_INCOMPLETE` rather than a wrong one |
| **a send that died after SETTLE and before the schedule** | the envelope is delivered and no receipt was ever requested | **the envelope is SETTLED and stays SETTLED**; what is missing is a request, not postage. `npm run letter -- <home> --to <addr> --resume <envelope id>` runs step 7 alone. **A plain rerun is NOT a resume**: §7.2 requires a fresh nonce per envelope, so running the driver again composes a *different* envelope and affixes a *second* settlement — a second letter. `--resume` with no value lists what the store holds |
| **the ScheduleCreate** | a schedule may exist and this process not know its id | **the ledger itself prevents two.** An identical inner transaction returns **`IDENTICAL_SCHEDULE_ALREADY_CREATED`**, and the receipt of that transaction **carries the id of the schedule that already exists** — FETCHED 2026-09-10 from `docs.hedera.com/hedera/core-concepts/scheduled-transaction`: *"The receipt status will result in `IDENTICAL_SCHEDULE_ALREADY_CREATED`"*, and it gives "the schedule ID in the receipt of the transaction that was submitted" so the caller can sign that one. `ops/hedera.ts` was changed to carry an entity id back on a **failed** status for exactly this, and `send` treats that status as success. **Above it, step 7 reads the lane first**: a `transaction` operation whose `data` names this envelope is the request, and its schedule is reused. So there are two independent guards and the outer one costs nothing |
| **the `transaction` operation** | posted twice, or posted and unknown | **§10.4 permits it**: *"A sender MAY request again by creating a new schedule and posting a new `transaction` operation; each request is its own record."* A reader with two operations naming one schedule sees one request twice and appraises it once; a reader with two operations naming two schedules sees two requests, and `acked` on either is `acked` — the Verifier takes an acknowledged request over an unclaimed one and reports both rows under `requests`. Our own step 7 posts one, because it reads first |
| **the ScheduleSign** (`ack`) | the signature landed and the execution is not yet visible | **look again; never sign again.** `ack` polls the schedule for `executed_timestamp`, which is the fact, and a second ScheduleSign from the same key returns `NO_NEW_VALID_SIGNATURES`. If the poll runs out, `ack` refuses with `ACK_SUBMIT_FAILED` and says in as many words to read the schedule again rather than sign again |
| **the executed submission** | executed and the manifest not yet on the mirror | the receipt is witnessed by the schedule's record, which already carries the execution. `proof.uri` comes back **null** until the manifest is visible — which the registered schema permits and `check:freeze` asserts — and a later read fills it |

**The rule for all of them is the one Gate One taught and the a2 run re-taught: read the mirror first, and the
process's own output second.** If anything stops, report what is true at the stop and wait. Do not repair.

### 9. What the dry run showed, and what it could not

The quote in §5 is the whole of it, plus: the lane is found and reused, so this is not first contact; A2 holds ten
stamps against a quote of three; and the schedule's payer is `0.0.10450879` and not B.

**The envelope identifier above is a dry-run composition and will NOT be the one on consensus.** §7.2 requires a fresh
nonce for every envelope and §7.3 a fresh ephemeral key, so the live run seals again and reaches a different `id` — and
the settlement memo, which is `wishmail:` plus that id, differs with it. Its absence from the ledger is not a defect.
What the dry run fixed is the shape: the weight, the postage, the chunk count, the receipt fee, and that the memo is
the identifier and nothing else.

**What it could not prove**: whether the network accepts a 30-day expiration, whether the schedule's record shows what
§11.4 needs, whether the execution follows the tenth chunk, and whether ten chunks land without `chunk_info`. There is
no offline consensus node.

**`ack`'s dry run is different in kind, and it is worth saying.** Every check §10.4 puts *before* the signature is a
check on bytes already on consensus — the schedule's record, the body inside it, the topic that body writes to, the
payer it names, and whether the manifest it carries is the one this envelope, this postmark and this epoch compose. All
of that runs with `--live` absent. So a dry run of `ack` that prints `carries EXACTLY those bytes` has checked T-P1-9
in full; what it cannot know is whether the network executes.

### 10. The predicted appraisal, and the predicted trust class of the receipt

**The envelope: `appraised.standing` = `unverified`, reason `T-P12-4`.** The same prediction checkpoint one made and
the same reason it got back, and for the same sentence: `RELEASE.profiles` is `{}`, so §11.4 does not replay, and §9.6
makes a claimless Verifier conforming. Binding passes, postage passes, and T-P9-3 does not bite because Step 4 signed.

**The receipt: `receipt.status` = `acked`, no reasons, and the envelope's state moves to `ACKED`** (§8.3). It is the
first time any envelope in this deployment has been anything but SETTLED.

**The receipt's declared trust class is `math`, and its output is `opened`** — D-81, and §10.4's own paragraph. What a
Verifier recomputes is that B's key signed for this envelope after this postmark, which is arithmetic; that the
envelope *opened* is B's testimony and nothing else, "as a signature on a return-receipt card is the signer's testimony
that the letter was received". So the manifest carries `trustClass: math` with no endorsements, and the statement is
where the testimony is confined.

**A caveat this release owes, and it is the same shape as checkpoint one's seventh alteration.** §11.4 words the
receipt's signature check as *"the key of the account the resolution's coordinates name"*, and a Verifier that claims
no profile has no coordinates. §10.4 puts the recipient's **account** in the receipt's meaning, so the account is
inside the hash and a manifest naming any other account recomputes to a different hash — which is how the account is
confirmed rather than merely read. It is then checked against consensus twice: its key must be the submit key of the
topic the receipt landed on, and the prefix on the schedule's record must be that key. **Where a profile IS claimed the
replayed coordinates are compared to the same account as well**, and `check:letter` exercises that path. MINE, and
recorded here rather than coded around.

**If the run yields anything else, that is the finding.**

### 11. WHAT IS HELD, AND WHY — the reply, and ledger §G-21

**The plain reply B → A2 is not run.** It is held at the gate on a contradiction inside §7.1 that the dry run found
before any signature, and CLAUDE.md §5 forbids coding around it.

```
  §7.1 ¶6      "A lane is bidirectional: either party sends on it."
  §7.1 ¶5      the lane is found by "the connection_created operation ON THE
               RECIPIENT'S DOORBELL that names the sender's account"
  §7.1's MUST  "The lane an envelope binds to MUST have been created in answer to a
               connection request on the doorbell ITS RESOLUTION PROOF YIELDED."
               Conformance: T-P10-2
```

**On consensus, read 2026-09-10**: lane `0.0.10464056` was created by B in answer to A2's ring, so its
`connection_created` is on **B's** doorbell `0.0.10452149`. **A2's doorbell `0.0.10462704` holds zero messages.** For a
reply B → A2 the recipient is A2, the doorbell its resolution proof yields is `0.0.10462704`, and no lane is
discoverable there at all — while the lane the two agents share, and which either may write to under its threshold key,
is invisible to ¶5's rule and forbidden by the MUST.

**Neither way out is free.** Sending on the shared lane produces an envelope that **our own Verifier appraises unbound
the day it claims `hcs14`** (T-P10-2) and that this claimless release would not catch — conformant-looking today,
refused later, which is the worst version of the defect. Ringing A2's doorbell obeys the specification and opens a
**second** lane between the same two agents, spending a stamp at a HIP-991 fee, against a ruling that said the reply
rings nothing. **A second lane on consensus cannot be undone.**

**So nothing is signed for the reply and nothing is rung.** `lanesFromDoorbell` implements ¶5 exactly as written, which
is why the dry run said *first contact* rather than quietly picking a lane. Ledger §G-21 states both readings, what
each costs, and what a ruling would move. **Sonic rules; the reply resumes on his word and on nothing else.**

### 12. Two more findings, raised and not coded around

**§G-22 — T-P1-8's word is "exactly".** It asks for "a fixture receipt's schedule record shows exactly the recipient's
signature", and HIP-423's record cannot show one. A ScheduleCreate's signatures are offered to the inner transaction's
required keys, and §10.4's inner transaction requires two — B's, and the inner payer's, which §10.4 forbids from being
B. Twenty-five executed schedules read from testnet on 2026-09-10 carry two signatures each, creator's and
counterparty's. **§11.4's own wording is satisfiable and is what the code checks**: the recipient's key is *among* the
signatures, matched by prefix. The run will report what the record holds and will not pretend it holds one signature.

**§G-23 — §11.4 requires a reason no test names.** "A receipt for an envelope whose header did not request one counts,
and the reason names it (§8.6)" — and section A has no row for §8.6's unrequested receipt. The code reports `T-P12-2`,
which is §11.5's own sanctioned answer for a condition its table does not name, so the gap is flagged in the Verifier's
output rather than papered over with a test id that means something else. Not reachable in this run: the header does
request one.

### 13. What else this checkpoint changed, and what it did not

**`check:freeze` no longer composes a receipt by hand.** It built the manifest itself until today, and a second
spelling of a document that is inside a hash is a second receipt (CLAUDE.md §9). Moving it onto `core/receipt.ts`
found two things no schema could have caught: the digest covered `{envelopeId, keyEpoch}` and left **chunk 0's
postmark** in the locator only, though §10.4 makes the output `opened` "over exactly those inputs" and there are
**three** of them; and `meaning.statement` did not name the recipient's account, though §10.4's meaning lists it first
and §5.2's `meaning` has no other field it could be in.

**The `SchedulableTransactionBody` codec is hand-rolled and courted against the SDK's own bytes.** `@hashgraph/proto`
resolves only from a `node_modules` above this repository, so importing it would pass here and fail on a clean clone —
`core/protokey.ts` and `counter/body.ts` already refused it for that reason, and this refuses it for the same one. The
field this file would most plausibly get wrong from memory is
`SchedulableTransactionBody.consensusSubmitMessage`, which is **21** and not the **27** that `TransactionBody` uses for
the same body. `check:letter` builds a real `ScheduleCreateTransaction`, freezes it **offline**, decodes it with our
decoder, and asserts **our encoder's bytes are the SDK's bytes byte for byte**.

**`spec/schemas/` is not touched.** `spec/pins.json` is not touched. `app/deployment/hedera-testnet.json` is not
touched. `RELEASE.classes` stays `[]` and `RELEASE.profiles` stays `{}`.

**The Correspondent MCP server keeps no dry-run mode and no gate but the stamp (D-158), and the reader drivers keep no
mode flag.** Both stand as decided (RECORD, Sonic 2026-09-10). `sdk/ack.cli.ts` is new and DOES take one, because it
can sign.

### 14. Every way it stops

`send` stops, before or instead of signing, on every reason checkpoint one listed, and now also on: a receipt whose
schedule would name the recipient as payer (§10.4, T-P16-2); coordinates carrying no manifest topic for the recipient
(§5.3, D-166); an acknowledgment window over `SCHEDULE_MAX_LIFETIME`; a ScheduleCreate the network refuses for any
reason but `IDENTICAL_SCHEDULE_ALREADY_CREATED`; and a receipt manifest that would need more than one HCS message,
which `check:freeze` measures at 506 bytes and the SDK would refuse to schedule.

`ack` refuses with `ACK_NOT_OPENED` on: a delivery that came back unopened, for every reason in §6.5 (T-P1-3); a
delivery with no chunk 0 postmark or no epoch; a schedule whose body is not a `ConsensusSubmitMessage`; one that writes
to a topic other than this recipient's manifest topic; and one whose manifest is not the manifest this envelope, this
postmark and this epoch compose (T-P1-9). With `ACK_NOT_REQUESTED` on: no `transaction` operation naming a schedule for
this envelope; a header that did not set `rr` (§7.7); a schedule consensus no longer holds, which is `unclaimed` and
not a failure; and one whose payer is the recipient (T-P16-2). With `ACK_SUBMIT_FAILED` on a ScheduleSign that did not
land, or one that landed with no execution visible inside the wait — where the remedy is to read again and never to
sign again.

### 15. The offline courts, and what they leave out

`npm run check:letter` is **133 assertions**, up from 69. What it gained: a letter with a return receipt on a modelled
ledger that now holds HIP-423 schedules; the `transaction` operation on the lane, with no memo and with the envelope
in its `data`; the pending schedule surfacing at `inbox`; `ack` refusing a body that names a different identifier,
postmark or epoch (T-P1-9, three cases) and an envelope that never opened (T-P1-3); the ScheduleSign executing to the
recipient's own manifest topic with **not one stamp of the recipient's moved** (T-P16-2); `verify` reading it back as
`acked` with the envelope **ACKED** and §5.8's object recomposed from consensus alone (T-P1-8); a schedule expired
unsigned reported `unclaimed` and nothing else (T-P15-5); step 7 reusing a standing request rather than making a
second; a **multi-chunk** letter of the same weight class as the Proclamation, opened byte for byte, with **both**
halves of its chain refused when broken (T-P1-11); the ingestion-lag knob on the read that follows an execution; and
the protobuf codec courted against the SDK's own frozen bytes.

**What it leaves out, and says so rather than approximating.** The model does not verify signatures, charge HBAR,
throttle, or let time pass: `expire()` is a method call standing in for sixty-two days, and a key is a string. It does
not model the network's *own* refusal of a duplicate schedule as a status — it refuses in the same place and returns
the existing id, which is the behaviour the code depends on, but the status string is the network's. And it cannot
reach a single one of the four windows in §8: there is no offline consensus node.

### 16. The gate

**Nothing signs until Sonic says the word.** `npm run letter:plan` and `npm run ack` are the dry runs and have been
run; `npm run letter` and `npm run ack:live` are the live ones and have not. **Items (a) through (d) are what this
report gates. Item (e), the reply, is held on §G-21 and is not gated by anything here.**

---

## Step 6 — CHECKPOINT TWO: THE RUN OF RECORD, 2026-09-10

**A certified letter carrying a return receipt travelled from A2 to B on `hedera:testnet`, on the lane checkpoint one
opened and with nothing rung; B opened four and a half thousand bytes of it byte for byte across ten chunks; B's own
signature published the receipt on B's own topic without B paying a tinybar; and a stranger holding nothing read the
correspondence back and reported the envelope ACKED.** The gate report above is what was promised; this is what
happened, and the report is left exactly as it stood. Nothing below is reconstructed: every id was read from a mirror
node **before** the process's own output was read.

Authorised by Sonic, 2026-09-10 night, against the gate report at commit `294e6de`. **Items (a) through (d) completed
in one pass with no stop. Item (e), the plain reply, was held at the gate on §G-21 and is not run.**

### The arrangement, as it ran

```
  the counter        NOT STARTED. The quote was three stamps and A2 held ten.
  B's process        npm run correspondent -- <b home>, up first and left up.
                     Its doorbell watcher answered NOTHING, because nothing rang —
                     which is the assertion, not an idle process.
  A2's driver        npm run letter -- <a2 home> --to 0.0.10452127
                       --file emancipation_proclamation.md --receipt --receipt-window 30 --live
  B's readers        npm run inbox -- <b home>
                     npm run ack -- <b home>          (dry: every §10.4 check, no signature)
                     npm run ack:live -- <b home>
  the stranger       npm run verify -- --lane 0.0.10464056, from a directory
                     holding nothing at all.
```

### What was signed, in order

| # | Act | Transaction / locator | Consensus | Payer |
|---|---|---|---|---|
| 1 | one stamp to the operator (§4.4's hop) | — | — | **did not need to happen; see the divergence below** |
| 2 | the resolution manifest | `0.0.10462713` #2 | `1789070191.705408104` | `0.0.10450879` |
| 3 | the settlement — **three** stamps | `0.0.10450879@1789070187.355627312` | `1789070193.709560104` | `0.0.10450879` |
| 4 | chunks 0–9 on the lane | `0.0.10464056` #2 – #11 | `1789070197.627300435` … `1789070223.395764702` | `0.0.10450879` |
| 5 | the **ScheduleCreate** | schedule `0.0.10465145` | `1789070225.403001449` | `0.0.10450879` |
| 6 | the lane's `transaction` operation | `0.0.10464056` #12 | `1789070227.298222111` | `0.0.10450879` |
| 7 | **`ack` — the ScheduleSign** | — | `1789070359.540189104` | **`0.0.10450880`** |
| 8 | the schedule's inner submission, executed | `0.0.10452154` #1 | `1789070359.540189105` | **`0.0.10450879`** |

```
lane        0.0.10464056        reused; nothing rung
envelope    514e5045f706415613a6e513233f9e74007fedf7f89ed0f3b821c87ca28da2e1
schedule    0.0.10465145        expires 1791662224.000000000
receipt     417f73b31060433e2e5e220001d596c2f2e87b950060d1caa0eb2dcd3f2f6886
```

### Every assertion the gate report owed, from the mirror

**NOTHING WAS RUNG, and it is proved by an absence.** B's doorbell `0.0.10452149` holds **two** messages after the run,
the same two it held before — checkpoint one's `connection_request` and `connection_created`, and no third. A2's
doorbell `0.0.10462704` holds **zero**. §7.1's sentence *"A second letter to the same recipient rings nothing"* is now
a fact on consensus rather than a design intention, and it cost no stamp at any treasury.

**The affix.**

```
settlement   0.0.10450879@1789070187.355627312
memo         wishmail:514e5045f706415613a6e513233f9e74007fedf7f89ed0f3b821c87ca28da2e1
amount       3 $POSTAGE   0.0.10462700 → 0.0.10426205      (2 weight + 1 receipt fee, §4.2)
consensus    1789070193.709560104
```

**It precedes chunk 0 by 3.92 seconds** — strictly earlier, T-P7-1. The treasury's balance moved **+3** and by
exactly 3.

**The submission.**

```
chunk 0      1000 bytes on the wire      ← at CHUNK_WIRE_MAX exactly, and not over
chunks 1-8   999 bytes each
chunk 9      458 bytes
chunk_info   null on all ten             ← T-P9-7, across a MULTI-CHUNK envelope for the first time
n            10 on every chunk
memo         hcs-10:op:6:3               ← T-P9-5
```

**The chain walked all ten links** — which checkpoint one's single chunk could not exercise at all — and `inbox`
rebuilt 4424 ciphertext bytes from them.

**The schedule** (T-P1-8), read from `/api/v1/schedules/0.0.10465145`:

```
creator            0.0.10450879
payer_account_id   0.0.10450879        ← A2's operator. NOT the recipient (T-P16-2)
wait_for_expiry    false               ← §10.4 fixes it; a receipt lands when a hand signs
consensus          1789070225.403001449
expiration_time    1791662224.000000000    →  2,591,998.6 s = 30 days, 1.4 s short of the
                                              second because a sender's clock is the only
                                              clock a ScheduleCreate has
executed_timestamp 1789070359.540189105    →  AFTER the tenth chunk at 1789070223.395764702
transaction_body   one ConsensusSubmitMessage, 508 bytes, to 0.0.10452154, no chunkInfo
```

**The receipt** is message 1 on **B's** manifest topic `0.0.10452154` — a topic whose submit key is B's account key
`0bf6f35094412d8c…` and nobody else's — 508 canonical bytes, **recomputing to its own hash**
`417f73b31060433e2e5e220001d596c2f2e87b950060d1caa0eb2dcd3f2f6886`, which is the hash `send` pre-filled and the hash
`ack` recomposed before it would sign:

```json
{ "rule":   {"id":"wishmail:receipt","revision":"0.5"},
  "inputs": {"digest":"2c61ec99…","locator":{"ledgerTag":"hedera:testnet",
                                             "topicId":"0.0.10464056","sequenceNumber":2}},
  "output": {"value":"opened"},
  "meaning":{"statement":"0.0.10452127 opened this envelope with its AAD verified.",
             "uri":{"ledgerTag":"hedera:testnet","topicId":"0.0.10452154"},
             "trustClass":"math","endorsements":[]} }
```

The locator is chunk 0's postmark — lane `0.0.10464056` sequence **2** — which is where all three of §10.4's inputs
are re-obtained from one public read. **`meaning.uri` carries no sequence number**, because the bytes were fixed
before the message existed; D-163's rule reaching the one case that forced it.

**B PAID NOTHING** (T-P16-2), read before and after:

```
                            HBAR (tinybar)          $POSTAGE
B's agent  0.0.10452127     4,622,564  →  4,622,564  ( +0 )      12  →  12  ( +0 )
```

Not a tinybar and not a stamp. B's **operator** `0.0.10450880` paid **1,460,990 tinybar** — 0.0146 ℏ — for the
ScheduleSign's own network fee, and the executed submission's fee was charged to `0.0.10450879`, the payer the
schedule designated. So the sender funded the receipt and the recipient signed for it, which is §10.4's sentence
demonstrated rather than quoted.

### `ack` at B — the check, and then the signature

The dry run made every check §10.4 puts before a signature, and made all of them without signing:

```
  inner      ConsensusSubmitMessage to 0.0.10452154, 508 bytes, chunk_info none
  payer      0.0.10450879   — not the recipient (T-P16-2)
  expires    1791662224.000000000   waitForExpiry false
  composes   417f73b31060433e2e5e220001d596c2f2e87b950060d1caa0eb2dcd3f2f6886
  carries    EXACTLY those bytes (T-P1-9)
```

**`composes` is the whole tool.** B recomposed the manifest from three things IT knew — the envelope its own `inbox`
opened, chunk 0's postmark on the lane, and the epoch it decrypted under — and compared the result to what the sender
had put in the schedule. A ScheduleSign is a signature over bytes made before the signer can see what it did; a
recipient that signed first and read afterwards would have signed anything.

### `inbox` at B — the Proclamation opened

```
envelope   514e5045f706415613a6e513233f9e74007fedf7f89ed0f3b821c87ca28da2e1
opened     true
bytes      4408
sha256     a5998644f8a86e1993244d6fb6ace1695f3f4264208c0912d5fbeaabd6f31f2a
```

**Byte-identical to `emancipation_proclamation.md` as NARA gives it** — the same 4408 bytes, the same digest, CRLF and
all — reassembled from ten chunks by the chain and decrypted under epoch 1. `inbox` returned **two** deliveries on the
lane, checkpoint one's and this one, and **wrote nothing** (§6.5, D-29).

### `verify` from a stranger holding nothing

```
bundle digest   00229e6f3d12b1302175ead37ab1460276bbf05254a8856f9a9db948685935a1
correspondence  2 envelope(s)

  cd9dc8f4…   SETTLED   1 chunk    unverified (T-P12-4)   receipt none
  514e5045…   ACKED     10 chunks  unverified (T-P12-4)   receipt ACKED

narrative.bundleDigest  00229e6f…   matches the bundle: true
```

**NOTE ADDED 2026-09-10, after the run and beside its own number (D-173).** The digest above reproduces from a
checkout at tag **`v0.5.10`**, and from no later one. It was computed when the evidence bundle carried the
release's full patch version in `spec`; **D-173 makes that field the MINOR version — `0.5` — and moves the
Verifier's own patch to `observations.verifierSpec`, outside the digest.** So a reader who clones HEAD and runs
`npm run verify` over these captured bytes today gets a DIFFERENT digest, and that is
the fix rather than a discrepancy: two Verifiers at two patches of 0.5 now agree, which is what §11.7 and T-P3-1
ask for and what this number could never have given. **The number is not rewritten.** It is what the network
produced that day, `conformance/fixtures/` still carries it, and `00229e6f…` is proved
against those captured bytes on every run of the battery — by substituting the spec string of the day and
requiring EXACT equality, which proves every other byte of the evidence unchanged. **A run against the LIVE lane
differs for a second and ordinary reason too**: lane `0.0.10464056` has carried letters since, and a bundle is
over the scope and window it was asked for — which is why a fixture, and not a live re-run, is what reproduces a
recorded digest.

**Run twice: the same digest both times** (T-P3-1), and the narrative carries it (T-P3-4). **`Its state is ACKED. Its
return receipt is acked.`** — the first time any envelope in this deployment has been anything but SETTLED, said by
someone with no key, no account, no stamp, no counter and no home.

**NOTE ADDED 2026-09-10, beside the citation it corrects.** The `(T-P3-1)` on the line above **over-claims, and
the `(T-P3-4)` beside it is right.** §A gives T-P3-1 as replay *by a fresh Verifier at a different patch revision of
the same minor version, at a different time and through a different mirror node than the reference Postmaster's*,
equal byte for byte. Running THIS implementation twice, at one patch, through one mirror, shows the replay is
**deterministic** — which T-P3-1 presupposes and is not satisfied by. **This deployment does not discharge T-P3-1,
because it has one implementation and that test compares two.** T-P3-4 — every narrative's `bundleDigest` equals
the digest of the bundle it was produced from — is discharged here exactly as written. The run above is not
rewritten; what it measured is what it measured, and this says what that measurement is worth.

### The appraisal against the prediction

**Exactly as predicted, and for the third time the prediction was the narrower id.** `unverified`, reason `T-P12-4`,
declared trust class `math` with no endorsements. Binding passed across ten chunks; postage passed at three stamps;
T-P9-3 did not bite. **And the receipt came back `acked` with no reason beside it**, which the gate report predicted
and which required every one of §11.4's receipt checks to hold at once: the manifest recomposes from the envelope, the
postmark and the epoch; B's key is among the signatures on the record; the topic it landed on is one only B's key can
write to; the payer is not B; and the execution follows the tenth chunk.

**The receipt did not move the envelope's standing** (§11.5): `unverified` before and after, and `state` alone changed.

### The fixture, and the alterations offline

`conformance/fixtures/checkpoint-two-receipt.json` holds the whole correspondence as the mirror returned it — both
envelopes, all twelve lane messages, the manifest topics, the HCS-13 registry and the HCS-1 schema file, the
settlements, the topic records, the account keys, **and the schedule record with its protobuf body**, which is a row of
§11.2's ingestion table no fixture had ever carried.

`npm run check:receipt` is **40 assertions with no network** (P-4): the same bundle digest the network produced, the
schedule's body decoded by our own decoder, the manifest recomposed and matched, B's key matched to a signature prefix,
the envelope ACKED — and **seven alterations**, each driving the receipt to `unclaimed` or `invalid` **without moving
the envelope's standing by one rung**. The seventh is the one the design exists for: a receipt manifest left
*internally perfect* — its `inputs.digest` changed and its `hash` recomputed over the change, so it validates and
self-recomputes exactly as well as the real one — and refused, because it is not the manifest this envelope, this
postmark and this epoch compose. A reader that checked a manifest against itself would have passed it.

`npm run check:letter` is **133 assertions**, up from 69, and `npm run check:captured` is unchanged and still green
over checkpoint one's letter.

### Divergences, brought rather than coded around

**ONE STAMP LEFT A2 FOR NOTHING, and the ledger is where it was found.** A2 held ten stamps and the quote was three;
after the run it holds **six**. The fourth is on `0.0.10450879`, A2's operator wallet. `ringStamp` — §4.4's first hop,
which puts a stamp on the payer for the doorbell's HIP-991 fee — asked only whether the payer held one, and not whether
a doorbell was going to be rung. **No doorbell was rung**, so there was no fee, so bearer custody had nothing to be in
transit to. Nothing was consumed and nothing is lost: the stamp sits on a wallet whose key is in A2's own home. But it
is not where §4.2 says the letter's postage went, and the arithmetic of a letter should be readable off the treasury.
**Fixed after the run**: `ringStamp` now takes `willRing` and returns null without it, and both callers ask §7.1's own
rule — the lane on the RECIPIENT's doorbell — rather than a second spelling of it.

**THE MANIFEST LOCATOR NAMES A MESSAGE THIS RUN DID NOT WRITE.** `hdr.rp.u` is `0.0.10462713` sequence **1** —
checkpoint one's manifest — while this run's manifest landed at sequence **2**. The two are byte-identical: the same
recipient, the same epoch, the same proof, so the same 737 bytes and the same hash `f84257b7…`. `submitMessage` reads
the topic back for its own bytes, and the predicate was satisfied by the older message before the new one had been
ingested. **It is harmless here and would not be harmless elsewhere**: §11.4 asks whether the manifest at `rp.u`
recomputes to `rp.h` and whether its postmark precedes chunk 0, and #1 does both, so the envelope is correct and the
Verifier agrees. What is wrong is that a locator names something this submission did not produce, and a duplicate sits
at #2 that nothing names. **Fixed after the run**: the readback is now bounded below by the transaction's own valid
start, and a consensus timestamp is always at or after that, so an identical older message can no longer answer for a
new one.

**THE SCHEDULE'S RECORD SHOWS THREE SIGNATURES, and T-P1-8 asks for one.** Read from the mirror:

```
1789070225.403001449   1173197491f31555…   0.0.10450879   A2's operator, at the ScheduleCreate
1789070359.540189104   0bf6f35094412d8c…   0.0.10452127   B's AGENT — the required key
1789070359.540189104   6147c33991e2cd1a…   0.0.10450880   B's operator, the ScheduleSign's payer
```

The gate report predicted two and the network gave three: HIP-423 records **every transaction payer that touches a
schedule**, not only the keys the inner transaction requires. There is no arrangement in which the record shows one
signature and the recipient is not paying — §10.4 forbids the second, so it forbids the first. **§11.4's own wording
is satisfiable and is what the code checks**: the recipient's key is *among* the signatures, matched by prefix against
the account's key from consensus. **§G-22 is amended with the observed count**, and `check:receipt` asserts the
plurality rather than hiding it, so the day the sketch is fixed, that assertion is what changes.

**THE PLAIN REPLY IS NOT RUN.** §G-21, and §11 of the gate report above is the whole of it: §7.1 says a lane is
bidirectional and §7.1's own MUST says a reply cannot use it, because the lane's `connection_created` is on the
acceptor's doorbell and §7.1 finds a lane by reading the recipient's. Found by the dry run, before any signature, and
confirmed from the mirror: **A2's doorbell holds zero messages**. Sending on the shared lane makes an envelope our own
Verifier appraises unbound the day it claims `hcs14`; ringing instead opens a second lane that cannot be undone,
against a ruling that said to ring nothing. **Nothing was signed and nothing was rung. Sonic rules.**

**The counter's fill-in was not reached.** Sonic ruled *if the quote exceeds 10, buy at the counter*. The quote was
three. Reported because a fill-in that was not needed is a fact about the run.

**A2's home record is unchanged and provisioning-only**, which is what Step 6 §3 now says rather than what it said
before. What the run wrote is one row under `<home>/store/envelopes/`, keyed by the envelope identifier:

```json
{"envelopeId":"514e5045…","lane":"0.0.10464056","recipientAccount":"0.0.10452127",
 "settlementRef":"0.0.10450879@1789070187.355627312","postage":3,"returnReceipt":true,
 "stage":"requested","chunkCount":10,"keyEpoch":1,
 "chunkZero":{"topicId":"0.0.10464056","sequenceNumber":2},"scheduleId":"0.0.10465145"}
```

B's own store holds none, because B sent nothing.

**`ENTITIES.md` is unchanged by this run.** It renders the Postmaster's ops record, and no Correspondent entity goes
there (CLAUDE.md §11) — so the lane, the schedule and the receipt appear in this record and in the fixture, and
nowhere else.

---

## Step 6 — CHECKPOINT TWO, THE REPLY: gate report, written 2026-09-10 before any signature

**This supersedes §11 of the checkpoint-two gate report above, and that section is left exactly as it stood.** It said
the reply was held at the gate on ledger §G-21, and it was right to. §G-21 is now closed by **D-171** and §G-22 by
**D-172**, the specification is at **0.5.11**, and this is the gate report for the one act checkpoint two did not do:
**a plain reply, B → A2, on the lane A2 opened, ringing nothing.**

Nothing below has been signed. `npm run letter:plan` is the dry run and has been run; its output is printed verbatim
in §9. `npm run letter … --live` is the live one and has not.

### 1. What changed under the reply, and why it can happen at all

§7.1 said "a lane is bidirectional: either party sends on it" and also bound an envelope only to a lane born from "the
doorbell its resolution proof yielded". An HCS-10 `connection_created` sits on the **acceptor's** doorbell. B answered
A2's ring, so the lane's birth is on **B's** doorbell `0.0.10452149` and **A2's doorbell `0.0.10462704` holds zero
messages** — so for a reply the two sentences pointed opposite ways, and the dry run said `lane NONE — this is first
contact` before anything signed.

**D-171 (RECORD, Sonic, 2026-09-10):** an envelope is bound to a lane **iff** the lane's submit key is a threshold over
exactly the two parties' keys **and** its `connection_created` is on the doorbell of one of the two parties, naming the
other. First contact is found on the recipient's doorbell as before; a reply on the sender's own, because the sender is
the agent that answered.

### 2. The parties, and who pays for what

```
  sender      B    0.0.10452127   doorbell 0.0.10452149   log 0.0.10452150   manifest 0.0.10452154
  recipient   A2   0.0.10462700   doorbell 0.0.10462704   manifest 0.0.10462713
  payer       B's operator 0.0.10450880   — the operator pays, the agent signs (§3.5)
  lane        0.0.10464056   opened by A2's ring, answered by B, reused now in the other direction
```

Every submission below is signed by **B's agent key** and paid by **B's own operator wallet** `0.0.10450880`. The
Postmaster pays for nothing here: carry outside `buy_stamp` is deferred this window (CLAUDE.md §11, LIMITATIONS L-5).
A2 pays nothing and is not asked for anything — it is the recipient, and there is no receipt to sign.

**The stray stamp is not lost.** Checkpoint two moved one of A2's ten stamps to A2's operator `0.0.10450879` for a
doorbell fee that was never charged, because `ringStamp` asked whether the payer held a stamp rather than whether a
door would be rung. It sits on `0.0.10450879` and **serves the next ring A2 makes** — nothing was consumed, and the
treasury received nothing it should not have. It is not touched by this run: B is the sender here and B's operator is
the payer.

### 3. The lane, and the binding this envelope asserts

Read from the mirror rather than recalled:

```
  lane      0.0.10464056  memo hcs-10:1:60:2:0.0.10452149:1
  doorbell  0.0.10452149  memo hcs-10:0:60:0:0.0.10452127     -> the door is B's
  answer    0.0.10452149 #2  connection_created
              connection_topic_id 0.0.10464056
              connected_account_id 0.0.10462700               -> the ringer was A2
              operator_id 0.0.10452149@0.0.10452127           -> submitted by B, the door's owner
  keys      submit key = threshold of exactly
              d94b7e7d…  A2's account key
              0bf6f350…  B's account key
  fees      none
```

So the walk §11.4 now performs yields `{owner, requester}` = `{B, A2}`, and this envelope's two parties are
`{coordinates.account, settlement.from}` = `{A2, B}`. **The same set** — which is why one rule serves both directions.
Nothing in that walk is a resolution; it is four reads of public consensus data.

**What a Verifier will actually do today, stated rather than implied.** This release claims no profile, so §11.4 does
not replay the resolution, has no `coordinates.account` to compare against, and **the lane-provenance check is dark** —
exactly as the key-epoch check T-P1-10 is. The reply will therefore appraise the same as every letter before it, and
the binding above is proved by `check:letter` offline rather than by this run. LIMITATIONS L-1 says so.

### 4. The quote, measured before anything is bought

From the dry run in §9, composed by **the same `sealEnvelope` the tool calls**:

```
  body        The Proclamation arrived whole, and I have signed for it. Thank God for Lincoln.
  payload     80 bytes    sha256 b70281c14ab4bf1f0de4dd14174ee432ee5b5cc83b534cbfebe749b70b407898
  ciphertext  96 bytes
  chunks      1           (CHUNK_WIRE_MAX 1000 bytes per operation, §7.4)
  weight      1 oz of 16  (§7.5)
  postage     1 stamp     = weight 1 + receipt 0, returnReceipt FALSE
  ring        NONE        the lane exists; §4.4's hop does not happen and no stamp moves to the payer
  held        B holds 12 stamps
```

**One stamp against twelve.** §4.2's maximum is not in play at one ounce. Nothing is bought at the counter.

The envelope identifier the dry run printed is **not** the one the live run will produce: §7.2's AAD carries a fresh
16-byte nonce for every envelope, so the identifier changes on every composition and is only pinned once the live run
seals. The lane, the weight, the postage and the payload digest are what this quote fixes.

### 5. What it creates, and what it does not

Creates: one resolution manifest on **B's** manifest topic `0.0.10452154`; one settlement of one stamp; one chunk on
the lane. **Nothing else.** No schedule, no `transaction` operation, no `connection_request`, no `connection_created`,
no new topic, no new account.

**A2's doorbell must hold zero messages after this run, exactly as it does now.** That is the assertion the whole
ruling rests on, and it is proved by an absence.

### 6. The submit→learn window, per write, and how a rerun resumes from inside it

Every row is a signature leaving this process before its outcome is known. There is no offline consensus node, so
this is the window no check reaches (CLAUDE.md §12).

| # | Write | Payer | If it dies after the signature and before the answer | How a rerun resumes |
|---|---|---|---|---|
| 1 | the resolution manifest → `0.0.10452154` | `0.0.10450880` | the manifest is on B's topic and this process does not know its sequence number | **A rerun publishes a second manifest.** A manifest is content-addressed and both recompute to the same hash, so the second is a duplicate and not a contradiction; the envelope binds to the hash, never to the sequence number. Cost: one message. The readback is bounded below by the transaction's own valid start (fixed 2026-09-10), so it cannot be answered by an identical earlier message. |
| 2 | the settlement — one stamp | `0.0.10450880` | **the stamp is consumed and no chunk names it** | A rerun composes a NEW envelope with a new nonce and a new settlement, and the first settlement becomes an **orphan** — reported under `orphans` (F-3), the stamp spent, nothing double-charged and nothing false on consensus. §8.5 has a word for it. The row in B's own store, written **before** the transfer is submitted, is what lets a later run name the envelope and ask consensus about it (P-7, D-165). |
| 3 | chunk 0 on the lane | `0.0.10450880` | the letter is on the lane and this process does not know it settled | The envelope is SETTLED on consensus whatever this process believes; `npm run verify -- --lane 0.0.10464056` reads it back. A rerun would post a **second** envelope, not a duplicate of this one, because the nonce differs — so a rerun is a decision and not a repair, and it is not taken without the word. |

**There is no step 7.** `returnReceipt` is false, so no schedule is created, no `transaction` operation is posted, and
the whole of §10.4's window is absent from this run.

### 7. The predicted standing, and it is a prediction

Derived from §11.5's table, not from running it:

```
  state       SETTLED                     (§8.3 — one chunk, delivered; no receipt was requested)
  standing    unverified
  reasons     T-P12-4                     (§11.4: the profile is not claimed, so the resolution is not replayed)
  receipt     none                        (§11.4 — no request and no receipt)
  trustClass  math, endorsements []       (declared, reported beside the standing, never folded into it — P-12)
```

**`T-P10-2` and `T-P17-2` MUST NOT appear**, and not because the lane is wrong — because a Verifier claiming no
profile never reaches either check. If either appears, something is wrong with the implementation and not with the
lane, and that is a stop.

**`T-P9-3` must not appear either**: B's `schemaRef` is `hcs://13/0.0.10448509#1`, the registered one from Step 4.

### 8. Every way it stops

- The dry run prints anything but `lane 0.0.10464056` and `ring NONE` → **stop**, report, wait.
- `send` returns `SEND_LANE_INVALID` → the lane is closed, carries a fee, or its key list is not the two parties' →
  **stop**; nothing is repaired and no second lane is rung.
- `send` rings anything at all → **stop immediately**. A ring here means the lane was not found, which is the defect
  D-171 exists to remove, and a lane cannot be un-opened.
- `SEND_INSUFFICIENT_STAMPS` → B holds 12 and needs 1; this cannot fire without something else being wrong.
- `SEND_SUBMIT_FAILED` / `SEND_SETTLE_TIMEOUT` → the settlement stands and the envelope is partial or orphaned; read
  the mirror, report what is true and what is resumable, **wait**.
- A2's `inbox` does not return the reply → **stop**. Do not re-send. The letter is on consensus or it is not, and
  `verify` says which.
- Any mirror readback disagreeing with what the process believes → the mirror is the record; **stop and report**.

### 9. The dry run, verbatim, signing nothing

```
$ npm run letter:plan -- "C:/Users/Sonic/.wishmail/demo/b" --to 0.0.10462700 \
    --text "The Proclamation arrived whole, and I have signed for it. Thank God for Lincoln."

> npm run letter:plan --workspace app -- C:/Users/Sonic/.wishmail/demo/b --to 0.0.10462700 --text The Proclamation …
> tsx sdk/letter.cli.ts --dry-run C:/Users/Sonic/.wishmail/demo/b --to 0.0.10462700 --text The Proclamation …

  letter — DRY RUN: nothing will be signed
  argv as received  ["--dry-run","C:/Users/Sonic/.wishmail/demo/b","--to","0.0.10462700","--text",
                     "The Proclamation arrived whole, and I have signed for it. Thank God for Lincoln."]
  to go live        pass --live, and check the line above says it arrived

  sender      0.0.10452127  (home …/demo/b)
  payer       0.0.10450880  — the operator pays; the agent signs (§3.5)
  doorbell    0.0.10452149   log 0.0.10452150   manifest 0.0.10452154
  schemaRef   hcs://13/0.0.10448509#1

  recipient   0.0.10462700  doorbell 0.0.10462704  manifest 0.0.10462713
  resolution  math · 0 endorsement(s)
  proof hash  4759aa5ca4d39de2a7540976788da5b2f2386a6aa18744f73a27a3328f4ba893
  epoch       1

  lane        0.0.10464056 created 1789064925.372200222 at THIS agent own door — a reply — reused, nothing is rung (§7.1)
  stamps      the agent holds 12

  body        inline text
  payload     80 bytes · sha256 b70281c14ab4bf1f0de4dd14174ee432ee5b5cc83b534cbfebe749b70b407898
  ciphertext  96 bytes
  chunks      1 · CHUNK_WIRE_MAX 1000 bytes per operation (§7.4)
  weight      1 oz of 16 (§7.5)
  postage     1 stamp(s) = 1 weight · returnReceipt false
  envelope id 12e5e929a012321ef7d9a8b11e538782691621e753828c07281b07bd2c488159
  memo        wishmail:12e5e929… (§4.3 — this exact string, on the settlement)

  DRY RUN: nothing was signed and nothing submitted.
```

**The line that matters is the lane line**, and it is the line that read `NONE — this is first contact` yesterday. The
driver printed its mode and the argv it received **before it read a key**, which is CLAUDE.md §12's rule and the
reason it exists.

### 10. Two findings the probe for this ruling turned up, raised and not coded around

**§G-24 — HCS-10 contradicts itself about who writes the Outbound Connection Created record.** FETCHED 2026-09-10 from
the pinned blob itself, git blob sha `0cb5d2eb…` **verified equal to the sha `spec/pins.json` carries**. Its prose
(`index.md:560`) and its table row (`:529`) say the **acceptor** writes it; three of its five required field
descriptions (`:585`, `:586`, `:587`) describe the **requester** writing it. It decides whether an agent can enumerate
the lanes it requested from consensus alone. Nothing is coded around it either way.

**One outbound record on this deployment is wrong against the pin, and it is ours.** `index.md:553` gives an outbound
`connection_request` record an `operator_id` naming the agent *being* requested, plus a required `outbound_topic_id`
and `connection_request_id`; this implementation posted the **inbound** body — the agent naming itself, two required
fields absent. **A2's log `0.0.10462708` #1 is the one such record**, verified from the mirror; B's log `0.0.10452150`
and the Postmaster-agent's `0.0.10426554` hold none, because neither has rung a doorbell. Fixed forward and **not
repaired**: a consensus record cannot be rewritten and manufacturing one would be worse. LIMITATIONS L-1 names it.
**It does not fire in this run** — the reply rings nothing.

**§G-25 — the evidence bundle's digest is a function of the release's patch version.** Found by the version bump
itself: `check:captured` and `check:receipt` failed on their digests with no change to the evidence. Isolated rather
than assumed — with the whole of D-171's code in place and `RELEASE.spec` alone set back to `0.5.10`, both returned to
exactly the values the network produced. §11.7 requires two Verifiers to agree and T-P3-1 compares two implementations
byte for byte, and two implementations are never at one patch. Nothing was changed to make it go away. **The digests
in the runs of record above were computed under 0.5.10, remain true of that day, and reproduce from tag `v0.5.11`'s
predecessor `v0.5.10`.**

### 11. What the offline courts prove, and what they leave out

`check:letter` is **155 assertions**, up from 133. The reply direction runs end to end on the modelled ledger: the
lane found through the replier's **own** doorbell and **through an ingestion lag**, `willRing` false, no second
`connection_created` anywhere, the envelope binding, the agent that rang opening it byte for byte, and a Verifier
**claiming `hcs14`** reporting neither `T-P10-2` nor `T-P17-2` — the direction that had never been exercised anywhere.
Three lanes are refused beside it: one whose memo names a door holding no answer for it, one born at a third party's
door, and one whose submit key carries a third key.

**What they leave out, and no offline court can reach it**: whether the fee assesses, whether the chunk lands without
`chunk_info`, whether the mirror ingests in the order this process expects, and whether the lane still accepts B's key.
Every defect Gate One found lived in that gap.

### 12. The gate

**Sonic authorized the reply after the patch, the courts and this report** (RECORD, 2026-09-10): *"GATE — the reply
B→A2 on the lane: AUTHORIZED after above."* The patch is committed and pushed at **`9ce3792`**, tagged `v0.5.11`;
twenty checks are green; this report is committed before the first signature.

---

## Step 6 — CHECKPOINT TWO, THE REPLY: THE RUN OF RECORD, 2026-09-10

**The letter came back.** B wrote to A2 on the lane A2 opened, in the direction §7.1 said was possible and §7.1's own
MUST forbade until D-171. **Nothing was rung, no second lane exists, and A2's doorbell still holds zero messages.**
One pass, no stop. The gate report above is left exactly as it stood.

### The arrangement, as it ran

```
  the counter        NOT STARTED. The quote was one stamp and B held twelve.
  A2's process       NOT STARTED, and deliberately. A2's watcher is the only thing
                     that could ANSWER a ring, and an answered ring is a second lane
                     that cannot be closed. With it down, the worst a mistaken ring
                     could do is fail — and B's operator holds zero stamps, so the
                     HIP-991 fee could not have been paid either. Two independent
                     reasons the irreversible act was out of reach.
  B's driver         npm run letter -- <b home> --to 0.0.10462700
                       --text "The Proclamation arrived whole, and I have signed for it.
                               Thank God for Lincoln."
  A2's reader        npm run inbox -- <a2 home>
  the stranger       npm run verify -- --lane 0.0.10464056, twice, from a directory
                     holding no key, no account, no stamp and no home.
```

### What was signed, in order

| # | Act | Transaction / locator | Consensus | Signed by | Payer |
|---|---|---|---|---|---|
| 1 | one stamp to the payer (§4.4's hop) | — | — | — | **did not happen: the lane exists, so no door is rung and no fee is charged** |
| 2 | the resolution manifest | `0.0.10452154` #2 | `1789076238.679062477` | B's agent | `0.0.10450880` |
| 3 | the settlement — **one** stamp | `0.0.10450880@1789076237.491878073` | `1789076242.579090104` | B's agent | `0.0.10450880` |
| 4 | chunk 0 on the lane | `0.0.10464056` #13 | `1789076246.605728104` | B's agent | `0.0.10450880` |

**Three submissions and no fourth.** No ScheduleCreate, no `transaction` operation, no `connection_request`, no
`connection_created`, no new topic, no new account.

```
lane        0.0.10464056        REUSED, in the OTHER DIRECTION — nothing rung
envelope    bc1bd61ee97faee136f8f15f1cf0de7590bfef65446d6024982d0152fcd7e492
body        "The Proclamation arrived whole, and I have signed for it. Thank God for Lincoln."
payload     80 bytes · sha256 b70281c14ab4bf1f0de4dd14174ee432ee5b5cc83b534cbfebe749b70b407898
ciphertext  96 bytes · 1 chunk · weight 1 oz of 16 · postage 1 stamp
manifest    0.0.10452154 #2 — on B's OWN manifest topic, the sender being B this time
settlement  from 0.0.10452127 to 0.0.10426205, memo wishmail:bc1bd61e…
epoch       1 · schemaRef hcs://13/0.0.10448509#1
```

### Every assertion the gate report owed, from the mirror

**NOTHING WAS RUNG, AND IT IS PROVED BY TWO ABSENCES.** Counted before the run and again after:

```
  A2's doorbell  0.0.10462704   0 messages before   0 messages after   UNCHANGED
  B's doorbell   0.0.10452149   2 messages before   2 messages after   UNCHANGED
  the lane       0.0.10464056  12 messages before  13 messages after   +1, the reply's chunk 0
  B's manifest   0.0.10452154   1 message  before   2 messages after   +1, the resolution manifest
```

B's doorbell holds the same two it has held since checkpoint one — A2's `connection_request` and B's
`connection_created` — and no third. **A2's doorbell has never held anything, and still does not.** That is the
sentence "a reply rings nothing" as a count rather than a design intention.

**The lane was found at B's own door**, which is what D-171 changed. The dry run printed it before anything signed:

```
  lane  0.0.10464056 created 1789064925.372200222 at THIS agent own door — a reply — reused, nothing is rung (§7.1)
```

**The order of the three writes is the order §11.4 requires.** The manifest at `1789076238.679…` precedes the
settlement at `1789076242.579…`, which precedes chunk 0 at `1789076246.605…` — the manifest's postmark before chunk 0
(T-P9-8) and the settlement **4.03 seconds** before it (T-P7-1).

**Chunk 0 carries no `chunk_info`** (T-P9-7), and its `operator_id` is `0.0.10452149@0.0.10452127` — B's doorbell and
B's account, naming the account the settlement came `from` (§7.2's fourth weld, T-P1-6). **On this lane the
`operator_id` now points both ways**: sequences 1–12 name A2, sequence 13 names B.

**B paid one stamp and no tinybar; A2 paid nothing at all.** Read before and after:

| Account | tinybar before | tinybar after | Δ | `$POSTAGE` before | after | Δ |
|---|---|---|---|---|---|---|
| B's agent `0.0.10452127` | 4,622,564 | 4,622,564 | **0** | 12 | 11 | **−1** |
| B's operator `0.0.10450880` | 45,869,184,996 | 45,865,756,285 | **−3,428,711** | 0 | 0 | 0 |
| A2's agent `0.0.10462700` | 15,004,618,300 | 15,004,618,300 | **0** | 6 | 6 | **0** |
| A2's operator `0.0.10450879` | 41,499,071,098 | 41,499,071,098 | **0** | 1 | 1 | **0** |

**The agent signs and the operator pays** (§3.5): B's agent account did not move by one tinybar across three
submissions, and B's operator paid **0.03428711 ℏ** for all three. The one stamp left B's agent for the treasury,
which is where §4.4 says postage goes.

**No stamp moved to a payer**, and that is the `ringStamp` fix showing on consensus: B's operator holds zero
`$POSTAGE` before and after. Under yesterday's code it would have been asked to hold one, and a hop with no fee to
pay would have stranded it. **A2's operator still holds the stamp checkpoint two stranded there** — one `$POSTAGE`,
untouched by this run. It is not lost: it is on an account A2's own operator controls, and it pays the next doorbell
fee A2 owes.

### `inbox` at A2 — the letter opened by the agent that rang

```
  inbox — 0.0.10462700
  lanes  0.0.10464056   — from consensus, by §7.1's rule

  envelope   bc1bd61ee97faee136f8f15f1cf0de7590bfef65446d6024982d0152fcd7e492   lane 0.0.10464056
  opened     true
  payload    "The Proclamation arrived whole, and I have signed for it. Thank God for Lincoln."
  bytes      80
```

**A2 found the lane at all, and that is new.** A2 never answered a door, so it has no `connection_created` of its own
to read; before D-171 `lanesOf` looked only at the agent's own doorbell and A2's holds nothing. It now reads both
kinds — the lanes it accepted and the lanes it requested, the latter by taking the correspondents its own home
records and reading **their** doorbells from consensus. The home said *whom*; consensus said *which lane*.

**80 bytes, byte for byte**, and `inbox` wrote nothing (§6.5).

**An observation, and not a defect.** A2's `inbox` also reports its own two outgoing letters on that lane as
`INBOX_UNBOUND`. They were sealed against B's key, so they do not open under A2's, and §6.5 fails closed rather than
guessing. It is the first time an agent has read a lane carrying its own outbound mail, which is only possible now
that both directions travel one lane; nothing is wrong and nothing was written.

### `verify` from a stranger holding nothing

Run twice, from a directory holding no key, no account, no stamp, no counter and no home.

```
  bundle digest   1c4359e5bf6fbbe00fc82e4e5b358500d307572891a1be89dfd47d493f13d648   (both runs)
  narrative.bundleDigest matches the bundle   true
```

**NOTE ADDED 2026-09-10, after the run and beside its own number (D-173).** The digest above reproduces from a
checkout at tag **`v0.5.11`**, and from no later one. It was computed when the evidence bundle carried the
release's full patch version in `spec`; **D-173 makes that field the MINOR version — `0.5` — and moves the
Verifier's own patch to `observations.verifierSpec`, outside the digest.** So a reader who clones HEAD and runs
`npm run verify` over these captured bytes today gets a DIFFERENT digest, and that is
the fix rather than a discrepancy: two Verifiers at two patches of 0.5 now agree, which is what §11.7 and T-P3-1
ask for and what this number could never have given. **The number is not rewritten.** It is what the network
produced that day, `conformance/fixtures/` still carries it, and `1c4359e5…` is proved
against those captured bytes on every run of the battery — by substituting the spec string of the day and
requiring EXACT equality, which proves every other byte of the evidence unchanged. **A run against the LIVE lane
differs for a second and ordinary reason too**: lane `0.0.10464056` has carried letters since, and a bundle is
over the scope and window it was asked for — which is why a fixture, and not a live re-run, is what reproduces a
recorded digest.

Three envelopes on one lane, and the narrative reads the correspondence as a correspondence:

```
  cd9dc8f4…  posted by 0.0.10462700  1 chunk    SETTLED   unverified (T-P12-4)   receipt none
  514e5045…  posted by 0.0.10462700  10 chunks  ACKED     unverified (T-P12-4)   receipt ACKED
  bc1bd61e…  posted by 0.0.10452127  1 chunk    SETTLED   unverified (T-P12-4)   receipt none
```

**"affixed by 0.0.10462700" twice and "affixed by 0.0.10452127" once**, from the settlements alone — a stranger reads
which way each letter went without being told, because §7.2's fourth weld makes the sender the account that paid.

### The appraisal against the prediction

| | predicted | observed |
|---|---|---|
| state | SETTLED | **SETTLED** |
| standing | unverified | **unverified** |
| reasons | `T-P12-4` and nothing else | **`T-P12-4`** |
| receipt | none | **none** |
| trust class | `math`, endorsements `[]` | **`math`, `[]`** |
| `T-P10-2` / `T-P17-2` | MUST NOT appear | **absent** |
| `T-P9-3` | must not appear | **absent** |

Exactly as §7 of the gate report predicted. `T-P10-2` and `T-P17-2` are absent for the reason stated there and not
because the lane is right: **this release claims no profile, so §11.4 never reaches either check.** That the lane IS
right is proved offline, below, and in LIMITATIONS L-1 it is written down that the check is dark.

### The fixture, and the binding walk on real bytes

**`conformance/fixtures/checkpoint-two-reply.json`**, and it is the first fixture that carries **the lane's birth
doorbell** — `0.0.10452149`, reached by following the lane's own memo, which `capture` did not do until today.
Neither earlier capture took it, which was harmless only because a claimless Verifier never reads it.

`npm run check:reply` is **29 assertions with no network** (P-4). It runs `laneBirth` on the captured bytes and is
told nothing about who the parties are:

```
  lane 0.0.10464056  memo hcs-10:1:60:2:0.0.10452149:1   -> the door
  door 0.0.10452149  memo hcs-10:0:60:0:0.0.10452127     -> the owner is B
  answer on that door, submitted under B's own operator_id,
      names connected_account_id 0.0.10462700            -> the ringer was A2
  submit key = threshold of exactly A2's and B's account keys, no custom fee
```

and `{B, A2}` is the pair, which is the same set from either direction. It also asserts the three envelopes are on
**one** lane, that the first two were affixed by A2 and the third by B, that checkpoint two's envelope is **still
ACKED with its receipt still acked**, and that B's doorbell holds two messages and no third.

**`check:letter` is 155 assertions**, up from 133: the reply direction end to end on the modelled ledger, found
through the replier's own doorbell **and through an ingestion lag**, plus three lanes refused — one whose memo names
a door holding no answer for it, one born at a third party's door, and one whose submit key carries a third key.

**Twenty-one checks green**, with `typecheck` and `p13:check`.

### The homes, after

B's store gained one row; A2's is unchanged.

```json
b : {"envelopeId":"bc1bd61e…","lane":"0.0.10464056","recipientAccount":"0.0.10462700",
     "settlementRef":"0.0.10450880@1789076237.491878073","postage":1,"returnReceipt":false,
     "stage":"settled","chunkCount":1,"keyEpoch":1,
     "chunkZero":{"topicId":"0.0.10464056","sequenceNumber":13}}

a2: {"envelopeId":"514e5045…", … "stage":"requested"}   — checkpoint two's, untouched
```

**`ENTITIES.md` is unchanged by this run**, as it was by checkpoint two: it renders the Postmaster's ops record, and
no Correspondent entity goes there (CLAUDE.md §11).

### Divergences, brought rather than coded around

**None on consensus.** Every submission landed where the gate report said it would, in the order it said, at the
price it quoted, and no stop fired.

Three findings stand open in the ledger and none of them is a defect in this run: **§G-24** (the pinned HCS-10 text
contradicts itself about who writes the Outbound Connection Created record), the **one outbound record already on
consensus that is wrong against the pin** — A2's log `0.0.10462708` #1, named in LIMITATIONS and not repaired — and
**§G-25** (the evidence bundle's digest is a function of the release's patch version, so the digests recorded above
for checkpoints one and two reproduce from tag `v0.5.10` and this one from `v0.5.11`).

---

## Step 7 — GATE THREE: a third Correspondent, and the whole of §6.4 in one `send()` call. Gate report, written 2026-09-10 before any signature

**Nothing below has been signed.** `npm run correspondent:provision:plan` is the provisioning dry run and has been
run; its output is printed verbatim in §10. `npm run letter:plan` is the send dry run and **cannot be run yet** — §11
says why, and says what it must print before anything goes live.

Gate Two proved the letter loop between two agents that already existed. **Gate Three is the first time this
deployment does the whole of §6.4 in ONE `send()` call**: first contact and `returnReceipt` together, which is §6.4 as
written and band 3 of the diagram end to end. It is also the first time three agents exist, the first live run of the
P-9 outbound fix, and the first live run of D-174's two records.

### 1. The actors, and what each is

```
  the Postmaster   0.0.8641261        treasury 0.0.10426205 · $POSTAGE 0.0.10426208 · prices 0.0.10426551
                   counter at http://127.0.0.1:4600/mcp, started for the purchase and stopped after it
  C2OPERATOR       0.0.10450880       458.65756285 ℏ · 0 $POSTAGE · max_automatic_token_associations -1
                   the wallet that pays for BOTH B's submissions and C's — one operator, two agents (D-165)
  B (the sender)   0.0.10452127       doorbell 0.0.10452149 · log 0.0.10452150 · manifest 0.0.10452154
                   11 $POSTAGE · 0.04622564 ℏ, which it never spends: its operator pays (§3.5)
  C (the recipient)  NOT BOUGHT YET. home <c home>, displayName DemoAgentC, alias demoagentc
  the stranger     a directory holding no key, no account, no stamp, no counter and no home
```

**C is a new agent because its home is new** (D-165): `<c home>/config.json` names C2OPERATOR as payer and carries
`agent.displayName` `DemoAgentC`, distinct from `Correspondent A`, `DemoAgentA2` and `Correspondent B` — §9.5
recomputes an agent's identifier from its profile's own name and version, so the name is chosen once and never
changed. The agent's own key is **not** in that file and never will be: it is born in C's own process on first run,
into `<c home>/keystore.json` (P-13). The dry run in §10 reports `keys born`, which is that happening.

**A2 takes no part in Gate Three** and its process stays down, for the same reason it stayed down for the reply: a
watcher that is up is the only thing that can answer a ring, and an answered ring is a lane that cannot be closed.

### 2. The quote, read from consensus before anything is bought

`PriceList` **sequence 4** is current — `0.0.10426551` #4 at `1789055861.123389104`, the schedule §14.3 makes the
sequence of messages, so the latest before the purchase governs.

```
  provisioning.unitPrice        "30"      ℏ, flat
  provisioning.registrationFee  "0.05"    ℏ
  bundle                        12 $POSTAGE for "1.00" USD, method hbar
  rate source   https://testnet.mirrornode.hedera.com/api/v1/network/exchangerate   (D-170)
```

At the rate record read 2026-09-10 — `cent_equivalent 225700`, `hbar_equivalent 30000`, **0.0752333333 USD per ℏ**:

```
  12 $POSTAGE (one bundle at "1.00" USD)      13.29198051 ℏ
  the provisioned path ("30" flat)            30.00000000 ℏ
                                              ------------
  C2OPERATOR pays the Postmaster              43.29198051 ℏ
  the Postmaster then funds C                  0.05000000 ℏ   registrationFee, a LEG of the sale and not a gift
```

**C2OPERATOR holds 458.65756285 ℏ**, read from the mirror against that quote — about ten times the price. The rate
moves between now and the run and the number the counter charges is the number at the purchase's own timestamp; this
quote fixes the *shape* and the order of magnitude, and `rate.at` in the receipt is what a Verifier re-obtains
(D-170). A2 paid 43.23883804 ℏ at sequence 4 yesterday, which is the same quote half a percent ago.

### 3. Every consensus write, in order, with its payer

**Act one — C's provisioning** (D-159's order as amended, D-168's carry):

| # | Write | Signs | Pays |
|---|---|---|---|
| 1 | the purchase — ONE transaction, THREE legs: ℏ to the Postmaster, 12 `$POSTAGE` to C's public-key alias **which creates C's account** (HIP-542), 0.05 ℏ from the Postmaster to that account | C's agent key | **C2OPERATOR** `0.0.10450880` |
| 2 | doorbell (HCS-10 inbound) — `hcs-10:0:60:0:<C>` · no submit key · admin C's · **HIP-991 fee of 1 `$POSTAGE` to the treasury, C's own key exempt** (D-137) · auto-renew C2OPERATOR | C's agent + operator | **the Postmaster**, carried |
| 3 | log (HCS-10 outbound) — `hcs-10:0:60:1` | C's agent + operator | the Postmaster, carried |
| 4 | manifest — `wishmail:manifest:1` | C's agent + operator | the Postmaster, carried |
| 5 | declaration registry (HCS-2) — `hcs-2:0:60` | C's agent + operator | the Postmaster, carried |
| 6 | HCS-11 profile file (HCS-1) — `<sha256>:brotli:base64`, **no admin key** (D-150) | C's agent + operator | the Postmaster, carried |
| 7 | the profile, as HCS-1 chunks — one HCS message per chunk, no `chunkInfo` | C's agent | the Postmaster, carried |
| 8 | HCS-2 register entry naming the profile file — memo `hcs-2:op:register:0` | C's agent | the Postmaster, carried |
| 9 | §9.2's account memo — `hcs-11:hcs://2/<registry>` | C's agent | the Postmaster, carried |
| 10 | `register_agent` on the HOL anchor `0.0.6913983` | C's agent | **C ITSELF** — the mirror must record C as payer or §9.5 assigns `blurred` (T-P13-4) |

**No `$POSTAGE` association transaction is expected.** C2OPERATOR's `max_automatic_token_associations` is **-1**, read
from the mirror, so the stamp associates itself as it arrives; `ensurePayerHoldsStamps` prints
`provision.autoassociates` and submits nothing. C's own account needs none either — HIP-542 creates it with unlimited
auto-associations, which the 2026-09-09 probe observed. **This is checked and not assumed, and it matters**: the
operator must be able to *hold* a stamp before B can ring anything, because §4.4's doorbell fee is debited from the
payer of the submission (HIP-991) and the payer here is the operator.

**Act two — B's letter to C, one `send()` call** (§6.4 in its written order):

| # | Write | Signs | Pays |
|---|---|---|---|
| 11 | **the stamp hop** — 1 `$POSTAGE` from B to C2OPERATOR, so the payer can pay the doorbell's fee (§4.4) | B's agent | C2OPERATOR |
| 12 | **the ring** — `connection_request` on C's doorbell, memo `hcs-10:op:3:1`. **The HIP-991 fee consumes that stamp to the treasury** | B's agent | C2OPERATOR |
| 13 | **B's outbound record of the ring** — `connection_request` on B's log `0.0.10452150`, memo `hcs-10:op:3:2`, in the OUTBOUND shape (`index.md:549-556`). **First time live** — the P-9 fix | B's agent | C2OPERATOR |
| 14 | C's watcher answers: **the lane** — threshold of exactly B's and C's account keys, admin C's, **no custom fee**, memo `hcs-10:1:60:2:<C's doorbell>:<n>` | C's agent | C2OPERATOR |
| 15 | C's **`connection_created` on its own doorbell** — memo `hcs-10:op:4:1`. §7.1's authority, and it goes before the log record | C's agent | C2OPERATOR |
| 16 | **C's outbound record of the lane** — `connection_created` on C's log, memo `hcs-10:op:4:2`, acceptor reading. **First time live** — D-174 | C's agent | C2OPERATOR |
| 17 | **B's outbound record of the lane** — `connection_created` on B's log, memo `hcs-10:op:4:2`, requester reading. **First time live** — D-174 | B's agent | C2OPERATOR |
| 18 | the resolution manifest on **B's** manifest topic `0.0.10452154` | B's agent | C2OPERATOR |
| 19 | **the settlement** — 2 `$POSTAGE` to the treasury under memo `wishmail:<aadHash>` | B's agent | C2OPERATOR |
| 20 | chunk 0 on the lane — HCS-10 `message`, memo `hcs-10:op:6:3`, no `chunkInfo` | B's agent | C2OPERATOR |
| 21 | **the ScheduleCreate** — inner: submit the receipt manifest to **C's** manifest topic; inner payer set explicitly to C2OPERATOR; `waitForExpiry` false; expiry **30 days**, under `SCHEDULE_MAX_LIFETIME` 5,356,800s | B's agent | C2OPERATOR |
| 22 | the `transaction` operation on the lane naming the schedule — **empty memo**, because HCS-10 gives it no enum slot (§6.1, T-P9-5) | B's agent | C2OPERATOR |

**Act three — C opens it, C acks, a stranger verifies:**

| # | Write | Signs | Pays |
|---|---|---|---|
| 23 | `inbox` at C — **writes nothing** (§6.5); surfaces the pending schedule | — | — |
| 24 | **C's `ack`** — a ScheduleSign. The instant it lands the network executes the inner submission, and the receipt manifest lands on C's manifest topic | C's agent | C2OPERATOR |
| 25 | the stranger's `verify`, twice — **reads only** (P-4) | — | — |
| 26 | B's `inbox` — reads nothing new; there is no reply this time | — | — |

**The postage arithmetic, and B ends at 8 stamps.** Body 32 bytes → one chunk → 1 ounce of 16. Postage is weight plus
the return-receipt fee of one stamp (§4.2, §7.5) = **2 stamps**; the ring costs **1** more at C's door. B holds 11
before and **8** after. C2OPERATOR receives one stamp and the doorbell's fee consumes it, so it ends at **0** again.
**C is charged nothing at any step** and its balances must be unchanged by the ack (T-P16-2).

### 4. The submit→learn window, per write, and how a rerun resumes from inside it

Every row is a signature leaving this process before its outcome is known. There is no offline consensus node, so this
is the window no check reaches (CLAUDE.md §12). The four rows the day taught are named first.

| Window | What can be true and unknown here | How a rerun resumes |
|---|---|---|
| **the ring landed, the answer is not yet visible** | the `connection_request` is on C's door and a stamp is gone; C may or may not have answered | **Wait, and spend nothing.** `send` rings at most ONCE per first contact and every attempt after it is a re-READ (30 s × 3). On a rerun, `pendingRequestOf` reads C's doorbell from consensus for a standing request of B's that no lane answers and **reuses it** — a second ring would be a second stamp, a second request for the watcher, and §7.1 then choosing between two lanes that cannot be closed |
| **a standing request is older than the window** | B rang, nobody answered inside 90 s | **A slip, and that is a result and not a failure** (F-6, §10.5). `send` returns an `AttemptedDeliverySlip`; the request and B's log entry stay on consensus with their timestamps; one stamp is consumed as the doorbell's fee and no envelope was assembled and no postage affixed. Ringing again is permitted (§10.5) and is **not** done without the word |
| **`send` died after the settlement, before the schedule** | 2 stamps are consumed and the envelope may be SETTLED with no receipt request | **Resume at step 7 from `<b home>/store/`.** The row is written *before* the transfer is submitted (P-7, D-165), so a later run can name the envelope and ask consensus about it. `--resume <envelopeId>` re-reads the lane, finds chunks present, and creates only the schedule. A rerun *without* resume composes a NEW envelope with a new nonce, and the first settlement becomes an **orphan** — reported under `orphans` (F-3), spent, nothing double-charged and nothing false on consensus |
| **an identical `ScheduleCreate` is submitted twice** | a schedule may exist and this process not know its id | **The ledger itself prevents two**, and it is FETCHED rather than assumed: an identical inner transaction returns **`IDENTICAL_SCHEDULE_ALREADY_CREATED`** and *the receipt of that transaction carries the id of the schedule that already exists* (`docs.hedera.com/hedera/core-concepts/scheduled-transaction`, FETCHED 2026-09-10, recorded in checkpoint two's gate report). `ops/hedera.ts` carries an entity id back on that failed status and `send` treats it as success. **Above it, step 7 reads the lane first**: a `transaction` operation whose `data` names this envelope is the request, and its schedule is reused. Two independent guards, the outer one free |
| the stamp hop (11) | B is down one stamp and the operator holds it | Nothing is lost: the stamp is on an account B's own operator controls and it pays the next doorbell fee. `ringStamp` moves one **only if the payer holds none and a door will actually be rung** — the fix checkpoint two's stray stamp bought |
| the purchase (1) | the transfer may have landed and the counter's record of it be gone | **The purchase is idempotent against consensus**: `buy_stamp` with `provision` refuses if the holder's account already exists, and C's account is derived from C's own key. A transaction id is single-use, so nothing is charged twice. **A receipt is NEVER reconstructed by the party that charged** — Gate One's rule, learned by deleting one |
| any mailbox row (2–9) | a topic may exist and C's record not name it | Every row is confirmed from a **mirror read** before the next is built, and `record.json` is written from that read. A rerun re-derives from consensus: `generate_mailbox` resolves C's own address first and does nothing if coordinates exist |
| `register_agent` (10) | the registration may be on the anchor and unknown here | It resolves under `hol` first and does nothing if a registration by this account exists. **A duplicate is not waste but damage**: §9.5 assigns `vague` where more than one names an address |
| the manifest (18) | on B's topic, sequence unknown | A rerun publishes a second; a manifest is content-addressed and both recompute to the same hash, so the second is a duplicate and not a contradiction. The envelope binds to the hash, never the sequence number |
| chunk 0 (20) | the letter is on the lane and this process does not know it settled | The envelope is SETTLED whatever this process believes; `npm run verify -- --lane <lane>` reads it back |
| the ack (24) | the ScheduleSign may have executed unseen | The execution is on consensus and idempotent: signing an executed schedule is refused by the network. `verify` is what says whether the receipt landed |

### 5. What the first live outbound records are expected to look like, on both logs

This is new to this gate and is the reason it is written down before the run: **three HCS-10 outbound records fire
live for the first time**, two of them under D-174 and one under the P-9 fix. Each is predicted here and confirmed
from the mirror afterwards.

**On B's log `0.0.10452150`, which has held nothing since it was created** — B has never rung a doorbell:

```
#1   memo hcs-10:op:3:2                          the ring, in the OUTBOUND shape (index.md:549-556)
     { "p": "hcs-10", "op": "connection_request",
       "operator_id": "<C's doorbell>@<C's account>",   <- the agent BEING requested (index.md:553)
       "outbound_topic_id": "0.0.10452150",
       "connection_request_id": <the ring's sequence number on C's doorbell> }

#2   memo hcs-10:op:4:2                          the lane, REQUESTER reading (D-174)
     { "p": "hcs-10", "op": "connection_created",
       "connection_topic_id": "<the lane>",
       "outbound_topic_id": "0.0.10452150",
       "requestor_outbound_topic_id": "0.0.10452150",   <- its own; redundant under this reading
       "confirmed_request_id": <sequence of C's connection_created on C's doorbell>,
       "connection_request_id": <the ring's sequence number, same as #1's>,
       "operator_id": "<C's doorbell>@<C's account>" }  <- the CONFIRMER (index.md:587)
```

**On C's log, which will hold exactly one thing:**

```
#1   memo hcs-10:op:4:2                          the lane, ACCEPTOR reading (D-174)
     { "p": "hcs-10", "op": "connection_created",
       "connection_topic_id": "<the lane>",
       "outbound_topic_id": "<C's log>",
       "requestor_outbound_topic_id": "0.0.10452150",   <- B's; load-bearing under this reading
       "confirmed_request_id": <sequence of C's OWN connection_created on its doorbell>,
       "connection_request_id": <the ring's sequence number on C's doorbell>,
       "operator_id": "<C's doorbell>@<C's account>" }  <- itself (index.md:529)
```

**The two records must agree on `connection_request_id` and on `connection_topic_id`, and must differ on
`requestor_outbound_topic_id` only in the sense that both name B's log** — which is the one place the two readings
happen to coincide, because B is the requester. They must **differ** in `outbound_topic_id`, each naming the log it
sits on. If either log holds two `connection_created` records for one lane, that is a stop: both writers read their
own log from consensus before writing.

**A2's log `0.0.10462708` #1 is not touched and is not repaired.** It is the one record on this deployment in the
wrong shape — the inbound body, naming A2 itself, two required fields absent — written before the P-9 fix. LIMITATIONS
L-1 names it. Conformance runs from the fix forward.

### 6. What it creates, and what it does not

Creates: C's account and six topics; C's HCS-11 profile and its HCS-2 entry; C's registration on the HOL anchor; one
lane; one `connection_request` and one `connection_created`; three outbound log records; B's resolution manifest; one
settlement; one chunk; one schedule; one `transaction` operation; one executed receipt manifest on C's manifest topic.

Does **not** create: any second lane; any message on A2's doorbell `0.0.10462704`, which must still hold **zero**;
any message on the Postmaster-agent's log `0.0.10426554`; any entity in `app/deployment/hedera-testnet.json`, which is
the Postmaster's ops record and takes no Correspondent id (CLAUDE.md §11).

### 7. The predicted standing, and it is a prediction

Derived from §11.5's table before running it:

```
  state       ACKED                       (§8.3 — one chunk delivered, and a receipt that recomputes)
  standing    unverified
  reasons     T-P12-4                     (§11.4 — the profile is not claimed, so the resolution is not replayed)
  receipt     acked
  trustClass  math, endorsements []       (declared, reported beside the standing, never folded in — P-12)
```

**`unverified` is correct and not a shortfall.** `RELEASE.classes` is empty and `RELEASE.profiles` is `{}`, so §9.6
makes a Verifier that claims no profile conforming — it verifies binding, postage and the receipt, and reports the
resolution unverified because it did not replay it. **Say it before the run, not after.**

**`T-P10-2` and `T-P17-2` MUST NOT appear**, and not because the lane is right — because a Verifier claiming no
profile never reaches either check (LIMITATIONS L-1). **`T-P9-3` must not appear**: B's `schemaRef` is
`hcs://13/0.0.10448509#1`, the registered one. **`T-P1-12` must not appear**: the header requests this receipt.

**The bundle will carry `spec: "0.5"`** — the first run of record to do so, under D-173, with the Verifier's own patch
`0.5.12` reported at `observations.verifierSpec`, outside the digest.

### 8. Every way it stops

- The provisioning dry run prints anything but the eleven-row plan in §10 → **stop**.
- The counter is not running, or refuses the quote → **stop**; nothing is signed before the counter answers.
- `buy_stamp` refuses because an account already exists under C's key → **stop and report**: C's home is supposed to
  be new, and an existing account means it is not.
- The purchase transfers and the counter's record of it is lost → **STOP. Do not reconstruct the receipt.** Gate One's
  rule, and the reason A is `stopped` and stays that way.
- Any mailbox row fails → **stop**; what landed is in `record.json` from a mirror read, and a resume is a decision.
- `register_agent` resolves `blurred` → **stop**: the registration's payer was not C, and §9.5 is right to say so.
- **The send dry run prints anything but `lane NONE — this is first contact` and `ring ONE stamp` from
  `0.0.10450880`** → **stop**. A found lane here would mean a lane between B and C already exists, which would mean
  something rang that should not have.
- `send` returns an `AttemptedDeliverySlip` → C's watcher did not answer inside 90 s. **That is a result, not a
  failure.** Report it, leave the request standing, and **do not ring again without the word**.
- `SEND_LANE_INVALID` → the lane C created is closed, carries a fee, or its key list is not exactly B's and C's keys
  → **stop**; no second lane is rung.
- `SEND_INSUFFICIENT_STAMPS` → B holds 11 and needs 3; this cannot fire without something else being wrong.
- `SEND_SUBMIT_FAILED` / `SEND_SETTLE_TIMEOUT` → the settlement stands and the envelope is partial or orphaned; read
  the mirror, report what is true and what is resumable, **wait**.
- Either outbound `connection_created` missing after the run → **report it, do not re-submit.** It is a log entry and
  the lane is authoritative; a second write is a decision and the record is best-effort by design (D-174).
- C's `inbox` does not open the letter byte for byte → **stop**. Do not re-send.
- `ack` returns `ACK_NOT_OPENED` → the schedule's body names a different identifier, postmark or epoch (T-P1-9) →
  **stop**; that is the check working.
- C's balances move by one tinybar or one stamp across the ack → **stop**: T-P16-2 is violated and that is a defect.
- The stranger's two `verify` runs disagree on the digest → **stop**: §11.7's MUST is violated.
- Any mirror readback disagreeing with what a process believes → the mirror is the record; **stop and report**.

### 9. What the offline courts prove, and what they leave out

`check:letter` is **187 assertions**, up from 155 today: both parties' outbound logs hold their `connection_created`
after a first contact, in their own readings, and a second letter records nothing twice. `check:hcs10` is **63**:
every field `index.md:578-588` marks required, on both records, plus the memo and the three places the two readings
part. The whole battery is **twenty-one `check:*` green**, with `typecheck` and `p13:check`.

**What they leave out, and no offline court can reach it.** Whether C's doorbell fee actually assesses against B's
operator; whether the lane's threshold key accepts B's signature; whether the mirror ingests in the order these
processes expect; whether an HCS-10 outbound record lands under the memo we set. And one specific to this gate:
**the acceptor's outbound record has no offline court for its behaviour at all**, only for its shape — `answer()`
takes a `Session` and a network, so §5's prediction is the only thing standing in for a test until it runs.

### 10. The provisioning dry run, verbatim, signing nothing

```
$ npm run correspondent:provision:plan -- "<c home>"

> wishmail@0.5.12 correspondent:provision:plan
> npm run correspondent:provision:plan --workspace app -- <c home>

> @wishmail/app@0.5.12 correspondent:provision:plan
> tsx sdk/provision.cli.ts --dry-run <c home>

  correspondent:provision — DRY RUN: nothing will be signed
  argv as received  ["--dry-run","<c home>"]
  to go live        pass --live, and check the line above says it arrived

  provisioning a Correspondent — D-159's order, DRY RUN

  home        <c home>
  network     testnet (hedera:testnet)
  keys        born
  agent key   204e085bce4b2e9f…
  x25519      K-UYc0KpyB800gGQ… epoch 1
  payer       0.0.10450880   (the operator pays; the agent signs — §3.5)
  counter     http://127.0.0.1:4600/mcp
  stamp token 0.0.10426208  treasury 0.0.10426205
  hol anchor  0.0.6913983
  account     NOT BOUGHT — the purchase creates it (§4.6, HIP-542)

  the plan — a PROVISIONING purchase (§4.6, D-168)

  the purchase — 3 legs, 1 transaction   signs: buyer             pays: POSTMASTER
                                         ℏ price → Postmaster · $POSTAGE treasury → the agent's public-key alias, which CREATES the account · registration fee ℏ → that account
  1 doorbell (HCS-10 inbound)            signs: agent + operator  pays: POSTMASTER (carried)
                                         hcs-10:0:60:0:(the account this purchase creates) · submit NONE · admin 204e085b… · fee 1 0.0.10426208 → 0.0.10426205 · exempt 1 · auto-renew 0.0.10450880
  2 log (HCS-10 outbound)                signs: agent + operator  pays: POSTMASTER (carried)
                                         hcs-10:0:60:1 · submit 204e085b… · admin 204e085b… · no fee · auto-renew 0.0.10450880
  3 manifest                             signs: agent + operator  pays: POSTMASTER (carried)
                                         wishmail:manifest:1 · submit 204e085b… · admin 204e085b… · no fee · auto-renew 0.0.10450880
  4 declaration registry (HCS-2)         signs: agent + operator  pays: POSTMASTER (carried)
                                         hcs-2:0:60 · submit 204e085b… · admin 204e085b… · no fee · auto-renew 0.0.10450880
  5 HCS-11 profile file (HCS-1)          signs: agent + operator  pays: POSTMASTER (carried)
                                         <sha256 of the profile>:brotli:base64 · submit 204e085b… · admin NONE · no fee · auto-renew 0.0.10450880
  6 the profile, as HCS-1 chunks         signs: agent             pays: POSTMASTER (carried)
                                         one HCS message per chunk, no chunkInfo, ≤1024 bytes on the wire (§7.4)
  7 HCS-2 register entry                 signs: agent             pays: POSTMASTER (carried)
                                         names the profile file · transaction memo hcs-2:op:register:0
  8 §9.2's account memo                  signs: agent             pays: POSTMASTER (carried)
                                         hcs-11:hcs://2/<the registry above> — the first link in the chain
  9 the receipt                          signs: (nothing)         pays: (nothing)
                                         the counter reads back every row it paid for and resolves the holder under §9.2 before it issues one
  10 register_agent                      signs: agent             pays: THE AGENT ITSELF
                                         the mirror must record THIS account as the payer, or §9.5 assigns `blurred` (T-P13-4)
  11 resolve self                        signs: (nothing)         pays: (nothing)
                                         under hcs14 and hol, and no `blurred` on either

  Beside them, paid by this operator on its own client and never carried: the $POSTAGE association, where this operator does not already hold the token. §4.4's doorbell fee is debited from the PAYER of a submission (HIP-991), and when this agent rings a door that payer is its own operator.

  DRY RUN: nothing was signed and nothing submitted.
```

**The driver printed its mode and the argv it received before it read a key**, which is CLAUDE.md §12's rule and the
reason it exists: on 2026-09-10 an appended `--dry-run` was eaten by a root script's nested npm and a Correspondent
was provisioned unauthorised. The `:plan` script string carries `--dry-run` where no forwarding can lose it, and the
echo above is npm's own proof that it arrived.

**`keys born` is the only thing that dry run changed**, and it changed it in `<c home>/keystore.json` and nowhere
else. That is D-165: keys are born once, in the agent's own process, on first run. Nothing was submitted, nothing was
paid, and C has no account.

### 11. The send dry run — WHY IT CANNOT BE RUN YET, and what it must print

**It is impossible before C exists, and that is a fact about the tool and not a gap in this report.** `letter:plan`
resolves the recipient under `hcs14` from consensus before it composes anything: account memo → declaration registry →
profile file → `properties.wishmail`. C has no account, no memo and no profile until act one runs, so `--to <C>`
can only return `RESOLVE_NOT_FOUND`. There is no address to give it.

So the ORDER's step 3 cannot carry this dry run, and **inventing its output would be worse than saying so.** What is
committed instead is the prediction, which the run then confirms or stops on:

```
  sender      0.0.10452127  (home <b home>)
  payer       0.0.10450880  — the operator pays; the agent signs (§3.5)
  doorbell    0.0.10452149   log 0.0.10452150   manifest 0.0.10452154
  schemaRef   hcs://13/0.0.10448509#1

  recipient   <C's account>  doorbell <C's doorbell>  manifest <C's manifest>
  resolution  math · 0 endorsement(s)
  epoch       1

  lane        NONE — this is first contact
  ring        ONE stamp to the payer 0.0.10450880 for the doorbell fee (§4.4)
  stamps      the agent holds 11

  body        inline text
  payload     32 bytes
  chunks      1 · CHUNK_WIRE_MAX 1000 bytes per operation (§7.4)
  weight      1 oz of 16 (§7.5)
  postage     2 stamp(s) = 1 weight + 1 receipt · returnReceipt true
  window      30 days = 2592000s, under SCHEDULE_MAX_LIFETIME 5356800s (§1.6)

  DRY RUN: nothing was signed and nothing submitted.
```

**The invocation, written here so it is not composed at the terminal:**

```
npm run letter:plan -- "<b home>" --to <C's account> \
  --text "Working hard or hardly working?" --receipt
```

`--receipt-window` is not passed: its default is already 30 days. **`--live` is baked into the `letter` script string**
where no forwarding can lose it, and `letter:plan` carries `--dry-run` the same way.

**If that dry run prints a lane, or `ring NONE`, or a payer other than `0.0.10450880`, or postage other than 2 —
stop, report, and wait.** Each of those would mean something is true that this report says is not.

### 12. The gate

**Sonic authorised Gate Three in advance** (RECORD, 2026-09-10): *"GATE — Gate Three (C's provisioning [through the
tools, with provenance], the ring, the certified letter, the ack): [ AUTHORIZED ]"*, under the standing rule that *"no
STOP line stands above the gate fill-in; the fill-in is the word."* The ORDER puts C's provisioning first, confirmed
from the mirror and idempotency-rerun, then B's send, then C's inbox and ack, then the stranger's verify, **each
consensus write confirmed from the mirror before the next, the process's own output read second.**

This report is committed before the first signature. The 0.5.12 patch it runs under is committed and tagged at
`v0.5.12`; D-174's code is committed; twenty-one `check:*` are green with `typecheck` and `p13:check`.

---

## Step 7 — GATE THREE, ACT ONE: C is provisioned. Run of record, 2026-09-10, and the send dry run the gate report could not carry

**C is on `hedera:testnet` and resolves under both profiles with no `blurred`.** The gate report above is left exactly
as it stood. This section records what act one did, the one divergence it turned up, and — committed **before B signs
anything** — the send dry run §11 of that report could not produce, because `letter:plan` resolves the recipient from
consensus and C did not exist until now.

### C, as consensus holds it

```
  account     0.0.10468684    memo hcs-11:hcs://2/0.0.10468693    12 $POSTAGE · 0.04614148 ℏ
  doorbell    0.0.10468687    hcs-10:0:60:0:0.0.10468684          0 messages
  log         0.0.10468689    hcs-10:0:60:1                       0 messages
  manifest    0.0.10468692    wishmail:manifest:1                 0 messages
  registry    0.0.10468693    hcs-2:0:60                          1 message
  profile     0.0.10468695    92e536324e042f1a11399831eafd5029ced33160f7397c40fc0cb8b08ca217da:brotli:base64
  uaid        uaid:aid:4suEWWSMHkLQheR6fkGYfbsfqNdJbEkx4MB1MQ3ts9FobsYLuYgnohXePbqcrp2N57
              ;uid=0.0.10468687@0.0.10468684;registry=self;proto=hcs-10;nativeId=hedera:testnet:0.0.10468684
```

**C's ℏ is 0.05 minus what it spent on its own name**: the registration fee arrived as a leg of the purchase and
`register_agent` consumed 0.00385852 of it. The agent holds ℏ once, spends it on one submission of its own, and holds
the remainder (§3.5, D-156).

### The purchase — one transaction, three legs, at sequence 4's price

```
reference     0.0.8641261@1789088736.041814712
consensus     1789088741.818406607        CRYPTOTRANSFER  SUCCESS
              43.38282123 ℏ   0.0.10450880 → the Postmaster
                              (12 stamps at 13.38282123, plus 30 ℏ for the provisioned path)
              12 $POSTAGE     0.0.10426205 → the agent's public-key alias, WHICH CREATED 0.0.10468684
              0.05 ℏ          the Postmaster → 0.0.10468684    (the registration fee, as a leg of the sale)
```

The `CRYPTOCREATEACCOUNT SUCCESS` record sits **first** under the same transaction id, at
`1789088741.818406606`, with no token transfers in it — HIP-542, and Gate One's second defect is why the counter reads
past it.

**The quote the gate report wrote down was 43.29198051 ℏ and the charge was 43.38282123 ℏ.** The difference is
0.09084072 ℏ, two tenths of one percent, and it is the exchange rate moving between the quote and the purchase — which
is exactly what §14.3 means by pricing a bundle in USD and charging in ℏ, and what `rate.at` in the receipt exists to
let a Verifier re-obtain (D-170). Nothing was mispriced.

### The eight carried rows, and the reprice answered again

Each body signed by C's agent key in C's own process, decoded by the counter before it would sign, paid for by
`0.0.8641261`. The payer on the mirror is the Postmaster for all eight — D-168's carry, for the third agent.

| Row | Entity | Charged |
|---|---|---|
| doorbell | `0.0.10468687` | **26.90214481 ℏ** |
| log | `0.0.10468689` | 0.40416115 ℏ |
| manifest | `0.0.10468692` | 0.40416115 ℏ |
| declRegistry | `0.0.10468693` | 0.40416115 ℏ |
| profileFile | `0.0.10468695` | 0.27033295 ℏ |
| profileChunks | 1 chunk on `0.0.10468695` | — |
| registryEntry | `0.0.10468693` #1 | — |
| accountMemo | `0.0.10468684` | 0.00428248 ℏ |
| **register_agent** | `0.0.6913983` #383 | 0.00385852 ℏ, **paid by `0.0.10468684` itself** |

**The doorbell came in at 26.90214481 ℏ**, against 26.61271103 for A2 and 26.31542199 for B — the same fee-gated
topic, drifting about one percent a day, which is a USD-denominated fee schedule charged in ℏ and the reason ledger
§G-20 says a flat price cannot track its own cost. Sequence 4's 30 ℏ still covers it, with less margin than yesterday.

### The acceptance test, which is the resolver and not this process

```
  hcs14   0.0.10468684 · doorbell 0.0.10468687 · manifest 0.0.10468692 · math · endorsements []
  hol     0.0.10468684 · math · endorsements []
```

**No `blurred` on either**, which is the whole point of `register_agent` paying with the agent's own account: §9.5
assigns `blurred` where the registration's payer is not the address's own account, and the mirror records
`0.0.10468684` as the payer of anchor message #383 (T-P13-4).

### The idempotency test, LIVE — because a dry run cannot demonstrate that a submitting run declines to submit

```
  correspondent:provision — LIVE: this run CAN SIGN and CAN SPEND
  argv as received  ["--live","…/demo/c"]

  keys        loaded
  account     0.0.10468684
  hcs14       resolves · doorbell 0.0.10468687 · 0 endorsement(s)
  hol         1 registration(s) name this account

  2. buy_stamp — skipped: 0.0.10468684 already exists, so this agent is returning (D-165)
     0.0.10468684 already has coordinates on consensus; its doorbell is 0.0.10468687. Nothing to create.
  3. register_agent — 0.0.10468684 is already registered on the anchor 0.0.6913983; nothing was submitted.

  provisioned. mailbox existing, registration existing, and no `blurred` on either resolution.
```

Exit 0. **Confirmed on consensus rather than from the process**: the HOL anchor's newest message is still **383**, the
treasury still holds 9958 `$POSTAGE`, and every balance is where the purchase left it. Every verb asked the ledger
first, so a wiped local file could not have caused a second doorbell or the duplicate §9.5 assigns `vague` to.

### DIVERGENCE — the driver did not exit after the purchase, and its console output was lost

**Everything on consensus is correct and nothing was repaired.** Two things went wrong above the ledger and both are
ours.

**First, the driver did not exit.** After `holRegistration` landed at `1789088792.075645154` the process stayed alive
with no further writes for more than fifteen minutes and was stopped. **The idempotency rerun of the same driver, on
the same home, exited 0 in seconds** — and the difference between them is that the rerun skips `buy_stamp` and so
never opens a connection to the counter. So the finding is: **a run that talks to the counter leaves something
holding the event loop open.** `Session.close()` releases the two Hedera `Client`s; nothing closes the counter's MCP
transport. Raised, not repaired: it is a defect in our driver, it cost nothing on consensus, and repairing it inside
a gate is exactly what the gate exists to prevent.

**Second, and this one is mine rather than the code's: the run's console output is gone.** I invoked it as
`… | tail -70`, and a pipe to `tail` delivers nothing until the writer closes — so when the process hung, every line
it had printed was still sitting in that buffer, and stopping the process discarded it. This project already has the
rule — *never pipe a long-running script through `tail` or `head`* — and I broke it. **Nothing was lost that matters**,
because the record is the mirror node and not a console: every id, fee and timestamp above was read back from
consensus, and `record.json` was written the same way, one entity at a time, as each landed. The rerun's output is
printed in full above and is what the first run would have ended with.

### The send dry run — committed BEFORE B signs anything

§11 of the gate report said this could not be produced until C was on consensus, and carried the prediction it must
match. Here it is, run against the C the purchase created.

```
$ npm run letter:plan -- "<b home>" --to 0.0.10468684 --text "Working hard or hardly working?" --receipt

> tsx sdk/letter.cli.ts --dry-run <b home> --to 0.0.10468684 --text Working hard or hardly working? --receipt

  letter — DRY RUN: nothing will be signed
  argv as received  ["--dry-run","<b home>","--to","0.0.10468684","--text","Working hard or hardly working?","--receipt"]
  to go live        pass --live, and check the line above says it arrived

  sender      0.0.10452127  (home <b home>)
  payer       0.0.10450880  — the operator pays; the agent signs (§3.5)
  doorbell    0.0.10452149   log 0.0.10452150   manifest 0.0.10452154
  schemaRef   hcs://13/0.0.10448509#1

  recipient   0.0.10468684  doorbell 0.0.10468687  manifest 0.0.10468692
  resolution  math · 0 endorsement(s)
  proof hash  3eb68be6bd3d727d1a94737cafe6dc9e065c39538104fdfbf471a52ced824ee5
  epoch       1

  lane        NONE — this is first contact; send rings the doorbell and waits (§6.4 step 1)
  stamps      the agent holds 11
  ring        one stamp, debited from 0.0.10450880 — §4.4's two-hop, the agent transfers it first

  body        inline text
  payload     31 bytes · sha256 73d41255a5a85bae224d03e837592c5e99c09a3264c000b3b347e85fd8e6b9a9
  ciphertext  47 bytes
  chunks      1 · CHUNK_WIRE_MAX 1000 bytes per operation (§7.4)
  weight      1 oz of 16 (§7.5)
  postage     2 stamp(s) = 1 weight + 1 receipt fee · returnReceipt true
  envelope id a1a2a60f0ea9af0bbc7183d66f5557503a90876864925d845d0d920dd149e433
  memo        wishmail:a1a2a60f0ea9af0bbc7183d66f5557503a90876864925d845d0d920dd149e433
  receipt     schedule paid by 0.0.10450880 — never the recipient (§10.4, T-P16-2)
  window      30 days = 2592000s, under SCHEDULE_MAX_LIFETIME 5356800s (§1.6)

  DRY RUN: nothing was signed and nothing submitted.
```

**Every stop condition §11 named is satisfied**: `lane NONE`, `ring` one stamp debited from `0.0.10450880`, postage
**2**, the receipt schedule paid by the operator and never the recipient, and a 30-day window under
`SCHEDULE_MAX_LIFETIME`.

**One number in the gate report's prediction was wrong and it is corrected here rather than in that report**: §11 said
the payload would be 32 bytes and it is **31** — `Working hard or hardly working?` is thirty-one characters and I
counted one too many. It changes nothing downstream: 31 bytes is one ounce exactly as 32 would be, the postage is the
same two stamps, and the ciphertext is 47 bytes. The prediction was wrong in the one place arithmetic could be checked
without the network, and saying so is cheaper than leaving a reader to find it.

**The envelope identifier above is not the one the live run will produce.** §7.2's AAD carries a fresh 16-byte nonce
per envelope, so the identifier changes on every composition and is pinned only when the live run seals.
---

## Step 7 — GATE THREE, ACTS TWO AND THREE: THE RUN OF RECORD, 2026-09-10

**The whole of §6.4 ran in one `send()` call.** First contact and the return receipt together — the ring, the wait,
the lane, the manifest, the affix, the chunk, the settle, the schedule and the `transaction` operation — and then C
opened it, C signed for it, and a stranger holding nothing read the correspondence back. **One pass, no stop.** The
gate report above is left exactly as it stood.

### The arrangement, as it ran

```
  the counter        STARTED for act one's purchase and STOPPED before the letter.
                     A letter buys nothing: B held eleven stamps and needed three.
  A2's process       NOT STARTED, and deliberately — the same reason as the reply.
  C's process        npm run correspondent -- <c home>, the doorbell watcher, started
                     before B rang and stopped as soon as the door was answered. ONE
                     instance, because a second would answer the same request twice
                     and §7.1's earliest-created lane would then have a twin.
  B's driver         npm run letter -- <b home> --to 0.0.10468684
                       --text "Working hard or hardly working?" --receipt
  C's reader         npm run inbox -- <c home>;  npm run ack:live -- <c home>
  the stranger       npm run verify -- --lane 0.0.10468898, twice, from a directory
                     holding no key, no account, no stamp and no home.
```

### What was signed, in order

| # | Act | Transaction / locator | Consensus | Signed by | Payer |
|---|---|---|---|---|---|
| 1 | one stamp to the payer (§4.4's hop) | `0.0.10450880@1789089975.643729693` | — | B's agent | `0.0.10450880` |
| 2 | **the ring** on C's doorbell | `0.0.10468687` #1 | `1789089986.351132013` | B's agent | `0.0.10450880` |
| 3 | **B's outbound `connection_request`** — the P-9 fix, first time live | `0.0.10452150` #1 | `1789089989.953139375` | B's agent | `0.0.10450880` |
| 4 | **the lane** | `0.0.10468898` | — | C's agent | `0.0.10450880` |
| 5 | C's `connection_created` on its own doorbell | `0.0.10468687` #2 | `1789090055.869169322` | C's agent | `0.0.10450880` |
| 6 | **B's outbound `connection_created`** — D-174, requester reading | `0.0.10452150` #2 | `1789090059.358173104` | B's agent | `0.0.10450880` |
| 7 | **C's outbound `connection_created`** — D-174, acceptor reading | `0.0.10468689` #1 | `1789090061.353197104` | C's agent | `0.0.10450880` |
| 8 | the resolution manifest | `0.0.10452154` #3 | — | B's agent | `0.0.10450880` |
| 9 | the settlement — **two** stamps | `0.0.10450880@1789090060.024182436` | `1789090067.539117004` | B's agent | `0.0.10450880` |
| 10 | chunk 0 on the lane | `0.0.10468898` #1 | `1789090073.365704969` | B's agent | `0.0.10450880` |
| 11 | the ScheduleCreate | `0.0.10468901` | — | B's agent | `0.0.10450880` |
| 12 | the `transaction` operation on the lane | `0.0.10468898` #2 | `1789090079.500349708` | B's agent | `0.0.10450880` |
| 13 | **C's ack** — the ScheduleSign | schedule `0.0.10468901` | executed `1789098271.804108896` | C's agent | `0.0.10450880` |
| 14 | the receipt manifest, by execution | `0.0.10468692` #1 | `1789098271.804108896` | (the schedule) | `0.0.10450880` |

```
lane        0.0.10468898        memo hcs-10:1:60:2:0.0.10468687:1
envelope    2229a6c909d4b6c53889d6fda5ee173ff322debec9010a6aaf9e5cb388079c01
body        "Working hard or hardly working?"
payload     31 bytes · sha256 73d41255a5a85bae224d03e837592c5e99c09a3264c000b3b347e85fd8e6b9a9
ciphertext  47 bytes · 1 chunk · weight 1 oz of 16 · postage 2 stamps (1 weight + 1 receipt fee)
manifest    0.0.10452154 #3 — on B's own manifest topic
settlement  from 0.0.10452127 to 0.0.10426205, memo wishmail:2229a6c9…
schedule    0.0.10468901 · expires 1791682075.000000000 · waitForExpiry false · 30 days
receipt     f38e23d881e6e22dcbb177ca3c4cfdf011f2ab0094214d6209cffb3fa9d94f91 on 0.0.10468692 #1
epoch       1 · schemaRef hcs://13/0.0.10448509#1
```

### The three outbound records, against what §5 of the gate report predicted

**This is the assertion Gate Three existed to make**, and all three landed in the shapes written down before the run.

**B's log `0.0.10452150`, which had held nothing since it was created:**

```
#1  {"p":"hcs-10","op":"connection_request","operator_id":"0.0.10468687@0.0.10468684",
     "outbound_topic_id":"0.0.10452150","connection_request_id":1}
#2  {"p":"hcs-10","op":"connection_created","connection_topic_id":"0.0.10468898",
     "outbound_topic_id":"0.0.10452150","requestor_outbound_topic_id":"0.0.10452150",
     "confirmed_request_id":2,"connection_request_id":1,"operator_id":"0.0.10468687@0.0.10468684"}
```

**C's log `0.0.10468689`:**

```
#1  {"p":"hcs-10","op":"connection_created","connection_topic_id":"0.0.10468898",
     "outbound_topic_id":"0.0.10468689","requestor_outbound_topic_id":"0.0.10452150",
     "confirmed_request_id":2,"connection_request_id":1,"operator_id":"0.0.10468687@0.0.10468684"}
```

**Field by field, against the prediction:**

- **The P-9 fix is on consensus in the pinned shape.** `#1`'s `operator_id` names **C** — "the agent which is being
  requested … (not the agent making the request)" (`index.md:553`) — with `outbound_topic_id` and
  `connection_request_id` both present. A2's log `0.0.10462708` #1, written before the fix, names A2 itself and lacks
  both. Conformance from the fix forward, exactly as LIMITATIONS L-1 says.
- **The two records agree where they must**: `connection_topic_id` `0.0.10468898` and `connection_request_id` `1`,
  which is the ring's sequence number on C's door.
- **They differ in `outbound_topic_id`**, each naming the log it sits on.
- **`requestor_outbound_topic_id` is `0.0.10452150` in both**, which the gate report predicted and explained: under
  the requester reading it is B naming itself (redundant), and under the acceptor reading it is C naming B
  (load-bearing) — and here those coincide because B is the requester. **C could only learn it by reading B's HCS-11
  profile**, which is what D-174 costs and what it paid.
- **`confirmed_request_id` is `2` in both**, and for different reasons: for B it is the sequence number of the
  `connection_created` on C's door that confirmed its request; for C it is the sequence number of the message it
  posted there itself. The pin's `:585` fits the first and strains for the second, which is the contradiction, written
  out rather than smoothed.
- **One record per log for this lane**, no duplicates: both writers read their own log from consensus first.

### Nothing was rung that should not have been, and it is a count

```
  A2's doorbell  0.0.10462704   0 messages before   0 messages after   UNCHANGED
  B's doorbell   0.0.10452149   2 messages before   2 messages after   UNCHANGED
  C's doorbell   0.0.10468687   0 messages before   2 messages after   the ring and its answer
  B's log        0.0.10452150   0 messages before   2 messages after   both records above
  C's log        0.0.10468689   0 messages before   1 message  after   the acceptor's record
  the lane       0.0.10468898   did not exist       2 messages         chunk 0 and the transaction op
  the A2-B lane  0.0.10464056  13 messages before  13 messages after   UNTOUCHED
```

**One ring, one lane, one answer.** B's own doorbell was not rung and A2 took no part in any of it.

### The money, read before and after

| Account | ℏ before | ℏ after | Δ | `$POSTAGE` before | after | Δ |
|---|---|---|---|---|---|---|
| B's agent `0.0.10452127` | 4,622,564 | 4,622,564 | **0** | 11 | 8 | **−3** |
| C's agent `0.0.10468684` | 4,614,148 | 4,614,148 | **0** | 12 | 12 | **0** |
| C2OPERATOR `0.0.10450880` | 41,527,474,162 | 40,821,468,299 | −706,005,863 | 0 (unassociated) | 0 | **0** |
| the treasury `0.0.10426205` | — | — | — | 9,958 | 9,961 | **+3** |

**T-P16-2 holds, and it is the sharpest line in the table**: C's account did not move by one tinybar or one stamp
across the ack. The recipient is not charged for a receipt, and the ScheduleSign's own fee was paid by the operator.

**B spent three stamps** — one at C's door and two as postage — and **the treasury gained exactly three**. B's agent
account did not move by one tinybar across five submissions: the agent signs and the operator pays (§3.5).

**The stamp hop worked on an unassociated account.** C2OPERATOR held no `$POSTAGE` and never had, because B had never
rung a doorbell; its `max_automatic_token_associations` is `-1`, so the stamp associated itself on arrival and the
HIP-991 fee consumed it in the same second. It ends at zero, holding nothing it did not need. **This was read from the
mirror before the run and written into §3 of the gate report**, because the alternative — the transfer failing with
`TOKEN_NOT_ASSOCIATED_TO_ACCOUNT` after a ring had already been paid for — is exactly the class of defect that has no
offline court.

### `inbox` at C — the letter opened by the agent that was rung

```
  inbox — 0.0.10468684, home <c home>
  lanes  0.0.10468898   — from consensus, by §7.1's rule

  envelope   2229a6c909d4b6c53889d6fda5ee173ff322debec9010a6aaf9e5cb388079c01   lane 0.0.10468898
  opened     true
  payload    "Working hard or hardly working?"
  bytes      31

  1 delivery(ies). inbox wrote nothing (§6.5).
```

**C found the lane from its own doorbell**, which is the ordinary direction: C answered, so the
`connection_created` is on C's door. **31 bytes, byte for byte**, and `inbox` wrote nothing.

### `ack` at C — every check before the signature, then the signature

```
  envelope   2229a6c909d4b6c53889d6fda5ee173ff322debec9010a6aaf9e5cb388079c01
  lane       0.0.10468898   chunk 0 at sequence 1
  epoch      1   — the epoch it OPENED under, which is what a receipt names
  schedule   0.0.10468901   requested on the lane at sequence 2
  hdr.rr     true   — the sender's postage paid the receipt fee (§7.7)
  inner      ConsensusSubmitMessage to 0.0.10468692, 508 bytes, chunk_info none
  payer      0.0.10450880   — not the recipient (T-P16-2)
  expires    1791682075.000000000   waitForExpiry false
  composes   f38e23d881e6e22dcbb177ca3c4cfdf011f2ab0094214d6209cffb3fa9d94f91
  carries    EXACTLY those bytes (T-P1-9)

  SIGNED     schedule 0.0.10468901
  executed   1789098271.804108896
  receipt    f38e23d881e6e22dcbb177ca3c4cfdf011f2ab0094214d6209cffb3fa9d94f91
  published  0.0.10468692 #1
```

**`ack` recomposed the receipt from the envelope, the postmark and the epoch and compared it to the bytes the schedule
already carried, before signing** — T-P1-9 — and the instant the signature landed the network executed the inner
submission onto C's manifest topic, a topic only C's key can write to.

### `verify` from a stranger holding nothing

Run twice, from a directory holding no key, no account, no stamp, no counter and no home.

```
  bundle digest   34b314c4be0f8262bdeb613b166dfac28174a75a30d506c583f763c6f5b0c017   (BOTH runs)
  narrative.bundleDigest matches the bundle   true

    envelope      2229a6c909d4b6c53889d6fda5ee173ff322debec9010a6aaf9e5cb388079c01
    state         ACKED
    chunks        1 · settlement 0.0.10450880@1789090060.024182436
    APPRAISED     unverified      reasons  T-P12-4
    DECLARED      trust class math · 0 endorsement(s)
    resolution    unverified (T-P12-4)
    receipt       acked
```

**THE NARRATIVE'S FIRST SENTENCE IS D-173 ON A RUN OF RECORD FOR THE FIRST TIME:**

> "This reading covers 2 topic(s) on hedera:testnet, from consensus timestamp 1789090073.365704969 to
> 1789090073.365704969, **under specification 0.5**."

Not `0.5.12`. The bundle carries the **minor** version, the Verifier's own patch rides in
`observations.verifierSpec` outside the digest, and **this digest will still reproduce at 0.5.13 and at every later
patch of 0.5** — which is what §11.7's MUST asks for and what no digest in this file before today could give.

### The appraisal against the prediction

| | predicted | observed |
|---|---|---|
| state | ACKED | **ACKED** |
| standing | unverified | **unverified** |
| reasons | `T-P12-4` and nothing else | **`T-P12-4`** |
| receipt | acked | **acked** |
| trust class | `math`, endorsements `[]` | **`math`, `[]`** |
| `T-P10-2` / `T-P17-2` | MUST NOT appear | **absent** |
| `T-P9-3` | must not appear | **absent** |
| `T-P1-12` | must not appear | **absent** |
| the bundle's `spec` | `"0.5"` | **`"0.5"`** |

Exactly as §7 of the gate report predicted, and `unverified` is correct rather than a shortfall: this release claims
no profile, so §11.4 does not replay the resolution and §9.6 makes that conforming.

### The fixture

**`conformance/fixtures/gate-three-certified.json`** — the lane, its birth doorbell `0.0.10468687` reached by
following the lane's own memo, B's manifest topic, C's manifest topic, the schedule `0.0.10468901` and the two
registered schema topics.

```
  topics      0.0.10452154, 0.0.10468898, 0.0.10468687, 0.0.10448509, 0.0.10448507, 0.0.10468692
  schedules   0.0.10468901
  envelope    2229a6c909d4b6c53889d6fda5ee173ff322debec9010a6aaf9e5cb388079c01
  appraised   unverified (T-P12-4)
  digest      34b314c4be0f8262bdeb613b166dfac28174a75a30d506c583f763c6f5b0c017
```

### The offline court over these bytes — `check:gate3`, 81 assertions

`npm run check:gate3` reads the fixture and **no network** (P-4), and it is the twenty-second check in the battery.

It proves three things only real bytes can prove. **The lane's birth walks from the lane itself** — the memo to C's
door, that door's memo to C, the answer on it to B — on a door that had never been rung before, with the parties
supplied to nothing. **Both outbound `connection_created` records are on the network in the two readings the pin
contradicts itself between**: `check:letter` makes the MODEL wear those shapes, and this asks whether the network
does. **The bundle carries the minor version**, so flipping `RELEASE.spec` to another patch of 0.5 inside the test
leaves the digest exactly where it is — and this is the first fixture in this project that needs **no spec-string
substitution at all**, because it was captured under a release that already writes `0.5`.

**Four alterations are refused** — a changed header, a settlement memo naming another envelope, a settlement affixed
by an account the chunks do not name, and no settlement at all — each driving the standing no higher than it stood and
each moving the digest with the bytes.

**And two are MEASURED AS UNSEEN.** A lane whose memo names a door holding no answer for it, and a lane whose submit
key carries a third key, change **nothing**: not the standing, not the reasons, **not even the digest**. That is not a
gap in the test — it is §11.4's lane-provenance check being dark under a release that claims no profile, which
LIMITATIONS L-1 states in words and this states as a number. `check:letter` refuses both of them under a claimed
profile on the modelled ledger, which is where the rule is proved. **The day this release claims `hcs14`, those two
assertions flip and this check will say so by failing** — which is the right way round for a court to be wrong.

The fixture was re-captured with `--topic 0.0.10452150 --topic 0.0.10468689` so both outbound logs are in it. **The
bundle digest did not move**, which is the proof that a stored topic a Verifier does not read changes no evidence:
§11.2's ingestion table does not reach an HCS-10 outbound topic, and those records bear on no standing. They are in
the file because a court wanted to see them beside the bundle, and the file says which is which.

### DIVERGENCES — three, none of them on consensus, and every one of them ours

**1. The provisioning driver does not exit after a run that talks to the counter.** Recorded in act one's section
above. Raised, not repaired.

**2. `inbox.cli.ts` does not render a pending receipt request, and the gate report said it would.** §3's row 23 of
that report says `inbox` "surfaces the pending schedule"; the CLI prints the envelope, whether it opened, the payload
and the byte count, and nothing else. **The information is not missing from the tool** — `check:letter` asserts the
pending schedule surfacing at `inbox`, and `ack` found the schedule on the lane immediately afterwards and named it —
**it is missing from this one renderer.** A display gap in a CLI, written down rather than quietly fixed mid-gate.
The gate report is not amended.

**3. The first provisioning run's console output was lost to a `tail` pipe.** Act one's section says so in full. Mine,
against a rule this repository already carries.

**Nothing on consensus diverged.** Every submission landed where the gate report said it would, in the order it said,
at the price it quoted, and no stop fired.
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

## SUPERSEDED DIAGNOSIS — why the provisioning driver did not exit. Written 2026-09-11, from the code and not from a run

**Gate Three's run of record is not amended, and this section does not amend it.** Step 7, act one, §"DIVERGENCE —
the driver did not exit after the purchase, and its console output was lost" stands exactly as it was written on
2026-09-10, including the sentence this section supersedes. A gate report and its run of record are what somebody
believed at the time they signed; correcting them afterwards would make them a description of the past written by
someone who already knew the answer. **What is corrected is the diagnosis, here, dated, with what replaces it and
what is still unknown.**

### What the run of record says

> *"`Session.close()` releases the two Hedera `Client`s; nothing closes the counter's MCP transport."*

### Why that cannot be it

**Both closes exist, and both predate Gate Three.**

- `app/sdk/counter.ts:490-492` — `buyStamps` ends in `finally { await client.close(); }`, where `client` is the
  Streamable HTTP MCP transport to the counter. It has been there since the first Correspondent commit.
- `app/sdk/provision.cli.ts:60-61, 269-271` — the driver keeps an `open: Set<Session>` and closes every member in a
  `.finally`. Added **2026-09-09**, the day *before* the gate.

So on 2026-09-10 the transport was already being closed, and the sentence names a cause that was not available.

### What actually pins a Node process on this path

**The Hedera SDK arms a twenty-four-hour, non-`unref`'d timer in every `Client` constructor, and only `close()`
clears it** — `node_modules/@hashgraph/sdk/lib/client/Client.cjs`:

```
  :158   this._networkUpdatePeriod = 24 * 60 * 60 * 1000;
  :165   this._scheduleNetworkUpdate();
  :864   _scheduleNetworkUpdate() { this._timer = setTimeout(async () => { ... }, this._networkUpdatePeriod); }
  :834   close() { ...; clearTimeout(this._timer); }
```

A timer that is not `unref`'d holds the event loop for its whole period. **A carried boot constructs two clients** —
`app/sdk/session.ts:223-226` — because there are two payers and a client *is* its payer.

That fits the observation exactly, and it fits the isolation too: the rerun skipped `buy_stamp`, constructed no extra
clients, and exited in seconds.

### The leak that can be named with certainty

`app/sdk/counter.ts:443`:

```ts
const carried = await boot(s.home, { payer: legs, expectAccount: true });
```

`carried` is released **only** by being returned at `:466` and added to the caller's `open` set at
`app/sdk/provision.cli.ts:204`. `buyStamps`'s own `finally` (`:490-492`) closes the MCP client and **not** `carried`.
**Every throw between `:443` and `:466` therefore leaks two Hedera clients and two twenty-four-hour timers:**

- the account-mismatch throw, `counter.ts:444-449`;
- anything raised inside `generateMailbox`, `counter.ts:452` — which includes every carry-leg refusal from
  `app/sdk/carry.ts:102-115`;
- the receipt-loop ceiling, `counter.ts:473-482`;
- the `STAMP_PAYMENT_FAILED` at `counter.ts:469-472`.

The fix is one `finally` reaching `carried`. It is **not** made in this section, which is a reading and not a change.

### What is NOT attributed, and is not guessed

**Gate Three's first provisioning run appears to have taken the happy path** — `register_agent` runs after
`buyStamps` (`provision.cli.ts:231`) and its submission landed at `1789088792.075645154`. On that path `carried` is
returned, every session is in `open`, and the driver's `.finally` closes all of them.

**So the specific hang of that specific run is not explained by the leak above, and this section does not claim it
is.** Two candidates can be named and neither can be confirmed by reading:

1. Global `fetch` keep-alive sockets. `app/src/ops/mirror.ts:36` uses bare global `fetch`, as does the MCP transport,
   and nothing in `app/` ever calls `setGlobalDispatcher` or closes an agent. Undici's default keep-alive is seconds,
   not fifteen minutes, so on its own this explains a delay and not a hang.
2. `main()` never returning, in which case no `.finally` ran at all. The candidates after `register_agent` are the
   two `resolve` calls at `provision.cli.ts:236-238`, both bounded mirror reads.

**Deciding it needs one run under `--trace-exit`, or a `process.getActiveResourcesInfo()` dump at the end of
`main()`.** That run has not been made. Until it is, what this repository knows is: the recorded cause is wrong, the
SDK timer is the mechanism that can hold this process, one certain leak exists on the error paths, and the happy-path
hang is unattributed.

### And the console output

The second half of that divergence needs no correction. The run was invoked through `| tail -70`, a pipe to `tail`
delivers nothing until the writer closes, and stopping the hung process discarded the buffer. The rule was already in
this repository and was broken. Nothing that matters was lost, because **the record is the mirror node and not a
console**.

## Process lifecycle for the demo processes. Written 2026-09-11, before Gate Zero

**An ops item, not a specification one.** Nothing below is in `spec/`, nothing below changes a wire string, and none
of it is conformance. It is how the two Correspondent processes and the counter are started, stopped and kept from
treading on each other while goose drives them — which had never been arranged, because until today every gate was
driven by a CLI that ran once and exited.

### What was true before, and why no gate had met it

The Correspondent MCP server had **no way out**. `Watcher.stop()` existed and was never called; there was no
`process.on` for any signal anywhere in `app/`; and there was no close handler on the transport. The doorbell watcher
is a five-second `setTimeout` that is not `unref`'d, so it alone holds the event loop open indefinitely.

So when a client closed stdio, the process **did not exit**. It went on auto-accepting connection requests, creating
lanes and spending the operator's ℏ with nobody attached — and the next client started a **second** watcher on the
same doorbell.

### The three things that now hold, each proved by a run

**1. The server exits when the client hangs up, and says where it stopped.**

`SIGINT`, `SIGTERM` and `SIGHUP` are handled, and so is the client closing stdio. Shutdown stops the watcher from
starting anything new, releases the Hedera clients, prints the state it stopped at, and exits **0**.

**An in-flight write is not abandoned, because it cannot be.** A submission that has left this process has an outcome
on consensus whatever happens next; killing the wait for it loses only our knowledge of it, which is the submit→learn
window CLAUDE.md §12 names. So the shutdown line says exactly that, and names `npm run verify -- --lane <lane>` as
what reads it back.

**A finding, and it is the SDK's rather than ours.** `transport.onclose` is not enough and a server that relies on it
will not exit. `StdioServerTransport` subscribes to `data` and `error` on stdin **and to nothing else**
(`@modelcontextprotocol/sdk/dist/esm/server/stdio.js:37-38`), so its `onclose` fires when something calls `close()`
and never when the client hangs up. It was found by closing stdin and watching the process stay up for thirty
seconds, not by reading the code. The server now listens on `process.stdin`'s own `end` and `close` as well.
`Protocol.connect()` chains a handler already on the transport rather than replacing it
(`shared/protocol.js:220-223`), so keeping both costs nothing.

```
$ node closeprobe.mjs <home>          # initialize, then close stdin the way goose would

  wishmail correspondent — DRY RUN: nothing will be signed
  argv as received  ["…/dryhome","--dry-run"]

  DRY RUN — no payer key was read and no client has an operator; the doorbell watcher is NOT running.

  --- server answered; now closing stdin the way goose would ---

  wishmail correspondent — stopping: the client closed stdio.
    home            …/dryhome
    account         (not bought yet)
    doorbell watch  was not running
    in flight       nothing this process can lose: every submission that left it has an outcome on
                    consensus, and `npm run verify -- --lane <lane>` is what reads it back.

  RESULT: the server exited with code 0
```

Before the fix that same probe printed `RESULT: STILL RUNNING after 30s — it did not exit`.

**2. One live process per home.**

A home IS the agent (D-165), and two processes on one home are one agent running twice. For reading that is merely
wasteful. **For the watcher it is not recoverable**: it decides what is outstanding by reading consensus, which is
idempotence against a *ledger* and not uniqueness against a *process*, so two watchers can both find one connection
request unanswered and both create a lane — neither writes anything the other can see until both have signed. §7.1
then takes the earliest-created as *the* lane and the other is permanent litter on a topic that **cannot be closed**.

`<home>/run.lock` holds a PID. A second live process is refused with a message naming the one that holds it; a
**stale** lock — the process is gone — is taken over and says whose it was, because an agent that will not start
after a crash is an agent whose operator learns to delete files to make it go. It is the one place a Correspondent
treats a local file as an authority, and it is an authority about *this machine's processes* and never about
consensus.

**A dry run takes no lock.** It starts no watcher and can sign nothing, so rehearsing beside a live agent is safe and
is not made awkward.

Courted in `check:correspondent` — six assertions, including a refusal against a PID that is genuinely alive and is
not the test's own, since asking one process to take its own lock twice is a restart and not a collision.

**3. A carried session is released on every path.**

`buyStamps` boots a second session to stand the mailbox up, and a carried boot constructs **two** Hedera clients.
Every `Client` arms a twenty-four-hour network-refresh timer that is not `unref`'d and is cleared only by `close()`
(`@hashgraph/sdk/lib/client/Client.cjs:158,165,834-839,864-874`), so a client nobody closes keeps its process alive
for a day. That session was released only by being *returned* — so every throw between the boot and the return leaked
both clients, which is nine error paths. It is now held in the function's own scope and closed in the `finally` on
every path that did not hand it back.

**This does not explain Gate Three's hang and is not offered as if it did.** That run took the happy path. The
superseding section above says what is known and names the `--trace-exit` run that would attribute the rest.

### What is not built

`start` / `stop` / `status` wrappers with a tree-aware kill are **not** built. The lock makes the failure they were
meant to prevent refuse loudly instead of happening silently, and goose starts and stops the servers itself, so a
wrapper would be a fourth thing to keep correct for the length of one demo. Named here rather than left to be
noticed.

## GATE ZERO — goose drives the Correspondent. Gate report, written 2026-09-11 before any signature

**What this answers, and why it is its own gate.** Three gates have run on `hedera:testnet` and **every one of them
was driven by a command-line driver** — `letter.cli.ts`, `provision.cli.ts`, `ack.cli.ts`. The Correspondent's MCP
server has never been driven by an MCP client on consensus. Today's reading found three defects living in exactly
that gap, all now fixed (`provenance/PROBES-2026-09-11.md`), and the honest conclusion is that **"does goose drive
this server" is a question with an answer nobody has, and it should not be asked for the first time inside Gate
Four.** Gate Four asks whether a brand-new HBAR-only operator wallet survives the whole lifecycle. This asks whether
the surface works at all. Conflating them means a failure in either is a failure in both.

**IT IS A GATE AND NOT A PROBE, and the distinction is CLAUDE.md §11's.** A probe is disposable: throwaway keys born
in the run and discarded with it, and **never the real `$POSTAGE` and never the real doorbell**. This run uses the
real stamp token, the real counter, the real treasury and the real HOL anchor, and it creates **permanent entities**
that cannot be deleted — six topics per agent, of which an HCS-1 file topic has no admin key at all. Calling it a
probe would be calling something disposable that nobody can dispose of. So it gets the full discipline: this report,
committed before the first signature; a run of record after it with every transaction id and every mirror readback;
and **Sonic's word** at the bottom.

**Its entities are RESIDUE, and are recorded as such.** They are inputs to a rehearsal and not part of the deployment.
`app/deployment/demo-agents.hedera-testnet.json` already carries a `residue` category and `ENTITIES.md` renders it.

---

### 1. The parties, and what each is

| Role | Account | What it is here |
|---|---|---|
| **C1OPERATOR** | `0.0.10450879` | An operator wallet we already own, funded, `max_automatic_token_associations` **−1**. Pays for agent **X**. |
| **C2OPERATOR** | `0.0.10450880` | The same, for agent **Y**. |
| **X** | created by its purchase | A throwaway Correspondent in a fresh home. New keys, new account. |
| **Y** | created by its purchase | The same. X writes to Y. |
| The counter | `npm run counter` on loopback | The Postmaster's MCP endpoint. It must be up for `buy_stamp` and for nothing else. |
| The stranger | no home at all | `npm run verify`, holding no key, no account, no stamp and no counter (P-4). |

**Read from the mirror at 2026-09-11, and written down because a receipt cannot show it:**

```
  0.0.10450879   414.9907 ℏ   $POSTAGE 1   max_automatic_token_associations -1
  0.0.10450880   408.2147 ℏ   $POSTAGE 0   max_automatic_token_associations -1
  treasury 0.0.10426205        $POSTAGE 9,961
  A2 6 · B 8 · C 12
```

**C1OPERATOR holds one stamp already, and that is not a mistake.** It is the stray stamp checkpoint two's defect
bought — `ringStamp` used to move one whether or not a door would be rung. The fix is that both callers now ask
§7.1's own rule first, and the consequence for this run is that **X's first contact will hop no stamp**: the payer
already holds one, `ringStamp` returns null, and that stamp pays the doorbell's fee. **X therefore spends one stamp
fewer than Y would in the same position**, and the arithmetic below says so rather than being surprised by it.

---

### 2. What it creates, per agent

The six-row template, D-147 and D-150, unchanged:

| # | Entity | Shape |
|---|---|---|
| 1 | the account | created by the purchase's stamp transfer to the agent's public-key alias (HIP-542) |
| 2 | doorbell — HCS-10 inbound | `hcs-10:0:60:0:<agent>` · no submit key · admin the agent's · **HIP-991 fee of 1 `$POSTAGE` to the treasury, the agent's own key exempt** (D-137) |
| 3 | log — HCS-10 outbound | `hcs-10:0:60:1` |
| 4 | manifest topic | `wishmail:manifest:1` |
| 5 | declaration registry — HCS-2 | `hcs-2:0:60` |
| 6 | HCS-11 profile file — HCS-1 | `<sha256>:brotli:base64`, **no admin key** (D-150) — permanent, and the reason "throwaway" is the wrong word |

Plus, per agent: the profile's HCS-1 chunks, the HCS-2 `register` entry, §9.2's account memo, and one registration on
the HOL anchor `0.0.6913983` **paid by the agent itself** (§9.5, T-P13-4).

Then, between them: **one lane**, born on Y's doorbell when Y's watcher answers X's ring.

---

### 3. The quote, read from consensus before anything is bought

`PriceList` **sequence 4** on `0.0.10426551`, consensus `1789055861.123389104`, read from the mirror today:

```
  provisioning   { method: "hbar", unitPrice: "30", registrationFee: "0.05" }
  hbar stamps    rate { pair HBAR/USD, reference 0.10 USD,
                        source .../api/v1/network/exchangerate }   bundle 12 for 1.00 USD
```

So each provisioning purchase is **30 ℏ + 0.05 ℏ + twelve stamps at the day's exchange rate**, which at Gate Three's
rate came to **43.38 ℏ**. The quote and the actual both go in the run of record; the gap between them is the ℏ rate
moving between the two, which is why D-170 put the rate and the instant it was read into the receipt.

**The Postmaster loses money on each and that is recorded, not discovered.** A mailbox measured 27.78 ℏ at Gate One
and its doorbell alone has cost 26.32, 26.61 and 26.90 ℏ on three consecutive days (LIMITATIONS L-5, ledger §G-20).
Two mailboxes is roughly **56 ℏ of the Postmaster's payer** against 60 ℏ taken. It is within the ceiling the carry
policy authorises and it is not a defect.

---

### 4. Every consensus write, in order, with its payer

**Act one — X is provisioned, then Y.** Per agent, ten writes:

| # | Write | Signs | Pays |
|---|---|---|---|
| 1 | the purchase — ONE transaction, THREE legs: ℏ to the Postmaster, 12 `$POSTAGE` to the agent's key alias **which creates the account**, 0.05 ℏ from the Postmaster to it | the agent | **that agent's operator** |
| 2–6 | the five topics of the template | agent + operator | **the Postmaster**, carried |
| 7 | the profile's HCS-1 chunks | the agent | the Postmaster, carried |
| 8 | the HCS-2 register entry | the agent | the Postmaster, carried |
| 9 | §9.2's account memo | the agent | the Postmaster, carried |
| 10 | `register_agent` on `0.0.6913983` | the agent | **THE AGENT ITSELF** — the mirror must record it as payer or §9.5 assigns `blurred` |

**No association transaction is expected for either operator.** Both read `−1` today. `ensurePayerHoldsStamps` reads
the mirror, prints `provision.autoassociates` and submits nothing where a wallet auto-associates. **If either reads
anything else on the day, it will submit one `TokenAssociateTransaction` paid by that operator, about 0.05 ℏ** — and
that is the code working, not a stop.

**Act two — X's letter to Y, one `send()` call:**

| # | Write | Signs | Pays |
|---|---|---|---|
| 11 | the stamp hop — 1 `$POSTAGE` X → C1OPERATOR **only if C1OPERATOR holds none**. It holds one, so **this should not happen** | X | C1OPERATOR |
| 12 | the ring — `connection_request` on Y's doorbell. **The HIP-991 fee consumes one stamp to the treasury** | X | C1OPERATOR |
| 13 | X's outbound record of the ring, on X's log | X | C1OPERATOR |
| 14 | Y's watcher answers: **the lane**, submit key a threshold of exactly X's and Y's keys, no custom fee | Y | C2OPERATOR |
| 15 | Y's `connection_created` on its own doorbell — §7.1's authority | Y | C2OPERATOR |
| 16 | Y's outbound record of the lane, acceptor reading | Y | C2OPERATOR |
| 17 | X's outbound record of the lane, requester reading (D-174) | X | C1OPERATOR |
| 18 | the resolution manifest, on **X's** manifest topic | X | C1OPERATOR |
| 19 | **the settlement** — the envelope's postage to the treasury under memo `wishmail:<aadHash>` | X | C1OPERATOR |
| 20 | chunk 0 on the lane | X | C1OPERATOR |
| 21 | the **ScheduleCreate** — inner: the receipt manifest to **Y's** manifest topic; inner payer C1OPERATOR; expiry 30 days | X | C1OPERATOR |
| 22 | the `transaction` operation on the lane naming the schedule — **empty memo** (§6.1, T-P9-5) | X | C1OPERATOR |

**Act three:**

| # | Write | Signs | Pays |
|---|---|---|---|
| 23 | `inbox` at Y — **writes nothing** (§6.5) | — | — |
| 24 | **Y's `ack`** — a ScheduleSign; the network executes the receipt onto Y's manifest topic the instant it lands | Y | C2OPERATOR |
| 25 | the stranger's `verify`, twice — **reads only** | — | — |

**The postage arithmetic.** A short body is one ounce; with `returnReceipt` the postage is weight + 1 = **2 stamps**,
and the ring costs **1** more at Y's door — paid by the stamp C1OPERATOR already holds. So **X: 12 → 10**, the
treasury **+3**, and **Y is charged nothing at any step**, including across the ack (T-P16-2).

---

### 5. The submit→learn window, per write, and how a rerun resumes from inside it

Every row above is a signature leaving a process before its outcome is known, and **no offline check reaches it,
because there is no offline consensus node** (CLAUDE.md §12).

| Window | What can be true and unknown | How a rerun resumes |
|---|---|---|
| the purchase landed, the answer was lost | the transfer is on consensus and the counter's record of it may be gone | **The reference is the transfer's own transaction id**, written down before the signature left. Calling `buy_stamp` again with the same arguments resumes it and never buys twice (T-P11-5). **If the counter's record is gone: STOP. Do not reconstruct the receipt** — Gate One's rule, and the reason Correspondent A is `stopped`. |
| any mailbox row | a topic may exist and the agent's record not name it | Every row is confirmed by a **mirror read** before the next is built. A rerun re-derives from consensus: `generate_mailbox` resolves the agent's own address first and does nothing if coordinates exist. |
| `register_agent` | the registration may be on the anchor and unknown here | It resolves under `hol` first and does nothing if one by this account exists. **A duplicate is damage and not waste**: §9.5 assigns `vague` where more than one names an address. |
| **the ring landed, the answer is not yet visible** | the request is on Y's door and a stamp is gone; Y may or may not have answered | **Wait, and spend nothing.** `send` rings at most once and every attempt after is a re-READ (30 s × 3). A rerun finds the standing request on consensus and reuses it. A second ring is a second stamp and a second lane, **and a lane cannot be closed**. |
| the window closed with no answer | Y's watcher was not running | **A slip, which is a result and not a failure** (F-6). One stamp is consumed at the door, no envelope is assembled, no postage is affixed. **Do not ring again without the word.** |
| `send` died after the settlement | postage is consumed and the envelope may be SETTLED with no receipt request | The row is written **before** the transfer is submitted, so `--resume <envelopeId>` re-reads the lane and creates only what is missing. A rerun *without* resume composes a new envelope and the first settlement becomes an **orphan** — spent, reported under `orphans` by a Verifier that reads the treasury window, which **this release does not** (L-13). |
| an identical `ScheduleCreate` twice | a schedule may exist and this process not know its id | The ledger refuses a second: `IDENTICAL_SCHEDULE_ALREADY_CREATED` carries the existing id, and step 7 reads the lane first. Two guards. |
| the ack | the ScheduleSign may have executed unseen | Execution is on consensus and idempotent; signing an executed schedule is refused by the network. `verify` is what says whether the receipt landed. |

---

### 6. What it asserts from the mirror, and never from a receipt

Before: both operators exist, are not deleted, hold enough ℏ, and their `max_automatic_token_associations` is read
and written down. After each write: the entity exists with the shape it was created under — the doorbell's custom fee
is one unit of `0.0.10426208` collected by `0.0.10426205` with the agent's key exempt; the lane's submit key is a
threshold of **exactly** two keys; the profile file's memo carries the digest of the bytes on it.

The acceptance test for provisioning is **not** this process's output: it is **the resolver**, run against each
agent's own address under `hcs14` and under `hol`, and **`hol` must return no `blurred`** — which is the one fact the
funded registration fee exists to buy.

---

### 7. Idempotency, and every way it stops

Every provisioning verb is idempotent **against consensus and never against local state**. A wiped home causes no
second doorbell and no duplicate registration.

- The MCP server prints anything but `DRY RUN`/`LIVE` with the argv that carried it → **stop**.
- The counter is not running, or refuses the quote → **stop**; nothing is signed before it answers.
- `buy_stamp` refuses because an account already exists under that agent's key → **stop and report**: the home is
  supposed to be new.
- The purchase transfers and the counter's record is lost → **STOP. Do not reconstruct the receipt.**
- Any mailbox row fails → **stop**; what landed is in `record.json` from a mirror read, and a resume is a decision.
- `register_agent` resolves `blurred` → **stop**: the payer was not the agent, and §9.5 is right to say so.
- `send` returns an `AttemptedDeliverySlip` → Y's watcher did not answer in 90 s. **A result, not a failure.** Report
  it, leave the request standing, **do not ring again without the word**.
- `SEND_LANE_INVALID` → the lane is closed, carries a fee, or its key list is not exactly X's and Y's → **stop**.
- Y's `inbox` does not open the letter byte for byte → **stop. Do not re-send.**
- `ack` returns `ACK_NOT_OPENED` → the schedule's body names a different identifier, postmark or epoch (T-P1-9) →
  **stop**; that is the check working.
- **Y's balances move by one tinybar or one stamp across the ack → stop**: T-P16-2 is violated.
- The stranger's two `verify` runs disagree on the digest → **stop**: §11.7's MUST is violated.
- Any mirror readback disagreeing with what a process believes → **the mirror is the record; stop and report.**
- **A second Correspondent refuses to start on a home** → that is the new lock working. Stop the first.

---

### 8. What the dry runs proved, and what they cannot

Run today, against a home whose payer key is **deliberately unparseable**, so a process that reads it cannot boot:

```
  wishmail correspondent — DRY RUN: nothing will be signed
  argv as received  ["…/dryhome","--dry-run"]

  DRY RUN — no payer key was read and no client has an operator; the doorbell watcher is NOT running.

  tools/list → send.inputSchema  { coordinates, payload, returnReceipt, window, receiptWindow }, required [coordinates, payload]
                send.outputSchema required field ["result"]

  resolve 0.0.10468684 → coordinates, proof 5ed559e1…, from a mirror node and nothing else
  send(coordinates from resolve, base64 payload, returnReceipt)
        → SEND_UNRESOLVED: this agent has no account yet; the purchase creates it (§4.6, HIP-542)

  buy_stamp → DRY RUN — would buy 12 stamp(s) and provision this agent’s mailbox

  <client closes stdio>
  wishmail correspondent — stopping: the client closed stdio.   exit 0
```

**What that proves.** The server boots without reading a payer key. An MCP client builds a `send` call **from the
published schema** and the handler accepts it — the shape that returned `address is required` this morning. The
resolution is a mirror read and produces real coordinates for a real agent. The refusal that remains is the correct
one for an unprovisioned home. The process exits 0 when the client hangs up and names where it stopped.

**The same home under `--live` prints `LIVE` and then dies reading the key** — which is the difference between
*cannot* and *will not*.

**What no dry run reaches.** Whether Y's doorbell fee actually assesses against C1OPERATOR; whether the lane's
threshold key accepts X's signature; whether the mirror ingests in the order these processes expect; whether the
counter's carry policy signs every row of a real template; and whether goose's own MCP client validates
`structuredContent` the way the reference one does. **That is what this gate is for.**

The offline courts stand at **twenty-two `check:*` green**, with `check:letter` at 199 assertions — including a real
`SendResult` and a real slip validated against `send`'s own published `outputSchema`, which is where that defect was
caught.

---

### 9. The arrangement, and which process is up when

```
  1.  the counter         UP FIRST: `npm run counter`. Needed for `buy_stamp` and nothing else.
  2.  X's process         `npm run correspondent:live -- <X home>` under goose. Its watcher
                          starts when there is a door.
  3.  Y's process         the same, on Y's home. **Y's watcher must be running for the ring
                          to be answered**; if it is not, `send` returns a slip.
  4.  the stranger        `npm run verify -- --lane <lane>`, from anywhere, holding nothing.
```

Each Correspondent takes the lock on its own home. A second process on either is refused with a message naming the
one that holds it.

---

### 10. The gate

Nothing in this run signs until this report is committed and Sonic has said the word. **The fill-in is physical, not
paper**: everything rehearsed above ran with the server in DRY, where no client has an operator. `AUTHORIZED` means
the servers are stopped and restarted with `--live`, and their banners say so with the argv that carried the flag.

It runs under HEAD at the time, with the spec at `v0.5.13`, twenty-two `check:*` green, `typecheck` and `p13:check`
green, and the conformance report at 44 passing with digest `51453eea…` unmoved through every change of the day.

  **GATE ZERO — [ AUTHORIZED — Sonic, 2026-09-11: "Proceed Gate Zero." ]**

## GATE ZERO — the roles as ruled, the pre-flight, and what GREEN is. Written 2026-09-11, before any signature

**The gate report above is not edited.** It was written before the first signature and it stays as it stood, roles
and arithmetic included. This section supersedes two of its numbers on Sonic's ruling (RECORD, 2026-09-11) and adds
the two things it did not carry: the pre-flight, and the exact observable that means the run is done.

**No code moves from here until the gate runs.** Preparation is read-only; the homes below are local files and local
keys and touch no ledger. After the run, the only code that may move is a **goose-surface break found in the run**;
anything else found is recorded here and not fixed.

---

### 1. The roles, reversed on purpose

| | Home | Agent | Operator | Why this way round |
|---|---|---|---|---|
| **SENDER** | `gz-x` | `DemoAgentX` | **C2OPERATOR `0.0.10450880`** | It holds **zero `$POSTAGE`** — Gate Three's ring consumed the one it had. So §4.4's hop, through the MCP handler's own pre-check, **runs for the first time under goose**. |
| **RECIPIENT** | `gz-y` | `DemoAgentY` | **C1OPERATOR `0.0.10450879`** | It holds the **stray stamp** checkpoint two's defect bought. On the answering side it is never spent, so the run shows it sitting untouched. |

The gate report above has these the other way round, and under that arrangement the hop would not have fired at all —
the sender's payer would already have held a stamp and `ringStamp` would have returned null. **Reversing them is what
makes the untested path the one that runs.**

Both homes were created 2026-09-11 under `~/.wishmail/demo/`, outside the repository and gitignored. Each carries its
operator's payer block, copied from a home that already runs on that wallet, and nothing else; the agent's own keys
were **born on the first boot of the pre-flight below**, in the agent's own process, and no key was printed, logged
or written inside the repository (P-13; `npm run p13:check` green).

### 2. The arithmetic, corrected for those roles

Payload: **one short sentence, well under 200 bytes**, so chunk 0 is the only chunk. Certified, `returnReceipt`
requested. The recipient acks from its own goose.

```
  weight            1 ounce  (one chunk)
  postage           weight 1 + receipt fee 1          = 2 stamps to the treasury
  the door          1 stamp at the RECIPIENT's door   (HIP-991, consumed to the treasury)

  X   12 -> 9       two as postage, one hopped to its payer for the ring
  C2OPERATOR  0 -> receives 1 -> the doorbell fee consumes it -> 0
  Y   12 -> 12      the recipient is charged nothing, at any step, including across the ack (T-P16-2)
  C1OPERATOR  1 -> 1  the stray stamp is NOT spent: the answering side pays in ℏ, and Y's own key is
                      fee-exempt on Y's own doorbell (D-137), so `connection_created` costs no stamp
  treasury    9,961 -> 9,964
```

**The hop is the line to watch.** `ringStamp` fires only where a door will actually be rung *and* the payer holds no
stamp — both true here for the first time on this surface. If it does not fire, or fires for a reply, that is a
finding.

### 3. The pre-flight, in DRY — verbatim

Both homes, each its own process, each built from the schemas the server itself published.

```
---------------- SENDER  (~/.wishmail/demo/gz-x) ----------------

  wishmail correspondent — DRY RUN: nothing will be signed
  argv as received  ["C:/Users/Sonic/.wishmail/demo/gz-x","--dry-run"]
  to go live        restart with --live, and check the line above says it arrived

wishmail correspondent — home C:\Users\Sonic\.wishmail\demo\gz-x, keys born, account (not bought yet), payer 0.0.10450880
  DRY RUN — no payer key was read and no client has an operator; the doorbell watcher is NOT running.

---------------- RECIPIENT  (~/.wishmail/demo/gz-y) ----------------

  wishmail correspondent — DRY RUN: nothing will be signed
  argv as received  ["C:/Users/Sonic/.wishmail/demo/gz-y","--dry-run"]
  to go live        restart with --live, and check the line above says it arrived

wishmail correspondent — home C:\Users\Sonic\.wishmail\demo\gz-y, keys born, account (not bought yet), payer 0.0.10450879
  DRY RUN — no payer key was read and no client has an operator; the doorbell watcher is NOT running.
```

`keys born` on both: this was each agent's first boot, and the keystore is written once (D-165).

The four verbs, each called as its published schema describes:

```
  resolve     in { address, profile }                                     required ["address"]
  buy_stamp   in { count, payment, holder, provision }                    required ["count","payment","holder"]
  send        in { coordinates, payload, returnReceipt, window, receiptWindow }
                                                                          required ["coordinates","payload"]
  inbox       in { since, lane }                                          required []

  SENDER    buy_stamp  -> DRY RUN — would buy 12 stamp(s) and provision this agent’s mailbox
                          holder { publicKey 22cd19c2… }  buyer 0.0.10450880
  RECIPIENT buy_stamp  -> DRY RUN — would buy 12 stamp(s) and provision this agent’s mailbox
                          holder { publicKey 20ae2f8e… }  buyer 0.0.10450879
  SENDER    resolve 0.0.10468684
                       -> coordinates, proof 5ed559e1…, doorbell 0.0.10468687, manifest 0.0.10468692
  SENDER    send { coordinates from resolve, base64 payload, returnReceipt }
                       -> SEND_UNRESOLVED: this agent has no account yet; the purchase creates it (§4.6, HIP-542)
  RECIPIENT inbox {}   -> INBOX_MIRROR_UNREACHABLE: this agent has no doorbell on consensus; buy a mailbox first

  calls rejected by the protocol: 0
  both processes DRY: true
```

**Every call was accepted and answered.** The two refusals are the correct states of an unprovisioned home and not
rejections: `send` accepted coordinates straight from `resolve` — the handoff that returned *"address is required"*
this morning — and refused only because there is no account to send from yet.

### 4. Three things this pre-flight does NOT show, named rather than implied

1. **The counter was never contacted.** `buy_stamp` in DRY reports the purchase it would make and **stops before the
   first leg**, so it does not run §14.2's quote. That is a deviation from the ruling that shaped this mode, which
   said the quote step — being read-only — should run; it was built to stop earlier so that a rehearsal does not
   require a counter to be standing. **The consequence is that the counter's liveness and the quote it would issue
   are unproved here**, and the first thing the live run does is find out. The price is not unknown: `PriceList`
   sequence 4 was read from consensus today (`{method: hbar, unitPrice: 30, registrationFee: 0.05}`, stamps rate-priced
   at 0.10 USD with a twelve-for-1.00 bundle). Changing the DRY leg is a code change and is not made now.
2. **`inbox` answers a missing mailbox with `INBOX_MIRROR_UNREACHABLE`.** The mirror is reachable; the agent has no
   doorbell. The code is a declared failure of the tool and the message says the real reason, so nothing is broken —
   but the code names the wrong cause on the one surface a caller reads codes from. **Recorded, not fixed.**
3. **This was driven by a reference MCP client over real stdio, not by goose.** The protocol, the schemas and the
   banners are the same; what is untested is goose's own client. **Sonic's own pre-flight under goose should print
   the same two banners**, and if it does not, that is the stop.

### 5. WHAT GREEN IS

The golden path is **chunk 0's consensus postmark → the recipient's `ScheduleSign` executing the receipt manifest.**
The run is done when **both** of these are true on a mirror node, read after the ack and not before:

**(a) The schedule has executed.**

```
  GET /api/v1/schedules/<scheduleId>      ->  executed_timestamp   NOT null
  https://hashscan.io/testnet/schedule/<scheduleId>
```

**(b) The receipt manifest is on the RECIPIENT's own manifest topic**, at a sequence number, with the hash the
schedule carried:

```
  GET /api/v1/topics/<Y's manifest topic>/messages?limit=25&order=asc
      ->  one message whose decoded bytes hash to the receipt manifest's hash
  https://hashscan.io/testnet/topic/<Y's manifest topic>
```

And the chain that joins them, each read from consensus:

```
  chunk 0        lane <lane>  sequence 1   consensus <ts>     https://hashscan.io/testnet/topic/<lane>
  the request    lane <lane>  sequence 2   the `transaction` operation naming <scheduleId>
  the execution  <executed_timestamp>      strictly after chunk 0
  the receipt    <Y's manifest topic> #<n>
```

**That is the stop-touching-code moment.** When (a) and (b) hold, the run of record is written from the mirror and
nothing else is changed. If either is absent, report what is true at the stop and what is resumable, and **wait** —
`ack` on an executed schedule is refused by the network, so a second attempt is safe but is a decision, not a
reflex.

**What GREEN is not.** It is not `send` returning; `send` returns after the ScheduleCreate and before anyone signs
(P-14, T-P14-1). It is not the card saying a receipt was requested. It is the execution, on consensus, read back.

### 6. The gate

Nothing has signed. The pre-flight above ran with both servers in DRY, where no payer key is read and no client has
an operator. **`AUTHORIZED` means stopping both servers and restarting them with `--live`**, each banner saying so
with the argv that carried the flag, and the counter up.

### 7. The counter, proved standing — one quote, 2026-09-11

**A quote is §14.2’s first leg and it is a READ.** The counter prices the purchase from the `PriceList` on
consensus and writes down a requirement it would honour; nothing is signed, nothing is transferred, and no
consensus write happens. It answers the one thing the DRY pre-flight cannot (§4 above), which is whether the
counter is up and what it would charge.

```
  $ npm run counter
    the counter is at http://127.0.0.1:4600/  — buy_stamp, verify, resolve (§14.2)

  buy_stamp { count 12, provision true, payment { method hbar, from 0.0.10450880 },
              holder { publicKey <DemoAgentX’s agent key, DER> } }

  -> PAYMENT_REQUIRED, flagged as an error, which is MCP’s rule and not ours (L-5)

     reference     0.0.8641261@1789158553.982134520     expires 2026-09-11T20:30:59.059Z
     stamps        13.52746875 ℏ   (the 12-for-$1.00 bundle, at HBAR/USD 0.07392366
                                     read from the network’s own ExchangeRateSet at 1789156861.328314291)
     provisioning  30 ℏ
     registrationFee 0.05 ℏ       funded by the Postmaster into the account the purchase creates
     from          PriceList sequence 4, consensus 1789055861.123389104
     node          0.0.8            carriedBy 0.0.8641261
```

**It matches sequence 4 as consensus holds it**, read independently from the mirror the same day:
`provisioning {method hbar, unitPrice "30", registrationFee "0.05"}`, and `hbar` stamps rate-priced against
`reference 0.10 USD` with a twelve-for-`1.00` bundle. **So the buyer’s two ℏ legs come to 43.52746875 ℏ**, against
Gate Three’s 43.38282123 ℏ on 2026-09-10 — the difference being the ℏ rate moving between the two days, which is
exactly what D-170 put the rate and its instant into the receipt for.

The counter was stopped again afterwards and port 4600 is closed. **It is Sonic’s to start at the gate**, and the
quote above expires on its own; a purchase resumes from a reference or it does not happen.

### 8. The default with no flag, and a junction that does not work — 2026-09-11

**With NEITHER `--dry-run` NOR `--live`, the server is DRY. It is not a refusal to start, and it is not live.**
`app/src/ops/mode.ts:46-47` reads the two flags independently; `:51` exits 2 only when BOTH arrive; and
`app/sdk/server.ts:566` is the line that decides everything else:

```ts
  const dryRun = !mode.live;
```

**The default is keyed off `--live` ALONE**, so anything that is not an arriving `--live` — a missing flag, a
misspelled flag, a flag eaten by a forwarding script — leaves the process DRY. That is §12's rule as written
(*"a flag that does not arrive now leaves the process in DRY RUN, which is the only arrangement where losing an
argument is safe"*), and it is what the 2026-09-10 incident bought. Demonstrated rather than read:

```
  $ node <tsx> <server.ts> ~/.wishmail/demo/gz-x          # no flag at all

    wishmail correspondent — DRY RUN: nothing will be signed
    argv as received  ["C:/Users/Sonic/.wishmail/demo/gz-x"]
    DRY RUN — no payer key was read and no client has an operator; the doorbell watcher is NOT running.
```

No §12 violation, and no code change is needed for it.

**A JUNCTION AT A SPACE-FREE PATH DOES NOT WORK, and it fails SILENTLY.** A junction
`C:\Users\Sonic\wishmail-repo` → the repo root was created (no administrator rights needed) and the server launched
through it. **It printed nothing and exited 0.** Not a crash, not a refusal — a process that starts, does nothing,
and goes away, which under goose is an extension that never answers.

The cause is the entrypoint guard, `app/sdk/server.ts`:

```ts
  const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
```

**Node resolves a junction to its real path for `import.meta.url` and leaves `process.argv[1]` as given**, so the two
never match through a link and `main()` is never called. Measured, not inferred:

```
  via the junction     argv[1]          C:\Users\Sonic\wishmail-repo\probe.mjs
                       import.meta.url  file:///C:/The_Fountain/ETHGlobal%20Hackathon/.../probe.mjs
                       MATCH            false
  via the real path    MATCH            true
```

`--preserve-symlinks` and `--preserve-symlinks-main` do **not** help: tsx is the main module and its loader resolves
the real path regardless. All three combinations were tried and all three exited 0 in silence.

**Two launch shapes DO work, and both were proved from an unrelated working directory (`C:\Windows`), with the real
path and no junction.** One command string with the space-bearing paths quoted, run through `cmd`; and a command
plus an argument array, where the space needs no quoting because each path is one element. Both print the banner,
answer `initialize` on stdout, and exit 0 when stdin closes.

**What would make the junction work is one line** — comparing real paths in that guard rather than strings — and
**it is not made here**, because the ruling for today is that no code moves unless the default-mode question demands
it, and it did not. Recorded for a decision rather than taken.

**One further thing checked while here, because the stop condition now rests on it.** Between `buyStamps` entry
(`app/sdk/counter.ts:244`) and its `connect()` to the counter (`:273`) **nothing signs, submits, transfers, freezes
or executes.** So a LIVE session meeting a counter that is down fails at the connection, before any signature — which
is what makes "a connection error to `127.0.0.1:4600` means that session is LIVE" a safe thing to stop on.


### 9. ADDENDUM — the folder is renamed, and the goose entries. 2026-09-11, after the pre-flight and before the gate

**The gate report is not edited by this**, nor is anything it asserts changed by it. What follows is dated and sits
beneath it, as a correction or an addition to a run of record does.

**The repository's parent folder is renamed** from `ETHGlobal Hackathon` to `ETHGlobal_Hackathon`, by Sonic, after
this session reports done and every process holding the folder is closed. The reason is the space: Goose Desktop
takes an extension's command as one string and splits it, so a path with a space in it cannot be given to it
unquoted, and the junction that would have avoided the space **does not work** (§8 above). Removing the space from
the real path is the remedy that needs no code and no link.

**NOTHING ON CONSENSUS IS AFFECTED, and nothing off it either except paths.** No entity, no account, no topic, no
transaction id, no home and no key depends on where this repository sits on a disk:

- **`~/.wishmail/demo/` is outside the repository and always has been.** All eighteen files under it were searched
  and **not one references the repository's path**: a home carries a network name, a mirror URL (null, meaning the
  network's own), the counter's loopback address, an operator's payer and the agent's public identity, and nothing
  else. The six homes — `a`, `a2`, `b`, `c`, `gz-x`, `gz-y` — are unaffected.
- **No lock or PID file exists anywhere under `~/.wishmail`**, which is itself the confirmation that a DRY run takes
  no lock: both Gate Zero homes were booted in DRY today and neither left a `run.lock`.
- **The junction at `C:\Users\Sonic\wishmail-repo` is removed** (`rmdir`, which removes a link and never its target;
  the target was counted before and after and is intact). It would have dangled after the rename.
- **goose's own configuration is unaffected.** Its two path-bearing extension entries name
  `C:/The_Fountain/hologlass/...` and `C:/The_Fountain/ontologic-x402-bounty/...`, which are other projects and are
  not under `ETHGlobal Hackathon`.
- The Postmaster's own state, `.wishmail-state/`, is **inside** the repository and moves with it.

#### The two Goose Desktop entries — TESTED 2026-09-11, at the post-rename real path

Written against the **post-rename** real path, and **the from-anywhere proof was run at that path on 2026-09-11**,
which was the condition they were drafts until. The transcript is beneath them. They are entries.

```
  Name         DemoAgentX
  Type         STDIO
  Description  DemoAgentX (SENDER, DRY RUN — signs nothing): resolves addresses, reads its inbox and
               verifies on hedera:testnet; buy_stamp, send and ack report what they would do.
  Command      node C:/The_Fountain/ETHGlobal_Hackathon/WISHMail/WISHMail/node_modules/tsx/dist/cli.mjs C:/The_Fountain/ETHGlobal_Hackathon/WISHMail/WISHMail/app/sdk/server.ts C:/Users/Sonic/.wishmail/demo/gz-x --dry-run
  Timeout      900

  Name         DemoAgentY
  Type         STDIO
  Description  DemoAgentY (RECIPIENT, DRY RUN — signs nothing): resolves addresses, reads its inbox and
               verifies on hedera:testnet; buy_stamp, send and ack report what they would do.
  Command      node C:/The_Fountain/ETHGlobal_Hackathon/WISHMail/WISHMail/node_modules/tsx/dist/cli.mjs C:/The_Fountain/ETHGlobal_Hackathon/WISHMail/WISHMail/app/sdk/server.ts C:/Users/Sonic/.wishmail/demo/gz-y --dry-run
  Timeout      900
```

#### The from-anywhere proof at the renamed path — 2026-09-11, DRY, signing nothing

Run from `C:\Windows`, an unrelated working directory, with the real path and no junction. **Both launch shapes were
run**: the argument-array shape, and — because Goose Desktop takes the command as ONE STRING and splits it on
whitespace — the single-string shape through `cmd`, unquoted, which is the shape the Command field above actually
becomes. The two produced byte-identical output.

```
  $ cd /d C:\Windows
  $ node C:/The_Fountain/ETHGlobal_Hackathon/WISHMail/WISHMail/node_modules/tsx/dist/cli.mjs C:/The_Fountain/ETHGlobal_Hackathon/WISHMail/WISHMail/app/sdk/server.ts C:/Users/Sonic/.wishmail/demo/gz-x --dry-run

  stderr:
    wishmail correspondent — DRY RUN: nothing will be signed
    argv as received  ["C:/Users/Sonic/.wishmail/demo/gz-x","--dry-run"]
    to go live        restart with --live, and check the line above says it arrived

  wishmail correspondent — home C:\Users\Sonic\.wishmail\demo\gz-x, keys loaded, account (not bought yet), payer 0.0.10450880
    DRY RUN — no payer key was read and no client has an operator; the doorbell watcher is NOT running.

  stdout (the JSON-RPC channel, and NOTHING else is on it):
    {"result":{"protocolVersion":"2024-11-05","capabilities":{"tools":{}},
      "serverInfo":{"name":"wishmail-correspondent","version":"0.5.13"}},"jsonrpc":"2.0","id":1}

  <client closes stdio>
    wishmail correspondent — stopping: the client closed stdio.
    home / account / doorbell watch / in flight, each named

  EXIT CODE 0
```

**Four things that proof carries, and one it does not.** The banner arrives and names the mode. `argv as received`
shows the home **and** `--dry-run`, so the flag reached the process and was not eaten — which is §12's rule met
on this surface. **No npm was involved**: `node` was invoked directly, so there is no forwarding script between
the command and the process, and the argv line is the process's own report of what reached it. `initialize` is
answered on stdout with one well-formed JSON-RPC frame and **no banner text on that channel**, which is why the
banner is on stderr. The process exits **0** when stdin
closes and says where it stopped. It does **not** prove goose's own client: this was a file on stdin, not Goose
Desktop, and whether goose validates `structuredContent` the way the reference client does is still what the gate
is for.

`keys loaded`, not `keys born` — the keystore was written once, at the pre-flight's first boot (D-165), and this
run read it. **The home is unchanged**: `config.json` and `keystore.json` only, no `record.json`, still
unprovisioned. **No `run.lock` was taken and no process survived the run** — `node`, `tsx` and `esbuild` all
count zero before and after.

**For the gate**, the same two entries with the last argument changed and the description telling the truth about it:

```
  Description  DemoAgentX (SENDER, LIVE — CAN SIGN AND SPEND): buys its mailbox, rings doorbells, posts
               certified mail and acks, paying from operator 0.0.10450880.
  Command      … C:/Users/Sonic/.wishmail/demo/gz-x --live

  Description  DemoAgentY (RECIPIENT, LIVE — CAN SIGN AND SPEND): buys its mailbox, answers its doorbell,
               opens certified mail and signs for it, paying from operator 0.0.10450879.
  Command      … C:/Users/Sonic/.wishmail/demo/gz-y --live
```

**No quoting is needed**, because after the rename no path in either command contains a space — which is the whole
purpose of the rename. `--dry-run` and `--live` together exit 2 rather than choosing (`app/src/ops/mode.ts:51`).

**Why `node …/tsx/dist/cli.mjs` and not `npx tsx`.** The existing witness entry in goose's configuration uses
`cmd: npx` with `args: [tsx, <file>]`, and matching it would be reasonable; the absolute form is used here because
it is **the one that was proved to run from an unrelated working directory** — no PATH lookup, no `.cmd` shim, no
possibility of npx resolving a different tsx or reaching for the network. Module resolution is unaffected either
way: the imports in `server.ts` are resolved from the file's own location, never from the working directory, and
there is **no `process.cwd()` anywhere in `app/`**.

**One extension per goose session.** Two extensions in one session is one agent holding two mailboxes, which is not
two agents. The per-home lock cannot enforce this — two homes take two different locks and both start happily — so
it is discipline, not a guard.

#### The stop condition, as it now stands

It is **in the goose conversation** and not on stderr, because Goose Desktop does not surface an extension's stderr
where a reader is looking.

- **The first call in each DRY session is `buy_stamp`, and its card must say DRY / would-do.**
- **A connection error to `127.0.0.1:4600` means that session is LIVE — stop.** The counter stays down until the
  fill-in, so a session that tries to reach it is a session that is not in DRY. This is safe to rely on: between
  `buyStamps` entry (`app/sdk/counter.ts:244`) and its `connect()` (`:273`) **nothing signs, submits, transfers,
  freezes or executes**, so a LIVE session meeting a downed counter fails at the connection and before any signature.
- **`send` must refuse `no account yet`** — these homes are unprovisioned.
- **`generate_mailbox` and `register_agent` are not called in pre-flight.**


  **GATE ZERO — [ AUTHORIZED — Sonic, 2026-09-11: "Proceed Gate Zero." ]**

### 10. THE BEFORE-STATE, read from the mirror at the fill-in — 2026-09-11

**Read after Sonic's word and before the counter came up, so it is the state the run starts from.** Every line is a
mirror read; nothing here signed anything. It is written down because **a receipt cannot show it** (§6 above), and
because the arithmetic in §2 is only checkable against a before.

```
  C1OPERATOR  0.0.10450879   414.99071098 ℏ   $POSTAGE 1   maxAutoAssoc -1   deleted false
  C2OPERATOR  0.0.10450880   408.21468299 ℏ   $POSTAGE 0   maxAutoAssoc -1   deleted false
  treasury    0.0.10426205    20.00000000 ℏ   $POSTAGE 9,961
  Postmaster payer 0.0.8641261  3255.78660053 ℏ
  Postmaster agent 0.0.10426206   20.00000000 ℏ
```

**Four things that state settles.**

1. **The two operators match the gate report's §1 reading exactly** — 414.9907 / 408.2147 ℏ, one stray stamp at
   C1OPERATOR and none at C2OPERATOR. Nothing has moved on either wallet since the report was written, so §2's
   corrected arithmetic stands as written: the hop fires for the SENDER because C2OPERATOR holds zero.
2. **Both auto-associate (`-1`), so no `TokenAssociateTransaction` is expected from either.** §4 predicted this
   and said that a different value on the day would mean one extra submission, paid by that operator, about 0.05 ℏ.
   It is not a different value. If one is submitted anyway, that is a finding.
3. **The Postmaster's payer is solvent with a wide margin.** §3 budgets roughly **56 ℏ** of `0.0.8641261` for two
   mailboxes against 60 ℏ taken; it holds **3255.79 ℏ**. The carried legs cannot fail for want of funds, which
   removes the one failure mode that would strand an agent mid-template. **The treasury's own 20 ℏ is not in this
   path** — it holds `$POSTAGE`, and the carry is paid by the payer account.
4. **Neither agent has an account yet**, which is the precondition `buy_stamp` refuses on. Queried by public key
   against the mirror, both return zero accounts:

```
  DemoAgentX  302a300506032b657003210022cd19c26d679df4cfed83f7ccee782531916ff39c40653733867f86165b2ca5  -> 0 accounts
  DemoAgentY  302a300506032b657003210020ae2f8e2ef8d6d8ae1240086df9f3cbe310b8004eebf7426a4078ccd533278a  -> 0 accounts
```

Those are the same two keys the DRY pre-flight reported to the counter as `holder` (`22cd19c2…`, `20ae2f8e…`,
§3 above), which is how this section knows it is describing the same two homes. **The keys were derived from each
keystore in process and only the public half was ever printed** (P-13; `npm run p13:check` green).

**The quote's own input is unmoved.** The `PriceList` topic `0.0.10426551` holds **four** messages and sequence 4
is still the latest, at consensus `1789055861.123389104` — the same sequence and the same instant §3 and §7 both
cite, carrying `provisioning {method "hbar", unitPrice "30", registrationFee "0.05"}`. **A fifth message would have
changed the price mid-gate and there is none.**

**What this section does NOT establish.** It is a set of reads, and the §5 window is untouched by it: every row of
§4 is still a signature leaving a process before its outcome is known. It also does not prove the counter is up —
§7's quote did that once and the counter was stopped again; it comes up at the run.

## GATE ZERO — THE DIVERGENCE, AND THE RUN OF RECORD. 2026-09-11, after the run

**The gate report above is not edited, and neither is its before-state.** This sits beneath them, dated, as a run of
record does. **The fill-in is NOT YET**: Gate Zero's question — does goose drive this server through the golden path
— **was not answered**, because the golden path was never reached. No envelope was composed, no lane was born, no
letter was sent, nothing was acked. What ran instead is recorded here in full, because it is the finding.

**The one-sentence version.** Two goose sessions were opened on the LIVE entries and the model was left to work the
flow out for itself. It called `generate_mailbox` first — before any purchase, on a home with no account — and that
verb built and submitted **four topics per agent** before the fifth step refused, leaving **eight permanent topics on
`hedera:testnet`**, two of them fee-bearing doorbells whose memo names no owner. It then invented four address forms,
passed JSON objects as strings, bought four stamps it did not need, paid for provisioning twice on one operator, and
finished with two INVALID_SIGNATURE transfers. **Nothing that happened was outside the code's own behaviour**; every
one of these is a defect of ours or a gap in what the surface tells a model.

---

### 1. Where goose's own record lives, so the next divergence is read the same way

**Read goose before the mirror.** The cards pasted into a conversation are the model's rendering; these are the
machine's.

```
  logs      C:\Users\Sonic\AppData\Roaming\Block\goose\data\logs\server\<YYYY-MM-DD>\<HHMMSS>-goosed.log
  sessions  C:\Users\Sonic\AppData\Roaming\Block\goose\data\sessions\sessions.db   (SQLite; -wal beside it)
  config    C:\Users\Sonic\AppData\Roaming\Block\goose\config\config.yaml  (+ .bak, .bak.1, .bak.2, written by goose itself)
```

**The log** carries one `dispatch_tool_call` span per call, and each span embeds the whole conversation so far plus
`input={"tool":"<ext>__<name>","arguments":{…}}`. It does **NOT** capture the extension's stderr, so the Correspondent's
banners are not in it — which is why the DRY/LIVE banner cannot be audited after the fact from goose alone, and why
the stop condition has to live in the conversation.

**The session database** is the better source and holds the results: table `messages` (`role`, `content_json`,
`created_timestamp`, `session_id`) against table `sessions`. Content items are typed `text`, `toolRequest` and
`toolResponse`; a `toolResponse` carries the full result including `_meta["wishmail/code"]`. Node 22's built-in
`node:sqlite` reads it with nothing installed — copy the file first and open the copy.

Tonight's two sessions: **`20260911_1`** "Demo Agent X initialization" (22:52:44–22:59:37Z) and **`20260911_2`**
"Demo Agent Y session" (22:55:12–22:58:05Z). **One demo extension was enabled in each**, which is the one piece of
discipline that held.

---

### 2. The call sequence, from the log and not from the cards

**SENDER window (`20260911_1`, DemoAgentX).** Sonic's opening turn was *"Hello, you are Demo Agent X. You will be
steering the experimental extension named accordingly. Proceed."* — and "Proceed" is the whole of the instruction the
model had.

```
  22:54:35  inbox {}                     -> INBOX_MIRROR_UNREACHABLE (no doorbell; buy a mailbox first)
  22:54:36  generate_mailbox {}          -> REFUSED: the declaration does not validate: /account must match
                                            pattern "^[0-9]+\.[0-9]+\.[0-9]+$"     <-- FOUR TOPICS ALREADY EXIST
  22:55:49  buy_stamp {count 1, holder "{\"publicKey\": \"demo\"}", payment "{\"method\": \"hbar\"}"}
                                         -> SUCCESS, 1 stamp, 1.34488754 h, holder 0.0.10487063
  22:55:54  buy_stamp {… provision true} -> the SAME receipt returned
  22:56:37  resolve {address "demo"}                    -> RESOLVE_UNSUPPORTED_ADDRESS
  22:57:31  buy_stamp {count 5, provision true}         -> STAMP_HOLDER_INVALID (correct)
  22:57:48  generate_mailbox {dryRun true}              -> MAILBOX_REFUSED (dry-run)
  22:57:50  generate_mailbox {}          -> MAILBOX_REFUSED: doorbell at 0.0.10487041 diverges from its declared
                                            shape: memo want "hcs-10:0:60:0:0.0.10487063" got "hcs-10:0:60:0:"
  22:57:54  resolve {address "0.0.10487063@hcs14"}      -> RESOLVE_UNSUPPORTED_ADDRESS
  22:58:22  resolve {address "hcs14://0.0.10487063"}    -> RESOLVE_UNSUPPORTED_ADDRESS
  22:58:26  resolve {address "0.0.10487063", profile "hcs14"}
                                         -> RESOLVE_NOT_FOUND: account memo is not an HCS-11 memo of either form: ""
  22:58:31  buy_stamp {holder {account 0.0.10487063}}   -> STAMP_PAYMENT_FAILED: INVALID_SIGNATURE
  22:58:41  register_agent {dryRun true}
  22:58:46  buy_stamp {…}                               -> STAMP_PAYMENT_FAILED: INVALID_SIGNATURE
  22:58:59  inbox {lane "0.0.10487041"}     <-- the DOORBELL passed as a lane
  22:59:34  verify {scope "{\"topics\": [\"0.0.10487041\"]}"}
```

**RECIPIENT window (`20260911_2`, DemoAgentY).** The same shape, and the same first move:

```
  22:55:59  inbox {}                     -> INBOX_MIRROR_UNREACHABLE
  22:56:00  generate_mailbox {}          -> REFUSED: /account must match pattern …      <-- FOUR MORE TOPICS
  22:56:30  buy_stamp {count 1, holder "{\"publicKey\": \"test-key\"}", provision true}
                                         -> MAILBOX_REFUSED: doorbell at 0.0.10487067 diverges … got "hcs-10:0:60:0:"
                                            BUT THE TRANSFER HAD ALREADY SETTLED: 31.34488754 h
  22:56:40  buy_stamp {… provision true} -> MAILBOX_REFUSED, and A SECOND 31.34488754 h SETTLED
  22:56:47  resolve {address "test@test"}                    -> RESOLVE_UNSUPPORTED_ADDRESS
  22:57:32  buy_stamp {count 1, provision false}             -> SUCCESS, 1 stamp, 1.34488754 h
  22:57:45  generate_mailbox {}                              -> MAILBOX_REFUSED (same divergence)
  22:57:56  resolve {address "test@0.0.10487080", profile "hcs14"} -> RESOLVE_UNSUPPORTED_ADDRESS
  22:57:57  resolve {address "0.0.10487080", profile "hcs14"}      -> RESOLVE_NOT_FOUND
  22:57:59  buy_stamp {… provision true}                     -> the same receipt returned
```

**No `send`. No `ack`. No lane. No envelope.** The golden path was never entered.

---

### 3. What is on consensus tonight, per home, every id read from the mirror

**Eight topics. All eight are permanent; a topic cannot be deleted.** Consensus timestamps are the mirror's.

**DemoAgentX — home `gz-x`, agent key `22cd19c2…`, every row paid by C2OPERATOR `0.0.10450880`:**

| Entity | Id | Consensus | Memo | Paid |
|---|---|---|---|---|
| **doorbell** (HCS-10 inbound) | `0.0.10487041` | `1789167277.367573104` | **`hcs-10:0:60:0:` — NO OWNER** | 27.03358182 ℏ |
| log (HCS-10 outbound) | `0.0.10487045` | `1789167285.699454062` | `hcs-10:0:60:1` | 0.40481109 ℏ |
| manifest | `0.0.10487048` | `1789167292.502713104` | `wishmail:manifest:1` | 0.40481109 ℏ |
| declaration registry (HCS-2) | `0.0.10487050` | `1789167300.680749280` | `hcs-2:0:60` | 0.40481109 ℏ |
| **account** | `0.0.10487063` | `1789167350.238097103` | `""` — no HCS-11 memo | created by the Postmaster, 0.67244368 ℏ |

The doorbell carries the HIP-991 fee correctly — 1 unit of `0.0.10426208` to `0.0.10426205`, the agent's own key
exempt — and `autoRenewAccount 0.0.10450880`. It holds **0 messages**. The account holds **0 ℏ and 1 $POSTAGE**.

**DemoAgentY — home `gz-y`, agent key `20ae2f8e…`, every row paid by C1OPERATOR `0.0.10450879`:**

| Entity | Id | Consensus | Memo | Paid |
|---|---|---|---|---|
| **doorbell** | `0.0.10487067` | `1789167361.522673589` | **`hcs-10:0:60:0:` — NO OWNER** | 27.03358182 ℏ |
| log | `0.0.10487068` | `1789167363.459558781` | `hcs-10:0:60:1` | 0.40481109 ℏ |
| manifest | `0.0.10487072` | `1789167371.439843104` | `wishmail:manifest:1` | 0.40481109 ℏ |
| declaration registry | `0.0.10487075` | `1789167379.522664104` | `hcs-2:0:60` | 0.40481109 ℏ |
| **account** | `0.0.10487080` | `1789167392.080221103` | `""` | created by the Postmaster, 0.67244368 ℏ |

The account holds **0.1 ℏ and 3 $POSTAGE** — 0.05 ℏ of registration fee from each of the two provisioning purchases
that settled, and one stamp from each of the three purchases.

**THE TELL, and it is on consensus and not in a log: the doorbells are numbered BEFORE the accounts.**
`0.0.10487041` predates `0.0.10487063` by **73 seconds**; `0.0.10487067` predates `0.0.10487080` by **31 seconds**.
A doorbell is a door on a house that did not exist when the door was hung, and the memo says so by naming nobody.

---

### 4. The four purchases

| Transaction | Consensus | Result | What moved |
|---|---|---|---|
| `0.0.8641261@1789167343.109022006` | `1789167350.238097103/104` | **SUCCESS** | CryptoCreateAccount (Postmaster pays 0.67244368 ℏ) + transfer: C2OPERATOR −1.34488754 ℏ, treasury −1 $POSTAGE → `0.0.10487063` |
| `0.0.8641261@1789167384.906420210` | `1789167392.080221104` | **SUCCESS** | CryptoCreateAccount + **provisioning** transfer: C1OPERATOR **−31.34488754 ℏ** → `0.0.10487080` |
| `0.0.8641261@1789167395.427339817` | `1789167401.270150308` | **SUCCESS** | **a SECOND provisioning** transfer: C1OPERATOR **−31.34488754 ℏ** |
| `0.0.8641261@1789167446.869833765` | `1789167453.598345104` | **SUCCESS** | transfer: C1OPERATOR −1.34488754 ℏ, 1 $POSTAGE |
| `0.0.8641261@1789167504.362787612` | `1789167512.550081104` | **INVALID_SIGNATURE** | nothing; the Postmaster paid the 0.01882841 ℏ node fee |
| `0.0.8641261@1789167522.108801306` | `1789167527.730000104` | **INVALID_SIGNATURE** | nothing; the Postmaster paid the 0.01882841 ℏ node fee |

**WHICH SIGNATURE WAS MISSING, AND WHY — `app/sdk/counter.ts:315`.**

```ts
  const signer = s.account === '' ? s.homePayer : s.agent;
```

The comment above it reasons: *"The agent's key signs because the agent is the party whose account the price leaves
— and where the holder is a bare public key, the operator's key signs, because the agent has no account for the
price to leave."* **That premise is false.** Every quote this function asks for is built with
`payment: { method, from: s.homePayerId }` (`counter.ts:288` and `:360`) — the price **always** leaves the
**operator's** account and never the agent's. So the moment the agent has an account, this signs with the **agent's**
key a body that debits the **operator**, and the operator's signature — the only one the network needs — is absent.

That is exactly when the two failures happened: X bought successfully at 22:55:49 while `s.account` was still empty,
and failed at 22:58:31 and 22:58:42 once the purchase had given it one. Y never hit it, because its window never
made a purchase after its session learned its account.

**It is NOT on the golden path** — the first provisioning purchase always runs with no account, and provisioning
already includes stamps, so a correct run never reaches the branch. **Recorded, not fixed tonight** (the ruling for
this pass names two fixes and this is not one of them). It is a one-line correction when it is taken.

---

### 5. The deltas, against §10's before-state

```
                         before             after              delta
  C1OPERATOR 0.0.10450879  414.99071098      322.70803327      -92.28267771 h   $POSTAGE 1 -> 1
  C2OPERATOR 0.0.10450880  408.21468299      378.62178036      -29.59290263 h   $POSTAGE 0 -> 0
  treasury   0.0.10426205   $POSTAGE 9,961    $POSTAGE 9,957    -4 stamps
  DemoAgentX 0.0.10487063          -          0 h, 1 $POSTAGE
  DemoAgentY 0.0.10487080          -          0.1 h, 3 $POSTAGE
```

**121.87558034 ℏ of the two operators' own money**, for no letter. Of it, **54.07 ℏ is the two doorbells** — the
single most expensive row in the template, and both are unusable. **62.69 ℏ is two provisioning purchases on one
operator**, of which one was redundant. The Postmaster's payer `0.0.8641261` paid two account creations and two
node fees for failed transfers and carried no mailbox row, because no mailbox reached the carry.

---

### 6. Both `record.json` as they stand, and what they mean

Neither home was wiped; both are readable and both are **wrong about the world in the same way** — they name four
topics each as this agent's entities, and those topics cannot serve the agent they name.

- **`gz-x`** carries the four topics above and a `purchase` row in state **`signed`**, reference
  `0.0.8641261@1789167522.108801306` — one of the two INVALID_SIGNATURE transfers, with `account: ""`. That is an
  **outstanding purchase that never landed**, and it is the state `buyStamps`' resume path reads. A later
  `buy_stamp` on this home would try to resume a transfer that does not exist.
- **`gz-y`** carries its four topics and a `purchase` row in state **`settled`**, reference
  `0.0.8641261@1789167446.869833765`, `account: 0.0.10487080`.

**Neither home is repaired and neither is deleted.** They are the evidence, and they are the DRY/debug homes from
here on: **`gz-x` and `gz-y` never go live again** (RECORD, Sonic 2026-09-11).

> **NOTE ADDED 2026-09-11, beside the ruling and not amending it (RECORD, Sonic).** The ruling is **narrowed
> rather than breached**, and it now reads: a spent home never provisions, never spends, and never runs under
> `--live`; **a read-only DRY boot with a read-only allowlist is permitted.** The occasion was `gz2-y`, whose
> letter is the only real opened correspondence this deployment holds, and which was the only way to prove the
> `inbox` fix under goose before Gate Four rather than after it. What makes it safe is structural and not a
> promise: `--dry-run` reads **no payer key** and gives no client an operator, the doorbell watcher **does not
> start**, a dry run takes **no `run.lock`**, and §6.5 writes nothing (D-29). The entry carried the allowlist
> `[inbox]` and nothing else, so no other verb was callable, and it was **deleted after the proof**.

---

### 7. RESIDUE — every entity, with the why

All ten entities below are **residue**: inputs to a rehearsal that failed, not part of any deployment, superseded by
nothing and serving nothing.

| Entity | Why it exists, and why it is residue |
|---|---|
| `0.0.10487041` doorbell (X) | Created by `generate_mailbox` on a home with no account. Its memo names no owner, so no reader can tell whose door it is and §7.1's binding cannot use it. Fee-bearing and admin-keyed to an agent that will never use it. **Cannot be deleted.** |
| `0.0.10487045` log (X) | Same call, row 2. Never written to. |
| `0.0.10487048` manifest (X) | Same call, row 3. Never written to. |
| `0.0.10487050` declRegistry (X) | Same call, row 4. Holds no register entry: the declaration never validated. |
| `0.0.10487063` account (X) | Created by HIP-542 alias when one stamp was transferred to X's key. Holds 1 $POSTAGE, no ℏ, and **no HCS-11 account memo**, so it resolves to nothing. |
| `0.0.10487067` doorbell (Y) | As X's, and identically ownerless. |
| `0.0.10487068` log (Y) | Same call, row 2. |
| `0.0.10487072` manifest (Y) | Same call, row 3. |
| `0.0.10487075` declRegistry (Y) | Same call, row 4. |
| `0.0.10487080` account (Y) | Created by the first provisioning purchase. Holds 3 $POSTAGE and 0.1 ℏ of registration fees, and no account memo. |

---

### 8. THE MECHANISM, and it is the ordering before it is anything else

**The reading offered was: the doorbell is created before the declaration validation refuses, with the memo's owner
empty. That is CONFIRMED on consensus and in the code, and it understates it by three topics.**

`generateMailbox` (`app/sdk/mailbox.ts:348`) did this, in this order:

1. `resolveSelf(source, s.ledgerTag, s.account)` — the idempotency gate. With `s.account === ''` it finds nothing,
   which is true and useless.
2. `ensurePayerHoldsStamps` — reads the operator, not the agent. Passes.
3. Builds `subject` with `account: s.account`, **the empty string**.
4. **Row 1 — `topicRow(… template.doorbell(subject) …)` — SUBMITS.** Memo `hcs-10:0:60:0:`.
5. Rows 2, 3, 4 — log, manifest, declaration registry — **SUBMIT**. None of their memos carries the account, so
   none of them notices.
6. The profile and the §9.1 declaration are built, and `app/src/ops/declaration.ts:196` throws *"the declaration
   does not validate, and is not published: /account must match pattern `^[0-9]+\.[0-9]+\.[0-9]+$`"*.

**So: which is the defect — the memo builder, the topic creator, or the ordering?** The **ordering** is the defect,
and the **memo builder** is a second one behind it.

- It is **not the topic creator**. `topicRow` submits the shape it is handed and confirms it from the mirror
  afterwards; it did both correctly, and on the second run it is what **caught** the divergence
  (`mailbox.ts:214`, "diverges from its declared shape").
- It is **the ordering**, because the account is a precondition of the whole template and was checked at step 6, at
  the first field that happens to meet a JSON Schema pattern. Four irreversible acts stood in front of that check.
  The validator was doing its job; it was simply the only thing in the function doing it, and it was last.
- It is **also the memo builder**, because `template.doorbell` rendered `hcs-10:0:60:0:` without complaint. A
  builder that can produce a memo naming nobody is a builder that will, and the four-second window between "the
  ordering is fixed" and "someone calls the template directly" is not worth leaving open.

**Does `buy_stamp` with `provision: true` share any of it?** It shares the **function** and **not the defect**.
`counter.ts:465` calls `generateMailbox(carried, …)` where `carried` is a session re-booted with
`expectAccount: true` **after** the purchase has created the account, and `counter.ts:455-462` refuses unless the
mirror agrees the key owns exactly that account. So on the provisioned path `s.account` is always populated, and the
new refusal can never fire there. Y's session proves the seam works in the other direction too: at 22:56:30
`buy_stamp` with `provision` settled its transfer, reached the mailbox step, met the already-broken doorbell and
refused with `MAILBOX_REFUSED` — the shape check catching what the ordering check should have prevented.

---

### 9. THE FIX, and only this

Two refusals, both in front of the first irreversible act, both courted on the model with no network and no key.

1. **`app/sdk/mailbox.ts`, first statement of `generateMailbox` after the emitter** — refuses with
   `MailboxRefusal` when `s.account === ''`, **before the idempotency read and before any `TopicCreate`**, naming
   `buy_stamp` with `provision: true` as the path and saying that nothing was created.
2. **`app/src/ops/template.ts`, `doorbell()`** — throws where `s.account` is empty rather than rendering
   `hcs-10:0:60:0:`, naming the same path.

**The court is `app/sdk/correspondent.check.ts`**, +8 assertions, 118 → **126**. It is a court and not a decoration:
with both fixes reverted, **exactly those 6 of the 8 fail** and the other 120 assertions pass — run, not assumed.
It also pins the two facts that make the ordering the defect: rows 2 and 3 carry no account in their memos, so no
row after the first could have caught this.

**Green after the fix:** `typecheck`, `p13:check`, and **all twenty-two `check:*`**. `check:captured` 20
assertions and `check:receipt` 43, **byte-identical in their recorded digests**; `conformance` unmoved at 44
passing, report digest `51453eea…`.

**`generate_mailbox`'s published description already promised this refusal** — *"It refuses if the agent has no
account yet"* (`app/sdk/tools.ts:57`). It was documentation of a behaviour the code did not have. It does now.

---

### 10. Recorded and NOT fixed, each a finding of tonight

1. **`counter.ts:315` signs with the wrong key once the agent has an account** — §4 above. Not on the golden path.
2. **`buy_stamp`'s `holder` is REQUIRED by its published input schema and never read by its handler.**
   `app/sdk/server.ts:276-280` always uses `s.account === '' ? { publicKey: s.agentPublicHex } : { account: s.account }`.
   It is why `holder: "{\"publicKey\": \"demo\"}"` — a **string**, not even an object — was accepted in silence
   twice. Making it optional is a change to a published input schema and therefore **0.6, never a patch** (§1.7).
3. **A provisioning purchase can settle twice on one operator.** Y paid 31.34488754 ℏ at 22:56:32 and again at
   22:56:41, because the first call's mailbox step threw after the transfer and the session's `s.account` was still
   empty when the second call quoted. 30 ℏ of the second is simply gone.
4. **`INBOX_MIRROR_UNREACHABLE` names the wrong cause** — the mirror is reachable; the agent has no doorbell. Already
   recorded at Gate Zero §4.2 and now observed four more times as the first thing a model sees.
5. **goose does not capture an extension's stderr**, so the DRY/LIVE banner is not auditable from goose's own record.
   The stop condition must stay in the conversation.

---

### 11. What the goose surface now carries, and why

- **`available_tools` IS an allowlist** — `goose/crates/goose/src/agents/extension.rs:394-420`: *"If no tools are
  specified, all tools are available / If tools are specified, only those tools are available"*. It is checked on
  the **bare** tool name, before the `<ext>__` prefix is applied (`extension_manager.rs:960` checks `tool.name`,
  `:964` prefixes afterwards; `:1369` uses `resolved.actual_tool_name`). Both entries now carry exactly
  **`[buy_stamp, resolve, send, inbox, ack]`**.
- **`generate_mailbox` is off the list.** It is the self-provisioned path and it is what did tonight's damage.
- **`register_agent` is off the list, and it is not needed for the golden path.** The `hcs14` declaration that
  `resolve` and `send` depend on is published by provisioning itself — the profile, its HCS-1 chunks, the HCS-2
  register entry and §9.2's account memo, all inside `generateMailbox`. `register_agent` writes to the HOL anchor
  `0.0.6913983`, which serves the `hol` profile, and the letter path never consults it. Off unless it is wanted
  on video.
- **`verify` is off the list**, because the stranger's verification is run from a command line holding nothing
  (P-4) and is weaker from inside an agent's own window.
- **Both entries are `--dry-run`** with descriptions that say DEBUG HOME.
- **Three tool descriptions now state their precondition**, and `resolve` and `send` give the address form with a
  real example — because the model invented four forms and nothing on the surface had ever shown it one. No schema
  moved: the notes hang off `app/sdk/server.ts`'s description builder, the way `BUY_STAMP_NOTE` already did.
- **The operator script is `docs/OPERATOR-SCRIPT.md`** — one instruction per turn, the card to expect, and the word
  *stop* at the end of each. The model does not work the flow out; it is driven.

---

## GATE ZERO — PART A, THE DRY REHEARSAL, AND THE ARGUMENT THAT ARRIVES AS A STRING. 2026-09-11, run of record

**Run by Sonic in two goose windows on the DRY entries, both closed afterwards. Nothing signed; both homes are
untouched by it.** Part A exists because the first Gate Zero was driven with no script. This one was driven from
`docs/OPERATOR-SCRIPT.md`, one instruction per turn. **It found the thing that would have ended the second Gate
Zero at the letter, and it cost nothing.**

Sessions **`20260912_1`** "Buying 12 stamps with HBAR" (00:23:02–00:27:37Z, SENDER) and **`20260912_2`**
"Testing tool calls" (00:27:08–00:29:14Z, RECIPIENT), read from goose's own session database.

### 1. The five steps

| Step | Expected by the script | What the surface returned | |
|---|---|---|---|
| **A1** `buy_stamp` (X) | a DRY card | `DRY RUN — buy_stamp would buy 12 stamp(s) and provision this agent's mailbox`, `holder {account 0.0.10487063}`, `buyer 0.0.10450880` | **PASS** |
| **A2** `resolve` (X) | A2's coordinates | doorbell `0.0.10462704`, log `0.0.10462708`, manifest `0.0.10462713`, keyEpoch 1, proof `57625b02…`, trustClass `math` | **PASS** |
| **A3** `send` (X) | `SEND_UNRESOLVED: no account yet` | `SEND_UNRESOLVED: \`coordinates\` is required` | **FAIL — the finding** |
| **A4** `inbox` (Y) | `INBOX_MIRROR_UNREACHABLE` | `[]` | **PASS** |
| **A5** `ack` (Y) | a refusal | `ACK_NOT_OPENED: no envelope … is on this agent's lanes; §6.6 acknowledges what this agent's own inbox opened` | **PASS** |

**Two of those expectations were the script's and they were wrong, not the surface's.** A1 and A4 were written as
though `gz-x` and `gz-y` were fresh. They are not: both carry the 2026-09-11 damage, so `buy_stamp` correctly
reported the account X already has instead of the key it would have bought one with, and `inbox` correctly read
Y's existing doorbell `0.0.10487067` and found nothing on it. **Both corrected in `docs/OPERATOR-SCRIPT.md`**, with
what a FRESH home returns named beside each.

**Not ours:** at 00:23:14 the first attempt returned `Rate limit exceeded: Provider returned error` from
openrouter. Re-pasted at 00:24:07 and it went through.

### 2. THE ALLOWLIST WORKED, and that is the other result

`generate_mailbox`, `register_agent` and `verify` appear **zero times** in either log — not called, not offered,
not mentioned. goose loaded exactly what was written:

```
  available_tools: Array [String("buy_stamp"), String("resolve"), String("send"), String("inbox"), String("ack")]
  args: [ …/app/sdk/server.ts, C:/Users/Sonic/.wishmail/demo/gz-x, --dry-run ]
```

**Zero `is not available for extension` refusals**, because the model never reached for one. **The verb that created
eight permanent topics is now unreachable from a goose window**, and the DRY stop condition held on the first call
in each session.

### 3. THE FINDING — the model serialises object arguments as JSON strings

Every nested object argument, both nights, typed as it actually arrived in goose's session database:

```
  20260911_1 22:55:53  buy_stamp  count:number  holder:STRING   payment:STRING
  20260911_1 22:59:34  verify     scope:STRING  window:object          <-- inconsistent, in ONE call
  20260911_2 22:56:35  buy_stamp  count:number  holder:STRING   payment:STRING  provision:boolean
  20260912_1 00:24:16  buy_stamp  count:number  provision:boolean  payment:STRING  holder:STRING
  20260912_1 00:27:11  send       coordinates:STRING  payload:string  returnReceipt:boolean   <-- THE BLOCKER
  20260912_2 00:28:59  ack        envelopeId:string
```

**`buy_stamp` survived it by accident**, because its handler reads neither `holder` nor `payment` — the
schema/handler disagreement already recorded. **`send` did not**: `app/sdk/server.ts`'s guard tests
`typeof coordinates !== 'object'`, so the golden path ends at the letter. **The second Gate Zero would have bought
two mailboxes at ~43 ℏ each and then failed at B4.**

**The ruling's conditional is answered and the answer is no.** `count` arrived as a **number** in all eight of its
occurrences; `provision`, `returnReceipt` and `dryRun` arrived as **booleans** every time
(`20260912_1 00:27:11 returnReceipt:boolean`); and `window` arrived as a real **object**
(`20260911_1 22:59:34`). **Only object-typed arguments are stringified, so the helper extends to objects and to
nothing else.** Widening it to numbers or booleans would be inventing a defect nobody has observed.

### 4. THE FIX — coerce at the boundary (RULING, Sonic 2026-09-11)

One helper in `app/sdk/server.ts`, applied **once**, at the single point every tool call passes through, so every
verb is lenient in the same way and none of them twice:

- `OBJECT_ARGUMENTS` is exactly `coordinates, payment, holder, scope, window, receiptWindow` — the arguments the
  published input schemas type as object.
- A **string that parses to a plain JSON object** is parsed, and then validated exactly as an object would have
  been. **No validation is skipped and no refusal is softened.**
- Anything else — a string that does not parse, or one parsing to a number, a string, `null` or an array — is left
  as it arrived and refuses as before, **naming that it arrived as a string** rather than calling it missing.
- **`payload` is never coerced**, and is not in the list: §6.4's payload is base64 text, so a payload that happens
  to look like JSON must stay the string it is.
- **No schema moves.** This widens what is accepted, never what is published (§1.7). The leniency is recorded in
  `LIMITATIONS.md`'s tail matter, which keeps L-1 – L-14 fourteen.

**Courted offline in `app/sdk/correspondent.check.ts`** — 126 → **149** assertions, no network and no key: the
stringified coordinates object from A3, a garbage string, JSON that parses to a number / a quoted string / `null` /
an array, a `payload` that looks like JSON and must not be touched, all six named arguments at once, and the
already-correct case where an object arrives as an object and numbers and booleans pass through untouched.

**And proved end to end over real stdio**, replaying A3's exact wire shape against a DRY server on `gz-x`:

```
  A3 AS GOOSE SENT IT — coordinates is a STRING
      DRY RUN — send would post one certified envelope to 0.0.10462700
  the same call with a real OBJECT
      DRY RUN — send would post one certified envelope to 0.0.10462700
  a GARBAGE string
      SEND_UNRESOLVED: `coordinates` arrived as a STRING containing text, and this tool takes an object.
  JSON that is not an object ("42")
      SEND_UNRESOLVED: `coordinates` arrived as a STRING containing text, and this tool takes an object.

  IDENTICAL: the stringified call and the object call now answer the same.
```

**Green:** `typecheck`, `p13:check`, all twenty-two `check:*`. `check:captured` 20 and `check:receipt` 43,
byte-identical in their recorded digests; `conformance` unmoved at 44 passing, digest `51453eea…`.

### 5. What Part A leaves standing

- **Nothing signed, nothing spent, no entity created.** Both homes are exactly as the 2026-09-11 run left them.
- **The two damaged homes stay damaged and stay DRY.** `gz-x` and `gz-y` never go live again.
- **The remaining unknown is the one Part A could not reach**: whether the golden path completes — a lane born, an
  envelope on it, a schedule executed onto the recipient's manifest topic. That is the second Gate Zero's question,
  on **fresh homes**, and it is now unblocked.

### 6. A3 RE-RUN UNDER GOOSE ITSELF — 2026-09-11, DRY, and it is the proof that mattered

**The coercion was proved against a reference client before it was pushed. This is the same call under Goose
Desktop's own client, which is the one under test.** Session **`20260912_3`** "Resolve address, send certified"
(00:52:25–00:53:47Z), SENDER window on `gz-x`, `--dry-run`.

```
  00:53:34  resolve {"address":"0.0.10462700","profile":"hcs14"}
            -> doorbell 0.0.10462704 · log 0.0.10462708 · manifest 0.0.10462713 · keyEpoch 1
               proof 57625b02c36fc8f2a6a80607445fccf4bd7d129b0985a16cc07eea82f65a1fe5
               trustClass math · resolvedAt 1789174414.450000000

  00:53:46  send {"coordinates":"{\"address\": \"0.0.10462700\", …}",   <-- A STRING, AGAIN
                  "payload":"VGhpcyBsZXR0ZXIg…","returnReceipt":true}

            -> DRY RUN — send would post one certified envelope to 0.0.10462700
               recipient   0.0.10462700 · doorbell 0.0.10462704 · manifest 0.0.10462713 · keyEpoch 1
               resolution  hcs14 · trustClass math · endorsements [] · proofHash 57625b02…
               lane        NONE — this is first contact, and a doorbell would be rung
               wouldRing   true
               payloadBytes 70
               returnReceipt true
               note        Nothing was signed and nothing was spent.
```

**Three things that card settles.**

1. **The model stringified `coordinates` AGAIN**, in a fresh session, on the same instruction. The behaviour is
   stable and not a one-off, so **the coercion is load-bearing and not belt-and-braces**: without it this call
   refuses, and with it the same bytes produce the would-do card.
2. **The card is not a shrug — it has read the recipient.** It names A2's real doorbell and manifest topic, the key
   epoch, the resolution profile and the proof hash, and it says `lane: NONE — this is first contact, and a
   doorbell would be rung` with `wouldRing: true`, which is the correct reading of §7.1 for a sender that has
   never written to this recipient. `payloadBytes 70` is the demo sentence decoded from base64 to exactly its own
   length, so the payload survived the round trip unaltered.
3. **The proof hash is identical to A3's first run** (`57625b02…`) across a different session and a later
   `resolvedAt`, which is §10.2's rule behaving: the same inputs resolve to the same proof.

**And DRY meant it.** Read from the mirror after the session closed, against the figures in §5 of the run of record
above:

```
  C1OPERATOR 0.0.10450879   322.70803327 h   $POSTAGE 1      unchanged
  C2OPERATOR 0.0.10450880   378.62178036 h   $POSTAGE 0      unchanged
  treasury   0.0.10426205    20.00000000 h   $POSTAGE 9,957  unchanged
```

Not one tinybar and not one stamp moved. No entity was created and no home changed.

**PART A IS COMPLETE AND ITS BLOCKER IS CLEARED.** What remains unproved is only what a DRY run cannot reach: a
lane born, an envelope on it, a schedule executed onto the recipient's manifest topic. That is the second Gate
Zero's question, on **fresh homes**, and nothing is now known to stand in front of it.

  **GATE ZERO (second, fresh homes on the demo operators) — [ AUTHORIZED — Sonic, 2026-09-12 ]**

## GATE ZERO, THE SECOND — fresh homes on the demo operators. Gate report, written 2026-09-12 before any signature

**What this answers, and why it is a second one.** The first Gate Zero asked whether goose drives this server
through the golden path and **did not find out**: it was driven with no script, `generate_mailbox` was called on a
home with no account, and eight permanent topics were created before anything reached a letter. Part A then ran the
rehearsal from `docs/OPERATOR-SCRIPT.md` and found the one thing that would still have stopped it — the model
serialises object arguments as JSON strings, so `send` refused its own coordinates. **Both are fixed and courted,
and A3 now returns the would-do card under Goose Desktop's own client.** What no dry run can reach is what is left:
**a lane born, an envelope on it, and a schedule executed onto the recipient's manifest topic.** That is this gate.

**Nothing from the first run is reused.** `gz-x` and `gz-y` are damaged homes and **never go live again**
(RECORD, Sonic 2026-09-11): they keep the eight orphan topics, and `gz-x` holds an outstanding purchase in state
`signed` against a transfer that never landed. This gate runs on **two fresh homes** on the **same demo operator
wallets**, which is what keeps it a Gate Zero and not Gate Four — Gate Four's question is a brand-new wallet, and it
stays its own.

**IT IS A GATE AND NOT A PROBE.** Real `$POSTAGE`, the real counter, the real treasury, the real HOL anchor, and
it creates **permanent entities** — six topics per agent, one of them an HCS-1 file topic with no admin key at all.
Its entities are **residue**.

---

### 1. The parties, and the mirror reading each is entered on

Read 2026-09-12, before anything was written, because a receipt cannot show any of it:

```
  C2OPERATOR  0.0.10450880   378.62178036 h   $POSTAGE 0      autoAssoc -1   deleted false
  C1OPERATOR  0.0.10450879   322.70803327 h   $POSTAGE 1      autoAssoc -1   deleted false
  treasury    0.0.10426205    20.00000000 h   $POSTAGE 9,957
  Postmaster payer 0.0.8641261  3318.26340551 h
  PriceList   0.0.10426551   4 messages; sequence 4 latest at 1789055861.123389104
              provisioning {method "hbar", unitPrice "30", registrationFee "0.05"}
```

| Role | Home | Agent | Operator | Why this way round |
|---|---|---|---|---|
| **SENDER** | `gz2-x` | `DemoAgentX2` | **C2OPERATOR `0.0.10450880`** | It holds **zero `$POSTAGE`**, so §4.4's hop fires — still the untested path under goose. |
| **RECIPIENT** | `gz2-y` | `DemoAgentY2` | **C1OPERATOR `0.0.10450879`** | It holds the **stray stamp** and never spends it on the answering side. |

**Both operators read `max_automatic_token_associations = -1`**, so **no `TokenAssociateTransaction` is expected
from either**. `ensurePayerHoldsStamps` reads the mirror, emits `provision.autoassociates` and submits nothing
(`app/sdk/mailbox.ts:282-286`). **If either reads anything else on the day it will submit one, paid by that
operator, about 0.05 ℏ — that is the code working and not a stop.** Its other branch
(`mailbox.ts:287-294`) **has still never executed against the network**, and this gate cannot make it; that is
Gate Four's to find.

**The two homes, written 2026-09-12 and outside the repository** under `~/.wishmail/demo/`, gitignored. Each
carries its operator's payer block, copied value-to-value from a home already running on that wallet; **the agent's
own keys were born on first boot, in the agent's own process**, and no key was printed, logged or written inside
the repository (P-13, `npm run p13:check` green). Neither has a `record.json`.

```
  gz2-x   born 2026-09-12T01:02:16.727Z
          302a300506032b6570032100140bb1a8d12dc11827c6e14d92e634bc59f0ee29af6af8884fd561e46c24f174
          accounts under this key: 0
  gz2-y   born 2026-09-12T01:02:18.856Z
          302a300506032b6570032100b99f4427441cada5deb31459c11f36bbfd356440cb3ef7b14957cce5f2197a26
          accounts under this key: 0
```

**Zero accounts under either key** is the precondition `buy_stamp` refuses on, and it is checked here rather than
assumed.

---

### 2. What it creates, per agent

The six-row template, D-147 and D-150, unchanged: the account (created by the purchase's stamp transfer to the
agent's public-key alias, HIP-542); the doorbell, HCS-10 inbound, `hcs-10:0:60:0:<agent>`, no submit key, admin
the agent's, **HIP-991 fee of 1 `$POSTAGE` to the treasury with the agent's own key exempt** (D-137); the log,
`hcs-10:0:60:1`; the manifest topic, `wishmail:manifest:1`; the declaration registry, HCS-2, `hcs-2:0:60`; and
the HCS-11 profile file on HCS-1, `<sha256>:brotli:base64`, **no admin key** (D-150) and therefore permanent.

Plus, per agent: the profile's HCS-1 chunks, the HCS-2 `register` entry, §9.2's account memo, and one registration
on the HOL anchor `0.0.6913983` **paid by the agent itself** (§9.5, T-P13-4) — **only if `register_agent` is
called, and the script does not call it** (see §9). Then, between them: **one lane**, born on Y2's doorbell when
Y2's watcher answers X2's ring.

**The doorbell memo now cannot be built without an owner**, and `generate_mailbox` refuses before any
`TopicCreate` on a home with no account. Both refusals landed 2026-09-11 and are courted offline; **this gate is
the first that runs with them in place.**

---

### 3. The arithmetic, and the line to watch

Payload: the demo sentence, **70 bytes**, one chunk. Certified, `returnReceipt` requested.

```
  weight        1 ounce (one chunk)
  postage       weight 1 + receipt fee 1        = 2 stamps to the treasury
  the door      1 stamp at the RECIPIENT's door   (HIP-991, consumed to the treasury)

  X2  12 -> 9        two as postage, one hopped to its payer for the ring
  C2OPERATOR  0 -> receives 1 -> the doorbell fee consumes it -> 0
  Y2  12 -> 12       the recipient is charged nothing, at any step, including across the ack (T-P16-2)
  C1OPERATOR  1 -> 1 the stray stamp is NOT spent: the answering side pays in h, and Y2's own key is
                     fee-exempt on Y2's own doorbell (D-137), so connection_created costs no stamp
  treasury    9,957 -> 9,936    (-24 sold, +2 postage, +1 door)
```

**The hop is the line to watch.** `ringStamp` fires only where a door will actually be rung *and* the payer holds
no stamp — both true here, and it has never fired under goose. If it does not fire, or fires for a reply, that is a
finding.

**In ℏ:** each provisioning purchase is **30 ℏ + 0.05 ℏ + twelve stamps at the day's rate**, which at the last quote
read (HBAR/USD 0.07435566) came to **43.44887532 ℏ** for the buyer's two legs. **The quote and the actual both go in
the run of record**; the gap between them is the rate moving, which is why D-170 put the rate and its instant into
the receipt. **The Postmaster loses money on each and that is recorded, not discovered**: two mailboxes is roughly
**56 ℏ** of `0.0.8641261` against 60 ℏ taken, and it holds **3318.26 ℏ**, so the carried legs cannot fail for want
of funds.

---

### 4. Every consensus write, in order, with its payer

**Act one — Y2 is provisioned, then X2.** Y2 first, because **her watcher must be running before he rings.** Per
agent, nine writes:

| # | Write | Signs | Pays |
|---|---|---|---|
| 1 | the purchase — ONE transaction, THREE legs: ℏ to the Postmaster, 12 `$POSTAGE` to the agent's key alias **which creates the account**, 0.05 ℏ from the Postmaster to it | the agent | **that agent's operator** |
| 2–6 | the five topics of the template | agent + operator | **the Postmaster**, carried |
| 7 | the profile's HCS-1 chunks | the agent | the Postmaster, carried |
| 8 | the HCS-2 register entry | the agent | the Postmaster, carried |
| 9 | §9.2's account memo | the agent | the Postmaster, carried |

**`register_agent` is NOT on this gate's path** and is off the goose allowlist. The `hcs14` declaration the
letter path resolves is published by rows 7–9 above; the HOL anchor serves the `hol` profile, which `send` never
consults. **So no `hol` resolution is claimed by this run, and none is asserted.**

**Act two — X2's letter to Y2, one `send()` call:**

| # | Write | Signs | Pays |
|---|---|---|---|
| 10 | the stamp hop — 1 `$POSTAGE` X2 → C2OPERATOR, **because C2OPERATOR holds none** | X2 | C2OPERATOR |
| 11 | the ring — `connection_request` on Y2's doorbell. **The HIP-991 fee consumes one stamp to the treasury** | X2 | C2OPERATOR |
| 12 | X2's outbound record of the ring, on X2's log | X2 | C2OPERATOR |
| 13 | Y2's watcher answers: **the lane**, submit key a threshold of exactly X2's and Y2's keys, no custom fee | Y2 | C1OPERATOR |
| 14 | Y2's `connection_created` on its own doorbell — §7.1's authority | Y2 | C1OPERATOR |
| 15 | Y2's outbound record of the lane, acceptor reading | Y2 | C1OPERATOR |
| 16 | X2's outbound record of the lane, requester reading (D-174) | X2 | C2OPERATOR |
| 17 | the resolution manifest, on **X2's** manifest topic | X2 | C2OPERATOR |
| 18 | **the settlement** — the envelope's postage to the treasury under memo `wishmail:<aadHash>` | X2 | C2OPERATOR |
| 19 | chunk 0 on the lane | X2 | C2OPERATOR |
| 20 | the **ScheduleCreate** — inner: the receipt manifest to **Y2's** manifest topic; inner payer C2OPERATOR; expiry 30 days | X2 | C2OPERATOR |
| 21 | the `transaction` operation on the lane naming the schedule — **empty memo** (§6.1, T-P9-5) | X2 | C2OPERATOR |

**Act three:**

| # | Write | Signs | Pays |
|---|---|---|---|
| 22 | `inbox` at Y2 — **writes nothing** (§6.5) | — | — |
| 23 | **Y2's `ack`** — a ScheduleSign; the network executes the receipt onto Y2's manifest topic the instant it lands | Y2 | C1OPERATOR |
| 24 | the stranger's `verify`, twice — **reads only** | — | — |

---

### 5. The submit→learn window, per write, and how a rerun resumes from inside it

Every row above is a signature leaving a process before its outcome is known, and **no offline check reaches it,
because there is no offline consensus node** (CLAUDE.md §12).

| Window | What can be true and unknown | How a rerun resumes |
|---|---|---|
| the purchase landed, the answer was lost | the transfer is on consensus and the counter's record of it may be gone | **The reference is the transfer's own transaction id**, written down before the signature left (`counter.ts`, `remember(… state 'signed')`). Calling `buy_stamp` again with the same arguments resumes it and never buys twice (T-P11-5). **If the counter's record is gone: STOP. Do not reconstruct the receipt.** |
| the purchase settled and the mailbox step threw | the account exists, the mailbox does not, and the home's `s.account` may still be empty | **This is how C1OPERATOR paid 31.34 ℏ twice on 2026-09-11.** Call `buy_stamp` with the same arguments: it resumes from the outstanding reference. **Do not call it with different arguments, and do not call `generate_mailbox`.** |
| any mailbox row | a topic may exist and the agent's record not name it | Every row is confirmed by a **mirror read** before the next is built. A rerun re-derives from consensus. |
| **the ring landed, the answer is not yet visible** | the request is on Y2's door and a stamp is gone; Y2 may or may not have answered | **Wait, and spend nothing.** `send` rings at most once and every attempt after is a re-READ (30 s × 3). A second ring is a second stamp and a second lane, **and a lane cannot be closed**. |
| the window closed with no answer | Y2's watcher was not running | **A slip, which is a result and not a failure** (F-6). One stamp is consumed at the door, no envelope is assembled, no postage is affixed. **Do not ring again without the word.** |
| `send` died after the settlement | postage is consumed and the envelope may be SETTLED with no receipt request | The row is written **before** the transfer is submitted, so a resume re-reads the lane and creates only what is missing. A rerun *without* resume composes a new envelope and the first settlement becomes an **orphan** — reported under `orphans` by a Verifier that reads the treasury window, which **this release does not** (L-13, §G-31). |
| an identical `ScheduleCreate` twice | a schedule may exist and this process not know its id | The ledger refuses a second: `IDENTICAL_SCHEDULE_ALREADY_CREATED` carries the existing id, and the step reads the lane first. Two guards. |
| the ack | the ScheduleSign may have executed unseen | Execution is on consensus and idempotent; signing an executed schedule is refused by the network. `verify` is what says whether the receipt landed. |

---

### 6. What it asserts from the mirror, and never from a receipt

Before: both operators exist, are not deleted, hold enough ℏ, and their `max_automatic_token_associations` is read
and written down — done, §1. After each write: the entity exists with the shape it was created under — **the
doorbell's memo names its own account** (the thing that failed on 2026-09-11), its custom fee is one unit of
`0.0.10426208` collected by `0.0.10426205` with the agent's key exempt; the lane's submit key is a threshold of
**exactly** two keys; the profile file's memo carries the digest of the bytes on it.

The acceptance test for provisioning is **not** this process's output: it is **the resolver**, run against each
agent's own address under `hcs14`. **`hol` is not asserted**, because `register_agent` is not called.

---

### 7. Idempotency, and every way it stops

Every provisioning verb is idempotent **against consensus and never against local state**.

- The MCP server prints anything but `DRY RUN`/`LIVE` with the argv that carried it → **stop**.
- **A `buy_stamp` card that says DRY in a LIVE window** → the flag did not arrive → **stop**.
- **A connection error to `127.0.0.1:4600`** → in this gate the counter is UP, so it means the counter has **died**
  → **stop** and say so. (The inverse reading belongs to the DRY rehearsal only.)
- The counter refuses the quote → **stop**; nothing is signed before it answers.
- `buy_stamp` refuses because an account already exists under that agent's key → **stop and report**: these homes
  are new and §1 proved it.
- The purchase transfers and the counter's record is lost → **STOP. Do not reconstruct the receipt.**
- Any mailbox row fails → **stop**; what landed is in `record.json` from a mirror read, and a resume is a decision.
- **Any doorbell whose memo does not name its own account** → **stop**: that is 2026-09-11 repeating and the fix
  failing.
- `send` returns an `AttemptedDeliverySlip` → Y2's watcher did not answer in 90 s. **A result, not a failure.**
- `SEND_LANE_INVALID` → the lane is closed, carries a fee, or its key list is not exactly X2's and Y2's → **stop**.
- Y2's `inbox` does not open the letter byte for byte → **stop. Do not re-send.**
- `ack` returns `ACK_NOT_OPENED` → the schedule's body names a different identifier, postmark or epoch
  (T-P1-9) → **stop**; that is the check working.
- **Y2's balances move by one tinybar or one stamp across the ack → stop**: T-P16-2 is violated.
- The stranger's two `verify` runs disagree on the digest → **stop**: §11.7's MUST is violated.
- Any mirror readback disagreeing with what a process believes → **the mirror is the record; stop and report.**
- **A second Correspondent refuses to start on a home** → that is the lock working. Stop the first.

---

### 8. The arrangement, and which process is up when

```
  1.  the counter      UP FIRST: npm run counter. Needed for buy_stamp and nothing else.
  2.  Y2's window      goose, demoagenty -> gz2-y, --live. PROVISION FIRST, and leave the window OPEN:
                       its watcher is what answers the ring.
  3.  X2's window      goose, demoagentx -> gz2-x, --live. Provision, then resolve, then send.
  4.  the stranger     npm run verify -- --lane <lane>, from anywhere, holding nothing.
```

**One extension per goose window**; each Correspondent takes the lock on its own home.

---

### 9. WHAT GREEN IS

The golden path is **chunk 0's consensus postmark → the recipient's `ScheduleSign` executing the receipt
manifest.** The run is done when **both** are true on a mirror node, read after the ack and not before:

```
  (a) GET /api/v1/schedules/<scheduleId>              -> executed_timestamp NOT null
  (b) GET /api/v1/topics/<Y2 manifest>/messages       -> one message whose decoded bytes hash to
                                                         the receipt manifest's hash
```

And the chain that joins them, each read from consensus: chunk 0 on the lane at sequence 1 with its postmark; the
`transaction` operation at sequence 2 naming the schedule; the execution strictly after chunk 0; the receipt on
Y2's manifest topic at its sequence.

**What GREEN is not.** It is not `send` returning — `send` returns after the ScheduleCreate and before anyone
signs (P-14, T-P14-1). It is not the card saying a receipt was requested. **It is the execution, on consensus, read
back.**

---

### 10. The gate

Nothing signs until this report is committed and Sonic has said the word. **The fill-in is physical, not paper:**
everything rehearsed so far ran with the servers in DRY, where no client has an operator. `AUTHORIZED` means the
two goose entries are flipped to `--live`, the servers restarted, each banner saying so with the argv that carried
the flag, and the counter up.

It runs under HEAD at the time, with the spec at `v0.5.13`, twenty-two `check:*` green, `typecheck` and
`p13:check` green, and the conformance report at 44 passing with digest `51453eea…`.

  **GATE ZERO (second, fresh homes on the demo operators) — [ AUTHORIZED — Sonic, 2026-09-12 ]**


## GATE ZERO, THE SECOND — THE RUN OF RECORD. 2026-09-12, and it is GREEN

**The gate report above is not edited.** This sits beneath it, dated, with every id and every mirror readback.

**IT RAN IN ONE PASS WITH NO STOP.** Six instructions from `docs/OPERATOR-SCRIPT.md`, one per turn, in two goose
windows on the LIVE entries. **Both agents were provisioned, a lane was born, one certified letter with a return
receipt crossed it, the recipient opened it and signed for it, and the network executed the receipt onto her own
manifest topic.** A stranger holding nothing read it back twice at one digest. **Every one of the five stamp
predictions in §3 of the gate report matched exactly.**

**This is the first time goose has driven this server through the golden path on `hedera:testnet`**, and it is
what the first Gate Zero asked and could not answer.

---

### 1. WHAT GREEN IS, READ FROM THE MIRROR AND NOT FROM ANY CARD

**(a) The schedule has executed.**

```
  GET /api/v1/schedules/0.0.10489457
    consensus_timestamp  1789176129.148390104
    executed_timestamp   1789176191.217453809      <-- NOT NULL
    deleted false · wait_for_expiry false · signatures 3
    creator 0.0.10450880 · payer 0.0.10450880
  https://hashscan.io/testnet/schedule/0.0.10489457
```

**(b) The receipt manifest is on the RECIPIENT's own manifest topic.**

```
  GET /api/v1/topics/0.0.10489371/messages?limit=25&order=asc
    seq 1 · consensus 1789176191.217453809 · 508 bytes
    body.hash      188b619e00daf47b8bf2b8b1bc6dbc10a52e27753a108351400856c8bcefb1b0
    inputs.digest  3fd081d7ba57a2155f9bc07ec7cbc51a4f61255d0e05d823841b764c11f84a39
  https://hashscan.io/testnet/topic/0.0.10489371
```

`body.hash` is the hash the `ack`'s own receipt named, and the message's consensus timestamp is **the execution
instant to the nanosecond** — the receipt did not arrive near the execution, it *is* the execution.

**And the chain that joins them, each read from consensus:**

```
  chunk 0        lane 0.0.10489454  seq 1  consensus 1789176126.262539578  op=message
  the request    lane 0.0.10489454  seq 2  consensus 1789176131.249818104  op=transaction, naming 0.0.10489457
  the execution  1789176191.217453809                      STRICTLY AFTER chunk 0, by 64.96 seconds
  the receipt    0.0.10489371 #1    at the execution instant
```

**GREEN.**

---

### 2. The six instructions, and what each returned

Sessions **`20260912_4`** (RECIPIENT, `gz2-y`) and **`20260912_5`** (SENDER, `gz2-x`), read from goose's own
session database. **Six tool calls, and not one other** — the allowlist held again.

```
  01:16:40  Y2  buy_stamp {count 12, provision true, payment "{...}", holder "{...}"}
                -> StampReceipt · txRef 0.0.8641261@1789175795.394278638 · 12 stamps · 13.45267471 h
                   account 0.0.10489361 · doorbell 0.0.10489363 · log 0.0.10489368
                   manifest 0.0.10489371 · declRegistry 0.0.10489372 · profileFile 0.0.10489374

  01:18:24  X2  buy_stamp {the same}
                -> StampReceipt · txRef 0.0.8641261@1789175901.303688982 · 12 stamps · 13.45267471 h
                   account 0.0.10489394 · doorbell 0.0.10489395 · log 0.0.10489398
                   manifest 0.0.10489401 · declRegistry 0.0.10489402 · profileFile 0.0.10489403

  01:19:58  X2  resolve {address 0.0.10489361, profile hcs14}
                -> doorbell 0.0.10489363 · manifest 0.0.10489371 · keyEpoch 1 · trustClass math
                   proof 8b243455a893ddfa5fc24a7ec600d565cc977111bee836e59e4b70e21e6e9151

  01:22:12  X2  send {coordinates "<A STRING>", payload "VGhpcyBsZXR0ZXIg…", returnReceipt true}
                -> Postmark · lane 0.0.10489454 seq 1 at 1789176126.262539578
                   envelope 08329989df027eb94bd99937c95134a4df1b93f749bf5d1f10fd47c5ac68022f

  01:22:29  Y2  inbox {}
                -> 1 delivery, opened true, 70 bytes of payload, state from the lane

  01:23:14  Y2  ack {envelopeId 08329989…}
                -> receipt · schedule 0.0.10489457 · executedTimestamp 1789176191.217453809
```

**`send`'s `coordinates` arrived as a JSON STRING again** — the third session running. **The coercion pushed
at `0d742cc` is the only reason this gate reached a letter at all**, and it was load-bearing on the night it
mattered, not belt-and-braces.

**`send`'s own narration, which is the ten sentences D-162 put in one template**, is the clearest account of
what happened and is quoted whole:

```
  0.0.10489361 resolves under hcs14 at trust class math; its manifest topic is 0.0.10489371 and its key epoch 1.
  ringing the doorbell 0.0.10489363; one stamp goes to the treasury for the request.
  the connection request is at sequence 1 on 0.0.10489363, at 1789176108.702187104.
  lane 0.0.10489454 created, its submit key a threshold of exactly the two agents' keys.
  manifest published at 0.0.10489401 sequence 1.
  envelope 08329989…, sealed against key epoch 1, 85 bytes of ciphertext.
  assembled: 1 chunk(s), weight 1, postage 2.
  postage affixed at 0.0.10450880@1789176115.751660511 under the memo wishmail:08329989…,
      which names this envelope and no other.
  chunk 0 of 1 postmarked on 0.0.10489454 at sequence 1.
  every chunk has a consensus timestamp; the first is 1789176126.262539578.
  a return receipt is requested: schedule 0.0.10489457 is on the lane at sequence 2,
      and it is the recipient's to sign.
  the schedule stands unsigned. Nothing is claimed about whether anyone has read the letter.
```

**The last sentence is P-14 and §11.8 doing their job**: `send` returned before anyone signed, and said so.

---

### 3. Every entity, with its payer and its consensus timestamp

**DemoAgentY2 — home `gz2-y`, agent key `b99f4427…`. The purchase is paid by C1OPERATOR; every mailbox row is
CARRIED by the Postmaster `0.0.8641261`.**

| Entity | Id | Consensus | Payer | Cost |
|---|---|---|---|---|
| account | `0.0.10489361` | `1789175801.455577103` | Postmaster | 0.67263366 ℏ |
| **doorbell** | `0.0.10489363` | `1789175807.454565517` | Postmaster | **27.04256425 ℏ** |
| log | `0.0.10489368` | `1789175815.617806970` | Postmaster | 0.40627073 ℏ |
| manifest | `0.0.10489371` | `1789175823.742109502` | Postmaster | 0.40627073 ℏ |
| declaration registry | `0.0.10489372` | `1789175830.197721187` | Postmaster | 0.40627073 ℏ |
| profile file (HCS-1) | `0.0.10489374` | `1789175836.809625104` | Postmaster | 0.27174400 ℏ |
| profile chunks | on `0.0.10489374` | `1789175843.488583409` | Postmaster | 0.00750174 ℏ |
| HCS-2 register entry | on `0.0.10489372` | `1789175847.090453104` | Postmaster | 0.00363221 ℏ |
| §9.2 account memo | `0.0.10489361` | `1789175851.162597699` | Postmaster | 0.00430485 ℏ |

**DemoAgentX2 — home `gz2-x`, agent key `140bb1a8…`, the same shape:**

| Entity | Id | Consensus | Cost |
|---|---|---|---|
| account | `0.0.10489394` | `1789175906.182427078` | 0.67263366 ℏ |
| **doorbell** | `0.0.10489395` | `1789175909.130790104` | **27.04256425 ℏ** |
| log | `0.0.10489398` | `1789175915.610524104` | 0.40627073 ℏ |
| manifest | `0.0.10489401` | `1789175922.675389541` | 0.40627073 ℏ |
| declaration registry | `0.0.10489402` | `1789175924.514593407` | 0.40627073 ℏ |
| profile file (HCS-1) | `0.0.10489403` | `1789175926.417438237` | 0.27174400 ℏ |
| profile chunks | on `0.0.10489403` | `1789175934.682314667` | 0.00753833 ℏ |
| HCS-2 register entry | on `0.0.10489402` | `1789175937.235459097` | 0.00363221 ℏ |
| §9.2 account memo | `0.0.10489394` | `1789175941.230294104` | 0.00430485 ℏ |

**And between them, the lane:** `0.0.10489454`, created by **C1OPERATOR** at `1789176114.065044104` for
0.53945220 ℏ.

**`register_agent` was not called and no HOL registration was made**, as §4 of the gate report said. **No
`TokenAssociateTransaction` appears for either operator**, as §1 predicted from `autoAssoc -1`.

---

### 4. THE PREDICATES, each checked against the mirror

**The doorbell memos name their own accounts.** This is the 2026-09-11 defect, and it is the reason the fix exists:

```
  0.0.10489363   memo "hcs-10:0:60:0:0.0.10489361"   <-- names DemoAgentY2
  0.0.10489395   memo "hcs-10:0:60:0:0.0.10489394"   <-- names DemoAgentX2
```

**Not one ownerless memo.** Both carry the HIP-991 fee, one unit of `0.0.10426208` collected by `0.0.10426205`.

**The lane's submit key is a threshold of EXACTLY the two agents' keys**, decoded from the mirror's protobuf:

```
  threshold 1 of 2
    140bb1a8d12dc11827c6e14d92e634bc59f0ee29af6af8884fd561e46c24f174   DemoAgentX2
    b99f4427441cada5deb31459c11f36bbfd356440cb3ef7b14957cce5f2197a26   DemoAgentY2
  custom fees: none          memo "hcs-10:1:60:2:0.0.10489363:1"
```

The lane's memo names **the doorbell that answered and the sequence it answered at** — the real HCS-10
connection-topic form, which is what D-171 has a Verifier walk down to find the lane without resolving anything.

**Both accounts carry §9.2's HCS-11 memo:** `hcs-11:hcs://2/0.0.10489372` on Y2 and
`hcs-11:hcs://2/0.0.10489402` on X2 — each naming its own declaration registry.

**NOTHING WAS RUNG THAT SHOULD NOT HAVE BEEN, and it is a count.** `0.0.10489363` (Y2's door) holds **2**
messages — the request and the `connection_created`. `0.0.10489395` (X2's door) holds **0**. X2 rang once; nobody
rang X2.

**The settlement is one transfer under one memo:**

```
  0.0.10450880@1789176115.751660511  at 1789176123.808518352
  memo   "wishmail:08329989df027eb94bd99937c95134a4df1b93f749bf5d1f10fd47c5ac68022f"
  token  0.0.10489394: -2   ->   0.0.10426205: +2
```

Two stamps, from the sender's own account to the treasury, under a memo naming this envelope and no other (§4.3).

---

### 5. THE ARITHMETIC — every stamp prediction matched EXACTLY

Against §3 of the gate report, which was written before anything signed:

```
                        predicted        actual
  X2                    12 -> 9          9           MATCH
  Y2                    12 -> 12         12          MATCH   (T-P16-2: charged nothing, at any step)
  C2OPERATOR             0 -> 0          0           MATCH   (the hop fired; the door consumed it)
  C1OPERATOR             1 -> 1          1           MATCH   (the stray stamp was not spent)
  treasury           9,957 -> 9,936      9,936       MATCH   (-24 sold, +2 postage, +1 door)
```

**§4.4's HOP FIRED, under goose, for the first time.** It is visible as C2OPERATOR's transfer at
`1789176104.638020104`, four seconds before the ring: X2 moved one stamp to its own payer because that payer held
none, and the doorbell's HIP-991 fee then consumed it. **That was the line the gate report said to watch, and it
behaved.**

**In ℏ:**

```
                         before             after            delta       transactions
  C2OPERATOR  (sender)    378.62178036      334.29305690    -44.32872346      11
  C1OPERATOR  (recipient) 322.70803327      278.02212512    -44.68590815       5
  Postmaster  0.0.8641261 3318.26340551    3345.24339774    +26.97999223      20
  DemoAgentX2 0.0.10489394          -        0.05000000 h · 9 stamps
  DemoAgentY2 0.0.10489361          -        0.05000000 h · 12 stamps
```

Each agent holds **exactly one registration fee** and nothing more — the invariant of §11, and neither spent it,
because `register_agent` was not on this path.

**The purchase was ONE transaction with THREE legs, exactly as §4.6 specifies**, and the mirror shows all three in
one `CRYPTOTRANSFER`:

```
  0.0.10450879: -43.45267471 h      the buyer pays
  0.0.8641261:  +42.71120731 h      the Postmaster receives (node 0.0.802 takes 0.69146740)
  0.0.10426205: -12  ->  0.0.10489361: +12       the stamps
  0.0.10489361: +0.05000000 h       the registration fee, funded by the Postmaster
```

---

### 6. DIVERGENCE — the Postmaster made money, and §3 of the gate report said it would not

**One number in the gate report was wrong, and it was ours.** §3 predicted *"two mailboxes is roughly 56 ℏ of the
Postmaster's payer against 60 ℏ taken"*. Measured:

```
  the Postmaster spent   58.44242239 h over 20 transactions (two full mailboxes, two account creations)
  the Postmaster took    85.42241462 h  (42.71120731 x 2)
  net                   +26.97999223 h
```

**The spend was right; the revenue was undercounted.** §3 counted only the 30 ℏ provisioning leg as revenue and
forgot that **the stamps are bought from the Postmaster too** — the buyer's whole 43.45 ℏ lands on
`0.0.8641261`, less the node's fee. At `PriceList` sequence 4 the provisioned path is **profitable**, not
loss-making.

**This does not overturn LIMITATIONS L-5 or ledger §G-20**, and it must not be read as doing so: the doorbell alone
measured **27.04256425 ℏ** tonight, against the 2 ℏ provisioning price that sequences 2 and 3 carried, and at that
price the Postmaster lost heavily on every sale. What is now measured is that **sequence 4's 30 ℏ covers it**.
Recorded here; the correction to L-5's framing is a decision for Sonic and not taken by this run.

---

### 7. The stranger, holding nothing, twice

```
  $ npm run verify -- --lane 0.0.10489454
    scope    lane 0.0.10489454
    holding  no key · no account · no stamp · no counter · no home

    bundle digest   fca22d10b1f5a6dbbf8209748bab90730e46f46081608fee35eb523f4db37848
    envelope        08329989df027eb94bd99937c95134a4df1b93f749bf5d1f10fd47c5ac68022f
    state           ACKED
    APPRAISED       unverified          reasons T-P12-4
    DECLARED        trust class math · 0 endorsement(s)
    receipt         acked
```

**Run twice; the digest is `fca22d10…` both times**, and `narrative.bundleDigest` matches the bundle. §11.7's MUST
holds.

**`unverified` IS THE CORRECT OUTPUT AND IS NOT A SHORTFALL.** `T-P12-4` is the register's row for *"a Verifier
claiming NO PROFILE appraises every fixture's resolution as unverified, never fails, and passes the VERIFIER
suite"*, and this release claims none: `app/src/release.ts:43` is `profiles: {}`, because §1.5's silence claims
nothing. The envelope is **ACKED** and **bound and stamped**; its address is simply unappraised by a Verifier that
has not claimed the profile to appraise it with. That is P-12 downgrading instead of erroring, and §11.5's table as
D-177 settled it. **A Verifier claiming `hcs14` is what would reach `verified`, and this deployment publishes
no such claim.**

**The reading says the postage was affixed by `0.0.10489394`** — the sender's own account — and names the memo
that binds it to this envelope and no other. A stranger reconstructed that from consensus alone.

---

### 8. What this proves, and the three things it does not

**Proved, on `hedera:testnet`, driven by goose:**

1. **The golden path completes.** Provision → buy → resolve → send → inbox → ack → execute, with the receipt on the
   recipient's own manifest topic at the execution instant, chained back to chunk 0's postmark.
2. **The 2026-09-11 fixes hold where it counts.** Both doorbell memos name their own accounts; `generate_mailbox`
   was never reachable; and `send` accepted a stringified `coordinates` for the third session running, which is
   the only reason there was a letter to record.
3. **The payer seam works in both directions under an MCP client**: every mailbox row carried by the Postmaster,
   every act outside the purchase paid by that agent's own operator, and the agent signing throughout.
4. **§4.4's hop fires**, which no gate had ever exercised.
5. **T-P16-2 holds**: the recipient was charged nothing, in ℏ or in stamps, at any step including across the ack.

**NOT proved, and named rather than implied:**

1. **No `hol` resolution.** `register_agent` was off the path by design, so nothing is claimed about §9.5's
   `blurred` rule on these two agents.
2. **No `verified` appraisal**, for the reason in §7: this release claims no profile. The capture that would let a
   profile-claiming Verifier try it was not taken tonight.
3. **A brand-new operator wallet.** Both wallets here are ones we already own and both auto-associate at `-1`, so
   `ensurePayerHoldsStamps`' `TokenAssociateTransaction` branch (`app/sdk/mailbox.ts:287-294`) **still has
   never executed against the network.** That is Gate Four's question and it is untouched by this run.

---

### 9. Residue

**All fourteen entities above are residue** — inputs to a rehearsal that succeeded, not part of the deployment,
superseded by nothing. They are permanent: two HCS-1 profile topics have no admin key at all, and a topic cannot be
deleted. `app/deployment/demo-agents.hedera-testnet.json` and `ENTITIES.md` are **regenerated from each home's
own `record.json`** by `npm run entities:md -- --homes <parent>`, never hand-written; `check:entities` green.

The generated table now carries **eight agents**. Note that `gz-x` renders as *provisioned* with an **empty
account**: that is its damaged `record.json` faithfully reproduced — the outstanding purchase in state `signed`
against a transfer that never landed — and it is left exactly as it is.

  **GATE ZERO (second, fresh homes on the demo operators) — RUN 2026-09-12. GREEN.**

> **NOTE ADDED 2026-09-11, beneath this run of record and not amending it.** This section says **70 bytes** of
> payload twice (the step table and the inbox readback), and the gate report above predicted 70. **The letter on
> consensus is 69 bytes.** It reads *"This letter is certified, and its receipt will be signed on consensu."* —
> the final `s` is missing.
>
> **Nothing in this implementation did it, and nothing about GREEN moves.** The model truncated the base64 in
> the tool call, before the server saw a byte of it. From goose’s own session database, the `payload` argument
> as sent:
>
> ```
> 20260912_3  (an earlier DRY attempt)   96 chars  …Y29uc2Vuc3VzLg==   -> 70 bytes, "…on consensus."
> 20260912_5  (THE LIVE GATE, X2 send)   92 chars  …Y29uc2Vuc3Uu       -> 69 bytes, "…on consensu."
> 20260912_6  (the 2026-09-11 rehearsal) 96 chars  …Y29uc2Vuc3VzLg==   -> 70 bytes, "…on consensus."
> ```
>
> **The same model, the same instruction, the same literal — right twice and wrong once, and the once was the
> recorded run.** It dropped the final `zLg==` and wrote `u`.
>
> Every weld holds over the bytes that were actually sent: the AAD hashed them, the envelope sealed them, the
> settlement named that envelope, the recipient opened it **byte for byte**, and the receipt executed onto her
> own manifest topic. The digest `fca22d10…` is the digest of that correspondence and reproduces from the
> fixture. What is wrong is only that the sentence the letter contains is one character short of the one
> `docs/OPERATOR-SCRIPT.md` asked for.
>
> **It was invisible until 2026-09-11**, because `inbox` returned the payload as a Node `Buffer` and goose
> rendered it as decimal byte values. The UTF-8 rendering added that night is what made it legible, and it read
> it back on the first call. Recorded in §"THE REHEARSAL GATE, BEFORE GATE FOUR".


## GATE FOUR — PREP, written 2026-09-11. NOTHING IS SIGNED AND THIS IS NOT A GATE REPORT

**The Gate Zero report is not amended by any of this, and Gate Four gets its own.** This is the list of what that
report must carry, written now so that supplying the wallets is the only thing left.

**When Sonic supplies the two brand-new operator accounts:**

1. **Write the two homes the way `gz-x` and `gz-y` were** — `config.json` from `app/sdk/config.template.json`
   with that operator's `payer.accountId` and `payer.derKey`, the network, the counter's loopback address and the
   agent's public identity; keys **born on first boot** into `keystore.json`, in the agent's own process. Outside
   the repository, under `~/.wishmail/demo/`, gitignored.
2. **The roles stay as they are: X is the SENDER, Y is the RECIPIENT.**
3. **Read each wallet's `max_automatic_token_associations` from the mirror and write it INTO the gate report**,
   because it is exactly the class of fact a receipt cannot show.
4. **Name this, because it has never run:** `ensurePayerHoldsStamps`' `TokenAssociateTransaction` branch
   (`app/sdk/mailbox.ts:287-294`) **has never executed against the network**. It is skipped whenever the operator
   auto-associates — `-1`, or free slots — and **both demo operators have read `-1` every time**, so every gate so
   far has taken the other branch (`mailbox.ts:282-286`, which emits `provision.autoassociates` and submits
   nothing). **A brand-new wallet with 0 association slots fires it at provisioning**, paid by that operator, about
   0.05 ℏ. That is the code working and not a stop — but it is untested live, and Gate Four is the first run that
   can test it.
5. The gate report also carries, as Gate Zero's did: every entity each provisioning will create; the quote at
   `PriceList` sequence 4 **and** the actual; the submit→learn window per write and the resume from inside it;
   every way it stops; and what the run of record will cite.

  **NEXT LIVE ACT — [ a second GATE ZERO on the demo operators with fresh homes ]**

  **GATE — [ NOT YET ]**

## C0.2's DELIVERY HALF, AND THE COURT THAT CLOSES THE CLASS. 2026-09-11, offline; nothing signed

**Nothing in this section touches `hedera:testnet`, reads a key or opens a socket.** It is not a gate and it has
no fill-in. It is the last of plan C0's five items, and it was still open because the half of it that mattered
was only ever visible on real bytes through a real client.

### 1. What was wrong, and how it was seen

`app/src/mcp/schemas/delivery.output.schema.json` declares `payload` as
`{"type":"string","contentEncoding":"base64"}` and is `additionalProperties: false` over §6.5's five fields.
`inbox`'s handler returned the internal `Delivery`. In goose session `20260912_4` at **01:22:29** the payload came
back as:

```
"payload": {"type":"Buffer","data":[84,104,105,115,32,108,101,116,116,101,114,32,105,115,32,...]}
```

That is the letter — the payoff shot, the recipient reading it — rendered as a list of decimal byte values.
**goose does not validate `structuredContent`, so it cost nothing mechanically and everything on camera.**

It is the same defect as C0.1's `send` half, and the pair of them is why this section exists: **a published
`outputSchema` and a handler return are two artefacts and nothing made them agree.** Neither is reachable from a
CLI, which reads the text block; neither is reachable from `check:mcp`, which compiles every schema and validates
no instance. Three gates driven by CLIs found neither. The first gate driven by goose found both.

### 2. Four violations, and which side moved for each

| # | what | which side moved |
|---|---|---|
| 1 | `payload` is a Node `Buffer`, serialising as `{"type":"Buffer","data":[…]}` | **handler** — `.toString('base64')`. What `send.input.schema.json` accepts in base64, `inbox` returns in base64; a `Buffer` is a Node artefact and not a wire shape (T-P15-4). |
| 2 | `lane`, `chunkPostmarks`, `detail`, `openedUnderEpoch` — four keys the schema forbids | **handler**, all four, into `_meta['wishmail/inbox']`. **Nothing is lost**: `lane` IS `envelope.lane` and `openedUnderEpoch` IS `envelope.keyEpoch`, both REQUIRED by §5.5, so the outer copies were a second spelling and somewhere for them to disagree; `detail` says of itself it is not part of §6.5's shape; `chunkPostmarks` is real evidence that is **not** a §5.7 Postmark. |
| 3 | `returnReceipt` `$ref`s `urn:wishmail:0.5:return-receipt`; the handler ships a `PendingReceipt` | **schema** — and it is a *correction*, not a widening. The handler cannot move: no ReturnReceipt exists at `inbox` time, because `ack` creates it and an executed schedule witnesses it. §6.5's own words say a delivery carries **the pending schedule**. The `$ref` named an object no delivery can ever carry. |
| 4 | the F-4 placeholder envelope | **neither.** §6.5 requires the Delivery and §5.5 has no Envelope to put in it; `envelope.schema.json` is **frozen**. Raised as ledger **§G-32**, a 0.6 candidate, and not coded around. |

**No version event.** The tool schemas under `app/src/mcp/schemas/` are release artifacts in the
`urn:wishmail:app:0.5:` namespace. §18.5 fixes the fourteen in `spec/schemas/` by name and none of these is among
them; `app/src/schema/loader.ts` hard-codes the same fourteen and **throws on a fifteenth**; `spec/pins.json`
records no digest for them; and `app/src/ops/schemas13.ts` registers only `spec/schemas/`, read from the committed
git blob. §1.7 is not engaged.

**The rule is D-178**, and it is the thing that stops a third occurrence: *`structuredContent` carries exactly what
§6 names; `_meta` carries the evidence the implementation also holds; the text block carries the prose.* The
shaping is a **function** — `app/sdk/structured.ts` — read by the handler and by the court, because a court that
restated it would court its own restatement.

### 3. The card, per Sonic's ruling

The bytes stay base64 in `structuredContent`, because the schema and §6.4 say so. The **text block** may render
them as UTF-8 **when and only when they are valid UTF-8**, labelled as a rendering and never replacing them:

```
1 delivery(ies) on 1 lane(s). inbox wrote nothing (§6.5, D-29).
  08329989… — OPENED on 0.0.10489454, key epoch 1, 1 chunk(s), 69 byte(s)
      a receipt is pending on schedule 0.0.10489457; `ack` signs it (§6.6, §10.4)
      a RENDERING of those bytes as UTF-8 — the bytes themselves stay base64 in the result:
      | This letter is certified, and its receipt will be signed on consensu.
```

`TextDecoder` with `fatal: true`, **not** `Buffer.toString('utf8')`, which substitutes U+FFFD silently and would
therefore render every byte string and call it text. C0 control characters decline to render, because a card goes
to a terminal — that guard is Claude's and Sonic kept it.

### 4. `check:outputs` — the twenty-third check, and the class rather than the instance

`npm run check:outputs`, `app/sdk/outputs.check.ts`, **41 assertions**. For every verb the server publishes —
**read from `six()` and never restated**, so a seventh verb arrives with no producer and fails — it asks three
questions, and only the first is ajv's:

1. **Does the shaped return validate against the published schema, after a JSON round trip?** The round trip is
   not decoration: it is what turns a `Buffer` into `{"type":"Buffer",…}`, which is what a client actually sees.
2. **Does every declared key have a producer, and every produced key a declaration?** Two written lists,
   `UNPRODUCED` and `UNDECLARED`, each asserted by **equality** so neither can quietly absorb a regression.
3. **Is every `contentEncoding` honoured?** 2020-12 makes it an **annotation**; ajv does not enforce it and
   `{strict: false}` does not warn. It is the exact hole the Buffer crossed, so it is asserted by hand, as a
   decode/encode round trip that also rejects non-canonical padding and a base64url string under `base64`.

**The coverage is stated rather than implied**, and the PASS line says it: `resolve`, `send` (both arms of §6.4's
`oneOf`), `inbox` (an opened delivery with a payload and a pending schedule, **and** an unopened one so §6.5's
`reason` has a producer), `ack` and `verify` are **real handler returns** over the modelled ledger.
**`buy_stamp` is hand-built and is not courted on a real return here** — the receipt is the counter's, and the
only producer of a real one is a counter. So the real one is courted where a counter is already standing:
`check:exchange` gained one assertion (49 → **50**) validating the receipt **it actually issued over a loopback
socket** against `buy_stamp`'s own published `outputSchema`. **It passed** — there is no third instance of this
defect on the golden path.

**The world is the letter's world.** `check:letter`'s model court moved to `app/src/tools/court.ts` as a **pure
move** — lines 109–403, byte for byte, nine declarations exported and one import line back — so both courts stand
in the same world. A court whose world is not the letter's proves nothing about the letter's outputs. **The move
is verified mechanically and not argued: `check:letter` printed 199 assertions before and 199 after.**

### 5. What the first run found, and what was done with each

Run **before** the fix, deliberately, so the first run is the evidence.

| finding | verdict |
|---|---|
| `inbox` fails validation ten ways on `returnReceipt` alone, plus four forbidden keys | **fixed** — §2 above |
| `bundle.correspondence[].settlement.tokenId` is produced and **not declared** | **recorded, §G-33.** §5.6 declares seven fields; §11.4 needs the token, so the implementation writes an eighth. `settlement.schema.json` omits `additionalProperties`, so **ajv is silent** — this was found by the path diff and by nothing else. |
| `bundle.observations.verifierSpec` is produced and not declared | **recorded, §G-33.** Added by **D-173** in the 0.5.12 patch; the schema was not amended in the same patch. |
| `bundle.observations.stampTokenUnknown` is produced and not declared | **recorded, §G-33.** |
| `bundle.correspondence[].returnReceipt` is **declared and never produced**, even for a letter that was acked | **recorded, §G-33.** The bundle carries the receipt's *appraisal*, not the receipt. This is the D-166 class — a declared field with no producer validates forever. |

**All four are `verify`, which is VERIFIER-side and not on the goose allowlist the demo drives**, so none is on
the golden path and all are recorded rather than fixed (RECORD, Sonic). Two of them would need a **frozen** schema
to move, which is 0.6 and never a patch.

**One court hole, named rather than hidden:** this court posts one letter on one lane, so it produces no slip, no
orphan, no off-chain chunk and no agent-identifier ordering, and it never reaches the F-4 placeholder of §G-32.
Every one of those paths is in `UNPRODUCED` with its reason.

### 6. Also in this change

- `delivery.output.schema.json` and `src/mcp/tools.ts` both claimed the Delivery divergence was "Reported as a
  divergence with the Step 3 record". **Step 3 is `app/OPERATIONS.md` §"Step 3" and carries no such report** — the
  claim could not be located and both sentences are deleted rather than left pointing at nothing.
- `STATUS.md` carried `check:correspondent` at **118**; it has been 149 since the boundary coercion landed.
  Corrected.
- **`app/OPERATIONS.md`'s five "twenty-two `check:*`" lines are NOT updated**, and that is deliberate: one is
  inside the first Gate Zero's gate report (§8, "What the dry runs proved") and four are dated run records. A gate
  report is never amended after its run. The present-tense counts in `CLAUDE.md`, `STATUS.md`,
  `docs/GATE-RECORD.md` and `conformance/DERIVATION.md` moved to twenty-three.

### 7. The battery

`typecheck`, `p13:check` and **all twenty-three `check:*` green**. `check:letter` **199** (unmoved by the court
extraction), `check:correspondent` 149, `check:exchange` **50**, `check:outputs` **41**. **`check:captured` 20 and
`check:receipt` 43 — byte-identical**, which is what says the network's own recorded digests did not move.
`npm run conformance`: register 87 · **passed 44** · failed 43, unchanged.

---

## THE CAPTURE THE SECOND GATE ZERO OWED. 2026-09-11, a mirror read; nothing signed, nothing spent

**Not a gate and it has no fill-in.** `sdk/capture.cli.ts` builds a `Reader`, and a `Reader` has no write
method. Asserted rather than assumed, by tracing every import it reaches: it constructs **no Hedera `Client`**
(the only `Client` in its graph is a **type-only** import in `sdk/live.ts` and a parameter type in
`ops/hcs10.ts`), it reads **no key** (`dotenv` sits behind `ensureLoaded()`, which only `readSecret` calls, and
capture imports `repoRoot` alone), and its whole I/O surface is HTTP GETs against a mirror node. Its only side
effect is writing the fixture — and it **silently overwrites a same-named file**, which is why a fresh name was
used: the four original captures are declared records that must not be rewritten.

### What it was for

Gate Zero the second is the only gate not driven by a CLI. Its run of record printed the stranger's bundle digest
**twice from the live mirror**, which satisfies §11.7's stability MUST and does **not** show the number
reproducing from evidence a stranger could hold. That is repetition, not reproduction, and it was the one gap the
plan's own standard named.

```
$ npm run capture -- --lane 0.0.10489454 --name gate-zero-two-certified

  captured    conformance/fixtures/gate-zero-two-certified.json
  lane        0.0.10489454
  topics      0.0.10489401, 0.0.10489454, 0.0.10489363, 0.0.10448509, 0.0.10448507, 0.0.10489371
  schedules   0.0.10489457
  envelopes   1
  envelope    08329989df027eb94bd99937c95134a4df1b93f749bf5d1f10fd47c5ac68022f
  appraised   unverified (T-P12-4)
  digest      fca22d10b1f5a6dbbf8209748bab90730e46f46081608fee35eb523f4db37848
```

**The digest is the one the run of record printed**, to the byte.

### `check:gzero2` — 45 assertions, and what it holds that no other court does

`npm run check:gzero2`, `app/src/tools/gzero2.check.ts`, modelled on `check:gate3`. It reads the file and
reaches `fca22d10…` **with no network**, twice, and again as a Verifier at another patch of 0.5 (§11.7, T-P3-1).
Beyond the digest:

- **The recipient's doorbell memo names its own account** — `hcs-10:0:60:0:0.0.10489361`. That is the
  2026-09-11 defect asserted **absent from the bytes the network kept**, rather than from the code that wrote
  them, and it is asserted as *not* the ownerless `hcs-10:0:60:0:` form the first Gate Zero left on two
  permanent topics. Her own key is fee-exempt at her own door (D-137), and the door carries §4.4's one stamp to
  the treasury and no other fee.
- **The lane's birth walks from the lane alone** (D-171), with the parties supplied to nothing: the lane's memo
  names the door, the door's memo names its owner, the answer on it names who rang. The lane's submit key is a
  threshold of **exactly** the two agents' keys (T-P17-2) and it carries no custom fee (T-P11-3).
- **T-P16-2 on a real HIP-423 schedule.** `0.0.10489457` executed at `1789176191.217453809`; its inner body is
  paid by the **sender's** operator `0.0.10450880`, so the recipient signed for her letter and was charged
  nothing for it. The receipt manifest is at **sequence 1** of her own manifest topic `0.0.10489371` at that
  same instant to the nanosecond.
- Two alterations — a settlement memo naming a different envelope, and a chunk that no longer rebuilds to its
  identifier — each drops the standing or loses the envelope, and each moves the digest.

### From HEAD, not from a tag

Plan C4 asked for a digest "shown to reproduce from the fixture **at the tag**, never from a live re-run". The
second half is met. The first cannot be: **`v0.5.13` is `363a8b8` and HEAD is twenty-six commits past it**,
three of them in `app/sdk/` — the two provisioning refusals and the boundary coercion — so a Verifier at that
tag is a materially different binary from the one that took this capture. Recorded as **reproduces from HEAD at
specification 0.5.13**, binding to whatever tag is next cut.

### Deliberately NOT registered with the suite

RECORD (Sonic, 2026-09-11). `conformance/support/fixtures.ts` is untouched, so `allFixtures()` does not return
this file and the ~ten bodies that iterate every fixture are not armed against it. **The reason is the calendar
and not the evidence**: Gate Four runs tonight and the battery goes into it exactly as green as it was — 87
registered, **44 passed**, 43 failed. Gate Four's own capture follows, and both are registered together
afterward, with whatever those bodies then say reported as findings rather than narrowed away.

---

## THE REHEARSAL GATE, BEFORE GATE FOUR. 2026-09-11 — every window DRY; nothing can sign and nothing can spend

**Not a gate and it has no fill-in.** It stands between Part 1's fix and GATE FUND's report because the `inbox`
narrowing changed the one card a judge actually reads, and a change to the golden path that has never been seen
through goose's own serialiser is a change that has not been tested where it matters.

### Why A3 alone was not enough, and the code is what says so

The instruction was to re-run A3 — the DRY `send` on `gz-x` — because it "exercises `structured.ts`'s send path
under goose's serialiser". **It does not, and this is the deviation.** `send` has a DRY branch
(`app/sdk/server.ts`, `case 'send'` → `if (s.dryRun)`), and `planned()` returns a text block and `_meta` and
**no `structuredContent` at all**. The same is true of `buy_stamp`, `ack` and both affordances. So in a dry
session the only verbs that emit `structuredContent` are the three with no DRY branch: **`resolve`, `inbox` and
`verify`**.

Which turns the finding around: A3 proves the boundary coercion still reads a stringified `coordinates` and that
the send path reaches its plan — worth having, and it is kept — but **`inbox` is the verb that was changed, and
`inbox` is rehearsable**. It needs a home holding a real opened letter, which `gz-x` has not and `gz2-y` does.

### The entries, and the hazard that was removed first

Both standing entries were **`--live` and pointed at SPENT homes**. A same-name repoint that silently failed to
take — Goose Desktop needing its restart, a `.bak` reloading, an edit that did not land — would have put the
first `buy_stamp` **live against `gz2-x`**, where a plain purchase without `provision` would **succeed and
spend**, that agent having an account and stamps. So they were **removed outright** rather than repointed, and
the new entries carry new names: a new name cannot load a stale target, because it either exists or it does not.

| entry | home | mode | allowlist |
|---|---|---|---|
| `rehearsalx` | `gz-x` (debug) | `--dry-run` | `buy_stamp, resolve, send, inbox, ack` |
| `inboxproofy2` | `gz2-y` (spent, read-only) | `--dry-run` | `inbox` **alone** |

Zero `--live` lines remain anywhere in `config.yaml` and `gz2-x` is named nowhere in it. **Both are deleted
after the rehearsal.**

**Terminal pre-flight, both command lines, before either was handed over.** goose **discards** the extension's
stderr — `argv as received` returns **0 hits** across the whole of the second Gate Zero in
`~/AppData/Roaming/Block/goose/data/logs/server/` — so the banner proves the command line works and proves
nothing about what a goose window loaded:

```
  wishmail correspondent — DRY RUN: nothing will be signed
  argv as received  ["C:/Users/Sonic/.wishmail/demo/gz2-y","--dry-run"]
wishmail correspondent — home …\gz2-y, keys loaded, account 0.0.10489361, payer 0.0.10450879
  DRY RUN — no payer key was read and no client has an operator; the doorbell watcher is NOT running.
  … exit 0, no run.lock
```

### What discriminates a home INSIDE goose, since the banner cannot

Not a refusal: on a spent home a DRY `buy_stamp` with `provision` returns `planned(…)` **before any mirror
read** and never reaches the "account exists" refusal. The discriminator is in that same card, twice over —
`holder` is `{publicKey: …}` on a fresh home and `{account: …}` on a spent one, and `buyer` names the operator
wallet. One card proves which `config.json` and which `keystore.json` a window loaded. **That is step 0 of
`docs/OPERATOR-SCRIPT.md` Part B.**

### The three instructions, one per turn

**R1 — `rehearsalx` window.** Call `resolve` once with `address` `0.0.10462700` and `profile` `hcs14`.
*Expect:* real coordinates for DemoAgentA2 — a doorbell, a manifest topic, a proof hash. A live mirror read that
works in DRY because resolving pays nothing (P-4). **This is the one verb that courts `STRUCTURED.resolve`
through goose's serialiser.** **stop**

**R2 — `rehearsalx` window.** Call `send` once, passing the coordinates object from R1's result **unchanged**,
`payload` `VGhpcyBsZXR0ZXIgaXMgY2VydGlmaWVkLCBhbmQgaXRzIHJlY2VpcHQgd2lsbCBiZSBzaWduZWQgb24gY29uc2Vuc3VzLg==`,
`returnReceipt` true. *Expect:* a **DRY RUN / would-do** card. The pass is that `send` accepted coordinates
handed straight from `resolve` — the boundary coercion, still holding. **It carries no `structuredContent`, and
that is the point above.** **stop**

**R3 — `inboxproofy2` window**, with `rehearsalx` toggled off. Call `inbox` once with no arguments.
*Expect,* and all four are asserted:

1. `payload` is a **base64 string** — **not** `{"type":"Buffer","data":[…]}`;
2. the text block renders the demo sentence, **labelled as a rendering of the bytes**;
3. **none** of `lane`, `chunkPostmarks`, `detail`, `openedUnderEpoch` appears in `structuredContent`;
4. `returnReceipt`, if present, is the `PendingReceipt` shape — `scheduleId`, `sequenceNumber`,
   `consensusTimestamp`, `requestedByHeader` — and not a §5.8 ReturnReceipt.

**stop.** The card is recorded verbatim below.

### The cards, as they came back

**RUN AND PASSED, 2026-09-11.** All three calls returned `status success`. Read out of goose's own session
database — `~/AppData/Roaming/Block/goose/data/sessions/sessions.db`, sessions `20260912_6` (R1, R2) and
`20260912_7` (R3) — and not from a retelling.

**R1 — `rehearsalx__resolve`.** Real coordinates for DemoAgentA2, off the live mirror, in a session that reads
no key:

```
  address 0.0.10462700 · doorbell 0.0.10462704 · log 0.0.10462708 · manifestTopic 0.0.10462713
  keyEpoch 1 · resolutionProof.hash 57625b02… · resolutionProof.uri null
  trustClass math · endorsements [] · resolvedAt 1789186971.486000000
```

`resolutionProof.uri` is `null` by §6.2 — null until `send` publishes the manifest — which is the one
`UNPRODUCED` entry `check:outputs` records for `resolve`, here confirmed through goose's own serialiser.

**R2 — `rehearsalx__send`, DRY.** `coordinates` arrived **as a STRING** for the fourth session running, the
model having serialised the object it was handed. The boundary coercion read it, and `send` reached its plan:

```
DRY RUN — send would post one certified envelope to 0.0.10462700
  wouldDo "post one certified envelope to 0.0.10462700"
  recipient {address 0.0.10462700, doorbell 0.0.10462704, manifestTopic 0.0.10462713, keyEpoch 1}
  _meta {"wishmail/dryRun": true, "wishmail/spec": "0.5.13"}
```

**No `structuredContent`**, exactly as §"Why A3 alone was not enough" says: `planned()` emits a text block and
`_meta` and nothing else.

**R3 — `inboxproofy2__inbox`, the proof this rehearsal existed for.** All four assertions hold:

```
1 delivery(ies) on 1 lane(s). inbox wrote nothing (§6.5, D-29).
  08329989df027eb94bd99937c95134a4df1b93f749bf5d1f10fd47c5ac68022f — OPENED on 0.0.10489454,
      key epoch 1, 1 chunk(s), 69 byte(s)
      a receipt is pending on schedule 0.0.10489457; `ack` signs it (§6.6, §10.4)
      a RENDERING of those bytes as UTF-8 — the bytes themselves stay base64 in the result:
      | This letter is certified, and its receipt will be signed on consensu.
```

```json
"structuredContent": { "deliveries": [ {
    "envelope": { … "aadHash": "08329989…", "keyEpoch": 1, "chunkCount": 1 },
    "opened": true,
    "payload": "VGhpcyBsZXR0ZXIgaXMgY2VydGlmaWVkLCBhbmQgaXRzIHJlY2VpcHQgd2lsbCBiZSBzaWduZWQgb24gY29uc2Vuc3Uu",
    "returnReceipt": { "scheduleId": "0.0.10489457", "sequenceNumber": 2,
                       "consensusTimestamp": "1789176131.249818104", "requestedByHeader": true } } ] }
"_meta": { "wishmail/spec": "0.5.13",
           "wishmail/inbox": { "lanes": ["0.0.10489454"], "deliveries": [ … lane, chunkPostmarks, openedUnderEpoch … ] } }
```

1. `payload` is a **base64 string**, not `{"type":"Buffer","data":[…]}`. **The defect is gone on the wire.**
2. The text block renders it, **labelled as a rendering of the bytes**.
3. `structuredContent.deliveries[0]` carries **exactly** `envelope`, `opened`, `payload`, `returnReceipt` —
   none of the four narrowed keys. They are in `_meta['wishmail/inbox']`, where nothing claims they are output.
4. `returnReceipt` is the **`PendingReceipt`** shape — `scheduleId`, `sequenceNumber`, `consensusTimestamp`,
   `requestedByHeader` — and not a §5.8 ReturnReceipt.

### AND IT IMMEDIATELY FOUND SOMETHING, WHICH IS THE ARGUMENT FOR IT

**The letter on consensus is 69 bytes and says "…signed on consensu." The demo sentence is 70 bytes and says
"…signed on consensus."** The rendering is what showed it; for as long as the payload was decimal soup, nobody
could have read it.

It is not this deployment's defect and nothing in the code did it. **The model truncated the base64 in the tool
call**, before the server saw a byte of it. From goose's own record, the `payload` argument as sent:

```
20260912_3  (an earlier DRY attempt)   96 chars  …Y29uc2Vuc3VzLg==   -> 70 bytes, "…on consensus."
20260912_5  (THE LIVE GATE, X2 send)   92 chars  …Y29uc2Vuc3Uu       -> 69 bytes, "…on consensu."
20260912_6  (tonight's R2, DRY)        96 chars  …Y29uc2Vuc3VzLg==   -> 70 bytes, "…on consensus."
```

**The same model, the same instruction, the same literal — right twice and wrong once, and the once was the
recorded run.** It dropped the final `zLg==` and wrote `u`.

**Nothing about GREEN moves.** The envelope was sealed over those 69 bytes, the AAD hashed them, the settlement
named that envelope, the recipient opened it **byte for byte**, and the receipt executed onto her own manifest
topic. Every weld holds over the payload that was actually sent. What is wrong is only that the sentence the
letter contains is not quite the sentence the operator script asked for.

**The record is corrected beneath, not rewritten**: `app/OPERATIONS.md` §"GATE ZERO, THE SECOND — THE RUN OF
RECORD" says "70 bytes" in two places and the gate report predicted 70. Those stand as written; the note beneath
the run of record carries the truth.

**And it is a live risk to tomorrow's take**, which is the point of finding it tonight rather than on camera.

---

## GATE FUND — six brand-new wallets and their homes. Gate report, written 2026-09-11 before anything is created

**This is a gate report and it is committed before the first signature.** It creates accounts and moves ℏ, so it
gets the same discipline as any other signed act: what it creates, what it asserts from the mirror, what it writes
and where, how it resumes, and every way it stops. **The fill-in is at the foot and it is unfilled.**

It creates **no topic, no token and no agent**. It buys nothing. Nothing here rings a doorbell or touches the
counter, and the counter stays down throughout.

### 1. What it creates

Six accounts on `hedera:testnet`, each with **`maxAutomaticTokenAssociations = 0`**, each funded with **250 ℏ**
from the Postmaster's payer `0.0.8641261`, and six home directories outside the repository under
`~/.wishmail/demo/`.

| home | agent | role | for | provisioned tonight? |
|---|---|---|---|---|
| `gz4-x` | DemoAgentX4 | SENDER | **Gate Four** | yes — Gate Four runs it |
| `gz4-y` | DemoAgentY4 | RECIPIENT | **Gate Four** | yes |
| `gz5-x` | DemoAgentX5 | SENDER | the recorded take | **no** |
| `gz5-y` | DemoAgentY5 | RECIPIENT | the recorded take | **no** |
| `gz6-x` | DemoAgentX6 | SENDER | the spare | **no** |
| `gz6-y` | DemoAgentY6 | RECIPIENT | the spare | **no** |

**The gz5 and gz6 pairs are born and left alone** (RECORD, Sonic): `config.json` written, **agent keystores born
by a DRY boot**, and the zero-accounts mirror check recorded — so tomorrow starts at instruction one with nothing
left to discover. No `buy_stamp`, no live boot, **and no goose entry**: four or six entries behind a single global
`enabled` is a toggle hazard, and each run gets its entries written for it and removed after.

**The spare pair exists because the take can be spoiled by something outside this code.** On 2026-09-12 the model
truncated a base64 payload in a tool call and the second Gate Zero's letter landed one character short. A spoiled
take must cost a rename, not a second GATE FUND.

### 2. Zero slots, and why that is the whole point

**`ensurePayerHoldsStamps` (`app/sdk/mailbox.ts`) reads the operator from the mirror and skips the association
when `max_automatic_token_associations` is `-1` or has a free slot.** Both demo operators have read `-1` every
time, so its `TokenAssociateTransaction` branch **has never executed against the network** across four gates.

With `slots = 0` and no tokens held, `0 === -1` is false and `0 > 0` is false, so the branch fires. It associates
**`s.homePayerId` — the operator's own wallet** — paid and signed by the operator on its local client, never by
the carrying Postmaster, at a declared maximum of 2 ℏ against an expected ~0.05 ℏ.

**It fires at provisioning**, inside `generateMailbox`, which the provisioned path reaches from `sdk/counter.ts`
**before any topic is created and long before any ring** — and on **both** agents' operators, including the
recipient's, which will never ring a doorbell and will therefore hold an associated `$POSTAGE` balance of zero
forever. That is ~0.05 ℏ spent for nothing on the recipient side. **It is recorded and not fixed** (RECORD,
Sonic): it is on the golden path, it is what the gate exists to see, and changing it tonight would mean Gate Four
no longer tests what it was called for.

**Nothing in this repository can retro-fit slots onto an existing wallet** — no `setMaxAutomaticTokenAssociations`
appears on any `AccountUpdateTransaction` anywhere — so the value must be right at creation or the account is
useless for this gate.

### 3. The arithmetic, from Gate Zero the second's measurements

| leg | measured | where |
|---|---|---|
| the purchase (12 stamps + 30 ℏ flat), each side | **43.45267471 ℏ** | both receipts, 2026-09-12 |
| — the stamp bundle, 12 for "1.00" USD, **floats with the rate** | 13.45267471 ℏ (13.29198051 on 09-10) | PriceList seq 4 |
| — provisioning, flat | 30.00000000 ℏ | PriceList seq 4 |
| sender's traffic after the purchase (hop, ring, 2 outbound records, manifest, settlement, chunk 0, ScheduleCreate) | **0.87604875 ℏ** over 10 tx | C2OPERATOR's total less its purchase |
| recipient's traffic after the purchase (lane 0.53945220 + `connection_created`, outbound record, ScheduleSign) | **1.23323344 ℏ** over 4 tx | C1OPERATOR's total less its purchase |
| **new, never paid before** — `TokenAssociateTransaction` | ~**0.05 ℏ**; hard ceiling **2 ℏ** | `mailbox.ts`'s declared maximum |

**Floor per wallet: ≈ 44.4 ℏ** (sender) and **≈ 44.8 ℏ** (recipient). The doorbell's 27.04256425 ℏ and the rest
of the mailbox are **carried by the Postmaster** and never touch these wallets, which is why the floor is one
purchase plus small change.

**250 ℏ each is ≈5.6× that floor** (RECORD, Sonic). It survives a doubling of the HBAR/USD rate on the floating
stamp leg — the only input here that can move on its own — with room over. Gate Zero's own wallets ran at 8.5×
and 7.2×; Gate Three called 458.66 ℏ "about ten times the price".

### 4. Predicted balances

```
  before   0.0.8641261  (Postmaster payer)   3345.24339774 h      [read from the mirror 2026-09-11]

  six creates            -1500.00000000 h    (6 x 250)
  six create fees        -      ~0.30 h      (~0.05 each; declared maximum 5 h each)

  after    0.0.8641261                       ~1844.94 h   and NOT BELOW 1815.24 h
                                             even if every create charged its full declared maximum
  each new wallet                             250.00000000 h   $POSTAGE 0   maxAutomaticTokenAssociations 0
```

**The Postmaster's own working capital is not at risk by this.** Each provisioning costs it ≈29.2 ℏ and returns
≈42.71 ℏ, so carrying Gate Four and the take together is ≈117 ℏ of float against ≈171 ℏ of revenue. And the ℏ in
these six wallets is **not spent, only moved**: the payer key for each is written into its own home, so it is
recoverable.

### 5. FUNDING IS NOT REVENUE, AND THE RECORD MUST MAKE THAT UNFORGEABLE

Gate Zero the second measured the Postmaster at **+26.97999223 ℏ** net, and that number was clean of funding.
Tonight's must be too.

- The six `AccountCreateTransaction`s and their initial balances go in **their own table**, in GATE FUND's run of
  record, headed as funding.
- **Gate Four's §3 economics line is computed over Gate Four's transactions only**, and states in words that these
  transfers are excluded and where they are recorded instead.
- The precedent is `Demo-operator funding`, earlier in this file.

A reader who wants the Postmaster's economics must be able to get them without subtracting anything by hand.

### 6. The order of operations, and why it is inverted

**RULED (Sonic, 2026-09-11): the payer key is generated AND persisted to disk BEFORE
`AccountCreateTransaction` is submitted.** `app/src/ops/gate-four-wallets.ts`, per home:

```
1.  bornPayerWallet()                    the key exists only in this process
2.  install(home, template, PENDING)     config.json at 0600, WITH THE KEY, before anything is submitted
3.  AccountCreateTransaction             250 h, maxAutomaticTokenAssociations 0,
                                         signed by the new key, paid by 0.0.8641261
4.  mirror readback                      assert account exists, not deleted, holds >= 250 h,
                                         and max_automatic_token_associations === 0
5.  writeAccountId(config, id)           tmp + rename at 0600 — not via install(), which refuses
6.  record
```

`install()` takes the account id at write time and the account does not exist yet, so the write is two-phase.
`PENDING-ACCOUNT-CREATE` deliberately **fails** `openHome()`'s `^[0-9]+\.[0-9]+\.[0-9]+$` check, so a half-written
home cannot be booted and says why to whoever opens it.

**This inverts `demo-operators.ts`, deliberately.** That module will not write a key for an account it has not
verified — a good rule at 35 ℏ — but its failure shape is the readback throwing *after* the account is created and
*before* the key is written, and its own comment says the cost: *"The account exists and the key for it is NOT yet
written to any file; recover it by hand or abandon it."* At 250 ℏ, six times over, that is not acceptable. **Money
is never created here except against a key already on disk.**

### 7. The submit→learn window, and how a run resumes from inside it

| crash | what is true | resume |
|---|---|---|
| between 2 and 3 | key on disk, **nothing funded** | manual: create an account for that key, or delete the home |
| between 3 and 4 | **account created and FUNDED**, key on disk, id not written | manual: find it on the mirror by public key (`/accounts?account.publickey=…`), confirm slots `0`, fill in `payer.accountId` |
| between 4 and 5 | same, and the mirror already agrees | manual: fill in `payer.accountId`; the error message names the id |
| after 5 | complete | nothing to do |

**A re-run can never create a second funded account**, because `install()` refuses to overwrite and it is step 2.
**So the resume is manual, and this report says so rather than implying idempotence.** `--only <slug>` exists so
the remaining wallets can be created without touching the finished ones.

### 8. Every way it stops

- `--live` did not arrive → the banner says DRY RUN and it prints a plan and exits. **A flag's name is not proof
  it arrived; `mode.ts` echoes the argv it actually received.**
- any `config.json` already exists → refuses that home by name, before a key is born.
- the create fails → throws naming the status, the transaction id, and **that the key is on disk and nothing was
  funded**.
- the mirror does not read back the account with **exactly zero slots** → throws naming the account id and **that
  the key is on disk and the account IS funded**, so nothing is lost.
- a config that does not read as `PENDING` at step 5 → refuses to rewrite it.
- **On any stop: report what is true at the stop and what is resumable, and wait.** Never repair past it, never
  infer. Every key born is on disk; the summary table prints what was created before the stop.

### 9. What it does NOT do

No topic, no token, no agent, no purchase, no association — the association is the agent's own act at
provisioning and belongs to Gate Four, not here. **The counter stays down.** No goose entry is written for any of
these six by this step. `ENTITIES.md` and `demo-agents.hedera-testnet.json` are not regenerated here: these are
operator wallets, not agents, and the generator reads agents' `record.json` files.

### 10. Before it runs

```
$ npm run gate4:wallets:plan     # prints the six, refuses none, submits nothing
```

and the live invocation is `npm run gate4:wallets`, with `--live` **baked into the script string** in
`app/package.json` where no npm forwarding can eat it.

---

  **GATE FUND — [ AUTHORIZED ]** — Sonic, 2026-09-11, after the rehearsal passed and the goose child
  processes were confirmed reaped.

  Funding wallet: **`0.0.8641261`**, the Postmaster's payer, named by Sonic 2026-09-11.
  Six wallets, 250 ℏ each, 1500 ℏ total. **Naming the wallet is not the word.**

---

## GATE FUND — THE RUN OF RECORD. 2026-09-11, and all six stand

**Read from the mirror, from no card and from no driver's own output.** The gate report above is not amended.

```
$ npm run gate4:wallets

  gate4:wallets — LIVE: this run CAN SIGN and CAN SPEND
  argv as received  ["--live"]
```

**One pass, no stop.** Six accounts created, six homes written, six agent keystores born afterward.

### 1. The six, read back from the mirror

```
  home    account         balance            slots  deleted  tokens  memo   for
  gz4-x   0.0.10492952    250.00000000 h       0    false      0      ""    Gate Four — SENDER
  gz4-y   0.0.10492953    250.00000000 h       0    false      0      ""    Gate Four — RECIPIENT
  gz5-x   0.0.10492954    250.00000000 h       0    false      0      ""    the take — SENDER
  gz5-y   0.0.10492957    250.00000000 h       0    false      0      ""    the take — RECIPIENT
  gz6-x   0.0.10492960    250.00000000 h       0    false      0      ""    the spare — SENDER
  gz6-y   0.0.10492962    250.00000000 h       0    false      0      ""    the spare — RECIPIENT
                          ----------------
                          1500.00000000 h funded
```

**`max_automatic_token_associations` reads `0` on every one, from the mirror**, which is the whole point of the
gate and exactly the class of fact a receipt cannot show. Each holds **zero tokens** and carries **no account
memo** — it is an operator wallet and not an agent.

### 2. FUNDING, AND IT IS NOT REVENUE

**This table is the funding, and it is excluded from every economics line in this repository.** The Postmaster's
payer is the source because it is the wallet we control; these transfers are a float into demo wallets we hold the
keys to, not a sale, not a gift and not a cost of running a Postmaster. Gate Zero the second measured the
Postmaster at **+26.97999223 ℏ** net clean of funding, and **Gate Four's economics line will be computed over Gate
Four's transactions only** and will say so in words.

```
  home    CryptoCreateAccount                        consensus                 payer debit      of which fee
  gz4-x   0.0.8641261@1789188694.567726462  SUCCESS  1789188700.005518850       250.67192702      0.67192702
  gz4-y   0.0.8641261@1789188695.988754361  SUCCESS  1789188702.777714524       250.67192702      0.67192702
  gz5-x   0.0.8641261@1789188701.090970032  SUCCESS  1789188705.384410415       250.67192702      0.67192702
  gz5-y   0.0.8641261@1789188701.755006523  SUCCESS  1789188707.481644104       250.67192702      0.67192702
  gz6-x   0.0.8641261@1789188704.535454321  SUCCESS  1789188709.362761104       250.67192702      0.67192702
  gz6-y   0.0.8641261@1789188704.213826126  SUCCESS  1789188711.948273630       250.67192702      0.67192702
                                                                              --------------    ------------
                                                                              1504.03156212      4.03156212

  0.0.8641261   before  3345.24339774 h      after  1841.21183562 h      delta  -1504.03156212 h
```

### 3. THE DIVERGENCE, AND IT IS OURS

**§4 of the report predicted the six create fees at "~0.30 ℏ (~0.05 each)". They measured 0.67192702 ℏ each,
4.03156212 ℏ in total — thirteen times the estimate.** The final balance is **1841.21183562 ℏ** against a
predicted ~1844.94.

**The bound held and the point estimate did not.** The report also wrote the floor — "NOT BELOW 1815.24 ℏ even if
every create charged its full declared maximum" — and 1841.21 is inside it, which is why writing a bound beside an
estimate is worth the line it costs. Nothing about the gate changes: every wallet holds its full 250 ℏ, and the
overrun came out of the Postmaster's own pocket, not out of the funding.

**The estimate was wrong for a bad reason: the right number was already in this file.** `0.05 ℏ` is the
*`TokenAssociateTransaction`* estimate — the thing Gate Four exists to fire — and it was carried across to
`CryptoCreateAccount` by nothing but proximity. Gate Zero the second's own per-agent cost table records
`account 0.67263366` for exactly this operation, two hundred lines above where the prediction was written.
**Measure what an operation costs before predicting it, and prefer this file's own measurement to a recollection**
— which is the rule the doorbell taught on 2026-09-09 and this is its second occasion.

### 4. The homes, and the keys

Six homes under `~/.wishmail/demo/`, **outside the repository and gitignored**. Each `config.json` was written at
mode `0600` **with its payer key in it, before its account existed** — the ruled order — and then had
`payer.accountId` filled in after the mirror agreed. No key was printed, logged, or written inside the repository;
`npm run p13:check` is green and the repository does not contain the gz4-x payer key
(`sha256 77c55a1b5a785002…`, printed as a digest and never as the key).

**The agent keys were born afterward, on each home's first boot, in the agent's own process** — `--dry-run`, which
reads no payer key and starts no watcher — and **every one of them has zero accounts under it**, which is the
precondition `buy_stamp` with `provision: true` refuses on, checked here rather than assumed:

```
  gz4-x  born 2026-09-12T04:52:52.136Z  d652ad7f98eaeed92af0b56ad69d479e9ed744677f34edd79707b8b01e1d28e3  accounts 0
  gz4-y  born 2026-09-12T04:52:54.352Z  a9ba313a66913d555c8b496c16b87078fc08f59456a7a9d9d52e0f0802c82b2d  accounts 0
  gz5-x  born 2026-09-12T04:52:56.569Z  54b28659d0eea31e6b25c93d568aa4d84b833cc1203440eda5d351294fad11b8  accounts 0
  gz5-y  born 2026-09-12T04:52:58.786Z  7dd1e255d2778e6ebeb608a927b431b9e67bb9cd883798413aa94d30476cc4ce  accounts 0
  gz6-x  born 2026-09-12T04:53:01.108Z  8aa432e03d08f113913c9f2a4d6a7f2b57db124b31e48192e767f82717416cba  accounts 0
  gz6-y  born 2026-09-12T04:53:03.323Z  0a37fd6e719ba5bbca6dc36e34c0afc9ecb7201fca953d324bb90b3ca9e565ab  accounts 0
```

Each home's `config.json` names its own operator and its own `displayName`: DemoAgentX4/Y4, X5/Y5, X6/Y6.

### 5. What this run did NOT do

No topic, no token, no agent, no purchase — and **no association**, which is the agent's own act at provisioning
and belongs to Gate Four. **The counter stayed down throughout.** No goose entry was written for any of the six.
`ENTITIES.md` and `demo-agents.hedera-testnet.json` are not regenerated: these are operator wallets, not agents,
and the generator reads agents' `record.json` files — of which there are none yet.

**Four of the six are born and will now be left alone.** `gz5-x`/`gz5-y` are tomorrow's recorded take and
`gz6-x`/`gz6-y` are the spare, so a take spoiled by something outside this code costs a rename rather than a
second GATE FUND. Neither pair gets a goose entry tonight and neither is provisioned.

### 6. The entities this run created, as residue

Six accounts. They are permanent, they hold the operators' float, and their keys live in their own homes. They are
**not** agents and appear in no declaration; nothing on consensus points at them but the transactions that made
them.

  **GATE FUND — RUN 2026-09-11. All six stand, every one with zero association slots.**

---

## GATE FOUR — the brand-new wallet through the whole lifecycle. Gate report, written 2026-09-11 before any signature

**Written and committed before the first transaction, on the rule the probe, Step 2, Step 3 and both Gate Zeros
followed.** The second Gate Zero's report and run of record above are **not amended** by any of this. Five
markers, one prediction each, and **a divergence at any one is written down before the next is attempted**.

**It runs under HEAD `970163a`**, specification **0.5.13** (wire strings `0.5`), register 87 · 53 expanded · 44
passing, `typecheck`, `p13:check` and **all twenty-four `check:*` green**. **That HEAD is load-bearing beyond
tonight**: RECORD (Sonic) — *tomorrow's recorded take runs on the HEAD Gate Four ran on*, so anything that must
exist for the take had to land before this gate, and nothing may land between them.

### 1. The question this gate asks, which four gates have not

**`ensurePayerHoldsStamps` (`app/sdk/mailbox.ts`) has a branch that has never executed against the network.** It
reads the operator from the mirror, returns early if it already holds `$POSTAGE`, and otherwise skips the
association when `max_automatic_token_associations` is `-1` or has a free slot — printing `provision.autoassociates`
and submitting nothing. **Both demo operators have read `-1` at every gate**, so the
`TokenAssociateTransaction` beneath that branch is dead code as far as consensus is concerned.

Gate Four's two operators read **`0`**. `0 === -1` is false and `0 > 0` is false, so **the branch fires.**

**THE NEW OBSERVABLE, and it is the thing this gate exists to see:** a `TokenAssociateTransaction` for
**`$POSTAGE 0.0.10426208`** on **each** new operator wallet, visible on the mirror, **timestamped after that
agent's purchase transfer and before that agent's first topic — and therefore long before any ring.** It is
inside `generateMailbox`, which the provisioned path reaches after the purchase creates the account and before
the doorbell is created.

**It fires on BOTH operators, including the recipient's** — who will never ring a doorbell and will therefore
hold an associated `$POSTAGE` balance of zero forever. That is one association spent for nothing on the recipient
side. **Recorded and not fixed** (RECORD, Sonic): it is on the golden path, it is what the gate exists to see,
and changing it tonight would mean Gate Four no longer tests what it was called for.

### 2. The before-state, read from the mirror 2026-09-11

```
  gz4-x operator (SENDER)      0.0.10492952     250.00000000 h   $POSTAGE      0   autoAssoc  0   deleted false
  gz4-y operator (RECIPIENT)   0.0.10492953     250.00000000 h   $POSTAGE      0   autoAssoc  0   deleted false
  treasury                     0.0.10426205      20.00000000 h   $POSTAGE   9936
  Postmaster payer             0.0.8641261     1841.21183562 h   $POSTAGE      0

  DemoAgentX4  agent key d652ad7f98eaeed92af0b56ad69d479e9ed744677f34edd79707b8b01e1d28e3   accounts under it: 0
  DemoAgentY4  agent key a9ba313a66913d555c8b496c16b87078fc08f59456a7a9d9d52e0f0802c82b2d   accounts under it: 0

  PriceList 0.0.10426551  sequence 4 at 1789055861.123389104
      provisioning {"method":"hbar","registrationFee":"0.05","unitPrice":"30"}
      hbar method  12 $POSTAGE for "1.00" USD, rate from the network's own exchangerate (D-170)
  exchange rate at 1789188xxx: 30000 hbar : 223685 cents  ->  1.00 USD = 13.41171737 h
```

**Zero accounts under either agent key** is the precondition `buy_stamp` with `provision: true` refuses on, and it
is checked here rather than assumed.

### 3. The five markers

Each is its own gate line. **The ORDER is recipient before sender**, because her watcher must be running before he
rings, and the labels say so rather than relying on X and Y to carry it.

---

#### **GATE RECIPIENT** — `gz4-y`, DemoAgentY4, operator `0.0.10492953`

One `buy_stamp` call with `provision: true`, which is the whole of §4.6's provisioned path (D-168).

**Predicted, in order:**

1. **A `TokenAssociateTransaction`** for `0.0.10426208` on `0.0.10492953`, **paid and signed by that operator on
   its own local client** — never by the carrying Postmaster, whose carry policy would refuse it. **This is the
   new observable.** Cost **≈0.63 ℏ** — *measured*, not estimated: this deployment's only two
   `TokenAssociate`s charged `0.62811176` and `0.62936798` ℏ at Step 4. Declared maximum 2 ℏ.
2. **One atomic three-leg `TransferTransaction`**, the Postmaster as payer: ℏ from `0.0.10492953` to the
   Postmaster for the price; **12 `$POSTAGE`** from the treasury to DemoAgentY4's **public-key alias**, which is
   the leg that **creates the account** (HIP-542); and **0.05 ℏ** from the Postmaster into that same alias for
   the agent to pay for its own registration.
3. **Five topics** — doorbell (HIP-991 fee of one `$POSTAGE` to the treasury, the owner's own key exempt), log,
   manifest topic, HCS-2 declaration registry, HCS-1 profile file — plus the profile's chunks, a registry entry
   and an account memo. All carried by the Postmaster.
4. A **StampReceipt** naming `txRef`, a `price`, `holder` = the created account, and a `provisioning` block.

**Price predicted ≈43.41 ℏ** — 30 ℏ flat plus a 12-stamp bundle at "1.00" USD. **The stamp leg floats with the
network's own rate at the moment of the purchase (D-170)**, so the exact figure is whatever the rate is then;
13.41171737 ℏ at the rate read above, against 13.45267471 measured on 09-12 and 13.29198051 on 09-10.

**The recipient's operator ends holding `$POSTAGE` 0 and ASSOCIATED** — a token row with a zero balance, which is
the association that bought nothing.

  **GATE RECIPIENT — [ NOT YET ]**

---

#### **GATE SENDER** — `gz4-x`, DemoAgentX4, operator `0.0.10492952`

The same call, the same shape, a second association and a second purchase. **Same prediction as GATE RECIPIENT**,
with a different `holder`.

  **GATE SENDER — [ NOT YET ]**

---

#### **GATE STAMPS — N/A**

Provisioning already includes twelve stamps (P-2, D-168), so there is no separate stamp purchase. This line exists
only so that a top-up, if one is ever wanted, has a gate of its own rather than riding someone else's.

  **GATE STAMPS — [ N/A unless a top-up is wanted ]**

---

#### **GATE SEND** — one certified letter, X4 → Y4, first contact and a return receipt in ONE call (§6.4)

**Predicted, in order:**

1. **§4.4's hop fires.** The sender's operator holds **zero `$POSTAGE`**, so `ringStamp` moves **one stamp from
   DemoAgentX4 to `0.0.10492952`** before the ring — the agent signs, the operator pays. This is the second time
   it has ever fired, the first being the second Gate Zero.
2. **The ring**: a `connection_request` on DemoAgentY4's doorbell, whose HIP-991 fee **consumes that stamp** into
   the treasury.
3. **The lane is born on the RECIPIENT's doorbell**, because she answers. Its submit key must be a **threshold of
   exactly the two agents' keys and no other** (§7.1, T-P17-2) and it must carry **no custom fee** (T-P11-3).
4. **The manifest** published to X4's manifest topic; **the settlement**, one transfer of **two stamps** — one
   weight, one receipt fee — from DemoAgentX4 to the treasury, under the memo `wishmail:<envelopeId>` **naming
   that envelope and no other** (§4.3).
5. **Chunk 0** on the lane, one chunk, **39 bytes** of payload.
6. A **ScheduleCreate** for the receipt, its inner body naming **the sender's own side as payer** — so signing
   costs the recipient nothing (T-P16-2) — and a `transaction` operation announcing it on the lane.
7. `send` returns **chunk 0's Postmark** and returns **before anyone signs** (P-14, D-30). A Postmark is not a
   delivery.

**The payload is `Certified agent mail, proven on Hedera.` — 39 bytes, 52 base64 characters, no padding.** It is
shorter than the second Gate Zero's on purpose: the model **truncated** that one in the tool call, and the letter
landed 69 bytes reading *"…on consensu."* What it dropped was a padded tail, and this literal has no padding.
**B5 checks the rendering against the plaintext printed beside it in B4.**

**An `AttemptedDeliverySlip` is a RESULT and not a failure** (P-12): one stamp is gone at her door, no postage was
affixed, and the request stands. It would mean her watcher was not running. **Do not send again without saying
so** — a second ring is a second stamp and a second lane, and a lane cannot be closed.

  **GATE SEND — [ NOT YET ]**

---

#### **GATE ACK** — Y4 opens it and signs for it

**Predicted:** `inbox` returns one delivery, `opened: true`, **39 bytes**, carrying the **pending schedule**; the
card renders the sentence, labelled as a rendering. `ack` signs the schedule; **the network executes it the
instant the last signature lands**; the receipt manifest is published to **DemoAgentY4's own manifest topic**.
**Not one stamp of the recipient's moves at any step (T-P16-2).**

  **GATE ACK — [ NOT YET ]**

---

### 4. The stamp arithmetic, predicted

```
                                  before        after      why
  DemoAgentX4  (sender)               0    ->      9       +12 bought, -1 the hop, -2 the settlement
  DemoAgentY4  (recipient)            0    ->     12       +12 bought, and CHARGED NOTHING (T-P16-2)
  0.0.10492952 (sender's operator)    0    ->      0       +1 from the hop, -1 to the doorbell fee
  0.0.10492953 (recipient's operator) 0    ->      0       associated, and never holds one
  treasury     0.0.10426205        9936    ->   9915       -24 sold, +1 doorbell fee, +2 settlement
```

That is the same arithmetic the second Gate Zero measured exactly (9957 → 9936, a net −21), applied to a
different pair.

### 5. GREEN, and it is unchanged

**Not `send` returning. Not any card. Not `ack` returning.** GREEN is two facts on a mirror node, read afterward:

1. the schedule's **`executed_timestamp` is not null**, and
2. the **receipt manifest is on DemoAgentY4's own manifest topic**, at a topic id and sequence number, hashing to
   what the schedule carried, **chained back to chunk 0's postmark**.

**And, only for this gate, a third:** a `TokenAssociateTransaction` for `0.0.10426208` on **each** of
`0.0.10492952` and `0.0.10492953`, timestamped **before** that agent's first ring.

### 6. The submit→learn window, and how a run resumes from inside it

Every consensus write has a window between the signature leaving the process and the outcome being learned, and
**no offline check can reach it** because there is no offline consensus node (Gate One: eight defects, every one
in that window).

- **A purchase that stops part way resumes by calling the same instruction again.** It is idempotent **against
  consensus, not against local state**: `buy_stamp` with `provision` refuses if the holder's account already
  exists, `generateMailbox` resolves the agent's own address first and does nothing if coordinates exist. It
  creates only what is missing and never buys twice.
- **If the counter's record of a purchase is gone: STOP, and do not reconstruct the receipt.** A receipt is never
  rebuilt from the ledger by the party that charged (Correspondent A).
- **The association is the one act with no prior live run.** If it fails, `generateMailbox` refuses the whole
  mailbox with `the operator could not associate with $POSTAGE`, before any topic is created. That is a clean
  stop and the purchase transfer has already landed: resume by calling the same instruction again.
- **A lane cannot be closed.** Anything ambiguous about whether a ring happened is a stop, not a retry.

### 7. Every way it stops

- `--live` did not arrive → the card says `DRY RUN — … would …`. **In LIVE a "would do" card means the flag did
  not arrive. Stop.**
- the counter is down → `buy_stamp` fails to reach `127.0.0.1:4600`. **In LIVE that means the counter died**, not
  that the window is DRY; the heuristic inverts.
- **B0's card names the wrong home** — `holder` reading `{"account": …}` instead of a public key, or `buyer`
  naming a demo operator instead of `0.0.10492952` / `0.0.10492953`. Stop; run nothing below it.
- `resolve` returns `RESOLVE_NOT_FOUND` after GATE RECIPIENT → her provisioning did not finish. Stop.
- `send` returns an `AttemptedDeliverySlip` → her watcher was not running. A result, not a failure. Stop and say
  so.
- **B5's rendering is short by even one character** → the model truncated the base64 at B4. The letter is already
  on consensus and cannot be withdrawn. **Stop, do not `ack`.** The take moves to the spare pair.
- `ack` returns `ACK_NOT_OPENED` → the schedule's body names a different identifier, postmark or epoch. That is
  the check working. Stop.
- **On any stop: report what is true at the stop and what is resumable, and wait.** Never repair past it, never
  infer.

### 8. What this gate does NOT prove, named in advance

- **No `hol` resolution.** `register_agent` is off the goose allowlist by design, so no HOL anchor registration
  is posted and T-P6-5 and T-P13-4 stay unexpanded.
- **No `verified` appraisal.** This release claims no profile (`app/src/release.ts`, `profiles: {}`), so a
  stranger reaches `unverified` with reason **T-P12-4**, which is **correct output and not a shortfall** (§1.5,
  §9.6, D-177).
- **No `x402-usdc` leg**, no rotation, no WebMCP send side — all scoped out of this window by us and named in
  LIMITATIONS as ours.

**If the association fires on both operators, the brand-new-wallet category is closed for the operator path**, and
the run of record will say so plainly.

### 9. The arrangement

Two goose entries, `demoagentx4` and `demoagenty4`, allowlist **`[buy_stamp, resolve, send, inbox, ack]`** —
`generate_mailbox` and `register_agent` excluded, which is §8's first bullet. **One home per window, the other
extension toggled off.** `gz5-*` and `gz6-*` have **no goose entry** and are not touched by this gate.

`docs/OPERATOR-SCRIPT.md` Part B drives it, one instruction per turn, **B0 first in each window**. **The counter
stays down until the fill-in**, and AUTHORIZED means restarting both entries with `--live` and the terminal
pre-flight saying so — because **goose discards the extension's stderr** and no banner will appear inside it.

### 10. The two entries, and the pre-flight — done 2026-09-11, before the fill-in

`config.yaml` now holds **exactly two** WISHMail entries and they are the gate’s own. The two rehearsal
entries were **removed**, not repointed, on the rule that settled last night: a new name cannot load a stale
target, because it either exists or it does not. Backup at `config.yaml.before-gate-four.bak`.

```
  demoagentx4   gz4-x   --dry-run   [buy_stamp, resolve, send, inbox, ack]   enabled
  demoagenty4   gz4-y   --dry-run   [buy_stamp, resolve, send, inbox, ack]   disabled (toggle per window)
```

**Checked in the file itself**: `- --live` appears **0** times; `gz-x`, `gz2-x`, `gz2-y`, `gz5-` and `gz6-`
appear **0** times each; `gz4-x` and `gz4-y` once each. **`gz5-*` and `gz6-*` have no entry and are not
touched by this gate.**

**Both command lines were booted in a terminal**, which is the only place a banner can be seen — goose
discards the extension’s stderr entirely, and `argv as received` returns zero hits across the whole of the
second Gate Zero in goose’s own server logs:

```
  wishmail correspondent — DRY RUN: nothing will be signed
  argv as received  ["C:/Users/Sonic/.wishmail/demo/gz4-y","--dry-run"]
wishmail correspondent — home …\gz4-y, keys loaded, account (not bought yet), payer 0.0.10492953
  DRY RUN — no payer key was read and no client has an operator; the doorbell watcher is NOT running.
  … exit 0, no run.lock

  argv as received  ["C:/Users/Sonic/.wishmail/demo/gz4-x","--dry-run"]
wishmail correspondent — home …\gz4-x, keys loaded, account (not bought yet), payer 0.0.10492952
  … exit 0, no run.lock
```

**`keys loaded`, not `keys born`** — the agent keystores were born under GATE FUND and this boot only opened
them. **`account (not bought yet)`** on both, which is the precondition restated by the server itself. Each
names its own brand-new operator.

**The counter is DOWN and stays down until the fill-in.** Port 4600 is closed.

---
**Sonic signs. I sign nothing.**

---

  **GATE FOUR — [ AUTHORIZED / NOT YET — Sonic fills this ]**

---

## Entities

Filled as each is created. Each row names what made it, what signed it, and the mirror-node read that confirmed it. The probe above is **not** an entity: it keeps nothing, and appears only in its own section.

The eleven rows, their readbacks and their predicates are §8 above; the acceptance test is §9 and the pins are §10. The record itself is `app/deployment/hedera-testnet.json`, which cites the tag `v0.5.2`. The HIP-991 probe’s entities are not deployment entities and appear only in their own section.
