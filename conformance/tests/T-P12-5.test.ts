/**
 * T-P12-5 — P-12 (Declared versus appraised).
 *
 * Classes: CORRESPONDENT, VERIFIER.
 * Register: NAMED (§10.5)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   A first contact whose window elapses yields a slip whose manifest is on the sender's manifest topic, whose output recomputes from the doorbell, and whose appraisal is unchanged by a late `connection_created`.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P12-5 — Declared versus appraised', () => {
  throw new Error(
    'T-P12-5 NOT EXPANDED — serves P-12 (Declared versus appraised), classes CORRESPONDENT, VERIFIER. ' +
      'Sketch: A first contact whose window elapses yields a slip whose manifest is on the sender\'s manifest topic, whose output recomputes from the doorbell, and whose appraisal is unchanged by a late `connection_created`.',
  );
});
