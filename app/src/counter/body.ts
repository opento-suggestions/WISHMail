/**
 * Reading a `TransactionBody` the counter is asked to PAY FOR — D-168's court.
 *
 * §6.1's carry is the Postmaster paying for a body the agent signed. Under a
 * provisioning purchase the counter carries the mailbox it sold (D-168), and
 * "carry" without a policy is a blank cheque: an account with a balance, a
 * signature it will add to anything, and no reason not to. So the counter reads
 * every body before it signs it, and refuses everything that is not a row of
 * `ops/template.ts` for the holder this reference is about.
 *
 * IT DECODES THE BYTES IT SIGNS, and that is the whole design. The alternative
 * — the Correspondent sends a whole serialized transaction, the counter parses
 * it with the SDK's typed getters and signs the body it derives from that parse
 * — is more comfortable to write and weaker to hold: it inspects one
 * representation and signs another, and the two are the same only because the
 * same object produced them. Here the argument to the policy IS the argument to
 * the signature. There is no second representation for the check to be right
 * about while the signature is wrong.
 *
 * WHY NOT `@hashgraph/proto`. The same reason `core/protokey.ts` gives: it
 * resolves today only from a `node_modules` directory ABOVE this repository, so
 * importing it would pass here and fail on a clean clone. The primitives are
 * that file's, exported rather than copied.
 *
 * THE FIELD NUMBERS ARE PROBED, NOT REMEMBERED. Every number below was read off
 * a body the SDK itself froze, and `check:correspondent` re-reads them the same
 * way on every run: it builds each transaction kind with `@hashgraph/sdk`,
 * freezes it offline, and asserts this decoder returns what was built. That is
 * not politeness. `core/protokey.ts`'s first version read `ThresholdKey.keys`
 * as `Key.ed25519` because both are field 2, and returned a 68-byte "public
 * key" that matched nobody; and the field this file would most plausibly have
 * got wrong from memory — `CryptoUpdateTransactionBody.memo` — is 14, not the
 * 26 a confident guess produces. A decoder with no court is a guess with a
 * type signature.
 *
 * From `hedera-protobufs/services`, and confirmed by probe 2026-09-09:
 *
 *   TransactionBody { TransactionID transactionID = 1; AccountID nodeAccountID = 2;
 *     uint64 transactionFee = 3; Duration transactionValidDuration = 4;
 *     string memo = 6; oneof data {
 *       CryptoUpdateTransactionBody       cryptoUpdateAccount  = 15;
 *       ConsensusCreateTopicTransactionBody   consensusCreateTopic = 24;
 *       ConsensusSubmitMessageTransactionBody consensusSubmitMessage = 27; } }
 *   TransactionID { Timestamp validStart = 1; AccountID accountID = 2; }
 *   AccountID | TopicID | TokenID { int64 shard = 1; int64 realm = 2; int64 num = 3; }
 *   ConsensusCreateTopicTransactionBody { string memo = 1; Key adminKey = 2;
 *     Key submitKey = 3; Duration autoRenewPeriod = 6; AccountID autoRenewAccount = 7;
 *     Key feeScheduleKey = 8; repeated Key feeExemptKeyList = 9;
 *     repeated FixedCustomFee customFees = 10; }
 *   FixedCustomFee { FixedFee fixed_fee = 1; AccountID fee_collector_account_id = 2; }
 *   FixedFee { int64 amount = 1; TokenID denominating_token_id = 2; }
 *   ConsensusSubmitMessageTransactionBody { TopicID topicID = 1; bytes message = 2;
 *     ConsensusMessageChunkInfo chunkInfo = 3; }
 *   CryptoUpdateTransactionBody { AccountID accountIDToUpdate = 2; Key key = 3;
 *     ... ; google.protobuf.StringValue memo = 14; ... }
 *
 * Conformance: T-P13-1, T-P13-3, T-P4-3, T-P17-1.
 */
import { fields, keysOfProtobuf, varint } from '../core/protokey.js';

