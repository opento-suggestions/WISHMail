/**
 * The P-13 seam.
 *
 * A `Signer` is a public key and a signing closure. The `PrivateKey` it wraps
 * exists only inside that closure's scope and is never returned, logged,
 * stringified, or written to any record. Every other module in `ops/` takes a
 * `Signer` and therefore cannot leak key material even by accident: it is not
 * holding any.
 *
 * This is what makes "the provisioning path does not special-case its own
 * agent" (D-140) structural rather than a matter of care — when a customer
 * agent is provisioned, `sign` becomes a round-trip to that agent's process and
 * no caller changes.
 */
import { createPrivateKey, createPublicKey } from 'node:crypto';
import { PrivateKey, type PublicKey } from '@hashgraph/sdk';
import { b64u } from '../core/canonical.js';
import { rawPublic } from '../core/hpke.js';
import { generateRecipientKey, open as openSealed } from '../core/seal.js';
import { envHas, readSecret, upsertEnvValue } from './env.js';

export interface Signer {
  /** A role name for the record. Never a key. */
  readonly label: string;
  readonly publicKey: PublicKey;
  readonly sign: (message: Uint8Array) => Promise<Uint8Array>;
}

function wrap(label: string, key: PrivateKey): Signer {
  return {
    label,
    publicKey: key.publicKey,
    sign: (message) => Promise.resolve(key.sign(message)),
  };
}

/** Recover a signer whose DER-encoded key already sits in `.env`. */
export function fromEnv(label: string, varName: string): Signer {
  return wrap(label, PrivateKey.fromStringDer(readSecret(varName)));
}

/**
 * Generate an identity in this process. The private half never leaves this
 * closure. Used for throwaway probe identities, which outlive nothing and are
 * therefore never persisted at all.
 */
export function bornHere(label: string): Signer {
  return wrap(label, PrivateKey.generateED25519());
}

/** The raw hex of a signer's public half — safe to record, and what the mirror node returns. */
export function publicHex(s: Signer): string {
  return s.publicKey.toStringRaw();
}

/**
 * Recover the identity behind `<PREFIX>_DER_KEY`, or generate one and persist
 * it, and return only a Signer either way.
 *
 * The DER string is produced and handed to `upsertEnvValue` **inside this
 * module**: it is never returned to a caller, never printed, and never passed
 * through provisioning code. `upsertEnvValue` refuses to overwrite a non-blank
 * value, so a re-run can never orphan an entity whose key already exists.
 */
/**
 * `persist: false` is a plan: recover a key that exists, and invent an
 * ephemeral one only where none does, without writing it.
 *
 * The flag is here and not at the call site because the call site would then
 * have to ask whether `<PREFIX>_DER_KEY` exists, and P-13's gate is that no
 * third module names a key at all. The caller says what it is doing; this
 * module knows what that means for a key.
 */
export function persistentIdentity(
  label: string,
  prefix: 'TREASURY' | 'AGENT',
  { persist = true }: { readonly persist?: boolean } = {},
): { readonly signer: Signer; readonly origin: 'recovered' | 'generated' } {
  const varName = `${prefix}_DER_KEY`;
  if (envHas(varName)) return { signer: fromEnv(label, varName), origin: 'recovered' };
  const key = PrivateKey.generateED25519();
  // A dry run that invented AND PERSISTED a key would leave a secret behind for
  // a deployment it did not make; one that invented and did not persist can
  // still resolve every shape the plan prints.
  if (persist) upsertEnvValue(varName, key.toStringDer());
  return { signer: wrap(label, key), origin: 'generated' };
}

/**
 * The agent's ENCRYPTION identity — §7.3's X25519 key, the one an envelope is
 * sealed against, declared as `properties.wishmail.x25519Pub` (§9.2).
 *
 * It is the first key here that is not a Hedera key, and it gets the same seam
 * for the same reason: the private half exists only inside these closures and
 * no caller can hold it. §7.6 requires that an agent "MUST retain the private
 * key of every epoch it has ever published", so unlike a probe identity this
 * one is persisted, and `upsertEnvValue` refuses to overwrite a non-blank value
 * — losing it would make every envelope ever sealed against this epoch
 * unopenable.
 *
 * `open` is exposed rather than the key so that `inbox` can decrypt without any
 * module but this one ever holding the secret (P-13, T-P13-1, T-P13-2).
 */
export interface SealIdentity {
  readonly label: string;
  /** base64url, unpadded — the form §5.3 and the declaration schema fix. */
  readonly x25519Pub: string;
  /** §7.6's epoch. The first declaration is 1; rotation increments it. */
  readonly keyEpoch: number;
  /** §7.3's Open, under this epoch's key. Fails closed. */
  readonly open: (ephemeralPub: string, aad: Buffer, ciphertext: Buffer) => Buffer;
}

export function sealIdentity(
  label: string,
  prefix: 'AGENT',
  { keyEpoch = 1, persist = true }: { readonly keyEpoch?: number; readonly persist?: boolean } = {},
): { readonly identity: SealIdentity; readonly origin: 'recovered' | 'generated' } {
  const varName = `${prefix}_X25519_DER_KEY`;
  let der: string;
  let origin: 'recovered' | 'generated';
  if (envHas(varName)) {
    der = readSecret(varName);
    origin = 'recovered';
  } else {
    const born = generateRecipientKey();
    der = born.keyPair.privateKey.export({ type: 'pkcs8', format: 'der' }).toString('hex');
    if (persist) upsertEnvValue(varName, der);
    origin = 'generated';
  }
  // Reconstructed here and closed over; the KeyObject does not leave this scope.
  const privateKey = createPrivateKey({ key: Buffer.from(der, 'hex'), format: 'der', type: 'pkcs8' });
  const x25519Pub = b64u(rawPublic(createPublicKey(privateKey)));
  return {
    identity: {
      label,
      x25519Pub,
      keyEpoch,
      open: (ephemeralPub, aad, ciphertext) => openSealed(ephemeralPub, privateKey, aad, ciphertext),
    },
    origin,
  };
}
