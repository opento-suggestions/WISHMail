/**
 * `inbox` — §6.5. Read the caller's lanes; open what binds.
 *
 * "`inbox` reads the caller's lanes from consensus, reassembles each envelope by
 * its chain (§11.3), and for each complete envelope: rebuilds the AAD from the
 * header and the lane and checks it against `id`; fetches the settlement by
 * `settlementRef` and checks that its memo carries `id` and its amount covers
 * the postage; and decrypts against the AAD under the key of the envelope's
 * epoch. An envelope that passes opens. An envelope that fails any check is
 * returned unopened with a reason."
 *
 * Two things this tool does not do, and both are the point. It writes nothing —
 * "Reading a lane leaves no mark on it (blind delivery, D-29)" — so it is given
 * a `Reader` and there is nothing in its hands that could write. And it never
 * fails where it can return: "None of these is a failure of the tool", so every
 * check below produces an unopened `Delivery` with a reason, and the only
 * failure §6.5 names is `INBOX_MIRROR_UNREACHABLE`.
 *
 * Conformance: T-P1-1, T-P1-2, T-P1-6, T-P1-10, T-P1-11, T-P3-3, T-P8-1,
 * T-P9-10.
 */
import type { KeyObject } from 'node:crypto';
import { bindsTo } from '../core/aad.js';
import { unb64u } from '../core/canonical.js';
import { reassemble, type Chunk, type ChunkHeader, type ObservedChunk } from '../core/chunk.js';
import { envelopeIdOfMemo, headerPostage, headerWeightAgrees, recoverEnvelope, settlementMemo, type Envelope } from '../core/envelope.js';
import { refuse } from '../core/failure.js';
import { LEDGER_TAGS } from '../core/aad.js';
import { open } from '../core/seal.js';
import { envelopeIdOfRequest } from '../core/receipt.js';
import { accountOf } from '../ops/hcs10.js';
import { before, compareTimestamps, operationOf, type Reader, type Settlement, type TopicMessage } from './consensus.js';

/** §6.5's reasons. Every one of them is a returned value, never a thrown failure. */
export type DeliveryReason =
  | 'INBOX_INCOMPLETE'
  | 'INBOX_UNBOUND'
  | 'INBOX_UNSTAMPED'
  | 'INBOX_EPOCH_UNKNOWN'
  | 'INBOX_SCHEMA_UNRESOLVED';

/**
 * §6.5's fourth field, and what a Recipient does with it.
 *
 * "For a Recipient, a delivery whose header requests a receipt carries the
 * pending schedule from the lane's `transaction` operation, so that `ack` can
 * sign it." So this is not a receipt — it is the REQUEST, read off the lane by
 * §11.2's own route, and it is what `ack` takes.
 *
 * `scheduleId` is present exactly where the lane carries a `transaction`
 * operation naming this envelope. `hdr.rr` true with no such operation is a
 * sender that was interrupted inside §6.4 step 7, and it is reported as it is —
 * requested, not yet requestable — rather than hidden or invented.
 */
export interface PendingReceipt {
  readonly scheduleId: string;
  /** Where the request sits on the lane, so a reader can go and look at it. */
  readonly sequenceNumber: number;
  readonly consensusTimestamp: string;
  /** True where the envelope's header asked for one (§7.7, `hdr.rr`). */
  readonly requestedByHeader: boolean;
}

/** §6.5's `Delivery {envelope, opened, payload?, reason?, returnReceipt?}`. */
export interface Delivery {
  readonly envelope: Envelope;
  readonly opened: boolean;
  readonly payload?: Buffer;
  readonly reason?: DeliveryReason;
  /** Why the reason, in words. Not part of §6.5's shape; a reason code is not a diagnosis. */
  readonly detail?: string;
  readonly lane: string;
  readonly chunkPostmarks: readonly { readonly sequenceNumber: number; readonly consensusTimestamp: string }[];
  /** §6.5's pending schedule, where the header requested a receipt (§10.4). */
  readonly returnReceipt?: PendingReceipt;
  /** The epoch the envelope OPENED under — what `ack` binds (§10.4, T-P1-9). */
  readonly openedUnderEpoch?: number;
}

