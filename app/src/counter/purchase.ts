/**
 * `buy_stamp` at the counter — §6.3's body, and §14.2's exchange.
 *
 * TWO ROUND TRIPS, ONE PURCHASE. §14.2 makes the resource server the party that
 * "issued and must recognize" the requirements a payment answers, and T-P13-3
 * fixes the two halves of the rule: the Postmaster MUST NOT submit a purchase
 * transaction without the buyer's signature, and MUST NOT accept a body it did
 * not build. So a purchase is a quote and then a settlement:
 *
 *   1. the buyer calls `buy_stamp` with no signature. The counter reads the
 *      price message current on consensus, builds ONE `TransferTransaction`
 *      with every leg in it, freezes it, and returns the body with a reference.
 *      Nothing has been signed and nothing charged.
 *   2. the buyer signs the frozen body IN ITS OWN PROCESS and calls again with
 *      the reference and its signature. The counter reconstitutes the body IT
 *      built, adds the signature, adds the treasury's and its own, submits, and
 *      reads the result back from a mirror node.
 *
 * WHY THE BUYER RETURNS A SIGNATURE AND NOT A TRANSACTION. Returning a whole
 * signed transaction would make "never accept a body it did not build" a
 * comparison the counter has to remember to run correctly. Returning only the
 * signature makes it structural: the body is the one the counter froze and
 * stored, and a signature that does not verify against it simply fails at the
 * network. There is no second body anywhere for the check to be wrong about.
 *
 * THE THREE LEGS, ONE TRANSACTION (D-159 as amended). A provisioning purchase
 * is atomic: ℏ from the buyer to the Postmaster for the price, `$POSTAGE` from
 * the treasury to the holder's public-key alias — which is what CREATES the
 * account (HIP-542, probe-observed 2026-09-09: a child `CRYPTOCREATEACCOUNT`,
 * unlimited auto-associations, the creation fee to the payer) — and the
 * registration fee in ℏ from the Postmaster to that same alias. The account is
 * bought, not funded, and is born holding stamps and exactly one fee. Either
 * all three land or none does, which is what makes the receipt's `registrationFee`
 * a leg of the purchase and not a gift (§4.6, T-P13-4).
 *
 * A REFUSAL LEAVES NO MARK (§3.5). Every refusal below happens before anything
 * is submitted, and the durable row for a quote nobody answered is dropped
 * rather than settled.
 *
 * Conformance: T-P11-2, T-P11-4, T-P11-5, T-P11-6, T-P13-3, T-P16-1.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  AccountId,
  Hbar,
  PublicKey,
  Transaction,
  TransferTransaction,
} from '@hashgraph/sdk';
import { submit } from '../ops/hedera.js';
import { Mirror, fromMirrorTxId, toMirrorTxId } from '../ops/mirror.js';
import { open as openStore } from '../state/store.js';
import { schemas } from '../schema/loader.js';
import { currentPriceList, quote, scaled, type Quote } from './pricing.js';
import type { Client } from '@hashgraph/sdk';
import type { Signer } from '../ops/identity.js';

/** §6.3's holder: an account, or a public key with no account yet (§4.6, P-16). */
export type Holder = { readonly account: string } | { readonly publicKey: string };

export interface CounterContext {
  readonly repoRoot: string;
  readonly ledgerTag: string;
  readonly mirror: Mirror;
  /** The mirror's URL, for the read-only `Reader` a Verifier is handed (P-4). */
  readonly mirrorNodeUrl: string;
  readonly client: Client;
  readonly stateDir: string;
  /** The Postmaster's payer — §14.2: a purchase cannot be submitted without it. */
  readonly operatorId: string;
  readonly operator: Signer;
  /** The treasury holds the unissued supply and must sign its own debit. */
  readonly treasuryId: string;
  readonly treasury: Signer;
  readonly stampToken: string;
  readonly priceTopic: string;
}

/** §6.3's call, as the counter receives it. */
export interface PurchaseRequest {
  readonly count: number;
  readonly method: string;
  readonly holder: Holder;
  readonly provision: boolean;
  /**
   * The account the price is debited from.
   *
   * §6.3 gives `buy_stamp(count, payment, holder, provision)` and does not name
   * a buyer, because in the ordinary case the holder IS the buyer. It cannot be
   * in the provisioned case: the holder is a bare public key and the account
   * that would pay is the one this purchase is about to create. So the buyer is
   * named, and in this window it is the Correspondent's OPERATOR — the same
   * relation §3.5 fixes everywhere else. Absent, the holder pays for itself.
   */
  readonly buyer?: string;
}

