/**
 * `npm run check:hcs10` — the memos are HCS-10's, and a message operation
 * carries no `chunkInfo`.
 *
 * The second half decodes real transaction bytes and submits nothing. That is
 * the only way to check it before consensus, and consensus is the wrong place
 * to find out: a chunk carrying `chunkInfo` fails T-P9-7 permanently, because a
 * message cannot be withdrawn.
 */
import { AccountId, TopicId, TransactionId, Transaction } from '@hashgraph/sdk';
import * as proto from '@hashgraph/proto';
import {
  TRANSACTION_MEMO,
  TRANSACTION_OP_MEMO,
  TOPIC_TYPE,
  UnchunkedTopicMessageSubmitTransaction,
  accountOf,
  messageOperationBody,
  operatorId,
} from './hcs10.js';
import { CHUNK_WIRE_MAX } from '../core/chunk.js';

const failures: string[] = [];
let checked = 0;
function is(name: string, got: unknown, want: unknown): void {
  checked += 1;
  if (String(got) !== String(want)) failures.push(`${name}\n    got   ${String(got)}\n    want  ${String(want)}`);
}
function ok(name: string, condition: boolean): void {
  checked += 1;
  if (!condition) failures.push(name);
}

// --- The memo table, against ledger §H's file:line facts. -------------------
is('connection_request memo (index.md:487)', TRANSACTION_MEMO.connection_request, 'hcs-10:op:3:1');
is('connection_created memo (index.md:522, D-137)', TRANSACTION_MEMO.connection_created, 'hcs-10:op:4:1');
is('close_connection memo (index.md:682)', TRANSACTION_MEMO.close_connection, 'hcs-10:op:5:3');
is('message memo (index.md:646)', TRANSACTION_MEMO.message, 'hcs-10:op:6:3');
is('the transaction operation carries an EMPTY memo (D-94, T-P9-5)', JSON.stringify(TRANSACTION_OP_MEMO), '""');
is('topic-type enum: inbound', TOPIC_TYPE.inbound, 1);
is('topic-type enum: connection', TOPIC_TYPE.connection, 3);
ok(
  'every defined memo is of the form hcs-10:op:{n}:{n} (T-P9-5)',
  Object.values(TRANSACTION_MEMO).every((m) => /^hcs-10:op:\d+:\d+$/.test(m)),
);

// --- operator_id, and §7.2's fourth weld. -----------------------------------
is('operator_id is inboundTopicId@accountId', operatorId('0.0.10426553', '0.0.10426206'), '0.0.10426553@0.0.10426206');
is('and its account half is what a settlement is compared to', accountOf('0.0.10426553@0.0.10426206'), '0.0.10426206');
checked += 1;
try {
  accountOf('not-an-operator-id');
  failures.push('a malformed operator_id was accepted');
} catch {
  /* refusing is the pass */
}

// --- No chunkInfo, decoded from the transaction's own bytes. ----------------
function bodyOf(tx: Transaction): proto.proto.TransactionBody {
  const list = proto.proto.TransactionList.decode(tx.toBytes());
  const signed = proto.proto.SignedTransaction.decode(list.transactionList?.[0]?.signedTransactionBytes as Uint8Array);
  return proto.proto.TransactionBody.decode(signed.bodyBytes as Uint8Array);
}

const payer = AccountId.fromString('0.0.8641261');
const lane = '0.0.7000001';
const body = messageOperationBody('0.0.10426553@0.0.10426206', JSON.stringify({ p: 'wishmail', i: 0 }));
const message = Buffer.from(JSON.stringify(body), 'utf8');

const tx = new UnchunkedTopicMessageSubmitTransaction()
  .setTopicId(TopicId.fromString(lane))
  .setMessage(message)
  .setTransactionMemo(TRANSACTION_MEMO.message);
tx.setTransactionId(TransactionId.generate(payer))
  .setNodeAccountIds([AccountId.fromString('0.0.3')])
  .setRegenerateTransactionId(false);
tx.freezeWith(null);

const decoded = bodyOf(tx);
const submit = decoded.consensusSubmitMessage;
is('the frozen body carries NO chunkInfo (T-P9-7)', JSON.stringify(submit?.chunkInfo ?? null), 'null');
ok('the message bytes are preserved exactly', Buffer.from(submit?.message ?? []).equals(message));
is('the topic is the lane', submit?.topicID?.topicNum?.toString(), '7000001');
is('the transaction memo is HCS-10’s for a message', decoded.memo, TRANSACTION_MEMO.message);
ok('and the operation is within CHUNK_WIRE_MAX', message.length <= CHUNK_WIRE_MAX);

// The comparison that makes the override worth its existence.
const { TopicMessageSubmitTransaction } = await import('@hashgraph/sdk');
const plain = new TopicMessageSubmitTransaction().setTopicId(TopicId.fromString(lane)).setMessage(message);
plain
  .setTransactionId(TransactionId.generate(payer))
  .setNodeAccountIds([AccountId.fromString('0.0.3')])
  .setRegenerateTransactionId(false);
plain.freezeWith(null);
ok(
  'the ordinary SDK path DOES carry chunkInfo — which is why the override exists',
  bodyOf(plain).consensusSubmitMessage?.chunkInfo != null,
);

if (failures.length > 0) {
  console.error(`check:hcs10 FAILED — ${failures.length} of ${checked} assertions:`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log(
  `check:hcs10 PASS — ${checked} assertions: HCS-10's four memos at their file:line, the transaction ` +
    'operation carrying an empty one, and a message operation whose frozen protobuf carries no chunkInfo ' +
    'where the ordinary SDK path does.',
);
process.exit(0);
