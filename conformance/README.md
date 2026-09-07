# conformance/

The suite. One test per `T-<P-ID>-<n>`, keyed to the invariant in its `P-ID` (§12), serving the requirement whose `Conformance:` note names it.

Nothing here exists yet. This file records what goes where and under what rules, so that the first test written lands in the right place.

## The register

`spec/CONFORMANCE_TESTS_v0_5.md` §A is the register: **83 tests — 78 core and 5 extension.** Every one of them becomes one test file, keyed by its identifier. A test is not expanded in scope beyond its sketch in §A without a decision (`D-nnn`).

The five extension tests — **T-P2-3** (§16.2 `attest`), **T-P5-5** (§16.5 `document` profile), **T-P6-6** (§16.6 `find`), **T-P11-7** (§16.4 spending cap), **T-P12-7** (§16.3 key custody) — bind only a release that names that extension in its claim (§16.1, D-111). They are built last, or not at all.

Coverage by invariant, as §A fixes it:

```
P-1 x11   P-2 x3    P-3 x5    P-4 x3    P-5 x4    P-6 x6
P-7 x5    P-8 x4    P-9 x11   P-10 x2   P-11 x7   P-12 x7
P-13 x4   P-14 x1   P-15 x5   P-16 x2   P-17 x3          = 83
```

## Layout

```
conformance/
  <T-P*-n>/        one directory per test, named by its identifier
  fixtures/        recorded testnet data and synthesized mirror responses — files, not
                   a network. The VERIFIER suite reads them with nothing configured.
  corpus/          the §8.5 exception corpus (T-P3-2): an orphan, a partial envelope, an
                   unrooted chunk, a foreign chunk that reached consensus before the
                   sender's, a duplicate chunk, a conflicting `n`, a late settlement, an
                   envelope on a closed lane, a duplicate receipt, and a receipt before
                   the nth chunk
  reports/         one report per class; a conformance claim names the report's digest
                   (§5.10 ConformanceClaim.suite.reportDigest)
```

## The rules that govern a test here

**A test exists before the implementation that passes it.** The order is: the spec sentence exists, the schema tracks it, the test fails, the implementation makes it pass (§18.5; CONTRIBUTING.md).

**The VERIFIER suite runs with nothing configured.** No broker, API key, credit, Hedera account, stamp, or recipient key (P-4, T-P4-1). This is why fixtures are files.

**Reads go to a mirror node, directly.** P-3 makes replay a function of public consensus data and P-4 forbids a broker, and together they fix what a mirror node is: a read interface, not a broker. The suite reads the mirror node's REST API itself. **Nothing in `conformance/` may depend on an agent kit, an SDK convenience wrapper, or any service that reads on the suite's behalf** — such a dependency would put a party between the Verifier and the consensus data whose absence P-4 is about, and would make T-P3-1's byte-identical evidence a property of that party rather than of the ledger. The same rule holds for `app/`'s Verifier path. Where a tool is used to orient during development, what it returns is not the record; the mirror node's response is (see `app/OPERATIONS.md`).

**A reason is a test identifier.** §11.5 fixes that every reason a Verifier reports names the test whose fixture exercises the condition found. There is no reason without a test, as there is no requirement without one (§1.3, D-88). A Verifier that finds a condition §11.5's table does not name has found a defect in the specification and reports `T-P12-2`.

**Determinism is the point of most of it.** Two Verifiers on the same scope and window produce evidence with the same digest, byte for byte, from any mirror node, at any time (P-3; T-P3-1, T-P4-3). `observations` is excluded from that digest because two Verifiers at two clocks cannot agree on it (§11.6, D-82).

**No report while a pin is unfilled.** The suite reads `spec/pins.json` and refuses to produce a report while any pin there is null (T-P9-2). At the time of writing, 32 are: the `$POSTAGE` token and treasury on both networks, and the HCS-13 registration of all fourteen schemas.

**No private-key material in any fixture** (P-13; T-P13-1, T-P13-2).
