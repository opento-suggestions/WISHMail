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
import {
  AccountId,
  AccountUpdateTransaction,
  Client,
  Hbar,
  PrivateKey,
  Transaction,
  TransactionId,
} from '@hashgraph/sdk';
import { repoRoot } from '../src/ops/env.js';
import { buildProfile, readProfile } from '../src/ops/declaration.js';
import * as template from '../src/ops/template.js';
import { sentenceKeys, line } from '../src/tools/narration.js';
import { quote, scaled, unscaled, type CurrentPrice } from '../src/counter/pricing.js';
import { provisioningFieldsThisCounterCannotFill } from '../src/counter/purchase.js';
import { decodeTransactionBody } from '../src/counter/body.js';
import { carrySignature, openCarry, type CarriedRow } from '../src/counter/carry.js';
import { carryFeeCapTinybars } from '../src/counter/server.js';
import type { CounterContext } from '../src/counter/context.js';
import { UnchunkedTopicMessageSubmitTransaction } from '../src/ops/hcs10.js';
import { HCS2_REGISTER_TX_MEMO, accountMemoFor, registerOperation, registryMemo } from '../src/ops/declaration.js';
import { topicCreateFor } from './mailbox.js';
import type { Signer } from '../src/ops/identity.js';
import { toMirrorTxId, type Mirror } from '../src/ops/mirror.js';
import { networkConstants } from '../src/ops/networks.js';
import { keysOfProtobuf, flattenMirrorKey } from '../src/core/protokey.js';
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
/* §G-19, ruled (a) — the counter can now fill every field §5.4 asks   */
/* for, and this is the assertion that it still can (D-168).           */
/* ------------------------------------------------------------------ */

