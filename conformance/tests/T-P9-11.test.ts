/**
 * T-P9-11 — P-9 (Strict standards).
 *
 * Classes: CORRESPONDENT, POSTMASTER, VERIFIER.
 * Register: NAMED (§5.1; D-113 — core, was ext §16.8)
 * @fixture-kind altered
 * @disposition partial — replay raises where §11.5 has a rung
 *
 * §A’s sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   An envelope whose AAD names a ledger tag that neither the spec nor an extension the release claims defines is rejected at `send` and appraises unbound at replay.
 *
 * EXPANDED 2026-09-10 over `gate-three-resolved`, with the ledger tag altered
 * and the identifier RE-DERIVED.
 *
 * WHY THE IDENTIFIER HAS TO BE RE-DERIVED, AND WHY THAT IS THE HONEST FIXTURE.
 * `l` is one of §7.2’s six AAD fields, so changing it changes the envelope’s
 * identifier. An alteration that changed only the header would produce an
 * envelope that fails to bind — T-P1-1 — and would never reach the ledger-tag
 * check at all. What this row is about is an envelope that binds PERFECTLY and
 * names a ledger nobody defines: every chunk carries the new identifier, the
 * header rebuilds to it, and the settlement memo names it. So the whole
 * envelope is recomputed around the new tag, which is a heavier alteration than
 * any other in this suite and is named as such.
 *
 * WHY THE CHECK EXISTS. §5.1 defines two ledger tags and refuses every other, and
 * D-113 moved this from an extension to the core. An envelope naming
 * `hedera:fictional` is not a forgery and not malformed — it is an envelope
 * about a ledger this reader has no way to reach, and a Verifier that appraised
 * it on any other ground would be appraising a correspondence it cannot see.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { buildAad, LEDGER_TAGS } from '../../app/src/core/aad.js';
import { settlementMemo } from '../../app/src/core/envelope.js';
import { verify } from '../../app/src/tools/verify.js';
import { chunksOn, copy, fixture, readerOver, repack, type Fixture } from '../support/fixtures.js';

const FIXTURE = 'gate-three-resolved';
const ENVELOPE = '2229a6c909d4b6c53889d6fda5ee173ff322debec9010a6aaf9e5cb388079c01';
const UNDEFINED_TAG = 'hedera:fictional';

/**
 * The same envelope, about a ledger nobody defines.
 *
 * Every chunk’s `id`, chunk 0’s `hdr.l`, and the settlement’s memo are moved
 * together, so the result is an envelope that BINDS and names an undefined tag —
 * which is the only arrangement that reaches §5.1’s check.
 */
function aboutAnotherLedger(f: Fixture): { readonly fixture: Fixture; readonly id: string } {
  const g = copy(f);
  const zero = chunksOn(g).find((c) => c.chunk['id'] === ENVELOPE && c.chunk['i'] === 0);
  assert.ok(zero !== undefined, 'chunk 0 is on the lane');
  const hdr = zero.chunk['hdr'] as Record<string, unknown>;

  // The AAD is a function of its six fields. Build it by hand, because
  // `buildAad` refuses an undefined tag by design (§5.1) — which is the check
  // under test, and a fixture cannot use the check to build its own input.
  const header = {
    p: 'wishmail',
    v: '0.5',
    l: UNDEFINED_TAG,
    lane: g.lane,
    rp: (hdr['rp'] as Record<string, unknown>)['h'] as string,
    nc: hdr['nc'] as string,
  };
  const bytes = Buffer.from(JSON.stringify({ l: header.l, lane: header.lane, nc: header.nc, p: header.p, rp: header.rp, v: header.v }), 'utf8');
  const id = createHash('sha256').update(bytes).digest('hex');

  for (const c of chunksOn(g)) {
    if (c.chunk['id'] !== ENVELOPE) continue;
    c.chunk['id'] = id;
    if (c.chunk['i'] === 0) (c.chunk['hdr'] as Record<string, unknown>)['l'] = UNDEFINED_TAG;
    repack(g, g.lane, c.message.sequenceNumber, c.op, c.chunk);
  }
  for (const ref of Object.keys(g.settlements)) {
    if ((g.settlements[ref] as { memo: string }).memo !== settlementMemo(ENVELOPE)) continue;
    (g.settlements[ref] as { memo: string }).memo = settlementMemo(id);
  }
  return { fixture: g, id };
}

