/**
 * The second Gate Zero, appraised offline — the first correspondence this
 * deployment produced under GOOSE, read back with no network.
 *
 * Gate Zero the second was six instructions in two goose windows, one per turn,
 * and it is the only gate not driven by a CLI. Its run of record printed a
 * stranger's bundle digest twice and had **no fixture**, so the number could be
 * reproduced only by asking the network again. That is not reproduction; it is
 * repetition. This closes it: the same digest, from bytes on disk, with no key,
 * no account, no counter and no mirror (P-4).
 *
 * WHAT THIS FIXTURE PROVES THAT NO OTHER DOES.
 *
 * 1. **The doorbell memo names its own account.** On 2026-09-11 the first Gate
 *    Zero left two doorbells on `hedera:testnet` whose memo was
 *    `hcs-10:0:60:0:` — a door with no house — because `generate_mailbox` ran
 *    on a home with no account and the memo builder rendered an empty owner.
 *    Both were fixed before this gate. The fix is asserted here **from the
 *    bytes the network kept**, and not from the code that wrote them.
 * 2. **T-P16-2 on a real schedule.** The receipt's inner transaction is paid by
 *    the SENDER's operator, so the recipient signed for her letter and was
 *    charged nothing for it. `check:receipt` holds this on checkpoint two;
 *    this holds it on a correspondence whose every call came from a model.
 * 3. **§4.4's hop, in the settlement it led to.** This sender's operator held
 *    zero `$POSTAGE` when the letter was posted — the first time on this
 *    deployment — and the letter still settled two stamps under its own memo.
 *
 * THE DIGEST AND THE TAG. `v0.5.13` is `363a8b8` and HEAD is well past it, so
 * this fixture reproduces **from HEAD at specification 0.5.13** and not from a
 * tag. It needs no `SPEC_WHEN_CAPTURED` substitution, unlike the captures that
 * predate D-173: it was taken under a release that already writes the minor
 * version, so the number in the file is the number a reader gets forever.
 *
 * NOT REGISTERED WITH THE SUITE, DELIBERATELY. `conformance/support/fixtures.ts`
 * does not list it, so `allFixtures()` does not return it and the roughly ten
 * bodies that iterate every fixture are not armed against it. That is Sonic's
 * ruling and its reason is the calendar: the battery goes into Gate Four exactly
 * as green as it was, and both new fixtures are registered together afterward.
 *
 * Conformance (reference side): T-P1-7, T-P1-8, T-P3-1, T-P3-4, T-P4-1,
 * T-P11-3, T-P12-4, T-P16-2, T-P17-2.
 */
import fs from 'node:fs';
import path from 'node:path';
import { repoRoot } from '../ops/env.js';
import { RELEASE } from '../release.js';
import { laneBirth, verify } from './verify.js';
import type { Reader, ScheduleRecord, Settlement, TopicInfo, TopicMessage } from './consensus.js';

const FIXTURE = path.join(repoRoot(), 'conformance', 'fixtures', 'gate-zero-two-certified.json');

const LANE = '0.0.10489454';
/** DemoAgentX2, home `gz2-x`, the SENDER. Its operator held no $POSTAGE. */
const X2 = '0.0.10489394';
/** DemoAgentY2, home `gz2-y`, the RECIPIENT. */
const Y2 = '0.0.10489361';
const Y2_DOORBELL = '0.0.10489363';
const Y2_MANIFEST = '0.0.10489371';
const TREASURY = '0.0.10426205';
const POSTAGE = '0.0.10426208';
/** C2OPERATOR — the SENDER's operator, and the payer of the receipt's inner body. */
const SENDER_OPERATOR = '0.0.10450880';
const SCHEDULE = '0.0.10489457';
const EXECUTED = '1789176191.217453809';
const ENVELOPE = '08329989df027eb94bd99937c95134a4df1b93f749bf5d1f10fd47c5ac68022f';
const DIGEST = 'fca22d10b1f5a6dbbf8209748bab90730e46f46081608fee35eb523f4db37848';