{
  const missing = provisioningFieldsThisCounterCannotFill(repoRoot());
  is(
    'every field the registered StampReceipt requires inside `provisioning` is one this counter reads back (§G-19, D-168)',
    [...missing].sort(),
    [],
  );
  ok(
    'and the gate still reads the SCHEMA, so a field added there stops the sale before the quote rather than after the transfer',
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
/* D-168 — the transaction-body decoder, and the carry policy that     */
/* reads it. Every assertion below is offline: the SDK freezes a body, */
/* the decoder reads it, and the policy decides. No network, no key    */
/* but throwaway ones, and no state outside a temp directory.          */
/* ------------------------------------------------------------------ */

{
  const agentKey = PrivateKey.generateED25519();
  const postmasterKey = PrivateKey.generateED25519();
  const strangerKey = PrivateKey.generateED25519();
  const POSTMASTER = '0.0.800';
  const BUYER = '0.0.900';
  const ACCOUNT = '0.0.1000';
  const TREASURY = '0.0.2002';
  const TOKEN = '0.0.3003';
  const NODE = '0.0.3';
  const FILE_TOPIC = '0.0.5005';
  const REGISTRY = '0.0.5006';
  // The network's OWN caps, from the file the Correspondent builds with. Made
  // up numbers here would test a policy nobody runs: the first version of this
  // check used 4 and 3 hbar and passed, while the real doorbell asks for 100
  // and would have been refused after the transfer had already landed.
  const constants = networkConstants('testnet');
  const feeCaps = constants.feeCaps;

  const client = Client.forName('testnet');
  client.setOperator(POSTMASTER, postmasterKey);

  /** Freeze offline and hand back the bytes a signer would be handed. */
  const bodyOf = async (tx: Transaction, payer = POSTMASTER, node = NODE): Promise<Buffer> => {
    tx.setTransactionId(TransactionId.generate(payer));
    tx.setNodeAccountIds([AccountId.fromString(node)]);
    const frozen = await tx.freezeWith(client);
    const one = frozen.signableNodeBodyBytesList[0] as { signableTransactionBodyBytes: Uint8Array } | undefined;
    if (one === undefined) throw new Error('a body frozen against one node produced no signable bytes');
    return Buffer.from(one.signableTransactionBodyBytes);
  };

  const carrySubject: template.TemplateSubject = {
    account: ACCOUNT,
    publicKey: agentKey.publicKey.toStringRaw(),
    treasury: TREASURY,
    stampToken: TOKEN,
    autoRenewAccount: BUYER,
  };
  const rowShapes = {
    doorbell: template.doorbell(carrySubject),
    log: template.log(carrySubject),
    manifest: template.manifest(carrySubject),
    declRegistry: template.declRegistry(carrySubject, registryMemo(template.HCS10_TTL)),
    profileFile: template.profileFile(carrySubject, 'ab'.repeat(32) + ':brotli:base64'),
  } as const;

  /* ---- the decoder, against what the SDK froze ---- */

  {
    const decoded = decodeTransactionBody(await bodyOf(topicCreateFor(rowShapes.doorbell, agentKey.publicKey, feeCaps)));
    ok('the decoder reads the payer off a body the SDK froze', decoded.payer === POSTMASTER);
    ok('and the node it is addressed to', decoded.node === NODE);
    ok('and the maximum fee it authorises, in tinybars', decoded.transactionFee === feeCaps.feeGatedTopicCreate * 100_000_000);
    ok('and the transaction id, which is how the counter later reads back what the body became', decoded.transactionId.startsWith(POSTMASTER + '@'));
    ok('a topic create decodes as one', decoded.body.kind === 'topic-create');
    if (decoded.body.kind === 'topic-create') {
      const b = decoded.body;
      is('the doorbell memo, byte for byte', b.memo, rowShapes.doorbell.memo);
      is('the admin key, raw hex, as the template names it', b.adminKey, agentKey.publicKey.toStringRaw());
      ok('and no submit key: HCS-10 leaves an inbound topic open (index.md:113)', b.submitKey === null);
      ok('and no fee schedule key: the fee is immutable at birth', b.feeScheduleKey === null);
      is('the auto-renew account', b.autoRenewAccount, BUYER);
      is('§4.4’s one stamp to the treasury', [...b.fees], [{ amount: 1, token: TOKEN, collector: TREASURY }]);
      is('and D-137’s exemption, so the agent can answer its own door', [...b.feeExemptKeys], [agentKey.publicKey.toStringRaw()]);
    }
  }

  {
    const decoded = decodeTransactionBody(await bodyOf(topicCreateFor(rowShapes.profileFile, agentKey.publicKey, feeCaps)));
    if (decoded.body.kind === 'topic-create') {
      ok(
        'an HCS-1 file topic decodes with NO admin key, which is the one thing hcs-1.md:48-49 requires of it (D-150)',
        decoded.body.adminKey === null && decoded.body.submitKey === agentKey.publicKey.toStringRaw(),
      );
    } else ok('an HCS-1 file topic decodes as a topic create', false);
  }

  {
    const submit = new UnchunkedTopicMessageSubmitTransaction().setTopicId(FILE_TOPIC).setMessage(Buffer.from('{"o":0,"c":"x"}'));
    const decoded = decodeTransactionBody(await bodyOf(submit));
    ok('a message submission decodes as one, with its topic and its bytes', decoded.body.kind === 'submit-message');
    if (decoded.body.kind === 'submit-message') {
      is('the topic it is addressed to', decoded.body.topicId, FILE_TOPIC);
      is('the message, byte for byte', decoded.body.message.toString('utf8'), '{"o":0,"c":"x"}');
      ok(
        'and NO chunkInfo — which is the whole reason `UnchunkedTopicMessageSubmitTransaction` exists (§7.4, D-96)',
        decoded.body.chunked === false,
      );
    }
  }

  {
    // The plain SDK class attaches a chunkInfo even for one chunk. The decoder
    // must SEE it, or §7.4’s rule is unenforceable at the counter.
    const { TopicMessageSubmitTransaction } = await import('@hashgraph/sdk');
    const chunked = new TopicMessageSubmitTransaction().setTopicId(FILE_TOPIC).setMessage(Buffer.from('x')).setMaxChunks(1);
    const decoded = decodeTransactionBody(await bodyOf(chunked));
    ok(
      'and the decoder SEES a chunkInfo where the SDK attaches one, which is what makes §7.4 checkable at all',
      decoded.body.kind === 'submit-message' && decoded.body.chunked === true,
    );
  }

  {
    const update = new AccountUpdateTransaction().setAccountId(ACCOUNT).setAccountMemo(accountMemoFor(REGISTRY)).setMaxTransactionFee(new Hbar(2));
    const decoded = decodeTransactionBody(await bodyOf(update));
    ok('an account update decodes as one', decoded.body.kind === 'account-update');
    if (decoded.body.kind === 'account-update') {
      is('the account it names', decoded.body.account, ACCOUNT);
      is(
        'and §9.2’s memo — field 14 of CryptoUpdateTransactionBody, which is the number a confident guess gets wrong',
        decoded.body.memo,
        accountMemoFor(REGISTRY),
      );
      is('and it sets nothing else', [...decoded.body.otherFields], []);
    }
  }

  {
    const rotates = new AccountUpdateTransaction().setAccountId(ACCOUNT).setKey(strangerKey.publicKey).setMaxTransactionFee(new Hbar(2));
    const decoded = decodeTransactionBody(await bodyOf(rotates));
    ok(
      'an account update that rotates the KEY is decoded as setting another field, and is therefore visible to the policy',
      decoded.body.kind === 'account-update' && decoded.body.otherFields.length > 0,
    );
  }

  /* ---- the policy, over a temp store and a stubbed mirror ---- */

  const created = new Map<string, string>();
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wishmail-carry-'));
  const postmasterPayer: Signer = {
    label: 'postmaster',
    publicKey: postmasterKey.publicKey,
    sign: (m) => Promise.resolve(postmasterKey.sign(m)),
  };
  const mirror = {
    get: <TRes>(pathname: string): Promise<TRes | null> => {
      // A mirror node spells a transaction id with dashes where the SDK spells it
      // with an @ and a dot, and `toMirrorTxId` is the one place that conversion
      // lives — the stub uses it rather than a second spelling of it.
      const found = [...created.entries()].find(([id]) => pathname.includes(toMirrorTxId(id)));
      if (found === undefined) return Promise.resolve(null);
      return Promise.resolve({ transactions: [{ transaction_id: found[0], result: 'SUCCESS', entity_id: found[1] }] } as unknown as TRes);
    },
  } as unknown as Mirror;
  const ctx = {
    repoRoot: repoRoot(),
    ledgerTag: 'hedera:testnet',
    constants,
    mirror,
    mirrorNodeUrl: '',
    client,
    stateDir,
    postmasterPayerId: POSTMASTER,
    postmasterPayer,
    treasuryId: TREASURY,
    treasury: postmasterPayer,
    stampToken: TOKEN,
    priceTopic: '0.0.7',
    carryFeeCap: carryFeeCapTinybars(feeCaps.feeGatedTopicCreate),
  } as unknown as CounterContext;

  const REFERENCE = POSTMASTER + '@1757000000.000000001';
  openCarry(ctx, {
    reference: REFERENCE,
    txRef: REFERENCE,
    count: 12,
    quote: { amount: '1.00', currency: 'HBAR', from: { sequenceNumber: 2, consensusTimestamp: '0.0' } },
    holderKey: agentKey.publicKey.toStringRaw(),
    account: ACCOUNT,
    buyer: BUYER,
    node: NODE,
    feeCap: carryFeeCapTinybars(feeCaps.feeGatedTopicCreate),
  });

  /** Ask the counter to carry a body, and say which row it called it. */
  const carried = async (bytes: Buffer): Promise<CarriedRow> => {
    const d = await carrySignature(ctx, REFERENCE, bytes.toString('base64'));
    ok(
      `the signature the counter returns for \`${d.row}\` verifies against the very bytes it decided about`,
      postmasterKey.publicKey.verify(bytes, Buffer.from(d.signature, 'base64')),
    );
    return d.row;
  };
  /** Ask, and expect a refusal. Returns the reason, so a check can read it. */
  const refused = async (what: string, bytes: Buffer): Promise<void> => {
    try {
      await carrySignature(ctx, REFERENCE, bytes.toString('base64'));
      failures.push(`the counter should have refused to pay for ${what}, and did not`);
    } catch {
      passed += 1;
    }
  };

  for (const row of ['doorbell', 'log', 'manifest', 'declRegistry', 'profileFile'] as const) {
    const bytes = await bodyOf(topicCreateFor(rowShapes[row], agentKey.publicKey, feeCaps));
    const called = await carried(bytes);
    is(`the counter recognises row \`${row}\` of the template and pays for it`, called, row);
    // Remember what each row BECAME, as a mirror would.
    created.set(decodeTransactionBody(bytes).transactionId, row === 'profileFile' ? FILE_TOPIC : row === 'declRegistry' ? REGISTRY : '0.0.9' + row.length);
  }

  await refused(
    'the same row twice — a second doorbell cannot be undone (D-165)',
    await bodyOf(topicCreateFor(rowShapes.doorbell, agentKey.publicKey, feeCaps)),
  );
  await refused(
    'a doorbell whose auto-renew account is the POSTMASTER — it sells a mailbox once and does not undertake to renew it forever',
    await bodyOf(topicCreateFor({ ...rowShapes.doorbell, autoRenewAccount: POSTMASTER }, agentKey.publicKey, feeCaps)),
  );
  await refused(
    'a doorbell whose fee is collected by somebody other than the treasury (§4.4)',
    await bodyOf(
      topicCreateFor({ ...template.doorbell({ ...carrySubject, treasury: '0.0.6666' }), memo: rowShapes.doorbell.memo }, agentKey.publicKey, feeCaps),
    ),
  );
  await refused(
    'a doorbell with no fee-exempt key, which is not the row D-137 declares',
    await bodyOf(topicCreateFor({ ...rowShapes.doorbell, feeExemptKeys: [] }, agentKey.publicKey, feeCaps)),
  );
  await refused(
    'a row whose keys are a STRANGER’s and not the holder’s',
    await bodyOf(topicCreateFor(rowShapes.manifest, strangerKey.publicKey, feeCaps)),
  );
  await refused(
    'a topic that is no row of the template at all',
    await bodyOf(topicCreateFor({ ...rowShapes.manifest, memo: 'something-else' }, agentKey.publicKey, feeCaps)),
  );
  await refused(
    'a body whose payer is somebody else — the counter signs only for its own account',
    await bodyOf(topicCreateFor(rowShapes.log, agentKey.publicKey, feeCaps), BUYER),
  );
  await refused(
    'a body addressed to a node this purchase did not pin — one body, one signature',
    await bodyOf(topicCreateFor(rowShapes.log, agentKey.publicKey, feeCaps), POSTMASTER, '0.0.4'),
  );
  await refused(
    'a body that authorises a fee above the ceiling its own row declares',
    await bodyOf(
      topicCreateFor(rowShapes.log, agentKey.publicKey, {
        feeGatedTopicCreate: feeCaps.feeGatedTopicCreate,
        plainTopicCreate: feeCaps.plainTopicCreate + 1,
      }),
    ),
  );
  ok(
    'and the doorbell’s own cap is the fee-gated one, which is higher than every other row’s — a flat ceiling ' +
      'below it would refuse the first row of every provisioning purchase, after the transfer had landed',
    feeCaps.feeGatedTopicCreate > feeCaps.plainTopicCreate,
  );

  is(
    'an HCS-1 chunk on the file topic the counter paid for is carried',
    await carried(
      await bodyOf(new UnchunkedTopicMessageSubmitTransaction().setTopicId(FILE_TOPIC).setMessage(Buffer.from('{"o":0}'))),
    ),
    'profileChunks',
  );
  await refused(
    'a message on a topic this reference never bought',
    await bodyOf(new UnchunkedTopicMessageSubmitTransaction().setTopicId('0.0.9999').setMessage(Buffer.from('x'))),
  );
  is(
    'the HCS-2 register entry on the registry it paid for is carried',
    await carried(
      await bodyOf(
        new UnchunkedTopicMessageSubmitTransaction()
          .setTopicId(REGISTRY)
          .setMessage(Buffer.from(JSON.stringify(registerOperation(FILE_TOPIC))))
          .setTransactionMemo(HCS2_REGISTER_TX_MEMO),
      ),
    ),
    'registryEntry',
  );
  await refused(
    'a register entry naming a profile file this purchase did not create',
    await bodyOf(
      new UnchunkedTopicMessageSubmitTransaction()
        .setTopicId(REGISTRY)
        .setMessage(Buffer.from(JSON.stringify(registerOperation('0.0.4242'))))
        .setTransactionMemo(HCS2_REGISTER_TX_MEMO),
    ),
  );
  is(
    'the account memo naming that registry is carried — §9.2’s first link',
    await carried(
      await bodyOf(new AccountUpdateTransaction().setAccountId(ACCOUNT).setAccountMemo(accountMemoFor(REGISTRY)).setMaxTransactionFee(new Hbar(2))),
    ),
    'accountMemo',
  );
  await refused(
    'an account update that also rotates the account’s key — the counter does not pay to hand away what it sold',
    await bodyOf(
      new AccountUpdateTransaction()
        .setAccountId('0.0.1001')
        .setKey(strangerKey.publicKey)
        .setAccountMemo(accountMemoFor(REGISTRY))
        .setMaxTransactionFee(new Hbar(2)),
    ),
  );

  /* ---------------------------------------------------------------- *
   * A FROZEN TRANSACTION IS IMMUTABLE, AND `submit()` MUST NOT FORGET IT.
   *
   * Gate One's first run stopped here. The counter's settle leg reconstitutes
   * the purchase from the bytes it froze at the quote and adds the buyer's
   * signature (§14.2, D-168), so what reaches `ops/hedera.ts::submit` is
   * frozen, signed, and immutable — and the preparation `submit` does for
   * every other caller throws on exactly that. `check:exchange` could not
   * reach it: there is no offline consensus node, so its settle leg runs down
   * the replay path a landed transfer takes and `submit()` itself was Gate
   * One's. Nothing had landed when it stopped; a refusal leaves no mark (§3.5).
   *
   * These four assertions are the SDK facts the defect turned on, so the guard
   * cannot be removed without a check going red first.
   * ---------------------------------------------------------------- */
  {
    const buyer = PrivateKey.generateED25519();
    const built = new AccountUpdateTransaction()
      .setAccountId('0.0.1001')
      .setAccountMemo('a stand-in for the purchase')
      .setTransactionId(TransactionId.generate('0.0.2002'))
      .setNodeAccountIds([AccountId.fromString('0.0.3')])
      .setMaxTransactionFee(new Hbar(2))
      .freeze();

    const reconstituted = Transaction.fromBytes(built.toBytes());
    ok('a transaction reconstituted from its own bytes reports itself frozen', reconstituted.isFrozen());

    const bytes = (reconstituted.signableNodeBodyBytesList[0] as { signableTransactionBodyBytes: Uint8Array } | undefined)
      ?.signableTransactionBodyBytes;
    ok('and it still exposes the one body a remote signer signs', bytes !== undefined);
    reconstituted.addSignature(buyer.publicKey, buyer.sign(bytes!));

    let threw = '';
    try {
      reconstituted.setRegenerateTransactionId(false);
    } catch (e: unknown) {
      threw = e instanceof Error ? e.message : String(e);
    }
    ok(
      'and every setter submit() would call on it throws — this is the defect Gate One found',
      threw.includes('immutable'),
    );

    // The guard: submit() prepares only what is not yet frozen. Read from the
    // source, because the fact under test is that the branch exists at all.
    const submitSrc = fs.readFileSync(path.join(repoRoot(), 'app/src/ops/hedera.ts'), 'utf8');
    ok(
      'so submit() prepares only where preparation is still possible, and never re-freezes',
      submitSrc.includes('if (!tx.isFrozen()) {') && !submitSrc.includes('const frozen = await tx.freezeWith'),
    );
  }

  fs.rmSync(stateDir, { recursive: true, force: true });
  client.close();
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
    'their count; a transaction body decoded off what the SDK itself froze, and the carry policy paying for every ' +
    'row of the template and refusing every near-miss (D-168); one sentence template that implies no delivery and ' +
    'no receipt; the doorbell rule over messages alone; a home directory that is the agent — keys born once, ' +
    'loaded ever after; and the Postmaster’s own HCS-11 profile still byte-identical to the one on consensus, ' +
    'after the identity refactor a Correspondent needed.',
);
console.log('');
