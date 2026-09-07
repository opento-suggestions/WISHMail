# WISHMail spec reconnaissance — Project NANDA (`nanda` address profile)

Read-only recon. Nothing was modified in any upstream repo. No code written.
Date of fetch: **2026-09-06** (clones and HTTP probes 2026-09-06, ~17:55–18:15 UTC).

Every claim is marked **FETCHED** (URL + commit) or **OPEN**. Text is quoted verbatim.
All sha256 values are over **raw git blob bytes** (`git cat-file blob <sha> | sha256sum`),
not the CRLF working tree — `core.autocrlf=true` on this host.

Machine-readable pins: `./research/nanda.pins.draft.json`.

---

## CONTRADICTIONS

Nine. The first four are load-bearing: they change what the `nanda` profile can be.

### C-1 — There is no `ans://` scheme in NANDA. And no single name grammar — there are four.

`grep -rn 'ans://'` across every NANDA repo cloned (projnanda, agentfacts-format,
nanda-index-v2, list-39, nanda-index-frontend) returns **nothing**. NANDA does not define
`ans://` and does not resolve it. The one place "ANS" appears, it is an *external* registry
NANDA merely points at and is explicitly forbidden from resolving into:

> "A pointer-only registry (e.g. an Agent Name Service instance): the NANDA
>  Index points at it but MUST NOT resolve into it — its agents are resolved at
>  that registry's own hop, never here."
> — `server/src/lib/mediaTypes.ts:37-40`

Worse for a resolver author: four different name forms exist across NANDA's own surfaces,
and none of them is `ans://`.

| Form | Where | Cite |
| --- | --- | --- |
| `urn:ai:domain:<domain>[:agent:<slug>]`, `urn:ai:email:<email>` | index v2 — what the live resolver actually parses | `nanda-index-v2/server/src/lib/locatorParser.ts:27-30` |
| `urn:agent:<org>:<Name>` | AgentFacts `agent_name` examples | `agentfacts-format/README.md:70, 106` |
| `@agentx`, `@US:shop`, `@company:shop`, `@DID:company:agent` | the "quilt" table on the public site | `projnanda/home/13.NANDAIndex.md:73-78`; `projnanda/faq_nanda.md:216-221` |
| `@<username>` | list39.org AgentFacts URL path | `list-39/routes/public.js:8` |

`urn:agent:` (AgentFacts) and `urn:ai:` (index) are **different URN namespaces**. The index's
parser rejects anything not starting with `urn:` (`locatorParser.ts:35-37`), so the `@handle`
quilt syntax from the site is not resolvable by the index at all.

FETCHED — projnanda/nanda-index-v2 @ `9e6d64a6f8de24e954dfa1479138cdbf60385e39`;
projnanda/agentfacts-format @ `89e938c08a7166341201568055c0a3b6852d26e4`;
projnanda/projnanda @ `34c541cdbc7a1139db29f867f414987c3cd6347f`;
projnanda/list-39 @ `d86f605228307cbef65474451e565e9d497b8daa`.

### C-2 — AgentFacts is not signed. The schema has no signature, no proof, no key, and is not JSON-LD.

The brief asks "whether AgentFacts is signed, by what key, in what format (JWS? JSON-LD
proof? none?)". The answer from the pinned schema is **none**.

The schema's complete top-level property set is: `id`, `agent_name`, `label`, `description`,
`version`, `documentationUrl`, `jurisdiction`, `provider`, `endpoints`, `capabilities`,
`skills`, `evaluations`, `telemetry`, `certification`
(`agentfacts-format/agentfacts_schema.json:18-281`). There is no `signature`, no `proof`,
no `jws`, no `publicKey`, no `@context`. `grep -c '@context\|json-ld\|jsonld'` over the
schema returns `0`.

NANDA's own FAQ states the opposite:

> "AgentFacts are detailed, cryptographically signed JSON-LD documents that contain:"
> — `projnanda/faq_nanda.md:237`

> "| Trust | Only proves domain ownership | Cryptographically signed capabilities |"
> — `projnanda/faq_nanda.md:165`

and the foundational paper promises it as an architectural guarantee:

> "We present an architecture where a minimal lean index resolves to dynamic, cryptographically verifiable AgentFacts that supports multi-endpoint routing, load balancing, privacy-preserving access, and credentialed capability assertions."
> — arXiv:2507.14263 abstract, "Beyond DNS: Unlocking the Internet of AI Agents via the NANDA Index and Verified AgentFacts", citation_date 2025/07/18

FETCHED — https://arxiv.org/abs/2507.14263 (abstract page, 2026-09-06);
schema FETCHED @ `89e938c08a7166341201568055c0a3b6852d26e4`.

The signing exists in the papers and the FAQ, not in the artifact. **A `nanda` profile
cannot verify an AgentFacts document, because there is nothing to verify against.**

### C-3 — The index dropped its signature and audit-log tables. It is now an unsigned mutable database.

NANDA Index v1 (as `entity_owners`) carried real trust machinery — `algorithm`,
`public_key`, `key_id`, `signature_value`, `signed_by`, `expires_at`, `serial` — plus an
append-only log:

> "-- 001_init: entity_owners + audit_log tables per GARR spec §6.1.
> -- audit_log is append-only by convention; no UPDATE or DELETE permitted."
> — `nanda-index-v2/server/db/migrations/001_init.sql:1-2`

