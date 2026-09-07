# Implementation study: qisma + x402 `upto`

**Date:** 2026-09-06 · **Purpose:** WISHMail specification input · **Mode:** read-only

## Method and scope

Two targets were cloned and read; neither was modified. Nothing was executed against
either codebase (see O-1). All on-chain observation was idempotent public `GET`s
against the free Hedera testnet mirror node. No key, no `.env`, no transaction, no
registration, no purchase.

This is **not** a pin sweep and **not** a source of code. WISHMail will not copy any
line, function, file, or substantial portion from either target. What follows
describes shape and function in my own words, with `file:line` citations so a human
can go look. Short quotations appear only where a design point cannot be described
otherwise.

**Legend.** Every claim is marked:

- **TRACED** — I verified it by running something or by following live on-chain data.
- **READ** — I read it in the source and am reporting what it says.

**Provenance.**

| Target | Repo | HEAD read | Date |
|---|---|---|---|
| A | `github.com/farouk-allani/qisma` | `802000b3333225931a411b7757c45e84f945cf17` | 2026-07-27 |
| B | `github.com/x402-foundation/x402` | `0c04a84eeceace349397274c5785c9ca7fcf9474` | 2026-09-05 |

Target B's `specs/schemes/upto/` was last touched at
`299b9bccd6b3f0578a71c23e9205f0cd249e70b2` (2026-09-04). Target A is 11 commits
total, `5c9a37c` (2026-07-17) through `802000b` (2026-07-27). **TRACED** (`git log`).

Paths below are relative to each repo root. Target A paths are unprefixed;
Target B paths begin `specs/` or `typescript/`.

---

# CONTRADICTIONS

## C-1. Qisma performs no two-asset atomic swap. It explicitly forbids one.

The brief's §4 asks whether qisma swaps "HBAR one way, an HTS token the other" in a
single transaction. It does not, and this is not an omission — it is an enforced
rule. The facilitator rejects any payload carrying token or NFT transfers
(`packages/facilitator/src/validate.ts:45-47`), and the scheme document states the
constraint as a MUST: the bytes must decode to a plain transfer "and carry no token
or NFT transfers" (`docs/SPEC.md:196-197`). The asset is pinned to the literal string
`0.0.0` at the type level (`packages/protocol/src/schemas.ts:83`,
`packages/protocol/src/constants.ts:22`). **READ**

What qisma actually does is **one asset, many outputs**: a single HBAR debit and
four HBAR credits inside one `CryptoTransfer`. That is a *split*, not a *swap*. The
two are structurally different problems: a split needs one signer and nets to zero
in one asset; a swap needs two parties to both sign and nets to zero in two assets
independently.

This matters directly. WISHMail's vending contract (KEY minted against an x402
payment, KEY burned per stamp) is a two-asset problem. **Qisma supplies no precedent
for it.** The precedent it does supply — partial signature collection, fee-payer
separation, the sign-but-do-not-submit pivot — is the *transport* a swap would also
need, and that part transfers cleanly. The swap semantics themselves do not.

## C-2. `exact-multi` is not a registered x402 scheme. It appears nowhere in x402.

Qisma presents itself as "an x402 v2 payment scheme, `exact-multi`"
(`README.md:22-24`) with an `x402 v2` badge beside a `scheme exact-multi` badge
(`README.md:7-8`). The string `exact-multi` does not occur anywhere in the
x402-foundation repository — not in `specs/`, not in `typescript/`. **TRACED**
(repo-wide grep at `0c04a84e`, zero hits).

The registered set is named in `specs/x402-specification-v2.md:281`: "`exact`,
`upto`, `batch-settlement`, and `auth-capture`". Qisma's own SPEC is honest about
its status — its conformance table attributes "Scheme logic" to "this document"
(`docs/SPEC.md:33`) and it is labelled "draft v1.0" (`docs/SPEC.md:3`) — but the
README badges read as conformance to a reader who does not open the spec.

Consequence for WISHMail: a scheme name is free to invent, and the x402 envelope
tolerates it, but a generic client will not know what to do with it. Qisma's answer
to that is C-3.

## C-3. The "graceful degradation to `exact`" path is asserted, not implemented.

`docs/SPEC.md:37-39` claims that a generic client understanding only `exact` "can
still read `payTo` and `amount` and pay the aggregator the total," and that this
degraded path *is* the sequential flow being replaced. The claim is plausible from
the wire shape — `payTo` and `amount` are present and correct in the 402 — but
nothing in the repo exercises it. The resource server rejects any payload whose
`accepted` does not echo the issued `exact-multi` requirements byte for byte
(`packages/facilitator/src/validate.ts:27-30`), and the only client in the repo
searches specifically for `scheme === "exact-multi"` and throws otherwise
(`packages/buyer/src/pay.ts:85-86`). An `exact`-only client would be able to *read*
the offer and would then be refused at settle. **READ**

The degradation is a property of the offer's legibility, not of the server's
behaviour. Worth knowing before WISHMail claims the same property for its own offers.

## C-4. The headline "vanilla x402" comparison is qisma paying itself.

`README.md:188-206` and the compare-mode image caption (`README.md:167`) present
three transactions as "three sequential vanilla x402 payments" / "Sequential x402"
against which the cascade is measured. I pulled all three off the mirror node.
**TRACED**

They are not vanilla anything. All three carry a `qisma:<uuid>` memo, all three are
fee-sponsored by the same facilitator account `0.0.9570295` (which absorbs
286,496 tinybar of fee on each while the buyer moves by exactly the listed price),
and all three wrote receipts to qisma's own HCS topic declaring
`"scheme":"exact-multi"` (topic `0.0.9619357` sequences #6, #7, #8). They are
qisma's own single-output path — `packages/services/src/shared/upstream.ts:50-66`,
the `/paid/data` route, which calls the identical `paidRoute` middleware with a
one-element `outputs` array.

The *arithmetic* survives this. Transaction count (3 vs 1), total fee
(3 × 286,496 = 859,488 vs 716,242 tinybar), and settlement spread (8.28 s between
the first and last consensus timestamp) are all real and reproduce the README's
numbers exactly. What does not survive is the framing: this measures
`exact-multi`-with-one-output against `exact-multi`-with-four, not x402 `exact`
against `exact-multi`. A true `exact` baseline would additionally have charged the
buyer its own fee (see C-5), making the comparison *more* favourable to qisma, not
less — so the error is conservative. But it is an error.

## C-5. Qisma's own git history and HCS topic record the fee-payer bug being fixed. Read it.

This is the most instructive thing in the repository, and it is not in the README.

Receipt topic `0.0.9619357` holds 11 messages. Sequences #1–#4 are a different
schema version — `{"v":1, ..., "resource", "totalAmount"}` — from
2026-07-17T23:46Z. Sequences #5–#11 are `{"v":2,"scheme":"exact-multi", ...}` from
2026-07-25 onward. **TRACED**

The `transactionId` field tells the story. In the v1 receipts it names the **buyer**
(`0.0.9570279@1784331992.551632287`). In the v2 receipts it names the
**facilitator** (`0.0.9570295-1784974977-345649173`). I fetched the v1-era cascade:
the buyer was debited **5,756,658** tinybar — the 5,000,000 price *plus* the
756,658 fee. In the v2 cascade the buyer is debited exactly **5,000,000** and the
facilitator separately absorbs 716,242. **TRACED**

The commit that introduced `feePayer` into the schema is `00c2296`
(2026-07-25 11:44 UTC); the v2 cascade settled at 10:23 UTC the same day. So the fee
sponsorship pattern was designed, run live, and *then* committed.

The second lesson is sharper. `0d3b431` (2026-07-27 14:26 UTC), the final feature
commit, is titled "verify the buyer's signature before sponsoring a fee." It adds
`packages/facilitator/src/signature.ts` (105 lines) and the entire 271-line
facilitator test suite. **Every one of the 11 receipts on the topic predates it** —
the last is 2026-07-26 11:12 UTC. The live demo the README points at as proof was
settled by a facilitator that could not tell a signed payload from an unsigned one.
**TRACED**

Nothing was stolen: the network rejects an unsigned transaction at consensus. What
would have happened is that the sponsor pays the fee anyway, which is exactly the
failure the author documents at `docs/SPEC.md:263`. The author found the hole
himself, two days after the demo, and closed it. That is the right outcome — but a
reader who takes the live links as evidence that the published rule set was
exercised is mistaken.

## C-6. "Sellers hold zero private keys" means the repo holds none. The accounts are keyed.

`README.md:42` states "sellers hold zero private keys," and the party table
(`README.md:44-51`) marks all four sellers "Holds keys: no." The setup script
generates an ED25519 key for each seller, creates the account with that key as the
account key, and prints the key to the terminal
(`packages/facilitator/src/setup.ts:29-40, 58-59`). **READ** I confirmed on chain
that all four accounts carry `ED25519` keys. **TRACED**

The comment at `setup.ts:8-9` is precise where the README is not: the keys are
"printed once, and used by NOTHING in this repo." The real and valuable property is
that a seller **never needs to sign anything to get paid or to verify payment** — it
reads the mirror node (§A-5.2). That is a strong property and it is what makes the
architecture interesting. It is not the same as a keyless account, and WISHMail
should not carry the looser phrasing forward.

## C-7. Qisma settles before the resource runs, and declares no `paymentFlow` for it.

x402 v2 defines three flows (`specs/x402-specification-v2.md:293-297`). The default,
`authorization`, is "verify → resource → settle → respond": funds move only after
the resource completes successfully. `upfront` is "settle → resource → respond".

Qisma's middleware runs `/verify`, then `/settle`, and only then calls the route
handler (`packages/services/src/shared/paid.ts:135, 145, 162`). Money is durably
committed before the resource executes. It has to be — the upstreams are paid by the
cascade and will not serve data until they can see that payment on chain
(`docs/SPEC.md:235`). **READ**

That flow is neither of the spec's shapes: it settles pre-handler like `upfront` but
retains the `/verify` that `upfront` drops. It is strictly *safer* than `upfront`.
But `specs/x402-specification-v2.md:289` makes declaration mandatory — "When the
resolved payment flow is not `authorization`, `PaymentRequired` `accepts[].extra.
paymentFlow` MUST be present so clients can reason about pre-handler fund
commitment" — and `extra` has no `paymentFlow` field
(`packages/protocol/src/schemas.ts:54-67`). A client cannot tell from the offer that
its money will move before it gets anything.

The consequence is visible in the code. `packages/services/src/analyst.ts:58-62`
handles composition failure after settlement with an honest 502 and the comment
"Money already moved atomically; surface the composition failure honestly." That is
the correct handling of an unavoidable state — but WISHMail's own invariant is that a
consequence-bearing action must `Gate`, never silently proceed. Qisma's flow removes
the seam where a Gate would sit.

## C-8. `upto` has two per-network bindings. Its own index lists one. Neither is Hedera.

`specs/schemes/upto/scheme_upto.md:74-78` closes with "Network-Specific
Implementation" and lists exactly one document: EVM. `scheme_upto_svm.md` (953 lines,
84 MUSTs) sits in the same directory, unlisted. **TRACED** (`ls` + `sed`)

