/**
 * `verify` — §11. Reconcile a correspondence from consensus alone.
 *
 * §11.1: "Reconciliation is keyless and brokerless: it reads what Consensus
 * recorded and needs nothing that any party holds (P-3, P-4). And it is
 * deterministic: the same scope and window yield the same evidence from any
 * Verifier, at any time, byte for byte."
 *
 * Both of those are structural here rather than promised. This module is handed
 * a `Reader` — an interface with no write on it and nothing to configure — and
 * everything that could differ between two Verifiers is either in the SCOPE,
 * where P-3 puts it ("the same scope and window"), or under `observations`,
 * which §11.7 excludes from the digest. That is why the stamp token and the
 * profiles a Verifier claims are scope and not options: two Verifiers given the
 * same scope agree, and a Verifier given less checks less and says so, rather
 * than silently digesting a different answer.
 *
 * WHAT THIS RELEASE DOES NOT DO, stated rather than hidden:
 *
 *  - Receipts are read as requests and appraised no further than `unclaimed`.
 *    §10.4's schedule lands with `ack`; until then a request has no schedule
 *    record to read, and inventing an appraisal for one would be inventing
 *    evidence (T-P1-8, T-P1-9, T-P15-5 stay failing).
 *  - `orphans` holds only the settlements this Verifier READ, and every
 *    settlement it reads is named by some chunk 0's `hdr.st`. §11.2's ingestion
 *    table is closed — "Nothing on that list is chosen by the Verifier or
 *    supplied to it" — and it reaches a settlement only through a chunk. So an
 *    F-3 orphan, postage affixed with no chunk ever submitted, is not reachable
 *    by that table at all. Raised as a finding rather than coded around: either
 *    §11.2 gains a route to the treasury's transfers, or F-3's "reported under
 *    `orphans`" means only what a chunk led the Verifier to. MINE, 2026-09-08.
 *
 * Conformance: T-P3-1, T-P3-2, T-P3-3, T-P3-4, T-P3-5, T-P4-1, T-P4-3,
 * T-P12-2, T-P12-6, T-P15-5.
 */
import { bindsTo } from '../core/aad.js';
import { LEDGER_TAGS } from '../core/aad.js';
import { canonicalBytes, canonicalDigest, sha256hex } from '../core/canonical.js';
import { reassemble, type ChunkHeader, type ObservedChunk } from '../core/chunk.js';
import { recoverEnvelope, settlementMemo, type Envelope } from '../core/envelope.js';
import { refuse } from '../core/failure.js';
import { isProofLocation } from '../core/locator.js';
import { manifestAmong } from '../core/proof.js';
import { accountOf } from '../ops/hcs10.js';
import { RELEASE } from '../release.js';
import { chunksOnLane, envelopeIdsOf, postageRefusals } from './inbox.js';
import { line } from './narration.js';
import {
  outputDigestOf,
  resolveHcs14,
  type MailCoordinates,
  type ProfileSource,
} from '../resolve/hcs14.js';
import { lanesFromDoorbell, closedBy } from './send.js';
import {
  before,
  compareTimestamps,
  operationOf,
  postmarkOf,
  type Postmark,
  type Reader,
  type Settlement,
  type TopicMessage,
} from './consensus.js';

/** §6.7's scope, and the two facts P-3 requires to travel with it. */
export interface VerifyScope {
  readonly lane?: string;
  readonly envelopeId?: string;
  readonly topics?: readonly string[];
  /**
   * The stamp token and its treasury. §11.4 counts a settlement only if its
   * `to` is the treasury and it is in the stamp token; a Verifier that was not
   * told which token that is cannot check either, and says so in `reasons`
   * rather than passing the check by silence.
   */
  readonly stampToken?: { readonly tokenId: string; readonly treasury: string };
  /** The profiles this Verifier claims (§9.6). A resolution under any other appraises unverified. */
  readonly claims?: readonly string[];
}

