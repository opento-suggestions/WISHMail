/**
 * T-P6-6 — P-6 (Resolution witnessed, not trusted).
 *
 * Classes: CORRESPONDENT.
 * Register: NAMED (§16.6; extension)
 *
 * EXTENSION (§16.1, D-111): this test binds only a release whose claim names
 * the extension it belongs to. `RELEASE.extensions` is empty, so it is not
 * required of this release — and it is registered, so it is not forgotten.
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   *(ext §16.6)* A fixture `find` result carrying forged coordinates does not alter the resolution the profile computes for the same address.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P6-6 — Resolution witnessed, not trusted', () => {
  throw new Error(
    'T-P6-6 NOT EXPANDED — serves P-6 (Resolution witnessed, not trusted), classes CORRESPONDENT. ' +
      'Sketch: *(ext §16.6)* A fixture `find` result carrying forged coordinates does not alter the resolution the profile computes for the same address.',
  );
});
