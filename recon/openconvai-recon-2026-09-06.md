# OpenConvAI (HCS-10) — read-only reconnaissance for WISHMail

**Date:** 2026-09-06
**Target:** the HCS-10 "OpenConvAI" standard, and the `openconvai` registry key the HOL registry broker aggregates.
**Mode:** Read-only. No repository was modified. Every HTTP request was an idempotent `GET`. **No registration, no write, no Hedera transaction, no key material touched.** In particular `POST /register/{uaid}/openconvai` was **not** called — its schema below is read from the published OpenAPI, not from a live response (see OPEN O-1).

**Method note (digests).** Every `sha256` in `openconvai.pins.draft.json` for a repository file is computed over **raw git blob bytes** — `git cat-file blob <blobSha> | sha256sum` — never over the working-tree checkout. This machine runs `core.autocrlf=true`, so a checked-out file's digest differs from its object-store digest. Digests of on-chain content are computed over the exact bytes named in each case (raw brotli, or brotli-decompressed) and the recipe is stated at each site.

**Mainnet note.** Much of the evidence is from Hedera **mainnet** mirror reads against `mainnet-public.mirrornode.hedera.com`. These are public HTTP GETs. No Hedera `Client` was opened and no key was loaded, so `assertTestnet()` in `ontologic-hello-world/src/config.ts` was never in play. Mainnet is reported because the only HCS-10 registry topic that conforms to the spec's memo form lives there.

**Repos read (all pre-existing clones, untouched):**
- `hiero-consensus-specifications` @ `7046156c85eaaf29e149fa10232964d33a58d34e` — the commit the brief names.
- `hashgraph-online/standards-sdk` @ `98825d12fd9c41b6547899852cde9f166cb6e08d`
- `hashgraph-online/registry-broker-skills` @ `00f007be8dbfad81d53d06d71fd5c3743eac5f83`
- `hashgraph-online/hcs-improvement-proposals` @ `bd508bad70e3a5a660b149d7a183dd30b814d29f`

---

## CONTRADICTIONS

Ordered by how much they change the design, not by section.

### C-1 — There is no registry named "OpenConvAI". The registry the brief is looking for is named **"Hashgraph Online"**, and "OpenConvAI" is one of its four category tags.

The brief asks for "the OpenConvAI registry topic IDs". One mainnet topic matches the HCS-10 registry memo form exactly — `0.0.9297139`, memo `hcs-10:0:86400:3:0.0.9297136`. Its memo names a metadata topic, and HCS-10 says that topic carries the registry's own description. I read it, decompressed it, and the hash checks out.

FETCHED `GET https://mainnet-public.mirrornode.hedera.com/api/v1/topics/0.0.9297136` — memo:

```
ffd95dad80ceb8e9e3381f448ecdb70ce1fd6f1b9b8fb927a93c01e087646639:brotli:base64
```

FETCHED its 2 messages (both payer `0.0.9297135`), concatenated the `c` fields, base64-decoded, brotli-decompressed:

- `sha256(brotli-decompressed)` = `ffd95dad80ceb8e9e3381f448ecdb70ce1fd6f1b9b8fb927a93c01e087646639` — **MATCH** against the memo.

The verbatim content:

```json
{
  "version": "1.0",
  "name": "Hashgraph Online",
  "description": "Discover, find, and connect with native entities on Hedera through HCS-10, including, but not limited to, humans, AI, MCP Servers, and robots.",
  "operator": {
    "account": "0.0.9297067",
    "name": "Hashgraph Online",
    "contact": "https://hashgraphonline.com"
  },
  "categories": [
    "AI",
    "MCP",
    "Hedera",
    "OpenConvAI"
  ],
  "tags": [
    "AI"
  ],
  "links": {
    "website": "https://hashgraphonline.com",
    "documentation": "https://hashgraphonline.com/docs",
    "community": "https://t.me/hashinals"
  }
}
```

`name` is `"Hashgraph Online"`. `"OpenConvAI"` appears once, as a **category**. There is no on-chain object anywhere in this recon that names itself an OpenConvAI registry.

### C-2 — The broker's `openconvai` registry has 2 agents, both named "Bob", both test fixtures, and neither is anchored to any registry topic the broker will name.

FETCHED `GET https://hol.org/registry/api/v1/registries/openconvai/search?limit=20` (200): `"total": 2`, both hits `"name": "Bob"`, both `"description": "A test agent for debugging registration issues"`. One is `hedera:testnet:0.0.7124407`, the other `hedera:mainnet:0.0.10058320`.

Across both hits, `metadata.registryEntry` is **absent**. Compare the same field on other Hedera registries in the same broker, same day:

| broker registry key | agents | `registryTopicId` values seen in first 10 hits |
| --- | --- | --- |
| `hashgraph-online` | 359 | `0.0.10080724` (mainnet), `0.0.9297139` (mainnet) |
| `hol` | 33 | `0.0.10080724` (mainnet), `0.0.6913983` (testnet) |
| **`openconvai`** | **2** | **none — zero entries carry `registryEntry`** |

So the broker's `openconvai` key is a **label applied by an indexer**, not a pointer to a registry deployment. The label is also applied outside its own registry: two entries returned under `registry=hashgraph-online` ("Dossier Intel" `0.0.10385943@0.0.10385916`, "Dossier Intelligence" `0.0.8310226@0.0.7900260`) carry `"adapter": "openconvai-adapter"`. The adapter is a scanner that recognises HCS-10-shaped agents; the registry key it files them under is a separate decision.

### C-3 — The one `openconvai` agent that *is* anchored on-chain says `registry=hol` in its own register message.

This is the sharpest contradiction and it took paging the whole topic to find — the first 100 messages do not contain it.

