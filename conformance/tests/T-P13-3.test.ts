/**
 * T-P13-3 — P-13 (Never hold the soul).
 *
 * Classes: POSTMASTER.
 * Register: NAMED (§14.2)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   A fixture `hbar` purchase with an amount changed after the buyer signed is rejected at the network and no receipt is recorded; a purchase request with no buyer signature is never submitted.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P13-3 — Never hold the soul', () => {
  throw new Error(
    'T-P13-3 NOT EXPANDED — serves P-13 (Never hold the soul), classes POSTMASTER. ' +
      'Sketch: A fixture `hbar` purchase with an amount changed after the buyer signed is rejected at the network and no receipt is recorded; a purchase request with no buyer signature is never submitted.',
  );
});
