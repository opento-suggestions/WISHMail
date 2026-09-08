/**
 * The AAD, and the envelope identifier — §7.2, with §5.6's rebuild beside it.
 *
 * §7.2 fixes the protected header exactly:
 *
 *     { "p": "wishmail", "v": "0.5",
 *       "l": ledgerTag, "lane": topicId,
 *       "rp": resolutionProofHash, "nc": nonce }
 *
 * "its SHA-256 is the envelope identifier, `id`". The key names are short and
 * they are these: D-127 settled that §5.5's longer spelling was a drafting
 * error and §7.2 governs, because under RFC 8785 the two produce different
 * bytes and therefore a different identifier. `spec/vectors/aad.json` is the
 * court (T-P1-4).
 *
 * The rebuild is the other half, and it is why an envelope binds. A reader has
 * chunk 0's header and the topic the chunk arrived on; it rebuilds these bytes
 * from those, hashes them, and compares against the `id` every chunk carries
 * (§5.6). Nothing but the sender can produce a header that rebuilds to it.
 *
 * Conformance: T-P1-4, T-P1-1, T-P10-1.
 */
import { canonicalBytes, sha256hex } from './canonical.js';

/** §7.2's `p`: the protocol, always this. */
export const AAD_PROTOCOL = 'wishmail';

/**
 * §7.2's `v`: the wire string of the minor version (§1.7). A patch never
 * changes it; `spec/pins.json` carries it as `wireStrings.aadVersion`.
 */
export const AAD_VERSION = '0.5';

/** The two ledger tags §5.1 defines. Any other names no ledger (T-P9-11). */
export const LEDGER_TAGS = ['hedera:testnet', 'hedera:mainnet'] as const;
export type LedgerTag = (typeof LEDGER_TAGS)[number];

/** The nonce is 16 bytes, fresh per envelope (§7.2). */
export const NONCE_BYTES = 16;

/** What an AAD is built from. Every field is bound into the identifier. */
export interface AadParts {
  readonly ledgerTag: string;
  /** The lane: an HCS-10 connection topic, `0.0.N` (§7.1). */
  readonly lane: string;
  /** The resolution proof's hash — the proof travels by reference (§5.2). */
  readonly resolutionProofHash: string;
  /** 16 fresh bytes, base64url unpadded (§5.1). */
  readonly nonce: string;
}

export interface Aad {
  /** The canonical JSON bytes: what HPKE takes as `aad` (§7.3). */
  readonly bytes: Buffer;
  /** SHA-256 over `bytes`, lowercase hex: the envelope identifier. */
  readonly id: string;
  /** The header as an object, for a vector file or a diagnostic. */
  readonly header: Record<string, string>;
}

const SHA256_HEX = /^[0-9a-f]{64}$/;
const ENTITY_ID = /^[0-9]+\.[0-9]+\.[0-9]+$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

/**
 * Build §7.2's AAD. Every input is checked, because a malformed one produces a
 * perfectly well-formed identifier that binds to nothing — the failure would be
 * silent, and only a recipient would find it.
 *
 * The ledger tag is checked against §5.1's two: `send` MUST reject an envelope
 * whose AAD names a tag this document does not define (T-P9-11). An extension
 * that defines another widens `LEDGER_TAGS`, not this check.
 */
export function buildAad(parts: AadParts): Aad {
  if (!(LEDGER_TAGS as readonly string[]).includes(parts.ledgerTag)) {
    throw new Error(`aad: undefined ledger tag ${JSON.stringify(parts.ledgerTag)} (§5.1, T-P9-11)`);
  }
  if (!ENTITY_ID.test(parts.lane)) throw new Error('aad: lane is not a topic id');
  if (!SHA256_HEX.test(parts.resolutionProofHash)) {
    throw new Error('aad: resolutionProofHash is not a lowercase-hex SHA-256');
  }
  if (!BASE64URL.test(parts.nonce)) throw new Error('aad: nonce is not unpadded base64url');
  if (Buffer.from(parts.nonce, 'base64url').length !== NONCE_BYTES) {
    throw new Error(`aad: nonce is not ${NONCE_BYTES} bytes`);
  }

  // The literal of §7.2. RFC 8785 sorts the keys by UTF-16 code unit, so the
  // bytes come out as l, lane, nc, p, rp, v whatever order they are written in
  // here; they are written in the specification's order so the two read alike.
  const header = {
    p: AAD_PROTOCOL,
    v: AAD_VERSION,
    l: parts.ledgerTag,
    lane: parts.lane,
    rp: parts.resolutionProofHash,
    nc: parts.nonce,
  };
  const bytes = canonicalBytes(header);
  return { bytes, id: sha256hex(bytes), header };
}

/** Chunk 0's header, §5.6's `hdr`, as far as the rebuild needs it. */
export interface ChunkHeader {
  /** `l` — ledgerTag. */
  readonly l: string;
  /** `rp` — the resolution proof, `{h, u}`. */
  readonly rp: { readonly h: string; readonly u?: string };
  /** `nc` — the nonce. */
  readonly nc: string;
}

/**
 * §5.6's rebuild: "A reader rebuilds the AAD from `hdr` and the topic the chunk
 * arrived on … hashes it, and so binds the header to the `id` every chunk
 * carries."
 *
 * `version` is where §5.6 is careful, and so is this: it is "the wire string of
 * the minor version the chunk's `s` is registered under", not the reader's own
 * version. A reader that substituted its own would compute a different `id` for
 * a chunk written under an earlier minor version and call a good envelope
 * unbound.
 */
export function rebuildAad(header: ChunkHeader, lane: string, version: string = AAD_VERSION): Aad {
  const built = buildAad({
    ledgerTag: header.l,
    lane,
    resolutionProofHash: header.rp.h,
    nonce: header.nc,
  });
  if (version === AAD_VERSION) return built;
  // A chunk registered under another minor version rebuilds under that string.
  const rebuilt = { ...built.header, v: version };
  const bytes = canonicalBytes(rebuilt);
  return { bytes, id: sha256hex(bytes), header: rebuilt };
}

/**
 * Whether a header and the topic a chunk arrived on rebuild to the identifier
 * the chunk carries. This is P-1's first weld, and the answer is the whole of
 * `INBOX_UNBOUND`'s header case (§6.5).
 */
export function bindsTo(header: ChunkHeader, lane: string, id: string, version?: string): boolean {
  try {
    return rebuildAad(header, lane, version).id === id;
  } catch {
    // A header that will not even build is a header that does not bind.
    return false;
  }
}
