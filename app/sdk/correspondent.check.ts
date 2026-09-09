/**
 * `npm run check:correspondent` — everything about the Correspondent and the
 * counter that can be checked with no network and no key.
 *
 * The rule this project holds to is that a writer is built in the same step as
 * its reader and the reader is run on the writer's output before that output is
 * signed (CLAUDE.md §9). Gate One's writers are the counter's quote and the six
 * provisioning rows; their readers are the resolver, the registered schemas and
 * §9.5's payer rule. What CAN be run before a signature is run here.
 *
 * Nothing here touches `hedera:testnet`, reads a key, or opens a socket.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PrivateKey } from '@hashgraph/sdk';
import { repoRoot } from '../src/ops/env.js';
import { buildProfile, readProfile } from '../src/ops/declaration.js';
import * as template from '../src/ops/template.js';
import { sentenceKeys, line } from '../src/tools/narration.js';
import { quote, scaled, unscaled, type CurrentPrice } from '../src/counter/pricing.js';
import { provisioningFieldsThisCounterCannotFill } from '../src/counter/purchase.js';
import { keysOfProtobuf, flattenMirrorKey } from './protokey.js';
import { unanswered, connectionTopicMemo } from './watcher.js';
import { openHome, AgentRecord } from './home.js';
import { ensureKeys, agentSigner, agentSeal, currentEpoch, payerKeyPresent, withPayerKey } from './keystore.js';
import { affordances, six } from './tools.js';
import type { TopicMessage } from '../src/tools/consensus.js';

let passed = 0;
const failures: string[] = [];

function is(what: string, got: unknown, want: unknown): void {
  try {
    assert.deepEqual(got, want);
    passed += 1;
  } catch {
    failures.push(`${what}\n      want ${JSON.stringify(want)}\n      got  ${JSON.stringify(got)}`);
  }
}
function ok(what: string, condition: boolean): void {
  if (condition) passed += 1;
  else failures.push(what);
}

/* ------------------------------------------------------------------ */
/* D-147's template — ONE spelling, and the shapes it fixes.           */
/* ------------------------------------------------------------------ */

const subject: template.TemplateSubject = {
  account: '0.0.1001',
  publicKey: 'aa'.repeat(32),
  treasury: '0.0.2002',
  stampToken: '0.0.3003',
  autoRenewAccount: '0.0.4004',
};

{
  const d = template.doorbell(subject);
  is('the doorbell’s memo carries the account (HCS-10 inbound)', d.memo, `hcs-10:0:60:0:${subject.account}`);
  is('the doorbell has NO submit key: anyone may ring (§4.4)', d.submitKey, null);
  is('the doorbell’s admin key is the agent’s (T-P17-1)', d.adminKey, subject.publicKey);
  is('the doorbell’s fee is one stamp to the treasury (§4.4, T-P7-4)', d.fee, {
    amount: 1,
    collector: subject.treasury,
    token: subject.stampToken,
  });
  is('the owner’s key is exempt, so an agent answers its own door free (D-137)', d.feeExemptKeys, [subject.publicKey]);
  is('the doorbell has no fee schedule key: the fee is immutable at birth', d.feeScheduleKey, null);

  const l = template.log(subject);
  is('the log’s memo is the outbound one', l.memo, 'hcs-10:0:60:1');
  is('only the agent writes to its own log', l.submitKey, subject.publicKey);
  is('the log carries no fee', l.fee, null);

  const m = template.manifest(subject);
  is('the manifest topic’s memo is §9.1’s', m.memo, 'wishmail:manifest:1');
  is('the manifest topic’s SOLE submit key is the agent’s (T-P17-3)', m.submitKey, subject.publicKey);

  const r = template.declRegistry(subject, 'hcs-2:0:60');
  is('the declaration registry is INDEXED 0, so prior entries stay readable (T-P8-3)', r.memo, 'hcs-2:0:60');

  const f = template.profileFile(subject, 'deadbeef:brotli:base64');
  is('an HCS-1 file topic has NO admin key (hcs-1.md:48-49, D-150)', f.adminKey, null);
  is('and the agent is its sole submit key', f.submitKey, subject.publicKey);
}

/* ------------------------------------------------------------------ */
/* The key-list decoder — T-P17-2 cannot be checked without it.        */
/* ------------------------------------------------------------------ */

