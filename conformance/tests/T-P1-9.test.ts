/**
 * T-P1-9 — P-1 (Binding).
 *
 * Classes: RECIPIENT.
 * Register: NAMED (§10.4)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   `ack` refuses a schedule whose body names a different identifier, postmark, or epoch (`ACK_NOT_OPENED`).
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P1-9 — Binding', () => {
  throw new Error(
    'T-P1-9 NOT EXPANDED — serves P-1 (Binding), classes RECIPIENT. ' +
      'Sketch: `ack` refuses a schedule whose body names a different identifier, postmark, or epoch (`ACK_NOT_OPENED`).',
  );
});
