/**
 * T-P6-2 — P-6 (Resolution is a proof).
 *
 * Classes: CORRESPONDENT, VERIFIER.
 * Register: NAMED (§9.1)
 * @fixture-kind captured, altered
 * @disposition partial — the `send` clause needs a writer
 *
 * §A’s sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   Per profile, a fixture manifest recomputes to its hash from its locator (consensus) or snapshot (others); a non-consensus manifest without a snapshot is rejected at `send`.
 *
 * EXPANDED 2026-09-11 over every manifest the six captures name.
 *
 * WHAT A MANIFEST IS FOR. §5.2 makes a proof content-addressed: its `hash` is
 * SHA-256 over its own canonical JSON with `hash` absent, so the document names
 * itself and cannot be edited without saying so. That is what lets a proof
 * travel by reference — the header carries only the hash and a locator, and a
 * reader who follows the locator can tell whether what it found is what was
 * bound.
 *
 * "FROM ITS LOCATOR (CONSENSUS) OR SNAPSHOT (OTHERS)" IS THE PROFILE-DEPENDENT
 * HALF. An `hcs14` resolution reads inputs that are all on consensus, so the
 * locator is enough: a Verifier re-obtains them and re-runs the rule. A profile
 * whose inputs are not on consensus — `dns`, `nanda` — cannot be re-obtained at
 * the moment of reading, so the proof carries a snapshot of what it saw. This
 * release implements only `hcs14` in the letter path, so what is exercised here
 * is the consensus form, and the others are named as deferred rather than
 * pretended at.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canonicalDigest } from '../../app/src/core/canonical.js';
import { verify } from '../../app/src/tools/verify.js';
import { allFixtures, chunksOn, copy, fixture, readerOver, repack } from '../support/fixtures.js';

test('T-P6-2 — Resolution is a proof', async () => {
  // --- Every manifest recomputes to its own hash. -------------------------
  let manifests = 0;
  const profiles = new Set<string>();

  for (const { name, f } of allFixtures()) {
    for (const { chunk } of chunksOn(f)) {
      if (chunk['i'] !== 0) continue;
      const hdr = chunk['hdr'] as Record<string, unknown>;
      const rp = hdr['rp'] as { h: string; u: { topicId: string; sequenceNumber: number } };
      profiles.add(hdr['pr'] as string);

      const message = (f.topics[rp.u.topicId] ?? []).find((m) => m.sequenceNumber === rp.u.sequenceNumber);
      assert.ok(message !== undefined, `${name}: the locator reaches a message (§5.2)`);
      const manifest = JSON.parse(message.contents) as Record<string, unknown>;

      // §5.1's one hashing rule: over the canonical JSON with the hash field
      // itself absent. Recomputed here from the document rather than trusted.
      assert.equal(
        canonicalDigest(manifest, 'hash'),
        rp.h,
        `${name}: the manifest at the locator recomputes to the hash the header binds (§5.2)`,
      );
      assert.equal(manifest['hash'], rp.h, `${name}: and carries that hash itself`);

      // The consensus form: the locator is enough, because the rule's inputs
      // are re-obtainable. `hcs14` fixtures carry no snapshot for that reason.
      const rule = manifest['rule'] as { id?: string } | undefined;
      assert.equal(rule?.id, 'hcs14', `${name}: this release resolves under hcs14 in the letter path`);
      const inputs = manifest['inputs'] as Record<string, unknown>;
      assert.ok(inputs['locator'] !== undefined, `${name}: with a locator naming where to re-obtain them (§5.2)`);

      manifests += 1;
    }
  }
  assert.ok(manifests >= 6, `${manifests} manifests, all recomputing`);
  assert.deepEqual([...profiles], ['hcs14'], 'one profile is exercised, and the others are deferred rather than faked');

  // --- A manifest edited after publication no longer recomputes. ----------
  //
  // The other direction of the same sentence, and the reason a proof is
  // content-addressed at all.
  {
    const f = fixture('gate-three-resolved');
    const zero = chunksOn(f).find((c) => c.chunk['i'] === 0);
    assert.ok(zero !== undefined, 'chunk 0');
    const rp = (zero.chunk['hdr'] as Record<string, unknown>)['rp'] as {
      h: string;
      u: { topicId: string; sequenceNumber: number };
    };

    const g = copy(f);
    const messages = g.topics[rp.u.topicId] ?? [];
    const at = messages.findIndex((m) => m.sequenceNumber === rp.u.sequenceNumber);
    assert.ok(at >= 0, 'the manifest is on the topic');
    const manifest = JSON.parse((messages[at] as { contents: string }).contents) as Record<string, unknown>;
    (manifest['inputs'] as Record<string, unknown>)['tampered'] = true;
    (messages[at] as { contents: string }).contents = JSON.stringify(manifest);

    assert.notEqual(canonicalDigest(manifest, 'hash'), rp.h, 'an edited manifest recomputes to something else');

    const { bundle } = await verify(readerOver(g), { lane: g.lane, claims: ['hcs14'] }, {});
    const entry = bundle.correspondence[0];
    assert.ok(entry !== undefined, 'the envelope is reconciled');
    assert.ok(
      entry.appraisal.resolution.reasons.includes('T-P6-2'),
      'and the resolution names this test among its reasons (§11.5)',
    );
    assert.equal(entry.appraisal.resolution.standing, 'unverified', 'appraising unverified');
    assert.equal(
      entry.appraisal.appraised.standing,
      'unverified',
      'and the envelope with it — bound, stamped, and its address unappraised',
    );
  }

  // A locator reaching nothing is the same downgrade, from the other side.
  {
    const f = fixture('gate-three-resolved');
    const zero = chunksOn(f).find((c) => c.chunk['i'] === 0);
    assert.ok(zero !== undefined, 'chunk 0');
    const g = copy(f);
    const target = chunksOn(g).find((c) => c.chunk['i'] === 0);
    assert.ok(target !== undefined, 'chunk 0 in the copy');
    ((target.chunk['hdr'] as Record<string, unknown>)['rp'] as Record<string, unknown>)['u'] = {
      ledgerTag: g.ledgerTag,
      topicId: '0.0.444444',
      sequenceNumber: 1,
    };
    repack(g, g.lane, target.message.sequenceNumber, target.op, target.chunk);

    const { bundle } = await verify(readerOver(g), { lane: g.lane, claims: ['hcs14'] }, {});
    assert.ok(
      bundle.correspondence[0]?.appraisal.resolution.reasons.includes('T-P6-2'),
      'a locator reaching no message is T-P6-2 as well (§11.4)',
    );
  }

  assert.fail(
    'T-P6-2 PARTIAL — every captured manifest recomputes to the hash its header binds, an edited one does not, ' +
      'and a locator reaching nothing downgrades the resolution: the first clause, in full, for the one profile ' +
      'this release resolves under. The second clause, "a non-consensus manifest without a snapshot is rejected ' +
      'at `send`", is out of reach twice over: `dns` and `nanda` are deferred from the letter path by MVP ' +
      'scoping, so no non-consensus profile exists here to build such a manifest under; and the rejection is ' +
      '`send`\'s, which needs a writer. Recorded rather than quietly dropped (conformance/DERIVATION.md).',
  );
});
