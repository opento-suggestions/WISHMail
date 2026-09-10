/**
 * The return receipt — §10.4's parts, and the one place they are composed.
 *
 * A receipt is the only proof in WISHMail whose manifest is written by one
 * party and published by another. The SENDER fills it in at `send` step 7,
 * before the recipient has agreed to anything; the RECIPIENT's signature is
 * what puts it on consensus; and a VERIFIER recomputes it from the schedule's
 * record and the topic it landed on. Three readers, one set of bytes, and the
 * bytes are fixed before two of the three have seen them — so if the sender and
 * the recipient composed the manifest separately they would have to agree by
 * inspection, which is exactly the failure `core/proof.ts` exists to prevent.
 * `receiptManifest` is therefore called by all three: `send` to fill the
 * schedule, `ack` to check the schedule it is asked to sign (T-P1-9), and
 * `verify` to recompute what executed (T-P1-8).
 *
 * §10.4's parts, verbatim: "Rule: receipt at this specification's version.
 * Inputs: the envelope identifier, chunk 0's postmark, and the key epoch the
 * envelope opened under. Output: the statement `opened`, over exactly those
 * inputs. Meaning: the recipient's account, the recipient's manifest topic as
 * the receipt's canonical location, `trustClass: math`, no endorsements.
 * Witness: the executed schedule and the manifest message's postmark."
 *
 * WHY THE MANIFEST CARRIES NO SEQUENCE NUMBER, and it is not an omission.
 * §10.4: "The receipt's manifest is complete before the recipient has signed
 * anything, so its meaning names the topic it will land on and no sequence
 * number: the sequence is assigned by the execution the recipient's signature
 * triggers, and the manifest is inside the transaction that triggers it." That
 * is D-163's rule reaching the one case that forced it — `meaning.uri` is a
 * LOCATION, `{ledgerTag, topicId}`, and the manifest at a location is the
 * message on that topic whose body recomputes to the proof's hash (§5.2).
 *
 * WHAT THE PROOF PROVES AND WHAT IT STATES ARE DIFFERENT THINGS, and D-81 is
 * why the trust class is `math` while the output is `opened`. What a Verifier
 * recomputes is that the recipient's key signed for this envelope after this
 * postmark; that is arithmetic. That the envelope OPENED is the recipient's
 * testimony and nothing else — "as a signature on a return-receipt card is the
 * signer's testimony that the letter was received" (§10.4). The manifest says
 * both, and `meaning.statement` is where the second is confined.
 *
 * Conformance: T-P1-8, T-P1-9, T-P16-2, T-P1-3.
 */
import { canonicalBytes } from './canonical.js';
import { proofInputs, proofLocation, sealProof, type Proof } from './proof.js';
import type { MessageLocator } from './locator.js';

/** §10.4's rule identifier, at this specification's version (§5.2, §1.7). */
export const RECEIPT_RULE = { id: 'wishmail:receipt', revision: '0.5' } as const;

/** §10.4's output: the statement, and the only value it ever takes. */
export const RECEIPT_OUTPUT = 'opened' as const;

/**
 * §10.4's `meaning.statement`.
 *
 * IT NAMES THE RECIPIENT'S ACCOUNT, and that is §10.4 read literally rather
 * than loosely. §10.4's meaning has four parts — "the recipient's account, the
 * recipient's manifest topic as the receipt's canonical location,
 * `trustClass: math`, no endorsements" — and §5.2's `meaning` has exactly four
 * fields, closed by the frozen schema: `statement`, `uri`, `trustClass`,
 * `endorsements`. The topic is the `uri`, the class and the endorsements are
 * themselves, and the account has one place left to be. `check:freeze`'s
 * hand-built fixture (2026-09-09) left it out, which no schema could catch.
 *
 * It matters beyond tidiness: the account is inside the hash, so a Verifier
 * reading the manifest learns WHOSE receipt it is from the receipt, and can then
 * check that account against consensus — its key is the submit key of the topic
 * the receipt landed on, and the prefix on the schedule's record is that key
 * (§11.4). Without it, a Verifier that claims no profile has no replay, no
 * coordinates, and no way to name the signer at all.
 *
 * §9.1's budget bounds a statement at N = 70 bytes, and this is 56 at a
 * testnet-length account and 58 at the longest mainnet one. `receiptManifest`
 * refuses over the budget rather than discovering it at submission.
 *
 * What it says is what the recipient testifies to and nothing beyond it: not
 * that the recipient read the payload, not that it agreed with it, and not that
 * anything was delivered to a hand — §2.3 reserves *delivery* for the lane.
 */
