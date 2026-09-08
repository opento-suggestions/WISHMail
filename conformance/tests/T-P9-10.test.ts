/**
 * T-P9-10 — P-9 (Strict HCS-10).
 *
 * Classes: RECIPIENT, VERIFIER.
 * Register: NAMED (§7.1)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   A fixture lane whose memo carries HCS-10's non-indexed flag (`hcs-10:1:…:2:…`) and holds an `n`-chunk envelope is fully reassembled by `inbox` and by the VERIFIER suite.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P9-10 — Strict HCS-10', () => {
  throw new Error(
    'T-P9-10 NOT EXPANDED — serves P-9 (Strict HCS-10), classes RECIPIENT, VERIFIER. ' +
      'Sketch: A fixture lane whose memo carries HCS-10\'s non-indexed flag (`hcs-10:1:…:2:…`) and holds an `n`-chunk envelope is fully reassembled by `inbox` and by the VERIFIER suite.',
  );
});
