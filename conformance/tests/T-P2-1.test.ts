/**
 * T-P2-1 — P-2 (The Postmaster is blind).
 *
 * Classes: POSTMASTER, CORRESPONDENT.
 * Register: NAMED (§3.5)
 * @fixture-kind model, captured
 *
 * §A’s sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   Every lane message the suite produces is signed by the sending agent’s submit key; a submission bearing only Postmaster keys is rejected at the network (threshold key).
 *
 * EXPANDED 2026-09-11 over the modelled ledger, which is permitted for a clause
 * whose sketch is behaviour — here a refusal — and is marked `model` in the
 * report (RECORD, Sonic 2026-09-11).
 *
 * WHY THIS CANNOT BE READ OFF A CAPTURE, and it is worth being exact about.
 * Consensus records the account that PAID for a submission and not the key that
 * signed it: `TopicMessage` carries a `payer` and nothing else about authorship,
 * and §7.2 says so in as many words — "no header field names a sender". The
 * Postmaster pays for most submissions (§3.5), so that field names the
 * Postmaster far more often than it names anyone of interest, and no check in
 * this implementation reads it for identity. A mirror node simply cannot tell
 * you who signed.
 *
 * SO THE PROPERTY IS ENFORCED BY THE TOPIC AND NOT BY A CHECK, and that is
 * §3.5's whole design: the lane's submit key is a threshold of exactly the two
 * agents' keys (§7.1), so the NETWORK refuses a submission from anybody else.
 * The Postmaster can pay for a letter it cannot write. What a captured lane
 * proves is that every message on it was accepted under that key list — which is
 * asserted below from the captures — and what the model proves is the other
 * half: that a submission from a key the list does not name is refused.
 *
 * "THE POSTMASTER PAYS; THE AGENT SIGNS" (§3.5, P-13) is the sentence, and this
 * is the half of it that a ledger can be made to demonstrate.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LedgerRefusal } from '../../app/src/tools/memory.js';
import { resolveHcs14 } from '../../app/src/resolve/hcs14.js';
import { send, type SenderContext } from '../../app/src/tools/send.js';
import { readerSource } from '../../app/src/tools/verify.js';
import { allFixtures, chunksOn } from '../support/fixtures.js';
import { openLane, pair, stand } from '../support/world.js';

test('T-P2-1 — The Postmaster is blind', async () => {
  // --- Every captured lane message was accepted under the two parties’ keys.
  //
  // The captures cannot say who SIGNED, but they can say what the topic would
  // have admitted, and that is the enforcement §3.5 relies on.
  let messages = 0;
  for (const { name, f } of allFixtures()) {
    const info = f.topicInfo[f.lane];
    assert.ok(info !== undefined && info !== null, `${name}: the lane’s own record`);
    assert.equal(info.submitKeys.length, 2, `${name}: the lane admits exactly two keys (§7.1)`);
    const onLane = chunksOn(f);
    assert.ok(onLane.length > 0, `${name}: and messages were accepted under them`);
    messages += onLane.length;
  }
  assert.ok(messages >= 16, `${messages} captured lane messages, every one admitted by a two-key threshold`);

  // --- The model: a stranger’s submission to a lane is refused. -----------
  const world = stand([
    { name: 'sender', key: `5e4d${'a1'.repeat(30)}`, stamps: 40, displayName: 'Correspondent A' },
    { name: 'recipient', key: `b0b1${'c2'.repeat(30)}`, stamps: 0, displayName: 'Correspondent B' },
    // The Postmaster is an agent too (§3.3), with an account and a key of its
    // own. It pays for things; it is not party to this lane.
    { name: 'postmaster', key: `9f00${'de'.repeat(30)}`, stamps: 0, displayName: 'The Postmaster' },
  ]);
  const { sender, recipient } = pair(world);
  const postmaster = world.agents['postmaster'];
  assert.ok(postmaster !== undefined, 'the world stands up a Postmaster');

  const lane = openLane(world, { acceptor: recipient, requester: sender });

  const resolution = await resolveHcs14(
    readerSource(world.ledger.as(sender.account)),
    world.ledger.ledgerTag,
    recipient.account,
    sender.manifestTopic,
  );
  assert.ok(!('failure' in resolution), 'the modelled recipient resolves under §9.2');

  const ctx: SenderContext = {
    consensus: world.ledger.as(sender.account),
    ledgerTag: world.ledger.ledgerTag,
    account: sender.account,
    doorbell: sender.doorbell,
    log: sender.log,
    manifestTopic: sender.manifestTopic,
    treasury: world.ledger.treasury,
    stampToken: world.ledger.stampToken,
    schemaRef: world.schemaRef,
    publicKey: sender.key,
  };

  const sent = await send(ctx, {
    coordinates: resolution.coordinates as never,
    manifest: resolution.manifest as unknown as Record<string, unknown>,
    payload: Buffer.from('The Postmaster pays; the agent signs.', 'utf8'),
  });
  assert.ok('postmark' in sent, 'the sending agent posted a letter on the lane');
  assert.equal(sent.postmark.topicId, lane, 'onto the lane it shares with the recipient');

  // The message is really there, put there by the agent.
  const posted = (await world.ledger.reader().messages(lane)).filter((m) => m.contents.includes('"op":"message"'));
  assert.ok(posted.length > 0, '§3.5: the AGENT signs, and the message is on the lane');

  // --- A submission bearing only the Postmaster’s key is refused. ---------
  //
  // Not "ignored", not "recorded and disregarded" — refused by the topic, so it
  // never reaches consensus at all. That is what a threshold submit key is for.
  const contents = posted[0]?.contents;
  assert.ok(contents !== undefined, 'the exact bytes the agent submitted');

  let refused: unknown;
  try {
    world.ledger.submit(postmaster.account, lane, contents);
  } catch (e) {
    refused = e;
  }
  assert.ok(refused !== undefined, '§7.1: the lane refuses a submission from a key it does not name');
  assert.ok(refused instanceof LedgerRefusal, 'and it is the ledger refusing, not a tool declining');

  // Nothing landed: the lane holds what it held.
  const after = (await world.ledger.reader().messages(lane)).filter((m) => m.contents.includes('"op":"message"'));
  assert.equal(after.length, posted.length, 'and the lane is exactly as it was');

  // --- AND THE POSTMASTER CAN STILL PAY. ---------------------------------
  //
  // The point of P-2 is not that the Postmaster is shut out — it is that it
  // carries what it cannot read or write. It holds no key of this lane, and the
  // letter it may have paid for travelled under the agent's.
  const laneInfo = await world.ledger.reader().topic(lane);
  assert.ok(laneInfo !== null, 'the lane’s record');
  assert.equal(
    laneInfo.submitKeys.includes(postmaster.key),
    false,
    '§3.5, P-13: the Postmaster holds no key of this lane, ever',
  );
  assert.deepEqual(
    [...laneInfo.submitKeys].sort(),
    [sender.key, recipient.key].sort(),
    '§7.1: exactly the two agents’ keys and no other',
  );
});
