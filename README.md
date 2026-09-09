# WISHMail

**Certified mail for agents, on Hedera.**

WISHMail is a convention for sealed envelopes carried inside HCS-10 message operations, together with a certified layer — resolution proof, postmark, return receipt, attempted-delivery slip — such that any party can reconstruct a correspondence from public consensus data alone and appraise what each proof rests on.

It sells two claims, separately.

**Origin.** A stamped envelope is welded to its settlement event and to the witnessed resolution of its address. An envelope that was misresolved or mis-settled does not open.

**Story.** A correspondence is a chain of proofs on public topics, replayable by anyone from the specification alone — with no key, no stamp, no account, no credential, and no broker.

ETHOnline 2026 submission. Specification 0.5.4; frozen at 0.5.0 on 2026-09-07 and patched four times since — 0.5.1 the same day (D-135 – D-138), then 0.5.2 (D-145 – D-148), 0.5.3 (D-150, D-151) and 0.5.4 (D-152) on 2026-09-08. Wire strings carry `0.5`, because a patch changes none. Deployed on `hedera:testnet` and no other ledger.

## What it is not

WISHMail defines no transport — HCS-10 does, and WISHMail defines only what rides inside it. It operates no registry; registries are external, read-only, and plural, and WISHMail never adjudicates between them. It claims no forward secrecy. It delivers nothing to a recipient's hand: consensus witnesses, recipients read, and there is no push or notification surface. It carries no broadcast — a stamp buys one envelope to one address. And it does not certify unstamped HCS-10 messaging, or make any claim about it.

## The six tools

```
resolve      an address -> coordinates and a resolution proof, under a named profile
buy_stamp    stamps from the Postmaster, in USDC over x402 or in HBAR
send         one sealed envelope to one resolved address
inbox        read your own lanes; open what binds
ack          acknowledge an envelope that opened: produce its return receipt
verify       reconcile a correspondence from consensus alone — free, forever
```

## The shape of it

```
   registries --resolve--> Assembler --binds--> sealed envelope, signed by the sender
   (read-only)             (the sender's)               |
                                                        | the Postmaster carries
                                                        | (pays; attests nothing)
                                                        v
   Verifier <--public data-- Consensus <--------------- lane (HCS-10 connection topic)
   reconciles               witnesses: postmark         |
   (replay + lookup)                                    v
                                                 recipient opens (AAD verifies)
                                                 recipient acknowledges (return receipt)
```

No actor performs another's verb. The Assembler binds, Consensus witnesses, the Verifier reconciles, the Postmaster carries. That grammar is the separation of powers the whole design rests on.

## The repository

```
spec/           WISHMAIL_SPEC_v0_5.md — the only normative document
                CONFORMANCE_TESTS_v0_5.md — the working ledger; nothing in it is normative
                schemas/  fourteen JSON Schemas, one per data object
                vectors/  aad.json, seal.json — the court for T-P1-4 and T-P1-5
                pins.json the machine-readable form of the pinned standards
                adr/      one architecture decision record per decision, D-1 onward
conformance/    the suite: one test per T-<P-ID>-<n>, keyed to the invariant it serves
app/            the reference implementation: MCP server, WebMCP page, SDK, CLI, resolvers
recon/          dated fetches of the standards, and the pins drafted from them
provenance/     where the design came from. Binds nothing; the specification governs
plans/          the plans this build was directed by. Binds nothing; artifacts, not rules
```

**Start here:** `spec/WISHMAIL_SPEC_v0_5.md`. Read §1 (scope, classes, pins), §2 (vocabulary — the names in code are these names), then §5 through §12.

Contributing, and the rules a change is made under: `CONTRIBUTING.md`. What this deployment does not defend: `LIMITATIONS.md`. What is built, and in what order: `STATUS.md`.

## Conformance

Four classes, on one floor.

```
        +---------------+   +-------------+   +-------------+
        | CORRESPONDENT |   |  RECIPIENT  |   | POSTMASTER  |
        +-------+-------+   +------+------+   +------+------+
                |                  |           =======+=======  the pedestal:
                |                  |                  |         issues the stamp
        +-------+------------------+------------------+-------+
        |                       VERIFIER                      |
        |             the floor: every class verifies         |
        +-----------------------------------------------------+
```

