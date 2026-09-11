/**
 * T-P7-3 — P-7 (Postage is consumed).
 *
 * Classes: POSTMASTER, VERIFIER.
 * Register: NAMED (§4.2)
 * @fixture-kind altered, model
 *
 * §A’s sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   An envelope affixed with fewer stamps than its weight is rejected at `send`; a short-settled fixture appraises as unstamped.
 *
 * EXPANDED 2026-09-11. The replay half over `gate-three-resolved`, short-settled
 * at every shortfall there is. The `send` half over the modelled ledger, which
 * enforces balances — so a sender that cannot afford its own letter is refused
 * by the same arithmetic the network would use, before anything is affixed.
 *
 * WHAT THE POSTAGE IS. §7.5 gives an envelope a weight in ounces —
 * `OUNCE_BYTES` = 4096, rounded up — and §7.7 adds one stamp where the header
 * requests a return receipt. So the postage due is `w + (rr ? 1 : 0)`, and the
 * captured letter is certified: one ounce and one receipt, two stamps. A
 * settlement that moved fewer is a letter with insufficient postage, which is a
 * thing the post office has always had a word for.
 *
 * WHY IT IS `unstamped` AND NOT A PARTIAL CREDIT. §11.5 has four rungs and no
 * fractions: postage is either sufficient or it is not, and §4.2 does not
 * contemplate a letter that travelled part of the way. A Verifier that scaled
 * the standing to the shortfall would be inventing a rung.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { headerPostage } from '../../app/src/core/envelope.js';
import { isToolFailure } from '../../app/src/core/failure.js';
import { resolveHcs14 } from '../../app/src/resolve/hcs14.js';
import { send, type SenderContext } from '../../app/src/tools/send.js';
import { readerSource } from '../../app/src/tools/verify.js';
import { openLane, pair, stand } from '../support/world.js';
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

test('T-P7-3 — Postage is consumed', async () => {
  const pristine = fixture(FIXTURE);

  const zero = chunksOn(pristine).find((c) => c.chunk['id'] === ENVELOPE && c.chunk['i'] === 0);
  assert.ok(zero !== undefined, 'chunk 0 is on the lane');
  const header = zero.chunk['hdr'] as { w: number; rr?: boolean } & Record<string, unknown>;

  // --- What this letter owed, from its own header (§7.5, §7.7). -----------
  const due = headerPostage(header as never);
  assert.equal(header.rr, true, 'the captured letter is certified');
  assert.equal(due, header.w + 1, 'so its postage is its weight plus one for the receipt (§7.7)');

  const settled = Object.values(pristine.settlements).find((s) => s.memo.includes(ENVELOPE));
  assert.ok(settled !== undefined, 'and the capture holds the settlement that paid it');
  assert.ok(settled.amount >= due, `the sender affixed ${settled.amount} against ${due} due`);

  const base = await standingOf(pristine);
  assert.equal(base.standing, 'verified', 'so the letter is fully stamped');

  // --- Short-settled, at every shortfall there is. ------------------------
  for (let paid = due - 1; paid >= 0; paid -= 1) {
    const g = copy(pristine);
    for (const ref of Object.keys(g.settlements)) {
      if (!(g.settlements[ref] as { memo: string }).memo.includes(ENVELOPE)) continue;
      (g.settlements[ref] as { amount: number }).amount = paid;
    }

    const got = await standingOf(g);
    assert.equal(got.standing, 'unstamped', `${paid} of ${due} stamps: appraises unstamped (§11.5)`);
    assert.ok(got.reasons.includes('T-P7-3'), `${paid} of ${due}: with T-P7-3 among its reasons`);
  }

  // And paying MORE is not a defect: §4.2 sets a floor, not a price.
  {
    const g = copy(pristine);
    for (const ref of Object.keys(g.settlements)) {
      if (!(g.settlements[ref] as { memo: string }).memo.includes(ENVELOPE)) continue;
      (g.settlements[ref] as { amount: number }).amount = due + 5;
    }
    const got = await standingOf(g);
    assert.equal(got.reasons.includes('T-P7-3'), false, 'over-paying is not short-paying (§4.2)');
  }

  // === THE `send` HALF, over the modelled ledger =========================
  //
  // "An envelope affixed with fewer stamps than its weight is rejected at
  // `send`." A sender does not choose what to affix — §6.4 computes the postage
  // from the weight and affixes that — so the way this is rejected is that a
  // sender who cannot AFFORD the postage is stopped before anything is spent.
  // The modelled ledger enforces balances, so the refusal is the same
  // arithmetic the network would do and not a flag this test set.
  {
    const world = stand([
      { name: 'sender', key: `5e4d${'a1'.repeat(30)}`, stamps: 1, displayName: 'Correspondent A' },
      { name: 'recipient', key: `b0b1${'c2'.repeat(30)}`, stamps: 0, displayName: 'Correspondent B' },
    ]);
    const { sender, recipient } = pair(world);
    openLane(world, { acceptor: recipient, requester: sender });

    const resolution = await resolveHcs14(
      readerSource(world.ledger.as(sender.account)),
      world.ledger.ledgerTag,
      recipient.account,
      sender.manifestTopic,
    );
    assert.ok(!('failure' in resolution), 'the modelled recipient resolves');

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

    // Two ounces and a return receipt: three stamps due, against a balance of one.
    const twoOunces = Buffer.alloc(5000, 0x41);
    let refused: unknown;
    try {
      await send(ctx, {
        coordinates: resolution.coordinates as never,
        manifest: resolution.manifest as unknown as Record<string, unknown>,
        payload: twoOunces,
        returnReceipt: true,
      });
    } catch (e) {
      refused = e;
    }

    assert.ok(refused !== undefined, '§6.4: a sender that cannot afford the postage is refused');
    assert.ok(isToolFailure(refused), 'as a tool failure with a named reason (§6.1)');
    assert.equal(
      (refused as { reason: string }).reason,
      'SEND_INSUFFICIENT_STAMPS',
      `the refusal names the postage — got ${String((refused as { reason: string }).reason)}`,
    );

    // NOTHING WAS SPENT. The refusal is a precondition and not a rollback: §4.3
    // consumes stamps to the treasury irreversibly, so a letter that cannot be
    // paid for must be stopped before the transfer and not after it.
    assert.equal(world.ledger.balance(sender.account), 1, 'and the stamp it did hold is still there');
  }
});