/**
 * Every receipt request on a lane, by the envelope its `data` names.
 *
 * §10.4 permits a sender to request again — "each request is its own record" —
 * so the LAST one is the pending schedule: an earlier request whose schedule
 * expired unsigned is `unclaimed` and is a Verifier's business, not a
 * recipient's.
 */
async function receiptRequests(reader: Reader, lane: string): Promise<Map<string, PendingReceipt>> {
  const out = new Map<string, PendingReceipt>();
  let messages: readonly TopicMessage[];
  try {
    messages = await reader.messages(lane);
  } catch (e) {
    refuse('INBOX_MIRROR_UNREACHABLE', e instanceof Error ? e.message : String(e));
  }
  for (const m of messages) {
    const op = operationOf(m);
    if (op === null || op['p'] !== 'hcs-10' || op['op'] !== 'transaction') continue;
    const envelopeId = envelopeIdOfRequest(op['data']);
    const scheduleId = op['schedule_id'];
    if (envelopeId === null || typeof scheduleId !== 'string' || scheduleId === '') continue;
    out.set(envelopeId, {
      scheduleId,
      sequenceNumber: m.sequenceNumber,
      consensusTimestamp: m.consensusTimestamp,
      requestedByHeader: false,
    });
  }
  return out;
}

/**
 * The keys a Recipient holds, by epoch. §7.6: "An agent that declares MUST
 * retain the private key of every epoch it has ever published, and MUST open an
 * envelope under the key of the epoch its header names" (T-P8-1). A map, not a
 * key, is what that sentence requires.
 */
export type EpochKeys = ReadonlyMap<number, KeyObject>;

export interface InboxContext {
  readonly reader: Reader;
  /** The caller's account: the recipient, or a Correspondent reading its own lanes. */
  readonly account: string;
  readonly keys: EpochKeys;
  /** The treasury and stamp token the postage must have gone to, where the caller knows them (§11.4). */
  readonly treasury?: string;
  readonly stampToken?: string;
}

export interface InboxRequest {
  /** The lanes to read. §6.5 takes one or all; the caller's lane set is the caller's to know. */
  readonly lanes: readonly string[];
  /** Only envelopes whose canonical chunk 0 is at or after this consensus timestamp (§11.2). */
  readonly since?: string;
}

/** Every chunk on a lane, with what consensus recorded about each (§11.3). */
export async function chunksOnLane(reader: Reader, lane: string): Promise<readonly ObservedChunk[]> {
  let messages: readonly TopicMessage[];
  try {
    messages = await reader.messages(lane);
  } catch (e) {
    refuse('INBOX_MIRROR_UNREACHABLE', e instanceof Error ? e.message : String(e));
  }

  const observed: ObservedChunk[] = [];
  for (const m of messages) {
    const op = operationOf(m);
    if (op === null || op['p'] !== 'hcs-10' || op['op'] !== 'message') continue;
    const data = op['data'];
    if (typeof data !== 'string') continue;
    let chunk: Chunk;
    try {
      chunk = JSON.parse(data) as Chunk;
    } catch {
      continue;
    }
    if (chunk?.p !== 'wishmail' || typeof chunk.id !== 'string' || typeof chunk.i !== 'number') continue;
    const operator = op['operator_id'];
    observed.push({
      chunk,
      sequenceNumber: m.sequenceNumber,
      consensusTimestamp: m.consensusTimestamp,
      ...(typeof operator === 'string' ? { operatorId: operator } : {}),
    });
  }
  return observed;
}

/** The identifiers of every envelope any chunk on a lane claims to be of. */
export function envelopeIdsOf(observed: readonly ObservedChunk[]): readonly string[] {
  const ids = new Set<string>();
  for (const o of observed) ids.add(o.chunk.id);
  return [...ids].sort();
}

/**
 * The postage checks of §11.4, which `inbox` and `verify` share word for word:
 * the settlement "exists, its memo is `wishmail:<id>`, its `to` is the treasury,
 * its consensus timestamp precedes chunk 0's, and it is in the stamp token; its
 * amount covers the envelope's postage".
 *
 * Returns the reasons it failed, empty where it holds. The treasury and the
 * token are checked only where the caller knows them: §6.5's own sentence for
 * `inbox` names the memo and the amount, and a Recipient that has not read the
 * price list cannot check the rest — but a Verifier always can (§11.4), and it
 * passes them.
 */
