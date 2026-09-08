/**
 * T-P7-2 — P-7 (Stamp precedes send).
 *
 * Classes: POSTMASTER, VERIFIER.
 * Register: NAMED (§4.3)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   A second envelope against an already-claimed settlement is rejected at `send`; a fixture pair sharing a settlement appraises one stamped, one unstamped, by consensus order.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P7-2 — Stamp precedes send', () => {
  throw new Error(
    'T-P7-2 NOT EXPANDED — serves P-7 (Stamp precedes send), classes POSTMASTER, VERIFIER. ' +
      'Sketch: A second envelope against an already-claimed settlement is rejected at `send`; a fixture pair sharing a settlement appraises one stamped, one unstamped, by consensus order.',
  );
});