Migration 003 deleted all of it:

> "-- Migration 003: GARR v2 — replace v1 entity_owners schema with users/organizations/org_memberships
> -- Drops all v1 tables and creates the v2 schema for the NANDA Index Server.
>
> DROP TABLE IF EXISTS pending_registrations;
> DROP TABLE IF EXISTS audit_log;
> DROP TABLE IF EXISTS entity_owners;"
> — `nanda-index-v2/server/db/migrations/003_nanda_v2.sql:1-6`

The replacement `organizations` table (`003_nanda_v2.sql:23-38`) has **no `public_key`, no
`signature_value`, no `key_id`, no `expires_at`, no `serial`**, and no audit log replaces
the dropped one. No later migration restores them (checked `004`–`012`).

FETCHED @ `9e6d64a6f8de24e954dfa1479138cdbf60385e39`.

### C-4 — The one signing module in the index is dead code, and the one signature field is never verified.

`server/src/services/signing.ts` implements ed25519 canonical-JSON signing and even a
NANDA-spec AgentCard verifier:

> "Verifies an AgentCard signature per §2.5 of the NANDA Layer 2 spec."
> — `nanda-index-v2/server/src/services/signing.ts:131`

Nothing imports it. `grep -rn "from '.*signing'" server/src` returns **no matches** at this
commit. The "NANDA Layer 2 spec" it cites is not in this repo, and the `CLAUDE.md §4.5` its
canonicalization cites (`signing.ts:12`) is not in the repo either (`ls CLAUDE.md` → absent;
never tracked in git history).

Separately, `trust_manifest` — added as "structured, signable trust metadata … and a
detached signature" (`server/db/migrations/010_catalog_entry_fields.sql:6-8`) — types its
signature as a bare string with no accompanying key:

> "    signature:        { type: 'string' },"
> — `nanda-index-v2/server/src/types/api/index-record.ts:91`

Every reference to `trust_manifest` in `server/src` is storage or passthrough
(`db/queries/organizations.ts:34,59,74,99,177,190,219-236`; `routes/orgs.ts:143,217,382,425`;
`services/agenticSearch.ts:40`). It is never verified. There is no field anywhere in
`INDEX_RECORD_SCHEMA` (`index-record.ts:96-128`) carrying a public key to verify it with.

### C-5 — The current index does not serve AgentFacts at all.

`grep -rn -i 'agentfacts\|agent_facts\|facts' nanda-index-v2/server/src` returns **zero
matches**. AgentFacts is absent from the v2 index's resolution chain, which terminates in an
A2A Agent Card:

> "1. GET /api/v1/resolve?locator=urn:ai:domain:acme.com:agent:flights
>    Returns: IndexRecord { registry_url, identifier }
>
> 2. GET <registry_url>/agents/<identifier>
>    Returns: CatalogEntry { url (facts URL) }
>
> 3. GET <catalogEntry.url>
>    Returns: A2A Agent Card { url (runtime endpoint) }"
> — `nanda-index-v2/README.md:293-300`

AgentFacts survives only in the **v1** index (`nanda-index-frontend/server.js:134`, an
`agent_facts_link` string) and in list39.org. The brief's assumption that the `nanda` profile
"reads Project NANDA's index / AgentFacts" as one surface is not true of the current index —
they are two different systems from two different generations.

### C-6 — list39 strips extension fields from published AgentFacts.

The JSON Schema permits extensions (C-7 below), but the reference AgentFacts host does not.
`GET /@<username>.json` returns an explicit allowlist projection, field by field:

> "    const publicData = {
>       id: agentFact.id,
>       agent_name: agentFact.agent_name,
>       label: agentFact.label,
>       description: agentFact.description,
>       version: agentFact.version,
>       documentationUrl: agentFact.documentationUrl,
>       jurisdiction: agentFact.jurisdiction,
>       provider: agentFact.provider,
>       endpoints: agentFact.endpoints,
>       capabilities: agentFact.capabilities,
>       skills: agentFact.skills,
>       evaluations: agentFact.evaluations,
>       telemetry: agentFact.telemetry,
>       certification: agentFact.certification,
>       created_at: agentFact.created_at,
>       updated_at: agentFact.updated_at
>     };"
> — `list-39/routes/public.js:26-43`

A `wishmail` key would be dropped twice over: Mongoose's default strict mode discards it on
write (the schema at `list-39/models/AgentFact.js:59-120` declares no such path), and this
projection would omit it on read even if stored. FETCHED @ `d86f605228307cbef65474451e565e9d497b8daa`.

### C-7 — The AgentFacts schema permits extensions only by omission, not by an extension mechanism.

There is no `x-`/`ext`/`additionalProperties` clause anywhere in the schema —
`grep -n 'additionalProperties' agentfacts_schema.json` returns nothing. Under JSON Schema
draft-07 (`agentfacts_schema.json:2`) the default is `additionalProperties: true`, so a
`wishmail` key validates. But that is the absence of a rule, not a declared extension point,
and it is contradicted in practice by C-6. Treat it as unreserved namespace, not as a
sanctioned seam.

### C-8 — The index README's media-type table is stale; the code carries twice as many.

README lists three (`nanda-index-v2/README.md:222-224`). The code's self-declared "single
source of truth" carries six, including the ANS and MCP types:

