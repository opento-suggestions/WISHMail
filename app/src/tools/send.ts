/**
 * `send` — §6.4, in the order §6.4 gives.
 *
 *   1. Lane        an existing one, or first contact and a slip if it is not answered
 *   2. Manifest    the resolution proof published, and its locator becomes the proof's uri
 *   3. Assembly    nonce, AAD, seal, chunks (core/envelope.ts)
 *   4. Affix       the postage transferred under the memo `wishmail:` + aadHash
 *   5. Submit      every chunk to the lane, in index order
 *   6. Settle      block until every chunk has a consensus timestamp
 *   7. Receipt     the scheduled submission of §10.4, when one was requested
 *
 * ALL SEVEN ARE HERE as of Gate Two checkpoint two. Step 7 was refused outright
 * until 2026-09-10, and the refusal was the right shape while it stood: postage
 * includes the receipt fee (§7.5) and chunk 0's header requests it (§7.7), so an
 * envelope assembled without step 7 is one whose sender paid for a receipt
 * nobody was asked for — an artefact that is wrong on consensus and cannot be
 * withdrawn.
 *
 * STEP 7 IS IDEMPOTENT AGAINST CONSENSUS, like every other write this project
 * makes (D-165). Before it creates anything it reads the lane for a
 * `transaction` operation whose `data` names this envelope, and reuses the
 * schedule that operation names. Beneath that the LEDGER itself refuses a
 * second one: an identical inner transaction returns
 * `IDENTICAL_SCHEDULE_ALREADY_CREATED` with the existing schedule id, so two
 * schedules for one envelope is not a state this code has to be careful enough
 * to avoid.
 *
 * THE ORDER INSIDE STEP 7 IS SCHEDULE FIRST, THEN THE LANE. A `transaction`
 * operation naming a schedule that does not exist is a request a recipient
 * cannot act on and a Verifier cannot resolve; a schedule with no operation
 * naming it is invisible to §11.2's ingestion table and expires unsigned, which
 * is `unclaimed` — a state §11.4 already has a word for. Of the two ways to be
 * interrupted, only one leaves a fact that says something false.
 *
 * WHO SUBMITS THE FIRST-CONTACT REQUEST is settled, and the seam stays.
 * D-157 (2026-09-09): the sender always signs the request, and who pays for
 * it is the sender's choice, as it is for every other submission it makes
 * (§3.5, §4.4, §6.4 step 1). A sender that pays for itself rings in one hop;
 * a sender that borrows a payer transfers one stamp to it first and rings in
 * two. The ring costs the sender one stamp either way. So `ringer` in the
 * context is no longer a competing reading of §6.4 — it is the payer,
 * injected: where it is supplied that account pays and submits the request
 * the sender signed, and where it is absent the sender does both itself.
 * Nothing above this seam knows which.
 *
 * Conformance: T-P7-1, T-P7-2, T-P7-3, T-P9-5, T-P9-6, T-P9-7, T-P9-8,
 * T-P9-11, T-P10-1, T-P10-2, T-P11-3, T-P12-5, T-P14-1, T-P17-2.
 */
import { canonicalDigest } from '../core/canonical.js';
import { proofInputs, proofLocation } from '../core/proof.js';
import { repoRoot } from '../ops/env.js';
import { schemas } from '../schema/loader.js';
import { affix, sealEnvelope, type AssembledEnvelope, type Envelope } from '../core/envelope.js';
import { refuse } from '../core/failure.js';
import type { MessageLocator } from '../core/locator.js';
import { messageOperation } from '../core/chunk.js';
import {
  envelopeIdOfRequest,
  receiptManifestBytes,
  transactionOperation,
  type ReceiptManifestInput,
} from '../core/receipt.js';
import {
  TRANSACTION_MEMO,
  TRANSACTION_OP_MEMO,
  connectionRequestBody,
  operatorId as operatorIdOf,
} from '../ops/hcs10.js';
import {
  before,
  compareTimestamps,
  operationOf,
  postmarkOf,
  type Consensus,
  type Postmark,
  type Reader,
  type ScheduleRecord,
  type Settlement,
  type TopicMessage,
  type Writer,
} from './consensus.js';

/** §5.3's MailCoordinates, as much of it as `send` reads. */
export interface Coordinates {
  readonly address: string;
  readonly profile: string;
  readonly ledgerTag: string;
  readonly account: string;
  readonly doorbell: string;
  readonly log?: string;
  /**
   * The recipient's manifest topic (§5.3, D-166). `send` schedules the receipt's
   * submission here (§6.4 step 7, §10.4), and a Verifier checks that a receipt
   * landed here (T-P1-8) — which it can only do from the resolution proof's
   * output, because re-resolving now would answer at its own clock (§11.6).
   */
  readonly manifestTopic: string;
  readonly x25519Pub: string;
  readonly keyEpoch: number;
  readonly resolutionProof: { readonly hash: string; readonly uri: MessageLocator | null };
}

