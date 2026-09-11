/**
 * T-P12-5 — P-12 (Honest degradation).
 *
 * Classes: CORRESPONDENT, VERIFIER.
 * Register: NAMED (§10.5)
 * @fixture-kind model
 * @disposition partial — the VERIFIER clause needs a slip on consensus
 *
 * §A’s sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   A first contact whose window elapses yields a slip whose manifest is on the sender’s manifest topic, whose output recomputes from the doorbell, and whose appraisal is unchanged by a late `connection_created`.
 *
 * EXPANDED 2026-09-11 over the modelled ledger — the CORRESPONDENT half, which
 * is behaviour: a window that closes, and what a sender does when it does. The
 * VERIFIER half is named at the end.
 *
 * WHY A SLIP EXISTS AT ALL. §6.4 blocks (D-30): `send` returns when the letter
 * is posted, and a first contact cannot post until somebody answers the
 * doorbell. §14 has no way to make a stranger answer, so the window can close
 * with nothing having happened — and the one thing §11.8 forbids is turning that
 * silence into a refusal. A slip is what a sender may honestly say instead: *I
 * rang, and within the window nobody came to the door.* It says nothing about
 * whether the recipient exists, refused, or was merely asleep.
 *
 * AND IT IS A PROOF, NOT A COMPLAINT. §10.5 puts the slip's manifest on the
 * SENDER's own manifest topic and composes it from what the sender actually did
 * — the doorbell it rang and the moment it rang — so a reader can recompute it.
 * A slip that were only a return value would be a sender's word for it; on the
 * sender's manifest topic it is a record anybody can check, including against
 * the doorbell, which is public.
 *
 * THE MODEL IS WHERE THIS CAN BE TRIED because nothing in a modelled world
 * answers a door: the window closes for real, and it closes fast.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canonicalDigest } from '../../app/src/core/canonical.js';
import { resolveHcs14 } from '../../app/src/resolve/hcs14.js';
import { send, type SenderContext } from '../../app/src/tools/send.js';
import { readerSource } from '../../app/src/tools/verify.js';
import { pair, stand } from '../support/world.js';

test('T-P12-5 — Honest degradation', async () => {
  const world = stand();
  const { sender, recipient } = pair(world);

  // NO LANE IS OPENED. This is a first contact, and nothing in this world will
  // answer the door — which is the condition §10.5 is about.
  const resolution = await resolveHcs14(
    readerSource(world.ledger.as(sender.account)),
    world.ledger.ledgerTag,
    recipient.account,
    sender.manifestTopic,
  );
  assert.ok(!('failure' in resolution), 'the recipient resolves — the address is good; nobody is home');

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

  const stampsBefore = world.ledger.balance(sender.account);

  const result = await send(ctx, {
    coordinates: resolution.coordinates as never,
    manifest: resolution.manifest as unknown as Record<string, unknown>,
    payload: Buffer.from('Is anybody there?', 'utf8'),
    windowSeconds: 1,
  });

  // --- A SLIP, and not a failure. ----------------------------------------
  assert.equal(result.kind, 'slip', '§10.5: the window closed and `send` returned a slip, not an error (§11.8)');
  assert.ok('slip' in result, 'and the slip is the result');
  const slip = result.slip;

  // --- Whose manifest is on the SENDER’s manifest topic. -----------------
  const locator = result.manifestLocator;
  assert.equal(
    locator.topicId,
    sender.manifestTopic,
    '§10.5: the slip’s manifest is published on the sender’s own manifest topic',
  );
  const published = (await world.ledger.reader().messages(sender.manifestTopic)).find(
    (m) => m.sequenceNumber === locator.sequenceNumber,
  );
  assert.ok(published !== undefined, 'and it is really there');

  // --- Whose output recomputes. ------------------------------------------
  const manifest = JSON.parse(published.contents) as Record<string, unknown>;
  assert.equal(
    canonicalDigest(manifest, 'hash'),
    manifest['hash'],
    '§5.2: the slip’s manifest is content-addressed like any other proof — it recomputes to its own hash',
  );

  // --- And it recomputes FROM THE DOORBELL, which is public. -------------
  //
  // The doorbell the sender rang is named in what it published, so a reader can
  // go to that topic and see the ring for itself. That is what makes a slip
  // checkable rather than merely asserted.
  const flat = JSON.stringify(manifest);
  assert.ok(
    flat.includes(recipient.doorbell),
    `§10.5: the slip names the doorbell it rang (${recipient.doorbell}), so a reader can check it`,
  );
  const rings = await world.ledger.reader().messages(recipient.doorbell);
  assert.ok(
    rings.some((m) => m.contents.includes('"op":"connection_request"')),
    'and the ring is on that doorbell — the sender did what the slip says it did',
  );
  assert.equal(slip.address, recipient.account, 'the slip names the address it was for');
  assert.equal(slip.ledgerTag, world.ledger.ledgerTag, 'and the ledger it is about (§5.1)');

  // --- THE STAMP IS SPENT, AND THE SLIP SAYS SO BY EXISTING. -------------
  //
  // §4.4's doorbell fee is consumed by the ring whether or not anybody answers.
  // A sender that got nothing back but its own money is the case §10.5 exists to
  // make honest: the stamp bought a ring, and the ring happened.
  assert.ok(
    world.ledger.balance(sender.account) < stampsBefore,
    `the ring cost a stamp — ${stampsBefore} before, ${world.ledger.balance(sender.account)} after (§4.4)`,
  );

  // --- NO ENVELOPE WAS POSTED. -------------------------------------------
  //
  // §11.8 again: silence is not refusal, and it is not delivery either. There is
  // no lane, so there is nothing on one.
  assert.equal('postmark' in result, false, 'nothing was posted, because there was nowhere to post it');

  assert.fail(
    'T-P12-5 PARTIAL — the CORRESPONDENT half holds in full: a first contact whose window closes returns a slip ' +
      'and not a failure, its manifest is published on the sender’s own manifest topic, it recomputes to its own ' +
      'hash, it names the doorbell it rang and the ring is on that doorbell, and the stamp the ring cost is gone. ' +
      'The VERIFIER clause — "whose appraisal is unchanged by a late `connection_created`" — is a claim about ' +
      'REPLAY, which the ruling of 2026-09-11 refuses the model for: its whole point is that the bytes came from ' +
      'a network. It needs a captured correspondence in which a first contact timed out and the door answered ' +
      'afterwards, and this deployment has never produced one — every gate was answered inside its window. ' +
      'Recorded rather than quietly dropped (conformance/DERIVATION.md).',
  );
});
