/**
 * The counter's carry policy — what the Postmaster will pay for, and nothing else.
 *
 * §6.1 defines carry: the agent signs a body and the Postmaster's account pays
 * for it, under a published policy, with the Postmaster's co-signature (D-157).
 * §G-19 is ruled (a): the Postmaster provisions the mailbox it sells, which is
 * §4.6's own provisioned path, so §5.4's "the entities the Postmaster created
 * for the holder" is literally true and the receipt validates against the
 * schema Step 4 froze (D-168).
 *
 * THE PROVISIONER DID NOT MOVE. `sdk/mailbox.ts` still creates the six rows, in
 * the same forced order, signed by the same agent key, with the same readbacks,
 * and it does not know it is being carried: `WriterContext.payer` is an
 * injected `Signer` and under a provisioning purchase that signer is remote.
 * The seam CLAUDE.md §11 asked to be built as a seam is now exercised as one,
 * which is the difference between a design and a claim.
 *
 * THE POLICY IS STRUCTURAL, and reads `ops/template.ts` rather than restating
 * it. Under an OUTSTANDING provisioning reference whose holder key is K, this
 * counter signs a body only if it is one of:
 *
 *   (i)   a topic create that is exactly row k of the template with K as the
 *         keys that row names — the doorbell with §4.4's one-stamp fee to the
 *         treasury and K exempt, the log, the manifest topic, the HCS-2
 *         registry at `hcs-2:0:60`, or the HCS-1 file topic with sole submit
 *         key K and NO admin key (D-150);
 *   (ii)  an HCS-1 chunk on the file topic this counter itself paid to create
 *         under this reference;
 *   (iii) the HCS-2 register entry on the registry it paid for;
 *   (iv)  the account-memo update on the holder's own account, naming that
 *         registry and setting nothing else.
 *
 * Anything else is refused, no mark is left (§3.5), and the reason is a
 * `STAMP_*` code as §6.3 fixes them.
 *
 * WHAT THE POLICY REFUSES THAT LOOKS INNOCENT, and why each is here:
 *
 *   - a body whose payer is not the Postmaster. Signing one would spend this
 *     account's signature on a transaction it is not paying for.
 *   - a body on a node this reference did not pin. One body, one signature,
 *     one round trip — the same reason `purchase.ts` pins a node before it
 *     freezes.
 *   - a transaction fee above the ceiling for that row. A carried body names
 *     its own maximum fee and the Postmaster is the account it comes out of, so
 *     a ceiling is the only thing between a published policy and an unbounded
 *     one. The ceiling is read from `networks.ts`, which is where the agent
 *     read the cap it built with — a second spelling of a cap would refuse a
 *     body the agent had every reason to build — and an the Postmaster’s payer may set a
 *     lower absolute maximum beside it.
 *   - an account update that sets ANY field besides the memo. The same
 *     transaction type that writes §9.2's first link can rotate the account's
 *     key, and a counter that paid for that would have paid to hand away the
 *     account it just sold.
 *   - an auto-renew account that is the Postmaster's. The Postmaster sells a
 *     mailbox once, at the price on consensus; it does not undertake to renew
 *     it forever, and a topic that named it would say otherwise on consensus
 *     where every reader can see it. The row must name the BUYER, which is the
 *     Correspondent's own the Postmaster’s payer — the party §3.5 already has paying.
 *   - a row already carried under this reference. Each row is created once; a
 *     second doorbell cannot be undone and §9.5 assigns `vague` where more than
 *     one registration names an address (D-165).
 *
 * THE COUNTER SEES NO PRIVATE KEY AND BUILDS NO PROVISIONING BODY (P-13,
 * T-P13-1). It receives bytes the agent has already signed and decides whether
 * to pay for them. That is the entire relation, and it is the same one §3.5
 * fixes everywhere else with the parties swapped.
 *
 * Conformance: T-P13-1, T-P13-3, T-P4-3, T-P16-1, T-P17-1, T-P17-3.
 */
import { HCS10_TTL } from '../ops/template.js';
import * as template from '../ops/template.js';
import { HCS2_REGISTER_TX_MEMO, accountMemoFor, registerOperation, registryMemo } from '../ops/declaration.js';
import { toMirrorTxId } from '../ops/mirror.js';
import { open as openStore } from '../state/store.js';
import { decodeTransactionBody, type DecodedTransaction, type TopicCreateBody } from './body.js';
import { CounterRefusal, safeKey, type CounterContext } from './context.js';
import type { Quote } from './pricing.js';

