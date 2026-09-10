# Changelog

Format: Keep a Changelog. Versions are the specification's (§1.7): `major.minor` on the wire, `patch` for text and tests. Attribution: **[S]** Sonic (human), **[C]** Claude in chat (drafting, ledger), **[CC]** Claude Code (reconnaissance, agentic). Decisions are `D-n` in `spec/CONFORMANCE_TESTS_v0_5.md` §B; tests are `T-<P-ID>-<n>` in §A.

## [Before Gate One, second pass] — 2026-09-09 — the fee an agent can afford, and the first socket

**Not a specification version.** Nothing signed.

- **`register_agent` declares 0.02 ℏ, not 2 ℏ.** It is the only submission whose payer holds almost nothing — the 0.05 ℏ
  the purchase funds — and it was declaring forty times that. Whether a solvency precheck compares a balance to the
  **estimated** fee or the **declared** maximum is a fact this project cannot cite: the 2026-09-08 probe’s
  `INSUFFICIENT_TX_FEE` is a different check, and the HIP-542 probe observed the bought account only as a signer. **So the
  maximum is declared below the balance and both readings are safe** — thirteen times a measured cost of ~0.0015 ℏ. The
  verb also refuses before submitting if the balance is under the declared maximum.
- **`npm run check:exchange` — the first thing in this project to open a socket.** 49 assertions over real Streamable
  HTTP on loopback, the counter’s own server and the MCP SDK’s own transports, against a modelled ledger. **It found a
  defect on its first run**: MCP requires a tool declaring an `outputSchema` to return `structuredContent` on any result
  it does not flag as an error, so the carry leg and the settled-but-carrying leg — written as plain successes — would
  have failed at the client mid-purchase, with three topics already created. Each now carries its payload in `_meta`
  under a state code. Recorded in L-5’s neighbourhood and in the gate report.
- **The receipt wait has a ceiling and a named stop**: thirty seconds, then the reference is reported OUTSTANDING and
  resumable from either side, because an open wait after a settled transfer is indistinguishable from a hang.
- **An account that auto-associates is not made to associate.** The two demo Operators were created with
  `maxAutomaticTokenAssociations = -1` precisely so §4.4’s stamp needs no association transaction; `generate_mailbox` now
  reads that field and submits nothing, saying so. The explicit path stays for a real operator’s own wallet.
- **Balances read from the mirror before the gate.** `0.0.8641261` holds 3229.72 ℏ against a floor of 382 ℏ stated in
  declared terms; the two Operators hold 35 ℏ each against ~15.1 ℏ of purchase; the treasury holds 10,000 `$POSTAGE`
  against 24. **Nothing needs topping up.**
- **One observation for a test not yet written**: a receipt’s `price.amount` is the normalised decimal (`"1"`), not the
  literal the schedule spelled (`"1.00"`). T-P11-4 must compare fixed-point values, not strings.
## [Before Gate One] — 2026-09-09 — the payer role named, two demo wallets, and ENTITIES.md

**Not a specification version.** No sentence, no schema, no wire string and no test changed. Two `AccountCreate`
transactions were signed on `hedera:testnet`, and they are **funding and not a sale**.

### Renamed — the payer role, not the Operator (§3.3)

§3.3 fixes an *Operator* as "the human or organization behind an agent". The repository was calling the Postmaster’s
payer **account** one, and since D-168 a Correspondent’s own payer appears in the same call. Two roles under one word is
how a key gets read from the wrong side. `POSTMASTER_PAYER_ID` / `POSTMASTER_PAYER_DER_KEY` in the environment,
`postmasterPayerId` / `postmasterPayer` in the Postmaster’s code, `homePayerId` / `homePayer` / `homeClient` in the
Correspondent’s, `payer` in a Correspondent’s config — which is what §3.5 always called it — and `postmaster payer` as
the role label in the ops record. **HCS-10’s `operator_id` keeps its name**: it is a pinned standard’s field and it names
the agent, not a person. *Operator* survives in prose, in §3.3’s sense, and CLAUDE.md §11 carries the rule.

No consensus impact — identifiers, environment names, and a role label in our own record of who paid.

### Signed — two demo Operators’ wallets, and it is not a sale

`npm run demo:operators` creates one testnet account per demo Operator: a fresh ED25519 key born in the run, an
`AccountCreate` paid by the Postmaster’s payer, 35 ℏ, and `maxAutomaticTokenAssociations = -1` so D-157’s two-hop ring
needs no association transaction. **Nothing touches the price list, the treasury, `$POSTAGE` or the counter**, no receipt
exists, and `app/OPERATIONS.md` records it under "Demo-operator funding". The purchases at Gate One remain the counter’s
first sales.

**The key never leaves its closure.** `bornPayerWallet()` returns a `Signer` and an `install`; the runner holds neither
the key nor its DER string and therefore cannot print, log or persist one (P-13). The key is written **only after** the
mirror readback passes — a run that dies before that leaves an abandoned account rather than a config naming an account
nobody verified. Run of record: `0.0.10450879` and `0.0.10450880`.

### Added — `ENTITIES.md`, generated

Every entity on `hedera:testnet` with a HashScan link, in three sections: **what operates** — treasury and `$POSTAGE`, the
price topic with both published schedules, the Postmaster-agent’s six topics, and the fourteen registered schemas with
their `schemaRef` and digest; **RESIDUE — NOT OPERATING** — fifteen rows, every probe leftover and every superseded
entity, each with the reason it is on the ledger and the reason it is not ours; and **DEMO AGENTS**, empty until Gate One.

**It is generated and never hand-edited**, from `app/deployment/hedera-testnet.json` and `spec/pins.json`, and
`npm run check:entities` names the first line that differs. Three `$POSTAGE`-shaped tokens exist on this testnet and
exactly one is the stamp token; a reader should not have to guess which, and a guess about that is a guess about what a
receipt means. The probes’ leftovers moved into the ops record’s `residue` to make the table generable — their reports had
said they were written to no record at all, which was true when there was nowhere to put them.
## [Gate One, re-armed] — 2026-09-09 — §G-19 ruled: the counter pays for the mailbox it sells

**Not a specification version.** No sentence, no schema, no wire string and no test changed; §1.7 has fired and the fourteen
are frozen on consensus. The version stays **0.5.9**. **Nothing was signed.** What changed is that the one thing blocking
Gate One is ruled, and the payer seam CLAUDE.md §11 asked to be built as a seam is exercised at its remote half for the first
time.

### Ruled — D-168, §G-19 closed for reading (a)

**The Postmaster provisions the mailbox it sells** — §4.6’s provisioned path taken as written — so §5.4’s "the entities the
Postmaster created for the holder" is literally true of the receipt and it validates against the schema Step 4 froze. Reading
**(b)**, making `doorbell` and `manifestTopic` optional, is **the more accurate description of what D-159 attempted**, and
is recorded rather than dismissed; it lost on cost, not on truth — the freeze has happened, so it is **0.6** across fourteen
registered schema files and every wire string that names them. (a) needs nothing from the specification and is the path §4.6
named first. It is not a workaround.

### Built — the carry policy (`app/src/counter/`)

- **The provisioner did not move.** `sdk/mailbox.ts` creates the same six rows in the same forced order, signed by the same
  agent key, with the same readbacks, and does not know it is being carried. `Session.payer` has been an injected `Signer`
  since D-157; under a provisioning purchase it is **remote**, and the transaction id names the Postmaster as payer. That is
  §6.1’s carry exactly.
- **The counter decodes the bytes it signs.** `counter/body.ts` reads a `TransactionBody` — on `core/protokey.ts`’s own
  primitives, exported rather than copied — and `counter/carry.ts` pays only for a row of `ops/template.ts` naming this
  holder’s key, an HCS-1 chunk on the file topic it itself paid for, the HCS-2 register entry on the registry it paid for, or
  the account-memo update on the holder’s account setting nothing else. Anything else is refused and no mark is left (§3.5).
  The alternative — parse a whole serialized transaction with the SDK’s getters and sign the body derived from that parse —
  is more comfortable and weaker: it inspects one representation and signs another. `[CC]`
- **Every protobuf field number was probed, not recalled**, off bodies the SDK itself froze, and `check:correspondent`
  re-probes them on every run. `CryptoUpdateTransactionBody.memo` is field **14**; a confident memory says 26.
- **The receipt is issued from the counter’s own readback**, only once every row has landed and the holder resolves under
  §9.2 from the counter’s reader, and validated against the registered schema before it is returned. Until then the reference
  is outstanding and a purchase interrupted between rows is **resumable from either side by reading the ledger** — the
  counter’s record and the agent’s are reconciled from consensus, never from each other.
- **The counter still sees no private key and builds no provisioning body** (P-13, T-P13-1). It receives bytes the agent has
  already signed and decides whether to pay for them.

### Also

- `buy_stamp` with `provision` now does the whole of §4.6’s provisioned path and returns the receipt. `generate_mailbox`
  remains as the **self-provisioned** affordance, for an agent that brings its own account and pays for its own mailbox; its
  tool description says which path it is.
- **A flat carry fee ceiling would have refused the doorbell.** The first design capped a carried body at 2 ℏ; `networks.ts`
  gives a fee-gated topic creation 100 ℏ, observed to fail at 20 (FETCHED 2026-09-08). The ceiling is now per row, read from
  the same file the Correspondent builds the cap from, with `WISHMAIL_CARRY_MAX_HBAR` able only to lower it.
  `check:correspondent` caught this offline, before a transfer. `[CC]`
- **A `--dry-run` that printed its whole report and then hung forever** was the only visible sign that `liveConsensus`
  was building a third `Client` nobody could close. A session now holds exactly two and closes both. `[CC]`
- `core/protokey.ts` moved out of `app/sdk/`: both parties read it now, and a Postmaster module must not import a
  Correspondent one (CLAUDE.md §11).
- `resolveSelf` — §9.2’s two-pass rule on an agent’s own address — moved to `resolve/hcs14.ts`, because the counter runs
  it too before it will issue a receipt.
- The dry run prints **the plan with a payer against every row**, built from `ops/template.ts` itself.
- `npm run check:correspondent` — **105** assertions, no network and no key, up from 53.
## [Gate One] — 2026-09-09 — the Correspondent, the counter, and one thing that cannot be sold

**Not a specification version.** No text changed and no schema changed; §1.7 has fired and the fourteen are frozen on consensus. **Nothing was signed.** What changed is that the vertical slice the demo is now exists as far as the first gate, and one sentence of the specification turned out to be un-buildable as written.

### Built — the Correspondent (`app/sdk/`)

- **A home directory that IS the agent** (D-165): config (the operator's), keystore (the agent's keys, **born once** on first run and loaded ever after), the durable store, and the agent's own record of what it has on consensus. A fresh home is a new agent; an existing home is a returning one. Each agent's entity IDs live there and **never** in `app/deployment/` (CLAUDE.md §11).
- **The payer seam**, as a seam: every submission is built *agent signs, payer signs*, with the payer an injected `Signer`. Today the operator's key from that operator's config; a remote `carry` replaces it later and nothing above `sdk/live.ts` knows which.
- `generate_mailbox` and `register_agent` — §4.6 affordances and **not** among §6.1's six (D-159), marked as such in the tool table so a transport cannot present eight verbs as though the specification defined eight. Both idempotent against **consensus**, never against local state; both refuse loudly and say what they refused.
- **The reader is run on the writer's output before it returns.** `generate_mailbox` does not finish until §9.2's rule, run from a mirror node with nothing configured, answers with the coordinates it just created — and compares them field by field. The Step 3 defect is why.
- The **doorbell watcher**: auto-accepts, creating a lane whose submit key is a threshold of exactly the two agents' keys as **consensus** holds them, with no custom fee. Idempotent from the doorbell itself.
- `sdk/live.ts` — the second implementation of `tools/consensus.ts`, over a mirror node and the SDK, so `send`, `inbox` and `verify` are the code they already are. Its read half takes **no key**, which is P-4 enforced by the type.

### Built — the counter (`app/src/counter/`)

- §14.3's price read **from consensus at every quote**, with the arithmetic in integers and a bundle taken at exactly its count.
- **Two round trips, one purchase** (§14.2): quote → the buyer signs in its own process → settle. The buyer returns a **signature**, not a transaction, which makes "never accept a body it did not build" structural rather than a comparison someone has to remember to run (T-P13-3). The frozen body lives in the durable store, so the exchange survives a restart (T-P11-6) and a replayed reference returns the receipt it already bought (T-P11-5).
- A Streamable HTTP MCP server serving `buy_stamp`, `verify` and `resolve` from `mcp/tools.ts`'s one table. `send`, `inbox` and `ack` are **not** served there: they need the agent's own keys, and the Postmaster holds none (P-13).

### Built — §9.5

- `app/src/resolve/hol.ts`, following the design note. `resolutionProofFor` now takes the rule and the statement as arguments: a manifest that did not say which rule produced it would be replayed under whichever rule the reader guessed (§11.4). `SourceMessage` gained an optional `payer`, because §9.5 decides `blurred` on it — and the resolver **refuses to appraise** where a source cannot supply it rather than assuming.

### Raised — ledger §G-19, and it blocks Gate One's purchase

**A provisioning purchase cannot produce a `StampReceipt` that validates.** §5.4 makes `doorbell` and `manifestTopic` required inside `provisioning` because "the fields after it are the entities **the Postmaster created for the holder**" — and under D-159 as amended the Postmaster creates one entity, the account; the agent creates its own topics afterwards, under its own key. A receipt carrying the line fails its schema; one omitting it contradicts §6.3's "exactly when" and drops `registrationFee`; and §14.3 forbids charging the 2 ℏ with `provision` false. The counter **refuses before signing anything**, reading the required list out of the registered schema so that a 0.6 lifts the refusal by itself. Two candidate answers are in §G-19 and in `OPERATIONS.md` Step 5 §6; one needs no schema change and one is 0.6.

### Also

- **One spelling of D-147's template.** `app/src/ops/template.ts` holds the six rows; `ops/steps.ts` and `sdk/mailbox.ts` both read it. Two provisioners that agreed about a doorbell's fee today and disagreed about its exempt list tomorrow would be the `hcs1File` defect with a permanent artefact at the end of it. `[CC]`
- **One template, three readers** (D-162). `app/src/tools/sentences.json` holds every sentence the log lines, the text block and `narrate()` render; `narrate` is refactored onto it. No sentence implies receipt or delivery — §2.3 reserves *delivery* for the lane and §11.8 forbids reading silence — and `check:correspondent` asserts it.
- **A mirror node's key list is decoded here**, forty lines in `sdk/protokey.ts`, because the alternative is a paid `TopicInfoQuery` that P-4 forbids a Verifier to need, and `@hashgraph/proto` is not in this repository's tree. The first version was wrong and `check:correspondent` caught it: protobuf field numbers are per message, not global. `[CC]`
- **P-13's gate widened to the Correspondent.** `p13:check` now also greps `app/sdk` for the field names key material travels under, permitting only `keystore.ts` and the shipped template.
- `npm run check:correspondent` — 53 assertions, no network and no key. One of them is that the **Postmaster’s own** HCS-11 profile is still byte-identical to the one on consensus: `buildProfile` gained an identity so a Correspondent can carry its own name, HCS-14 hashes that name, and the HCS-1 topic holding the result has no admin key.
- `app/sdk/.env.example` removed. A Correspondent is configured by its **home directory** (D-165) and not by an environment file; `app/sdk/config.template.json` is what the repository ships.

## [Step 4] — 2026-09-09 — the schemas are registered, and frozen

**Not a specification version.** No text changed and no schema changed; what changed is that the fourteen schemas of §18.5 are now **registered under HCS-13 on `hedera:testnet`** and pinned. §1.7: once a minor version's schemas are registered a patch changes no schema, so **from here the smallest field in any of the fourteen is 0.6.**

### Signed

