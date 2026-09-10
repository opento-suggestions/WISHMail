/**
 * `ack` — §6.6. Acknowledge an envelope that opened: produce its return receipt.
 *
 * §6.6: "`ack` reads the pending schedule the lane's `transaction` operation
 * names, checks that the scheduled receipt names the envelope identifier, chunk
 * 0's postmark, and the epoch the envelope opened under, and signs it
 * (ScheduleSign). Execution publishes the receipt's manifest on the recipient's
 * manifest topic (§10.4). The sender funded it; the recipient pays nothing."
 *
 * THE CHECK IS THE WHOLE TOOL, and it is a check on bytes the recipient did not
 * write. A ScheduleSign is a signature over whatever the schedule holds, made
 * before the recipient can see what it did — so a recipient that signed first
 * and read afterwards would have signed anything the sender put in front of it,
 * on its own key, to its own topic. §10.4's MUST is exactly that: "`ack` MUST
 * NOT sign a schedule whose inner submission does not name the envelope
 * identifier, chunk 0's postmark, and the epoch under which the envelope opened
 * in the recipient's `inbox`" (T-P1-9). The three inputs come from the
 * RECIPIENT's own `inbox`, never from the request, and the manifest is
 * RECOMPOSED from them and compared by hash: a field-by-field comparison would
 * pass a manifest that agreed on everything this code thought to look at.
 *
 * WHAT `ack` DOES NOT DO. It does not compose a receipt of its own and publish
 * it: §10.4 makes a receipt "the execution of a scheduled submission … requested
 * by an HCS-10 `transaction` operation on the lane", and "a receipt manifest
 * submitted by any other path is not a receipt" (T-P1-8). The recipient's
 * manifest topic is keyed to the recipient, so a recipient COULD write one
 * directly — and it would be a message on a topic and not a receipt, because
 * nothing on consensus would tie it to a request the sender made.
 *
 * WHAT IT COSTS THE RECIPIENT: the ScheduleSign's own network fee, in HBAR,
 * from the recipient's operator — and nothing else. The inner transaction is
 * paid by the schedule's own `payerAccountId`, which §10.4 forbids from being
 * the recipient (T-P16-2), and no stamp moves at any point: a receipt is not
 * postage.
 *
 * Conformance: T-P1-3, T-P1-8, T-P1-9, T-P16-2.
 */
import { decodeScheduledSubmission, ScheduleBodyUndecodable } from '../core/schedulebody.js';
import { refuse } from '../core/failure.js';
import { receiptManifest, returnReceiptOf, type ReceiptManifestInput, type ReturnReceipt } from '../core/receipt.js';
import { canonicalBytes } from '../core/canonical.js';
import { operatorId as operatorIdOf } from '../ops/hcs10.js';
import type { Delivery } from './inbox.js';
import { compareTimestamps, operationOf, type Consensus, type ScheduleRecord } from './consensus.js';

/** What the acknowledging agent is. No private key appears here (P-13). */
export interface AckContext {
  readonly consensus: Consensus;
  readonly ledgerTag: string;
  /** The recipient's own account. */
  readonly account: string;
  /** The recipient's inbound topic — the other half of its `operator_id`. */
  readonly doorbell: string;
  /** The recipient's manifest topic: where §10.4 requires the receipt to land. */
  readonly manifestTopic: string;
}

export interface AckResult {
  readonly receipt: ReturnReceipt;
  readonly schedule: ScheduleRecord;
  /** True where the schedule had already executed and this call signed nothing. */
  readonly alreadyExecuted: boolean;
}

/**
 * How long `ack` waits for the execution to become visible.
 *
 * The signature and the execution are one act on the network — "the instant the
 * recipient signs, the network executes the submission" — but a MIRROR NODE
 * learns of them separately and a read taken too early answers "not executed" in
 * the same words it would use for a schedule nobody ever signed. That read
 * believed once is two of Gate One's eight defects, so the outcome is polled and
 * the fact being waited for is named: `executed_timestamp`.
 */
const EXECUTION_TIMEOUT_MS = 45_000;
const EXECUTION_INTERVAL_MS = 1_500;

