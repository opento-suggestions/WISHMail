/**
 * T-P1-7 — P-1 (Binding).
 *
 * Classes: VERIFIER, RECIPIENT.
 * Register: NAMED (§8.3)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   Receipts witnessed before the nth chunk, or for envelopes standing unstamped or unbound, leave state unchanged and are reported as invalid receipts.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P1-7 — Binding', () => {
  throw new Error(
    'T-P1-7 NOT EXPANDED — serves P-1 (Binding), classes VERIFIER, RECIPIENT. ' +
      'Sketch: Receipts witnessed before the nth chunk, or for envelopes standing unstamped or unbound, leave state unchanged and are reported as invalid receipts.',
  );
});
