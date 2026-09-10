# WISHMail spec reconnaissance — HCS pins

Read-only recon. Nothing was modified in any upstream repo. No code written.
Date of fetch: **2026-09-06** (all clones taken 2026-09-06, ~17:38–17:45 UTC).

Every claim below is marked **FETCHED** (with URL + commit read at) or **OPEN**.
Standard text is quoted verbatim; nothing is paraphrased into normative prose.

---

## CONTRADICTIONS

Seven, in descending order of how much they can hurt the WISHMail spec.

### C-1 — There is no `did:uaid` or `did:aid`. The prefix is `uaid:`.

The brief asks for "the `did:uaid` and `did:aid` grammars". The pinned HCS-14 text
defines no such thing. The scheme prefix is `uaid`, and `aid`/`did` are *targets*
inside it.

> "#### Registry-Generated Identifiers (AID Target)
> ```
> uaid:aid:{id};{parameters}
> ```
> #### Self-Sovereign Identifiers (UAID Targeting a DID)
> ```
> uaid:did:{id};{parameters}
> ```"
> — `docs/standards/hcs-14/index.md:144-154`

> "- `uaid` = Universal Agent Identifier scheme prefix
> - `aid` = Agent Identifier target (system-generated)
> - `did` = W3C DID target (self-sovereign)"
> — `docs/standards/hcs-14/index.md:158-160`

FETCHED — https://github.com/hiero-ledger/hiero-consensus-specifications @ `7046156c85eaaf29e149fa10232964d33a58d34e`

If WISHMail emits `did:uaid:...` it will not match any HCS-14 consumer.

### C-2 — `hashgraph-online/hcs-improvement-proposals` calls itself canonical but no longer contains the normative text.

Its README still says so:

> "This repository is the canonical source for HCS — Hashgraph Consensus Standards — authored and maintained by Hashgraph Online."
> — `README.md:3`

But on `main` at HEAD the six standards files do not exist. They are **gitignored** and
fetched from the hiero repo at build time:

