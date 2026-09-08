/**
 * T-P12-2 — P-12 (Declared versus appraised).
 *
 * Classes: VERIFIER.
 * Register: NAMED (§6.7)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   For every fixture, appraised ≤ declared; no fixture produces a tool failure for a condition that has an appraisal.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P12-2 — Declared versus appraised', () => {
  throw new Error(
    'T-P12-2 NOT EXPANDED — serves P-12 (Declared versus appraised), classes VERIFIER. ' +
      'Sketch: For every fixture, appraised ≤ declared; no fixture produces a tool failure for a condition that has an appraisal.',
  );
});
