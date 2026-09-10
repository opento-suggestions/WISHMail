# app/

The reference implementation. This file records what goes here and what each part must declare.

**What exists, at close of 2026-09-09 — after Gate One.** `src/core/` — canonical JSON, §7.2's AAD, RFC 9180 base mode
composed on `node:crypto`, §7.3's seal, HCS-14 identifiers, §7.4's chunker with §11.3's walk beside it, and §6.4's
assembly with §5.5's recovery beside it. `src/ops/` — the provisioning that stood the entities up, HCS-10's operation
layer, and `template.ts`, the one spelling of D-147's six rows that all three provisioners read. `src/counter/` — the
Postmaster's counter: §14.3's pricing read from consensus, the three-legged purchase, a `TransactionBody` decoder, the
carry policy that decides what the Postmaster will pay for, and a Streamable HTTP MCP server. `sdk/` — a Correspondent
as its own process: the home directory that IS the agent (D-165), the keystore, the payer seam with a remote half, the
counter client, `generate_mailbox`, `register_agent`, the doorbell watcher, and a stdio MCP server for goose.
`src/resolve/` — the `hcs14` and `hol` resolvers. `src/schema/`, `src/state/`, `src/mcp/` — one ajv registry for §18.5's
fourteen, §14.2's durable record, and the six tools over stdio. `src/tools/` — `send`, `inbox` and `verify` over a
consensus port whose read half has no write on it. Each module carries the sections it implements and the tests it
answers to.

**What does not exist**: the CLI, the WebMCP page, the `dns` and `nanda` resolvers, and the live wiring of `send`,
`inbox` and `ack` — which are built and exercised end to end against a modelled ledger, and refuse on the Correspondent's
MCP naming the gate they wait on rather than half-working. STATUS.md §6 says what each blocks.

Per §18.5 and CLAUDE.md §4, `app/` holds the MCP server, the WebMCP page as its client, the SDK, the command line, and the resolvers — **each declaring the specification version and the classes and profiles it claims.**

## The parts

```
MCP server    The resource server of §14.2: it issues the 402 requirements and it is the
              only party that recognizes the PAYMENT-SIGNATURE answering them (D-109).
              Exposes the six tools of §6.
WebMCP page   A client of the MCP server, never the resource server. Unpinned and
              unsurveyed by choice (D-124, §19.4); no requirement in the specification
              depends on it, and conformance is measured at the server and on consensus.
SDK           TypeScript. Generates keys in the agent's own process and nowhere else
              (P-13, T-P13-2).
CLI           Drives the suite in conformance/.
resolvers     One per profile of §9: hcs14 (§9.2), dns (§9.3), nanda (§9.4), hol (§9.5).
```

**A release that exposes the tool surface over more than one transport exposes the same tool schema on each** (§6.1; T-P15-4 compares them after canonicalization). One schema, four transports.

## What every part declares

A release publishes a conformance claim (§5.10 `ConformanceClaim`, `spec/schemas/conformance-claim.schema.json`) naming the specification version, each class claimed, the profiles claimed per class, the pins tested against, the stamp token, the suite version and report digest, the LIMITATIONS document, the price topic, and the extensions claimed. **A claim does not name a class whose suite did not pass in full** (§1.5, T-P15-3), and **no claim is valid while a pin in `spec/pins.json` is unfilled** (T-P9-2).

## What is not built here

No Solidity and no smart contract. No broadcast. No push or notification surface: `inbox` is a read, and reading a lane leaves no mark on it (§1.2, §6.5, D-29). Nothing that requires a broker, a key, or a credit for VERIFIER conformance (P-4).

**The Postmaster holds no private key of any agent** — not a decryption key, not a topic key, not an account key (P-13, T-P13-1). Provisioning delivers coordinates and never a secret (§4.6). No tool input, schema field, service endpoint, configuration file, or log carries private-key material.

## Build order

STATUS.md §3 is the dependency order, and the reason for its shape is in its last line: **VERIFIER before anything that writes.** It is the floor of every class (§1.4), it needs no testnet artifact, and it is the court the other classes are tried in.

Facts already fetched for this work — mirror-node schedule fields, the running-hash construction, the HOL registration chain, x402's Hedera `exact` scheme, the NANDA v2 resolve endpoint — are in `spec/CONFORMANCE_TESTS_v0_5.md` §H with their sources. If a needed fact is not there, fetch it at the pinned commit and file it there with the date (L-7).