export interface VerifyOptions {
  /** §11.2's window, in consensus time. Absent: everything the topics hold. */
  readonly window?: { readonly from: string; readonly to: string };
  readonly narrative?: boolean;
  /** What to record under `observations.mirror` — the surface read, not evidence. */
  readonly mirror?: string;
}

export type Standing = 'verified' | 'unverified' | 'unstamped' | 'unbound';
export type EnvelopeState = 'DRAFT' | 'STAMPED' | 'SUBMITTED' | 'SETTLED' | 'ACKED';

export interface CorrespondenceEntry {
  readonly envelope: Envelope;
  readonly state: EnvelopeState;
  readonly chunks: readonly Postmark[];
  readonly offChain: readonly Postmark[];
  readonly settlement?: Settlement;
  readonly requests: readonly {
    readonly scheduleId: string;
    readonly sequenceNumber: number;
    readonly consensusTimestamp: string;
    readonly status: string;
  }[];
  readonly appraisal: {
    readonly declared: { readonly trustClass: string; readonly endorsements: readonly string[] };
    readonly appraised: { readonly standing: Standing; readonly reasons: readonly string[] };
    readonly resolution: { readonly standing: 'verified' | 'unverified'; readonly reasons: readonly string[] };
    readonly receipt: { readonly status: string; readonly reasons: readonly string[] };
  };
}

export interface EvidenceBundle {
  readonly spec: string;
  readonly ledgerTags: readonly string[];
  readonly window: { readonly from: string; readonly to: string };
  readonly topics: readonly string[];
  readonly correspondence: readonly CorrespondenceEntry[];
  readonly orphans: readonly Settlement[];
  readonly observations: Record<string, unknown>;
  readonly digest: string;
}

export interface Narrative {
  readonly bundleDigest: string;
  readonly text: string;
}

/** §11.5's order. A reason is a test identifier and the table is the order. */
const REASON_ORDER = [
  'T-P1-1',
  'T-P1-11',
  'T-P3-3',
  'T-P1-6',
  'T-P10-1',
  'T-P9-11',
  'T-P10-2',
  'T-P9-6',
  'T-P1-10',
  'T-P7-1',
  'T-P11-1',
  'T-P7-3',
  'T-P7-2',
  'T-P6-2',
  'T-P9-8',
  'T-P6-1',
  'T-P12-4',
  'T-P9-3',
  'T-P12-2',
] as const;

/** The standing each reason yields, per §11.5's table. */
const REASON_STANDING: Readonly<Record<string, Standing>> = {
  'T-P1-1': 'unbound',
  'T-P1-11': 'unbound',
  'T-P3-3': 'unbound',
  'T-P1-6': 'unbound',
  'T-P10-1': 'unbound',
  'T-P9-11': 'unbound',
  'T-P10-2': 'unbound',
  'T-P9-6': 'unbound',
  'T-P1-10': 'unbound',
  'T-P7-1': 'unstamped',
  'T-P11-1': 'unstamped',
  'T-P7-3': 'unstamped',
  'T-P7-2': 'unstamped',
  'T-P6-2': 'unverified',
  'T-P9-8': 'unverified',
  'T-P6-1': 'unverified',
  'T-P12-4': 'unverified',
  'T-P9-3': 'unverified',
  'T-P12-2': 'unverified',
};

const STANDING_ORDER: readonly Standing[] = ['verified', 'unverified', 'unstamped', 'unbound'];

/** §11.5: "An envelope's standing is the lowest that any check of §11.4 yields." */
function lowest(reasons: readonly string[]): Standing {
  let standing: Standing = 'verified';
  for (const r of reasons) {
    const s = REASON_STANDING[r];
    if (s === undefined) continue;
    if (STANDING_ORDER.indexOf(s) > STANDING_ORDER.indexOf(standing)) standing = s;
  }
  return standing;
}

