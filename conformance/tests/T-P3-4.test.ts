/**
 * T-P3-4 — P-3 (Public-data replay).
 *
 * Classes: VERIFIER.
 * Register: NAMED (§11.7)
 * @fixture-kind captured
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   Every reference narrative's `bundleDigest` equals the digest of the bundle it was produced from; a narrative presented with a bundle of another digest is rejected.
 *
 * EXPANDED 2026-09-10 over the six captured correspondences.
 *
 * WHY THE EXPECTATION FOLLOWS FROM THE TEXT. §11.7 makes the narrative
 * "produced from the bundle and from nothing else" and gives it one field
 * besides its text: the digest of the bundle it came from. That is what makes a
 * narrative checkable rather than merely readable — a reader who holds both can
 * ask whether this prose is about this evidence, and get an answer that is
 * arithmetic.
 *
 * THE SECOND CLAUSE NEEDS A READER, AND THIS TEST IS IT. Nothing in `verify.ts`
 * "rejects" a narrative, because nothing there is ever handed one: `narrate`
 * produces them. §11.7 describes the check a reader makes, so the body performs
 * that check rather than looking for a function that performs it. A body that
 * went hunting for `rejectNarrative()` would be testing the implementation's
 * shape instead of the specification's rule.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canonicalBytes, sha256hex } from '../../app/src/core/canonical.js';
import { narrate, verify, type EvidenceBundle } from '../../app/src/tools/verify.js';
import { allFixtures, readerOver } from '../support/fixtures.js';

/**
 * §11.7's digest: SHA-256 over the canonical JSON of the bundle with `digest`
 * and `observations` absent. Written here from the sentence, not imported, so
 * that this body and `verify.ts` agree by arithmetic rather than by sharing.
 */
function digestOf(bundle: EvidenceBundle): string {
  const { digest: _digest, observations: _observations, ...evidence } = bundle;
  return sha256hex(canonicalBytes(evidence));
}

test('T-P3-4 — Public-data replay', async () => {
  const bundles: EvidenceBundle[] = [];

  for (const { name, f } of allFixtures()) {
    const { bundle, narrative } = await verify(readerOver(f), { lane: f.lane }, { narrative: true });
    assert.ok(narrative !== undefined, `${name}: a narrative was asked for and produced`);
    bundles.push(bundle);

    // The bundle's own `digest` field is that digest, so the narrative's claim
    // is checkable against the bundle by itself.
    assert.equal(bundle.digest, digestOf(bundle), `${name}: §11.7's digest is over the evidence, observations absent`);

    assert.equal(
      narrative.bundleDigest,
      digestOf(bundle),
      `${name}: the narrative carries the digest of the bundle it was produced from (§11.7)`,
    );

    // And narrating the same bundle twice says the same thing — a narrative
    // that varied could not be about one digest.
    assert.equal(narrate(bundle).text, narrative.text, `${name}: the narrative is a function of the bundle`);
    assert.equal(narrate(bundle).bundleDigest, narrative.bundleDigest, `${name}: and so is its digest`);
  }

  assert.ok(bundles.length >= 2, 'more than one bundle, so a narrative can be presented with the wrong one');

  // --- "a narrative presented with a bundle of another digest is rejected" ---
  //
  // The check §11.7 describes, performed. Every narrative against every bundle
  // that is not its own: the digests disagree, so the pairing is refused.
  let pairs = 0;
  for (let i = 0; i < bundles.length; i += 1) {
    for (let j = 0; j < bundles.length; j += 1) {
      const mine = bundles[i] as EvidenceBundle;
      const theirs = bundles[j] as EvidenceBundle;
      const narrative = narrate(mine);
      const accepted = narrative.bundleDigest === digestOf(theirs);
      if (i === j) {
        assert.equal(accepted, true, `a narrative is accepted with its own bundle (${i})`);
      } else if (digestOf(mine) !== digestOf(theirs)) {
        assert.equal(accepted, false, `a narrative presented with bundle ${j} instead of ${i} is rejected (§11.7)`);
        pairs += 1;
      }
    }
  }
  assert.ok(pairs > 0, 'at least one mismatched pairing was tried');
});