- **Step 4, 56 entities**, four per schema in the order §5.11 and HCS-13 force: HCS-1 file topic (memo the digest, no admin key — D-150), chunks, HCS-2 registry (`hcs-2:0:60`, indexed 0 so an earlier `schemaRef` stays resolvable, D-155), and the `register` entry whose sequence the `schemaRef` pins. All 28 pins in `spec/pins.json` filled from mirror readbacks. Second run: `existing 56`. **All fourteen `schemaRef`s resolved from consensus and compared byte-for-byte to `spec/schemas/` — 14 of 14 match** (T-P9-4, observed).
- **The second `PriceList`, sequence 2** on `0.0.10426551`: 637 bytes, sha256 `14d1ee1b6fec4d5e…`, `provisioning {method: "hbar", unitPrice: "2", registrationFee: "0.05"}` — RECORD (Sonic). Sequence 1 untouched: §14.3's schedule is the sequence of messages. **The provisioned path of §4.6 is sellable for the first time.**
- Cost 9.70 ℏ, on the operator.

### Fixed, and it is why the first run stopped

- **An HCS-1 chunk is one HCS message, wrapper included.** `hcs-1.md:92-95` says a segment is "no greater than 1024 bytes" **and** that each chunk is one HCS message; a single HCS message caps at 1024, and a 1024-byte segment inside `{"o":N,"c":"…"}` is 1037. The two cannot both hold, and the SDK splits silently rather than refusing. Step 4's first run wrote at the standard's bound and its own readback stopped with `Unterminated string in JSON at position 1024`. We now bound the whole message, and `hcs1File` throws rather than emitting a chunk the network would split. Ledger §H records the standard's contradiction.
- **A second copy of the same loop**, in `ops/declaration.ts`, had the identical bug and is collapsed into the one chunker. Neither had ever shown, because every HCS-1 file before Step 4 was one chunk.
- **Residue**: topic `0.0.10448375` holds three half-chunks, carries no admin key, and can never be deleted. Recorded under `residue` with the reason; nothing was ever pinned from it.

### The harness, for the first time

`86 registered · 86 present · 86 selected · 0 passed · 86 failed`, then `report conformance/reports/all.json`, `reportDigest f635da3f…`. **T-P9-2 is satisfied; T-P15-3 is not.** A claim may name no class whose suite did not pass in full, and none did. Registering the schemas made a claim checkable, not true.

## [0.5.9] — 2026-09-09

A patch: **text only**. No schema moves, no wire string moves, no test added, no ADR added. `schemas:plan` is byte-for-byte what 0.5.8 planned.

### Changed

- **§10.2 names the domain of the output digest** (completing D-167, recorded as a dated addendum inside it rather than as a new decision). 0.5.8 said the output is "the coordinates, carried as the digest of their canonical JSON" and stopped — and "the coordinates" is §5.3's `MailCoordinates`, which carries `resolutionProof.hash`, which is computed **over the output**. Read literally the sentence was circular, which is the very thing D-167's own alternatives section says it must not be. The reasoning was in the ADR; it was not in the specification, and the specification is what binds. §10.2 now names the nine **resolved fields** positively — `address`, `profile`, `ledgerTag`, `account`, `doorbell`, `log` where present, `manifestTopic`, `x25519Pub`, `keyEpoch` — with each of the four exclusions given the place it already lives, and §11.4 cites the same nine so the two sentences can be checked against each other. Listing them positively is what lets an implementer of a fifth profile know what to hash from §10 alone.
- **`check:prefreeze` asserts the list against the code** (36 assertions). §10.2's nine and `resolvedFieldsOf`'s output are compared, so a drift between the sentence and the function cannot survive a run — it would be a manifest that hashes correctly to itself and to nothing a Verifier recomputes.

### Added

- **Ledger §G-18, open and unruled, blocking nothing.** §5.3 glosses `resolvedAt` as "query time, **as bound into the proof's inputs**", but §5.2 closes `inputs` at `{digest, locator, snapshot?}` and none of the three is a query clock. §9.2's and §9.5's locators carry a `consensusTimestamp` — the registry **entry's**, not the query's — while §9.3's carries `queryTime` and §9.4's `fetchTime`, which are. **So the two off-consensus profiles satisfy §5.3's phrase and the two consensus ones do not**, and that asymmetry is probably the real finding. The exclusion of `resolvedAt` from the digest is right either way, and §10.2 gives the reason that holds unconditionally: a digest containing the query's clock could never be matched by a replay at another clock.

## [0.5.8] — 2026-09-09

A patch: text and tests within minor version `0.5`. **No wire string changes.** **One schema changes** — `proof` — which a patch permits only because `registeredSchemas` is null (§1.7, D-161). **No test is added**: T-P9-8 is the court for the budget, and T-P6-1 and T-P6-2 are the court for the digest, all three unchanged. The register stays at **86 (81 core + 5 extension)**.

Ledger §G-17 is closed by D-167, and by neither of the two candidates the pre-Step-4 sweep offered.

**Nothing was signed for this patch.**

### Changed

- **The resolution proof carries its output by digest** (D-167). §9.1 requires a manifest to be one HCS message at or under `CHUNK_WIRE_MAX`; §5.2 requires a `meaning.statement` and bounded it nowhere; at a real 168-character UAID the manifest did not fit. What was spending the budget was the coordinates **value** inside `output` — and §5.2 already gave the shape as `{digest} | value`. The resolution proof now carries `{digest}`, the SHA-256 of the canonical JSON of the resolved fields, and never the value. §10.4's and §10.5's outputs are untouched. **The court is unchanged**: §11.4 already required a Verifier to replay the rule and produce coordinates; it now hashes them and compares to `output.digest`, and a mismatch is the failure a value mismatch was, at the same standing. `CHANGED: D-167` on §5.2, §10.2 and §11.4.
- **§9.1 writes the manifest's byte budget down** (D-167). Computed per profile at each profile's own worst case — the largest address its grammar admits, only the endorsements its own rule assigns — the remainders are `hcs14` 131, `hol` 72, `dns` 267, `nanda` 205. **N = 70 bytes** for `meaning.statement` plus any snapshot, and `proof.schema.json` bounds it there. The binding case is `hol` at a UAID with §9.2's locator beside its own, the largest locator this document defines. §9.1's snapshot-to-digest fallback sentence is kept, and what it costs is now stated beside it rather than left to be discovered.
- **§9.2's locator gains `address`** (D-167). Its list did not name the rule's own first input. Harmless while a Verifier could read the address out of the output; fatal once the output is a digest, because a rule that cannot be re-given its input cannot be re-run. It also moves a UAID's 168 bytes from `output` into `inputs.locator`, so the net saving is about 110 bytes rather than 290.
- **`verify`'s replay became real** (D-167). It had stopped at the registry entry — the rule was written against a mirror-node client and a Verifier's `Reader` could not reach the profile file — and it said so in a comment and appraised on a partial replay anyway. Under this ruling the value is recoverable **only** by running the rule to the end, so §9.2's rule now runs over a `ProfileSource`: three reads of public data that both a mirror node and a `Reader` satisfy. One rule, two readers, and they cannot drift.
- **The letter fixture stands up a real HCS-1 profile file.** It had created the file topic and never written a profile into it, because nothing read that far. The reader is what says whether the writer wrote anything (CLAUDE.md §9).
- **Statements shorten.** The resolver's is 68 bytes, the slip's 66 — §10.5's own required words, "expiry is not silence, and nothing is claimed about the recipient", fit with four to spare — and the receipt's 57.

### Added

- **`npm run check:prefreeze` re-measured under the new form**, 35 assertions, exit 0. It now derives §9.1's budget from the profiles themselves and asserts the registered schema's `maxLength` equals it, so the specification's N, the schema's bound and the check cannot drift apart. Wire form, short address / longest address: `hcs14` 725 / 882, `hol` 790 / 790, `dns` 841 / 866, `nanda` 995 / **1042**. Every shape fits but `nanda` at its longest address, 42 over, which §9.1's fallback carries — reported, not trimmed.
- **`app/src/ops/budget.ts`** — §9.1's arithmetic as code, so one calculation feeds the specification's sentence, the schema's bound and the check.
- **ADR D-167.** Ledger §H gains the message-size fetch: `@hashgraph/sdk` 2.81.0 sets `CHUNK_SIZE = 1024` and `getRequiredChunks()` returns 1 at 1024 bytes and 2 at 1025 — observed, not only read — so a §9.1 ceiling above `CHUNK_WIRE_MAX` buys 24 bytes before it must admit `chunkInfo`.
- **The second `PriceList`'s numbers, RECORD (Sonic):** `provisioning {method: "hbar", unitPrice: "2", registrationFee: "0.05"}` — two ℏ flat for the mailbox purchase, the fee funded out of it. Every cost the Postmaster incurs for provisioning is denominated in ℏ, so a flat ℏ price is stable against the rate in a way a USDC-referenced one is not. The schema admits it unchanged: `provisioning` is its own object with its own method, so a flat price sits beside a rate-priced `hbar` method without contradiction. Prepared and **unsigned**.

## [0.5.7] — 2026-09-09

A patch: text and tests within minor version `0.5`. **No wire string changes.** **One schema changes** — `mail-coordinates` — which a patch permits only because `registeredSchemas` is null (§1.7, D-161). **No test is added and no MUST is added**: T-P1-8 already states the requirement the new field makes checkable, which is D-161's shape exactly. The register stays at **86 (81 core + 5 extension)**.

Found by `npm run check:prefreeze`, a new sweep that builds every registered shape the post-freeze build will write — from the specification's own sentences rather than from the code's habits — and validates each against the schema Step 4 would freeze. Four exercises: a rate-priced `StampReceipt` on the `hbar` leg, `MailCoordinates`, one resolution manifest per profile with §9's own locator and snapshot rule for each, and one `EvidenceBundle` carrying a receipt in all four of §5.10's states.

**Nothing was signed for this patch.**

### Changed

- **`MailCoordinates` carries the recipient's manifest topic** (D-166). §5.3 listed `account`, `doorbell` and `log` and stopped, though §9.1's Declaration carries `manifestTopic` and §9.2's rule reads `properties.wishmail.{manifestTopic, x25519Pub, keyEpoch}` — so the resolver had the field in hand, kept two of the three, and dropped the first. Two rules need it. **`send` writes there**: §6.4's step 7 schedules §10.4's submission to *the recipient's* manifest topic, and `coordinates` is all `send` is told about the recipient. **A Verifier reads there**, and this is the half that cannot be worked around: §10.4's MUST is that a receipt is the execution of a scheduled submission to the recipient's manifest topic and T-P1-8 checks exactly that, so a Verifier must know which topic that is — and re-resolving at appraisal answers at its own clock, which §11.6 and P-3 forbid from deciding a standing. Required rather than optional, because an optional field would be a hole that validates. `CHANGED: D-166` on §5.3.
- **The resolver's declaration guard checks all three of §9.2's fields.** It had checked `x25519Pub` and `keyEpoch` and not `manifestTopic` — the same omission, one layer down. A profile whose `properties.wishmail` lacks a manifest topic now resolves to `RESOLVE_NOT_FOUND`, which is what T-P6-3 says should happen, rather than to coordinates with a hole in them.
- **Every resolution proof's hash moves**, because `output` grew. Nothing is published against an old one: no envelope has been assembled on `hedera:testnet`.

### Added

- **`npm run check:prefreeze`** — 31 assertions. A rate-priced `StampReceipt` with the three negative halves §14.3 implies (a rate missing `at`, a rate whose value is a JSON number, a rate carrying an extra field) and a receipt whose `holder` is a public-key alias rather than an account (P-16). One manifest per profile — `hcs14`, `hol`, `dns`, `nanda` — each with §9's own `inputs.locator` shape for that profile, each checked for the snapshot rule §9.1's table fixes (the two consensus profiles carry none, the two off-consensus ones must), each re-hashed after tampering for T-P6-1. One `EvidenceBundle` carrying a receipt in each of §5.10's four states — `acked`, `unclaimed`, `invalid`, `none` — with an invalid receipt leaving the envelope's standing untouched (P-12), a `hol` entry keeping its `blurred`, `observations.agentIdOrder` carrying D-152's report, and the evidence digest unchanged by an observation at another clock (§11.7, T-P3-1).
- **Ledger §G-17, open and unruled: a manifest does not fit in one HCS message for any realistic address.** §9.1 requires a manifest to be one HCS message at or under `CHUNK_WIRE_MAX` = 1000 bytes (T-P9-8, §7.4, D-96); §5.2 requires a `meaning.statement` and bounds its length nowhere; nothing reconciles the two. Measured on the **live** declaration with the 190-character statement the resolver writes: `hcs14` at an account address **997** — fits by three bytes; at a **real 168-character UAID read from the anchor**, **1153**; under §9.2's second form, which T-P6-3 requires to resolve, **1056**; `hol` at that UAID **1056**. The two profiles that MUST carry a snapshot are over at every address. **Emptying the statement brings the UAID case to 963**, so the manifest is not structurally too large — the budget is simply unallocated. Two candidates: **bound `statement`** (a schema change, and it would have to land before Step 4) or **give §9.1 its own ceiling** above `CHUNK_WIRE_MAX`, which a manifest topic never had to borrow since it is not an HCS-10 topic (spec text only). **The code takes neither and trims nothing.**
- **ADR D-166.**

## [0.5.6] — 2026-09-09

A patch: text and tests within minor version `0.5`. **No wire string changes** — the AAD's `v`, the HPKE `info`, the schemas' `$id`s and `spec/pins.json`'s `wireStrings` all stay at `0.5` (§1.7). **Three schemas change**, which a patch permits **only because nothing is registered under HCS-13 yet**: `registeredSchemas` in `spec/pins.json` is null throughout (T-P9-9, 28 unfilled pins), and after Step 4 signs the identical changes would be 0.6. That is the whole reason this patch lands where it does — D-161 ordered the freeze after the last schema change and before the first letter, and this is the last schema change. **One test is added** with the MUST that names it: the register moves from **85 to 86 (81 core + 5 extension)** and the extract-and-diff passes both ways. Nothing conforms — T-P9-2 blocks every claim while any pin is null — so no previously conforming implementation is invalidated.

**Nothing was signed for this patch.** No transaction reached `hedera:testnet` for it. The one signature of this day is the HIP-542 probe, recorded separately in `app/OPERATIONS.md`; it touches no WISHMail entity and creates nothing that survives.

### Changed

- **A proof's canonical location is a topic, and lookup is content-addressed** (D-163, closing ledger §G item 16 for reading (B), corrected). §2.2 defined a canonical location as the *locator* at which the proof's own manifest is found, and §5.2 gave `{ledgerTag, topicId, sequenceNumber}` as what names one message — but §5.1 hashes `meaning` into the proof, §6.2 fixes that hash at `resolve` time, and §6.4 step 2 publishes the manifest **afterwards** with the AAD already binding it. No manifest can carry its own publication locator, and no order of operations fixes it. As ruled: `meaning.uri` names **the topic the manifest is published on** — a **location**, `{ledgerTag, topicId}` — and the manifest there is the message whose body recomputes to the proof's hash. The precise message locator lives only in a **reference**: `rp.u` in the AAD, `resolutionProof.uri` in coordinates, the executed submission for a receipt. Every writer knows its location before it writes — the sender's manifest topic for the resolution proof and the slip, the recipient's for the receipt, which the sender already targets in the `ScheduleCreate`. §9.1's existing "a manifest that recomputes to that hash is the one the envelope meant, whoever published it" stops being a remark about attribution and becomes the lookup rule. `CHANGED: D-163` on §2.2 (×2), §5.2 (×2), §9.1, §10.2, §10.4, §10.5, §11.1 and §11.4, with the reason placed in §11.5's order.
- **`spec/schemas/proof.schema.json`: `meaning.uri` becomes `{ledgerTag, topicId}`**, both required, closed (D-163). The schema had required a `sequenceNumber` that two of the three writers could satisfy only by naming something other than their manifest and the third could not satisfy at all — the receipt named a sequence number nobody can know, since the manifest lands when the recipient signs and the bytes are pre-filled before that; the resolver named an HCS-1 file topic, which has no sequence at all.
- **The registration fee is priced into the purchase** (D-159, amended in place with a dated addendum). §4.6 already permitted the provisioned path to "fund that fee"; ruled that it does. **Step 4 of D-159's order folds into step 2**: the provisioning purchase is **one atomic transaction with three legs** — ℏ from the buyer to the Postmaster for the price, `$POSTAGE` from the treasury to the agent's public-key alias, and the registration fee in ℏ from the Postmaster to that same alias. The account is born holding stamps and exactly one fee, and one act leaves the demo. The agent's ℏ story is unchanged: it holds ℏ once, to sign its own name on the anchor, and never again. `CHANGED: D-159` on §4.6, §5.4 and §14.3.
- **`PriceList` and `StampReceipt` gain `registrationFee?`** (D-159 addendum). The price list publishes what the Postmaster funds before it funds it, as it publishes every other number it charges; the receipt records the amount funded, so a Verifier reading the receipt sees the fee as a leg of the purchase and not as a gift arriving from an account the receipt does not name. Optional in both, because §4.6's permission stays a MAY: a Postmaster that does not fund the fee prices none and records none. T-P11-4 remains the court for both.