export function postageRefusals(
  settlement: Settlement | null,
  header: ChunkHeader,
  envelopeId: string,
  chunkZeroAt: string,
  options: { readonly treasury?: string; readonly stampToken?: string } = {},
): readonly string[] {
  const reasons: string[] = [];
  if (settlement === null) return ['no settlement at the reference the header names (§11.4)'];
  if (settlement.memo !== settlementMemo(envelopeId)) {
    reasons.push(`the settlement's memo is ${JSON.stringify(settlement.memo)} and not ${settlementMemo(envelopeId)}`);
  }
  if (envelopeIdOfMemo(settlement.memo) !== envelopeId) {
    // The same fact from the reader's side, which is how an orphan is found.
    if (reasons.length === 0) reasons.push('the settlement does not name this envelope');
  }
  if (options.treasury !== undefined && settlement.to !== options.treasury) {
    reasons.push(`the settlement's stamps went to ${settlement.to} and not to the treasury`);
  }
  if (options.stampToken !== undefined && settlement.tokenId !== options.stampToken) {
    reasons.push(`the settlement is in ${settlement.tokenId} and not in the stamp token (T-P11-1)`);
  }
  if (!before(settlement.consensusTimestamp, chunkZeroAt)) {
    reasons.push(`the settlement at ${settlement.consensusTimestamp} does not precede chunk 0 at ${chunkZeroAt} (T-P7-1)`);
  }
  const postage = headerPostage(header);
  if (settlement.amount < postage) {
    reasons.push(`the settlement moved ${settlement.amount} stamps and the postage is ${postage} (T-P7-3)`);
  }
  if (!headerWeightAgrees(header)) {
    reasons.push(`the header declares weight ${header.w} for ${header.cb} ciphertext bytes (§7.5)`);
  }
  return reasons;
}

