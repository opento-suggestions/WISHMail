/**
 * T-P9-6 — P-9 (Strict standards).
 *
 * Classes: CORRESPONDENT, VERIFIER.
 * Register: NAMED (§7.1)
 * @fixture-kind altered
 *
 * §A’s sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   `send` returns `SEND_LANE_INVALID` for a lane closed at or before submission; replay appraises such an envelope unbound.
 *
 * EXPANDED 2026-09-10 over `checkpoint-two-resolved`, with a `close_connection`
 * added at two different moments.
 *
 * WHY "AT OR BEFORE SUBMISSION" IS THE WHOLE OF IT. A lane cannot be reopened —
 * HCS-10 has no such operation and §7.1 does not invent one — so a close is
 * final and the only question is when it happened relative to the letter. A
 * letter posted BEFORE the close is a letter posted onto an open lane, and
 * closing afterwards cannot retroactively unbind it: §11.5's whole posture is
 * that an appraisal is about what consensus recorded, in the order consensus
 * recorded it. A letter posted AFTER is a letter onto a lane that was not there
 * to receive it. Both are tested below, and the second is the one that must
 * refuse.
 *
 * A NOTE ON WHERE THE REPLAY CHECK LIVES, BECAUSE IT MATTERS TO READING THE
 * RESULT. `verify` consults `closedBy` inside the claimed-profile branch, beside
 * the doorbell walk — so a Verifier claiming NO profile does not notice a closed
 * lane at all. That is the same darkness LIMITATIONS L-1 records for T-P1-10 and
 * for the lane binding, and L-1 does not currently name T-P9-6 among them. The
 * body asserts it both ways so the difference is measured rather than described:
 * with `hcs14` claimed the close is seen, and without it the appraisal does not
 * move.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { closedBy, laneRefusal, type Lane } from '../../app/src/tools/send.js';
import { verify } from '../../app/src/tools/verify.js';
import { chunksOn, copy, fixture, readerOver, type Fixture } from '../support/fixtures.js';

const FIXTURE = 'checkpoint-two-resolved';
/** The reply — the last letter on the lane, so a close can be placed on either side of it. */
const ENVELOPE = 'bc1bd61ee97faee136f8f15f1cf0de7590bfef65446d6024982d0152fcd7e492';

/** A `close_connection` on the lane at a given consensus time (§7.1). */
function closeAt(f: Fixture, seconds: string): Fixture {
  const g = copy(f);
  const lane = g.topics[g.lane] as { topicId: string; sequenceNumber: number; consensusTimestamp: string; runningHash: string; runningHashVersion: number; contents: string; payer: string }[];
  const last = lane[lane.length - 1];
  assert.ok(last !== undefined, 'the lane holds messages');
  lane.push({
    topicId: g.lane,
    sequenceNumber: last.sequenceNumber + 1,
    consensusTimestamp: seconds,
    runningHash: '',
    runningHashVersion: 3,
    contents: JSON.stringify({
      p: 'hcs-10',
      op: 'close_connection',
      operator_id: '0.0.10452149@0.0.10452127',
      reason: 'closed by the acceptor',
    }),
    payer: '0.0.8641261',
  });
  return g;
}