/**
 * §6.6, over one delivery that `inbox` returned.
 *
 * The delivery is the argument rather than an envelope identifier, and that is
 * the precondition made structural: §6.6 requires "the envelope opened in the
 * caller's `inbox` with its AAD verified", and the only thing that can attest to
 * that is the `inbox` result itself. An identifier could name an envelope this
 * agent never opened.
 */
export async function ack(ctx: AckContext, delivery: Delivery): Promise<AckResult> {
  // --- Preconditions (§6.6). -------------------------------------------------
  if (!delivery.opened) {
    // T-P1-3: "`ack` refuses an envelope that was returned unopened, for every
    // reason in §6.5." A recipient cannot acknowledge what did not bind.
    refuse(
      'ACK_NOT_OPENED',
      `the envelope ${delivery.envelope.aadHash} came back unopened${delivery.reason === undefined ? '' : ` (${delivery.reason})`}, and §6.6 acknowledges only what bound`,
    );
  }
  const pending = delivery.returnReceipt;
  if (pending === undefined) {
    refuse(
      'ACK_NOT_REQUESTED',
      `no \`transaction\` operation on the lane ${delivery.lane} names a schedule for ${delivery.envelope.aadHash} (§10.4)`,
    );
  }
  if (!pending.requestedByHeader) {
    // §7.7: "A recipient SHOULD acknowledge only envelopes whose header requests
    // it; an unrequested receipt nevertheless counts (§8.6)." A SHOULD, so this
    // is a refusal a caller can see the reason for and not a silent skip — and
    // §8.6 is why a Verifier still counts one that was made anyway.
    refuse(
      'ACK_NOT_REQUESTED',
      `the envelope's header does not set \`rr\` (§7.7), so its postage never paid the receipt fee; a receipt made anyway still counts (§8.6) and this refuses rather than making one`,
    );
  }

  const chunkZeroSeq = delivery.chunkPostmarks[0]?.sequenceNumber;
  if (chunkZeroSeq === undefined) {
    refuse('ACK_NOT_OPENED', 'the delivery carries no chunk 0 postmark, and a receipt names one (§10.4)');
  }
  const epoch = delivery.openedUnderEpoch;
  if (epoch === undefined) {
    refuse('ACK_NOT_OPENED', 'the delivery does not say which epoch it opened under, and a receipt names one (§10.4)');
  }

  // --- The three inputs, from THIS agent's own inbox. -------------------------
  const expected: ReceiptManifestInput = {
    ledgerTag: ctx.ledgerTag,
    envelopeId: delivery.envelope.aadHash,
    postmarkRef: { topicId: delivery.lane, sequenceNumber: chunkZeroSeq },
    keyEpoch: epoch,
    recipientAccount: ctx.account,
    manifestTopic: ctx.manifestTopic,
  };
  const want = receiptManifest(expected);

  // --- The schedule, read before anything is signed (T-P1-9). ----------------
  const record = await ctx.consensus.schedule(pending.scheduleId);
  if (record === null) {
    refuse(
      'ACK_NOT_REQUESTED',
      `the lane names the schedule ${pending.scheduleId} and consensus holds no such schedule; an expired schedule is deleted by the network and the envelope is unclaimed (§10.4)`,
    );
  }
  if (record.deleted) {
    refuse('ACK_NOT_REQUESTED', `the schedule ${pending.scheduleId} is deleted; the envelope is unclaimed (§10.4)`);
  }
  if (record.payer === ctx.account) {
    // T-P16-2 from the recipient's own side, and the last place it can be
    // refused rather than observed: signing this would charge the recipient for
    // the receipt the instant it executed.
    refuse(
      'ACK_NOT_REQUESTED',
      `the schedule ${pending.scheduleId} names this recipient as the payer of its inner transaction, and §10.4 forbids charging the recipient for a receipt (T-P16-2)`,
    );
  }

  let inner: { topicId: string; message: Buffer };
  try {
    inner = decodeScheduledSubmission(Buffer.from(record.transactionBody, 'base64'));
  } catch (e) {
    refuse(
      'ACK_NOT_OPENED',
      `the schedule ${pending.scheduleId} does not carry a submission this rule can read: ${e instanceof ScheduleBodyUndecodable ? e.message : String(e)}`,
    );
  }
  if (inner.topicId !== ctx.manifestTopic) {
    refuse(
      'ACK_NOT_OPENED',
      `the schedule writes to ${inner.topicId} and a receipt is a submission to this recipient's own manifest topic ${ctx.manifestTopic} (§10.4, T-P1-8)`,
    );
  }

  // THE CHECK. The manifest inside the schedule must be the manifest these three
  // inputs compose — byte for byte, because the bytes are what will be published
  // and hashed, and because a hash comparison alone would pass a manifest that
  // is canonically equal and textually different (§5.1's canonical JSON makes
  // those the same thing, and this asserts it rather than assuming it).
  const wantBytes = canonicalBytes(want as unknown as Record<string, unknown>);
  if (!inner.message.equals(wantBytes)) {
    let named = '(unparseable)';
    try {
      const got = JSON.parse(inner.message.toString('utf8')) as Record<string, unknown>;
      named = typeof got['hash'] === 'string' ? (got['hash'] as string) : '(no hash)';
    } catch {
      // Left as it is: an unparseable body is exactly as refused as a wrong one.
    }
    refuse(
      'ACK_NOT_OPENED',
      `the scheduled receipt is ${named} and this envelope, this postmark and this epoch compose ${want.hash} — ` +
        `it names a different identifier, postmark or epoch, and §10.4 forbids signing it (T-P1-9)`,
    );
  }

  // --- Already executed? Then there is nothing to sign (§6.6, ACK_DUPLICATE). -
  if (record.executedTimestamp !== null) {
    return {
      receipt: await witnessed(ctx, expected, record),
      schedule: record,
      alreadyExecuted: true,
    };
  }

  // --- The ScheduleSign. -----------------------------------------------------
  let signed: ScheduleRecord;
  try {
    signed = await ctx.consensus.scheduleSign(pending.scheduleId);
  } catch (e) {
    refuse('ACK_SUBMIT_FAILED', e instanceof Error ? e.message : String(e));
  }

  // --- The execution, waited for by the fact and never by a clock. -----------
  let executed = signed;
  const deadline = Date.now() + EXECUTION_TIMEOUT_MS;
  while (executed.executedTimestamp === null && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, EXECUTION_INTERVAL_MS));
    executed = (await ctx.consensus.schedule(pending.scheduleId)) ?? executed;
  }
  if (executed.executedTimestamp === null) {
    // The signature landed and the outcome is not yet visible. That is a window,
    // not a failure, and the remedy is to look again — never to sign again.
    refuse(
      'ACK_SUBMIT_FAILED',
      `the ScheduleSign for ${pending.scheduleId} was submitted and no execution is visible yet; read the schedule again rather than signing again (§10.4)`,
    );
  }

  return { receipt: await witnessed(ctx, expected, executed), schedule: executed, alreadyExecuted: false };
}

