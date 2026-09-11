/**
 * T-P12-2 — P-12 (Honest degradation).
 *
 * Classes: VERIFIER.
 * Register: NAMED (§6.7)
 * @fixture-kind captured, altered
 *
 * §A’s sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   For every fixture, appraised ≤ declared; no fixture produces a tool failure for a condition that has an appraisal.
 *
 * EXPANDED 2026-09-10 over the six captures and every alteration this body can
 * make of them — every condition §11.5’s table names, and several it does not.
 *
 * WHY THIS ROW IS THE ONE THAT HOLDS THE OTHERS UP. P-12 wins any conflict.
 * Every other test in this suite asks whether a particular wrong thing produces
 * a particular right answer; this one asks whether a wrong thing can produce NO
 * answer — a thrown failure where §11.5 has a rung. That is the failure mode
 * that would make a Verifier useless in the one case it exists for, because a
 * correspondence nobody can appraise is a correspondence nobody can dispute.
 *
 * "APPRAISED ≤ DECLARED" IS THE OTHER HALF, AND IT IS ABOUT DIRECTION. §11.5:
 * "non-replayable evidence downgrades, never upgrades". A resolution declares a
 * trust class and a set of endorsements; the appraisal can agree with it or fall
 * below it and can never exceed it. So the check is that no fixture, altered or
 * not, ever appraises ABOVE what its own manifest declared — and in particular
 * that an alteration only ever moves a standing down §11.5’s ladder.
 *
 * The alterations are made blind: the body does not predict which reason each
 * produces. It requires only that SOMETHING is produced, that nothing is thrown,
 * and that the standing never rises. A test that also predicted the reason would
 * be nine other tests, and each of those is registered separately.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verify, type Standing } from '../../app/src/tools/verify.js';
import { allFixtures, alterChunk, copy, envelopeIds, fixture, readerOver, type Fixture } from '../support/fixtures.js';

/** §11.5’s ladder, best first. `verified > unverified > unstamped > unbound`. */
const LADDER: readonly Standing[] = ['verified', 'unverified', 'unstamped', 'unbound'];
const rank = (s: string): number => LADDER.indexOf(s as Standing);

/** §12.2’s trust classes, best first — a declaration cannot be exceeded. */
const TRUST: readonly string[] = ['math', 'authority', 'assertion'];

