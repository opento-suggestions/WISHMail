/**
 * T-P1-4 — P-1 (Binding).
 *
 * Classes: all.
 * Register: NAMED (§7.2)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   `spec/vectors/aad.json`: header fields → AAD bytes → `id`; every class recomputes exactly.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P1-4 — Binding', () => {
  throw new Error(
    'T-P1-4 NOT EXPANDED — serves P-1 (Binding), classes all. ' +
      'Sketch: `spec/vectors/aad.json`: header fields → AAD bytes → `id`; every class recomputes exactly.',
  );
});
