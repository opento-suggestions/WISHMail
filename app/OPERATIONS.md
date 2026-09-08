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

## Entities

Filled as each is created. Each row names what made it, what signed it, and the mirror-node read that confirmed it. The probe above is **not** an entity: it keeps nothing, and appears only in its own section.

_None yet. Phase A′ (0.5.2, tag `v0.5.2` at `21cb3c2`) is the text these will be provisioned against. The HIP-991 probe above has run; its entities are not deployment entities and appear only in its own section._