/** What the sender is, and what it holds. No private key appears here (P-13). */
export interface SenderContext {
  readonly consensus: Consensus;
  readonly ledgerTag: string;
  /** The sender's account: what the settlement's `from` will be (§7.2). */
  readonly account: string;
  /** The sender's inbound topic — the other half of its `operator_id`. */
  readonly doorbell: string;
  /** The sender's outbound topic, where its own first contact is recorded (§5.9). */
  readonly log: string;
  /** Where the sender publishes manifests (§9.1, §10.2). */
  readonly manifestTopic: string;
  readonly treasury: string;
  readonly stampToken: string;
  /** The registered Chunk schema, version-pinned (§5.11). */
  readonly schemaRef: string;
  /** The sender's public key, as a topic's key list holds it — for §7.1's lane test. */
  readonly publicKey: string;
  /**
   * The Postmaster's writer, where §6.4 step 1's reading is taken literally.
   * Absent: the sender rings the doorbell itself and pays the fee itself.
   */
  readonly ringer?: Writer;
  /**
   * Who pays for the RECEIPT's inner transaction when the recipient signs it
   * (§10.4, §6.4 step 7).
   *
   * §10.4 makes it "the payer designated by the sender", and its parenthetical
   * names the Postmaster on D-47. D-157 is later and wider: the sender always
   * signs and who pays is the sender's choice, for this submission as for every
   * other one it makes. Postmaster-pays carry outside `buy_stamp` is deferred
   * this window (CLAUDE.md §11, LIMITATIONS L-5), so this deployment names the
   * sender's own operator wallet.
   *
   * What it must NEVER be is the recipient: "The recipient MUST NOT be charged
   * for a receipt" (T-P16-2). That is checked below rather than assumed.
   *
   * Absent: the sender's own account pays — §10.4's arrangement for a sender
   * that pays for itself.
   */
  readonly receiptPayer?: string;
  /**
   * The sender's own durable record of what it has affixed (D-165).
   *
   * P-7 is why it exists: one settlement stamps one envelope, and a run that
   * died between the affix and the last chunk has spent postage on an envelope
   * that only this process knew the identifier of. Consensus knows it too — the
   * settlement's memo IS the identifier — but only if someone knows to look, and
   * a fresh process does not. So the row is written at the affix, before the
   * transfer is submitted, and updated as the run proceeds.
   *
   * It is a CACHE OF CONSENSUS and never an authority over it: nothing in
   * `send` reads it to decide anything, and `resumeReceipt` below reads it only
   * to learn which envelope to go and ask consensus about. A wiped store
   * therefore loses a convenience and not a fact.
   *
   * Absent: the tool keeps no record, which is what every offline court and
   * every dry run wants.
   */
  readonly sent?: SentEnvelopes;
}

/** What `send` writes down about an envelope it is posting, as it posts it. */
export interface SentEnvelope {
  readonly envelopeId: string;
  readonly lane: string;
  readonly recipientAccount: string;
  readonly settlementRef: string;
  readonly postage: number;
  readonly returnReceipt: boolean;
  /** `affixed` → `submitted` → `settled` → `requested`; the last only where a receipt was asked for. */
  readonly stage: 'affixed' | 'submitted' | 'settled' | 'requested';
  readonly chunkCount: number;
  readonly chunkZero?: { readonly topicId: string; readonly sequenceNumber: number };
  readonly keyEpoch: number;
  readonly scheduleId?: string;
}

/** The store port. One namespace, keyed by envelope identifier. */
export interface SentEnvelopes {
  get(envelopeId: string): SentEnvelope | undefined;
  put(row: SentEnvelope): void;
}

export interface SendRequest {
  readonly coordinates: Coordinates;
  /** The full proof, as `resolve` produced it; published at step 2 (§10.2). */
  readonly manifest: Record<string, unknown>;
  readonly payload: Buffer;
  readonly returnReceipt?: boolean;
  /** Seconds to wait for an answer at first contact (§6.4, §10.5). */
  readonly windowSeconds?: number;
  /**
   * The ACKNOWLEDGMENT window, in seconds — §10.4's, which is a different
   * window from the one above and is measured in days rather than seconds.
   *
   * "The schedule's expiration is the acknowledgment window: a sender
   * parameter, in seconds, at most `SCHEDULE_MAX_LIFETIME` (§1.6; sixty-two
   * days), defaulting to that maximum."
   */
  readonly receiptWindowSeconds?: number;
}

/** §5.9's AttemptedDeliverySlip. */
export interface AttemptedDeliverySlip {
  readonly ledgerTag: string;
  readonly address: string;
  readonly profile: string;
  readonly resolutionProof: { readonly hash: string; readonly uri: MessageLocator | null };
  readonly doorbell: string;
  readonly connectionRequestSeq: number;
  readonly consensusTimestamp: string;
  readonly log: string;
  readonly logSeq: number;
  readonly window: number;
  readonly endorsement: 'timed-out';
}

