/**
 * RFC 9180 HPKE, base mode, single-shot — composed here on `node:crypto`.
 *
 * §7.3 fixes the ciphersuite: DHKEM(X25519, HKDF-SHA256), HKDF-SHA256,
 * AES-256-GCM. Sealing is `Seal(pkR, info, aad, payload)`, opening is
 * `Open(enc, skR, info, aad, ct)`, and an envelope "MUST NOT be opened by any
 * other means".
 *
 * WHY THIS IS NOT A DEPENDENCY. The argument is in `app/OPERATIONS.md` under
 * "the two things that are not"; in short: RFC 9180 Appendix A publishes no
 * vector for §7.3's suite — A.1 is the same KEM and KDF with AES-128-GCM — but
 * every part of the composition WISHMail shares with A.1 can be run against
 * A.1's published values, which is what `seal.check.ts` does. What A.1 cannot
 * reach, one field of the key schedule's `suite_id` and one AES key length,
 * `spec/vectors/seal.json` courts (T-P1-5).
 *
 * This module is parameterised by ciphersuite so that the code the check
 * exercises is the code that seals. A check that ran a different function
 * would prove nothing about this one.
 *
 * Conformance: T-P1-5. Specification §7.3.
 */
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  timingSafeEqual,
} from 'node:crypto';
import type { KeyObject } from 'node:crypto';

/**
 * A ciphersuite, as RFC 9180 §7 numbers one. The lengths are those §7.1–§7.3
 * fix for it.
 */
export interface Ciphersuite {
  readonly kemId: number;
  readonly kdfId: number;
  readonly aeadId: number;
  /** KEM shared-secret bytes (§7.1). */
  readonly nSecret: number;
  /** AEAD key bytes (§7.3). */
  readonly nK: number;
  /** AEAD nonce bytes (§7.3). */
  readonly nN: number;
  /** KDF output bytes (§7.2). */
  readonly nH: number;
  /** Private-key bytes for the KEM's group (§7.1). */
  readonly nSk: number;
  /** The `node:crypto` cipher name for `aeadId`. */
  readonly cipher: 'aes-128-gcm' | 'aes-256-gcm';
}

/** §7.3's suite: DHKEM(X25519, HKDF-SHA256), HKDF-SHA256, AES-256-GCM. */
export const WISHMAIL_SUITE: Ciphersuite = {
  kemId: 0x0020,
  kdfId: 0x0001,
  aeadId: 0x0002,
  nSecret: 32,
  nK: 32,
  nN: 12,
  nH: 32,
  nSk: 32,
  cipher: 'aes-256-gcm',
};

/**
 * RFC 9180 Appendix A.1's suite. Present so that `seal.check.ts` can run this
 * module against published values; nothing in WISHMail seals with it.
 */
export const RFC9180_A1_SUITE: Ciphersuite = {
  ...WISHMAIL_SUITE,
  aeadId: 0x0001,
  nK: 16,
  cipher: 'aes-128-gcm',
};

const HPKE_V1 = Buffer.from('HPKE-v1', 'ascii');
const EMPTY = Buffer.alloc(0);

/** X25519 SubjectPublicKeyInfo prefix: SEQUENCE, AlgorithmIdentifier 1.3.101.110, BIT STRING. */
const SPKI_X25519 = Buffer.from('302a300506032b656e032100', 'hex');
/** X25519 PrivateKeyInfo prefix: version 0, the same AlgorithmIdentifier, OCTET STRING of an OCTET STRING. */
const PKCS8_X25519 = Buffer.from('302e020100300506032b656e04220420', 'hex');

/** RFC 8017 I2OSP. */
export function i2osp(n: number, length: number): Buffer {
  if (!Number.isInteger(n) || n < 0) throw new Error('i2osp: not a non-negative integer');
  if (n >= 256 ** length) throw new Error('i2osp: value does not fit in the requested length');
  const out = Buffer.alloc(length);
  let v = n;
  for (let i = length - 1; i >= 0; i -= 1) {
    out[i] = v % 256;
    v = Math.floor(v / 256);
  }
  return out;
}