### Added

- **T-P6-7** (P-6, VERIFIER) — a manifest whose `meaning.uri` names a topic on which no message recomputes to its hash appraises unverified, with `T-P6-7` among its reasons; the positive half is a manifest reached through a reference whose locator names a message on the topic that manifest's own `meaning.uri` names. Named by the new MUST at §11.1. **Keyed to P-6 and not P-1**: P-6's own sentence is that the proof's manifest is on consensus before the envelope, which is what a failed lookup denies, and every P-1 row of §11.5's table yields *unbound* while this yields *unverified* — a proof nobody can find leaves the envelope bound and its address unappraised.
- **The lookup, in `verify`** — the topic `meaning.uri` names is read for a message whose body recomputes to the proof's hash. The reference took the Verifier to a message; the location is what the proof itself said, and only the second is inside the hash.
- **ADRs D-163, D-164, D-165**, and the dated addendum inside D-159.
- **`register_agent` emits `{p, op, account_id, uaid, t_id, m}`** (D-164). **FETCHED 2026-09-09** from the pinned blob, verified two ways: the pinned HCS-10 text has **no validation section, no "additional properties" sentence, and no prohibition on fields beyond the ones its tables list**; `uaid` appears nowhere in the document at all, and `t_id` only in `migrate`. So we emit the pinned fields, because T-P13-4 reads `account_id`, plus the two the deployed anchor's readers parse. Strict to the pin, legible to the deployed; additive and never a substitute. Ledger §H carries the fetch, with line numbers for the absences as well as the presences.
- **CLAUDE.md §11 gains the persistence rules** (D-165): the Correspondent home directory is the agent's identity; keys are born once; **every provisioning verb is idempotent against consensus, not against local state**, so a wiped local file never rings a second doorbell or submits a duplicate registration — which §9.5 would answer with `vague`; lanes are reused, never re-rung. The resolver is the reader that the writer is built with.
- **The HIP-542 probe, signed and run**, with act 2 extended to carry both legs of the purchase's shape. Its run of record is in `app/OPERATIONS.md` under its own heading, with the mirror JSON.

## [0.5.5] — 2026-09-09

A patch: text and tests within minor version `0.5`. **No wire string changes** — the AAD's `v`, the HPKE `info`, the schemas' `$id`s and `spec/pins.json`'s `wireStrings` all stay at `0.5` (§1.7). **One schema changes**, which a patch permits **only because nothing is registered under HCS-13 yet**: §1.7 says a patch "changes no wire string, and once a minor version's schemas are registered it changes no schema", and `registeredSchemas` in `spec/pins.json` is null throughout (T-P9-9, 28 unfilled pins). After Step 4 signs, the identical addition would be 0.6 — which is why D-161 orders the freeze *after* this patch and *before* the first letter. **Two tests are added**, each with the MUST that names it: the register moves from **83 to 85 (80 core + 5 extension)** and the extract-and-diff passes both ways. Nothing conforms — T-P9-2 blocks every claim while any pin is null — so no previously conforming implementation is invalidated, which is what §1.7 measures a minor version by (D-134's and D-146's reasoning).

**Nothing was signed for this patch.** No transaction reached `hedera:testnet`. The sixteen entities of 2026-09-08 stand unchanged.

### Changed

- **The sender always signs the ring; who pays is the sender's choice** (D-157, closing ledger §G item 14 as a synthesis and not for either of its readings). §6.4 step 1 had the Postmaster submit the connection request; §4.4's own MUST fixes only that the doorbell carries a HIP-991 fee of one stamp collected by the treasury; and the 2026-09-08 probe observed that HIP-991 debits the **transaction payer** (ledger §H), so "who submits" is "whose stamp is spent". As amended: the sender signs, and the payer is the sender's — the Postmaster by default and what the reference Correspondent uses. §4.4's transfer-then-ring sentence generalizes from "the Postmaster" to "the payer": one hop when the sender pays for itself, two when it borrows, **one stamp to the treasury either way**. **D-47 is partially superseded** — the Postmaster is the default payer, not the required one; the half that stands is that it holds no agent key, ever. F-7 now reads "for every submission", and L-5 is narrowed to a first contact whose payer the sender borrows. `CHANGED: D-157` on §4.4, §6.1 and §6.4.
- **The Postmaster's own surface is named, and `carry` with it** (D-157). §6.1 gave the tool table and §1.4 said the Postmaster "implements the service side of `buy_stamp`, `send`, `verify`" without saying what crosses the wire for `send`. It is **carry**: the Postmaster accepts transaction bodies an agent signed whose transaction identifier names the Postmaster as payer, checks them against a policy it publishes, adds the payer signature, submits, and returns the consensus reference — §14.2's HBAR-leg mechanism made general, seeing a signed body and never a plaintext (P-13). It is **not** a seventh verb: it acts on transactions rather than envelopes and no class is tested against it. The reference Postmaster's carry policy is stated as the reference's and not as a MUST.
- **A Verifier reads orphans from the treasury, filtered to senders in scope** (D-160, closing ledger §G item 15 for reading (a)). §5.10 requires `orphans` in every bundle and F-3 defines one as postage affixed where no chunk ever lands — but §11.2's ingestion table reached a settlement only through `hdr.st`, a field of a chunk that by definition does not exist. §11.2 gains the row: **the treasury's inbound transfers in the stamp token over the window**, found from the stamp token's treasury (§1.6's pin; §14.3's `PriceList`), in the window by its own consensus timestamp because it is on no topic. It is the one row not named by something already read, and the prose says why it has to be. **Filtered** to settlements whose `from` is a lane party or a reconciled `settlement.from`, which is also what keeps P-3 honest: an unfiltered treasury read makes a bundle a function of the whole ledger's traffic rather than of the scope. `CHANGED: D-160` on §11.2. **No schema change** — `orphans` is already `[Settlement]`.
- **Provisioning has one order, and two affordances that are not verbs** (D-159). §4.6 named the acts and not their sequence, and the sequence is HCS-10's rather than ours: topics → profile → account memo → registration, because `register` names an account and a reader reaches the agent through that account's memo (§9.5), so registering first lists a box that is not there. The reference implementation offers `generate_mailbox` and `register_agent` beside the six tools; **neither is added to §6.1's six and neither is on the conformance surface** — T-P15-4 requires the six to be identical across a release's transports, not that a release offer only six. §4.6 also gains the sentence tying "fund exactly one registration fee and no more" to T-P13-4, which requires the registration's payer and `account_id` to be the same account. `CHANGED: D-159` on §4.6.
- **`buy_stamp` takes `provision`, and `StampReceipt` records it** (D-161). §4.6's Postmaster-provisioned path is priced on consensus (§14.3's `provisioning` entry) and §6.3's signature had no way to ask for it, so the receipt could not witness what was bought or what the agent received. `buy_stamp(count, payment, holder, provision = false)`; `StampReceipt` gains an optional `provisioning {price, account, doorbell, log?, manifestTopic, declRegistry?, profileFile?}` — which is exactly what §4.6 promises the agent gets, **coordinates and no secret** (P-13). Presence is held by the tool and not by the schema, as `rate`'s is, because the receipt carries neither the request that asked for it nor the method that priced it; the schema's `$comment` says so. **No new `TOOL_REASON`**: a Postmaster publishing no provisioning price refuses under `STAMP_METHOD_UNSUPPORTED`, stated as a precondition. `CHANGED: D-161` on §5.4 and §6.3.

### Added

- **T-P2-4** (P-2, POSTMASTER) — a Postmaster refuses at carry, and submits nowhere, a connection request bearing only its own signature. The mirror of T-P13-3 on the purchase leg: there the buyer's signature over the body makes the purchase the buyer's; here the agent's signature makes the ring the agent's, and the Postmaster's own signature is a payment and never an authorship. Named by the new MUST at §6.1.
- **T-P3-6** (P-3, VERIFIER) — a fixture in which a sender in scope affixes postage under a `wishmail:` memo and posts no chunk against it carries that settlement under `orphans`, every reconciled envelope's state and standing unchanged, and a same-window settlement from an account not in scope is not reported. Named by the new MUST at §11.2.
- **`send` validates the attempted-delivery slip against its own registered schema** before publishing the slip's manifest. The slip was the one authored object of §6.4 produced and never read back; the envelope and its chunks were already validated at assembly. CLAUDE.md §9's method rule, applied to the object it had missed.
- **`CLAUDE.md` §11 — the MVP build, and the line between us and an operator.** The three roles (D-156), the config boundary, the payer seam (D-157), the provisioning order (D-159), one template for three readers (D-162), the MVP scoping line, and the disposable-probe rule. **The role names are demo vocabulary and never identifiers**: `OPERATOR`, `C1OPERATOR`, `C2OPERATOR` may not appear in `app/` as a value, constant, default, enum member or filename, because a third party plugs in its own keys from its own configuration.
- **ADRs D-156 – D-162**, and the reciprocal `Superseded:` pointer on D-47.
- **`npm run check:freeze`** — one instance each of StampReceipt, ReturnReceipt and ConformanceClaim, the three schemas Step 4 would close unexercised, plus the measurement §10.4 turns on: the receipt manifest is 693 canonical bytes, one `ConsensusSubmitMessage`, and the whole `ScheduleCreate` freezes to 862 bytes unsigned.
- **`plans/2026-09-09-0.5.5-the-mvp-build.md`**, and the fourth row in `plans/README.md`.
- **`app/OPERATIONS.md`** gains the HIP-542 probe gate report — prepared, unsigned — and the `hol` resolver design note.
- **Ledger §H** gains two dated rows: the HOL testnet anchor read unauthenticated (open-submit, no keys, no fee, still at sequence 380), and HCS-10's `register` field table at the pin.

### Build decisions with no specification effect

- **D-156 — three roles, and the config boundary.** OPERATOR runs the Postmaster; C1OPERATOR and C2OPERATOR run the two Correspondents and bring funded wallets; the agents hold their own keys and no ℏ. *The agent signs; the operator pays.*
- **D-158 — the reference Correspondent watches its own doorbell and auto-accepts.** The one-stamp fee is the gate P-7 names, and a second gate on traffic the first already priced buys nothing this window. Screening policies are 0.6. An agent whose process is down leaves the ringer a slip, which is F-6 and not a refusal.
- **D-162 — one template, three readers.** `send`'s live log lines, `send`'s returned text block, and `narrate()`'s sentences come from one template file; none of the three may imply receipt or delivery, because §2.3 reserves *delivery* for the lane and §11.8 forbids reading silence as refusal. goose renders tool-call cards and final payloads and not `notifications/progress`, so the Correspondent's own log is the live surface.

## [0.5.4] — 2026-09-08

A patch: text and tests within minor version `0.5`. **No wire string changes** — the AAD's `v`, the HPKE `info`, the schemas' `$id`s and `spec/pins.json`'s `wireStrings` all stay at `0.5` (§1.7). One schema changes, which a patch permits **only because nothing is registered under HCS-13 yet**; `registeredSchemas` is null throughout (T-P9-9), and after registration the same addition would be 0.6. No test is added, moved or removed: the register stays at 83 (78 core + 5 extension) and the extract-and-diff passes both ways. Nothing conforms — T-P9-2 blocks every claim while thirty pins are null, twenty-eight of them after D-154 below — which is why this is a patch and not a minor version (D-134's and D-146's reasoning).

**Deployment, after this patch landed.** D-153 closed §G item 12 by ruling that WISHMail emits the example's order, and the `hcs14` declaration was then signed on `hedera:testnet` against this tag: profile file `0.0.10428178`, declaration registry `0.0.10428113`, and the account memo of `0.0.10426206` set to `hcs-11:hcs://2/0.0.10428113`. `app/OPERATIONS.md` §Step 3 carries the gate report, the run of record, and §8's account of a first profile file that was wrong and had to be superseded.

**Build notes, same day, nothing normative moving.**

- **D-154 — an undeployed ledger tag has no pin.** `spec/pins.json`'s `stampToken` carries an entry per *deployed* tag; `hedera:mainnet` is **removed** rather than nulled, because a null there is a debt this deployment owes and one on a network §15.5 leaves undeployed is not owed. Not a sentinel — a sentinel is a value standing for the absence of a value, which is the thing that was wrong. `ledgerTags` is unchanged: §5.1 defines two tags whether or not either is deployed. **`unfilledPins()` now counts 28**, the `registeredSchemas` entries, and T-P9-2 refuses a report for the one reason that is true. No specification sentence changes: §18.4's "per network" has no referent for a network that is not deployed, and T-P9-2's sketch is untouched.
- **Step 4 is built, planned and deliberately unsigned.** The HCS-13 registration of §18.5's fourteen schemas resolves as 56 steps under `npm run schemas:plan` and is a **separate ordered set** that `npm run provision` cannot reach. Registering *is* §1.7's freeze of `spec/schemas/`, and the freeze is held until the six tool bodies pass their fixtures — three of the last four patches changed a schema, each permitted only because nothing is registered yet. `pins.ts` gains a second narrow writer for `registeredSchemas`, called from the readback because §5.11's sequence number is assigned by the network. The gate report is `app/OPERATIONS.md` §Step 4, and it records a divergence to rule: HCS-13 at the pin and §5.11 both put **one HCS-2 topic per schema**, where a shared registry would make `#<seq>` mean "the nth registration of anything" rather than "version n of this schema".
- **`CLAUDE.md` §9 gains a method rule.** A schema validates a document against its shape, not against a rule that reads it; every writer is built in the same step as its reader, and the reader is run on the writer's output before that output is signed. The case cited is the profile-version defect, `app/OPERATIONS.md` Step 3 §8.

### Changed

- **An agent identifier is compared under both of HCS-14's canonical key orders, the lexicographic one first, and a match under either is agreement** (D-152). The pinned revision fixes the key order of the canonical JSON twice and differently — the step it marks normative sorts keys lexicographically and its reference code does that (`index.md:541`, `:585`), while its own worked example places `skills` first (`:697-706`) — and the two are different bytes, so different identifiers for the same agent. Its test vectors publish the expected value as the literal placeholder `uaid:aid:{base58hash}`, so the document courts neither reading and the contradiction is invisible from the text.

  **The ledger is unanimous, and the census is the evidence.** FETCHED 2026-09-08, mirror-node REST only: of the fourteen newest `uaid:aid:` registrations on the testnet anchor `0.0.6913983` plus the agent at `0.0.7124407` — **15 of 15 reproduce under the example order, 0 under the normative one**, across two protocols, two registry labels and three skill sets. The newest is sequence 380, 2025-11-18T22:05:58Z, `proto=a2a`, `registry=hashgraph-online`; `0.0.7124407` is sequence 153, 2025-10-24T22:10:46Z, `proto=hcs-10`, `registry=hol`. Both are now vectors in `npm run check:hcs14`. **[CC]** found and surveyed, **[S]** ruled.

  §9.1 gains the rule and its `Conformance:` note naming T-P6-3 and T-P6-5; §9.2's and §9.5's identifier comparisons point at it. Trying the normative order **first** is the substance: it makes the second a fallback rather than a preference, so an upstream fix would simply stop the fallback firing.

