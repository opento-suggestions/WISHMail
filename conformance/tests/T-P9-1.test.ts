/**
 * T-P9-1 — P-9 (Strict standards).
 *
 * Classes: all.
 * Register: NAMED (§1.6)
 * @fixture-kind artifact, captured
 *
 * §A’s sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   The release’s declared pins equal §1.6’s; the suite’s HCS-10 fixtures are generated from the pinned revision.
 *
 * EXPANDED 2026-09-10 against §1.6’s own table and the six captures.
 *
 * WHY THE EXPECTATION FOLLOWS FROM THE TEXT. §1.6 is the normative table and
 * `spec/pins.json` says of itself that it is the machine-readable form of it.
 * Two copies of one fact is a defect waiting to happen, so the specification’s
 * own text is parsed here and the JSON is checked against it BOTH WAYS — a pin
 * in one and not the other is exactly the divergence §1.6’s MUST forbids: "a
 * release MUST declare the revision of each pinned standard it was tested
 * against, and those revisions MUST equal the pins of the specification version
 * it claims."
 *
 * THE SECOND CLAUSE, AND WHAT IT CAN HONESTLY MEAN HERE. The fixtures are not
 * generated: they are captured from a deployment built against the pinned
 * revision (`sdk/capture.cli.ts`). So what is checkable is that every HCS-10
 * shape in them is the pinned revision’s shape — the protocol tag, the operation
 * names, the topic-memo forms of §1.6’s HCS-10 at blob
 * `0cb5d2eb6b98e12e4b44fa8c4fea6e10937b615a`, as ledger §H records them with
 * file:line. A fixture carrying an operation the pin does not define, or a memo
 * in a form the pin does not give, would not have come from that revision.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { connectionTopicMemoOf, inboundTopicMemoOf } from '../../app/src/ops/hcs10.js';
import { REPO_ROOT, allFixtures, operationsOn, pins } from '../support/fixtures.js';

/** Every `<path> · <git blob>` pair §1.6’s table names. */
function pinsInSpec(): Map<string, string> {
  const spec = fs.readFileSync(path.join(REPO_ROOT, 'spec', 'WISHMAIL_SPEC_v0_5.md'), 'utf8');
  const from = spec.indexOf('### 1.6 Pinned standards revisions');
  const to = spec.indexOf('### 1.7 Versioning');
  assert.ok(from >= 0 && to > from, 'the specification carries §1.6 and §1.7');
  const section = spec.slice(from, to);

  const found = new Map<string, string>();
  for (const m of section.matchAll(/([A-Za-z0-9_./-]+\.md)\s*·\s*([0-9a-f]{40})/g)) {
    found.set(m[1] as string, m[2] as string);
  }
  return found;
}

/**
 * HCS-10 at the pinned revision, as ledger §H records it with file:line. These
 * are the shapes the standard defines; a fixture built against another revision
 * would carry something else.
 */
const PINNED_OPERATIONS = ['connection_request', 'connection_created', 'message', 'transaction', 'close_connection'];

test('T-P9-1 — Strict standards', () => {
  const declared = pins();

  // --- The release’s declared pins equal §1.6’s, both ways. ---------------
  const inSpec = pinsInSpec();
  assert.ok(inSpec.size >= 10, `§1.6’s table names ${inSpec.size} pinned files`);

  const inJson = new Map<string, string>();
  for (const group of ['standards', 'hips'] as const) {
    const entries = declared[group] as Record<string, { path?: string; blobSha?: string }> | undefined;
    if (entries === undefined) continue;
    for (const [name, entry] of Object.entries(entries)) {
      if (name.startsWith('_') || entry.path === undefined || entry.blobSha === undefined) continue;
      inJson.set(entry.path, entry.blobSha);
    }
  }

  for (const [file, blob] of inSpec) {
    assert.equal(inJson.get(file), blob, `spec/pins.json pins ${file} at the blob §1.6 names`);
  }
  for (const [file, blob] of inJson) {
    assert.equal(inSpec.get(file), blob, `§1.6 names ${file} at the blob spec/pins.json pins — no pin in one only`);
  }

  // The commit §1.6 states in prose, and the one the JSON records per standard.
  const spec = fs.readFileSync(path.join(REPO_ROOT, 'spec', 'WISHMAIL_SPEC_v0_5.md'), 'utf8');
  const standards = declared['standards'] as Record<string, { commit?: string }>;
  const hcs10 = standards['hcs-10'];
  assert.ok(hcs10?.commit !== undefined, 'spec/pins.json records HCS-10’s commit');
  assert.ok(
    spec.includes(hcs10.commit),
    `§1.6 names the commit ${hcs10.commit} spec/pins.json records for the HCS standards`,
  );

  // --- The fixtures carry the pinned revision’s shapes. -------------------
  let operations = 0;
  for (const { name, f } of allFixtures()) {
    for (const topicId of Object.keys(f.topics)) {
      for (const { message, op } of operationsOn(f, topicId)) {
        if (op['p'] !== 'hcs-10') continue;
        const where = `${name} / ${topicId}#${message.sequenceNumber}`;
        assert.ok(
          PINNED_OPERATIONS.includes(op['op'] as string),
          `${where}: ${JSON.stringify(op['op'])} is an operation HCS-10 defines at the pinned blob`,
        );
        operations += 1;
      }
    }

    // The topic-memo forms. §7.1’s lane is HCS-10’s connection form and the
    // doorbell is its inbound form, and both parse under the pinned grammar.
    const laneInfo = f.topicInfo[f.lane];
    assert.ok(laneInfo !== undefined && laneInfo !== null, `${name}: the lane’s record was captured`);
    const laneMemo = connectionTopicMemoOf(laneInfo.memo);
    assert.ok(laneMemo !== null, `${name}: the lane memo ${JSON.stringify(laneInfo.memo)} is HCS-10’s connection form`);

    const doorbell = f.topicInfo[laneMemo.doorbell];
    if (doorbell !== undefined && doorbell !== null) {
      assert.ok(
        inboundTopicMemoOf(doorbell.memo) !== null,
        `${name}: the doorbell memo ${JSON.stringify(doorbell.memo)} is HCS-10’s inbound form`,
      );
    }
  }

  assert.ok(operations >= 20, `${operations} HCS-10 operations checked against the pinned revision`);
});
