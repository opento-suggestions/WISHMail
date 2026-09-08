/**
 * Typed access to the repository's `.env`, anchored at the repo root rather than
 * at the working directory: `npm run` executes with cwd `app/`, and dotenv's own
 * lookup would find nothing there and give an empty environment silently.
 *
 * This module and `identity.ts` are the only two that may touch key material
 * (`app/OPERATIONS.md`, P-13). Nothing here prints a secret.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

export interface Env {
  readonly operatorId: string;
  readonly network: 'testnet';
  readonly mirrorNodeUrl: string;
  readonly repoRoot: string;
}

/** `app/src/ops/env.ts` → repo root, verified by the root package.json's name. */
export function repoRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(here, '..', '..', '..');
  const pkg = path.join(root, 'package.json');
  const parsed = JSON.parse(fs.readFileSync(pkg, 'utf8')) as { name?: string };
  if (parsed.name !== 'wishmail') {
    throw new Error(`repo root not found: ${pkg} has name "${parsed.name}", expected "wishmail"`);
  }
  return root;
}

let loaded = false;

function ensureLoaded(): string {
  const root = repoRoot();
  if (!loaded) {
    config({ path: path.join(root, '.env'), quiet: true });
    loaded = true;
  }
  return root;
}

function required(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`.env is missing ${name}. See .env.example.`);
  return v;
}

export function loadEnv(): Env {
  const root = ensureLoaded();
  const network = (process.env.HEDERA_NETWORK?.trim() || 'testnet') as Env['network'];
  if (network !== 'testnet') {
    // §15.5: hedera:mainnet is defined and undeployed at this version.
    throw new Error(`HEDERA_NETWORK is "${network}"; this version deploys on testnet only (§15.5)`);
  }
  return {
    operatorId: required('OPERATOR_ID'),
    network,
    mirrorNodeUrl:
      process.env.MIRROR_NODE_URL?.trim() || 'https://testnet.mirrornode.hedera.com/api/v1',
    repoRoot: root,
  };
}

/**
 * The one reader of private-key material. Only `identity.ts` calls it, and what
 * it returns goes straight into a signing closure and is never returned onward.
 */
export function readSecret(name: string): string {
  ensureLoaded();
  return required(name);
}

/**
 * Write a value into the git-ignored root `.env`, preserving comments and order.
 * The only writer of key material anywhere in this project (D-149's successor
 * rule: nothing prints a key; generated keys go straight to `.env`).
 *
 * Refuses to overwrite a non-blank value: a provisioning re-run must never
 * silently replace the key that owns an entity already on consensus.
 */
export function upsertEnvValue(name: string, value: string): 'written' | 'kept' {
  const file = path.join(ensureLoaded(), '.env');
  const raw = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const lines = raw.split(/\r?\n/);
  const i = lines.findIndex((l) => l.startsWith(`${name}=`));
  if (i >= 0) {
    const existing = lines[i]!.slice(name.length + 1).trim();
    if (existing) return 'kept';
    lines[i] = `${name}=${value}`;
  } else {
    if (lines.length && lines[lines.length - 1] === '') lines.pop();
    lines.push(`${name}=${value}`, '');
  }
  fs.writeFileSync(file, lines.join(eol));
  process.env[name] = value;
  return 'written';
}

/** True when `.env` carries a non-blank value for `name`. */
export function envHas(name: string): boolean {
  ensureLoaded();
  return Boolean(process.env[name]?.trim());
}
