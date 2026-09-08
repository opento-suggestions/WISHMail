/**
 * T-P3-1 — P-3 (Public-data replay).
 *
 * Classes: VERIFIER, POSTMASTER.
 * Register: NAMED (§3.7, §11.7)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   Replay by a fresh Verifier with no configuration, at a different time and through a different mirror node than the reference Postmaster's, equals the Postmaster's *evidence* (digest over the bundle with `digest` and `observations` absent) for the fixture correspondence, byte for byte.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P3-1 — Public-data replay', () => {
  throw new Error(
    'T-P3-1 NOT EXPANDED — serves P-3 (Public-data replay), classes VERIFIER, POSTMASTER. ' +
      'Sketch: Replay by a fresh Verifier with no configuration, at a different time and through a different mirror node than the reference Postmaster\'s, equals the Postmaster\'s *evidence* (digest over the bundle with `digest` and `observations` absent) for the fixture correspondence, byte for byte.',
  );
});
