/**
 * T-P6-7 — P-6 (Resolution is a proof).
 *
 * Classes: VERIFIER.
 * Register: NAMED (§11.1; D-163)
 * @fixture-kind captured, altered
 *
 * §A’s sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   A manifest whose `meaning.uri` names a topic on which no message recomputes to its hash appraises unverified, with `T-P6-7` among its reasons; a manifest reached through a reference whose locator names a message on the topic that manifest’s own `meaning.uri` names, and which recomputes there, appraises verified.
 *
 * EXPANDED 2026-09-10 over `gate-three-resolved` for the positive and two
 * altered copies for the negative.
 *
 * WHAT D-163 SETTLED, AND WHY IT IS SUBTLE. A resolution proof travels by
 * reference: the header carries `hdr.rp.u`, a locator naming a topic and a
 * sequence number, and `hdr.rp.h`, the proof’s hash. Following the reference
 * and recomputing the hash proves the proof exists and is intact. It does NOT
 * prove the proof is where the proof says it is — and a copy of a manifest,
 * published anywhere by anyone, hashes exactly as correctly as the original.
 *
 * So §11.1 asks a second question: the manifest carries its own canonical
 * location in `meaning.uri` (§5.2), inside its own hash, and a Verifier reads
 * THAT topic for a message that recomputes to the proof’s hash. The reference
 * is how you got there; `meaning.uri` is what the proof says about itself. Only
 * the second is inside the hash, which is what makes the location checkable
 * rather than merely followable.
 *
 * ABSENCE IS A DOWNGRADE AND NEVER AN ERROR (P-12). A manifest nobody can find
 * at its own address leaves the envelope BOUND — the letter is welded to its
 * header, its lane and its postage regardless — and its address unappraised,
 * which is why §A’s footer keys this row to P-6 and not to P-1: every P-1 row
 * yields `unbound` and a manifest not found at its location yields `unverified`.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { REASON_ORDER, REASON_STANDING, verify } from '../../app/src/tools/verify.js';
import { REPO_ROOT, chunksOn, copy, fixture, readerOver, repack, type Fixture } from '../support/fixtures.js';

const FIXTURE = 'gate-three-resolved';
const ENVELOPE = '2229a6c909d4b6c53889d6fda5ee173ff322debec9010a6aaf9e5cb388079c01';

async function resolutionOf(f: Fixture): Promise<{ standing: string; reasons: readonly string[]; appraised: string }> {
  const { bundle } = await verify(readerOver(f), { lane: f.lane, claims: ['hcs14'] }, {});
  const entry = bundle.correspondence.find((e) => e.envelope.aadHash === ENVELOPE);
  assert.ok(entry !== undefined, 'the envelope is reconciled');
  return {
    standing: entry.appraisal.resolution.standing,
    reasons: entry.appraisal.resolution.reasons,
    appraised: entry.appraisal.appraised.standing,
  };
}

test('T-P6-7 — Resolution is a proof', async () => {
  const pristine = fixture(FIXTURE);

  // --- The positive: reached by reference, and found at its own address. --
  const zero = chunksOn(pristine).find((c) => c.chunk['id'] === ENVELOPE && c.chunk['i'] === 0);
  assert.ok(zero !== undefined, 'chunk 0 is on the lane');
  const rp = (zero.chunk['hdr'] as Record<string, unknown>)['rp'] as {
    h: string;
    u: { topicId: string; sequenceNumber: number };
  };

  const atReference = (pristine.topics[rp.u.topicId] ?? []).find((m) => m.sequenceNumber === rp.u.sequenceNumber);
  assert.ok(atReference !== undefined, 'the reference reaches a message (§5.2)');
  const manifest = JSON.parse(atReference.contents) as { hash: string; meaning: { uri: { topicId: string } } };
  assert.equal(manifest.hash, rp.h, 'which recomputes to the hash the header binds');

  // And the manifest's OWN canonical location names a topic that holds it.
  const own = manifest.meaning.uri.topicId;
  const atItsOwnAddress = (pristine.topics[own] ?? []).filter((m) => m.contents.includes(rp.h));
  assert.ok(atItsOwnAddress.length > 0, `the manifest is on the topic its own meaning.uri names (${own}) — D-163`);

  const good = await resolutionOf(pristine);
  assert.equal(good.reasons.includes('T-P6-7'), false, 'so nothing is said against its location');
  assert.equal(good.standing, 'verified', 'and the resolution appraises verified (§11.4)');
  assert.equal(good.appraised, 'verified', 'and so does the envelope');

  // --- The negative: found by reference, absent from its own address. -----
  // THE ALTERATION IS A COPY, WHICH IS THE ONLY HONEST WAY TO BUILD IT.
  //
  // `meaning.uri` is inside the manifest's own hash, so it cannot be edited
  // without breaking the hash and turning this into T-P6-2. What CAN be moved is
  // the REFERENCE: `hdr.rp.u` is a locator in the header and is not one of
  // §7.2's six AAD fields, so pointing it at a republished copy leaves the
  // envelope binding and changes only how the Verifier got to the manifest.
  //
  // That is precisely D-163's case: a copy of a manifest, published anywhere by
  // anyone, hashes exactly as correctly as the original. The reference finds it,
  // the hash checks out, and the only thing that says it is not where it claims
  // to be is its own `meaning.uri`.
  const ELSEWHERE = '0.0.555555';
  const republish = (g: Fixture): void => {
    g.topics[ELSEWHERE] = [{ ...atReference, topicId: ELSEWHERE, sequenceNumber: 1 }];
    g.topicInfo[ELSEWHERE] = {
      topicId: ELSEWHERE,
      memo: 'wishmail:manifest:1',
      submitKeys: [],
      adminKey: null,
      customFees: [],
      feeExemptKeys: [],
      deleted: false,
    };
    const target = chunksOn(g).find((c) => c.chunk['id'] === ENVELOPE && c.chunk['i'] === 0);
    assert.ok(target !== undefined, 'chunk 0');
    ((target.chunk['hdr'] as Record<string, unknown>)['rp'] as Record<string, unknown>)['u'] = {
      ledgerTag: g.ledgerTag,
      topicId: ELSEWHERE,
      sequenceNumber: 1,
    };
    repack(g, g.lane, target.message.sequenceNumber, target.op, target.chunk);
  };

  const negatives: readonly { readonly what: string; readonly make: () => Fixture }[] = [
    {
      // The copy, with the original gone from the address it claims.
      what: 'a manifest reached through a copy, absent from the topic its own meaning.uri names',
      make: () => {
        const g = copy(pristine);
        republish(g);
        g.topics[own] = (g.topics[own] ?? []).filter((m) => !m.contents.includes(rp.h));
        return g;
      },
    },
    {
      // Its own address is a topic that exists and holds other things, so "not
      // found" is a real search and not an empty one.
      what: 'a manifest whose meaning.uri names a topic holding other messages only',
      make: () => {
        const g = copy(pristine);
        republish(g);
        g.topics[own] = (g.topics[own] ?? []).map((m) =>
          m.contents.includes(rp.h)
            ? { ...m, contents: JSON.stringify({ p: 'wishmail', note: 'something else' }) }
            : m,
        );
        return g;
      },
    },
  ];

  // --- THE CONSTANTS AGAINST THE TABLE, SO THE DRIFT CANNOT RECUR. --------
  //
  // This row was computed and dropped for as long as §11.5's table named
  // `T-P6-7` and `verify.ts`'s `REASON_ORDER` did not. `REASON_ORDER` is a
  // FILTER, so an id the table names and the constant omits is discarded after
  // the check that produced it has run; `REASON_STANDING` is what `lowest()`
  // reads, so an omission there leaves the envelope's standing untouched. One
  // omission breaks both halves of §11.5's MUST. The fix was to widen the
  // constants; this is what keeps them widened.
  {
    const spec = fs.readFileSync(path.join(REPO_ROOT, 'spec', 'WISHMAIL_SPEC_v0_5.md'), 'utf8');
    const section = spec.split('### 11.5')[1]?.split('### 11.6')[0] ?? '';
    assert.ok(section.length > 0, 'the specification carries §11.5');

    // The table rows, which are the lines that name a standing and the tests
    // that yield it. The `Conformance:` notes beneath the table are not rows.
    const named = new Set<string>();
    for (const line of section.split('\n')) {
      if (!/\b(unbound|unstamped|unverified)\b/.test(line)) continue;
      if (line.trimStart().startsWith('`Conformance:`')) continue;
      for (const id of line.match(/T-P\d+-\d+/g) ?? []) named.add(id);
    }
    assert.ok(named.size >= 15, `§11.5's table names ${named.size} tests`);

    const order = new Set<string>(REASON_ORDER);
    const standing = new Set(Object.keys(REASON_STANDING));
    for (const id of named) {
      assert.ok(order.has(id), `§11.5's table names ${id} and REASON_ORDER omits it — the reason would be dropped`);
      assert.ok(
        standing.has(id),
        `§11.5's table names ${id} and REASON_STANDING omits it — the downgrade would not reach the envelope`,
      );
    }
    assert.ok(named.has('T-P6-7'), 'and this row is one of them (D-163)');
  }

  const measured: { what: string; standing: string; reasons: readonly string[]; appraised: string }[] = [];
  for (const negative of negatives) {
    const got = await resolutionOf(negative.make());
    measured.push({ what: negative.what, ...got });

    // The check DID fire: the resolution's own standing fell.
    assert.equal(got.standing, 'unverified', `${negative.what}: the resolution appraises unverified (§11.1, D-163)`);
  }

  // --- WHAT THE REPORT DID WITH IT. ---------------------------------------
  //
  // §11.5's table names this check by name — spec line 1691, "a message at the
  // manifest's location hashes to the proof … unverified … T-P6-7" — and the
  // paragraph beneath the table carries the MUST that governs what a Verifier
  // does with it:
  //
  //   "A Verifier MUST report every reason that any check yielded and MUST NOT
  //    report a standing higher than the lowest any check yielded."
  //
  // Both halves are asserted here, separately, because one omission breaks both
  // and it is worth saying which is which.
  for (const got of measured) {
    assert.ok(
      got.reasons.includes('T-P6-7'),
      `${got.what}: §11.5 — a Verifier MUST report every reason any check yielded. The resolution's standing ` +
        `fell to \`${got.standing}\`, so a check yielded one; the reasons reported are ` +
        `${JSON.stringify(got.reasons)}. \`verify.ts\`'s REASON_ORDER is a FILTER over a fixed list and that ` +
        'list does not carry T-P6-7, so the reason is computed and then dropped — leaving a standing below ' +
        'verified with nothing said against it, which §11.5 does not admit ("an envelope with no reasons is ' +
        'verified"). D-163 added the row to the table and the constant was never widened.',
    );
  }
  for (const got of measured) {
    assert.equal(
      got.appraised,
      'unverified',
      `${got.what}: §11.5 — a Verifier MUST NOT report a standing higher than the lowest any check yielded. ` +
        `The resolution check yielded \`unverified\` and the ENVELOPE is reported \`${got.appraised}\`. ` +
        "`lowest()` reads REASON_STANDING, which carries no entry for T-P6-7, so the downgrade is invisible to " +
        'it. A manifest that is nowhere near the address it claims leaves the letter fully verified.',
    );
  }
});
