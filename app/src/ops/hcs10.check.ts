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
  connectionTopicMemo,
  connectionTopicMemoOf,
  inboundTopicMemoOf,
  messageOperationBody,
  operatorId,
  outboundConnectionRequestBody,
  outboundConnectionCreatedByAcceptor,
  outboundConnectionCreatedByRequester,
  outboundCreatedRecordFor,
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

// --- The outbound record, and the two memos a Verifier now reads. -----------
//
// FETCHED 2026-09-10 at the pin (git blob sha 0cb5d2eb…, verified against
// spec/pins.json). The outbound `connection_request` RECORD is a different
// operation from the ring: `index.md:553` has its `operator_id` name "the agent
// which is being requested … (not the agent making the request)", and
// `index.md:554-555` make `outbound_topic_id` and `connection_request_id`
// required. This implementation posted the INBOUND body to both topics until
// now, which is the shape `index.md:489` gives and not this one.
const target = operatorId('0.0.5000', '0.0.5001');
const outbound = outboundConnectionRequestBody(target, '0.0.6002', 41);
is('the outbound record names the agent BEING requested (index.md:553)', outbound['operator_id'], target);
is('and its own topic (index.md:554)', outbound['outbound_topic_id'], '0.0.6002');
is('and the ring sequence number it records (index.md:555)', outbound['connection_request_id'], 41);
is('and its memo is the outbound one, not the inbound one (index.md:547)', TRANSACTION_MEMO.outbound_connection_request, `hcs-10:op:3:${TOPIC_TYPE.outbound}`);
ok(
  'which is NOT the memo the ring itself carries — two operations, two memos',
  String(TRANSACTION_MEMO.outbound_connection_request) !== String(TRANSACTION_MEMO.connection_request),
);

// --- D-174: the Outbound Connection Created record, on BOTH parties' logs ---
//
// THE PIN CONTRADICTS ITSELF ABOUT WHO WRITES IT (ledger §G-24, FETCHED
// 2026-09-10 at the pin, blob sha 0cb5d2eb… verified against spec/pins.json):
//
//   index.md:529  "Record of a connection created BY THE AGENT"      -> acceptor
//   index.md:560  "Recorded on an agent's Outbound Topic when it
//                  successfully processes a connection_request and
//                  creates a new Connection Topic"                   -> acceptor
//   index.md:585  confirmed_request_id: "the sequence number of the
//                  connection_created message RECEIVED on the
//                  agent's inbound topic"                            -> requester
//   index.md:586  connection_request_id: "the original
//                  connection_request SENT BY THIS AGENT"            -> requester
//   index.md:587  operator_id: "the agent that CONFIRMED the
//                  connection (the recipient of the original
//                  request)"                                         -> requester
//
// Sonic ruled that this deployment writes it on both logs at one message each,
// each under the reading that has that party writing it, so that a strict
// reader under EITHER reading finds the record it expects. The contradiction is
// recorded and not resolved: P-9 makes conformance to the blob.
const ACCEPTOR_OP = operatorId('0.0.8100', '0.0.8101');
const ACCEPTOR_LOG = '0.0.8102';
const REQUESTER_LOG = '0.0.8202';
const LANE = '0.0.8300';

const byAcceptor = outboundConnectionCreatedByAcceptor({
  connectionTopicId: LANE,
  outboundTopicId: ACCEPTOR_LOG,
  requestorOutboundTopicId: REQUESTER_LOG,
  confirmedRequestId: 9,
  connectionRequestId: 4,
  acceptorOperatorId: ACCEPTOR_OP,
});
const byRequester = outboundConnectionCreatedByRequester({
  connectionTopicId: LANE,
  outboundTopicId: REQUESTER_LOG,
  confirmedRequestId: 9,
  connectionRequestId: 4,
  acceptorOperatorId: ACCEPTOR_OP,
});

is('the outbound created memo is HCS-10 form (index.md:576)', TRANSACTION_MEMO.outbound_connection_created, `hcs-10:op:4:${TOPIC_TYPE.outbound}`);
ok(
  'and it is NOT the memo the answer on the doorbell carries — two operations, two memos',
  String(TRANSACTION_MEMO.outbound_connection_created) !== String(TRANSACTION_MEMO.connection_created),
);

