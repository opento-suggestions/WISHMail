/**
 * T-P15-5 — P-15 (Claims are scoped).
 *
 * Classes: VERIFIER.
 * Register: NAMED (§11.4)
 * @fixture-kind altered
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   A request whose schedule expired unsigned yields `receipt.status` = `unclaimed`; the envelope stays SETTLED, standing unchanged; the reference narrative uses the unclaimed template and no other.
 *
 * EXPANDED 2026-09-10 over `gate-three-certified`, in two altered copies.
 *
 * THIS ROW WAS EXPECTED TO BE UNREACHABLE, AND THE EXPECTATION CONFUSED THE ACT
 * WITH WHAT A VERIFIER SEES OF IT. A schedule's window is up to
 * `SCHEDULE_MAX_LIFETIME` — 62 days — and waiting one out is not a night's work.
 * But §10.4 says what the network does at the end of it: "a schedule that
 * expires unsigned is deleted by the network; the lane's `transaction` operation
 * remains". So what a Verifier meets is a lane that still names a schedule and a
 * consensus that no longer holds it — and that is two alterations of captured
 * bytes, not a two-month wait. Both are made below, because the network can
 * present either: a record marked deleted, and no record at all.
 *
 * WHY EACH CLAUSE FOLLOWS FROM THE TEXT. `unclaimed` rather than `invalid`
 * because nothing went wrong — a recipient is under no obligation to sign, and
 * §11.8 forbids turning silence into refusal. SETTLED rather than ACKED because
 * §8.3 moves an envelope only when a receipt is witnessed. Standing unchanged
 * because §11.5 is explicit that the receipt does not lower it — "an invalid
 * receipt is a fact about the receipt" — and nothing raises it.
 *
 * ON "THE UNCLAIMED TEMPLATE AND NO OTHER": `tools/sentences.json` carries one
 * receipt sentence parameterised by status rather than one sentence per status
 * (D-162, the one template three readers share). So the clause is read as what
 * it is guarding — the narrative says `unclaimed` and says none of the words
 * §2.3 and §11.8 reserve for things that did not happen — and that reading is
 * asserted rather than assumed.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verify } from '../../app/src/tools/verify.js';
import { copy, fixture, readerOver, type Fixture } from '../support/fixtures.js';

const FIXTURE = 'gate-three-certified';
const ENVELOPE = '2229a6c909d4b6c53889d6fda5ee173ff322debec9010a6aaf9e5cb388079c01';

/** Words a receipt nobody signed must not put on the page (§2.3, §11.8). */
const FORBIDDEN = ['refus', 'reject', 'declin', 'undeliver', 'returned to sender', 'bounced'];

test('T-P15-5 — Claims are scoped', async () => {
  const pristine = fixture(FIXTURE);

  // --- What the signed correspondence says, as the baseline. --------------
  const signed = await verify(readerOver(pristine), { lane: pristine.lane }, { narrative: true });
  const before = signed.bundle.correspondence.find((e) => e.envelope.aadHash === ENVELOPE);
  assert.ok(before !== undefined, 'the captured envelope is on the lane');
  assert.equal(before.state, 'ACKED', 'it was signed for, so it stands ACKED (§8.3)');
  assert.equal(before.appraisal.receipt.status, 'acked', 'and its receipt is acked');

  const alterations: readonly { readonly what: string; readonly make: () => Fixture }[] = [
    {
      what: 'the network deleted the expired schedule',
      make: () => {
        const g = copy(pristine);
        for (const id of Object.keys(g.schedules ?? {})) {
          const record = (g.schedules as Record<string, Record<string, unknown>>)[id] as Record<string, unknown>;
          record['deleted'] = true;
          record['executedTimestamp'] = null;
          record['signatures'] = [];
        }
        return g;
      },
    },
    {
      what: 'consensus holds no such schedule any more',
      make: () => {
        const g = copy(pristine);
        (g as { schedules?: Record<string, unknown> }).schedules = {};
        return g;
      },
    },
  ];

  for (const alteration of alterations) {
    const g = alteration.make();

    // The lane's `transaction` operation REMAINS — §10.4 says so, and it is
    // what makes this `unclaimed` rather than `none`. Checked before the
    // appraisal, because an alteration that removed it would be testing
    // something else entirely.
    const requests = (g.topics[g.lane] ?? []).filter((m) => m.contents.includes('"op":"transaction"'));
    assert.ok(requests.length > 0, `${alteration.what}: the lane still carries the request (§10.4)`);

    const { bundle, narrative } = await verify(readerOver(g), { lane: g.lane }, { narrative: true });
    const entry = bundle.correspondence.find((e) => e.envelope.aadHash === ENVELOPE);
    assert.ok(entry !== undefined, `${alteration.what}: the envelope is still reconciled`);

    // --- `receipt.status` = `unclaimed`. ----------------------------------
    assert.equal(entry.appraisal.receipt.status, 'unclaimed', `${alteration.what}: §11.4 — unclaimed, not invalid`);
    assert.deepEqual(
      [...entry.appraisal.receipt.reasons],
      [],
      `${alteration.what}: nothing went wrong, so there is no reason to name`,
    );
    assert.equal(entry.requests.length, requests.length, `${alteration.what}: the request is still reported`);

    // --- The envelope stays SETTLED, standing unchanged. ------------------
    assert.equal(entry.state, 'SETTLED', `${alteration.what}: §8.3 — only a witnessed receipt moves it to ACKED`);
    assert.deepEqual(
      { standing: entry.appraisal.appraised.standing, reasons: [...entry.appraisal.appraised.reasons] },
      { standing: before.appraisal.appraised.standing, reasons: [...before.appraisal.appraised.reasons] },
      `${alteration.what}: §11.5 — the receipt does not lower the standing and nothing raises it`,
    );

    // --- The narrative. ---------------------------------------------------
    assert.ok(narrative !== undefined, `${alteration.what}: a narrative was produced`);
    const receiptLines = narrative.text.split('\n').filter((l) => l.toLowerCase().includes('receipt'));
    assert.ok(receiptLines.length > 0, `${alteration.what}: the narrative speaks of the receipt`);
    assert.ok(
      receiptLines.some((l) => l.includes('unclaimed')),
      `${alteration.what}: it says unclaimed — ${JSON.stringify(receiptLines)}`,
    );
    for (const line of receiptLines) {
      for (const word of FORBIDDEN) {
        assert.equal(
          line.toLowerCase().includes(word),
          false,
          `${alteration.what}: the narrative says ${JSON.stringify(word)} of a receipt nobody signed — §11.8 forbids turning silence into refusal`,
        );
      }
    }
    assert.equal(
      narrative.text.includes('acked'),
      false,
      `${alteration.what}: and it does not also use the acked sentence`,
    );
  }
});
