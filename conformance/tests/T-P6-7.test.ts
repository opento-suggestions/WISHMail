/**
 * T-P6-7 — P-6 (Resolution witnessed, not trusted).
 *
 * Classes: VERIFIER.
 * Register: NAMED (§11.1; D-163)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   A manifest whose `meaning.uri` names a topic on which no message recomputes to its hash appraises unverified, with `T-P6-7` among its reasons; a manifest reached through a reference whose locator names a message on the topic that manifest's own `meaning.uri` names, and which recomputes there, appraises verified.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P6-7 — Resolution witnessed, not trusted', () => {
  throw new Error(
    'T-P6-7 NOT EXPANDED — serves P-6 (Resolution witnessed, not trusted), classes VERIFIER. ' +
      'Sketch: A manifest whose `meaning.uri` names a topic on which no message recomputes to its hash appraises unverified, with `T-P6-7` among its reasons; a manifest reached through a reference whose locator names a message on the topic that manifest\'s own `meaning.uri` names, and which recomputes there, appraises verified.',
  );
});