/**
 * RFC 5869 Extract. HMAC pads any key shorter than the block size with zeros,
 * so an empty salt and a HashLen-of-zeros salt are the same key; the empty
 * case is written out because Node rejects a zero-length HMAC key.
 */
function extract(salt: Buffer, ikm: Buffer): Buffer {
  return createHmac('sha256', salt.length === 0 ? Buffer.alloc(32) : salt).update(ikm).digest();
}

/** RFC 5869 Expand. */
function expand(prk: Buffer, info: Buffer, length: number): Buffer {
  const n = Math.ceil(length / 32);
  if (n > 255) throw new Error('expand: length exceeds 255 blocks');
  const chunks: Buffer[] = [];
  let t = EMPTY;
  for (let i = 1; i <= n; i += 1) {
    t = createHmac('sha256', prk)
      .update(Buffer.concat([t, info, i2osp(i, 1)]))
      .digest();
    chunks.push(t);
  }
  return Buffer.concat(chunks).subarray(0, length);
}

/** RFC 9180 §4.1: "KEM" || I2OSP(kem_id, 2). */
function kemSuiteId(s: Ciphersuite): Buffer {
  return Buffer.concat([Buffer.from('KEM', 'ascii'), i2osp(s.kemId, 2)]);
}

/** RFC 9180 §5.1: "HPKE" || I2OSP(kem_id, 2) || I2OSP(kdf_id, 2) || I2OSP(aead_id, 2). */
function hpkeSuiteId(s: Ciphersuite): Buffer {
  return Buffer.concat([
    Buffer.from('HPKE', 'ascii'),
    i2osp(s.kemId, 2),
    i2osp(s.kdfId, 2),
    i2osp(s.aeadId, 2),
  ]);
}

function labeledExtract(suiteId: Buffer, salt: Buffer, label: string, ikm: Buffer): Buffer {
  return extract(salt, Buffer.concat([HPKE_V1, suiteId, Buffer.from(label, 'ascii'), ikm]));
}

function labeledExpand(
  suiteId: Buffer,
  prk: Buffer,
  label: string,
  info: Buffer,
  length: number,
): Buffer {
  const labelled = Buffer.concat([
    i2osp(length, 2),
    HPKE_V1,
    suiteId,
    Buffer.from(label, 'ascii'),
    info,
  ]);
  return expand(prk, labelled, length);
}

/** The 32 raw bytes of an X25519 public key, off the tail of its SPKI export. */
export function rawPublic(key: KeyObject): Buffer {
  const der = key.export({ type: 'spki', format: 'der' });
  if (
    der.length !== SPKI_X25519.length + 32 ||
    !der.subarray(0, SPKI_X25519.length).equals(SPKI_X25519)
  ) {
    throw new Error('rawPublic: not an X25519 SubjectPublicKeyInfo');
  }
  return Buffer.from(der.subarray(SPKI_X25519.length));
}

/** The 32 raw bytes of an X25519 private key, off the tail of its PKCS#8 export. */
export function rawPrivate(key: KeyObject): Buffer {
  const der = key.export({ type: 'pkcs8', format: 'der' });
  if (
    der.length !== PKCS8_X25519.length + 32 ||
    !der.subarray(0, PKCS8_X25519.length).equals(PKCS8_X25519)
  ) {
    throw new Error('rawPrivate: not an X25519 PrivateKeyInfo');
  }
  return Buffer.from(der.subarray(PKCS8_X25519.length));
}

/** A KeyObject from 32 raw public bytes. Node takes no raw X25519 key; it takes DER. */
export function publicFromRaw(raw: Buffer): KeyObject {
  if (raw.length !== 32) throw new Error('publicFromRaw: expected 32 bytes');
  return createPublicKey({ key: Buffer.concat([SPKI_X25519, raw]), format: 'der', type: 'spki' });
}