export function receiptStatement(recipientAccount: string): string {
  return `${recipientAccount} opened this envelope with its AAD verified.`;
}

/** §9.1's budget: `meaning.statement` MUST NOT exceed N. */
export const STATEMENT_MAX_BYTES = 70;

/** What a receipt binds: exactly §10.4's three inputs and nothing else. */
export interface ReceiptInputs {
  /** The AAD hash — the envelope acknowledged. */
  readonly envelopeId: string;
  /** Chunk 0's postmark: the topic it is on and its sequence number (§5.7). */
  readonly postmarkRef: { readonly topicId: string; readonly sequenceNumber: number };
  /** The epoch under which the envelope opened in the recipient's `inbox` (§7.6). */
  readonly keyEpoch: number;
}

export interface ReceiptManifestInput extends ReceiptInputs {
  readonly ledgerTag: string;
  /**
   * The recipient's ACCOUNT, and not its `operator_id`.
   *
   * §10.4 says the meaning names the recipient's account, and an account is what
   * a Verifier can check against consensus without re-resolving: it reads that
   * account's key and matches it to the submit key of the topic the receipt
   * landed on and to the prefix on the schedule's record. The doorbell half of
   * an `operator_id` is reachable only through the resolution's coordinates, and
   * a Verifier that claims no profile does not have those (§9.6).
   */
  readonly recipientAccount: string;
  /** The recipient's manifest topic: the receipt's canonical location (§10.4). */
  readonly manifestTopic: string;
}

/**
 * The three inputs, in the shape a Verifier re-obtains them from.
 *
 * The locator IS chunk 0's postmark, because that one message is where every
 * one of the three is found: the identifier is the chunk's `id`, the postmark is
 * that message's own postmark, and the epoch is `hdr.ke` on the same chunk. One
 * read, and the read is public, so no snapshot is owed (§5.2, §9.1).
 */
function locatorOf(input: ReceiptManifestInput): Record<string, unknown> {
  return {
    ledgerTag: input.ledgerTag,
    topicId: input.postmarkRef.topicId,
    sequenceNumber: input.postmarkRef.sequenceNumber,
  };
}

/**
 * Exactly what the rule fired on, hashed as canonical JSON (§5.2).
 *
 * ALL THREE OF §10.4'S INPUTS ARE IN THE DIGEST, and the postmark is the one
 * that had been left out. `check:freeze`'s hand-built fixture (2026-09-09)
 * digested `{envelopeId, keyEpoch}` and carried the postmark only in the
 * locator — which validates, hashes correctly and is self-consistent, and would
 * have let a receipt be re-worn on a different chunk 0 of the same envelope with
 * the same hash. §10.4 says the output is `opened` "over exactly those inputs",
 * and there are three of them.
 */
function readOf(input: ReceiptInputs): Record<string, unknown> {
  return {
    envelopeId: input.envelopeId,
    postmarkRef: { topicId: input.postmarkRef.topicId, sequenceNumber: input.postmarkRef.sequenceNumber },
    keyEpoch: input.keyEpoch,
  };
}

/**
 * §10.4's manifest, complete and hashed — the bytes the ScheduleCreate carries
 * and the recipient's signature publishes.
 *
 * Deterministic in its input, which is the whole point: `send` composes it,
 * `ack` composes it again from what its own `inbox` saw and compares byte for
 * byte, and `verify` composes it a third time from consensus. Two of those
 * three are checks, and neither is possible unless the composition is one
 * function.
 */
export function receiptManifest(input: ReceiptManifestInput): Proof {
  const statement = receiptStatement(input.recipientAccount);
  if (Buffer.byteLength(statement, 'utf8') > STATEMENT_MAX_BYTES) {
    throw new Error(
      `receipt: the manifest's statement is ${Buffer.byteLength(statement, 'utf8')} bytes and §9.1's budget is ${STATEMENT_MAX_BYTES}`,
    );
  }
  return sealProof({
    rule: { ...RECEIPT_RULE },
    inputs: proofInputs(locatorOf(input), readOf(input)),
    output: { value: RECEIPT_OUTPUT },
    meaning: {
      statement,
      // §5.2's canonical location, and NOT a locator: the manifest's own
      // sequence number does not exist when these bytes are fixed (D-163).
      uri: proofLocation(input.ledgerTag, input.manifestTopic),
      trustClass: 'math',
      endorsements: [],
    },
  });
}

