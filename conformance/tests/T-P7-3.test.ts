/**
 * T-P7-3 — P-7 (Postage is consumed).
 *
 * Classes: POSTMASTER, VERIFIER.
 * Register: NAMED (§4.2)
 * @fixture-kind altered
 * @disposition partial — the `send` clause needs a writer
 *
 * §A’s sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   An envelope affixed with fewer stamps than its weight is rejected at `send`; a short-settled fixture appraises as unstamped.
 *
 * EXPANDED 2026-09-10 over `gate-three-resolved`, short-settled.
 *
 * WHAT THE POSTAGE IS. §7.5 gives an envelope a weight in ounces —
 * `OUNCE_BYTES` = 4096, rounded up — and §7.7 adds one stamp where the header
 * requests a return receipt. So the postage due is `w + (rr ? 1 : 0)`, and the
 * captured letter is certified: one ounce and one receipt, two stamps. A
 * settlement that moved fewer is a letter with insufficient postage, which is a
 * thing the post office has always had a word for.
 *
 * WHY IT IS `unstamped` AND NOT A PARTIAL CREDIT. §11.5 has four rungs and no
 * fractions: postage is either sufficient or it is not, and §4.2 does not
 * contemplate a letter that travelled part of the way. A Verifier that scaled
 * the standing to the shortfall would be inventing a rung.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { headerPostage } from '../../app/src/core/envelope.js';
import { verify } from '../../app/src/tools/verify.js';
import { chunksOn, copy, fixture, readerOver, stampTokenPin, type Fixture } from '../support/fixtures.js';

const FIXTURE = 'gate-three-resolved';
const ENVELOPE = '2229a6c909d4b6c53889d6fda5ee173ff322debec9010a6aaf9e5cb388079c01';

async function standingOf(f: Fixture): Promise<{ standing: string; reasons: readonly string[] }> {
  const { bundle } = await verify(
    readerOver(f),
    { lane: f.lane, claims: ['hcs14'], stampToken: stampTokenPin(f.ledgerTag) },
    {},
  );
  const entry = bundle.correspondence.find((e) => e.envelope.aadHash === ENVELOPE);
  assert.ok(entry !== undefined, 'the envelope is reconciled');
  return { standing: entry.appraisal.appraised.standing, reasons: entry.appraisal.appraised.reasons };
}

test('T-P7-3 — Postage is consumed', async () => {
  const pristine = fixture(FIXTURE);

  const zero = chunksOn(pristine).find((c) => c.chunk['id'] === ENVELOPE && c.chunk['i'] === 0);
  assert.ok(zero !== undefined, 'chunk 0 is on the lane');
  const header = zero.chunk['hdr'] as { w: number; rr?: boolean } & Record<string, unknown>;

  // --- What this letter owed, from its own header (§7.5, §7.7). -----------
  const due = headerPostage(header as never);
  assert.equal(header.rr, true, 'the captured letter is certified');
  assert.equal(due, header.w + 1, 'so its postage is its weight plus one for the receipt (§7.7)');

  const settled = Object.values(pristine.settlements).find((s) => s.memo.includes(ENVELOPE));
  assert.ok(settled !== undefined, 'and the capture holds the settlement that paid it');
  assert.ok(settled.amount >= due, `the sender affixed ${settled.amount} against ${due} due`);

  const base = await standingOf(pristine);
  assert.equal(base.standing, 'verified', 'so the letter is fully stamped');

  // --- Short-settled, at every shortfall there is. ------------------------
  for (let paid = due - 1; paid >= 0; paid -= 1) {
    const g = copy(pristine);
    for (const ref of Object.keys(g.settlements)) {
      if (!(g.settlements[ref] as { memo: string }).memo.includes(ENVELOPE)) continue;
      (g.settlements[ref] as { amount: number }).amount = paid;
    }

    const got = await standingOf(g);
    assert.equal(got.standing, 'unstamped', `${paid} of ${due} stamps: appraises unstamped (§11.5)`);
    assert.ok(got.reasons.includes('T-P7-3'), `${paid} of ${due}: with T-P7-3 among its reasons`);
  }

  // And paying MORE is not a defect: §4.2 sets a floor, not a price.
  {
    const g = copy(pristine);
    for (const ref of Object.keys(g.settlements)) {
      if (!(g.settlements[ref] as { memo: string }).memo.includes(ENVELOPE)) continue;
      (g.settlements[ref] as { amount: number }).amount = due + 5;
    }
    const got = await standingOf(g);
    assert.equal(got.reasons.includes('T-P7-3'), false, 'over-paying is not short-paying (§4.2)');
  }

  assert.fail(
    'T-P7-3 PARTIAL — every shortfall from one stamp down to none appraises `unstamped` with `T-P7-3`, and ' +
      'over-payment does not, which is the second half of the sketch. The first half, "is rejected at `send`", ' +
      'needs a writer: `send` computes the postage and affixes it itself inside §6.4, so a short settlement is ' +
      'something it must be shown not to PRODUCE — against a ledger whose stamp balance can be made too small, ' +
      'which is the modelled ledger. Permitted for a behaviour clause (RECORD, 2026-09-10) and not yet written; ' +
      'recorded rather than quietly dropped (conformance/DERIVATION.md).',
  );
});