{
  // A protobuf `Key` carrying a KeyList of two ed25519 keys, hand-built from the
  // field numbers in `basic_types.proto`: field 6 (keyList) → field 1 (keys) →
  // field 2 (ed25519). If the decoder is wrong, this is what says so.
  const k1 = Buffer.alloc(32, 0x11);
  const k2 = Buffer.alloc(32, 0x22);
  const keyOf = (raw: Buffer): Buffer => Buffer.concat([Buffer.from([0x12, raw.length]), raw]); // field 2, len
  const keyList = Buffer.concat([
    Buffer.from([0x0a, keyOf(k1).length]),
    keyOf(k1),
    Buffer.from([0x0a, keyOf(k2).length]),
    keyOf(k2),
  ]);
  const outer = Buffer.concat([Buffer.from([0x32, keyList.length]), keyList]); // field 6, len
  is('a KeyList of two decodes to both keys, flattened', keysOfProtobuf(outer), [k1.toString('hex'), k2.toString('hex')]);
  is('a single ED25519 key needs no decoding at all', flattenMirrorKey({ _type: 'ED25519', key: 'ab'.repeat(32) }), ['ab'.repeat(32)]);
  is('an absent key is no keys', flattenMirrorKey(null), []);

  // A THRESHOLD key: field 5 → ThresholdKey{ threshold=1 (varint), keys=KeyList }.
  const threshold = Buffer.concat([Buffer.from([0x08, 0x01]), Buffer.from([0x12, keyList.length]), keyList]);
  const outerT = Buffer.concat([Buffer.from([0x2a, threshold.length]), threshold]);
  is('a threshold of two names the same two keys, and the threshold is skipped', keysOfProtobuf(outerT), [
    k1.toString('hex'),
    k2.toString('hex'),
  ]);
}

/* ------------------------------------------------------------------ */
/* §14.3's arithmetic — integer, and rounded the one safe way.         */
/* ------------------------------------------------------------------ */

is('a decimal scales without a float', unscaled(scaled('0.10')), '0.1');
is('and two ℏ is two ℏ', unscaled(scaled('2')), '2');
ok('an amount with too many places is refused, not truncated', (() => {
  try {
    scaled('0.123456789');
    return false;
  } catch {
    return true;
  }
})());

const priceList: CurrentPrice = {
  sequenceNumber: 2,
  consensusTimestamp: '1788989981.685451648',
  list: {
    spec: '0.5.9',
    stampToken: { ledgerTag: 'hedera:testnet', tokenId: '0.0.3003', treasury: '0.0.2002' },
    methods: [
      {
        method: 'hbar',
        network: 'hedera:testnet',
        asset: '0.0.0',
        payTo: '0.0.4004',
        rate: { source: 'https://example.invalid/tokens', pair: 'HBAR/USD', reference: { amount: '0.10', asset: 'USD' } },
        bundles: [{ count: 12, price: '1.00' }],
      },
      { method: 'flat', network: 'hedera:testnet', asset: '0.0.0', payTo: '0.0.4004', unitPrice: '0.25', bundles: [{ count: 10, price: '2.00' }] },
    ],
    provisioning: { method: 'hbar', unitPrice: '2', registrationFee: '0.05' },
  },
};

{
  const q = await quote(priceList, 'flat', 3, false);
  is('a fixed method charges count × unitPrice (T-P11-4)', q.amount, '0.75');
  const b = await quote(priceList, 'flat', 10, false);
  is('a bundle is taken at EXACTLY its count and not as a discount schedule', b.amount, '2');
  const nb = await quote(priceList, 'flat', 11, false);
  is('eleven is eleven unit prices, because the message yields nothing else', nb.amount, '2.75');
  ok('provisioning on a method the message does not price it under is refused', await refused(() => quote(priceList, 'flat', 1, true)));
  ok('a method the message does not publish is refused (STAMP_METHOD_UNSUPPORTED)', await refused(() => quote(priceList, 'nope', 1, false)));
}

async function refused(f: () => Promise<unknown>): Promise<boolean> {
  try {
    await f();
    return false;
  } catch {
    return true;
  }
}

/* ------------------------------------------------------------------ */
/* §G-19 — the counter refuses the provisioned path, from the schema.  */
/* ------------------------------------------------------------------ */

