/**
 * The provisioning step contract, and the runner.
 *
 * Two questions, two authorities, and conflating them is the bug this design
 * exists to prevent:
 *
 *   should I create this?  →  the record alone (key present or absent)
 *   is what exists correct? →  the mirror node alone, never an SDK receipt
 *
 * `want()` is pure and network-free, so the same function serves the create
 * path and the confirm path — which is why a second run cannot drift from the
 * first. There is no third description of an entity anywhere, and the declared
 * `Want` is what lands in the record's `policy`, satisfying T-P17-1's "the
 * policy is recorded at creation" by construction rather than by a comment.
 */
import type { Client } from '@hashgraph/sdk';
import type { Env } from './env.js';
import type { Signer } from './identity.js';
import type { Mirror } from './mirror.js';
import type { EntityKey, EntityKind, Record_ } from './record.js';
import type { Submitted } from './hedera.js';

/* ------------------------------------------------------------------ */
/* Named predicates. The probe's second bug was a poll whose predicate  */
/* was `() => true`, which accepts a pre-update answer. Every readback   */
/* now names what it is waiting for, and the name goes into the report. */
/* ------------------------------------------------------------------ */

export interface Predicate<T> {
  readonly name: string;
  readonly test: (v: T) => boolean;
}

export const named = <T>(name: string, test: (v: T) => boolean): Predicate<T> => ({ name, test });

/* ------------------------------------------------------------------ */
/* Mirror numerics. `decimals`, `initial_supply` and `total_supply` come */
/* back as JSON strings (FETCHED 2026-09-08, ledger §H), so `=== 0`      */
/* fails silently. Compare as BigInt, and never as Number.               */
/* ------------------------------------------------------------------ */

export function sameNumber(got: unknown, want: bigint | number): boolean {
  if (got === null || got === undefined) return false;
  try {
    return BigInt(String(got)) === BigInt(want);
  } catch {
    return false;
  }
}

export interface Discrepancy {
  readonly field: string;
  readonly want: string;
  readonly got: string;
}

/** Collects field-by-field disagreements between the declared Want and consensus. */
export class Checks {
  private readonly out: Discrepancy[] = [];

  eq(field: string, got: unknown, want: unknown): void {
    if (got !== want) this.out.push({ field, want: String(want), got: JSON.stringify(got) ?? 'undefined' });
  }

  num(field: string, got: unknown, want: bigint | number): void {
    if (!sameNumber(got, want)) this.out.push({ field, want: String(want), got: JSON.stringify(got) ?? 'undefined' });
  }

  isNull(field: string, got: unknown): void {
    if (got !== null && got !== undefined) this.out.push({ field, want: 'null', got: JSON.stringify(got) });
  }

  keyIs(field: string, got: { key?: string } | null | undefined, wantRawHex: string): void {
    if (got?.key !== wantRawHex) {
      this.out.push({ field, want: wantRawHex, got: got?.key ?? JSON.stringify(got) ?? 'null' });
    }
  }

  get result(): Discrepancy[] {
    return this.out;
  }
}

/* ------------------------------------------------------------------ */

export interface Ctx {
  readonly env: Env;
  readonly client: Client;
  readonly mirror: Mirror;
  readonly record: Record_;
  readonly operator: Signer;
  readonly treasury: Signer;
  readonly agent: Signer;
  readonly treasuryId: () => string;
  readonly agentId: () => string;
  readonly tokenId: () => string;
  readonly flags: { readonly dryRun: boolean; readonly repin: boolean };
}

export type Outcome = 'created' | 'existing' | 'planned' | 'diverged' | 'absent' | 'stopped';

export interface Step<Want> {
  readonly key: EntityKey;
  readonly kind: EntityKind;
  readonly role: string;
  readonly builtBy: string;
  readonly needs: readonly EntityKey[];
  /** Pure. No network. The declared shape, and what lands in the record. */
  want(ctx: Ctx): Want;
  /** Mirror-node readback with a NAMED predicate. Empty array = correct. */
  confirm(ctx: Ctx, id: string | null, want: Want): Promise<Discrepancy[] | 'absent'>;
  create(ctx: Ctx, want: Want): Promise<Submitted & { readonly signedBy: readonly string[] }>;
  /** One line for the table, rendering the declared policy. */
  detail(want: Want): string;
}

export interface Row {
  readonly n: number;
  readonly key: EntityKey;
  readonly id: string | null;
  readonly outcome: Outcome;
  readonly detail: string;
  readonly note?: string;
}

export interface StopReport {
  readonly step: EntityKey;
  readonly reason: string;
  readonly discrepancies?: readonly Discrepancy[];
}

export interface RunResult {
  readonly rows: readonly Row[];
  readonly stop?: StopReport;
  readonly created: number;
}
