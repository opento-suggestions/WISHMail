/**
 * T-P6-2 — P-6 (Resolution witnessed, not trusted).
 *
 * Classes: CORRESPONDENT, VERIFIER.
 * Register: NAMED (§9.1)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   Per profile, a fixture manifest recomputes to its hash from its locator (consensus) or snapshot (others); a non-consensus manifest without a snapshot is rejected at `send`.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P6-2 — Resolution witnessed, not trusted', () => {
  throw new Error(
    'T-P6-2 NOT EXPANDED — serves P-6 (Resolution witnessed, not trusted), classes CORRESPONDENT, VERIFIER. ' +
      'Sketch: Per profile, a fixture manifest recomputes to its hash from its locator (consensus) or snapshot (others); a non-consensus manifest without a snapshot is rejected at `send`.',
  );
});
