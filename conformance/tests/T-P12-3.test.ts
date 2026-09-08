/**
 * T-P12-3 — P-12 (Declared versus appraised).
 *
 * Classes: CORRESPONDENT.
 * Register: NAMED (§9.1)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   `send` with expired coordinates yields an envelope whose resolution proof is newer than the coordinates supplied, and no failure.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P12-3 — Declared versus appraised', () => {
  throw new Error(
    'T-P12-3 NOT EXPANDED — serves P-12 (Declared versus appraised), classes CORRESPONDENT. ' +
      'Sketch: `send` with expired coordinates yields an envelope whose resolution proof is newer than the coordinates supplied, and no failure.',
  );
});
