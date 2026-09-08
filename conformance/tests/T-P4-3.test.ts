/**
 * T-P4-3 — P-4 (No broker).
 *
 * Classes: VERIFIER.
 * Register: NAMED (§11.1)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   The VERIFIER suite run against two independent mirror nodes for the fixture ledger produces identical evidence digests.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P4-3 — No broker', () => {
  throw new Error(
    'T-P4-3 NOT EXPANDED — serves P-4 (No broker), classes VERIFIER. ' +
      'Sketch: The VERIFIER suite run against two independent mirror nodes for the fixture ledger produces identical evidence digests.',
  );
});