/** What the counter hands back when it has quoted and nothing is signed. */
export interface Requirement {
  readonly reference: string;
  /** The frozen transaction body, base64. The buyer signs THESE bytes. */
  readonly body: string;
  readonly quote: Quote;
  readonly count: number;
  readonly holder: Holder;
  readonly provision: boolean;
  /** ISO 8601. §14.2: the quote stands for the transaction's valid duration. */
  readonly expiresAt: string;
}

/** §5.4's StampReceipt, as this counter fills it. */
export interface StampReceipt {
  readonly ledgerTag: string;
  readonly tokenId: string;
  readonly amount: number;
  readonly txRef: string;
  readonly price: { readonly amount: string; readonly currency: string };
  readonly rate?: { readonly source: string; readonly pair: string; readonly value: string; readonly at: string };
  readonly holder: string;
  readonly provisioning?: Record<string, unknown>;
}

export class CounterRefusal extends Error {
  readonly reason: string;
  constructor(reason: string, detail: string) {
    super(`${reason}: ${detail}`);
    this.name = 'CounterRefusal';
    this.reason = reason;
  }
}

/**
 * §G-19's gate, read from the registered schema itself rather than restated.
 *
 * §5.4 makes `doorbell` and `manifestTopic` REQUIRED inside `provisioning`, and
 * §6.3 makes the line present "exactly when `provision` was true". Under D-159
 * as amended the Postmaster creates neither: the purchase creates the ACCOUNT
 * and funds the registration fee, and the agent creates its own six topics
 * afterwards, under its own key, through `generate_mailbox`. So a `provision:
 * true` purchase cannot produce a receipt that validates, and a receipt that
 * omitted the line would contradict §6.3's postcondition. Both branches
 * contradict a sentence, which is a specification defect and not a coding
 * problem (CLAUDE.md §5).
 *
 * This function is the refusal, and it refuses BEFORE anything is signed —
 * which is the whole value of running the reader on the writer's output before
 * that output is published (CLAUDE.md §9). It reads the required list out of
 * `spec/schemas/stamp-receipt.schema.json`, so when §G-19 is ruled and the
 * schema moves at 0.6, the refusal lifts by itself and no second place has to
 * be remembered.
 */
export function provisioningFieldsThisCounterCannotFill(repoRoot: string): readonly string[] {
  const file = path.join(repoRoot, 'spec', 'schemas', 'stamp-receipt.schema.json');
  const schema = JSON.parse(fs.readFileSync(file, 'utf8')) as {
    properties?: { provisioning?: { required?: readonly string[] } };
  };
  const required = schema.properties?.provisioning?.required ?? [];
  // What a purchase under D-159 as amended CAN name: the price it charged, the
  // account the alias transfer created, and the fee it funded into it.
  const available = new Set(['price', 'registrationFee', 'account']);
  return required.filter((f) => !available.has(f));
}

/**
 * ONE NODE, and why the quote pins it.
 *
 * A transaction frozen with a client is frozen once PER NODE, and each copy has
 * its own body and needs its own signature. A buyer signing offline would then
 * have to produce N signatures for one purchase, and the counter would have to
 * decide which of N bodies each answered. Pinning a single node account before
 * the freeze makes the purchase exactly one body, which is what §14.2 describes:
 * "the buyer signs that amount and no other".
 *
 * The node is taken from the client's own network map rather than hard-coded:
 * a node id is a fact about a network, and `networks.ts` holds no list of them
 * because the SDK already does.
 */
function oneNode(client: Client): AccountId {
  const ids = Object.values(client.network as unknown as Record<string, unknown>);
  const first = ids[0];
  if (first === undefined) throw new CounterRefusal('STAMP_PAYMENT_FAILED', 'the client knows no consensus node');
  return typeof first === 'string' ? AccountId.fromString(first) : (first as AccountId);
}

/** The alias, or the account, a transfer's stamp leg is addressed to. */
function holderTarget(holder: Holder): AccountId | string {
  if ('account' in holder) return holder.account;
  // The alias is the PUBLIC KEY (§H, HIP-32/HIP-542), and never an EVM address:
  // an account created from a public-key alias is owned by that key, which is
  // what §4.6 means by "the account is owned by the holder's key".
  return PublicKey.fromString(holder.publicKey).toAccountId(0, 0);
}

/** How long a quote stands. Shorter than a transaction's valid duration, deliberately. */
const QUOTE_SECONDS = 100;

/**
 * Step 1 — quote, build, freeze, and sign nothing.
 *
 * The transaction is built with the POSTMASTER as payer. §14.2: the purchase
 * "cannot be submitted without the Postmaster", which is the whole of what the
 * counter is for; and it is one transaction rather than three because the legs
 * must land together or not at all.
 */
