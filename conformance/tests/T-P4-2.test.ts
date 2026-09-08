/**
 * T-P4-2 — P-4 (No broker).
 *
 * Classes: POSTMASTER, CORRESPONDENT.
 * Register: NAMED (§3.5)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   A Correspondent configured with nothing but stamps and its own keys completes `send` through the reference Postmaster.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P4-2 — No broker', () => {
  throw new Error(
    'T-P4-2 NOT EXPANDED — serves P-4 (No broker), classes POSTMASTER, CORRESPONDENT. ' +
      'Sketch: A Correspondent configured with nothing but stamps and its own keys completes `send` through the reference Postmaster.',
  );
});