/** What step 7 produced, where one was asked for (§10.4). */
export interface ReceiptRequested {
  readonly scheduleId: string;
  /** The schedule's expiration — the acknowledgment window's end (§10.4). */
  readonly expirationTime: string | null;
  /** Where the `transaction` operation announcing it sits on the lane. */
  readonly requestSequenceNumber: number;
  readonly requestConsensusTimestamp: string;
  /** The manifest the schedule carries, by its hash — what `ack` and `verify` recompute. */
  readonly manifestHash: string;
  /** True where an existing request on the lane was reused rather than a second schedule made. */
  readonly reused: boolean;
}

export interface SendPostmarked {
  readonly kind: 'postmark';
  /** §6.4: "send then returns chunk 0's Postmark" (D-30). */
  readonly postmark: Postmark;
  readonly envelope: Envelope;
  readonly postmarks: readonly Postmark[];
  readonly settlement: Settlement;
  readonly manifestLocator: MessageLocator;
  readonly lane: string;
  /** §6.4 step 7, present exactly when `returnReceipt` was true. */
  readonly receipt?: ReceiptRequested;
}

export interface SendSlipped {
  readonly kind: 'slip';
  readonly slip: AttemptedDeliverySlip;
  readonly manifestLocator: MessageLocator;
}

export type SendResult = SendPostmarked | SendSlipped;

/** A lane as discovered from a doorbell (§7.1). */
export interface Lane {
  readonly topicId: string;
  /** The consensus timestamp of the `connection_created` that created it. */
  readonly createdAt: string;
  /** The doorbell the answer was on — what T-P10-2 compares against. */
  readonly doorbell: string;
}

/**
 * §7.1's rule for finding the lane: "the earliest-created open lane between
 * them, creation time being the consensus timestamp of the `connection_created`
 * operation on the recipient's doorbell that names the sender's account."
 *
 * A Verifier "discovers the lanes between two agents by the same rule, from the
 * same doorbell", so this function is exported and `verify` uses it too — one
 * rule, not two implementations of one rule.
 */
export async function lanesFromDoorbell(
  reader: Reader,
  doorbell: string,
  senderAccount: string,
): Promise<readonly Lane[]> {
  const messages = await reader.messages(doorbell);
  const lanes: Lane[] = [];
  for (const m of messages) {
    const op = operationOf(m);
    if (op === null || op['p'] !== 'hcs-10' || op['op'] !== 'connection_created') continue;
    if (op['connected_account_id'] !== senderAccount) continue;
    const topicId = op['connection_topic_id'];
    if (typeof topicId !== 'string') continue;
    lanes.push({ topicId, createdAt: m.consensusTimestamp, doorbell });
  }
  return lanes.sort((a, b) => compareTimestamps(a.createdAt, b.createdAt));
}

/** Whether a lane carries a `close_connection` at or before a moment (§7.1, §8.2). */
export async function closedBy(reader: Reader, lane: string, at?: string): Promise<TopicMessage | null> {
  for (const m of await reader.messages(lane)) {
    const op = operationOf(m);
    if (op === null || op['p'] !== 'hcs-10' || op['op'] !== 'close_connection') continue;
    if (at === undefined || !before(at, m.consensusTimestamp)) return m;
  }
  return null;
}

/**
 * §7.1's constraints on a lane, checked before anything is affixed. Each of
 * these is a `SEND_LANE_INVALID` at §6.4 and a binding failure at replay.
 */
export async function laneRefusal(
  reader: Reader,
  lane: Lane,
  senderKey: string,
  recipientKey: string,
): Promise<string | null> {
  const info = await reader.topic(lane.topicId);
  if (info === null) return `the lane ${lane.topicId} is not on this ledger`;
  if (info.deleted) return `the lane ${lane.topicId} is deleted`;
  if ((await closedBy(reader, lane.topicId)) !== null) return `the lane ${lane.topicId} carries a close_connection (§7.1, T-P9-6)`;
  if (info.customFees.length > 0) return `the lane ${lane.topicId} carries a custom fee (§7.1, T-P11-3)`;
  const keys = [...info.submitKeys].sort();
  const expected = [senderKey, recipientKey].sort();
  if (keys.length !== expected.length || keys.some((k, i) => k !== expected[i])) {
    return `the lane ${lane.topicId}'s submit key is not a threshold of exactly the two agents' keys (§7.1, T-P17-2)`;
  }
  return null;
}

/** Publish one manifest on the sender's manifest topic and return its locator (§9.1, §10.2). */
async function publishManifest(
  ctx: SenderContext,
  manifest: Record<string, unknown>,
): Promise<MessageLocator> {
  const m = await ctx.consensus.submitMessage(ctx.manifestTopic, manifest, TRANSACTION_OP_MEMO);
  return { ledgerTag: ctx.ledgerTag, topicId: m.topicId, sequenceNumber: m.sequenceNumber };
}