/** Reasons, deduplicated, in §11.5's table order (§11.7 fixes the order). */
function ordered(reasons: readonly string[]): readonly string[] {
  const seen = new Set(reasons);
  return REASON_ORDER.filter((r) => seen.has(r));
}

/** A manifest as read off a manifest topic. */
interface ManifestRead {
  readonly manifest: Record<string, unknown>;
  readonly message: TopicMessage;
}

async function readManifest(reader: Reader, topicId: string, sequenceNumber: number): Promise<ManifestRead | null> {
  const messages = await reader.messages(topicId);
  const message = messages.find((m) => m.sequenceNumber === sequenceNumber);
  if (message === undefined) return null;
  const manifest = operationOf(message);
  if (manifest === null) return null;
  return { manifest, message };
}

/**
 * §11.1's LOOKUP, as D-163 fixes it: read the topic the proof's own canonical
 * location names for a message whose body recomputes to the proof's hash.
 *
 * The reference — `hdr.rp.u` — is what got the Verifier to a message. This is
 * what the proof itself said about where it lives, and only this is inside the
 * hash (§5.1, §5.2). A reference reaching a manifest on some other topic does
 * not answer the lookup: a copy of a manifest published anywhere by anyone would
 * hash correctly, and the location is what makes the reference checkable rather
 * than merely followable.
 *
 * Absence is T-P6-7 and a downgrade, never an error (P-12).
 */
async function foundAtItsLocation(
  reader: Reader,
  manifest: Record<string, unknown>,
  hash: string,
): Promise<{ readonly found: boolean; readonly topicId: string | null }> {
  const meaning = manifest['meaning'] as Record<string, unknown> | undefined;
  const uri = meaning?.['uri'];
  if (!isProofLocation(uri)) return { found: false, topicId: null };
  const bodies: Record<string, unknown>[] = [];
  for (const m of await reader.messages(uri.topicId)) {
    const body = operationOf(m);
    if (body !== null) bodies.push(body);
  }
  return { found: manifestAmong(bodies, hash) !== null, topicId: uri.topicId };
}

/**
 * §11.4's resolution replay for `hcs14` — the rule of §9.2, re-run from
 * consensus, and compared against what the manifest carries.
 *
 * This is the half that makes a resolution proof more than a hash: the Verifier
 * reads the account's memo, the registry entry, the profile file, and the
 * declaration inside it, exactly as the sender's `resolve` did, and the
 * recomputed coordinates must be the ones the manifest carries.
 */
