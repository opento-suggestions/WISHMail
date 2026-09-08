/**
 * T-P14-1 — P-14 (Affidavit, not gate).
 *
 * Classes: all.
 * Register: NAMED (§6.4)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   No tool call by one agent waits on an act of another, except a first-contact `send`, which returns a slip when its window closes.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P14-1 — Affidavit, not gate', () => {
  throw new Error(
    'T-P14-1 NOT EXPANDED — serves P-14 (Affidavit, not gate), classes all. ' +
      'Sketch: No tool call by one agent waits on an act of another, except a first-contact `send`, which returns a slip when its window closes.',
  );
});
