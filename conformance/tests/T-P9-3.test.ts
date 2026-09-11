/**
 * T-P9-3 — P-9 (Strict standards).
 *
 * Classes: all.
 * Register: NAMED (§5.11, §7.4)
 * @fixture-kind captured, artifact
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   Every fixture chunk's `schemaRef` is `hcs://13/<topicId>#<seq>` and resolves through HCS-13 (pinned revision) to a schema whose digest equals the release's shipped Chunk schema; every fixture chunk validates; the Chunk schema fixes `nx` top-level (required on all but the last chunk, forbidden on the last and inside `hdr`) and `h` inside `hdr` only.
 *
 * EXPANDED 2026-09-10. The whole chain is inside the captures: a chunk's `s` is
 * an HCS-13 locator naming the HCS-2 registry topic `0.0.10448509` at a sequence
 * number, that entry's `t_id` names the HCS-1 file topic `0.0.10448507`, and the
 * file topic's memo is the digest of what its chunks decompress to. So the
 * resolution runs with no network, which is what P-4 asks of it.
 *
 * WHY THE EXPECTATION FOLLOWS FROM THE TEXT. §5.11 makes `schemaRef` a
 * version-pinned locator and not a name: the point of pinning a sequence number
 * on a registry is that a reader can fetch the exact schema a writer wrote
 * against. A locator that resolved to a schema DIFFERENT from the one the
 * release ships would mean the release validates against one document and the
 * wire declares another — which is the freeze defect §1.7 exists to prevent.
 *
 * THE LAST CLAUSE IS HELD HERE BECAUSE JSON SCHEMA CANNOT HOLD IT. The schema's
 * own `$comment` says so: `nx` is required on every chunk of index i < n-1 and
 * forbidden on the chunk of index n-1, and JSON Schema cannot compare `i`
 * against `n`. So the ten-chunk envelope is where that clause is actually tried.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { readHcs1 } from '../../app/src/ops/hcs1.js';
import { schemas } from '../../app/src/schema/loader.js';
import { REPO_ROOT, allFixtures, chunksOn, pins } from '../support/fixtures.js';

const SCHEMA_REF = /^hcs:\/\/13\/([0-9]+\.[0-9]+\.[0-9]+)#([0-9]+)$/;

test('T-P9-3 — Strict standards', () => {
  const registry = schemas(REPO_ROOT);
  const shipped = fs.readFileSync(path.join(REPO_ROOT, 'spec', 'schemas', 'chunk.schema.json'));
  const shippedDigest = createHash('sha256').update(shipped).digest('hex');

  const pinned = (pins()['registeredSchemas'] as Record<string, { schemaRef: string; sha256: string }>)['chunk'];
  assert.ok(pinned !== undefined, 'spec/pins.json pins the registered Chunk schema (§5.11)');

  let chunksSeen = 0;
  let resolutions = 0;

  for (const { name, f } of allFixtures()) {
    // Group this lane's chunks by envelope, so `n` and the last index are known.
    const byEnvelope = new Map<string, Record<string, unknown>[]>();
    for (const { chunk } of chunksOn(f)) {
      const id = chunk['id'] as string;
      byEnvelope.set(id, [...(byEnvelope.get(id) ?? []), chunk]);
    }

    for (const [id, chunks] of byEnvelope) {
      const where = `${name} / ${id.slice(0, 12)}`;
      const zero = chunks.find((c) => c['i'] === 0);
      assert.ok(zero !== undefined, `${where}: chunk 0 is on the lane`);
      const n = zero['n'] as number;

      for (const chunk of chunks) {
        const i = chunk['i'] as number;
        const at = `${where}#${i}`;
        chunksSeen += 1;

        // --- `schemaRef` is HCS-13's version-pinned locator. ---------------
        const ref = chunk['s'];
        assert.equal(typeof ref, 'string', `${at}: the chunk names a schemaRef`);
        const m = SCHEMA_REF.exec(ref as string);
        assert.ok(m !== null, `${at}: ${JSON.stringify(ref)} is hcs://13/<topicId>#<seq> (§5.11)`);
        assert.equal(ref, pinned.schemaRef, `${at}: and it is the ref spec/pins.json records for this minor version`);

        // --- It resolves, through the registry the capture holds. ----------
        const [, registryTopic, sequence] = m as RegExpExecArray;
        const entry = (f.topics[registryTopic as string] ?? []).find(
          (msg) => msg.sequenceNumber === Number(sequence),
        );
        assert.ok(entry !== undefined, `${at}: the HCS-2 registry holds an entry at #${String(sequence)}`);
        const body = JSON.parse(entry.contents) as Record<string, unknown>;
        assert.equal(body['op'], 'register', `${at}: HCS-2's register operation (pinned revision)`);
        const fileTopic = body['t_id'];
        assert.equal(typeof fileTopic, 'string', `${at}: naming the HCS-1 file topic the schema lives on`);

        // --- To a schema whose digest equals the shipped one. --------------
        const memo = f.topicInfo[fileTopic as string]?.memo;
        assert.equal(typeof memo, 'string', `${at}: the capture holds the file topic's own record`);
        const parts = (f.topics[fileTopic as string] ?? []).map((msg) => JSON.parse(msg.contents) as { o: number; c: string });
        const read = readHcs1(memo as string, parts);
        const resolvedDigest = createHash('sha256').update(read.plain).digest('hex');

        assert.equal(
          resolvedDigest,
          (memo as string).split(':')[0],
          `${at}: what the HCS-1 topic holds hashes to the digest its own memo declares`,
        );
        assert.equal(
          resolvedDigest,
          shippedDigest,
          `${at}: the registered Chunk schema is byte-identical to the one this release ships (§1.7)`,
        );
        assert.equal(resolvedDigest, pinned.sha256, `${at}: and to the digest spec/pins.json records`);
        resolutions += 1;

        // --- Every fixture chunk validates. --------------------------------
        const faults = registry.validate('chunk', chunk);
        assert.deepEqual(faults, [], `${at}: validates against the registered Chunk schema`);

        // --- `nx` top-level; required on all but the last, forbidden on it. -
        const isLast = i === n - 1;
        assert.equal(
          Object.prototype.hasOwnProperty.call(chunk, 'nx'),
          !isLast,
          `${at}: §7.4 — \`nx\` is ${isLast ? 'forbidden on the last chunk' : 'required on every chunk but the last'}`,
        );

        // --- `nx` never inside `hdr`; `h` only there. ----------------------
        const hdr = chunk['hdr'] as Record<string, unknown> | undefined;
        if (hdr !== undefined) {
          assert.equal(Object.prototype.hasOwnProperty.call(hdr, 'nx'), false, `${at}: \`nx\` is not a header field (§7.4)`);
          assert.equal(typeof hdr['h'], 'string', `${at}: \`h\` is inside \`hdr\` — the ciphertext digest (§5.6)`);
        }
        assert.equal(Object.prototype.hasOwnProperty.call(chunk, 'h'), false, `${at}: and \`h\` is not top-level`);
      }
    }
  }

  assert.ok(chunksSeen >= 16, `${chunksSeen} captured chunks checked`);
  assert.ok(resolutions >= 16, `${resolutions} schemaRef resolutions, every one offline`);
});