async function replayHcs14(
  reader: Reader,
  manifest: Record<string, unknown>,
): Promise<{ readonly replayed: boolean; readonly detail: string; readonly coordinates?: MailCoordinates }> {
  const inputs = manifest['inputs'] as Record<string, unknown> | undefined;
  const output = manifest['output'] as Record<string, unknown> | undefined;
  if (inputs === undefined || output === undefined) {
    return { replayed: false, detail: 'the manifest carries no inputs or no output' };
  }
  const declared = output['digest'];
  if (typeof declared !== 'string') {
    // D-167: this proof's output is {digest} and no longer a value. A manifest
    // carrying the value form is from before 0.5.8 and is not replayable here.
    return { replayed: false, detail: "the manifest's output carries no digest (§10.2, D-167)" };
  }

  // §5.2: the locator is where a Verifier re-obtains the inputs. §9.2's list,
  // with `address` as D-167 adds it: the rule's own first input.
  const locator = inputs['locator'] as Record<string, unknown> | undefined;
  if (locator === undefined) return { replayed: false, detail: 'the manifest carries no input locator (§5.2)' };
  const address = locator['address'];
  if (typeof address !== 'string') {
    return { replayed: false, detail: 'the locator names no address, so the rule cannot be re-run (§9.2, D-167)' };
  }

  // The manifest's own canonical location is the sender's manifest topic, which
  // is what `resolve` needs to rebuild `meaning.uri`. Taking it from the
  // manifest keeps the replay a function of the proof and consensus alone.
  const meaning = manifest['meaning'] as Record<string, unknown> | undefined;
  const uri = meaning?.['uri'] as Record<string, unknown> | undefined;
  const manifestTopic = typeof uri?.['topicId'] === 'string' ? (uri['topicId'] as string) : '0.0.0';

  // §11.4: "A Verifier replays it under the profile the manifest names ... from
  // the locator for a profile whose inputs are on consensus". The same rule the
  // sender ran, over this Verifier's own port (D-167). Until 0.5.8 this stopped
  // at the registry entry, because the rule was written against a mirror-node
  // client and this port could not reach the profile file; the module said so
  // and appraised on a partial replay anyway. It no longer can: the value is
  // recoverable only by running the rule to the end.
  const replayed = await resolveHcs14(readerSource(reader), reader.ledgerTag, address, manifestTopic);
  if ('failure' in replayed) {
    return { replayed: false, detail: `the rule no longer resolves this address: ${replayed.failure} — ${replayed.detail}` };
  }

  // Under §9.2's second form the account memo is an input that is not
  // re-obtainable, so the proof carries it as a snapshot; a memo that has since
  // changed makes the replay disagree, and `blurred` is why that form warns.
  const snapshot = inputs['snapshot'] as Record<string, unknown> | undefined;
  if (snapshot !== undefined && locator['memo'] !== snapshot['memo']) {
    return { replayed: false, detail: 'the proof snapshotted a memo its own locator does not name' };
  }

  const recomputed = outputDigestOf(replayed.coordinates);
  if (recomputed !== declared) {
    // D-167: the failure a value mismatch was, for the same reason and at the
    // same standing. The coordinates the rule yields now are not the ones the
    // sender bound.
    return {
      replayed: false,
      detail: `the replayed coordinates digest to ${recomputed} and the proof declares ${declared}`,
    };
  }
  return {
    replayed: true,
    detail: 'the rule re-run at the proof\'s locator yields coordinates whose digest is the one the proof declares',
    coordinates: replayed.coordinates,
  };
}

/**
 * A `ProfileSource` over a Verifier's `Reader` (D-167).
 *
 * Three reads of public data, which is all §9.2's rule needs and all a Verifier
 * has (P-4). This is what lets `verify` run the SAME rule `resolve` runs rather
 * than an approximation of it.
 */
export function readerSource(reader: Reader): ProfileSource {
  return {
    accountMemo: (account) => reader.accountMemo(account),
    async topicMemo(topicId) {
      const t = await reader.topic(topicId);
      return t === null ? null : t.memo;
    },
    async topicMessages(topicId) {
      return (await reader.messages(topicId)).map((m) => ({
        sequenceNumber: m.sequenceNumber,
        consensusTimestamp: m.consensusTimestamp,
        body: operationOf(m),
        payer: m.payer,
      }));
    },
  };
}

/**
 * Whether a chunk's `schemaRef` resolves through HCS-13 at the pinned revision
 * (§5.11). It resolves when the HCS-2 topic it names holds, at that sequence
 * number, a `register` operation naming a file topic — which is what Step 4
 * registers and has not yet signed. Until then every envelope carries the
 * reason `T-P9-3` and appraises unverified, which is the true statement.
 */
async function schemaRefResolves(reader: Reader, schemaRef: string): Promise<boolean> {
  const m = /^hcs:\/\/13\/([0-9]+\.[0-9]+\.[0-9]+)#([0-9]+)$/.exec(schemaRef);
  if (m === null) return false;
  const [, topicId, sequence] = m;
  try {
    const messages = await reader.messages(topicId as string);
    const entry = messages.find((x) => x.sequenceNumber === Number(sequence));
    if (entry === undefined) return false;
    const body = operationOf(entry);
    return body !== null && body['op'] === 'register' && typeof body['t_id'] === 'string';
  } catch {
    return false;
  }
}

