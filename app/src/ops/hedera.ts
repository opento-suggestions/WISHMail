/**
 * The SDK seam. Every transaction this project submits is built and signed with
 * `@hashgraph/sdk` — the blanket DIVERGENCE in `app/OPERATIONS.md` records why
 * the Hedera MCP server is used for no write we own.
 *
 * A client is driven by a `Signer`, through `setOperatorWith`, so that not even
 * the payer's private key is held outside `identity.ts`.
 */
import { Client, TransactionId, type Transaction, Status } from '@hashgraph/sdk';
import * as journal from './journal.js';
import type { Env } from './env.js';
import type { Signer } from './identity.js';

export interface Submitted {
  readonly ok: boolean;
  /** The network's status name, SUCCESS or otherwise. Never thrown away. */
  readonly status: string;
  readonly transactionId: string;
  readonly payer: string;
  /** Present only on success, and only where the transaction creates something. */
  readonly entityId?: string;
}

export function clientFor(env: Env, payerId: string, payer: Signer): Client {
  const c = Client.forName(env.network);
  c.setOperatorWith(payerId, payer.publicKey, payer.sign);
  return c;
}

/**
 * Freeze, gather signatures, submit, and return the outcome without throwing on
 * a network status. A failed status is an observation here, not an error: the
 * probe exists to find out what the network does.
 */
export async function submit(
  client: Client,
  payerId: string,
  tx: Transaction,
  signers: readonly Signer[] = [],
): Promise<Submitted> {
  // Pin the id before submitting, so a run that dies between consensus and the
  // record write leaves behind the one handle that can find what it made.
  // setRegenerateTransactionId(false) keeps that handle single-valued.
  if (!tx.transactionId) tx.setTransactionId(TransactionId.generate(payerId));
  tx.setRegenerateTransactionId(false);

  const frozen = await tx.freezeWith(client);
  for (const s of signers) await frozen.signWith(s.publicKey, s.sign);

  let transactionId = frozen.transactionId?.toString() ?? '(unassigned)';
  const validStart = frozen.transactionId?.validStart;
  journal.pin(transactionId, validStart ? Number(validStart.seconds) : Math.floor(Date.now() / 1000));
  try {
    const resp = await frozen.execute(client);
    transactionId = resp.transactionId.toString();
    const receipt = await resp.getReceipt(client);
    const entityId =
      receipt.topicId?.toString() ??
      receipt.tokenId?.toString() ??
      receipt.accountId?.toString();
    return {
      ok: true,
      status: receipt.status.toString(),
      transactionId,
      payer: payerId,
      ...(entityId ? { entityId } : {}),
    };
  } catch (err) {
    const status =
      (err as { status?: Status }).status?.toString() ??
      (err as Error).message ??
      'UNKNOWN';
    const id = (err as { transactionId?: { toString(): string } }).transactionId?.toString();
    return { ok: false, status, transactionId: id ?? transactionId, payer: payerId };
  }
}