- **§5.10's `observations` gains `agentIdOrder[]`, and §11.6 the paragraph that says what it is** (D-152). One entry per address compared, naming the address and the order that matched. It is an observation and only an observation: excluded from the evidence digest, bearing on no state or standing, so two Verifiers agree byte for byte whatever they report (P-3) and no appraisal moves (P-12). It is deliberately **not** an endorsement — §5.3's endorsements are a fixed enum and they move standings.

- **`spec/schemas/evidence-bundle.schema.json`** gains `observations.agentIdOrder`. The object was already open — it carries no `additionalProperties: false` — so the schema did not forbid the field; what needed the change was §5.10's shape block, which enumerates what a reader looks for.

- **§A's T-P6-3 and T-P6-5 sketches gain one legacy-order fixture agent each** (D-152). An expansion of a test's scope, which CLAUDE.md §4 makes a decision rather than an edit. Each must resolve, carry the endorsements its rule assigns **and no others** — a legacy-order match is not a reason for `blurred` — and produce an `observations.agentIdOrder` entry.

- **`LIMITATIONS.md` L-7** gains the paragraph a reader of this release needs: that a Draft standard can contradict itself in a way that changes an identifier, that this one does, that it was found by reading the ledger rather than the text, and that the general case has no remedy we can supply.

### Added

- **Ledger §G.5 gains item (b): the HCS-14 defect, drafted for upstream submission.** The proposal is to amend step 3 and the reference function to the example's order, since changing the deployed order would orphan every existing identifier, and to replace `{base58hash}` in both test vectors with the computed value so the next implementer finds the answer in the document rather than on the ledger. A second, smaller inconsistency travels with it: the reference function's DID parameter order disagrees with Test Vector 1's.

- **`matchAgentId`** in `app/src/core/hcs14.ts` — the rule, normative order first, returning which matched or `null` for neither.

One `CHANGED` marker gains a decision and two are new: §9.1, §5.10 and §11.6 carry `D-152`, and §18.2's index marker becomes `D-135, D-136, D-145, D-146, D-150, D-152`.

**Still open, and unchanged by this patch:** which order WISHMail emits for its **own** declaration (§G item 12). `CANONICAL_ORDER` stays `undefined` and every caller names an order, because an HCS-1 file topic has no admin key and that choice is permanent.

## [0.5.3] — 2026-09-08

A patch: text and tests within minor version `0.5`. **No wire string changes** — the AAD's `v`, the HPKE `info`, the schemas' `$id`s and `spec/pins.json`'s `wireStrings` all stay at `0.5` (§1.7). **No schema changes.** No test is added, moved or removed: the register stays at 83 (78 core + 5 extension) and the extract-and-diff passes both ways. It is a patch and not a minor version on D-134's and D-146's reasoning — nothing conforms, because T-P9-2 blocks every claim while thirty pins in `spec/pins.json` are null.

This patch lands **before the declaration is signed**, on the same rule 0.5.2 followed: the text is right before anything is built against it. Both findings were raised while planning Step 3 and ruled by Sonic the same day.

### Changed

- **§4.6's `Conformance:` note excepts the standard that forbids an admin key** (D-150). §4.6:578 has the Postmaster provision "the declaration registry and **profile file**", and D-146's note required every provisioned topic to carry the agent's key as its **admin** key — while HCS-1 at the pin says a file topic with an admin key "will automatically be marked as invalid files, and will be ignored" (`hcs-1.md:48-49`, blob `0d8cca5…`, FETCHED 2026-09-06, ledger §H:360). As landed, no HCS-11 profile file could be provisioned conformantly, so §9.2:1284's declare surface — the whole native profile — was unreachable. The fact had been in the ledger since the recon; the collision had not been noticed. **[CC]** found, **[S]** ruled.

  ```diff
  -`Conformance:` T-P13-1; T-P17-1 — every topic the suite provisions has its admin key set to the agent's key and its remaining keys set at creation per the declared policy for that topic type, and the policy is recorded at creation.
  +`Conformance:` T-P13-1; T-P17-1 — every topic the suite provisions has its admin key set to the agent's key, except where the standard the topic serves forbids an admin key, in which case it carries none and the key that standard requires is the agent's; its remaining keys are set at creation per the declared policy for that topic type; and the policy is recorded at creation.
  ```

  The exception turns on the pinned standard's text and not on a declared policy, so D-146's own reason — that a policy free to name a non-agent admin key would otherwise still pass — is not reopened. §A's T-P17-1 row is amended to the same words. D-147's provisioning template gains a **sixth** row, the HCS-1 profile file topic: sole submit key the agent's, no admin key, no fee, no exempt list; D-147's five rows are unchanged and D-146's and D-147's files gain reciprocal pointers.

- **The vectors' key material is no agent's key** (D-151). No specification sentence changes. `conformance/README.md` had written P-13's rule as "No private-key material in any fixture," which is wider than P-13's own text — "no private key of any **agent** — decryption, topic, or account" (§12.2) — and, read that way, made T-P1-5 unsatisfiable, since an independent implementation cannot *open* what the reference sealed without the recipient's key. `spec/vectors/seal.json` carries `skRm` exactly as RFC 9180 publishes it, declares in the file what that key is and is not, and the generator refuses any key that appears in `app/deployment/hedera-testnet.json`. **[CC]** raised, **[S]** ruled.

- **The P-13 gate is widened** (D-151, same change). `scripts/p13-check.mjs` watched `/(AGENT|TREASURY)_DER_KEY/`, which `AGENT_X25519_DER_KEY` — the encryption key §9.2's declaration needs — walks straight past. It now watches `/(AGENT|TREASURY)[A-Z0-9_]*_KEY/`, still not matching `POSTMASTER_PAYER_DER_KEY`, the Postmaster's own payer under D-47. A hole that existed independently of the ruling, closed with it.

### Added

- `scripts/extract-and-diff.mjs` and `npm run check:register` — the check CLAUDE.md §9 and CONTRIBUTING.md require, as a script rather than a shell pipeline. It reads §A **as rows**, because §A's own footer names the dropped `T-P5-4` and a naive grep of the ledger therefore finds 84 identifiers where the register holds 83. It asserts the total and the extension count as well as the two-way correspondence.

One `CHANGED` marker gains a decision: `D-146, D-150` on §4.6. §18.2's index marker becomes `D-135, D-136, D-145, D-146, D-150` and the index gains a D-150 row.

## [0.5.2] — 2026-09-08

A patch: text and tests within minor version `0.5`. **No wire string changes** — the AAD's `v`, the HPKE `info`, the schemas' `$id`s and `spec/pins.json`'s `wireStrings` all stay at `0.5` (§1.7). One schema changes, which a patch permits **only because nothing is registered under HCS-13 yet**; `registeredSchemas` is null throughout (T-P9-9), and after registration the same correction would be 0.6. The register stays at 83 (78 core + 5 extension) and the extract-and-diff passes both ways.

Everything here was found by writing D-139 – D-144, raised rather than patched as ledger §G items 9 – 11, and ruled on 2026-09-08. **Nothing has been submitted to `hedera:testnet`**; this patch lands before the first transaction, on the rule that the text is right before anything is built against it.

Two new `CHANGED` markers: `D-146` on §4.6, and `D-145` joining D-136's on §14.3. §18.2's index marker becomes `D-135, D-136, D-145, D-146`.

### Removed

- **`validFrom` is dropped from the `PriceList`** (D-145) **[S]** ruling, **[CC]** finding and text. It occurred exactly once in 2,238 lines — a line in §14.3's shape block — and no prose sentence, no MUST, no `Conformance:` note and no ledger row read it, while `price-list.schema.json` **required** it. It could not have been what it looked like: a message's bytes are fixed before consensus assigns a timestamp, so a `PriceList` cannot carry its own. §14.3:1794 already fixes when a price takes effect — "the latest price message with a consensus timestamp before the purchase's" — and T-P11-4 tests against that same clock, so any other meaning would have been a second, competing notion of when a schedule begins. Dropped from the shape block and from the schema's `properties` **and** `required`: with `additionalProperties: false`, leaving the property defined but unrequired would keep publishable a field nothing reads. Rejected alternatives: an effective-from semantics, which needs new normative prose and requires T-P11-4 to say which clock governs when the two disagree; and an informational optional field, which unblocks publication but leaves the same field nothing reads. **This blocked D-143's first price list, which is now unblocked.**

### Changed

