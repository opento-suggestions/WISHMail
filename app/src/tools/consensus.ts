/**
 * The consensus surface the six tools speak to — reads on one side, writes on
 * the other, and the line between them is P-4.
 *
 * §6.1's table is the whole design of this file. `resolve`, `inbox` and
 * `verify` read consensus and write none of it; `send`, `buy_stamp` and `ack`
 * write. So the read half is its own interface: a `Verifier` is handed a
 * `Reader` and there is nothing in its hands to configure, key, pay for, or
 * broker with. §11.1: "A mirror node is a read interface, not a source … A
 * mirror node is not a broker (P-4), and reading through one requires no key,
 * credit, or credential." A type that cannot write is how that is enforced
 * rather than promised.
 *
 * Two implementations satisfy this: `tools/memory.ts`, which is consensus as a
 * data structure and is what the readers are exercised against before anything
 * is signed; and the live one, which is `ops/mirror.ts` for reads and
 * `ops/hedera.ts` for writes. The tools know neither.
 *
 * Conformance: T-P4-1, T-P4-2, T-P4-3, T-P3-1.
 */

/** One HCS message, as consensus recorded it. §5.7's postmark is built from this. */
export interface TopicMessage {
  readonly topicId: string;
  readonly sequenceNumber: number;
  /** `seconds.nanos` (§5.1). */
  readonly consensusTimestamp: string;
  /** base64, as the mirror node returns it (§5.1). */
  readonly runningHash: string;
  readonly runningHashVersion: number;
  /** The message bytes as submitted, UTF-8. */
  readonly contents: string;
  /**
   * The account that PAID. Not the sender: §7.2 is explicit that "no header
   * field names a sender" and that the sender is the account that affixed the
   * postage. The Postmaster pays for most submissions (§3.5), so this field
   * names the Postmaster far more often than it names anyone of interest, and
   * no check in this implementation reads it for identity.
   */
  readonly payer: string;
}

/** §5.4's Settlement, observed: the affixing transfer as consensus recorded it. */
export interface Settlement {
  readonly ledgerTag: string;
  readonly txRef: string;
  readonly from: string;
  readonly to: string;
  readonly amount: number;
  readonly memo: string;
  readonly consensusTimestamp: string;
  readonly tokenId: string;
}

/** A HIP-991 custom fee on a topic, as consensus holds it (§4.4). */
export interface CustomFee {
  readonly amount: number;
  readonly tokenId: string;
  readonly collector: string;
}

/**
 * A topic as consensus holds it. `submitKeys` is the flattened list of the keys
 * a threshold submit key names — §7.1 requires a lane's to be "a threshold of
 * the two agents' keys and MUST NOT include any other key" (T-P17-2), which is
 * a statement about the list and not about the threshold.
 */
export interface TopicInfo {
  readonly topicId: string;
  readonly memo: string;
  /** Empty where the topic has no submit key: a public topic. */
  readonly submitKeys: readonly string[];
  readonly adminKey: string | null;
  readonly customFees: readonly CustomFee[];
  readonly feeExemptKeys: readonly string[];
  readonly deleted: boolean;
}

/**
 * What a Verifier is given, and the whole of it (P-4). Every method here is a
 * read of public data; none of them can be given a key.
 */
export interface Reader {
  readonly ledgerTag: string;
  /** Every message on a topic, in consensus order. §7.1: a lane is mail, and every message on it is read. */
  messages(topicId: string): Promise<readonly TopicMessage[]>;
  /** A topic's own record, or null where the mirror holds none. */
  topic(topicId: string): Promise<TopicInfo | null>;
  /** One transfer by its reference — how a settlement is read from `hdr.st` (§11.2). */
  transfer(txRef: string): Promise<Settlement | null>;
  /** An account's HCS-11 memo (§9.2) — how a resolution reaches a declaration. */
  accountMemo(account: string): Promise<string | null>;
  /**
   * An account's key, as consensus holds it. §11.4 needs it by name: the
   * signature on a schedule's record is matched against "that account's key"
   * read from consensus, and §7.1's threshold lane is a statement about which
   * two keys a topic names.
   */
  accountKey(account: string): Promise<string | null>;
}

/** What a writing tool is given in addition. */
export interface Writer {
  /** The account this writer acts as: the sender, or the agent (§3.5). */
  readonly account: string;

  /**
   * Submit one HCS message under the agent's key. The transaction memo is
   * HCS-10's for the operation, or empty where HCS-10 defines none (§6.1,
   * T-P9-5). The envelope chunk path submits with no transport-layer chunking
   * (§7.4) — see the divergence in `app/OPERATIONS.md`.
   */
  submitMessage(topicId: string, operation: Record<string, unknown>, transactionMemo: string): Promise<TopicMessage>;

  /**
   * The reference the next transfer will carry, pinned BEFORE it is submitted.
   *
   * This is what lets §6.4's step order hold with §5.6's `hdr.st` in it: the
   * settlement reference is a transaction id, and the payer chooses it. See the
   * head of `core/envelope.ts`.
   */
  pinTransferRef(): string;

  /** Move stamps to the treasury under a memo, as the pinned reference (§4.3). */
  transferStamps(ref: string, to: string, amount: number, memo: string): Promise<Settlement>;

  /** The stamps this account holds, for §6.4's precondition (SEND_INSUFFICIENT_STAMPS). */
  stampBalance(): Promise<number>;
}

/** A tool that both reads and writes: `send`, `buy_stamp`, `ack`. */
export interface Consensus extends Reader, Writer {}

/** §5.7's Postmark, from a message and the chunk it carried. */
export function postmarkOf(
  message: TopicMessage,
  ledgerTag: string,
  envelopeId: string,
  chunkIndex: number,
): {
  readonly ledgerTag: string;
  readonly topicId: string;
  readonly sequenceNumber: number;
  readonly consensusTimestamp: string;
  readonly runningHash: string;
  readonly runningHashVersion: number;
  readonly envelopeId: string;
  readonly chunkIndex: number;
} {
  return {
    ledgerTag,
    topicId: message.topicId,
    sequenceNumber: message.sequenceNumber,
    consensusTimestamp: message.consensusTimestamp,
    runningHash: message.runningHash,
    runningHashVersion: message.runningHashVersion,
    envelopeId,
    chunkIndex,
  };
}

/** §5.7's Postmark. */
export type Postmark = ReturnType<typeof postmarkOf>;

/**
 * Consensus timestamps compare as strings only where both halves are padded.
 * `seconds.nanos` is not: `100.5` sorts after `1000.1` lexically and before it
 * in time. Every ordering in §11 is by consensus timestamp, so it is done here,
 * once, rather than at each of the nine places that need it.
 */
export function compareTimestamps(a: string, b: string): number {
  const [as = '0', an = '0'] = a.split('.');
  const [bs = '0', bn = '0'] = b.split('.');
  const sa = BigInt(as);
  const sb = BigInt(bs);
  if (sa !== sb) return sa < sb ? -1 : 1;
  const na = BigInt(an.padEnd(9, '0'));
  const nb = BigInt(bn.padEnd(9, '0'));
  if (na !== nb) return na < nb ? -1 : 1;
  return 0;
}

/** Whether `a` is strictly before `b` in consensus time. */
export function before(a: string, b: string): boolean {
  return compareTimestamps(a, b) < 0;
}

/** Parse a message's contents as an operation object, or null if it is not one. */
export function operationOf(message: TopicMessage): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(message.contents);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}
