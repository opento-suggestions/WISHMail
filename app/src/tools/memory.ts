/**
 * Consensus as a data structure — the ledger the readers are run against
 * before anything is signed.
 *
 * This is not a mock in the usual sense: nothing here is stubbed to return what
 * a test wants. It is a small model of the four facts the tools depend on, and
 * it enforces every one of them, so that a tool which would be refused by the
 * network is refused here first:
 *
 *   - a topic with a submit key refuses a submission from any other key
 *     (which is what makes §7.1's threshold lane a real constraint, T-P17-2);
 *   - a topic with a HIP-991 custom fee assesses it, to the collector, from
 *     the submitter, unless the submitter's key is fee-exempt (§4.4, D-138);
 *   - a transfer moves tokens between balances and fails if the balance is
 *     short, so postage is spent rather than asserted (§4.3);
 *   - consensus order is total, and every message gets the next timestamp,
 *     a sequence number, and a running hash chained to the one before it.
 *
 * What it deliberately does NOT model is signature verification, fees in HBAR,
 * throttles, or expiry. A key here is a string; two accounts differ if their
 * key strings differ. That is enough for every check in §11 and for none of
 * §15's threat model, and this file says so rather than letting a reader assume
 * otherwise.
 *
 * Why it exists at all: `inbox` and `verify` must be run against exactly what
 * `send` produced, before `send` submits anything to a topic that cannot be
 * rewritten. A letter that only its author can read is discovered here for
 * nothing, or on testnet for the price of a permanent wrong artefact.
 */
import { createHash } from 'node:crypto';
import type { Consensus, CustomFee, Reader, Settlement, TopicInfo, TopicMessage } from './consensus.js';

/** An account in the model: an id, the key that signs for it, a memo, a balance. */
interface Account {
  readonly id: string;
  key: string;
  memo: string;
  stamps: number;
}

interface Topic {
  readonly id: string;
  memo: string;
  submitKeys: string[];
  adminKey: string | null;
  customFees: CustomFee[];
  feeExemptKeys: string[];
  deleted: boolean;
  messages: TopicMessage[];
}

export interface TopicSpec {
  readonly memo?: string;
  /** Empty or absent: a public topic, which anyone may write to. */
  readonly submitKeys?: readonly string[];
  readonly adminKey?: string | null;
  readonly customFees?: readonly CustomFee[];
  readonly feeExemptKeys?: readonly string[];
}

/** Raised where the model refuses what the network would refuse. */
export class LedgerRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LedgerRefusal';
  }
}

export class MemoryLedger {
  readonly ledgerTag: string;
  readonly stampToken: string;
  readonly treasury: string;

  private readonly accounts = new Map<string, Account>();
  private readonly topics = new Map<string, Topic>();
  private readonly transfers = new Map<string, Settlement>();
  private nextEntity = 1000;
  /**
   * INGESTION LAG, modelled — the one thing consensus-as-a-data-structure could
   * not do until now.
   *
   * A real mirror node answers a read about a message that IS on consensus with
   * "no" for a second or two after it lands, and it uses the same word it would
   * use for a message that will never exist. Two of Gate One's eight defects
   * were exactly that read believed once. A knob here gives the offline court a
   * way to exercise the retry — a reader that must look again — without a
   * network.
   *
   * topicId -> how many further reads of that topic still hide its newest
   * message. Decremented per read, so `lag(t, 2)` hides it from the next two
   * reads and shows it on the third.
   */
  private readonly lagging = new Map<string, number>();

  /** Hide a topic's newest message from the next `reads` reads of it. */
  lag(topicId: string, reads: number): void {
    this.lagging.set(topicId, reads);
  }
  /** Nanoseconds since an arbitrary epoch; every event takes the next tick. */
  private clock = 1_788_900_000_000_000_000n;

