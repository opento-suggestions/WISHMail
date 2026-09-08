/**
 * T-P15-5 — P-15 (Category honesty).
 *
 * Classes: VERIFIER.
 * Register: NAMED (§11.4)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   A request whose schedule expired unsigned yields `receipt.status` = `unclaimed`; the envelope stays SETTLED, standing unchanged; the reference narrative uses the unclaimed template and no other.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P15-5 — Category honesty', () => {
  throw new Error(
    'T-P15-5 NOT EXPANDED — serves P-15 (Category honesty), classes VERIFIER. ' +
      'Sketch: A request whose schedule expired unsigned yields `receipt.status` = `unclaimed`; the envelope stays SETTLED, standing unchanged; the reference narrative uses the unclaimed template and no other.',
  );
});
