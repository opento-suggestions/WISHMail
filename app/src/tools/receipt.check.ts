/**
 * The captured RECEIPT, appraised offline — and the alterations refused.
 *
 * `check:captured` reads checkpoint one's plain letter; this one reads the
 * correspondence checkpoint two left on the same lane: two envelopes, ten
 * chunks on the second, a HIP-423 schedule, and the receipt manifest B's own
 * signature published on B's own manifest topic. It appraises all of it **with
 * no network** (P-4) — schedule record included, which is a row of §11.2's
 * ingestion table that no fixture had ever carried.
 *
 * WHAT IT PROVES THAT NO OTHER COURT CAN. `check:letter` runs the receipt path
 * against a modelled ledger, which is consensus as a data structure and cannot
 * hold a real schedule record; `check:captured` holds real bytes but no
 * schedule. This holds the record HIP-423 actually produced — three signatures,
 * an `executed_timestamp`, a `transaction_body` of real protobuf — and asserts
 * that our decoder reads it, our recomposition matches it, and the alterations
 * that should break it do.
 *
 * Conformance: T-P1-7, T-P1-8, T-P3-1, T-P4-1, T-P12-2, T-P15-5, T-P16-2.
 */
import fs from 'node:fs';
import path from 'node:path';
import { repoRoot } from '../ops/env.js';
import { canonicalBytes, canonicalDigest } from '../core/canonical.js';
import { decodeScheduledSubmission } from '../core/schedulebody.js';
import { verify } from './verify.js';
import { keyMatchesPrefix } from './consensus.js';
import type { Reader, ScheduleRecord, Settlement, TopicInfo, TopicMessage } from './consensus.js';

const FIXTURE = path.join(repoRoot(), 'conformance', 'fixtures', 'checkpoint-two-receipt.json');

interface Fixture {
  readonly ledgerTag: string;
  readonly lane: string;
  readonly topics: Record<string, TopicMessage[]>;
  readonly topicInfo: Record<string, TopicInfo | null>;
  readonly accounts: Record<string, { memo: string | null; key: string | null }>;
  readonly settlements: Record<string, Settlement>;
  readonly schedules: Record<string, ScheduleRecord>;
  readonly bundleDigest: string;
  readonly correspondence: readonly {
    readonly envelope: { readonly aadHash: string; readonly chunkCount: number };
    readonly state: string;
    readonly requests: readonly { readonly scheduleId: string; readonly status: string }[];
    readonly appraisal: {
      readonly appraised: { readonly standing: string; readonly reasons: readonly string[] };
      readonly receipt: { readonly status: string; readonly reasons: readonly string[] };
    };
  }[];
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
    schedule: (scheduleId) => Promise.resolve(f.schedules[scheduleId] ?? null),
  };
}

function copy(f: Fixture): Fixture {
  return JSON.parse(JSON.stringify(f)) as Fixture;
}

interface Appraised {
  readonly state: string;
  readonly standing: string;
  readonly receipt: string;
  readonly receiptReasons: readonly string[];
}

/** The SECOND envelope on the lane — the one that carries the receipt. */
async function appraise(f: Fixture): Promise<Appraised> {
  const out = await verify(readerOver(f), { lane: f.lane }, {});
  const e = out.bundle.correspondence[1];
  if (e === undefined) return { state: 'none', standing: 'none', receipt: 'none', receiptReasons: [] };
  return {
    state: e.state,
    standing: e.appraisal.appraised.standing,
    receipt: e.appraisal.receipt.status,
    receiptReasons: e.appraisal.receipt.reasons,
  };
}

