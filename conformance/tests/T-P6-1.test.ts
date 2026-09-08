/**
 * T-P6-1 — P-6 (Resolution witnessed, not trusted).
 *
 * Classes: CORRESPONDENT, VERIFIER.
 * Register: NAMED (§6.2)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   A resolution proof whose inputs are altered after resolution no longer hashes to the proof; the envelope appraises unbound.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P6-1 — Resolution witnessed, not trusted', () => {
  throw new Error(
    'T-P6-1 NOT EXPANDED — serves P-6 (Resolution witnessed, not trusted), classes CORRESPONDENT, VERIFIER. ' +
      'Sketch: A resolution proof whose inputs are altered after resolution no longer hashes to the proof; the envelope appraises unbound.',
  );
});
