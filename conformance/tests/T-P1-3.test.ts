/**
 * T-P1-3 — P-1 (Binding).
 *
 * Classes: RECIPIENT.
 * Register: NAMED (§6.6)
 * @fixture-kind altered
 *
 * §A’s sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   `ack` refuses an envelope returned unopened, for every §6.5 reason.
 *
 * EXPANDED 2026-09-11 over `checkpoint-two-receipt` and `gate-three-resolved`.
 *
 * WHY `ack` TAKES A DELIVERY AND NOT AN IDENTIFIER. §6.6 requires "the envelope
 * opened in the caller’s `inbox` with its AAD verified", and the only thing that
 * can attest to that is the `inbox` result itself. An identifier could name an
 * envelope this agent never opened; a `Delivery` carries `opened` and the reason
 * it did not. So the precondition is structural rather than checked — which is
 * why this row can be tried by handing `ack` exactly what `inbox` returned.
 *
 * WHAT ACKNOWLEDGING AN UNOPENED ENVELOPE WOULD MEAN. A return receipt is the
 * recipient’s signature that it read the letter (§10.4), published on a topic
 * only its key can write to and recomputable by anyone. Signing for a letter
 * that did not bind, or that nobody paid for, or that it could not decrypt,
 * would put that signature on consensus permanently against a document the
 * recipient never read. §6.6 refuses, and it refuses for every reason in §6.5
 * rather than for a list of the interesting ones, because there is no reason an
 * envelope comes back unopened that makes signing for it reasonable.
 *
 * §6.5 NAMES FIVE REASONS AND ALL FIVE ARE BUILT. It produced four when this
 * body was written: `inbox` declared `INBOX_SCHEMA_UNRESOLVED` and emitted it
 * nowhere. That was the finding, and it is fixed — the fifth arrangement below
 * is the one that could not be made.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isToolFailure } from '../../app/src/core/failure.js';
import { ack } from '../../app/src/tools/ack.js';
import { inbox, type Delivery, type DeliveryReason } from '../../app/src/tools/inbox.js';
import { alterChunk, chunksOn, copy, fixture, readerOver, type Fixture } from '../support/fixtures.js';

/** §6.5's reasons on an unopened delivery, as the specification lists them (spec:999). */
const SIX_FIVE: readonly DeliveryReason[] = [
  'INBOX_INCOMPLETE',
  'INBOX_UNBOUND',
  'INBOX_UNSTAMPED',
  'INBOX_EPOCH_UNKNOWN',
  'INBOX_SCHEMA_UNRESOLVED',
];

const FIXTURE = 'checkpoint-two-receipt';
const ENVELOPE = '514e5045f706415613a6e513233f9e74007fedf7f89ed0f3b821c87ca28da2e1';

async function deliveriesOf(f: Fixture): Promise<readonly Delivery[]> {
  return inbox({ reader: readerOver(f), account: '0.0.10452127', keys: new Map() }, { lanes: [f.lane] });
}