/** §6.5. Reads; opens what binds; writes nothing. */
export async function inbox(ctx: InboxContext, req: InboxRequest): Promise<readonly Delivery[]> {
  const deliveries: Delivery[] = [];

  for (const lane of req.lanes) {
    const observed = await chunksOnLane(ctx.reader, lane);
    // §6.5's fourth field, read once per lane rather than once per envelope.
    const requests = await receiptRequests(ctx.reader, lane);

    for (const id of envelopeIdsOf(observed)) {
      const binds = (h: ChunkHeader): boolean => bindsTo(h, lane, id);
      const walk = reassemble(observed, id, binds);
      const zero = walk.chain[0];

      // No chunk 0 that binds. Two different facts wear one state: nothing with
      // index 0 arrived at all (incomplete), or one did and its header does not
      // rebuild to the identifier (unbound, P-1's first weld).
      if (walk.state === 'unrooted' || zero === undefined) {
        const claimed = observed.find((o) => o.chunk.i === 0 && o.chunk.hdr !== undefined);
        if (claimed === undefined) {
          deliveries.push(placeholder(id, lane, 'INBOX_INCOMPLETE', 'no chunk 0 is on the lane (F-4)', observed));
        } else {
          const recovered = recoverEnvelope(claimed.chunk, lane);
          deliveries.push({
            envelope: recovered.envelope,
            opened: false,
            reason: 'INBOX_UNBOUND',
            detail: "chunk 0's header does not rebuild to the identifier its chunks carry (§5.6, §7.2, T-P1-1)",
            lane,
            chunkPostmarks: [],
          });
        }
        continue;
      }

      const header = zero.chunk.hdr as ChunkHeader;
      const { envelope } = recoverEnvelope(zero.chunk, lane);
      const chunkPostmarks = walk.chain.map((o) => ({
        sequenceNumber: o.sequenceNumber,
        consensusTimestamp: o.consensusTimestamp,
      }));
      const since = req.since;
      if (since !== undefined && compareTimestamps(zero.consensusTimestamp, since) < 0) continue;

      const unopened = (reason: DeliveryReason, detail: string): void => {
        deliveries.push({ envelope, opened: false, reason, detail, lane, chunkPostmarks });
      };

      if (walk.state === 'partial') {
        unopened('INBOX_INCOMPLETE', `${walk.chain.length} of ${zero.chunk.n} links are on the lane (F-4)`);
        continue;
      }
      if (walk.integrityFailed) {
        unopened('INBOX_UNBOUND', 'the slices do not concatenate to the ciphertext digest the header declares (§11.3, T-P1-11)');
        continue;
      }
      if (!(LEDGER_TAGS as readonly string[]).includes(header.l)) {
        unopened('INBOX_UNBOUND', `the header names the ledger tag ${JSON.stringify(header.l)}, which names no ledger (§5.1, T-P9-11)`);
        continue;
      }

      // §7.2's fourth weld, from the reader's side: the settlement is read
      // first because the weld compares the chunks' operator_id against it.
      let settlement: Settlement | null = null;
      try {
        settlement = await ctx.reader.transfer(header.st);
      } catch (e) {
        refuse('INBOX_MIRROR_UNREACHABLE', e instanceof Error ? e.message : String(e));
      }

      if (settlement !== null) {
        const wrong = walk.chain.filter((o) => o.operatorId === undefined || accountOf(o.operatorId) !== settlement?.from);
        if (wrong.length > 0) {
          unopened(
            'INBOX_UNBOUND',
            `chunk ${wrong[0]?.chunk.i ?? '?'}'s operator_id does not name the account the postage was affixed from (§7.2, T-P1-6)`,
          );
          continue;
        }
      }

      const postage = postageRefusals(settlement, header, id, zero.consensusTimestamp, {
        ...(ctx.treasury === undefined ? {} : { treasury: ctx.treasury }),
        ...(ctx.stampToken === undefined ? {} : { stampToken: ctx.stampToken }),
      });
      if (postage.length > 0) {
        unopened('INBOX_UNSTAMPED', postage.join('; '));
        continue;
      }

      const key = ctx.keys.get(header.ke);
      if (key === undefined) {
        unopened('INBOX_EPOCH_UNKNOWN', `no key held for epoch ${header.ke} (§7.6)`);
        continue;
      }

      // §7.3: "Opening … fails closed on any authentication error." A failure
      // here is `INBOX_UNBOUND` and never a thrown failure of the tool (P-12).
      try {
        const payload = open(header.ep, key, unb64u(envelope.aad), walk.ciphertext as Buffer);
        // §6.5: "a delivery whose header requests a receipt carries the pending
        // schedule from the lane's `transaction` operation, so that `ack` can
        // sign it." Only on a delivery that OPENED: §6.6 refuses an envelope
        // that did not bind, for every reason in §6.5 (T-P1-3), so a pending
        // schedule on an unopened delivery would be an invitation to do the one
        // thing `ack` may not.
        const pending = requests.get(id);
        deliveries.push({
          envelope,
          opened: true,
          payload,
          lane,
          chunkPostmarks,
          openedUnderEpoch: header.ke,
          ...(pending === undefined
            ? {}
            : { returnReceipt: { ...pending, requestedByHeader: header.rr === true } }),
        });
      } catch (e) {
        unopened('INBOX_UNBOUND', `the seal did not open: ${e instanceof Error ? e.message : String(e)} (§7.3)`);
      }
    }
  }

  return deliveries;
}

/**
 * A delivery for an envelope no header was recovered for. §6.5 returns a
 * `Delivery {envelope, ...}` in every case, and where there is no header there
 * is no envelope to describe — so what is returned names the identifier and the
 * lane and admits it knows nothing else.
 */
function placeholder(
  id: string,
  lane: string,
  reason: DeliveryReason,
  detail: string,
  observed: readonly ObservedChunk[],
): Delivery {
  const any = observed.find((o) => o.chunk.id === id);
  return {
    envelope: {
      ledgerTag: '',
      lane,
      profile: '',
      resolutionProof: { hash: '', uri: null },
      nonce: '',
      aad: '',
      aadHash: id,
      keyEpoch: -1,
      ephemeralPub: '',
      ciphertextDigest: '',
      ciphertextBytes: 0,
      weight: 0,
      settlementRef: '',
      schemaRef: any?.chunk.s ?? '',
      chunkCount: any?.chunk.n ?? 0,
    },
    opened: false,
    reason,
    detail,
    lane,
    chunkPostmarks: [],
  };
}
