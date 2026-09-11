/**
 * T-P12-4 — P-12 (Honest degradation).
 *
 * Classes: VERIFIER.
 * Register: NAMED (§9.6)
 *
 * §A’s sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   A Verifier claiming no profile appraises every fixture’s resolution as unverified, never fails, and passes the VERIFIER suite.
 *
 * EXPANDED 2026-09-10 over the four captured correspondences
 * (`conformance/DERIVATION.md`, kind: captured).
 *
 * WHY THE EXPECTATION FOLLOWS FROM THE TEXT. §9.6: a Verifier that claims no
 * profile "verifies binding, settlement, and postmarks, and appraises every
 * resolution as unverified". That is a statement about what a CONFORMING
 * Verifier does, not about a shortfall — so the expectation here is that the
 * resolution comes back `unverified` carrying `T-P12-4`, that nothing throws,
 * and that the envelope’s binding and postage are appraised anyway. An
 * implementation that refused to appraise, or that quietly appraised the
 * resolution verified without replaying it, would fail this.
 *
 * The third clause — "and passes the VERIFIER suite" — is the report’s own
 * statement about this run and not something a body can assert about itself.
 * `conformance/DERIVATION.md` records that reading.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verify } from '../../app/src/tools/verify.js';
import { allFixtures, readerOver } from '../support/fixtures.js';

test('T-P12-4 — Honest degradation', async () => {
  for (const { name, f } of allFixtures()) {
    // `claims` absent is a Verifier that claims no profile (§9.6). It is the
    // scope and not an option, which is why it is passed here and not read
    // from the release.
    const { bundle } = await verify(readerOver(f), { lane: f.lane }, {});

    assert.ok(bundle.correspondence.length > 0, `${name}: the lane holds at least one envelope`);

    for (const e of bundle.correspondence) {
      const where = `${name} / ${e.envelope.aadHash.slice(0, 12)}`;

      assert.equal(
        e.appraisal.resolution.standing,
        'unverified',
        `${where}: §9.6 — a Verifier claiming no profile appraises the resolution unverified`,
      );
      assert.ok(
        e.appraisal.resolution.reasons.includes('T-P12-4'),
        `${where}: and says so by naming this test among the reasons (§11.5)`,
      );

      // "never fails": the appraisal came back as an appraisal. §6.7 and P-12
      // both forbid turning a condition that has an appraisal into a tool
      // failure, and reaching this line at all is the proof for this fixture.
      assert.ok(
        ['verified', 'unverified', 'unstamped', 'unbound'].includes(e.appraisal.appraised.standing),
        `${where}: the envelope has a standing on §11.5’s ladder`,
      );

      // Binding, settlement and postmarks ARE verified — §9.6’s own list of
      // what such a Verifier still does. A claimless Verifier that had also
      // stopped checking those would satisfy the first clause and defeat the
      // sentence it comes from.
      assert.ok(e.chunks.length > 0, `${where}: the postmarks were read`);
      assert.ok(
        e.settlement !== undefined,
        `${where}: the settlement at the reference the header names was read (§11.4)`,
      );
    }

    // And what the network recorded on the day of the run, which is the same
    // answer: the capture is a record, and this is it being re-read offline.
    const first = bundle.correspondence.find((e) => e.envelope.aadHash === f.envelope['aadHash']);
    if (first !== undefined) {
      assert.deepEqual(
        { ...first.appraisal.resolution, reasons: [...first.appraisal.resolution.reasons] },
        { ...f.appraisal.resolution, reasons: [...f.appraisal.resolution.reasons] },
        `${name}: the resolution appraises as it did on the network`,
      );
    }
  }
});
