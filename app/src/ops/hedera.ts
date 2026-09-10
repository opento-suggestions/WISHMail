/**
 * The SDK seam. Every transaction this project submits is built and signed with
 * `@hashgraph/sdk` — the blanket DIVERGENCE in `app/OPERATIONS.md` records why
 * the Hedera MCP server is used for no write we own.
 *
 * A client is driven by a `Signer`, through `setOperatorWith`, so that not even
 * the payer's private key is held outside `identity.ts`.
 */
import { Client, TransactionId, type AccountId, type Transaction, Status } from '@hashgraph/sdk';
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

export interface SubmitOptions {
  /**
   * Pin the consensus node before the freeze, so the transaction is ONE body.
   *
   * A transaction frozen with a client is frozen once per node, and each copy
   * has its own body and needs its own signature. That is merely wasteful
   * where every signer is local; it is the whole shape of the problem where a
   * signer is REMOTE, because N bodies is N round trips and N policy
   * decisions for one act (D-168). `purchase.ts` pins a node for the same
   * reason and says so in the same words.
   */
  readonly nodeAccountIds?: readonly AccountId[];
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
  options: SubmitOptions = {},
): Promise<Submitted> {
  // A TRANSACTION MAY ARRIVE ALREADY FROZEN, AND THEN NOTHING HERE MAY TOUCH IT.
  // The counter's settle leg reconstitutes the purchase from the bytes it froze
  // at the quote and adds the buyer's signature to it (§14.2, D-168), so by the
  // time it reaches this function it is frozen, signed, and immutable: every
  // setter below calls the SDK's `_requireNotFrozen` and throws, and a second
  // `freezeWith` would rebuild the signed bodies underneath a signature that is
  // over the first ones. There is also nothing left to decide — a frozen
  // transaction already carries its id and its nodes, which is what freezing
  // means. So the preparation happens only where preparation is still possible,
  // and every path signs and executes the SAME object.
  if (!tx.isFrozen()) {
    // Pin the id before submitting, so a run that dies between consensus and the
    // record write leaves behind the one handle that can find what it made.
    // setRegenerateTransactionId(false) keeps that handle single-valued.
    if (!tx.transactionId) tx.setTransactionId(TransactionId.generate(payerId));
    tx.setRegenerateTransactionId(false);
    if (options.nodeAccountIds !== undefined && options.nodeAccountIds.length > 0) {
      tx.setNodeAccountIds([...options.nodeAccountIds]);
    }
    await tx.freezeWith(client);
  }

  const frozen = tx;
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
