/**
 * T-P7-1 — P-7 (Postage is consumed).
 *
 * Classes: POSTMASTER, CORRESPONDENT, VERIFIER.
 * Register: NAMED (§4.3, §8.3)
 * @fixture-kind altered, model
 *
 * §A’s sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   A chunk with no settlement reference, whose settlement memo ≠ the envelope’s AAD hash, or whose settlement’s consensus timestamp is not earlier than chunk 0’s, is rejected at `send`; appraises as unstamped at replay.
 *
 * EXPANDED 2026-09-11. The replay half over `gate-three-resolved`, in three
 * altered copies. The `send` half over the modelled ledger, which is permitted
 * for a clause whose sketch is behaviour (RECORD, Sonic 2026-09-11) and is
 * marked `model` in the report, counting toward no claim.
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
 * HOW A SENDER IS "REJECTED" FOR SOMETHING IT BUILDS ITSELF. §6.4 has `send`
 * affix the postage and then post the chunks, so none of these three is an
 * arrangement `send` is HANDED — they are arrangements it must be shown not to
 * PRODUCE. That is what the modelled ledger is for: it enforces balances and
 * consensus order, so a letter posted through it either satisfies §4.3 on the
 * real ordering of real messages or it does not. The body sends one and reads
 * the ledger back.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { settlementMemo } from '../../app/src/core/envelope.js';
import { resolveHcs14 } from '../../app/src/resolve/hcs14.js';
import { before as earlierThan } from '../../app/src/tools/consensus.js';
import { send, type SenderContext } from '../../app/src/tools/send.js';
import { readerSource, verify } from '../../app/src/tools/verify.js';
import { chunksOn, copy, fixture, readerOver, stampTokenPin, type Fixture } from '../support/fixtures.js';
import { openLane, pair, stand } from '../support/world.js';

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
  // === THE REPLAY HALF, over captured bytes ===============================
  const pristine = fixture(FIXTURE);

  const base = await standingOf(pristine);
  assert.equal(base.standing, 'verified', 'as captured, the postage is in order');
  assert.equal(base.reasons.includes('T-P7-1'), false, 'and nothing is said against it');

  const zero = chunksOn(pristine).find((c) => c.chunk['id'] === ENVELOPE && c.chunk['i'] === 0);
  assert.ok(zero !== undefined, 'chunk 0 is on the lane');
  const chunkZeroAt = zero.message.consensusTimestamp;

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

  // === THE `send` HALF, over the modelled ledger ==========================
  //
  // `send` is run for real against a ledger that enforces balances, submit keys
  // and consensus order, and what it produced is read back off that ledger. The
  // three conditions above are three things it must not produce.
  const world = stand();
  const { sender, recipient } = pair(world);

  const resolution = await resolveHcs14(
    readerSource(world.ledger.as(sender.account)),
    world.ledger.ledgerTag,
    recipient.account,
    sender.manifestTopic,
  );
  assert.ok(!('failure' in resolution), 'the modelled recipient resolves under §9.2');

  // A lane already open, so this letter is not a first contact: §6.4's first
  // contact rings a doorbell and waits for an answer, and nothing in a modelled
  // world answers a door. What this body is about is the postage, not the ring.
  openLane(world, { acceptor: recipient, requester: sender });

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
    payload: Buffer.from('Postage is paid before carriage, not after.', 'utf8'),
  });
  assert.ok('postmark' in sent, '`send` posted the letter (§6.4)');

  const reader = world.ledger.reader();
  const lane = sent.postmark.topicId;
  const posted = (await reader.messages(lane)).filter((m) => m.contents.includes('"op":"message"'));
  assert.ok(posted.length > 0, 'the chunks are on the lane');

  const id = sent.envelope.aadHash;
  const settlement = await reader.transfer(sent.envelope.settlementRef);
  assert.ok(settlement !== null, '§4.3: `send` did NOT produce a chunk with no settlement at its reference');

  assert.equal(
    settlement.memo,
    settlementMemo(id),
    '§4.3: nor a settlement whose memo is not the envelope’s AAD hash — the memo names THIS letter',
  );

  const firstChunk = posted[0];
  assert.ok(firstChunk !== undefined, 'chunk 0 is on the lane');
  assert.equal(
    earlierThan(settlement.consensusTimestamp, firstChunk.consensusTimestamp),
    true,
    `§4.3: nor a settlement that does not precede chunk 0 — affixed at ${settlement.consensusTimestamp}, posted at ${firstChunk.consensusTimestamp}`,
  );

  // And the stamps were CONSUMED to the treasury, not merely shown (§4.3).
  assert.equal(settlement.to, world.ledger.treasury, 'the stamps went to the treasury');
  assert.equal(settlement.tokenId, world.ledger.stampToken, 'in the stamp token');
  assert.ok(settlement.amount >= sent.envelope.weight, 'and covered the weight');

  // The order is a fact about the ledger and not about the return value: read
  // back from consensus, the affixing transfer precedes every chunk of the
  // envelope it paid for.
  for (const message of posted) {
    assert.equal(
      earlierThan(settlement.consensusTimestamp, message.consensusTimestamp),
      true,
      `the postage precedes chunk at sequence ${message.sequenceNumber}`,
    );
  }
});
