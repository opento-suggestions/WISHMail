# OPERATIONS — how the testnet entities were made

What was created on `hedera:testnet`, in what order, by what means, and every place the means departed from the tool a reader might expect. The entities themselves — IDs, transaction references, consensus timestamps — are in `app/deployment/hedera-testnet.json`, which is also the provisioning script's idempotency record. This file is the method; that file is the result.

`spec/pins.json` carries only what §18.4 fixes: the standards pins, the stamp token and treasury per network, and the minor version's registered schema digests and wire strings. Everything else about a deployment lives in the ops record, per D-132's precedent and D-144.

**The record cites a tag, not a hash.** `app/deployment/hedera-testnet.json` names the specification text every entity was provisioned against as an annotated tag — `v0.5.2` for the first provisioning — and never a commit hash. A conformance claim names a *version* (§1.7, §5.10), and a version is what a tag is; a hash is only where that version happened to sit in one clone's history. The tag object carries the version's own statement of what changed and the sign-off that landed it, so a reader who has the tag has the text and its warrant together.

## The record is the mirror node

Every entity in the ops record is written from a **mirror-node REST read**, not from an SDK receipt and not from any tool's return value. A receipt says what was submitted; the mirror node says what consensus holds, which is the only thing a Verifier can check afterwards.

This is not merely a preference. P-3 makes replay a function of public consensus data, and P-4 forbids a broker; together they fix a mirror node as a read interface rather than a broker. The same rule governs `conformance/` and is written down there.

## Libraries, and why each is a dependency rather than a few lines here

**`ajv` 8 with `ajv-formats`, imported as `ajv/dist/2020`.** The schemas in `spec/schemas/` declare JSON Schema draft 2020-12, and D-143 requires the first `PriceList` to be validated against `price-list.schema.json` before it is submitted and byte-compared after. A validator that implements some of 2020-12 would make "validated against the schema" mean something narrower than the sentence says.

**`canonicalize` 4 for RFC 8785.** §5.1 canonicalizes with RFC 8785, and the same canonicalization is the basis of the AAD in §7.2, whose SHA-256 is the envelope identifier and whose court is `spec/vectors/aad.json` (T-P1-4). One library serves both, and it is a dependency rather than a hand-rolled function for exactly that reason: a canonicalizer that is subtly wrong about number formatting or key ordering produces envelope identifiers that no other implementation reproduces, and the failure is silent. **[CC]**, recorded here per the plan; the alternative considered was `json-canonicalize`, and the choice between them is not load-bearing — implementing it ourselves would have been.

**`@types/node`, pinned to `^22` in `app`.** `app/tsconfig.json` declares `"types": ["node"]`, and until now the package reached the tree only through `protobufjs`'s unbounded transitive range, so type-checking depended on a hoist. It resolves to 22.x under `app/` against the Node 22 this is built on, rather than the 26.x the root happens to hoist.

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

## The HIP-991 probe — gate report, before any signature

**Status: not yet run. Nothing has been signed.** This section is written before the first transaction this build submits to consensus, so that the record shows what was intended before it was done rather than after. Ruled 2026-09-08 (D-149). It fills with observations when the probe runs; until then every line below is a statement of intent.

The probe exists to settle what HIP-991 at the pin does not state and the SDK does not document: whether a fee collector must be associated with the denominating token (ledger §H records this as MINE, "confirm when §14 lands", and §14 has landed); whether a fee-exempt list amended under the admin key takes effect; and which account `hip-991.md:101` actually debits when the payer and the signer differ.

It is **wholly disposable**: it creates its own treasury, its own token, its own topic and its own stranger, and the real `$POSTAGE`, the real treasury and the Postmaster-agent's topics are not created, touched or named by it. It **mirrors the real shape exactly**, because a probe that proves something about a different shape proves nothing about the template.

### 1. What it creates

| # | Entity or act | Shape | Warrant |
|---|---|---|---|
| 1 | probe treasury account | ED25519 key generated in-process, minimally funded by the operator | mirrors D-140's treasury role |
| 2 | probe token | `decimals: 0`, **`initialSupply: 0`**, `supplyType: INFINITE`, supply key the probe treasury's, and **no admin, freeze, wipe, pause, KYC or fee-schedule key** | D-141's posture with D-148's supply key, born at zero per D-149 |
| 3 | the mint | 10,000 units to the probe treasury, signed by the probe treasury's supply key, as **its own transaction** | D-149: a mint is an act with a transaction ID, not a birth parameter |
| 4 | probe topic | **no submit key**; admin key held by the probe; a HIP-991 `CustomFixedFee` of **one unit** of the probe token collected by the **probe treasury**; **no fee schedule key**; a fee-exempt list carrying one throwaway key | D-138's doorbell row exactly |
| 5 | stranger account | ED25519 throwaway, funded with HBAR to pay for itself, associated with the probe token, holding one unit transferred from the probe treasury | the unexempted caller, as its own payer |
| 6 | operator association | the operator is associated with the probe token and holds one unit, so that §4.4's own shape can be submitted | D-140: the operator is the momentary bearer of the first-contact stamp |
| 7 | two throwaway keys | one on the exempt list at creation, one to replace it | D-137's outcome, and `hip-991.md:110-113` |

Row 6 is the only thing the probe does to an account the deployment keeps. It is an association and a single unit, both reversible: the unit is spent by the submission that tests it, and the operator is dissociated afterwards. Whether the dissociation succeeds is itself recorded.

The **operator pays the network fees** for everything except the one submission where the stranger is deliberately its own payer (D-47, and §5 below). Every private key here is born in the running process and none is written to `spec/pins.json`, to `app/deployment/hedera-testnet.json`, to a log line, or to a commit; the throwaway keys are not written anywhere at all, since nothing outlives the probe that would need them.