/** A KeyObject from 32 raw private bytes. */
export function privateFromRaw(raw: Buffer): KeyObject {
  if (raw.length !== 32) throw new Error('privateFromRaw: expected 32 bytes');
  return createPrivateKey({ key: Buffer.concat([PKCS8_X25519, raw]), format: 'der', type: 'pkcs8' });
}

export interface KeyPair {
  readonly privateKey: KeyObject;
  readonly publicKey: KeyObject;
}

/** A fresh X25519 key pair. */
export function generateKeyPair(): KeyPair {
  return generateKeyPairSync('x25519');
}

/**
 * RFC 9180 §7.1.3 DeriveKeyPair for the X25519 KEM. Deterministic, and the only
 * way to reproduce A.1's skEm and skRm from its ikmE and ikmR.
 */
export function deriveKeyPair(s: Ciphersuite, ikm: Buffer): KeyPair {
  const suiteId = kemSuiteId(s);
  const dkpPrk = labeledExtract(suiteId, EMPTY, 'dkp_prk', ikm);
  const sk = labeledExpand(suiteId, dkpPrk, 'sk', EMPTY, s.nSk);
  const privateKey = privateFromRaw(sk);
  return { privateKey, publicKey: createPublicKey(privateKey) };
}

/** RFC 9180 §4.1 ExtractAndExpand, over the Diffie-Hellman output and the KEM context. */
function extractAndExpand(s: Ciphersuite, shared: Buffer, kemContext: Buffer): Buffer {
  const suiteId = kemSuiteId(s);
  const eaePrk = labeledExtract(suiteId, EMPTY, 'eae_prk', shared);
  return labeledExpand(suiteId, eaePrk, 'shared_secret', kemContext, s.nSecret);
}

/**
 * The X25519 Diffie-Hellman, with RFC 7748's check. An all-zero output means a
 * small-order public key, and RFC 9180 §7.1.4 requires the operation to abort
 * rather than proceed under a shared secret an attacker chose.
 */
function dh(privateKey: KeyObject, publicKey: KeyObject): Buffer {
  const out = Buffer.from(diffieHellman({ privateKey, publicKey }));
  if (out.every((b) => b === 0)) {
    throw new Error('X25519: all-zero shared secret (small-order public key)');
  }
  return out;
}

export interface Encapsulation {
  /** The serialised ephemeral public key: §5.5's ephemeralPub. */
  readonly enc: Buffer;
  readonly sharedSecret: Buffer;
}

/**
 * RFC 9180 §4.1 Encap. `ephemeral` is supplied only to reproduce a published
 * vector; sealing generates a fresh pair for every envelope and discards it
 * (§7.3: "Sealing uses no long-term key of the sender").
 */
export function encap(
  s: Ciphersuite,
  recipientPublic: KeyObject,
  ephemeral?: KeyPair,
): Encapsulation {
  const e = ephemeral ?? generateKeyPair();
  const enc = rawPublic(e.publicKey);
  const kemContext = Buffer.concat([enc, rawPublic(recipientPublic)]);
  return {
    enc,
    sharedSecret: extractAndExpand(s, dh(e.privateKey, recipientPublic), kemContext),
  };
}

/** RFC 9180 §4.1 Decap. */
export function decap(s: Ciphersuite, enc: Buffer, recipientPrivate: KeyObject): Buffer {
  const ephemeralPublic = publicFromRaw(enc);
  const recipientPublic = createPublicKey(recipientPrivate);
  const kemContext = Buffer.concat([enc, rawPublic(recipientPublic)]);
  return extractAndExpand(s, dh(recipientPrivate, ephemeralPublic), kemContext);
}

export interface KeySchedule {
  readonly keyScheduleContext: Buffer;
  readonly secret: Buffer;
  readonly key: Buffer;
  readonly baseNonce: Buffer;
  readonly exporterSecret: Buffer;
}