> "export const NANDA_MEDIA_TYPE = {
>   AI_CATALOG:  'application/ai-catalog+json',
>   ANS_REGISTRY: 'application/vnd.ans-registry+json',
>   DNS_AID:     'application/vnd.dns-aid+json',
>   A2A_CARD:    'application/a2a-agent-card+json',
>   MCP_CARD:    'application/mcp-server-card+json',
>   AGENT_SKILL: 'application/agentskill+zip',
> } as const;"
> — `nanda-index-v2/server/src/lib/mediaTypes.ts:12-19`

The README also writes `application/a2a-agent-card` without `+json` in its architecture
diagram (`README.md:25-26`) but with `+json` in the table (`README.md:225`).

### C-9 — Minor: the AgentFacts README names a file that does not exist.

> "- `agentfacts-schema.json` - JSON Schema definition for the AgentFacts format"
> — `agentfacts-format/README.md:20`

and the validation instructions repeat it (`README.md:195` — `ajv validate -s agentfacts-schema.json`).
The file in the repo is `agentfacts_schema.json` (underscore). Copy-pasting the documented
command fails.

---

## 1. SURFACES

**There is no NANDA specification repository.** No file in any repo below carries a
Status/Version/normative-language header of the kind HCS-4 mandates. What exists is: a
docsify marketing site, a JSON Schema uploaded once, three server implementations, and two
arXiv papers. The papers are the only documents that describe the architecture the brief
assumes; the implementations are the only things that define behaviour. They disagree (C-2).

| Surface | Canonical location | What it is | Normative? |
| --- | --- | --- | --- |
| NANDA index (registry) + API | `github.com/projnanda/nanda-index-v2` @ `9e6d64a` | Fastify/Postgres server behind `api.nandaindex.org`. Live. | **De facto** — it is the thing that answers. No spec text. |
| NANDA index (v1) | `github.com/projnanda/nanda-index-frontend` @ `dff3643` | Express/MongoDB, `username` + `agent_facts_link`. Deployment at `index.projectnanda.org` still answers. | Superseded, still reachable |
| AgentFacts | `github.com/projnanda/agentfacts-format` @ `89e938c` | One JSON Schema + README. Untouched since 2025-06-17. | Closest thing to a spec; unversioned, unsigned |
| AgentFacts hosting | `github.com/projnanda/list-39` @ `d86f605` | list39.org — Express/MongoDB, `GET /@<user>.json` | Reference implementation |
| Hop-2 registry | `github.com/projnanda/nanda-registry-server-repo` @ `b783ee1` | Enterprise AI Catalog server. Contains **no** AgentFacts reference. | Implementation |
| Naming grammar | — | **No document.** Grammar exists only as `locatorParser.ts` and an illustrative table on the site. | **OPEN** (see C-1) |
| Resolver spec | — | **No document.** `adaptive_resolver` is 2 fields in the schema plus arXiv:2508.03113. | **OPEN** |
| "Quilt" / federation | `projnanda/home/13.NANDAIndex.md:68-79`, `faq_nanda.md:210-223`; code: `nanda-index-v2/server/src/services/federation.ts` | Site prose + an ARD-federation implementation that federates to **ora.ai**, not to other NANDA indexes | Prose only |

**Start points, resolved.** `https://nanda.media.mit.edu` 302-redirects to
`https://www.media.mit.edu/groups/nanda/overview/` — an MIT Media Lab group page with no
specification content. `github.com/projnanda` is the code home; its site repo serves
`projectnanda.org` (`projnanda/CNAME`).

**Provenance quality, worth stating plainly.** The two most spec-like artifacts were both
committed as `"Add files via upload"` — `agentfacts-format` HEAD `89e938c` and `projnanda`
HEAD `34c541c`. Drag-and-drop uploads, not reviewed PRs. `agentfacts-format` has had exactly
one commit-day in its life (2025-06-17) and 7 stars.

The `federation.ts` module federates outward to a third party, not across a NANDA quilt:

> " * Optionally augments local ARD search results with an upstream registry
>  * (ora.ai by default), mirroring ARD's own federation.modes concept:"
> — `nanda-index-v2/server/src/services/federation.ts:33-35`

Full per-file pins (repo, HEAD, path, blob sha, sha256, bytes, last-change) are in
`./research/nanda.pins.draft.json`. Summary of the six that matter most:

| Key file | Blob SHA | sha256 | Bytes |
| --- | --- | --- | --- |
| `agentfacts-format/agentfacts_schema.json` | `37deb4afcf8ccf147d99b060bb5a4b10ce3f1057` | `34495d046d6c579209296c8a4ffcd32b7ff2624733d63eda6ada8df8dbef1745` | 7583 |
| `nanda-index-v2/server/src/lib/locatorParser.ts` | `c1bb40116d94098eb59e11965a5c4317b01ccdcc` | `248e03739e081df4d1a9824501d9b7cad70a1eab56ebbc21bb1ba7afb8bff42a` | 3660 |
| `nanda-index-v2/server/src/lib/mediaTypes.ts` | `2a5c4fefa394528d9dc4d1eb0e51c9e426692b9b` | `d71e5dcc73fcf6d0282071aeaa5bc4960acd34755b238ee07b3052fffa68aef2` | 2428 |
| `nanda-index-v2/server/src/types/api/index-record.ts` | `40361314d49f6bc619c4ae7ad5397968fb8bdeb7` | `e6dfabf1630773a348719424af0523c68eeb067a0a6072330093b23f71a988d4` | 4157 |
| `nanda-index-v2/server/db/migrations/003_nanda_v2.sql` | `179c19f4463f74835469cf109e961481c7c425e6` | `41bb26549cc4229749ba4a5d2536c7fa54ca5bc99efb2e598ba3effbfe785022` | 2420 |
| `list-39/routes/public.js` | `0fa17ab60ace173ebc6451a8f23dd74b220301a2` | `512a2589acbb78781725efc1a42000f54c1469089d9a3fb96279ea349ad50c27` | 6378 |

