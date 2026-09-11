/**
 * T-P7-2 — P-7 (Postage is consumed).
 *
 * Classes: POSTMASTER, VERIFIER.
 * Register: NAMED (§4.3)
 * @fixture-kind altered, model
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
import { openLane, pair, stand } from '../support/world.js';
import { readerSource } from '../../app/src/tools/verify.js';
import { send, type SenderContext } from '../../app/src/tools/send.js';
import { resolveHcs14 } from '../../app/src/resolve/hcs14.js';
import { settlementMemo } from '../../app/src/core/envelope.js';
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
  assert.equal(
    second.appraisal.appraised.reasons.includes('T-P1-1'),
    false,
    'and it still BINDS — `st` is not an AAD field, so only the payment is in question',
  );
  assert.equal(third.appraisal.appraised.standing, 'verified', 'the third letter is untouched');

  // The order the BUNDLE reports is consensus order: §11.7 sorts correspondence
  // by chunk 0's consensus timestamp.
  const positions = after.correspondence.map((e) => e.chunks[0]?.consensusTimestamp ?? '');
  assert.deepEqual([...positions].sort(), positions, '§11.7: entries are in consensus order of their chunk 0');

  // --- THE RULE FIRES, AND IT FIRES ON THE RIGHT LETTER. ------------------
  //
  // §11.4: "no envelope with an EARLIER canonical chunk 0 names the same
  // settlement". `verify` decides that in the order it walks the envelopes, and
  // that order used to be `envelopeIdsOf`'s `[...ids].sort()` — the identifiers
  // ordered as hex strings, which is a SHA-256 ordering and says nothing about
  // when a letter was posted. Whichever envelope reached the check first claimed
  // the settlement, so on a lane whose lexically-first identifier belongs to the
  // consensus-LATER letter — this one — the check found `before(later, earlier)`
  // false, declined to record anything, and declined to re-claim: NEITHER letter
  // was flagged. Found here; `envelopeIdsOf` now orders by chunk 0's consensus
  // timestamp, so "earlier" means what §11.4 says it means.
  assert.ok(
    second.appraisal.appraised.reasons.includes('T-P7-2'),
    `§11.4: the later letter claims a settlement an earlier one already named — ${JSON.stringify([...second.appraisal.appraised.reasons])}`,
  );

  // --- AND IT IS NEVER THE ONLY REASON, WHICH IS A SPEC QUESTION. ---------
  //
  // §4.3 binds a settlement to ONE envelope through its memo, `wishmail:<id>`.
  // So a pair sharing a settlement can never have both memos right — the shared
  // transfer names one of them — and the other is unstamped by the memo check
  // as well. `T-P7-2` therefore cannot be isolated by any fixture: the condition
  // it describes is always accompanied by a memo mismatch, which `T-P1-2` and
  // `T-P7-1` already court. Whether the clause should be re-sketched as the case
  // the memo rule does not close, or retired as redundant, is a ledger §G
  // question and not a body edit.
  assert.ok(
    second.appraisal.appraised.reasons.includes('T-P7-1'),
    'and it is unstamped for the memo too, which §4.3 makes unavoidable on any pair that shares a settlement',
  );

  // === THE `send` HALF, over the modelled ledger =========================
  //
  // "A second envelope against an already-claimed settlement is rejected at
  // `send`." A sender does not choose a settlement to claim: §6.4 has it PIN its
  // own transfer reference before it affixes (`pinTransferRef`), so what has to
  // be shown is that two letters through one sender against one ledger never
  // come out naming one transfer. That is a property of two calls, which is why
  // it needs a writer and a ledger with a memory.
  {
    const world = stand();
    const { sender, recipient } = pair(world);
    openLane(world, { acceptor: recipient, requester: sender });

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

    const letters = [];
    for (const text of ['The first letter.', 'The second letter, on the same lane.', 'And a third.']) {
      const one = await send(ctx, {
        coordinates: resolution.coordinates as never,
        manifest: resolution.manifest as unknown as Record<string, unknown>,
        payload: Buffer.from(text, 'utf8'),
      });
      assert.ok('postmark' in one, `send posted: ${text}`);
      letters.push(one);
    }

    // THREE LETTERS, THREE SETTLEMENTS. Not one claimed twice.
    const refs = letters.map((l) => l.envelope.settlementRef);
    assert.equal(new Set(refs).size, refs.length, '§4.3: each letter pinned its own transfer, so none claims another’s');

    const ids = letters.map((l) => l.envelope.aadHash);
    assert.equal(new Set(ids).size, ids.length, 'and each is its own envelope — a fresh nonce per letter (§7.2)');

    // And each settlement's memo names its own letter and no other, which is the
    // §4.3 rule that makes the double-claim rule hard to reach in the first place.
    const reader = world.ledger.reader();
    for (const letter of letters) {
      const settlement = await reader.transfer(letter.envelope.settlementRef);
      assert.ok(settlement !== null, 'the transfer is on the ledger');
      assert.equal(
        settlement.memo,
        settlementMemo(letter.envelope.aadHash),
        '§4.3: its memo names the letter it paid for, one identifier',
      );
    }

    // The stamps were really spent, three times over: §4.3 consumes postage, and
    // a sender that claimed one settlement twice would have paid once.
    const spent = letters.reduce((n, l) => n + l.envelope.weight, 0);
    assert.equal(
      world.ledger.balance(sender.account),
      40 - spent,
      `three letters cost ${spent} stamps and the balance says so — nothing was carried on somebody else’s postage`,
    );
  }
});
