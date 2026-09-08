/**
 * T-P8-3 — P-8 (Key epochs).
 *
 * Classes: RECIPIENT.
 * Register: NAMED (§9.2; D-107)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   After rotation, pre-rotation coordinates remain resolvable at their consensus timestamp; a fixture that *declares* under `hcs14` with a direct-HCS-1 memo fails the RECIPIENT suite (its prior declarations are not resolvable).
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P8-3 — Key epochs', () => {
  throw new Error(
    'T-P8-3 NOT EXPANDED — serves P-8 (Key epochs), classes RECIPIENT. ' +
      'Sketch: After rotation, pre-rotation coordinates remain resolvable at their consensus timestamp; a fixture that *declares* under `hcs14` with a direct-HCS-1 memo fails the RECIPIENT suite (its prior declarations are not resolvable).',
  );
});
