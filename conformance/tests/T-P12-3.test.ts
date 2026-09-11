/**
 * T-P12-3 — P-12 (Honest degradation).
 *
 * Classes: CORRESPONDENT.
 * Register: NAMED (§9.1)
 * @fixture-kind model
 *
 * §A’s sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   `send` with expired coordinates yields an envelope whose resolution proof is newer than the coordinates supplied, and no failure.
 *
 * EXPANDED 2026-09-11 over the modelled ledger — behaviour, and a refusal that
 * must NOT happen, which is the harder kind to test (RECORD, 2026-09-11).
 *
 * WHAT "EXPIRED" MEANS HERE. §5.3 gives `MailCoordinates` a `resolvedAt` — the
 * query time, reported beside the coordinates and bound into nothing (D-175). So
 * coordinates do not expire the way a ticket does: they simply get old, and an
 * agent may hold them for as long as it likes. §9.1's question is what a sender
 * does when it notices.
 *
 * AND THE ANSWER IS THE WHOLE OF P-12. It does not fail — §6.2 is explicit that
 * "a stale, vague, or partially withheld answer is not a failure: it is
 * coordinates with an endorsement" — and it does not silently use what it was
 * handed either. It publishes a proof NOW, at §6.4 step 2, before it seals, and
 * that proof is what the envelope binds. So the letter carries evidence younger
 * than the sender's memory of the address, and a Verifier replaying it replays
 * something the sender actually did rather than something it once knew.
 *
 * THIS IS ALSO WHY §11.6 CAN FORBID RE-OBTAINING AT APPRAISAL TIME. If the proof
 * were the sender's old lookup, a Verifier would have to go and look again to
 * say anything — and would then be appraising at its own clock, which is the one
 * thing §11.6 rules out. The freshness has to be the SENDER's, at send time, and
 * this is the row that says so.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareTimestamps } from '../../app/src/tools/consensus.js';
import { resolveHcs14 } from '../../app/src/resolve/hcs14.js';
import { send, type SenderContext } from '../../app/src/tools/send.js';
import { readerSource } from '../../app/src/tools/verify.js';
import { openLane, pair, stand } from '../support/world.js';

test('T-P12-3 — Honest degradation', async () => {
  const world = stand();
  const { sender, recipient } = pair(world);
  openLane(world, { acceptor: recipient, requester: sender });

  const resolution = await resolveHcs14(
    readerSource(world.ledger.as(sender.account)),
    world.ledger.ledgerTag,
    recipient.account,
    sender.manifestTopic,
  );
  assert.ok(!('failure' in resolution), 'the recipient resolves under §9.2');

  const fresh = resolution.coordinates as unknown as Record<string, unknown>;
  assert.equal(typeof fresh['resolvedAt'], 'string', '§5.3: coordinates report when they were resolved');

  // --- COORDINATES FROM LAST YEAR. ---------------------------------------
  //
  // The address is the same and the agent has not moved; the sender's memory of
  // the lookup is simply old. §5.3's `resolvedAt` is what says so, and D-175 is
  // why it says so beside the coordinates rather than inside the proof.
  const stale = { ...fresh, resolvedAt: '2025-01-01T00:00:00.000Z' };

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

  const before = await world.ledger.reader().messages(sender.manifestTopic);

  // --- AND NO FAILURE. ---------------------------------------------------
  const sent = await send(ctx, {
    coordinates: stale as never,
    manifest: resolution.manifest as unknown as Record<string, unknown>,
    payload: Buffer.from('Sent on an old address book, and posted all the same.', 'utf8'),
  });
  assert.equal(sent.kind, 'postmark', '§6.2: a stale answer is not a failure — the letter went out');
  assert.ok('postmark' in sent, 'and it carries a postmark');

  // --- THE PROOF IS NEWER THAN THE COORDINATES SUPPLIED. -----------------
  const locator = sent.manifestLocator;
  assert.equal(locator.topicId, sender.manifestTopic, 'the proof was published on the sender’s manifest topic (§9.1)');

  const after = await world.ledger.reader().messages(sender.manifestTopic);
  assert.ok(after.length > before.length, 'and it was published by THIS send, not carried over from the lookup');

  const published = after.find((m) => m.sequenceNumber === locator.sequenceNumber);
  assert.ok(published !== undefined, 'the manifest is at the locator the envelope names');

  // Newer than the coordinates: the publication is a consensus fact dated now,
  // and `resolvedAt` is a wall clock dated whenever the sender last looked.
  const publishedAtMs = Number(published.consensusTimestamp.split('.')[0]) * 1000;
  assert.ok(
    publishedAtMs > Date.parse(stale['resolvedAt'] as string),
    `the proof was published at ${published.consensusTimestamp}, after the coordinates were resolved at ${String(stale['resolvedAt'])}`,
  );

  // And newer than every message that was on the topic before it — the ordering
  // that matters is consensus order, not a clock either party keeps.
  for (const earlier of before) {
    assert.equal(
      compareTimestamps(earlier.consensusTimestamp, published.consensusTimestamp) < 0,
      true,
      `the proof follows the message at sequence ${earlier.sequenceNumber} (§9.1)`,
    );
  }

  // --- AND THE ENVELOPE BINDS THE NEW PROOF, NOT THE OLD COORDINATES. ----
  //
  // §7.2 puts the proof's hash inside the AAD, so which proof the letter is
  // welded to is not a matter of record-keeping: it is the identifier.
  assert.equal(
    sent.envelope.resolutionProof.uri?.sequenceNumber,
    locator.sequenceNumber,
    '§7.2: the envelope names the proof that was just published',
  );
  assert.match(sent.envelope.resolutionProof.hash, /^[0-9a-f]{64}$/, 'by hash');

  // The letter is on the lane, so "no failure" is not "nothing happened".
  const onLane = (await world.ledger.reader().messages(sent.postmark.topicId)).filter((m) =>
    m.contents.includes('"op":"message"'),
  );
  assert.ok(onLane.length > 0, 'and the letter is on the lane');
});
