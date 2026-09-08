/**
 * T-P17-3 — P-17 (Mutability at birth).
 *
 * Classes: CORRESPONDENT, RECIPIENT, POSTMASTER.
 * Register: NAMED (§9.1)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   Every fixture manifest topic has the agent's key as its sole submit key and the memo `wishmail:manifest:1`.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P17-3 — Mutability at birth', () => {
  throw new Error(
    'T-P17-3 NOT EXPANDED — serves P-17 (Mutability at birth), classes CORRESPONDENT, RECIPIENT, POSTMASTER. ' +
      'Sketch: Every fixture manifest topic has the agent\'s key as its sole submit key and the memo `wishmail:manifest:1`.',
  );
});
