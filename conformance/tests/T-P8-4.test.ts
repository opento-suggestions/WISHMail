/**
 * T-P8-4 — P-8 (Key epochs).
 *
 * Classes: VERIFIER.
 * Register: NAMED (§11.6)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   After a fixture recipient rotates and re-declares post-SETTLED, the envelope's resolution appraises verified, `ke` matches the coordinates it was sealed with, and the later declaration appears only under `observations`.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P8-4 — Key epochs', () => {
  throw new Error(
    'T-P8-4 NOT EXPANDED — serves P-8 (Key epochs), classes VERIFIER. ' +
      'Sketch: After a fixture recipient rotates and re-declares post-SETTLED, the envelope\'s resolution appraises verified, `ke` matches the coordinates it was sealed with, and the later declaration appears only under `observations`.',
  );
});
