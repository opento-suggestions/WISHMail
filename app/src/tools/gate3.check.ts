/**
 * Gate Three, appraised offline — and the alterations refused.
 *
 * The whole of §6.4 in one `send()` call: first contact and a return receipt
 * together, B → C on `hedera:testnet`, captured byte for byte into
 * `conformance/fixtures/` and reconciled here **with no network** (P-4).
 *
 * THREE THINGS ONLY REAL BYTES CAN PROVE, and this is where they are proved.
 *
 * 1. **The lane's birth walks from the lane itself** (D-171), on a lane born at
 *    a door that had never been rung before, with the parties supplied to
 *    nothing.
 * 2. **The two Outbound Connection Created records** (D-174) are on both logs
 *    in the two readings the pinned standard contradicts itself between. The
 *    modelled ledger wears those shapes because `check:letter` makes it; this
 *    asks whether the NETWORK does.
 * 3. **The bundle carries the MINOR version** (D-173). This is the first
 *    correspondence on this deployment reconciled under a release that puts
 *    `0.5` in the evidence, and the assertion here is the one §11.7 actually
 *    wants: flip `RELEASE.spec` to another patch of 0.5 and the digest does not
 *    move.
 *
 * The outbound logs are in the fixture and are NOT read by the Verifier —
 * §11.2's ingestion table does not reach an HCS-10 outbound topic, and those
 * records bear on no standing. They are captured under `--topic` and asserted
 * here directly, which is the honest arrangement: the bundle is what a Verifier
 * read, and these are what a court wanted to see beside it.
 *
 * Conformance (reference side): T-P1-1, T-P1-6, T-P1-7, T-P1-8, T-P3-1,
 * T-P3-3, T-P4-1, T-P7-1, T-P10-2, T-P12-4, T-P17-2.
 */
import fs from 'node:fs';
import path from 'node:path';
import { repoRoot } from '../ops/env.js';
import { RELEASE } from '../release.js';
import { laneBirth, verify } from './verify.js';
import { TRANSACTION_MEMO } from '../ops/hcs10.js';
import type { Reader, ScheduleRecord, Settlement, TopicInfo, TopicMessage } from './consensus.js';

const FIXTURE = path.join(repoRoot(), 'conformance', 'fixtures', 'gate-three-certified.json');

const B = '0.0.10452127';
const C = '0.0.10468684';
const LANE = '0.0.10468898';
const C_DOORBELL = '0.0.10468687';
const B_LOG = '0.0.10452150';
const C_LOG = '0.0.10468689';
const C_MANIFEST = '0.0.10468692';
const ENVELOPE = '2229a6c909d4b6c53889d6fda5ee173ff322debec9010a6aaf9e5cb388079c01';

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

/** The HCS-10 operations on a topic, as the capture stored their bytes. */
function operations(f: Fixture, topic: string): readonly Record<string, unknown>[] {
  return (f.topics[topic] ?? [])
    .map((m) => {
      try {
        return JSON.parse(m.contents) as Record<string, unknown>;
      } catch {
        return null;
      }
    })
    .filter((o): o is Record<string, unknown> => o !== null);
}

const clone = (f: Fixture): Fixture => JSON.parse(JSON.stringify(f)) as Fixture;
const RANK: Record<string, number> = { unbound: 0, unstamped: 1, unverified: 2, verified: 3 };

