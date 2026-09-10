/**
 * The Correspondent's keys — born once, in this process, and never anywhere else.
 *
 * This is the P-13 seam on the agent's side, and it is the same seam
 * `src/ops/identity.ts` is on the Postmaster's: a `Signer` is a public key and a
 * signing closure, the `PrivateKey` exists only inside that closure's scope, and
 * every other module in `app/sdk/` takes a `Signer` and therefore cannot leak
 * key material even by accident — it is not holding any.
 *
 * THIS MODULE IS THE ONLY READER of the keystore file and of the operator's
 * payer key. `npm run p13:check` is what holds that: it greps `app/sdk` for the
 * names key material travels under and fails if any other module knows one.
 *
 * KEYS ARE BORN ONCE (D-165). "Keys are born once, on first run, into the
 * keystore; every later boot loads them. A process that regenerated on boot
 * would make every restart a new agent." Two things follow, and both are
 * enforced here rather than remembered:
 *
 *   - `born()` refuses to overwrite an existing keystore. An agent whose account
 *     key changed would be locked out of every topic it owns, and an agent whose
 *     X25519 key changed could not open a single envelope ever sealed to it.
 *   - every epoch's X25519 key is RETAINED, never replaced. §7.6: "an agent MUST
 *     retain the private key of every epoch it has ever published". Rotation is
 *     out of this window (CLAUDE.md §11) and nothing here may make it harder, so
 *     the keystore holds a MAP of epochs from the first run and not one key.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createPrivateKey, createPublicKey, type KeyObject } from 'node:crypto';
import { PrivateKey } from '@hashgraph/sdk';
import { b64u } from '../src/core/canonical.js';
import { rawPublic } from '../src/core/hpke.js';
import { generateRecipientKey, open as openSealed } from '../src/core/seal.js';
import type { Signer } from '../src/ops/identity.js';
import type { SealIdentity } from '../src/ops/identity.js';
import type { Home } from './home.js';

/**
 * The keystore's on-disk shape. Only this module reads it, and it is written
 * exactly once per key: the file is created on first run and appended to only
 * when a new epoch is published.
 */
interface KeystoreFile {
  readonly _readme: string;
  /** The version of this file's own shape, so a later reader knows what it has. */
  readonly v: 1;
  /** The agent's Hedera account key, DER. Born on first run. */
  readonly account: string;
  /** Every §7.6 epoch, by number, PKCS#8 DER hex. Retained forever; never replaced. */
  readonly epochs: Record<string, string>;
  readonly bornAt: string;
}

const KEYSTORE_README =
  'THE AGENT’S PRIVATE KEYS. This file IS the agent: a fresh home is a new agent and an existing home is ' +
  'a returning one (D-165). Never copy it, never send it, and never accept one from anybody — including a ' +
  'Postmaster, which holds no key of yours, ever (P-13). Every X25519 epoch is retained because §7.6 ' +
  'requires it: deleting one makes every envelope ever sealed under it permanently unopenable.';

function wrap(label: string, key: PrivateKey): Signer {
  return { label, publicKey: key.publicKey, sign: (message) => Promise.resolve(key.sign(message)) };
}

function read(home: Home): KeystoreFile | null {
  if (!fs.existsSync(home.keystorePath)) return null;
  return JSON.parse(fs.readFileSync(home.keystorePath, 'utf8')) as KeystoreFile;
}

function write(home: Home, file: KeystoreFile): void {
  const tmp = home.keystorePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(file, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, home.keystorePath);
}

/**
 * Bring the agent's keys into existence, or load the ones that already are.
 *
 * Returns which happened, because the caller has to say so: a run that reports
 * "generated" on an agent that already had coordinates is a run that is about to
 * provision a second one.
 */
export function ensureKeys(home: Home): 'born' | 'loaded' {
  if (read(home) !== null) return 'loaded';
  const account = PrivateKey.generateED25519();
  const epoch1 = generateRecipientKey();
  write(home, {
    _readme: KEYSTORE_README,
    v: 1,
    account: account.toStringDer(),
    epochs: { '1': epoch1.keyPair.privateKey.export({ type: 'pkcs8', format: 'der' }).toString('hex') },
    bornAt: new Date().toISOString(),
  });
  return 'born';
}

function require_(home: Home): KeystoreFile {
  const f = read(home);
  if (f === null) throw new Error(`no keystore at ${home.keystorePath} — call ensureKeys() first (D-165: keys are born once)`);
  return f;
}

/** The agent's own signer. What signs every topic it owns and every message it sends. */
export function agentSigner(home: Home): Signer {
  return wrap('agent', PrivateKey.fromStringDer(require_(home).account));
}

/**
 * The OPERATOR's signer — the payer half of the seam (CLAUDE.md §11).
 *
 * It is a different party from the agent and is named as one: "the agent signs;
 * the operator pays" (§3.5). It is read here rather than in `home.ts` for the
 * same reason `ops/env.ts` hands `POSTMASTER_PAYER_DER_KEY` to `ops/identity.ts` and no
 * further — the value exists in one module and leaves it only as a closure.
 */
export function payerSigner(home: Home): Signer {
  const config = JSON.parse(fs.readFileSync(home.configPath, 'utf8')) as Record<string, unknown>;
  const payer = config['payer'] as Record<string, string>;
  return wrap('payer', PrivateKey.fromStringDer(payer[PAYER_KEY_FIELD] as string));
}

/**
 * The one field name the operator's private key travels under, and the only
 * module that knows it. `home.ts` asks this module whether the key is there
 * rather than looking, so that no second module names it — the same discipline
 * `ops/env.ts` and `ops/identity.ts` keep on the Postmaster's side, and what
 * `npm run p13:check` enforces on both.
 */