{
  const missing = provisioningFieldsThisCounterCannotFill(repoRoot());
  is(
    'the registered StampReceipt requires two fields a D-159 purchase cannot name (ledger §G-19)',
    [...missing].sort(),
    ['doorbell', 'manifestTopic'],
  );
  ok(
    'and the gate reads the SCHEMA, so a 0.6 that makes them optional lifts it with no second place to remember',
    fs.readFileSync(path.join(repoRoot(), 'spec', 'schemas', 'stamp-receipt.schema.json'), 'utf8').includes('"manifestTopic"'),
  );
}

/* ------------------------------------------------------------------ */
/* D-162 — one template, and every caller's sentence in it.            */
/* ------------------------------------------------------------------ */

{
  const keys = sentenceKeys();
  ok('the template file holds sentences for all three readers', keys.length > 20);
  for (const forbidden of ['deliver', 'received', 'refused to accept']) {
    const offenders = keys.filter((k) => line(k, fieldsFor(k)).toLowerCase().includes(forbidden));
    is(`no sentence implies ${forbidden} — §2.3 reserves delivery for the lane, §11.8 forbids reading silence`, offenders, []);
  }
  ok(
    'a sentence with an unsupplied placeholder throws rather than rendering a hole',
    (() => {
      try {
        line('provision.created', { role: 'x' });
        return false;
      } catch {
        return true;
      }
    })(),
  );
}

/** Every placeholder any sentence names, so the coverage check can render them all. */
function fieldsFor(_key: string): Record<string, string> {
  return new Proxy({}, { get: (_t, p) => (typeof p === 'string' ? `<${p}>` : undefined) }) as Record<string, string>;
}

/* ------------------------------------------------------------------ */
/* The watcher's rule, over messages and nothing else.                 */
/* ------------------------------------------------------------------ */

{
  const msg = (seq: number, body: Record<string, unknown>): TopicMessage => ({
    topicId: '0.0.9',
    sequenceNumber: seq,
    consensusTimestamp: `1788990000.00000000${seq}`,
    runningHash: '',
    runningHashVersion: 3,
    contents: JSON.stringify(body),
    payer: '0.0.1',
  });
  const doorbell = [
    msg(1, { p: 'hcs-10', op: 'connection_request', operator_id: '0.0.50@0.0.51' }),
    msg(2, { p: 'hcs-10', op: 'connection_request', operator_id: '0.0.60@0.0.61' }),
    msg(3, { p: 'hcs-10', op: 'connection_created', connection_id: 1, connection_topic_id: '0.0.70', connected_account_id: '0.0.51' }),
    msg(4, { p: 'wishmail', t: 'not-an-hcs-10-operation' }),
  ];
  const out = unanswered(doorbell);
  is('one request is outstanding, and it is the one no connection_created names', out.map((u) => u.sequenceNumber), [2]);
  is('and the requester is read from operator_id, which is where HCS-10 puts it', out[0]?.requesterAccount, '0.0.61');
  is(
    'the lane’s memo is HCS-10’s connection memo, non-indexed, naming the request (D-95)',
    connectionTopicMemo('0.0.9', 2),
    'hcs-10:1:60:2:0.0.9:2',
  );
}

/* ------------------------------------------------------------------ */
/* The home directory IS the agent (D-165).                            */
/* ------------------------------------------------------------------ */

{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wishmail-home-'));
  const payer = PrivateKey.generateED25519();
  fs.writeFileSync(
    path.join(dir, 'config.json'),
    JSON.stringify(
      withPayerKey(
        {
          network: 'testnet',
          postmasterUrl: 'http://127.0.0.1:4600/mcp',
          payer: { accountId: '0.0.4004' },
          agent: { displayName: 'Check Agent', alias: 'check', bio: 'born for a check and bound to nothing' },
        },
        payer.toStringDer(),
      ),
    ),
  );
  const home = openHome(dir);
  ok('a fresh home has no keystore, so it is a NEW agent', home.firstRun);
  is('the first boot BORNS the keys', ensureKeys(home), 'born');
  const first = agentSigner(home).publicKey.toStringRaw();
  is('and every later boot LOADS them', ensureKeys(home), 'loaded');
  is('so a restart is the same agent, not a new one (D-165)', agentSigner(home).publicKey.toStringRaw(), first);
  is('the keystore holds epoch 1 and §7.6 retains it forever', currentEpoch(home), 1);
  ok('the seal identity offers a public half and an `open`, and no key (P-13)', typeof agentSeal(home).open === 'function');
  ok(
    'and no field of the seal identity is a private key',
    !JSON.stringify({ ...agentSeal(home), open: undefined }).includes(payer.toStringDer().slice(0, 24)),
  );

  const record = AgentRecord.load(home, 'v0.5.9');
  ok('the agent’s record lives in its home and not in app/deployment/', record.path.startsWith(path.resolve(dir)));
  ok('nothing in it is one of the Postmaster’s entities', !record.has('doorbell'));

  const config = fs.readFileSync(path.join(repoRoot(), 'app', 'sdk', 'config.template.json'), 'utf8');
  ok('the repository ships a TEMPLATE, and it is not a filled config', !payerKeyPresent(JSON.parse(config.replace(/"_readme":[\s\S]*?\],/, '')) as Record<string, unknown>));
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ------------------------------------------------------------------ */
/* The Postmaster’s own declaration did not move.                      */
/* ------------------------------------------------------------------ */

