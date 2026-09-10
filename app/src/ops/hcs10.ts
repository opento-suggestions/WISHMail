/**
 * HCS-10 operations — the memos, and the one transaction that must not be
 * chunked.
 *
 * §6.1: "Every consensus operation a tool submits MUST carry the transaction
 * memo HCS-10 defines for that operation, and MUST carry none where HCS-10
 * defines none: at the pinned revision, `connection_request`,
 * `connection_created`, `message`, and `close_connection` carry
 * `hcs-10:op:<operation>:<topic type>`, and the `transaction` operation carries
 * no memo." (D-94, T-P9-5.)
 *
 * Conformance: T-P9-5, T-P9-7, T-P9-6, T-P17-2.
 */
import { Client, TopicMessageSubmitTransaction, Transaction } from '@hashgraph/sdk';

/**
 * HCS-10's **transaction-memo** topic-type enum, which is not its other one.
 * D-94, recon C-4: the standard carries two inverse enums and this is the one
 * its own worked example uses.
 */
export const TOPIC_TYPE = { registry: 0, inbound: 1, outbound: 2, connection: 3 } as const;

/**
 * The operation enums, each at its file:line in the pinned blob
 * (`0cb5d2eb…`, FETCHED 2026-09-06 / 2026-09-07 and recorded in ledger §H).
 */
export const TRANSACTION_MEMO = {
  /** `index.md:487` — on the recipient's inbound topic. */
  connection_request: `hcs-10:op:3:${TOPIC_TYPE.inbound}`,
  /** `index.md:522` — "on its own Inbound Topic in response to a connection_request" (D-137). */
  connection_created: `hcs-10:op:4:${TOPIC_TYPE.inbound}`,
  /** `index.md:682` — on the connection topic. */
  close_connection: `hcs-10:op:5:${TOPIC_TYPE.connection}`,
  /** `index.md:646` — on the connection topic; this is what an envelope chunk rides in. */
  message: `hcs-10:op:6:${TOPIC_TYPE.connection}`,
  /**
   * `index.md:547` — the requester's own RECORD of its ring, on its outbound
   * topic. A different operation from the ring itself, with a different memo and
   * a different body (FETCHED 2026-09-10 at the pin, `index.md:549-556`).
   */
  outbound_connection_request: `hcs-10:op:3:${TOPIC_TYPE.outbound}`,
} as const;

/**
 * The `transaction` operation carries NO memo — HCS-10 gives it no enum slot at
 * the pin (D-94, recon C-5/O-4), and §6.1 says a tool "MUST carry none where
 * HCS-10 defines none". An empty string, not an omitted field: T-P9-5 checks
 * that every `transaction` operation "carries an empty memo".
 */
export const TRANSACTION_OP_MEMO = '';

/**
 * An HCS-10 `message` operation whose transaction is NOT chunked.
 *
 * §7.4: a chunk "MUST be submitted as one HCS message with no transport-layer
 * chunking", and T-P9-7 checks that every fixture message "carries no
 * `chunkInfo`".
 *
 * `TopicMessageSubmitTransaction.freezeWith` sets `_chunkInfo` inside its chunk
 * loop and builds the signed transactions there, so EVERY message it produces
 * carries `chunkInfo` — including a single-chunk one, where it says
 * `{total: 1, number: 1}`. Verified on consensus, not by reading: our own price
 * list at `0.0.10426551` sequence 1 carries it. That message is not an envelope,
 * so §7.4 does not reach it; an envelope chunk it would have made unconformant
 * and unwithdrawable.
 *
 * `_makeTransactionData()` omits the field entirely when `_chunkInfo` is null,
 * and the base class's `freezeWith` never sets it. So this overrides exactly one
 * method and changes nothing else. Verified by decoding both transaction bodies
 * from their own protobuf bytes, without submitting either.
 *
 * This is also as far as "HCS-10 by hand vs SDK" needed to go: the SDK's
 * transaction classes, with one override scoped to the one operation whose wire
 * form §7.4 constrains.
 *
 * A caller must still keep the whole operation at or under `CHUNK_WIRE_MAX`;
 * `chunkCiphertext` is what guarantees that, and this class would happily send a
 * message the network then rejects for size.
 */
export class UnchunkedTopicMessageSubmitTransaction extends TopicMessageSubmitTransaction {
  override freezeWith(client: Client | null): this {
    return Transaction.prototype.freezeWith.call(this, client) as this;
  }
}

/** §7.4's wrapper: the `message` operation carrying a Chunk as a JSON string in `data`. */
export function messageOperationBody(operatorId: string, chunkJson: string): Record<string, unknown> {
  return { p: 'hcs-10', op: 'message', operator_id: operatorId, data: chunkJson };
}

/**
 * §7.1's first contact. `operator_id` is HCS-10's `inboundTopicId@accountId`,
 * which is what identifies the requester; no header field names a sender.
 */
export function connectionRequestBody(operatorId: string, memo?: string): Record<string, unknown> {
  return { p: 'hcs-10', op: 'connection_request', operator_id: operatorId, ...(memo === undefined ? {} : { m: memo }) };
}

