/**
 * `Consensus`, on the network — the other implementation of `tools/consensus.ts`.
 *
 * `tools/memory.ts` is consensus as a data structure, and the readers were run
 * against it before anything was signed. This is the same interface over a
 * mirror node for reads and `@hashgraph/sdk` for writes, so that `send`,
 * `inbox` and `verify` are the code they already are and learn nothing new.
 *
 * THE READ HALF TAKES NO KEY. `liveReader` is constructible from a mirror-node
 * URL and a ledger tag and nothing else, which is what P-4 asks for: "the
 * VERIFIER suite runs with nothing configured. A mirror node is a read
 * interface, not a broker." A type that cannot write is how that is enforced
 * rather than promised, and `liveReader` returns a `Reader` and not a
 * `Consensus`.
 *
 * THE WRITE HALF IS THE PAYER SEAM (CLAUDE.md §11). Every submission is
 * constructed *agent signs, payer signs*, with the payer an injected `Signer`.
 * In this window that is the operator's key from the Correspondent's own
 * config; a remote signature through the Postmaster's `carry` replaces it later
 * and nothing above this file knows which. So `liveWriter` takes two signers and
 * two account ids and never asks where either came from.
 *
 * Conformance: T-P4-1, T-P4-2, T-P4-3, T-P9-5, T-P9-7, T-P17-2.
 */
import {
  AccountId as SdkAccountId,
  Hbar,
  ScheduleCreateTransaction,
  ScheduleSignTransaction,
  Timestamp,
  TopicId,
  TransactionId,
  TransferTransaction,
  type AccountId,
  type Client,
} from '@hashgraph/sdk';
import { flattenMirrorKey } from '../src/core/protokey.js';
import { submit } from '../src/ops/hedera.js';
import { UnchunkedTopicMessageSubmitTransaction } from '../src/ops/hcs10.js';
import { Mirror, fromMirrorTxId, toMirrorTxId } from '../src/ops/mirror.js';
import type { Signer } from '../src/ops/identity.js';
import type {
  Consensus,
  CustomFee,
  Reader,
  ScheduleRecord,
  ScheduleSignature,
  Settlement,
  TopicInfo,
  TopicMessage,
  Writer,
} from '../src/tools/consensus.js';

/* ------------------------------------------------------------------ */
/* Mirror-node response shapes. Only the fields the interface needs.    */
/* ------------------------------------------------------------------ */

interface MKey {
  readonly _type: string;
  readonly key: string;
}
interface MMessage {
  readonly topic_id?: string;
  readonly sequence_number: number;
  readonly consensus_timestamp: string;
  readonly running_hash: string;
  readonly running_hash_version: number;
  readonly message: string;
  readonly payer_account_id: string;
}
interface MMessages {
  readonly messages?: readonly MMessage[];
  readonly links?: { readonly next?: string | null };
}
interface MTopic {
  readonly topic_id: string;
  readonly memo?: string;
  readonly submit_key?: MKey | null;
  readonly admin_key?: MKey | null;
  readonly deleted?: boolean | null;
  readonly custom_fees?: {
    readonly fixed_fees?: readonly {
      readonly amount: number;
      readonly collector_account_id: string;
      readonly denominating_token_id: string | null;
    }[];
  };
  readonly fee_exempt_key_list?: readonly MKey[];
}
interface MAccount {
  readonly account: string;
  readonly memo?: string;
  readonly key?: MKey | null;
  readonly balance?: { readonly tokens?: readonly { readonly token_id: string; readonly balance: number }[] };
}
/** `/schedules/{id}` — HIP-423's record, as a mirror node returns it. */
interface MSchedule {
  readonly schedule_id: string;
  readonly creator_account_id: string;
  readonly payer_account_id: string;
  readonly consensus_timestamp: string;
  readonly executed_timestamp?: string | null;
  readonly expiration_time?: string | null;
  readonly wait_for_expiry?: boolean | null;
  readonly deleted?: boolean | null;
  readonly transaction_body?: string | null;
  readonly signatures?: readonly {
    readonly consensus_timestamp: string;
    readonly public_key_prefix: string;
    readonly type: string;
  }[];
}

