/**
 * T-P11-7 — P-11 (Uniform postage).
 *
 * Classes: POSTMASTER.
 * Register: NAMED (§16.4; extension)
 *
 * EXTENSION (§16.1, D-111): this test binds only a release whose claim names
 * the extension it belongs to. `RELEASE.extensions` is empty, so it is not
 * required of this release — and it is registered, so it is not forgotten.
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   *(ext §16.4)* A fixture allowance of `n` stamps' worth admits purchases summing to `n` and rejects the one that would exceed it; receipts sum to the allowance consumed.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P11-7 — Uniform postage', () => {
  throw new Error(
    'T-P11-7 NOT EXPANDED — serves P-11 (Uniform postage), classes POSTMASTER. ' +
      'Sketch: *(ext §16.4)* A fixture allowance of `n` stamps\' worth admits purchases summing to `n` and rejects the one that would exceed it; receipts sum to the allowance consumed.',
  );
});
