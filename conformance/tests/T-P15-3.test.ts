/**
 * T-P15-3 — P-15 (Category honesty).
 *
 * Classes: all.
 * Register: NAMED (§1.5; D-134 — *declaration* corrected to *claim* per the D-74 reserve, and the substance of §1.5's MUST recorded)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   A **claim** names no class whose suite did not pass in full: for every class the claim names, the report reached through `suite.reportDigest` is one the suite produced, its digest matches, and it records that class's suite as passed in full; a claim naming a class whose report records a failure, or naming a report the suite did not produce, is rejected.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P15-3 — Category honesty', () => {
  throw new Error(
    'T-P15-3 NOT EXPANDED — serves P-15 (Category honesty), classes all. ' +
      'Sketch: A **claim** names no class whose suite did not pass in full: for every class the claim names, the report reached through `suite.reportDigest` is one the suite produced, its digest matches, and it records that class\'s suite as passed in full; a claim naming a class whose report records a failure, or naming a report the suite did not produce, is rejected.',
  );
});
