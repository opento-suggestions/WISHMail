/**
 * T-P12-1 — P-12 (Declared versus appraised).
 *
 * Classes: CORRESPONDENT.
 * Register: NAMED (§6.2)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   A registry answer the rule cannot fully verify yields coordinates with the rule's endorsement — never a failure, never a silent upgrade.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P12-1 — Declared versus appraised', () => {
  throw new Error(
    'T-P12-1 NOT EXPANDED — serves P-12 (Declared versus appraised), classes CORRESPONDENT. ' +
      'Sketch: A registry answer the rule cannot fully verify yields coordinates with the rule\'s endorsement — never a failure, never a silent upgrade.',
  );
});
