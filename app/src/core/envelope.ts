/**
 * Assembly and recovery — §6.4 steps 3 and 4 out, §5.5 back.
 *
 * §6.4 fixes the order: "the Assembler chooses a nonce, builds the AAD, seals
 * the payload against it, and chunks the ciphertext (§7). The envelope's weight
 * and postage are computed." Then, at step 4, "the sender transfers the
 * envelope's postage in stamps to the treasury under the memo `wishmail:` +
 * `aadHash` … the transfer's `txRef` is the settlement reference".
 *
 * THE ORDER IS NOT QUITE THE ORDER IT READS AS, and the seam is here. §5.6 puts
 * the settlement reference inside chunk 0's header as `st`, and the header's
 * bytes fix every slice boundary after it, so the byte-exact chunking cannot
 * precede the reference. It does not have to: on Hedera a transaction's
 * reference is its transaction id, and the payer chooses that before it signs
 * anything — the same fact `ops/journal.ts` already rests on, where an id is
 * pinned before submission so a crash mid-flight leaves something searchable.
 * So assembly is two calls with the affixing transfer between them:
 *
 *     sealEnvelope()  -> the AAD, the identifier, the ciphertext, the postage,
 *                        and the memo the transfer must carry
 *     [ the sender pins a transaction id and submits the transfer ]
 *     affix()         -> the header carrying that reference, and the chunks
 *
 * Nothing about that widens the specification: §6.4's step 4 still precedes
 * step 5, and §11.4 still requires the settlement's consensus timestamp to
 * precede chunk 0's, which this ordering is what produces. MINE, 2026-09-08.
 *
 * THE READER IS IN THIS FILE (CLAUDE.md §9). `recoverEnvelope` rebuilds §5.5's
 * object from chunk 0 alone, which is what `inbox` and `verify` each do, and
 * `affix` runs the first weld — the rebuild — against its own output before any
 * caller can sign it. A header that validates, hashes and chunks correctly can
 * still fail to rebuild to the identifier every chunk carries, and only the
 * rebuild says so.
 *
 * Conformance: T-P1-4, T-P1-6, T-P1-11, T-P7-1, T-P7-3, T-P9-3, T-P9-7,
 * T-P9-11, T-P10-1.
 */
import { randomBytes } from 'node:crypto';
import { AAD_VERSION, NONCE_BYTES, buildAad, rebuildAad } from './aad.js';
import { b64u, unb64u } from './canonical.js';
import { chunkCiphertext, type Chunk, type ChunkHeader } from './chunk.js';
import { refuse } from './failure.js';
import type { KeyPair } from './hpke.js';
import type { MessageLocator } from './locator.js';
import { MAX_WEIGHT, postageFor, seal, weightOf } from './seal.js';

/** §4.3, §5.4: the affixing transfer's memo is this prefix and the identifier. */
export const SETTLEMENT_MEMO_PREFIX = 'wishmail:';

/** The memo an affixing transfer MUST carry for this envelope (§4.3, T-P1-2). */
export function settlementMemo(envelopeId: string): string {
  return `${SETTLEMENT_MEMO_PREFIX}${envelopeId}`;
}

/**
 * The identifier a settlement memo names, or null if it names none. A reader
 * uses this to decide whether a transfer is an envelope's postage; a Verifier
 * uses it to find the orphans (§11.4, F-3).
 */
export function envelopeIdOfMemo(memo: string): string | null {
  if (!memo.startsWith(SETTLEMENT_MEMO_PREFIX)) return null;
  const id = memo.slice(SETTLEMENT_MEMO_PREFIX.length);
  return /^[0-9a-f]{64}$/.test(id) ? id : null;
}

/** §5.5's Envelope: the assembled object, which is never itself transmitted. */
export interface Envelope {
  readonly ledgerTag: string;
  readonly lane: string;
  readonly profile: string;
  readonly resolutionProof: { readonly hash: string; readonly uri: MessageLocator | null };
  readonly nonce: string;
  /** The AAD bytes, base64url — §5.5 carries the bytes, §7.2 fixes them. */
  readonly aad: string;
  readonly aadHash: string;
  readonly keyEpoch: number;
  readonly ephemeralPub: string;
  readonly ciphertextDigest: string;
  readonly ciphertextBytes: number;
  readonly weight: number;
  readonly settlementRef: string;
  readonly schemaRef: string;
  readonly chunkCount: number;
}

