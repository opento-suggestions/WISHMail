/**
 * T-P1-10 — P-1 (Binding).
 *
 * Classes: RECIPIENT, VERIFIER.
 * Register: NAMED (§11.4)
 * @fixture-kind altered
 * @disposition partial — `inbox` cannot reach its clause, and that is a finding
 *
 * §A’s sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   An envelope whose header `ke` differs from the `keyEpoch` its bound resolution’s coordinates carry is `INBOX_UNBOUND` at `inbox` and unbound at replay.
 *
 * EXPANDED 2026-09-11 over `gate-three-resolved`, with `hdr.ke` altered.
 *
 * THIS ROW WAS UNREACHABLE UNTIL TONIGHT. `ke` is compared against "the
 * `keyEpoch` the resolution’s coordinates carry", and coordinates come from
 * REPLAYING the resolution — which §11.4 does only for a profile the Verifier
 * claims. No capture carried the registry and profile topics that replay reads,
 * so the comparison had nothing to compare against, and `captured.check.ts`
 * recorded the alteration as one this release cannot see. The re-capture of
 * 2026-09-10 night closed that, and the replay half is below.
 *
 * WHY THE EPOCH IS BOUND AT ALL. §7.6 has an agent retain the private key of
 * every epoch it has published, and §7.3 seals against the epoch the
 * coordinates named. `ke` in the header says which epoch the sender believed it
 * was sealing to. If that disagrees with what the resolution actually yielded,
 * the sender sealed to one key and claimed another — and the envelope is bound
 * to a key epoch nobody resolved. That is unbound and not merely unverified:
 * §11.5 puts it on the binding rungs, because the seal is part of the weld.
 *
 * `ke` IS NOT AN AAD FIELD, which is what makes the alteration clean: §7.2’s six
 * are `{p, v, l, lane, rp, nc}`, so changing the epoch leaves the identifier and
 * the chain intact and moves exactly the one thing under test.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inbox } from '../../app/src/tools/inbox.js';
import { verify } from '../../app/src/tools/verify.js';
import { alterChunk, chunksOn, fixture, readerOver } from '../support/fixtures.js';

const FIXTURE = 'gate-three-resolved';
const ENVELOPE = '2229a6c909d4b6c53889d6fda5ee173ff322debec9010a6aaf9e5cb388079c01';
const RECIPIENT = '0.0.10468684';

test('T-P1-10 — Binding', async () => {
  const pristine = fixture(FIXTURE);

  const zero = chunksOn(pristine).find((c) => c.chunk['id'] === ENVELOPE && c.chunk['i'] === 0);
  assert.ok(zero !== undefined, 'chunk 0 is on the lane');
  const sealedAt = (zero.chunk['hdr'] as Record<string, unknown>)['ke'];
  assert.equal(typeof sealedAt, 'number', 'the header names the epoch it was sealed to (§5.6)');

  // --- As captured: the header and the coordinates agree. -----------------
  const { bundle: before } = await verify(readerOver(pristine), { lane: pristine.lane, claims: ['hcs14'] }, {});
  const agreed = before.correspondence.find((e) => e.envelope.aadHash === ENVELOPE);
  assert.ok(agreed !== undefined, 'the envelope is reconciled');
  assert.equal(agreed.appraisal.appraised.standing, 'verified', 'and it stands');
  assert.equal(agreed.appraisal.appraised.reasons.includes('T-P1-10'), false, 'the epochs agree');
  assert.equal(agreed.envelope.keyEpoch, sealedAt, 'and the bundle reports the one the header names');

  // --- The replay half: an epoch the coordinates do not name. -------------
  for (const wrong of [99, 0, (sealedAt as number) + 1]) {
    const altered = alterChunk(pristine, ENVELOPE, 0, (_op, chunk) => {
      (chunk['hdr'] as Record<string, unknown>)['ke'] = wrong;
    });

    const { bundle } = await verify(readerOver(altered), { lane: altered.lane, claims: ['hcs14'] }, {});
    const entry = bundle.correspondence.find((e) => e.envelope.aadHash === ENVELOPE);
    assert.ok(entry !== undefined, `epoch ${wrong}: the envelope still binds — \`ke\` is not an AAD field (§7.2)`);
    assert.equal(entry.appraisal.appraised.standing, 'unbound', `epoch ${wrong}: appraises unbound (§11.5)`);
    assert.ok(entry.appraisal.appraised.reasons.includes('T-P1-10'), `epoch ${wrong}: with T-P1-10 among its reasons`);

    // And a Verifier claiming no profile still cannot see it, which is what
    // LIMITATIONS L-1 records and what the re-capture did NOT change: the
    // comparison needs coordinates, and coordinates need a claimed replay.
    const { bundle: claimless } = await verify(readerOver(altered), { lane: altered.lane }, {});
    const unseen = claimless.correspondence.find((e) => e.envelope.aadHash === ENVELOPE);
    assert.equal(
      unseen?.appraisal.appraised.reasons.includes('T-P1-10'),
      false,
      `epoch ${wrong}: a claimless Verifier does not see it (§9.6, L-1) — the capture changed what CAN be claimed, not what silence sees`,
    );
  }

  // --- THE `inbox` HALF, WHICH THIS IMPLEMENTATION CANNOT REACH. ---------
  //
  // Measured rather than described. A recipient does not replay its own
  // resolution: `InboxContext` carries a key map and no coordinates. So for an
  // epoch it holds no key for, `inbox` answers `INBOX_EPOCH_UNKNOWN` — a
  // statement about the key — and for an epoch it DOES hold a key for, it opens
  // the envelope without ever asking what the coordinates said.
  const altered = alterChunk(pristine, ENVELOPE, 0, (_op, chunk) => {
    (chunk['hdr'] as Record<string, unknown>)['ke'] = 99;
  });
  const deliveries = await inbox(
    { reader: readerOver(altered), account: RECIPIENT, keys: new Map() },
    { lanes: [altered.lane] },
  );
  const delivery = deliveries.find((d) => d.envelope.aadHash === ENVELOPE);
  assert.ok(delivery !== undefined, 'inbox returned a delivery');
  assert.equal(delivery.opened, false, 'and nothing was opened');

  assert.equal(
    delivery.reason,
    'INBOX_UNBOUND',
    `§A requires \`INBOX_UNBOUND\` for an epoch the bound resolution did not name, and \`inbox\` answered ` +
      `\`${String(delivery.reason)}\`. A recipient does not replay its own resolution — \`InboxContext\` carries ` +
      'a key map and no coordinates — so `inbox` has nothing to compare `ke` against: an epoch it holds no key ' +
      'for is `INBOX_EPOCH_UNKNOWN` (§6.5), and an epoch it DOES hold a key for opens. Either §6.5 owes the ' +
      'recipient a resolution of its own address, or this clause belongs to the Verifier alone. A §G question, ' +
      'raised rather than coded around (conformance/DERIVATION.md F-7).',
  );
});
