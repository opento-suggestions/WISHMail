/**
 * The `SchedulableTransactionBody` a return receipt rides in — read, and
 * written, at the same field numbers.
 *
 * §10.4 makes a receipt "the execution of a scheduled submission to the
 * recipient's manifest topic", and both a recipient and a Verifier have to see
 * INSIDE that schedule before it executes. `ack` must refuse "a schedule whose
 * inner submission does not name the envelope identifier, chunk 0's postmark,
 * and the epoch under which the envelope opened" (T-P1-9) — a check on the
 * body's own bytes — and §11.4 has a Verifier read "to which topic its inner
 * submission wrote". A mirror node hands both of them the same thing: the
 * schedule record's `transaction_body`, base64 of this message.
 *
 * WHY THIS IS FORTY LINES OF PROTOBUF AND NOT A DEPENDENCY — the same answer
 * `core/protokey.ts` and `counter/body.ts` already gave, and it has not
 * changed. The SDK's generated decoder resolves from a `node_modules` above
 * this repository and would pass here and fail on a clean clone. A
 * `ScheduleInfoQuery` against a consensus node returns the structure parsed and
 * is a PAID query, so a Verifier would need an account and a balance to check a
 * receipt — exactly what P-4 forbids. So the primitives are `protokey.ts`'s,
 * exported rather than copied.
 *
 * THE FIELD NUMBERS ARE PROBED, NOT REMEMBERED, and the probe is in
 * `check:letter`: it builds a real `ScheduleCreateTransaction` with
 * `@hashgraph/sdk`, freezes it OFFLINE, and asserts that this decoder reads back
 * the topic and the message that went in, and that this encoder's bytes are the
 * SDK's own bytes for the same input. `protokey.ts`'s first version read
 * `ThresholdKey.keys` as `Key.ed25519` because both are field 2; the field this
 * file would most plausibly get wrong from memory is
 * `SchedulableTransactionBody.consensusSubmitMessage`, which is **21** and not
 * the **27** that `TransactionBody` uses for the same body. A decoder with no
 * court is a guess with a type signature.
 *
 * Read off the SDK's own frozen bytes, 2026-09-10 (probe recorded in
 * `app/OPERATIONS.md`, Step 6 checkpoint two):
 *
 *   SchedulableTransactionBody { uint64 transactionFee = 1; string memo = 2;
 *     oneof data { ... ConsensusSubmitMessageTransactionBody
 *                      consensusSubmitMessage = 21; ... } }
 *   ConsensusSubmitMessageTransactionBody { TopicID topicID = 1; bytes message = 2;
 *     ConsensusMessageChunkInfo chunkInfo = 3; }
 *   TopicID { int64 shard = 1; int64 realm = 2; int64 num = 3; }
 *
 * And, for the outer message, which this file does not decode but the probe
 * walks through to reach the inner one:
 *
 *   TransactionBody { ... ScheduleCreateTransactionBody scheduleCreate = 42; }
 *   ScheduleCreateTransactionBody { SchedulableTransactionBody
 *     scheduledTransactionBody = 1; Key adminKey = 2; string memo = 3;
 *     AccountID payerAccountID = 4; Timestamp expirationTime = 5;
 *     bool waitForExpiry = 13; }
 *
 * Conformance: T-P1-8, T-P1-9, T-P16-2.
 */
import { fields } from './protokey.js';

/** `SchedulableTransactionBody.consensusSubmitMessage`. NOT 27 — see the head. */
const SCHEDULABLE_SUBMIT_MESSAGE = 21;
/** `ConsensusSubmitMessageTransactionBody.topicID` / `.message` / `.chunkInfo`. */
const SUBMIT_TOPIC_ID = 1;
const SUBMIT_MESSAGE = 2;
const SUBMIT_CHUNK_INFO = 3;
/** `TopicID.shard` / `.realm` / `.num`. */
const ENTITY_SHARD = 1;
const ENTITY_REALM = 2;
const ENTITY_NUM = 3;

export class ScheduleBodyUndecodable extends Error {
  constructor(message: string) {
    super(`schedulable body: ${message}`);
    this.name = 'ScheduleBodyUndecodable';
  }
}

/** The one shape §10.4 schedules: one message, to one topic. */
export interface ScheduledSubmission {
  readonly topicId: string;
  readonly message: Buffer;
  /** §7.4 forbids transport chunking on an envelope chunk; a receipt is not one, and this reports it anyway. */
  readonly chunked: boolean;
}

/** `shard.realm.num`, the form every topic id is written in (§5.1). */
function entityId(b: Buffer): string {
  let shard = 0;
  let realm = 0;
  let num = -1;
  fields(b, (field, wire, _body, value) => {
    if (wire !== 0) return;
    if (field === ENTITY_SHARD) shard = value;
    else if (field === ENTITY_REALM) realm = value;
    else if (field === ENTITY_NUM) num = value;
  });
  if (num < 0) throw new ScheduleBodyUndecodable('the inner submission names no topic number');
  return `${shard}.${realm}.${num}`;
}