/** The manifest's bytes exactly as they go inside the schedule (§5.1, canonical JSON). */
export function receiptManifestBytes(input: ReceiptManifestInput): Buffer {
  return canonicalBytes(receiptManifest(input) as unknown as Record<string, unknown>);
}

/**
 * Whether a manifest read from consensus is the receipt for these inputs.
 *
 * Compared by RECOMPOSITION and not field by field: the manifest is composed
 * again from the three inputs a reader independently knows, and its hash is
 * compared. A field-by-field comparison would pass a manifest that agreed on
 * every field this code happened to check and differed on one it did not.
 */
export function receiptBinds(manifest: Record<string, unknown>, input: ReceiptManifestInput): boolean {
  const want = receiptManifest(input);
  return manifest['hash'] === want.hash;
}

/** §5.8's ReturnReceipt — the authored object, once the schedule has executed. */
export interface ReturnReceipt {
  readonly envelopeId: string;
  readonly postmarkRef: { readonly topicId: string; readonly sequenceNumber: number };
  readonly recipient: string;
  readonly keyEpoch: number;
  readonly proof: { readonly hash: string; readonly uri: MessageLocator | null };
  readonly witness: {
    readonly ledgerTag: string;
    readonly scheduleId: string;
    readonly executedTimestamp: string;
  };
}

/**
 * §5.8's object, from the manifest that was scheduled and the execution that
 * published it.
 *
 * `proof.uri` is a LOCATOR here and a location in the manifest, and the
 * difference is §5.2's: the manifest could not name the message it was about to
 * become, but the receipt is authored afterwards and names exactly the message
 * the execution assigned.
 */
export function returnReceiptOf(
  input: ReceiptManifestInput,
  /** §5.8's `recipient` is the `operator_id`, which the manifest does not carry. */
  recipientOperatorId: string,
  witness: { readonly scheduleId: string; readonly executedTimestamp: string },
  publishedAt: MessageLocator | null,
): ReturnReceipt {
  return {
    envelopeId: input.envelopeId,
    postmarkRef: { topicId: input.postmarkRef.topicId, sequenceNumber: input.postmarkRef.sequenceNumber },
    recipient: recipientOperatorId,
    keyEpoch: input.keyEpoch,
    proof: { hash: receiptManifest(input).hash, uri: publishedAt },
    witness: {
      ledgerTag: input.ledgerTag,
      scheduleId: witness.scheduleId,
      executedTimestamp: witness.executedTimestamp,
    },
  };
}

/**
 * HCS-10's `transaction` operation, as the pin fixes its shape.
 *
 * `p`, `op`, `operator_id`, `schedule_id` and `data` are all REQUIRED at the
 * pinned revision, `m` optional (recon 2026-09-06, `index.md:696-714`). `data`
 * is a free-text description of what the recipient is being asked to sign —
 * HCS-10's own example is "Transfer 10 HBAR to account 0.0.111222" — so it
 * carries the envelope this receipt is for, which is also what makes a lane
 * with two requests on it readable: an `inbox` matches the request to the
 * envelope by this string and never by position.
 *
 * The operation carries NO transaction memo: HCS-10 assigns it no operation
 * enum (D-94, recon C-5), and §6.1 says a tool "MUST carry none where HCS-10
 * defines none" (T-P9-5). `ops/hcs10.ts::TRANSACTION_OP_MEMO` is that empty
 * string, named rather than typed twice.
 */
export function receiptRequestData(envelopeId: string): string {
  return `wishmail:receipt:${envelopeId}`;
}

/** The envelope a `transaction` operation's `data` names, or null if it names none. */
export function envelopeIdOfRequest(data: unknown): string | null {
  if (typeof data !== 'string') return null;
  const m = /^wishmail:receipt:([0-9a-f]{64})$/.exec(data);
  return m === null ? null : (m[1] as string);
}

export function transactionOperation(
  operatorId: string,
  scheduleId: string,
  envelopeId: string,
): Record<string, unknown> {
  return {
    p: 'hcs-10',
    op: 'transaction',
    operator_id: operatorId,
    schedule_id: scheduleId,
    data: receiptRequestData(envelopeId),
  };
}
