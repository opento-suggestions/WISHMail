/**
 * T-P7-5 — P-7 (Stamp precedes send).
 *
 * Classes: CORRESPONDENT.
 * Register: NAMED (§8.7)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   After `SEND_SUBMIT_FAILED` / `SEND_SETTLE_TIMEOUT`, a retried `send` produces no second settlement, submits only unwitnessed chunks, returns the same postmark.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P7-5 — Stamp precedes send', () => {
  throw new Error(
    'T-P7-5 NOT EXPANDED — serves P-7 (Stamp precedes send), classes CORRESPONDENT. ' +
      'Sketch: After `SEND_SUBMIT_FAILED` / `SEND_SETTLE_TIMEOUT`, a retried `send` produces no second settlement, submits only unwitnessed chunks, returns the same postmark.',
  );
});
