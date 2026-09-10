/**
 * The client half of §14.2's exchange — the Correspondent at the counter.
 *
 * `buy_stamp` is the ONE tool a Correspondent cannot run itself: §14.2 makes
 * the purchase a transaction "that cannot be submitted without the Postmaster",
 * because the treasury's signature is on the stamp leg and the Postmaster's is
 * on the payer's. So this is the only outbound call in the whole Correspondent
 * process. `resolve`, `inbox`, `ack` and `verify` run locally — `verify` with
 * nothing but a mirror node, because it is the VERIFIER class and P-4 says so.
 *
 * TWO CALLS, ONE PURCHASE, AND THE KEY NEVER LEAVES.
 *
 *   1. call with no signature → the counter quotes and returns a frozen body.
 *   2. SIGN THE BODY HERE, in this process, with the agent's own key.
 *   3. call again with the reference and the signature → the receipt.
 *
 * A PROVISIONING PURCHASE HAS MORE LEGS, because it buys more (D-168, §G-19
 * ruled (a)). §4.6’s provisioned path has the Postmaster create the mailbox it
 * sells, so after the transfer settles the account exists and nothing else
 * does; this process then stands the mailbox up with `generateMailbox`, signing
 * every body with the agent’s own key exactly as a self-provisioned agent
 * would, and the POSTMASTER pays for each one over the counter’s carry leg
 * (§6.1, D-157). The receipt comes last, when the counter can read every row
 * back — which is what makes §5.4’s "the entities the Postmaster created for
 * the holder" a true sentence about it.
 *
 *   4. stand the mailbox up, one body at a time; the counter co-signs each.
 *   5. call again for the receipt, which names what it paid for.
 *
 * What crosses the wire outward is a public key and a signature. What comes back
 * is a receipt and coordinates. No private key is in any field of either
 * direction, and there is no field for one (P-13, T-P13-1, T-P13-2).
 *
 * Conformance: T-P11-2, T-P13-3, T-P16-1.
 */
import { Client as McpClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { AccountId, Transaction } from '@hashgraph/sdk';
import { RELEASE } from '../src/release.js';
import { line } from '../src/tools/narration.js';
import { borrowedPayer, payerKeyFromConsensus } from './carry.js';
import { generateMailbox, type MailboxResult } from './mailbox.js';
import { boot, type Session } from './session.js';
import type { AgentRecord } from './home.js';

/** What the counter returns when it has quoted and signed nothing. */
export interface Requirement {
  readonly reference: string;
  readonly body: string;
  readonly quote: {
    readonly amount: string;
    readonly currency: string;
    readonly rate?: { readonly source: string; readonly pair: string; readonly value: string; readonly at: string };
    readonly provisioning?: { readonly amount: string; readonly currency: string; readonly registrationFee?: string };
    readonly from: { readonly sequenceNumber: number; readonly consensusTimestamp: string };
  };
  /** The consensus node this purchase is pinned to. One body, one signature. */
  readonly node: string;
  /** The account that will pay for the provisioning bodies. Present on a provisioning quote. */
  readonly carriedBy?: string;
  readonly expiresAt: string;
}

export interface StampReceipt {
  readonly ledgerTag: string;
  readonly tokenId: string;
  readonly amount: number;
  readonly txRef: string;
  readonly price: { readonly amount: string; readonly currency: string };
  readonly holder: string;
  readonly provisioning?: Record<string, unknown>;
}

export class CounterUnavailable extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = 'CounterUnavailable';
    this.code = code;
  }
}

interface ToolResult {
  readonly isError?: boolean;
  readonly content?: readonly { readonly type: string; readonly text?: string }[];
  readonly structuredContent?: Record<string, unknown>;
  readonly _meta?: Record<string, unknown>;
}

/** Open a connection to the counter. Closed by the caller; nothing is cached. */
export async function connect(url: string): Promise<McpClient> {
  const client = new McpClient({ name: 'wishmail-correspondent', version: RELEASE.spec }, { capabilities: {} });
  // The cast is the MCP SDK type meeting `exactOptionalPropertyTypes`, which
  // this repository has on and the SDK does not: its client transport types
  // `sessionId` as required while assigning it undefined until a session
  // exists. Narrow, local, and about the shape of an optional field.
  await client.connect(
    new StreamableHTTPClientTransport(new URL(url)) as unknown as Parameters<typeof client.connect>[0],
  );
  return client;
}

async function call(client: McpClient, name: string, args: Record<string, unknown>): Promise<ToolResult> {
  return (await client.callTool({ name, arguments: args })) as unknown as ToolResult;
}

