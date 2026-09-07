# OPERATIONS — how the testnet entities were made

What was created on `hedera:testnet`, in what order, by what means, and every place the means departed from the tool a reader might expect. The entities themselves — IDs, transaction references, consensus timestamps — are in `app/deployment/hedera-testnet.json`, which is also the provisioning script's idempotency record. This file is the method; that file is the result.

`spec/pins.json` carries only what §18.4 fixes: the standards pins, the stamp token and treasury per network, and the minor version's registered schema digests and wire strings. Everything else about a deployment lives in the ops record, per D-132's precedent and D-144.

## The record is the mirror node

Every entity in the ops record is written from a **mirror-node REST read**, not from an SDK receipt and not from any tool's return value. A receipt says what was submitted; the mirror node says what consensus holds, which is the only thing a Verifier can check afterwards.

This is not merely a preference. P-3 makes replay a function of public consensus data, and P-4 forbids a broker; together they fix a mirror node as a read interface rather than a broker. The same rule governs `conformance/` and is written down there.

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

## Entities

Filled as each is created. Each row names what made it, what signed it, and the mirror-node read that confirmed it.

_None yet. Phase B Step 1 (ADRs D-139 – D-144) precedes the first transaction._
