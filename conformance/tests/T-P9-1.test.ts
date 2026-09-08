/**
 * T-P9-1 — P-9 (Strict HCS-10).
 *
 * Classes: all.
 * Register: NAMED (§1.6)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   The release's declared pins equal §1.6's; the suite's HCS-10 fixtures are generated from the pinned revision.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P9-1 — Strict HCS-10', () => {
  throw new Error(
    'T-P9-1 NOT EXPANDED — serves P-9 (Strict HCS-10), classes all. ' +
      'Sketch: The release\'s declared pins equal §1.6\'s; the suite\'s HCS-10 fixtures are generated from the pinned revision.',
  );
});
