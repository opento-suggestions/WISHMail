/**
 * T-P17-2 — P-17 (Keys at creation).
 *
 * Classes: RECIPIENT, VERIFIER.
 * Register: NAMED (§7.1, §11.4)
 * @fixture-kind captured, altered
 *
 * §A’s sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   Every fixture lane’s submit key is a threshold of exactly the two agents’ keys; admin key per the acceptor’s declared policy; and replay appraises unbound an envelope on a lane whose submit key is not exactly its two parties’ keys. Widened at 0.5.11 by D-171, which made the key list half of the binding test: it is what makes "either party’s doorbell" safe to read.
 *
 * EXPANDED 2026-09-10 over every captured lane, with altered copies for the
 * refusals.
 *
 * WHY THE KEY LIST IS HALF OF THE BINDING TEST. D-171 let a Verifier read a
 * lane’s birth from either party’s doorbell, and that widening is only safe
 * because of this row. Anybody can post a `connection_created` on their own
 * doorbell naming anybody: doorbells are public and the message is just JSON. So
 * the doorbell walk alone would let a stranger manufacture a lane’s provenance.
 * What a stranger cannot do is make a topic whose submit key names two keys it
 * does not hold AND have those two be these two — the key list is set at
 * creation, is on consensus, and names the parties directly. One half is
 * forgeable and the other is not, which is why §11.4 requires both.
 *
 * "A THRESHOLD OF EXACTLY THE TWO KEYS" IS A STATEMENT ABOUT THE LIST, not about
 * the threshold — a 1-of-2 and a 2-of-2 over the same pair both satisfy §7.1,
 * and a 2-of-3 does not however it is weighted. `TopicInfo.submitKeys` is the
 * flattened list for exactly that reason.
 *
 * ON "THE ACCEPTOR’S DECLARED POLICY": the policy document for a Correspondent’s
 * topics lives in that agent’s home, outside this repository (D-165), so what is
 * checkable here is the fact the policy fixes — the lane’s admin key is the
 * acceptor’s own key, which is what lets the acceptor and only the acceptor
 * close the lane (§7.1).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { laneRefusal, type Lane } from '../../app/src/tools/send.js';
import { laneBirth, verify } from '../../app/src/tools/verify.js';
import { allFixtures, copy, fixture, readerOver } from '../support/fixtures.js';

test('T-P17-2 — Keys at creation', async () => {
  // --- Every captured lane: exactly the two agents’ keys. -----------------
  //
  // WHO THE TWO PARTIES ARE comes from the lane’s own birth walk where the
  // capture carries the birth doorbell, and that is the strong form of this
  // check. `checkpoint-one-letter` and `checkpoint-two-receipt` were taken
  // before D-171 made a Verifier read that doorbell, so they do not hold it —
  // a fact about those captures and not about the lane, and it is stated here
  // rather than skipped past. For them the weaker fact still holds and is
  // asserted: two keys, both belonging to accounts the correspondence names.
  let lanes = 0;
  let walked = 0;
  for (const { name, f } of allFixtures()) {
    const info = f.topicInfo[f.lane];
    assert.ok(info !== undefined && info !== null, `${name}: the capture holds the lane’s own record`);
    assert.equal(info.submitKeys.length, 2, `${name}: the submit key names two keys and no more (§7.1)`);

    const birth = await laneBirth(readerOver(f), f.lane);
    if (birth === null) {
      // The capture holds no birth doorbell, so this body cannot say WHOSE the
      // two keys are — and it does not carry the counterparty's account either,
      // so there is nothing weaker to fall back on. Both such captures were
      // taken before D-171 made a Verifier read that doorbell; that is a fact
      // about the fixture and not about the lane, and it is recorded rather
      // than papered over. The lane's own two-key list was asserted above.
      assert.ok(
        f.accounts[f.lane] === undefined,
        `${name}: nothing else is claimed about a lane whose birth this capture cannot reach`,
      );
      lanes += 1;
      continue;
    }
    walked += 1;

    const expected = [birth.owner, birth.requester].map((account) => {
      const key = f.accounts[account]?.key;
      assert.ok(typeof key === 'string' && key !== '', `${name}: the capture carries ${account}’s key from consensus`);
      return key.toLowerCase();
    });

    assert.deepEqual(
      [...info.submitKeys].map((k) => k.toLowerCase()).sort(),
      [...expected].sort(),
      `${name}: and they are EXACTLY the two parties’ keys — this is what makes either doorbell safe to read`,
    );

    // The acceptor’s own key is the admin key: the party that answered is the
    // party that can close (§7.1).
    const acceptorKey = f.accounts[birth.owner]?.key;
    assert.equal(
      info.adminKey?.toLowerCase(),
      acceptorKey?.toLowerCase(),
      `${name}: the admin key is the acceptor’s own — the policy’s document lives in that agent’s home (D-165)`,
    );
    lanes += 1;
  }
  assert.ok(lanes + walked >= 6, `${lanes + walked} captured lanes checked`);
  assert.ok(walked >= 4, `${walked} of them walked to their birth and had the strong check applied`);

  // --- A third key: refused at `send` and unbound at replay. --------------
  const f = fixture('checkpoint-two-resolved');
  const birth = await laneBirth(readerOver(f), f.lane);
  assert.ok(birth !== null, 'the lane’s birth is readable');

  const keyOf = (account: string): string => {
    const key = f.accounts[account]?.key;
    assert.ok(typeof key === 'string', `${account}’s key is on consensus`);
    return key;
  };
  const ownerKey = keyOf(birth.owner);
  const requesterKey = keyOf(birth.requester);
  const stranger = '0'.repeat(64);

  const lane: Lane = { topicId: f.lane, createdAt: birth.createdAt } as Lane;

  // As captured, `send` has nothing to refuse.
  assert.equal(
    await laneRefusal(readerOver(f), lane, requesterKey, ownerKey),
    null,
    '`send` accepts the lane as captured (§6.4)',
  );

  for (const [what, keys] of [
    ['a third key on the lane', [ownerKey, requesterKey, stranger]],
    ['a stranger’s key in place of a party’s', [ownerKey, stranger]],
    ['one key only', [ownerKey]],
  ] as const) {
    const g = copy(f);
    (g.topicInfo[g.lane] as { submitKeys: string[] }).submitKeys = [...keys];

    // The `send` half, over a `Reader` and no writer.
    const refusal = await laneRefusal(readerOver(g), lane, requesterKey, ownerKey);
    assert.ok(refusal !== null, `${what}: \`send\` refuses it — SEND_LANE_INVALID (§6.4, §7.1)`);
    assert.match(refusal, /T-P17-2/, `${what}: naming this test in the refusal`);

    // The replay half.
    const { bundle } = await verify(readerOver(g), { lane: g.lane, claims: ['hcs14'] }, {});
    for (const e of bundle.correspondence) {
      assert.equal(
        e.appraisal.appraised.standing,
        'unbound',
        `${what}: ${e.envelope.aadHash.slice(0, 12)} appraises unbound (§11.5)`,
      );
      assert.ok(e.appraisal.appraised.reasons.includes('T-P17-2'), `${what}: with T-P17-2 among its reasons`);
    }
  }

  // --- A threshold is not what is being checked: the LIST is. -------------
  //
  // The same two keys in the other order are the same lane. A test that
  // compared ordered lists would fail here and would be testing the mirror’s
  // serialization rather than §7.1.
  {
    const g = copy(f);
    (g.topicInfo[g.lane] as { submitKeys: string[] }).submitKeys = [requesterKey, ownerKey];
    const { bundle } = await verify(readerOver(g), { lane: g.lane, claims: ['hcs14'] }, {});
    for (const e of bundle.correspondence) {
      assert.equal(
        e.appraisal.appraised.reasons.includes('T-P17-2'),
        false,
        'the two keys in the other order are the same two keys (§7.1: "exactly", not an ordering)',
      );
    }
  }
});