This is the identical defect I recorded as C-7 in the HOL/x402 recon, where
`scheme_exact.md:92` omits Hedera from its own per-network index while
`scheme_exact_hedera.md` sits beside it. The per-network index in this repo is not
maintained and must not be treated as the list of what exists.

**There is no Hedera `upto`.** No `scheme_upto_hedera.md`; and
`typescript/packages/mechanisms/hedera/src/` contains `exact/` and nothing else,
while only `mechanisms/evm/` and `mechanisms/svm/` carry an `upto/` directory.
**TRACED** See §B-8 and §B-9 for what that costs.

## C-9. `upto` caps atomic units, not value. A rate-referenced HBAR price is not protected by it.

The brief's §9 lists "a rate-referenced HBAR amount that moves between quote and
settlement" as a place a spending cap would matter. `upto` does not address it.

The cap is `permit2Authorization.permitted.amount` — a count of the asset's smallest
units (`specs/schemes/upto/scheme_upto_evm.md:29, 62`). The guarantee is
`settled ≤ authorized` in *those units*
(`specs/schemes/upto/scheme_upto.md:49-52`). If the buyer authorizes up to N tinybar
and HBAR/USD moves 20% between the 402 and the settle, the buyer still pays up to N
tinybar and the fiat cost of that has moved 20%. The cap bounds the ledger quantity;
it says nothing about what the quantity is worth.

x402 does have a USD-denominated affordance, but it resolves to atomic units on the
*server's* side before the facilitator ever sees it: a `"$0.05"` settlement override
is converted using the asset's decimals at
`typescript/packages/core/src/server/x402ResourceServer.ts:1210-1228`, and the
facilitator's enforcement is entirely in atomic units
(`typescript/packages/mechanisms/evm/src/upto/facilitator/permit2.ts:441`). The
dollar sign is a server-side convenience, not a protocol-level price guarantee.
**READ**

---

# TARGET A — qisma

## A-1. LICENSE

`LICENSE:1-21` is the unmodified MIT License, "Copyright (c) 2026 Farouk Allani"
(`LICENSE:3`). `package.json:6` declares `"license": "MIT"`. The license was added
in commit `21fc1c3` on 2026-07-26, after most of the code. **READ**

The attribution requirement is `LICENSE:12-13`: the copyright notice and permission
notice "shall be included in all copies or substantial portions of the Software."

For WISHMail this obligation is not triggered, because WISHMail copies neither a
copy nor a substantial portion. Three things are worth stating precisely:

1. **Ideas, architecture, and techniques are not covered by copyright.** Learning
   that a fee payer and a value sender are separate fields, or that a mirror node
   makes a keyless seller possible, and then writing your own code, incurs no
   obligation under MIT or under copyright generally.
2. **The threshold is "substantial portion."** A short quotation for citation, of
   the kind used in this report, is not one. A copied function is a judgment call.
   Copying nothing removes the question entirely, which is the brief's position and
   the right one.
3. **Attribution remains the correct thing to do anyway.** Not as a license
   obligation but as an accurate account of where a design came from. Where WISHMail
   arrives at a pattern because qisma demonstrated it, the honest citation costs
   nothing and is the kind of claim `LIMITATIONS.md` (W-8) exists to make. My
   recommendation: a prior-art paragraph naming qisma, its author, its license, and
   the commit read — not a copyright notice, which would misstate the relationship.

## A-2. WHAT IT IS

Qisma is a five-package TypeScript monorepo (59 tracked files, Node ≥ 20, ESM,
`package.json:7-13`) implementing a machine-to-machine payment scheme it calls
`exact-multi`, on Hedera **testnet only**, for the case where a seller is itself a
buyer. The motivating scenario is an AI aggregator that sells a composed market
report and owes three upstream data providers out of the proceeds
(`README.md:30-34`). Under ordinary x402 that settles as N sequential payments with
N fees, N timestamps, and the aggregator holding everyone else's money between hops.
Qisma settles it as one Hedera `CryptoTransfer` with one debit and four credits at a
single consensus timestamp, with the network fee sponsored by a facilitator so the
buyer's balance moves by exactly the listed price
(`README.md:38-42`, `docs/SPEC.md:5-16`).

The packages are: `@qisma/protocol` (wire types, Zod schemas, base64 codecs, tx-id
conversion); `@qisma/facilitator` (an x402 v2 facilitator: `/verify`, `/settle`,
`/supported`, plus HCS receipt publication); `@qisma/services` (a demo economy of
three upstreams and one aggregator); `@qisma/buyer` (the paying agent CLI); and
`@qisma/explorer` (a standalone Vite/React page that renders any Hedera multi-party
transfer as an animated settlement graph read straight from the mirror node,
deployed publicly). `README.md:127-133`. The whole thing is testnet-pinned at the
type level: `NETWORK_TESTNET` is a Zod literal in the requirements schema
(`packages/protocol/src/schemas.ts:81`), and the client is constructed with
`Client.forTestnet()` (`packages/facilitator/src/index.ts:19`). A `NETWORK_MAINNET`
constant exists (`packages/protocol/src/constants.ts:19`) but nothing references it.
**READ**

## A-3. PAYMENTS SHAPE

### Primitives used

