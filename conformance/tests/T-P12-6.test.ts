/**
 * T-P12-6 — P-12 (Declared versus appraised).
 *
 * Classes: VERIFIER.
 * Register: NAMED (§11.6)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   `dns` and `nanda` fixtures whose sources changed since assembly appraise identically with and without re-obtaining, differing only in `observations.drift`; evidence digests equal.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P12-6 — Declared versus appraised', () => {
  throw new Error(
    'T-P12-6 NOT EXPANDED — serves P-12 (Declared versus appraised), classes VERIFIER. ' +
      'Sketch: `dns` and `nanda` fixtures whose sources changed since assembly appraise identically with and without re-obtaining, differing only in `observations.drift`; evidence digests equal.',
  );
});
