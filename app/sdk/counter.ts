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
 * What crosses the wire outward is a public key and a signature. What comes back
 * is a receipt and coordinates. No private key is in any field of either
 * direction, and there is no field for one (P-13, T-P13-1, T-P13-2).
 *
 * Conformance: T-P11-2, T-P13-3, T-P16-1.
 */
import { Client as McpClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Transaction } from '@hashgraph/sdk';
import { RELEASE } from '../src/release.js';
import { line } from '../src/tools/narration.js';
import type { Session } from './session.js';

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
  /** True: the purchase also buys the provisioned path of §4.6 (§6.3, D-161). */
  readonly provision?: boolean;
  readonly onLine?: (l: string) => void;
}

/**
 * Buy stamps, and where `provision` is set, the account that holds them.
 *
 * The holder is the agent's PUBLIC KEY when the agent has no account yet: the
 * stamp transfer to that public-key alias is what creates the account, owned by
 * that key (HIP-542, §4.6). Where the agent already has an account it is named
 * instead, and a returning agent buys without provisioning — `buy_stamp` with
 * `provision` refuses if the holder's account already exists (D-165).
 */
export async function buyStamps(s: Session, options: BuyOptions): Promise<StampReceipt> {
  const push = options.onLine ?? ((): void => {});
  const method = options.method ?? 'hbar';
  const client = await connect(s.home.config.postmasterUrl);
  try {
    const holder = s.account === '' ? { publicKey: s.agent.publicKey.toStringDer() } : { account: s.account };

    // --- 1. Quote. Nothing is signed and nothing is charged. -----------------
    const quoted = await call(client, 'buy_stamp', {
      count: options.count,
      payment: { method, from: s.payerId },
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
    // The body is the counter's; the signature is this process's. The agent's
    // key signs because the agent is the party whose account the price leaves —
    // and where the holder is a bare public key, the payer's key signs, because
    // the agent has no account for the price to leave.
    const frozen = Transaction.fromBytes(Buffer.from(requirement.body, 'base64'));
    const signer = s.account === '' ? s.payer : s.agent;
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

    // --- 3. Settle. ----------------------------------------------------------
    const settled = await call(client, 'buy_stamp', {
      count: options.count,
      payment: {
        method,
        from: s.payerId,
        quoteRef: requirement.reference,
        signature: { publicKey: signer.publicKey.toStringDer(), value: Buffer.from(signature).toString('base64') },
      },
      holder,
      ...(options.provision === true ? { provision: true } : {}),
    });
    const receipt = settled.structuredContent?.['receipt'] as StampReceipt | undefined;
    if (receipt === undefined) {
      const code = (settled._meta?.['wishmail/code'] as string | undefined) ?? 'STAMP_PAYMENT_FAILED';
      throw new CounterUnavailable(code, textOf(settled));
    }
    push(line('purchase.settled', { txRef: receipt.txRef, consensusTimestamp: receipt.txRef.split('@')[1] ?? '', holder: receipt.holder }));
    if (s.account === '') push(line('purchase.account', { account: receipt.holder }));
    return receipt;
  } finally {
    await client.close();
  }
}
