/**
 * T-P9-11 — P-9 (Strict HCS-10).
 *
 * Classes: CORRESPONDENT, POSTMASTER, VERIFIER.
 * Register: NAMED (§5.1; D-113 — core, was ext §16.8)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   An envelope whose AAD names a ledger tag that neither the spec nor an extension the release claims defines is rejected at `send` and appraises unbound at replay.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P9-11 — Strict HCS-10', () => {
  throw new Error(
    'T-P9-11 NOT EXPANDED — serves P-9 (Strict HCS-10), classes CORRESPONDENT, POSTMASTER, VERIFIER. ' +
      'Sketch: An envelope whose AAD names a ledger tag that neither the spec nor an extension the release claims defines is rejected at `send` and appraises unbound at replay.',
  );
});