---

## 2. GRAMMAR

### 2.1 The name/address grammar, as the index actually resolves it

From the parser's own docstring — this is the only authoritative statement of the grammar
that exists anywhere:

> "/**
>  * Parses a NANDA URN into its components.
>  *
>  * Supported formats:
>  *   urn:ai:domain:<domain>               → org-level domain entry
>  *   urn:ai:domain:<domain>:agent:<slug>  → specific agent under a domain
>  *   urn:ai:email:<email>                 → email-identity (personal agent)
>  *   urn:ai:<domain>:<slug>               → legacy format (backward compat)
>  */"
> — `nanda-index-v2/server/src/lib/locatorParser.ts:23-31`

Hard constraints in the code:

> "  if (!trimmed.toLowerCase().startsWith('urn:')) {
>     throw new Error(`invalid locator \"${trimmed}\": must start with \"urn:\"`);
>   }"
> — `locatorParser.ts:35-37`

> "const NID_RE = /^[a-z0-9][a-z0-9-]{0,30}$/i;"
> — `locatorParser.ts:21`

The NID is lowercased before matching (`locatorParser.ts:45`); `domain` and `email`
discriminators are matched case-insensitively (`:55`, `:72`). Note the NID is **not pinned to
`ai`** — any NID matching `NID_RE` parses. The parser's fall-through branch (`:98-115`) treats
any unrecognised third segment as a legacy `urn:<nid>:<domain>:<slug>`, so malformed input
tends to parse as *something* rather than fail.

Matching README table:

> "| Enterprise / org | `urn:ai:domain:<domain>` | `urn:ai:domain:acme.com` |
> | Enterprise / agent | `urn:ai:domain:<domain>:agent:<slug>` | `urn:ai:domain:acme.com:agent:support` |
> | Personal | `urn:ai:email:<email>` | `urn:ai:email:john@hotmail.com` |
> | Custom | any valid URN | `urn:ai:org.agntcy` |"
> — `nanda-index-v2/README.md:230-233`

"Custom | any valid URN" is the escape hatch — and the reason no closed grammar exists.

Separately, `org_id` (not the URN) is constrained at the database:

> "  CONSTRAINT org_id_format CHECK (org_id ~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$'),"
> — `nanda-index-v2/server/db/migrations/003_nanda_v2.sql:36`

### 2.2 What a lookup returns

`GET /api/v1/resolve?locator=<urn>` (`README.md:256`). The response envelope:

> "{
>   \"locator\": \"urn:ai:domain:acme.com:agent:flights\",
>   \"identifier\": \"flights\",
>   \"index_record\": { ... }
> }"
> — `nanda-index-v2/README.md:276-285`

The `IndexRecord` itself, from `INDEX_RECORD_SCHEMA` (`server/src/types/api/index-record.ts:96-128`).
Required: `org_id`, `display_name`, `ttl_seconds`, `status`, `email_verified`,
`domain_verified`, `created_at`, `updated_at` (`index-record.ts:98`).

| Field | Type | Required | Cite |
| --- | --- | --- | --- |
| `org_id` | string | ✅ | `index-record.ts:100` |
| `display_name` | string | ✅ | `:101` |
| `domain` | string \| null | ✕ | `:102` |
| `registry_url` | string \| null | ✕ | `:103` |
| `ttl_seconds` | number | ✅ | `:104` |
| `status` | enum `pending`\|`active`\|`suspended` | ✅ | `:105` |
| `email_verified` | boolean | ✅ | `:106` |
| `domain_verified` | boolean | ✅ | `:107` |
| `created_at`, `updated_at` | string | ✅ | `:108-109` |
| `identifier` | string (the URN) | ✕ | `:110` |
| `media_type` | string | ✕ | `:111` |
| `description` | string \| null | ✕ | `:112` |
| `tags` | string[] | ✕ | `:113` |
| `publisher` | `{identifier, displayName, identityType}` | ✕ | `:114-121` |
| `metadata` | object, `additionalProperties: true` | ✕ | `:122` |
| `data` | object, `additionalProperties: true` | ✕ | `:123` |
| `version` | string | ✕ | `:124` |
| `trust_manifest` | object (see C-4) | ✕ | `:125` |
| `representative_queries` | string[] | ✕ | `:126` |

Confirmed live. `GET https://api.nandaindex.org/api/v1/index` on 2026-09-06 returned records
of exactly this shape — first record `org_id: "travel26"`, with
`"metadata":{"org.projectnanda.resolutionRole":"nested-ai-catalog","org.projectnanda.preferredDiscovery":"ai-catalog"}`
and **no signature field of any kind**. FETCHED (live HTTP, not reproducible).

### 2.3 How an AgentFacts document is located from a name

There are two answers, from two generations, and neither is a template the index defines.

