/**
 * T-P1-1 — P-1 (Binding).
 *
 * Classes: RECIPIENT, CORRESPONDENT.
 * Register: NAMED (§6.5)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   An envelope whose header, lane, or resolution proof is altered fails closed at `inbox`, returned `INBOX_UNBOUND`.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P1-1 — Binding', () => {
  throw new Error(
    'T-P1-1 NOT EXPANDED — serves P-1 (Binding), classes RECIPIENT, CORRESPONDENT. ' +
      'Sketch: An envelope whose header, lane, or resolution proof is altered fails closed at `inbox`, returned `INBOX_UNBOUND`.',
  );
});