/** What an Assembler is given. Everything here was resolved, published, or held. */
export interface AssemblyInput {
  readonly ledgerTag: string;
  /** The lane the envelope binds to — §7.1, and §7.2's first weld. */
  readonly lane: string;
  readonly profile: string;
  /** The proof's hash, and the locator `send` published its manifest at (§6.4 step 2). */
  readonly resolutionProof: { readonly hash: string; readonly uri: MessageLocator };
  /** The recipient's X25519 public key at the epoch the coordinates carry (§7.3). */
  readonly recipientX25519Pub: string;
  readonly keyEpoch: number;
  readonly payload: Buffer;
  readonly returnReceipt: boolean;
  readonly schemaRef: string;
  /** §7.2's fourth weld: `inboundTopicId@accountId`, the account that affixes. */
  readonly operatorId: string;
  /**
   * Present only to reproduce a committed vector. §7.2 requires a fresh nonce
   * per envelope and §7.3 a fresh ephemeral key; supplying either twice is a
   * defect rather than a feature, and no tool body passes them.
   */
  readonly nonce?: string;
  readonly ephemeral?: KeyPair;
}

/** Everything assembly knows before the postage is affixed. */
export interface SealedEnvelope {
  readonly input: AssemblyInput;
  /** The envelope identifier: SHA-256 over the AAD bytes (§7.2). */
  readonly id: string;
  /** The AAD bytes themselves — what HPKE was given, and what a reader rebuilds. */
  readonly aad: Buffer;
  readonly nonce: string;
  readonly ephemeralPub: string;
  readonly ciphertext: Buffer;
  readonly ciphertextDigest: string;
  readonly ciphertextBytes: number;
  /** §7.5, in ounces. */
  readonly weight: number;
  /** §7.5: `weight + (rr ? 1 : 0)` — the stamps the transfer must move. */
  readonly postage: number;
  /** The memo that transfer must carry, and nothing else (§4.3). */
  readonly memo: string;
}

/** Assembly's output: the object, its header, and the chunks that travel. */
export interface AssembledEnvelope {
  readonly envelope: Envelope;
  readonly header: ChunkHeader;
  readonly chunks: readonly Chunk[];
}

/**
 * §6.4 step 3, as far as the postage.
 *
 * The nonce is 16 bytes from `randomBytes` — "from a cryptographically secure
 * source, fresh for every envelope; … its only job is that no two envelopes
 * share an identifier" (§7.2).
 */
export function sealEnvelope(input: AssemblyInput): SealedEnvelope {
  const nonce = input.nonce ?? b64u(randomBytes(NONCE_BYTES));

  // buildAad refuses an undefined ledger tag, a malformed lane, a proof hash
  // that is not a digest, and a nonce of the wrong length. §5.1 requires the
  // first of those at `send` by name (T-P9-11); each of the rest would produce a
  // perfectly well-formed identifier that binds to nothing.
  const aad = buildAad({
    ledgerTag: input.ledgerTag,
    lane: input.lane,
    resolutionProofHash: input.resolutionProof.hash,
    nonce,
  });

  const sealed = seal(input.recipientX25519Pub, aad.bytes, input.payload, input.ephemeral);

  if (sealed.weight > MAX_WEIGHT) {
    refuse(
      'SEND_TOO_HEAVY',
      `${sealed.ciphertextBytes} ciphertext bytes is ${sealed.weight} ounces, over MAX_WEIGHT ${MAX_WEIGHT} (§7.5)`,
    );
  }

  return {
    input,
    id: aad.id,
    aad: aad.bytes,
    nonce,
    ephemeralPub: sealed.ephemeralPub,
    ciphertext: sealed.ciphertext,
    ciphertextDigest: sealed.ciphertextDigest,
    ciphertextBytes: sealed.ciphertextBytes,
    weight: sealed.weight,
    postage: postageFor(sealed.weight, input.returnReceipt),
    memo: settlementMemo(aad.id),
  };
}

const TX_REF = /^[0-9]+\.[0-9]+\.[0-9]+@[0-9]+\.[0-9]+$/;

/**
 * §6.4 step 4's other half: the header carrying the settlement reference, and
 * the chunks that carry the header.
 *
 * `settlementRef` is the transaction id of the affixing transfer — pinned by
 * the sender before submission, per the note at the head of this file.
 */
