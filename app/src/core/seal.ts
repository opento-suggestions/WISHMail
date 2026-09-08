/**
 * Sealing and opening — §7.3, on top of `hpke.ts`.
 *
 * §7.3 fixes it exactly:
 *
 *     (enc, ct) = Seal(pkR, info, aad, payload)
 *       pkR      the recipient's X25519 public key at the epoch the coordinates carry
 *       info     ASCII "wishmail/0.5/seal"
 *       aad      the AAD bytes of §7.2
 *       enc      -> ephemeralPub (32 bytes)
 *       ct       -> the ciphertext; ciphertextDigest = SHA-256(ct); ciphertextBytes = |ct|
 *
 * "One AEAD operation covers the whole payload; chunking is of the ciphertext,
 * not of the plaintext." So this module knows nothing about chunks.
 *
 * Conformance: T-P1-5. Specification §7.3, §7.5, §5.5.
 */
import type { KeyObject } from 'node:crypto';
import { b64u, sha256hex, unb64u } from './canonical.js';
import {
  WISHMAIL_SUITE,
  generateKeyPair,
  openBase,
  publicFromRaw,
  rawPublic,
  sealBase,
  type KeyPair,
} from './hpke.js';

/**
 * §7.3's `info`, and §1.7's rule that the wire carries `major.minor` and
 * nothing finer. `spec/pins.json` carries it as `wireStrings.hpkeInfo`.
 */
export const SEAL_INFO = Buffer.from('wishmail/0.5/seal', 'ascii');

/** §7.5's weight constants. */
export const OUNCE_BYTES = 4096;
export const MAX_WEIGHT = 16;

/** What sealing produces: the header fields of §5.5 that the seal determines. */
export interface SealResult {
  /** `enc`, base64url — §5.5's `ephemeralPub`, `hdr.ep` in §5.6. */
  readonly ephemeralPub: string;
  /** The whole ciphertext. Chunking slices this, never the payload. */
  readonly ciphertext: Buffer;
  /** SHA-256 over the whole ciphertext — §5.5, and `hdr.h` in §5.6. */
  readonly ciphertextDigest: string;
  readonly ciphertextBytes: number;
  /** §7.5's weight in ounces. */
  readonly weight: number;
}

/** §7.5: `weight = max(1, ceil(ciphertextBytes / OUNCE_BYTES))`. */
export function weightOf(ciphertextBytes: number): number {
  return Math.max(1, Math.ceil(ciphertextBytes / OUNCE_BYTES));
}

/** §7.5: `postage = weight + (rr ? 1 : 0)`. */
export function postageFor(weight: number, returnReceipt: boolean): number {
  return weight + (returnReceipt ? 1 : 0);
}

/**
 * Seal a payload against an AAD, for a recipient's X25519 public key.
 *
 * `ephemeral` exists for one purpose only — reproducing a committed vector —
 * and is not part of sealing. §7.3: base mode "generates a fresh ephemeral
 * X25519 key for every envelope and discards it", and a caller that supplied
 * the same one twice would be reusing an AEAD nonce.
 */
export function seal(
  recipientX25519Pub: string,
  aad: Buffer,
  payload: Buffer,
  ephemeral?: KeyPair,
): SealResult {
  const pkR = publicFromRaw(unb64u(recipientX25519Pub));
  const { enc, ct } = sealBase(WISHMAIL_SUITE, pkR, SEAL_INFO, aad, payload, ephemeral);
  return {
    ephemeralPub: b64u(enc),
    ciphertext: ct,
    ciphertextDigest: sha256hex(ct),
    ciphertextBytes: ct.length,
    weight: weightOf(ct.length),
  };
}

/**
 * Open a ciphertext under the private key of the epoch the header names.
 * "Opening … fails closed on any authentication error" (§7.3) — this throws,
 * and every caller turns that into `INBOX_UNBOUND` rather than into a tool
 * failure (§6.5, P-12).
 */
export function open(
  ephemeralPub: string,
  recipientPrivate: KeyObject,
  aad: Buffer,
  ciphertext: Buffer,
): Buffer {
  return openBase(WISHMAIL_SUITE, unb64u(ephemeralPub), recipientPrivate, SEAL_INFO, aad, ciphertext);
}

/**
 * A recipient encryption key pair, born here and nowhere else (P-13). §7.3: a
 * Correspondent that only sends has no encryption key to rotate; this is the
 * key a Recipient declares and retains for every epoch it has published (§7.6).
 */
export function generateRecipientKey(): { readonly keyPair: KeyPair; readonly x25519Pub: string } {
  const keyPair = generateKeyPair();
  return { keyPair, x25519Pub: b64u(rawPublic(keyPair.publicKey)) };
}
