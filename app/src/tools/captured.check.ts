/**
 * The captured letter, appraised offline — and the seven alterations refused.
 *
 * `check:letter` exercises the readers against a MODELLED ledger, which is
 * consensus as a data structure. This one reads a correspondence that is
 * actually on `hedera:testnet`, captured byte for byte into
 * `conformance/fixtures/`, and appraises it **with no network**. That is what
 * P-4 asks for in as many words: "the VERIFIER suite runs with nothing
 * configured. A mirror node is a read interface, not a broker." A test that
 * reached a mirror node would be a test of the mirror node.
 *
 * THE SEVEN ALTERATIONS ARE THE POINT. An envelope that appraises correctly
 * proves the reader can read; an altered one that still appraised correctly
 * would prove the reader was not looking. Each alteration below changes exactly
 * one thing in the captured bytes and the appraisal must fall — §11.5's ladder
 * is `verified > unverified > unstamped > unbound`, and every check that yields
 * below verified contributes its test id to `reasons`.
 *
 * WHAT THIS RELEASE REACHES ON THE PRISTINE COPY IS `unverified`, and that is
 * correct rather than a shortfall: `RELEASE.profiles` is `{}`, and §9.6 makes a
 * Verifier that claims no profile conforming — "it verifies binding,
 * settlement, and postmarks, and appraises every resolution as unverified"
 * (T-P12-4). So the alterations are read against BINDING and POSTAGE, which are
 * the checks this release does make, and each must drive the standing strictly
 * below where the pristine copy sits.
 */
import fs from 'node:fs';
import path from 'node:path';
import { repoRoot } from '../ops/env.js';
import { canonicalBytes, sha256hex } from '../core/canonical.js';
import { verify } from './verify.js';
import type { Reader, ScheduleRecord, Settlement, TopicInfo, TopicMessage } from './consensus.js';

const FIXTURE = path.join(repoRoot(), 'conformance', 'fixtures', 'checkpoint-one-letter.json');

interface Fixture {
  readonly ledgerTag: string;
  readonly lane: string;
  readonly topics: Record<string, TopicMessage[]>;
  readonly topicInfo: Record<string, TopicInfo | null>;
  readonly accounts: Record<string, { memo: string | null; key: string | null }>;
  readonly settlements: Record<string, Settlement>;
  /**
   * §10.4's schedules, where the correspondence carries a return receipt.
   *
   * §11.2's ingestion table reaches "the schedule and its record" from the
   * lane's `transaction` operation, so a capture that took the lane and left the
   * schedules behind would send the suite back to the network for exactly the
   * evidence a receipt rests on — which is what P-4 forbids. Absent on a fixture
   * whose letters requested none.
   */
  readonly schedules?: Record<string, ScheduleRecord>;
  readonly envelope: { readonly aadHash: string };
  readonly appraisal: { readonly appraised: { readonly standing: string; readonly reasons: readonly string[] } };
  readonly bundleDigest: string;
}

let passed = 0;
const failures: string[] = [];
function ok(what: string, cond: boolean): void {
  if (cond) passed += 1;
  else failures.push(what);
}
function is(what: string, got: unknown, want: unknown): void {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) passed += 1;
  else failures.push(`${what}\n    got   ${g}\n    want  ${w}`);
}

/** A `Reader` over captured bytes. No network, no key, nothing configured. */
function readerOver(f: Fixture): Reader {
  return {
    ledgerTag: f.ledgerTag,
    messages: (topicId) => Promise.resolve(f.topics[topicId] ?? []),
    topic: (topicId) => Promise.resolve(f.topicInfo[topicId] ?? null),
    transfer: (txRef) => Promise.resolve(f.settlements[txRef] ?? null),
    accountMemo: (account) => Promise.resolve(f.accounts[account]?.memo ?? null),
    accountKey: (account) => Promise.resolve(f.accounts[account]?.key ?? null),
    schedule: (scheduleId) => Promise.resolve(f.schedules?.[scheduleId] ?? null),
  };
}

/** A deep copy, so one alteration never leaks into the next. */
function copy(f: Fixture): Fixture {
  return JSON.parse(JSON.stringify(f)) as Fixture;
}

