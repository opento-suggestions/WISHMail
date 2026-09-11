/**
 * T-P1-12 — P-1 (Binding).
 *
 * Classes: VERIFIER.
 * Register: NAMED (§8.6, §11.4)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   A fixture receipt for an envelope whose `hdr.rr` is false is reported with `receipt.status` = `acked` and a reason naming it unrequested; the envelope's state and standing are unchanged from the same correspondence without it, and the reason is not borrowed from a test about something else.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P1-12 — Binding', () => {
  throw new Error(
    'T-P1-12 NOT EXPANDED — serves P-1 (Binding), classes VERIFIER. ' +
      'Sketch: A fixture receipt for an envelope whose `hdr.rr` is false is reported with `receipt.status` = `acked` and a reason naming it unrequested; the envelope\'s state and standing are unchanged from the same correspondence without it, and the reason is not borrowed from a test about something else.',
  );
});