/**
 * The rows a provisioning purchase pays for, in the order `sdk/mailbox.ts`
 * creates them. The names are `CorrespondentKey`'s, so the counter's record and
 * the agent's record spell the same thing — they are reconciled from consensus
 * and never from each other, and two spellings would make that reconciliation a
 * translation.
 */
export const CARRIED_ROWS = [
  'doorbell',
  'log',
  'manifest',
  'declRegistry',
  'profileFile',
  'profileChunks',
  'registryEntry',
  'accountMemo',
] as const;
export type CarriedRow = (typeof CARRIED_ROWS)[number];

/** The five rows that are topic creations, and therefore have an entity to read back. */
const TOPIC_ROWS: readonly CarriedRow[] = ['doorbell', 'log', 'manifest', 'declRegistry', 'profileFile'];

/**
 * An HCS-1 file topic's memo: the SHA-256 of the profile PLAINTEXT, then the
 * compression and encoding (`hcs-1.md:56-60`). The counter cannot predict the
 * digest — the profile is the agent's and is final before the topic exists — so
 * this is the shape it requires instead, and the row is pinned by its keys: a
 * sole submit key and NO admin key is a combination no other row has.
 */
const HCS1_MEMO = /^[0-9a-f]{64}:(zstd|brotli|gzip|none):(base64|utf8)$/;

/**
 * What the counter is carrying, under one reference. Durable, because a
 * provisioning purchase that stops between rows must be resumable from either
 * side by reading the ledger (§14.2, T-P11-6, D-168).
 */
export interface CarryReference {
  readonly reference: string;
  /** §5.4's `txRef`: the settled three-legged transfer this mailbox was bought by. */
  readonly txRef: string;
  /** What the purchase priced, kept here so the receipt needs nothing else to be built. */
  readonly count: number;
  readonly quote: Quote;
  /** The holder's public key, raw hex — the key every row of the template names. */
  readonly holderKey: string;
  /** The account the purchase created for that key, read back from the mirror. */
  readonly account: string;
  /** The buyer: the Correspondent's postmasterPayer, and the auto-renew account of every row. */
  readonly buyer: string;
  /** The node the purchase pinned. One body, one signature. */
  readonly node: string;
  /** The maximum a single carried body may name as its fee, in tinybars. */
  readonly feeCap: number;
  /** Row → the transaction id it was carried under. `profileChunks` may repeat. */
  readonly rows: Partial<Record<CarriedRow, readonly string[]>>;
  readonly openedAt: string;
}

/** Open the carry record for a settled provisioning purchase. Called once, at settlement. */
export function openCarry(ctx: CounterContext, r: Omit<CarryReference, 'rows' | 'openedAt'>): CarryReference {
  const store = openStore(ctx.stateDir, 'carry');
  const key = safeKey(r.reference);
  const existing = store.get<CarryReference>(key);
  if (existing !== undefined) return existing.value;
  const opened: CarryReference = { ...r, rows: {}, openedAt: new Date().toISOString() };
  store.put(key, opened);
  return opened;
}

export function carryReference(ctx: CounterContext, reference: string): CarryReference | undefined {
  return openStore(ctx.stateDir, 'carry').get<CarryReference>(safeKey(reference))?.value;
}

function recordRow(ctx: CounterContext, ref: CarryReference, row: CarriedRow, transactionId: string): void {
  const store = openStore(ctx.stateDir, 'carry');
  const prior = ref.rows[row] ?? [];
  const next: CarryReference = { ...ref, rows: { ...ref.rows, [row]: [...prior, transactionId] } };
  store.put(safeKey(ref.reference), next, { overwrite: true });
}

/** The template subject this reference is about. One spelling, read and never restated. */
function subjectOf(ctx: CounterContext, ref: CarryReference): template.TemplateSubject {
  return {
    account: ref.account,
    publicKey: ref.holderKey,
    treasury: ctx.treasuryId,
    stampToken: ctx.stampToken,
    autoRenewAccount: ref.buyer,
  };
}

/** Every topic row's declared shape, by name. */
function shapes(ctx: CounterContext, ref: CarryReference): ReadonlyMap<CarriedRow, template.TopicShape> {
  const s = subjectOf(ctx, ref);
  return new Map<CarriedRow, template.TopicShape>([
    ['doorbell', template.doorbell(s)],
    ['log', template.log(s)],
    ['manifest', template.manifest(s)],
    ['declRegistry', template.declRegistry(s, registryMemo(HCS10_TTL))],
    // The memo is the profile's digest and cannot be known here; the row is
    // matched by its keys and its memo SHAPE, and asserted below.
    ['profileFile', template.profileFile(s, '')],
  ]);
}

