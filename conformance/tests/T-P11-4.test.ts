/**
 * T-P11-4 — P-11 (Uniform postage).
 *
 * Classes: POSTMASTER, VERIFIER.
 * Register: NAMED (§14.3)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   For every offered method, `buy_stamp` charges what the price message current at the receipt's consensus timestamp yields (`count × unitPrice`, a bundle price, or the referenced rate applied) for two buyers × three counts; no price message on the topic, or an amount the current message doesn't yield → rejected; two buyers at the same consensus time pay the same.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P11-4 — Uniform postage', () => {
  throw new Error(
    'T-P11-4 NOT EXPANDED — serves P-11 (Uniform postage), classes POSTMASTER, VERIFIER. ' +
      'Sketch: For every offered method, `buy_stamp` charges what the price message current at the receipt\'s consensus timestamp yields (`count × unitPrice`, a bundle price, or the referenced rate applied) for two buyers × three counts; no price message on the topic, or an amount the current message doesn\'t yield → rejected; two buyers at the same consensus time pay the same.',
  );
});
