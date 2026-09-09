/**
 * The structured locator — §5.2.
 *
 * "Locators and canonical locations are structured, not strings: on Hedera,
 * `{ledgerTag, topicId, sequenceNumber}` names one message and
 * `{ledgerTag, txRef}` names one transaction. The HRL grammar of HCS-1
 * (`hcs://<standard>/<topicId>`) names files, not messages, and is used only
 * where a standard uses it."
 *
 * One definition, because three readers dereference it: a chunk header's
 * `rp.u` (§5.6), MailCoordinates' `resolutionProof.uri` (§5.3), and the
 * Verifier's ingestion table (§11.2), which reaches the sender's manifest topic
 * by following exactly this.
 *
 * D-163 separates a second shape from it. A LOCATION — `{ledgerTag, topicId}` —
 * is what a proof's own `meaning.uri` carries: the topic its manifest is
 * published on, and not the message. A LOCATOR is what a REFERENCE to a proof
 * carries. The distinction is not cosmetic: a proof's hash covers its meaning
 * and its manifest is published after the hash is fixed (§5.1, §6.4), so a proof
 * that named its own message would have to be published, re-hashed and
 * republished, and the second publication has a different sequence number than
 * the first. The manifest at a location is found by hash (§9.1, §11.1).
 */

/** `{ledgerTag, topicId, sequenceNumber}` — one HCS message. */
export interface MessageLocator {
  readonly ledgerTag: string;
  readonly topicId: string;
  readonly sequenceNumber: number;
}

/** `{ledgerTag, txRef}` — one transaction. */
export interface TransactionLocator {
  readonly ledgerTag: string;
  readonly txRef: string;
}

const ENTITY_ID = /^[0-9]+\.[0-9]+\.[0-9]+$/;

/** Whether a value is a well-formed message locator. Shape only; §5.2 fixes no more. */
export function isMessageLocator(value: unknown): value is MessageLocator {
  if (typeof value !== 'object' || value === null) return false;
  const l = value as Record<string, unknown>;
  return (
    typeof l['ledgerTag'] === 'string' &&
    typeof l['topicId'] === 'string' &&
    ENTITY_ID.test(l['topicId']) &&
    typeof l['sequenceNumber'] === 'number' &&
    Number.isInteger(l['sequenceNumber']) &&
    l['sequenceNumber'] >= 1
  );
}

/** Two locators name the same message. */
export function sameMessage(a: MessageLocator, b: MessageLocator): boolean {
  return a.ledgerTag === b.ledgerTag && a.topicId === b.topicId && a.sequenceNumber === b.sequenceNumber;
}

/**
 * `{ledgerTag, topicId}` — a LOCATION: the topic a manifest is published on
 * (§5.2, D-163). What a proof's `meaning.uri` carries, and what §11.1's lookup
 * reads for a message whose body recomputes to the proof's hash.
 */
export interface ProofLocation {
  readonly ledgerTag: string;
  readonly topicId: string;
}

/** Whether a value is a well-formed location. Shape only; §5.2 fixes no more. */
export function isProofLocation(value: unknown): value is ProofLocation {
  if (typeof value !== 'object' || value === null) return false;
  const l = value as Record<string, unknown>;
  return typeof l['ledgerTag'] === 'string' && typeof l['topicId'] === 'string' && ENTITY_ID.test(l['topicId']);
}
