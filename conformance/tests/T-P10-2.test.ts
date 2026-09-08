/**
 * T-P10-2 — P-10 (Directed only).
 *
 * Classes: CORRESPONDENT, VERIFIER.
 * Register: NAMED (§7.1)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   `send` refuses, and replay appraises unbound, an envelope whose lane's `connection_created` is not on the doorbell its coordinates name.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P10-2 — Directed only', () => {
  throw new Error(
    'T-P10-2 NOT EXPANDED — serves P-10 (Directed only), classes CORRESPONDENT, VERIFIER. ' +
      'Sketch: `send` refuses, and replay appraises unbound, an envelope whose lane\'s `connection_created` is not on the doorbell its coordinates name.',
  );
});