> "# Standards synced from hiero-consensus-specifications at build time
> # Keep: _category_.json (Docusaurus sidebar config), index.mdx (custom showcase), and *-old.md (legacy local docs)
> /docs/standards/*.md"
> — `.gitignore:19-22`

and the sync script itself defers:

> "This script fetches the docs/standards/ folder from the upstream hiero-consensus-specifications
>  GitHub repository and copies it to the local docs/standards/ folder at build time.
>  This keeps the hol.org site in sync with the Linux Foundation canonical source
>  without duplicating content in git."
> — `scripts/sync-hiero-standards.js:5-8`

FETCHED — https://github.com/hashgraph-online/hcs-improvement-proposals @ `bd508bad70e3a5a660b149d7a183dd30b814d29f`

The README's self-description is stale. Pin against hiero, not hol.

### C-3 — `hiero-mirror-node` does not compute or verify topic running hashes.

The brief asks to find "where topic running hashes are computed or verified" in
hiero-mirror-node. They are not. The mirror node **consumes** the value from the
record/block stream and stores it; where the stream omits a version it defaults to 3.

> "// Blockstreams no longer contain runningHashVersion, this is the latest version
>     public static final long DEFAULT_RUNNING_HASH_VERSION = 3;"
> — `importer/src/main/java/org/hiero/mirror/importer/util/Utility.java:39-40`

Ingestion sites, not computation sites:

- `common/src/main/java/org/hiero/mirror/common/domain/transaction/BlockTransaction.java:132` — `.runningHash(DomainUtils.toBytes(submitMessageTraceData.getRunningHash()))`
- `common/src/main/java/org/hiero/mirror/common/domain/transaction/StateChangeContext.java:343` — `.runningHash(DomainUtils.toBytes(topic.getRunningHash()))`
- `grpc/src/main/java/org/hiero/mirror/grpc/controller/ConsensusController.java:38` — `static final int DEFAULT_RUNNING_HASH_VERSION = 3;`
- `rest/viewmodel/topicMessageViewModel.js:17` — `static DEFAULT_RUNNING_HASH_VERSION = 3;`

I swept every file in the repo mentioning `runningHash`/`running_hash` (65 files) and
cross-filtered for `MessageDigest`/`ByteBuffer`/`DataOutputStream`. The six hits are all
**record-file** stream hashing (`AbstractRecordFileItemReader`, `RecordFileItemReaderV2/V5`,
`ProtoRecordFileReader`, `StreamFileWriter`, `BlockTransactionTest`) — the file-level
running hash of the record stream, a different object from a topic message running hash.
There is no `LITTLE_ENDIAN` anywhere in the repo's Java.

FETCHED — https://github.com/hiero-ledger/hiero-mirror-node @ `219ffd334c7a8f9e68b663b6159c4d08278b03d7`

The real answer is in `hiero-consensus-node`; see §4.

### C-4 — HCS-10 uses two different, conflicting "topic type" enums.

Topic-creation memo:

> "- `type` defines the topic purpose (0=inbound, 1=outbound, 2=connection, 3=registry)"
> — `docs/standards/hcs-10/index.md:158`

Transaction memo, same document:

> "- `{topic_type_enum}` is the numeric topic type where the operation occurs (0=registry, 1=inbound, 2=outbound, 3=connection)"
> — `docs/standards/hcs-10/index.md:362`

Both are labelled "topic type" and they are inverses of each other. The worked example
confirms the second reading is intended for transaction memos:

> "  .setTransactionMemo(\"hcs-10:op:6:3\"); // Operation enum 6 (message) on topic type 3 (connection)"
> — `docs/standards/hcs-10/index.md:353`

FETCHED — same commit as C-1.

### C-5 — HCS-10's `transaction` operation has no enum value and no transaction memo.

The Operation Enum table (`docs/standards/hcs-10/index.md:366-374`) runs `0` register,
`1` delete, `2` migrate, `3` connection_request, `4` connection_created,
`5` connection_closed, `6` message — and stops. There is no `transaction`.

`message` and `close_connection` each carry a "**Transaction Memo:**" line
(`hcs-10:op:6:3` at `index.md:646`, `hcs-10:op:5:3` at `index.md:682`). The `transaction`
operation section (`index.md:692-757`) carries none, and no enum is assigned to it — yet
the spec says:

> "When submitting HCS-10 operations to the network, implementations MUST set the transaction memo to enable analytics and operation tracking."
> — `docs/standards/hcs-10/index.md:330`

A conforming implementation cannot satisfy that MUST for the `transaction` operation.

### C-6 — HCS-10 close operation: `close_connection` vs `connection_closed`.

The connection-topic operation is `close_connection`
(`docs/standards/hcs-10/index.md:668, 687`), the outbound-topic record is
`connection_closed` (`docs/standards/hcs-10/index.md:530, 590`), and the operation enum
table names slot `5` `connection_closed` (`index.md:373`) — which `close_connection`'s
own memo `hcs-10:op:5:3` points at. Same enum slot, two operation strings.

### C-7 — HCS-2 `metadata` is a string in HCS-2 and an object in HCS-13.

HCS-2's own register examples:

> "  \"metadata\": \"OPTIONAL_METADATA (HIP-412 compliant)\","  — `docs/standards/hcs-2.md:94`

> "  \"metadata\": \"hcs://1/0.0.456789\","  — `docs/standards/hcs-2.md:106`

HCS-13, writing `p: "hcs-2"` messages:

> "  \"metadata\": {
>     \"name\": \"UserProfile\",
>     \"description\": \"Standard user profile schema\"
>   },"
> — `docs/standards/hcs-13.md:154-157`

Also note `metadata` appears in neither standard's field table — HCS-2's Registry Format
table (`hcs-2.md:64-70`) lists only `p`, `op`, `t_id`, `uid`, `m`.

---

## 1. CANONICAL REPO

**Canonical: `hiero-ledger/hiero-consensus-specifications`.** FETCHED @
`7046156c85eaaf29e149fa10232964d33a58d34e` (HEAD, 2026-08-31,
`ci: add CodeQL analysis and Dependabot for GitHub Actions (#39)`).

It claims the role explicitly:

> "This repository is the canonical source for the normative text of HCS specifications, along with the contribution workflow and governance process used to evolve them."
> — `README.md:8`

> "Canonical, text-first specifications for **Hiero Consensus Standards (HCS)**, originally created and maintained by [Hashgraph Online](https://hol.org). ... Process and governance are defined in `docs/standards/hcs-4.md`."
> — `README.md:3`

**Since when.** The repo was created 2025-12-16 (`c145ee85808c33923a14e6afa28874a6738315b9`,
`chore: Add initial README file`, 2025-12-16T10:01:02-08:00); the specifications landed the
same day in `675f6d06450c72c63f52191eb090e7b2bdbb405c`
(`Feat/specifications onto main (#2)`, 2025-12-16T15:37:07-05:00). The repo has 19 commits
total on `main`.

The handover became effective in the *other* repo on **2026-01-15**, when
`f59fbe4d1a2e0cab65dfae77ae40d2ca35fda6a9` (`feat: sync specs from hiero (#228)`) deleted
the tracked spec markdown from `hashgraph-online/hcs-improvement-proposals` and replaced it
with a build-time sync. FETCHED @ `bd508bad70e3a5a660b149d7a183dd30b814d29f`.

**Is the other one a mirror, a fork, or stale?** None of the three cleanly — it is a
**downstream site build**. Specifically:

- **Not a fork.** `main` histories are disjoint: `git merge-base --is-ancestor 675f6d0 HEAD`
  returns false in hcs-improvement-proposals, and hiero does not contain
  hcs-improvement-proposals' HEAD. (`675f6d0` *does* appear in hcs-improvement-proposals,
  but only on the stale remote branch `origin/feat/hcs-25-trust-scores`, not on `main`.)
- **Not a git mirror.** The files are gitignored (`.gitignore:19-26`) and absent from `main`.
- **It is a rendered mirror.** `package.json:27,29` run `node scripts/sync-hiero-standards.js`
  as `prestart`/`prebuild`, pulling `docs/standards` + `docs/assets` from
  `HIERO_REPO = 'https://github.com/hiero-ledger/hiero-consensus-specifications.git'`
  branch `main` (`scripts/sync-hiero-standards.js:18-30`).

So hol.org always renders hiero's `main` at build time — but there is **no pinned commit**;
what the site shows depends on when it was last built. Pin the repo, never the site.

### The HCS-4 process document, in each repo

- **hiero:** `docs/standards/hcs-4.md` — present. `Status: Draft`, `Version: 1.0`
  (`hcs-4.md:9-11`). blob `e4b0c0fb94047441b830e0a5349facfa2e1affaa`, sha256
  `d9e6e213e32167a100cf0823240911f7a54a42fb159fc41fe131f50c5f0604f7`, 26312 bytes. Last
  change `4b21202e926fd4bf5414c59219cfe08594eba9ac`, 2026-01-29T14:29:08-05:00,
  `fix: update references to 'Hashgraph Online' to 'HCS community' (#13)`.
- **hcs-improvement-proposals:** **absent at HEAD** (gitignored). It existed historically —
  added in `191777e feat: add hcs-4 standard (#134)`, removed by `f59fbe4`.

HCS-4 locates canonicity at the merged document path, and history in the GitHub repo:

> "10. **Publish**: Editors set `Status: Published`, and optionally create a release/tag. The canonical location is the merged document path."
> — `docs/standards/hcs-4.md:164`

> "- **Canonical record**: GitHub Issues, PRs, and Discussions remain the authoritative history. Summaries from other channels SHOULD be linked back to the Discussion thread."
> — `docs/standards/hcs-4.md:169`

### Cross-repo diff of the six standards

`hashgraph-online/hcs-improvement-proposals` tracks **none** of the six at HEAD, so a
HEAD-to-HEAD diff is empty by construction. To make the comparison meaningful I diffed its
**last tracked copies** (at `f59fbe4^`, immediately before the 2026-01-15 sync commit)
against hiero HEAD.

| Standard | hol path (last tracked) | hiero path (HEAD) | Difference |
| --- | --- | --- | --- |
| HCS-1 | `docs/standards/hcs-1.md` | `docs/standards/hcs-1.md` | **None** — identical blob `0d8cca5f…` |
| HCS-2 | `docs/standards/hcs-2.md` | `docs/standards/hcs-2.md` | **None** — identical blob `dc0ad9a1…` |
| HCS-13 | `docs/standards/hcs-13.md` | `docs/standards/hcs-13.md` | **None** — identical blob `07f1ac67…` |
| HCS-10 | `docs/standards/hcs-10/index.md` | `docs/standards/hcs-10/index.md` | 1 line, link text only: `[definitions.md](../../definitions.md)` → `[Definitions](../../definitions.md#hashgraph-resource-locator)` at line 761. No normative change. |
| HCS-11 | `docs/standards/hcs-11.md` | `docs/standards/hcs-11.md` | 173 changed lines. Version `1.0`→`1.1`; adds 7 optional `mcpServer.*` fields (`protocolVersion`, `license`, `deprecated`, `deprecationMessage`, `securityPolicyUrl`, `authentication`, `tags`); adds a "Verifiable Presentations (VP) support" section, MCP Server Authentication/Tags enums, and a Changelog. |
| HCS-14 | `docs/standards/hcs-14.md` (single file) | `docs/standards/hcs-14/index.md` + `hcs-14/profiles/` (5 files) | **Restructured.** 87 changed lines. `### UAID DID Resolution Profile` replaced by a `## Profiles` framework (Profile Registry, Profile Conformance, Profile ID and Versioning, Core Resolver Contract, Known Profiles), profiles split out to `profiles/{aid-dns-web,ans-dns-web,registry,uaid-did-resolution,uaid-dns-web}.md`. |

**Method note.** `core.autocrlf=true` on this Windows host. `sha256sum` on a checked-out
file yields CRLF-contaminated bytes (e.g. `hcs-1.md` reads 6504 bytes on disk vs 6376 in the
object store). Every sha256 in this report and in `pins.draft.json` was computed as
`git cat-file blob <sha> | sha256sum` — raw LF object bytes. If you re-verify, do the same
or you will not reproduce these digests.

---

## 2. PINS

Repo: `https://github.com/hiero-ledger/hiero-consensus-specifications`
HEAD (`git rev-parse HEAD`, 2026-09-06): `7046156c85eaaf29e149fa10232964d33a58d34e`

| Std | Path | Blob SHA (`git hash-object`) | sha256 (raw blob bytes) | Bytes | Status |
| --- | --- | --- | --- | --- | --- |
| HCS-1 | `docs/standards/hcs-1.md` | `0d8cca5f0adac613a149244e769672ea3060328a` | `389128dfe5ab94d83fdb56af22f22d497eee859101ed6e51ee311812242de9cb` | 6376 | **Published** |
| HCS-2 | `docs/standards/hcs-2.md` | `dc0ad9a1a052f4a9f2ee750161d61f7f8d28ef07` | `7ec2c681a11024389e950af3f63e3c0ede2d920f4d592e5265aef3f6044c9591` | 14114 | **Published** |
| HCS-10 | `docs/standards/hcs-10/index.md` | `0cb5d2eb6b98e12e4b44fa8c4fea6e10937b615a` | `688372d38323656cdff5de2d210f07e78db811738ccd327666a856f2fcacd198` | 63600 | Draft |
| HCS-11 | `docs/standards/hcs-11.md` | `aa5ba9ede21b31cb84dde93e119302fd5ae127a9` | `fd7d9f4d893b9c3d11e33cf6cc8a6861e13a37ec02e1fb03b6bddb3916da1e82` | 55175 | Draft |
| HCS-13 | `docs/standards/hcs-13.md` | `07f1ac67b344d6655b98ce8196b3053fe1b4f566` | `1bdb3e679de720d5c8cfe8e2f91adfc35d4c4606093193c566cc24647f15104a` | 18051 | Draft |
| HCS-14 | `docs/standards/hcs-14/index.md` | `969de3aa2fccaea10f50165f82620ae6172b017d` | `9f53ea7d51d3bd6d88b06f5483b497ca37ef156406ff515375a78c3a616a9ab9` | 52993 | Draft |

Status lines, verbatim:

- `hcs-1.md:9` — "### Status: Published"
- `hcs-2.md:9` — "### Status: Published"
- `hcs-10/index.md:8` — "### **Status:** Draft"
- `hcs-11.md:9` — "### Status: Draft"
- `hcs-13.md:9` — "### Status: Draft"
- `hcs-14/index.md:9` — "### Status: Draft"

Last commit touching each file:

| Std | Commit | Date | Message |
| --- | --- | --- | --- |
| HCS-1 | `675f6d06450c72c63f52191eb090e7b2bdbb405c` | 2025-12-16T15:37:07-05:00 | Feat/specifications onto main (#2) |
| HCS-2 | `675f6d06450c72c63f52191eb090e7b2bdbb405c` | 2025-12-16T15:37:07-05:00 | Feat/specifications onto main (#2) |
| HCS-10 | `675f6d06450c72c63f52191eb090e7b2bdbb405c` | 2025-12-16T15:37:07-05:00 | Feat/specifications onto main (#2) |
| HCS-11 | `a3d35f02b6d804805e6ed4f065d2c1ef0a9ed35b` | 2026-03-02T21:20:46Z | HCS-11: Add optional MCP server profile fields (Clarification, v1.0.1) (#20) |
| HCS-13 | `675f6d06450c72c63f52191eb090e7b2bdbb405c` | 2025-12-16T15:37:07-05:00 | Feat/specifications onto main (#2) |
| HCS-14 | `3c16ca72ee68eacbb8dec0a5ff8f615839772aa9` | 2026-02-21T13:28:15-05:00 | feat: new uaid dns profile (#18) |

Note for HCS-11: the header says `### Version: 1.1` (`hcs-11.md:11`) while its own table of
contents says `- [Version: 1.0.1](#version-11)` (`hcs-11.md:17`) and the commit message says
"v1.0.1". Three labels for one revision. Cite the blob, not the version string.

Machine-readable: `./research/pins.draft.json`.

---

## 3. QUESTIONS THE SPEC LEANS ON

All quotes FETCHED from `hiero-consensus-specifications` @ `7046156c85eaaf29e149fa10232964d33a58d34e`.

### 3.1 HCS-10 — the `message` operation

**Exact JSON** (`docs/standards/hcs-10/index.md:636-644`):

```json
{
  "p": "hcs-10",
  "op": "message",
  "operator_id": "0.0.789101@0.0.123456",
  "data": "Hello, this is a message from Agent A to Agent B.",
  "m": "Standard communication message."
}
```

**Is `data` a string only, or may it be an object? — String only.** The field table types
it `string`, and the spec's answer to structured data is an *encoded* JSON string, not a
JSON object:

> "| `data` | The message content. Can be a plain string, JSON string, or an HRL reference (`hcs://1/topicId`) for large messages (>1KB). | `string` | `\"Hello, this is a message...\"` | ✅ |"
> — `docs/standards/hcs-10/index.md:653`

> "The `data` field typically contains a string value, but agents may also encode structured data as a JSON string if they prefer:"
> — `docs/standards/hcs-10/index.md:656`

and the illustrating example escapes it (`index.md:661`):

```json
"data": "{\"content\":\"Hello Bob\",\"metadata\":{\"timestamp\":1709654845}}",
```

The same string-only typing holds for `transaction.data` (`index.md:712`). No object form
appears anywhere in the document. **If WISHMail puts an object in `data`, it is off-spec.**

**`operator_id` format** — `inboundTopicId@accountId`, required on every connection-topic
and inbound-topic operation:

> "| `operator_id` | Identifier for the sending agent in the format `inboundTopicId@accountId`. | `string` | `\"0.0.789101@0.0.123456\"` | ✅ |"
> — `docs/standards/hcs-10/index.md:652`

Note the ordering trap: topic first, account second. It recurs identically at
`index.md:493, 518, 553, 587, 614, 688, 711`.

**Topic memo formats.** General shape (`index.md:150`):
`hcs-10:{indexed}:{ttl}:{type}:[additional parameters]`

| Topic | Memo | Cite |
| --- | --- | --- |
| Inbound | `hcs-10:0:{ttl}:0:{accountId}` | `index.md:246` |
| Outbound | `hcs-10:0:{ttl}:1` | `index.md:263` |
| Connection | `hcs-10:1:{ttl}:2:{inboundTopicId}:{connectionId}` | `index.md:279` |
| Registry | `hcs-10:0:{ttl}:3:[metadataTopicId]` | `index.md:179` |

Summary table repeating all four: `index.md:317-322`. Note connection topics use
`indexed=1` — "Enum value (1) meaning \"only latest message should be read\" (non-indexed)"
(`index.md:286`) — while inbound/outbound use `indexed=0`. Surprising for a mail-like
protocol, and worth an explicit WISHMail decision.

**`connection_request`** (`index.md:478-494`) — fields `p`, `op`, `operator_id` (all
required), `m` (optional). Transaction memo `hcs-10:op:3:1` (`index.md:487`).

```json
{
  "p": "hcs-10",
  "op": "connection_request",
  "operator_id": "0.0.789101@0.0.654321",
  "m": "Requesting connection."
}
```

**`connection_created`** (`index.md:500-520`) — adds `connection_topic_id` (string, req),
`connected_account_id` (string, req), `connection_id` (**number**, req). Transaction memo
`hcs-10:op:4:1` (`index.md:522`).

```json
{
  "p": "hcs-10",
  "op": "connection_created",
  "connection_topic_id": "0.0.567890",
  "connected_account_id": "0.0.654321",
  "operator_id": "0.0.789101@0.0.123456",
  "connection_id": 12345,
  "m": "Connection established."
}
```

> "| `connection_id` | The unique identifier corresponding to the original `connection_request` sequence number on the inbound topic. | `number` | `12345` | ✅ |"
> — `docs/standards/hcs-10/index.md:519`

So `connection_id` is the inbound topic's sequence number of the request — a JSON number in
the message, but interpolated as text into the connection topic memo (`index.md:290`).

**`close_connection`** (`index.md:668-690`) — `p`, `op`, `operator_id` required; `reason`
and `m` optional. Transaction memo `hcs-10:op:5:3` (`index.md:682`). See C-6.

```json
{
  "p": "hcs-10",
  "op": "close_connection",
  "operator_id": "0.0.789101@0.0.123456",
  "reason": "Conversation completed",
  "m": "Closing connection."
}
```

**`transaction`** (`index.md:696-714`) — `p`, `op`, `operator_id`, `schedule_id` (string),
`data` (string) all required; `m` optional. No transaction memo defined (C-5).

```json
{
  "p": "hcs-10",
  "op": "transaction",
  "operator_id": "0.0.789101@0.0.123456",
  "schedule_id": "0.0.987654",
  "data": "Transfer 10 HBAR to account 0.0.111222",
  "m": "Scheduled transaction for your approval."
}
```

> "The recipient of this operation can approve the scheduled transaction by signing it with their Hedera account key through a ScheduleSignTransaction. No additional message is required in the HCS-10 protocol, as the transaction execution on Hedera serves as confirmation."
> — `docs/standards/hcs-10/index.md:716`

**1 KB / chunking guidance.** HCS-10 defines **no chunking of its own**. It defines exactly
one size rule, and delegates:

> "For messages exceeding 1KB in size, use the HCS-1 standard to store the content and reference it directly in the connection topic message using the Hashgraph Resource Locator (HRL) format defined in [Definitions](../../definitions.md#hashgraph-resource-locator):"
> — `docs/standards/hcs-10/index.md:761`

> "When handling large messages:
>
> 1. Store the content as an HCS-1 file
> 2. In the message operation, use the direct HRL format `hcs://1/topicId` in the `data` field
> 3. Recipients retrieve the content by resolving the HCS reference"
> — `docs/standards/hcs-10/index.md:773-777`

The only four size mentions in the whole document are `index.md:653, 761, 1006, 1018` — all
"1KB", all pointing at HCS-1. **OPEN:** "1KB" is never given in bytes, never stated with
RFC-2119 force (it is "use", not "MUST use"), and is never reconciled with Hedera's actual
per-message transaction limit. Whether the threshold is 1000 or 1024 bytes, and whether it
measures `data` or the serialized envelope, is undetermined by the text.

### 3.2 HCS-11 — account memo and profile fields

**Memo format** (`docs/standards/hcs-11.md:103-105`):

```
hcs-11:<protocol_reference>
```

> "Where:
>
> - `hcs-11` is the protocol identifier
> - `<protocol_reference>` can be either:
>   - A [Hashgraph Resource Locator (HRL)](../definitions.md#hashgraph-resource-locator) for HCS protocols
>   - Other URI formats for non-HCS protocols (IPFS, Arweave, HTTPS)"
> — `docs/standards/hcs-11.md:107-112`

**May the HRL point at an HCS-2 registry rather than an HCS-1 file? — Yes, explicitly.**
It is given as a valid example, and HCS-2 is named in the supported-protocol list:

> "```
> # HRL references (HCS protocols)
> hcs-11:hcs://1/0.0.8768762
> hcs-11:hcs://2/0.0.8768762
> hcs-11:hcs://7/0.0.8768762
> ```"
> — `docs/standards/hcs-11.md:116-120`

> "1. Profile data can be referenced using various protocols:
>    - HCS protocols with [HRL](../definitions.md#hashgraph-resource-locator) format:
>      - [HCS-1](./hcs-1.md): Static file storage
>      - [HCS-2](./hcs-2.md): Topic registry standard"
> — `docs/standards/hcs-11.md:129-132`

Caveat for WISHMail: this is permission by example and by list, not an RFC-2119 MUST/MAY
clause, and the resolution procedure for the HCS-2 case (which registry entry is "the"
profile — latest `register`? the non-indexed head?) is **OPEN** in HCS-11. Note also that
HCS-10 assumes the HCS-1 shape when it says "The agent's profile stored using HCS-1 and
referenced in the account memo" (`hcs-10/index.md:785`).

**Is `properties` a free extension point? — Yes, and it says so in as many words:**

> "The `properties` field is an unstructured JSON object that can contain any custom data the user wishes to include. There are no predefined fields or structure for this object, allowing for maximum flexibility and extensibility. Users can store any relevant information that isn't covered by the standard fields."
> — `docs/standards/hcs-11.md:217`

Schema rows: `| properties | object | No | Additional unstructured profile properties |`
(`hcs-11.md:155`) and `| any[] | properties | object | No | Optional properties of any kind |`
(`hcs-11.md:215`). This is the sanctioned place to hang WISHMail-specific profile data.

**Field names** — all confirmed, all in the Base Profile Schema table (`hcs-11.md:144-159`):

> "| uaid | string | Yes | UAID (uaid:did:...) for the subject. Other DIDs may be linked via DID Document `alsoKnownAs`. |"
> — `docs/standards/hcs-11.md:150`

> "| inboundTopicId | string | No | [HCS-10](/docs/standards/hcs-10) inbound communication topic |
> | outboundTopicId | string | No | [HCS-10](/docs/standards/hcs-10) action record topic |"
> — `docs/standards/hcs-11.md:156-157`

Exact casing: `uaid` (lowercase), `inboundTopicId`, `outboundTopicId` (camelCase). Note
`uaid` is **Required** while the two topic IDs are **not** — an HCS-11 profile is valid with
no HCS-10 channels at all. The example value in the `uaid` row is `uaid:did:...`,
corroborating C-1. Confirmed from the HCS-10 side too:

> "The profile JSON contains `inboundTopicId` and `outboundTopicId` (see [HCS-11 Profile Integration](#hcs-11-profile-integration))."
> — `docs/standards/hcs-10/index.md:313`

### 3.3 HCS-14 — grammars and Hedera `nativeId`

Grammars quoted in full under **C-1**. Parameter structure:

> "```
> uaid:{target}:{id};uid={uid};registry={registry};proto={protocol};nativeId={nativeId};domain={domain}
> ```"
> — `docs/standards/hcs-14/index.md:179`

> "- `target` = Either \"did\" or \"aid\""
> — `docs/standards/hcs-14/index.md:184`

Id derivation:

> "- For `uaid:aid`, `{id}` denotes the Base58-encoded identifier hash (SHA‑384 of canonical JSON; see Hash Generation).
> - For `uaid:did`, `{id}` denotes the method‑specific identifier of the base DID after sanitization (no new hash is computed)."
> — `docs/standards/hcs-14/index.md:165-166`

Three constraints WISHMail must honour when emitting UAIDs:

> "- Parameters are ordered with `uid` first, followed by `registry`, `proto`, `nativeId`, and `domain` (if present). Implementations shall preserve this order when emitting UAIDs."
> — `docs/standards/hcs-14/index.md:196`

> "The `uid` parameter is required and shall be \"0\" if not applicable."
> — `docs/standards/hcs-14/index.md:197`

> "- The UAID id portion shall not contain `;`. Implementations shall strip everything after the first `;`, `?`, or `#` from the base DID’s method‑specific identifier when forming the UAID id."
> — `docs/standards/hcs-14/index.md:198`

**How a Hedera account appears as `nativeId` — CAIP-10, `hedera:<network>:<account>`:**

> "- `nativeId` = Protocol's native unique identifier (use CAIP‑10 where applicable, e.g., `eip155:<chainId>:<address>` for EVM accounts, `hedera:<network>:<account>` for Hedera; domain for A2A/NANDA)"
> — `docs/standards/hcs-14/index.md:187`

> "- For chain‑based protocols that define CAIP namespaces, nativeId MUST use the appropriate CAIP‑10 account identifier for that chain namespace."
> — `docs/standards/hcs-14/index.md:372`

Worked instances: `"nativeId": "hedera:testnet:0.0.123456"`
(`index.md:469, 694, 705, 871`) producing
`uaid:aid:QmX4fB9XpS3yKqP8MHTbcQW7R6wN4PrGHz;uid=0;registry=hol;nativeId=hedera:testnet:0.0.123456`
(`index.md:876`).

The HCS-10 binding rule — directly load-bearing for WISHMail:

> "- **HCS‑10**: Inbound/outbound topic IDs belong in the HCS‑11 profile (`inboundTopicId` / `outboundTopicId`). In the UAID, set `nativeId` to the CAIP‑10 account for the operator and set `uid` to the account’s operator_id when available, defined as `inboundTopicId@accountId`. If the account has not yet registered an HCS‑11 profile (no topics), implementations MAY temporarily set `uid` to the Hedera account ID and update it to the operator_id once available."
> — `docs/standards/hcs-14/index.md:296`

AID hash inputs (the determinism surface):

> "- Hash computed from canonical JSON of 6 agent fields (registry, name, version, protocol, nativeId, skills)"
> — `docs/standards/hcs-14/index.md:224`

### 3.4 HCS-2 — `register` fields and registry topic memo

**Register operation** (`docs/standards/hcs-2.md:89-97`):

```json
{
  "p": "hcs-2",
  "op": "register",
  "t_id": "TOPIC_ID_TO_REGISTER",
  "metadata": "OPTIONAL_METADATA (HIP-412 compliant)",
  "m": "OPTIONAL_MEMO"
}
```

Registry field definitions (`hcs-2.md:64-70`) — note `metadata` is **not** in this table (C-7):

> "| `p` | Protocol used by the registry, typically `hcs-2` for this standard. | `hcs-2` |
> | `op` | Operation being executed (register, delete, update). | `register` |
> | `t_id` | Topic ID where the registry information is stored. | `0.0.1234567` |
> | `uid` | Sequence number for files or states within the registry. | `42` |
> | `m` | Optional metadata providing additional context. | `Update for Q2 release` |"

> "`m` - memo is restricted to 500 characters"
> — `docs/standards/hcs-2.md:72`

`Register` is finalized and usable in non-indexed topics (`hcs-2.md:80`); `Migrate` is
**not** finalized (`hcs-2.md:81`); `Delete` and `Update` are **not** usable in non-indexed
topics (`hcs-2.md:82-83`).

**Registry topic memo format** (`docs/standards/hcs-2.md:209`):

```
[protocol_standard]:[indexed]:[ttl]
```

> "| Indexed enum | Description |
> | `0` | The topic id is indexed, and all messages should be read |
> | `1` | The topic id is not indexed, and only the last message should be used to determine state / topic data |"
> — `docs/standards/hcs-2.md:217-220`

Worked example (`hcs-2.md:224`): `hcs-2:0:60`

Transaction memo for analytics (`hcs-2.md:228-232`) — **SHOULD**, not MUST, unlike HCS-10:

> "To support downstream analytics and align with standards such as [HCS-16](./hcs-16.md), every transaction that appends an entry to an HCS-2 registry **SHOULD** include a structured memo:
> ```
> hcs-2:op:<operationEnum>:<registryType>
> ```"

### 3.5 HCS-13 — HRL and register shape

**HRL confirmed**, both forms (`docs/standards/hcs-13.md:232, 238`):

```
hcs://13/[topicId]
hcs://13/[topicId]#[sequenceNumber]
```

> "- `hcs://13/0.0.123456` - References the latest version of the schema
> - `hcs://13/0.0.123456#42` - References version 42 of the schema (sequence number 42)"
> — `docs/standards/hcs-13.md:242-243`

Note the spec writes the placeholder as `[topicId]`/`[sequenceNumber]`; the brief's
`hcs://13/<topicId>#<sequenceNumber>` is the same grammar in different brackets, and the
fragment is a **sequence number**, not a version string.

**Register op — there are two distinct shapes**, and they differ by `p`:

Schema registration into an HCS-2 topic, `p: "hcs-2"` (`hcs-13.md:149-160`):

```json
{
  "p": "hcs-2",
  "op": "register",
  "t_id": "0.0.123456", // Topic ID of the HCS-1 file containing the schema
  "metadata": {
    "name": "UserProfile",
    "description": "Standard user profile schema"
  },
  "m": "Initial schema definition"
}
```

Discovery-registry registration, `p: "hcs-13"` (`hcs-13.md:193-205`):

```json
{
  "p": "hcs-13",
  "op": "register",
  "t_id": "0.0.123456", // Topic ID of the HCS-2 topic managing the schema
  "metadata": {
    "author": "0.0.789012",
    "description": "Standard user profile schema",
    "tags": ["profile", "user", "identity"]
  },
  "m": "Initial schema registration"
}
```

`t_id` means different things in the two — HCS-1 file topic vs HCS-2 managing topic — per
the inline comments quoted above. See C-7 on the `metadata` object/string conflict.

### 3.6 HCS-1 — file-topic memo and chunk shape (for §9.2's profile read)

**Memo format** (`docs/standards/hcs-1.md:56`):

```
[hash]:[algo]:[encoding]
```

> "- [hash] is the SHA-256 hash of the file being uploaded before any compression
> - [algo] is the compression algorithm being used, for example, `zstd` or `brotli`
> - [encoding] is the encoding used to store the compressed file, for example, `base64`"
> — `docs/standards/hcs-1.md:58-60`

Worked example (`hcs-1.md:64`):
`532eaabd9574880dbf76b9b8cc00832c20a6ec113d682299550d7a6e0f345e25:zstd:base64`

**The hash is of the plaintext, before compression.** A verifier must decode and decompress
before hashing.

**Topic validity is key-shaped and enforceable** — relevant if WISHMail treats an HCS-1
profile read as trusted:

> "- include a Submit Key. HCS-1 Topics without a Submit Key will automatically be marked as invalid files, and will be ignored.
> - NOT include an Admin Key. HCS-1 Topics with an Admin Key will automatically be marked as invalid files, and will be ignored. This ensures that data cannot be deleted, reducing risk for all participants in the protocol."
> — `docs/standards/hcs-1.md:48-49`

**Chunk message shape** (`docs/standards/hcs-1.md:104-109`):

```json
{
  "o": 0,
  "c": "base64-encoded-chunk"
}
```

> "3. The final base64 string should chunked into segments no greater than 1024 bytes. Each chunk is encapsulated in a JSON object with two attributes:
>
> - `o`: The order index indicating the chunk's sequence in the overall file.
> - `c`: The chunk's content, a substring of the base64-encoded file. The first chunk aka, `o = 0` should include a data prefix for the mime type."
> — `docs/standards/hcs-1.md:92-95`

Data prefix format (`hcs-1.md:97-100`): `data:[mimeType];base64`, e.g. `data:image/png;base64,`

Reassembly is order-index driven, not sequence driven:

> "Each chunk is uploaded to a Hedera Consensus Service topic as an HCS message. Keep in mind that because of the `o` property in the JSON schema, the sequence number that the chunk is uploaded in does not matter. This enables uploading many chunks in parallel."
> — `docs/standards/hcs-1.md:113`

> "To display the data, the application retrieves all chunk messages from the specified HCS topic. Chunks are sorted by their order index (`o`) and concatenated based on their content (`c`). The combined base64 string is then decoded back into binary data for display."
> — `docs/standards/hcs-1.md:117`

Compression is `zstd`, recommended level 10 (`hcs-1.md:85-89`); `brotli` also listed
(`hcs-1.md:71`); only `base64` encoding is supported (`hcs-1.md:77`).

Note the "1024 bytes" here is the HCS-1 chunk bound and is stated as "should", not MUST —
a different number from HCS-10's "1KB" delegation threshold, which is why the OPEN in §3.1
matters.

---

## 4. RUNNING HASH BYTE ORDER (topicRunningHashVersion 3)

**Not in `hiero-mirror-node`** — see **C-3** for the negative result with file/line evidence.
FETCHED — https://github.com/hiero-ledger/hiero-mirror-node @ `219ffd334c7a8f9e68b663b6159c4d08278b03d7`.

The algorithm lives in the consensus node.

FETCHED — https://raw.githubusercontent.com/hiero-ledger/hiero-consensus-node/main/hedera-node/hedera-consensus-service-impl/src/main/java/com/hedera/node/app/service/consensus/impl/handlers/ConsensusSubmitMessageHandler.java
(fetched 2026-09-06 from `main`; latest commit touching this path per the GitHub API:
`668fb11ccbcc228fa21468a77b295e49e48012b2`, 2026-08-12T11:35:30Z,
`fix: use checked arithmetic custom-fee totals in ConsensusSubmitMessage (#26757)`).

> "    public static final long RUNNING_HASH_VERSION = 3L;"
> — `ConsensusSubmitMessageHandler.java:88`

`ConsensusSubmitMessageHandler.java:274-296`, verbatim:

```java
        final var boas = new ByteArrayOutputStream();
        try (final var out = new ObjectOutputStream(boas)) {
            out.writeObject(CommonPbjConverters.asBytes(runningHash));
            out.writeLong(RUNNING_HASH_VERSION);
            out.writeLong(payer.shardNum());
            out.writeLong(payer.realmNum());
            out.writeLong(payer.accountNumOrElse(0L));
            out.writeLong(topicId.shardNum());
            out.writeLong(topicId.realmNum());
            out.writeLong(topicId.topicNum());
            out.writeLong(effectiveConsensusNow.getEpochSecond());
            out.writeInt(effectiveConsensusNow.getNano());

            /* Update the sequence number */
            topicBuilder.sequenceNumber(++sequenceNumber);

            out.writeLong(sequenceNumber);
            out.writeObject(noThrowSha384HashOf(message));
            out.flush();
            runningHash = Bytes.wrap(noThrowSha384HashOf(boas.toByteArray()));