const PAYER_KEY_FIELD = 'derKey';

/**
 * Put an operator's key into a config object.
 *
 * Here for the same reason `payerKeyPresent` is: a caller that assembles a
 * config — the check that builds a throwaway home, or a future `init` — would
 * otherwise have to spell the field, and then the gate's allowed list would
 * grow by one module every time. It takes the key and returns nothing.
 */
export function withPayerKey(config: Record<string, unknown>, der: string): Record<string, unknown> {
  const payer = { ...((config['payer'] as Record<string, unknown> | undefined) ?? {}) };
  payer[PAYER_KEY_FIELD] = der;
  return { ...config, payer };
}

/**
 * A payer wallet BORN IN THIS PROCESS, and installed into a home without
 * anyone else holding it.
 *
 * Written for the demo-operator funding run, which has to create two testnet
 * accounts and put each account’s own key into that Correspondent’s config.
 * The obvious shape — generate a key, hand the DER string to the caller, let
 * the caller write the file — would put private-key material in a third
 * module and make the gate’s allowed list grow by one. So the key never
 * leaves this closure: the caller gets a `Signer` to create the account with
 * and an `install` to write the config once the account id is known, and it
 * cannot print, log or persist what it does not have.
 *
 * This is `ops/identity.ts`’s discipline for the Postmaster’s side, extended
 * to a wallet that has to be persisted rather than merely used (P-13,
 * T-P13-1). It is a payer’s key and never an agent’s: an agent’s keys are born
 * by `ensureKeys` on that agent’s first run, in that agent’s own process, and
 * nothing may hand one to anybody (§3.3).
 */
export interface BornWallet {
  readonly signer: Signer;
  /**
   * Write `<dir>/config.json` from a template object, with this wallet in it.
   *
   * Refuses to overwrite an existing config: a home is an agent (D-165), and a
   * config written over a home whose keystore already exists would give a
   * living agent a payer it never had — or, worse, be read as a second agent.
   */
  readonly install: (dir: string, template: Record<string, unknown>, accountId: string) => string;
}

export function bornPayerWallet(): BornWallet {
  const key = PrivateKey.generateED25519();
  return {
    signer: wrap('payer (born here)', key),
    install: (dir, template, accountId) => {
      const configPath = path.join(dir, 'config.json');
      if (fs.existsSync(configPath)) {
        throw new Error(`${configPath} already exists; a home is an agent and this run does not overwrite one (D-165)`);
      }
      fs.mkdirSync(dir, { recursive: true });
      const payer = { ...((template['payer'] as Record<string, unknown> | undefined) ?? {}), accountId };
      const config = withPayerKey({ ...template, payer }, key.toStringDer());
      const tmp = configPath + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
      fs.renameSync(tmp, configPath);
      return configPath;
    },
  };
}

/** Whether a parsed config carries the operator's key. Returns a boolean, never the key. */
export function payerKeyPresent(config: Record<string, unknown>): boolean {
  const payer = config['payer'] as Record<string, unknown> | undefined;
  const v = payer?.[PAYER_KEY_FIELD];
  return typeof v === 'string' && v.trim() !== '';
}

/** The agent's public key, raw hex — safe to record, and what the mirror node returns. */
export function agentPublicHex(home: Home): string {
  return agentSigner(home).publicKey.toStringRaw();
}

/**
 * The agent's DER-encoded PUBLIC half, which is what `buy_stamp`'s `holder`
 * carries when the purchase is to create the account (§4.6, HIP-542).
 */
export function agentPublicDer(home: Home): string {
  return agentSigner(home).publicKey.toStringDer();
}

/** The highest epoch in the keystore — the one a declaration publishes (§7.6). */
export function currentEpoch(home: Home): number {
  return Math.max(...Object.keys(require_(home).epochs).map((k) => Number(k)));
}

/**
 * §7.3's encryption identity at one epoch, as a public half and an `open`.
 *
 * The private key is reconstructed inside this function and closed over; the
 * `KeyObject` does not leave this scope, so `inbox` decrypts without any module
 * but this one ever holding the secret (P-13, T-P13-1, T-P13-2).
 */
/**
 * Every retained epoch's private key, for `inbox` to decrypt with (§7.6, L-1).
 *
 * §6.5's precondition is that "the caller holds the decryption keys for the
 * epochs of the envelopes it will open", and `InboxContext.keys` is typed as a
 * map of them — so the tool needs the KeyObjects and this is the module that
 * has them. It stays here, beside the file it reads, rather than being handed
 * out as DER for somebody else to reconstruct: `p13:check` permits the field
 * name `derKey` in this module and no other, and every epoch is retained
 * because deleting one makes every envelope sealed under it unopenable forever.
 */
export function epochKeys(home: Home): ReadonlyMap<number, KeyObject> {
  const epochs = require_(home).epochs;
  return new Map(
    Object.entries(epochs).map(([epoch, der]) => [
      Number(epoch),
      createPrivateKey({ key: Buffer.from(der, 'hex'), format: 'der', type: 'pkcs8' }),
    ]),
  );
}

export function agentSeal(home: Home, keyEpoch = currentEpoch(home)): SealIdentity {
  const der = require_(home).epochs[String(keyEpoch)];
  if (der === undefined) {
    throw new Error(`the keystore holds no key for epoch ${keyEpoch} — §7.6 requires every published epoch to be retained`);
  }
  const privateKey = createPrivateKey({ key: Buffer.from(der, 'hex'), format: 'der', type: 'pkcs8' });
  return {
    label: 'agent-seal',
    x25519Pub: b64u(rawPublic(createPublicKey(privateKey))),
    keyEpoch,
    open: (ephemeralPub, aad, ciphertext) => openSealed(ephemeralPub, privateKey, aad, ciphertext),
  };
}
