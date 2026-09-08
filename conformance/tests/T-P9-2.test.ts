/**
 * T-P9-2 — P-9 (Strict HCS-10).
 *
 * Classes: all.
 * Register: NAMED (§1.6)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   The suite refuses to produce a report when `spec/pins.json` (tracking §1.6 and the §4.1 stamp token / treasury) contains an unfilled pin.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P9-2 — Strict HCS-10', () => {
  throw new Error(
    'T-P9-2 NOT EXPANDED — serves P-9 (Strict HCS-10), classes all. ' +
      'Sketch: The suite refuses to produce a report when `spec/pins.json` (tracking §1.6 and the §4.1 stamp token / treasury) contains an unfilled pin.',
  );
});