export class BodyUndecodable extends Error {
  constructor(message: string) {
    super(`transaction body: ${message}`);
    this.name = 'BodyUndecodable';
  }
}

/** `shard.realm.num`, the form every account, topic and token id is written in. */
function entityId(b: Buffer): string {
  let shard = 0;
  let realm = 0;
  let num = -1;
  fields(b, (field, wire, _body, value) => {
    if (wire !== 0) return;
    if (field === 1) shard = value;
    else if (field === 2) realm = value;
    else if (field === 3) num = value;
  });
  if (num < 0) throw new BodyUndecodable('an entity id names no number (it may be an alias, which no row of the template uses)');
  return `${shard}.${realm}.${num}`;
}

/** Exactly one public key, raw hex, or a refusal. A single key is what every row names. */
function singleKey(b: Buffer): string {
  const keys = keysOfProtobuf(b);
  if (keys.length !== 1) {
    throw new BodyUndecodable(`a key slot names ${keys.length} keys and every row of the template names exactly one`);
  }
  return keys[0] as string;
}

/** `Timestamp { int64 seconds = 1; int32 nanos = 2; }`, as a transaction id spells it. */
function timestamp(b: Buffer): string {
  let seconds = 0;
  let nanos = 0;
  fields(b, (field, wire, _body, value) => {
    if (wire !== 0) return;
    if (field === 1) seconds = value;
    else if (field === 2) nanos = value;
  });
  return `${seconds}.${String(nanos).padStart(9, '0')}`;
}

/** A `google.protobuf.StringValue` — `{ string value = 1; }`. */
function stringValue(b: Buffer): string {
  let out = '';
  fields(b, (field, wire, body) => {
    if (wire === 2 && field === 1) out = body.toString('utf8');
  });
  return out;
}

export interface FixedFee {
  readonly amount: number;
  readonly token: string;
  readonly collector: string;
}

export interface TopicCreateBody {
  readonly kind: 'topic-create';
  readonly memo: string;
  readonly adminKey: string | null;
  readonly submitKey: string | null;
  readonly feeScheduleKey: string | null;
  readonly autoRenewAccount: string | null;
  readonly feeExemptKeys: readonly string[];
  readonly fees: readonly FixedFee[];
}

export interface SubmitMessageBody {
  readonly kind: 'submit-message';
  readonly topicId: string;
  readonly message: Buffer;
  /** §7.4 forbids `chunkInfo` on an envelope chunk; the counter reports it and the policy decides. */
  readonly chunked: boolean;
}

export interface AccountUpdateBody {
  readonly kind: 'account-update';
  readonly account: string;
  readonly memo: string | null;
  /**
   * Every field number this body sets besides the account and the memo.
   *
   * Named rather than ignored: an `AccountUpdateTransaction` can rotate the
   * account's KEY, and a counter that paid for one would have paid to hand the
   * account it just sold to somebody else. The policy requires this list empty.
   */
  readonly otherFields: readonly number[];
}

export type DecodedBody =
  | TopicCreateBody
  | SubmitMessageBody
  | AccountUpdateBody
  | { readonly kind: 'other'; readonly field: number };

export interface DecodedTransaction {
  /**
   * The transaction id this body will land under — `0.0.n@seconds.nanos`.
   *
   * The counter records it against the row it carried, and that record is the
   * only way it can later say what the body BECAME: a signature is made before
   * consensus and a topic id exists only after, so the receipt's coordinates are
   * read back from the mirror under these ids and never guessed (§5.4).
   */
  readonly transactionId: string;
  /** The payer — `transactionID.accountID`. Under carry this must be the Postmaster's. */
  readonly payer: string;
  readonly node: string;
  /** The maximum fee this body authorises, in tinybars. The counter's ceiling reads it. */
  readonly transactionFee: number;
  /** The TRANSACTION memo, which is HCS-10's operation memo and not a topic's. */
  readonly memo: string;
  readonly body: DecodedBody;
}