**v1 index — an opaque URL stored in the record.** Not a template, not DNS, not derived:

> "    const { username, agent_facts_link } = req.body;
>
>     if (!username || !agent_facts_link) {
>       return res.status(400).json({ error: 'Username and agent facts link are required' });"
> — `nanda-index-frontend/server.js:134-137`

**list39 — the only actual URL template in the whole ecosystem:**

> "// @route   GET /@:username.json
> // @desc    Get public agent fact by username in JSON format
> // @access  Public
> router.get('/@:username.json', async (req, res) => {"
> — `list-39/routes/public.js:5-8`

i.e. `https://list39.org/@<username>.json`, username lowercased (`public.js:10`) and gated on
`isPublic: true` (`public.js:13`).

**v2 index — AgentFacts is not in the chain at all** (C-5). The chain ends at an A2A Agent
Card, reached through a per-org `registry_url` (`nanda-index-v2/README.md:293-300`).

**OPEN:** whether list39.org is currently serving. Two `curl` attempts from this host to
`https://list39.org/` failed at the connection level (exit 000, no HTTP status), while
`index.projectnanda.org` and `api.nandaindex.org` both answered 200. Could be geo/WAF; not
settled.

### 2.4 Is AgentFacts signed, by what key, in what format?

**No, no key, no format.** See C-2. Nothing in `agentfacts_schema.json` carries a signature,
a proof, or a key. The single identity-adjacent field is optional and on the *provider*, not
the agent:

> "        \"did\": {
>           \"type\": \"string\",
>           \"description\": \"Optional Decentralized identifier for provider verification\"
>         }"
> — `agentfacts-format/agentfacts_schema.json:61-64`

Its only worked value is `"did": "did:web:enterpriseai.com"` (`README.md:113`) — which
grounds trust in DNS + TLS, the very thing the NANDA marketing material says it improves on
(`projnanda/home/13.NANDAIndex.md:64`: "Only proves domain ownership").

### 2.5 How a public key is published and rotated

**It is not.** There is no key field in the AgentFacts schema, none in `INDEX_RECORD_SCHEMA`,
and none in the `organizations` table after migration 003 dropped `public_key`, `key_id` and
`algorithm` (C-3). The paper claims "(3) sub-second revocation and key rotation"
(arXiv:2507.14263 abstract) — nothing in any pinned artifact implements or even represents it.

For WISHMail this is the decisive gap: **there is nowhere in NANDA to publish `x25519Pub` or
`keyEpoch` such that a Verifier could authenticate them.** They can be stored (§3), not proven.

### 2.6 `endpoint` / `adaptive_resolver` fields and TTL/expiry semantics

The complete `endpoints` object:

> "    \"endpoints\": {
>       \"type\": \"object\",
>       \"required\": [\"static\"],
>       \"properties\": {
>         \"static\": { \"type\": \"array\", \"items\": { \"type\": \"string\", \"format\": \"uri\" }, \"description\": \"Static API endpoints\" },
>         \"adaptive_resolver\": {
>           \"type\": \"object\",
>           \"properties\": {
>             \"url\": { \"type\": \"string\", \"format\": \"uri\", \"description\": \"Dynamic routing endpoint\" },
>             \"policies\": { \"type\": \"array\", \"items\": { \"type\": \"string\" }, \"description\": \"Routing policies supported\" }
>           }
>         }
>       }
>     },"
> — `agentfacts-format/agentfacts_schema.json:67-97` (whitespace condensed; field names and types verbatim)

`static` is required; `adaptive_resolver` is optional and has exactly two properties. Worked
example: `"policies": ["geo", "load", "threat-shield"]` (`agentfacts-format/README.md:119`).

**TTL/expiry semantics: there are none in AgentFacts.** No `ttl`, no `expires`, no `notAfter`.
The only expiry in the entire schema is `certification.expirationDate`
(`agentfacts_schema.json:274-277`), which bounds a *certification*, not the document.

**In the index, `ttl_seconds` exists but is advisory only.** Bounded
`minimum: 3600, maximum: 604800` (`nanda-index-v2/server/src/routes/orgs.ts:126`), defaulting
to 86400 (`server/db/migrations/003_nanda_v2.sql:32`). It is stored, echoed, and updated
(`db/queries/organizations.ts:85,181,228`) — and enforced nowhere:
`grep -rn -i "cache-control\|etag\|last-modified" server/src` returns **no matches**. No
response carries a cache header, an ETag, or a validity window. Nothing expires; a stale read
is indistinguishable from a fresh one.

### 2.7 Content-addressing or versioning of AgentFacts

**None.** `version` is a free string with no format constraint
(`agentfacts_schema.json:35-38`; list39 defaults it to `'1.0'`,
`list-39/models/AgentFact.js:77-80`). There is no hash, no digest, no content address, no
snapshot, no `If-None-Match`. `updated_at` is exposed (`list-39/routes/public.js:42`) but is
a mutable timestamp, not a locator. The paper's CRDT update protocol ("We formalize the
AgentFacts schema, specify a CRDT-based update protocol", arXiv:2507.14263) has no
counterpart in any repo.

---

## 3. PLUG-IN

### 3.1 What a third party must publish, and the registration flow

Two-step, credential-based, into a single operator's database:

> "# Step 1: Create an account
> curl -X POST https://api.nandaindex.org/auth/register …
> # Step 2: Register your organization
> curl -X POST https://api.nandaindex.org/api/v1/orgs -H \"Authorization: Bearer $TOKEN\" …"
> — `nanda-index-v2/README.md:145-177` (condensed; endpoint paths verbatim)

Required body fields are only three:

> "        required: ['org_id', 'display_name', 'contact_email'],"
> — `nanda-index-v2/server/src/routes/orgs.ts:118`

**Who signs: nobody.** The registration is authenticated by a JWT bearer token
(`routes/orgs.ts:112` — `preHandler: [fastify.authenticate]`), not by a key that binds the
record to a subject. No signature is submitted, computed, or stored.

**Who hosts: the operator.** The record lives in the operator's Postgres. The agent hosts
only whatever `registry_url` points at.

**Is there a fee: no.** `grep -rn -i 'fee|payment|stripe|billing|price'` over `server/src`
returns nothing.

**Is there a central approver: yes, structurally — though the gate is automated.** Records
start `pending` (`003_nanda_v2.sql:33`) and only `active` ones are public
(`README.md:254` — "List all active organizations"). Promotion requires:

> "Choose your registration type, fill in the form, and verify your email. Personal (no-domain) agents go live as soon as email is verified. Registry/DNS-AID/SMB registrations also require verifying ownership of the domain (via a DNS TXT record) before going live."
> — `nanda-index-v2/README.md:140`

There is also a `suspended` state reachable by `DELETE /api/v1/orgs/:org_id/suspend`
(`README.md:268`) — "Suspend (removes from public index)". Whoever runs the deployment can
therefore delist any agent, silently, with no log (the audit table was dropped, C-3). That is
the definition of a social-committee trust root, regardless of intent.

### 3.2 Can an agent carry arbitrary extension fields? Where does `wishmail` go?

**In the index: yes, in two declared free-form objects.** This is the strongest plug-in seam
in NANDA and the recommended home for `wishmail: {manifestTopic, x25519Pub, keyEpoch, doorbell}`:

> "          catalog_metadata: { type: 'object', additionalProperties: true },
>           entry_data:       { type: 'object', additionalProperties: true },"
> — `nanda-index-v2/server/src/routes/orgs.ts:141-142` (create), repeated at `:379-380` (update)

These surface on the IndexRecord as `metadata` and `data`, both `additionalProperties: true`
(`server/src/types/api/index-record.ts:122-123`), described as:

> "  metadata:    Record<string, unknown>;  // NANDA routing hints
>   data:        Record<string, unknown>;  // DNS-AID discovery data"
> — `nanda-index-v2/README.md:213-214`

`trust_manifest` is also `additionalProperties: true` with a nested free-form `metadata`
(`index-record.ts:82, 92`).

**There is an observed naming convention** — reverse-DNS keys, seen in the live index and the
README's own example: `"org.projectnanda.preferredDiscovery"`, `"org.projectnanda.resolutionRole"`
(`nanda-index-v2/README.md:174-175`; confirmed live 2026-09-06). It is nowhere documented as a
rule, but following it (`org.wishmail.*`) is the low-friction choice.

**In AgentFacts: only by omission, and stripped in practice.** See C-7 and C-6.

**Caveat.** Neither `metadata` nor `data` is signed, hashed, or logged. Anything WISHMail
hangs there is a claim by the index operator's database, retractable without trace.

### 3.3 Can a NANDA name bind to a Hedera account or CAIP-10 identifier natively?

**No.** A full-text sweep of every cloned NANDA repo for `hcs-14`, `uaid`, `caip-10`, `caip10`,
`hedera`, `hashgraph` returns **no source-text matches** — the only hits are a
`package-lock.json` substring and two PNG binaries matching by chance. Hedera appears in the
ecosystem exactly once, as a sponsor logo file: `projnanda/assets/companylogos/hedera_logo.png`.

`publisher.identityType` is an unconstrained string (`index-record.ts:119`; create schema
`routes/orgs.ts:138` has no enum) and the live records use `"identityType":"dns"`. So a
CAIP-10 value could be *placed* there, but nothing in NANDA would interpret or validate it.
Binding a NANDA name to a Hedera account is possible only as an uninterpreted string in
`metadata`/`data`.

---

## 4. VERIFIABILITY — trust class

**Can a Verifier holding only public data re-obtain a past AgentFacts document by a stable
locator? No.**

- No content address, no hash, no version locator, no snapshot (§2.7).
- No `Cache-Control`, no `ETag`, no `Last-Modified` on any index response
  (`grep` over `nanda-index-v2/server/src` → no matches).
- `GET /@<username>.json` (`list-39/routes/public.js:8`) always serves current database state.
  Overwrites leave no prior version: the record is mutated in place, with only a mutable
  `updated_at` (`list-39/models/AgentFact.js:115-118`).
- `PUT /api/v1/orgs/:org_id` and `DELETE /api/v1/orgs/:org_id` ("Permanently delete") are the
  documented mutation surface (`nanda-index-v2/README.md:266-267`).

**Is there any consensus or log behind the index? No — and there used to be.** The append-only
`audit_log` declared "no UPDATE or DELETE permitted" (`001_init.sql:1-2`) was dropped by
migration 003 (`003_nanda_v2.sql:5`) and never replaced. What remains is a single PostgreSQL
instance behind one Fastify process, reachable only over HTTP:

