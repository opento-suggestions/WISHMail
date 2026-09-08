/**
 * T-P15-2 — P-15 (Category honesty).
 *
 * Classes: all.
 * Register: NAMED (§1.5, §15.4)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   `LIMITATIONS.md` is present, carries a section for each of L-1 – L-14 in order, and every claim that a limitation does not apply names a test the suite ran and passed.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P15-2 — Category honesty', () => {
  throw new Error(
    'T-P15-2 NOT EXPANDED — serves P-15 (Category honesty), classes all. ' +
      'Sketch: `LIMITATIONS.md` is present, carries a section for each of L-1 – L-14 in order, and every claim that a limitation does not apply names a test the suite ran and passed.',
  );
});