  constructor(options: { ledgerTag?: string; stampToken?: string; treasury?: string } = {}) {
    this.ledgerTag = options.ledgerTag ?? 'hedera:testnet';
    this.stampToken = options.stampToken ?? '0.0.5000001';
    this.treasury = options.treasury ?? '0.0.5000000';
    this.accounts.set(this.treasury, { id: this.treasury, key: 'treasury-key', memo: '', stamps: 0 });
  }

  /** The next consensus timestamp, `seconds.nanos`, strictly after the last. */
  private tick(): string {
    this.clock += 1_000_000n; // a millisecond apart, which is enough to order
    const seconds = this.clock / 1_000_000_000n;
    const nanos = this.clock % 1_000_000_000n;
    return `${seconds.toString()}.${nanos.toString().padStart(9, '0')}`;
  }

  private id(): string {
    this.nextEntity += 1;
    return `0.0.${this.nextEntity}`;
  }

  // --- Standing things up. ---------------------------------------------------

  createAccount(key: string, stamps = 0, memo = ''): string {
    const id = this.id();
    this.accounts.set(id, { id, key, memo, stamps });
    return id;
  }

  setAccountMemo(account: string, memo: string): void {
    this.account(account).memo = memo;
  }

  createTopic(spec: TopicSpec = {}): string {
    const id = this.id();
    this.topics.set(id, {
      id,
      memo: spec.memo ?? '',
      submitKeys: [...(spec.submitKeys ?? [])],
      adminKey: spec.adminKey ?? null,
      customFees: [...(spec.customFees ?? [])],
      feeExemptKeys: [...(spec.feeExemptKeys ?? [])],
      deleted: false,
      messages: [],
    });
    return id;
  }

  mint(account: string, stamps: number): void {
    this.account(account).stamps += stamps;
  }

  balance(account: string): number {
    return this.account(account).stamps;
  }

  private account(id: string): Account {
    const a = this.accounts.get(id);
    if (a === undefined) throw new LedgerRefusal(`no such account ${id}`);
    return a;
  }

  private topicOf(id: string): Topic {
    const t = this.topics.get(id);
    if (t === undefined) throw new LedgerRefusal(`no such topic ${id}`);
    return t;
  }

  // --- What the network does when a message is submitted. --------------------

  submit(submitter: string, topicId: string, contents: string): TopicMessage {
    const topic = this.topicOf(topicId);
    const account = this.account(submitter);
    if (topic.deleted) throw new LedgerRefusal(`topic ${topicId} is deleted`);
    if (topic.submitKeys.length > 0 && !topic.submitKeys.includes(account.key)) {
      throw new LedgerRefusal(`INVALID_SIGNATURE: ${submitter} does not hold a submit key of ${topicId}`);
    }

    // HIP-991: the fee is assessed on the submitter unless its key is exempt.
    if (!topic.feeExemptKeys.includes(account.key)) {
      for (const fee of topic.customFees) {
        if (fee.tokenId !== this.stampToken) throw new LedgerRefusal(`unsupported fee token ${fee.tokenId}`);
        if (account.stamps < fee.amount) {
          throw new LedgerRefusal(`INSUFFICIENT_TOKEN_BALANCE: ${submitter} cannot pay ${topicId}'s fee`);
        }
        account.stamps -= fee.amount;
        this.account(fee.collector).stamps += fee.amount;
      }
    }

    const sequenceNumber = topic.messages.length + 1;
    const previous = topic.messages[topic.messages.length - 1]?.runningHash ?? '';
    const runningHash = createHash('sha384')
      .update(Buffer.from(previous, 'base64'))
      .update(Buffer.from(`${topicId}:${sequenceNumber}:`, 'utf8'))
      .update(Buffer.from(contents, 'utf8'))
      .digest('base64');

    const message: TopicMessage = {
      topicId,
      sequenceNumber,
      consensusTimestamp: this.tick(),
      runningHash,
      runningHashVersion: 3,
      contents,
      payer: submitter,
    };
    topic.messages.push(message);
    return message;
  }