/**
 * How long `send` waits at first contact, how often it looks, and how many
 * times it goes back to look again.
 *
 * §6.4 gives `window` in seconds and fixes neither the polling interval nor any
 * notion of an attempt, which is why both are here and not in `spec/pins.json`.
 *
 * THE WINDOW FOLDS IN MIRROR-NODE LAG, BECAUSE ON TESTNET THAT LAG IS REAL.
 * Two of Gate One's eight defects were a read that came back empty once and was
 * believed — the account index after a transfer, and the anchor at 381 messages
 * — so a single read is never how this decides. One ATTEMPT is a poll under a
 * wait policy for `DEFAULT_WINDOW_SECONDS`; the sender makes up to
 * `MAX_ATTEMPTS` of them, 90 seconds in all, before it gives up and publishes a
 * slip.
 *
 * **A RETRY IS A RE-READ AND NEVER A RE-RING.** The doorbell is rung once per
 * first contact. Every attempt after the first only widens how long the sender
 * watches for the answer, and costs nothing: a second ring would be a second
 * stamp consumed at the treasury and a second request for the watcher to answer,
 * and §7.1 would then have to pick between two lanes.
 */
export const DEFAULT_WINDOW_SECONDS = 30;
export const MAX_ATTEMPTS = 3;
const POLL_INTERVAL_MS = 1000;

/** What a first contact did, for the caller to report (D-162's one template). */
export interface ContactAttempts {
  /** How many watching attempts were made, 1 … MAX_ATTEMPTS. */
  readonly attempts: number;
  /** True where an existing pending request was waited on instead of ringing. */
  readonly reusedRequest: boolean;
  readonly totalSeconds: number;
}

/**
 * A connection request from THIS agent on that doorbell that no lane answers.
 *
 * HCS-10 identifies the requester by `operator_id`, which is
 * `inboundTopicId@accountId` — so this is the sender's own ring and not
 * somebody else's. Read from CONSENSUS and never from the home's store: a wiped
 * local file must not be able to cause a second ring (D-165).
 */
async function pendingRequestOf(
  reader: Reader,
  doorbell: string,
  operatorId: string,
): Promise<TopicMessage | null> {
  const messages = await reader.messages(doorbell);
  const answered = new Set<number>();
  let mine: TopicMessage | null = null;
  for (const m of messages) {
    const op = operationOf(m);
    if (op === null || op['p'] !== 'hcs-10') continue;
    if (op['op'] === 'connection_created') {
      const id = op['connection_id'];
      if (typeof id === 'number') answered.add(id);
      continue;
    }
    if (op['op'] === 'connection_request' && op['operator_id'] === operatorId) mine = m;
  }
  if (mine === null) return null;
  return answered.has(mine.sequenceNumber) ? null : mine;
}

/**
 * §6.4 step 1's first contact. Returns the lane if one is created inside the
 * window, or the facts a slip is built from if the window closes (F-6).
 */
async function firstContact(
  ctx: SenderContext,
  coordinates: Coordinates,
  windowSeconds: number,
): Promise<
  | { readonly lane: Lane; readonly contact: ContactAttempts }
  | {
      readonly unanswered: { readonly request: TopicMessage; readonly logEntry: TopicMessage };
      readonly contact: ContactAttempts;
    }
> {
  const operator = operatorIdOf(ctx.doorbell, ctx.account);
  const body = connectionRequestBody(operator);

  // NO DOUBLE-RING, EVER. Before the doorbell is rung, consensus is asked
  // whether this agent already has a request standing on it that no lane
  // answers. §10.5 permits ringing again — "a sender that rings again produces a
  // new request, and, if unanswered, a new slip; each is its own record" — so
  // this is OUR thrift and not the specification's requirement: a second ring
  // costs a second stamp, gives the watcher a second request to answer, and
  // leaves §7.1 choosing between two lanes. Consensus first, then the store
  // (D-165).
  const standing = await pendingRequestOf(ctx.consensus, coordinates.doorbell, operator);

  let request: TopicMessage;
  let logEntry: TopicMessage;
  let reusedRequest = false;

  if (standing !== null) {
    reusedRequest = true;
    request = standing;
    // The sender's own record of its own ring (§5.9). Where the ring is being
    // re-read rather than re-rung, the log entry this run would have written is
    // already there; the slip's inputs name it, so it is found the same way.
    const own = await ctx.consensus.messages(ctx.log);
    logEntry = own.find((m) => operationOf(m)?.['operator_id'] === operator) ?? standing;
  } else {
    // The ringer, where one is given, is the Postmaster paying the doorbell's fee
    // from its own stamp (§6.4 step 1); otherwise the sender pays it (§4.4).
    const ringer: Writer = ctx.ringer ?? ctx.consensus;
    request = await ringer.submitMessage(coordinates.doorbell, body, TRANSACTION_MEMO.connection_request);

    // §5.9: the slip binds the request on the doorbell to the sender's own record
    // of it. The log entry is the sender's, always — it is the sender's topic.
    logEntry = await ctx.consensus.submitMessage(ctx.log, body, TRANSACTION_MEMO.connection_request);
  }

  // ATTEMPTS, and every one of them is a re-READ. The ring above happened at
  // most once; what repeats is looking for the answer, because a mirror node
  // that has not ingested a message yet answers "no" in exactly the words it
  // uses for "never".
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const deadline = Date.now() + windowSeconds * 1000;
    for (;;) {
      const lanes = await lanesFromDoorbell(ctx.consensus, coordinates.doorbell, ctx.account);
      const answered = lanes.find((l) => !before(l.createdAt, request.consensusTimestamp));
      if (answered !== undefined) {
        return {
          lane: answered,
          contact: { attempts: attempt, reusedRequest, totalSeconds: attempt * windowSeconds },
        };
      }
      if (Date.now() >= deadline) break;
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  }

  return {
    unanswered: { request, logEntry },
    contact: { attempts: MAX_ATTEMPTS, reusedRequest, totalSeconds: MAX_ATTEMPTS * windowSeconds },
  };
}

