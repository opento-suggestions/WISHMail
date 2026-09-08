/**
 * T-P1-6 — P-1 (Binding).
 *
 * Classes: RECIPIENT, CORRESPONDENT, VERIFIER.
 * Register: NAMED (§7.2)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   An envelope whose chunks' `operator_id` account ≠ its settlement's `from` account is `INBOX_UNBOUND` at `inbox` and unbound at replay.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P1-6 — Binding', () => {
  throw new Error(
    'T-P1-6 NOT EXPANDED — serves P-1 (Binding), classes RECIPIENT, CORRESPONDENT, VERIFIER. ' +
      'Sketch: An envelope whose chunks\' `operator_id` account ≠ its settlement\'s `from` account is `INBOX_UNBOUND` at `inbox` and unbound at replay.',
  );
});