/** §6.7. Reads the topics in scope, reassembles, replays, and appraises. */
export async function verify(
  reader: Reader,
  scope: VerifyScope,
  options: VerifyOptions = {},
): Promise<{ readonly bundle: EvidenceBundle; readonly narrative?: Narrative }> {
  const lanes = scope.lane !== undefined ? [scope.lane] : [...(scope.topics ?? [])];
  if (lanes.length === 0) refuse('VERIFY_SCOPE_INVALID', 'a scope names a lane, an envelope on a lane, or a set of topics');
  const claims = scope.claims ?? [];

  const entries: CorrespondenceEntry[] = [];
  const orphans: Settlement[] = [];
  const topicsRead = new Set<string>(lanes);
  const claimedSettlements = new Map<string, { readonly envelopeId: string; readonly at: string }>();

  for (const lane of lanes) {
    let observed: readonly ObservedChunk[];
    try {
      observed = await chunksOnLane(reader, lane);
    } catch (e) {
      refuse('VERIFY_MIRROR_UNREACHABLE', e instanceof Error ? e.message : String(e));
    }

    // §11.2: the lane also carries the receipt requests and the close.
    const laneMessages = await reader.messages(lane);
    const requests = laneMessages
      .map((m) => ({ m, op: operationOf(m) }))
      .filter((x) => x.op !== null && x.op['p'] === 'hcs-10' && x.op['op'] === 'transaction')
      .map((x) => ({
        scheduleId: typeof x.op?.['schedule_id'] === 'string' ? (x.op['schedule_id'] as string) : '',
        sequenceNumber: x.m.sequenceNumber,
        consensusTimestamp: x.m.consensusTimestamp,
        // No schedule record is read in this release; a request whose outcome
        // is unread is `unclaimed`, which is the one status §11.4 gives a
        // request that has not been signed for.
        status: 'unclaimed',
      }));

    for (const id of envelopeIdsOf(observed)) {
      if (scope.envelopeId !== undefined && id !== scope.envelopeId) continue;

      const walk = reassemble(observed, id, (h: ChunkHeader) => bindsTo(h, lane, id));
      const zero = walk.chain[0];
      const reasons: string[] = [];

      // --- No canonical chunk 0. §8.5: "Until a canonical chunk 0 exists, no
      // chunk of `id` is canonical; such chunks are recorded as unrooted."
      if (zero === undefined) {
        const claimed = observed.find((o) => o.chunk.i === 0 && o.chunk.hdr !== undefined);
        if (claimed === undefined) continue; // chunks with no header: recorded on no entry
        const recovered = recoverEnvelope(claimed.chunk, lane);
        entries.push({
          envelope: recovered.envelope,
          state: 'SUBMITTED',
          chunks: [],
          offChain: walk.offChain.map((o) => postmarkOf(toMessage(o, lane), reader.ledgerTag, id, o.chunk.i)),
          requests: [],
          appraisal: {
            declared: { trustClass: 'math', endorsements: [] },
            appraised: { standing: 'unbound', reasons: ['T-P1-1'] },
            resolution: { standing: 'unverified', reasons: ['T-P6-2'] },
            receipt: { status: 'none', reasons: [] },
          },
        });
        continue;
      }

      const header = zero.chunk.hdr as ChunkHeader;
      const { envelope } = recoverEnvelope(zero.chunk, lane);
      const chunkZeroAt = zero.consensusTimestamp;

      // §11.2's window bounds what is RECONCILED, not what is read.
      if (options.window !== undefined) {
        if (compareTimestamps(chunkZeroAt, options.window.from) < 0) continue;
        if (compareTimestamps(chunkZeroAt, options.window.to) > 0) continue;
      }

      // --- Binding (§11.4). ---------------------------------------------------
      if (walk.state === 'partial') reasons.push('T-P3-3');
      if (walk.integrityFailed) reasons.push('T-P1-11');
      if (!(LEDGER_TAGS as readonly string[]).includes(header.l)) reasons.push('T-P9-11');

      const settlement = await reader.transfer(header.st);
      if (settlement !== null) {
        const wrong = walk.chain.some((o) => o.operatorId === undefined || accountOf(o.operatorId) !== settlement.from);
        if (wrong) reasons.push('T-P1-6');
      }

      // The lane must have been born from the doorbell the resolution named,
      // and been open at chunk 0 (§11.4). The doorbell is reached through the
      // manifest, so this is done after the manifest is read, below.

      // --- Postage (§11.4). ---------------------------------------------------
      const postage = postageRefusals(settlement, header, id, chunkZeroAt, {
        ...(scope.stampToken === undefined ? {} : { treasury: scope.stampToken.treasury, stampToken: scope.stampToken.tokenId }),
      });
      if (postage.length > 0) {
        if (postage.some((p) => p.includes('not in the stamp token'))) reasons.push('T-P11-1');
        if (postage.some((p) => p.includes('and the postage is'))) reasons.push('T-P7-3');
        if (postage.some((p) => !p.includes('not in the stamp token') && !p.includes('and the postage is'))) {
          reasons.push('T-P7-1');
        }
      }
      if (scope.stampToken === undefined) {
        // Not a reason: an unchecked check is not a failed one. It is recorded
        // under observations, which the digest excludes (§11.6).
        // (Recorded below, once, for the whole bundle.)
      }

      // §11.4: "no envelope with an earlier canonical chunk 0 names the same
      // settlement" (T-P7-2).
      if (settlement !== null) {
        const already = claimedSettlements.get(settlement.txRef);
        if (already !== undefined && already.envelopeId !== id && before(already.at, chunkZeroAt)) {
          reasons.push('T-P7-2');
        } else if (already === undefined) {
          claimedSettlements.set(settlement.txRef, { envelopeId: id, at: chunkZeroAt });
        }
      }

      // --- The resolution proof (§11.4). --------------------------------------
      const resolutionReasons: string[] = [];
      const locator = header.rp.u;
      const read = await readManifest(reader, locator.topicId, locator.sequenceNumber);
      let declared = { trustClass: 'math', endorsements: [] as readonly string[] };

      if (read === null) {
        resolutionReasons.push('T-P6-2');
      } else {
        topicsRead.add(locator.topicId);
        const recomputed = canonicalDigest(read.manifest, 'hash');
        if (recomputed !== header.rp.h || read.manifest['hash'] !== header.rp.h) resolutionReasons.push('T-P6-2');
        if (!before(read.message.consensusTimestamp, chunkZeroAt)) resolutionReasons.push('T-P9-8');

        // §11.1's lookup at the manifest's OWN canonical location (D-163,
        // T-P6-7). The reference above found a message; this asks whether the
        // topic the proof itself names holds one that recomputes to it.
        const located = await foundAtItsLocation(reader, read.manifest, header.rp.h);
        if (located.topicId !== null) topicsRead.add(located.topicId);
        if (!located.found) resolutionReasons.push('T-P6-7');

        const meaning = read.manifest['meaning'] as Record<string, unknown> | undefined;
        if (meaning !== undefined) {
          declared = {
            trustClass: typeof meaning['trustClass'] === 'string' ? (meaning['trustClass'] as string) : 'math',
            endorsements: Array.isArray(meaning['endorsements']) ? (meaning['endorsements'] as string[]) : [],
          };
        }

        const rule = read.manifest['rule'] as { id?: string } | undefined;
        const profile = rule?.id ?? header.pr;
        if (!claims.includes(profile)) {
          // §11.4: "Where the profile is not claimed … the resolution is
          // appraised unverified." Not an error, and not a defect.
          resolutionReasons.push('T-P12-4');
        } else if (profile === 'hcs14') {
          const replay = await replayHcs14(reader, read.manifest);
          if (!replay.replayed) resolutionReasons.push('T-P6-1');

          // The coordinates the replay RECOMPUTED, which §11.2 reads the
          // recipient's account and doorbell from. D-167: the manifest carries
          // its output by digest, so these come from running the rule rather
          // than from reading a value — which is the same thing §11.4 always
          // required a Verifier to be able to do, now that it must.
          const output = replay.coordinates as Record<string, unknown> | undefined;
          const doorbell = output?.['doorbell'];
          const account = output?.['account'];
          if (typeof doorbell === 'string' && typeof account === 'string') {
            topicsRead.add(doorbell);
            const senderAccount = settlement?.from;
            if (senderAccount !== undefined) {
              const born = await lanesFromDoorbell(reader, doorbell, senderAccount);
              if (!born.some((l) => l.topicId === lane)) reasons.push('T-P10-2');
            }
            const closed = await closedBy(reader, lane, chunkZeroAt);
            if (closed !== null) reasons.push('T-P9-6');
          }
          if (typeof output?.['keyEpoch'] === 'number' && output['keyEpoch'] !== header.ke) reasons.push('T-P1-10');
        } else {
          resolutionReasons.push('T-P12-4');
        }
      }

      if (!(await schemaRefResolves(reader, zero.chunk.s))) resolutionReasons.push('T-P9-3');

      // --- State (§8.5). ------------------------------------------------------
      const complete = walk.state === 'complete' && !walk.integrityFailed;
      const state: EnvelopeState = complete ? 'SETTLED' : 'SUBMITTED';

      const all = ordered([...reasons, ...resolutionReasons]);
      entries.push({
        envelope,
        state,
        chunks: walk.chain.map((o) => postmarkOf(toMessage(o, lane), reader.ledgerTag, id, o.chunk.i)),
        offChain: walk.offChain.map((o) => postmarkOf(toMessage(o, lane), reader.ledgerTag, id, o.chunk.i)),
        ...(settlement === null ? {} : { settlement }),
        requests,
        appraisal: {
          declared,
          appraised: { standing: lowest(all), reasons: all },
          resolution: {
            standing: resolutionReasons.length === 0 ? 'verified' : 'unverified',
            reasons: ordered(resolutionReasons),
          },
          receipt: { status: requests.length === 0 ? 'none' : 'unclaimed', reasons: [] },
        },
      });
    }
  }

  // §11.7's order: "correspondence entries by the consensus timestamp of their
  // canonical chunk 0, ties by lane topic ID and then by sequence number".
  entries.sort((a, b) => {
    const at = a.chunks[0]?.consensusTimestamp ?? '0.0';
    const bt = b.chunks[0]?.consensusTimestamp ?? '0.0';
    const c = compareTimestamps(at, bt);
    if (c !== 0) return c;
    if (a.envelope.lane !== b.envelope.lane) return a.envelope.lane < b.envelope.lane ? -1 : 1;
    return (a.chunks[0]?.sequenceNumber ?? 0) - (b.chunks[0]?.sequenceNumber ?? 0);
  });

  const window = options.window ?? {
    from: entries[0]?.chunks[0]?.consensusTimestamp ?? '0.0',
    to: entries[entries.length - 1]?.chunks.slice(-1)[0]?.consensusTimestamp ?? '0.0',
  };

  const evidence = {
    spec: RELEASE.spec,
    ledgerTags: [reader.ledgerTag],
    window,
    topics: [...topicsRead].sort(),
    correspondence: entries,
    orphans,
  };

  const digest = sha256hex(canonicalBytes(evidence));

  const observations: Record<string, unknown> = {
    appraisedAt: new Date().toISOString(),
    mirror: options.mirror ?? 'reader',
    drift: [],
    disagreement: [],
    ...(scope.stampToken === undefined
      ? { stampTokenUnknown: 'no stamp token was named in the scope, so §11.4’s token and treasury checks were not run' }
      : {}),
  };

  const bundle: EvidenceBundle = { ...evidence, observations, digest };
  if (options.narrative !== true) return { bundle };
  return { bundle, narrative: narrate(bundle) };
}