/** Where a decoded topic create differs from a declared shape. Empty means it is that row. */
function differences(got: TopicCreateBody, want: template.TopicShape, memoIsDigest: boolean): string[] {
  const out: string[] = [];
  if (memoIsDigest) {
    if (!HCS1_MEMO.test(got.memo)) out.push(`memo ${JSON.stringify(got.memo)} is not an HCS-1 file memo`);
  } else if (got.memo !== want.memo) {
    out.push(`memo ${JSON.stringify(got.memo)} ≠ ${JSON.stringify(want.memo)}`);
  }
  if (got.adminKey !== want.adminKey) out.push(`admin key ${got.adminKey ?? 'NONE'} ≠ ${want.adminKey ?? 'NONE'}`);
  if (got.submitKey !== want.submitKey) out.push(`submit key ${got.submitKey ?? 'NONE'} ≠ ${want.submitKey ?? 'NONE'}`);
  if (got.feeScheduleKey !== null) out.push('a fee schedule key is set, and the template declares none: the fee is immutable at birth');
  if (got.autoRenewAccount !== want.autoRenewAccount) {
    out.push(`auto-renew account ${got.autoRenewAccount ?? 'NONE'} ≠ ${want.autoRenewAccount}`);
  }
  const exempt = [...got.feeExemptKeys];
  if (JSON.stringify(exempt) !== JSON.stringify([...want.feeExemptKeys])) {
    out.push(`fee-exempt keys ${JSON.stringify(exempt)} ≠ ${JSON.stringify([...want.feeExemptKeys])}`);
  }
  if (want.fee === null) {
    if (got.fees.length !== 0) out.push(`${got.fees.length} custom fee(s), and this row declares none`);
  } else if (got.fees.length !== 1) {
    out.push(`${got.fees.length} custom fee(s), and this row declares exactly one`);
  } else {
    const f = got.fees[0] as { amount: number; token: string; collector: string };
    if (f.amount !== want.fee.amount) out.push(`fee amount ${f.amount} ≠ ${want.fee.amount}`);
    if (f.token !== want.fee.token) out.push(`fee token ${f.token} ≠ ${want.fee.token}`);
    if (f.collector !== want.fee.collector) out.push(`fee collector ${f.collector} ≠ ${want.fee.collector}`);
  }
  return out;
}

interface MTransactions {
  readonly transactions?: readonly {
    readonly transaction_id: string;
    readonly result: string;
    readonly entity_id?: string | null;
  }[];
}

/**
 * What a transaction this counter carried CREATED, from the mirror.
 *
 * The counter signs before consensus and a topic id exists only after, so this
 * is how it learns what it paid for. It is also how the receipt's coordinates
 * are filled: read back, never echoed from anything the agent said (§5.4).
 */
async function createdBy(ctx: CounterContext, transactionId: string): Promise<string | null> {
  const seen = await ctx.mirror.get<MTransactions>(`/transactions/${toMirrorTxId(transactionId)}`);
  const tx = (seen?.transactions ?? []).find((t) => t.result === 'SUCCESS' && (t.entity_id ?? null) !== null);
  return tx?.entity_id ?? null;
}

/** The topic a row landed as, or null where the row has not landed. */
export async function carriedTopic(ctx: CounterContext, ref: CarryReference, row: CarriedRow): Promise<string | null> {
  const ids = ref.rows[row] ?? [];
  const first = ids[0];
  if (first === undefined) return null;
  return createdBy(ctx, first);
}

/** What one carried body turned out to be, and the signature that answers it. */
export interface CarryDecision {
  readonly row: CarriedRow;
  readonly transactionId: string;
  /** The Postmaster's PUBLIC half and its signature, base64. Never a key (P-13). */
  readonly publicKey: string;
  readonly signature: string;
  /** One line for the record, saying what was carried and under whose warrant. */
  readonly statement: string;
}

function refuse(detail: string): never {
  throw new CounterRefusal('STAMP_PAYMENT_FAILED', detail);
}

/**
 * The most a body of this row may authorise, in tinybars.
 *
 * The same numbers `sdk/mailbox.ts` builds with, from the same file. A fee-gated
 * topic creation needs a high cap — 20 ℏ was observed to fail and 100 ℏ to
 * succeed, charged far less (`networks.ts`, FETCHED 2026-09-08) — and a message
 * or an account update needs the SDK’s ordinary two.
 */
