# WISHMail on `hedera:testnet` — every entity, and which of them operate

<!-- GENERATED FILE. Do not edit.
     Written by `npm run entities:md` from `app/deployment/hedera-testnet.json` and `spec/pins.json`.
     `npm run check:entities` asserts that this file is what those sources produce; a hand-edit fails it. -->

**Ledger** `hedera:testnet` · **specification** 0.5.13 · **minor version** 0.5 · testnet only at this version (§15.5).

This file is generated and is never hand-edited. Two records already say what is on the ledger — the ops record,
written one entity at a time from mirror-node reads, and `spec/pins.json`, which is §1.6 in machine-readable form —
and a third written by hand would be a third place for an id to be wrong, and the place a reader trusts, because it
is the readable one.

## The deployment — what operates

On `hedera:testnet`. Every id below was read back from a mirror node, never from an SDK receipt (D-144), and
each row names the transaction that created it. The ops record carries a `specTag` per entity, because the eleven of
Step 2 were provisioned against a different text from the fourteen of Step 4, and one tag over both would be false.

### Postage

| What | Id | What it is | Created by |
|---|---|---|---|
| **$POSTAGE** | [`0.0.10426208`](https://hashscan.io/testnet/token/0.0.10426208) | `POSTAGE`, 0 decimals, INFINITE supply — the stamp token §1.6 pins. No admin key, no freeze key, no pause key, no wipe key: what it cannot do is the point (§4.1). | [`0.0.8641261@1788894041.839314449`](https://hashscan.io/testnet/transaction/0.0.8641261@1788894041.839314449) |
| **Treasury** | [`0.0.10426205`](https://hashscan.io/testnet/account/0.0.10426205) | Holds the unissued supply, and collects every stamp consumed — §4.3 and §4.4’s doorbell fee alike. | [`0.0.8641261@1788894030.895915675`](https://hashscan.io/testnet/transaction/0.0.8641261@1788894030.895915675) |

### The price list (§14.3)

| What | Id | What it is | Created by |
|---|---|---|---|
| **Price topic** | [`0.0.10426551`](https://hashscan.io/testnet/topic/0.0.10426551) | Memo `wishmail:prices:1`. §14.3: the schedule is on consensus before it is charged, and the current price is the message current at the purchase. | [`0.0.8641261@1788895943.054415671`](https://hashscan.io/testnet/transaction/0.0.8641261@1788895943.054415671) |
| **PriceList, sequence 1** | `0.0.10426551` #1 | 563 bytes, sha256 `20aa3b010709d9ffc686ed8b42882e0c8f66366fff79dc5855298646bb0d00b5`. The first schedule; `provisioning` omitted. | [`0.0.8641261@1788895947.603820976`](https://hashscan.io/testnet/transaction/0.0.8641261@1788895947.603820976) |
| **PriceList, sequence 2** | `0.0.10426551` #2 | 637 bytes, sha256 `14d1ee1b6fec4d5e4eeed466a009c328c5fd04445193d498dd42adf5dc76547c`. Prices the provisioned path: 2 ℏ, registration fee 0.05 ℏ (D-159’s addendum). **This is the schedule Gate One buys at.** | [`0.0.8641261@1788989976.210208773`](https://hashscan.io/testnet/transaction/0.0.8641261@1788989976.210208773) |
| **PriceList, sequence 3** | `0.0.10426551` #3 | 666 bytes, sha256 `d5f1f6fb19e0f110c905c00c082b4f3df8172466b8140cb3df4c0246e8f275ae`. The hbar rate is read from the NETWORK's own exchange rate, which a mirror node serves with a timestamp filter — so a Verifier holding a receipt's `rate.at` obtains exactly what the Postmaster read (D-170). | [`0.0.8641261@1789004837.951853257`](https://hashscan.io/testnet/transaction/0.0.8641261@1789004837.951853257) |
| **PriceList, sequence 4** | `0.0.10426551` #4 | 667 bytes, sha256 `03a553856cbae698c21c622a89f3711410dc55a7f8f1eda843134524c04330ec`. Reprices the provisioned path at 30 ℏ. Sequences 2 and 3 published 2 ℏ, set before a HIP-991 fee-gated topic had been created on this network; Gate One measured one mailbox at 27.78102934 ℏ, of which the doorbell alone is 26.31542199 ℏ. Registration fee unchanged at 0.05 ℏ. **This is the schedule current now.** | [`0.0.8641261@1789055853.203536189`](https://hashscan.io/testnet/transaction/0.0.8641261@1789055853.203536189) |

§14.3 makes the schedule the *sequence* of messages, so a new schedule is a new message and no published one is
ever edited. **The price current at a purchase is the latest message before it**, so the last row above governs.

### The Postmaster-agent

The Postmaster runs a Correspondent of its own (§3.5), and it is provisioned from the same six-row template every
Correspondent is — `app/src/ops/template.ts`, read by both provisioners and by the counter’s carry policy.

| What | Id | Declared shape | Created by |
|---|---|---|---|
| **Account** | [`0.0.10426206`](https://hashscan.io/testnet/account/0.0.10426206) | The agent’s own account, under the agent’s own key. | [`0.0.8641261@1788894037.389411178`](https://hashscan.io/testnet/transaction/0.0.8641261@1788894037.389411178) |
| **Doorbell** (HCS-10 inbound) | [`0.0.10426553`](https://hashscan.io/testnet/topic/0.0.10426553) | memo `hcs-10:0:60:0:0.0.10426206` · no submit key · admin key the agent’s · HIP-991 fee of 1 $POSTAGE to the treasury (§4.4) · the agent’s key exempt (D-137) | [`0.0.8641261@1788895951.943923730`](https://hashscan.io/testnet/transaction/0.0.8641261@1788895951.943923730) |
| **Log** (HCS-10 outbound) | [`0.0.10426554`](https://hashscan.io/testnet/topic/0.0.10426554) | memo `hcs-10:0:60:1` · submit key the agent’s · admin key the agent’s | [`0.0.8641261@1788895954.671556678`](https://hashscan.io/testnet/transaction/0.0.8641261@1788895954.671556678) |
| **Manifest topic** | [`0.0.10426591`](https://hashscan.io/testnet/topic/0.0.10426591) | memo `wishmail:manifest:1` · submit key the agent’s · admin key the agent’s | [`0.0.8641261@1788896134.080208852`](https://hashscan.io/testnet/transaction/0.0.8641261@1788896134.080208852) |
| **Declaration registry** (HCS-2) | [`0.0.10428113`](https://hashscan.io/testnet/topic/0.0.10428113) | memo `hcs-2:0:60` · submit key the agent’s · admin key the agent’s | [`0.0.8641261@1788904726.585140041`](https://hashscan.io/testnet/transaction/0.0.8641261@1788904726.585140041) |
| **Profile file** (HCS-1) | [`0.0.10428178`](https://hashscan.io/testnet/topic/0.0.10428178) | memo `0cc6a7aa1b4fc4eb3e8aa9b575e484728cb111262e8ede647e75887ac64e015e:brotli:base64` · submit key the agent’s · **no admin key** (D-150) | [`0.0.8641261@1788905026.804503619`](https://hashscan.io/testnet/transaction/0.0.8641261@1788905026.804503619) |

§9.2’s chain runs account memo → declaration registry → profile file → `properties.wishmail`, and it resolves: that
is what `npm run check:hcs14` walks and what the resolver is run against before anything else is built on it.

### The fourteen registered schemas (§5.11, HCS-13)

§18.5 fixes fourteen schema files by name. Each is an HCS-1 file topic holding the schema’s bytes and an HCS-2
registry topic naming it; the `schemaRef` pins a version to a **sequence number on that registry**, which is what a
chunk’s `schemaRef` dereferences (§5.11). **§1.7 has fired**: these are registered, so no file in `spec/schemas/`
moves again under 0.5.

| Schema | File topic (HCS-1) | Registry topic (HCS-2) | `schemaRef` | sha256 |
|---|---|---|---|---|
| `attempted-delivery-slip` | [`0.0.10448526`](https://hashscan.io/testnet/topic/0.0.10448526) | [`0.0.10448529`](https://hashscan.io/testnet/topic/0.0.10448529) | `hcs://13/0.0.10448529#1` | `f87178d4c4683ecd5495ec69ad437cedaf5c61d46d0dca778fac1e68746facca` |
| `chunk` | [`0.0.10448507`](https://hashscan.io/testnet/topic/0.0.10448507) | [`0.0.10448509`](https://hashscan.io/testnet/topic/0.0.10448509) | `hcs://13/0.0.10448509#1` | `af96d14f28628027e7ccaa15cfac66ac002db3bc80e8272a7c2352adcfadc3ec` |
| `conformance-claim` | [`0.0.10448547`](https://hashscan.io/testnet/topic/0.0.10448547) | [`0.0.10448551`](https://hashscan.io/testnet/topic/0.0.10448551) | `hcs://13/0.0.10448551#1` | `430d4e2fc0d7a1d04e1fea2b47734fc5d84249031c19f5b435a053e4249493cc` |
| `declaration` | [`0.0.10448556`](https://hashscan.io/testnet/topic/0.0.10448556) | [`0.0.10448560`](https://hashscan.io/testnet/topic/0.0.10448560) | `hcs://13/0.0.10448560#1` | `59c6a779e1bc57377a63ed85cd0dae102dec61fa05fb3c00f617ee68fd469dcc` |
| `envelope` | [`0.0.10448498`](https://hashscan.io/testnet/topic/0.0.10448498) | [`0.0.10448503`](https://hashscan.io/testnet/topic/0.0.10448503) | `hcs://13/0.0.10448503#1` | `aa85c277596de1c74d2d03c13c9b25f4fb8b34ae0c1b6a0e36968e71f1207937` |
| `evidence-bundle` | [`0.0.10448532`](https://hashscan.io/testnet/topic/0.0.10448532) | [`0.0.10448537`](https://hashscan.io/testnet/topic/0.0.10448537) | `hcs://13/0.0.10448537#1` | `248fdaae31aeb761aa5474f497d2219804b0e41569eb0120356d91e3a7e0f912` |
| `mail-coordinates` | [`0.0.10448477`](https://hashscan.io/testnet/topic/0.0.10448477) | [`0.0.10448480`](https://hashscan.io/testnet/topic/0.0.10448480) | `hcs://13/0.0.10448480#1` | `ba3abb30e43e2ba3fbce0fc431da6b95954cce348ca0e8038ea716168d24fbdb` |
| `narrative` | [`0.0.10448540`](https://hashscan.io/testnet/topic/0.0.10448540) | [`0.0.10448544`](https://hashscan.io/testnet/topic/0.0.10448544) | `hcs://13/0.0.10448544#1` | `b06588bbb9c6b44c0ef960cdfa0437372924ed87d4d0c0ce4c3253da4ca361d6` |
| `postmark` | [`0.0.10448510`](https://hashscan.io/testnet/topic/0.0.10448510) | [`0.0.10448513`](https://hashscan.io/testnet/topic/0.0.10448513) | `hcs://13/0.0.10448513#1` | `99d02ab5a39ffb339606c83d8abfc9f07cd6b28c79fccbe717edf75205cc91fd` |
| `price-list` | [`0.0.10448565`](https://hashscan.io/testnet/topic/0.0.10448565) | [`0.0.10448570`](https://hashscan.io/testnet/topic/0.0.10448570) | `hcs://13/0.0.10448570#1` | `f772d558cf738f041fc129a9640139d62a4f13f9d7a3c9b31640cd3258efef77` |
| `proof` | [`0.0.10448471`](https://hashscan.io/testnet/topic/0.0.10448471) | [`0.0.10448473`](https://hashscan.io/testnet/topic/0.0.10448473) | `hcs://13/0.0.10448473#1` | `e4ebeabad267c98184e0e18c099b9f0dfd43e473665ef44668fc2944c93a9970` |
| `return-receipt` | [`0.0.10448514`](https://hashscan.io/testnet/topic/0.0.10448514) | [`0.0.10448518`](https://hashscan.io/testnet/topic/0.0.10448518) | `hcs://13/0.0.10448518#1` | `d4a25c5f64e91adbe3dba0686c05c5e9cae0ac19209fc4fcc50d27b948a512a8` |
| `settlement` | [`0.0.10448487`](https://hashscan.io/testnet/topic/0.0.10448487) | [`0.0.10448492`](https://hashscan.io/testnet/topic/0.0.10448492) | `hcs://13/0.0.10448492#1` | `ad265c1c2df0a65ebd1f75fd8cbee6f8a084dfe2b9acbf7e9667359d02d062e6` |
| `stamp-receipt` | [`0.0.10448482`](https://hashscan.io/testnet/topic/0.0.10448482) | [`0.0.10448486`](https://hashscan.io/testnet/topic/0.0.10448486) | `hcs://13/0.0.10448486#1` | `fab6540859a8ba60be404e306e40100650a69fc779664b06e5438c3373b1fd37` |

14 schemas. A release's shipped `spec/schemas/<name>.schema.json` must digest to the `sha256` above;
`npm run check:schemas` is what asserts it.

---

## RESIDUE — NOT OPERATING

**Everything below is on `hedera:testnet` and none of it is the deployment.** It is here because a mirror node
cannot tell them apart and a reader should not have to. Three `$POSTAGE`-shaped tokens exist on this network and
exactly one is the stamp token; the other two were minted to prove a mechanism and are worth nothing.

Most of it cannot be removed, and the reasons are the same two: a token with **no admin key** cannot be deleted —
which is the posture under test, and the one the real token has — and a token’s treasury cannot be removed while
the token exists. An HCS-1 file topic has no admin key either (D-150), so a superseded one is permanent.

| Kind | What | Id | Why it is here, and why it is not ours |
|---|---|---|---|
| topic | manifest | [`0.0.10426557`](https://hashscan.io/testnet/topic/0.0.10426557) | Superseded by the delete-one half of the acceptance test in app/OPERATIONS.md §4: this row was removed from the record and the run created a new instance of that entity type and nothing else, which is what the test asserts. This topic exists on the ledger, carries the agent as its sole submit key and its admin key, and is not the deployment’s manifest topic. It is recorded here so that entities holds exactly one manifest and no reader is left wondering what an orphan topic is. Deletable under its admin key; left in place as the evidence the test ran. |
| topic | agent.profileFile | [`0.0.10428112`](https://hashscan.io/testnet/topic/0.0.10428112) | The first declaration hashed the agent under version "1.0.0" while the HCS-11 profile carried version "1.0". An HCS-11 profile has exactly one version field, and §9.5 recomputes an agent identifier "from the profile's name, version, and skills", so the published uaid was not recomputable from the profile that carried it — found by resolving our own address and failing. §9.2:1284 provides the remedy: "Rotation is a new profile file registered as a new entry; prior entries stay on the registry topic." An HCS-1 file topic has no admin key (D-150), so this one is permanent and is recorded here rather than deleted. It is not the deployment's profile file; the registry's current entry names the second. |
| topic | proof schema file (HCS-1) | [`0.0.10448375`](https://hashscan.io/testnet/topic/0.0.10448375) | Step 4's first run, 2026-09-09. This topic was created correctly — the memo carries the proof schema's digest and the agent is its sole submit key, with no admin key per D-150 — and then the chunk step wrote an unreadable file into it and the run stopped. The defect was ours and it is fixed in the same change: `ops/hcs1.ts` bounded an HCS-1 chunk's CONTENT at 1024 bytes where the bound belongs on the whole message, so `{"o":N,"c":"…"}` came to 1037 bytes, and the SDK silently split each chunk across two consensus messages. Neither half is parseable JSON on its own, which is what the run's own readback reported: "Unterminated string in JSON at position 1024". This topic therefore holds five messages that are three half-chunks and cannot be reassembled by any reader. It carries no admin key, because HCS-1 forbids one (hcs-1.md:48-49, D-150), so it can never be deleted and its messages can never be withdrawn. It is recorded here so that `entities` holds exactly one proof schema file and no reader is left wondering what an orphan topic is. A new file topic was created for the corrected chunks. Nothing was pinned from this one: `spec/pins.json` was still fully unfilled when the run stopped, so no `schemaRef` names it and no claim could ever have cited it. |
| account | probe treasury (HIP-991, first attempt) | [`0.0.10425722`](https://hashscan.io/testnet/account/0.0.10425722) | The 2026-09-08 HIP-991 probe stopped at the topic create on INSUFFICIENT_TX_FEE — a 20 ℏ cap, too low for a fee-gated topic, and not a rejection of the fee configuration — leaving this run behind. It holds the float of token 0.0.10425725, which has no admin key and therefore cannot be deleted, so its treasury cannot be removed either. Inert: its key was born in that process and discarded. |
| account | probe owner (HIP-991, first attempt) | [`0.0.10425723`](https://hashscan.io/testnet/account/0.0.10425723) | A throwaway identity of the same stopped run. Its key was born in that process and discarded. |
| account | probe stranger (HIP-991, first attempt) | [`0.0.10425724`](https://hashscan.io/testnet/account/0.0.10425724) | A throwaway identity of the same stopped run. Its key was born in that process and discarded. |
| token | probe stamp (HIP-991, first attempt) | [`0.0.10425725`](https://hashscan.io/testnet/token/0.0.10425725) | A $POSTAGE-shaped token minted for the stopped run and worth nothing. It carries NO ADMIN KEY, by the posture under test — the real token has none either — and TokenDelete requires one, so it is on testnet permanently. It is not $POSTAGE: §1.6 pins the stamp token and 0.0.10426208 is what it pins. |
| account | probe treasury (HIP-991, run of record) | [`0.0.10425740`](https://hashscan.io/testnet/account/0.0.10425740) | Holds the 10,000 units of probe token 0.0.10425743, which has no admin key and cannot be deleted; a token’s treasury cannot be removed while the token exists. Key born in the run and discarded. |
| account | probe owner (HIP-991, run of record) | [`0.0.10425741`](https://hashscan.io/testnet/account/0.0.10425741) | A throwaway identity of the run that proved D-137’s exemption. Key born in the run and discarded. |
| account | probe stranger (HIP-991, run of record) | [`0.0.10425742`](https://hashscan.io/testnet/account/0.0.10425742) | A throwaway identity of the run that proved D-137’s exemption. Key born in the run and discarded. |
| token | probe stamp (HIP-991, run of record) | [`0.0.10425743`](https://hashscan.io/testnet/token/0.0.10425743) | The token the 2026-09-08 probe proved §4.4’s doorbell fee against, 10,000 units, no admin key by the posture under test and therefore undeletable. Permanently on testnet, and written down here so that nobody reading a mirror node has to wonder what the second $POSTAGE-shaped token is. |
| topic | probe doorbell (HIP-991, run of record) **(deleted)** | [`0.0.10425746`](https://hashscan.io/testnet/topic/0.0.10425746) | The fee-gated topic the probe created and DELETED under its admin key, in a finally, on every path. It reads deleted: true, with its final fee_exempt_key_list still visible — the amendment, after deletion. |
| account | probe treasury (HIP-542) | [`0.0.10446531`](https://hashscan.io/testnet/account/0.0.10446531) | Holds the float of probe token 0.0.10446532. Its key was born in the 2026-09-09 run and discarded, so nobody can ever move those units, including us. |
| token | probe stamp (HIP-542) | [`0.0.10446532`](https://hashscan.io/testnet/token/0.0.10446532) | "WISHMail HIP-542 probe stamp", P542, decimals 0, born at 0 and minted 10, for the run that established that a token transfer to a public-key alias creates the account. Inert and undeletable, and not $POSTAGE. |
| account | the account the HIP-542 probe was written to find | [`0.0.10446534`](https://hashscan.io/testnet/account/0.0.10446534) | Nobody created it — it was BOUGHT, by a token transfer to a public-key alias, which is the mechanism D-159 step 2 and T-P16-1 rest on. Its key was born in that run and discarded; it holds 0.05 ℏ and no token and will expire on its own. |

Nothing here is in `spec/pins.json`, nothing here is in `entities`, and nothing here is charged for, read from, or
written to by any code in this repository.

---

## DEMO AGENTS

From `app/deployment/demo-agents.hedera-testnet.json`, snapshotted from each home’s own `record.json`. Every id
below is public and nothing here is a key: a home’s config and keystore are never read (P-13).

| Agent | Status | Account | Operator wallet | Purchase reference |
|---|---|---|---|---|
| a | **stopped** | `0.0.10451893` | — | `0.0.8641261@1789006030.569861064` |
| a2 | **provisioned** | `0.0.10462700` | `0.0.10450879` | `0.0.8641261@1789058834.851527600` |
| b | **provisioned** | `0.0.10452127` | `0.0.10450880` | `0.0.8641261@1789007373.238805114` |
| c | **provisioned** | `0.0.10468684` | `0.0.10450880` | `0.0.8641261@1789088736.041814712` |

**An operator may own many agents** (D-165): the wallet is the operator’s, the home is the agent’s, and a fresh
home is a new agent. The operator wallet above is read from **consensus** and never from a home’s config, which is
never opened (P-13) — every topic a mailbox owns names its operator as the auto-renew account, because the
Postmaster sells a mailbox once and does not undertake to renew it. An agent whose purchase stopped owns no topic,
so no row on consensus names its operator and the column is `—`; its wallet is known only to its own home.

**`stopped` means the account was bought and paid for and the mailbox was never finished.** The transfer is on
consensus, the account holds its stamps and its registration fee, and nothing was charged twice — a transaction
id is single-use. What is missing is the six topics and the receipt. Gate One (2026-09-09) stopped one purchase
this way: a defect deleted the counter’s record of the sale — the quote it charged and the rate it charged at —
before the receipt was built, and §5.4 builds a receipt from those, so no receipt exists and none was
reconstructed, because reconstructing it would manufacture the evidence a receipt is. The defect is fixed. The
reference above was restored to that agent’s home from consensus alone. `app/OPERATIONS.md` Step 5 has the run
of record.

| Agent | What | Id | Payer of record |
|---|---|---|---|
| a | the provisioning purchase this agent was bought by | `0.0.10451893` | `0.0.8641261` |
| a2 | the provisioning purchase this agent was bought by | `0.0.10462700` | `0.0.8641261` |
| a2 | doorbell (HCS-10 inbound) | [`0.0.10462704`](https://hashscan.io/testnet/topic/0.0.10462704) | `0.0.8641261` |
| a2 | log (HCS-10 outbound) | [`0.0.10462708`](https://hashscan.io/testnet/topic/0.0.10462708) | `0.0.8641261` |
| a2 | manifest | [`0.0.10462713`](https://hashscan.io/testnet/topic/0.0.10462713) | `0.0.8641261` |
| a2 | declaration registry (HCS-2) | [`0.0.10462719`](https://hashscan.io/testnet/topic/0.0.10462719) | `0.0.8641261` |
| a2 | HCS-11 profile file (HCS-1) | [`0.0.10462723`](https://hashscan.io/testnet/topic/0.0.10462723) | `0.0.8641261` |
| a2 | HCS-11 profile, as HCS-1 chunks | `0.0.10462723` | `0.0.8641261` |
| a2 | HCS-2 register entry naming the profile file | `0.0.10462719` | `0.0.8641261` |
| a2 | §9.2’s account memo, the first link in the chain | `0.0.10462700` | `0.0.8641261` |
| a2 | the agent’s own registration on the HOL anchor (§9.5, T-P13-4) | `0.0.6913983` | `0.0.10462700` |
| b | the provisioning purchase this agent was bought by | `0.0.10452127` | `0.0.8641261` |
| b | doorbell (HCS-10 inbound) | [`0.0.10452149`](https://hashscan.io/testnet/topic/0.0.10452149) | `0.0.8641261` |
| b | log (HCS-10 outbound) | [`0.0.10452150`](https://hashscan.io/testnet/topic/0.0.10452150) | `0.0.8641261` |
| b | manifest | [`0.0.10452154`](https://hashscan.io/testnet/topic/0.0.10452154) | `0.0.8641261` |
| b | declaration registry (HCS-2) | [`0.0.10452155`](https://hashscan.io/testnet/topic/0.0.10452155) | `0.0.8641261` |
| b | HCS-11 profile file (HCS-1) | [`0.0.10452158`](https://hashscan.io/testnet/topic/0.0.10452158) | `0.0.8641261` |
| b | HCS-11 profile, as HCS-1 chunks | `0.0.10452158` | `0.0.8641261` |
| b | HCS-2 register entry naming the profile file | `0.0.10452155` | `0.0.8641261` |
| b | §9.2’s account memo, the first link in the chain | `0.0.10452127` | `0.0.8641261` |
| b | the agent’s own registration on the HOL anchor (§9.5, T-P13-4) | `0.0.6913983` | `0.0.10452127` |
| c | the provisioning purchase this agent was bought by | `0.0.10468684` | `0.0.8641261` |
| c | doorbell (HCS-10 inbound) | [`0.0.10468687`](https://hashscan.io/testnet/topic/0.0.10468687) | `0.0.8641261` |
| c | log (HCS-10 outbound) | [`0.0.10468689`](https://hashscan.io/testnet/topic/0.0.10468689) | `0.0.8641261` |
| c | manifest | [`0.0.10468692`](https://hashscan.io/testnet/topic/0.0.10468692) | `0.0.8641261` |
| c | declaration registry (HCS-2) | [`0.0.10468693`](https://hashscan.io/testnet/topic/0.0.10468693) | `0.0.8641261` |
| c | HCS-11 profile file (HCS-1) | [`0.0.10468695`](https://hashscan.io/testnet/topic/0.0.10468695) | `0.0.8641261` |
| c | HCS-11 profile, as HCS-1 chunks | `0.0.10468695` | `0.0.8641261` |
| c | HCS-2 register entry naming the profile file | `0.0.10468693` | `0.0.8641261` |
| c | §9.2’s account memo, the first link in the chain | `0.0.10468684` | `0.0.8641261` |
| c | the agent’s own registration on the HOL anchor (§9.5, T-P13-4) | `0.0.6913983` | `0.0.10468684` |

**The payer column is the point of it.** Every row of a mailbox names the Postmaster as payer — it provisioned
what it sold (D-168) — and the registration on the HOL anchor names **the agent’s own account**, which is the one
fact §9.5 reads to decide `blurred` and the reason the purchase funds exactly one fee (T-P13-4).