function textOf(r: ToolResult): string {
  return (r.content ?? []).map((c) => c.text ?? '').join('\n');
}

export interface BuyOptions {
  readonly count: number;
  readonly method?: string;
  /** True: the purchase also buys the provisioned path of §4.6 (§6.3, D-161, D-168). */
  readonly provision?: boolean;
  readonly onLine?: (l: string) => void;
  /** Where the mailbox this purchase pays for is recorded — the agent’s own record. */
  readonly record?: AgentRecord;
}

/** What a purchase leaves behind: the receipt, and where the buyer is afterwards. */
export interface Purchase {
  readonly receipt: StampReceipt;
  /** Present exactly where the purchase provisioned: what the mailbox run reported. */
  readonly mailbox?: MailboxResult;
  /**
   * The session as it stands after the purchase.
   *
   * A provisioning purchase creates the account, and the session that asked for
   * it predates it — a session’s `account` is read from consensus at boot and
   * there was nothing to read. So the buyer is handed the one that knows.
   */
  readonly session: Session;
}

/**
/**
 * WHAT A PURCHASE LEAVES IN THE HOME WHILE IT IS STILL RUNNING, and why a
 * local file is allowed to hold it.
 *
 * D-165: every provisioning verb is idempotent against CONSENSUS, and a local
 * file is a cache of consensus and never an authority over it. A purchase
 * reference is the one thing in this exchange that is NOT on consensus in a
 * form the agent can find — the account is, the topics are, the registration is,
 * but the reference is a handle the counter issued and only the two parties
 * know. So it is written here when the transfer lands, and read back on a resume.
 *
 * **Losing it costs money and never correctness.** An agent whose home was wiped
 * between the transfer and the mailbox finds an account with no mailbox, cannot
 * name the reference, and finishes the mailbox at its OWN operator’s expense
 * through `generate_mailbox` — which is the self-provisioned path, and is what
 * `provision.cli.ts` already does in that case. Nothing is created twice,
 * because `generate_mailbox` still asks the resolver first.
 */
interface OutstandingPurchase {
  readonly reference: string;
  readonly node: string;
  readonly carriedBy: string;
  readonly account: string;
  readonly state: 'signed' | 'carrying' | 'settled';
}

export function outstanding(s: Session, record: AgentRecord): OutstandingPurchase | undefined {
  const row = record.get('purchase');
  const policy = row?.policy as unknown as OutstandingPurchase | undefined;
  if (policy === undefined) return undefined;
  if (policy.state !== 'signed' && policy.state !== 'carrying') return undefined;
  // A SIGNED row names no account yet, because the purchase is what creates one.
  // It is written before the signature leaves this process — from that moment
  // the transfer may land no matter what this process learns next — so the
  // account it belongs to is knowable only from consensus, and boot has already
  // found it under this agent's key. A CARRYING row names the account the
  // counter reported, and a record naming another one is a record of another
  // agent's purchase: a home that is an agent should never hold one, but if it
  // does, it is not this one's to resume.
  if (policy.state === 'signed') return { ...policy, account: s.account };
  return policy.account === s.account ? policy : undefined;
}

function remember(s: Session, record: AgentRecord, purchase: OutstandingPurchase, txRef: string): void {
  record.put('purchase', {
    kind: 'transfer',
    role: 'the provisioning purchase this agent was bought by',
    id: purchase.account,
    builtBy: 'TransferTransaction',
    signedBy: ['operator'],
    payer: purchase.carriedBy,
    transactionId: txRef,
    consensusTimestamp: '',
    confirmedFrom: 'buy_stamp at the counter',
    confirmedAt: new Date().toISOString(),
    policy: { ...purchase },
    specTag: s.specTag,
  });
}

/**
 * THE RECEIPT WAIT HAS A CEILING, AND WHAT HAPPENS AT IT IS NAMED.
 *
 * The counter will not issue a receipt until it can read every row it paid for
 * back from a mirror node AND the holder resolves under §9.2 from its own
 * reader (D-168). Both are mirror-node lag after the last row lands, so the
 * ordinary case is one or two seconds — but the wait must not be open, because
 * an open wait is indistinguishable from a hang, and this one happens after a
 * transfer has settled and a mailbox is on consensus. A caller that cannot tell
 * "still ingesting" from "never coming" will eventually kill the process, and
 * killing it is the one thing that makes the outcome unclear.
 *
 * **At the ceiling the run stops and says exactly what is true**: the transfer
 * settled, the mailbox exists, nothing is lost, nothing will be charged twice,
 * and the reference is OUTSTANDING and resumable from either side —
 * `buy_stamp` with the same `quoteRef` and `receipt: true` from here, or
 * `issueReceipt` at the counter. Neither side re-derives anything from the
 * other: the counter reads the mirror under the transaction ids its own
 * signature carried, and this side re-boots from consensus (D-165).
 *
 * Thirty seconds, in fifteen tries. Long enough for a mirror node that is
 * behind, short enough that a person watching knows something is wrong.
 */
