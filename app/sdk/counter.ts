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

/** How many times the receipt is asked for while the mirror catches up with the last row. */
const RECEIPT_ATTEMPTS = 12;
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
  const client = await connect(s.home.config.postmasterUrl);
  try {
    const holder = s.account === '' ? { publicKey: s.agent.publicKey.toStringDer() } : { account: s.account };

    // --- 1. Quote. Nothing is signed and nothing is charged. -----------------
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

    // --- 2. Sign, HERE. ------------------------------------------------------
    // The body is the counter’s; the signature is this process’s. The agent’s
    // key signs because the agent is the party whose account the price leaves —
    // and where the holder is a bare public key, the homePayer’s key signs,
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
    // These are the bytes the SDK’s own `signWith` hands a signer — the
    // TransactionBody, not the serialized transaction. Signing the wrong bytes
    // would produce a signature the network rejects, which is a refusal rather
    // than a hazard, but it is worth being exact about which bytes a key touched.
    const signature = await signer.sign((bodies[0] as { signableTransactionBodyBytes: Uint8Array }).signableTransactionBodyBytes);
    push(line('purchase.signed'));

    // --- 3. Settle the transfer. ---------------------------------------------
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

    // --- 4. The mailbox, signed here and paid for there. ---------------------
    const account = (carrying as { readonly account: string }).account;
    push(line('purchase.account', { account }));
    if (requirement.carriedBy === undefined) {
      throw new CounterUnavailable('STAMP_PAYMENT_FAILED', 'the counter is carrying this purchase and named no payer for it');
    }
    // From CONSENSUS, not from the counter: a payer whose key the ledger does
    // not agree with would have this agent spend its own signature on bodies
    // that cannot pay for themselves.
    const payerKey = await payerKeyFromConsensus(s.mirror, requirement.carriedBy);
    const legs = borrowedPayer(
      requirement.carriedBy,
      payerKey,
      [AccountId.fromString(requirement.node)],
      async (bodyBase64) => {
        const answer = await call(client, 'buy_stamp', {
          count: options.count,
          payment: { method, from: s.homePayerId, quoteRef: requirement.reference, carry: { body: bodyBase64 } },
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
      },
    );

    // The account is on consensus now and the session that bought it predates it.
    const carried = await boot(s.home, { payer: legs });
    if (carried.account !== account) {
      throw new CounterUnavailable(
        'STAMP_PAYMENT_FAILED',
        `the counter says this purchase created ${account} and the mirror says this key owns ${carried.account || 'nothing'}`,
      );
    }
    const mailbox = await generateMailbox(carried, options.record ?? carried.record, { onLine: push });

    // --- 5. The receipt, when the counter can read back what it paid for. ----
    for (let attempt = 1; attempt <= RECEIPT_ATTEMPTS; attempt += 1) {
      const asked = await call(client, 'buy_stamp', {
        count: options.count,
        payment: { method, from: s.homePayerId, quoteRef: requirement.reference, receipt: true },
        holder,
        provision: true,
      });
      const issued = asked.structuredContent?.['receipt'] as StampReceipt | undefined;
      if (issued !== undefined) {
        push(line('purchase.settled', { txRef: issued.txRef, consensusTimestamp: issued.txRef.split('@')[1] ?? '', holder: issued.holder }));
        return { receipt: issued, mailbox, session: carried };
      }
      const outstanding = asked._meta?.['wishmail/outstanding'] as readonly string[] | undefined;
      if (outstanding === undefined) {
        const code = (asked._meta?.['wishmail/code'] as string | undefined) ?? 'STAMP_PAYMENT_FAILED';
        throw new CounterUnavailable(code, textOf(asked));
      }
      if (attempt === RECEIPT_ATTEMPTS) {
        throw new CounterUnavailable(
          'STAMP_PAYMENT_UNSETTLED',
          `the mailbox is on consensus and the counter still reports ${outstanding.join(', ')} outstanding. Nothing is ` +
            'lost: the reference stays open and the receipt is recoverable by it.',
        );
      }
      await new Promise((r) => setTimeout(r, RECEIPT_PAUSE_MS));
    }
    throw new CounterUnavailable('STAMP_PAYMENT_UNSETTLED', 'unreachable');
  } finally {
    await client.close();
  }
}
