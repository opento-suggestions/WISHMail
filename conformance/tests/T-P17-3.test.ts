/**
 * T-P17-3 — P-17 (Keys at creation).
 *
 * Classes: CORRESPONDENT, RECIPIENT, POSTMASTER.
 * Register: NAMED (§9.1)
 * @fixture-kind captured
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   Every fixture manifest topic has the agent's key as its sole submit key and the memo `wishmail:manifest:1`.
 *
 * EXPANDED 2026-09-10 over every manifest topic the six captures hold.
 *
 * WHY THE EXPECTATION FOLLOWS FROM THE TEXT. §9.1 gives the manifest topic one
 * job: to be the place an agent's own proofs are published, where a reader can
 * tell that the agent published them. A sole submit key is what carries that —
 * "the agent's key AND NOTHING ELSE" — because a second key on the topic would
 * mean a manifest there was not necessarily the agent's, and §11.4's whole
 * resolution paragraph reads manifests off it. The memo is how a reader knows
 * what kind of topic it is without being told.
 *
 * WHOSE KEY IS "THE AGENT'S" IS READ FROM CONSENSUS AND NOT ASSUMED. The
 * capture carries each account's key as the mirror returned it, so the body
 * asks whether the topic's sole submit key is the key of an account this
 * correspondence actually names — and for the manifest a header points at, that
 * the account is the one that affixed the postage (§7.2's fourth weld), which
 * makes the proof the sender's own.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allFixtures, chunksOn } from '../support/fixtures.js';

test('T-P17-3 — Keys at creation', () => {
  let topics = 0;

  for (const { name, f } of allFixtures()) {
    const manifestTopics = Object.entries(f.topicInfo).filter(
      ([, info]) => info !== null && info.memo === 'wishmail:manifest:1',
    );
    assert.ok(manifestTopics.length > 0, `${name}: the capture holds at least one manifest topic`);

    for (const [topicId, info] of manifestTopics) {
      const where = `${name} / ${topicId}`;
      assert.ok(info !== null, `${where}: the mirror returned its record`);

      assert.equal(info.memo, 'wishmail:manifest:1', `${where}: §9.1's memo, exactly`);
      assert.equal(info.submitKeys.length, 1, `${where}: a SOLE submit key (§9.1) — it has ${info.submitKeys.length}`);

      const key = info.submitKeys[0];
      assert.ok(typeof key === 'string' && key.length > 0, `${where}: and it is a key`);

      // It is an agent's key, and the capture says whose.
      const owners = Object.entries(f.accounts).filter(([, a]) => a.key !== null && a.key.toLowerCase() === key.toLowerCase());
      assert.equal(
        owners.length,
        1,
        `${where}: the sole submit key is the key of exactly one account this correspondence names`,
      );

      // §7.1 forbids a fee on a lane; §9.1 says nothing about one here, but a
      // manifest topic that charged would make publishing a proof cost postage,
      // and none of them does. Measured rather than assumed.
      assert.equal(info.customFees.length, 0, `${where}: no custom fee stands between an agent and its own proof`);
      assert.equal(info.deleted, false, `${where}: the topic is on the ledger`);
    }

    // AND THE ONE THAT MATTERS: the manifest a header points at is on a topic
    // whose sole key belongs to the account that affixed the postage.
    for (const { chunk } of chunksOn(f)) {
      if (chunk['i'] !== 0) continue;
      const hdr = chunk['hdr'] as Record<string, unknown>;
      const rp = hdr['rp'] as { u?: { topicId?: string } };
      const topicId = rp.u?.topicId;
      const settlementRef = hdr['st'];
      if (typeof topicId !== 'string' || typeof settlementRef !== 'string') continue;

      const info = f.topicInfo[topicId];
      const settlement = f.settlements[settlementRef];
      if (info === undefined || info === null || settlement === undefined) continue;

      const senderKey = f.accounts[settlement.from]?.key;
      assert.ok(
        senderKey !== undefined && senderKey !== null && info.submitKeys[0]?.toLowerCase() === senderKey.toLowerCase(),
        `${name} / ${topicId}: the proof this envelope binds is on the manifest topic of the account that affixed its postage (§7.2, §9.1)`,
      );
    }

    topics += manifestTopics.length;
  }

  assert.ok(topics >= 6, `${topics} manifest topics across the captures`);
});
