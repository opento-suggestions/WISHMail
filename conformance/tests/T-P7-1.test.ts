/**
 * T-P7-1 — P-7 (Stamp precedes send).
 *
 * Classes: POSTMASTER, CORRESPONDENT, VERIFIER.
 * Register: NAMED (§4.3, §8.3)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   A chunk with no settlement reference, whose settlement memo ≠ the envelope's AAD hash, or whose settlement's consensus timestamp is not earlier than chunk 0's, is rejected at `send`; appraises as unstamped at replay.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P7-1 — Stamp precedes send', () => {
  throw new Error(
    'T-P7-1 NOT EXPANDED — serves P-7 (Stamp precedes send), classes POSTMASTER, CORRESPONDENT, VERIFIER. ' +
      'Sketch: A chunk with no settlement reference, whose settlement memo ≠ the envelope\'s AAD hash, or whose settlement\'s consensus timestamp is not earlier than chunk 0\'s, is rejected at `send`; appraises as unstamped at replay.',
  );
});
