/**
 * T-P1-12 — P-1 (Binding).
 *
 * Classes: VERIFIER.
 * Register: NAMED (§8.6, §11.4)
 * @fixture-kind altered
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   A fixture receipt for an envelope whose `hdr.rr` is false is reported with `receipt.status` = `acked` and a reason naming it unrequested; the envelope's state and standing are unchanged from the same correspondence without it, and the reason is not borrowed from a test about something else.
 *
 * EXPANDED 2026-09-10 over `gate-three-certified` with `hdr.rr` cleared.
 *
 * WHY THIS ALTERATION IS HONEST, AND IT IS THE WHOLE REASON THE ROW IS
 * REACHABLE. §7.2's AAD is `{p, v, l, lane, rp, nc}` and `rr` is not among them.
 * So clearing `rr` changes the header without touching the identifier: every
 * chunk still carries the same `id`, the rebuild still yields it, and the
 * envelope still binds. What changes is exactly one thing — whether the header
 * asked for a receipt — which is precisely the variable this test is about. An
 * alteration that also broke the binding would be testing T-P1-1 again.
 *
 * WHY IT COUNTS. §8.6: a receipt for an envelope whose header did not request
 * one still counts, and §11.4 requires the reason to name it. The recipient's
 * signature is the recipient's act; the header records what the sender asked
 * for and what its postage paid for. A Verifier that discarded an unrequested
 * receipt would be discarding a signature on consensus because of a flag in
 * somebody else's header.
 *
 * "THE REASON IS NOT BORROWED FROM A TEST ABOUT SOMETHING ELSE" IS WHY THE ROW
 * EXISTS. Until 2026-09-10 this reported `T-P12-2` — §11.5's sanctioned answer
 * for a condition its table does not name — because §A named no test for §8.6's
 * unrequested receipt. That was flagged in the Verifier's own output rather than
 * papered over, raised as ledger §G-23, and closed by D-176, which registered the
 * court the requirement had always owed. So the assertion below is exact: the
 * reasons are `['T-P1-12']` and not `['T-P12-2']`, and an implementation that
 * went back to borrowing would fail here rather than pass quietly.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verify } from '../../app/src/tools/verify.js';
import { alterChunk, chunksOn, fixture, readerOver } from '../support/fixtures.js';

const FIXTURE = 'gate-three-certified';
const ENVELOPE = '2229a6c909d4b6c53889d6fda5ee173ff322debec9010a6aaf9e5cb388079c01';

test('T-P1-12 — Binding', async () => {
  const pristine = fixture(FIXTURE);

  // --- The correspondence as it stands: the header DID request one. -------
  const zero = chunksOn(pristine).find((c) => c.chunk['id'] === ENVELOPE && c.chunk['i'] === 0);
  assert.ok(zero !== undefined, 'chunk 0 is on the lane');
  assert.equal((zero.chunk['hdr'] as Record<string, unknown>)['rr'], true, 'the captured letter was certified (§7.7)');

  const { bundle: before } = await verify(readerOver(pristine), { lane: pristine.lane }, {});
  const requested = before.correspondence.find((e) => e.envelope.aadHash === ENVELOPE);
  assert.ok(requested !== undefined, 'and it reconciles');
  assert.equal(requested.appraisal.receipt.status, 'acked', 'its receipt is acked');
  assert.deepEqual([...requested.appraisal.receipt.reasons], [], 'with no reason, because it was asked for');

  // --- The same correspondence with `rr` cleared. -------------------------
  const altered = alterChunk(pristine, ENVELOPE, 0, (_op, chunk) => {
    const hdr = chunk['hdr'] as Record<string, unknown>;
    hdr['rr'] = false;
  });

  const { bundle: after } = await verify(readerOver(altered), { lane: altered.lane }, {});
  const unrequested = after.correspondence.find((e) => e.envelope.aadHash === ENVELOPE);
  assert.ok(unrequested !== undefined, 'the envelope still binds — `rr` is not an AAD field (§7.2)');

  // --- Reported acked, with a reason naming it unrequested. ---------------
  assert.equal(unrequested.appraisal.receipt.status, 'acked', '§8.6: an unrequested receipt COUNTS');
  assert.deepEqual(
    [...unrequested.appraisal.receipt.reasons],
    ['T-P1-12'],
    'and the reason names this test — not T-P12-2, which is about something else (D-176, ledger §G-23)',
  );
  assert.equal(
    unrequested.appraisal.receipt.reasons.includes('T-P12-2'),
    false,
    'the reason is not borrowed from a test about something else',
  );

  // --- State and standing unchanged from the same correspondence. ---------
  assert.equal(unrequested.state, requested.state, 'the state is what it was (§8.3)');
  assert.equal(unrequested.state, 'ACKED', 'and it is ACKED, because a receipt was witnessed');
  assert.deepEqual(
    { standing: unrequested.appraisal.appraised.standing, reasons: [...unrequested.appraisal.appraised.reasons] },
    { standing: requested.appraisal.appraised.standing, reasons: [...requested.appraisal.appraised.reasons] },
    '§11.5: the receipt does not lower the standing, and an unrequested one does not either',
  );

  // The envelope's own binding is untouched: same identifier, same chunks.
  assert.equal(unrequested.envelope.aadHash, requested.envelope.aadHash, 'the identifier did not move');
  assert.equal(unrequested.chunks.length, requested.chunks.length, 'nor did the postmarks');
});
