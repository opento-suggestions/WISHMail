/**
 * T-P1-8 — P-1 (Binding).
 *
 * Classes: RECIPIENT, VERIFIER.
 * Register: NAMED (§10.4)
 * @fixture-kind captured, altered
 *
 * §A’s sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   A fixture receipt’s schedule record carries the recipient’s signature among its signatures; the scheduled transaction’s required signer is the submit key of the recipient’s manifest topic, so it executes only when that key signs; execution follows the nth chunk; the executed submission’s postmark is on the recipient’s manifest topic; a manifest by any other path is not a receipt. Amended at 0.5.11 by D-172: "exactly the recipient’s signature" was unsatisfiable, because HIP-423 records every transaction payer that touches a schedule.
 *
 * EXPANDED 2026-09-10 over `gate-three-certified` and `gate-three-resolved` for
 * the positive, and four altered copies for the negatives.
 *
 * WHAT D-172 CHANGED AND WHY IT MATTERS HERE. The row once said the record
 * carries "exactly the recipient’s signature", and HIP-423 makes that
 * unsatisfiable: a schedule’s record carries every key that touched it, payers
 * included, so no arrangement of a real network produces a record with one
 * signature on it. Nothing could ever have passed the old sentence. What the
 * ledger CAN show is stronger: the recipient’s key is AMONG the signatures, and
 * the scheduled transaction’s REQUIRED signer is the submit key of the
 * recipient’s manifest topic — so the execution could not have happened on
 * anyone else’s signature, whoever else also signed. Payer signatures are
 * bookkeeping.
 *
 * THE FOUR NEGATIVES ARE FOUR DIFFERENT WAYS TO HAVE A MANIFEST WITHOUT HAVING
 * A RECEIPT, which is the sketch’s last clause: "a manifest by any other path is
 * not a receipt". Nothing about the document changes in any of them. What
 * changes is the path it arrived by — and §10.4’s whole mechanism is that the
 * path is the proof.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodeScheduledSubmission } from '../../app/src/core/schedulebody.js';
import { before, keyMatchesPrefix } from '../../app/src/tools/consensus.js';
import { verify } from '../../app/src/tools/verify.js';
import { chunksOn, copy, fixture, readerOver, type Fixture } from '../support/fixtures.js';

const ENVELOPE = '2229a6c909d4b6c53889d6fda5ee173ff322debec9010a6aaf9e5cb388079c01';

async function receiptOf(f: Fixture, claims: readonly string[] = []): Promise<{ status: string; reasons: readonly string[]; state: string }> {
  const { bundle } = await verify(readerOver(f), { lane: f.lane, claims }, {});
  const entry = bundle.correspondence.find((e) => e.envelope.aadHash === ENVELOPE);
  assert.ok(entry !== undefined, 'the envelope is reconciled');
  return { status: entry.appraisal.receipt.status, reasons: entry.appraisal.receipt.reasons, state: entry.state };
}

test('T-P1-8 — Binding', async () => {
  const pristine = fixture('gate-three-certified');
  const schedules = pristine.schedules ?? {};
  const scheduleId = Object.keys(schedules)[0];
  assert.ok(scheduleId !== undefined, 'the lane carries a receipt request with a schedule');
  const record = schedules[scheduleId];
  assert.ok(record !== undefined, 'and the capture holds its record');

  // --- The inner submission, decoded from the schedule’s real bytes. ------
  const inner = decodeScheduledSubmission(Buffer.from(record.transactionBody, 'base64'));
  const manifestTopic = inner.topicId;
  const published = JSON.parse(inner.message.toString('utf8')) as { meaning?: { statement?: string }; hash?: string };
  const recipient = (published.meaning?.statement ?? '').split(' ')[0] ?? '';
  assert.match(recipient, /^[0-9]+\.[0-9]+\.[0-9]+$/, '§10.4 puts the recipient’s account inside the receipt’s meaning');

  const recipientKey = pristine.accounts[recipient]?.key ?? null;
  assert.ok(recipientKey !== null, 'and the capture carries that account’s key, as consensus holds it');

  // --- "carries the recipient’s signature AMONG its signatures" (D-172). --
  assert.ok(record.signatures.length > 0, 'HIP-423 records the signatures that touched the schedule');
  assert.ok(
    record.signatures.some((s) => keyMatchesPrefix(recipientKey, s.publicKeyPrefix)),
    'the recipient’s key is among them (§11.4, D-172)',
  );
  // And the row no longer demands the thing HIP-423 makes impossible.
  if (record.signatures.length > 1) {
    assert.ok(
      record.signatures.some((s) => !keyMatchesPrefix(recipientKey, s.publicKeyPrefix)),
      'other signatures are present and are bookkeeping — which is exactly why D-172 amended the row',
    );
  }

  // --- "the required signer is the submit key of the recipient’s manifest
  //      topic, so it executes only when that key signs". ------------------
  const topic = pristine.topicInfo[manifestTopic];
  assert.ok(topic !== undefined && topic !== null, 'the capture holds the manifest topic’s own record');
  assert.deepEqual(
    [...topic.submitKeys],
    [recipientKey],
    '§10.4: a topic only the recipient’s key can write to — so the submission REQUIRES that key',
  );
  assert.equal(topic.memo, 'wishmail:manifest:1', 'and it is the recipient’s manifest topic (§9.1)');

  // --- "execution follows the nth chunk". ---------------------------------
  const chunks = chunksOn(pristine).filter((c) => c.chunk['id'] === ENVELOPE);
  const last = chunks[chunks.length - 1];
  assert.ok(last !== undefined && record.executedTimestamp !== null, 'the schedule executed');
  assert.equal(
    before(last.message.consensusTimestamp, record.executedTimestamp),
    true,
    `the execution at ${record.executedTimestamp} follows the nth chunk at ${last.message.consensusTimestamp} (§8.3)`,
  );

  // --- "the executed submission’s postmark is on the recipient’s manifest
  //      topic". -----------------------------------------------------------
  const landed = (pristine.topics[manifestTopic] ?? []).filter((m) => m.contents.includes(String(published.hash)));
  assert.equal(landed.length, 1, 'the manifest is on that topic, once, content-addressed by its own hash (§5.2)');

  // --- The positive, through the Verifier. --------------------------------
  const good = await receiptOf(pristine);
  assert.equal(good.status, 'acked', 'so the receipt is acked (§11.4)');
  assert.deepEqual([...good.reasons], [], 'with nothing to report against it');
  assert.equal(good.state, 'ACKED', 'and §8.3 moved the envelope');

  // §5.8’s object needs the recipient’s operator_id, which only a replayed
  // resolution can name — so it appears with a claimed profile and not without.
  const resolved = fixture('gate-three-resolved');
  const { bundle: claimed } = await verify(readerOver(resolved), { lane: resolved.lane, claims: ['hcs14'] }, {});
  const withReceipt = claimed.correspondence.find((e) => e.envelope.aadHash === ENVELOPE);
  assert.ok(withReceipt?.returnReceipt !== undefined, '§5.8’s ReturnReceipt is named where a replay could name it');
  assert.equal(withReceipt.returnReceipt.proof.uri?.topicId, manifestTopic, 'and it points at the manifest topic');

  // --- Four ways to have the manifest and not the receipt. ----------------
  const negatives: readonly { readonly what: string; readonly make: () => Fixture }[] = [
    {
      what: 'the recipient never signed — the record carries other signatures only',
      make: () => {
        const g = copy(pristine);
        const s = (g.schedules as Record<string, Record<string, unknown>>)[scheduleId] as Record<string, unknown>;
        s['signatures'] = (record.signatures as unknown[]).filter(
          (sig) => !keyMatchesPrefix(recipientKey, (sig as { publicKeyPrefix: string }).publicKeyPrefix),
        );
        return g;
      },
    },
    {
      what: 'the topic it landed on is not one only the recipient can write to',
      make: () => {
        const g = copy(pristine);
        const info = g.topicInfo[manifestTopic] as { submitKeys: string[] };
        info.submitKeys = ['0'.repeat(64)];
        return g;
      },
    },
    {
      what: 'the manifest is not on the manifest topic — a receipt by another path',
      make: () => {
        const g = copy(pristine);
        g.topics[manifestTopic] = [];
        return g;
      },
    },
    {
      what: 'the schedule executed something that is not a submission',
      make: () => {
        const g = copy(pristine);
        const s = (g.schedules as Record<string, Record<string, unknown>>)[scheduleId] as Record<string, unknown>;
        s['transactionBody'] = Buffer.from('not a SchedulableTransactionBody').toString('base64');
        return g;
      },
    },
  ];

  for (const negative of negatives) {
    const got = await receiptOf(negative.make());
    assert.equal(got.status, 'invalid', `${negative.what}: not a receipt (§10.4, §11.4)`);
    assert.ok(got.reasons.includes('T-P1-8'), `${negative.what}: and the reason names this test`);
    assert.notEqual(got.state, 'ACKED', `${negative.what}: so nothing moved the envelope (§8.3)`);
  }
});