/**
 * §10.4's acknowledgment window, defaulting to `SCHEDULE_MAX_LIFETIME`.
 *
 * §1.6 pins the maximum at 5,356,800 seconds — sixty-two days — for every
 * network (D-77, verified 2026-09-05 against the Hedera documentation and
 * recorded in ledger §H). §10.4 makes the window "a sender parameter, in
 * seconds, at most `SCHEDULE_MAX_LIFETIME`, defaulting to that maximum", and
 * this is both halves of that sentence.
 */
export const SCHEDULE_MAX_LIFETIME = 5_356_800;

/**
 * A `transaction` operation on the lane that names a schedule for this envelope
 * — §11.2's own route to the schedule, read from consensus.
 *
 * Returns the LAST such operation. §10.4 permits a sender to request again —
 * "each request is its own record" — so more than one is conformant, and the
 * one that matters to a recipient about to sign is the most recent.
 */
async function receiptRequestOn(
  reader: Reader,
  lane: string,
  envelopeId: string,
): Promise<{ readonly scheduleId: string; readonly message: TopicMessage } | null> {
  let found: { scheduleId: string; message: TopicMessage } | null = null;
  for (const m of await reader.messages(lane)) {
    const op = operationOf(m);
    if (op === null || op['p'] !== 'hcs-10' || op['op'] !== 'transaction') continue;
    if (envelopeIdOfRequest(op['data']) !== envelopeId) continue;
    const scheduleId = op['schedule_id'];
    if (typeof scheduleId !== 'string' || scheduleId === '') continue;
    found = { scheduleId, message: m };
  }
  return found;
}

/**
 * §6.4 step 7 — the scheduled receipt, and the operation that announces it.
 *
 * Separated from `send` so that a run interrupted inside step 7's own window
 * can be resumed without re-affixing anything (P-7): the envelope is SETTLED
 * either way, and what is missing is a request, not postage.
 */
export async function requestReceipt(
  ctx: SenderContext,
  args: {
    readonly coordinates: Coordinates;
    readonly envelopeId: string;
    readonly lane: string;
    readonly chunkZero: { readonly topicId: string; readonly sequenceNumber: number };
    readonly keyEpoch: number;
    readonly windowSeconds?: number;
  },
): Promise<ReceiptRequested> {
  const manifestInput: ReceiptManifestInput = {
    ledgerTag: ctx.ledgerTag,
    envelopeId: args.envelopeId,
    postmarkRef: args.chunkZero,
    keyEpoch: args.keyEpoch,
    recipientAccount: args.coordinates.account,
    manifestTopic: args.coordinates.manifestTopic,
  };
  const message = receiptManifestBytes(manifestInput);
  const manifestHash = canonicalDigest(JSON.parse(message.toString('utf8')) as Record<string, unknown>, 'hash');

  // IDEMPOTENT AGAINST CONSENSUS FIRST (D-165). A request already standing on
  // this lane for this envelope is the request; a second schedule would give the
  // recipient two things to sign for one envelope, and §11.4 would then have to
  // decide which receipt is the receipt.
  const standing = await receiptRequestOn(ctx.consensus, args.lane, args.envelopeId);
  if (standing !== null) {
    const record = await ctx.consensus.schedule(standing.scheduleId);
    return {
      scheduleId: standing.scheduleId,
      expirationTime: record?.expirationTime ?? null,
      requestSequenceNumber: standing.message.sequenceNumber,
      requestConsensusTimestamp: standing.message.consensusTimestamp,
      manifestHash,
      reused: true,
    };
  }

  const windowSeconds = args.windowSeconds ?? SCHEDULE_MAX_LIFETIME;
  if (windowSeconds > SCHEDULE_MAX_LIFETIME) {
    throw new Error(
      `send: an acknowledgment window of ${windowSeconds}s is over SCHEDULE_MAX_LIFETIME ${SCHEDULE_MAX_LIFETIME}s (§1.6, §10.4)`,
    );
  }

  // The inner submission goes to the RECIPIENT's manifest topic, which only the
  // recipient's key can write to — which is what makes the recipient's signature
  // the only one that can complete it (§10.4). The payer is the SENDER's choice
  // (D-157) and is never the recipient (T-P16-2).
  let record: ScheduleRecord;
  try {
    record = await ctx.consensus.scheduleSubmission({
      topicId: args.coordinates.manifestTopic,
      message,
      payerAccountId: ctx.receiptPayer ?? ctx.account,
      expirationSeconds: windowSeconds,
    });
  } catch (e) {
    // Not a §6.4 failure code: the envelope is SETTLED and stays SETTLED, and
    // §10.4 names no refusal for a request that could not be made. It is raised
    // so the caller sees it rather than reporting a receipt nobody asked for.
    throw new Error(`send: the receipt's schedule was not created (§6.4 step 7): ${e instanceof Error ? e.message : String(e)}`);
  }

  const announced = await ctx.consensus.submitMessage(
    args.lane,
    transactionOperation(operatorIdOf(ctx.doorbell, ctx.account), record.scheduleId, args.envelopeId),
    // HCS-10 gives the `transaction` operation no memo at the pin (D-94, recon
    // C-5), and §6.1 says a tool MUST carry none where it defines none.
    TRANSACTION_OP_MEMO,
  );

  return {
    scheduleId: record.scheduleId,
    expirationTime: record.expirationTime,
    requestSequenceNumber: announced.sequenceNumber,
    requestConsensusTimestamp: announced.consensusTimestamp,
    manifestHash,
    reused: false,
  };
}