> "| **Database:** PostgreSQL 16, postgres.js v3"
> — `nanda-index-v2/README.md:44`

There is no ledger, no transparency log, no Merkle structure, no multi-party attestation, and
no signature anywhere in the read path (C-3, C-4).

### Verdict for the `nanda` profile

**Trust class: `social-committee`.** Not `math`, and not marginally so — there is no
cryptographic material anywhere in the resolution path to build a `math` claim on. A NANDA
answer is a database row served by one operator over TLS. The only thing a Verifier can
check is that *some* TLS endpoint said so at read time, and TLS alone authenticates the
server, not the record's history, authorship, or freshness.

**Required endorsements, all three, and why each is forced:**

| Endorsement | Forced by |
| --- | --- |
| `stale` | `ttl_seconds` is advisory with no enforcement and no cache validators (§2.6); a Verifier cannot bound how old an answer is, and cannot detect that it is old. |
| `blurred` | No content address or versioned locator (§2.7): a past document cannot be re-obtained, so any claim about what NANDA said at time *T* is unfalsifiable after the fact. |
| `withheld` | `status` can move to `suspended` and records can be hard-deleted (`README.md:267-268`) with the audit log gone (C-3). Disappearance is unobservable and unattributable. |

Because a past state cannot be re-obtained, the `nanda` profile cannot support any WISHMail
claim that must remain checkable after delivery. It can answer "where do I send this now?"
It cannot answer "where was this addressed when I sent it?" — which is the question certified
mail exists to answer. **Anything WISHMail needs to prove later must be anchored on Hedera,
with the NANDA answer carried as a witnessed observation, not as evidence.**

---

## 5. INTEROP

### 5.1 HCS-14 / UAID

**No reference in either direction's implementation.** NANDA does not mention HCS-14, UAID,
or CAIP anywhere in source text (§3.3).

On the HCS-14 side, the claim the brief cites is confirmed. FETCHED —
`hiero-ledger/hiero-consensus-specifications` @ `7046156c85eaaf29e149fa10232964d33a58d34e`:

> "- `nativeId` = Protocol's native unique identifier (use CAIP‑10 where applicable, e.g., `eip155:<chainId>:<address>` for EVM accounts, `hedera:<network>:<account>` for Hedera; domain for A2A/NANDA)"
> — `docs/standards/hcs-14/index.md:187`

> "- For web‑hosted A2A agents, nativeId SHOULD be the domain that serves `/.well-known/agent.json`, with the agent's name/ID carried in `uid` when applicable."
> — `docs/standards/hcs-14/index.md:373`

> "- `registry` = Registry namespace (e.g., \"nanda\", \"hol\", \"olas\")"
> — `docs/standards/hcs-14/index.md:185`

**NANDA's side of that: a domain is a reasonable choice but not a complete one.** HCS-14
assumes one domain per agent. NANDA's index is keyed on `org_id` with the URN carrying the
agent, and `urn:ai:domain:<domain>:agent:<slug>` puts two agents behind one domain
(`locatorParser.ts:27-29`). Setting `nativeId` to the bare domain therefore collides across
agents of the same org; the `slug` must go in `uid`. NANDA's *personal* identities are worse:
`urn:ai:email:<email>` (`locatorParser.ts:29`) has no domain that identifies the agent — only
the mail provider's. **OPEN:** how HCS-14 `nativeId` should be formed for a NANDA email-identity
agent. No text on either side addresses it.

Note also that HCS-14's registry example value is the bare string `"nanda"`
(`hcs-14/index.md:185`), with no statement of which NANDA index — v1 at
`index.projectnanda.org` or v2 at `api.nandaindex.org` — it denotes. Given C-5 those are
different systems with different grammars.

### 5.2 A2A AgentCards

**Yes, structurally and deeply.** A2A is the terminus of the v2 resolution chain
(`nanda-index-v2/README.md:299-300`), one of six registrable media types
(`mediaTypes.ts:16` — `A2A_CARD: 'application/a2a-agent-card+json'`), and AgentFacts declares
an explicit field-by-field mapping:

> "### 🟢 AgentCard Compatible
> Fields that map directly to existing AgentCard specifications:
> - `label` → AgentCard.name
> - `description` → AgentCard.description
> - `version` → AgentCard.version
> - `provider` → AgentCard.provider
> - `endpoints.static` → AgentCard.url
> - `capabilities.modalities` → AgentCard.defaultInputModes/defaultOutputModes
> - `capabilities.authentication` → AgentCard.securitySchemes & security
> - `skills` → AgentCard.skills"
> — `agentfacts-format/README.md:169-178`

The site positions NANDA as the index A2A lacks:

> "| Discovery | Decentralized \"Quilt\" with global index | Individual Agent Cards at /.well-known/agent.json (no index) |"
> — `projnanda/faq_nanda_a2a.md:45`

### 5.3 MCP server descriptors

**Yes, as a registrable type, with no schema of its own in NANDA.**
`MCP_CARD: 'application/mcp-server-card+json'` (`mediaTypes.ts:17`), also in the ARD target
vocabulary (`mediaTypes.ts:50`). MCP is listed among the bridged protocols
(`projnanda/home/13.NANDAIndex.md:84`). AgentFacts has no MCP-specific fields.

### 5.4 ARD / ora.ai — an interop surface the brief does not mention

