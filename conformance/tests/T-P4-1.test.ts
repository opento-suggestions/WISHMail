/**
 * T-P4-1 — P-4 (No broker).
 *
 * Classes: VERIFIER.
 * Register: NAMED (§1.4)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   The VERIFIER suite passes in an environment with no credentials of any kind: no broker, API key, credit, Hedera account, stamp, or recipient key configured.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P4-1 — No broker', () => {
  throw new Error(
    'T-P4-1 NOT EXPANDED — serves P-4 (No broker), classes VERIFIER. ' +
      'Sketch: The VERIFIER suite passes in an environment with no credentials of any kind: no broker, API key, credit, Hedera account, stamp, or recipient key configured.',
  );
});
