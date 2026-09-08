/**
 * T-P10-1 — P-10 (Directed only).
 *
 * Classes: POSTMASTER, VERIFIER.
 * Register: NAMED (§6.4)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   An envelope with no resolution proof, or whose AAD does not name the lane it is submitted to, is rejected at `send` and appraises unbound at replay.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P10-1 — Directed only', () => {
  throw new Error(
    'T-P10-1 NOT EXPANDED — serves P-10 (Directed only), classes POSTMASTER, VERIFIER. ' +
      'Sketch: An envelope with no resolution proof, or whose AAD does not name the lane it is submitted to, is rejected at `send` and appraises unbound at replay.',
  );
});
