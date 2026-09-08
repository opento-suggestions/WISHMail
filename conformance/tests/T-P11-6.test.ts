/**
 * T-P11-6 — P-11 (Uniform postage).
 *
 * Classes: POSTMASTER.
 * Register: NAMED (§14.2)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   A `PAYMENT-SIGNATURE` against requirements the fixture Postmaster did not issue is rejected; one against requirements issued before a restart is accepted after it; the WebMCP fixture page completes `buy_stamp` only through the MCP server.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P11-6 — Uniform postage', () => {
  throw new Error(
    'T-P11-6 NOT EXPANDED — serves P-11 (Uniform postage), classes POSTMASTER. ' +
      'Sketch: A `PAYMENT-SIGNATURE` against requirements the fixture Postmaster did not issue is rejected; one against requirements issued before a restart is accepted after it; the WebMCP fixture page completes `buy_stamp` only through the MCP server.',
  );
});
