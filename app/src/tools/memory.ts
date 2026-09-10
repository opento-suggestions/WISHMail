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
import { decodeScheduledSubmission, encodeScheduledSubmission } from '../core/schedulebody.js';
import type {
  Consensus,
  CustomFee,
  Reader,
  ScheduleRecord,
  ScheduleSignature,
  Settlement,
  TopicInfo,
  TopicMessage,
} from './consensus.js';

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

/** One long-term schedule in the model (HIP-423, §10.4). */
interface Schedule {
  readonly id: string;
  readonly creator: string;
  /** Who pays the INNER transaction. §10.4: never the recipient (T-P16-2). */
  readonly payer: string;
  readonly createdAt: string;
  readonly expirationTime: string;
  readonly waitForExpiry: boolean;
  /** The `SchedulableTransactionBody`, base64 — real bytes, not a stand-in. */
  readonly transactionBody: string;
  /** The topic the inner submission writes to, decoded from those bytes. */
  readonly innerTopic: string;
  signatures: ScheduleSignature[];
  executedAt: string | null;
  deleted: boolean;
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
  /**
   * Long-term schedules, modelled as "executes when the required key signs"
   * (HIP-423, §10.4) — the fourth fact the tools depend on, and the one the
   * receipt path turns on.
   *
   * What is enforced here, because the network enforces it: the inner
   * submission is held as REAL `SchedulableTransactionBody` bytes, so the
   * decoder `ack` and `verify` use is exercised rather than bypassed; a schedule
   * executes only when a key that the inner submission REQUIRES has signed — for
   * a submission to a keyed topic that is the topic's submit key — and the
   * execution then submits the message AS the topic's owner, so a schedule
   * cannot write where its signer could not; the inner transaction's fee is
   * charged in the model's only currency it can be charged in, which is
   * nothing, so `payerAccountId` is recorded and the recipient's stamp balance
   * is provably untouched (T-P16-2); and a second schedule over an identical
   * inner transaction is REFUSED with the existing id, which is what
   * `IDENTICAL_SCHEDULE_ALREADY_CREATED` is.
   *
   * What is NOT modelled, and it is the same list as everywhere else in this
   * file: signature verification, HBAR fees, throttles, and expiry as a passage
   * of time. `expire()` below is a method rather than a clock, because a test
   * that waited sixty-two days would not be a test.
   */
  private readonly schedules = new Map<string, Schedule>();
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

  // --- Long-term schedules (HIP-423, §10.4). ---------------------------------

  /**
   * ScheduleCreate. The creator's key is recorded as a signature exactly as the
   * network records it — a ScheduleCreate's signatures are offered to the inner
   * transaction's required keys, and the inner payer is one of them.
   *
   * A SECOND schedule over an identical inner transaction is refused with the
   * id of the one that exists, which is `IDENTICAL_SCHEDULE_ALREADY_CREATED` and
   * is the ledger's own answer to a sender that lost the outcome of a create.
   */
  scheduleCreate(args: {
    readonly creator: string;
    readonly payer: string;
    readonly topicId: string;
    readonly message: Buffer;
    readonly expirationSeconds: number;
  }): { readonly record: ScheduleRecord; readonly identical: boolean } {
    const body = encodeScheduledSubmission({
      topicId: args.topicId,
      message: args.message,
      transactionFee: 200_000_000,
    });
    const transactionBody = body.toString('base64');
    for (const existing of this.schedules.values()) {
      if (existing.transactionBody === transactionBody && !existing.deleted) {
        return { record: this.recordOf(existing), identical: true };
      }
    }

    const id = this.id();
    const createdAt = this.tick();
    const seconds = BigInt(createdAt.split('.')[0] as string) + BigInt(args.expirationSeconds);
    const schedule: Schedule = {
      id,
      creator: args.creator,
      payer: args.payer,
      createdAt,
      expirationTime: `${seconds.toString()}.000000000`,
      waitForExpiry: false,
      transactionBody,
      innerTopic: decodeScheduledSubmission(body).topicId,
      // The create's own signature, which the network records because the inner
      // payer's key is required by the inner transaction.
      signatures: [{ publicKeyPrefix: this.prefixOf(args.payer), consensusTimestamp: createdAt, type: 'ED25519' }],
      executedAt: null,
      deleted: false,
    };
    this.schedules.set(id, schedule);
    return { record: this.recordOf(schedule), identical: false };
  }

