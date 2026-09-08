/**
 * The intent journal.
 *
 * The plan specified this and it was not built, and the first Step 2 run hit
 * exactly the case it exists for: `$POSTAGE` reached consensus, the readback
 * hung, and the record was never written for an entity that exists. Without a
 * journal a re-run would have created a second token — permanently, since the
 * token has no admin key.
 *
 * The mechanism: a transaction's id is **pinned before it is submitted**, and
 * written here with an fsync'd rename. A run that dies anywhere between
 * consensus and the record write therefore leaves behind the one handle that
 * can find what it made. On the next run, `resolve` reads that transaction from
 * the mirror node and has no ambiguous branch:
 *
 *   found, SUCCESS      → adopt the entity it names; nothing is created twice
 *   found, any other    → it failed at consensus; clear, and create normally
 *   absent, past window → a Hedera transaction is valid only for its valid
 *                         duration (120s here, network cap 180s). Past that it
 *                         can never reach consensus, so this is definitively
 *                         "never executed": clear, and create normally.
 *   absent, in window   → poll. Never guess.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Mirror } from './mirror.js';
import { toMirrorTxId } from './mirror.js';
import type { EntityKey } from './record.js';

/** The network's ceiling on a transaction's valid duration. */
export const VALID_WINDOW_SECONDS = 180;

export interface PendingEntry {
  readonly stepKey: EntityKey;
  readonly builtBy: string;
  readonly transactionId: string;
  readonly validStartEpochSeconds: number;
  readonly submittedAt: string;
}

export interface Adoption {
  readonly entityId: string | null;
  readonly transactionId: string;
  readonly consensusTimestamp: string;
}

export type Resolution =
  | { readonly kind: 'none' }
  | ({ readonly kind: 'adopt'; readonly stepKey: EntityKey } & Adoption)
  | { readonly kind: 'failed'; readonly stepKey: EntityKey; readonly status: string }
  | { readonly kind: 'expired'; readonly stepKey: EntityKey }
  | { readonly kind: 'unresolved'; readonly stepKey: EntityKey; readonly transactionId: string };

let file = '';
/** The step whose transaction is about to be submitted, if any. */
let armedStep: { key: EntityKey; builtBy: string } | null = null;

export function open(repoRoot: string): void {
  file = path.join(repoRoot, 'app', 'deployment', 'hedera-testnet.pending.json');
}

/** Arm before a create, disarm after the record is written. */
export function arm(key: EntityKey, builtBy: string): void {
  armedStep = { key, builtBy };
}

export function disarm(): void {
  armedStep = null;
  clear();
}

/**
 * Called by `hedera.submit` once the transaction id is pinned and before the
 * transaction is executed. Writes through a temp file and a rename, so the
 * journal is never observed half-written.
 */
export function pin(transactionId: string, validStartEpochSeconds: number): void {
  if (!armedStep || !file) return;
  const entry: PendingEntry = {
    stepKey: armedStep.key,
    builtBy: armedStep.builtBy,
    transactionId,
    validStartEpochSeconds,
    submittedAt: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(entry, null, 2) + '\n');
  fs.renameSync(tmp, file);
}

export function pending(): PendingEntry | null {
  if (!file || !fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8')) as PendingEntry;
}

export function clear(): void {
  if (file && fs.existsSync(file)) fs.rmSync(file);
}

interface MTx { transactions?: { result: string; consensus_timestamp: string; entity_id?: string | null }[] }

export async function resolve(mirror: Mirror): Promise<Resolution> {
  const p = pending();
  if (!p) return { kind: 'none' };

  const read = async (): Promise<MTx['transactions'] extends (infer T)[] | undefined ? T | null : never> => {
    const r = await mirror.get<MTx>(`/transactions/${toMirrorTxId(p.transactionId)}`);
    return (r?.transactions?.[0] ?? null) as never;
  };

  let tx = await read().catch(() => null);
  if (!tx) {
    const ageSeconds = Date.now() / 1000 - p.validStartEpochSeconds;
    if (ageSeconds > VALID_WINDOW_SECONDS) {
      clear();
      return { kind: 'expired', stepKey: p.stepKey };
    }
    // Inside the window it may still reach consensus. Wait it out rather than guess.
    const waitMs = Math.ceil((VALID_WINDOW_SECONDS - ageSeconds) * 1000);
    const deadline = Date.now() + waitMs;
    while (!tx && Date.now() < deadline) {
      await new Promise((res) => setTimeout(res, 3000));
      tx = await read().catch(() => null);
    }
    if (!tx) {
      clear();
      return { kind: 'expired', stepKey: p.stepKey };
    }
  }

  if (tx.result !== 'SUCCESS') {
    clear();
    return { kind: 'failed', stepKey: p.stepKey, status: tx.result };
  }
  return {
    kind: 'adopt',
    stepKey: p.stepKey,
    entityId: tx.entity_id ?? null,
    transactionId: p.transactionId,
    consensusTimestamp: tx.consensus_timestamp,
  };
}
