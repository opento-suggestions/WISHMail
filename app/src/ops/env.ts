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
import { networkConstants, type NetworkConstants } from './networks.js';

/**
 * What `.env` is allowed to hold (Sonic, 2026-09-08): secrets, the network
 * selector, and runtime locations. Never a copy of a value whose home is
 * `app/src/ops/networks.ts`, `spec/pins.json`, or the ops record — so there is
 * no entity id in this interface, and none in `.env`.
 */
export interface Env {
  /** An input to provisioning, not a product of it: the one account we did not create (D-140). */
  readonly postmasterPayerId: string;
  readonly network: string;
  readonly constants: NetworkConstants;
  readonly mirrorNodeUrl: string;
  /** The §14.2 durable record. D-109, T-P11-5, T-P11-6: the 402 state survives a restart. */
  readonly stateDir: string;
  readonly mcpBind: string;
  readonly mcpPort: number | null;
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
  const network = process.env.HEDERA_NETWORK?.trim() || 'testnet';
  // networkConstants refuses a network §15.5 leaves undeployed, rather than
  // half-provisioning it.
  const constants = networkConstants(network);
  const port = process.env.MCP_PORT?.trim();
  return {
    postmasterPayerId: required('POSTMASTER_PAYER_ID'),
    network,
    constants,
    // The table is the default; the variable is an override for pointing at a
    // different mirror node, which is a read interface and never a broker (P-4).
    mirrorNodeUrl: process.env.MIRROR_NODE_URL?.trim() || constants.mirrorNodeUrl,
    stateDir: process.env.WISHMAIL_STATE_DIR?.trim() || path.join(root, '.wishmail-state'),
    mcpBind: process.env.MCP_BIND?.trim() || '127.0.0.1',
    mcpPort: port ? Number(port) : null,
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
