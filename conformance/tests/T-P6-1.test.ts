/**
 * T-P6-1 — P-6 (Resolution is a proof).
 *
 * Classes: CORRESPONDENT, VERIFIER.
 * Register: NAMED (§6.2)
 * @fixture-kind altered
 *
 * §A’s sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   A resolution proof whose inputs are altered after resolution no longer hashes to the proof; the envelope appraises **unverified**. Amended at 0.5.13 by D-177: the sketch said *unbound* and §11.5’s table says *unverified*, and the table wins — a resolution that does not replay leaves the letter bound and its address unappraised, which is §A’s own reasoning for keying T-P6-7 to P-6 rather than P-1.
 *
 * EXPANDED 2026-09-11, after D-177. This row could not be expanded before it:
 * the sketch asked for `unbound` and §11.5’s table gave `unverified`, a body
 * cannot follow both, and guessing which authority to obey is not a body’s to
 * do. `conformance/DERIVATION.md` recorded it as finding F-3 and left the row
 * closed until the ledger settled it.
 *
 * WHAT THE ROW IS ABOUT. §6.2 makes a resolution a PROOF and not an answer: the
 * inputs are recorded, the output is a digest over coordinates, and the whole
 * thing is content-addressed so that a stranger can re-run the rule and get the
 * same number. Alter any input after the fact and the arithmetic stops working —
 * not because anybody checked a signature, but because the hash is over the
 * inputs and the inputs moved.
 *
 * AND WHY THE ENVELOPE IS STILL BOUND. P-1’s welds are untouched by any of this:
 * the header still rebuilds to the identifier, the chunks still carry it, the
 * postage still names it, the lane is still the lane. What is unknown is who the
 * ADDRESS belonged to. §11.5’s reading paragraph puts that exactly: "a bound and
 * stamped envelope whose resolution could not be replayed is still certified
 * mail whose address is unappraised". Calling it unbound would say it is not
 * certified mail at all, which is more than the evidence shows — and P-12
 * forbids appraising above the evidence in one direction and requires the
 * minimum in the other.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canonicalDigest } from '../../app/src/core/canonical.js';
import { verify } from '../../app/src/tools/verify.js';
import { chunksOn, copy, fixture, readerOver, type Fixture } from '../support/fixtures.js';

const FIXTURE = 'gate-three-resolved';
const ENVELOPE = '2229a6c909d4b6c53889d6fda5ee173ff322debec9010a6aaf9e5cb388079c01';

async function appraise(f: Fixture): Promise<{
  standing: string;
  reasons: readonly string[];
  resolution: { standing: string; reasons: readonly string[] };
}> {
  const { bundle } = await verify(readerOver(f), { lane: f.lane, claims: ['hcs14'] }, {});
  const entry = bundle.correspondence.find((e) => e.envelope.aadHash === ENVELOPE);
  assert.ok(entry !== undefined, 'the envelope is reconciled');
  return {
    standing: entry.appraisal.appraised.standing,
    reasons: entry.appraisal.appraised.reasons,
    resolution: { standing: entry.appraisal.resolution.standing, reasons: entry.appraisal.resolution.reasons },
  };
}

/** The manifest the envelope’s header binds, and where it sits. */
function manifestOf(f: Fixture): { topicId: string; index: number; manifest: Record<string, unknown>; hash: string } {
  const zero = chunksOn(f).find((c) => c.chunk['id'] === ENVELOPE && c.chunk['i'] === 0);
  assert.ok(zero !== undefined, 'chunk 0 is on the lane');
  const rp = (zero.chunk['hdr'] as Record<string, unknown>)['rp'] as {
    h: string;
    u: { topicId: string; sequenceNumber: number };
  };
  const messages = f.topics[rp.u.topicId] ?? [];
  const index = messages.findIndex((m) => m.sequenceNumber === rp.u.sequenceNumber);
  assert.ok(index >= 0, 'the locator reaches a message (§5.2)');
  return {
    topicId: rp.u.topicId,
    index,
    manifest: JSON.parse((messages[index] as { contents: string }).contents) as Record<string, unknown>,
    hash: rp.h,
  };
}

