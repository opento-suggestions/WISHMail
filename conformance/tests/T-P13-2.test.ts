/**
 * T-P13-2 — P-13 (Never hold the soul).
 *
 * Classes: CORRESPONDENT, RECIPIENT.
 * Register: NAMED (§3.3)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   No tool input, schema field, or service endpoint carries private-key material; reference SDK key generation executes in the agent's process.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P13-2 — Never hold the soul', () => {
  throw new Error(
    'T-P13-2 NOT EXPANDED — serves P-13 (Never hold the soul), classes CORRESPONDENT, RECIPIENT. ' +
      'Sketch: No tool input, schema field, or service endpoint carries private-key material; reference SDK key generation executes in the agent\'s process.',
  );
});