/**
 * §5.8's ReturnReceipt, once the schedule has executed — with the locator of the
 * message the execution actually assigned.
 *
 * The manifest is found on the recipient's own manifest topic BY HASH, which is
 * §5.2's content-addressed read and the only one available: the sequence number
 * did not exist when the bytes were fixed. A manifest that is not there yet
 * yields a receipt whose `proof.uri` is null — which the registered schema
 * permits and `check:freeze` asserts — rather than a wait for a mirror node.
 */
async function witnessed(
  ctx: AckContext,
  input: ReceiptManifestInput,
  record: ScheduleRecord,
): Promise<ReturnReceipt> {
  const want = receiptManifest(input);
  let located: { topicId: string; sequenceNumber: number } | null = null;
  for (const m of await ctx.consensus.messages(ctx.manifestTopic)) {
    const body = operationOf(m);
    if (body === null || body['hash'] !== want.hash) continue;
    // The message must be at or after the execution: a manifest that predates it
    // is not the one this execution published.
    if (record.executedTimestamp !== null && compareTimestamps(m.consensusTimestamp, record.executedTimestamp) < 0) continue;
    located = { topicId: m.topicId, sequenceNumber: m.sequenceNumber };
  }
  return returnReceiptOf(
    input,
    operatorIdOf(ctx.doorbell, ctx.account),
    { scheduleId: record.scheduleId, executedTimestamp: record.executedTimestamp ?? '' },
    located === null ? null : { ledgerTag: ctx.ledgerTag, ...located },
  );
}
