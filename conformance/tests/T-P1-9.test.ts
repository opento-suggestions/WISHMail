/**
 * T-P1-9 — P-1 (Binding).
 *
 * Classes: RECIPIENT.
 * Register: NAMED (§10.4)
 * @fixture-kind captured, reconstructed
 *
 * §A’s sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   `ack` refuses a schedule whose body names a different identifier, postmark, or epoch (`ACK_NOT_OPENED`).
 *
 * EXPANDED 2026-09-11 over `gate-three-certified`’s real schedule.
 *
 * THE RECONSTRUCTION, NAMED. `ack` takes a `Delivery` — §6.6 requires "the
 * envelope opened in the caller’s `inbox`", and the `Delivery` is what attests
 * to that. A capture carries no key and never will (P-13), so this body cannot
 * obtain one from `inbox`; it builds one from the captured envelope’s own
 * fields. That the envelope opened is not invented: C opened this letter on
 * 2026-09-10 and signed for it, and the receipt is on consensus. What the body
 * cannot do is re-derive the opening, so it states the fact rather than
 * performing it. `conformance/DERIVATION.md` records this as the suite’s only
 * reconstructed fixture.
 *
 * WHAT THE ROW GUARDS. A return receipt composes from exactly three inputs plus
 * the recipient’s account and manifest topic (§10.4), and its hash is over all
 * of them. So a schedule presented to `ack` names a specific envelope, a
 * specific chunk 0 postmark, and a specific key epoch — and `ack` recomposes
 * from what its OWN inbox saw, never from the schedule. If they differ, the
 * recipient is being asked to sign for something other than the letter it read:
 * a different letter, the same letter at a different postmark, or the same
 * letter under an epoch it did not open with. The signature would be
 * indistinguishable from a real one and permanent.
 *
 * THE ALTERATION IS IN WHAT THE RECIPIENT SAW, NOT IN THE SCHEDULE, and that is
 * the honest direction: the schedule on consensus is left exactly as it is, and
 * the delivery varies. A recipient cannot edit a schedule; it can only be handed
 * one that does not match.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isToolFailure } from '../../app/src/core/failure.js';
import { receiptManifest } from '../../app/src/core/receipt.js';
import { decodeScheduledSubmission } from '../../app/src/core/schedulebody.js';
import { ack, type AckContext } from '../../app/src/tools/ack.js';
import type { Delivery } from '../../app/src/tools/inbox.js';
import { chunksOn, fixture, readerOver } from '../support/fixtures.js';
import { verify } from '../../app/src/tools/verify.js';

const FIXTURE = 'gate-three-certified';
const ENVELOPE = '2229a6c909d4b6c53889d6fda5ee173ff322debec9010a6aaf9e5cb388079c01';
const RECIPIENT = '0.0.10468684';
const RECIPIENT_DOORBELL = '0.0.10468687';
const RECIPIENT_MANIFESTS = '0.0.10468692';

test('T-P1-9 — Binding', async () => {
  const f = fixture(FIXTURE);
  const reader = readerOver(f);

  const scheduleId = Object.keys(f.schedules ?? {})[0];
  assert.ok(scheduleId !== undefined, 'the lane carries a receipt request with a schedule');
  const record = (f.schedules ?? {})[scheduleId];
  assert.ok(record !== undefined, 'and the capture holds its record');

  const zero = chunksOn(f).find((c) => c.chunk['id'] === ENVELOPE && c.chunk['i'] === 0);
  assert.ok(zero !== undefined, 'chunk 0 is on the lane');
  const postmark = zero.message.sequenceNumber;
  const epoch = (zero.chunk['hdr'] as Record<string, unknown>)['ke'] as number;

  // --- The three inputs the real receipt composed from. -------------------
  const real = receiptManifest({
    ledgerTag: f.ledgerTag,
    envelopeId: ENVELOPE,
    postmarkRef: { topicId: f.lane, sequenceNumber: postmark },
    keyEpoch: epoch,
    recipientAccount: RECIPIENT,
    manifestTopic: RECIPIENT_MANIFESTS,
  });
  const inner = decodeScheduledSubmission(Buffer.from(record.transactionBody, 'base64'));
  const published = JSON.parse(inner.message.toString('utf8')) as { hash?: string };
  assert.equal(
    published.hash,
    real.hash,
    '§10.4: the schedule on consensus carries the manifest these three inputs compose',
  );

  // --- The reconstructed delivery, from the captured envelope’s own fields. -
  const { bundle } = await verify(reader, { lane: f.lane }, {});
  const entry = bundle.correspondence.find((e) => e.envelope.aadHash === ENVELOPE);
  assert.ok(entry !== undefined, 'the envelope is on the lane');

  const delivery = (over: { envelopeId?: string; sequenceNumber?: number; epoch?: number }): Delivery => ({
    envelope: { ...entry.envelope, aadHash: over.envelopeId ?? ENVELOPE },
    opened: true,
    payload: Buffer.from(''),
    lane: f.lane,
    chunkPostmarks: [
      { sequenceNumber: over.sequenceNumber ?? postmark, consensusTimestamp: zero.message.consensusTimestamp },
    ],
    openedUnderEpoch: over.epoch ?? epoch,
    returnReceipt: {
      scheduleId,
      sequenceNumber: 2,
      consensusTimestamp: record.consensusTimestamp,
      requestedByHeader: true,
    },
  });

  const ctx: AckContext = {
    // `ack` reads the schedule and nothing else before it refuses; a writer
    // that could sign is deliberately absent, so a path reaching a submission
    // would fail loudly rather than sign anything.
    consensus: { schedule: (id: string) => reader.schedule(id) } as unknown as AckContext['consensus'],
    ledgerTag: f.ledgerTag,
    account: RECIPIENT,
    doorbell: RECIPIENT_DOORBELL,
    manifestTopic: RECIPIENT_MANIFESTS,
  };

  // --- A different identifier, postmark, or epoch: refused, each of them. --
  const wrong: readonly { readonly what: string; readonly delivery: Delivery }[] = [
    { what: 'a different identifier', delivery: delivery({ envelopeId: 'a'.repeat(64) }) },
    { what: 'a different postmark', delivery: delivery({ sequenceNumber: postmark + 1 }) },
    { what: 'a different epoch', delivery: delivery({ epoch: epoch + 1 }) },
  ];

  for (const one of wrong) {
    let refused: unknown;
    try {
      await ack(ctx, one.delivery);
    } catch (e) {
      refused = e;
    }
    assert.ok(refused !== undefined, `${one.what}: \`ack\` refuses rather than signing (§10.4)`);
    assert.ok(isToolFailure(refused), `${one.what}: as a tool failure with a named reason`);
    assert.equal(
      (refused as { reason: string }).reason,
      'ACK_NOT_OPENED',
      `${one.what}: ACK_NOT_OPENED, which is what §6.6 gives for a schedule this delivery did not earn`,
    );
    assert.match(
      (refused as Error).message,
      /different identifier, postmark or epoch/,
      `${one.what}: and the refusal says which of the three it could be`,
    );
  }

  // --- The matching delivery is NOT refused for this reason. --------------
  //
  // It stops later and elsewhere — the schedule has already executed, so there
  // is nothing left to sign — which is what makes the three refusals above
  // about the composition and not about the arrangement.
  {
    let stopped: unknown;
    let result: unknown;
    try {
      result = await ack(ctx, delivery({}));
    } catch (e) {
      stopped = e;
    }
    if (stopped !== undefined) {
      assert.equal(
        /different identifier, postmark or epoch/.test((stopped as Error).message),
        false,
        'the matching delivery is not refused for naming the wrong thing',
      );
    } else {
      assert.ok(result !== undefined, '`ack` returned the receipt already on consensus (§6.6, ACK_DUPLICATE path)');
    }
  }
});
