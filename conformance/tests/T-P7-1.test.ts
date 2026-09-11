/**
 * T-P7-1 — P-7 (Postage is consumed).
 *
 * Classes: POSTMASTER, CORRESPONDENT, VERIFIER.
 * Register: NAMED (§4.3, §8.3)
 * @fixture-kind altered
 * @disposition partial — the `send` clause needs a writer
 *
 * §A’s sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   A chunk with no settlement reference, whose settlement memo ≠ the envelope’s AAD hash, or whose settlement’s consensus timestamp is not earlier than chunk 0’s, is rejected at `send`; appraises as unstamped at replay.
 *
 * EXPANDED 2026-09-10 over `gate-three-resolved`, in three altered copies — one
 * per condition the sketch names.
 *
 * WHY THE ORDERING CLAUSE IS THE INTERESTING ONE. The first two are identity:
 * postage that names no envelope, or names another, is not this letter’s
 * postage. The third is about TIME, and it is what makes postage postage rather
 * than a receipt. §4.3 requires the settlement to precede chunk 0 strictly,
 * because a stamp affixed after the letter was posted is a stamp bought once the
 * sender knew the letter had landed — and the whole arrangement of §4 is that
 * carriage is paid for in advance. Consensus order is total, so "before" is a
 * fact and not a judgement.
 *
 * The three appraise `unstamped` and not `unbound`: §11.5 keeps binding and
 * postage on different rungs, and an unstamped letter is a perfectly well-bound
 * letter that nobody paid for.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { settlementMemo } from '../../app/src/core/envelope.js';
import { postageRefusals } from '../../app/src/tools/inbox.js';
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

test('T-P7-1 — Postage is consumed', async () => {
  const pristine = fixture(FIXTURE);

  const base = await standingOf(pristine);
  assert.equal(base.standing, 'verified', 'as captured, the postage is in order');
  assert.equal(base.reasons.includes('T-P7-1'), false, 'and nothing is said against it');

  const zero = chunksOn(pristine).find((c) => c.chunk['id'] === ENVELOPE && c.chunk['i'] === 0);
  assert.ok(zero !== undefined, 'chunk 0 is on the lane');
  const chunkZeroAt = zero.message.consensusTimestamp;
  const header = zero.chunk['hdr'] as Record<string, unknown>;

  const alterations: readonly { readonly what: string; readonly make: () => Fixture }[] = [
    {
      what: 'no settlement at the reference the header names',
      make: () => {
        const g = copy(pristine);
        (g as { settlements: Record<string, unknown> }).settlements = {};
        return g;
      },
    },
    {
      what: 'a settlement memo that is not the envelope’s AAD hash',
      make: () => {
        const g = copy(pristine);
        for (const ref of Object.keys(g.settlements)) {
          (g.settlements[ref] as { memo: string }).memo = settlementMemo('a'.repeat(64));
        }
        return g;
      },
    },
    {
      what: 'a settlement that does not precede chunk 0',
      make: () => {
        const g = copy(pristine);
        for (const ref of Object.keys(g.settlements)) {
          // One second AFTER the letter was posted.
          const seconds = Number(chunkZeroAt.split('.')[0]) + 1;
          (g.settlements[ref] as { consensusTimestamp: string }).consensusTimestamp = `${String(seconds)}.000000000`;
        }
        return g;
      },
    },
  ];

  for (const alteration of alterations) {
    const got = await standingOf(alteration.make());
    assert.equal(got.standing, 'unstamped', `${alteration.what}: appraises unstamped (§11.5)`);
    assert.ok(got.reasons.includes('T-P7-1'), `${alteration.what}: with T-P7-1 among its reasons`);
    assert.equal(
      got.reasons.includes('T-P1-1'),
      false,
      `${alteration.what}: and not unbound — the letter binds; nobody paid for it`,
    );
  }

  // The same three, through the predicate both readers share, so the reason a
  // recipient is given and the reason a Verifier records come from one rule.
  const refusals = postageRefusals(null, header as never, ENVELOPE, chunkZeroAt, {});
  assert.ok(refusals.length > 0, 'a missing settlement is refused at the reader too (§6.5, INBOX_UNSTAMPED)');

  assert.fail(
    'T-P7-1 PARTIAL — all three conditions appraise `unstamped` with `T-P7-1` at replay, which is the second ' +
      'half of the sketch. The first half, "is rejected at `send`", is not reachable from captured bytes: a ' +
      'sender CONSTRUCTS its own settlement inside §6.4 — it affixes, then posts — so none of these three ' +
      'arrangements is something `send` is handed and refuses; they are arrangements `send` must be shown not ' +
      'to PRODUCE, and showing that needs a writer and a ledger that can be made to misbehave. That is the ' +
      'modelled ledger, and it is permitted for a clause whose sketch is behaviour (RECORD, 2026-09-10). ' +
      'Not yet written; recorded rather than quietly dropped (conformance/DERIVATION.md).',
  );
});
