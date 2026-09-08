/**
 * T-P16-2 — P-16 (Lane equality).
 *
 * Classes: RECIPIENT, POSTMASTER.
 * Register: NAMED (§10.4)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   Across the RECIPIENT suite, the recipient account's HBAR and stamp balances are unchanged by `ack`.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P16-2 — Lane equality', () => {
  throw new Error(
    'T-P16-2 NOT EXPANDED — serves P-16 (Lane equality), classes RECIPIENT, POSTMASTER. ' +
      'Sketch: Across the RECIPIENT suite, the recipient account\'s HBAR and stamp balances are unchanged by `ack`.',
  );
});