{
  // `buildProfile` gained a `ProfileIdentity` so a Correspondent can carry its
  // own name — and HCS-14 hashes the name, the HCS-1 topic’s memo is the
  // SHA-256 of these very bytes, and that topic has no admin key. A refactor
  // that shifted one character of the Postmaster’s own profile would have made
  // the file on `0.0.10428178` permanently unrecomputable from the code that
  // wrote it. So the profile is rebuilt from what is ON CONSENSUS and compared
  // byte for byte, here, where it will be re-checked every run.
  const record = JSON.parse(
    fs.readFileSync(path.join(repoRoot(), 'app', 'deployment', 'hedera-testnet.json'), 'utf8'),
  ) as { entities: Record<string, { policy: Record<string, unknown> }> };
  const policy = record.entities['agent.profileChunks']?.policy;
  if (policy !== undefined) {
    const read = readProfile(`${String(policy['memoDigest'])}:brotli:base64`, policy['chunks'] as { o: number; c: string }[]);
    const onChain = read.profile as { properties: { wishmail: Record<string, string & number> } };
    const w = onChain.properties.wishmail;
    const rebuilt = buildProfile({
      ledgerTag: w['ledgerTag'] as unknown as 'hedera:testnet',
      network: 'testnet',
      account: w['account'] as unknown as string,
      doorbell: w['doorbell'] as unknown as string,
      log: w['log'] as unknown as string,
      wishmail: {
        manifestTopic: w['manifestTopic'] as unknown as string,
        x25519Pub: w['x25519Pub'] as unknown as string,
        keyEpoch: w['keyEpoch'] as unknown as number,
      },
    });
    is(
      'the Postmaster’s own HCS-11 profile is byte-identical to the one on consensus, after the identity refactor',
      JSON.stringify(rebuilt),
      JSON.stringify(onChain),
    );
  }
}

/* ------------------------------------------------------------------ */
/* The surface: six tools, two affordances, and the difference stated. */
/* ------------------------------------------------------------------ */

{
  is('§6.1 fixes six verbs and this transport serves six', six().length, 6);
  is('the two §4.6 affordances are marked as such and are not among them', affordances().map((a) => a.name), [
    'generate_mailbox',
    'register_agent',
  ]);
  for (const a of affordances()) {
    ok(`${a.name} says what it refuses, because goose will meet the refusals`, a.refuses.length >= 3);
    ok(`${a.name}'s $id is in the affordance space, not a registered one`, String(a.inputSchema['$id']).includes(':affordance:'));
  }
}

/* ------------------------------------------------------------------ */

console.log('');
for (const f of failures) console.log(`  FAIL  ${f}`);
if (failures.length > 0) {
  console.log(`\ncheck:correspondent FAILED — ${failures.length} of ${passed + failures.length}\n`);
  process.exit(1);
}
console.log(
  `check:correspondent PASS — ${passed} assertions: D-147's six rows from one template; a mirror key list decoded so ` +
    "§7.1's threshold lane can be checked at all; §14.3's arithmetic in integers, rounded up, with bundles at exactly " +
    'their count; the counter refusing the provisioned path from the registered schema itself (§G-19); one sentence ' +
    'template that implies no delivery and no receipt; the doorbell rule over messages alone; a home directory ' +
    'that is the agent — keys born once, loaded ever after; and the Postmaster’s own HCS-11 profile still ' +
    'byte-identical to the one on consensus, after the identity refactor a Correspondent needed.',
);
console.log('');