function topicCreate(b: Buffer): TopicCreateBody {
  let memo = '';
  let adminKey: string | null = null;
  let submitKey: string | null = null;
  let feeScheduleKey: string | null = null;
  let autoRenewAccount: string | null = null;
  const feeExemptKeys: string[] = [];
  const fees: FixedFee[] = [];
  fields(b, (field, wire, body) => {
    if (wire !== 2) return;
    if (field === 1) memo = body.toString('utf8');
    else if (field === 2) adminKey = singleKey(body);
    else if (field === 3) submitKey = singleKey(body);
    else if (field === 7) autoRenewAccount = entityId(body);
    else if (field === 8) feeScheduleKey = singleKey(body);
    else if (field === 9) feeExemptKeys.push(singleKey(body));
    else if (field === 10) fees.push(fixedCustomFee(body));
    // field 6 is the auto-renew PERIOD, a Duration. Not read: no row of the
    // template declares one, the network supplies its own default, and a rule
    // that asserted a value would be asserting a network parameter.
  });
  return { kind: 'topic-create', memo, adminKey, submitKey, feeScheduleKey, autoRenewAccount, feeExemptKeys, fees };
}

function fixedCustomFee(b: Buffer): FixedFee {
  let amount = 0;
  let token = '';
  let collector = '';
  fields(b, (field, wire, body) => {
    if (wire !== 2) return;
    if (field === 1) {
      fields(body, (f2, w2, b2, v2) => {
        if (f2 === 1 && w2 === 0) amount = v2;
        else if (f2 === 2 && w2 === 2) token = entityId(b2);
      });
    } else if (field === 2) collector = entityId(body);
  });
  return { amount, token, collector };
}

function submitMessage(b: Buffer): SubmitMessageBody {
  let topicId = '';
  let message = Buffer.alloc(0);
  let chunked = false;
  fields(b, (field, wire, body) => {
    if (wire !== 2) return;
    if (field === 1) topicId = entityId(body);
    else if (field === 2) message = Buffer.from(body);
    else if (field === 3) chunked = true;
  });
  return { kind: 'submit-message', topicId, message, chunked };
}

function accountUpdate(b: Buffer): AccountUpdateBody {
  let account = '';
  let memo: string | null = null;
  const otherFields: number[] = [];
  fields(b, (field, wire, body) => {
    if (field === 2 && wire === 2) account = entityId(body);
    else if (field === 14 && wire === 2) memo = stringValue(body);
    else otherFields.push(field);
  });
  return { kind: 'account-update', account, memo, otherFields };
}

/**
 * A frozen transaction's signable body bytes to what they say.
 *
 * These are exactly the bytes `signWith` hands a signer —
 * `signableNodeBodyBytesList[i].signableTransactionBodyBytes` — which is why a
 * decode of them is a decode of the thing being signed and not of a copy.
 */
export function decodeTransactionBody(bytes: Buffer): DecodedTransaction {
  let payer = '';
  let validStart = '';
  let node = '';
  let transactionFee = 0;
  let memo = '';
  let body: DecodedBody = { kind: 'other', field: -1 };
  fields(bytes, (field, wire, part, value) => {
    if (field === 3 && wire === 0) transactionFee = value;
    if (wire !== 2) return;
    if (field === 1) {
      fields(part, (f2, w2, b2) => {
        if (f2 === 1 && w2 === 2) validStart = timestamp(b2);
        else if (f2 === 2 && w2 === 2) payer = entityId(b2);
      });
    } else if (field === 2) node = entityId(part);
    else if (field === 6) memo = part.toString('utf8');
    else if (field === 15) body = accountUpdate(part);
    else if (field === 24) body = topicCreate(part);
    else if (field === 27) body = submitMessage(part);
    else if (field >= 7) body = { kind: 'other', field };
  });
  if (payer === '') throw new BodyUndecodable('the body names no payer');
  if (validStart === '') throw new BodyUndecodable('the body names no valid start');
  if (node === '') throw new BodyUndecodable('the body names no consensus node');
  return { transactionId: `${payer}@${validStart}`, payer, node, transactionFee, memo, body };
}

/** The primitives, re-exported for the check that courts this file. */
export { fields, varint };
