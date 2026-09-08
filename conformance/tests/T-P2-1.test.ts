/**
 * T-P2-1 — P-2 (No Postmaster authority).
 *
 * Classes: POSTMASTER, CORRESPONDENT.
 * Register: NAMED (§3.5)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   Every lane message the suite produces is signed by the sending agent's submit key; a submission bearing only Postmaster keys is rejected at the network (threshold key).
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P2-1 — No Postmaster authority', () => {
  throw new Error(
    'T-P2-1 NOT EXPANDED — serves P-2 (No Postmaster authority), classes POSTMASTER, CORRESPONDENT. ' +
      'Sketch: Every lane message the suite produces is signed by the sending agent\'s submit key; a submission bearing only Postmaster keys is rejected at the network (threshold key).',
  );
});
