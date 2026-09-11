# conformance/

The suite. One test per `T-<P-ID>-<n>`, keyed to the invariant in its `P-ID` (§12), serving the requirement whose `Conformance:` note names it.

**All 87 files exist. 53 are expanded and 44 pass** (2026-09-11). A row with no body still fails on purpose, naming its identifier, the invariant it serves in §12's words, the classes §A gives it, and §A's sketch verbatim: a test that is not written must not report that it passed.

**How a body is derived, and it is not from the code.** `conformance/DERIVATION.md` is the table — written before any body was — giving all 87 rows the fixture that reaches each, what it expects, and why the expectation follows from the specification's text. **The code is the defendant, not the judge**: where a sketch and the implementation disagree, the body follows the sketch, fails, and the failure is a finding brought rather than adjusted. On their first run these bodies found eleven defects in the reference implementation, every one since fixed and proved by the body that found it.

**A body covers its whole sketch, or it fails saying which clause it could not reach.** Nine do, and each names what it waits on — a second implementation, a capture nobody has taken, a field the frozen schemas do not carry. "Not expanded, because X" and "expanded, and failing on X" are both correct lines on the harness. A body that faked X would not be.

**A reference-side check is not a test, and is not counted as one.** `app/` carries a growing set of `npm run check:*` scripts — the seal against RFC 9180's Appendix A.1, the chunker against §11.3's worked example, a whole letter against a modelled ledger — and they hold the reference implementation to the specification as it is written. They are not the suite: they run the reference against itself, where a conformance test runs a *release* against evidence it did not produce. None of them moves a count here.

## The register

`spec/CONFORMANCE_TESTS_v0_5.md` §A is the register: **87 tests — 82 core and 5 extension.** Every one of them becomes one test file, keyed by its identifier. A test is not expanded in scope beyond its sketch in §A without a decision (`D-nnn`).

The five extension tests — **T-P2-3** (§16.2 `attest`), **T-P5-5** (§16.5 `document` profile), **T-P6-6** (§16.6 `find`), **T-P11-7** (§16.4 spending cap), **T-P12-7** (§16.3 key custody) — bind only a release that names that extension in its claim (§16.1, D-111). They are built last, or not at all.

Coverage by invariant, as §A fixes it:

```
P-1 x12   P-2 x4    P-3 x6    P-4 x3    P-5 x4    P-6 x7
P-7 x5    P-8 x4    P-9 x11   P-10 x2   P-11 x7   P-12 x7
P-13 x4   P-14 x1   P-15 x5   P-16 x2   P-17 x3          = 87
```

## Layout

```
conformance/
  register.mjs     §A, read as rows — the one parser. scripts/extract-and-diff.mjs
                   uses it too, so the check and the suite cannot disagree about
                   what the register says
  scaffold.mjs     writes a stub for any test in §A that has no file; never
                   touches one that exists. `--check` reports without writing
  runner.mjs       the register against the specification, then the files against
                   the register, then the tests, then T-P9-2, then the report
  report.mjs       the artifact a claim names (§5.10)
  tests/           one file per test, `<T-P*-n>.test.ts`
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

**One file per test, not one directory.** This paragraph first said a directory per test. Eighty-three directories holding one file each buys nothing until a test carries fixtures of its own, and most never will: shared fixtures belong in `fixtures/` and the exception corpus in `corpus/`, which is where the tests that need them look. A test that does grow its own material gets a directory beside its file, named the same way. Nothing normative turns on this — §18.5 says "one test per `T-<P-ID>-<n>`" and is silent on the layout — and the change is recorded rather than made quietly because the earlier sentence was written down.

**The runner is the only thing that decides a test ran.** It reads §A, checks it against the specification both ways, checks that every registered test has a file and that no file is unregistered, runs them, and only then reaches T-P9-2. `npm run conformance` prints the counts; `--class VERIFIER` and `--filter T-P1` narrow it.

## The rules that govern a test here

**A test exists before the implementation that passes it.** The order is: the spec sentence exists, the schema tracks it, the test fails, the implementation makes it pass (§18.5; CONTRIBUTING.md).

**The VERIFIER suite runs with nothing configured.** No broker, API key, credit, Hedera account, stamp, or recipient key (P-4, T-P4-1). This is why fixtures are files.

**Reads go to a mirror node, directly.** P-3 makes replay a function of public consensus data and P-4 forbids a broker, and together they fix what a mirror node is: a read interface, not a broker. The suite reads the mirror node's REST API itself. **Nothing in `conformance/` may depend on an agent kit, an SDK convenience wrapper, or any service that reads on the suite's behalf** — such a dependency would put a party between the Verifier and the consensus data whose absence P-4 is about, and would make T-P3-1's byte-identical evidence a property of that party rather than of the ledger. The same rule holds for `app/`'s Verifier path. Where a tool is used to orient during development, what it returns is not the record; the mirror node's response is (see `app/OPERATIONS.md`).

**A reason is a test identifier.** §11.5 fixes that every reason a Verifier reports names the test whose fixture exercises the condition found. There is no reason without a test, as there is no requirement without one (§1.3, D-88). A Verifier that finds a condition §11.5's table does not name has found a defect in the specification and reports `T-P12-2`.

**Determinism is the point of most of it.** Two Verifiers on the same scope and window produce evidence with the same digest, byte for byte, from any mirror node, at any time (P-3; T-P3-1, T-P4-3). `observations` is excluded from that digest because two Verifiers at two clocks cannot agree on it (§11.6, D-82).

**No report while a pin is unfilled, and as of 2026-09-09 none is.** The suite reads `spec/pins.json` and refuses to produce a report while any pin there is null (T-P9-2). Twenty-eight were: the `registeredSchemas` entries, two per schema for fourteen, and they closed when the schemas were registered on consensus in Step 4. The `hedera:testnet` stamp token filled on 2026-09-08, and `hedera:mainnet` carries no entry at all — an undeployed ledger tag has no pin, so its absence is not an unfilled one (D-154). **So a report is now emitted, and it reports eighty-seven failures**, which is the correct output and not a defect: the gate T-P9-2 holds was never "are the tests passing", it was "is this release entitled to make a claim about what it measured against". There is no flag that produces a report anyway; a way past T-P9-2 would be a way past the invariant.

Because of that, nothing in an ordinary run reaches `report.mjs`, so the report is exercised on its own: `npm run check:report` calls it with a synthetic, fully-pinned input in a scratch directory and holds it to §5.1's hashing rule — the digest recomputes from the file, `generated` is outside it so two runs at two clocks agree, and a failed or unrun test stops `passedInFull`, which is what T-P15-3 reads to refuse a claim.

**What a run prints today:**

```
  register        87 tests (82 core + 5 extension), §A
  files           87 present, 0 missing, 0 unregistered
  selected        87
  passed          44
  failed          43

  report          conformance/reports/all.json
```

**No key of a provisioned agent, anywhere here** (P-13; T-P13-1, T-P13-2). P-13 forbids the private key "of any **agent** — decryption, topic, or account" (§12.2), and that is the rule: no key any agent this deployment provisioned appears in a fixture, in the corpus, or in a report. It is **not** a rule against key material as such, and it cannot be: T-P1-5 requires an independent implementation to *open* what the reference sealed, so `spec/vectors/seal.json` carries the recipient's private key exactly as RFC 9180 publishes `skRm` beside its own vectors. Those keys are born for the vector, bound to no account, topic or epoch, and the generator refuses any key that appears in `app/deployment/hedera-testnet.json`. See D-151.
