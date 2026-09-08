/**
 * T-P17-2 — P-17 (Mutability at birth).
 *
 * Classes: RECIPIENT.
 * Register: NAMED (§7.1)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   Every fixture lane's submit key is a threshold of exactly the two agents' keys; admin key per the acceptor's declared policy.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P17-2 — Mutability at birth', () => {
  throw new Error(
    'T-P17-2 NOT EXPANDED — serves P-17 (Mutability at birth), classes RECIPIENT. ' +
      'Sketch: Every fixture lane\'s submit key is a threshold of exactly the two agents\' keys; admin key per the acceptor\'s declared policy.',
  );
});
