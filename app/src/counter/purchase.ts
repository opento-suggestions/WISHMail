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
  type Client,
} from '@hashgraph/sdk';
import { submit } from '../ops/hedera.js';
import { Mirror, fromMirrorTxId, toMirrorTxId } from '../ops/mirror.js';
import { open as openStore } from '../state/store.js';
import { schemas } from '../schema/loader.js';
import { carriedMailbox, carryReference, openCarry, type CarryReference } from './carry.js';
import { CounterRefusal, safeKey, type CounterContext, type Holder } from './context.js';
import { currentPriceList, quote, scaled, type Quote } from './pricing.js';
import { mirrorSource, resolveSelf } from '../resolve/hcs14.js';

/**
 * Re-exported so a caller that has `purchase.ts` need not also know
 * `context.ts` exists. The types live there because `carry.ts` and this file
 * each call the other and neither can own them (D-168).
 */
export { CounterRefusal, type CounterContext, type Holder };

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
  /** The account the price is debited from — the Correspondent's own operator (§3.5). */
  readonly buyer: string;
  readonly provision: boolean;
  /**
   * The consensus node this purchase is pinned to.
   *
   * One body, one signature — and where the purchase also buys the provisioned
   * path, every body the counter carries afterwards must be addressed to this
   * same node, so the buyer is told which one rather than guessing (D-168).
   */
  readonly node: string;
  /**
   * The account that will pay for the provisioning bodies, present exactly on a
   * provisioning quote (§6.1's carry, D-157, D-168).
   *
   * The buyer reads this account's PUBLIC key from a mirror node before it
   * submits anything under it, so a counter cannot name a payer whose key the
   * ledger does not agree with.
   */
  readonly carriedBy?: string;
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

/**
 * §G-19's gate, kept as the assertion it became — read from the registered
 * schema itself rather than restated.
 *
 * §5.4 makes `doorbell` and `manifestTopic` REQUIRED inside `provisioning` on
 * its own warrant: "the fields after it are the entities **the Postmaster
 * created for the holder**". Under D-159 as first amended the Postmaster created
 * neither, and this function was a REFUSAL: a `provision: true` purchase could
 * not produce a receipt that validated, and one omitting the line contradicted
 * §6.3's "exactly when". Both branches contradicted a sentence, which is a
 * specification defect and not a coding problem (CLAUDE.md §5), so it was raised
 * as ledger §G-19 rather than coded around — and it was found because the reader
 * was run on the writer's output before that output could be signed.
 *
 * §G-19 IS RULED (a), and D-168 is the ruling: the Postmaster provisions the
 * mailbox it sells, which is §4.6's own provisioned path. So every field in the
 * list is now one this counter fills — from its OWN readback of the
 * transactions its signature paid for (`carry.ts`), and never from anything the
 * agent said. The function stays, and it is now the assertion that this is true:
 * a schema that added a field the counter cannot read back would stop the sale
 * again, before anything is charged, rather than after.
 */
