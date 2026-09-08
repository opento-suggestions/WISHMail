/**
 * T-P1-3 — P-1 (Binding).
 *
 * Classes: RECIPIENT.
 * Register: NAMED (§6.6)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   `ack` refuses an envelope returned unopened, for every §6.5 reason.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P1-3 — Binding', () => {
  throw new Error(
    'T-P1-3 NOT EXPANDED — serves P-1 (Binding), classes RECIPIENT. ' +
      'Sketch: `ack` refuses an envelope returned unopened, for every §6.5 reason.',
  );
});
