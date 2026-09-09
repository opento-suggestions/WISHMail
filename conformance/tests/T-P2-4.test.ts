/**
 * T-P2-4 — P-2 (No Postmaster authority).
 *
 * Classes: POSTMASTER.
 * Register: NAMED (§6.1; D-157)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   A Postmaster refuses at carry, and submits nowhere, a connection request bearing only its own signature: the requesting agent's signature over the body is what makes the request the agent's, as T-P13-3 makes the purchase the buyer's.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P2-4 — No Postmaster authority', () => {
  throw new Error(
    'T-P2-4 NOT EXPANDED — serves P-2 (No Postmaster authority), classes POSTMASTER. ' +
      'Sketch: A Postmaster refuses at carry, and submits nowhere, a connection request bearing only its own signature: the requesting agent\'s signature over the body is what makes the request the agent\'s, as T-P13-3 makes the purchase the buyer\'s.',
  );
});
