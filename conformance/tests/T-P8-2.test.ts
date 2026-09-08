/**
 * T-P8-2 — P-8 (Key epochs).
 *
 * Classes: RECIPIENT.
 * Register: NAMED (§7.6)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   After rotation, envelopes sealed against the prior and the new epoch both open.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P8-2 — Key epochs', () => {
  throw new Error(
    'T-P8-2 NOT EXPANDED — serves P-8 (Key epochs), classes RECIPIENT. ' +
      'Sketch: After rotation, envelopes sealed against the prior and the new epoch both open.',
  );
});