test('T-P6-1 — Resolution is a proof', async () => {
  const pristine = fixture(FIXTURE);

  // --- As resolved: the inputs hash to the proof. -------------------------
  const original = manifestOf(pristine);
  assert.equal(
    canonicalDigest(original.manifest, 'hash'),
    original.hash,
    '§5.2: the proof is content-addressed — its hash is over its own canonical JSON with `hash` absent',
  );

  const before = await appraise(pristine);
  assert.equal(before.resolution.standing, 'verified', 'so the resolution replays and appraises verified (§11.4)');
  assert.equal(before.standing, 'verified', 'and the envelope with it');

  // --- Altered after resolution. ------------------------------------------
  //
  // Each of these changes one INPUT of the proof, which is what §6.2's sentence
  // is about: what the rule was given. The proof was sealed over them, so the
  // arithmetic stops working the moment any of them moves.
  const alterations: readonly { readonly what: string; readonly edit: (inputs: Record<string, unknown>) => void }[] = [
    {
      what: 'the locator — where the rule says it read its inputs',
      edit: (inputs) => {
        const locator = inputs['locator'] as Record<string, unknown>;
        locator['address'] = 'somebody.else@example';
      },
    },
    {
      what: 'the digest over what was read',
      edit: (inputs) => {
        inputs['digest'] = '0'.repeat(64);
      },
    },
    {
      what: 'an input added after the fact',
      edit: (inputs) => {
        inputs['addedLater'] = true;
      },
    },
  ];

  for (const alteration of alterations) {
    const g = copy(pristine);
    const target = manifestOf(g);
    alteration.edit(target.manifest['inputs'] as Record<string, unknown>);
    (g.topics[target.topicId] as { contents: string }[])[target.index] = {
      ...(g.topics[target.topicId] as { contents: string }[])[target.index],
      contents: JSON.stringify(target.manifest),
    } as never;

    // The arithmetic, first: it no longer hashes to the proof.
    assert.notEqual(
      canonicalDigest(target.manifest, 'hash'),
      target.hash,
      `${alteration.what}: the altered manifest no longer hashes to the proof (§5.2, §6.2)`,
    );

    const got = await appraise(g);

    // --- The resolution falls. ---------------------------------------------
    assert.equal(got.resolution.standing, 'unverified', `${alteration.what}: the resolution appraises unverified`);
    assert.ok(
      got.resolution.reasons.includes('T-P6-2') || got.resolution.reasons.includes('T-P6-1'),
      `${alteration.what}: naming the check that caught it — ${JSON.stringify([...got.resolution.reasons])}`,
    );

    // --- AND THE ENVELOPE IS UNVERIFIED, NOT UNBOUND (D-177). --------------
    assert.equal(
      got.standing,
      'unverified',
      `${alteration.what}: §11.5 — a bound and stamped envelope whose resolution could not be replayed is still ` +
        'certified mail whose address is unappraised',
    );
    assert.notEqual(got.standing, 'unbound', `${alteration.what}: and it is NOT unbound — P-1's welds are untouched`);

    // Said the other way round, because it is the whole of the ruling: not one
    // of §11.5's unbound rungs fired.
    for (const binding of ['T-P1-1', 'T-P1-11', 'T-P3-3', 'T-P1-6', 'T-P10-1', 'T-P9-11', 'T-P10-2', 'T-P9-6', 'T-P17-2', 'T-P1-10']) {
      assert.equal(
        got.reasons.includes(binding),
        false,
        `${alteration.what}: ${binding} did not fire — the letter is still welded to its header, lane and postage`,
      );
    }
  }

  // --- And the ruling itself, against the two authorities it settled. -----
  //
  // §A's sketch and §11.5's table disagreed until D-177, and a body that simply
  // asserted the implementation's behaviour would have recorded the agreement
  // rather than the ruling. This asserts what the ruling decided.
  assert.equal(
    before.standing,
    'verified',
    'a resolution that DOES replay leaves the envelope verified, which is the same rung read from the other end',
  );
});
