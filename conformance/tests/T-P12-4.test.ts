/**
 * T-P12-4 — P-12 (Declared versus appraised).
 *
 * Classes: VERIFIER.
 * Register: NAMED (§9.6)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   A Verifier claiming no profile appraises every fixture's resolution as unverified, never fails, and passes the VERIFIER suite.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P12-4 — Declared versus appraised', () => {
  throw new Error(
    'T-P12-4 NOT EXPANDED — serves P-12 (Declared versus appraised), classes VERIFIER. ' +
      'Sketch: A Verifier claiming no profile appraises every fixture\'s resolution as unverified, never fails, and passes the VERIFIER suite.',
  );
});
