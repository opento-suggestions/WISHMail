/**
 * T-P3-5 — P-3 (Public-data replay).
 *
 * Classes: VERIFIER.
 * Register: NAMED (§11.2)
 * @fixture-kind captured
 *
 * §A’s sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   A fixture whose settlement, `connection_created`, and resolution manifest precede the window’s `from`, with chunks inside it, appraises verified and its bundle carries all three.
 *
 * EXPANDED 2026-09-10 over `checkpoint-two-resolved`, whose lane carries three
 * envelopes across six hours — so a window can be drawn that admits the last
 * one and leaves its own settlement, its lane’s birth and its manifest outside.
 *
 * WHY THE EXPECTATION FOLLOWS FROM THE TEXT. §11.2 is careful that the window
 * "bounds what is RECONCILED, not what is read": the three things named here are
 * PRIOR to the letter by construction — a settlement must precede chunk 0
 * (§4.3), a manifest must precede chunk 0 (§9.1), and a lane must exist before
 * anything rides it (§7.1) — so a window tight enough to hold only the chunks
 * would exclude every one of them if the window bounded reading. If it did, no
 * envelope could ever appraise verified inside a narrow window, and reconciling
 * a day’s mail would be impossible. That it *can* is what this test says.
 *
 * THIS ROW WAS NOT EXPANDABLE THIS MORNING. Nothing could reach `verified`,
 * because no capture carried the registry and profile topics §9.2’s rule reads
 * (`conformance/DERIVATION.md` F-2). The re-capture of 2026-09-10 night closed
 * that, and this is one of the rows it opened.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { before, compareTimestamps } from '../../app/src/tools/consensus.js';
import { laneBirth, verify } from '../../app/src/tools/verify.js';
import { chunksOn, fixture, readerOver } from '../support/fixtures.js';

const FIXTURE = 'checkpoint-two-resolved';
/** The reply, B → A2 — the last envelope on the lane, so a window can sit before it. */
const ENVELOPE = 'bc1bd61ee97faee136f8f15f1cf0de7590bfef65446d6024982d0152fcd7e492';

test('T-P3-5 — Public-data replay', async () => {
  const f = fixture(FIXTURE);
  const reader = readerOver(f);

  // --- The three things the window must leave outside. --------------------
  const zero = chunksOn(f).find((c) => c.chunk['id'] === ENVELOPE && c.chunk['i'] === 0);
  assert.ok(zero !== undefined, 'chunk 0 of the reply is on the lane');
  const chunkZeroAt = zero.message.consensusTimestamp;

  const hdr = zero.chunk['hdr'] as Record<string, unknown>;
  const settlementRef = hdr['st'];
  assert.equal(typeof settlementRef, 'string', 'the header names its settlement (§5.6)');
  const settlement = f.settlements[settlementRef as string];
  assert.ok(settlement !== undefined, 'and the capture holds it');

  const rp = hdr['rp'] as { u: { topicId: string; sequenceNumber: number }; h: string };
  const manifest = (f.topics[rp.u.topicId] ?? []).find((m) => m.sequenceNumber === rp.u.sequenceNumber);
  assert.ok(manifest !== undefined, 'the capture holds the resolution manifest at its locator');

  const birth = await laneBirth(reader, f.lane);
  assert.ok(birth !== null, "the lane’s birth is readable from the lane’s own memo (§11.4, D-171)");

  for (const [what, at] of [
    ['the settlement', settlement.consensusTimestamp],
    ['the connection_created', birth.createdAt],
    ['the resolution manifest', manifest.consensusTimestamp],
  ] as const) {
    assert.equal(before(at, chunkZeroAt), true, `${what} at ${at} precedes chunk 0 at ${chunkZeroAt}`);
  }

  // --- A window whose `from` is chunk 0 itself. ---------------------------
  //
  // §11.2 bounds by the canonical chunk 0’s consensus timestamp, inclusive, so
  // `from` = chunkZeroAt admits this envelope and excludes everything earlier.
  // All three facts above sit strictly before it.
  const window = { from: chunkZeroAt, to: '9999999999.999999999' };
  for (const [what, at] of [
    ['the settlement', settlement.consensusTimestamp],
    ['the connection_created', birth.createdAt],
    ['the resolution manifest', manifest.consensusTimestamp],
  ] as const) {
    assert.ok(compareTimestamps(at, window.from) < 0, `${what} is outside the window (§11.2)`);
  }

  const { bundle } = await verify(reader, { lane: f.lane, claims: ['hcs14'] }, { window });

  // --- The window bounded what was RECONCILED. ----------------------------
  assert.equal(bundle.correspondence.length, 1, 'only the envelope whose chunk 0 is inside the window is reconciled');
  const entry = bundle.correspondence[0];
  assert.ok(entry !== undefined, 'and it is there');
  assert.equal(entry.envelope.aadHash, ENVELOPE, 'it is the reply');

  // --- "appraises verified". ----------------------------------------------
  assert.deepEqual(
    { standing: entry.appraisal.appraised.standing, reasons: [...entry.appraisal.appraised.reasons] },
    { standing: 'verified', reasons: [] },
    'the envelope appraises verified inside the window (§11.2, §11.5)',
  );
  assert.equal(entry.appraisal.resolution.standing, 'verified', 'and so does its resolution');

  // --- "its bundle carries all three". ------------------------------------
  assert.ok(entry.settlement !== undefined, 'the bundle carries the settlement');
  assert.equal(entry.settlement.txRef, settlement.txRef, 'the one the header names');
  assert.ok(
    bundle.topics.includes(birth.doorbell),
    `the bundle carries the doorbell the connection_created is on (${birth.doorbell})`,
  );
  assert.ok(
    bundle.topics.includes(rp.u.topicId),
    `the bundle carries the manifest’s topic (${rp.u.topicId})`,
  );

  // And the window it reports is the window it was given, not the one it found.
  assert.deepEqual({ from: bundle.window.from, to: bundle.window.to }, window, '§11.7: the bundle names its window');
});
