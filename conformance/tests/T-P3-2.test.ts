/**
 * T-P3-2 — P-3 (Public-data replay).
 *
 * Classes: VERIFIER, POSTMASTER.
 * Register: NAMED (§8.5, §11.5)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   Exception corpus (orphan, partial, unrooted chunk, foreign chunk landing before the sender's, duplicate, conflicting `n`, late settlement, closed-lane envelope, duplicate receipt, receipt-before-nth) yields identical `(state, standing)` from reference and independent Verifier; for each fixture, `reasons` is the full set it was built to trigger and `standing` is the minimum over them.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P3-2 — Public-data replay', () => {
  throw new Error(
    'T-P3-2 NOT EXPANDED — serves P-3 (Public-data replay), classes VERIFIER, POSTMASTER. ' +
      'Sketch: Exception corpus (orphan, partial, unrooted chunk, foreign chunk landing before the sender\'s, duplicate, conflicting `n`, late settlement, closed-lane envelope, duplicate receipt, receipt-before-nth) yields identical `(state, standing)` from reference and independent Verifier; for each fixture, `reasons` is the full set it was built to trigger and `standing` is the minimum over them.',
  );
});