/**
 * Resume step 7 for an envelope this sender already posted — P-7's resume, and
 * the only thing a rerun of a `send` that died after SETTLED should do.
 *
 * A plain rerun of `send` is NOT a resume: §7.2 requires a fresh nonce per
 * envelope, so composing again produces a different envelope and a second
 * settlement. The identifier is the handle, and the store is where the caller
 * finds it (D-165).
 */
export async function resumeReceipt(
  ctx: SenderContext,
  coordinates: Coordinates,
  envelopeId: string,
): Promise<ReceiptRequested> {
  const row = ctx.sent?.get(envelopeId);
  if (row === undefined) {
    throw new Error(`send: this sender has no record of the envelope ${envelopeId}; there is nothing to resume`);
  }
  if (!row.returnReceipt) {
    throw new Error(`send: the envelope ${envelopeId} requested no return receipt (§7.7), so step 7 was never owed`);
  }
  if (row.chunkZero === undefined) {
    throw new Error(
      `send: the envelope ${envelopeId} never reached SUBMITTED, so it has no chunk 0 postmark for a receipt to name (§10.4)`,
    );
  }
  const out = await requestReceipt(ctx, {
    coordinates,
    envelopeId,
    lane: row.lane,
    chunkZero: row.chunkZero,
    keyEpoch: row.keyEpoch,
  });
  ctx.sent?.put({ ...row, stage: 'requested', scheduleId: out.scheduleId });
  return out;
}

/** §10.5's slip proof, as a manifest to publish. */
function slipManifest(slip: AttemptedDeliverySlip, ledgerTag: string, manifestTopic: string): Record<string, unknown> {
  const parts = {
    rule: { id: 'wishmail:slip', revision: '0.5' },
    // §5.2's inputs: the locator is where a Verifier re-obtains them — the
    // request on the doorbell and its record on the sender's log, both on
    // consensus, so no snapshot is owed. The digest is over what the rule fired
    // on: the resolution proof's hash, the request's consensus timestamp, and
    // the window, which §5.9 calls the slip's one authored field.
    inputs: proofInputs(
      {
        ledgerTag,
        doorbell: slip.doorbell,
        request: { ledgerTag, topicId: slip.doorbell, sequenceNumber: slip.connectionRequestSeq },
        log: { ledgerTag, topicId: slip.log, sequenceNumber: slip.logSeq },
      },
      {
        resolutionProofHash: slip.resolutionProof.hash,
        requestConsensusTimestamp: slip.consensusTimestamp,
        window: slip.window,
      },
    ),
    output: { value: 'unanswered' },
    meaning: {
      // §10.5 fixes what this must SAY — "the statement that expiry is not
      // silence and that nothing is claimed about the recipient" — and §9.1's
      // budget fixes how long it may be (N = 70, D-167). Both hold at once:
      // §10.5's own words are 66 bytes.
      statement: 'Expiry is not silence, and nothing is claimed about the recipient.',
      // §5.2's canonical location (D-163): the topic this slip's manifest is
      // published on — the sender's own manifest topic, which §10.5 requires the
      // slip's manifest to be on before `send` returns a slip. It is NOT the log
      // entry: that is evidence, and evidence lives in `inputs.locator` above.
      uri: proofLocation(ledgerTag, manifestTopic),
      trustClass: 'math',
      endorsements: ['timed-out'],
    },
  };
  return { ...parts, hash: canonicalDigest(parts) };
}

