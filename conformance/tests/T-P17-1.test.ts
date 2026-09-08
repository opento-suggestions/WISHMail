/**
 * T-P17-1 — P-17 (Mutability at birth).
 *
 * Classes: POSTMASTER, CORRESPONDENT, RECIPIENT.
 * Register: NAMED (§4.6; D-138, D-146, D-150)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   Every provisioned topic has its admin key set to the agent's key, except where the standard the topic serves forbids an admin key, in which case it carries none and the key that standard requires is the agent's; its remaining keys are set at creation per the declared policy for that topic type; and the policy is recorded at creation.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P17-1 — Mutability at birth', () => {
  throw new Error(
    'T-P17-1 NOT EXPANDED — serves P-17 (Mutability at birth), classes POSTMASTER, CORRESPONDENT, RECIPIENT. ' +
      'Sketch: Every provisioned topic has its admin key set to the agent\'s key, except where the standard the topic serves forbids an admin key, in which case it carries none and the key that standard requires is the agent\'s; its remaining keys are set at creation per the declared policy for that topic type; and the policy is recorded at creation.',
  );
});