  transfer(ref: string, from: string, to: string, amount: number, memo: string): Settlement {
    const payer = this.account(from);
    const payee = this.account(to);
    if (amount <= 0) throw new LedgerRefusal('a transfer of no stamps is not a transfer');
    if (payer.stamps < amount) throw new LedgerRefusal(`INSUFFICIENT_TOKEN_BALANCE: ${from} holds ${payer.stamps}`);
    if (this.transfers.has(ref)) throw new LedgerRefusal(`DUPLICATE_TRANSACTION: ${ref}`);
    payer.stamps -= amount;
    payee.stamps += amount;
    const settlement: Settlement = {
      ledgerTag: this.ledgerTag,
      txRef: ref,
      from,
      to,
      amount,
      memo,
      consensusTimestamp: this.tick(),
      tokenId: this.stampToken,
    };
    this.transfers.set(ref, settlement);
    return settlement;
  }

  /** Close a lane, as a `close_connection` on it does in HCS-10's sense (§7.1). */
  deleteTopic(topicId: string): void {
    this.topicOf(topicId).deleted = true;
  }

  /** Rewrite one message's bytes in place. The ONLY use is building an altered copy for a refusal test. */
  overwriteMessage(topicId: string, sequenceNumber: number, contents: string): void {
    const topic = this.topicOf(topicId);
    const index = topic.messages.findIndex((m) => m.sequenceNumber === sequenceNumber);
    if (index < 0) throw new LedgerRefusal(`no message ${sequenceNumber} on ${topicId}`);
    topic.messages[index] = { ...(topic.messages[index] as TopicMessage), contents };
  }

  /** Rewrite one settlement in place, for the same reason and no other. */
  overwriteTransfer(ref: string, patch: Partial<Settlement>): void {
    const existing = this.transfers.get(ref);
    if (existing === undefined) throw new LedgerRefusal(`no transfer ${ref}`);
    this.transfers.set(ref, { ...existing, ...patch });
  }

  // --- The two interfaces the tools are given. -------------------------------

  /** A read interface, and nothing else — what a Verifier gets (P-4). */
  reader(): Reader {
    return {
      ledgerTag: this.ledgerTag,
      messages: async (topicId) => {
        const all = this.topics.get(topicId)?.messages.slice() ?? [];
        const left = this.lagging.get(topicId) ?? 0;
        if (left <= 0) return all;
        this.lagging.set(topicId, left - 1);
        // The newest message is on consensus and this read does not show it,
        // which is the whole of what ingestion lag is.
        return all.slice(0, -1);
      },
      topic: async (topicId) => {
        const t = this.topics.get(topicId);
        if (t === undefined) return null;
        const info: TopicInfo = {
          topicId: t.id,
          memo: t.memo,
          submitKeys: [...t.submitKeys],
          adminKey: t.adminKey,
          customFees: [...t.customFees],
          feeExemptKeys: [...t.feeExemptKeys],
          deleted: t.deleted,
        };
        return info;
      },
      transfer: async (txRef) => this.transfers.get(txRef) ?? null,
      accountMemo: async (account) => this.accounts.get(account)?.memo ?? null,
      accountKey: async (account) => this.accounts.get(account)?.key ?? null,
    };
  }

  /** A read-and-write interface bound to one account: what `send` gets. */
  as(account: string): Consensus {
    const reader = this.reader();
    let pinned = 0;
    return {
      ...reader,
      account,
      submitMessage: async (topicId, operation, _transactionMemo) =>
        this.submit(account, topicId, JSON.stringify(operation)),
      pinTransferRef: () => {
        pinned += 1;
        const seconds = (this.clock / 1_000_000_000n).toString();
        return `${account}@${seconds}.${String(pinned).padStart(9, '0')}`;
      },
      transferStamps: async (ref, to, amount, memo) => this.transfer(ref, account, to, amount, memo),
      stampBalance: async () => this.balance(account),
    };
  }
}
