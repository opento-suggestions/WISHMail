/**
 * T-P9-8 — P-9 (Strict HCS-10).
 *
 * Classes: CORRESPONDENT.
 * Register: NAMED (§9.1)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   Every fixture manifest is one HCS message at or under `CHUNK_WIRE_MAX` bytes on the sender's manifest topic, with a consensus timestamp earlier than chunk 0's.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P9-8 — Strict HCS-10', () => {
  throw new Error(
    'T-P9-8 NOT EXPANDED — serves P-9 (Strict HCS-10), classes CORRESPONDENT. ' +
      'Sketch: Every fixture manifest is one HCS message at or under `CHUNK_WIRE_MAX` bytes on the sender\'s manifest topic, with a consensus timestamp earlier than chunk 0\'s.',
  );
});
