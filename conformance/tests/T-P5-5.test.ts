/**
 * T-P5-5 — P-5 (Registry-plural).
 *
 * Classes: CORRESPONDENT.
 * Register: NAMED (§16.5; extension)
 *
 * EXTENSION (§16.1, D-111): this test binds only a release whose claim names
 * the extension it belongs to. `RELEASE.extensions` is empty, so it is not
 * required of this release — and it is registered, so it is not forgotten.
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   *(ext §16.5)* The CORRESPONDENT suite passes with `document` as the sole profile; T-P12-6 extends to a `document` fixture.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P5-5 — Registry-plural', () => {
  throw new Error(
    'T-P5-5 NOT EXPANDED — serves P-5 (Registry-plural), classes CORRESPONDENT. ' +
      'Sketch: *(ext §16.5)* The CORRESPONDENT suite passes with `document` as the sole profile; T-P12-6 extends to a `document` fixture.',
  );
});
