/**
 * The seam's remote half, from the Correspondent's side — a `Signer` whose
 * closure is a round trip to the counter.
 *
 * CLAUDE.md §11 asked for the payer to be built as a seam and not as a
 * shortcut: "Every consensus submission an agent makes is constructed *agent
 * signs, payer signs*, with the payer an injected signer. Local key now — the
 * operator's, from config. Remote signature through the Postmaster's `carry`
 * later. Nothing above the seam may know which." This file is the later.
 *
 * IT IS FOUR LINES OF SUBSTANCE, and that is the whole report on whether the
 * seam was real. A `Signer` is a label, a public key and
 * `(bytes) => Promise<Uint8Array>`; the promise was always allowed to be a
 * network call, and nothing above it — `submit`, `liveConsensus`,
 * `generateMailbox`, `topicRow` — had to learn a thing. What took the work was
 * not this side. It was the counter deciding what it will pay for
 * (`counter/carry.ts`), which is where the risk lives and where a policy
 * belongs.
 *
 * WHAT CROSSES THE WIRE. Outward: a purchase reference and the bytes of a body
 * this process has already signed. Inward: a public key and a signature. There
 * is no field for a private key in either direction and there never will be
 * (P-13, T-P13-1) — and the bytes going out are a `TransactionBody`, which is
 * public the moment it reaches a consensus node.
 *
 * THE POSTMASTER'S KEY IS READ FROM CONSENSUS AND NOT FROM THE COUNTER. The
 * counter names the account that will pay; this process asks a mirror node what
 * key that account has. A counter that named a key the ledger disagrees with
 * would otherwise have the agent submit transactions that fail with the
 * agent's own signature already on them — and a mirror node is a read
 * interface, which is the one thing P-4 guarantees is available.
 *
 * Conformance: T-P4-3, T-P13-1, T-P13-3.
 */
import { PublicKey, type AccountId } from '@hashgraph/sdk';
import { flattenMirrorKey } from '../src/core/protokey.js';
import type { Mirror } from '../src/ops/mirror.js';
import type { Signer } from '../src/ops/identity.js';
import type { BorrowedPayer } from './session.js';

/** What one carried body costs a caller: one call, one signature. */
export type CarryLeg = (bodyBase64: string) => Promise<{ readonly publicKey: string; readonly signature: string }>;

export class CarryRefused extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = 'CarryRefused';
    this.code = code;
  }
}

interface MAccount {
  readonly account: string;
  readonly key?: { readonly _type: string; readonly key: string } | null;
}

/**
 * The account's own key, as consensus holds it.
 *
 * Refuses a key list: a payer whose account is controlled by several keys
 * cannot be co-signed by one round trip, and a carry that quietly produced an
 * incomplete signature would fail at the network with the agent's signature
 * already spent on the body.
 */
export async function payerKeyFromConsensus(mirror: Mirror, account: string): Promise<PublicKey> {
  const a = await mirror.get<MAccount>(`/accounts/${account}?limit=1`);
  if (a === null) throw new CarryRefused('STAMP_PAYMENT_FAILED', `the counter names ${account} as its payer and the mirror does not hold that account`);
  const keys = flattenMirrorKey(a.key);
  if (keys.length !== 1) {
    throw new CarryRefused(
      'STAMP_PAYMENT_FAILED',
      `${account} is controlled by ${keys.length} keys and a carried body takes one co-signature; refusing to sign what one round trip cannot complete`,
    );
  }
  return PublicKey.fromString(keys[0] as string);
}

/**
 * A payer that lives at the counter.
 *
 * `sign` sends the bytes it was given and adds nothing: the counter's policy
 * decides from the very bytes it is signing (`counter/body.ts`), so anything
 * this side said ABOUT the body would be a second description for the two to
 * disagree over. A refusal comes back as a refusal and the submission never
 * happens — which is what a policy is for, and what makes it observable from
 * this side rather than only from the counter's log.
 */
export function borrowedPayer(
  accountId: string,
  publicKey: PublicKey,
  nodeAccountIds: readonly AccountId[],
  leg: CarryLeg,
): BorrowedPayer {
  const signer: Signer = {
    label: 'postmaster (carried)',
    publicKey,
    sign: async (message) => {
      const answer = await leg(Buffer.from(message).toString('base64'));
      const returned = PublicKey.fromString(answer.publicKey);
      if (returned.toStringRaw() !== publicKey.toStringRaw()) {
        throw new CarryRefused(
          'STAMP_PAYMENT_FAILED',
          `the counter signed as ${returned.toStringRaw().slice(0, 16)}… and the payer account's key on consensus is ` +
            `${publicKey.toStringRaw().slice(0, 16)}…; that signature would not pay for anything`,
        );
      }
      const signature = Buffer.from(answer.signature, 'base64');
      // Verified HERE, before it is added. A signature that does not verify
      // against these bytes is a body the counter did not sign, and finding
      // that out at the network would mean finding it out with this agent's own
      // signature already on the transaction.
      if (!publicKey.verify(message, signature)) {
        throw new CarryRefused('STAMP_PAYMENT_FAILED', 'the signature the counter returned does not verify against the body it was asked to carry');
      }
      return signature;
    },
  };
  return { accountId, signer, nodeAccountIds };
}