- **§4.6's `Conformance:` note names the admin key** (D-146) **[S]** ruling, **[CC]** finding and text. `:584` read "every topic the suite provisions has its **admin and submit** keys set to the agent's keys" — the over-read D-138 removed from §A of the ledger but left standing in the specification, which governs. **As landed, no doorbell could be provisioned conformantly**: §4.4's MUST selects HCS-10's fee-gated inbound option, so an inbound topic has no submit key at all. It now reads "its **admin key set to the agent's key** and its remaining keys set at creation per the declared policy for that topic type". Adopting §A's row verbatim was the alternative and lost: it would leave a declared policy free to name a non-agent admin key and still pass, so §4.6's own MUST at `:583` — which D-138 itself read as meaning the admin key — would go untested at its own line. §A's T-P17-1 row is amended to the same words, so the divergence that produced the defect does not survive its fix. The ADR carries the scope sentence: §4.6 and T-P17-1 govern the topics the suite provisions *for an agent*; the price topic is Postmaster infrastructure under D-142 and falls outside them.
- **D-138 declared `Spec marker: none` and that was wrong** **[CC]**. Its file records the correction and gains a pointer to D-146; it is not edited away.
- **The provisioning template is five rows** (D-147) **[S]** ruling, **[CC]** finding and text. §9.2:1283 puts a MUST on an agent declaring under `hcs14` to control an HCS-2 registry topic, and `:1284` makes T-P17-1 test that its sole submit key is the agent's — a fifth topic type D-138's four-row table did not list. The row: sole submit key the agent's, admin key the agent's, no fee, no exempt list, memo `hcs-2:0:<ttl>` (**MINE**: indexed 0, because §9.2's "prior entries stay on the registry topic" wants them readable at their own consensus timestamps, which T-P8-3 tests). **D-138's four rows are unchanged**, including the doorbell's absent fee schedule key and the reasoning that the fee is immutable at birth. `spec/adr/D-138.md` gains the reciprocal pointer on its table. The row lands so the template every provisioned agent inherits is complete; the declaration itself stays downstream of the entities.
- **`$POSTAGE` is pre-minted 10,000 to the treasury, and the supply key is the treasury's** (D-148) **[S]**. Supersedes D-141's `initialSupply: 0` and its operator-held supply key; `decimals: 0`, `supplyType: INFINITE` and the six absent keys stand unchanged. What the pre-mint buys is a **positive** test: with no supply, T-P7-4's charged half could be shown only negatively, as a stranger failing for want of a stamp, because the only mint path is `buy_stamp` and it does not exist yet. With a float in the treasury, the HIP-991 probe funds a stranger and watches the network assess one stamp to the treasury — §4.4's sentence observed rather than inferred, before the real doorbell exists. The supply key moves to the treasury because that is where the supply lands and the treasury's key is already hot for §14.2's atomic purchase. A deployment fact: **no specification sentence changes and no schema changes.** `spec/adr/D-141.md` gains the reciprocal pointer.
- Ledger §B rows **D-145 – D-148**; §G items 9, 10 and 11 struck through in place with their closures; §18.2's indexing note updated for which of the four are indexed and why.
- Version strings: `README.md`, `STATUS.md`, `LIMITATIONS.md`, `CONTRIBUTING.md`, `CLAUDE.md`, both `package.json`s, `spec/pins.json`, and the ledger's title and resume block. `CLAUDE.md`'s §B range and its "next number after D-131" had both gone stale and now read from the record rather than from a fixed number.

### Not changed

- **No new §G item.** Rotation and a doorbell's fee-exempt list are covered by the admin key each topic already carries; nothing is deferred. An earlier draft of D-147 also set the doorbell's fee schedule key to the agent's key, on the reasoning that a null one freezes the exempt list — that reasoning was **[CC]**'s, carried the token fee model onto topics, and was withdrawn: HIP-991 `:110-113` at the pin updates the exempt list under the **Admin Key**, which the doorbell already has as the agent's. The probe now observes that on testnet rather than reading it.
- **The §14.2 / L-11 seam** stays ledger §G item 8, unpatched, with §19.3 as its identified home. The POSTMASTER claim stays deferred on T-P16-1.

## [0.5.1] — 2026-09-07

A patch: text and tests within minor version `0.5`. **No wire string changes** — the AAD's `v`, the HPKE `info`, the schemas' `$id`s and `spec/pins.json`'s `wireStrings` all stay at `0.5` (§1.7). Two schemas change, which a patch permits **only because nothing is registered under HCS-13 yet**: §1.7 says a patch "changes no wire string, and once a minor version's schemas are registered it changes no schema," and `registeredSchemas` in `spec/pins.json` is null throughout (T-P9-9). After registration the same corrections would be 0.6. The register stays at 83 (78 core + 5 extension) and the extract-and-diff passes both ways.

The repository's **first `CHANGED` markers**, which D-131 set the convention up for: `D-135` on §1.6, `D-136` on §5.4 and §14.3, and `D-135, D-136` on §18.2's index.

### Added

- **§1.6 pins HIP-991 and HIP-423** (D-135) **[S]** ruling, **[CC]** fetch and text. Both rows read `Final · n/a`. FETCHED 2026-09-07 from `hashgraph/hedera-improvement-proposal`: HIP-991 @ `03701720`, `HIP/hip-991.md`, blob `179b61be…`, sha256 `772a8504…`, release 0.59.5; HIP-423 @ `0c4f195b`, `HIP/hip-423.md`, blob `f5fbb1d4…`, sha256 `2bcf4d7c…`, release v0.57.0. `spec/pins.json`'s `hips` block filled to the standards shape. **This closed a real exposure:** every property the doorbell of §4.4 depends on — a fee denominated in a fungible HTS token, the fee-exempt key list, the fee schedule key — had entered this repository as assertion in its own ADRs, and Q-12 was closed and the stamp made fungible on that basis. D-020, D-044 and D-049 gain the citation beside their inference and are not edited away. Two facts were nowhere recorded before the fetch: that a topic created without a fee schedule key can never gain one (`:97`), and that HIP-991 waives a fee **by signature** (`:110-113`).
- **`StampReceipt.rate`** (D-136), `{source, pair, value, at}`, present exactly when the method that bought the stamps is priced by reference. Closes §14.3's "the receipt records the rate used and when," which §5.4 had given no field for — a gap raised at the outfitting and carried in `stamp-receipt.schema.json`'s `$comment` until now.
- **`rate.reference {amount, asset}`** in §14.3 (D-136). T-P11-4's third branch — "the referenced rate applied to the reference price" — had named a reference price that was not a field of anything. It is one now, so the test **becomes true rather than being changed**, and three pricing branches map to three fields exactly.

### Changed

- **Prices are decimal strings in the asset's natural unit** (D-136) **[S]**: never atomic units, which bake a network's decimals into a document a Verifier reads, and never JSON numbers, since §5.1 canonicalizes under RFC 8785 and a float is a hazard. Conversion to atomic units happens when the x402 `PAYMENT-REQUIRED` is issued.
- **A rate-priced method carries `rate` in place of `unitPrice`, never both** (D-136). A published `unitPrice` on a rate-priced method is a number nobody charges, which §14.3's own MUST forbids. A bundle's price follows its method's pricing basis — the method's asset when fixed-priced, the reference asset when rate-priced — so one bundle of twelve for $1.00 is offered on both legs alike (§4.5).
- **§14.3's two pipes are read differently** (D-136). `payTo | facilitator` is **inclusive**, because §14.2 has the `PAYMENT-REQUIRED` carry the Postmaster's receiving address — which *is* `payTo` — so an x402 method needs it alongside `facilitator`. `unitPrice | rate` is **exclusive**. `price-list.schema.json` had encoded the first as `oneOf` at the outfitting; that was an over-reading by **[CC]** and would have rejected the very message this deployment publishes. Now `anyOf` and `oneOf` respectively.
- **T-P7-4 tests that an owner's answer costs nothing** (D-137) **[S]**. FETCHED from the pinned HCS-10 blob: `index.md:498` has an agent send `connection_created` "on its own Inbound Topic," memo `hcs-10:op:4:1` (`:522`, topic type 1 = inbound per `:362`). Unexempted, a recipient pays a stamp to answer its own doorbell — so §4.4's "owes nothing to answer" is false and, more sharply, so is its arithmetic: "first contact therefore costs one stamp to ring" becomes two. The row tests the outcome, not the mechanism; §4.4's exemption stays a MAY. No requirement added, nothing to invalidate (T-P9-2 blocks every claim), so not a minor bump.
- **T-P17-1 follows the declared policy for each topic type** (D-138) **[S]**. §4.6's "owned by keys the agent generated" means the *admin* key; the row's "admin/submit keys set to the agent's keys" over-read it, and **no doorbell could satisfy it** — an inbound topic must accept a stranger's `connection_request`. The pinned HCS-10 text is explicit (`index.md:113-114`): inbound is "Public (No Key), Submit Key, or Fee-gated (HIP-991)", outbound "Has submit key (only agent can write)". D-138 carries the key policy as a table, and because the reference Postmaster provisions its own agent by the customer path, that table is the template every provisioned agent inherits.
- Ledger §B rows **D-135 – D-138**; §H rows for HIP-991, HIP-423, the HCS-10 key configurations, and SaucerSwap — the last being its first entry in the register, having appeared twice in the whole repository until now, both times as an unfilled preference.
- §18.2's ADR index states its own criterion — a decision that shaped no sentence of the document is not indexed — and gains D-135 and D-136, which did. D-132, D-133, D-134, D-137 and D-138 stay out, unchanged in effect from the outfitting's note.
- Version strings: `README.md`, `STATUS.md`, `LIMITATIONS.md`, `CONTRIBUTING.md`, `CLAUDE.md`, the ledger's title and resume block. §18.2's "D-125 Frozen as 0.5.0" row is history and stands.

### Fixed

- Ledger §B row ordering: **D-88** sat between D-131 and D-132, and **D-65** between D-81 and D-82. Both returned to sequence; §B is now D-42 – D-138 ascending with no gaps. **[CC]** (D-65 was not in the reported defect list and was found by the ordering check.)
- The ledger's title read `# WISHMail v0.4.2 — Working ledger` against a v0.5 filename and a 0.5.0 text.

### Deferred, not fixed

- **The POSTMASTER claim is deferred on T-P16-1** (RECORD **[S]**). The MVP BUILD covers pre-funded Hedera accounts only, so both published methods are on `hedera:testnet` and §14.2's MUST — at least one method requiring no pre-funded Hedera account — is unmet. Stated in LIMITATIONS under L-11 and in STATUS §4. **No non-Hedera method was invented to make the claim true.**
- **The §14.2 / L-11 seam is logged, not patched.** §14.2 says that on a Hedera network the buyer "has an account already"; L-11 says the keyless leg "is satisfied on `hedera:testnet` through this facilitator." Both cannot hold. Ledger §G item 8 carries it with both citations for the next specification pass; §19.3 is the identified home, and writing it there in this patch would have added a third `CHANGED` marker.

## [Unreleased]

### 2026-09-09 — the third planning artifact **[CC]**

`plans/` held two plans and the repository had moved two patches past the later of them. The missing
one is `2026-09-08-0.5.3-the-wiring.md`, which directed the 0.5.3 patch (D-150, D-151), the whole of
`app/src/core`, `schema`, `state` and `mcp`, the conformance harness, and the `hcs14` declaration —
commits `1b6f243` through `ca9d45c`. It is here verbatim as approved, byte-identical to the plan-mode
file it was executed from, verified by `git hash-object` as the other two were. No normative change:
no specification sentence moves, no schema changes, no test is added or amended, the register stays
at 83, and nothing here binds anything.

- **The README says why a plan's version and the repository's can differ**, using the case that
  produced this gap: the 0.5.3 plan's Phase D treated HCS-14's hashing algorithm as a settled fact to
  confirm by a fetch before signing, and the fetch found the standard contradicting itself about the
  canonical key order — which stopped the declaration mid-step and produced 0.5.4 (D-152, D-153), a
  patch that appears nowhere in the plan that was executing when it happened.
- **It also records that this plan was rewritten before approval, not after.** Its first form took an
  HPKE library as a dependency; that was refused, and the approved file composes RFC 9180 base mode on
  `node:crypto` with the RFC's Appendix A.1 as its court. The refusal is not in the file, because the
  file is what was approved; the reasoning is in `app/OPERATIONS.md`.
- **And it names what directed the windows with no plan file.** Steps 4 and 5 were directed by
  instruction in-session; the gate report written before each step's first signature stands in for a
  plan and carries the same four things a plan carries.


### 2026-09-08 — `send`, `inbox` and `verify`, and the letter run end to end in a modelled ledger **[CC]**

The three tool bodies of §6.4, §6.5 and §6.7, over one consensus port whose **read half has no write on it** — which is how P-4 is enforced rather than promised: a Verifier is handed a `Reader` and there is nothing in its hands to configure, key, or pay for. No specification sentence moves; no schema changes; no test is added or amended; the register stays at 83.

- **`send` is §6.4's six steps in §6.4's order.** Step 7 is **refused rather than skipped**: postage would include the receipt fee (§7.5) and chunk 0's header would request it (§7.7), so an envelope assembled without §10.4's schedule is one whose sender paid for a receipt nobody was asked for — wrong on consensus and not withdrawable. It lands with `ack`; T-P1-8, T-P1-9 and T-P15-5 stay failing.
- **Who submits the first-contact request is parameterised, not decided.** §6.4 step 1 has the Postmaster submit it; §4.4 fixes only that the doorbell carries one stamp collected by the treasury, which a sender submitting its own request pays with one hop fewer. Both are built — `SenderContext.ringer` chooses — and the question is **ledger §G-14**, open.
- **`inbox` writes nothing and never fails where it can return.** Every §6.5 reason is a returned `Delivery`, never a thrown failure; the only failure §6.5 names is `INBOX_MIRROR_UNREACHABLE`. Reading a lane leaves no mark on it (D-29).
- **`verify` is §11.2 through §11.7.** Everything that could differ between two Verifiers is in the **scope** — the stamp token, the profiles claimed — because P-3's determinism is relative to scope; a Verifier told less checks less and says so under `observations`, which §11.7 excludes from the digest. **§11.2's ingestion table cannot reach an F-3 orphan** — it reaches a settlement only through `hdr.st`, and an F-3 orphan has no chunk — which is **ledger §G-15**, open, with the narrow reading taken in the module and stated there.
- **`npm run check:letter`** runs the whole letter against `app/src/tools/memory.ts`, a modelled ledger enforcing submit keys, HIP-991 fees, token balances and total consensus order: **60 assertions**. The letter opens byte for byte; two Verifiers agree on the digest; the bundle, the narrative, the envelope and the settlement each validate against their registered schemas; an unanswered door yields a slip; and seven alterations are refused **on consensus, not in memory** — header, proof hash, `operator_id`, key epoch, a broken link, the settlement memo, and the same envelope copied to another topic. It appraises `unverified` with the single reason **T-P9-3**, because the schema registry is built and unsigned so no `schemaRef` resolves. That is the true statement and it stays until Step 4 is signed.
- **A defect the reader found in the writer.** The `hcs14` resolver put only a **digest** in its manifest's `output`, while §11.2 reaches the recipient's account and doorbell through "the resolution manifest's output" and §11.4 replays against "the coordinates the manifest carries". A Verifier could look the manifest up and hash it and could not learn which doorbell the lane had to be born from. The output now carries the coordinates — §5.2 permits it, §11.4 requires it — through one extracted builder both the resolver and the fixture use. Same class as the profile-version defect; found the same way, by writing the reader in the step that wrote the writer (CLAUDE.md §9).

Conformance (reference side): T-P1-1, T-P1-2, T-P1-6, T-P1-10, T-P1-11, T-P3-1, T-P3-3, T-P3-4, T-P4-1, T-P7-1, T-P10-1, T-P12-2, T-P12-5, T-P14-1.

### 2026-09-08 — assembly, and the reader run on its own output **[CC]**

§6.4 steps 3 and 4 out, §5.5 back, in one file. `sealEnvelope` chooses the nonce, builds §7.2's AAD, seals under §7.3 and computes §7.5's weight and postage; `affix` takes the settlement reference and produces the header, the chunks and the Envelope; `recoverEnvelope` rebuilds §5.5's object from chunk 0 and the topic it arrived on. No specification sentence moves; no schema changes; the register stays at 83.

- **Where §6.4's step order meets §5.6's `hdr.st`.** The header carries the settlement reference and the header's bytes fix every slice boundary after it, so the chunking cannot precede the reference — and does not have to: a Hedera transaction's reference is its transaction id and the payer pins that before signing, which is what `ops/journal.ts` already rests on. Recorded in the module head as MINE. It widens nothing, and it is what produces §11.4's requirement that the settlement's consensus timestamp precede chunk 0's.
- **`affix` runs the AAD rebuild against its own header** before any caller can sign it. A header that validates, hashes and chunks correctly can still fail to rebuild to the identifier its own chunks carry, and only the rebuild says so.
- **A defect the schema found in the writer.** `hdr.rp.u` was typed as an optional **string** where `spec/schemas/chunk.schema.json` requires a structured message locator and requires it present — so every fixture chunk built to that point would have failed the schema §11.2 navigates by. Typed now as `MessageLocator` in the new `app/src/core/locator.ts`, which is §5.2's "locators and canonical locations are structured, not strings" in one place.
- **`app/src/core/failure.ts`** carries §6's `TOOL_REASON` codes, all twenty-three, as a thrown value, so no body invents a failure §6 does not fix.
- **`npm run check:envelope`** — 52 assertions: a letter assembled, every chunk and the envelope validated against the registered schemas, the chain walked back, the payload opened byte for byte, and every alteration refused — nonce, proof hash, ledger tag, wrong lane, swapped ephemeral key, another recipient's key, a flipped bit in the AAD, a payload past `MAX_WEIGHT`.

Conformance (reference side): T-P1-4, T-P1-11, T-P7-3, T-P9-3, T-P9-7, T-P9-11, T-P10-1.

### 2026-09-08 — DIVERGENCE: an envelope chunk is frozen through the base class **[CC]**

§7.4 requires every chunk to be "submitted as one HCS message with no transport-layer chunking", and T-P9-7 checks that no fixture message carries `chunkInfo`. `TopicMessageSubmitTransaction.freezeWith` sets `_chunkInfo` inside its chunk loop, so **every** message the SDK's default path produces carries the field, single-chunk messages included. No specification sentence moves; no schema changes; the register stays at 83.

- **Confirmed on consensus, not from reading.** Our own price-list message at `0.0.10426551` sequence 1 carries `chunk_info {"number":1,"total":1}` on the mirror node. That message is a §14.3 price list and not an envelope, so §7.4 does not reach it; it stands as proof that the default path does what the source says it does, in a message already published and unalterable.
- **Fixed and verified without a signature.** `UnchunkedTopicMessageSubmitTransaction` in `app/src/ops/hcs10.ts` overrides `freezeWith` to `Transaction.prototype.freezeWith` and overrides nothing else; `_makeTransactionData()` omits the field when `_chunkInfo` is null, so it is **absent** rather than empty. Both transaction bodies were built and **decoded locally from their own protobuf bytes** — identical in memo, topic and message bytes, differing only in that field. Nothing was submitted to obtain it: a chunk carrying `chunkInfo` fails T-P9-7 permanently.
- **`npm run check:hcs10` reruns the comparison including its negative half** — it asserts that the ordinary path *does* carry the field — so the override is demonstrated on every run rather than asserted once. If a later SDK release stops attaching it, that assertion fails and the divergence section is what gets read.
- **This is where "HCS-10 by hand vs SDK" is settled**, narrowly and on evidence: the SDK's transaction classes, with one override, scoped to the one operation whose wire form §7.4 constrains. Not a hand-rolled protobuf, and not the SDK unmodified. STATUS §6 no longer carries it as open.

### 2026-09-08 — the HCS-10 operation layer, and Step 5's gate before any signature **[CC]**

`app/src/ops/hcs10.ts` carries HCS-10's four transaction memos at their file:line in the pinned blob, the `transaction` operation's empty memo (D-94), and the operation bodies for `connection_request`, `connection_created`, `close_connection` and `message`. `npm run check:hcs10` holds them to §H's facts: 17 assertions. **The gate report for Step 5 is `app/OPERATIONS.md` §Step 5, written and committed before any signature**, opening with `send` before implementation — actors, I/O, the eight invariants as each binds at send, F-1 – F-11 where each lands, §6.4's eight `TOOL_REASON` codes, the 27 T-IDs the step answers, and §7's definition of when the step is done. No specification sentence moves; the register stays at 83.

- **The gate carried an error of its own, corrected in the same landing.** It gave the `message` operation's transaction memo as `hcs-10:op:6:1`; it is `hcs-10:op:6:3` — operation 6, topic type 3, the connection topic (`index.md:646`).

### 2026-09-08 — the chunk chain, and the walk that reads it back **[CC]**

`app/src/core/chunk.ts` — §7.4's chunker out and §11.3's walk back, writer and reader in one file, because a chunker whose own reader cannot walk its output has produced something well-formed and unreadable and only the walk says so. No specification sentence moves; no schema changes; the register stays at 83.

- **Slice sizes are measured, not fixed.** §7.4: the budget "depends on identifier lengths and is not fixed by this document". Each chunk is measured against the real HCS-10 wrapper, and `n`'s decimal width is a **fixed point** — a ten-chunk envelope needs two digits, and the probe that assumed one emitted a 1001-byte chunk 0, caught by the chunker's own closing assertions before anything left the process.
- **`npm run check:chunk` reproduces §11.3's worked example**: a foreign chunk bearing the envelope's identifier and index reaches consensus **before** the sender's, and the sender's is still canonical, the foreign one recorded off-chain and never used. Also every refusal the walk owes: unrooted, an unbound header, a broken link, and complete-but-not-intact handing back nothing.

### 2026-09-08 — D-155, and push per landing **[S]** rulings, **[CC]** text

- **D-155 — one HCS-2 topic per schema, no discovery registration.** Step 4's divergence is ratified as built: HCS-13 at the pin and §5.11 both put the version registry **per schema**, and a shared registry would make `#<seq>` mean "the nth registration of anything" rather than "version n of this schema" — which is not what §5.11's `schemaRef` names. The instruction that had said one shared registry was Claude's error; the ADR records that on Sonic's word, and says so, rather than manufacturing a citation for a sentence neither the plan nor the repository contains.
- **`CLAUDE.md` §9 gains push per landing.** Every commit goes to `origin` as it lands, with every tag — `git push origin main --follow-tags` — not at the end of a session and not in a batch. An unpushed commit is work only one machine has, and the point of the record is that someone else can read it. The commit, a clean `git status`, and an empty `git log origin/main..main` are reported with each landing.


### 2026-09-08 — The planning artifacts, and the AI-use disclosure **[CC]**

Submission hygiene under ETHGlobal's rules, which ask that a spec-driven workflow carry its spec files, prompts and planning artifacts in the repository, and that where and how AI tools were used be documented rather than inferred. No normative change: no specification sentence moves, no schema changes, no test is added or amended, the register stays at 83, and the `v0.5.2` tag is not moved.

- **`plans/`** carries the two plans this build was directed by, byte-identical to what was approved: `2026-09-07-0.5.1-then-the-entities.md` (Phase A, and Phase B Steps 0 and 1) and `2026-09-08-0.5.2-then-the-entities.md` (Phase A′, the probe, and Steps 2 – 4). Its README states that they bind nothing, maps each to the commits that executed it, and says plainly that the rulings which amended them are **not** in the files — a plan is what was approved, and the amendments are in ledger §B and in the commit messages. It names two, so the pattern is visible: the withdrawn doorbell fee-schedule key, and D-149 turning the token's pre-mint into a separate act. A third plan artifact in the same directory belongs to another project and predates the window; it is not here, and the README says why.
- **`README.md` gains "How this was built"** — the division of labour (every ruling Sonic's, the one hundred and forty-nine decision records his; drafting, reconnaissance, the TypeScript under `app/src/` and the provisioning run Claude's), the four places attribution already lives (`CLAUDE.md` as the standing instruction, `plans/`, the CHANGELOG's **[S]**/**[C]**/**[CC]** key, and the `Signed-off-by:` plus `Co-Authored-By:` trailers on every commit), the Start Fresh statement with `provenance/` named as what it is, the declared third-party dependencies, and P-13.
- **`README.md`'s Status paragraph was stale and is corrected.** It read "the build is beginning" and "the `$POSTAGE` token and treasury are unpinned"; both were true when written and neither is now. It states what stands on `hedera:testnet`, that thirty pins remain and T-P9-2 therefore still blocks every claim, and points at STATUS §6, the ops record and `app/OPERATIONS.md`. The repository tree gains `plans/`.

### 2026-09-08 — The P-13 gate runs where the build is done **[CC]**

`npm run p13:check` exited 255 without running its grep. The script was a shell one-liner — `git grep … | grep -v … ; test $? -eq 1` — and npm on Windows runs a script through `cmd.exe`, which parses neither the single quotes nor `test`. So the gate that keeps agent key names out of every module but `env.ts` and `identity.ts` **had never run on the machine this build was done on**, and its red exit read as tooling noise rather than as a failure. A check that fails open is worse than no check, because it is trusted. No normative change: no specification sentence moves, no schema changes, no test is added or amended, the register stays at 83.

- **`scripts/p13-check.mjs`** replaces the one-liner; `package.json` runs `node scripts/p13-check.mjs`, which behaves the same on every platform. It distinguishes the two ways `git grep` can exit non-zero — status 1 with no output is "nothing matched", the clean case, and anything else is a real error that exits 2 rather than passing silently.
- **The invariant is unchanged and still holds**: `AGENT_DER_KEY` and `TREASURY_DER_KEY` are named in `app/src/ops/env.ts` and `app/src/ops/identity.ts` and nowhere else in `app/src`. Every other module takes a `Signer` — public material and a signing callback — and cannot leak a key even by accident, because it is not holding one.
- **`POSTMASTER_PAYER_DER_KEY` is deliberately outside the gate**, and the script now says so where the pattern is written. An earlier draft of this fix added it and failed on `probe.ts` and `provision.ts`; that was the fix being wrong, not the code. The operator is the Postmaster's own payer under D-47, not an agent, and P-13 is about agent keys — and those two lines name it only to hand it to `fromEnv`, which is in `identity.ts`.

Conformance: T-P13-1, T-P13-2.

### 2026-09-08 — Step 4 record-keeping: the deployment fields filled **[CC]**

The remainder of the approved plan's Step 4. No normative change: no specification sentence moves, no schema changes, no test is added or amended, the register stays at 83, and the `v0.5.2` tag is not moved.

- **LIMITATIONS** gains the entities where §15.5 expects them: the stamp token `0.0.10426208` and treasury `0.0.10426205`, the price topic `0.0.10426551`, and a paragraph naming the Postmaster-agent's account, doorbell, log and manifest with a pointer to the ops record and the method. It says plainly what this does **not** buy: thirty pins remain unfilled, T-P9-2 refuses a report while any is, and every `[fill at claim]` field stays empty for that reason.
- **STATUS §4**'s two remaining unfilled rows are filled, each stating what was provisioned and against which tag.
- **STATUS §6** is rewritten as where the build stands rather than what is next: Phase A, Step 1, Phase A′, the probe and Step 2, each with what it settled; then what is **not** done and what it blocks — no conformance claim is possible, `conformance/` holds none of the 83 tests, `app/` holds no part of the six-tool surface, and the `hcs14` declaration is unbuilt.
- **Two operational rules earned in Step 2** are written down where the next session will read them: unbuffered output on every long-running script, because a pipe that buffers until exit makes a fast failure look like a hang and cost two killed runs; and a machine-readable file of record is edited surgically and never re-serialised, because `spec/pins.json` is §1.6's machine-readable form and a reviewer must be able to see that exactly two values moved.
- **The `chunkInfo` finding** is filed under `HCS-10 by hand vs SDK`, which stays open. `TopicMessageSubmitTransaction.freezeWith` attaches `chunkInfo` to every message including a single-chunk one, and §7.4 requires none on an HCS-10 envelope chunk — so that class cannot carry envelopes as-is. Harmless for the price list, which is not an envelope. Reported, not acted on. — *Acted on later the same day, and the question closed with it: see the DIVERGENCE entry under [Unreleased].*

### 2026-09-08 — Step 2: the Postmaster's entities stand on hedera:testnet **[S]** approval, **[CC]** code and record

Eleven entities provisioned against the text tagged **`v0.5.2`**, which is what `app/deployment/hedera-testnet.json` cites. `spec/pins.json` closed exactly two nulls; **thirty remain**, so T-P9-2 still blocks every conformance claim — standing up the entities did not make a claim possible, it made one eventually possible. No specification sentence moves, no schema changes, no test is added or amended, the register stays at 83.

- **The entities.** Treasury `0.0.10426205`; postmaster-agent `0.0.10426206`; `$POSTAGE` `0.0.10426208` born at zero with D-141's six nulls and D-148's supply key on the treasury; the 10,000 float minted as **its own act** with its own transaction id (D-149); the operator and agent associations; price topic `0.0.10426551` with the operator's submit and admin keys (D-142); the first `PriceList` at sequence 1, **no `validFrom`** (D-145); and the agent's doorbell `0.0.10426553`, log `0.0.10426554` and manifest `0.0.10426591` per D-147's template. Every row read back from the mirror node and never from an SDK receipt, each with the **named predicate** it waited on, all PASS. The doorbell carries **no submit key**, the agent's admin key, **no fee schedule key**, and one HIP-991 fee of 1 `$POSTAGE` to the treasury with the agent's own key exempt.
- **The first run hung, and the hang was mine.** `fetch` carries no default timeout, so the token's readback stalled after `$POSTAGE` had already reached consensus, and the record was never written for an entity that exists. Every mirror request now carries a 15s `AbortSignal.timeout`, and `poll` treats a timed-out read as "not yet" against its own deadline rather than as a crash.
- **The plan specified `journal.ts` and it had not been built.** That omission is why the hang left an orphan a re-run would have duplicated — permanently, since the token has no admin key. Built now: a transaction id pinned before submission, written through a temp file and a rename, with a resolution that has no ambiguous branch. **`ABSENT-BUT-ON-LEDGER`** joins §4's stop conditions, resolved by the journal first and a step's backstop second.
- **`0.0.10426208` was adopted, not re-created** (RECORD **[S]**), under the conditions ruled: the backstop found **exactly one** token whose `treasury_account_id` is ours and would have stopped rather than chosen between two; it passed `confirm()` field for field like any created entity, because adoption is not a shortcut past confirmation; its creation transaction and consensus timestamp were recovered from the mirror so its row is as complete as the accounts' beside it; and `policy.adopted` in the record says it was adopted after a readback hang and cites `app/OPERATIONS.md` §7.
- **A second bug looked like a hang and was not.** `mirrorPathFor` asked the record for the token's id while building the token's own row, and threw in seconds — but the output was piped through `tail`, which buffers until the process ends, so the silence read as a hang. A pipe that hides progress is not a neutral observer; later runs were watched through a log file.
- **§4's acceptance test, both halves.** The second run created nothing, exited 0, and printed the same eleven rows. Deleting `agent.manifest` from the record and re-running created **one** entity — a new manifest — and nothing else. The superseded first manifest `0.0.10426557` is recorded in the ops record's new **`residue`** array, so `entities` holds exactly one manifest and no reader is left wondering what an orphan topic is.
- **The pins writer was rewritten to be surgical.** Its first version re-serialised `spec/pins.json` with `JSON.stringify` and turned a two-value change into an eighty-line diff, in the machine-readable form of §1.6. It now edits one line and **refuses to write** if that line is not in its expected form, rather than reformatting every other pin around it.
- **Pre-flight added before signing** (**[S]**): the operator must be associated with the USDC asset `networks.ts` names for the network, since the price list publishes it as `payTo` and a `payTo` that cannot receive is a false publication. Observed explicit, holding 2.0 USDC.
- **`autoRenewAccountId` is a payer role and not a key** (**[S]**), stated in the ops record's constants and in the gate report: §4.6 and D-47 have the Postmaster pay, an auto-renew account signs nothing and authorises nothing, and an agent-owned topic's admin key can change it — so D-47's rule on operator keys is visibly untouched.

### 2026-09-08 — the environment tiering, before the Step 2 signature **[S]** ruling, **[CC]** text

No normative change: no specification sentence moves, no schema changes, no test is added or amended, the register stays at 83, and the `v0.5.2` tag is not moved. **Still nothing signed**: `spec/pins.json` carries its 32 nulls and `app/deployment/` does not exist.

- **The rule** (RECORD **[S]**): `.env` holds secrets, the network selector, and runtime locations, and **never a copy of a value whose home is somewhere else**. Four tiers, each fact in exactly one — `.env`; `app/src/ops/networks.ts` for per-network constants keyed by `HEDERA_NETWORK`; `spec/pins.json` for §18.4's set; `app/deployment/<network>.json` for every other fact about one deployment (D-144). The one account id left in `.env` is `POSTMASTER_PAYER_ID`, because it is an *input* to provisioning rather than a product of it — the single account this deployment did not create.
- **Removed from `.env` and `.env.example`**: `POSTAGE_TOKEN_ID` and `PRICE_TOPIC_ID`, which were entity ids and were holding literal placeholder text from an earlier project; `TREASURY_ID`, `AGENT_ID` and the three `AGENT_*_TOPIC_ID` names, also entity ids; `HEDERA_RPC_URL`, `POSTAGE_ADDR` and `OPERATOR_EVM_ADDR`, EVM coordinates with no Solidity and no contract in this project; and **`OPERATOR_HEX_KEY`, a second encoding of a private key already present** — a duplicate secret doubles the surface without adding a capability.
- **Added**: `HEDERA_NETWORK`, which `networkConstants()` refuses when it names a network §15.5 leaves undeployed, so selecting `mainnet` stops the run rather than half-provisioning it; and `WISHMAIL_STATE_DIR`, `MCP_BIND`, `MCP_PORT`. `WISHMAIL_STATE_DIR` is §14.2's durable record — D-109 makes the MCP server hold the 402 state and accept only requirements it issued, and T-P11-5 and T-P11-6 test that it survives a restart, which in-memory state cannot.
- **`app/src/ops/networks.ts`** is the new per-network table: mirror URL, USDC asset, facilitator and its fee payer, rate source, and fee caps — **each with its citation**, because a number without one is how second-hand assertion enters a repository, which is the exposure D-135 closed. The `mainnet` row exists so the shape is stated and is marked undeployed.
- **The first `PriceList` is now a committed file**, `app/price-list.hedera-testnet.json`, which the script submits. What the Postmaster charges is reviewable as a document rather than read out of a function. Three fields are filled at run time because they cannot be known at commit time — the token and treasury ids from the ops record, `payTo` from `POSTMASTER_PAYER_ID` — and they are `null` in the file, so the schema's account-id pattern catches a fill that did not happen rather than publishing it. `asset`, `facilitator` and `rate.source` are asserted against the network table before submission, so the two cannot drift. **The refactor is byte-neutral**: the canonical message is the same 565 bytes with the same sha256 `5264166e…` as the literal it replaced.
- **`app/sdk/.env.example`** is a separate, minimal file for the Correspondent client, where the SDK and CLI will ship: the agent's own key, an optional account id, the network, and the Postmaster's MCP URL. It shares nothing with the Postmaster's file, states what a Correspondent does *not* need, and says the thing worth saying first — the Postmaster holds no key of yours, ever (P-13).
- **Requested finding: nothing in `app/src` reads an entity id from the environment**, so nothing had to move. The audit output is `identity.ts` reading the three key names, `env.ts` reading the selector and the runtime locations, and `probe.ts` reading its own log path. Entity ids already came from the ops record; the ruling ratifies what the code did rather than correcting it.
- The variable names keep the spelling `app/src` already used, `*_DER_KEY` rather than `*_KEY`, per the ruling that the tiering binds and the spelling does not.

### 2026-09-08 — the HIP-991 probe ran: the first writes to consensus **[S]** approval, **[CC]** code and observations

The first transactions this project has ever submitted. Approved to sign after the gate report was committed, per D-149. No normative change: no specification sentence moves, no schema changes, no test is added or amended, the register stays at 83, and the `v0.5.2` tag is not moved. **Nothing was written to `app/deployment/hedera-testnet.json` or to `spec/pins.json`; both still carry their 32 nulls.**

- **The exemption holds in the production shape, which is the result the doorbell depends on.** The operator paid, the owner signed, the owner's key was on the fee-exempt list — and **no fee was assessed**. So HIP-991 waives by *signature* and not by payer, exactly as `hip-991.md:110-113` says and as D-137 and D-139 assumed without being able to check. §4.4's "owes nothing to answer" survives contact with the network. A control with the exempt key paying for itself gave the same result, so the waiver is not an artefact of who paid.
- **The fee is debited from the transaction payer.** Two otherwise identical submissions, one paid by a stranger and one paid by the operator with the stranger signing, debited the stranger and the operator respectively. `:101`'s "submitting account" means the payer, and `assessed_custom_fees[].effective_payer_account_ids` is where the mirror node says which — the field T-P7-4 should read.
- **The exempt list is amendable under the admin key alone**, on a topic carrying no fee schedule key: after a `TopicUpdateTransaction` signed by the admin key, the previously exempt key was charged and the new one was not. `:110-113` observed rather than read, and the warrant for D-138's doorbell row standing unreversed — which is why the fee-schedule-key amendment of 2026-09-08 was rightly withdrawn.
- **`fee_exempt_key_list` is the real field name**, elements `{_type, key}`. It had been an inference from a protobuf field name that no recon here had ever seen returned. Also FETCHED: `decimals`, `initial_supply` and `total_supply` come back as **JSON strings**; `GET /transactions/{id}` **does** return `entity_id`, so the provisioning journal's preferred recovery path exists.
- **The token was born at zero and minted as an act** (D-149), and read back with D-141's six nulls intact — `admin_key`, `freeze_key`, `wipe_key`, `pause_key`, `kyc_key`, `fee_schedule_key` — `decimals` 0, `INFINITE`, treasury and supply key as ruled. The template is confirmed against consensus before the real `$POSTAGE` is created.
- **A treasury fee collector works and need not sign the topic create.** The create was deliberately attempted with the collector's signature withheld and succeeded. This only **partly** closes ledger §H's standing MINE: a treasury is associated by construction, so an *unassociated* collector remains untested and is not claimed. WISHMail's collector is the treasury, so the open half is on no path this version takes.
- **Two bugs in the probe, found by the probe, and recorded.** The first run treated any failure of the unsigned topic create as "the collector must sign"; the failure was `INSUFFICIENT_TX_FEE` — a 20 ℏ cap, too low for a fee-gated topic, and not a rejection of the fee configuration — and had the retry succeeded, a false FETCHED would have entered §H. The retry is now gated on `INVALID_SIGNATURE`. Separately, the post-update topic readback polled with a predicate of `() => true`, which accepts a pre-update answer and did; the submissions caught what the poll missed. A poll whose predicate is "any answer" is not a poll.
- **What it left, as §4 of the gate report said it would.** Token `0.0.10425743` and its treasury `0.0.10425740` are permanent — `TokenDelete` needs an admin key the posture under test forbids — plus the first run's `0.0.10425725` and `0.0.10425722`. The topic was deleted under its admin key, and the operator returned its units and was dissociated, so the one account the deployment keeps carries nothing of the probe.
- Ledger §H gains four dated rows and its standing MINE on collector association is marked partly answered in place.

### 2026-09-08 — D-149: the probe is disposable, `$POSTAGE` is born at zero, and the payer is observed **[S]** rulings, **[CC]** text

No normative change: no specification sentence moves, no schema changes, no test is added or amended, the register stays at 83 and the extract-and-diff passes both ways. The `v0.5.2` tag is not moved. **Nothing has been submitted to `hedera:testnet`.**

- **`v0.5.2` tagged at `21cb3c2`** — annotated, signed off, naming D-145 – D-148. `app/deployment/hedera-testnet.json` will cite that **tag and not a commit hash** as the text every entity was provisioned against: a conformance claim names a version (§1.7, §5.10), and a version is what a tag is, while a hash is only where it happened to sit in one clone's history.
- **The HIP-991 probe is wholly disposable** (D-149) **[S]**. Its own treasury, token, topic and stranger; the real `$POSTAGE`, the real treasury and the Postmaster-agent's topics are not created, touched or named by it. It **mirrors the real shape exactly**, because a probe that proves something about a different shape proves nothing about the template. Rejected: running it on the real token, which would bind the deployment's uncorrectable token — no admin key, D-141 — to the first unobserved write to consensus. It writes nothing to `app/deployment/hedera-testnet.json` and nothing to `spec/pins.json`, which are the ledgers of what the deployment keeps; `app/OPERATIONS.md` is its whole record.
- **The probe's gate report is written and committed before any signature** (D-149) **[S]**, in four parts — what it creates, what it asserts, what it reads back, what it leaves on the network — because it is the first time this build writes to consensus and the record should show that was known in advance. It states plainly that the probe **leaves an inert token and its treasury on testnet permanently**: `TokenDelete` needs an admin key the posture under test forbids, and a token's treasury cannot be deleted while the token exists. "Disposable" is true of the record and only partly true of the ledger.
- **`$POSTAGE` is born at `initialSupply: 0` and the float is minted as its own step** (D-149) **[S]**, partially superseding D-148. D-148's warrant for the pre-mint was the probe's positive test, and that moved to a throwaway token; the 10,000 survives on its remaining grounds, but arrives by a **mint with its own transaction ID** rather than as a birth parameter. A birth parameter is a fact about a transaction nobody looks at again; a mint is an act a Verifier can replay (P-3), it makes the supply key's first use visible on consensus, and it keeps §4.1's `INFINITE` and mint-on-demand literally true — which is what D-141 was protecting. `supplyKey` stays the treasury's, unchanged from D-148. D-141's pointer is corrected; D-148 keeps its text and gains the pointer.
- **The charged path is observed under both payers** (D-149) **[S]**. `hip-991.md:101` charges the fee to the submitting account and a Hedera transaction has one payer, so D-47's "the Postmaster pays" and "a funded stranger is charged" cannot both hold of one submission — while §4.4 has the sender transfer a stamp *to the Postmaster*, which then pays, which is why D-140 makes the operator the momentary bearer. Found **[CC]** while writing the gate report and raised rather than resolved. The probe now submits twice, stranger as payer and operator as payer carrying the stranger's unexempted signature, and records which account was debited each time. One extra transaction settles §4.4's routing and the fee mechanism in one run.
- `app/OPERATIONS.md` also gains the library note: `ajv` 8 with `ajv-formats` for draft 2020-12, `canonicalize` 4 for RFC 8785, and `@types/node` pinned to `^22` in `app`. The canonicalizer is a dependency rather than a hand-rolled function because §5.1's canonical JSON is also the AAD's basis in §7.2, whose SHA-256 is the envelope identifier and whose court is `spec/vectors/aad.json` (T-P1-4); a canonicalizer subtly wrong about number formatting or key ordering produces identifiers no other implementation reproduces, and the failure is silent.
- `npm run typecheck` stays red with TS18003, no input files. It predates this work — nothing is tracked under `app/src` at any commit yet — and it clears when the first provisioning module exists. No stub was added to make it green.

### 2026-09-07 — Phase B Step 1: the stack, and six decisions before the first transaction **[S]** rulings, **[CC]** text

No normative change: no specification sentence moves, no test is added or amended, the register stays at 83, and the extract-and-diff passes both ways. **Nothing has been submitted to `hedera:testnet`.** These are the decisions the specification leaves open, ruled before any of them can be silently defaulted by a transaction.

- **Scaffold.** Root `package.json` (npm workspaces `["app"]`), `tsconfig.base.json` (ES2022, NodeNext, `strict` with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`), `app/package.json` and `app/tsconfig.json`. `@hashgraph/sdk` 2.81.0, `tsx`, `typescript` 7.0.2, `dotenv`. **The SDK expresses what the agent kit could not**, verified rather than assumed: `TopicCreateTransaction` carries `setCustomFees`, `setFeeExemptKeys` and `setFeeScheduleKey`, and `CustomFixedFee` carries `setDenominatingTokenId` — checked at runtime against the installed package, 2026-09-07. That is the positive half of the DIVERGENCE recorded in `app/OPERATIONS.md`.
- **D-139 — on a doorbell, "the key that governs that topic" is the submitting agent's.** §3.5 names lanes, doorbells and logs, and after D-138 a doorbell has no submit key at all, so the clause has no referent there; read carelessly it would have the owner's key sign a stranger's `connection_request`. The sender signs its own ring, and the fee does the governing. No specification sentence changes — T-P2-1 tests lanes only, which is why the vacuity survived the freeze. It interlocks with D-137: the exemption works *because* the signer is the submitting agent, since HIP-991 waives by signature.
- **D-140 — three account roles, three accounts, three keys.** Operator/payer (reused `0.0.8641261`), treasury, and a Postmaster-agent identity. The treasury's key is **hot** — §14.2's purchase is atomic — so the split is containment and accounting, not cold custody. The Postmaster-agent is an **operational choice, not a spec role**: §1.4 gives POSTMASTER no doorbell and no profile obligation, and P-13 is untouched because those keys are the organization's own, not a customer's. The form that must hold is structural: an `AGENT_*` namespace no service path reads, and a provisioning script that does not special-case its own agent.
- **D-141 — `$POSTAGE` carries a supply key and no other.** `decimals: 0` is **forced**, not preferred: a HIP-991 fixed fee is written in base units, so §4.4's "exactly one stamp" is one unit only at zero decimals. Infinite supply, minted on demand, nothing pre-minted. No admin, freeze, wipe, pause, KYC or fee-schedule key — each is refused against P-2, F-3 and §4.1's bearer property, and the refusal is checkable as six nulls on the mirror node. The tail is stated rather than hedged: with no admin key, loss of the treasury key is terminal for the deployment, and this BUILD accepts a testnet rebuild as the remedy.
- **D-142 — the price topic's submit and admin keys are the operator's.** The price list is the service speaking. Not the treasury, whose key is hot for a different job and where holding stamps confers no authority to price them; not the Postmaster-agent, which is a Correspondent peer. D-101 is refined, not superseded — it fixed *that* the key is the Postmaster's sole key, at a date when there was only one — and §19.3's Q-7 stays open unchanged, because it asks how these keys change **hands**, not which exists at birth.
- **D-143 — the first price list**: $0.10 a stamp, twelve for $1.00, on both methods. `x402-usdc` fixed-priced with `payTo` and `facilitator` both; `hbar` rate-priced with no `unitPrice`, its bundle quoted in the reference asset. `asset: "0.0.0"` is inherited from the SaucerSwap response the `rate.source` names, not invented. Two methods only, and **T-P16-1 deferred** rather than dodged.
- **D-144 — `spec/pins.json` takes only what §18.4 enumerates.** From this phase, exactly `stampToken["hedera:testnet"]`; the accounts, topics, sequence numbers and transaction IDs go to `app/deployment/hedera-testnet.json`. T-P9-2 is why the line matters: every entry in that file gates every conformance claim, so a pin is a fact about the specification version and an ops record is a fact about one deployment of it. Two nulls will close and **thirty will remain**.
- `.env.example` rewritten around the three roles, values blank, with the `AGENT_*` prohibition stated in the file itself. `HEDERA_RPC_URL` and `POSTAGE_ADDR` are dropped: both are EVM coordinates, and there is no Solidity and no contract in this project.
- Ledger §B gains **D-139 – D-144**; `spec/adr/` now holds D-1 – D-144 with no gaps, and `TEMPLATE.md`'s coverage note follows.

**Three findings raised for ruling and deliberately not patched**, in ledger §G items 9 – 11: `validFrom` on a `PriceList` is required by the schema and defined by no sentence of the specification, and cannot be what it appears to be; §4.6's `Conformance:` note at `:584` still carries the "admin **and submit** keys" over-read that D-138 removed from §A, so as landed no doorbell can be provisioned conformantly — a defect in D-138's own landing, which declared no specification sentence needed changing; and D-138's provisioning template omits the HCS-2 declaration registry topic that §9.2 names at `:1284`. The first blocks publication of the price list and nothing else.

### 2026-09-07 — the tooling rule for Phase B, settled against the agent kit's own schemas **[S]** ruling, **[CC]** reconnaissance

No normative change; no specification sentence and no test moves. This records how the Postmaster's testnet entities will be made, before any of them is made.

- **Every transaction is `@hashgraph/sdk`; every read is mirror-node REST.** `hedera-testnet-mcp` is not used for a write we own. FETCHED 2026-09-07 by JSON-RPC against its endpoint: "Hedera Agent Kit" v0.1.0, 43 tools. Its *signing* posture is correct for P-13 — it returns unsigned bytes and holds no key of ours — but its write tools default the payer to "the operator account," which is its operator and not ours, and `create_topic_tool` has no payer parameter, so a topic it builds names an account we cannot control. D-47 fixes that the Postmaster pays; a payer we cannot name is not the Postmaster. That decides it before HIP-991 is reached.
- **Two requirements are additionally unsayable through it.** `create_topic_tool` has no `customFees`, `feeScheduleKey` or `feeExemptKeys`, so §4.4's one-stamp doorbell fee and D-138's exempt list cannot be expressed; `create_fungible_token_tool` offers one boolean about the supply key and nothing about admin, freeze, wipe, pause or KYC, so D-141's key posture cannot be expressed. Recorded once as a blanket DIVERGENCE in the new `app/OPERATIONS.md`, with both parameter lists quoted verbatim so the claim is checkable without the agent kit in hand.
- **`hedera-docs` is unaffected** and is used freely for design questions during BUILD; what it returns is FETCHED, cited with the document named, and never becomes a source the specification cites without a pin (§1.6, L-7).
- **The suite inherits the reads rule.** `conformance/README.md` now states that P-3 and P-4 together make a mirror node a read interface rather than a broker, and that nothing in `conformance/` may depend on an agent kit or any service that reads on the suite's behalf — otherwise T-P3-1's byte-identical evidence becomes a property of that service rather than of the ledger.
- Ledger §H gains the reconnaissance as a dated row. The finding is stated as a contribution rather than a complaint: HCS-10 offers a fee-gated inbound topic at `index.md:113` and HIP-991 has supported HTS-denominated topic fees since release 0.59.5, so the gap is in the tooling, not the standards, and naming it precisely is part of supporting the incumbent.
- `STATUS.md` §5 carries the rule for both servers; §6 "Next" now points at Phase B Step 1 and names its two reporting stops — the HIP-991 probe readback before the real doorbell, and the final verification report.

### 2026-09-07 — repository outfitting (STATUS.md §3 step 0; CLAUDE.md §4) **[CC]**

No normative change: `spec/WISHMAIL_SPEC_v0_5.md` is byte-identical to the frozen 0.5.0 text, and `spec/CONFORMANCE_TESTS_v0_5.md` to the ledger. The extract-and-diff passes both ways — 83 `T-P*` identifiers in the specification, 83 rows in ledger §A, none on either side alone.

- Layout of §18.5 created: `spec/` (with `schemas/`, `vectors/`, `adr/`), `conformance/` (with `fixtures/`, `corpus/`, `reports/`), `app/`. `WISHMAIL_SPEC_v0_5.md`, `CONFORMANCE_TESTS_v0_5.md` and `TEMPLATE.md` moved rather than copied, so that the only normative document exists once; `TEMPLATE.md` to `spec/adr/`, as its own note directed.
- `spec/adr/` backfilled: **D-1 – D-41**, one file each, `Status: carried`, from `provenance/WISHMAIL SPEC v0 3.md` §13 and the 2026-09-04 handoff. Each names the 0.5.0 sections it shaped and, where 0.5.0 changed it, what was carried and what was not — D-18 (the HOL disposition, superseded by D-103/D-104/D-108), D-20 (answered by D-49), D-28 (the receipt's mechanism, superseded by D-76/D-78), D-39 (v0.4 superseded by D-125; v0.3 now in the repository as provenance), D-41 (L-13 corrected by D-130). **D-33 was carried with a divergence against §6.2**, raised as MINE and ruled the same day — see D-133 below.
- `spec/pins.json` written as the machine-readable form of §1.6 (§18.4). All ten standards pins filled and verified against the recon drafts — six HCS blobs at `hiero-ledger/hiero-consensus-specifications @ 7046156c`, four x402 blobs at `x402-foundation/x402 @ 0c04a84e`. 32 pins are null and T-P9-2 blocks any claim: the `$POSTAGE` token and treasury on both networks, and the HCS-13 `schemaRef` and digest of all fourteen schemas.
- `spec/schemas/` stubbed: the fourteen files §18.5 names, one per §5 object and the §9.1 declaration, JSON Schema 2020-12. Observed objects (`settlement`, `postmark`) describe rather than constrain, per §5.1. Constraints not expressible in JSON Schema carry a `$comment` naming the test that holds them instead — `chunk` records that `nx` cannot be checked against `n` declaratively, so T-P1-11 and T-P9-3 are the court.
- Commit hygiene: `DCO` (Developer Certificate of Origin 1.1), `CONTRIBUTING.md` (the chain of custody, the spec-change procedure, register discipline, Conventional Commits types and scopes, the AI clause), and `.githooks/commit-msg` enforcing both. Enable with `git config core.hooksPath .githooks`.
- `README.md` rewritten; `spec/vectors/`, `conformance/` and `app/` given READMEs stating what goes in each and under what rules.
- Path references corrected after the move: `CLAUDE.md` §1 items 1, 2 and 4 and §4's layout block; `CHANGELOG.md`'s 0.5.0 link.

### 2026-09-07 — three decisions, D-132 – D-134 **[S]** rulings, **[CC]** text

None of the three amends a specification sentence, so no `CHANGED` marker is placed and the frozen 0.5.0 text is byte-identical to the initial commit. The register stays at 83 (78 core + 5 extension); the extract-and-diff passes both ways.

- **D-132 — the `x402-usdc` leg settles through the x402.org facilitator on `hedera:testnet`.** `https://x402.org/facilitator`, scheme `exact`, asset USDC `0.0.429274` (6 dp), facilitator fee payer `0.0.9185802`, no signup, key, or credit. FETCHED twice: the docs page Sonic named, 2026-09-07 (networks include `hedera:testnet` and no Hedera mainnet; testnet USDC `0.0.429274`/6 dp — that page names no fee payer and no endpoint), and the live `/supported` read of 2026-09-06 in the recon, which is where the fee payer stands. A deployment fact, not a §1.6 pin: it goes in the price list as `methods[].facilitator`, in `LIMITATIONS.md` L-11, and **not** in `spec/pins.json`. Closes the `STATUS.md` §6 item and fills its §4 row. Two limitations unsoftened: the Hedera scheme's replay rule is a SHOULD, so the Postmaster's durable record is what prevents a second purchase (T-P11-5, T-P11-6), and `hedera:mainnet` has no facilitator anywhere.
- **D-133 — `resolve` is one profile, one resolution, one proof.** Closes the divergence between carried D-33 and §6.2 that the backfill surfaced. §6.2 confirmed as written; the sender's choice is what the optional `profile` argument is for, and the choice happens before the proof is made, since by assembly the manifest is published and its hash is what the AAD commits. A multi-profile implementation calls `resolve` once per profile. `spec/adr/D-033.md` now points here instead of recording an open divergence.
- **D-134 — T-P15-3's sketch follows the D-74 reserve on *declaration* and records the substance of §1.5.** Ledger §A's row now reads for a **claim**, names `suite.reportDigest` (the field §5.10 actually gives it) rather than a `report` field no object has, and states §1.5's requirement — a claim names no class whose suite did not pass in full — keeping the digest check as the mechanism. Not a version change under §1.7: nothing conforms while T-P9-2 blocks every claim, and the test is not moved, only brought onto the requirement it always answered to.

`spec/adr/D-132.md`, `D-133.md`, `D-134.md` written; ledger §B rows added; ledger §A row T-P15-3 amended; ledger §G items 2, 3 and 4 marked done or closed. **§18.2's ADR index is not extended past D-131** — it indexes decisions that shaped the specification's text, and these three shape none of it; extending an appendix of the frozen document would carry markers for no change. **MINE**, procedural, reversible.

### 2026-09-07 — housekeeping **[CC]**

- `recon/` — the five reconnaissance reports and four pins drafts, with a README on what each is the source of and the two things to carry forward (digests are over raw git blob bytes; four of six standards are Draft).
- `provenance/` — v0.3, the handoff, the day-one USPS/PES research, and the Excalidraw scope map, with a README stating plainly that they bind nothing, that the invariant identifiers moved (§18.3's concordance), and which carried decisions were superseded.
- Path references updated for both moves: `CLAUDE.md` §1 items 3 and 4, all 41 backfilled ADRs, `spec/adr/TEMPLATE.md`, `spec/adr/D-132.md`, `spec/pins.json`'s `provenance.standardsSource`, `STATUS.md` §3 step 0, `README.md`. Ledger §H's intro now names the pins JSONs correctly — they are `*.pins.draft.json`, not `*_pins_draft.json`.
- `STATUS.md` §6: LICENSE closed (Apache 2.0, a `CLAUDE.md` §3 non-negotiable, present since the initial commit, named in `README.md` and `CONTRIBUTING.md`, DCO 1.1 and no CLA) and the facilitator closed by D-132. A **Next** paragraph names the HCS/HTS operations that come before any WISHMail code.

### 2026-09-07 — the ADR set completed to D-1 – D-134 **[S]** direction, **[CC]** text

Ninety files written, `D-042.md` – `D-131.md`, closing the gap raised earlier the same day. `spec/adr/` now holds **134 files, D-1 – D-134, no gaps**, so §18.2's "kept in `spec/adr/`, one file each" is true of the whole record and not only of the part that predates the ledger.

- **Ledger §B is the source of truth for D-42 – D-131, and each file quotes its row verbatim** under `## Decision`, unaltered. Context, Alternatives and Consequences sit beside it as Claude Code's reading, and each file says so in its own Provenance: where the reading and §B differ, §B governs; where either and the specification differ, the specification governs. Titles and shaped sections come from §18.2.
- **Tests are derived, not asserted.** Each file's `Tests:` field is the set of tests the `Conformance:` notes in that decision's shaped sections actually carry, extracted from the specification — and labelled as such, so it reads as "the tests registered in the sections this decision shaped", never as a claim that the decision added them.
- **Alternatives are recorded or absent.** Where ledger §B names a fork it is written up (D-104's social-committee fallback for unanchored agents; D-117's *affidavit* against *appraisal*; D-91's fork D; D-49's non-fungible stamp against the HIP-991 measurement). Where §B records none, the file says "None recorded" rather than inventing one.
- **`Supersedes`/`Superseded` are reciprocal across all 134 and machine-checkable.** Writing them surfaced chains that a reader of an old §B row would otherwise walk into: D-51's doorbell fee is collected *by the recipient* until D-105 makes it consumed by the treasury; D-62's `CHUNK_WIRE_MAX` is 1024 until D-96 makes it 1000; D-61's HPKE `info` is `wishmail/0.4/seal` until D-125; D-69 names an `agentfacts` profile and a social-committee `hol` until D-97/D-98 and D-104; D-53 writes the AAD as a `‖` concatenation until D-56 makes it canonical JSON, and its key names stand until D-127. Two links were overstated on the first pass and corrected: D-53 builds on D-26 without superseding it, and D-93 corrects a grammar that was no decision's content.
- `spec/adr/TEMPLATE.md` now states the coverage, the three provenances, and the reciprocity rule, with the note that a superseded ADR is never edited away — it keeps its text and gains the pointer, because the reasoning that was overtaken is the part a reader needs. Ledger §G item 4 updated to match.

No specification sentence changed; `spec/WISHMAIL_SPEC_v0_5.md` remains byte-identical to the initial commit.

### 2026-09-07 — audit pass before the first push **[CC]**

A read of every surface against its source, rather than a re-run of the checks that already passed. Eight things were wrong; all eight are fixed.

- **`spec/schemas/stamp-receipt.schema.json` carried a `rate` field that §5.4 does not give `StampReceipt`.** Added on Claude Code's own authority because §14.3 says "the receipt records the rate used and when" — which is coding around a gap instead of raising it. Removed; the schema tracks §5.4 exactly, and the gap is raised below.
- **The `Tests:` derivation under-reported six ADRs.** A bare chapter reference (`§8`, `§9`, `§14`, `§16`, `§1`) matched only the chapter's own preamble and not its subsections, and D-99's `§9.2 – §9.5` range matched only its endpoints. D-63, D-66, D-99, D-105, D-116 and D-131 now carry the right sets; the ADRs that still say "none registered" — §12, §17, §18, §19 and the rest — say it correctly, because those sections carry no `Conformance:` notes.
- **`evidence-bundle` made `observations` optional and `price-list` made `payTo`/`facilitator` both optional.** §5.10 lists `observations` without a `?` and marks only `integrity` optional inside it; §14.3 writes `payTo | facilitator` as a choice. Both now track the text.
- **`CONTRIBUTING.md`'s own example commit would have been rejected by `.githooks/commit-msg`** — scope `chunk` is not in the allowed list, and the subject was 73 bytes against a 72-byte limit. Corrected to `spec(schemas): fix nx top-level, forbidden on the last chunk` (60 bytes) and verified by running the hook against it.
- **`.gitignore` matched `*.env`, which does not catch `.env.local` or `.env.testnet`.** Under P-13 that is a live secret-leak path. Now `.env*` with `!.env.example`, verified. Node, build and editor ignores added while there.
- **`provenance/README.md` named the old invariants by their new names.** v0.3's `P-1` is *keyless verification* (merged into P-3 here), not "public-data replay"; `P-2` is *payment–envelope binding*. Corrected against §18.3, with `P-3` → `P-13` added.
- **Two unsupported claims in the carried ADRs.** D-18 called HOL "the largest Hedera agent registry" — the recon measured its Hedera-native registries at 33, 359 and 2 agents against 249,167 aggregated, so the superlative is not supportable; reworded and the measurement cited. D-19 called HCS-13 and HCS-25 "Hashgraph Online standards"; they are HCS standards, canonically in `hiero-ledger`.
- **D-9 asserted what HOL Guard is and dropped what the record qualifies.** The handoff calls it an open GitHub action doing plugin scanning and syntax validation, and marks feasibility *unverified* — with its applicability to a WebMCP/MCP repository still open as ledger §D item 7. Both restored.

Also checked and correct: all 90 verbatim §B quotes equal their ledger cell exactly (the row parser splits on `|`, so a pipe inside a row would have truncated one silently — none did); the supersession graph is reciprocal across all 134 ADRs, after correcting two overstated links (D-53 builds on D-26 without superseding it; D-93 corrects a grammar that was no decision's content); L-1 – L-14 in order; the hook rejects a bad subject and a missing sign-off.

### Raised, not ruled on

- **§5.4 against §14.3 — `StampReceipt` has no `rate`.** §14.3 requires that a receipt priced by reference to another asset record "the rate used and when"; §5.4's object has no field to record it in, and §5.10's `ConformanceClaim` does not carry it either. Either §5.4's field list is incomplete or §14.3's sentence is loose. The schema tracks §5.4 and the gap stands open. **MINE.**

### Still to do before code

- `spec/vectors/aad.json` and `seal.json` — generated at build step 1 (STATUS.md §3), court for T-P1-4 and T-P1-5.
- The 83 test files of `conformance/`.
- The HCS/HTS artifacts, and the pins they fill: the `$POSTAGE` token and treasury (§4.1), the price topic (§14.3), the per-agent topics of §4.6, and the HCS-13 registration of the fourteen schemas (§5.11).

## [0.5.0] — 2026-09-07

Initial frozen text. `CHANGED` markers begin at this commit (D-131). Wire strings: AAD `"v": "0.5"`, HPKE info `wishmail/0.5/seal`. 19 sections; 83 conformance tests named (78 core + 5 extension), none expanded; every uppercase keyword carries a `Conformance:` note naming a registered test.

### 2026-09-07
- §17 postal grounding approved as amended; every §17 citation verified manually **[S]**; *USPS v. Konan* verified by web scrape and §17.6 cites the FTCA postal exception, 28 U.S.C. §2680(b) (D-120). UPU "single postal territory" framing and the Q-11 price-floor reading approved **[S]**.
- §18 appendices approved; identifier concordance kept inline with a pointer to the ledger (D-121) **[S]**.
- §15.1 states what the Postmaster keeps and for how long; §3.5's promise made true (D-122) **[S]** ruling, **[C]** text.
- §19 open questions drafted and approved (D-123, D-124) **[C]** draft, **[S]** approval. WebMCP named as unpinned and unsurveyed by choice; D-30 (`send` blocks) held.
- Full read-through §1–§19 **[C]**: AAD key names in §5.5/§5.6 aligned to §7.2's normative `{p, v, l, lane, rp, nc}` and `v` sourced from the schemaRef's minor version (D-127); pre-D-104 "hol broker half" sentence struck from §11.4; §6.4 slip postcondition corrected to the treasury as fee collector; "five of six" Draft standards corrected to four against the pins recon (D-129); L-13 aligned to spent-at-affix / consumed-at-settlement (D-130); A2A AgentCard held in §16.8 (D-128); seven smaller text corrections (D-126); 33 `CHANGED` markers stripped (D-131).
- Frozen as 0.5.0; files renamed `WISHMAIL_SPEC_v0_5.md` / `CONFORMANCE_TESTS_v0_5.md` (D-125) **[S]** number, **[C]** freeze.
- `CLAUDE.md`, `CHANGELOG.md`, `LIMITATIONS.md`, `STATUS.md`, `TEMPLATE.md` written **[C]**.

### 2026-09-06
- Five reconnaissance reports against pinned sources **[CC]**: `pins-recon`, `nanda-recon`, `hol-x402-recon`, `openconvai-recon`, `impl-study` (+ pins JSONs). Findings filed in ledger §H with file:line.
- Pins filled from `hiero-ledger/hiero-consensus-specifications @ 7046156c` and `x402-foundation/x402 @ 0c04a84e` (D-92) **[CC]** fetch, **[S]** ratification.
- §13 failure modes and §14 payments landed and approved (D-100 – D-111): `$POSTAGE` token (D-100); price list on consensus (D-101); x402 leg BUILD with pins (D-102); HOL broker not a dependency, `hol` reads consensus (D-103, D-104, D-108); doorbell fee consumed by the treasury (D-105); `hbar` leg atomic purchase (D-106); direct HCS-1 memo under `hcs14` (D-107); resource server holds 402 state (D-109); self-registration on an open anchor (D-110); extensions named on the claim (D-111) **[S]** rulings, **[C]** text.
- §15 threat model and limitations landed and approved; §16 extensions drafted, then approved with two forks closed (D-112 – D-117): NANDA email `nativeId` rule struck as an extension and proposed upstream to HCS-14, verified against the NANDA recon (D-112); undefined-ledger-tag MUST moved to the core §5.1, T-P9-11 becomes core (D-113); two ledger tags (D-114); §12 test ranges brought current (D-115); "umpire" struck from §16.2 (D-116); §16.2 opens on "a Verifier's appraisal, signed and witnessed" (D-117) **[S]** rulings, **[C]** text.
- Also this day: `CHUNK_WIRE_MAX` = 1000 (D-96); `nanda` profile named and keyed to the NANDA v2 index (D-97, D-98); per-profile conformance notes (D-99); memo rule (D-94); lanes read in full (D-95); UAID grammar (D-93).
- v0.4.1 → v0.4.2 carry-forward; three stale ledger sketches corrected (T-P9-7, T-P9-8, T-P12-6) **[C]**.
- §17 and §18 drafted (D-118, D-119) **[C]**.

### 2026-09-05
- v0.4 §1 – §12 landed and approved (D-44 – D-91) **[S]** rulings, **[C]** text: conformance classes and the pedestal; three acts; app-level chunking, no HCS-1 for content (D-46); the Postmaster pays, the agent signs (D-47); no Sponsor (D-48); fungible stamp (D-49); weight (D-50); consumption (D-51); orphans not refunded (D-52); AAD composition (D-53); provisioning paths (D-54); one hashing rule (D-56); the six tool names (D-58); the lane, deterministically (D-60); HPKE sealing (D-61); trust classes (D-63); the fourth weld (D-64); epochs (D-65); two machines (D-66); state from evidence (D-67); `attest` as extension (D-68); profiles and the one declaration (D-69); manifest topic (D-73); ScheduleSign return receipt (D-76 – D-78); proof of posting is chunk 0 (D-79); evidence vs observations (D-82); the chain from the header (D-87); standing order and reasons as test IDs (D-88); versioning (D-89); `schemaRef` as HCS-13 HRL (D-90).

### 2026-09-04
- ETHOnline 2026 window opens (Sept 4 – 16). Start Fresh: the build originates in this window **[S]**.
- Day-1 planning: research briefs brought by Sonic — AAIF, ANS/HOL, Attestify, USPS/PES, NANDA, HCS catalog (`RESEARCH_*_2026-09-04.md`) **[S]**; Imran/AgenTrust posture note **[S]**.
- Spec skeletons v0.1 and v0.2; handoff document; v0.3 spec with invariants P-1 – P-17, failure modes F-1 – F-11, open questions Q-1 – Q-14, decisions D-1 – D-41, the six-tool surface, and the build set ranked by Sonic (D-23) **[S]** decisions, **[C]** text.
- Scope map (Excalidraw) ratified: green/blue = BUILD, orange = STRETCH, dashed = SPEC or VENUE **[S]**.
- Repo posture set: one monorepo mirroring `agentrust-io` (spec/, conformance/, app/); DCO; Conventional Commits; ASCII diagrams; the AI clause **[S]**.
- Conformance classes and the resolution/reconciliation split (D-42, D-43) **[S]**.

[Unreleased]: ./
[0.5.0]: ./spec/WISHMAIL_SPEC_v0_5.md