VERIFIER conformance is achievable with no private broker, API key, credit, Hedera account, stamp, or recipient key configured. That is not a courtesy; it is the point. A mirror node is a read interface, not a broker, and evidence never depends on which one you read.

Seventeen invariants (P-1 – P-17), eighty-three conformance tests, and no MUST without a test. A conformance claim names the classes, profiles, and pins it was measured against; silence claims nothing.

## Status

The specification is frozen and sixteen entities stand on `hedera:testnet`: the `$POSTAGE` token and its treasury, the price topic carrying its first `PriceList`, the reference agent's doorbell, log and manifest, and its `hcs14` declaration — an HCS-2 registry, an HCS-1 profile file, and the account memo that points at them. `resolve` walks that chain back from consensus with nothing configured. **No conformance claim is valid yet** — the schemas are unregistered, so twenty-eight pins in `spec/pins.json` remain unfilled and the suite refuses to produce a report while any is. Standing up the entities did not make a claim possible; it made one eventually possible.

Where the build stands, and what is not built: `STATUS.md` §6. What was provisioned, with each entity's creation transaction and the mirror-node read that confirmed it: `app/deployment/hedera-testnet.json`. The method, and every departure from a tool's default path: `app/OPERATIONS.md`.

## How this was built

Written with Claude Code, under direction. Disclosed here because ETHGlobal's rules ask for it, and because this repository's own rule is that every change be explainable with the agent closed — the commit message says what changed and why in terms of the specification's sections and the test it serves, and a reviewer with no access to any AI can follow it (`CONTRIBUTING.md`, "The AI clause").

**The division of labour.** Every ruling is Sonic's. The specification's frozen text, the scope line, and all one hundred and fifty-five decision records in `spec/CONFORMANCE_TESTS_v0_5.md` §B are his rulings; nothing became normative because a model proposed it. Claude drafted specification and ledger prose against those rulings, ran the dated reconnaissance in `recon/`, wrote the TypeScript under `app/src/`, and ran the provisioning against `hedera:testnet`. Where Claude's own inference stands unruled it is marked **MINE** in the ledger, distinct from **RECORD** (Sonic said it) and **FETCHED** (from a dated, cited source) — a register kept precisely so that a reader can tell which is which without asking.

**Where to look, four places.**

- `CLAUDE.md` — the standing instruction, at the root, read at the start of every session. It is the prompt.
- `plans/` — the per-window plans, verbatim as approved, with a README mapping each to the commits that executed it.
- `CHANGELOG.md` — attribution per entry, under the key at the top of the file: **[S]** Sonic, **[C]** Claude in chat, **[CC]** Claude Code.
- The git history — every commit carries `Signed-off-by:` under the DCO and `Co-Authored-By:` the model that assisted it, and the history is incremental by construction.

**Nothing is reused.** All work here began after ETHOnline 2026 opened. No code was imported, ported, or paraphrased from any earlier WISHMail or related repository; the prior thinking that guided the design is in `provenance/`, labelled as provenance and binding nothing. Third-party code is declared in the two `package.json` files: `@hashgraph/sdk` for every transaction, `@modelcontextprotocol/sdk` for the tool surface, `ajv` and `ajv-formats` for JSON Schema, `canonicalize` for RFC 8785, and `dotenv`. The canonicalizer is a library rather than a hand-rolled one because `spec/vectors/aad.json` is the court and one implementation must serve both the price list and the envelope. The seal went the other way: RFC 9180 base mode is composed here on `node:crypto`, because the RFC publishes no vector for §7.3's ciphersuite and Appendix A.1 — which shares its KEM and KDF — can be run through the same code as a court. Both rulings are written out in `app/OPERATIONS.md`, in the same form and with opposite conclusions.

**No key material anywhere.** Keys are born in the agent's process and never leave it; `.gitignore` matches `.env*` with `!.env.example` negated back in, and `npm run p13:check` is the grep that keeps it that way (P-13).

## License

Apache 2.0. See `LICENSE`. Contributions are certified under the Developer Certificate of Origin 1.1 (`DCO`); commit with `git commit -s`.