| Primitive | Used? | Where |
|---|---|---|
| Native HBAR multi-party `CryptoTransfer` | **yes**, the core | `packages/buyer/src/pay.ts:46-54` |
| Fee-payer / value-sender separation | **yes**, the pivot | `packages/buyer/src/pay.ts:48` |
| Partial signature collection (buyer signs, facilitator co-signs) | **yes** | `pay.ts:55` → `packages/facilitator/src/settle.ts:74` |
| HCS topic message (receipts) | **yes**, best effort | `packages/facilitator/src/settle.ts:107-111` |
| Mirror-node read as proof | **yes**, load-bearing | `packages/services/src/shared/inclusion.ts:35-73` |
| x402 v2 HTTP envelope and facilitator API | **yes**, unchanged | `packages/protocol/src/constants.ts:31-35` |
| HTS token transfers | **no**, rejected | `packages/facilitator/src/validate.ts:45-47` |
| Scheduled transactions | **no**, rejected | `packages/facilitator/src/validate.ts:42-44` |
| HIP-991 topic fees | **no** | topic `0.0.9619357` has empty `fixed_fees` (**TRACED**) |
| Allowances / approvals | **no** | absent from the repo |
| Smart contracts | **no** | `docs/SPEC.md:271-272` |

### Who signs what, who pays what

