/**
 * T-P1-2 — P-1 (Binding).
 *
 * Classes: RECIPIENT, CORRESPONDENT.
 * Register: NAMED (§6.5)
 * @fixture-kind altered
 *
 * §A’s sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   An envelope whose settlement memo ≠ its `id` fails closed at `inbox`, returned `INBOX_UNSTAMPED`.
 *
 * EXPANDED 2026-09-10 over `checkpoint-one-letter`, in two altered copies.
 *
 * WHY THE MEMO IS THE WELD. §4.3 fixes the settlement memo as
 * `wishmail:<envelope id>`, and that string is the only thing that ties a
 * transfer of stamps to the letter it paid for. The transfer itself says
 * nothing: it moves a token from an account to the treasury, and a thousand
 * letters could point at it. The memo is what makes the postage THIS letter’s,
 * and a memo naming another envelope is postage for another envelope — which is
 * not a defect in the transfer and not a forgery, just postage that is not here.
 *
 * WHY `INBOX_UNSTAMPED` AND NOT `INBOX_UNBOUND`. The envelope binds perfectly
 * well: its header rebuilds to its identifier and every chunk carries it. What
 * is missing is the postage, and §6.5 keeps the two apart — `INBOX_UNSTAMPED` is
 * "no settlement, memo mismatch, or postage due; P-7", and P-7 is a different
 * invariant from P-1. A reader that collapsed them would tell a recipient that a
 * well-formed letter was forged.
 *
 * The second alteration is the same fact from the other side: the settlement
 * reference in the header pointing at nothing. §11.2 reaches a settlement only
 * through a chunk’s `hdr.st`, so a reference to a transfer consensus does not
 * hold is a letter with no postage at all.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { settlementMemo } from '../../app/src/core/envelope.js';
import { inbox } from '../../app/src/tools/inbox.js';
import { copy, fixture, readerOver, type Fixture } from '../support/fixtures.js';

const FIXTURE = 'checkpoint-one-letter';
const ENVELOPE = 'cd9dc8f41d3fa8580185652b68c960045d3961b7f83af441dc6e190d093ab0e2';

async function deliveryOf(f: Fixture): Promise<{ opened: boolean; reason?: string; detail?: string }> {
  const deliveries = await inbox({ reader: readerOver(f), account: '0.0.10452127', keys: new Map() }, { lanes: [f.lane] });
  const one = deliveries.find((d) => d.envelope.aadHash === ENVELOPE);
  assert.ok(one !== undefined, 'inbox returned a delivery for the envelope');
  return {
    opened: one.opened,
    ...(one.reason === undefined ? {} : { reason: one.reason }),
    ...(one.detail === undefined ? {} : { detail: one.detail }),
  };
}

test('T-P1-2 — Binding', async () => {
  const pristine = fixture(FIXTURE);

  // --- The memo as captured IS the identifier. ----------------------------
  const refs = Object.keys(pristine.settlements);
  assert.equal(refs.length, 1, 'the letter names one settlement');
  const captured = pristine.settlements[refs[0] as string];
  assert.ok(captured !== undefined, 'and the capture holds it');
  assert.equal(
    captured.memo,
    settlementMemo(ENVELOPE),
    `§4.3: the memo on the wire is wishmail:<id> — ${captured.memo}`,
  );

  // The unaltered letter gets past postage and stops at the key, so the two
  // refusals below are not the baseline.
  const base = await deliveryOf(pristine);
  assert.equal(base.reason, 'INBOX_EPOCH_UNKNOWN', 'the postage held; a keyless caller stops at the key (§6.5)');

  // --- A memo naming another envelope. ------------------------------------
  const other = 'a'.repeat(64);
  const wrongMemo = copy(pristine);
  for (const ref of Object.keys(wrongMemo.settlements)) {
    (wrongMemo.settlements[ref] as { memo: string }).memo = settlementMemo(other);
  }
  const mismatched = await deliveryOf(wrongMemo);
  assert.equal(mismatched.opened, false, 'a memo naming another envelope fails closed (§6.5)');
  assert.equal(mismatched.reason, 'INBOX_UNSTAMPED', 'and is UNSTAMPED — postage, not binding (§6.5, P-7)');
  assert.notEqual(mismatched.reason, 'INBOX_UNBOUND', 'the envelope binds; what is missing is the postage');

  // --- A settlement reference consensus does not hold. --------------------
  const noSettlement = copy(pristine);
  (noSettlement as { settlements: Record<string, unknown> }).settlements = {};
  const missing = await deliveryOf(noSettlement);
  assert.equal(missing.opened, false, 'a reference to no transfer fails closed');
  assert.equal(missing.reason, 'INBOX_UNSTAMPED', 'and is UNSTAMPED: §11.2 reaches a settlement only through hdr.st');

  // --- And the binding is intact in both, which is the point. -------------
  //
  // Read back through a Verifier, whose reasons are test identifiers: the
  // postage tests fire and the binding tests do not.
  const { verify } = await import('../../app/src/tools/verify.js');
  const { bundle } = await verify(readerOver(wrongMemo), { lane: wrongMemo.lane }, {});
  const entry = bundle.correspondence.find((e) => e.envelope.aadHash === ENVELOPE);
  assert.ok(entry !== undefined, 'the Verifier reconciles it too');
  assert.equal(entry.appraisal.appraised.standing, 'unstamped', '§11.5: unstamped, which is above unbound');
  assert.ok(entry.appraisal.appraised.reasons.includes('T-P7-1'), 'for a postage reason');
  for (const binding of ['T-P1-1', 'T-P1-6', 'T-P1-11', 'T-P10-1']) {
    assert.equal(
      entry.appraisal.appraised.reasons.includes(binding),
      false,
      `and no binding reason: ${binding} did not fire`,
    );
  }
});