interface Fixture {
  readonly ledgerTag: string;
  readonly lane: string;
  readonly topics: Record<string, TopicMessage[]>;
  readonly topicInfo: Record<string, TopicInfo | null>;
  readonly accounts: Record<string, { memo?: string; key?: string } | null>;
  readonly settlements: Record<string, Settlement | null>;
  readonly schedules?: Record<string, ScheduleRecord | null>;
  readonly bundleDigest: string;
}

const failures: string[] = [];
let checked = 0;
function is(name: string, got: unknown, want: unknown): void {
  checked += 1;
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g !== w) failures.push(`${name}\n    got   ${g}\n    want  ${w}`);
}
function ok(name: string, condition: boolean): void {
  checked += 1;
  if (!condition) failures.push(name);
}

/** A Reader over the file and nothing else — no key, no account, no network (P-4). */
function readerOver(f: Fixture): Reader {
  return {
    ledgerTag: f.ledgerTag,
    messages: async (t) => f.topics[t] ?? [],
    topic: async (t) => f.topicInfo[t] ?? null,
    transfer: async (r) => f.settlements[r] ?? null,
    accountMemo: async (a) => f.accounts[a]?.memo ?? null,
    accountKey: async (a) => f.accounts[a]?.key ?? null,
    schedule: async (s) => f.schedules?.[s] ?? null,
  };
}

const clone = (f: Fixture): Fixture => JSON.parse(JSON.stringify(f)) as Fixture;
const RANK: Record<string, number> = { unbound: 0, unstamped: 1, unverified: 2, verified: 3 };

