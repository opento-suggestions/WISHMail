/**
 * T-P9-4 — P-9 (Strict HCS-10).
 *
 * Classes: all.
 * Register: NAMED (§5.11)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   The digest of each file in `spec/schemas/` equals the digest registered under HCS-13 for the claimed specification version.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P9-4 — Strict HCS-10', () => {
  throw new Error(
    'T-P9-4 NOT EXPANDED — serves P-9 (Strict HCS-10), classes all. ' +
      'Sketch: The digest of each file in `spec/schemas/` equals the digest registered under HCS-13 for the claimed specification version.',
  );
});
