/**
 * T-P1-11 — P-1 (Binding).
 *
 * Classes: CORRESPONDENT, RECIPIENT, VERIFIER.
 * Register: NAMED (§7.4, §11.3)
 * @fixture-kind altered
 * @disposition partial — two of three clauses need a writer or a key
 *
 * §A’s sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   A chunk whose `nx` is absent or ≠ the next slice’s digest is rejected at `send`; a foreign chunk with the envelope’s `id` and index landing before the sender’s is recorded off-chain and the sender’s is canonical, and the envelope opens; a complete envelope whose slices do not concatenate to `hdr.h` is `INBOX_UNBOUND` and appraises unbound.
 *
 * EXPANDED 2026-09-11 over `checkpoint-two-receipt`’s ten-chunk envelope, for
 * the third clause.
 *
 * WHY THE CHAIN IS A CHAIN AND NOT A LIST. §7.4 puts `nx` — the digest of the
 * next slice — on every chunk but the last, so the order of an envelope is
 * carried in its own bytes and not in its indices. An attacker who could insert
 * a slice would have to produce bytes that hash to a value the PREVIOUS chunk
 * already published, which is the same problem as inverting SHA-256. Indices
 * are a convenience; the chain is the structure.
 *
 * AND `hdr.h` IS THE CLASP. The chain says the slices are in the right order;
 * `h` says they are the right slices. A complete walk whose concatenation does
 * not hash to `h` is an envelope assembled out of pieces that each linked
 * correctly and together are not the document — so §11.3 refuses it as unbound
 * and, crucially, does not open it. That is the clause tested below, and it is
 * the one a ten-chunk envelope was needed for: with one chunk there is no chain
 * to walk and `h` is the only check there is.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { b64u } from '../../app/src/core/canonical.js';
import { inbox } from '../../app/src/tools/inbox.js';
import { verify } from '../../app/src/tools/verify.js';
import { alterChunk, chunksOn, fixture, readerOver } from '../support/fixtures.js';

const FIXTURE = 'checkpoint-two-receipt';
const ENVELOPE = '514e5045f706415613a6e513233f9e74007fedf7f89ed0f3b821c87ca28da2e1';

test('T-P1-11 — Binding', async () => {
  const pristine = fixture(FIXTURE);

  // --- The chain, as captured: `nx` on every chunk but the last. ----------
  const chunks = chunksOn(pristine)
    .filter((c) => c.chunk['id'] === ENVELOPE)
    .sort((a, b) => (a.chunk['i'] as number) - (b.chunk['i'] as number));
  assert.equal(chunks.length, 10, 'ten chunks');

  for (let i = 0; i < chunks.length; i += 1) {
    const chunk = chunks[i]?.chunk;
    assert.ok(chunk !== undefined, `chunk ${i}`);
    const isLast = i === chunks.length - 1;
    assert.equal(
      Object.prototype.hasOwnProperty.call(chunk, 'nx'),
      !isLast,
      `chunk ${i}: §7.4 — \`nx\` on every chunk but the last, and never on the last`,
    );
  }

  // --- Clause 3: complete, and the slices do not concatenate to `hdr.h`. --
  //
  // `h` is a header field and not an AAD field, so altering it leaves the
  // identifier and the whole chain intact: the walk completes, every link is
  // canonical, and the only thing wrong is the clasp.
  const altered = alterChunk(pristine, ENVELOPE, 0, (_op, chunk) => {
    (chunk['hdr'] as Record<string, unknown>)['h'] = 'b'.repeat(64);
  });

  const deliveries = await inbox(
    { reader: readerOver(altered), account: '0.0.10452127', keys: new Map() },
    { lanes: [altered.lane] },
  );
  const delivery = deliveries.find((d) => d.envelope.aadHash === ENVELOPE);
  assert.ok(delivery !== undefined, 'inbox returned a delivery');
  assert.equal(delivery.opened, false, 'and it is NOT opened — §11.3 refuses before it decrypts');
  assert.equal(delivery.reason, 'INBOX_UNBOUND', '§6.5: INBOX_UNBOUND');
  assert.match(
    delivery.detail ?? '',
    /slices do not concatenate|do not hash/,
    'and the detail names the clasp rather than the chain',
  );
  assert.equal(delivery.chunkPostmarks.length, 10, 'the walk completed: all ten links were on the chain');

  const { bundle } = await verify(readerOver(altered), { lane: altered.lane, claims: ['hcs14'] }, {});
  const entry = bundle.correspondence.find((e) => e.envelope.aadHash === ENVELOPE);
  assert.ok(entry !== undefined, 'the Verifier reconciled it');
  assert.equal(entry.appraisal.appraised.standing, 'unbound', 'and appraises it unbound (§11.5)');
  assert.ok(entry.appraisal.appraised.reasons.includes('T-P1-11'), 'with T-P1-11 among its reasons');
  assert.equal(entry.chunks.length, 10, 'over a complete chain — this is not an incomplete envelope');

  // A slice changed in the MIDDLE breaks the chain instead, which is the other
  // failure and belongs to T-P3-3. Asserted here only to show the two are
  // different: one stops the walk, the other completes it and fails the clasp.
  {
    const broken = alterChunk(pristine, ENVELOPE, 5, (_op, chunk) => {
      chunk['d'] = b64u(Buffer.from('not the slice the previous chunk named'));
    });
    const { bundle: partial } = await verify(readerOver(broken), { lane: broken.lane, claims: ['hcs14'] }, {});
    const stopped = partial.correspondence.find((e) => e.envelope.aadHash === ENVELOPE);
    assert.ok(stopped !== undefined, 'reconciled');
    assert.ok(stopped.chunks.length < 10, 'the walk STOPPED at the broken link rather than completing');
    assert.ok(
      stopped.appraisal.appraised.reasons.includes('T-P3-3'),
      'and the reason is the walk’s, not the clasp’s (§11.5)',
    );
  }

  assert.fail(
    'T-P1-11 PARTIAL — the third clause holds in full: a complete envelope whose slices do not concatenate to ' +
      '`hdr.h` is `INBOX_UNBOUND`, is not opened, and appraises unbound with `T-P1-11`, over a ten-link chain ' +
      'that walked all the way. The first clause, "a chunk whose `nx` is absent or wrong is rejected at ' +
      '`send`", needs a writer: `send` computes `nx` itself while chunking (§7.4), so a wrong one is something ' +
      'it must be shown not to PRODUCE. The second, "a foreign chunk landing before the sender’s … and the ' +
      'envelope OPENS", needs the envelope to open, and opening needs the recipient’s key — which no capture ' +
      'carries and none ever will (P-13). The walk half of that clause is discharged by T-P3-3; the opening ' +
      'half is not reachable offline at all. Recorded rather than quietly dropped (conformance/DERIVATION.md).',
  );
});
