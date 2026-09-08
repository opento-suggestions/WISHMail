/**
 * RFC 8785 canonical JSON, and the one hashing rule.
 *
 * §5.1: "Every hash in this document is SHA-256, written as lowercase hex,
 * computed over the canonical JSON (RFC 8785) of an object with the hash field
 * itself absent. There is no other hashing rule."
 *
 * These two functions were inline in `src/ops/steps.ts`, where the price list
 * needed them. They are here because the AAD needs the same bytes and the same
 * digest, and one canonicalization is the point: §7.2's SHA-256 over these
 * bytes is the envelope identifier, and two implementations that canonicalize
 * differently produce identifiers neither can reproduce.
 */
import { createHash } from 'node:crypto';
import canonicalize from 'canonicalize';

/** The RFC 8785 canonical form of a value, as UTF-8 bytes. */
export function canonicalBytes(value: unknown): Buffer {
  const s = canonicalize(value);
  if (s === undefined) throw new Error('canonicalize returned undefined');
  return Buffer.from(s, 'utf8');
}

/** SHA-256, lowercase hex. */
export function sha256hex(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * §5.1's hashing rule: SHA-256 over the canonical JSON of an object, lowercase
 * hex. Where the object carries its own hash field, that field is absent from
 * what is hashed — pass `omit` to name it.
 */
export function canonicalDigest(value: Record<string, unknown>, omit?: string): string {
  if (omit === undefined) return sha256hex(canonicalBytes(value));
  const { [omit]: _dropped, ...rest } = value;
  return sha256hex(canonicalBytes(rest));
}

/** base64url without padding (RFC 4648 §5), the encoding §5.1 fixes for binary. */
export function b64u(bytes: Buffer): string {
  return bytes.toString('base64url');
}

/** The inverse of `b64u`. */
export function unb64u(s: string): Buffer {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error('not unpadded base64url');
  return Buffer.from(s, 'base64url');
}