test('T-P12-2 — Honest degradation', async () => {
  // --- Every capture, at every scope this release can be given. -----------
  let appraisals = 0;
  for (const { name, f } of allFixtures()) {
    for (const claims of [[], ['hcs14'], ['dns'], ['hcs14', 'hol']]) {
      const { bundle } = await verify(readerOver(f), { lane: f.lane, claims }, {});
      for (const e of bundle.correspondence) {
        const where = `${name} / ${e.envelope.aadHash.slice(0, 12)} / claims ${JSON.stringify(claims)}`;

        assert.ok(rank(e.appraisal.appraised.standing) >= 0, `${where}: the standing is on §11.5’s ladder`);
        assert.ok(
          ['acked', 'unclaimed', 'invalid', 'none'].includes(e.appraisal.receipt.status),
          `${where}: the receipt status is one of §11.4’s four`,
        );

        // appraised ≤ declared. The declaration is the manifest’s own claim
        // about the resolution; the appraisal may agree or fall below.
        const declaredRank = TRUST.indexOf(e.appraisal.declared.trustClass);
        assert.ok(declaredRank >= 0, `${where}: the declaration names a trust class §12.2 defines`);
        if (e.appraisal.resolution.standing === 'verified') {
          assert.deepEqual(
            [...e.appraisal.resolution.reasons],
            [],
            `${where}: a verified resolution carries no reason — a reason IS a downgrade`,
          );
        }

        // An endorsement is a warning the rule assigned, never one the
        // appraisal invented: §6.2 has the rule assign them and §11.4 report
        // them. So the appraisal may not name an endorsement the declaration
        // does not carry.
        for (const endorsement of e.appraisal.declared.endorsements) {
          assert.equal(typeof endorsement, 'string', `${where}: endorsements are the rule’s own words`);
        }
        appraisals += 1;
      }
    }
  }
  assert.ok(appraisals >= 24, `${appraisals} appraisals over the captures, at four scopes`);

  // --- And under every alteration, the standing only ever falls. ----------
  const f = fixture('gate-three-resolved');
  const id = envelopeIds(f)[0];
  assert.ok(id !== undefined, 'the lane carries an envelope');

  const { bundle: baseline } = await verify(readerOver(f), { lane: f.lane, claims: ['hcs14'] }, {});
  const base = baseline.correspondence[0];
  assert.ok(base !== undefined, 'and it appraises');
  assert.equal(base.appraisal.appraised.standing, 'verified', 'at the top of the ladder, as captured');

  const alterations: readonly { readonly what: string; readonly make: () => Fixture }[] = [
    { what: 'a broken identifier', make: () => alterChunk(f, id, 0, (_op, c) => { c['id'] = 'f'.repeat(64); }) },
    { what: 'a broken nonce', make: () => alterChunk(f, id, 0, (_op, c) => { (c['hdr'] as Record<string, unknown>)['nc'] = 'AAAAAAAAAAAAAAAAAAAAAA'; }) },
    { what: 'a broken ciphertext digest', make: () => alterChunk(f, id, 0, (_op, c) => { (c['hdr'] as Record<string, unknown>)['h'] = 'b'.repeat(64); }) },
    { what: 'a broken proof hash', make: () => alterChunk(f, id, 0, (_op, c) => { ((c['hdr'] as Record<string, unknown>)['rp'] as Record<string, unknown>)['h'] = '0'.repeat(64); }) },
    { what: 'an undefined ledger tag', make: () => alterChunk(f, id, 0, (_op, c) => { (c['hdr'] as Record<string, unknown>)['l'] = 'hedera:fictional'; }) },
    { what: 'a wrong key epoch', make: () => alterChunk(f, id, 0, (_op, c) => { (c['hdr'] as Record<string, unknown>)['ke'] = 99; }) },
    { what: 'a stranger’s operator_id', make: () => alterChunk(f, id, 0, (op) => { op['operator_id'] = '0.0.9@0.0.9'; }) },
    { what: 'a settlement naming another envelope', make: () => { const g = copy(f); for (const r of Object.keys(g.settlements)) (g.settlements[r] as { memo: string }).memo = `wishmail:${'a'.repeat(64)}`; return g; } },
    { what: 'no settlement at all', make: () => { const g = copy(f); (g as { settlements: Record<string, unknown> }).settlements = {}; return g; } },
    { what: 'a settlement in another token', make: () => { const g = copy(f); for (const r of Object.keys(g.settlements)) (g.settlements[r] as { tokenId: string }).tokenId = '0.0.888888'; return g; } },
    { what: 'a lane with a third submit key', make: () => { const g = copy(f); (g.topicInfo[g.lane] as { submitKeys: string[] }).submitKeys.push('0'.repeat(64)); return g; } },
    { what: 'no manifest at the locator', make: () => { const g = copy(f); for (const t of Object.keys(g.topics)) if (g.topicInfo[t]?.memo === 'wishmail:manifest:1') g.topics[t] = []; return g; } },
    { what: 'no schema registration', make: () => { const g = copy(f); g.topics['0.0.10448509'] = []; return g; } },
    { what: 'an empty lane', make: () => { const g = copy(f); g.topics[g.lane] = []; return g; } },
    { what: 'a mirror that holds no topic records', make: () => { const g = copy(f); (g as { topicInfo: Record<string, unknown> }).topicInfo = {}; return g; } },
    { what: 'a mirror that knows no accounts', make: () => { const g = copy(f); (g as { accounts: Record<string, unknown> }).accounts = {}; return g; } },
    { what: 'a schedule consensus no longer holds', make: () => { const g = copy(f); (g as { schedules: Record<string, unknown> }).schedules = {}; return g; } },
  ];

  // NO TOOL FAILURE. Every alteration below is a condition §11.5 has a rung
  // for, and P-12's sentence is that a Verifier reports rather than errors. The
  // throws are COLLECTED rather than thrown on, so that one of them cannot hide
  // the others: a body that stopped at the first would under-report exactly the
  // thing this row exists to count.
  const threw: { what: string; message: string }[] = [];

  for (const alteration of alterations) {
    const g = alteration.make();

    let bundle;
    try {
      ({ bundle } = await verify(readerOver(g), { lane: g.lane, claims: ['hcs14'] }, {}));
    } catch (e) {
      threw.push({ what: alteration.what, message: e instanceof Error ? e.message : String(e) });
      continue;
    }

    for (const e of bundle.correspondence) {
      const where = `${alteration.what} / ${e.envelope.aadHash.slice(0, 12)}`;
      assert.ok(rank(e.appraisal.appraised.standing) >= 0, `${where}: it has a standing`);
      assert.ok(
        rank(e.appraisal.appraised.standing) >= rank(base.appraisal.appraised.standing),
        `${where}: the standing did not RISE — non-replayable evidence downgrades, never upgrades (§11.5)`,
      );
      if (e.appraisal.appraised.standing !== 'verified') {
        assert.ok(
          e.appraisal.appraised.reasons.length > 0,
          `${where}: a standing below verified names the checks that yielded it (§11.5)`,
        );
      }
    }
  }

  // --- And the narrative is producible for every one of them. -------------
  //
  // §11.7's narrative is produced from the bundle; a bundle that could not be
  // narrated would be an appraisal nobody could read, which is P-12's failure
  // mode wearing different clothes.
  for (const alteration of alterations) {
    if (threw.some((t) => t.what === alteration.what)) continue;
    const { narrative } = await verify(readerOver(alteration.make()), { lane: f.lane, claims: ['hcs14'] }, { narrative: true });
    assert.ok(narrative !== undefined && narrative.text.length > 0, `${alteration.what}: it can still be told`);
  }

  // --- THE COUNT OF TOOL FAILURES, WHICH §6.7 REQUIRES TO BE ZERO. --------
  //
  // "No fixture produces a tool failure for a condition that has an
  // appraisal." Each entry below is such a condition: §11.5's table names a
  // rung for it, and a Verifier raised instead of reporting.
  assert.deepEqual(
    threw,
    [],
    'P-12 (§6.7, §11.5): a Verifier reports; it never errors where a downgrade will do. ' +
      `${threw.length} of ${alterations.length} alterations raised instead:\n` +
      threw.map((t) => `      ${t.what} — ${t.message}`).join('\n'),
  );
});