/** An observed chunk, back in the shape a postmark is built from. */
function toMessage(o: ObservedChunk, lane: string): TopicMessage {
  return {
    topicId: lane,
    sequenceNumber: o.sequenceNumber,
    consensusTimestamp: o.consensusTimestamp,
    runningHash: '',
    runningHashVersion: 0,
    contents: '',
    payer: '',
  };
}

/**
 * §11.7's narrative: "produced from the bundle and from nothing else", carrying
 * the bundle's digest (T-P3-4). One sentence per fact, from `tools/sentences.json`
 * — the ONE template three readers share (D-162) — so
 * that "a narrative SHOULD state nothing the bundle does not contain" is
 * demonstrated rather than promised.
 */
export function narrate(bundle: EvidenceBundle): Narrative {
  const lines: string[] = [];
  lines.push(
    line('narrative.scope', {
      topics: bundle.topics.length,
      ledgerTags: bundle.ledgerTags.join(', '),
      from: bundle.window.from,
      to: bundle.window.to,
      spec: bundle.spec,
    }),
  );
  if (bundle.correspondence.length === 0) lines.push(line('narrative.empty'));

  for (const e of bundle.correspondence) {
    const sender = e.settlement?.from ?? 'an account this reading could not name';
    const zero = e.chunks[0];
    lines.push('');
    lines.push(line('narrative.envelope', { aadHash: e.envelope.aadHash }));
    if (zero !== undefined) {
      lines.push(line('narrative.posted', {
        lane: e.envelope.lane,
        chunks: e.chunks.length,
        consensusTimestamp: zero.consensusTimestamp,
        sequenceNumber: zero.sequenceNumber,
      }));
    }
    if (e.settlement !== undefined) {
      lines.push(line('narrative.postage', {
        amount: e.settlement.amount,
        tokenId: e.settlement.tokenId,
        from: sender,
        to: e.settlement.to,
        consensusTimestamp: e.settlement.consensusTimestamp,
        memo: settlementMemo(e.envelope.aadHash),
      }));
    } else {
      lines.push(line('narrative.postage.absent'));
    }
    lines.push(line('narrative.resolution', {
      profile: e.envelope.profile,
      trustClass: e.appraisal.declared.trustClass,
      endorsements:
        e.appraisal.declared.endorsements.length === 0
          ? 'with no endorsements'
          : `with the endorsements ${e.appraisal.declared.endorsements.join(', ')}`,
      sequenceNumber: e.envelope.resolutionProof.uri?.sequenceNumber ?? '?',
      topicId: e.envelope.resolutionProof.uri?.topicId ?? '?',
    }));
    lines.push(line('narrative.seal', {
      keyEpoch: e.envelope.keyEpoch,
      ciphertextBytes: e.envelope.ciphertextBytes,
      weight: e.envelope.weight,
    }));
    lines.push(line('narrative.state', { state: e.state }));
    if (e.appraisal.appraised.reasons.length === 0) {
      lines.push(line('narrative.verified'));
    } else {
      lines.push(line('narrative.standing', {
        standing: e.appraisal.appraised.standing,
        reasons: e.appraisal.appraised.reasons.join(', '),
      }));
    }
    lines.push(
      e.appraisal.receipt.status === 'none'
        ? line('narrative.receipt.none')
        : line('narrative.receipt', { status: e.appraisal.receipt.status }),
    );
    if (e.offChain.length > 0) {
      lines.push(line('narrative.offchain', { count: e.offChain.length }));
    }
    lines.push(line('narrative.silence'));
  }

  if (bundle.orphans.length > 0) {
    lines.push('');
    lines.push(line('narrative.orphans', { count: bundle.orphans.length }));
  }

  return { bundleDigest: bundle.digest, text: lines.join('\n') };
}
