/**
 * Capture one correspondence from consensus into `conformance/fixtures/`.
 *
 * WHY FIXTURES ARE CAPTURED AND NOT CONSTRUCTED. P-4 requires the VERIFIER
 * suite to run "with nothing configured" — no key, no credit, no network — and
 * a test that reached a mirror node would be a test of the mirror node. So the
 * bytes are taken from consensus once, written down, and every later run reads
 * the file. What is captured is exactly what a stranger would have read: the
 * lane's messages, the settlement, the postmarks, the manifest, and the
 * resolution proof, each as the mirror returned it.
 *
 * NOTHING HERE IS A KEY and nothing here is private. Every byte is on a public
 * topic already; the file is a convenience for a reader who does not want to
 * re-derive it, and `verify` reaches the same answer from either.
 *
 *   npm run capture -- --lane 0.0.N --name <fixture name> [--mirror <url>]
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { repoRoot } from '../src/ops/env.js';
import { decodeScheduledSubmission } from '../src/core/schedulebody.js';
import { verify } from '../src/tools/verify.js';
import { liveReader } from './live.js';
import { connectionTopicMemoOf } from '../src/ops/hcs10.js';

const argv = process.argv.slice(2);
const flag = (n: string): string | undefined => {
  const at = argv.indexOf(`--${n}`);
  return at >= 0 ? argv[at + 1] : undefined;
};

const LEDGER = 'hedera:testnet';
const DEFAULT_MIRROR = 'https://testnet.mirrornode.hedera.com/api/v1';

async function main(): Promise<void> {
  const lane = flag('lane');
  const name = flag('name');
  if (lane === undefined || name === undefined) {
    console.error('usage: npm run capture -- --lane 0.0.N --name <fixture name>');
    process.exit(2);
  }
  const mirrorUrl = flag('mirror') ?? DEFAULT_MIRROR;
  const reader = liveReader(mirrorUrl, LEDGER);

  const out = await verify(reader, { lane }, { narrative: true, mirror: mirrorUrl });
  const entry = out.bundle.correspondence[0];
  if (entry === undefined) throw new Error(`no envelope on lane ${lane}; nothing to capture`);
  const all = out.bundle.correspondence;

  // Every topic the bundle names, as the mirror returned it. A Verifier reading
  // these files sees what a Verifier reading the network saw.
  const topics: Record<string, unknown> = {};
  for (const t of out.bundle.topics) {
    topics[t] = (await reader.messages(t)).map((m) => ({
      topicId: m.topicId,
      sequenceNumber: m.sequenceNumber,
      consensusTimestamp: m.consensusTimestamp,
      runningHash: m.runningHash,
      runningHashVersion: m.runningHashVersion,
      contents: m.contents,
      payer: m.payer,
    }));
  }

  // A Reader is more than messages: §11.4 reads a topic's own record for §7.1's
  // threshold lane, a settlement by its reference, an account's HCS-11 memo to
  // reach a declaration, and an account's key to match a signature. A fixture
  // that captured only messages would send the suite back to the network for
  // the rest, which is exactly what P-4 forbids.
  // THE SCHEMA REGISTRY IS PART OF THE EVIDENCE, and leaving it out was a
  // defect this fixture's own offline court caught. §11.5's ladder has a row for
  // `schemaRef resolves` (T-P9-3), and a chunk's `s` is an HCS-13 locator —
  // `hcs://13/<registry topic>#<sequence>` — which dereferences to a registry
  // entry naming an HCS-1 file topic. A capture that took only the lane and the
  // manifest appraised the SAME letter one rung LOWER offline than on the
  // network, purely because the locator had nowhere to resolve to.
  const schemaTopics = new Set<string>();
  for (const list of Object.values(topics)) {
    for (const m of list as { contents: string }[]) {
      const ref = /hcs:[/][/]13[/]([0-9.]+)#/.exec(m.contents);
      if (ref?.[1] !== undefined) schemaTopics.add(ref[1]);
    }
  }
  const grab = async (t: string): Promise<void> => {
    if (topics[t] !== undefined) return;
    topics[t] = (await reader.messages(t)).map((m) => ({
      topicId: m.topicId,
      sequenceNumber: m.sequenceNumber,
      consensusTimestamp: m.consensusTimestamp,
      runningHash: m.runningHash,
      runningHashVersion: m.runningHashVersion,
      contents: m.contents,
      payer: m.payer,
    }));
  };
  // THE LANE'S BIRTH DOORBELL, which §11.4 reads the binding from (D-171).
  //
  // A Verifier follows the lane's own memo to the doorbell it was born on, that
  // doorbell's memo to its owner, and the `connection_created` there to the
  // other party. A fixture without that doorbell's messages is a fixture that
  // cannot try the binding at all — which the checkpoint-one and checkpoint-two
  // captures could not, and did not notice, because a release claiming no
  // profile never reaches the check.
  const laneInfo = await reader.topic(lane);
  const bornAt = laneInfo === null ? null : connectionTopicMemoOf(laneInfo.memo);
  if (bornAt !== null) await grab(bornAt.doorbell);

  for (const t of schemaTopics) {
    await grab(t);
    // The registry entry names the HCS-1 file topic the schema itself lives on.
    for (const m of (topics[t] ?? []) as { contents: string }[]) {
      const file = /"t_id"[^"]*"([0-9.]+)"/.exec(m.contents);
      if (file?.[1] !== undefined) await grab(file[1]);
    }
  }

  // THE SCHEDULES, and the topics an executed one wrote to.
  //
  // §11.2's ingestion table reaches "the schedule and its record" from the
  // lane's `transaction` operation, and the receipt manifest from "the executed
  // submission's topic". A capture that took the lane and left those behind
  // would send the suite back to the network for exactly the evidence a receipt
  // rests on — which is what P-4 forbids, and which is the same defect the
  // schemaRef gap was: a fixture that appraises the SAME correspondence lower
  // offline than on the network, purely because a locator had nowhere to go.
  const schedules: Record<string, unknown> = {};
  for (const e of all) {
    for (const request of e.requests) {
      if (request.scheduleId === '') continue;
      const record = await reader.schedule(request.scheduleId);
      if (record === null) continue;
      schedules[request.scheduleId] = record;
      try {
        await grab(decodeScheduledSubmission(Buffer.from(record.transactionBody, 'base64')).topicId);
      } catch {
        // A schedule carrying something other than a submission is not a
        // receipt, and `verify` already says so. Nothing to capture.
      }
    }
  }

  const topicInfo: Record<string, unknown> = {};
  for (const t of Object.keys(topics)) topicInfo[t] = await reader.topic(t);

  const accounts = new Set<string>();
  for (const e of all) {
    if (e.settlement === undefined) continue;
    accounts.add(e.settlement.from);
    accounts.add(e.settlement.to);
  }
  // THE RECIPIENT'S ACCOUNT, WHICH ONLY A RECEIPT NAMES.
  //
  // §11.4 matches a schedule's signature prefix against "that account's key
  // read from consensus", and offline that key has to be in the fixture. The
  // account is not on the lane: a chunk's `operator_id` names the SENDER (§7.2),
  // and `connection_created` is on a doorbell this capture only reaches when a
  // profile was claimed and replayed. What does name it is the receipt manifest
  // itself — §10.4 puts the recipient's account in the meaning, which is why it
  // is there. So it is read out of each executed schedule's own body.
  for (const record of Object.values(schedules) as { transactionBody: string }[]) {
    try {
      const inner = decodeScheduledSubmission(Buffer.from(record.transactionBody, 'base64'));
      const manifest = JSON.parse(inner.message.toString('utf8')) as { meaning?: { statement?: string } };
      const named = (manifest.meaning?.statement ?? '').split(' ')[0] ?? '';
      if (/^[0-9]+.[0-9]+.[0-9]+$/.test(named)) accounts.add(named);
    } catch {
      // Not a receipt. `verify` says so, and there is nothing here to capture.
    }
  }
  for (const list of Object.values(topics)) {
    for (const m of list as { contents: string }[]) {
      try {
        const op = JSON.parse(m.contents) as Record<string, unknown>;
        for (const k of ['connected_account_id', 'operator_id']) {
          const v = op[k];
          if (typeof v === 'string') accounts.add(v.includes('@') ? (v.split('@')[1] as string) : v);
        }
      } catch {
        // Not every message on a lane is JSON, and that is not this loop's business.
      }
    }
  }
  const accountFacts: Record<string, unknown> = {};
  for (const a of accounts) {
    accountFacts[a] = { memo: await reader.accountMemo(a), key: await reader.accountKey(a) };
  }

  const settlements: Record<string, unknown> = {};
  for (const e of all) {
    if (e.settlement !== undefined) settlements[e.settlement.txRef] = e.settlement;
  }


  const fixture = {
    _readme:
      'A correspondence captured from hedera:testnet, byte for byte as a mirror node returned it. Nothing here ' +
      'is a key and nothing here is private: every byte is on a public topic. It exists so the suite can run ' +
      'with no network (P-4) — a test that reached a mirror node would be a test of the mirror node. The ' +
      'appraisal below is what THIS release reached; a release claiming a profile reaches a different one, and ' +
      'the difference is the point of §11.4.',
    ledgerTag: LEDGER,
    capturedAt: new Date().toISOString(),
    lane,
    topics,
    topicInfo,
    accounts: accountFacts,
    settlements,
    schedules,
    settlement: entry.settlement ?? null,
    envelope: entry.envelope,
    chunks: entry.chunks,
    appraisal: entry.appraisal,
    // Every envelope on the lane, so a fixture holding a correspondence rather
    // than a letter can be appraised as one.
    correspondence: all,
    bundleDigest: out.bundle.digest,
    narrative: out.narrative ?? null,
  };

  const dir = path.join(repoRoot(), 'conformance', 'fixtures');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify(fixture, null, 2) + '\n');

  console.log('');
  console.log(`  captured    ${file}`);
  console.log(`  lane        ${lane}`);
  console.log(`  topics      ${Object.keys(topics).join(', ')}`);
  console.log(`  schedules   ${Object.keys(schedules).join(', ') || '(none)'}`);
  console.log(`  envelopes   ${all.length}`);
  console.log(`  envelope    ${entry.envelope.aadHash}`);
  console.log(`  appraised   ${entry.appraisal.appraised.standing} (${entry.appraisal.appraised.reasons.join(', ') || 'no reasons'})`);
  console.log(`  digest      ${out.bundle.digest}`);
  console.log('');
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((e: unknown) => {
    console.error('\nSTOPPED\n' + (e instanceof Error ? e.message : String(e)));
    process.exitCode = 3;
  });
}
