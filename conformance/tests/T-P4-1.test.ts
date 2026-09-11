/**
 * T-P4-1 — P-4 (No broker, key, or credit).
 *
 * Classes: VERIFIER.
 * Register: NAMED (§1.4)
 * @fixture-kind captured
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   The VERIFIER suite passes in an environment with no credentials of any kind: no broker, API key, credit, Hedera account, stamp, or recipient key configured.
 *
 * EXPANDED 2026-09-10 over the six captured correspondences, appraised with the
 * process environment emptied.
 *
 * WHY IT IS WRITTEN THIS WAY. The sketch names two things: an environment, and
 * a suite passing in it. The second is the report's own statement about this
 * run and is not something a body can assert about itself without circularity —
 * `conformance/DERIVATION.md` records that reading. The first is exactly
 * testable, and is the substance: §11.1 says "a mirror node is a read interface,
 * not a source … reading through one requires no key, credit, or credential",
 * and §1.4 makes that a property of the VERIFIER class rather than of a
 * deployment's luck.
 *
 * SO THE ENVIRONMENT IS EMPTIED AND NOT MERELY LEFT ALONE. A test run on a
 * machine that happened to have no credentials would prove nothing about a
 * machine that had some: the risk P-4 guards against is a reader that silently
 * picks one up. Every variable is removed, the whole VERIFIER read path is run
 * over every capture, and the appraisals must be identical to the ones reached
 * with the environment in place. A reader that consulted the environment would
 * differ somewhere, and this is where.
 *
 * The `Reader` interface is the structural half of the same argument: it has no
 * write on it and nothing to configure. That is enforcement rather than promise,
 * and it is why this test can be this short.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verify } from '../../app/src/tools/verify.js';
import { allFixtures, readerOver } from '../support/fixtures.js';

/**
 * Kept while the environment is emptied: Node itself reads these to find its own
 * installation and temp directory on Windows, and removing them tests the
 * operating system rather than the Verifier. Neither is a credential.
 */
const NOT_A_CREDENTIAL = ['PATH', 'Path', 'SystemRoot', 'windir', 'TEMP', 'TMP', 'HOME', 'USERPROFILE'];

test('T-P4-1 — No broker, key, or credit', async () => {
  // --- With the environment as it stands. ---------------------------------
  const withEnvironment: Record<string, string> = {};
  for (const { name, f } of allFixtures()) {
    const { bundle } = await verify(readerOver(f), { lane: f.lane }, {});
    withEnvironment[name] = JSON.stringify(
      bundle.correspondence.map((e) => ({
        id: e.envelope.aadHash,
        state: e.state,
        appraised: e.appraisal.appraised,
        receipt: e.appraisal.receipt,
      })),
    );
  }

  // --- With nothing configured at all. ------------------------------------
  const saved = { ...process.env };
  const removed: string[] = [];
  try {
    for (const key of Object.keys(process.env)) {
      if (NOT_A_CREDENTIAL.includes(key)) continue;
      delete process.env[key];
      removed.push(key);
    }

    // Named explicitly, because these are the ones §1.4 lists and the ones this
    // repository has ever used. A variable that came back would be a reader
    // setting it, which is worth catching separately from one that was left.
    for (const key of [
      'POSTMASTER_PAYER_ID',
      'POSTMASTER_PAYER_DER_KEY',
      'HEDERA_NETWORK',
      'MIRROR_NODE_URL',
      'WISHMAIL_HOME',
      'OPENAI_API_KEY',
      'ANTHROPIC_API_KEY',
    ]) {
      assert.equal(process.env[key], undefined, `${key} is not set while the VERIFIER path runs (§1.4)`);
    }

    for (const { name, f } of allFixtures()) {
      const { bundle } = await verify(readerOver(f), { lane: f.lane }, {});
      const after = JSON.stringify(
        bundle.correspondence.map((e) => ({
          id: e.envelope.aadHash,
          state: e.state,
          appraised: e.appraisal.appraised,
          receipt: e.appraisal.receipt,
        })),
      );
      assert.equal(
        after,
        withEnvironment[name],
        `${name}: the appraisal is the same with nothing configured — no broker, key, credit, account, stamp or recipient key (P-4)`,
      );
      assert.ok(bundle.correspondence.length > 0, `${name}: and it still read the correspondence`);
    }

    // A claimed profile replays the whole of §9.2's rule from consensus, which
    // is the deepest thing a Verifier does — and it does it with nothing
    // configured too. This is the half of P-4 that a claimless run cannot show.
    const resolved = allFixtures().filter((x) => x.name.endsWith('-resolved'));
    assert.ok(resolved.length > 0, 'a capture carrying the resolution chain exists');
    for (const { name, f } of resolved) {
      const { bundle } = await verify(readerOver(f), { lane: f.lane, claims: ['hcs14'] }, {});
      for (const e of bundle.correspondence) {
        assert.equal(
          e.appraisal.resolution.standing,
          'verified',
          `${name}: §9.2's rule re-runs to a verified resolution with no credential of any kind`,
        );
      }
    }
  } finally {
    for (const key of removed) {
      const value = saved[key];
      if (value !== undefined) process.env[key] = value;
    }
  }

  assert.ok(removed.length > 0, 'the environment was not already empty, so emptying it proved something');
  for (const key of removed) {
    assert.equal(process.env[key], saved[key], `${key} was put back`);
  }
});