  /**
   * ScheduleSign, and the execution it triggers.
   *
   * The model executes when a signer holding the inner topic's submit key has
   * signed — which is the whole of what makes §10.4 work: the receipt's manifest
   * goes to a topic only the recipient can write to, so only the recipient's
   * signature can complete it. The execution then submits AS that signer, so a
   * schedule cannot put a message where its signer could not.
   */
  scheduleSign(scheduleId: string, signer: string): ScheduleRecord {
    const schedule = this.schedules.get(scheduleId);
    if (schedule === undefined) throw new LedgerRefusal(`INVALID_SCHEDULE_ID: no such schedule ${scheduleId}`);
    if (schedule.deleted) throw new LedgerRefusal(`INVALID_SCHEDULE_ID: ${scheduleId} is deleted`);
    if (schedule.executedAt !== null) throw new LedgerRefusal(`SCHEDULE_ALREADY_EXECUTED: ${scheduleId}`);

    const key = this.account(signer).key;
    const prefix = this.prefixOf(signer);
    if (schedule.signatures.some((s) => s.publicKeyPrefix === prefix)) {
      throw new LedgerRefusal(`NO_NEW_VALID_SIGNATURES: ${signer} has already signed ${scheduleId}`);
    }
    schedule.signatures.push({ publicKeyPrefix: prefix, consensusTimestamp: this.tick(), type: 'ED25519' });

    const topic = this.topicOf(schedule.innerTopic);
    const required = topic.submitKeys.length === 0 || topic.submitKeys.includes(key);
    if (required) {
      const decoded = decodeScheduledSubmission(Buffer.from(schedule.transactionBody, 'base64'));
      // Submitted as the SIGNER, because the signer is the account whose key the
      // topic names. `submit` re-checks that, so the model cannot execute a
      // schedule into a topic its signer could not write to.
      const message = this.submit(signer, schedule.innerTopic, decoded.message.toString('utf8'));
      schedule.executedAt = message.consensusTimestamp;
    }
    return this.recordOf(schedule);
  }

  /**
   * A schedule that expired unsigned, which the network DELETES (§10.4).
   *
   * A method and not a clock: what §11.4 needs to appraise is a schedule that is
   * gone, and waiting sixty-two days for one is not a test (T-P15-5).
   */
  expire(scheduleId: string): void {
    const schedule = this.schedules.get(scheduleId);
    if (schedule === undefined) throw new LedgerRefusal(`no such schedule ${scheduleId}`);
    schedule.deleted = true;
  }

  /**
   * A key's prefix as a schedule's record carries it: base64 of the key BYTES.
   *
   * A key in this model is a string, and the head of this file says it is not a
   * public key. But §11.4's match is between two encodings of one key — a
   * mirror node returns a schedule signature's prefix as base64 and an account's
   * key as raw hex — and a model that used a different convention would let
   * `keyMatchesPrefix` pass here and fail on the network. So a key in an account
   * that ever signs a schedule MUST be raw hex, and this refuses loudly rather
   * than encoding something the matcher cannot decode back.
   */
  private prefixOf(account: string): string {
    const key = this.account(account).key;
    if (!/^([0-9a-fA-F]{2})+$/.test(key)) {
      throw new LedgerRefusal(
        `${account}'s key ${JSON.stringify(key)} is not raw hex; an account that signs a schedule needs a key ` +
          "`keyMatchesPrefix` can match, because a mirror node gives a signature's prefix in base64 and an " +
          "account's key in hex (§11.4)",
      );
    }
    return Buffer.from(key, 'hex').toString('base64');
  }

  private recordOf(s: Schedule): ScheduleRecord {
    return {
      ledgerTag: this.ledgerTag,
      scheduleId: s.id,
      creator: s.creator,
      payer: s.payer,
      consensusTimestamp: s.createdAt,
      executedTimestamp: s.executedAt,
      expirationTime: s.expirationTime,
      waitForExpiry: s.waitForExpiry,
      deleted: s.deleted,
      signatures: s.signatures.map((x) => ({ ...x })),
      transactionBody: s.transactionBody,
    };
  }

  /** Rewrite one message's bytes in place. The ONLY use is building an altered copy for a refusal test. */
  overwriteMessage(topicId: string, sequenceNumber: number, contents: string): void {
    const topic = this.topicOf(topicId);
    const index = topic.messages.findIndex((m) => m.sequenceNumber === sequenceNumber);
    if (index < 0) throw new LedgerRefusal(`no message ${sequenceNumber} on ${topicId}`);
    topic.messages[index] = { ...(topic.messages[index] as TopicMessage), contents };
  }

  /**
   * Rewrite a topic's submit-key list in place, for the same reason and no other.
   *
   * §7.1's key list is half of D-171's binding test, and a lane that fails it is
   * a lane `send` refuses to use — so the only way to put a real, posted
   * envelope on one is to alter the lane after the envelope is on it. That is
   * the HARDER case, as every alteration here is: on the network a topic's keys
   * are fixed at creation, so nothing can do this at all.
   */
  overwriteSubmitKeys(topicId: string, submitKeys: readonly string[]): void {
    const topic = this.topicOf(topicId);
    topic.submitKeys = [...submitKeys];
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
      schedule: async (scheduleId) => {
        const s = this.schedules.get(scheduleId);
        // A schedule the network deleted at expiry is GONE, not flagged: §10.4
        // says "a schedule that expires unsigned is deleted by the network", and
        // a Verifier that could still read one would never see `unclaimed`.
        if (s === undefined || s.deleted) return null;
        return this.recordOf(s);
      },
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
      scheduleSubmission: async (request) =>
        this.scheduleCreate({
          creator: account,
          payer: request.payerAccountId,
          topicId: request.topicId,
          message: request.message,
          expirationSeconds: request.expirationSeconds,
        }).record,
      scheduleSign: async (scheduleId) => this.scheduleSign(scheduleId, account),
    };
  }
}