export async function quotePurchase(ctx: CounterContext, req: PurchaseRequest): Promise<Requirement> {
  const { count, method, holder, provision } = req;
  if (!Number.isInteger(count) || count < 1) throw new CounterRefusal('STAMP_HOLDER_INVALID', `count must be at least 1, not ${count}`);

  if (provision) {
    const missing = provisioningFieldsThisCounterCannotFill(ctx.repoRoot);
    if (missing.length > 0) {
      throw new CounterRefusal(
        'STAMP_METHOD_UNSUPPORTED',
        `this release cannot sell the provisioned path: §5.4 requires ${missing.join(', ')} inside the receipt's ` +
          '`provisioning` line, and under D-159 as amended the Postmaster creates neither — the agent creates its ' +
          'own topics through `generate_mailbox`, after the purchase. Raised as ledger §G-19; it is a specification ' +
          'question, and nothing is charged until it is ruled.',
      );
    }
  }

  const current = await currentPriceList(ctx.mirror, ctx.priceTopic, ctx.repoRoot);
  const q = await quote(current, method, count, provision);

  const payTo = current.list.methods.find((m) => m.method === method)?.payTo;
  if (!payTo) throw new CounterRefusal('STAMP_METHOD_UNSUPPORTED', `the ${method} method names no payTo in the current price message`);

  const target = holderTarget(holder);
  const buyer = buyerOf(req);
  const priceTinybar = scaled(q.amount);
  const provisionTinybar = q.provisioning === undefined ? 0n : scaled(q.provisioning.amount);
  const feeTinybar = q.provisioning?.registrationFee === undefined ? 0n : scaled(q.provisioning.registrationFee);

  const tx = new TransferTransaction()
    // leg 1 — the price, from the buyer to the Postmaster.
    .addHbarTransfer(buyer, Hbar.fromTinybars(-(priceTinybar + provisionTinybar)))
    .addHbarTransfer(payTo, Hbar.fromTinybars(priceTinybar + provisionTinybar))
    // leg 2 — the stamps, from the treasury to the holder. Where the holder is a
    // public-key alias this leg is what creates the account.
    .addTokenTransfer(ctx.stampToken, ctx.treasuryId, -count)
    .addTokenTransfer(ctx.stampToken, target, count)
    .setTransactionMemo('')
    .setNodeAccountIds([oneNode(ctx.client)])
    .setMaxTransactionFee(new Hbar(5));

  // leg 3 — the registration fee, from the Postmaster into the account the
  // purchase just created, so the agent pays for its own registration (T-P13-4).
  if (feeTinybar > 0n) {
    tx.addHbarTransfer(ctx.operatorId, Hbar.fromTinybars(-feeTinybar));
    tx.addHbarTransfer(target, Hbar.fromTinybars(feeTinybar));
  }

  const frozen = await tx.freezeWith(ctx.client);
  const reference = frozen.transactionId?.toString();
  if (reference === undefined) throw new CounterRefusal('STAMP_PAYMENT_FAILED', 'the frozen purchase carries no transaction id');

  const requirement: Requirement = {
    reference,
    body: Buffer.from(frozen.toBytes()).toString('base64'),
    quote: q,
    count,
    holder,
    provision,
    expiresAt: new Date(Date.now() + QUOTE_SECONDS * 1000).toISOString(),
  };

  // §14.2's durable row, so the exchange survives a restart (T-P11-6). It holds
  // the BODY, which is what makes step 2 able to say "the body I built".
  openStore(ctx.stateDir, 'requirements').put(safeKey(reference), requirement, { retainUntil: requirement.expiresAt });
  return requirement;
}

/**
 * The account the price is debited from.
 *
 * A holder that already has an account pays from it. A holder that is a bare
 * public key has no account to pay from — the purchase is what creates one —
 * so the buyer and the holder are different parties and the buyer must be
 * named. In this window that is the Correspondent's OPERATOR, which is the same
 * relation §3.5 fixes everywhere else: the agent signs, the operator pays.
 */
function buyerOf(req: PurchaseRequest): string {
  if (req.buyer !== undefined) return req.buyer;
  if ('account' in req.holder) return req.holder.account;
  throw new CounterRefusal(
    'STAMP_HOLDER_INVALID',
    'the holder is a public key with no account, so the price cannot be debited from it, and no buyer was named',
  );
}

function safeKey(reference: string): string {
  return reference.replace(/[@.]/g, '-');
}

/**
 * Step 2 — the buyer has signed. Add the counter's signatures, submit, read the
 * result back from a mirror node, and build the receipt.
 */
