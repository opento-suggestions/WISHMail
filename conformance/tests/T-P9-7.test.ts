/**
 * T-P9-7 — P-9 (Strict HCS-10).
 *
 * Classes: CORRESPONDENT, POSTMASTER.
 * Register: NAMED (§7.4)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   Every fixture message — the whole HCS-10 `message` operation as UTF-8 JSON — is at most `CHUNK_WIRE_MAX` = 1000 bytes, carries no `chunkInfo`, and its `data` parses as a Chunk.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P9-7 — Strict HCS-10', () => {
  throw new Error(
    'T-P9-7 NOT EXPANDED — serves P-9 (Strict HCS-10), classes CORRESPONDENT, POSTMASTER. ' +
      'Sketch: Every fixture message — the whole HCS-10 `message` operation as UTF-8 JSON — is at most `CHUNK_WIRE_MAX` = 1000 bytes, carries no `chunkInfo`, and its `data` parses as a Chunk.',
  );
});
