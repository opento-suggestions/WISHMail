/**
 * T-P7-4 — P-7 (Stamp precedes send).
 *
 * Classes: RECIPIENT, CORRESPONDENT.
 * Register: NAMED (§4.4; D-105, D-137)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   Every fixture doorbell carries a HIP-991 custom fee of exactly one unit of the pinned stamp token with the **treasury** as collector; a fee-less connection request is rejected at the network; a doorbell naming another collector fails provisioning and is resolved to by no fixture; and an owner's `connection_created` on its own doorbell assesses the owner zero stamps (§4.4: the recipient "owes nothing to answer").
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P7-4 — Stamp precedes send', () => {
  throw new Error(
    'T-P7-4 NOT EXPANDED — serves P-7 (Stamp precedes send), classes RECIPIENT, CORRESPONDENT. ' +
      'Sketch: Every fixture doorbell carries a HIP-991 custom fee of exactly one unit of the pinned stamp token with the **treasury** as collector; a fee-less connection request is rejected at the network; a doorbell naming another collector fails provisioning and is resolved to by no fixture; and an owner\'s `connection_created` on its own doorbell assesses the owner zero stamps (§4.4: the recipient "owes nothing to answer").',
  );
});