/** §6.4, steps 1 through 6. */
export async function send(ctx: SenderContext, req: SendRequest): Promise<SendResult> {
  const { coordinates } = req;
  const windowSeconds = req.windowSeconds ?? DEFAULT_WINDOW_SECONDS;

  // --- Preconditions (§6.4). -------------------------------------------------
  if (coordinates.resolutionProof.hash === undefined || coordinates.resolutionProof.hash === '') {
    refuse('SEND_UNRESOLVED', 'the coordinates carry no resolution proof');
  }
  if (coordinates.ledgerTag !== ctx.ledgerTag) {
    refuse('SEND_UNRESOLVED', `the coordinates name ${coordinates.ledgerTag} and this sender is on ${ctx.ledgerTag}`);
  }
  const returnReceipt = req.returnReceipt === true;
  if (returnReceipt) {
    // T-P16-2, at the one place it can be enforced rather than observed: "The
    // recipient MUST NOT be charged for a receipt." A schedule whose payer is
    // the recipient would charge the recipient the instant it signed, and by
    // then the bytes are on consensus and cannot be edited (§10.4).
    const payer = ctx.receiptPayer ?? ctx.account;
    if (payer === coordinates.account) {
      throw new Error(
        `send: the receipt's schedule would name the recipient ${payer} as its payer, and §10.4 forbids charging the recipient for a receipt (T-P16-2)`,
      );
    }
    if (coordinates.manifestTopic === '' || coordinates.manifestTopic === undefined) {
      refuse(
        'SEND_UNRESOLVED',
        'the coordinates name no manifest topic for the recipient, and §10.4 schedules the receipt to exactly that topic (§5.3, D-166)',
      );
    }
  }

  const recipientKey = await ctx.consensus.accountKey(coordinates.account);
  if (recipientKey === null) refuse('SEND_UNRESOLVED', `no key on consensus for ${coordinates.account}`);

  // --- 1. Lane. --------------------------------------------------------------
  let lane: Lane | undefined;
  for (const candidate of await lanesFromDoorbell(ctx.consensus, coordinates.doorbell, ctx.account)) {
    if ((await laneRefusal(ctx.consensus, candidate, ctx.publicKey, recipientKey)) === null) {
      lane = candidate;
      break;
    }
  }

  if (lane === undefined) {
    if ((await ctx.consensus.stampBalance()) < 1 && ctx.ringer === undefined) {
      refuse('SEND_INSUFFICIENT_STAMPS', 'first contact costs one stamp at the doorbell (§4.4)');
    }
    const contact = await firstContact(ctx, coordinates, windowSeconds);
    if ('unanswered' in contact) {
      const slip: AttemptedDeliverySlip = {
        ledgerTag: ctx.ledgerTag,
        address: coordinates.address,
        profile: coordinates.profile,
        resolutionProof: coordinates.resolutionProof,
        doorbell: coordinates.doorbell,
        connectionRequestSeq: contact.unanswered.request.sequenceNumber,
        consensusTimestamp: contact.unanswered.request.consensusTimestamp,
        log: ctx.log,
        logSeq: contact.unanswered.logEntry.sequenceNumber,
        window: windowSeconds,
        endorsement: 'timed-out',
      };
      // The reader is run on the writer's output before that output leaves the
      // tool (CLAUDE.md §9). A slip is an AUTHORED object of §5.9, and
      // spec/schemas/attempted-delivery-slip.schema.json is what a Verifier
      // reading one validates it against, so `send` validates it here rather
      // than discovering at replay that it never could. The envelope and its
      // chunks are validated this way at assembly; this closes the one
      // authored object of §6.4 that was not.
      const slipErrors = schemas(repoRoot()).validate('attempted-delivery-slip', slip);
      if (slipErrors.length > 0) {
        throw new Error(
          `send: the slip does not validate against its own registered schema (§5.9): ${slipErrors.join('; ')}`,
        );
      }
      // §10.5: "send MUST publish the slip's manifest on the sender's manifest
      // topic before returning a slip" (T-P12-5).
      const manifestLocator = await publishManifest(ctx, slipManifest(slip, ctx.ledgerTag, ctx.manifestTopic));
      return { kind: 'slip', slip, manifestLocator };
    }
    lane = contact.lane;
    const refusal = await laneRefusal(ctx.consensus, lane, ctx.publicKey, recipientKey);
    if (refusal !== null) refuse('SEND_LANE_INVALID', refusal);
  }

  // --- 2. Manifest. ----------------------------------------------------------
  // Published before assembly, because the AAD binds the proof's hash and §11.4
  // requires the manifest's postmark to precede chunk 0's (T-P9-8).
  const manifestLocator = await publishManifest(ctx, req.manifest);

  // --- 3. Assembly. ----------------------------------------------------------
  const sealed = sealEnvelope({
    ledgerTag: ctx.ledgerTag,
    lane: lane.topicId,
    profile: coordinates.profile,
    resolutionProof: { hash: coordinates.resolutionProof.hash, uri: manifestLocator },
    recipientX25519Pub: coordinates.x25519Pub,
    keyEpoch: coordinates.keyEpoch,
    payload: req.payload,
    returnReceipt,
    schemaRef: ctx.schemaRef,
    operatorId: operatorIdOf(ctx.doorbell, ctx.account),
  });

  if ((await ctx.consensus.stampBalance()) < sealed.postage) {
    refuse(
      'SEND_INSUFFICIENT_STAMPS',
      `the envelope's postage is ${sealed.postage} and the sender holds ${await ctx.consensus.stampBalance()}`,
    );
  }

  // --- 4. Affix. -------------------------------------------------------------
  // The reference is pinned first so the header can carry it, then the transfer
  // is submitted, then the chunks: which is what makes the settlement's
  // consensus timestamp precede chunk 0's (§11.4, T-P7-1).
  const settlementRef = ctx.consensus.pinTransferRef();
  let assembled: AssembledEnvelope;
  let settlement: Settlement;
  try {
    assembled = affix(sealed, settlementRef);
    // WRITTEN BEFORE THE TRANSFER IS SUBMITTED, and that ordering is the whole
    // value of the row (P-7). A run that dies inside the transfer's own window
    // has either spent postage or not, and only the identifier can tell anyone
    // which — it is what the memo on consensus carries, and a fresh process
    // would not know to look for it.
    ctx.sent?.put({
      envelopeId: sealed.id,
      lane: lane.topicId,
      recipientAccount: coordinates.account,
      settlementRef,
      postage: sealed.postage,
      returnReceipt,
      stage: 'affixed',
      chunkCount: assembled.chunks.length,
      keyEpoch: coordinates.keyEpoch,
    });
    settlement = await ctx.consensus.transferStamps(settlementRef, ctx.treasury, sealed.postage, sealed.memo);
  } catch (e) {
    // Nothing submitted, nothing consumed (§6.4's postcondition on this failure).
    refuse('SEND_AFFIX_FAILED', e instanceof Error ? e.message : String(e));
  }

  // --- 5. Submit, and 6. Settle. ---------------------------------------------
  const operator = operatorIdOf(ctx.doorbell, ctx.account);
  const postmarks: Postmark[] = [];
  for (const chunk of assembled.chunks) {
    let message: TopicMessage;
    try {
      message = await ctx.consensus.submitMessage(
        lane.topicId,
        messageOperation(chunk, operator),
        TRANSACTION_MEMO.message,
      );
    } catch (e) {
      // Affixed, not fully submitted: the envelope is partial and may be
      // resubmitted against the same settlement (D-52).
      refuse(
        'SEND_SUBMIT_FAILED',
        `chunk ${chunk.i} of ${assembled.chunks.length}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    postmarks.push(postmarkOf(message, ctx.ledgerTag, sealed.id, chunk.i));
    if (chunk.i === 0) {
      const affixed = ctx.sent?.get(sealed.id);
      if (affixed !== undefined) {
        ctx.sent?.put({
          ...affixed,
          stage: 'submitted',
          chunkZero: { topicId: message.topicId, sequenceNumber: message.sequenceNumber },
        });
      }
    }
  }

  // `submitMessage` returns only once consensus has assigned a timestamp, so
  // step 6 is the loop above having finished rather than a wait of its own.
  const zero = postmarks[0];
  if (zero === undefined) refuse('SEND_SUBMIT_FAILED', 'no chunk was submitted');
  if (!before(settlement.consensusTimestamp, zero.consensusTimestamp)) {
    // Would be unstamped at replay (T-P7-1). It cannot happen by construction;
    // it is checked because the construction is the only thing preventing it.
    throw new Error(
      `send: the settlement at ${settlement.consensusTimestamp} does not precede chunk 0 at ${zero.consensusTimestamp} (§11.4)`,
    );
  }

  const row = ctx.sent?.get(sealed.id);
  const chunkZero = { topicId: zero.topicId, sequenceNumber: zero.sequenceNumber };
  if (row !== undefined) ctx.sent?.put({ ...row, stage: 'settled', chunkZero });

  // --- 7. Receipt request (§6.4 step 7, §10.4). ------------------------------
  // The envelope is SETTLED before this runs and stays SETTLED whatever happens
  // in it: a receipt is a different proof on a different axis (§8.1), and a
  // request that fails to be made leaves an envelope that was delivered to the
  // lane exactly as one that was never asked for.
  let receipt: ReceiptRequested | undefined;
  if (returnReceipt) {
    receipt = await requestReceipt(ctx, {
      coordinates,
      envelopeId: sealed.id,
      lane: lane.topicId,
      chunkZero,
      keyEpoch: coordinates.keyEpoch,
      ...(req.receiptWindowSeconds === undefined ? {} : { windowSeconds: req.receiptWindowSeconds }),
    });
    const settled = ctx.sent?.get(sealed.id);
    if (settled !== undefined) ctx.sent?.put({ ...settled, stage: 'requested', scheduleId: receipt.scheduleId });
  }

  return {
    kind: 'postmark',
    postmark: zero,
    envelope: assembled.envelope,
    postmarks,
    settlement,
    manifestLocator,
    lane: lane.topicId,
    ...(receipt === undefined ? {} : { receipt }),
  };
}
