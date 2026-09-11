/**
 * T-P14-1 — P-14 (Nothing blocks).
 *
 * Classes: all.
 * Register: NAMED (§6.4)
 * @fixture-kind model, captured
 *
 * §A’s sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   No tool call by one agent waits on an act of another, except a first-contact `send`, which returns a slip when its window closes.
 *
 * EXPANDED 2026-09-11: the exception over the modelled ledger, where a window
 * really closes; the rule over the six captures, where no other party is acting
 * at all because they are files.
 *
 * WHY ONE EXCEPTION AND EXACTLY ONE. D-30 is held: `send` blocks. That was a
 * decision and not an oversight — a sender that returned before its letter was
 * posted would hand back a postmark for something that had not happened, and
 * §5.7's postmark is a consensus fact. So `send` waits for ITS OWN submissions
 * to reach consensus, which is waiting on the network and not on a person.
 *
 * The one place another agent's act could block a caller is first contact: the
 * lane does not exist until the recipient's watcher answers the doorbell, and
 * nothing can make it. §6.4 bounds that with a window and §10.5 gives the sender
 * something honest to return when it closes — a slip. So the exception is not "a
 * tool may hang"; it is "a tool may wait a stated time and then say what it
 * saw."
 *
 * EVERYTHING ELSE READS. `resolve`, `inbox` and `verify` are handed a `Reader`
 * (§6.1's own table splits the six that way) and a `Reader` cannot wait on
 * anybody: it answers from what consensus already holds. That is demonstrated
 * below against fixtures, which are files — no other party can possibly act
 * while they are read, and the tools still return.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveHcs14 } from '../../app/src/resolve/hcs14.js';
import { inbox } from '../../app/src/tools/inbox.js';
import { DEFAULT_WINDOW_SECONDS, MAX_ATTEMPTS, send, type SenderContext } from '../../app/src/tools/send.js';
import { readerSource, verify } from '../../app/src/tools/verify.js';
import { allFixtures, readerOver } from '../support/fixtures.js';
import { pair, stand } from '../support/world.js';

test('T-P14-1 — Nothing blocks', async () => {
  // --- THE RULE: the reading tools return against a ledger nobody is touching.
  for (const { name, f } of allFixtures()) {
    const reader = readerOver(f);

    // `verify` — the deepest read there is, replaying §9.2's whole rule.
    const { bundle } = await verify(reader, { lane: f.lane, claims: ['hcs14'] }, {});
    assert.ok(bundle.correspondence.length > 0, `${name}: verify returned, with no other agent acting`);

    // `inbox` — including for a caller who holds no key, which is the case that
    // would tempt an implementation to go and ask somebody.
    const deliveries = await inbox({ reader, account: '0.0.10452127', keys: new Map() }, { lanes: [f.lane] });
    assert.ok(deliveries.length > 0, `${name}: inbox returned`);
    for (const d of deliveries) {
      assert.ok(
        d.opened || d.reason !== undefined,
        `${name}: and every delivery came back decided — opened, or unopened with a reason (§6.5)`,
      );
    }
  }

  // `resolve`, against a world where the party being resolved does nothing.
  {
    const world = stand();
    const { sender, recipient } = pair(world);
    const resolution = await resolveHcs14(
      readerSource(world.ledger.as(sender.account)),
      world.ledger.ledgerTag,
      recipient.account,
      sender.manifestTopic,
    );
    assert.ok(!('failure' in resolution), 'resolve returned without the recipient doing anything');
  }

  // --- THE EXCEPTION: a first contact, and the window that bounds it. -----
  //
  // §6.4 gives the window in seconds and fixes neither the polling interval nor
  // any notion of an attempt — both are the implementation's, and both are
  // bounded, which is the property P-14 is about.
  assert.equal(typeof DEFAULT_WINDOW_SECONDS, 'number', '§6.4: the wait is a stated number of seconds');
  assert.ok(DEFAULT_WINDOW_SECONDS > 0 && DEFAULT_WINDOW_SECONDS <= 300, 'and a bounded one');
  assert.ok(MAX_ATTEMPTS > 0 && MAX_ATTEMPTS <= 10, 'over a bounded number of attempts');

  {
    const world = stand();
    const { sender, recipient } = pair(world);
    // No lane, and nothing in this world will ever answer the door.
    const resolution = await resolveHcs14(
      readerSource(world.ledger.as(sender.account)),
      world.ledger.ledgerTag,
      recipient.account,
      sender.manifestTopic,
    );
    assert.ok(!('failure' in resolution), 'the address resolves; nobody is home');

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

    const began = Date.now();
    const result = await send(ctx, {
      coordinates: resolution.coordinates as never,
      manifest: resolution.manifest as unknown as Record<string, unknown>,
      payload: Buffer.from('Nobody is going to answer this one.', 'utf8'),
      windowSeconds: 1,
    });
    const waited = Date.now() - began;

    assert.equal(result.kind, 'slip', '§10.5: the window closed and `send` returned a slip');
    assert.ok(
      waited < 1000 * (1 + MAX_ATTEMPTS) * 5,
      `and it returned after ${waited}ms rather than waiting on an act nobody was going to make`,
    );
  }

  // --- AND THE TOOLS THAT READ TAKE NO WRITER AT ALL. --------------------
  //
  // §6.1's table splits the six: `resolve`, `inbox` and `verify` read; `send`,
  // `buy_stamp` and `ack` write. The read half is handed a `Reader`, which has
  // no write on it — so "does not wait on another agent's act" is a property of
  // the type and not of the implementation's care. That is the same argument
  // P-4 rests on, and it is why both invariants are structural here.
  {
    const world = stand();
    const reader = world.ledger.reader();
    assert.equal(typeof (reader as unknown as Record<string, unknown>)['submitMessage'], 'undefined', 'a Reader cannot submit');
    assert.equal(typeof (reader as unknown as Record<string, unknown>)['transferStamps'], 'undefined', 'nor transfer');
    assert.equal(typeof (reader as unknown as Record<string, unknown>)['scheduleSign'], 'undefined', 'nor sign a schedule');
  }
});