```

### Byte order answer

**All integer fields are big-endian.** The stream is `java.io.ObjectOutputStream`, whose
`writeLong`/`writeInt` are defined big-endian ("network byte order") by the Java Object
Serialization Specification — there is no endianness switch on the class.

| Field | Method | Width | Byte order |
| --- | --- | --- | --- |
| `RUNNING_HASH_VERSION` (= 3) | `writeLong` | 8 | big-endian |
| payer `shardNum` | `writeLong` | 8 | big-endian |
| payer `realmNum` | `writeLong` | 8 | big-endian |
| payer `accountNum` | `writeLong` | 8 | big-endian |
| topic `shardNum` | `writeLong` | 8 | big-endian |
| topic `realmNum` | `writeLong` | 8 | big-endian |
| topic `topicNum` | `writeLong` | 8 | big-endian |
| consensus `seconds` | `writeLong` | 8 | big-endian |
| consensus `nanos` | **`writeInt`** | **4** | big-endian |
| `sequenceNumber` | `writeLong` | 8 | big-endian |

Order is exactly as listed: previous running hash, version, payer shard/realm/num, topic
shard/realm/num, seconds, nanos, sequence number, then SHA-384 of the message.
Shard/realm/num are three separate 8-byte longs (not a packed struct), and **nanos is the
only 4-byte field** — a natural place to get a reimplementation wrong.

**Reimplementation trap.** `writeObject(byte[])` is *not* a raw byte write. It emits Java
serialization framing — stream magic and version at stream start, plus a `TC_ARRAY` class
descriptor for `[B` and a length — around the previous running hash and around the message
digest. A from-scratch verifier that concatenates raw bytes will not reproduce these hashes;
it must reproduce the `ObjectOutputStream` envelope byte-for-byte.

The final digest is SHA-384 over the whole serialized buffer
(`noThrowSha384HashOf(boas.toByteArray())`), and the message contributes as
`noThrowSha384HashOf(message)` — a hash, not the message itself. The sequence number is
incremented **before** being written (`++sequenceNumber`), so the hash commits to the new
sequence number, not the prior one.

**OPEN.** Two things I did not settle:

1. `RUNNING_HASH_VERSION = 3L` is a literal here with no v1/v2 branch in this file. Where
   versions 1 and 2 are computed — and what the mirror node's `topicRunningHashV2AddedTimestamp`
   config (`importer/src/main/java/org/hiero/mirror/importer/ImporterProperties.java:69`)
   keys off — was not traced.
2. This was read from `main` via raw.githubusercontent, not from a full clone, so the file is
   pinned by the GitHub API's last-commit-for-path rather than by a `git rev-parse HEAD` I ran
   myself. Re-pin with a clone if this matters for the affidavit.

---

## OPEN ITEMS

| # | Question | Why it is open |
| --- | --- | --- |
| O-1 | HCS-10's "1KB" threshold: 1000 or 1024 bytes? measured on `data` or on the envelope? | Never given in bytes, never RFC-2119 (`hcs-10/index.md:653, 761`). Differs from HCS-1's 1024-byte chunk bound (`hcs-1.md:92`). |
| O-2 | HCS-10 defines no chunking of its own | Only delegation to HCS-1 exists (`hcs-10/index.md:773-777`). Nothing covers a message too large for one HCS-10 envelope but not warranting an HCS-1 file. |
| O-3 | Resolution procedure when an `hcs-11:` memo points at an HCS-2 registry | Permitted by example (`hcs-11.md:119, 132`) but which registry entry constitutes "the profile" is unspecified. |
| O-4 | Transaction memo for the HCS-10 `transaction` op | C-5. No enum, no memo, yet `MUST` at `hcs-10/index.md:330`. |
| O-5 | HCS-10 `type` enum — which reading applies where | C-4. Two conflicting definitions in one document. |
| O-6 | `metadata` type in an HCS-2 `register` | C-7. String in HCS-2, object in HCS-13. |
| O-7 | HCS-11 revision label: 1.1, 1.0.1, or v1.0.1? | Three labels for one revision (`hcs-11.md:11, 17`; commit `a3d35f0` message). |
| O-8 | Where topicRunningHashVersion 1 and 2 are computed | §4 OPEN-1. |
| O-9 | hol.org's rendered standards are unpinned | `sync-hiero-standards.js:19` tracks branch `main` with no commit pin; the site shows whatever hiero `main` held at last build. |
| O-10 | Whether `Draft` status blocks WISHMail's dependence | Five of six pinned standards are `Draft` (only HCS-1 and HCS-2 are `Published`), and HCS-4's change-management rules (`hcs-4.md:229-236`) permit normative change to Drafts by PR. |

---

## APPENDIX — provenance

All repos read 2026-09-06 into a session scratchpad, read-only, never modified:

| Repo | URL | Clone | HEAD read at |
| --- | --- | --- | --- |
| hiero-consensus-specifications | https://github.com/hiero-ledger/hiero-consensus-specifications | full | `7046156c85eaaf29e149fa10232964d33a58d34e` (2026-08-31, `ci: add CodeQL analysis and Dependabot for GitHub Actions (#39)`) |
| hcs-improvement-proposals | https://github.com/hashgraph-online/hcs-improvement-proposals | full | `bd508bad70e3a5a660b149d7a183dd30b814d29f` (2026-09-02, `fix(docs): make HCS-25 signals + adapters catalogs reachable in docs nav (#284)`) |
| hiero-mirror-node | https://github.com/hiero-ledger/hiero-mirror-node | `--depth=1 --filter=blob:none` | `219ffd334c7a8f9e68b663b6159c4d08278b03d7` (2026-09-05, `Bump the dependencies group across 2 directories with 1 update (#14251)`) |
| hiero-consensus-node | raw.githubusercontent, `main`, single file | n/a | path last-commit `668fb11ccbcc228fa21468a77b295e49e48012b2` (2026-08-12) |

Line numbers cite the **raw git blob** (LF), extracted via `git cat-file blob HEAD:<path>`,
not the CRLF working-tree checkout. See the Method note in §1.

No secrets were read, written, or transmitted. No repository was modified. No code was written.