interface MTransactions {
  readonly transactions?: readonly {
    readonly transaction_id: string;
    readonly consensus_timestamp: string;
    readonly result: string;
    readonly memo_base64?: string | null;
    readonly token_transfers?: readonly {
      readonly token_id: string;
      readonly account: string;
      readonly amount: number;
    }[];
  }[];
}

/**
 * Every message on a topic, in consensus order, following the mirror's paging.
 *
 * `limit=100` is the mirror's maximum and a lane outlives it: §7.1 says a lane
 * is mail and every message on it is read, and a reader that stopped at 100
 * would silently produce a shorter correspondence than the one on consensus —
 * the worst kind of wrong answer, because it looks like a complete one.
 */
async function allMessages(mirror: Mirror, topicId: string): Promise<readonly MMessage[] | null> {
  let path: string | null = `/topics/${topicId}/messages?limit=100&order=asc`;
  const out: MMessage[] = [];
  while (path !== null) {
    const page: MMessages | null = await mirror.get<MMessages>(path);
    if (page === null) return out.length > 0 ? out : null;
    out.push(...(page.messages ?? []));
    const next: string | null = page.links?.next ?? null;
    // The mirror returns `next` already prefixed with `/api/v1`; `Mirror` holds
    // that prefix in its base URL, so it is stripped rather than doubled.
    path = next === null ? null : next.replace(/^\/api\/v1/, '');
  }
  return out;
}

/** The read half. Constructible from a URL and a tag: no key, no credit, no broker (P-4). */
export function liveReader(mirrorNodeUrl: string, ledgerTag: string): Reader {
  const mirror = new Mirror(mirrorNodeUrl);
  return {
    ledgerTag,

    async messages(topicId) {
      const ms = await allMessages(mirror, topicId);
      if (ms === null) return [];
      return ms.map((m) => ({
        topicId,
        sequenceNumber: m.sequence_number,
        consensusTimestamp: m.consensus_timestamp,
        runningHash: m.running_hash,
        runningHashVersion: m.running_hash_version,
        contents: Buffer.from(m.message, 'base64').toString('utf8'),
        payer: m.payer_account_id,
      }));
    },

    async topic(topicId): Promise<TopicInfo | null> {
      const t = await mirror.get<MTopic>(`/topics/${topicId}`);
      if (t === null) return null;
      const fees: CustomFee[] = (t.custom_fees?.fixed_fees ?? []).map((f) => ({
        amount: f.amount,
        tokenId: f.denominating_token_id ?? '',
        collector: f.collector_account_id,
      }));
      return {
        topicId: t.topic_id,
        memo: t.memo ?? '',
        submitKeys: flattenMirrorKey(t.submit_key),
        adminKey: flattenMirrorKey(t.admin_key)[0] ?? null,
        customFees: fees,
        feeExemptKeys: (t.fee_exempt_key_list ?? []).flatMap((k) => flattenMirrorKey(k)),
        deleted: t.deleted === true,
      };
    },

    async transfer(txRef): Promise<Settlement | null> {
      const r = await mirror.get<MTransactions>(`/transactions/${toMirrorTxId(txRef)}`);
      const tx = r?.transactions?.find((t) => t.result === 'SUCCESS' && (t.token_transfers ?? []).length > 0);
      if (tx === undefined) return null;
      const moves = tx.token_transfers ?? [];
      const out = moves.find((m) => m.amount < 0);
      const into = moves.find((m) => m.amount > 0);
      if (out === undefined || into === undefined) return null;
      return {
        ledgerTag,
        txRef: fromMirrorTxId(tx.transaction_id),
        from: out.account,
        to: into.account,
        amount: into.amount,
        memo: Buffer.from(tx.memo_base64 ?? '', 'base64').toString('utf8'),
        consensusTimestamp: tx.consensus_timestamp,
        tokenId: into.token_id,
      };
    },

    async accountMemo(account) {
      const a = await mirror.get<MAccount>(`/accounts/${account}?limit=1`);
      return a === null ? null : (a.memo ?? '');
    },

    async accountKey(account) {
      const a = await mirror.get<MAccount>(`/accounts/${account}?limit=1`);
      if (a === null) return null;
      return flattenMirrorKey(a.key)[0] ?? null;
    },

    async schedule(scheduleId): Promise<ScheduleRecord | null> {
      const s = await mirror.get<MSchedule>(`/schedules/${scheduleId}`);
      return s === null ? null : scheduleRecordOf(s, ledgerTag);
    },
  };
}

