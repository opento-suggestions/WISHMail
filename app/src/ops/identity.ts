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
import { PrivateKey, type PublicKey } from '@hashgraph/sdk';
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
export function persistentIdentity(
  label: string,
  prefix: 'TREASURY' | 'AGENT',
): { readonly signer: Signer; readonly origin: 'recovered' | 'generated' } {
  const varName = `${prefix}_DER_KEY`;
  if (envHas(varName)) return { signer: fromEnv(label, varName), origin: 'recovered' };
  const key = PrivateKey.generateED25519();
  upsertEnvValue(varName, key.toStringDer());
  return { signer: wrap(label, key), origin: 'generated' };
}