Paging all **380** messages of testnet `0.0.6913983` (4 pages, `links.next` followed to exhaustion), the testnet "Bob" `0.0.7124407` appears **twice**. Both messages verbatim:

```
seq 153  consensus 1761343846.496907000  payer 0.0.2659396
{"p":"hcs-10","op":"register","uaid":"uaid:aid:2cSNjEjwwQTkHNRUp98JsqYFpHwZX168DsavYMTVjCfqdEDCZboUGtYZwYkJBcvZ6w;uid=bob;registry=hol;proto=hcs-10;nativeId=hedera:testnet:0.0.7124407","account_id":"0.0.7124407"}

seq 163  consensus 1761487707.005607000  payer 0.0.2659396
{"p":"hcs-10","op":"register","uaid":"uaid:did:5JqZcBxcJ7yk6eXjvk6rr21yCbnou7BVhCqdJMaAkhHV_0.0.7124411;uid=0.0.7124410@0.0.7124407;registry=hol;proto=hcs-10;nativeId=hedera:testnet:0.0.7124407","account_id":"0.0.7124407"}
```

Both say **`registry=hol`**. The broker serves this same agent under `registry=openconvai`, and rewrites the UAID accordingly — the broker's `uaid` for this agent is byte-for-byte the seq-163 one with `registry=openconvai` substituted for `registry=hol`.

The on-chain HCS-11 profile is a third answer: it carries **no `registry` parameter at all** (§4). So one agent has three registry labels — `hol` on the ledger, `openconvai` at the broker, and none in its own profile.

### C-4 — The SDK's default guarded-registry endpoint is dead. The documented registration path cannot execute as shipped.

`standards-sdk@98825d12` hardcodes `https://moonscape.tech` as the guarded registry in four places (`registrations.ts:134`, `registrations.ts:268`, `sdk.ts:136`, `browser.ts:122`). All of its endpoints are gone:

| GET | result (2026-09-06) |
| --- | --- |
| `https://moonscape.tech/` | **200** (`<title>Moonscape Labs \| AI Agent Infrastructure & HCS Integration</title>`) |
| `https://moonscape.tech/openconvai` | **404** |
| `https://moonscape.tech/api/request-register` | **404** |
| `https://moonscape.tech/api/request-confirm` | **404** |
| `https://moonscape.tech/api/registrations` | **404** |

The site is up; the OpenConvAI portal and all three registry API paths the SDK calls are not. A `GET` on a `POST`-only route returns 405 when the route exists, so 404 here is absence of the route, not method rejection.

### C-5 — The HCS-10 register message carries no signature, and `account_id` is a self-asserted string that in practice never matches the payer.

The spec's register operation, `hiero-consensus-specifications@7046156` `docs/standards/hcs-10/index.md:401-424`:

```json
{
  "p": "hcs-10",
  "op": "register",
  "account_id": "0.0.123456",
  "m": "Registering AI agent."
}
```

with the field table at `:410`:

> | `account_id` | The Hedera account ID of the agent being registered. | `string` | `"0.0.123456"` | ✅ |

There is no signature field, no proof-of-control field, and no requirement that the submitting payer equal `account_id`. Empirically the two never coincide. Full census, every message on all three topics, payer taken from the mirror node's `payer_account_id`:

| topic | network | messages | distinct payers | payer |
| --- | --- | --- | --- | --- |
| `0.0.9297139` | mainnet | 17 | **1** | `0.0.9297067` |
| `0.0.10080724` | mainnet | 23 | **1** | `0.0.10022745` |
| `0.0.6913983` | testnet | 380 | **1** | `0.0.2659396` |

On testnet `0.0.6913983`, the 380 messages claim **5 distinct `account_id` values** — `0.0.2659396` (21), `0.0.2656337` (1), `0.0.7124407` (2), `0.0.7138207` (1), `0.0.7217589` (2) — while **every one** of the 380 was paid by `0.0.2659396`. Four of those five claimed accounts were asserted by an account that is not them.

### C-6 — But the SDK *does* contain a client-submits path, and it is the one the code actually takes. §3's answer is favourable, with a caveat.

Both the server and browser clients receive a **base64 transaction from the registry server** and execute it under the **caller's own** credentials.

`standards-sdk@98825d12` `src/hcs-10/sdk.ts:1815-1821`:

```ts
      if (registrationResult.transaction) {
        const transaction = Transaction.fromBytes(
          Buffer.from(registrationResult.transaction, 'base64'),
        );

        this.logger.info(`Processing registration transaction`);
        await transaction.execute(this.client);
```

`this.client` is the SDK's own Hedera `Client`, carrying the operator key of whoever instantiated it. The browser build does the same through the user's wallet — `src/hcs-10/browser.ts:812-818`:

```ts
      if (registrationResult.transaction) {
        const transaction = Transaction.fromBytes(
          Buffer.from(registrationResult.transaction, 'base64'),
        );

        this.logger.info(`Processing registration transaction`);
        const txResult = await this.hwc.executeTransactionWithErrorHandling(
```

So the agent signs and pays. **The caveat:** the transaction *bytes* are authored by the registry server, not by the agent — the request that produces them carries only an account id and nothing else. `src/hcs-10/registrations.ts:208-221`:

```ts
      const response = await fetch(`${baseUrl}/api/request-register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: '*/*',
          'Accept-Language': 'en;q=0.5',
          Origin: baseUrl,
          Referer: `${baseUrl}/`,
          'X-Network': network,
        },
        body: JSON.stringify({
          accountId,
        }),
      });