/**
 * RFC 9180 §5.1 KeySchedule at mode_base (0x00), where the PSK and its
 * identifier are both empty.
 */
export function keySchedule(s: Ciphersuite, sharedSecret: Buffer, info: Buffer): KeySchedule {
  const suiteId = hpkeSuiteId(s);
  const pskIdHash = labeledExtract(suiteId, EMPTY, 'psk_id_hash', EMPTY);
  const infoHash = labeledExtract(suiteId, EMPTY, 'info_hash', info);
  const keyScheduleContext = Buffer.concat([i2osp(0x00, 1), pskIdHash, infoHash]);
  const secret = labeledExtract(suiteId, sharedSecret, 'secret', EMPTY);
  return {
    keyScheduleContext,
    secret,
    key: labeledExpand(suiteId, secret, 'key', keyScheduleContext, s.nK),
    baseNonce: labeledExpand(suiteId, secret, 'base_nonce', keyScheduleContext, s.nN),
    exporterSecret: labeledExpand(suiteId, secret, 'exp', keyScheduleContext, s.nH),
  };
}

/**
 * RFC 9180 §5.2's nonce for a sequence number. WISHMail is single-shot, so the
 * sequence is always 0 and the nonce is always the base nonce — but the
 * computation is written out rather than assumed, because "the nonce is the
 * base nonce" is true of this specification and not of HPKE.
 */
export function nonceFor(baseNonce: Buffer, sequence: number): Buffer {
  const out = Buffer.from(baseNonce);
  const seq = i2osp(sequence, baseNonce.length);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = (out[i] ?? 0) ^ (seq[i] ?? 0);
  }
  return out;
}

function aeadSeal(s: Ciphersuite, key: Buffer, nonce: Buffer, aad: Buffer, pt: Buffer): Buffer {
  const cipher = createCipheriv(s.cipher, key, nonce, { authTagLength: 16 });
  cipher.setAAD(aad);
  return Buffer.concat([cipher.update(pt), cipher.final(), cipher.getAuthTag()]);
}

function aeadOpen(s: Ciphersuite, key: Buffer, nonce: Buffer, aad: Buffer, ct: Buffer): Buffer {
  if (ct.length < 16) throw new Error('open: ciphertext shorter than its authentication tag');
  const decipher = createDecipheriv(s.cipher, key, nonce, { authTagLength: 16 });
  decipher.setAAD(aad);
  decipher.setAuthTag(ct.subarray(ct.length - 16));
  return Buffer.concat([decipher.update(ct.subarray(0, ct.length - 16)), decipher.final()]);
}

export interface Sealed {
  readonly enc: Buffer;
  readonly ct: Buffer;
}

/**
 * RFC 9180 §6.1 SealBase, single-shot. `ephemeral` is supplied only to
 * reproduce a published vector.
 */
export function sealBase(
  s: Ciphersuite,
  recipientPublic: KeyObject,
  info: Buffer,
  aad: Buffer,
  plaintext: Buffer,
  ephemeral?: KeyPair,
): Sealed {
  const { enc, sharedSecret } = encap(s, recipientPublic, ephemeral);
  const ks = keySchedule(s, sharedSecret, info);
  return { enc, ct: aeadSeal(s, ks.key, nonceFor(ks.baseNonce, 0), aad, plaintext) };
}

/**
 * RFC 9180 §6.1 OpenBase, single-shot. Fails closed on any authentication
 * error, which is §7.3's requirement and P-1's.
 */
export function openBase(
  s: Ciphersuite,
  enc: Buffer,
  recipientPrivate: KeyObject,
  info: Buffer,
  aad: Buffer,
  ct: Buffer,
): Buffer {
  const ks = keySchedule(s, decap(s, enc, recipientPrivate), info);
  return aeadOpen(s, ks.key, nonceFor(ks.baseNonce, 0), aad, ct);
}

/** Constant-time equality, for comparing digests and tags. */
export function equalBytes(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}
