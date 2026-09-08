/**
 * T-P7-3 — P-7 (Stamp precedes send).
 *
 * Classes: POSTMASTER, VERIFIER.
 * Register: NAMED (§4.2)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   An envelope affixed with fewer stamps than its weight is rejected at `send`; a short-settled fixture appraises as unstamped.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P7-3 — Stamp precedes send', () => {
  throw new Error(
    'T-P7-3 NOT EXPANDED — serves P-7 (Stamp precedes send), classes POSTMASTER, VERIFIER. ' +
      'Sketch: An envelope affixed with fewer stamps than its weight is rejected at `send`; a short-settled fixture appraises as unstamped.',
  );
});