test('T-P1-3 — Binding', async () => {
  const pristine = fixture(FIXTURE);

  const produced = new Map<DeliveryReason, Delivery>();

  const arrangements: readonly { readonly reason: DeliveryReason; readonly make: () => Fixture }[] = [
    {
      // No key for the epoch: the pristine letter, read by a caller holding none.
      reason: 'INBOX_EPOCH_UNKNOWN',
      make: () => pristine,
    },
    {
      // The header no longer rebuilds to the identifier.
      reason: 'INBOX_UNBOUND',
      make: () =>
        alterChunk(pristine, ENVELOPE, 0, (_op, chunk) => {
          (chunk['hdr'] as Record<string, unknown>)['nc'] = 'AAAAAAAAAAAAAAAAAAAAAA';
        }),
    },
    {
      // The postage names another envelope.
      reason: 'INBOX_UNSTAMPED',
      make: () => {
        const g = copy(pristine);
        for (const ref of Object.keys(g.settlements)) {
          (g.settlements[ref] as { memo: string }).memo = `wishmail:${'a'.repeat(64)}`;
        }
        return g;
      },
    },
    {
      // The chunk declares a schema and the locator resolves to nothing, so the
      // reader does not know what shape it is reading (§5.11, F-9). The chunk
      // itself is left alone: what is emptied is the HCS-13 registry its `s`
      // points at, which is how a locator comes to resolve to nothing in life.
      reason: 'INBOX_SCHEMA_UNRESOLVED',
      make: () => {
        const g = copy(pristine);
        const zero = chunksOn(g).find((c) => c.chunk['id'] === ENVELOPE && c.chunk['i'] === 0);
        assert.ok(zero !== undefined, 'chunk 0');
        const ref = /^hcs:\/\/13\/([0-9]+\.[0-9]+\.[0-9]+)#/.exec(zero.chunk['s'] as string);
        assert.ok(ref !== null, 'the chunk declares an HCS-13 locator (§5.11)');
        g.topics[ref[1] as string] = [];
        return g;
      },
    },
    {
      // A link is missing, so the chain stops short (F-4).
      reason: 'INBOX_INCOMPLETE',
      make: () => {
        const g = copy(pristine);
        const lane = g.topics[g.lane] ?? [];
        // Drop the last chunk of the ten-chunk envelope.
        g.topics[g.lane] = lane.filter((m) => m.sequenceNumber !== 11);
        return g;
      },
    },
  ];

  for (const arrangement of arrangements) {
    const deliveries = await deliveriesOf(arrangement.make());
    const found = deliveries.find((d) => !d.opened && d.reason === arrangement.reason);
    assert.ok(found !== undefined, `an arrangement producing ${arrangement.reason} (§6.5)`);
    produced.set(arrangement.reason, found);
  }

  // --- `ack` refuses every one of them. -----------------------------------
  const ctx = {
    consensus: {} as never,
    ledgerTag: 'hedera:testnet',
    account: '0.0.10452127',
    doorbell: '0.0.10452149',
    manifestTopic: '0.0.10452154',
  };

  for (const [reason, delivery] of produced) {
    let refused: unknown;
    try {
      await ack(ctx, delivery);
    } catch (e) {
      refused = e;
    }
    assert.ok(refused !== undefined, `${reason}: \`ack\` refuses rather than signing (§6.6)`);
    assert.ok(isToolFailure(refused), `${reason}: and it refuses as a tool failure with a named reason (§6.1)`);
    assert.equal(
      (refused as { reason: string }).reason,
      'ACK_NOT_OPENED',
      `${reason}: the refusal is ACK_NOT_OPENED — §6.6 acknowledges only what bound`,
    );
    assert.match(
      (refused as Error).message,
      new RegExp(reason),
      `${reason}: and it says which reason the delivery came back with, so a caller can tell why`,
    );
  }

  // Nothing was signed, and nothing could have been: the context carries no
  // writer at all, so a path that reached a submission would have thrown
  // something other than a refusal.
  assert.equal(produced.size, 5, '§6.5’s five reasons were produced and all five were refused');

  // --- ALL FIVE, WHICH IS WHAT "EVERY §6.5 REASON" MEANS. -----------------
  //
  // The fifth used to be unproducible: `inbox` declared `INBOX_SCHEMA_UNRESOLVED`
  // in `DeliveryReason` and emitted it nowhere, because it never read a chunk’s
  // `schemaRef` at all — so a delivery whose schema did not resolve OPENED. The
  // Verifier’s side of the same fact was reported all along (`T-P9-3`,
  // unverified); the recipient’s was not. Found here, and fixed: `inbox` now
  // resolves the locator before it reaches for a key, so a caller holding no key
  // still learns that the schema was unresolvable rather than only that it could
  // not decrypt.
  const missing = SIX_FIVE.filter((reason) => !produced.has(reason));
  assert.deepEqual(
    missing,
    [],
    `§6.6 refuses "for every §6.5 reason", and ${missing.length} of the five could not be produced: ${missing.join(', ')}`,
  );
});