```

An agent on this path signs a payload it did not construct and which this code never inspects before `execute`. That is a different risk from W-2's, but it is not zero.

### C-7 — "Guarded registry" is asserted repeatedly and is false on the testnet topic, which has no keys at all.

`index.md:70` (Abstract): "registering agents in a **guarded registry**". `sdk.ts:1888`: "Registers an agent with the guarded registry." The SDK type is `guardedRegistryTopicId` (`browser.ts:76`).

Actual key state:

| topic | memo | admin_key | submit_key | fee_schedule_key | custom fees |
| --- | --- | --- | --- | --- | --- |
| `0.0.9297139` (mainnet) | `hcs-10:0:86400:3:0.0.9297136` | SET `cb63a665…` | SET `cb63a665…` | none | `fixed_fees: []` |
| `0.0.10080724` (mainnet) | `hcs-2:0:86400` | SET `99746580…` | SET `99746580…` | none | `fixed_fees: []` |
| `0.0.6913983` (testnet) | `hcs-10:0:300:3` | **null** | **null** | none | `fixed_fees: []` |

`0.0.6913983` is a spec-form HCS-10 registry topic with **no admin key and no submit key**. Anyone on testnet may write a `register` message to it claiming any `account_id`. It is unguarded in the strict sense — and it is the topic the testnet `openconvai` agent is anchored to.

The spec's own key table never claims otherwise; `index.md:112` says the Registry is "Public or Fee-gated (HIP-991)" — no submit-key option is listed. So the prose ("guarded") and the normative table disagree.

### C-8 — The spec contradicts itself on what kind of topic the registry is.

`index.md:179` and `:319` both give the registry memo as type **3**:

```
hcs-10:0:{ttl}:3:[metadataTopicId]
```

But `index.md:893`, in the implementation workflow:

> The agent registers with the Registry by submitting a message to the **HCS-2 registry topic**:

and the diagram beneath it labels the participant `Registry Topic (HCS-2 with HIP-991)`. Both deployed mainnet topics take one side each of this contradiction — `0.0.9297139` is `hcs-10:…:3`, `0.0.10080724` is `hcs-2:0:86400` — and both carry `p:"hcs-10"` register messages. A verifier cannot tell from the standard which memo to expect.

### C-9 — The broker's own docs give a UAID prefix for OpenConvAI that no live entry uses.

`registry-broker-skills@00f007be` `references/PROTOCOLS.md:70-75`:

```
### OpenConvAI (HCS-10)

- **Prefix**: `uaid:hcs10:*`
- **Type**: Hedera agents
- **Protocol**: HCS-10
- **Chat**: Supported
```

Both live `openconvai` entries use `uaid:did:…`. Neither uses `uaid:hcs10:`. Across the register messages on all three topics I saw `uaid:aid:` and `uaid:did:` only — `uaid:hcs10:` appears zero times on-chain.

### C-10 — One "registry" topic, six mutually incompatible message shapes.

Census of all 380 messages on testnet `0.0.6913983`, keyed by sorted top-level field set:

| shape | count |
| --- | --- |
| `[op, p, t_id, uaid]` | 350 |
| `[account_id, op, p, uaid]` | 20 |
| `[account_id, inbound_topic_id, memo, metadata, op, p, profile]` | 7 |
| `[memo, metadata, op, p, t_id]` | 1 |
| `[op, p, profile_reference, t_id]` | 1 |
| `[op, p, t_id]` | 1 |

The spec marks `account_id` **required**. Only 27 of 380 messages (7.1%) carry it. The dominant shape (350/380) substitutes `t_id` + `uaid`, neither of which appears in the HCS-10 register operation at all.

---

## §1 — WHAT "OPENCONVAI" NAMES

**All three, and none of them cleanly.** It is (a) the formal name of the HCS-10 standard, (b) a category tag inside one registry's metadata, (c) a registry key and separately a protocol key in the HOL broker's taxonomy. It is *not* the name of any deployed registry (C-1).

**(a) The standard.** `hiero-consensus-specifications@7046156` `docs/standards/hcs-10/index.md:6`:

> `# HCS-10 OpenConvAI Standard: AI Agent Communication on HCS`

`:8` — `### **Status:** Draft`. The abstract, `:70`:

> HCS-10 OpenConvAI is a standard for AI agents to autonomously discover and communicate utilizing the Hedera Consensus Service (HCS). This includes creating accounts, registering agents in a guarded registry, and securely managing AI-to-AI and human-to-AI communication channels. OpenConvAI provides scalable, secure, and decentralized communication & monetization solutions while leveraging existing Hedera standards. The standard also enables transaction workflows where AI agents can prepare specific transactions that require approval before execution.

Authors, `:63-64`: "Patches", "Kantorcodes". The document uses "HCS-10" and "OpenConvAI" interchangeably throughout and never defines OpenConvAI as anything separable from the standard.

**(b) A category tag.** In the registry metadata quoted in full at C-1, `"OpenConvAI"` is the fourth entry of `categories`, alongside `"AI"`, `"MCP"`, `"Hedera"`. The registry's `name` is `"Hashgraph Online"`.

**(c) Two broker keys.** FETCHED `GET https://hol.org/registry/api/v1/registries` (200):

```json
{"registries":["erc-8004","agentverse","virtuals-protocol","coinbase-x402-bazaar","pulsemcp","moltbook","godaddy-ans","nanda","openrouter","erc-8004-solana","hashgraph-online","a2a-registry","hol","near-ai","a2a-protocol","openconvai"]}
```

FETCHED `GET https://hol.org/registry/api/v1/protocols` (200):

```json
{"protocols":["ans","hcs-10","mcp","a2a","xmtp","uagent","acp-virtuals","acp","openconvai","openai","openrouter","near-ai","virtuals-protocol","oasf","x402","ws","rest","grpc","mqtt","hybrid","p2p"]}
```

`openconvai` and `hcs-10` are listed as **two distinct protocols** in the same array, though the standard treats them as one name for one thing. Nothing published says how they differ.

