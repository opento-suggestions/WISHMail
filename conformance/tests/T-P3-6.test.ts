/**
 * T-P3-6 — P-3 (Public-data replay).
 *
 * Classes: VERIFIER.
 * Register: NAMED (§11.2; D-160)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   A fixture in which a sender in scope affixes postage under a `wishmail:` memo and posts no chunk against it carries that settlement under `orphans` — read from the treasury's inbound transfers in the stamp token over the window, not from any chunk (F-3) — with every reconciled envelope's state and standing unchanged; a settlement in the same window from an account not in scope is not reported.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P3-6 — Public-data replay', () => {
  throw new Error(
    'T-P3-6 NOT EXPANDED — serves P-3 (Public-data replay), classes VERIFIER. ' +
      'Sketch: A fixture in which a sender in scope affixes postage under a `wishmail:` memo and posts no chunk against it carries that settlement under `orphans` — read from the treasury\'s inbound transfers in the stamp token over the window, not from any chunk (F-3) — with every reconciled envelope\'s state and standing unchanged; a settlement in the same window from an account not in scope is not reported.',
  );
});
