/**
 * T-P1-1 — P-1 (Binding).
 *
 * Classes: RECIPIENT, CORRESPONDENT.
 * Register: NAMED (§6.5)
 * @fixture-kind altered
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   An envelope whose header, lane, or resolution proof is altered fails closed at `inbox`, returned `INBOX_UNBOUND`.
 *
 * EXPANDED 2026-09-10 over `checkpoint-one-letter`, in three altered copies —
 * one per thing the sketch names.
 *
 * WHY THE EXPECTATION FOLLOWS FROM THE TEXT. §7.2 builds the AAD from exactly
 * six fields, §5.6 has a reader rebuild it "from `hdr` and the topic the chunk
 * arrived on", and its SHA-256 *is* the envelope identifier. So the three things
 * the sketch names are three of those six inputs, and altering any of them makes
 * the rebuild yield a different identifier from the one every chunk carries.
 * There is nothing to check against a list: the check is arithmetic, and P-1's
 * first weld is that it is.
 *
 * "FAILS CLOSED" IS THE PART THAT MATTERS. §6.5's reasons are returned values
 * and never thrown failures (P-12), so a refusal here is a `Delivery` with
 * `opened: false` — the envelope is described, the reason is named, and no
 * plaintext is produced. A tool that threw would be refusing correctly and
 * reporting wrongly; one that opened would be the defect P-1 exists for.
 *
 * NO KEY IS HELD, AND THAT STRENGTHENS THE TEST RATHER THAN WEAKENING IT. The
 * binding check runs before `inbox` reaches for a key at all (§6.5's order), so
 * a keyless caller sees exactly the refusal a key-holding recipient would. The
 * pristine copy is run first and comes back `INBOX_EPOCH_UNKNOWN` — a statement
 * about the key and not about the binding — which is what makes the three
 * `INBOX_UNBOUND`s below mean something.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inbox } from '../../app/src/tools/inbox.js';
import { alterChunk, copy, fixture, readerOver, type Fixture } from '../support/fixtures.js';

const FIXTURE = 'checkpoint-one-letter';
const ENVELOPE = 'cd9dc8f41d3fa8580185652b68c960045d3961b7f83af441dc6e190d093ab0e2';
/** A2's account — the recipient's own, from the settlement's `from` side's counterpart. */
const CALLER = '0.0.10452127';

async function deliveryOf(f: Fixture): Promise<{ opened: boolean; reason?: string; detail?: string }> {
  const deliveries = await inbox({ reader: readerOver(f), account: CALLER, keys: new Map() }, { lanes: [f.lane] });
  const one = deliveries.find((d) => d.envelope.aadHash === ENVELOPE) ?? deliveries[0];
  assert.ok(one !== undefined, 'inbox returned a delivery');
  return { opened: one.opened, ...(one.reason === undefined ? {} : { reason: one.reason }), ...(one.detail === undefined ? {} : { detail: one.detail }) };
}

test('T-P1-1 — Binding', async () => {
  const pristine = fixture(FIXTURE);

  // --- The unaltered letter, so the refusals below are not the baseline. ---
  const base = await deliveryOf(pristine);
  assert.equal(base.opened, false, 'a keyless caller opens nothing');
  assert.equal(
    base.reason,
    'INBOX_EPOCH_UNKNOWN',
    'and it stops at the key — the binding held, which is what makes the three below mean something (§6.5)',
  );

  const altered: readonly { readonly what: string; readonly make: () => Fixture }[] = [
    {
      // THE HEADER. `nc` is one of §7.2's six and is a header field, so a
      // different nonce rebuilds to a different identifier. A well-formed
      // nonce is used rather than rubbish, so the refusal is "does not
      // rebuild" and not "will not even build".
      what: 'the header — a different nonce in `hdr.nc`',
      make: () =>
        alterChunk(pristine, ENVELOPE, 0, (_op, chunk) => {
          const hdr = chunk['hdr'] as Record<string, unknown>;
          hdr['nc'] = 'AAAAAAAAAAAAAAAAAAAAAA';
        }),
    },
    {
      // THE LANE. §7.2 builds `lane` from the topic the chunks are ON and not
      // from a header field, which is what makes it a weld: the same bytes read
      // on a different topic are a different envelope's identifier.
      what: 'the lane — the same chunks read on another topic',
      make: () => {
        const g = copy(pristine);
        const moved = '0.0.999999';
        g.topics[moved] = (g.topics[g.lane] ?? []).map((m) => ({ ...m, topicId: moved }));
        g.topicInfo[moved] = g.topicInfo[g.lane] ?? null;
        (g as { lane: string }).lane = moved;
        return g;
      },
    },
    {
      // THE RESOLUTION PROOF. Only the proof's HASH enters the AAD (§7.2), so
      // a header naming a proof the AAD did not bind is the alteration this
      // clause is about: the envelope claims a resolution it was not sealed to.
      what: 'the resolution proof — a different hash in `hdr.rp.h`',
      make: () =>
        alterChunk(pristine, ENVELOPE, 0, (_op, chunk) => {
          const hdr = chunk['hdr'] as Record<string, unknown>;
          const rp = hdr['rp'] as Record<string, unknown>;
          rp['h'] = '0'.repeat(64);
        }),
    },
  ];

  for (const alteration of altered) {
    const got = await deliveryOf(alteration.make());
    assert.equal(got.opened, false, `${alteration.what}: fails closed — nothing is opened (§6.5, P-1)`);
    assert.equal(
      got.reason,
      'INBOX_UNBOUND',
      `${alteration.what}: returned INBOX_UNBOUND, not ${String(got.reason)}`,
    );
    // It is a returned value and not a thrown failure: reaching this line is
    // the proof, because `inbox` would have thrown past it (P-12, §6.5).
  }
});
