/**
 * T-P2-2 — P-2 (No Postmaster authority).
 *
 * Classes: POSTMASTER.
 * Register: NAMED (§3.5)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   Envelopes whose ciphertext is arbitrary bytes are carried identically to well-formed ones.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P2-2 — No Postmaster authority', () => {
  throw new Error(
    'T-P2-2 NOT EXPANDED — serves P-2 (No Postmaster authority), classes POSTMASTER. ' +
      'Sketch: Envelopes whose ciphertext is arbitrary bytes are carried identically to well-formed ones.',
  );
});