// index.md:578-588 marks five fields required beyond `p` and `op`. Both
// records carry all of them, because a record missing one is not the record the
// standard names under either reading.
const REQUIRED = [
  'p',
  'op',
  'connection_topic_id',
  'outbound_topic_id',
  'requestor_outbound_topic_id',
  'confirmed_request_id',
  'connection_request_id',
  'operator_id',
] as const;
for (const field of REQUIRED) {
  ok(`the acceptor's record carries ${field} (index.md:578-588)`, byAcceptor[field] !== undefined);
  ok(`the requester's record carries ${field} (index.md:578-588)`, byRequester[field] !== undefined);
}
is('both are the connection_created operation', `${byAcceptor['op']}/${byRequester['op']}`, 'connection_created/connection_created');
is('both name the lane (index.md:582)', `${byAcceptor['connection_topic_id']}/${byRequester['connection_topic_id']}`, `${LANE}/${LANE}`);
is('each names the log it is stored on (index.md:583)', byAcceptor['outbound_topic_id'], ACCEPTOR_LOG);
is('and the requester names its own (index.md:583)', byRequester['outbound_topic_id'], REQUESTER_LOG);

// WHERE THE TWO READINGS PART, which is the whole reason both are written.
is(
  "the acceptor's requestor_outbound_topic_id is the OTHER party's log — load-bearing here (index.md:584)",
  byAcceptor['requestor_outbound_topic_id'],
  REQUESTER_LOG,
);
is(
  "the requester's is its own, which is what makes the field redundant under its reading",
  byRequester['requestor_outbound_topic_id'],
  REQUESTER_LOG,
);
is('both name the confirming agent in operator_id (index.md:587)', byRequester['operator_id'], ACCEPTOR_OP);
is('and under the acceptor reading that agent is the writer itself (index.md:529)', byAcceptor['operator_id'], ACCEPTOR_OP);
ok(
  'the two records agree about which request opened the lane (index.md:586)',
  byAcceptor['connection_request_id'] === byRequester['connection_request_id'],
);
ok(
  'and about which answer confirmed it (index.md:585)',
  byAcceptor['confirmed_request_id'] === byRequester['confirmed_request_id'],
);

// The idempotency reader both writers consult before writing: a log that already
// records this lane is not asked to record it twice (D-165's rule, on a log).
ok('a log holding the record for this lane is recognised', outboundCreatedRecordFor([byRequester], LANE));
ok('a log holding one for another lane is not', !outboundCreatedRecordFor([byRequester], '0.0.8399'));
ok('and neither is a log holding only the outbound REQUEST record', !outboundCreatedRecordFor([outbound], LANE));
ok('nor an empty log', !outboundCreatedRecordFor([], LANE));
ok('nor a log holding a message that is not an operation at all', !outboundCreatedRecordFor([null], LANE));

// §11.4's binding walk reads two memos and nothing else identifies the parties
// to it, so both are parsed here against the forms the pin gives.
const laneMemo = connectionTopicMemo('0.0.7100', 3);
is('the connection-topic memo is HCS-10 form (index.md:279)', laneMemo, 'hcs-10:1:60:2:0.0.7100:3');
is('and it round-trips to the doorbell it names', connectionTopicMemoOf(laneMemo)?.doorbell, '0.0.7100');
is('and to the connection id', connectionTopicMemoOf(laneMemo)?.connectionId, 3);
is('an inbound memo names the account it belongs to (index.md:246)', inboundTopicMemoOf('hcs-10:0:60:0:0.0.7101')?.account, '0.0.7101');
is('an OUTBOUND memo is not an inbound one and does not parse as one', String(inboundTopicMemoOf('hcs-10:0:60:1')), 'null');
is('nor does a registry memo', String(inboundTopicMemoOf('hcs-10:0:300:3')), 'null');
is('and a connection memo is not an inbound one either', String(inboundTopicMemoOf(laneMemo)), 'null');
is('a lane memo missing its doorbell does not parse', String(connectionTopicMemoOf('hcs-10:1:60:3')), 'null');

if (failures.length > 0) {
  console.error(`check:hcs10 FAILED — ${failures.length} of ${checked} assertions:`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log(
  `check:hcs10 PASS — ${checked} assertions: HCS-10's memos at their file:line, the transaction ` +
    'operation carrying an empty one, a message operation whose frozen protobuf carries no chunkInfo ' +
    'where the ordinary SDK path does, the outbound connection record in the shape the pin gives it ' +
    'rather than the inbound one, the Outbound Connection Created record in BOTH of the readings the pin ' +
    'contradicts itself between, and the two topic memos §11.4 reads a lane birth from.',
);
process.exit(0);
