/**
 * T-P9-6 — P-9 (Strict HCS-10).
 *
 * Classes: CORRESPONDENT, VERIFIER.
 * Register: NAMED (§7.1)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   `send` returns `SEND_LANE_INVALID` for a lane closed at or before submission; replay appraises such an envelope unbound.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P9-6 — Strict HCS-10', () => {
  throw new Error(
    'T-P9-6 NOT EXPANDED — serves P-9 (Strict HCS-10), classes CORRESPONDENT, VERIFIER. ' +
      'Sketch: `send` returns `SEND_LANE_INVALID` for a lane closed at or before submission; replay appraises such an envelope unbound.',
  );
});