test('T-P9-11 — Strict standards', async () => {
  // --- §5.1 defines two tags and no more. ---------------------------------
  assert.deepEqual([...LEDGER_TAGS], ['hedera:testnet', 'hedera:mainnet'], '§5.1 defines exactly two ledger tags');
  assert.equal(
    (LEDGER_TAGS as readonly string[]).includes(UNDEFINED_TAG),
    false,
    `${UNDEFINED_TAG} is named by neither the specification nor any extension this release claims (§16.1)`,
  );

  // --- The `send` half, which is the check itself. ------------------------
  //
  // §6.4 builds the AAD before anything is affixed, and `buildAad` refuses an
  // undefined tag rather than producing a well-formed identifier that binds to
  // nothing. So a sender cannot make this envelope at all — which is the
  // strongest form of "rejected at `send`" there is.
  assert.throws(
    () =>
      buildAad({
        ledgerTag: UNDEFINED_TAG,
        lane: '0.0.10468898',
        resolutionProofHash: '0'.repeat(64),
        nonce: 'AAAAAAAAAAAAAAAAAAAAAA',
      }),
    /undefined ledger tag/,
    '`send` cannot build an AAD naming a ledger tag §5.1 does not define (§6.4, T-P9-11)',
  );

  // --- The replay half. ---------------------------------------------------
  const pristine = fixture(FIXTURE);
  const { fixture: altered, id } = aboutAnotherLedger(pristine);
  assert.notEqual(id, ENVELOPE, 'the identifier moved with the tag, as §7.2 requires');

  // The envelope BINDS: every chunk carries the new identifier and the header
  // rebuilds to it. Only the tag is wrong.
  const zero = chunksOn(altered).find((c) => c.chunk['id'] === id && c.chunk['i'] === 0);
  assert.ok(zero !== undefined, 'the re-derived envelope is on the lane');
  assert.equal((zero.chunk['hdr'] as Record<string, unknown>)['l'], UNDEFINED_TAG, 'naming the undefined ledger');

  let bundle;
  let raised: string | undefined;
  try {
    ({ bundle } = await verify(readerOver(altered), { lane: altered.lane, claims: ['hcs14'] }, {}));
  } catch (e) {
    raised = e instanceof Error ? e.message : String(e);
  }

  if (raised === undefined && bundle !== undefined) {
    const entry = bundle.correspondence.find((e) => e.envelope.aadHash === id);
    assert.ok(entry !== undefined, 'the envelope is reconciled');
    assert.equal(entry.appraisal.appraised.standing, 'unbound', 'and appraises unbound (§11.5)');
    assert.ok(entry.appraisal.appraised.reasons.includes('T-P9-11'), 'with T-P9-11 among its reasons');
    return;
  }

  assert.fail(
    'T-P9-11 PARTIAL — the `send` half holds: §6.4 cannot build an AAD naming an undefined ledger tag, which is ' +
      'the rejection §A asks for. The replay half does not reach its appraisal. §11.5’s table gives `T-P9-11` a ' +
      'rung — unbound — and `verify` raises instead: `bindsTo` returns false for a header it cannot build, so ' +
      'there is no canonical chunk 0, and the branch that describes the claimed chunk calls `recoverEnvelope`, ' +
      'which calls `rebuildAad`, which refuses the tag. The same branch is in `inbox` (§6.5, INBOX_UNBOUND). ' +
      `P-12 forbids a tool failure where an appraisal exists (§6.7). Raised: ${String(raised)}. ` +
      'Brought, not adjusted (conformance/DERIVATION.md).',
  );
});
