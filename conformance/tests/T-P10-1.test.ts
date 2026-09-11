/**
 * T-P10-1 — P-10 (A lane is a lane).
 *
 * Classes: POSTMASTER, VERIFIER.
 * Register: NAMED (§6.4)
 * @fixture-kind altered, model
 *
 * §A’s sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   An envelope with no resolution proof, or whose AAD does not name the lane it is submitted to, is rejected at `send` and appraises unbound at replay.
 *
 * EXPANDED 2026-09-11 over `gate-three-resolved`, relocated.
 *
 * RELOCATION IS WHAT THIS ROW IS ABOUT, AND IT IS THE PRETTIEST OF §7.2’s WELDS.
 * The AAD’s `lane` is not a header field: §7.2 builds it from the topic the
 * chunks are ON. So a reader cannot be told which lane an envelope belongs to —
 * it can only be shown, by finding the chunks there. Take the same bytes and
 * read them on another topic and the AAD rebuilds to a different identifier
 * from the one every chunk carries, so the envelope is not that envelope any
 * more. Nothing was forged and nothing was altered; it was moved, and the weld
 * notices.
 *
 * That is why a lane is a lane and not an address in a header: an address can
 * be written down and a location cannot.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openLane, pair, stand } from '../support/world.js';
import { readerSource } from '../../app/src/tools/verify.js';
import { send, type SenderContext } from '../../app/src/tools/send.js';
import { resolveHcs14 } from '../../app/src/resolve/hcs14.js';
import { rebuildAad } from '../../app/src/core/aad.js';
import { verify } from '../../app/src/tools/verify.js';
import { chunksOn, copy, fixture, readerOver, type Fixture } from '../support/fixtures.js';

const FIXTURE = 'gate-three-resolved';
const ENVELOPE = '2229a6c909d4b6c53889d6fda5ee173ff322debec9010a6aaf9e5cb388079c01';

/** The same chunks, read on another topic. Nothing about them is changed. */
function relocate(f: Fixture, to: string): Fixture {
  const g = copy(f);
  g.topics[to] = (g.topics[g.lane] ?? []).map((m) => ({ ...m, topicId: to }));
  g.topicInfo[to] = g.topicInfo[g.lane] ?? null;
  delete g.topics[g.lane];
  (g as { lane: string }).lane = to;
  return g;
}