export async function settlePurchase(
  ctx: CounterContext,
  reference: string,
  buyerPublicKey: string,
  signature: string,
): Promise<StampReceipt> {
  const requirements = openStore(ctx.stateDir, 'requirements');
  const payments = openStore(ctx.stateDir, 'payments');
  const key = safeKey(reference);

  // §14.2: "A payment reference MUST settle at most one purchase" (T-P11-5).
  // The settled row is returned rather than a second submission attempted — a
  // replay gets the receipt it already bought, not a second charge.
  const settled = payments.get<StampReceipt>(key);
  if (settled !== undefined) return settled.value;

  const row = requirements.get<Requirement>(key);
  if (row === undefined) throw new CounterRefusal('STAMP_PAYMENT_FAILED', `no quote is outstanding under ${reference}`);
  const requirement = row.value;
  if (Date.parse(requirement.expiresAt) < Date.now()) {
    requirements.remove(key);
    throw new CounterRefusal('STAMP_PAYMENT_FAILED', `the quote ${reference} has expired; ask for another`);
  }

  // THE BODY IS THE ONE THIS COUNTER BUILT. It is reconstituted from its own
  // durable row and never from anything the buyer sent (T-P13-3).
  const frozen = Transaction.fromBytes(Buffer.from(requirement.body, 'base64'));
  // The signature is over the ONE body this counter froze — the bytes the
  // SDK's own `signWith` would have handed a signer, which is what
  // `signableNodeBodyBytesList` exposes for exactly this exchange. A signature
  // over anything else simply fails at the network; there is no second body
  // here for it to be a valid signature of.
  frozen.addSignature(PublicKey.fromString(buyerPublicKey), Buffer.from(signature, 'base64'));

  const r = await submit(ctx.client, ctx.operatorId, frozen, [ctx.treasury, ctx.operator]);
  if (!r.ok) {
    // Nothing landed; the quote stays outstanding so the buyer may retry.
    throw new CounterRefusal('STAMP_PAYMENT_FAILED', `the purchase returned ${r.status} (tx ${r.transactionId})`);
  }

  const receipt = await receiptFrom(ctx, requirement, r.transactionId);
  const errors = schemas(ctx.repoRoot).validate('stamp-receipt', receipt);
  if (errors.length > 0) {
    // The transfer is on consensus and cannot be withdrawn, so this is recorded
    // and reported rather than swallowed: a receipt a Verifier would reject is
    // the counter's defect and the buyer must be told which field.
    throw new CounterRefusal(
      'STAMP_PAYMENT_UNSETTLED',
      `the purchase settled as ${r.transactionId} and its receipt does not validate against the registered schema: ${errors.join('; ')}`,
    );
  }

  payments.put(key, receipt, { retainUntil: new Date(Date.now() + 90 * 86_400_000).toISOString() });
  requirements.remove(key);
  return receipt;
}

interface MTransactions {
  readonly transactions?: readonly {
    readonly transaction_id: string;
    readonly consensus_timestamp: string;
    readonly result: string;
    readonly entity_id?: string | null;
    readonly token_transfers?: readonly { readonly token_id: string; readonly account: string; readonly amount: number }[];
  }[];
}

/**
 * The receipt, built from what the MIRROR holds and never from the SDK receipt.
 *
 * `holder` is read back rather than echoed: where the holder was a public-key
 * alias, the account it names did not exist when the quote was made, and the
 * only party that can say what it is is consensus.
 */
async function receiptFrom(ctx: CounterContext, requirement: Requirement, transactionId: string): Promise<StampReceipt> {
  const p = (t: MTransactions): boolean => (t.transactions ?? []).some((x) => x.result === 'SUCCESS');
  const seen = await ctx.mirror.poll<MTransactions>(`/transactions/${toMirrorTxId(transactionId)}`, p);
  if (seen === null || !p(seen)) {
    throw new CounterRefusal('STAMP_PAYMENT_UNSETTLED', `the mirror does not yet hold ${transactionId}; the receipt is recoverable by this reference`);
  }
  const tx = (seen.transactions ?? []).find((x) => x.result === 'SUCCESS');
  const credited = (tx?.token_transfers ?? []).find((t) => t.token_id === ctx.stampToken && t.amount > 0);
  if (credited === undefined) {
    throw new CounterRefusal('STAMP_PAYMENT_UNSETTLED', `${transactionId} carries no credit of ${ctx.stampToken}`);
  }

  return {
    ledgerTag: ctx.ledgerTag,
    tokenId: ctx.stampToken,
    amount: requirement.count,
    txRef: fromMirrorTxId(tx?.transaction_id ?? transactionId),
    price: { amount: requirement.quote.amount, currency: requirement.quote.currency },
    ...(requirement.quote.rate === undefined ? {} : { rate: requirement.quote.rate }),
    holder: credited.account,
  };
}