export function affix(sealed: SealedEnvelope, settlementRef: string): AssembledEnvelope {
  if (!TX_REF.test(settlementRef)) {
    throw new Error(`envelope: ${settlementRef} is not a transaction reference (§5.1)`);
  }
  const { input } = sealed;

  const header: ChunkHeader = {
    l: input.ledgerTag,
    pr: input.profile,
    rp: { h: input.resolutionProof.hash, u: input.resolutionProof.uri },
    nc: sealed.nonce,
    ke: input.keyEpoch,
    ep: sealed.ephemeralPub,
    st: settlementRef,
    w: sealed.weight,
    h: sealed.ciphertextDigest,
    cb: sealed.ciphertextBytes,
    rr: input.returnReceipt,
  };

  // THE READER, RUN ON THE WRITER'S OUTPUT, BEFORE ANYTHING IS SIGNED.
  // This is P-1's first weld and the whole of `INBOX_UNBOUND`'s header case: a
  // header that does not rebuild to the identifier its own chunks carry is an
  // envelope nobody can open, and every other check here would pass on it.
  const rebuilt = rebuildAad(header, input.lane);
  if (rebuilt.id !== sealed.id) {
    throw new Error(
      `envelope: the header does not rebuild to the identifier — ${rebuilt.id} from the header, ${sealed.id} from assembly (§5.6, §7.2)`,
    );
  }

  const chunks = chunkCiphertext({
    id: sealed.id,
    schemaRef: input.schemaRef,
    ciphertext: sealed.ciphertext,
    header,
    operatorId: input.operatorId,
  });

  const envelope: Envelope = {
    ledgerTag: input.ledgerTag,
    lane: input.lane,
    profile: input.profile,
    resolutionProof: { hash: input.resolutionProof.hash, uri: input.resolutionProof.uri },
    nonce: sealed.nonce,
    aad: b64u(sealed.aad),
    aadHash: sealed.id,
    keyEpoch: input.keyEpoch,
    ephemeralPub: sealed.ephemeralPub,
    ciphertextDigest: sealed.ciphertextDigest,
    ciphertextBytes: sealed.ciphertextBytes,
    weight: sealed.weight,
    settlementRef,
    schemaRef: input.schemaRef,
    chunkCount: chunks.length,
  };

  return { envelope, header, chunks };
}

/**
 * §5.5, recovered from chunk 0 and the topic it arrived on — what `inbox` and
 * `verify` each build before they check anything about it.
 *
 * The AAD is rebuilt rather than carried: "A reader rebuilds the AAD from `hdr`
 * and the topic the chunk arrived on … hashes it, and so binds the header to
 * the `id` every chunk carries" (§5.6). So the `aad` and `aadHash` on the
 * returned object are the READER's, computed from what it read; comparing
 * `aadHash` to the chunk's `id` is the caller's to do, and `bound` says whether
 * it holds.
 *
 * `version` is §5.6's careful clause — "the wire string of the minor version the
 * chunk's `s` is registered under" — and defaults to this release's only when
 * the caller has nothing better.
 */
export function recoverEnvelope(
  zero: Chunk,
  lane: string,
  version: string = AAD_VERSION,
): { readonly envelope: Envelope; readonly bound: boolean } {
  const header = zero.hdr;
  if (header === undefined) throw new Error('envelope: chunk 0 carries no header (§5.6)');

  // A HEADER THAT WILL NOT BUILD IS A HEADER THAT DOES NOT BIND, AND THIS
  // FUNCTION SAYS SO RATHER THAN RAISING.
  //
  // `buildAad` refuses a ledger tag §5.1 does not define (T-P9-11), which is
  // correct where an envelope is being MADE and wrong where one is being
  // described: a reader that met such an envelope raised out of `verify` and out
  // of `inbox` instead of appraising it, and §11.5's table has a rung for
  // exactly this condition — unbound — while §6.5 has `INBOX_UNBOUND`. P-12 is
  // explicit that a Verifier reports and never errors where a downgrade will do
  // (§6.7). Found by the P-12 conformance body itself, T-P12-2, and confirmed
  // from the other side by T-P9-11.
  //
  // Where the rebuild fails there is no AAD to name, so the envelope is
  // described with the identifier its own chunks carry and `bound` is false —
  // which is the caller's cue to report the reason §11.5 names.
  let rebuilt: { bytes: Buffer; id: string } | null;
  try {
    rebuilt = rebuildAad(header, lane, version);
  } catch {
    rebuilt = null;
  }

  const envelope: Envelope = {
    ledgerTag: header.l,
    lane,
    profile: header.pr,
    resolutionProof: { hash: header.rp.h, uri: header.rp.u },
    nonce: header.nc,
    aad: rebuilt === null ? '' : b64u(rebuilt.bytes),
    aadHash: rebuilt === null ? zero.id : rebuilt.id,
    keyEpoch: header.ke,
    ephemeralPub: header.ep,
    ciphertextDigest: header.h,
    ciphertextBytes: header.cb,
    weight: header.w,
    settlementRef: header.st,
    schemaRef: zero.s,
    chunkCount: zero.n,
  };
  return { envelope, bound: rebuilt !== null && rebuilt.id === zero.id };
}

/** §7.5's postage for a header as read: `w + (rr ? 1 : 0)`. */
export function headerPostage(header: ChunkHeader): number {
  return postageFor(header.w, header.rr);
}

/**
 * Whether a header's own arithmetic holds: the weight is the one §7.5 computes
 * from the size it declares. A header that claims a lighter weight than its
 * ciphertext is short postage dressed as correct postage, and §11.4 counts the
 * settlement against the weight the header declares — so the check belongs to
 * whoever reads the header, not to whoever wrote it.
 */
export function headerWeightAgrees(header: ChunkHeader): boolean {
  return header.w === weightOf(header.cb);
}

/** The ciphertext a complete reassembly yields, as the opener needs it. */
export function ciphertextOf(chunks: readonly Chunk[]): Buffer {
  return Buffer.concat(chunks.map((c) => unb64u(c.d)));
}