test('T-P10-1 — A lane is a lane', async () => {
  const pristine = fixture(FIXTURE);

  const zero = chunksOn(pristine).find((c) => c.chunk['id'] === ENVELOPE && c.chunk['i'] === 0);
  assert.ok(zero !== undefined, 'chunk 0 is on the lane');
  const hdr = zero.chunk['hdr'] as { l: string; rp: { h: string }; nc: string };

  // --- The weld, arithmetically, before anything is appraised. ------------
  assert.equal(
    rebuildAad(hdr, pristine.lane).id,
    ENVELOPE,
    '§5.6: the header and the topic the chunk arrived on rebuild to the identifier it carries',
  );
  assert.notEqual(
    rebuildAad(hdr, '0.0.999999').id,
    ENVELOPE,
    '§7.2: and the same header on another topic does not — `lane` is built from the topic, never read from a field',
  );

  const { bundle: home } = await verify(readerOver(pristine), { lane: pristine.lane, claims: ['hcs14'] }, {});
  assert.equal(home.correspondence[0]?.appraisal.appraised.standing, 'verified', 'at home it stands');

  // --- Relocated: the same bytes, another topic. --------------------------
  const moved = relocate(pristine, '0.0.999999');
  const { bundle } = await verify(readerOver(moved), { lane: moved.lane, claims: ['hcs14'] }, {});

  assert.equal(bundle.correspondence.length, 1, 'the chunks are still there and still describe an envelope');
  const entry = bundle.correspondence[0];
  assert.ok(entry !== undefined, 'and it is reconciled rather than refused (P-12)');
  assert.notEqual(entry.envelope.aadHash, ENVELOPE, 'but it is not the same envelope: the identifier moved with it');
  assert.equal(entry.appraisal.appraised.standing, 'unbound', 'and it appraises unbound (§11.5)');
  assert.ok(
    entry.appraisal.appraised.reasons.includes('T-P1-1') || entry.appraisal.appraised.reasons.includes('T-P10-1'),
    `the reason is the weld it broke: ${JSON.stringify([...entry.appraisal.appraised.reasons])}`,
  );

  // --- "no resolution proof": the other half of the same sentence. --------
  //
  // `rp.h` is an AAD field, so an envelope with no proof is an envelope whose
  // identifier was computed over something else. There is no way to have a
  // well-bound envelope with no proof — which is §6.4's point, and is why the
  // proof is inside the AAD rather than beside it.
  {
    const g = copy(pristine);
    const target = chunksOn(g).find((c) => c.chunk['id'] === ENVELOPE && c.chunk['i'] === 0);
    assert.ok(target !== undefined, 'chunk 0');
    const header = target.chunk['hdr'] as Record<string, unknown>;
    (header['rp'] as Record<string, unknown>)['h'] = '0'.repeat(64);
    const { repack } = await import('../support/fixtures.js');
    repack(g, g.lane, target.message.sequenceNumber, target.op, target.chunk);

    const { bundle: without } = await verify(readerOver(g), { lane: g.lane, claims: ['hcs14'] }, {});
    const e = without.correspondence.find((x) => x.envelope.aadHash === ENVELOPE);
    assert.equal(e, undefined, 'an envelope whose proof hash moved is no longer this envelope');
    assert.equal(
      without.correspondence[0]?.appraisal.appraised.standing,
      'unbound',
      'and what is left appraises unbound (§11.5)',
    );
  }

  // === THE `send` HALF, over the modelled ledger =========================
  //
  // §6.4 builds the AAD from the lane it is about to submit to and from the
  // proof it just obtained, so neither condition is something `send` can be
  // HANDED — they are envelopes it must be shown not to PRODUCE. The way to
  // show that is to let it produce one against a ledger that records where
  // things actually landed, and then read the weld back off consensus.
  {
    const world = stand();
    const { sender, recipient } = pair(world);
    const lane = openLane(world, { acceptor: recipient, requester: sender });

    const resolution = await resolveHcs14(
      readerSource(world.ledger.as(sender.account)),
      world.ledger.ledgerTag,
      recipient.account,
      sender.manifestTopic,
    );
    assert.ok(!('failure' in resolution), 'the modelled recipient resolves under §9.2');

    const ctx: SenderContext = {
      consensus: world.ledger.as(sender.account),
      ledgerTag: world.ledger.ledgerTag,
      account: sender.account,
      doorbell: sender.doorbell,
      log: sender.log,
      manifestTopic: sender.manifestTopic,
      treasury: world.ledger.treasury,
      stampToken: world.ledger.stampToken,
      schemaRef: world.schemaRef,
      publicKey: sender.key,
    };

    const sent = await send(ctx, {
      coordinates: resolution.coordinates as never,
      manifest: resolution.manifest as unknown as Record<string, unknown>,
      payload: Buffer.from('A lane is a lane because you find the letter on it.', 'utf8'),
    });
    assert.ok('postmark' in sent, 'send posted the letter (§6.4)');

    // THE ENVELOPE NAMES THE LANE IT IS ON, and "the lane it is on" is read from
    // consensus rather than from the return value.
    assert.equal(sent.postmark.topicId, lane, 'it went onto the lane that was open between them (§7.1)');

    const messages = await world.ledger.reader().messages(lane);
    assert.ok(
      messages.some((m) => m.contents.includes('"op":"message"')),
      'and its chunks are there',
    );

    const header = {
      l: sent.envelope.ledgerTag,
      rp: { h: sent.envelope.resolutionProof.hash },
      nc: sent.envelope.nonce,
    };
    assert.equal(
      rebuildAad(header, lane).id,
      sent.envelope.aadHash,
      '§7.2: the AAD rebuilt from the header and the topic the chunks arrived on IS the identifier, so send did not produce an envelope naming another lane',
    );
    assert.notEqual(
      rebuildAad(header, '0.0.999999').id,
      sent.envelope.aadHash,
      'and it names that lane and no other',
    );

    // NOR ONE WITH NO RESOLUTION PROOF. §6.4 obtains the proof before it seals,
    // and the proof's hash is an AAD field, so an envelope without one has no
    // identifier at all. What send produced carries a proof that is published
    // and findable, before the letter went out (§9.1).
    assert.match(sent.envelope.resolutionProof.hash, /^[0-9a-f]{64}$/, 'the envelope carries a resolution proof');
    const locator = sent.envelope.resolutionProof.uri;
    assert.ok(locator !== null, 'and a locator saying where it was published (§5.2)');
    const manifests = await world.ledger.reader().messages(locator.topicId);
    assert.ok(
      manifests.some(
        (m) =>
          m.sequenceNumber === locator.sequenceNumber &&
          m.contents.includes(sent.envelope.resolutionProof.hash),
      ),
      'and the proof is on that topic at that sequence number',
    );
  }
});
