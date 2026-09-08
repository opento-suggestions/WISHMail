/**
 * T-P3-4 — P-3 (Public-data replay).
 *
 * Classes: VERIFIER.
 * Register: NAMED (§11.7)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   Every reference narrative's `bundleDigest` equals the digest of the bundle it was produced from; a narrative presented with a bundle of another digest is rejected.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P3-4 — Public-data replay', () => {
  throw new Error(
    'T-P3-4 NOT EXPANDED — serves P-3 (Public-data replay), classes VERIFIER. ' +
      'Sketch: Every reference narrative\'s `bundleDigest` equals the digest of the bundle it was produced from; a narrative presented with a bundle of another digest is rejected.',
  );
});