/**
 * The requester's own record of the ring, on its OUTBOUND topic — a different
 * operation from the ring, and this is not the body above.
 *
 * FETCHED 2026-09-10 at the pin (`index.md:549-556`): `operator_id` names "the
 * agent which is being requested … (not the agent making the request)", and
 * `outbound_topic_id` and `connection_request_id` are both REQUIRED. The inbound
 * form (`index.md:489`) names the requester instead, and this implementation
 * posted that one to both topics until now — naming itself where the standard
 * names the target, with two required fields absent. P-9 is strict HCS-10, so
 * the shape is the standard's and not a convenience.
 *
 * `connection_request_id` is the sequence number the ring landed at on the
 * TARGET's inbound topic, which is what links this record to it.
 */
export function outboundConnectionRequestBody(
  targetOperatorId: string,
  outboundTopicId: string,
  connectionRequestId: number,
  memo?: string,
): Record<string, unknown> {
  return {
    p: 'hcs-10',
    op: 'connection_request',
    operator_id: targetOperatorId,
    outbound_topic_id: outboundTopicId,
    connection_request_id: connectionRequestId,
    ...(memo === undefined ? {} : { m: memo }),
  };
}

/**
 * §7.1's connection-topic memo, built: `hcs-10:1:{ttl}:2:{inboundTopicId}:{connectionId}`
 * (`index.md:279`). `indexed = 1` means "only the latest message should be
 * read", and WISHMail keeps the memo and overrides the hint: §7.1's own sentence
 * is "a lane is mail, and every message on it is read", and T-P9-10 is the test
 * that a lane wearing this memo is nevertheless reassembled in full. Strict
 * HCS-10 on the wire, our reading rule in the reader (D-95).
 *
 * It lives here, beside its parser, because D-171 made the `inboundTopicId` half
 * load-bearing: a Verifier reads it to find the doorbell a lane was born on. A
 * builder in one file and a reader in another is how the two drift apart.
 */
export function connectionTopicMemo(inboundTopicId: string, connectionId: number, ttl: number = 60): string {
  return `hcs-10:1:${ttl}:2:${inboundTopicId}:${connectionId}`;
}

/**
 * §7.1's connection-topic memo, parsed: `hcs-10:1:{ttl}:2:{inboundTopicId}:{connectionId}`
 * (`index.md:279`). The `inboundTopicId` is the doorbell the lane was born on,
 * and D-171 makes it what a Verifier reads to appraise that birth — so this is
 * the memo's load-bearing half, not the non-indexed hint.
 */
export function connectionTopicMemoOf(memo: string): { readonly doorbell: string; readonly connectionId: number } | null {
  const m = /^hcs-10:1:(\d+):2:([0-9]+\.[0-9]+\.[0-9]+):(\d+)$/.exec(memo);
  if (m === null) return null;
  return { doorbell: m[2] as string, connectionId: Number(m[3]) };
}

/**
 * §4.4's inbound-topic memo, parsed: `hcs-10:0:{ttl}:0:{accountId}` (`index.md:246`).
 * A doorbell's memo names the account it belongs to, which is how a Verifier
 * learns whose door a lane was born at without resolving anybody (D-171).
 */
export function inboundTopicMemoOf(memo: string): { readonly account: string } | null {
  const m = /^hcs-10:0:(\d+):0:([0-9]+\.[0-9]+\.[0-9]+)$/.exec(memo);
  if (m === null) return null;
  return { account: m[2] as string };
}

/**
 * The acceptor's answer, submitted on its OWN inbound topic (`index.md:498`) —
 * which is why D-137 exempts the owner's key at the doorbell's creation, and why
 * T-P7-4 tests that an owner's answer assesses it zero stamps.
 */
export function connectionCreatedBody(
  operatorId: string,
  connectionTopicId: string,
  connectionId: number,
  connectedAccountId: string,
): Record<string, unknown> {
  return {
    p: 'hcs-10',
    op: 'connection_created',
    connection_topic_id: connectionTopicId,
    connected_account_id: connectedAccountId,
    operator_id: operatorId,
    connection_id: connectionId,
  };
}

/** §7.1: a lane ends at a `close_connection` from either party. */
export function closeConnectionBody(operatorId: string, reason?: string): Record<string, unknown> {
  return {
    p: 'hcs-10',
    op: 'close_connection',
    operator_id: operatorId,
    ...(reason === undefined ? {} : { reason }),
  };
}

/** HCS-10's `operator_id`: `inboundTopicId@accountId`. */
export function operatorId(inboundTopicId: string, accountId: string): string {
  return `${inboundTopicId}@${accountId}`;
}

/** The account half of an `operator_id` — §7.2's fourth weld compares this to the settlement's `from`. */
export function accountOf(operator: string): string {
  const at = operator.lastIndexOf('@');
  if (at < 0) throw new Error(`hcs10: ${operator} is not an operator_id of the form inboundTopicId@accountId`);
  return operator.slice(at + 1);
}
