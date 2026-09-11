/**
 * T-P7-2 — P-7 (Postage is consumed).
 *
 * Classes: POSTMASTER, VERIFIER.
 * Register: NAMED (§4.3)
 * @fixture-kind altered
 * @disposition partial — the `send` clause needs a writer
 *
 * §A’s sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   A second envelope against an already-claimed settlement is rejected at `send`; a fixture pair sharing a settlement appraises one stamped, one unstamped, by consensus order.
 *
 * EXPANDED 2026-09-10 over `checkpoint-two-resolved`, whose lane carries three
 * letters — so two of them can be pointed at one settlement and the third left
 * alone as a control.
 *
 * WHY A STAMP IS SPENT AND NOT SHOWN. §4.3 consumes postage to the treasury:
 * the transfer happens once and the stamps are gone. A second envelope naming
 * the same transfer is a second letter carried on one payment, and nothing on
 * consensus stops it being written — the memo names an envelope, not the other
 * way round. So the rule is about which letter the payment belongs to, and
 * §11.4 settles it the only way a public ledger can: "no envelope with an
 * earlier canonical chunk 0 names the same settlement". Consensus order is
 * total, so the earlier letter keeps the stamp and the later one has none.
 *
 * THE ALTERATION IS HONEST BECAUSE `st` IS NOT AN AAD FIELD. §7.2’s six are
 * `{p, v, l, lane, rp, nc}`, so re-pointing `hdr.st` at another settlement
 * leaves the envelope’s identifier untouched and the binding intact. What
 * changes is only which payment the letter claims — which is exactly the
 * variable this row is about.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verify } from '../../app/src/tools/verify.js';
import { chunksOn, copy, fixture, readerOver, repack, stampTokenPin } from '../support/fixtures.js';

const FIXTURE = 'checkpoint-two-resolved';

test('T-P7-2 — Postage is consumed', async () => {
  const pristine = fixture(FIXTURE);

  // --- Three letters, three settlements, nothing shared. ------------------
  const zeroes = chunksOn(pristine).filter((c) => c.chunk['i'] === 0);
  assert.equal(zeroes.length, 3, 'the lane carries three letters');

  const refs = zeroes.map((c) => (c.chunk['hdr'] as Record<string, unknown>)['st'] as string);
  assert.equal(new Set(refs).size, 3, 'each names its own settlement, as captured');

  const { bundle: before } = await verify(
    readerOver(pristine),
    { lane: pristine.lane, claims: ['hcs14'], stampToken: stampTokenPin(pristine.ledgerTag) },
    {},
  );
  for (const e of before.correspondence) {
    assert.equal(
      e.appraisal.appraised.reasons.includes('T-P7-2'),
      false,
      `${e.envelope.aadHash.slice(0, 12)}: nothing is shared, so nothing is claimed twice`,
    );
  }

  // Consensus order, which is what decides.
  const order = [...zeroes].sort((a, b) =>
    a.message.consensusTimestamp < b.message.consensusTimestamp ? -1 : 1,
  );
  const earlier = order[0];
  const later = order[1];
  const control = order[2];
  assert.ok(earlier !== undefined && later !== undefined && control !== undefined, 'three letters in order');

  // --- The later letter points at the earlier one’s settlement. -----------
  const shared = (earlier.chunk['hdr'] as Record<string, unknown>)['st'] as string;
  const g = copy(pristine);
  {
    const target = chunksOn(g).find(
      (c) => c.chunk['id'] === later.chunk['id'] && c.chunk['i'] === 0,
    );
    assert.ok(target !== undefined, 'the later letter’s chunk 0');
    (target.chunk['hdr'] as Record<string, unknown>)['st'] = shared;
    repack(g, g.lane, target.message.sequenceNumber, target.op, target.chunk);
  }

  const { bundle: after } = await verify(
    readerOver(g),
    { lane: g.lane, claims: ['hcs14'], stampToken: stampTokenPin(g.ledgerTag) },
    {},
  );

  const first = after.correspondence.find((e) => e.envelope.aadHash === earlier.chunk['id']);
  const second = after.correspondence.find((e) => e.envelope.aadHash === later.chunk['id']);
  const third = after.correspondence.find((e) => e.envelope.aadHash === control.chunk['id']);
  assert.ok(first !== undefined && second !== undefined && third !== undefined, 'all three are reconciled');

  // --- One stamped, one unstamped, BY CONSENSUS ORDER. --------------------
  assert.equal(
    first.appraisal.appraised.reasons.includes('T-P7-2'),
    false,
    'the letter with the EARLIER canonical chunk 0 keeps the stamp (§11.4)',
  );
  assert.equal(first.appraisal.appraised.standing, 'verified', 'and stands');

  assert.equal(second.appraisal.appraised.standing, 'unstamped', 'the later one appraises unstamped (§11.5)');
  assert.ok(second.appraisal.appraised.reasons.includes('T-P7-2'), 'with T-P7-2 among its reasons');
  assert.equal(
    second.appraisal.appraised.reasons.includes('T-P1-1'),
    false,
    'and it still BINDS — `st` is not an AAD field, so only the payment is in question',
  );

  assert.equal(third.appraisal.appraised.standing, 'verified', 'the third letter is untouched');

  // The order is what decides, and not the order the Verifier happened to read
  // them in: §11.7 sorts correspondence by chunk 0’s consensus timestamp.
  const positions = after.correspondence.map((e) => e.chunks[0]?.consensusTimestamp ?? '');
  assert.deepEqual([...positions].sort(), positions, '§11.7: entries are in consensus order of their chunk 0');

  assert.fail(
    'T-P7-2 PARTIAL — a pair sharing a settlement appraises one stamped and one unstamped, decided by consensus ' +
      'order, with the third letter untouched: the second half of the sketch, in full. The first half, "a second ' +
      'envelope against an already-claimed settlement is rejected at `send`", needs a writer — the sender pins ' +
      'its own transfer reference inside §6.4 (`pinTransferRef`), so claiming a settlement twice is something ' +
      '`send` must be shown not to do across two calls against one ledger. That is the modelled ledger, ' +
      'permitted for a behaviour clause (RECORD, 2026-09-10) and not yet written. Recorded rather than quietly ' +
      'dropped (conformance/DERIVATION.md).',
  );
});