**A product existed and is gone.** `moonscape.tech/openconvai` — the "OpenConvAI Portal" still indexed by search engines — returns **404** (C-4). So the product sense of the word is historical.

---

## §2 — THE REGISTRY TOPIC(S)

Three topics are in play. Only one matches the HCS-10 registry memo form `hcs-10:0:{ttl}:3:[metadataTopicId]` with the optional metadata topic present.

All rows FETCHED 2026-09-06 from `https://mainnet-public.mirrornode.hedera.com/api/v1` and `https://testnet.mirrornode.hedera.com/api/v1`.

| | `0.0.9297139` | `0.0.10080724` | `0.0.6913983` |
| --- | --- | --- | --- |
| network | mainnet | mainnet | testnet |
| memo | `hcs-10:0:86400:3:0.0.9297136` | `hcs-2:0:86400` | `hcs-10:0:300:3` |
| HCS-10 registry memo form? | **yes**, with metadataTopicId | **no** (declares HCS-2) | yes, no metadataTopicId |
| created | `1750712877.754722185` | `1762229166.454157000` | `1758937408.123126556` |
| admin_key | SET `cb63a66581f7d36909cb…` | SET `9974658017d7fb9a2540448f…` | **null** |
| submit_key | SET `cb63a66581f7d36909cb…` | SET `9974658017d7fb9a2540448f…` | **null** |
| fee_schedule_key | none | none | none |
| custom fees | `{"fixed_fees":[]}` | `{"fixed_fees":[]}` | `{"fixed_fees":[]}` |
| messages | 17 | 23 | **380** |
| distinct payers | 1 — `0.0.9297067` | 1 — `0.0.10022745` | 1 — `0.0.2659396` |
| first consensus | `1750728766.639511000` | `1762229570.053939000` | `1758937744.146083470` |
| last consensus | `1774328871.756504592` | `1762742101.700152706` | `1763503558.796733702` |
| ops | `hcs-10/register` ×17 | `hcs-10/register` ×23 | `hcs-10/register` ×380 |

**`0.0.9297139` is the canonical one.** Its memo carries `metadataTopicId = 0.0.9297136`, whose content (C-1, hash verified) names the operator `0.0.9297067` — which is exactly the sole payer of all 17 messages. Operator claim and on-chain behaviour agree here, and this is the only place in this recon where they do.

One real `register` message, verbatim, from `0.0.9297139` seq 1 (truncated at 280 chars as read):

```json
{"p":"hcs-10","op":"register","account_id":"0.0.9297452","metadata":{"description":"A simple agent that generates transactions on Hedera through Natural Language","type":1,"version":"1.0","creator":"0.0.9297452","socials":[{"handle":"@MoonscapeLabs","platform":"x"}]},"m":"Registe…
```

This is the spec shape (`p`, `op`, `account_id`, `m`) plus a `metadata` extension. The `@MoonscapeLabs` handle ties this topic to the operator whose portal is now 404 (C-4).

**Comparison with the `hol` anchors from the earlier recon — the brief's question.**

- Testnet: **same topic, interleaved.** `0.0.6913983` is the earlier recon's `hol` testnet anchor *and* it is where the testnet `openconvai` agent is registered — under `registry=hol` (C-3). Across all 380 messages, the `registry=` parameter inside the UAIDs resolves to `hol` or is absent; **`registry=openconvai` appears zero times on this topic.**
- Mainnet: **different topic, and the `openconvai` agent is on neither.** `0.0.10080724` (the earlier recon's mainnet `hol` anchor) carries 23 messages, none mentioning the mainnet `openconvai` agent `0.0.10058320`. `0.0.9297139` carries 17, likewise none. The mainnet "Bob" is registered nowhere I can find (OPEN O-3).
- The earlier recon's C-5 finding generalises: `0.0.10080724` carries `registry=hol` and `registry=hashgraph-online` interleaved; `0.0.9297139` is reported by the broker as backing `hashgraph-online`. Registry keys are not topic-partitioned in either direction — one topic serves several keys, and one key (`hashgraph-online`) draws on two topics.

---

## §3 — WHO SIGNS

**Every observed register message was paid by an operator, never by the agent. But a client-submits path exists in the SDK and is the path that code takes.** These are both true and they are not in conflict: the path exists in code and is unexercised on-chain.

**The observed record.** 420 register messages across three topics, three payers, one per topic, never the agent — full table at C-5. On testnet `0.0.6913983` the mismatch is explicit: 380 messages, all paid by `0.0.2659396`, claiming 5 distinct `account_id` values. The register operation has no signature field for the claimed account to sign with (C-5), so nothing on-chain distinguishes a truthful assertion from a false one.

**The `POST /register/{uaid}/openconvai` question.** The endpoint is documented — and this is a point where the broker's OpenAPI is better than the earlier recon's experience with `/resolve` led me to expect: the schema is real and typed, not an untyped bag. FETCHED `GET https://hol.org/registry/api/v1/openapi.json` (`info.version 0.1.0`, 261,092 bytes, `sha256 6a38959c…8eab` per the earlier recon's pin):

```json
"/api/v1/register/{uaid}/openconvai": {
  "post": {
    "tags": ["Registration"],
    "summary": "Prepare OpenConvAI registration data",
    "description": "Returns helper instructions and profile data required to onboard a registered agent into OpenConvAI.",
```

```json
"OpenConvaiBridgeRequest": {
  "type": "object",
  "required": ["operatorId"],
  "properties": {
    "operatorId": { "type": "string" },
    "submitToHCS": { "type": "boolean", "default": false }
  },
  "additionalProperties": false
}
```

```json
"OpenConvaiBridgeResponse": {
  "type": "object",
  "required": ["success", "message", "openConvAIData"],
  "properties": {
    "success": { "type": "boolean" },
    "message": { "type": "string" },
    "openConvAIData": {
      "type": "object",
      "required": ["operatorId", "profile", "registrationSource"],
      "properties": {
        "operatorId": { "type": "string" },
        "profile": { "type": "object", "additionalProperties": true },
        "submitToHCS": { "type": "boolean" },
        "registrationSource": { "type": "string" },
        "originalVirtualTopic": { "type": "string" },
        "instructions": { "type": "object", "additionalProperties": true }
      }
    }
  }
}
```

Reading this against the earlier recon's O-4, which guessed `submitToHCS` might be a client-submits instruction: **it is not an instruction, it is a request flag.** `submitToHCS` is a property of `OpenConvaiBridgeRequest` — the caller sets it — and it is echoed back in the response. Its default is `false`. The endpoint's own summary is "**Prepare** … registration data" and its description says it "Returns helper **instructions** and profile data". `instructions` is `{"type":"object","additionalProperties":true}` — untyped, so its shape cannot be read from the schema. Whether `submitToHCS: true` makes the *broker* submit under its key or returns bytes for the *agent* to submit is not determinable from the schema, and settling it requires a live POST, which is a write and out of scope (OPEN O-1).

The endpoint is also **not** a paid registration route. FETCHED `GET https://hol.org/registry/api/v1/register/additional-registries` (200) — the list of registries the broker will register into for credits — contains exactly two ids: `erc-8004`, `erc-8004-solana`. No `openconvai`, no `hol`, no `hashgraph-online`.

**The SDK's own submit path — the decisive code.** This does not go through the broker at all; it goes to the guarded registry directly, and the agent executes.

`standards-sdk@98825d12` `src/hcs-10/registrations.ts:208-221` — the request carries only an account id:

```ts
      const response = await fetch(`${baseUrl}/api/request-register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: '*/*',
          'Accept-Language': 'en;q=0.5',
          Origin: baseUrl,
          Referer: `${baseUrl}/`,
          'X-Network': network,
        },
        body: JSON.stringify({
          accountId,
        }),
      });
