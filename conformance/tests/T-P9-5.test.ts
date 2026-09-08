/**
 * T-P9-5 — P-9 (Strict HCS-10).
 *
 * Classes: POSTMASTER, CORRESPONDENT, RECIPIENT.
 * Register: NAMED (§6.1)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   Every HCS transaction for an operation HCS-10 gives a memo carries `hcs-10:op:{n}:{n}` matching the operation and HCS-10's transaction-memo topic type; every `transaction` op carries an empty memo (HCS-10 defines none — recon C-5).
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P9-5 — Strict HCS-10', () => {
  throw new Error(
    'T-P9-5 NOT EXPANDED — serves P-9 (Strict HCS-10), classes POSTMASTER, CORRESPONDENT, RECIPIENT. ' +
      'Sketch: Every HCS transaction for an operation HCS-10 gives a memo carries `hcs-10:op:{n}:{n}` matching the operation and HCS-10\'s transaction-memo topic type; every `transaction` op carries an empty memo (HCS-10 defines none — recon C-5).',
  );
});
