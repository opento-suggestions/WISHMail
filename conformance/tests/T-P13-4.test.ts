/**
 * T-P13-4 — P-13 (Never hold the soul).
 *
 * Classes: POSTMASTER.
 * Register: NAMED (§4.6; D-110, BUILD)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   A fixture provisioned with registration has a `register` op on the anchor whose payer and `account_id` are both the agent's; it resolves under `hol` without `blurred`; no registration in the suite is paid by the Postmaster.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P13-4 — Never hold the soul', () => {
  throw new Error(
    'T-P13-4 NOT EXPANDED — serves P-13 (Never hold the soul), classes POSTMASTER. ' +
      'Sketch: A fixture provisioned with registration has a `register` op on the anchor whose payer and `account_id` are both the agent\'s; it resolves under `hol` without `blurred`; no registration in the suite is paid by the Postmaster.',
  );
});