export function provisioningFieldsThisCounterCannotFill(repoRoot: string): readonly string[] {
  const file = path.join(repoRoot, 'spec', 'schemas', 'stamp-receipt.schema.json');
  const schema = JSON.parse(fs.readFileSync(file, 'utf8')) as {
    properties?: { provisioning?: { required?: readonly string[] } };
  };
  const required = schema.properties?.provisioning?.required ?? [];
  // What a provisioning purchase under D-168 can name: the price it charged and
  // the fee it funded, from the price message current at the quote; and the
  // account, the six topics and the profile file, from the mirror, under the
  // transaction ids this counter's own signature carried.
  const available = new Set(['price', 'registrationFee', 'account', 'doorbell', 'log', 'manifestTopic', 'declRegistry', 'profileFile']);
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
          '`provisioning` line and this counter cannot read them back from the transactions it carries (D-168). ' +
          'Nothing is charged: the sale stops before the quote rather than after the transfer.',
      );
    }
    if ('account' in holder) {
      // D-165: a returning agent buys WITHOUT provisioning. An account under
      // this key already exists, so there is nothing here to create and a second
      // mailbox would be the duplicate §9.5 assigns `vague` to.
      throw new CounterRefusal(
        'STAMP_HOLDER_INVALID',
        `the holder already has an account (${holder.account}), so there is no mailbox to provision. Buy without ` +
          '`provision` — a returning agent keeps the one it has (D-165).',
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

  const node = oneNode(ctx.client);
  const tx = new TransferTransaction()
    // leg 1 — the price, from the buyer to the Postmaster.
    .addHbarTransfer(buyer, Hbar.fromTinybars(-(priceTinybar + provisionTinybar)))
    .addHbarTransfer(payTo, Hbar.fromTinybars(priceTinybar + provisionTinybar))
    // leg 2 — the stamps, from the treasury to the holder. Where the holder is a
    // public-key alias this leg is what creates the account.
    .addTokenTransfer(ctx.stampToken, ctx.treasuryId, -count)
    .addTokenTransfer(ctx.stampToken, target, count)
    .setTransactionMemo('')
    .setNodeAccountIds([node])
    .setMaxTransactionFee(new Hbar(5));

  // leg 3 — the registration fee, from the Postmaster into the account the
  // purchase just created, so the agent pays for its own registration (T-P13-4).
  if (feeTinybar > 0n) {
    tx.addHbarTransfer(ctx.postmasterPayerId, Hbar.fromTinybars(-feeTinybar));
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
    buyer,
    provision,
    node: node.toString(),
    ...(provision ? { carriedBy: ctx.postmasterPayerId } : {}),
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

/**
 * What a settled purchase yields.
 *
 * A plain purchase yields a receipt at once: the transfer IS the whole of it.
 * A PROVISIONING purchase does not, and that is D-168’s shape rather than an
 * inconvenience — §5.4’s `provisioning` line names the entities the Postmaster
 * created for the holder, and at the moment the transfer lands it has created
 * exactly one of them. So the reference stays outstanding, the counter carries
 * the rows the agent signs, and the receipt is issued when it can read every
 * one of them back. A receipt issued earlier would be a receipt for something
 * that had not happened.
 */
export type Settled =
  | { readonly kind: 'receipt'; readonly receipt: StampReceipt }
  | { readonly kind: 'carrying'; readonly carry: CarryReference };

/**
 * Step 2 — the buyer has signed. Add the counter's signatures, submit, read the
 * result back from a mirror node, and either build the receipt or open the
 * carry record the rest of the purchase runs under.
 */
export async function settlePurchase(
  ctx: CounterContext,
  reference: string,
  buyerPublicKey: string,
  signature: string,
): Promise<Settled> {
  const requirements = openStore(ctx.stateDir, 'requirements');
  const payments = openStore(ctx.stateDir, 'payments');
  const key = safeKey(reference);

  // §14.2: "A payment reference MUST settle at most one purchase" (T-P11-5).
  // The settled row is returned rather than a second submission attempted — a
  // replay gets the receipt it already bought, not a second charge.
  const settled = payments.get<StampReceipt>(key);
  if (settled !== undefined) return { kind: 'receipt', receipt: settled.value };

  // A provisioning purchase whose transfer has already landed is carrying. A
  // second call returns where it got to rather than charging again (T-P11-5).
  const carrying = carryReference(ctx, reference);
  if (carrying !== undefined) return { kind: 'carrying', carry: carrying };

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

  const r = await submit(ctx.client, ctx.postmasterPayerId, frozen, [ctx.treasury, ctx.postmasterPayer]);
  if (!r.ok) {
    // Nothing landed; the quote stays outstanding so the buyer may retry.
    throw new CounterRefusal('STAMP_PAYMENT_FAILED', `the purchase returned ${r.status} (tx ${r.transactionId})`);
  }

  const receipt = await receiptFrom(ctx, requirement, r.transactionId);

  if (requirement.provision) {
    // The account exists now, and nothing else does. The rest of §4.6’s path is
    // eight bodies the agent signs and this counter pays for, under the policy
    // in `carry.ts`, and the receipt waits for all of them.
    const carry = openCarry(ctx, {
      reference,
      txRef: receipt.txRef,
      count: requirement.count,
      quote: requirement.quote,
      holderKey: holderKeyOf(requirement.holder),
      account: receipt.holder,
      buyer: requirement.buyer,
      node: requirement.node,
      feeCap: ctx.carryFeeCap,
    });
    requirements.remove(key);
    return { kind: 'carrying', carry };
  }

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
  return { kind: 'receipt', receipt };
}

/** The holder’s public key, raw hex — the form every row of the template names. */
function holderKeyOf(holder: Holder): string {
  if ('account' in holder) {
    throw new CounterRefusal('STAMP_HOLDER_INVALID', 'a provisioning purchase names its holder by PUBLIC KEY: the account is what it creates');
  }
  return PublicKey.fromString(holder.publicKey).toStringRaw();
}

/**
 * §5.4’s `provisioning` line, and the readback that earns it.
 *
 * Called once the agent has signed every row and this counter has paid for
 * every one. It resolves the holder under §9.2’s rule FROM ITS OWN READER
 * before it will issue anything: a mailbox that does not resolve is not a
 * mailbox, and the Step 3 defect is what leaving that sentence out costs. Only
 * then is the receipt built — every coordinate in it read back from the mirror
 * under a transaction id this counter’s own signature carried, and never
 * echoed from anything the agent said — and validated against the registered
 * schema before it is returned.
 */
export async function issueReceipt(
  ctx: CounterContext,
  reference: string,
): Promise<{ readonly kind: 'receipt'; readonly receipt: StampReceipt } | { readonly kind: 'outstanding'; readonly rows: readonly string[] }> {
  const payments = openStore(ctx.stateDir, 'payments');
  const key = safeKey(reference);
  const already = payments.get<StampReceipt>(key);
  if (already !== undefined) return { kind: 'receipt', receipt: already.value };

  const ref = carryReference(ctx, reference);
  if (ref === undefined) throw new CounterRefusal('STAMP_PAYMENT_FAILED', `no provisioning purchase is outstanding under ${reference}`);

  const read = await carriedMailbox(ctx, ref);
  if ('outstanding' in read) return { kind: 'outstanding', rows: read.outstanding };

  // THE READER, ON WHAT THIS COUNTER PAID FOR. §9.2’s rule, run from a mirror
  // node with nothing configured (P-4). A declaration nobody can read is not a
  // declaration, and this counter is about to certify one in a receipt.
  const coordinates = await resolveSelf(mirrorSource(ctx.mirror), ctx.ledgerTag, ref.account);
  if (coordinates === null) {
    throw new CounterRefusal(
      'STAMP_PAYMENT_UNSETTLED',
      `every row of ${reference} has landed and ${ref.account} does not resolve under hcs14. The receipt is not ` +
        'issued: §5.4 would name coordinates no reader can reach. The reference stays outstanding.',
    );
  }
  if (coordinates.doorbell !== read.mailbox.doorbell || coordinates.manifestTopic !== read.mailbox.manifestTopic) {
    throw new CounterRefusal(
      'STAMP_PAYMENT_UNSETTLED',
      `${ref.account} resolves to a doorbell and manifest topic this purchase did not create ` +
        `(${coordinates.doorbell}, ${coordinates.manifestTopic} against ${read.mailbox.doorbell}, ${read.mailbox.manifestTopic})`,
    );
  }

  const receipt: StampReceipt = {
    ledgerTag: ctx.ledgerTag,
    tokenId: ctx.stampToken,
    amount: ref.count,
    txRef: ref.txRef,
    price: { amount: ref.quote.amount, currency: ref.quote.currency },
    ...(ref.quote.rate === undefined ? {} : { rate: ref.quote.rate }),
    holder: ref.account,
    provisioning: {
      price: {
        amount: ref.quote.provisioning?.amount ?? ref.quote.amount,
        currency: ref.quote.provisioning?.currency ?? ref.quote.currency,
      },
      ...(ref.quote.provisioning?.registrationFee === undefined ? {} : { registrationFee: ref.quote.provisioning.registrationFee }),
      account: read.mailbox.account,
      doorbell: read.mailbox.doorbell,
      log: read.mailbox.log,
      manifestTopic: read.mailbox.manifestTopic,
      declRegistry: read.mailbox.declRegistry,
      profileFile: read.mailbox.profileFile,
    },
  };

  const errors = schemas(ctx.repoRoot).validate('stamp-receipt', receipt);
  if (errors.length > 0) {
    throw new CounterRefusal(
      'STAMP_PAYMENT_UNSETTLED',
      `the provisioned mailbox is on consensus and its receipt does not validate against the registered schema: ${errors.join('; ')}`,
    );
  }
  payments.put(key, receipt, { retainUntil: new Date(Date.now() + 90 * 86_400_000).toISOString() });
  return { kind: 'receipt', receipt };
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