```

The response type, `src/hcs-10/types.ts:304-310`:

```ts
export interface RegistrationsApiResponse {
  registrations: Registration[];
  transaction_id?: string;
  transaction?: string;
  error?: string;
  details?: ValidationError[];
}
```

And the execution, `src/hcs-10/sdk.ts:1815-1821` — quoted in full at C-6 — is `await transaction.execute(this.client)`, the agent's own client. The browser variant (`browser.ts:812-818`) routes the same bytes through `this.hwc`, the user's connected wallet.

A third function exists for the registry operator's side of the same act, and its doc comment states the intended division plainly — `src/hcs-10/sdk.ts:1886-1893`:

```ts
  /**
   * Registers an agent with the guarded registry. Should be called by a registry.
   * @param registryTopicId - The topic ID of the guarded registry.
```

"Should be called by a registry" — this is the ORG-side entry point, and it is the one whose signature the 420 observed messages bear.

**Conclusion for §9.5.** An OpenConvAI registration *can* in principle resolve without `blurred`, and the profile leg already does — but not by the route anyone has actually used:

| leg | status |
| --- | --- |
| HCS-11 profile content | **not blurred.** Content-addressed by `sha256` in the HCS-1 topic memo; I recomputed both live agents' digests and both matched (§4). A past profile is re-obtainable and any claim about it is falsifiable. |
| registration → agent binding | **blurred.** The register message has no signature (C-5); in 420 of 420 observed messages the payer is an operator, not the claimed agent; and the one `openconvai`-labelled agent that is anchored is anchored under a different registry name than the broker reports (C-3). |
| broker's `registry=openconvai` label | **blurred, and worse — contradicted.** Not derivable from any on-chain byte; the ledger says `registry=hol` for the same agent. |

The unblurred path exists: `transaction.execute(this.client)` makes payer == `account_id`, which would satisfy W-2 and make the binding checkable by the same Closure test `ontologic-hello-world` already runs (`src/verify.ts`: mint+stamp payer == authorId). Two things block relying on it — it has **never** been exercised on any of these three topics (0 of 420), and the server that mints the transaction bytes is **404** (C-4). A WISHMail agent that wanted this property today would have to submit its own `register` message directly to `0.0.6913983`, which is keyless and accepts anything (C-7) — at which point the registry adds no attestation, only a timestamp.

---

## §4 — THE CHAIN

**Not the `hol` chain.** The earlier recon's `hol` path was `t_id` → HCS-2 topic → HCS-1 file. The `openconvai`/HCS-10 agents use a shorter and better one that starts from the **account memo** and needs no registry message at all:

```
account 0.0.X  ──memo──▶  "hcs-11:hcs://1/0.0.Y"  ──▶  HCS-1 topic 0.0.Y
                                                        memo = <sha256>:brotli:base64
                                                        messages[].c = data:application/json;base64,<brotli>
```

I verified **both** live agents end to end from the mirror node with no broker in the loop. Both hashes recompute.

**Agent 1 — testnet `0.0.7124407`.**

- `GET /api/v1/accounts/0.0.7124407` → `"memo": "hcs-11:hcs://1/0.0.7124416"`
- `GET /api/v1/topics/0.0.7124416` → `"memo": "1c164c42d6bfdba05791e31ab1277dff2f919ef48b624d793ea8d54cdd7d0c04:brotli:base64"`
- 2 messages, both payer `0.0.7124415`, both `o:0` and **byte-identical `c` fields** (a duplicate inscription — the second adds nothing)
- base64-decode `c`, brotli-decompress → 595 bytes
- `sha256` = `1c164c42d6bfdba05791e31ab1277dff2f919ef48b624d793ea8d54cdd7d0c04` — **MATCH**

The decompressed profile, verbatim:

```json
{"version":"1.0","type":1,"display_name":"Bob","alias":"bob","bio":"A test agent for debugging registration issues","socials":[{"platform":"github","handle":"@bobxukrd2"}],"properties":{"name":"Bob","description":"A test agent for debugging registration issues","version":"2.0.0","permissions":["read_network"]},"inboundTopicId":"0.0.7124410","outboundTopicId":"0.0.7124409","aiAgent":{"type":1,"capabilities":[0,4],"model":"test-model-2024"},"uaid":"uaid:did:5JqZcBxcJ7yk6eXjvk6rr21yCbnou7BVhCqdJMaAkhHV_0.0.7124411;uid=0.0.7124410@0.0.7124407;proto=hcs-10;nativeId=hedera:testnet:0.0.7124407"}
```

**Agent 2 — mainnet `0.0.10058320`.**

- `GET /api/v1/accounts/0.0.10058320` → `"memo": "hcs-11:hcs://1/0.0.10058327"`
- `GET /api/v1/topics/0.0.10058327` → `"memo": "112686d724f2a0dc083dded7665da02dd3c2ce207151435ed6302ebb773b9991:brotli:base64"`
- 2 messages, both payer `0.0.10058325`
- `sha256(brotli-decompressed)` = `112686d724f2a0dc083dded7665da02dd3c2ce207151435ed6302ebb773b9991` — **MATCH**

```json
{"version":"1.0","type":1,"display_name":"Bob","alias":"bob","bio":"A test agent for debugging registration issues","socials":[{"platform":"github","handle":"@bobruv6n8"}],"properties":{"name":"Bob","description":"A test agent for debugging registration issues","version":"2.0.0","permissions":["read_network"]},"inboundTopicId":"0.0.10058322","outboundTopicId":"0.0.10058321","aiAgent":{"type":1,"capabilities":[0,4],"model":"test-model-2024"},"uaid":"uaid:did:7ZwrfmExkPk5rZ9jnPixvPjkyxpMK8kjAxFKKbUNw8Lo_0.0.10058323;uid=0.0.10058322@0.0.10058320;proto=hcs-10;nativeId=hedera:mainnet:0.0.10058320"}
```

Note both on-chain `uaid` values: `proto=hcs-10;nativeId=…` with **no `registry=` parameter**. The broker's version of the same string inserts `registry=openconvai` between `uid=` and `proto=` (C-3).

**Which hashes recompute, and which do not:**

| link | recomputes? |
| --- | --- |
| HCS-1 topic memo `sha256` vs brotli-decompressed profile | **yes**, both agents |
| account memo → HCS-1 topic id | n/a (a pointer, not a hash) — but it is in the account's own memo, so it is under the agent's key |
| register message → profile | **no such link exists.** The register messages (C-3) carry `uaid` and `account_id`; neither is a digest of the profile. Nothing binds the registry entry to the profile bytes. |
| broker's `registry=openconvai` | **no.** Not present in any hashed object (C-3). |

**The topic set around each agent** (testnet agent shown; mainnet is identical in shape):

| topic | memo | keys |
| --- | --- | --- |
| `0.0.7124409` outbound | `hcs-10:0:60:1` | admin + submit both `6a7d1acc…` (the agent's own key) |
| `0.0.7124410` inbound | `hcs-10:0:60:0:0.0.7124407` | admin `6a7d1acc…`, **submit null** (public inbound) |
| `0.0.7124411` DID | `""` (empty) | admin + submit `6a7d1acc…` |
| `0.0.7124416` HCS-1 profile | `1c164c42…:brotli:base64` | submit `36db8758…` — **a different key** |

Two things worth carrying forward. First, `0.0.7124411` is **not** the HCS-11 profile — it is a `did:hedera` document topic; its seq-1 message is `{"message":{"timestamp":"2025-10-24T22:06:18.753Z","operation":"create","did":"did:hedera:testnet:5JqZcBxcJ7yk6eXjvk6rr21yCbnou7BVhCqdJMaAkhHV_0.0.7124411","event":"<base64 DIDOwner>"}}`. The UAID embeds this DID topic id, not the profile topic id, so a reader who follows the UAID lands on the DID document and must go to the **account memo** to reach the profile. Second, the profile topic's submit key (`36db8758…`) differs from the agent's key (`6a7d1acc…`) and its messages were paid by a third account (`0.0.7124415` testnet, `0.0.10058325` mainnet) — the profile was inscribed by a service, not by the agent. The content still hashes correctly, so this weakens authorship, not integrity.

---

## §5 — FEES

**No HIP-991 fee anywhere.** Not on any of the three registry topics, and not on either live agent's inbound topic.

| topic | role | `fee_schedule_key` | `custom_fees` |
| --- | --- | --- | --- |
| `0.0.9297139` | mainnet registry | none | `{"created_timestamp":"1750712877.754722185","fixed_fees":[]}` |
| `0.0.10080724` | mainnet broker anchor | none | `{"created_timestamp":"1762229166.454157000","fixed_fees":[]}` |
| `0.0.6913983` | testnet registry | none | `{"created_timestamp":"1758937408.123126556","fixed_fees":[]}` |
| `0.0.10058322` | mainnet agent inbound | none | `{"created_timestamp":"1761489701.924921360","fixed_fees":[]}` |
| `0.0.7124410` | testnet agent inbound | none | `{"created_timestamp":"1761343576.796853076","fixed_fees":[]}` |

A topic with no `fee_schedule_key` and an empty `fixed_fees` array collects nothing under HIP-991. So:

- **What registration costs:** only the ordinary Hedera `ConsensusSubmitMessage` network fee.
- **In what:** HBAR, as network fee, not as a topic fee.
- **Paid by whom:** the submitting payer — which on all 420 observed messages is the operator (`0.0.9297067` / `0.0.10022745` / `0.0.2659396`), not the agent (C-5). On the two mainnet topics the submit key makes this structural: no one else *can* pay. On testnet `0.0.6913983` there is no submit key, so anyone may pay their own way in; nobody has.

The spec anticipates fees the deployments do not charge — `index.md:112` lists the registry as "Public or Fee-gated (HIP-991)" and `:893`'s diagram labels the participant `Registry Topic (HCS-2 with HIP-991)`. All three deployed topics took the "Public" branch.

The SDK does contain live fee-detection logic for inbound topics (`sdk.ts:1925-1948`, `getInboundTopicType` returning `FEE_BASED` when `fee_schedule_key` and `custom_fees.fixed_fees` are both present), so HIP-991 support is implemented — just unused by these deployments.

One fee signal is broker-side and not a topic fee: the testnet agent's broker record carries `"availabilityStatus":"skipped"`, `"availabilityReason":"requires-payment"`, `"availabilitySource":"payment"`. That describes the broker declining to health-check a paid endpoint, and has no on-chain counterpart — its inbound topic is free and keyless.

---

## §6 — PINS

Full machine-readable set in `openconvai.pins.draft.json`. Summary of what this report relied on.

**Repository files** — `sha256` over raw git blob bytes (`git cat-file blob <blobSha> | sha256sum`):

| repo @ HEAD | path | blob sha | sha256 | bytes |
| --- | --- | --- | --- | --- |
| `hiero-consensus-specifications` @ `7046156` | `docs/standards/hcs-10/index.md` | `0cb5d2eb6b98e12e4b44fa8c4fea6e10937b615a` | `688372d38323656cdff5de2d210f07e78db811738ccd327666a856f2fcacd198` | 63600 |
| `standards-sdk` @ `98825d12` | `src/hcs-10/registrations.ts` | `070f1b3fe15e2ba4a4f07b24edff042ef7c2d57a` | `65326d9acbd5fd91fadc48521e6b4b56ae47995182e3426c2843895363bb6f29` | 9371 |
| `standards-sdk` @ `98825d12` | `src/hcs-10/sdk.ts` | `26a8148fa0d2b589c0f0e1fc9be15ec8f07b225b` | `5c2f6ebb2003b0415dbc9eb6b0973fcafe79ba2906af7f830df794f16cfdb4ae` | 95764 |
| `standards-sdk` @ `98825d12` | `src/hcs-10/browser.ts` | `9fb956a86c4301bcde49283d47462e58c85b78cf` | `ea8329af6c93587e18c15bb20046eb77af3cb8fab318857b5035ea098555f210` | 45384 |
| `standards-sdk` @ `98825d12` | `src/hcs-10/types.ts` | `3f86a80703b47cc0ac972e5783811528e41645fb` | `a3527fe8f7c69a4c1a4edfc9f635ab6fe19a394b8b38571c10c79d48e036c8f9` | 7473 |
| `standards-sdk` @ `98825d12` | `src/hcs-10/tx.ts` | `27388dcee968d1d6e6dd76c9e226b275207bc466` | `067ae4c3e0f6485a36e1f7a75bffbe01d7303200537a221738f5d752f8b2a731` | 7632 |
| `standards-sdk` @ `98825d12` | `src/services/registry-broker/schemas.ts` | `843a2a073587982acd2f50111efac6ba0906afd0` | `3bda4198c9c1f80bc70b6fad053613da1df656cdfd88f7c2cdc0dabff268e2b1` | 82409 |
| `registry-broker-skills` @ `00f007be` | `references/PROTOCOLS.md` | `849b28c163a1d69789e8c9540aae13997891f7be` | `7dd1e2454cf1fcc3870641108fa70e15b3dd645623359d99af43e47c1b31c84a` | 2777 |
| `registry-broker-skills` @ `00f007be` | `references/API.md` | `d031ca40789c7c09bc8f2899efefed71673b0cc4` | `2a030f3456df912918f58e849162089c1a17ce1db60386de00bc3905fc6b1560` | 6124 |

Note on the spec pin: `hiero-consensus-specifications` HEAD `7046156c85eaaf29e149fa10232964d33a58d34e` is dated 2026-08-31, but `docs/standards/hcs-10/index.md` was last touched by `675f6d06450c72c63f52191eb090e7b2bdbb405c` (2025-12-16, "Feat/specifications onto main (#2)") — the HCS-10 text has not changed in nine months.

**Topics read** — all 2026-09-06, mirror endpoints `https://mainnet-public.mirrornode.hedera.com/api/v1` and `https://testnet.mirrornode.hedera.com/api/v1`:

| topic | net | memo | msgs read | first / last consensus |
| --- | --- | --- | --- | --- |
| `0.0.9297139` | mainnet | `hcs-10:0:86400:3:0.0.9297136` | 17 (all) | `1750728766.639511000` / `1774328871.756504592` |
| `0.0.9297136` | mainnet | `ffd95dad…646639:brotli:base64` | 2 (all) | — |
| `0.0.10080724` | mainnet | `hcs-2:0:86400` | 23 (all) | `1762229570.053939000` / `1762742101.700152706` |
| `0.0.6913983` | testnet | `hcs-10:0:300:3` | **380 (all, 4 pages)** | `1758937744.146083470` / `1763503558.796733702` |
| `0.0.7124416` | testnet | `1c164c42…d0c04:brotli:base64` | 2 (all) | — |
| `0.0.10058327` | mainnet | `112686d7…b9991:brotli:base64` | 2 (all) | — |
| `0.0.7124409` | testnet | `hcs-10:0:60:1` | info only | — |
| `0.0.7124410` | testnet | `hcs-10:0:60:0:0.0.7124407` | info only | — |
| `0.0.7124411` | testnet | `""` | 1 (all) | — |
| `0.0.10058322` | mainnet | `hcs-10:0:60:0:0.0.10058320` | info only | — |

**Accounts read:** `0.0.7124407` (testnet, memo `hcs-11:hcs://1/0.0.7124416`, created `1761343566.086100201`), `0.0.10058320` (mainnet, memo `hcs-11:hcs://1/0.0.10058327`, created `1761489689.701209000`).

**On-chain content digests** (recipe stated per row):

| object | recipe | digest | verified against |
| --- | --- | --- | --- |
| registry metadata `0.0.9297136` | `sha256(brotli_decompress(base64_decode(c)))` | `ffd95dad80ceb8e9e3381f448ecdb70ce1fd6f1b9b8fb927a93c01e087646639` | topic memo — **MATCH** |
| " (raw, pre-decompress) | `sha256(base64_decode(c))` | `26219886f77c5d55a2ca669ec3366399c90403817ed09c45aacc456e1174cb71` | — (recorded for completeness) |
| testnet profile `0.0.7124416` | `sha256(brotli_decompress(base64_decode(c)))` | `1c164c42d6bfdba05791e31ab1277dff2f919ef48b624d793ea8d54cdd7d0c04` | topic memo — **MATCH** |
| mainnet profile `0.0.10058327` | `sha256(brotli_decompress(base64_decode(c)))` | `112686d724f2a0dc083dded7665da02dd3c2ce207151435ed6302ebb773b9991` | topic memo — **MATCH** |

**HTTP endpoints read** (all GET, all 2026-09-06):

| URL | status |
| --- | --- |
| `https://hol.org/registry/api/v1/registries` | 200 |
| `https://hol.org/registry/api/v1/protocols` | 200 |
| `https://hol.org/registry/api/v1/stats` | 200 |
| `https://hol.org/registry/api/v1/registries/openconvai/search?limit=20` | 200, `total: 2` |
| `https://hol.org/registry/api/v1/registries/hashgraph-online/search?limit=100` | 200, `total: 359` |
| `https://hol.org/registry/api/v1/registries/hol/search?limit=100` | 200, `total: 33` |
| `https://hol.org/registry/api/v1/register/additional-registries` | 200, ids `[erc-8004, erc-8004-solana]` |
| `https://hol.org/registry/api/v1/bridge/federation/registries` | 200, `{"registries":[]}` |
| `https://hol.org/registry/api/v1/agents?registry=openconvai` | **404** `{"error":"Not found","path":"/api/v1/agents"}` |
| `https://moonscape.tech/` | 200 |
| `https://moonscape.tech/openconvai` | **404** |
| `https://moonscape.tech/api/request-register` | **404** |
| `https://moonscape.tech/api/request-confirm` | **404** |
| `https://moonscape.tech/api/registrations` | **404** |

The broker OpenAPI (`https://hol.org/registry/api/v1/openapi.json`, `info.version 0.1.0`, 261,092 bytes, `sha256 6a38959c…8eab`) was read from the earlier recon's cached copy rather than re-fetched; its pin carries over from `hol-x402.pins.draft.json`.

---

## OPEN

| # | Question | Why it is open |
| --- | --- | --- |
| **O-1** | Does `POST /register/{uaid}/openconvai` with `submitToHCS: true` return transaction bytes for the **agent** to sign, or does the broker submit under its own key? | The schema settles that `submitToHCS` is a *request* flag, not a client-submits instruction (§3) — but `instructions` is `{"additionalProperties": true}`, so its shape is unreadable statically. The broker server is closed source (earlier recon C-2), so there is no code to quote. Settling it requires a live POST, which is a write and was out of scope. This is the narrowed remnant of the earlier recon's O-4. |
| **O-2** | Is there a testnet counterpart to `0.0.9297139` — a `hcs-10:…:3:<metadataTopicId>` topic with registry metadata? | `0.0.6913983` is testnet and spec-form but carries **no** metadataTopicId and no keys. No document in any cloned repo names a testnet registry topic; every `registryTopicId` in `hcs-improvement-proposals` docs is a placeholder (`0.0.9601`, `0.0.111`, `0.0.12345`). Mirror nodes cannot be enumerated by memo, so absence is unproven. |
| **O-3** | Where is the mainnet `openconvai` agent `0.0.10058320` registered? | It appears on neither mainnet topic (17 + 23 messages, both read in full). Either it is on a topic I have not found, or the broker indexed it from the account memo alone with no registry message — which C-2's missing `registryEntry` suggests. Mainnet `/transactions?account.id=0.0.10058320` returned 0 rows (mirror retention), so the creating transactions cannot be replayed. |
| **O-4** | Who controls `0.0.9297067`, and is the `cb63a665…` admin/submit key on `0.0.9297139` still held? | The registry metadata names the operator as "Hashgraph Online" at `hashgraphonline.com`, and the operator account matches the sole payer. But the last message on that topic is `1774328871` (2026-03-24) and the associated `moonscape.tech` portal is 404 (C-4), so the registry may be unattended. |
| **O-5** | What distinguishes broker protocol `openconvai` from protocol `hcs-10`, both listed in the same `/protocols` array? | Nothing published defines either. `PROTOCOLS.md` treats them as one thing ("### OpenConvAI (HCS-10)") while the API lists them as two. |
| **O-6** | Does the earlier recon's C-4 conclusion need revising? | Partly. C-4 said "Registering through the broker means an ORG-held key signs your registration", which the 420-message census confirms empirically. But C-6 here shows the **SDK** path is not the broker path and does execute under the agent's own client. The two claims are about different code paths and both stand; the design question is which path WISHMail would use, and the SDK one currently has no live server. |
