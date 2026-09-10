/**
 * `npm run check:reply` — the letter that came back, appraised with no network,
 * and the binding walk run against the bytes the network actually produced.
 *
 * WHY THIS FIXTURE EXISTS BESIDE THE OTHER TWO. `checkpoint-one-letter.json` and
 * `checkpoint-two-receipt.json` each hold one direction of a correspondence:
 * A2 wrote, B read. This one holds a lane with letters going BOTH ways — two
 * from A2 and one from B, on the same lane, with no second lane and no second
 * ring anywhere — which is what D-171 made possible and what nothing offline
 * could have shown before.
 *
 * AND IT IS THE FIRST FIXTURE THAT CARRIES THE LANE'S BIRTH DOORBELL. §11.4
 * reads a lane's provenance from the lane's own memo down to the doorbell that
 * answered, and neither earlier capture took that topic — harmless only because
 * a release claiming no profile never reaches the check. `capture` follows the
 * memo now, so `laneBirth` can be run here on real consensus bytes rather than
 * on a model of them. A model agreeing with itself is the failure mode this
 * whole project keeps finding.
 *
 * Conformance (reference side): T-P1-6, T-P3-1, T-P4-1, T-P7-1, T-P10-2,
 * T-P12-4, T-P17-2.
 */
import fs from 'node:fs';
import path from 'node:path';
import { repoRoot } from '../ops/env.js';
import { canonicalBytes, sha256hex } from '../core/canonical.js';
import { laneBirth, verify } from './verify.js';
import type { Reader, ScheduleRecord, Settlement, TopicInfo, TopicMessage } from './consensus.js';

const FIXTURE = path.join(repoRoot(), 'conformance', 'fixtures', 'checkpoint-two-reply.json');

/** The spec this correspondence was reconciled under, on the day (§G-25). */
const SPEC_WHEN_CAPTURED = '0.5.11';

const A2 = '0.0.10462700';
const B = '0.0.10452127';
const LANE = '0.0.10464056';
const B_DOORBELL = '0.0.10452149';

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

