/**
 * T-P1-8 — P-1 (Binding).
 *
 * Classes: RECIPIENT, VERIFIER.
 * Register: NAMED (§10.4)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   A fixture receipt's schedule record shows exactly the recipient's signature; execution follows the nth chunk; the executed submission's postmark is on the recipient's manifest topic; a manifest by any other path is not a receipt.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P1-8 — Binding', () => {
  throw new Error(
    'T-P1-8 NOT EXPANDED — serves P-1 (Binding), classes RECIPIENT, VERIFIER. ' +
      'Sketch: A fixture receipt\'s schedule record shows exactly the recipient\'s signature; execution follows the nth chunk; the executed submission\'s postmark is on the recipient\'s manifest topic; a manifest by any other path is not a receipt.',
  );
});
