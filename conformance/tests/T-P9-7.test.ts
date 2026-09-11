/**
 * T-P9-7 — P-9 (Strict standards).
 *
 * Classes: CORRESPONDENT, POSTMASTER.
 * Register: NAMED (§7.4)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   Every fixture message — the whole HCS-10 `message` operation as UTF-8 JSON — is at most `CHUNK_WIRE_MAX` = 1000 bytes, carries no `chunkInfo`, and its `data` parses as a Chunk.
 *
 * EXPANDED 2026-09-10 over every `message` operation on all four captured lanes
 * (`conformance/DERIVATION.md`, kind: captured).
 *
 * WHY THE EXPECTATION FOLLOWS FROM THE TEXT. §7.4 puts the limit on "the whole
 * operation", not on the chunk inside it, and CLAUDE.md §3 states the same
 * constraint as a non-negotiable: one HCS message per chunk, `CHUNK_WIRE_MAX` =
 * 1000 bytes on the whole operation, no `chunkInfo`, no HCS-1 for content. The
 * capture holds the operation exactly as it was submitted, so the measurement
 * here is of the bytes that were on the wire and not of a reconstruction.
 *
 * `chunkInfo` is HCS-10's own transport-layer chunking. §7.4 forbids it because
 * WISHMail does its own chunking at the envelope layer, and a message carrying
 * both would be chunked twice with two different chains.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CHUNK_WIRE_MAX } from '../../app/src/core/chunk.js';
import { allFixtures, chunksOn, operationsOn } from '../support/fixtures.js';

test('T-P9-7 — Strict standards', () => {
  assert.equal(CHUNK_WIRE_MAX, 1000, '§7.4 fixes CHUNK_WIRE_MAX at 1000 bytes');

  let measured = 0;

  for (const { name, f } of allFixtures()) {
    const messageOps = operationsOn(f, f.lane).filter((x) => x.op['p'] === 'hcs-10' && x.op['op'] === 'message');
    assert.ok(messageOps.length > 0, `${name}: the lane carries at least one message operation`);

    for (const { message, op } of messageOps) {
      const where = `${name} / ${f.lane}#${message.sequenceNumber}`;

      // The whole operation, as UTF-8, as it was submitted.
      const wire = Buffer.from(message.contents, 'utf8');
      assert.ok(
        wire.length <= CHUNK_WIRE_MAX,
        `${where}: the whole operation is ${wire.length} bytes and §7.4 allows ${CHUNK_WIRE_MAX}`,
      );

      assert.equal(
        Object.prototype.hasOwnProperty.call(op, 'chunkInfo'),
        false,
        `${where}: §7.4 forbids HCS-10's own chunkInfo — the envelope layer does the chunking`,
      );

      // `data` parses as a Chunk: §5.11's shape, read as the wire carries it.
      const data = op['data'];
      assert.equal(typeof data, 'string', `${where}: a message operation's data is a JSON string (§7.4)`);
      const chunk = JSON.parse(data as string) as Record<string, unknown>;
      assert.equal(typeof chunk['id'], 'string', `${where}: the chunk names its envelope`);
      assert.equal(typeof chunk['i'], 'number', `${where}: the chunk names its index`);
      assert.equal(typeof chunk['n'], 'number', `${where}: the chunk names the count`);
      assert.equal(typeof chunk['s'], 'string', `${where}: the chunk names its schemaRef (§5.11)`);
      assert.equal(typeof chunk['d'], 'string', `${where}: the chunk carries its slice`);

      measured += 1;
    }

    // And the same count the other way round, so a message whose `data` did not
    // parse could not slip through as "not a chunk, therefore not checked".
    assert.equal(
      chunksOn(f).length,
      messageOps.length,
      `${name}: every message operation's data parsed as a Chunk`,
    );
  }

  assert.ok(measured >= 16, `the four captures put ${measured} messages on the wire`);
});
