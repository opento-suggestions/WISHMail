/**
 * T-P8-1 — P-8 (Key epochs).
 *
 * Classes: RECIPIENT.
 * Register: NAMED (§6.5)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   An envelope sealed under a retired epoch still opens with the retained key.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P8-1 — Key epochs', () => {
  throw new Error(
    'T-P8-1 NOT EXPANDED — serves P-8 (Key epochs), classes RECIPIENT. ' +
      'Sketch: An envelope sealed under a retired epoch still opens with the retained key.',
  );
});
