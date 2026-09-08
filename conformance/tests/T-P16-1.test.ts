/**
 * T-P16-1 — P-16 (Lane equality).
 *
 * Classes: POSTMASTER, CORRESPONDENT.
 * Register: NAMED (§4.6)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   `buy_stamp` succeeds for a buyer with no pre-existing Hedera account; the resulting account is owned by the buyer's key.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P16-1 — Lane equality', () => {
  throw new Error(
    'T-P16-1 NOT EXPANDED — serves P-16 (Lane equality), classes POSTMASTER, CORRESPONDENT. ' +
      'Sketch: `buy_stamp` succeeds for a buyer with no pre-existing Hedera account; the resulting account is owned by the buyer\'s key.',
  );
});
