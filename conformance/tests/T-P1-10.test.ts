/**
 * T-P1-10 — P-1 (Binding).
 *
 * Classes: RECIPIENT, VERIFIER.
 * Register: NAMED (§11.4)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   An envelope whose header `ke` differs from the `keyEpoch` its bound resolution's coordinates carry is `INBOX_UNBOUND` at `inbox` and unbound at replay.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P1-10 — Binding', () => {
  throw new Error(
    'T-P1-10 NOT EXPANDED — serves P-1 (Binding), classes RECIPIENT, VERIFIER. ' +
      'Sketch: An envelope whose header `ke` differs from the `keyEpoch` its bound resolution\'s coordinates carry is `INBOX_UNBOUND` at `inbox` and unbound at replay.',
  );
});
