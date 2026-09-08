/**
 * T-P11-1 — P-11 (Uniform postage).
 *
 * Classes: POSTMASTER, VERIFIER.
 * Register: NAMED (§4.1)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   A settlement in any token other than the pinned stamp is rejected at `send` and appraises as unstamped.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P11-1 — Uniform postage', () => {
  throw new Error(
    'T-P11-1 NOT EXPANDED — serves P-11 (Uniform postage), classes POSTMASTER, VERIFIER. ' +
      'Sketch: A settlement in any token other than the pinned stamp is rejected at `send` and appraises as unstamped.',
  );
});
