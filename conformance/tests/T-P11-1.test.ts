/**
 * T-P11-1 — P-11 (Postage is postage).
 *
 * Classes: POSTMASTER, VERIFIER.
 * Register: NAMED (§4.1)
 * @fixture-kind altered
 * @disposition partial — the `send` clause needs a writer
 *
 * §A’s sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   A settlement in any token other than the pinned stamp is rejected at `send` and appraises as unstamped.
 *
 * EXPANDED 2026-09-10 over `gate-three-resolved`, with the settlement moved into
 * other tokens.
 *
 * "NO TOKEN OTHER THAN THE STAMP IS POSTAGE" IS A NON-NEGOTIABLE (CLAUDE.md §3),
 * and this is where it is tried. A transfer of some other fungible token to the
 * treasury, under a perfectly correct memo, in the right amount, at the right
 * moment, is not postage — it is a transfer of some other token. §4.1 pins the
 * stamp per ledger tag for exactly this reason: postage has to be a thing the
 * specification NAMES, or a sender could pay in anything and a Verifier would
 * have no ground to say otherwise.
 *
 * THE CHECK IS PART OF THE SCOPE AND NOT AN OPTION, and that is the subtle half.
 * §11.4 counts a settlement only if it is in the stamp token — but a Verifier
 * that was never told which token that is cannot check it. So `stampToken`
 * travels in the SCOPE (§6.7), P-3’s "the same scope and window yield the same
 * evidence", and a Verifier given no token says so under `observations` rather
 * than passing the check by silence. Both are asserted below, because a check
 * that quietly passed when unconfigured would be worse than one that failed.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verify } from '../../app/src/tools/verify.js';
import { copy, fixture, readerOver, stampTokenPin, type Fixture } from '../support/fixtures.js';

const FIXTURE = 'gate-three-resolved';
const ENVELOPE = '2229a6c909d4b6c53889d6fda5ee173ff322debec9010a6aaf9e5cb388079c01';

async function standingOf(
  f: Fixture,
  withToken: boolean,
): Promise<{ standing: string; reasons: readonly string[]; observations: Record<string, unknown> }> {
  const { bundle } = await verify(
    readerOver(f),
    {
      lane: f.lane,
      claims: ['hcs14'],
      ...(withToken ? { stampToken: stampTokenPin(f.ledgerTag) } : {}),
    },
    {},
  );
  const entry = bundle.correspondence.find((e) => e.envelope.aadHash === ENVELOPE);
  assert.ok(entry !== undefined, 'the envelope is reconciled');
  return {
    standing: entry.appraisal.appraised.standing,
    reasons: entry.appraisal.appraised.reasons,
    observations: bundle.observations,
  };
}

test('T-P11-1 — Postage is postage', async () => {
  const pristine = fixture(FIXTURE);
  const pin = stampTokenPin(pristine.ledgerTag);

  // --- The captured postage is in the pinned stamp. -----------------------
  const settled = Object.values(pristine.settlements).find((s) => s.memo.includes(ENVELOPE));
  assert.ok(settled !== undefined, 'the capture holds the settlement');
  assert.equal(settled.tokenId, pin.tokenId, `§4.1: the postage is in the pinned stamp ${pin.tokenId}`);
  assert.equal(settled.to, pin.treasury, 'and it went to the treasury, where a stamp is consumed (§4.3)');

  const base = await standingOf(pristine, true);
  assert.equal(base.standing, 'verified', 'so it stands');

  // --- Any other token is not postage. ------------------------------------
  for (const token of ['0.0.888888', '0.0.1', pin.treasury]) {
    const g = copy(pristine);
    for (const ref of Object.keys(g.settlements)) {
      if (!(g.settlements[ref] as { memo: string }).memo.includes(ENVELOPE)) continue;
      (g.settlements[ref] as { tokenId: string }).tokenId = token;
    }

    const got = await standingOf(g, true);
    assert.equal(got.standing, 'unstamped', `a settlement in ${token} appraises unstamped (§11.5)`);
    assert.ok(got.reasons.includes('T-P11-1'), `${token}: with T-P11-1 among its reasons`);
  }

  // --- And to any other collector, which is the same sentence. ------------
  //
  // §4.4: stamps are CONSUMED to the treasury, doorbell fee included. A
  // transfer of real stamps to somebody else is not postage either.
  {
    const g = copy(pristine);
    for (const ref of Object.keys(g.settlements)) {
      if (!(g.settlements[ref] as { memo: string }).memo.includes(ENVELOPE)) continue;
      (g.settlements[ref] as { to: string }).to = '0.0.999999';
    }
    const got = await standingOf(g, true);
    assert.equal(got.standing, 'unstamped', 'stamps that did not reach the treasury are not consumed (§4.3)');
    assert.ok(got.reasons.includes('T-P7-1'), 'and the reason is the postage rule it broke');
  }

  // --- A Verifier not told which token SAYS SO. ---------------------------
  //
  // The check it could not make is recorded under `observations`, which §11.6
  // excludes from the digest — so an unchecked check is not a failed one, and
  // it is not a passed one either.
  {
    const g = copy(pristine);
    for (const ref of Object.keys(g.settlements)) {
      if (!(g.settlements[ref] as { memo: string }).memo.includes(ENVELOPE)) continue;
      (g.settlements[ref] as { tokenId: string }).tokenId = '0.0.888888';
    }
    const got = await standingOf(g, false);
    assert.equal(
      got.reasons.includes('T-P11-1'),
      false,
      'a Verifier that was not told the stamp token does not report this check as failed',
    );
    assert.ok(
      typeof got.observations['stampTokenUnknown'] === 'string',
      'it records that it could not make the check (§11.6, §6.7) — silence would be the defect',
    );
  }

  assert.fail(
    'T-P11-1 PARTIAL — the replay half holds in full: a settlement in any other token, and one to any other '
      + 'collector, appraise `unstamped` with the reasons §11.5 names; and a Verifier given no stamp token '
      + 'records the check it could not make instead of passing it. The `send` half is not reachable, and the '
      + 'reason is worth stating exactly rather than deferring: the MODELLED ledger has one token. '
      + '`MemoryLedger.transfer` takes no token argument at all, because the model was built to enforce the four '
      + 'facts the tools depend on and a second fungible token is not among them. So a settlement in ANOTHER '
      + 'token is not something the model can express, and faking one would be building the fixture out of the '
      + 'answer. This is the case the ruling of 2026-09-11 anticipates: a behaviour the model cannot express '
      + 'honestly stays a named partial. Closing it needs either a second token in the model or a captured '
      + 'settlement in one, and neither is a night’s work (conformance/DERIVATION.md).',
  );
});