/** The lane's chunk 0, parsed, altered by `edit`, and put back. */
function alterChunk(f: Fixture, edit: (op: Record<string, unknown>, data: Record<string, unknown>) => void): Fixture {
  const g = copy(f);
  const lane = g.topics[g.lane] as TopicMessage[];
  const m = lane[lane.length - 1] as TopicMessage;
  const op = JSON.parse(m.contents) as Record<string, unknown>;
  const data = JSON.parse(op['data'] as string) as Record<string, unknown>;
  edit(op, data);
  op['data'] = JSON.stringify(data);
  (lane[lane.length - 1] as { contents: string }).contents = JSON.stringify(op);
  return g;
}

const RANK: Record<string, number> = { unbound: 0, unstamped: 1, unverified: 2, verified: 3 };

async function standingOf(f: Fixture): Promise<{ standing: string; reasons: readonly string[] }> {
  const out = await verify(readerOver(f), { lane: f.lane }, {});
  const e = out.bundle.correspondence[0];
  if (e === undefined) return { standing: 'unbound', reasons: ['no envelope reassembled'] };
  return { standing: e.appraisal.appraised.standing, reasons: e.appraisal.appraised.reasons };
}

async function main(): Promise<void> {
  if (!fs.existsSync(FIXTURE)) {
    console.error(`check:captured — no fixture at ${FIXTURE}. Capture one: npm run capture -- --lane 0.0.N --name checkpoint-one-letter`);
    process.exit(2);
  }
  const pristine = JSON.parse(fs.readFileSync(FIXTURE, 'utf8')) as Fixture;

  // === The pristine copy, offline ==========================================
  const base = await standingOf(pristine);
  is('the captured letter appraises offline exactly as it did on the network', base.standing, pristine.appraisal.appraised.standing);
  is('with the same reasons', [...base.reasons], [...pristine.appraisal.appraised.reasons]);
  is('and the reason is the profile this release does not claim (§9.6, T-P12-4)', [...base.reasons], ['T-P12-4']);

  const out = await verify(readerOver(pristine), { lane: pristine.lane }, {});
  // THE DIGEST IS A FUNCTION OF THE RELEASE'S PATCH VERSION, and this is where
  // that shows. §11.7's evidence carries `spec`, and `verify` fills it from
  // `RELEASE.spec` — the full major.minor.patch. So a Verifier at 0.5.11
  // computes a different digest from the one this correspondence produced at
  // 0.5.10, over byte-identical evidence, and §11.7's MUST that "two Verifiers
  // reconciling the same scope and window MUST produce evidence with the same
  // digest" holds only between Verifiers at one patch. Raised as ledger §G-25;
  // NOT coded around, and `RELEASE.spec` is left exactly as it is.
  //
  // What P-3 claims is asserted here rather than assumed: put back the spec
  // string this fixture was captured under and the digest is EXACTLY the one
  // the network produced. Every other byte of the evidence is unchanged, which
  // is a stronger statement than the equality this line used to make.
  const SPEC_WHEN_CAPTURED = '0.5.10';
  const { observations: _observations, digest: _digest, ...evidence } = out.bundle;
  const asCaptured = sha256hex(canonicalBytes({ ...evidence, spec: SPEC_WHEN_CAPTURED }));
  is('the bundle digest is the one the network produced (P-3)', asCaptured, pristine.bundleDigest);
  const again = await verify(readerOver(pristine), { lane: pristine.lane }, {});
  is('and two Verifiers over the same bytes agree, byte for byte (T-P3-1)', again.bundle.digest, out.bundle.digest);

  const floor = RANK[base.standing] ?? 3;

  // === Six alterations this release DOES catch =============================
  const seven: readonly { readonly what: string; readonly make: () => Fixture }[] = [
    {
      what: 'a changed header — the chunk no longer rebuilds to its id (T-P1-1)',
      make: () => alterChunk(pristine, (_op, data) => { data['id'] = 'f'.repeat(64); }),
    },
    {
      // The AAD's `lane` is not a header field: §7.2 builds it from the topic the
      // chunks are ON, which is what makes the weld a weld. So a wrong lane is
      // the envelope RELOCATED — the same bytes read on a different topic — and
      // the AAD then rebuilds to something that is not `id`.
      what: 'a wrong lane — the same chunk read on another topic (T-P10-1)',
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
      what: 'a swapped resolution proof — the header names a proof the AAD did not bind (T-P6-1)',
      make: () => alterChunk(pristine, (_op, data) => {
        const hdr = data['hdr'] as Record<string, unknown> | undefined;
        const rp = hdr?.['rp'] as Record<string, unknown> | undefined;
        if (rp !== undefined) rp['h'] = '0'.repeat(64);
      }),
    },
    {
      what: 'a settlement memo that is not the identifier (T-P1-2, T-P7-1)',
      make: () => {
        const g = copy(pristine);
        for (const ref of Object.keys(g.settlements)) {
          (g.settlements[ref] as { memo: string }).memo = 'wishmail:' + 'a'.repeat(64);
        }
        return g;
      },
    },
    {
      what: 'an operator_id that is not the settlement’s from (T-P1-6)',
      make: () => alterChunk(pristine, (op) => { op['operator_id'] = '0.0.999998@0.0.999999'; }),
    },

    {
      // §11.3 walks the chain on BYTES: chunk 0 by its header rebuilding to
      // `id`, each later chunk by the prior's `nx`. THIS LETTER HAS ONE CHUNK
      // and therefore no `nx` to break — 53 bytes of payload fit in a single
      // HCS message — so the seventh alteration is the other half of the same
      // walk: the digest the header claims over the ciphertext. A `nx` fixture
      // needs a multi-chunk envelope, and checkpoint one did not produce one.
      // Said here rather than faked, and it is what T-P1-11 still owes.
      what: 'a ciphertext digest the slices do not hash to (T-P1-1, T-P3-3; T-P1-11 still owes a multi-chunk fixture)',
      make: () => alterChunk(pristine, (_op, data) => {
        const hdr = data['hdr'] as Record<string, unknown> | undefined;
        if (hdr !== undefined) hdr['h'] = 'b'.repeat(64);
      }),
    },
  ];

  for (const alteration of seven) {
    const r = await standingOf(alteration.make());
    const rank = RANK[r.standing] ?? 3;
    ok(
      `${alteration.what} — refused: ${r.standing}${r.reasons.length === 0 ? '' : ` (${r.reasons.join(', ')})`}`,
      rank < floor,
    );
  }

  // === THE SEVENTH ALTERATION THIS RELEASE CANNOT CATCH, AND WHY ===========
  //
  // §11.5's ladder has `hdr.ke equals the coordinates' keyEpoch` yielding
  // UNBOUND (T-P1-10). But §11.4 says what it is compared against: "the
  // `keyEpoch` the resolution's coordinates carry" — and the coordinates come
  // from REPLAYING the resolution, which §11.4 does "if that profile is one the
  // Verifier claims (§9.6)". `RELEASE.profiles` is `{}`, so this release does
  // not replay, has no coordinates, and has nothing to compare `ke` to.
  //
  // So an altered epoch goes UNNOTICED here, and that is correct rather than a
  // defect: a claimless Verifier is conforming (T-P12-4) and appraises the
  // resolution unverified either way. It is recorded as an assertion rather
  // than a comment because it is a REAL LIMIT of what this release can see, and
  // because claiming `hcs14` does more than raise a standing — **it turns on a
  // binding check that is dark today.** When the claim is made, this assertion
  // inverts and T-P1-10 becomes testable.
  {
    const altered = alterChunk(pristine, (_op, data) => {
      const hdr = data['hdr'] as Record<string, unknown> | undefined;
      if (hdr !== undefined) hdr['ke'] = 99;
    });
    const r = await standingOf(altered);
    is(
      'a wrong key epoch is NOT caught by a Verifier that claims no profile — T-P1-10 needs the replay (§11.4, §9.6)',
      { standing: r.standing, reasons: [...r.reasons] },
      { standing: base.standing, reasons: [...base.reasons] },
    );
  }

  // P-12: none of the above is a tool failure. Every one of them came back as an
  // APPRAISAL — a standing with reasons — and `verify` never threw.
  ok('and not one of them was a tool failure: every refusal is an appraisal (P-12)', true);

  if (failures.length > 0) {
    console.error(`\ncheck:captured FAILED — ${failures.length} of ${passed + failures.length} assertions:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(
    `\ncheck:captured PASS — ${passed} assertions over a letter that is ON hedera:testnet, appraised with NO ` +
      `NETWORK from conformance/fixtures/ (P-4): the same standing and the same bundle digest the network produced, ` +
      `stable across two Verifiers, SIX alterations each driving the standing strictly lower; and the seventh, a wrong key epoch, recorded as one this release CANNOT see, because T-P1-10 compares against coordinates only a claimed profile replay produces (11.4, 9.6).`,
  );
}

main().catch((e: unknown) => {
  console.error('\ncheck:captured STOPPED\n' + (e instanceof Error ? e.message : String(e)));
  process.exitCode = 3;
});
