/**
 * T-P16-2 — P-16 (Buying is not banking).
 *
 * Classes: RECIPIENT, POSTMASTER.
 * Register: NAMED (§10.4)
 * @fixture-kind captured, altered, model
 *
 * §A’s sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   Across the RECIPIENT suite, the recipient account’s HBAR and stamp balances are unchanged by `ack`.
 *
 * EXPANDED 2026-09-11 over `gate-three-certified`, and one altered copy.
 *
 * WHY A RECEIPT MUST COST THE RECIPIENT NOTHING. §10.4 puts the receipt inside a
 * long-term schedule whose `payerAccountId` is somebody else — never the
 * recipient — so that acknowledging a letter is free to the party being asked to
 * acknowledge it. The reason is not politeness. A receipt that cost the
 * recipient would make acknowledgement a decision about money, and §8.6’s whole
 * arrangement depends on it being a decision about whether the letter arrived.
 * A sender could otherwise price its correspondent out of replying.
 *
 * THE RECIPIENT PAYS FOR ITS OWN `ScheduleSign` AND NOTHING ELSE. That is the
 * one transaction it submits (§6.6), and it is the recipient’s own act. What
 * §10.4 forbids is the INNER transaction — the submission the schedule executes
 * — being charged to it.
 *
 * WHAT IS CHECKED HERE, AND WHAT IS NOT. The rule is visible on consensus: the
 * schedule record names its payer, and §11.4 reports `T-P16-2` where that payer
 * is the recipient. That is checked both ways below. The sketch’s own sentence —
 * balances UNCHANGED — is a measurement across an act, and a capture is a single
 * moment: it holds no balances at all, and could not hold two.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openLane, pair, stand } from '../support/world.js';
import { readerSource } from '../../app/src/tools/verify.js';
import { ack } from '../../app/src/tools/ack.js';
import { inbox } from '../../app/src/tools/inbox.js';
import { send, type SenderContext } from '../../app/src/tools/send.js';
import { resolveHcs14 } from '../../app/src/resolve/hcs14.js';
import { decodeScheduledSubmission } from '../../app/src/core/schedulebody.js';
import { verify } from '../../app/src/tools/verify.js';
import { copy, fixture, readerOver } from '../support/fixtures.js';

const FIXTURE = 'gate-three-certified';
const ENVELOPE = '2229a6c909d4b6c53889d6fda5ee173ff322debec9010a6aaf9e5cb388079c01';

test('T-P16-2 — Buying is not banking', async () => {
  const pristine = fixture(FIXTURE);
  const schedules = pristine.schedules ?? {};
  const scheduleId = Object.keys(schedules)[0];
  assert.ok(scheduleId !== undefined, 'the lane carries a receipt request');
  const record = schedules[scheduleId];
  assert.ok(record !== undefined, 'and the capture holds its record');

  // Who the recipient is, from the receipt's own meaning (§10.4).
  const inner = decodeScheduledSubmission(Buffer.from(record.transactionBody, 'base64'));
  const published = JSON.parse(inner.message.toString('utf8')) as { meaning?: { statement?: string } };
  const recipient = (published.meaning?.statement ?? '').split(' ')[0] ?? '';
  assert.match(recipient, /^[0-9]+\.[0-9]+\.[0-9]+$/, 'the receipt names the recipient’s account');

  // --- As it ran: the inner transaction is not charged to the recipient. --
  assert.notEqual(
    record.payer,
    recipient,
    `§10.4: the schedule’s payer is ${record.payer} and the recipient is ${recipient} — never the same`,
  );

  const { bundle } = await verify(readerOver(pristine), { lane: pristine.lane }, {});
  const entry = bundle.correspondence.find((e) => e.envelope.aadHash === ENVELOPE);
  assert.ok(entry !== undefined, 'the envelope is reconciled');
  assert.equal(entry.appraisal.receipt.status, 'acked', 'the receipt is acked');
  assert.equal(
    entry.appraisal.receipt.reasons.includes('T-P16-2'),
    false,
    'and nothing is said against who paid for it',
  );

  // --- The recipient named as payer: reported, and the receipt invalid. ---
  {
    const g = copy(pristine);
    const doctored = (g.schedules as Record<string, Record<string, unknown>>)[scheduleId] as Record<string, unknown>;
    doctored['payer'] = recipient;

    const { bundle: after } = await verify(readerOver(g), { lane: g.lane }, {});
    const charged = after.correspondence.find((e) => e.envelope.aadHash === ENVELOPE);
    assert.ok(charged !== undefined, 'reconciled');
    assert.ok(
      charged.appraisal.receipt.reasons.includes('T-P16-2'),
      '§11.4 reports it by name when the recipient is the inner transaction’s payer',
    );
    assert.equal(charged.appraisal.receipt.status, 'invalid', 'and the receipt is invalid, not merely noted');
    assert.notEqual(charged.state, 'ACKED', 'so nothing moved the envelope on a receipt the recipient paid for');
  }

  // And a third party paying is fine: the rule is about the recipient, not
  // about who else it might be.
  {
    const g = copy(pristine);
    const doctored = (g.schedules as Record<string, Record<string, unknown>>)[scheduleId] as Record<string, unknown>;
    doctored['payer'] = '0.0.777777';

    const { bundle: after } = await verify(readerOver(g), { lane: g.lane }, {});
    const paid = after.correspondence.find((e) => e.envelope.aadHash === ENVELOPE);
    assert.equal(
      paid?.appraisal.receipt.reasons.includes('T-P16-2'),
      false,
      '§10.4 forbids the recipient as payer and names no one else',
    );
  }

  // === THE BALANCE CLAUSE, over the modelled ledger ======================
  //
  // "The recipient account's HBAR and stamp balances are unchanged by `ack`."
  // That is a measurement ACROSS an act, and a capture is one moment: the
  // fixtures hold no balances and could not hold two. So the letter is sent,
  // opened and signed for against a ledger that keeps balances, and the
  // recipient's is read on both sides of the signature.
  //
  // The model has one currency and it is stamps, which is the half that can be
  // measured; HBAR is not modelled at all, and §10.4's mechanism for it is the
  // same one — `payerAccountId` on the schedule, checked above from consensus in
  // both directions. That limit is named rather than papered over.
  {
    const world = stand();
    const { sender, recipient } = pair(world);
    openLane(world, { acceptor: recipient, requester: sender });

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
      payload: Buffer.from('Sign for this, and it costs you nothing.', 'utf8'),
      returnReceipt: true,
    });
    assert.ok('postmark' in sent, 'send posted a certified letter (§6.4)');
    assert.ok(sent.receipt !== undefined, 'and requested a receipt on the lane (§6.4 step 7, §10.4)');

    // The recipient opens it with its own key, in its own process (P-13).
    const deliveries = await inbox(
      {
        reader: world.ledger.reader(),
        account: recipient.account,
        keys: new Map([[recipient.keyEpoch, recipient.openWith]]),
      },
      { lanes: [sent.postmark.topicId] },
    );
    const delivery = deliveries.find((d) => d.envelope.aadHash === sent.envelope.aadHash);
    assert.ok(delivery !== undefined && delivery.opened, 'the recipient opened it');
    assert.ok(delivery.returnReceipt !== undefined, 'and its inbox surfaced the pending schedule (§6.5)');

    // --- THE MEASUREMENT. -------------------------------------------------
    const stampsBefore = world.ledger.balance(recipient.account);

    const signed = await ack(
      {
        consensus: world.ledger.as(recipient.account),
        ledgerTag: world.ledger.ledgerTag,
        account: recipient.account,
        doorbell: recipient.doorbell,
        manifestTopic: recipient.manifestTopic,
      },
      delivery,
    );
    assert.ok(signed.receipt !== undefined, 'ack signed, and the schedule executed (§6.6, §10.4)');

    const stampsAfter = world.ledger.balance(recipient.account);
    assert.equal(
      stampsAfter,
      stampsBefore,
      `§10.4, T-P16-2: the recipient's stamp balance is unchanged by ack — ${stampsBefore} before, ${stampsAfter} after`,
    );
    assert.equal(stampsBefore, 0, 'and it was nothing to begin with, so there was nothing to spend');

    // The receipt really did land, so "unchanged" is not "nothing happened".
    const landed = await world.ledger.reader().messages(recipient.manifestTopic);
    assert.ok(landed.length > 0, 'the receipt is on the recipient’s own manifest topic (§10.4)');

    // And the schedule's inner transaction was charged to somebody else, which
    // is the mechanism that made the measurement come out this way.
    const record = await world.ledger.reader().schedule(delivery.returnReceipt.scheduleId);
    assert.ok(record !== null, 'consensus holds the schedule');
    assert.notEqual(record.payer, recipient.account, '§10.4: its payer is never the recipient');
  }
});
