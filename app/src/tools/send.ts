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
 * Steps 1 to 6 are here. Step 7 is NOT, and `send` refuses `returnReceipt`
 * rather than skipping it: postage would include the receipt fee (§7.5) and
 * chunk 0's header would request it (§7.7), so an envelope assembled without
 * step 7 is one whose sender paid for a receipt nobody was asked for — an
 * artefact that is wrong on consensus and cannot be withdrawn. §10.4's schedule
 * lands with `ack` (T-P1-8, T-P1-9), and the refusal is what holds the place.
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
}

export interface SendRequest {
  readonly coordinates: Coordinates;
  /** The full proof, as `resolve` produced it; published at step 2 (§10.2). */
  readonly manifest: Record<string, unknown>;
  readonly payload: Buffer;
  readonly returnReceipt?: boolean;
  /** Seconds to wait for an answer at first contact (§6.4, §10.5). */
  readonly windowSeconds?: number;
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

export interface SendPostmarked {
  readonly kind: 'postmark';
  /** §6.4: "send then returns chunk 0's Postmark" (D-30). */
  readonly postmark: Postmark;
  readonly envelope: Envelope;
  readonly postmarks: readonly Postmark[];
  readonly settlement: Settlement;
  readonly manifestLocator: MessageLocator;
  readonly lane: string;
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
 * How long `send` waits at first contact, and how often it looks. §6.4 gives
 * `window` in seconds; nothing in the specification fixes the polling interval,
 * which is why it is here and not in `spec/pins.json`.
 */
export const DEFAULT_WINDOW_SECONDS = 30;
const POLL_INTERVAL_MS = 1000;

/**
 * §6.4 step 1's first contact. Returns the lane if one is created inside the
 * window, or the facts a slip is built from if the window closes (F-6).
 */
async function firstContact(
  ctx: SenderContext,
  coordinates: Coordinates,
  windowSeconds: number,
): Promise<
  | { readonly lane: Lane }
  | { readonly unanswered: { readonly request: TopicMessage; readonly logEntry: TopicMessage } }
> {
  const operator = operatorIdOf(ctx.doorbell, ctx.account);
  const body = connectionRequestBody(operator);

  // The ringer, where one is given, is the Postmaster paying the doorbell's fee
  // from its own stamp (§6.4 step 1); otherwise the sender pays it (§4.4).
  const ringer: Writer = ctx.ringer ?? ctx.consensus;
  const request = await ringer.submitMessage(coordinates.doorbell, body, TRANSACTION_MEMO.connection_request);

  // §5.9: the slip binds the request on the doorbell to the sender's own record
  // of it. The log entry is the sender's, always — it is the sender's topic.
  const logEntry = await ctx.consensus.submitMessage(ctx.log, body, TRANSACTION_MEMO.connection_request);

  const deadline = Date.now() + windowSeconds * 1000;
  for (;;) {
    const lanes = await lanesFromDoorbell(ctx.consensus, coordinates.doorbell, ctx.account);
    const answered = lanes.find((l) => !before(l.createdAt, request.consensusTimestamp));
    if (answered !== undefined) return { lane: answered };
    if (Date.now() >= deadline) return { unanswered: { request, logEntry } };
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
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
  if (req.returnReceipt === true) {
    // Not a TOOL_REASON: §6.4 names no failure for this, because in a release
    // that implements §10.4 there is none. See the head of this file.
    throw new Error(
      'send: returnReceipt is not implemented in this release — §10.4 lands with `ack` (T-P1-8, T-P1-9), and postage that pays for a receipt nobody requested is an artefact on consensus that cannot be withdrawn',
    );
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
    returnReceipt: false,
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

  return {
    kind: 'postmark',
    postmark: zero,
    envelope: assembled.envelope,
    postmarks,
    settlement,
    manifestLocator,
    lane: lane.topicId,
  };
}
