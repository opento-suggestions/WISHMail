/**
 * T-P16-2 — P-16 (Buying is not banking).
 *
 * Classes: RECIPIENT, POSTMASTER.
 * Register: NAMED (§10.4)
 * @fixture-kind captured, altered
 * @disposition partial — "balances unchanged" needs a before and an after
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

  assert.fail(
    'T-P16-2 PARTIAL — the rule is checked in both directions from consensus: the captured schedule names a ' +
      'payer who is not the recipient and the receipt is acked with nothing said against it; the recipient ' +
      'named as payer is reported `T-P16-2` and the receipt is invalid; a third party is fine. What is not ' +
      'reachable is the sketch’s own sentence — the recipient’s HBAR and stamp balances UNCHANGED BY `ack`. ' +
      'That is a measurement across an act, and a capture is one moment: `conformance/fixtures/` holds no ' +
      'balances and could not hold two. It needs a ledger the suite can read before and after a `ScheduleSign` ' +
      '— the modelled ledger, which is permitted for a behaviour clause (RECORD, 2026-09-10) and not yet ' +
      'written. Recorded rather than quietly dropped (conformance/DERIVATION.md).',
  );
});