The transaction is built entirely by the **buyer**, from the split the seller
declared. Crucially, the buyer generates the transaction ID against the *facilitator's*
account, not its own (`packages/buyer/src/pay.ts:48`). On Hedera the account named in
the transaction ID is the network-level fee payer, so this one line is what makes the
buyer's balance move by exactly the listed price and nothing more. The buyer then
freezes and signs — and stops (`pay.ts:55`, and the comment at `pay.ts:1-6`: "SIGN IT
WITHOUT SUBMITTING").

Because the buyer named someone else as fee payer, the transaction is now
**incomplete**: it needs the fee payer's signature to be accepted by the network. The
buyer cannot submit it even if it wanted to. That asymmetry is the entire trust model
(`docs/SPEC.md:131-134`): the facilitator gains exactly one new power, the power to
broadcast, and a Hedera signature covers the whole transaction body, so any
alteration to any party or amount invalidates the buyer's signature. **The
facilitator can censor. It cannot steal.** The author states this plainly at
`docs/SPEC.md:265` and I found nothing in the code that contradicts it.

Fee accounting, confirmed on chain for the reference cascade
`0.0.9570295-1784974977-345649173` (**TRACED**):

```
0.0.9570279  -5,000,000    buyer, exactly the listed price
0.0.9570295    -716,242    facilitator, the fee and only the fee
0.0.802        +716,242    network fee collection
0.0.9619352  +2,000,000    aggregator
0.0.9619353  +1,500,000    price feed
0.0.9619355  +1,000,000    news feed
0.0.9619356    +500,000    sentiment
                           memo: qisma:aef3f7cc-3851-41a8-a2c1-ccbcaf6476f8
                           consensus: 1784974985.347778104, result SUCCESS
                           token_transfers: []
```

### How counterparty risk is bounded

Eleven rules, all of which the facilitator re-runs at **both** `/verify` and
`/settle` — the author's stated reason being that settling is what actually spends
the sponsor's balance, so `/verify`'s answer is not trusted as a ticket
(`packages/facilitator/src/settle.ts:64-65`). Rules 1–9 are a pure, synchronous,
network-free function (`packages/facilitator/src/validate.ts:19-129`), deliberately
so that every rejection path is unit-testable offline
(`packages/facilitator/src/signature.ts:8-11`). Rule 10 needs the mirror node and
lives separately. Rule 11 is the nonce check.

The list, in the author's framing (`README.md:216-227`, `docs/SPEC.md:189-215`):
requirements echoed byte for byte; plain `CryptoTransfer` only, no wrapper, no
tokens; memo binds the nonce; the declared fee payer is the transaction payer;
inside the validity window; only advertised consensus nodes; transfer list nets to
zero with exactly one debit; the sponsor is never the sender of value and the debit
equals the listed amount; the credited set is exactly the declared outputs; the
debited account validly signed the body; the nonce is unsettled.

The author's own summary of the split is the sharpest line in the README
(`README.md:228`): "Rules 1 to 9 read what the transaction says. Rule 10 proves the
buyer said it."

Note what rules 7–9 buy together. Requiring the list to net to zero *and* to contain
exactly one debit *and* for the credited set to match the declaration exactly means
there is no room left for a smuggled recipient, a reweighted split, or a rounding
skim. The author tests each of those individually
(`packages/facilitator/src/facilitator.test.ts:202, 213, 225`).

### ASCII flow

```
   BUYER (holds key)              SELLER/AGGREGATOR (no key)        FACILITATOR (holds key)
        |                                   |                                |
        |------ GET /report --------------->|                                |
        |                                   | mint nonce, build split        |
        |<----- 402 + PAYMENT-REQUIRED -----|   (stores it: `issued` map)    |
        |       { amount, payTo,            |                                |
        |         extra.outputs[4],         |                                |
        |         extra.feePayer=F,         |                                |
        |         extra.memo="qisma:N",     |                                |
        |         extra.nodeAccountIds } ---|                                |
        |                                   |                                |
   build ONE TransferTransaction:           |                                |
     -amount  from BUYER                    |                                |
     +out[i]  to each of 4 accounts         |                                |
     memo     = "qisma:N"                   |                                |
     txId     = generate(F)   <-- fee falls on F, not on BUYER               |
     nodes    = declared set                |                                |
     validFor = maxTimeoutSeconds           |                                |
   freeze(); sign(buyerKey)                 |                                |
   ***DO NOT SUBMIT***                      |                                |
        |                                   |                                |
        |-- GET /report + PAYMENT-SIGNATURE>|                                |
        |   base64{accepted, payload.       |                                |
        |          transaction=<partial>}   |                                |
        |                                   |--- POST /verify -------------->|
        |                                   |                       rules 1-11
        |                                   |                       (mirror GET for
        |                                   |                        buyer's pubkey)
        |                                   |<-- {isValid, payer} -----------|
        |                                   |                                |
        |                                   |--- POST /settle -------------->|
        |                                   |                       re-run rules 1-11
        |                                   |                       sign(feePayerKey)
        |                                   |                       execute + getRecord
        |                                   |                                |
        |                                   |                          [HEDERA] one tx,
        |                                   |                          one consensus ts,
        |                                   |                          5 balances move
        |                                   |                                |
        |                                   |                       publish HCS receipt
        |                                   |                       (best effort)
        |                                   |<-- SettlementResponse ---------|
        |                                   |    + extensions["qisma/receipt"]
        |                                   |
        |                          UPSTREAM x3 (no key)
        |                                   |
        |                    |--- GET /data + x-qisma-proof: <txId> --->|
        |                    |              x-qisma-proof-nonce: N      |
        |                    |                                          |
        |                    |                    [MIRROR NODE] GET /transactions/<txId>
        |                    |                      SUCCESS? memo=="qisma:N"?
        |                    |                      age <= 300s? credits ME >= my price?
        |                    |                      nonce not already redeemed?
        |                    |<-------------- the data ---------------- |
        |                                   |
        |<--- 200 report + PAYMENT-RESPONSE-|
```

## A-4. ATOMICITY

### The direct answer

**No two-asset swap.** See C-1. What qisma performs is a single-asset,
multiple-output atomic settlement: one `CryptoTransfer`, one signature from the
buyer, one co-signature from the fee payer, one consensus timestamp, five balances
changed. **TRACED** on the reference cascade above.

### How the transaction is assembled and who signs first

Assembly is entirely the **buyer's**, from the seller's declaration
(`packages/buyer/src/pay.ts:44-56`). The seller never builds bytes; it publishes a
split and waits. This ordering is what makes the scheme safe: the party whose money
moves is the party who constructs the movement, and everyone else can only accept or
refuse the result.

**The buyer signs first, and is the only party who signs anything about value.**
The facilitator signs second, and only as fee payer
(`packages/facilitator/src/settle.ts:72-74`, with the comment "Signing cannot alter
a single byte the buyer committed to"). There is no third signature.

### How the partially signed transaction travels

Serialized to bytes, base64-encoded, and carried inside the standard x402
`PAYMENT-SIGNATURE` HTTP header as `payload.transaction`
(`packages/protocol/src/schemas.ts:127-135`, `packages/buyer/src/pay.ts:56`,
`101-110`). The field name is deliberately the one the canonical Hedera `exact`
scheme uses (`schemas.ts:127-131`), so the envelope stays recognizable.

The seller then forwards those bytes unchanged to the facilitator in the standard
facilitator request body (`packages/services/src/shared/paid.ts:103-116`). The bytes
are opaque to the seller. It cannot usefully modify them — any edit breaks the
buyer's signature and rule 10 catches it.

No scheduled transaction, no on-chain rendezvous, no shared mutable state. The
partially signed transaction is just an HTTP payload for its whole life.

### Expiry

Three layers, and they are not the same clock.

1. **The buyer sets it.** `setTransactionValidDuration(maxTimeoutSeconds)`, default
   60 s (`packages/buyer/src/pay.ts:50`,
   `packages/protocol/src/constants.ts:70`). Confirmed on chain:
   `valid_duration_seconds: 60`. **TRACED**
2. **The facilitator re-checks it** before spending its own fee
   (`packages/facilitator/src/validate.ts:66-73`). Note an undocumented detail: the
   check tolerates a `validStart` up to **10 seconds in the future**
   (`validate.ts:68`), a clock-skew allowance absent from `docs/SPEC.md:200`.
3. **The network enforces it** regardless of either. A transaction outside its window
   is simply not accepted.

Separately, the seller expires its own memory of the offer: the `issued` map is swept
on every 402 with a TTL of `maxTimeoutSeconds + 30`
(`packages/services/src/shared/paid.ts:63-64, 84`), and an unknown or expired nonce
gets a fresh 402 rather than a settle attempt
(`packages/services/src/shared/paid.ts:132`, with the comment "never settle against
requirements we did not issue"). And the upstreams enforce a third, longer window —
300 s from consensus (`packages/protocol/src/constants.ts:72`,
`packages/services/src/shared/inclusion.ts:62-65`) — bounding how long a payment
proof can be redeemed for data.

### What fails if a party disappears mid-way

| Who vanishes | When | Outcome |
|---|---|---|
| Buyer | after signing | Nothing. The bytes are with the seller; settlement proceeds; the buyer's money moves. This is intended — the buyer's signature *is* its consent. |
| Buyer | before signing | Nothing at all. No bytes exist. The offer expires from the `issued` map. |
| Seller | after `/settle` returns | Money has moved and the buyer holds the transaction ID and the HCS receipt as proof of payment for that nonce (`docs/SPEC.md:266`). The buyer has paid and has no report. |
| Facilitator | before submitting | **Nothing moves.** The transaction was never submitted; the buyer's balance is untouched; the window expires; retry elsewhere (`docs/SPEC.md:265`). This is the clean failure. |
| Facilitator | after submitting, before responding | Money has moved but nobody told the seller. The seller's `/settle` call times out at 45 s (`packages/services/src/shared/env.ts:15-17` — the comment is explicit that hanging is preferred to abandoning a possibly-submitted transaction) and it issues a fresh 402. The buyer can re-pay. **The first payment is not recoverable by any code in this repo.** See O-4. |
| An upstream | after the cascade settled | It has been paid and does not serve. The aggregator returns 502 with the settlement attached (`packages/services/src/analyst.ts:58-62`). The buyer paid four parties and got nothing. No refund path exists. |

The last two rows are where the design's cost lives. Atomicity of *settlement* is
complete; atomicity of *settlement-plus-delivery* does not exist and is not claimed.

## A-5. INNOVATIONS

Nine things the author did that are not the obvious way. For each: the problem, the
solution, and what independent re-derivation would cost WISHMail.

### 5.1 The fee payer is a third party, and that is what makes the price exact

**Problem.** In a naive transfer the buyer pays both the price and the network fee,
so its balance moves by an amount the seller cannot predict and the buyer cannot
quote. Every "the buyer pays exactly $X" claim is false by a variable epsilon.

**Solution.** Hedera separates the transaction's fee payer (the account in the
transaction ID) from the senders in the transfer list. The buyer *names the
facilitator* as fee payer when generating the transaction ID
(`packages/buyer/src/pay.ts:48`), which simultaneously (a) makes the price exact,
(b) makes the transaction unsubmittable without the facilitator, and (c) gives the
facilitator a real economic stake that motivates all eleven verification rules. One
line, three consequences.

**Cost to re-derive.** Low if you know the field exists; the author demonstrably did
not at first (C-5: the v1-era cascade charged the buyer 5,756,658 for a 5,000,000
purchase). Call it a day of confusion and one wrong on-chain demo. The general lesson
generalizes past Hedera: look for the ledger's *existing* separation of authority
before building a relayer to fake one.

### 5.2 Keyless verification: the seller reads the ledger instead of being told

**Problem.** How does an upstream know it was paid, without holding a key, without
running a node, without an account on anyone's platform, and without trusting the
aggregator that is asking it for data?

**Solution.** It doesn't get told — it looks
(`packages/services/src/shared/inclusion.ts:35-73`). The aggregator presents only a
transaction ID and a nonce in two headers
(`packages/protocol/src/constants.ts:37-40`). The upstream then independently
confirms five things off the public mirror node: the transaction exists and
succeeded; its memo binds *this* nonce; consensus is within 300 s; **its own account
appears in the transfer list credited at least its listed price**; and the nonce has
not been redeemed before. Everything the upstream needs is public data it fetches
itself, so the aggregator is not a trusted party — it is a courier carrying a pointer.

**Cost to re-derive.** Medium. The idea is reachable, but the specific shape — proof
as *two headers and a public lookup*, with the recipient checking its own row rather
than parsing a claim — is the kind of inversion that takes a while to see. WISHMail
should note this is only possible on a chain with a free, public, unauthenticated
mirror API. The author says so explicitly (`README.md:247-249`,
`docs/SPEC.md:280-281`): on EVM chains it needs an indexer key or your own node.

### 5.3 Don't guess which curve a hex key is on — ask the ledger

**Problem.** Hedera accounts may be ED25519 or ECDSA. A 32-byte raw hex private key
parses successfully as *either*. Guess wrong and you produce a valid signature from
the wrong keypair, which fails at consensus with an error that says nothing useful.

**Solution.** Parse the input under every format that accepts it, derive each
candidate's public key, fetch the account's actual public key from the mirror node,
and select the candidate that matches (`packages/buyer/src/keys.ts:22-45`, and the
comment at `:17-21`: "don't guess"). The same file appears verbatim in the
facilitator package (`packages/facilitator/src/keys.ts`) — duplicated rather than
shared, presumably to keep the packages independent.

**Cost to re-derive.** Low intellectually, high experientially. This is a debugging
session you only have once, and it is genuinely unpleasant because the failure
surfaces far from its cause.

### 5.4 The mirror's key type is unreliable, so try every parse and let the crypto decide

**Problem.** The mirror node reports a key `_type` of `ED25519`, `ECDSA_SECP256K1`,
or `ProtobufEncoded`. Branching on that string is fragile, and `ProtobufEncoded`
covers key lists and threshold keys that a single-key parse cannot represent at all.

**Solution.** Attempt all three single-key parses, deduplicate by raw string, keep
whatever succeeded, and try the signature against each until one verifies
(`packages/facilitator/src/signature.ts:34-46`, `:97-100`). The comment at `:31-33`
frames the fallout as a feature: a threshold key parses as none of them, "which is
the honest answer: this facilitator does not evaluate threshold keys." Explicit
scope, not silent breakage. Keys are cached for 5 minutes, not forever, because
accounts can rotate (`signature.ts:24-26`).

**Cost to re-derive.** Low, but the *honesty* of the failure mode is the part worth
copying. Compare the alternative: branch on `_type`, hit a threshold key, and either
crash or — much worse — accept.

### 5.5 Fail closed on the check that costs you money

**Problem.** Rule 10 needs a network call. What should a facilitator do when the
mirror node is unreachable?

**Solution.** Reject. `packages/facilitator/src/signature.ts:69-73` and
`docs/SPEC.md:210-212` both state it: a facilitator that cannot reach the mirror
cannot establish consent, and sponsoring a fee on an unverified payload is exactly
the risk `/verify` exists to remove. The whole function returns a failure result
rather than throwing (`signature.ts:90-95, 101-104`), so there is no path where an
exception is swallowed into a pass.

**Cost to re-derive.** Free — if you frame the question as "who loses money when this
check is skipped." That framing is the transferable part.

Note the asymmetry in §A-6.6: the sibling module `keys.ts` fails *open* under the
same condition.

### 5.6 Keep the pure validator pure, so the failure catalogue is testable offline

**Problem.** Rule 10 needs a network. If it lives inside the validator, then testing
"rejects a reweighted split" or "rejects a smuggled recipient" needs a network too,
and the test suite stops being run.

**Solution.** Two modules. `validate.ts` is pure and synchronous over decoded bytes
with an injected clock (`validate.ts:19-24`); `signature.ts` is async, does the
lookup, and takes a swappable `KeySource` so tests need no network
(`signature.ts:48-49`). The result is 28 offline tests (**READ** —
`packages/facilitator/src/facilitator.test.ts` 16 + `packages/protocol/src/protocol.test.ts`
12), each bending exactly one thing: a reweighted split, a smuggled recipient, an
expired window, a buyer naming itself fee payer, and — the one that matters most — "a
structurally perfect but unsigned payload" (`facilitator.test.ts:240`) and "fails
closed when the payer's key cannot be read" (`:265`).

**Cost to re-derive.** Low as a principle, real as a discipline. WISHMail's existing
`ontologic-hello-world` already has the analogous seam (`src/morpheme.ts`, imported
identically by producer, verifier, and consumer so their bytes cannot disagree), so
this is confirmation of an approach already taken rather than a new idea.

### 5.7 Reading a sponsored transfer back off the mirror is not obvious, and the author says so

**Problem.** Given a sponsored transaction and nothing else, who is the buyer? The
transaction ID names the *fee payer*, and the transfer list contains **two** debits:
the buyer's price and the sponsor's fee. Reading the transaction ID as "the payer" is
wrong in exactly the case this scheme creates.

**Solution.** The buyer is the largest debit whose account is *not* the fee payer;
when no such debit exists the two collapse into one account, which is precisely how an
ordinary self-paid transfer should read
(`packages/explorer/src/mirror.ts:103-111`). The type declaration flags the trap
directly: reading the transaction ID's account as the buyer is "the classic misparse"
(`mirror.ts:16-20`).

A second filter sits alongside it: Hedera reserves account numbers below 1000 for
system use, so credits to those accounts are fee plumbing rather than payment
(`mirror.ts:53-61`). The comment records that the rule was derived from live
observation — "Observed live: testnet routes fees to 0.0.802" — which matches what I
saw on chain. **TRACED**

**Cost to re-derive.** Medium, and it is the kind of bug that ships. WISHMail's Proof
Wall will render exactly these transactions and will hit exactly this ambiguity.

### 5.8 Mirror lag is a normal condition, not an error

**Problem.** The mirror node indexes a few seconds behind consensus. A transaction
that certainly exists returns 404 for a moment.

**Solution.** Bounded retry with fixed backoff and an honest message on exhaustion:
5 attempts at 1.2 s in the upstream path
(`packages/services/src/shared/inclusion.ts:42-52`), 8 at 1.5 s in the explorer
(`packages/explorer/src/mirror.ts:76-85`, whose error text names the cause: "it lags
consensus by a few seconds"). Documented as a failure mode
(`docs/SPEC.md:267`).

**Cost to re-derive.** One confusing afternoon. Cheap to inherit as a known constant:
plan for ~5 s of mirror lag and never treat a fresh 404 as authoritative.

### 5.9 Put chain-specific truth in the standard's extension slot, not in new fields

**Problem.** The settlement result carries genuinely Hedera-specific information —
consensus timestamp, HashScan URL, the HCS receipt's topic and sequence. Adding
fields to `SettlementResponse` would make the response invalid for a generic x402
client.

**Solution.** It travels in the standard `extensions` map under the key
`qisma/receipt`, as an `{info, schema}` pair where the server publishes the JSON
Schema for its own extension alongside the data
(`packages/protocol/src/schemas.ts:181-188, 221-250`; `docs/SPEC.md:40-42`). A client
that ignores extensions still parses a valid response; a client that wants the
Hedera detail can validate it against a schema the server itself supplied.

**Cost to re-derive.** Low once you have read the extension section of the x402 spec,
which is the actual cost: reading it. WISHMail should look here first before
inventing a field, and the self-describing `{info, schema}` pairing is worth copying
as a habit.

### Also worth noting, briefly

- **Facilitator failures never become 500s.** Every facilitator call returns `null`
  on any error and the caller turns it into a readable 402 with the reason inline
  (`packages/services/src/shared/paid.ts:98-116, 138-141`). The buyer sees "is it
  running?" rather than a stack trace.
- **`getRecord` as the settle assertion.** It throws unless the receipt status is
  SUCCESS, so the happy path needs no status branch
  (`packages/facilitator/src/settle.ts:76-77`).
- **Receipt failure never unsettles a payment.** The HCS write is wrapped and logged;
  "A payment that settled stays settled; a failed receipt is only logged"
  (`packages/facilitator/src/settle.ts:122-125`).
- **Two transaction-ID spellings, one converter.** SDK `0.0.x@s.n` vs mirror
  `0.0.x-s-n` with nanos zero-padded to 9; the explorer accepts either or a pasted
  HashScan URL (`packages/protocol/src/txid.ts:1-33`,
  `packages/explorer/src/mirror.ts:63-68`). Small, and exactly the kind of thing that
  costs an hour if unanticipated.

## A-6. WHAT NOT TO INHERIT

Eleven things that would violate a WISHMail invariant, or reintroduce a trust
assumption WISHMail is trying to remove.

### 6.1 The HCS receipt is an ORG-held key attesting to a payer's payment

**W-2 collision, direct.** The facilitator holds a key
(`packages/facilitator/src/index.ts:18-19`) and uses it to publish an attestation
about the buyer's payment to an HCS topic
(`packages/facilitator/src/settle.ts:96-111`). All 11 messages on topic
`0.0.9619357` were paid for and submitted by `0.0.9570295`, the facilitator.
**TRACED**

For qisma this is defensible, because the *primary* evidence is the cascade
transaction itself, which the buyer signed. The receipt is corroborative. But the
shape — an org key signing a statement about a payer — is precisely what WISHMail's
W-2 forbids, and if WISHMail adopts a receipt topic it must be clear that the
receipt is a convenience index, never the proof. WISHMail's existing model already
gets this right: the closure check in `ontologic-hello-world`'s verifier requires
signer == author, and the equivalent question here is "who signed the thing that
matters," to which the answer is the buyer, not the facilitator.

### 6.2 The receipt topic has no submit key. Anyone can forge a receipt into it.

I queried topic `0.0.9619357` directly: `admin_key: null`, `submit_key: null`,
`fee_schedule_key: null`, `custom_fees.fixed_fees: []`. **TRACED** It was created
with a memo and nothing else (`packages/facilitator/src/setup.ts:47`).

An open topic is a legitimate design — HCS ordering is the value, and the mirror
records `payer_account_id` on every message, so a reader *can* filter to the
facilitator. But nothing does. The explorer's receipt lookup scans the last 50
messages and matches on the nonce field alone, with no check of who submitted
(`packages/explorer/src/mirror.ts:137-159`). A forged message carrying a real nonce
and a false split would be found and rendered.

For WISHMail: either set a submit key, or make every reader check
`payer_account_id`, or — best — treat the topic as an index and re-derive the truth
from the transaction. Do not do what the explorer does.

### 6.3 Every replay defence is an in-memory `Set`, and a verifier cannot reproduce any of them

Three of them:

| State | Location | Lost on restart |
|---|---|---|
| Settled nonces | `packages/facilitator/src/settle.ts:22` | yes |
| Issued requirements | `packages/services/src/shared/paid.ts:63` | yes |
| Redeemed proofs | `packages/services/src/shared/upstream.ts:24` | yes |

Rule 11 ("the nonce has not already been settled") is presented alongside ten
cryptographic and structural rules as though it were of the same kind. It is not.
Rules 1–10 are re-derivable by anyone from the bytes plus public data. Rule 11 is a
process-local memory. A second facilitator instance shares none of it; a restarted
one has none of it.

Hedera does provide real protection here — a duplicate transaction ID inside its
validity window is rejected by the network — which is the same principle x402 states
for `exact`: "the network's own primitive is authoritative"
(`specs/schemes/exact/scheme_exact.md:41`). So the in-memory set is defence in depth
over a sound primitive, in the facilitator's case.

**The upstream's `redeemed` set is not.** It is the *only* thing preventing an
aggregator from presenting the same cascade transaction to the same upstream twice
inside the 300-second window. There is no ledger primitive underneath it. Restart the
upstream and the same proof works again. This is off-chain state a verifier cannot
reproduce, and WISHMail must not build its stamp accounting on this pattern.

### 6.4 Requirements equality is `JSON.stringify`, not canonical JSON

`packages/facilitator/src/validate.ts:28` compares the echoed requirements to the
declared ones by string-comparing two `JSON.stringify` results. That is key-order
dependent. It works here only because the object round-trips through
`JSON.parse`/`JSON.stringify` with insertion order preserved and because the seller
re-supplies its own stored object (`packages/services/src/shared/paid.ts:135`). A
client that reserialized with different key ordering — a different language, a
different JSON library, a proxy that normalizes — would be rejected with a
"does not match" error that names nothing useful.

WISHMail already knows better: `ontologic-hello-world`'s `src/morpheme.ts` exists as
a single canonicalization seam for exactly this reason, and every hash goes through
it. Do not regress to `JSON.stringify` equality at the x402 boundary.

### 6.5 The resource server must be stateful across the 402 and the retry

`paidRoute` holds an `issued` map and refuses any nonce it did not itself mint
(`packages/services/src/shared/paid.ts:63, 130-132`). That refusal is correct — it is
what stops a payload from being settled against requirements nobody offered — but it
makes the resource server a stateful process.

**A static orchestrator page cannot do this.** WISHMail's design is deliberately
static and keyless, which means the "did I issue this?" question has to be answered
some other way: by making the requirements self-authenticating (signed or
hash-committed by something the verifier can check), or by moving the binding entirely
into the memo and letting the ledger be the only memory. This is a real design
constraint that qisma's shape does not solve, and it should be settled before the
orchestrator is built.

### 6.6 `resolveKey` fails open where `signature.ts` fails closed

Both key modules (`packages/buyer/src/keys.ts:41-45`,
`packages/facilitator/src/keys.ts:41-45`) catch a mirror-node failure and fall
through to `keys[0]` — the first format that parsed — with the comment "Mirror
unreachable: fall through to the first parse rather than dying offline." So under
exactly the condition where `signature.ts` proudly rejects (§A-5.5), the key selector
guesses.

The blast radius is small: a wrong guess produces an invalid signature that the
network refuses. But the asymmetry is worth naming, because it is the same author,
the same condition, and two opposite policies. WISHMail should pick one rule — mine
would be: any code path whose failure costs money or produces a claim fails closed —
and apply it uniformly.

### 6.7 The facilitator is a required, censoring broker

Only the facilitator can complete the transaction, because only it holds the fee
payer key. It cannot steal, and the author documents that clearly
(`docs/SPEC.md:265`). But it can decline, and there is no path around it: the buyer
holds bytes that are useless without a signature it cannot produce.

For WISHMail this is a liveness dependency on an ORG-operated service in the middle
of the purchase leg. It is not a W-2 violation — no ORG key signs the payer's
testimony — but it is a single point of refusal, and `LIMITATIONS.md` should say so
if the pattern is adopted. Note the alternative the same primitive allows: if the
*buyer* is its own fee payer, the buyer can submit and no facilitator is needed —
at the cost of the exactness that §A-5.1 buys. That is a real trade, and it should be
made deliberately.

### 6.8 Multi-signature accounts are refused

`packages/facilitator/src/signature.ts:28-33` and `docs/SPEC.md:213-214` both state
it: accounts whose key is a key list or threshold key are out of scope and are
rejected. Honest, explicit, and correct for a demo.

But that excludes precisely the accounts a serious organizational agent would use.
If WISHMail expects institutional senders — and "certified mail for agents" suggests
it might — this exclusion is not acceptable and needs to be solved rather than
declared.

### 6.9 The explorer silently drops recipients numbered below 1000

The system-account filter (`packages/explorer/src/mirror.ts:53-61, 96`) removes every
credit to an account with a number under 1000, on the correct reasoning that Hedera
reserves those for fee collection and consensus nodes. A legitimate recipient in that
range would vanish from the rendered settlement without a trace.

Vanishingly unlikely in practice. Named here because WISHMail's Proof Wall will need
the same filter and should log what it drops rather than dropping silently.

### 6.10 Money moves before the resource runs, and no Gate sits between

See C-7. `packages/services/src/analyst.ts:58-62` handles the resulting state
honestly, but the state itself — paid, undelivered, no refund path — is one WISHMail's
invariants are written to prevent. "A consequence-bearing action must `Gate`, never
silently `Admit`" is exactly the rule this ordering removes the seam for.

Qisma has a structural reason for the ordering (upstreams demand on-chain proof
before serving) that WISHMail may not share. If WISHMail's stamp can be issued after
delivery, use x402's `authorization` flow and keep the Gate.

### 6.11 The party table's "holds keys: no" is a claim about the repo, not the accounts

See C-6. The useful invariant — a seller never signs anything, in either direction —
is worth carrying forward. The phrasing is not.

---

# TARGET B — x402 `upto`

## B-7. THE SCHEME

### What `upto` authorizes

`upto` is x402's answer to "the price is not knowable until after the work is done."
The client signs an authorization for a **ceiling**; the resource server measures
actual consumption while serving the request; the facilitator settles for the measured
amount, which may be anything from zero up to that ceiling
(`specs/schemes/upto/scheme_upto.md:5`). The named use cases are LLM tokens
generated, bytes transferred, and dynamic compute (`scheme_upto.md:9-13`). **READ**

The scheme document is explicit that this forces an ordering constraint: `upto`
"cannot use `upfront` because the settled amount is known only after the route
handler runs, so settlement cannot precede resource execution"
(`scheme_upto.md:17`).

### How the cap is expressed

Not as a new protocol field — and this is the design decision that shapes everything
else. `PaymentRequirements.amount` is **phase-dependent**
(`scheme_upto.md:54-64`, restated at `scheme_upto_evm.md:255-274` and again in the
core spec at `specs/x402-specification-v2.md:399`):

> At **verification** time, `amount` represents the **maximum** amount the client
> authorizes.
> At **settlement** time, `amount` represents the **actual amount to settle**, which
> MUST be less than or equal to the previously authorized maximum.
> — `scheme_upto.md:58-59`

The stated rationale is that reusing one field avoids introducing settlement-specific
message types, and that "how much" reads naturally in both phases
(`scheme_upto.md:63`).

The *binding* cap — the number that is cryptographically committed — lives in the
signed payload, not in the requirements. On EVM that is
`permit2Authorization.permitted.amount` under Permit2's `permitWitnessTransferFrom`
(`scheme_upto_evm.md:7, 29, 62`). EIP-3009 is explicitly excluded because it commits
to an exact amount at signature time (`scheme_upto_evm.md:13`) — the same property
that makes Hedera `exact` unable to host `upto` (see B-9).

### Who decides the settled amount

The **resource server**, unilaterally, from its own measurement:
"The settled `amount` is determined by the resource server, not the client"
(`scheme_upto_evm.md:181`). It communicates that number to the facilitator by
setting `paymentRequirements.amount` on the `/settle` call
(`scheme_upto.md:64`). In the reference SDK this is a `SettlementOverrides.amount`,
which accepts raw atomic units, a percentage of the authorized maximum, or a dollar
price converted using the asset's decimals
(`typescript/packages/core/src/server/x402ResourceServer.ts:242-261`, resolved at
`:1208-1229`).

The trust consequence is stated in the spec's own security section and is not
hedged: "The `upto` scheme requires clients to trust that servers will charge fair
amounts based on actual usage. Malicious servers could charge up to `amount`
regardless of actual usage" (`scheme_upto_evm.md:321`), and "clients bear the risk of
the full amount being charged" (`:319`).

**So `upto` is not a fairness mechanism. It is a bounding mechanism.** The only
number a client can rely on is the ceiling it signed.

### How the facilitator enforces the ceiling

The mechanism is subtle enough that the spec devotes a conformance note to the way
people get it wrong. Two amounts are in play at settle time: the ceiling the client
signed (inside the payload) and the charge the server wants (in the requirements).
The verification routine performs a strict *equality* check between the signed
ceiling and `requirements.amount`, which is right at `/verify` and catastrophic at
`/settle`.

The rule (`scheme_upto_evm.md:189-193`): re-verify the signature against
`permitted.amount`, **not** `requirements.amount`; then validate
`requirements.amount <= permitted.amount`; then execute the transfer for
`requirements.amount`.

The reference implementation does exactly this and explains itself in a comment
block: it substitutes the ceiling into a copy of the requirements before re-verifying
(`typescript/packages/mechanisms/evm/src/upto/facilitator/permit2.ts:400-410`), then
guards the actual amount separately at `:441-449`, returning
`invalid_upto_evm_payload_settlement_exceeds_amount`
(`.../upto/facilitator/errors.ts:49`). **READ**

Underneath the protocol check sits the real enforcement: the on-chain contract. A
dedicated `x402UptoPermit2Proxy` (deployed via CREATE2 to a constant address across
chains) takes an `amount` parameter that may be less than `permit.permitted.amount`
(`scheme_upto_evm.md:64, 311-313`). It differs from the `exact` scheme's proxy by
adding a `facilitator` field to the witness struct, so the authorization is bound not
only to a recipient but to a *specific facilitator*
(`scheme_upto_evm.md:66, 313`). The client discovers that address from the
facilitator's `/supported` response and includes it in what it signs.

### What the client learns after settlement

`PAYMENT-RESPONSE` carries a `SettlementResponse` extended with one required field:
`amount`, "Actual amount charged in atomic token units (may be 0)"
(`scheme_upto_evm.md:278-289`). `transaction` is the hash, or an empty string when
the settlement was zero.

Three settlement outcomes are distinguishable from that response:

1. **Charged.** `success: true`, non-empty `transaction`, `amount` = what was taken.
2. **Zero-charged.** `success: true`, `transaction: ""`, `amount: "0"` — no on-chain
   transaction at all; the authorization simply expires unused
   (`scheme_upto_evm.md:236-237`, implemented at `permit2.ts:430-439`).
3. **Broadcast but unconfirmed.** `settlement_pending` with the broadcast hash in
   `transaction`, so the caller can reconcile on chain before retrying
   (`scheme_upto_evm.md:239`). The SDK persists that hash in a keyed store so a retry
   can find it rather than double-broadcast
   (`typescript/packages/mechanisms/evm/src/shared/settleReceipt.ts:132-167`).

That third case is the most useful thing here for WISHMail. It is the honest answer to
"I sent it and I don't know what happened," and it is a named, non-terminal protocol
state rather than an error — which is what makes a reconciliation path possible at
all.

## B-8. ENFORCEMENT

### The MUSTs, quoted

On the settled amount versus the authorized maximum:

> The settled amount MUST be less than or equal to the authorized maximum.
> - The settled `amount` MUST be `<=` the authorized maximum
> - The settled `amount` MAY be `0` (no charge if no usage occurred)
> — `specs/schemes/upto/scheme_upto.md:49-52`

> **Critically, the facilitator MUST re-verify the client's signature using the
> authorized maximum (`permitted.amount`), not the settlement-time
> `requirements.amount`.**
> — `specs/schemes/upto/scheme_upto.md:64`

> **Validate** `paymentRequirements.amount <= permit2Authorization.permitted.amount`
> — The actual settlement amount must not exceed the authorized maximum.
> — `specs/schemes/upto/scheme_upto_evm.md:191`

On replay:

> Each authorization MUST be settled at most once. After settlement (regardless of
> amount), the authorization is consumed and cannot be reused.
> — `scheme_upto.md:25`

> Implementation: On EVM, Permit2's nonce mechanism enforces this. Other networks
> MUST implement equivalent replay protection.
> — `scheme_upto.md:28`

On time bounds:

> Each authorization MUST have explicit validity time constraints:
> - **Start time** (`validAfter`) ... - **End time** (`deadline`)
> — `scheme_upto.md:32-35`

On recipient binding:

> The authorization MUST cryptographically bind the recipient address. The
> server/facilitator cannot redirect funds to a different address than what the
> client signed.
> — `scheme_upto.md:42`

On partial and duplicate settlement — the negative rules:

> **Multi-settlement / streaming**: Settling the same authorization multiple times
> (e.g., pay-per-chunk streaming) — [NOT supported]
> — `scheme_upto.md:70`

> A facilitator that enforces `paymentRequirements.amount ===
> permit2Authorization.permitted.amount` at settle time will reject all partial
> settlements, breaking the core `upto` value proposition.
> — `scheme_upto_evm.md:195`

### Where the enforcement actually lives

Note the layering, because it determines what a cap is worth. The protocol MUSTs bind
a *conformant* facilitator. What binds a **non-conformant** one is the contract: the
signature authorizes `permitWitnessTransferFrom` up to `permitted.amount` with the
recipient and the facilitator both inside the signed witness. A facilitator that
tries to settle above the ceiling produces a transaction the chain rejects; one that
tries to redirect breaks the witness binding; one that is not the named facilitator
fails the access check.

**The cap is enforced by the ledger, not by the facilitator's good behaviour.** That
is the property WISHMail should require of any cap it adopts — and it is exactly the
property `permitted.amount` has and `paymentRequirements.amount` does not.

### Where `upto` is specified, and where it is not

| Network | Scheme doc | Mechanism package | Status |
|---|---|---|---|
| EVM | `specs/schemes/upto/scheme_upto_evm.md` (328 lines) | `typescript/packages/mechanisms/evm/src/upto/` | full: client, server, facilitator |
| SVM (Solana) | `specs/schemes/upto/scheme_upto_svm.md` (953 lines, 84 MUSTs) | `typescript/packages/mechanisms/svm/src/upto/` | full, escrow-based |
| **Hedera** | **none** | **none** — `mechanisms/hedera/src/` has `exact/` only | **absent** |
| every other network | none | none | absent |

**TRACED** (directory enumeration and per-package `src/upto` test at `0c04a84e`).

`scheme_upto.md:74-78` lists only EVM under "Network-Specific Implementation," omitting
SVM — see C-8; do not read that list as authoritative.

The SVM binding is worth a paragraph because it is the only existing example of `upto`
on a network without Permit2, and it is therefore the closest thing to a template for
a Hedera one. A normal signed Solana transfer commits to an exact amount, so SVM
cannot do what EVM does; instead the client **escrows the ceiling** in an on-chain
payment channel and the server later settles the actual amount with a signed
cumulative voucher (`scheme_upto_svm.md:17-22`). Authority is deliberately split: the
facilitator is the channel `payee` with a **zero share** of the distribution, holding
lifecycle authority (it can always close a channel and recover the rent it fronted),
while the server holds payment authority as `authorized_signer` (every nonzero
settlement needs its voucher; the distribution commits 100% to `payTo` at open)
(`scheme_upto_svm.md:43-56`). The document names the residual trust honestly: a
facilitator that seals early freezes the watermark and the remainder refunds to the
client (`:58-60`).

That escrow shape is the price of a cap on a network whose signatures commit to exact
amounts. Hedera is such a network.

## B-9. FIT

### Why Hedera cannot host `upto` as specified

The Hedera `exact` scheme makes the amount a signed, exact commitment:

> The `amount` transferred to `payTo` for the given `asset` MUST equal
> `PaymentRequirements.amount` **exactly**.
> — `specs/schemes/exact/scheme_exact_hedera.md:146`

and the facilitator must reject if "the net amount to `payTo` is not exactly equal"
(`:149`). The client's signature covers the transfer list
(`scheme_exact_hedera.md:17`). There is no field the facilitator can lower after the
fact without invalidating the signature — the same property that excluded EIP-3009
from `upto` on EVM (`scheme_upto_evm.md:13`). **READ**

So a Hedera `upto` needs a *different primitive*, not a different amount field. There
are two shapes available, and WISHMail would be choosing between them, not inheriting
one:

- **Allowance.** Hedera has a native crypto/token allowance: the payer approves a
  spender for up to N, and the spender pulls ≤ N. That is the closest native analogue
  of Permit2 and is materially simpler than Solana's channel. It costs an extra
  on-chain approval transaction signed by the buyer, and it leaves a standing
  allowance the buyer must trust or revoke.
- **Escrow**, following the SVM shape: commit the ceiling, settle the actual, refund
  the difference. Two on-chain events per purchase and a rent/lifecycle problem to
  solve.

Both are re-derivations, not adoptions. Neither is specified. This is a design
decision WISHMail owns, and it belongs in `LIMITATIONS.md` either way.

### Where a cap would actually matter in WISHMail's purchase leg

Taking the three cases the brief names:

**1. A buyer's session cap.** This is the case `upto` fits worst, and it is worth
being blunt about. `upto` authorizations are **single-use** — "Each authorization
MUST be settled at most once" (`scheme_upto.md:25`) — and multi-settlement is
explicitly out of scope (`:70`), as are open-ended allowances (`:72`). A session cap
spanning several purchases is not an `upto` cap; it is the thing `upto` refuses to be.
WISHMail would need one authorization per request, with the session budget tracked
client-side. That is a defensible design, but it is not a protocol guarantee, and the
buyer's agent is the only thing enforcing it.

**2. A bundle price that depends on count.** This is the case `upto` fits best, and
it maps almost exactly onto the LLM-token use case. If a WISHMail purchase is "up to
N stamps, priced per stamp, exact N known only after the recipient set resolves," then
the buyer authorizes N × unit price and the server settles count × unit price. The
`upto` guarantees hold: settled ≤ authorized, enforced at the ledger; recipient bound;
single use; time bound; and — usefully — a zero settlement when the recipient set
resolves to empty costs no transaction at all (`scheme_upto_evm.md:236-237`).

What it does **not** guarantee is that `count` is honest. The server picks the number
(`scheme_upto_evm.md:181`) and the client can only bound it. In WISHMail's terms the
count is a claim, not a proof, unless something independent attests to it. That is
solvable — a stamp is an on-chain artifact, so the count is *verifiable after the
fact* — but the verification is WISHMail's to build, not `upto`'s to provide. The
honest framing: `upto` bounds the loss; the ledger proves the truth; the gap between
them is a dispute window.

**3. A rate-referenced HBAR amount.** `upto` does not help. See C-9: the cap is
denominated in the asset's atomic units, so a cap of N tinybar is still N tinybar
after the rate moves. If WISHMail quotes in USD and settles in HBAR, the exposure is
the rate window between quote and settlement, and the instruments for that are a
short `maxTimeoutSeconds`, a quote that expires, or settling in a USD-denominated
asset. Hedera USDC exists and is registered in x402 for both networks — testnet
`0.0.429274`, mainnet `0.0.456858`, 6 decimals
(`typescript/packages/mechanisms/hedera/src/constants.ts:35-45`) — which is the
direct fix if rate exposure is the real concern.

### The transferable idea, independent of scheme

Strip `upto` of Permit2 and what remains is a principle worth taking:
**authorize a ceiling that the ledger enforces, and settle a measured amount beneath
it.** The cap must be in the signed artifact, not in the message that accompanies it.
`permitted.amount` is signed; `paymentRequirements.amount` is a request. Everything
`upto` gets right follows from putting the binding number in the first place and not
the second — and the one conformance note the spec felt compelled to write
(`scheme_upto_evm.md:195`) exists because implementers confuse them.

If WISHMail builds a cap on Hedera, that is the test to apply: can a hostile
facilitator exceed it? If the answer depends on the facilitator running the right
code, the cap is not a cap.

---

# OPEN

| # | Item | Why it is open | What would close it |
|---|---|---|---|
| **O-1** | Qisma's 28-test suite was **not executed**. | `npm install` was blocked in this environment before any package was fetched. Every claim about the tests is READ, from source and from the badge at `README.md:12`. | Run `npm test` in a permitted environment. Test *names* were read directly and are accurate; pass/fail status is unverified. |
| **O-2** | The live `/verify` and `/settle` endpoints were never exercised. | They are localhost services requiring two funded keyed testnet accounts. Out of scope for read-only study, and starting them would need `.env`. | A local run with throwaway testnet accounts, if the eleven rules ever need behavioural confirmation rather than source confirmation. |
| **O-3** | Whether the deployed explorer at `qisma-explorer.vercel.app` matches `packages/explorer` at HEAD. | Not fetched. The compare-mode numbers in the README were verified against the mirror node directly instead, which is the stronger check. | Load it and compare, if the explorer's rendering ever becomes a reference for the Proof Wall. |
| **O-4** | No recovery path exists for a payment that settled while the seller was unreachable. | The seller's `/settle` times out at 45 s (`packages/services/src/shared/env.ts:15-17`), issues a fresh 402, and the first payment is stranded. The buyer holds proof of payment and no goods. Nothing in the repo reconciles it. | A design decision for WISHMail. Compare `settlement_pending` (`scheme_upto_evm.md:239`), which is x402's answer to the same problem and is strictly better. |
| **O-5** | Whether Hedera's native allowance is a workable `upto` substrate. | Asserted as plausible in §B-9 from the primitive's shape; **not verified** against the SDK, the fee schedule, or any x402 mechanism. No `upto` Hedera binding exists to check against. | A focused study of `AccountAllowanceApproveTransaction` semantics: revocation, expiry, whether a spender can be constrained to a single pull, and what the mirror node exposes about outstanding allowances. Decision-critical if WISHMail wants a cap. |
| **O-6** | Whether any facilitator anywhere advertises `upto` for a Hedera network. | Not probed this session. The prior recon established that the x402.org default facilitator serves `hedera:testnet` for `exact`; whether its `/supported` lists any `upto` kind was not checked. | One `GET /supported` against the default facilitator, filtered for `scheme: "upto"`. Fast, and it would close the question definitively. |
| **O-7** | Whether `exact-multi` was ever submitted to x402 as a scheme proposal. | Absent from the repo at `0c04a84e` (**TRACED**). Whether a PR or discussion exists was not checked — GitHub issues and PRs were not searched. | Search x402-foundation issues/PRs for "exact-multi" or "multi-output". Relevant only if WISHMail wants to reference it as prior art with a status. |
| **O-8** | The 10-second future-`validStart` tolerance at `packages/facilitator/src/validate.ts:68` is undocumented. | `docs/SPEC.md:200` states the rule without the tolerance. Almost certainly deliberate clock-skew allowance; possibly a leftover. | Ask the author, or treat it as intentional. Named because WISHMail will face the same skew question and should decide the number rather than inherit it. |
| **O-9** | Account `0.0.9619354` is missing from the seller sequence (`…352, …353, …355, …356`). | Observed on chain (**TRACED**). Suggests a fifth account was created and abandoned, or an interleaved creation by another party. Harmless. | Nothing. Recorded only so the gap is not mistaken for a transcription error in this report. |
| **O-10** | Whether the SVM `upto` channel program's authority split survives adversarial review. | I read the spec's own account of it (`scheme_upto_svm.md:43-60`) and its stated residual trust assumption. I did not read the on-chain program, which lives in a separate repository. | Read `solana-foundation/payment-channels`. Only worth doing if WISHMail seriously pursues the escrow shape over the allowance shape (O-5). |

---

## Appendix: what was verified on chain

Every row below is **TRACED** — fetched this session from
`https://testnet.mirrornode.hedera.com`, read-only.

| Object | ID | What it confirmed |
|---|---|---|
| Cascade transaction | `0.0.9570295-1784974977-345649173` | SUCCESS at consensus `1784974985.347778104`; buyer `0.0.9570279` debited exactly 5,000,000 tinybar; facilitator `0.0.9570295` debited 716,242 (fee only); four credits summing to 5,000,000; memo `qisma:aef3f7cc-…`; `token_transfers: []`; `valid_duration_seconds: 60`; node `0.0.3`. Confirms §A-3 and C-1. |
| v1-era cascade | `0.0.9570279-1784331992-551632287` | Buyer debited **5,756,658** — price *plus* fee, no sponsor. Confirms C-5. |
| Three "vanilla" transactions | `…-1784975029-909053080`, `…-1784975030-495233902`, `…-1784975038-380423495` | All fee-sponsored, all memo `qisma:…`, all single-output; fees 3 × 286,496 = 859,488; spread 8.28 s. Confirms C-4 and the README's arithmetic. |
| Receipt topic | `0.0.9619357` | 11 messages, all submitted by `0.0.9570295`; `admin_key`, `submit_key`, `fee_schedule_key` all `null`; `fixed_fees: []`. Schema v1 (#1–#4, 2026-07-17) names the buyer as transaction payer; v2 (#5–#11, 2026-07-25 onward) names the facilitator. Last message 2026-07-26T11:12Z, predating the signature-check commit of 2026-07-27T14:26Z. Confirms C-5, §A-6.1, §A-6.2. |
| Four seller accounts | `0.0.9619352/3/5/6` | All carry `ED25519` account keys; memos `qisma demo seller: <role>`. Confirms C-6. |
| Buyer and facilitator | `0.0.9570279`, `0.0.9570295` | Both `ECDSA_SECP256K1`. Context for §A-5.3 and §A-5.4. |