/**
 * A `SchedulableTransactionBody` to the submission it schedules, or a refusal.
 *
 * A schedule of any other kind is refused rather than reported as an empty
 * submission: §10.4 admits exactly one inner transaction, and a caller that got
 * `null` back for a `CryptoTransfer` would have to invent what to do with it.
 * `ack` turns this refusal into `ACK_NOT_OPENED` (T-P1-9).
 */
export function decodeScheduledSubmission(body: Buffer): ScheduledSubmission {
  let found: Buffer | null = null;
  let otherField = -1;
  fields(body, (field, wire, part) => {
    if (wire !== 2) return;
    if (field === SCHEDULABLE_SUBMIT_MESSAGE) found = Buffer.from(part);
    // 1 is the fee and 2 the memo; every other length-delimited field at this
    // level is a different `oneof data` branch and therefore a different kind
    // of scheduled transaction.
    else if (field > 2 && otherField < 0) otherField = field;
  });
  if (found === null) {
    throw new ScheduleBodyUndecodable(
      otherField < 0
        ? 'it schedules no transaction at all'
        : `it schedules a transaction of kind ${otherField} and §10.4 admits only a ConsensusSubmitMessage (field ${SCHEDULABLE_SUBMIT_MESSAGE})`,
    );
  }

  let topicId = '';
  let message = Buffer.alloc(0);
  let chunked = false;
  fields(found, (field, wire, part) => {
    if (wire !== 2) return;
    if (field === SUBMIT_TOPIC_ID) topicId = entityId(part);
    else if (field === SUBMIT_MESSAGE) message = Buffer.from(part);
    else if (field === SUBMIT_CHUNK_INFO) chunked = true;
  });
  if (topicId === '') throw new ScheduleBodyUndecodable('the inner submission names no topic');
  return { topicId, message, chunked };
}

/* ------------------------------------------------------------------ */
/* The writer, for the modelled ledger — so the offline court decodes   */
/* bytes of the same shape the network holds, and the encoder is        */
/* courted against the SDK's own output rather than against itself.      */
/* ------------------------------------------------------------------ */

/** A protobuf varint. */
function putVarint(out: number[], value: number): void {
  let v = value;
  for (;;) {
    const byte = v % 128;
    v = Math.floor(v / 128);
    if (v === 0) {
      out.push(byte);
      return;
    }
    out.push(byte | 0x80);
  }
}

/** One length-delimited field: its tag, its length, its body. */
function putBytes(out: number[], field: number, body: Buffer): void {
  putVarint(out, field * 8 + 2);
  putVarint(out, body.length);
  for (const b of body) out.push(b);
}

/** One varint field. */
function putNumber(out: number[], field: number, value: number): void {
  putVarint(out, field * 8);
  putVarint(out, value);
}

/** `TopicID { shard = 1; realm = 2; num = 3 }`, from `shard.realm.num`. */
function encodeEntityId(id: string): Buffer {
  const parts = id.split('.').map((p) => Number(p));
  if (parts.length !== 3 || parts.some((n) => !Number.isInteger(n) || n < 0)) {
    throw new ScheduleBodyUndecodable(`${id} is not an entity id of the form shard.realm.num (§5.1)`);
  }
  const out: number[] = [];
  // The SDK writes every one of the three, including zeros, so this does too:
  // the encoder is courted byte-for-byte against its output.
  putNumber(out, ENTITY_SHARD, parts[0] as number);
  putNumber(out, ENTITY_REALM, parts[1] as number);
  putNumber(out, ENTITY_NUM, parts[2] as number);
  return Buffer.from(out);
}

/**
 * The `SchedulableTransactionBody` for one submission — the bytes the network
 * holds and a mirror node hands back as `transaction_body`.
 *
 * `transactionFee` is the maximum the scheduled submission declares, in
 * tinybars. It is an argument rather than a constant because it is the SDK's
 * default that a real ScheduleCreate carries, and the court compares these
 * bytes to the SDK's.
 */
export function encodeScheduledSubmission(s: {
  readonly topicId: string;
  readonly message: Buffer;
  readonly transactionFee: number;
  readonly memo?: string;
}): Buffer {
  const inner: number[] = [];
  putBytes(inner, SUBMIT_TOPIC_ID, encodeEntityId(s.topicId));
  putBytes(inner, SUBMIT_MESSAGE, s.message);

  const out: number[] = [];
  putNumber(out, 1, s.transactionFee);
  putBytes(out, 2, Buffer.from(s.memo ?? '', 'utf8'));
  putBytes(out, SCHEDULABLE_SUBMIT_MESSAGE, Buffer.from(inner));
  return Buffer.from(out);
}