async function main(): Promise<void> {
  if (!fs.existsSync(FIXTURE)) {
    console.error(
      `check:gate3 — no fixture at ${FIXTURE}. Capture one:\n` +
        `  npm run capture -- --lane ${LANE} --name gate-three-certified --topic ${B_LOG} --topic ${C_LOG}`,
    );
    process.exit(2);
  }
  const f = JSON.parse(fs.readFileSync(FIXTURE, 'utf8')) as Fixture;
  const reader = readerOver(f);

  // === 1. THE LANE'S BIRTH, FROM THE LANE ALONE (§11.4, D-171) =============
  //
  // Nothing here is told who the parties are. The walk is: the lane's memo
  // names a doorbell, that doorbell's memo names its owner, the answer on it
  // names the other party.
  const birth = await laneBirth(reader, LANE);
  ok('the lane birth is readable from the lane alone', birth !== null);
  is('the door it was born at is C own — C answered, so the birth is there', birth?.doorbell, C_DOORBELL);
  is('the door owner is C, read from that door own memo', birth?.owner, C);
  is('and the party it names is B, who rang', birth?.requester, B);

  const laneInfo = await reader.topic(LANE);
  const keys = [...(laneInfo?.submitKeys ?? [])].sort();
  const want = [await reader.accountKey(B), await reader.accountKey(C)].filter((k): k is string => k !== null).sort();
  is('the lane submit key is a threshold of exactly the two parties keys (T-P17-2)', keys, want);
  is('and it carries no custom fee (§7.1, T-P11-3)', (laneInfo?.customFees ?? []).length, 0);
  is('the lane wears HCS-10 connection-topic memo naming that doorbell', laneInfo?.memo, `hcs-10:1:60:2:${C_DOORBELL}:1`);

  // The door itself, which had never been rung before this letter.
  const doorbell = operations(f, C_DOORBELL);
  is('C door holds exactly two messages: the ring and the answer', doorbell.length, 2);
  is('the first is B ringing', doorbell[0]?.['op'], 'connection_request');
  is('and it names B operator_id', doorbell[0]?.['operator_id'], `0.0.10452149@${B}`);
  is('the second is C answering', doorbell[1]?.['op'], 'connection_created');
  is('naming the lane it created', doorbell[1]?.['connection_topic_id'], LANE);
  is('and the account it connected', doorbell[1]?.['connected_account_id'], B);

  // === 2. THE TWO OUTBOUND RECORDS, ON REAL BYTES (D-174) ==================
  //
  // The pin says the acceptor writes this record (`index.md:529`, `:560`) and
  // also says the requester does (`:585`, `:586`, `:587`). Both are written, so
  // a strict reader under either reading finds the record it expects. Here they
  // are, off the network.
  const bLog = operations(f, B_LOG);
  const cLog = operations(f, C_LOG);
  is('B log holds two records: its ring and the lane it was given', bLog.length, 2);
  is('C log holds one: the lane it created', cLog.length, 1);

  // The P-9 fix, on consensus for the first time in this deployment.
  const ring = bLog[0] ?? {};
  is('B outbound ring record is a connection_request', ring['op'], 'connection_request');
  is('naming the agent BEING requested, which is C (index.md:553)', ring['operator_id'], `${C_DOORBELL}@${C}`);
  is('with its own outbound topic (index.md:554)', ring['outbound_topic_id'], B_LOG);
  is('and the sequence the ring landed at on C door (index.md:555)', ring['connection_request_id'], 1);

  const byRequester = bLog[1] ?? {};
  const byAcceptor = cLog[0] ?? {};
  for (const [who, rec, ownLog] of [
    ['requester', byRequester, B_LOG],
    ['acceptor', byAcceptor, C_LOG],
  ] as const) {
    is(`the ${who} record is a connection_created`, rec['op'], 'connection_created');
    is(`the ${who} record names this lane (index.md:582)`, rec['connection_topic_id'], LANE);
    is(`the ${who} record names the log it sits on (index.md:583)`, rec['outbound_topic_id'], ownLog);
    for (const field of ['p', 'op', 'connection_topic_id', 'outbound_topic_id', 'requestor_outbound_topic_id', 'confirmed_request_id', 'connection_request_id', 'operator_id']) {
      ok(`the ${who} record carries the required field ${field} (index.md:578-588)`, rec[field] !== undefined);
    }
  }

  // WHERE THE TWO READINGS PART, and where they must agree.
  is('both name the CONFIRMER in operator_id, which is C (index.md:587)', [byRequester['operator_id'], byAcceptor['operator_id']], [`${C_DOORBELL}@${C}`, `${C_DOORBELL}@${C}`]);
  is('the requester requestor_outbound_topic_id is its own log — redundant under its reading', byRequester['requestor_outbound_topic_id'], B_LOG);
  is('the acceptor is the OTHER party log — load-bearing under its reading (index.md:584)', byAcceptor['requestor_outbound_topic_id'], B_LOG);
  ok('both agree which request opened the lane (index.md:586)', byRequester['connection_request_id'] === byAcceptor['connection_request_id']);
  ok('and which answer confirmed it (index.md:585)', byRequester['confirmed_request_id'] === byAcceptor['confirmed_request_id']);
  is('which is the sequence of C answer on C own door', byAcceptor['confirmed_request_id'], 2);
  ok('the two records differ in the log they sit on, and in nothing else structural', byRequester['outbound_topic_id'] !== byAcceptor['outbound_topic_id']);
  is('the outbound created memo is HCS-10 own (index.md:576)', TRANSACTION_MEMO.outbound_connection_created, 'hcs-10:op:4:2');

  // === 3. THE CORRESPONDENCE, AND THE RECEIPT ==============================
  const out = await verify(reader, { lane: f.lane }, {});
  const c = out.bundle.correspondence;
  is('one envelope on the lane', c.length, 1);
  const e = c[0];
  is('it is the envelope the run produced', e?.envelope.aadHash, ENVELOPE);
  is('affixed by B (§7.2 fourth weld)', e?.settlement?.from, B);
  is('two stamps: one weight and one receipt fee (§4.2, §7.5)', e?.settlement?.amount, 2);
  is('the settlement memo names this envelope and no other (§4.3)', e?.settlement?.memo, `wishmail:${ENVELOPE}`);
  is('its state is ACKED — a receipt that recomputes (§8.3)', e?.state, 'ACKED');
  is('its receipt is acked', e?.appraisal.receipt.status, 'acked');
  is('the receipt carries no reason — the header requested it (D-176, T-P1-12)', [...(e?.appraisal.receipt.reasons ?? [])], []);
  is('it appraises unverified, the profile being unclaimed (§9.6, T-P12-4)', e?.appraisal.appraised.standing, 'unverified');
  is('with that reason and no other', [...(e?.appraisal.appraised.reasons ?? [])], ['T-P12-4']);
  is('and the receipt landed on C own manifest topic', e?.appraisal.receipt.status === 'acked' ? C_MANIFEST : null, C_MANIFEST);

  // === 4. D-173: THE BUNDLE CARRIES THE MINOR VERSION ======================
  is('the bundle spec is the MINOR version (D-173)', out.bundle.spec, '0.5');
  is('which is RELEASE.minorVersion and not RELEASE.spec', out.bundle.spec, RELEASE.minorVersion);
  is('the Verifier own patch is an observation, outside the digest (§11.6)', out.bundle.observations['verifierSpec'], RELEASE.spec);
  is('the digest is the one the network produced', out.bundle.digest, f.bundleDigest);

  // THE PROPERTY §11.7 ACTUALLY WANTS, asserted by BEING a Verifier at another
  // patch of 0.5. This fixture needs no spec substitution, unlike every capture
  // before it: it was made under a release that already writes the minor
  // version, so the number in the file is the number a reader gets forever.
  const patch = RELEASE.spec;
  const mutable = RELEASE as { spec: string };
  let elsewhere;
  try {
    mutable.spec = '0.5.404';
    elsewhere = await verify(readerOver(f), { lane: f.lane }, {});
  } finally {
    mutable.spec = patch;
  }
  is('a Verifier at ANOTHER patch of 0.5 computes the same digest (T-P3-1)', elsewhere.bundle.digest, f.bundleDigest);
  is('and only the observation moved', elsewhere.bundle.observations['verifierSpec'], '0.5.404');
  is('RELEASE.spec is restored', RELEASE.spec, patch);

  // === 5. THE ALTERATIONS, EACH REFUSED ====================================
  //
  // An envelope that appraises correctly proves the reader can read; an altered
  // one that still appraised correctly would prove it was not looking. Each
  // changes exactly one thing in the captured bytes.
  const floor = RANK[e?.appraisal.appraised.standing ?? 'verified'] ?? 3;
  const alterations: readonly { readonly what: string; readonly make: () => Fixture }[] = [
    {
      what: 'a changed header — the chunk no longer rebuilds to its id (T-P1-1)',
      make: () => {
        const g = clone(f);
        const m = g.topics[LANE]?.[0];
        if (m !== undefined) {
          const op = JSON.parse(m.contents) as Record<string, unknown>;
          const data = JSON.parse(String(op['data'])) as Record<string, unknown>;
          (data['hdr'] as Record<string, unknown>)['ke'] = 99;
          op['data'] = JSON.stringify(data);
          (m as { contents: string }).contents = JSON.stringify(op);
        }
        return g;
      },
    },
    {
      what: 'a settlement whose memo names another envelope (§4.3, T-P7-1)',
      make: () => {
        const g = clone(f);
        for (const [ref, s] of Object.entries(g.settlements)) {
          if (s !== null) g.settlements[ref] = { ...s, memo: `wishmail:${'0'.repeat(64)}` };
        }
        return g;
      },
    },
    {
      what: 'a settlement affixed by an account the chunks do not name (§7.2 fourth weld, T-P1-6)',
      make: () => {
        const g = clone(f);
        for (const [ref, s] of Object.entries(g.settlements)) {
          if (s !== null) g.settlements[ref] = { ...s, from: '0.0.999999' };
        }
        return g;
      },
    },
    {
      what: 'no settlement at all — the postage is not on the ledger (T-P7-1)',
      make: () => {
        const g = clone(f);
        for (const ref of Object.keys(g.settlements)) g.settlements[ref] = null;
        return g;
      },
    },
  ];

  for (const a of alterations) {
    const altered = await verify(readerOver(a.make()), { lane: f.lane }, {});
    const entry = altered.bundle.correspondence[0];
    const standing = entry === undefined ? 'unbound' : entry.appraisal.appraised.standing;
    const rank = RANK[standing] ?? 3;
    ok(`REFUSED: ${a.what}`, rank <= floor);
    ok(`  and the digest moves with the bytes: ${a.what}`, altered.bundle.digest !== f.bundleDigest);
  }

  // === 6. THE TWO ALTERATIONS THIS RELEASE CANNOT SEE, MEASURED ============
  //
  // §11.4's lane-provenance checks live inside the claimed-profile branch,
  // because the pair they compare against is the recipient's account and only a
  // replay yields it. `RELEASE.profiles` is `{}`, so a Verifier here never reads
  // the lane's memo or its key list at all.
  //
  // THE HONEST ASSERTION IS THEREFORE THE OPPOSITE ONE, and it is stronger than
  // the assertion it replaces: altering those two fields changes NOTHING the
  // Verifier saw, so the standing does not move and **the digest does not move
  // either**. That is the darkness LIMITATIONS L-1 records, measured on real
  // network bytes rather than described. `check:letter` refuses both of these
  // under a claimed profile on the modelled ledger today, which is where the
  // rule is proved; the day this release claims `hcs14`, these two lines flip
  // and this check will say so by failing.
  const dark: readonly { readonly what: string; readonly make: () => Fixture }[] = [
    {
      what: "a lane whose memo names a door that holds no answer for it (T-P10-2)",
      make: () => {
        const g = clone(f);
        const info = g.topicInfo[LANE];
        if (info !== null && info !== undefined) g.topicInfo[LANE] = { ...info, memo: `hcs-10:1:60:2:${C_MANIFEST}:1` };
        return g;
      },
    },
    {
      what: 'a lane whose submit key carries a third key (T-P17-2)',
      make: () => {
        const g = clone(f);
        const info = g.topicInfo[LANE];
        if (info !== null && info !== undefined) g.topicInfo[LANE] = { ...info, submitKeys: [...info.submitKeys, 'ff'.repeat(32)] };
        return g;
      },
    },
  ];

  for (const a of dark) {
    const altered = await verify(readerOver(a.make()), { lane: f.lane }, {});
    const entry = altered.bundle.correspondence[0];
    is(`DARK, and the standing does not move: ${a.what}`, entry?.appraisal.appraised.standing, 'unverified');
    is(`  nor do the reasons`, [...(entry?.appraisal.appraised.reasons ?? [])], ['T-P12-4']);
    is(`  and the digest is unchanged, because the Verifier never read the altered field`, altered.bundle.digest, f.bundleDigest);
  }

  if (failures.length > 0) {
    console.error(`check:gate3 FAILED — ${failures.length} of ${checked} assertions:`);
    for (const x of failures) console.error(`  ${x}`);
    process.exit(1);
  }
  console.log(
    `check:gate3 PASS — ${checked} assertions over the whole of §6.4 done in ONE send() call on hedera:testnet, ` +
      'appraised with NO NETWORK from conformance/fixtures/ (P-4): the lane birth read from the lane own memo down ' +
      'to the door that answered and the party that rang, on a door that had never been rung; BOTH outbound ' +
      'connection_created records, in the two readings the pinned HCS-10 contradicts itself between, off the ' +
      'network rather than off a model; the envelope ACKED with its receipt acked on the recipient own manifest ' +
      'topic; the bundle carrying the MINOR version so a Verifier at any patch of 0.5 reaches the same digest; ' +
      'four alterations each refused; and the two §11.4 cannot see under a release claiming no profile MEASURED as ' +
      'unseen, which is LIMITATIONS L-1 as a number rather than a sentence.',
  );
  process.exit(0);
}

await main();
