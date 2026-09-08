/**
 * T-P11-5 — P-11 (Uniform postage).
 *
 * Classes: POSTMASTER.
 * Register: NAMED (§14.2)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   A replayed x402 payload and a re-submitted `hbar` purchase each return the original `StampReceipt` with no second transfer, before and after a Postmaster restart; a settled-but-interrupted purchase returns `STAMP_PAYMENT_UNSETTLED` and completes once on retry with the same reference.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P11-5 — Uniform postage', () => {
  throw new Error(
    'T-P11-5 NOT EXPANDED — serves P-11 (Uniform postage), classes POSTMASTER. ' +
      'Sketch: A replayed x402 payload and a re-submitted `hbar` purchase each return the original `StampReceipt` with no second transfer, before and after a Postmaster restart; a settled-but-interrupted purchase returns `STAMP_PAYMENT_UNSETTLED` and completes once on retry with the same reference.',
  );
});