async function main(): Promise<void> {
  if (!fs.existsSync(FIXTURE)) {
    console.error(`check:reply — no fixture at ${FIXTURE}. Capture one: npm run capture -- --lane ${LANE} --name checkpoint-two-reply`);
    process.exit(2);
  }
  const f = JSON.parse(fs.readFileSync(FIXTURE, 'utf8')) as Fixture;
  const reader = readerOver(f);

  // === The birth of the lane, from the lane (§11.4, D-171) ==================
  //
  // Nothing below is told who the parties are. The walk is: the lane's memo
  // names a doorbell, that doorbell's memo names its owner, and the answer on
  // it names the other party.
  ok('the fixture carries the lane birth doorbell, which no earlier capture did', f.topics[B_DOORBELL] !== undefined);
  const birth = await laneBirth(reader, LANE);
  ok('the lane birth is readable from the lane alone', birth !== null);
  is('the door it was born at is B own', birth?.doorbell, B_DOORBELL);
  is('the door owner is B, from that door own memo', birth?.owner, B);
  is('and the party it names is A2, who rang', birth?.requester, A2);

  // §7.1 as D-171 states it: the key list is the other half of the test.
  const laneInfo = await reader.topic(LANE);
  const keys = [...(laneInfo?.submitKeys ?? [])].sort();
  const want = [await reader.accountKey(A2), await reader.accountKey(B)].filter((k): k is string => k !== null).sort();
  is('the lane submit key is a threshold of exactly the two parties keys (T-P17-2)', keys, want);
  is('and it carries no custom fee (§7.1, T-P11-3)', (laneInfo?.customFees ?? []).length, 0);

  // The memo is HCS-10's own, at the pin — this is the field the walk turns on,
  // and the offline model wrote a fiction in its place until 2026-09-10.
  is('the lane wears HCS-10 connection-topic memo naming that doorbell', laneInfo?.memo, `hcs-10:1:60:2:${B_DOORBELL}:1`);

  // === The correspondence, both ways, on one lane ===========================
  const out = await verify(reader, { lane: f.lane }, {});
  const c = out.bundle.correspondence;
  is('three envelopes on the lane', c.length, 3);
  is('and all three on the SAME lane — no second lane was ever opened', [...new Set(c.map((e) => e.envelope.lane))], [LANE]);

  const senders = c.map((e) => e.settlement?.from);
  is('the first two were affixed by A2 and the third by B — a correspondence, not a broadcast', senders, [A2, A2, B]);

  const reply = c[2];
  ok('the reply is reconciled', reply !== undefined);
  is('the reply state is SETTLED (§8.3 — no receipt was requested)', reply?.state, 'SETTLED');
  is('its standing is unverified', reply?.appraisal.appraised.standing, 'unverified');
  is('for the one reason a claimless release yields (§9.6, §11.4)', reply?.appraisal.appraised.reasons, ['T-P12-4']);
  is('no receipt was requested and none was found', reply?.appraisal.receipt.status, 'none');
  is('its declared trust class is reported beside the standing, never folded into it (P-12)', reply?.appraisal.declared.trustClass, 'math');
  is('it is one chunk', reply?.chunks.length, 1);
  is('its postage is one stamp', reply?.settlement?.amount, 1);

  // T-P7-1: the settlement precedes chunk 0, and names this envelope and no other.
  const chunkZeroAt = reply?.chunks[0]?.consensusTimestamp ?? '';
  const settledAt = reply?.settlement?.consensusTimestamp ?? '';
  ok('and it was affixed BEFORE the letter was posted (T-P7-1)', settledAt !== '' && settledAt < chunkZeroAt);
  is('under the memo that names this envelope and no other (§4.3)', reply?.settlement?.memo, `wishmail:${reply?.envelope.aadHash ?? ''}`);

  // §7.2's fourth weld, read off the consensus bytes rather than off the bundle:
  // the chunk's `operator_id` names the account that affixed the postage. The
  // bundle carries postmarks, which is the right thing for it to carry; this
  // wants the operation itself.
  const replySeq = reply?.chunks[0]?.sequenceNumber ?? -1;
  const onLane = (f.topics[LANE] ?? []).find((m) => m.sequenceNumber === replySeq);
  const op = onLane === undefined ? null : (JSON.parse(onLane.contents) as Record<string, unknown>);
  is('the chunk is an HCS-10 message operation', op?.['op'], 'message');
  is('whose operator_id names B door and B account (§7.2, T-P1-6)', op?.['operator_id'], `${B_DOORBELL}@${B}`);

  // The letter before it is still ACKED, and the reply did not disturb it.
  is('checkpoint two envelope is still ACKED, and the reply changed nothing about it', c[1]?.state, 'ACKED');
  is('its receipt is still acked', c[1]?.appraisal.receipt.status, 'acked');

  // === P-3, and §G-25 stated rather than hidden =============================
  //
  // The digest is a function of the release's patch version as well as of the
  // evidence (§G-25, OPEN). So this asserts what P-3 actually claims: put back
  // the spec string this fixture was reconciled under and the digest is the one
  // the network produced, EXACTLY — every other byte unchanged.
  const { observations: _observations, digest: _digest, ...evidence } = out.bundle;
  const asCaptured = sha256hex(canonicalBytes({ ...evidence, spec: SPEC_WHEN_CAPTURED }));
  is('the bundle digest is the one the network produced (P-3)', asCaptured, f.bundleDigest);

  const again = await verify(reader, { lane: f.lane }, {});
  is('and two Verifiers reading the same file agree (§11.7)', again.bundle.digest, out.bundle.digest);

  // === The absence that is the whole assertion ==============================
  //
  // A2's doorbell is not in this fixture because nothing was ever posted to it;
  // B's holds exactly the two messages checkpoint one put there. A reply rang
  // nothing, and on consensus that is a count.
  is('B doorbell holds the two messages checkpoint one left, and no third', (f.topics[B_DOORBELL] ?? []).length, 2);
  const ops = (f.topics[B_DOORBELL] ?? []).map((m) => (JSON.parse(m.contents) as { op?: string }).op);
  is('one ring and one answer, both from checkpoint one', ops, ['connection_request', 'connection_created']);

  if (failures.length > 0) {
    console.error(`\ncheck:reply FAILED — ${failures.length} of ${checked} assertions:`);
    for (const f2 of failures) console.error(`  ${f2}`);
    process.exit(1);
  }
  console.log(
    `\ncheck:reply PASS — ${checked} assertions over a correspondence that went BOTH WAYS on one lane on ` +
      'hedera:testnet, appraised with NO NETWORK from conformance/fixtures/ (P-4): the lane birth read from the ' +
      'lane own memo down to the door that answered and the party that rang, its submit key the threshold of ' +
      'exactly those two, three envelopes on one lane affixed by A2 twice and by B once, the reply SETTLED and ' +
      'unverified with the receipt of the letter before it still acked, the same bundle digest the network ' +
      'produced, and B doorbell holding the two messages checkpoint one left and no third — because a reply ' +
      'rings nothing, and on consensus that is a count.',
  );
}

main().catch((e: unknown) => {
  console.error('\ncheck:reply STOPPED\n' + (e instanceof Error ? e.message : String(e)));
  process.exitCode = 3;
});