/** A mirror row to §10.4's record. No field is inferred; absent is null. */
function scheduleRecordOf(s: MSchedule, ledgerTag: string): ScheduleRecord {
  const signatures: ScheduleSignature[] = (s.signatures ?? []).map((x) => ({
    publicKeyPrefix: x.public_key_prefix,
    consensusTimestamp: x.consensus_timestamp,
    type: x.type,
  }));
  return {
    ledgerTag,
    scheduleId: s.schedule_id,
    creator: s.creator_account_id,
    payer: s.payer_account_id,
    consensusTimestamp: s.consensus_timestamp,
    executedTimestamp: s.executed_timestamp ?? null,
    expirationTime: s.expiration_time ?? null,
    waitForExpiry: s.wait_for_expiry === true,
    deleted: s.deleted === true,
    signatures,
    transactionBody: s.transaction_body ?? '',
  };
}

/**
 * What the write half needs beyond the read half. Deliberately explicit: the
 * account the agent acts as, the key that signs for it, the account that pays,
 * and the key that pays — four values, and the seam is that the last two are
 * arguments.
 */
export interface WriterContext {
  readonly account: string;
  readonly agent: Signer;
  readonly payerId: string;
  readonly payer: Signer;
  readonly stampToken: string;
  readonly mirrorNodeUrl: string;
  readonly ledgerTag: string;
  /**
   * The consensus node every submission is pinned to, where one is pinned.
   *
   * Present exactly when the payer is REMOTE: a carried body must be one body,
   * because the payer’s signature costs a round trip and a policy decision
   * (D-168). Absent, the SDK chooses, which is what a local payer wants.
   */
  readonly nodeAccountIds?: readonly AccountId[];
  /**
   * The client to submit through. Given rather than built, because a `Client`
   * holds the event loop open until it is closed and a caller cannot close one
   * it does not know exists — which is exactly what happened: the first version
   * built its own, and a `--dry-run` that printed its whole report then hung
   * forever was the only sign of it. One session, two clients, both closable.
   */
  readonly client: Client;
}

/**
 * `submitMessage`'s size bound, and why it is checked here.
 *
 * A `TopicMessageSubmitTransaction` past 1024 bytes is SPLIT by the SDK across
 * two consensus messages rather than refused, and neither half is parseable
 * JSON alone. That is not a hypothetical: it is what Step 4's first run put on
 * topic `0.0.10448375`, permanently, and what `ops/hcs1.ts` now guards. §7.4
 * fixes `CHUNK_WIRE_MAX` at 1000 for an envelope chunk's whole operation, and
 * every other operation this writer submits is smaller — so anything at or over
 * the network's own ceiling is a bug upstream and is refused before it can
 * become an artefact nobody can withdraw.
 */
const HCS_MESSAGE_MAX = 1024;

