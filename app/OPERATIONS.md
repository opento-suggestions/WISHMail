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

## Step 2 — the real entities: gate report, before any signature

**Status: not yet run. Nothing has been signed.** Written and committed before the first transaction of Step 2, on the same rule the probe followed. Produced by `npm run provision:plan` (`--dry-run`), which resolves every declared shape, validates the price list, prints the table below, and signs nothing.

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
| 8 | the first `PriceList` | sequence 1, canonical RFC 8785, **565 bytes**, sha256 `5264166e…` (with the real ids substituted) | D-143 as D-145 leaves it — **no `validFrom`** |
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

`npm run provision:plan` resolves all eleven steps. The first `PriceList` **validates** against `spec/schemas/price-list.schema.json` under ajv 2020-12, and the same message **carrying `validFrom` is rejected** by `additionalProperties` — the negative half, because a constraint that accepts everything proves nothing. Canonicalised under RFC 8785 it is 565 bytes, comfortably one HCS message under `CHUNK_WIRE_MAX` 1000.

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

**The first `PriceList` is now a committed file**, `app/price-list.hedera-testnet.json`, which the script submits. What the Postmaster charges is reviewable as a document rather than read out of a function. Exactly three fields are filled at run time, because they cannot be known at commit time: `stampToken.tokenId` and `stampToken.treasury` from the ops record, and `methods[].payTo` from `OPERATOR_ID`. They are `null` in the file, and the schema's account-id pattern means a fill that did not happen is caught by validation rather than published. `asset`, `facilitator` and `rate.source` are asserted against `networks.ts` before submission, so the file and the table cannot drift apart unnoticed. The refactor is byte-neutral: the canonical message is the same 565 bytes with the same sha256 `5264166e…` as the literal it replaced.

**A separate, minimal `.env.example` for the Correspondent client** is at `app/sdk/.env.example`, where the SDK and CLI will ship. It is four variables — the agent's own key, an optional account id, the network, and the Postmaster's MCP URL — and it shares nothing with the Postmaster's file. It states what a Correspondent does not need: no operator key, no treasury, no supply key, no state directory. And it says the thing worth saying to whoever reads it first: the Postmaster holds no key of yours, ever (P-13); your key is born in your process and stays there.

## Entities

Filled as each is created. Each row names what made it, what signed it, and the mirror-node read that confirmed it. The probe above is **not** an entity: it keeps nothing, and appears only in its own section.

_None yet — Step 2 is gated and unsigned. Phase A′ (0.5.2, tag `v0.5.2` at `21cb3c2`) is the text they will be provisioned against, and `app/deployment/hedera-testnet.json` will cite that tag. The HIP-991 probe has run; its entities are not deployment entities and appear only in their own section._