### 2. What it asserts

- **The token was born as D-141 and D-149 say.** At creation: `decimals == 0`, `initial_supply == 0`, `total_supply == 0`, `supply_type == INFINITE`, `treasury_account_id` the probe treasury, `supply_key` the probe treasury's raw hex, and `admin_key`, `freeze_key`, `wipe_key`, `pause_key`, `kyc_key`, `fee_schedule_key` all six null.
- **The mint is an act.** After it: `total_supply == 10000` and the probe treasury's balance in that token is 10,000, with the mint's own transaction ID and consensus timestamp recorded. This is the first exercise of a supply key in this project.
- **The topic was built as D-138 says.** `submit_key` null, `admin_key` set, `fee_schedule_key` null, one fixed custom fee of amount 1 whose `denominating_token_id` is the probe token and whose `collector_account_id` is the probe treasury, and a fee-exempt list carrying the first throwaway key.
- **The charged path, under both payers** (§5). Each submission is assessed **one unit** to the probe treasury — the T-P7-4 read — and **which account was debited is recorded verbatim** rather than assumed.
- **The exempted path.** A submission carrying the exempt key's signature is assessed **zero** — D-137's outcome, which is the sentence §4.4 makes when it says a recipient "owes nothing to answer".
- **The exempt list is amendable under the admin key.** After a `TopicUpdateTransaction` signed by the admin key replaces the list with the second throwaway key, the first key is charged and the second is not. This is `hip-991.md:110-113` **observed rather than read**, and it is the warrant for D-138's doorbell carrying no fee schedule key.
- **The collector association question.** The probe treasury is the token's own treasury and so is associated by construction. Whether that is *required* is what §H holds open; the probe answers it by succeeding, and by recording that the collector was a treasury when it did.

### 3. What it reads back

Every assertion above is checked against a **mirror-node REST read**, never an SDK receipt (see "The record is the mirror node"). The raw JSON of each read is recorded in this file, not summarised, because several of the field names below are inferences this repository has never seen returned:

- `GET /api/v1/tokens/{probeToken}` — twice, before and after the mint, for the twelve fields of §2.
- `GET /api/v1/accounts/{probeTreasury}/tokens` — the minted balance.
- `GET /api/v1/topics/{probeTopic}` — memo, `submit_key`, `admin_key`, `fee_schedule_key`, `custom_fees`, and **the fee-exempt list under whatever name and shape the mirror node actually gives it**. No recon in this repository has ever read a topic that had one; `fee_exempt_key_list` is an inference from the protobuf field name and is recorded as such until this read.
- `GET /api/v1/transactions/{id}` for every submission — `result`, `assessed_custom_fees` with its amount, `token_id` and collector, **the paying account**, and `charged_tx_fee`. Also whether the response carries `entity_id`, which the provisioning journal would like to use and which ledger §H does not list.
- `GET /api/v1/topics/{probeTopic}` again after the update, to see the amended list.

Each observation is filed here with its entity ID, transaction ID, consensus timestamp and the exact request path that produced it, and the corresponding ledger §H rows move from MINE to FETCHED with the date.

### 4. What it leaves on the network

Stated plainly, because "disposable" is true of the record and only partly true of the ledger.

- **The probe topic is deleted**, under its admin key, in a `finally`, on every path including the stop path.
- **The probe token cannot be deleted.** It carries no admin key, by the posture under test, and `TokenDelete` requires one. Building it any other way would mean the probe did not mirror the template, which is the one thing it must do. It remains on `hedera:testnet` permanently, with 10,000 minted units.
- **The probe treasury account cannot be deleted** while that token exists, because a token's treasury cannot be removed. It remains, holding the float.
- **The stranger account** can be emptied, dissociated and deleted; whether it is, is tidiness rather than correctness, and the probe records what it did.
- **The operator is dissociated** from the probe token once its unit is spent, so the account the deployment keeps carries nothing of this afterwards.

So the probe leaves an inert token and its treasury on testnet forever. That is the price of mirroring the key posture honestly, it is paid on a test network, and it is written down here rather than discovered later by someone reading a mirror node and wondering what the second `$POSTAGE`-shaped token is. **Neither entity is written to `app/deployment/hedera-testnet.json` or to `spec/pins.json`** — those are the ledgers of what the deployment *keeps*, and the deployment keeps none of this. This file is the whole record of the probe.

### 5. The payer, observed rather than read

HIP-991 charges the fee to the account submitting the message (ledger §H, `hip-991.md:101`), and a Hedera transaction has one payer — so D-47's "the Postmaster pays" and "a funded stranger is charged one unit" cannot both hold of the same submission. §4.4 describes the sender transferring a stamp *to the Postmaster*, which then pays the doorbell fee; that is why D-140 makes the operator the momentary bearer of the first-contact stamp and why the operator must be associated with `$POSTAGE` at all.

Rather than choose a reading, the probe submits **twice** on the charged path and records which account was actually debited each time (D-149):

1. **The stranger as payer** of its own submission, holding the unit. Tests the fee mechanism at its simplest.
2. **The operator as payer**, carrying the stranger's unexempted signature — §4.4's own shape, and the one D-137's exemption is built on, since HIP-991 waives by signature even when the Postmaster pays.

One extra transaction settles §4.4's routing question and the fee mechanism in the same run. If the two disagree about who is debited, that disagreement is the finding, and it goes to ledger §H and to Sonic before the real doorbell is created.

## Entities

Filled as each is created. Each row names what made it, what signed it, and the mirror-node read that confirmed it. The probe above is **not** an entity: it keeps nothing, and appears only in its own section.

_None yet. Phase A′ (0.5.2, tag `v0.5.2` at `21cb3c2`) is the text these will be provisioned against; the HIP-991 probe above precedes them and is gated separately._