/** The live `Consensus`: the reader above, plus writes under the payer seam. */
export function liveConsensus(ctx: WriterContext): Consensus {
  const reader = liveReader(ctx.mirrorNodeUrl, ctx.ledgerTag);
  const mirror = new Mirror(ctx.mirrorNodeUrl);
  const client = ctx.client;

  /** The reference pinned by `pinTransferRef` and consumed by `transferStamps`. */
  let pinned: TransactionId | null = null;
  const nodePin = ctx.nodeAccountIds === undefined ? {} : { nodeAccountIds: ctx.nodeAccountIds };

  const writer: Writer = {
    account: ctx.account,

    async submitMessage(topicId, operation, transactionMemo): Promise<TopicMessage> {
      const bytes = Buffer.from(JSON.stringify(operation), 'utf8');
      if (bytes.length > HCS_MESSAGE_MAX) {
        throw new Error(
          `submitMessage: the operation is ${bytes.length} bytes and a single HCS message caps at ${HCS_MESSAGE_MAX}; ` +
            'the SDK would split it silently and neither half would parse (§7.4, ops/hcs1.ts)',
        );
      }
      // The base-class freeze, so no `chunkInfo` is attached — §7.4 for an
      // envelope chunk (T-P9-7), and harmless for every other operation, which
      // is why there is one path here and not two.
      const tx = new UnchunkedTopicMessageSubmitTransaction().setTopicId(topicId).setMessage(bytes);
      if (transactionMemo !== '') tx.setTransactionMemo(transactionMemo);
      const r = await submit(client, ctx.payerId, tx, [ctx.agent], nodePin);
      if (!r.ok) throw new Error(`submitMessage on ${topicId} returned ${r.status} (tx ${r.transactionId})`);

      // Read back from the mirror and never from the receipt: a postmark is what
      // consensus recorded, and the receipt cannot supply a running hash.
      //
      // The predicate is NAMED by what it is waiting for — the message's own
      // bytes on the topic — and not `() => true`, which is the probe's second
      // bug and accepts a pre-ingest answer (`ops/step.ts`).
      const want = r.transactionId;
      const b64 = bytes.toString('base64');
      const page = await mirror.poll<MMessages>(
        `/topics/${topicId}/messages?limit=25&order=desc`,
        (m) => (m.messages ?? []).some((x) => x.message === b64),
      );
      const mine = (page?.messages ?? []).find((m) => m.message === b64);
      if (mine === undefined) {
        throw new Error(`submitMessage on ${topicId}: the mirror does not yet hold the message submitted as ${want}`);
      }
      return {
        topicId,
        sequenceNumber: mine.sequence_number,
        consensusTimestamp: mine.consensus_timestamp,
        runningHash: mine.running_hash,
        runningHashVersion: mine.running_hash_version,
        contents: Buffer.from(mine.message, 'base64').toString('utf8'),
        payer: mine.payer_account_id,
      };
    },

    pinTransferRef(): string {
      // The payer chooses the transaction id, and the header carries it before
      // the transfer is submitted — which is what lets §6.4's step order hold
      // with §5.6's `hdr.st` in it (see the head of `core/envelope.ts`).
      pinned = TransactionId.generate(ctx.payerId);
      return pinned.toString();
    },

    async transferStamps(ref, to, amount, memo): Promise<Settlement> {
      if (pinned === null || pinned.toString() !== ref) {
        throw new Error(`transferStamps: ${ref} was not pinned by this writer; a settlement reference is pinned before it is spent`);
      }
      const tx = new TransferTransaction()
        .setTransactionId(pinned)
        .addTokenTransfer(ctx.stampToken, ctx.account, -amount)
        .addTokenTransfer(ctx.stampToken, to, amount)
        .setTransactionMemo(memo)
        .setMaxTransactionFee(new Hbar(2));
      // The agent signs as the OWNER of the stamps; the payer signs as payer.
      // Two signatures, two parties, and §3.5 is the whole of why.
      const r = await submit(client, ctx.payerId, tx, [ctx.agent], nodePin);
      if (!r.ok) throw new Error(`the postage transfer returned ${r.status} (tx ${r.transactionId})`);
      const settlement = await mirror.poll<MTransactions>(
        `/transactions/${toMirrorTxId(r.transactionId)}`,
        (t) => (t.transactions ?? []).some((x) => x.result === 'SUCCESS'),
      );
      if (settlement === null) throw new Error(`the mirror does not hold the postage transfer ${r.transactionId}`);
      const read = await reader.transfer(r.transactionId);
      if (read === null) throw new Error(`the postage transfer ${r.transactionId} did not read back as a settlement`);
      return read;
    },

    async stampBalance(): Promise<number> {
      const a = await mirror.get<MAccount>(`/accounts/${ctx.account}?limit=1`);
      const held = a?.balance?.tokens?.find((t) => t.token_id === ctx.stampToken);
      return held?.balance ?? 0;
    },

    /**
     * §6.4 step 7's ScheduleCreate (HIP-423, §10.4).
     *
     * WHO SIGNS IT, and it is the one place this file departs from *agent signs,
     * payer signs* on purpose. A ScheduleCreate's signatures are offered to the
     * INNER transaction's required keys, and the inner transaction here requires
     * exactly two: the topic's submit key, which is the RECIPIENT's and is the
     * whole point of §10.4, and the inner payer's, which is
     * `request.payerAccountId`. The sender's agent key is required by neither,
     * so adding it would put a signature on the schedule's record that stands
     * for nothing and makes T-P1-8's reading of that record harder. The payer's
     * signature is added by `submit` through the client's operator, which is
     * what makes the fee payable when the recipient signs.
     *
     * `waitForExpiry` is FALSE and is not a parameter: §10.4 fixes it, because
     * a receipt that waited for the window's end would arrive up to sixty-two
     * days after the hand that signed for it.
     */
    async scheduleSubmission(request): Promise<ScheduleRecord> {
      // The base-class freeze, so no `chunkInfo` — the same override every
      // submission here uses. A scheduled submission cannot be transport-chunked
      // at all, and the SDK refuses to schedule one that would need to be.
      const inner = new UnchunkedTopicMessageSubmitTransaction()
        .setTopicId(TopicId.fromString(request.topicId))
        .setMessage(request.message);
      if (inner.getRequiredChunks() !== 1) {
        throw new Error(
          `scheduleSubmission: the receipt manifest is ${request.message.length} bytes and needs ` +
            `${inner.getRequiredChunks()} chunks; §10.4's inner submission is one message (check:freeze)`,
        );
      }

      const expiresAt = Math.floor(Date.now() / 1000) + request.expirationSeconds;
      const tx = new ScheduleCreateTransaction()
        .setScheduledTransaction(inner)
        .setPayerAccountId(SdkAccountId.fromString(request.payerAccountId))
        .setWaitForExpiry(false)
        .setExpirationTime(new Timestamp(expiresAt, 0));

      const r = await submit(client, ctx.payerId, tx, [], nodePin);
      // The network's own idempotence, and the reason `submit` carries an entity
      // id on a failed status: an identical inner transaction is refused with
      // the id of the schedule that already exists, which is the answer and not
      // an error (§10.4, `tools/send.ts` step 7).
      const identical = !r.ok && r.status === 'IDENTICAL_SCHEDULE_ALREADY_CREATED';
      if (!r.ok && !identical) {
        throw new Error(`the ScheduleCreate returned ${r.status} (tx ${r.transactionId})`);
      }
      const scheduleId = r.entityId;
      if (scheduleId === undefined) {
        throw new Error(
          `the ScheduleCreate returned ${r.status} and its receipt named no schedule (tx ${r.transactionId})`,
        );
      }

      // Read back from the MIRROR and never from the receipt, for the reason
      // every other readback here gives: a receipt says what was submitted, and
      // §11.4 appraises what consensus holds.
      const seen = await mirror.poll<MSchedule>(
        `/schedules/${scheduleId}`,
        (s) => typeof s.schedule_id === 'string' && s.schedule_id === scheduleId,
      );
      if (seen === null) {
        throw new Error(`the mirror does not yet hold the schedule ${scheduleId} created as ${r.transactionId}`);
      }
      return scheduleRecordOf(seen, ctx.ledgerTag);
    },

    /**
     * §6.6's ScheduleSign — the recipient's whole act.
     *
     * The AGENT signs (its key is the topic's submit key, and the network is
     * waiting for exactly it) and the recipient's own operator PAYS the
     * ScheduleSign's network fee. The inner transaction's fee is the schedule's
     * payer's, not this one's, which is how "the recipient pays nothing" holds
     * for the receipt itself (T-P16-2).
     */
    async scheduleSign(scheduleId): Promise<ScheduleRecord> {
      const tx = new ScheduleSignTransaction().setScheduleId(scheduleId);
      const r = await submit(client, ctx.payerId, tx, [ctx.agent], nodePin);
      if (!r.ok) throw new Error(`the ScheduleSign on ${scheduleId} returned ${r.status} (tx ${r.transactionId})`);

      // Wait for the FACT — the execution — rather than for a clock. The
      // signature and the execution are one act on the network and two reads on
      // a mirror node, and a read taken between them says "not executed" in
      // exactly the words it uses for a schedule nobody signed.
      const seen = await mirror.poll<MSchedule>(
        `/schedules/${scheduleId}`,
        (s) => typeof s.executed_timestamp === 'string' && s.executed_timestamp !== '',
      );
      if (seen === null) throw new Error(`the mirror does not hold the schedule ${scheduleId} after its ScheduleSign`);
      return scheduleRecordOf(seen, ctx.ledgerTag);
    },
  };

  return { ...reader, ...writer };
}
