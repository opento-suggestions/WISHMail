/**
 * What the counter is, and how it refuses — the two things every module of it
 * needs and neither of them owns.
 *
 * `purchase.ts` sells and `carry.ts` pays; a provisioning purchase is both, so
 * each calls the other and neither can hold the type the other takes. This file
 * holds them so that the cycle does not exist rather than being tolerated.
 *
 * Conformance: T-P11-2, T-P13-3, T-P16-1.
 */
import type { Client } from '@hashgraph/sdk';
import type { Mirror } from '../ops/mirror.js';
import type { NetworkConstants } from '../ops/networks.js';
import type { Signer } from '../ops/identity.js';

/** §6.3's holder: an account, or a public key with no account yet (§4.6, P-16). */
export type Holder = { readonly account: string } | { readonly publicKey: string };

export interface CounterContext {
  readonly repoRoot: string;
  readonly ledgerTag: string;
  /**
   * The network's own constants — and the fee caps in them are load-bearing.
   *
   * The Correspondent builds each provisioning row with the cap `networks.ts`
   * records for that row, so the counter reads the SAME numbers when it decides
   * what fee a carried body may authorise. Two spellings of a cap would refuse a
   * body the agent had every reason to build.
   */
  readonly constants: NetworkConstants;
  readonly mirror: Mirror;
  /** The mirror's URL, for the read-only `Reader` a Verifier is handed (P-4). */
  readonly mirrorNodeUrl: string;
  readonly client: Client;
  readonly stateDir: string;
  /** The Postmaster's payer — §14.2: a purchase cannot be submitted without it. */
  readonly postmasterPayerId: string;
  readonly postmasterPayer: Signer;
  /** The treasury holds the unissued supply and must sign its own debit. */
  readonly treasuryId: string;
  readonly treasury: Signer;
  readonly stampToken: string;
  readonly priceTopic: string;
  /**
   * An ABSOLUTE ceiling on what a single carried body may authorise, in
   * tinybars (D-168) — the Postmaster’s payer’s own limit, over and above the per-row one.
   *
   * A body the counter signs names the maximum fee it authorises and the
   * Postmaster is the account it comes out of, so a ceiling is the only thing
   * standing between a published carry policy and an unbounded one. The
   * effective limit for a body is the LOWER of this and the cap the template
   * declares for that row.
   *
   * It defaults to the network’s own largest cap and not to something smaller,
   * and that is worth saying plainly: a fee-gated topic creation on testnet was
   * observed to fail at a 20 ℏ cap and to succeed at 100 ℏ, charged far less
   * (`networks.ts`, FETCHED 2026-09-08). So the counter authorises up to 100 ℏ
   * per doorbell and is charged what the network charges. An the Postmaster’s payer who has
   * measured the real cost can set `WISHMAIL_CARRY_MAX_HBAR` lower; one who sets
   * it too low will see the sale refused before anything is signed, which is the
   * failure that costs nothing.
   */
  readonly carryFeeCap: number;
}

/**
 * A refusal, carrying the `TOOL_REASON` §6 fixes.
 *
 * Every refusal in this directory happens before anything is submitted, and a
 * refusal leaves no mark (§3.5): no charge, no signature, and no durable row
 * for a quote nobody answered.
 */
export class CounterRefusal extends Error {
  readonly reason: string;
  constructor(reason: string, detail: string) {
    super(`${reason}: ${detail}`);
    this.name = 'CounterRefusal';
    this.reason = reason;
  }
}

/** A reference as a filename. Transaction ids carry `@` and `.`; the store's keys do not. */
export function safeKey(reference: string): string {
  return reference.replace(/[@.]/g, '-');
}