function rowCeiling(ctx: CounterContext, ref: CarryReference, row: CarriedRow): number {
  const caps = ctx.constants.feeCaps;
  const hbar = row === 'doorbell' ? caps.feeGatedTopicCreate : TOPIC_ROWS.includes(row) ? caps.plainTopicCreate : 2;
  return Math.min(ref.feeCap, Math.round(hbar * 100_000_000));
}

/**
 * Classify a body against the policy, or refuse. Reads consensus for the two
 * rows whose subject is a topic this counter paid for.
 */
async function classify(ctx: CounterContext, ref: CarryReference, tx: DecodedTransaction): Promise<CarriedRow> {
  const body = tx.body;

  if (body.kind === 'topic-create') {
    const wanted = shapes(ctx, ref);
    for (const row of TOPIC_ROWS) {
      const want = wanted.get(row) as template.TopicShape;
      const memoIsDigest = row === 'profileFile';
      const d = differences(body, want, memoIsDigest);
      if (d.length === 0) return row;
    }
    // No row matched. Report against the row the memo POINTS AT where it can,
    // so a refusal names one difference and not five near-misses.
    const named = TOPIC_ROWS.find((row) => {
      const want = wanted.get(row) as template.TopicShape;
      return row === 'profileFile' ? HCS1_MEMO.test(body.memo) : body.memo === want.memo;
    });
    if (named !== undefined) {
      const want = wanted.get(named) as template.TopicShape;
      refuse(
        `this body is row \`${named}\` of the provisioning template and does not match it: ` +
          `${differences(body, want, named === 'profileFile').join('; ')}. The counter pays for the template and for nothing else (D-168).`,
      );
    }
    refuse(
      `this body creates a topic with memo ${JSON.stringify(body.memo)}, which is no row of the provisioning template. ` +
        'The counter carries the mailbox it sold and nothing beside it (D-168, §6.1).',
    );
  }

  if (body.kind === 'submit-message') {
    if (body.chunked) refuse('this submission carries a chunkInfo, and §7.4 fixes one HCS message per chunk with none');
    if (body.message.length > 1024) refuse(`this submission is ${body.message.length} bytes and one HCS message caps at 1024`);
    const fileTopic = await carriedTopic(ctx, ref, 'profileFile');
    if (fileTopic !== null && body.topicId === fileTopic) {
      if (tx.memo !== '') refuse(`an HCS-1 chunk carries no transaction memo and this one carries ${JSON.stringify(tx.memo)}`);
      return 'profileChunks';
    }
    const registry = await carriedTopic(ctx, ref, 'declRegistry');
    if (registry !== null && body.topicId === registry) {
      if (tx.memo !== HCS2_REGISTER_TX_MEMO) {
        refuse(`an HCS-2 register entry carries the memo ${JSON.stringify(HCS2_REGISTER_TX_MEMO)} and this one carries ${JSON.stringify(tx.memo)}`);
      }
      if (fileTopic === null) {
        refuse('the profile file for this reference has not landed, so no register entry can name it yet');
      }
      const op = JSON.parse(body.message.toString('utf8')) as Record<string, unknown>;
      // The WHOLE operation, and not only the fields a reader of this file would
      // check one at a time: an entry with an extra key is an entry some other
      // reader may follow somewhere else, and this one is on a topic the counter
      // paid for. `registerOperation` is the same function the agent built it with.
      if (JSON.stringify(op) !== JSON.stringify(registerOperation(fileTopic))) {
        refuse(
          `the message on the declaration registry is not the HCS-2 register entry this template writes: ` +
            `${JSON.stringify(op)} against ${JSON.stringify(registerOperation(fileTopic))}`,
        );
      }
      return 'registryEntry';
    }
    refuse(
      `this submission is on topic ${body.topicId}, which is neither the profile file nor the declaration registry ` +
        'this reference paid to create. The counter pays for messages on the topics it bought and no others.',
    );
  }

  if (body.kind === 'account-update') {
    if (body.account !== ref.account) {
      refuse(`this update is on account ${body.account} and this reference's holder is ${ref.account}`);
    }
    if (body.otherFields.length > 0) {
      refuse(
        `this account update sets field(s) ${body.otherFields.join(', ')} besides the memo. The transaction type that ` +
          'writes §9.2’s first link can also rotate the account’s key, and the counter does not pay to hand away the ' +
          'account it just sold.',
      );
    }
    const registry = await carriedTopic(ctx, ref, 'declRegistry');
    if (registry === null) refuse('the declaration registry for this reference has not landed, so no account memo can name it yet');
    if (body.memo !== accountMemoFor(registry)) {
      refuse(`the account memo ${JSON.stringify(body.memo ?? '')} does not name this reference's registry (${accountMemoFor(registry)})`);
    }
    return 'accountMemo';
  }

  refuse(`this body is a transaction of a kind the provisioning template never produces (body field ${body.field})`);
}