test('T-P9-6 — Strict standards', async () => {
  const f = fixture(FIXTURE);

  const zero = chunksOn(f).find((c) => c.chunk['id'] === ENVELOPE && c.chunk['i'] === 0);
  assert.ok(zero !== undefined, 'the reply’s chunk 0 is on the lane');
  const postedAt = zero.message.consensusTimestamp;
  const seconds = Number(postedAt.split('.')[0]);

  const lane = { topicId: f.lane, createdAt: '0.0' } as Lane;
  const info = f.topicInfo[f.lane];
  assert.ok(info !== undefined && info !== null, 'the lane’s record');
  const [a, b] = info.submitKeys;
  assert.ok(a !== undefined && b !== undefined, 'the lane names two keys');

  // --- As captured: open, and nothing to refuse. --------------------------
  assert.equal(await closedBy(readerOver(f), f.lane), null, 'the captured lane carries no close_connection');
  assert.equal(await laneRefusal(readerOver(f), lane, a, b), null, '`send` accepts it (§6.4)');

  const { bundle: open } = await verify(readerOver(f), { lane: f.lane, claims: ['hcs14'] }, {});
  for (const e of open.correspondence) {
    assert.equal(e.appraisal.appraised.reasons.includes('T-P9-6'), false, 'and no envelope on it is closed-lane');
  }

  // --- Closed BEFORE the letter was posted: refused both ways. ------------
  {
    const g = closeAt(f, `${String(seconds - 60)}.000000000`);

    const found = await closedBy(readerOver(g), g.lane);
    assert.ok(found !== null, 'the close is on the lane');
    assert.equal(
      await closedBy(readerOver(g), g.lane, postedAt),
      found,
      'and it is at or before the letter’s own submission (§7.1)',
    );

    const refusal = await laneRefusal(readerOver(g), lane, a, b);
    assert.ok(refusal !== null, '`send` returns SEND_LANE_INVALID for a closed lane (§6.4)');
    assert.match(refusal, /close_connection/, 'and says so');
    assert.match(refusal, /T-P9-6/, 'naming this test');

    const { bundle } = await verify(readerOver(g), { lane: g.lane, claims: ['hcs14'] }, {});
    const entry = bundle.correspondence.find((e) => e.envelope.aadHash === ENVELOPE);
    assert.ok(entry !== undefined, 'the envelope is still reconciled — a refusal is an appraisal (P-12)');
    assert.equal(entry.appraisal.appraised.standing, 'unbound', 'replay appraises it unbound (§11.5)');
    assert.ok(entry.appraisal.appraised.reasons.includes('T-P9-6'), 'with T-P9-6 among its reasons');

    // --- AND THE SAME BYTES UNDER A CLAIMLESS VERIFIER. -------------------
    //
    // Measured, because it is a real limit of what this release SEES rather
    // than of what it does: `verify` consults `closedBy` inside the
    // claimed-profile branch, so a Verifier claiming nothing does not notice.
    const { bundle: claimless } = await verify(readerOver(g), { lane: g.lane }, {});
    const unseen = claimless.correspondence.find((e) => e.envelope.aadHash === ENVELOPE);
    assert.ok(unseen !== undefined, 'the claimless Verifier reconciles it too');
    assert.equal(
      unseen.appraisal.appraised.reasons.includes('T-P9-6'),
      false,
      'and does NOT see the close — the same darkness LIMITATIONS L-1 records for T-P1-10, which L-1 does not name for T-P9-6',
    );
  }

  // --- Closed AFTER the letter was posted: the letter stands. -------------
  //
  // A close cannot retroactively unbind what was already on an open lane, and
  // §7.1's own words are "at or before submission".
  {
    const g = closeAt(f, `${String(seconds + 3600)}.000000000`);

    assert.equal(
      await closedBy(readerOver(g), g.lane, postedAt),
      null,
      'the close is after this letter, so it does not close the lane for it (§7.1)',
    );

    const { bundle } = await verify(readerOver(g), { lane: g.lane, claims: ['hcs14'] }, {});
    const entry = bundle.correspondence.find((e) => e.envelope.aadHash === ENVELOPE);
    assert.ok(entry !== undefined, 'the envelope is reconciled');
    assert.equal(
      entry.appraisal.appraised.reasons.includes('T-P9-6'),
      false,
      'and it is not closed-lane: a letter posted onto an open lane stays posted onto an open lane',
    );
    assert.equal(entry.appraisal.appraised.standing, 'verified', 'it appraises as it did before the close');

    // But a new letter could not be sent now, which is the other half of the
    // same sentence: `send` reads the close with no `at`, so it refuses today.
    assert.notEqual(
      await laneRefusal(readerOver(g), lane, a, b),
      null,
      'though `send` would refuse a NEW letter onto it, because the lane is closed now (§6.4)',
    );
  }
});