async function main(): Promise<void> {
  if (!fs.existsSync(FIXTURE)) {
    console.error(
      `check:gzero2 — no fixture at ${FIXTURE}. Capture one (a mirror read; it signs and spends nothing):\n` +
        `  npm run capture -- --lane ${LANE} --name gate-zero-two-certified`,
    );
    process.exit(2);
  }
  const f = JSON.parse(fs.readFileSync(FIXTURE, 'utf8')) as Fixture;
  const reader = readerOver(f);

  // === 1. THE DOORBELL NAMES ITS OWN HOUSE ================================
  //
  // The 2026-09-11 defect, asserted as absent from the bytes the network kept.
  const door = await reader.topic(Y2_DOORBELL);
  is(
    'the recipient doorbell memo names its own account — the 2026-09-11 defect is not here (HCS-10 inbound form)',
    door?.memo,
    `hcs-10:0:60:0:${Y2}`,
  );
  ok('and it is not the ownerless form that gate left behind', door?.memo !== 'hcs-10:0:60:0:');
  ok(
    'the owner own key is fee-exempt at her own door — she does not pay to be rung (D-137)',
    (door?.feeExemptKeys ?? []).length === 1,
  );
  is(
    'it carries §4.4 one-stamp fee to the treasury, and no other (HIP-991, T-P7-4)',
    (door?.customFees ?? []).map((x) => ({ amount: x.amount, tokenId: x.tokenId, collector: x.collector })),
    [{ amount: 1, tokenId: POSTAGE, collector: TREASURY }],
  );

  // === 2. THE LANE BIRTH, FROM THE LANE ALONE (§11.4, D-171) ==============
  //
  // Nothing here is told who the parties are: the lane memo names a doorbell,
  // that doorbell memo names its owner, and the answer on it names who rang.
  const birth = await laneBirth(reader, LANE);
  ok('the lane birth is readable from the lane alone', birth !== null);
  is('it was born at the RECIPIENT door, because she answered', birth?.doorbell, Y2_DOORBELL);
  is('the door owner is the recipient, read from that door own memo', birth?.owner, Y2);
  is('and the party that rang is the sender', birth?.requester, X2);

  const laneInfo = await reader.topic(LANE);
  const keys = [...(laneInfo?.submitKeys ?? [])].sort();
  const want = [await reader.accountKey(X2), await reader.accountKey(Y2)]
    .filter((k): k is string => k !== null)
    .sort();
  is('the lane submit key is a threshold of exactly the two agents keys (T-P17-2)', keys, want);
  is('and the lane carries no custom fee (§7.1, T-P11-3)', (laneInfo?.customFees ?? []).length, 0);

  // === 3. THE LETTER, APPRAISED WITH NO NETWORK ===========================
  const out = await verify(reader, { lane: LANE }, { narrative: true });
  is('one correspondence on this lane', out.bundle.correspondence.length, 1);
  const e = out.bundle.correspondence[0];
  is('and it is the envelope the run of record named', e?.envelope.aadHash, ENVELOPE);
  is('affixed by the sender own account (§7.2 fourth weld)', e?.settlement?.from, X2);
  is('to the treasury, and nowhere else (§4.3, §14.4)', e?.settlement?.to, TREASURY);
  is('two stamps: one weight and one receipt fee (§4.2, §7.5)', e?.settlement?.amount, 2);
  is('in $POSTAGE and no other token (§4.1)', e?.settlement?.tokenId, POSTAGE);
  is('under a memo naming this envelope and no other (§4.3)', e?.settlement?.memo, `wishmail:${ENVELOPE}`);
  is('its state is ACKED — a receipt that recomputes (§8.3)', e?.state, 'ACKED');
  is('its receipt is acked', e?.appraisal.receipt.status, 'acked');
  is('with no reason — the header requested it (D-176, T-P1-12)', [...(e?.appraisal.receipt.reasons ?? [])], []);
  is('it appraises unverified, the profile being unclaimed (§9.6, T-P12-4)', e?.appraisal.appraised.standing, 'unverified');
  is('with that reason and no other', [...(e?.appraisal.appraised.reasons ?? [])], ['T-P12-4']);

  // === 4. T-P16-2 — THE RECIPIENT SIGNED AND PAID NOTHING =================
  //
  // §10.4 has the sender name its own side as the inner body payer, so signing
  // for a letter costs the recipient nothing. On a real HIP-423 schedule.
  const schedule = await reader.schedule(SCHEDULE);
  ok('the schedule is in the fixture', schedule !== null);
  is('it executed, which is what GREEN means and a card never is', schedule?.executedTimestamp, EXECUTED);
  is('and it was not deleted', schedule?.deleted, false);
  is('the inner body is paid by the SENDER operator, never the recipient (T-P16-2)', schedule?.payer, SENDER_OPERATOR);
  is('which is also who created it — the sender asked for the receipt (§10.4)', schedule?.creator, SENDER_OPERATOR);
  ok('and at least one signature is on it', (schedule?.signatures ?? []).length >= 1);

  const manifests = await reader.messages(Y2_MANIFEST);
  ok('the receipt manifest landed on the RECIPIENT own manifest topic (§10.4)', manifests.length >= 1);
  is('at sequence 1 of that topic', manifests[0]?.sequenceNumber, 1);
  is('at the instant the schedule executed, to the nanosecond', manifests[0]?.consensusTimestamp, EXECUTED);

  // === 5. THE DIGEST, REPRODUCED FROM DISK ================================
  is('the bundle spec is the MINOR version (D-173)', out.bundle.spec, '0.5');
  is('which is RELEASE.minorVersion and not RELEASE.spec', out.bundle.spec, RELEASE.minorVersion);
  is('the Verifier own patch is an observation, outside the digest (§11.6)', out.bundle.observations['verifierSpec'], RELEASE.spec);
  is('the fixture carries the digest the run of record printed', f.bundleDigest, DIGEST);
  is('and a Verifier reading the FIXTURE computes it with no network (P-4, T-P3-4)', out.bundle.digest, DIGEST);
  is('the narrative carries the digest of the bundle it came from (T-P3-4)', out.narrative?.bundleDigest, DIGEST);

  // §11.7's stability, asserted by BEING a Verifier at another patch of 0.5.
  const patch = RELEASE.spec;
  const mutable = RELEASE as { spec: string };
  let elsewhere;
  try {
    mutable.spec = '0.5.404';
    elsewhere = await verify(readerOver(f), { lane: LANE }, {});
  } finally {
    mutable.spec = patch;
  }
  is('a Verifier at ANOTHER patch of 0.5 computes the same digest (T-P3-1)', elsewhere.bundle.digest, DIGEST);
  is('and only the observation moved', elsewhere.bundle.observations['verifierSpec'], '0.5.404');
  is('RELEASE.spec is restored', RELEASE.spec, patch);

  // Run twice over the same bytes: §11.7's MUST, which the run of record could
  // only show by asking the network a second time.
  const again = await verify(readerOver(f), { lane: LANE }, { narrative: true });
  is('and the same Verifier reading it twice gets the same digest (§11.7)', again.bundle.digest, DIGEST);

  // === 6. TWO ALTERATIONS, EACH REFUSED ===================================
  //
  // A correspondence that appraises correctly proves the reader can read; an
  // altered one that still appraised correctly would prove it was not looking.
  const floor = RANK[e?.appraisal.appraised.standing ?? 'verified'] ?? 3;
  const alterations: readonly { readonly what: string; readonly make: () => Fixture }[] = [
    {
      what: 'the settlement memo names a different envelope (§4.3, T-P7-1)',
      make: () => {
        const g = clone(f);
        for (const [ref, s] of Object.entries(g.settlements)) {
          if (s !== null) g.settlements[ref] = { ...s, memo: `wishmail:${'0'.repeat(64)}` };
        }
        return g;
      },
    },
    {
      what: 'the chunk no longer rebuilds to its identifier (§7.4, T-P1-1)',
      make: () => {
        const g = clone(f);
        const rows = g.topics[LANE] ?? [];
        const at = rows.findIndex((x) => x.contents.includes('"data"'));
        if (at >= 0) {
          const m = rows[at] as TopicMessage;
          (g.topics as Record<string, TopicMessage[]>)[LANE] = rows.map((x, i) =>
            i === at ? { ...m, contents: m.contents.replace(/"data":"./, '"data":"Z') } : x,
          );
        }
        return g;
      },
    },
  ];
  for (const a of alterations) {
    const altered = await verify(readerOver(a.make()), { lane: LANE }, {});
    const entry = altered.bundle.correspondence[0];
    const standing = entry?.appraisal.appraised.standing;
    const rank = standing === undefined ? -1 : (RANK[standing] ?? 3);
    ok(
      `${a.what} — the standing drops or the envelope goes unread, never stays put (P-12)`,
      rank < floor || altered.bundle.correspondence.length !== 1,
    );
    ok('and the digest moves with the bytes', altered.bundle.digest !== DIGEST);
  }

  if (failures.length > 0) {
    console.error(`\ncheck:gzero2 FAILED — ${failures.length} of ${checked}\n`);
    for (const x of failures) console.error(`  ${x}`);
    process.exit(1);
  }
  console.log(
    `check:gzero2 PASS — ${checked} assertions over the FIRST correspondence this deployment produced under ` +
      'goose, appraised with NO NETWORK from conformance/fixtures/ (P-4): the recipient doorbell memo naming its ' +
      'own account, which is the 2026-09-11 ownerless-door defect asserted absent from the bytes the network ' +
      'kept; the lane birth read from the lane own memo down to the door that answered and the party that rang; ' +
      'two stamps settled in $POSTAGE under a memo naming this envelope and no other; a real HIP-423 schedule ' +
      'EXECUTED, its inner body paid by the sender operator so the recipient signed for her letter and was ' +
      'charged nothing (T-P16-2), and its receipt manifest at sequence 1 of her own topic at that instant to the ' +
      `nanosecond; the stranger digest ${DIGEST.slice(0, 8)}… reproduced from disk, twice, and again by a ` +
      'Verifier at another patch of 0.5 — from HEAD at specification 0.5.13, there being no tag it belongs to; ' +
      'and two alterations each refused.',
  );
  process.exit(0);
}

await main();
