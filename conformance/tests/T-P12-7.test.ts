/**
 * T-P12-7 — P-12 (Declared versus appraised).
 *
 * Classes: VERIFIER.
 * Register: NAMED (§16.3; extension)
 *
 * EXTENSION (§16.1, D-111): this test binds only a release whose claim names
 * the extension it belongs to. `RELEASE.extensions` is empty, so it is not
 * required of this release — and it is registered, so it is not forgotten.
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   *(ext §16.3)* A fixture whose custody quote verifies and one whose quote is forged yield identical `appraised.standing`; the difference appears only in the resolution's `custody` report.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P12-7 — Declared versus appraised', () => {
  throw new Error(
    'T-P12-7 NOT EXPANDED — serves P-12 (Declared versus appraised), classes VERIFIER. ' +
      'Sketch: *(ext §16.3)* A fixture whose custody quote verifies and one whose quote is forged yield identical `appraised.standing`; the difference appears only in the resolution\'s `custody` report.',
  );
});
