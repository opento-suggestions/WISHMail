/**
 * T-P9-9 — P-9 (Strict HCS-10).
 *
 * Classes: all.
 * Register: NAMED (§1.7)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   `spec/pins.json` records the minor version's registered schema digests and wire strings; a release claiming any patch of that minor version ships `spec/schemas/` with equal digests and passes T-P1-4 / T-P1-5 against the minor version's vectors.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P9-9 — Strict HCS-10', () => {
  throw new Error(
    'T-P9-9 NOT EXPANDED — serves P-9 (Strict HCS-10), classes all. ' +
      'Sketch: `spec/pins.json` records the minor version\'s registered schema digests and wire strings; a release claiming any patch of that minor version ships `spec/schemas/` with equal digests and passes T-P1-4 / T-P1-5 against the minor version\'s vectors.',
  );
});
