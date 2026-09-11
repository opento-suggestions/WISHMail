/**
 * T-P9-8 — P-9 (Strict standards).
 *
 * Classes: CORRESPONDENT.
 * Register: NAMED (§9.1)
 * @fixture-kind captured
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   Every fixture manifest is one HCS message at or under `CHUNK_WIRE_MAX` bytes on the sender's manifest topic, with a consensus timestamp earlier than chunk 0's.
 *
 * EXPANDED 2026-09-10 over every resolution manifest the six captures name.
 *
 * WHY THE EXPECTATION FOLLOWS FROM THE TEXT. §9.1 makes the manifest a single
 * message and §7.4's limit applies to it as to any other. The ordering clause is
 * the one that matters most and is the one §11.4 reads back: a proof published
 * after the envelope it is supposed to bind would let a sender choose the proof
 * once it knew what it wanted to prove. "Earlier than chunk 0" is what makes the
 * resolution prior to the letter rather than contemporaneous with it.
 *
 * The manifests are reached the way §11.2 reaches them — from `hdr.rp.u`, the
 * locator inside chunk 0's header — and not from a list. A manifest nobody's
 * header names is not a fixture manifest.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CHUNK_WIRE_MAX } from '../../app/src/core/chunk.js';
import { before } from '../../app/src/tools/consensus.js';
import { allFixtures, chunksOn } from '../support/fixtures.js';

test('T-P9-8 — Strict standards', () => {
  let manifests = 0;

  for (const { name, f } of allFixtures()) {
    for (const { chunk, message: chunkMessage } of chunksOn(f)) {
      if (chunk['i'] !== 0) continue;
      const hdr = chunk['hdr'] as Record<string, unknown> | undefined;
      assert.ok(hdr !== undefined, `${name}: chunk 0 carries a header (§5.6)`);

      const rp = hdr['rp'] as { u?: { topicId?: string; sequenceNumber?: number } } | undefined;
      const locator = rp?.u;
      assert.ok(
        locator !== undefined && typeof locator.topicId === 'string' && typeof locator.sequenceNumber === 'number',
        `${name}: the header names where the proof lives (§5.2)`,
      );

      const where = `${name} / manifest ${locator.topicId}#${String(locator.sequenceNumber)}`;

      // THE SENDER'S MANIFEST TOPIC, checked as a topic and not merely as an id.
      const info = f.topicInfo[locator.topicId as string];
      assert.ok(info !== undefined && info !== null, `${where}: the capture holds the manifest topic's own record`);
      assert.equal(info.memo, 'wishmail:manifest:1', `${where}: it is a manifest topic (§9.1)`);

      // ONE HCS MESSAGE. Not a chain, not a chunked document.
      const messages = f.topics[locator.topicId as string] ?? [];
      const found = messages.filter((m) => m.sequenceNumber === locator.sequenceNumber);
      assert.equal(found.length, 1, `${where}: exactly one message sits at that sequence number`);
      const manifest = found[0];
      assert.ok(manifest !== undefined, `${where}: and it was read`);

      const bytes = Buffer.from(manifest.contents, 'utf8');
      assert.ok(
        bytes.length <= CHUNK_WIRE_MAX,
        `${where}: the manifest is ${bytes.length} bytes and §9.1 allows ${CHUNK_WIRE_MAX}`,
      );

      // It parses as a proof, so "one message" is one manifest and not one slice.
      const parsed = JSON.parse(manifest.contents) as Record<string, unknown>;
      assert.equal(typeof parsed['hash'], 'string', `${where}: the manifest carries its own hash (§5.2)`);
      assert.equal(parsed['hash'], rp?.['h'], `${where}: and it is the hash the header binds`);

      // EARLIER THAN CHUNK 0. The clause §11.4 reads back.
      assert.equal(
        before(manifest.consensusTimestamp, chunkMessage.consensusTimestamp),
        true,
        `${where}: published at ${manifest.consensusTimestamp}, before chunk 0 at ${chunkMessage.consensusTimestamp} (§9.1)`,
      );

      manifests += 1;
    }
  }

  assert.ok(manifests >= 4, `the captures name ${manifests} manifests`);
});