const RECEIPT_ATTEMPTS = 15;
const RECEIPT_PAUSE_MS = 2_000;

/**
 * Buy stamps, and where `provision` is set, the mailbox that holds them.
 *
 * The holder is the agent’s PUBLIC KEY when the agent has no account yet: the
 * stamp transfer to that public-key alias is what creates the account, owned by
 * that key (HIP-542, §4.6). A returning agent names its account instead and
 * buys without provisioning — the counter refuses `provision` for a holder that
 * already has one, because there is nothing left to create and a second mailbox
 * is the duplicate §9.5 assigns `vague` to (D-165).
 */
export async function buyStamps(s: Session, options: BuyOptions): Promise<Purchase> {
  const push = options.onLine ?? ((): void => {});
  const method = options.method ?? 'hbar';
  const record = options.record ?? s.record;

  // --- 0. Is this a resume? Decided HERE, before the counter is asked. -------
  //
  // A provisioning purchase that stopped after the transfer leaves an account
  // with no mailbox. Asking for a quote in that state gets back
  // STAMP_HOLDER_INVALID — "the holder already has an account; buy without
  // `provision`" — which is TRUE of a returning agent and FALSE here, and a
  // caller cannot tell the two apart from the answer. So the Correspondent
  // decides which case it is from what it holds, and never asks a question whose
  // answer would mislead the agent that reads it.
  let resuming: OutstandingPurchase | undefined;
  if (options.provision === true && s.account !== '') {
    resuming = outstanding(s, record);
    if (resuming === undefined) {
      throw new CounterUnavailable(
        'STAMP_HOLDER_INVALID',
        `${s.account} already exists and this home holds no outstanding purchase, so there is nothing here to resume. ` +
          'If this agent has no mailbox, finish it with `generate_mailbox` — that is the self-provisioned path and YOUR ' +
          'operator pays for it. If it has one, buy stamps without `provision`: a returning agent keeps the mailbox it ' +
          'has, and a second one is the duplicate §9.5 assigns `vague` to (D-165).',
      );
    }
    push(line('purchase.resuming', { reference: resuming.reference, account: s.account }));
  }

  const client = await connect(s.home.config.postmasterUrl);
  try {
    const holder = s.account === '' ? { publicKey: s.agent.publicKey.toStringDer() } : { account: s.account };

    /** Every leg after the quote names the reference it answers. */
    let reference = resuming?.reference ?? '';
    let node = resuming?.node ?? '';
    let carriedBy = resuming?.carriedBy ?? '';
    let account = resuming?.account ?? '';

    if (resuming === undefined) {
      // --- 1. Quote. Nothing is signed and nothing is charged. ---------------
      const quoted = await call(client, 'buy_stamp', {
        count: options.count,
        payment: { method, from: s.homePayerId },
        holder,
        ...(options.provision === true ? { provision: true } : {}),
      });
      const requirement = quoted._meta?.['wishmail/requirement'] as Requirement | undefined;
      if (requirement === undefined) {
        const code = (quoted._meta?.['wishmail/code'] as string | undefined) ?? 'STAMP_PAYMENT_FAILED';
        throw new CounterUnavailable(code, textOf(quoted));
      }
      push(
        line('purchase.quoted', {
          count: options.count,
          price: requirement.quote.amount,
          currency: requirement.quote.currency,
          provisioning:
            requirement.quote.provisioning === undefined
              ? ''
              : ` plus ${requirement.quote.provisioning.amount} for the provisioned path`,
          reference: requirement.reference,
        }),
      );

      // --- 2. Sign, HERE. ----------------------------------------------------
      // The body is the counter's; the signature is this process's. The agent's
      // key signs because the agent is the party whose account the price leaves
      // — and where the holder is a bare public key, the operator's key signs,
      // because the agent has no account for the price to leave.
      const frozen = Transaction.fromBytes(Buffer.from(requirement.body, 'base64'));
      const signer = s.account === '' ? s.homePayer : s.agent;
      const bodies = frozen.signableNodeBodyBytesList;
      if (bodies.length !== 1) {
        throw new CounterUnavailable(
          'STAMP_PAYMENT_FAILED',
          `the counter quoted ${bodies.length} bodies and a purchase is one; refusing to sign what cannot be one transaction`,
        );
      }
      // These are the bytes the SDK's own `signWith` hands a signer — the
      // TransactionBody, not the serialized transaction. Signing the wrong bytes
      // would produce a signature the network rejects, which is a refusal rather
      // than a hazard, but it is worth being exact about which bytes a key touched.
      const signature = await signer.sign((bodies[0] as { signableTransactionBodyBytes: Uint8Array }).signableTransactionBodyBytes);
      push(line('purchase.signed'));

      // THE REFERENCE IS WRITTEN DOWN BEFORE THE SIGNATURE LEAVES THIS PROCESS.
      //
      // From the moment it does, the transfer may land whatever this process
      // learns next — the counter may fail on its own readback, the transport
      // may drop, the process may be killed — and the reference is the one thing
      // in this exchange that is not on consensus in a form this agent could
      // find again. Written after the answer came back, as it was until Gate
      // One's second run, it is written exactly when nothing can go wrong and
      // lost exactly when something does. The account is not known yet, because
      // the purchase is what creates it; a resume reads it from consensus.
      remember(
        s,
        record,
        { reference: requirement.reference, node: requirement.node, carriedBy: requirement.carriedBy ?? '', account: '', state: 'signed' },
        requirement.reference,
      );

      // --- 3. Settle the transfer. -------------------------------------------
      const settled = await call(client, 'buy_stamp', {
        count: options.count,
        payment: {
          method,
          from: s.homePayerId,
          quoteRef: requirement.reference,
          signature: { publicKey: signer.publicKey.toStringDer(), value: Buffer.from(signature).toString('base64') },
        },
        holder,
        ...(options.provision === true ? { provision: true } : {}),
      });
      const receipt = settled.structuredContent?.['receipt'] as StampReceipt | undefined;
      const carrying = settled._meta?.['wishmail/carrying'] as { readonly account: string } | undefined;
      if (receipt === undefined && carrying === undefined) {
        const code = (settled._meta?.['wishmail/code'] as string | undefined) ?? 'STAMP_PAYMENT_FAILED';
        throw new CounterUnavailable(code, textOf(settled));
      }
      if (receipt !== undefined) {
        push(line('purchase.settled', { txRef: receipt.txRef, consensusTimestamp: receipt.txRef.split('@')[1] ?? '', holder: receipt.holder }));
        return { receipt, session: s };
      }
      if (requirement.carriedBy === undefined) {
        throw new CounterUnavailable('STAMP_PAYMENT_FAILED', 'the counter is carrying this purchase and named no payer for it');
      }
      reference = requirement.reference;
      node = requirement.node;
      carriedBy = requirement.carriedBy;
      account = (carrying as { readonly account: string }).account;
      push(line('purchase.account', { account }));

      // The reference is the one thing in this exchange that is not on
      // consensus in a form this agent could find again. Written down the
      // moment the transfer lands, so a run that stops here can be resumed
      // rather than paid for twice.
      remember(s, record, { reference, node, carriedBy, account, state: 'carrying' }, reference);
    }

    // --- 3a. A SIGNED reference has to be told what became of it. ------------
    //
    // A resume from `signed` knows only that a signature left this process. The
    // counter is the party that can say whether the transfer landed — it asks
    // consensus under the reference, which is the transaction id — so the resume
    // leg is called with the quoteRef and no signature, and what comes back is
    // the same `carrying` a first-time settle returns. Where the transfer did
    // NOT land, the counter refuses and says a signature is what is missing;
    // there is nothing to resume and nothing was charged.
    if (resuming?.state === 'signed') {
      const resumed = await call(client, 'buy_stamp', {
        count: options.count,
        payment: { method, from: s.homePayerId, quoteRef: reference },
        holder,
        provision: true,
      });
      const receipt = resumed.structuredContent?.['receipt'] as StampReceipt | undefined;
      if (receipt !== undefined) {
        remember(s, record, { reference, node, carriedBy, account, state: 'settled' }, receipt.txRef);
        push(line('purchase.settled', { txRef: receipt.txRef, consensusTimestamp: receipt.txRef.split('@')[1] ?? '', holder: receipt.holder }));
        return { receipt, session: s };
      }
      const carrying = resumed._meta?.['wishmail/carrying'] as { readonly account: string; readonly node?: string } | undefined;
      if (carrying === undefined) {
        const code = (resumed._meta?.['wishmail/code'] as string | undefined) ?? 'STAMP_PAYMENT_FAILED';
        throw new CounterUnavailable(code, textOf(resumed));
      }
      account = carrying.account;
      if (carrying.node !== undefined) node = carrying.node;
      push(line('purchase.account', { account }));
      remember(s, record, { reference, node, carriedBy, account, state: 'carrying' }, reference);
    }

    // --- 4. The mailbox, signed here and paid for there. ---------------------
    // From CONSENSUS, not from the counter: a payer whose key the ledger does
    // not agree with would have this agent spend its own signature on bodies
    // that cannot pay for themselves.
    const payerKey = await payerKeyFromConsensus(s.mirror, carriedBy);
    const legs = borrowedPayer(carriedBy, payerKey, [AccountId.fromString(node)], async (bodyBase64) => {
      const answer = await call(client, 'buy_stamp', {
        count: options.count,
        payment: { method, from: s.homePayerId, quoteRef: reference, carry: { body: bodyBase64 } },
        holder,
        provision: true,
      });
      const decision = answer._meta?.['wishmail/carried'] as { readonly publicKey: string; readonly signature: string; readonly statement?: string } | undefined;
      if (decision === undefined) {
        const code = (answer._meta?.['wishmail/code'] as string | undefined) ?? 'STAMP_PAYMENT_FAILED';
        throw new CounterUnavailable(code, textOf(answer));
      }
      if (decision.statement !== undefined) push(line('purchase.carried', { statement: decision.statement }));
      return { publicKey: decision.publicKey, signature: decision.signature };
    });

    // The account is on consensus now and the session that bought it predates it.
    // `expectAccount` because it IS on consensus: the transfer landed and the
    // counter named what it created, so a mirror that does not yet show it is
    // behind rather than disagreeing (Gate One, and a few seconds).
    const carried = await boot(s.home, { payer: legs, expectAccount: true });
    if (carried.account !== account) {
      throw new CounterUnavailable(
        'STAMP_PAYMENT_FAILED',
        `the counter says this purchase created ${account} and the mirror says this key owns ${carried.account || 'nothing'}`,
      );
    }
    // Idempotent against consensus: on a resume this creates only what is
    // missing, and nothing at all if the whole mailbox already landed (D-165).
    const mailbox = await generateMailbox(carried, record, { onLine: push });

    // --- 5. The receipt, when the counter can read back what it paid for. ----
    for (let attempt = 1; attempt <= RECEIPT_ATTEMPTS; attempt += 1) {
      const asked = await call(client, 'buy_stamp', {
        count: options.count,
        payment: { method, from: s.homePayerId, quoteRef: reference, receipt: true },
        holder,
        provision: true,
      });
      const issued = asked.structuredContent?.['receipt'] as StampReceipt | undefined;
      if (issued !== undefined) {
        remember(s, record, { reference, node, carriedBy, account, state: 'settled' }, issued.txRef);
        push(line('purchase.settled', { txRef: issued.txRef, consensusTimestamp: issued.txRef.split('@')[1] ?? '', holder: issued.holder }));
        return { receipt: issued, mailbox, session: carried };
      }
      const open = asked._meta?.['wishmail/outstanding'] as readonly string[] | undefined;
      if (open === undefined) {
        const code = (asked._meta?.['wishmail/code'] as string | undefined) ?? 'STAMP_PAYMENT_FAILED';
        throw new CounterUnavailable(code, textOf(asked));
      }
      if (attempt === RECEIPT_ATTEMPTS) {
        throw new CounterUnavailable(
          'STAMP_PAYMENT_UNSETTLED',
          `the receipt is not issued after ${(RECEIPT_ATTEMPTS * RECEIPT_PAUSE_MS) / 1000}s: the counter still ` +
            `reports ${open.join(', ')} outstanding. NOTHING IS LOST AND NOTHING WILL BE CHARGED TWICE. ` +
            `The transfer settled, the mailbox is on consensus, and the reference ${reference} is OUTSTANDING — ` +
            'ask again with the provision flag, which resumes from the record this home kept, or have the counter issue it; ' +
            'a replayed reference returns the receipt it already bought (T-P11-5). The two sides reconcile from ' +
            'consensus and never from each other, so neither has to be restarted for the other to catch up.',
        );
      }
      await new Promise((r) => setTimeout(r, RECEIPT_PAUSE_MS));
    }
    // Unreachable: the loop returns or throws on its last attempt. Kept as a
    // total function rather than a fall-through, so a future edit to the ceiling
    // cannot turn this into a silent success.
    throw new CounterUnavailable('STAMP_PAYMENT_UNSETTLED', 'the receipt loop ended without an answer');
  } finally {
    await client.close();
  }
}
