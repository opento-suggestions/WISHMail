/**
 * T-P1-7 — P-1 (Binding).
 *
 * Classes: VERIFIER, RECIPIENT.
 * Register: NAMED (§8.3)
 * @fixture-kind altered
 *
 * §A’s sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   Receipts witnessed before the nth chunk, or for envelopes standing unstamped or unbound, leave state unchanged and are reported as invalid receipts.
 *
 * EXPANDED 2026-09-10 over `gate-three-certified`, in three altered copies —
 * one per condition the sketch names.
 *
 * WHY §8.3 GUARDS THE TRANSITION AND NOT THE RECEIPT. A receipt is a signature
 * on consensus and nothing can take it back; what §8.3 controls is whether it
 * MOVES an envelope, and the answer is only where the envelope is SETTLED and
 * its standing is verified or unverified. The two halves of that are different
 * kinds of wrong and both are here.
 *
 * A RECEIPT BEFORE THE NTH CHUNK is a signature for a letter that had not
 * finished arriving. §10.4 binds a receipt to chunk 0’s postmark and to the
 * envelope’s identifier, so an execution that precedes the last chunk is a
 * recipient signing for something it could not yet have read — and the
 * arithmetic still checks out, which is exactly why the ordering has to be
 * tested rather than inferred.
 *
 * A RECEIPT ON AN UNSTAMPED OR UNBOUND ENVELOPE is worse in a quieter way: it
 * would let a signature raise what a signature must never raise. §11.5 is
 * explicit that the receipt does not lower a standing and nothing raises it, and
 * an ACKED state on an unbound envelope would be a report that somebody
 * acknowledged a letter that does not bind to anyone.
 *
 * "LEAVE STATE UNCHANGED" IS ASSERTED AGAINST THE SAME CORRESPONDENCE WITHOUT
 * THE ALTERATION, so "unchanged" means measured rather than assumed.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verify } from '../../app/src/tools/verify.js';
import { alterChunk, chunksOn, copy, fixture, readerOver, type Fixture } from '../support/fixtures.js';

const FIXTURE = 'gate-three-certified';
const ENVELOPE = '2229a6c909d4b6c53889d6fda5ee173ff322debec9010a6aaf9e5cb388079c01';

async function appraise(f: Fixture): Promise<{
  state: string;
  standing: string;
  reasons: readonly string[];
  receipt: { status: string; reasons: readonly string[] };
}> {
  const { bundle } = await verify(readerOver(f), { lane: f.lane }, {});
  const entry = bundle.correspondence.find((e) => e.envelope.aadHash === ENVELOPE);
  assert.ok(entry !== undefined, 'the envelope is reconciled');
  return {
    state: entry.state,
    standing: entry.appraisal.appraised.standing,
    reasons: entry.appraisal.appraised.reasons,
    receipt: { status: entry.appraisal.receipt.status, reasons: entry.appraisal.receipt.reasons },
  };
}

test('T-P1-7 — Binding', async () => {
  const pristine = fixture(FIXTURE);

  const before = await appraise(pristine);
  assert.equal(before.state, 'ACKED', 'as captured, the receipt moved the envelope (§8.3)');
  assert.equal(before.receipt.status, 'acked', 'and it is acked');
  assert.equal(before.standing, 'unverified', 'at the standing a claimless Verifier reaches (§9.6)');

  // --- 1. A receipt witnessed BEFORE the nth chunk. -----------------------
  {
    const zero = chunksOn(pristine).find((c) => c.chunk['id'] === ENVELOPE && c.chunk['i'] === 0);
    assert.ok(zero !== undefined, 'chunk 0 is on the lane');
    const lastChunkAt = zero.message.consensusTimestamp;

    const g = copy(pristine);
    const schedules = g.schedules as Record<string, Record<string, unknown>>;
    const ids = Object.keys(schedules);
    assert.ok(ids.length > 0, 'the lane carries a receipt request with a schedule');
    for (const id of ids) {
      // One second before the last chunk reached consensus.
      const seconds = Number(lastChunkAt.split('.')[0]) - 1;
      (schedules[id] as Record<string, unknown>)['executedTimestamp'] = `${String(seconds)}.000000000`;
    }

    const got = await appraise(g);
    assert.equal(got.receipt.status, 'invalid', 'a receipt that executed before the nth chunk is invalid (§8.3)');
    assert.ok(got.receipt.reasons.includes('T-P1-7'), 'and the reason names this test');
    assert.equal(got.state, 'SETTLED', 'the state is left where it was: §8.3 did not license the move');
    assert.notEqual(got.state, before.state, 'which is a change FROM ACKED, because the move is what was refused');
    assert.deepEqual(
      { standing: got.standing, reasons: [...got.reasons] },
      { standing: before.standing, reasons: [...before.reasons] },
      '§11.5: the receipt does not lower the standing — an invalid receipt is a fact about the receipt',
    );
  }

  // --- 2. A receipt for an envelope standing UNSTAMPED. -------------------
  {
    const g = copy(pristine);
    for (const ref of Object.keys(g.settlements)) {
      (g.settlements[ref] as { memo: string }).memo = `wishmail:${'a'.repeat(64)}`;
    }

    const got = await appraise(g);
    assert.equal(got.standing, 'unstamped', 'the envelope stands unstamped (§11.5)');
    assert.equal(got.receipt.status, 'invalid', '§8.3: a receipt moves nothing at that standing');
    assert.ok(got.receipt.reasons.includes('T-P1-7'), 'reported as an invalid receipt, naming this test');
    assert.equal(got.state, 'SETTLED', 'and the state is unchanged by it');
  }

  // --- 3. A receipt for an envelope standing UNBOUND. ---------------------
  //
  // Unbound by §7.2’s fourth weld rather than by a broken header, so that chunk
  // 0 still rebuilds and the receipt is actually reached and appraised. An
  // envelope with no canonical chunk 0 would never get as far as its receipt,
  // which would test something else.
  {
    const g = alterChunk(pristine, ENVELOPE, 0, (op) => {
      op['operator_id'] = '0.0.999998@0.0.999999';
    });

    const got = await appraise(g);
    assert.equal(got.standing, 'unbound', 'the envelope stands unbound (§11.5)');
    assert.ok(got.reasons.includes('T-P1-6'), 'for the weld it broke');
    assert.equal(got.receipt.status, 'invalid', '§8.3: and a receipt moves nothing at that standing either');
    assert.ok(got.receipt.reasons.includes('T-P1-7'), 'reported as an invalid receipt');
    assert.equal(got.state, 'SETTLED', 'the state is unchanged: nothing acknowledges an envelope that binds to nobody');
  }
});
