/**
 * T-P1-11 — P-1 (Binding).
 *
 * Classes: CORRESPONDENT, RECIPIENT, VERIFIER.
 * Register: NAMED (§7.4, §11.3)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   A chunk whose `nx` is absent or ≠ the next slice's digest is rejected at `send`; a foreign chunk with the envelope's `id` and index landing before the sender's is recorded off-chain and the sender's is canonical, and the envelope opens; a complete envelope whose slices do not concatenate to `hdr.h` is `INBOX_UNBOUND` and appraises unbound.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P1-11 — Binding', () => {
  throw new Error(
    'T-P1-11 NOT EXPANDED — serves P-1 (Binding), classes CORRESPONDENT, RECIPIENT, VERIFIER. ' +
      'Sketch: A chunk whose `nx` is absent or ≠ the next slice\'s digest is rejected at `send`; a foreign chunk with the envelope\'s `id` and index landing before the sender\'s is recorded off-chain and the sender\'s is canonical, and the envelope opens; a complete envelope whose slices do not concatenate to `hdr.h` is `INBOX_UNBOUND` and appraises unbound.',
  );
});