async function main(): Promise<void> {
  if (!fs.existsSync(FIXTURE)) {
    console.error(`check:receipt — no fixture at ${FIXTURE}. Capture one: npm run capture -- --lane 0.0.N --name checkpoint-two-receipt`);
    process.exit(2);
  }
  const pristine = JSON.parse(fs.readFileSync(FIXTURE, 'utf8')) as Fixture;
  const scheduleId = Object.keys(pristine.schedules)[0] as string;
  const record = pristine.schedules[scheduleId] as ScheduleRecord;

  // === What the network actually produced, asserted rather than assumed ======
  is('the capture carries exactly one schedule', Object.keys(pristine.schedules).length, 1);
  ok('which executed', record.executedTimestamp !== null);
  is('with waitForExpiry false, as §10.4 fixes it', record.waitForExpiry, false);
  ok('and an expiration 30 days out (§10.4, under SCHEDULE_MAX_LIFETIME)', record.expirationTime !== null);
  // The window is 30 days from the moment the SENDER composed the ScheduleCreate,
  // not from the consensus timestamp the network later assigned it — which is
  // the only clock a sender has, and which lands a second or two ahead. So this
  // asserts the window rather than the arithmetic: within a minute of 30 days.
  {
    const seconds = Number(record.expirationTime) - Number(record.consensusTimestamp);
    ok(
      `the acknowledgment window is 30 days (${seconds.toFixed(1)}s, against ${30 * 86_400})`,
      Math.abs(seconds - 30 * 86_400) < 60,
    );
  }

  // T-P16-2 at its source: the schedule's payer is not the recipient. Which
  // account IS the recipient is read out of the manifest the schedule carries,
  // exactly as `verify` reads it.
  const inner = decodeScheduledSubmission(Buffer.from(record.transactionBody, 'base64'));
  const manifest = JSON.parse(inner.message.toString('utf8')) as { meaning: { statement: string; uri: { topicId: string } } };
  const recipient = manifest.meaning.statement.split(' ')[0] as string;
  ok('the schedule’s payer is not the recipient (T-P16-2)', record.payer !== recipient);
  is('the inner submission writes to the recipient’s manifest topic (T-P1-8)', inner.topicId, manifest.meaning.uri.topicId);
  is('and carries no transport chunking (§7.4)', inner.chunked, false);

  // §11.4's signature check, on a real record: the recipient's key, read from
  // consensus, matches a prefix the record carries.
  const recipientKey = pristine.accounts[recipient]?.key ?? null;
  ok(
    'the recipient’s key is among the signatures on the record (§11.4)',
    record.signatures.some((s) => keyMatchesPrefix(recipientKey, s.publicKeyPrefix)),
  );
  // §G-22, as an assertion rather than a footnote. T-P1-8 asks for a record
  // showing "exactly the recipient's signature"; HIP-423 gives one that also
  // carries every transaction payer that touched the schedule — the inner
  // payer's from the ScheduleCreate, and the ScheduleSign's payer's. There is no
  // arrangement in which it shows one. Recorded here so the day the sketch is
  // amended, this assertion is what changes.
  ok(
    `the record carries MORE than the recipient’s signature — ${record.signatures.length} of them (§G-22)`,
    record.signatures.length > 1,
  );

  // === The pristine copy, offline ===========================================
  const base = await appraise(pristine);
  const expected = pristine.correspondence[1];
  is('the captured receipt appraises offline exactly as it did on the network', base.state, expected?.state);
  is('with the same receipt status', base.receipt, expected?.appraisal.receipt.status);
  is('and the envelope is ACKED (§8.3) — the first state after SETTLED', base.state, 'ACKED');
  is('and the receipt is acked, with no reason beside it (§11.4)', base.receipt, 'acked');
  is('with no reasons', [...base.receiptReasons], []);
  is('while its STANDING is untouched by the receipt (§11.5)', base.standing, 'unverified');

  const out = await verify(readerOver(pristine), { lane: pristine.lane }, {});
  is('the bundle digest is the one the network produced (P-3)', out.bundle.digest, pristine.bundleDigest);
  const again = await verify(readerOver(pristine), { lane: pristine.lane }, {});
  is('and two Verifiers over the same bytes agree (T-P3-1)', again.bundle.digest, out.bundle.digest);

  // === The alterations a receipt owes a refusal for =========================
  const alterations: readonly { readonly what: string; readonly make: () => Fixture; readonly want: string }[] = [
    {
      // §10.4: "a receipt manifest submitted by any other path is not a
      // receipt". A schedule consensus no longer holds is one that expired
      // unsigned and was deleted by the network — and §11.4 has one word for
      // that and forbids three others (T-P15-5).
      what: 'the schedule is gone, as the network leaves one that expired unsigned (T-P15-5)',
      want: 'unclaimed',
      make: () => {
        const g = copy(pristine);
        delete (g.schedules as Record<string, unknown>)[scheduleId];
        return g;
      },
    },
    {
      what: 'the schedule never executed — requested, witnessed, not signed for (T-P15-5)',
      want: 'unclaimed',
      make: () => {
        const g = copy(pristine);
        (g.schedules[scheduleId] as unknown as { executedTimestamp: string | null }).executedTimestamp = null;
        return g;
      },
    },
    {
      what: 'the execution PRECEDES the nth chunk (§8.3, T-P1-7)',
      want: 'invalid',
      make: () => {
        const g = copy(pristine);
        (g.schedules[scheduleId] as unknown as { executedTimestamp: string | null }).executedTimestamp = '1000000000.000000000';
        return g;
      },
    },
    {
      what: 'the recipient’s signature is not on the record (§11.4, T-P1-8)',
      want: 'invalid',
      make: () => {
        const g = copy(pristine);
        (g.schedules[scheduleId] as unknown as { signatures: unknown[] }).signatures = record.signatures.filter(
          (s) => !keyMatchesPrefix(recipientKey, s.publicKeyPrefix),
        );
        return g;
      },
    },
    {
      what: 'the schedule names the RECIPIENT as the payer of its own execution (T-P16-2)',
      want: 'invalid',
      make: () => {
        const g = copy(pristine);
        (g.schedules[scheduleId] as unknown as { payer: string }).payer = recipient;
        return g;
      },
    },
    {
      what: 'the receipt manifest is not on the topic the execution wrote to (T-P1-8)',
      want: 'invalid',
      make: () => {
        const g = copy(pristine);
        g.topics[inner.topicId] = [];
        return g;
      },
    },
    {
      // The whole point of recomposing rather than reading: a manifest that
      // names a different epoch has a different hash, and nothing this Verifier
      // computes matches it.
      // THE ALTERATION THE RECOMPOSITION EXISTS FOR. The manifest is left
      // internally perfect — its `inputs.digest` is changed and its `hash` is
      // recomputed over the change, so it validates, self-recomputes, and is
      // exactly as well-formed as the real one. What it no longer is, is the
      // manifest THIS envelope, THIS postmark and THIS epoch compose. A reader
      // that checked the manifest against itself would pass it; only
      // recomposition from the lane refuses it.
      what: 'a perfectly-formed receipt that names inputs this envelope did not have (T-P1-8)',
      want: 'invalid',
      make: () => {
        const g = copy(pristine);
        const body = JSON.parse(inner.message.toString('utf8')) as Record<string, unknown>;
        const inputs = body['inputs'] as Record<string, unknown>;
        inputs['digest'] = 'e'.repeat(64);
        delete body['hash'];
        body['hash'] = canonicalDigest(body);
        const altered = Buffer.from(canonicalBytes(body));
        if (altered.length !== inner.message.length) {
          throw new Error(`the altered manifest is ${altered.length} bytes and the original is ${inner.message.length}`);
        }
        const bytes = Buffer.from(record.transactionBody, 'base64');
        const at = bytes.indexOf(inner.message);
        if (at < 0) throw new Error('the fixture’s schedule body does not contain its own message');
        const rebuilt = Buffer.concat([bytes.subarray(0, at), altered, bytes.subarray(at + inner.message.length)]);
        (g.schedules[scheduleId] as unknown as { transactionBody: string }).transactionBody = rebuilt.toString('base64');
        // The topic must show what the execution published, or the alteration
        // would be caught by the wrong check.
        g.topics[inner.topicId] = (g.topics[inner.topicId] ?? []).map((m) => ({
          ...m,
          contents: altered.toString('utf8'),
        }));
        return g;
      },
    },
  ];

  for (const alteration of alterations) {
    const r = await appraise(alteration.make());
    is(`${alteration.what} — receipt.status`, r.receipt, alteration.want);
    // §11.5: "the receipt does not lower it — an invalid receipt is a fact about
    // the receipt — and nothing raises it." Not one of these may move the
    // envelope's standing.
    is(`  …and the envelope’s standing is unmoved (§11.5)`, r.standing, base.standing);
    ok(
      `  …and the envelope is not ACKED unless it was acknowledged (§8.3)`,
      alteration.want === 'acked' ? r.state === 'ACKED' : r.state === 'SETTLED',
    );
  }

  // P-12: none of the above is a tool failure. Every one came back as an
  // appraisal — a status with reasons — and `verify` never threw.
  ok('and not one of them was a tool failure: every refusal is an appraisal (P-12)', true);

  if (failures.length > 0) {
    console.error(`\ncheck:receipt FAILED — ${failures.length} of ${passed + failures.length} assertions:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(
    `\ncheck:receipt PASS — ${passed} assertions over a RETURN RECEIPT that is on hedera:testnet, appraised with NO ` +
      `NETWORK from conformance/fixtures/ (P-4): a real HIP-423 schedule record, its protobuf body decoded, its ` +
      `manifest recomposed from the envelope, the postmark and the epoch, the recipient's key matched to a signature ` +
      `prefix, the envelope ACKED, the same bundle digest the network produced, and seven alterations each driving ` +
      `the receipt to unclaimed or invalid without moving the envelope's standing by one rung.`,
  );
}

main().catch((e: unknown) => {
  console.error('\ncheck:receipt STOPPED\n' + (e instanceof Error ? e.message : String(e)));
  process.exitCode = 3;
});
