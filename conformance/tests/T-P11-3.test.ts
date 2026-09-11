/**
 * T-P11-3 — P-11 (Postage is postage).
 *
 * Classes: RECIPIENT, CORRESPONDENT.
 * Register: NAMED (§7.1)
 * @fixture-kind captured, altered
 *
 * §A’s sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   Every fixture lane (whoever created it) carries no custom fee; `send` returns `SEND_LANE_INVALID` for one that does.
 *
 * EXPANDED 2026-09-10 over every captured lane, with an altered copy for the
 * refusal.
 *
 * WHY A LANE MUST NOT CHARGE, AND WHY THE DOORBELL MUST. §4.4 puts a HIP-991 fee
 * on the doorbell: ringing a stranger's bell costs a stamp, and that is the
 * whole of what postage buys at first contact. The lane is what the ring bought.
 * A fee on it would charge a second time for what has already been paid for, and
 * — worse — it would let the acceptor price the correspondence after the fact,
 * on a topic whose admin key it holds. §11.2's ledger of what a letter costs
 * would then be incomplete by design: the price list prices postage, and nothing
 * prices a lane.
 *
 * "WHOEVER CREATED IT" IS IN THE SKETCH FOR A REASON. The acceptor creates the
 * lane, so the party with the power to put a fee on it is not the party who
 * would pay it. That asymmetry is exactly what the check is for, and it is why
 * the check belongs to the SENDER — `laneRefusal` runs before any postage is
 * affixed (§6.4), so a lane that charges costs nothing to discover.
 *
 * `laneRefusal` takes a `Reader` and no writer, so both halves of the sketch run
 * offline with nothing configured.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { laneRefusal, type Lane } from '../../app/src/tools/send.js';
import { allFixtures, copy, fixture, readerOver, stampTokenPin } from '../support/fixtures.js';

test('T-P11-3 — Postage is postage', async () => {
  // --- Every captured lane carries no custom fee. -------------------------
  let lanes = 0;
  for (const { name, f } of allFixtures()) {
    const info = f.topicInfo[f.lane];
    assert.ok(info !== undefined && info !== null, `${name}: the capture holds the lane’s own record`);
    assert.deepEqual([...info.customFees], [], `${name}: the lane ${f.lane} carries no custom fee (§7.1)`);
    assert.deepEqual([...info.feeExemptKeys], [], `${name}: and no fee-exempt key, because there is no fee`);
    lanes += 1;
  }
  assert.ok(lanes >= 6, `${lanes} captured lanes carry no fee`);

  // --- And the doorbell DOES, which is the contrast that makes it a rule. --
  //
  // The same captures hold doorbells, and §4.4's fee is on every one of them:
  // exactly one unit of the pinned stamp token, collected by the treasury.
  const pin = stampTokenPin('hedera:testnet');
  let doorbells = 0;
  for (const { name, f } of allFixtures()) {
    for (const [topicId, info] of Object.entries(f.topicInfo)) {
      if (info === null || !/^hcs-10:0:[0-9]+:0:/.test(info.memo)) continue;
      assert.equal(info.customFees.length, 1, `${name} / ${topicId}: a doorbell charges (§4.4)`);
      const fee = info.customFees[0];
      assert.ok(fee !== undefined, 'and the fee was captured');
      assert.equal(fee.tokenId, pin.tokenId, `${name} / ${topicId}: in the pinned stamp token`);
      assert.equal(fee.collector, pin.treasury, `${name} / ${topicId}: collected by the treasury (§4.3)`);
      doorbells += 1;
    }
  }
  assert.ok(doorbells > 0, 'at least one doorbell was captured, so the contrast is measured and not asserted');

  // --- `send` returns SEND_LANE_INVALID for a lane that charges. ----------
  const f = fixture('checkpoint-two-resolved');
  const lane = { topicId: f.lane, createdAt: '0.0' } as Lane;
  const info = f.topicInfo[f.lane];
  assert.ok(info !== undefined && info !== null, 'the lane’s record');
  const [first, second] = info.submitKeys;
  assert.ok(first !== undefined && second !== undefined, 'the lane names two keys');

  assert.equal(
    await laneRefusal(readerOver(f), lane, first, second),
    null,
    '`send` accepts the lane as captured — no fee to refuse',
  );

  for (const fee of [
    { amount: 1, tokenId: pin.tokenId, collector: pin.treasury },
    { amount: 1, tokenId: pin.tokenId, collector: '0.0.999999' },
    { amount: 40, tokenId: '0.0.888888', collector: '0.0.999999' },
  ]) {
    const g = copy(f);
    (g.topicInfo[g.lane] as { customFees: unknown[] }).customFees = [fee];

    const refusal = await laneRefusal(readerOver(g), lane, first, second);
    assert.ok(refusal !== null, `a lane charging ${fee.amount} of ${fee.tokenId} is refused (§6.4, SEND_LANE_INVALID)`);
    assert.match(refusal, /custom fee/, 'and the refusal says why');
    assert.match(refusal, /T-P11-3/, 'naming this test');
  }

  // Even a fee that looks exactly like the doorbell's is refused: §7.1 forbids a
  // fee on a lane, not an unreasonable one, and a rule that weighed the amount
  // would be a rule about price rather than about what a lane is.
  {
    const g = copy(f);
    (g.topicInfo[g.lane] as { customFees: unknown[] }).customFees = [
      { amount: 1, tokenId: pin.tokenId, collector: pin.treasury },
    ];
    assert.notEqual(
      await laneRefusal(readerOver(g), lane, first, second),
      null,
      'a lane charging one stamp to the treasury is still refused — §7.1 forbids a fee, not a high one',
    );
  }
});
