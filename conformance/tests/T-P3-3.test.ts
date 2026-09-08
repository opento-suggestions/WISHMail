/**
 * T-P3-3 — P-3 (Public-data replay).
 *
 * Classes: VERIFIER.
 * Register: NAMED (§8.5)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   Reassembly walks the chain — chunk 0 by its header, each later chunk by the prior's `nx` — takes the earliest chunk the chain admits at each index, and records every off-chain, unrooted, and conflicting chunk without using it.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P3-3 — Public-data replay', () => {
  throw new Error(
    'T-P3-3 NOT EXPANDED — serves P-3 (Public-data replay), classes VERIFIER. ' +
      'Sketch: Reassembly walks the chain — chunk 0 by its header, each later chunk by the prior\'s `nx` — takes the earliest chunk the chain admits at each index, and records every off-chain, unrooted, and conflicting chunk without using it.',
  );
});
