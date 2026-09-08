/**
 * T-P11-3 — P-11 (Uniform postage).
 *
 * Classes: RECIPIENT, CORRESPONDENT.
 * Register: NAMED (§7.1)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   Every fixture lane (whoever created it) carries no custom fee; `send` returns `SEND_LANE_INVALID` for one that does.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P11-3 — Uniform postage', () => {
  throw new Error(
    'T-P11-3 NOT EXPANDED — serves P-11 (Uniform postage), classes RECIPIENT, CORRESPONDENT. ' +
      'Sketch: Every fixture lane (whoever created it) carries no custom fee; `send` returns `SEND_LANE_INVALID` for one that does.',
  );
});