The v2 index speaks a second wire format, deliberately, in a different case convention:

> "/**
>  * ARD (Agentic Resource Discovery) wire types — deliberately camelCase to
>  * stay byte-compatible with ora.ai's reference implementation, unlike every
>  * other NANDA-native type in this directory (snake_case). This is an
>  * intentional two-casing-conventions split: /api/ard/* speaks ARD's wire
>  * format; /api/v1/* speaks NANDA's own. Don't unify them."
> — `nanda-index-v2/server/src/types/api/ard.ts:1-7`

`/api/ard/*` and `/api/v1/*` are two views of the same records with different field casing.
A `nanda` profile must fix which it speaks; they are not interchangeable.

---

## OPEN ITEMS

| # | Question | Why it is open |
| --- | --- | --- |
| O-1 | Which index is "the" NANDA index for a `registry=nanda` UAID? | v1 (`index.projectnanda.org`, `username`+`agent_facts_link`) and v2 (`api.nandaindex.org`, `urn:ai:*`) are different systems, both answering, with incompatible grammars (C-5). No document declares one authoritative. |
| O-2 | Is list39.org reachable? | Two `curl` attempts failed at connection level (exit 000) while two sibling hosts returned 200. Geo/WAF vs outage not settled (§2.3). |
| O-3 | HCS-14 `nativeId` for a NANDA email-identity agent | `urn:ai:email:<email>` has no agent-identifying domain (§5.1). Neither spec addresses it. |
| O-4 | Where is the "NANDA Layer 2 spec"? | Cited at `nanda-index-v2/server/src/services/signing.ts:131` with a section number (§2.5). Not in any projnanda repo I cloned; not found by search. Likewise the `CLAUDE.md §4.5` canonicalization reference (`signing.ts:12`) — never tracked in that repo's git history. |
| O-5 | Is `signing.ts` intended to be revived? | It is complete, tested-looking, and dead (C-4). Whether v2 plans to re-introduce signing changes the trust class and is not stated anywhere. |
| O-6 | Which arXiv version (`vN`) of 2507.14263 to pin | The abstract page was read 2026-09-06; no explicit version suffix was captured. Re-pin as `2507.14263vN` if byte stability matters for the affidavit. |
| O-7 | Does `nanda-registry-server-repo` (hop 2) serve AgentFacts or A2A cards? | It contains no AgentFacts reference at `b783ee1`. Its `CatalogEntry.url` is described as a "facts URL" (`nanda-index-v2/README.md:298`) but the next hop is called an A2A Agent Card (`:300`). Terminology unresolved. |
| O-8 | Is the `org.projectnanda.*` reverse-DNS metadata convention documented anywhere? | Observed in the live index and the README example (`README.md:174-175`), never stated as a rule. Whether `org.wishmail.*` would be accepted or later rejected is unknown. |
| O-9 | Governance of the AgentFacts schema | One commit-day (2025-06-17), `"Add files via upload"`, no CONTRIBUTING, no versioning policy, `$id` points at `agentfacts.org/schema/v1` (not fetched). Whether v1 is frozen or abandoned is undetermined. |
| O-10 | Does `agentfacts.org/schema/v1` serve anything? | The schema's `$id` (`agentfacts_schema.json:3`). Not probed this pass. |

---

## APPENDIX — provenance

Repos cloned fresh 2026-09-06 into a session scratchpad, read-only, never modified:

| Repo | URL | HEAD read at |
| --- | --- | --- |
| projnanda (site) | https://github.com/projnanda/projnanda | `34c541cdbc7a1139db29f867f414987c3cd6347f` (2026-08-30, `Add files via upload`) |
| agentfacts-format | https://github.com/projnanda/agentfacts-format | `89e938c08a7166341201568055c0a3b6852d26e4` (2025-06-17, `Add files via upload`) |
| nanda-index-v2 | https://github.com/projnanda/nanda-index-v2 | `9e6d64a6f8de24e954dfa1479138cdbf60385e39` (2026-07-29, `Merge PR #20: feat(index): pointer-only ANS registry media type`) |
| list-39 | https://github.com/projnanda/list-39 | `d86f605228307cbef65474451e565e9d497b8daa` (2025-06-17) |
| nanda-index-frontend | https://github.com/projnanda/nanda-index-frontend | `dff3643b81c37f5bc5a2ad92fc427325c4222a02` (2025-06-15) |
| nanda-registry-server-repo | https://github.com/projnanda/nanda-registry-server-repo | `b783ee1639c47ccd3bb3ffe0a74d6f9d2940cf79` (2026-06-29) |

Cross-referenced (from the prior HCS recon, same methodology):
`hiero-ledger/hiero-consensus-specifications` @ `7046156c85eaaf29e149fa10232964d33a58d34e`.

Non-git sources: arXiv abstract pages for 2507.14263 and 2508.03113; live HTTP GETs against
`api.nandaindex.org`, `index.projectnanda.org`, `list39.org`, `nanda.media.mit.edu`. None are
content-addressable; see `_papers` and `_liveSurfaces` in `nanda.pins.draft.json`.

Line numbers cite the **raw git blob** (LF), read via `git cat-file blob`. sha256 values were
computed the same way; the CRLF working tree on this host produces different digests.

No secrets were read, written, or transmitted. Only idempotent GETs were issued — no
registration, no write, no account created. No repository was modified. No code was written.
