/**
 * T-P1-6 — P-1 (Binding).
 *
 * Classes: RECIPIENT, CORRESPONDENT, VERIFIER.
 * Register: NAMED (§7.2)
 * @fixture-kind altered
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   An envelope whose chunks' `operator_id` account ≠ its settlement's `from` account is `INBOX_UNBOUND` at `inbox` and unbound at replay.
 *
 * EXPANDED 2026-09-10 over `checkpoint-one-letter` and, for the multi-chunk
 * case, `checkpoint-two-receipt`.
 *
 * WHY THIS IS A WELD AND NOT A FORMALITY. §7.2 is explicit that "no header field
 * names a sender": the sender is the account that affixed the postage, and the
 * only other thing on the lane that names an account is HCS-10's `operator_id`
 * on each message. So the identity of a sender is the agreement between those
 * two facts, and nothing else. Break the agreement and there is no sender — not
 * a wrong one, none — which is why the answer is `unbound` rather than a
 * mismatch report.
 *
 * IT IS CHECKED PER CHUNK AND NOT ONLY ON CHUNK 0, and the ten-chunk envelope is
 * where that matters. A letter whose first chunk is the sender's and whose sixth
 * is somebody else's is the case this clause exists for: the walk would complete,
 * the slices would concatenate, and the envelope would open — with a stranger's
 * bytes inside it — if the weld were checked once at the top.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inbox } from '../../app/src/tools/inbox.js';
import { verify } from '../../app/src/tools/verify.js';
import { alterChunk, chunksOn, fixture, readerOver, type Fixture } from '../support/fixtures.js';

const STRANGER = '0.0.999998@0.0.999999';

async function readBoth(
  f: Fixture,
  envelopeId: string,
): Promise<{ reason?: string; opened: boolean; standing: string; reasons: readonly string[] }> {
  const deliveries = await inbox({ reader: readerOver(f), account: '0.0.10452127', keys: new Map() }, { lanes: [f.lane] });
  const delivery = deliveries.find((d) => d.envelope.aadHash === envelopeId);
  assert.ok(delivery !== undefined, 'inbox returned a delivery');

  const { bundle } = await verify(readerOver(f), { lane: f.lane }, {});
  const entry = bundle.correspondence.find((e) => e.envelope.aadHash === envelopeId);
  assert.ok(entry !== undefined, 'the Verifier reconciled it');

  return {
    opened: delivery.opened,
    ...(delivery.reason === undefined ? {} : { reason: delivery.reason }),
    standing: entry.appraisal.appraised.standing,
    reasons: entry.appraisal.appraised.reasons,
  };
}

test('T-P1-6 — Binding', async () => {
  // --- One chunk: the weld broken at chunk 0. -----------------------------
  {
    const id = 'cd9dc8f41d3fa8580185652b68c960045d3961b7f83af441dc6e190d093ab0e2';
    const pristine = fixture('checkpoint-one-letter');

    // As captured, the two facts agree: the operator_id's account IS the
    // account the postage came from.
    const zero = chunksOn(pristine).find((c) => c.chunk['id'] === id && c.chunk['i'] === 0);
    assert.ok(zero !== undefined, 'chunk 0 is on the lane');
    const operator = zero.op['operator_id'];
    assert.equal(typeof operator, 'string', 'HCS-10 puts an operator_id on every message');
    const settlement = Object.values(pristine.settlements)[0];
    assert.ok(settlement !== undefined, 'and the capture holds the settlement');
    assert.equal(
      (operator as string).split('@')[1],
      settlement.from,
      '§7.2: the sender is the account that affixed the postage, and the chunks say so',
    );

    const base = await readBoth(pristine, id);
    assert.equal(base.reason, 'INBOX_EPOCH_UNKNOWN', 'the weld held, so the refusal below is not the baseline');
    assert.equal(base.reasons.includes('T-P1-6'), false, 'and the Verifier says nothing about it');

    const altered = alterChunk(pristine, id, 0, (op) => {
      op['operator_id'] = STRANGER;
    });
    const got = await readBoth(altered, id);
    assert.equal(got.opened, false, 'a chunk submitted by an account that paid no postage fails closed');
    assert.equal(got.reason, 'INBOX_UNBOUND', '§6.5: INBOX_UNBOUND — there is no sender, not a wrong one');
    assert.equal(got.standing, 'unbound', '§11.5: and unbound at replay');
    assert.ok(got.reasons.includes('T-P1-6'), 'with this test among the reasons');
  }

  // --- Ten chunks: the weld broken in the MIDDLE. -------------------------
  //
  // The case a check made once at the top would miss entirely.
  {
    const id = '514e5045f706415613a6e513233f9e74007fedf7f89ed0f3b821c87ca28da2e1';
    const pristine = fixture('checkpoint-two-receipt');

    const chunks = chunksOn(pristine).filter((c) => c.chunk['id'] === id);
    assert.equal(chunks.length, 10, 'the ten-chunk envelope is on the lane');

    const base = await readBoth(pristine, id);
    assert.equal(base.reasons.includes('T-P1-6'), false, 'unaltered, the weld holds across all ten');

    for (const which of [5, 9]) {
      const altered = alterChunk(pristine, id, which, (op) => {
        op['operator_id'] = STRANGER;
      });
      const got = await readBoth(altered, id);
      assert.equal(got.opened, false, `chunk ${which} submitted by a stranger: fails closed`);
      assert.equal(got.reason, 'INBOX_UNBOUND', `chunk ${which}: INBOX_UNBOUND at inbox (§7.2)`);
      assert.equal(got.standing, 'unbound', `chunk ${which}: unbound at replay (§11.5)`);
      assert.ok(got.reasons.includes('T-P1-6'), `chunk ${which}: with T-P1-6 among the reasons`);
    }
  }
});
