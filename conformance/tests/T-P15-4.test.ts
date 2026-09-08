/**
 * T-P15-4 — P-15 (Category honesty).
 *
 * Classes: all.
 * Register: NAMED (§6.1)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   Tool schemas served by every transport in the release are identical after canonicalization.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P15-4 — Category honesty', () => {
  throw new Error(
    'T-P15-4 NOT EXPANDED — serves P-15 (Category honesty), classes all. ' +
      'Sketch: Tool schemas served by every transport in the release are identical after canonicalization.',
  );
});