/**
 * The carry leg of `buy_stamp` — decide, sign, record.
 *
 * Everything before the signature is a refusal that leaves no mark (§3.5); the
 * signature itself is over the very bytes that were decided about.
 */
export async function carrySignature(ctx: CounterContext, reference: string, bodyBase64: string): Promise<CarryDecision> {
  const ref = carryReference(ctx, reference);
  if (ref === undefined) {
    refuse(`no provisioning purchase is outstanding under ${reference}; the counter carries only what it sold (D-168, L-5)`);
  }

  const bytes = Buffer.from(bodyBase64, 'base64');
  const tx = decodeTransactionBody(bytes);

  if (tx.payer !== ctx.postmasterPayerId) {
    refuse(`this body names ${tx.payer} as its payer and the counter signs only for ${ctx.postmasterPayerId}`);
  }
  if (tx.node !== ref.node) {
    refuse(`this body is addressed to node ${tx.node} and this purchase pinned ${ref.node}; one body, one signature`);
  }
  // Classification comes first, because the ceiling is the ROW’s: a doorbell is
  // fee-gated and costs what a fee-gated topic costs, and a message is a message.
  const row = await classify(ctx, ref, tx);
  const ceiling = rowCeiling(ctx, ref, row);
  if (tx.transactionFee > ceiling) {
    refuse(
      `a body of row \`${row}\` may authorise ${ceiling} tinybars of fee and this one authorises ` +
        `${tx.transactionFee}. The cap is the one in networks.ts, which is the cap the row is built with.`,
    );
  }
  const already = ref.rows[row] ?? [];
  if (already.length > 0 && row !== 'profileChunks') {
    refuse(
      `row \`${row}\` was already carried under this reference, as ${already.join(', ')}. Each row is created once: ` +
        'a second doorbell cannot be undone, and §9.5 assigns `vague` where more than one registration names an address (D-165).',
    );
  }
  if (already.includes(tx.transactionId)) {
    refuse(`this exact body was already carried, as ${tx.transactionId}; a signature is issued once per body`);
  }

  const signature = await ctx.postmasterPayer.sign(bytes);
  recordRow(ctx, ref, row, tx.transactionId);

  return {
    row,
    transactionId: tx.transactionId,
    publicKey: ctx.postmasterPayer.publicKey.toStringDer(),
    signature: Buffer.from(signature).toString('base64'),
    statement: `carried row \`${row}\` as ${tx.transactionId}, payer ${ctx.postmasterPayerId}, node ${tx.node}, fee ceiling ${ceiling} tinybars`,
  };
}

/** The coordinates a completed provisioning purchase puts in §5.4's `provisioning` line. */
export interface CarriedMailbox {
  readonly account: string;
  readonly doorbell: string;
  readonly log: string;
  readonly manifestTopic: string;
  readonly declRegistry: string;
  readonly profileFile: string;
}

/**
 * Read back everything this reference carried, or say which row is still open.
 *
 * The receipt is not issued until every row has landed, which is what makes
 * §5.4's sentence true of it: these are the entities the Postmaster created for
 * the holder, and each id here came out of a mirror-node read of a transaction
 * this counter's own signature paid for.
 */
export async function carriedMailbox(
  ctx: CounterContext,
  ref: CarryReference,
): Promise<{ readonly mailbox: CarriedMailbox } | { readonly outstanding: readonly CarriedRow[] }> {
  const outstanding: CarriedRow[] = [];
  const found = new Map<CarriedRow, string>();
  for (const row of CARRIED_ROWS) {
    const ids = ref.rows[row] ?? [];
    if (ids.length === 0) {
      outstanding.push(row);
      continue;
    }
    if (TOPIC_ROWS.includes(row)) {
      const id = await createdBy(ctx, ids[0] as string);
      if (id === null) outstanding.push(row);
      else found.set(row, id);
    }
  }
  if (outstanding.length > 0) return { outstanding };
  return {
    mailbox: {
      account: ref.account,
      doorbell: found.get('doorbell') as string,
      log: found.get('log') as string,
      manifestTopic: found.get('manifest') as string,
      declRegistry: found.get('declRegistry') as string,
      profileFile: found.get('profileFile') as string,
    },
  };
}
