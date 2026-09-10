/**
 * Per-network constants, keyed by `HEDERA_NETWORK`.
 *
 * The tiering these obey (Sonic, 2026-09-08):
 *
 *   `.env`                       secrets, the network selector, runtime locations
 *   this table                   per-network constants, committed and reviewable
 *   `spec/pins.json`             §18.4's set — the standards pins and the stamp token (§4.1)
 *   `app/deployment/<net>.json`  every other fact about one deployment
 *
 * Nothing here is a secret, and nothing here is an entity this deployment
 * created — those live in the ops record, and the stamp token additionally in
 * `spec/pins.json` because §4.1 puts it there. A constant only belongs here if
 * it is true of the *network* rather than of our deployment on it.
 *
 * Every value carries its citation, because a number without one is how a
 * second-hand assertion enters a repository (the exposure D-135 closed).
 */

export interface NetworkConstants {
  readonly ledgerTag: 'hedera:testnet' | 'hedera:mainnet';
  readonly deployed: boolean;
  readonly mirrorNodeUrl: string;
  /** The `x402-usdc` leg's asset (§14.2, D-132). */
  readonly usdc: { readonly assetId: string; readonly decimals: number; readonly cite: string } | null;
  /** Where the USDC leg settles (§14.2, D-132). */
  readonly facilitator: { readonly url: string; readonly feePayer: string; readonly scheme: string; readonly cite: string } | null;
  /**
   * What a rate-priced method reads at purchase (§14.3, D-136, D-143, D-170).
   *
   * `superseded` is not decoration. A price schedule is the SEQUENCE of messages
   * on the price topic and a published message is never edited (§14.3), so the
   * messages already on consensus name the source they named — and
   * `priceListStep.confirm` rebuilds sequence 1 and compares it byte-for-byte on
   * every provisioning run. A constants file that could describe only the
   * current source would make that comparison fail the moment the source moved,
   * and the fix would be to edit a message that cannot be edited.
   */
  readonly rateSource:
    | {
        readonly url: string;
        readonly pair: string;
        readonly hbarId: string;
        readonly cite: string;
        /** Sources earlier messages on the price topic name, and still name. */
        readonly superseded?: readonly { readonly url: string; readonly pair: string; readonly why: string }[];
      }
    | null;
  /**
   * Transaction-fee caps, in hbar. A cap is not a charge: the network charges
   * what it charges and the cap only has to be above it.
   */
  readonly feeCaps: {
    readonly feeGatedTopicCreate: number;
    readonly tokenCreate: number;
    readonly plainTopicCreate: number;
    readonly cite: string;
  };
}

export const NETWORKS: Readonly<Record<string, NetworkConstants>> = {
  testnet: {
    ledgerTag: 'hedera:testnet',
    deployed: true,
    mirrorNodeUrl: 'https://testnet.mirrornode.hedera.com/api/v1',
    usdc: {
      assetId: '0.0.429274',
      decimals: 6,
      cite: 'D-132; FETCHED 2026-09-07 from https://x402.org/facilitator/supported and confirmed on the mirror node',
    },
    facilitator: {
      url: 'https://x402.org/facilitator',
      feePayer: '0.0.9185802',
      scheme: 'exact',
      cite: 'D-132 (Sonic 2026-09-07); /supported returned x402Version 2, scheme exact, network hedera:testnet, extra.feePayer 0.0.9185802',
    },
    rateSource: {
      url: 'https://testnet.mirrornode.hedera.com/api/v1/network/exchangerate',
      pair: 'HBAR/USD',
      hbarId: '0.0.0',
      cite:
        'D-170; FETCHED 2026-09-09 — GET /api/v1/network/exchangerate?timestamp=<t> returns the rate record in ' +
        'force at t as {current_rate {cent_equivalent, hbar_equivalent, expiration_time}, next_rate, timestamp}, ' +
        'deterministically, and a query at the returned record’s own timestamp returns that same record. It is the ' +
        'NETWORK’s rate and therefore consensus data: any stranger holding a receipt’s rate.at can obtain exactly what ' +
        'the Postmaster read, which is what makes T-P11-4 checkable on a rate-priced method. Value is USD per ℏ = ' +
        'cent_equivalent / (100 × hbar_equivalent), computed in integers and truncated to the arithmetic’s own scale.',
      superseded: [
        {
          url: 'https://api.saucerswap.finance/tokens',
          pair: 'HBAR/USD',
          why:
            'D-143, sequences 1 and 2 on 0.0.10426551. A DEX spot price cannot be re-obtained at a past ' +
            'timestamp by anyone, so a receipt priced under it is right and unprovable and P-12 downgrades what ' +
            'cannot be replayed (D-170, LIMITATIONS). Those two messages are on consensus and are never edited: ' +
            'a schedule is the sequence of messages, and sequence 3 supersedes them by landing after them.',
        },
      ],
    },
    feeCaps: {
      feeGatedTopicCreate: 100,
      tokenCreate: 40,
      plainTopicCreate: 20,
      cite:
        'FETCHED 2026-09-08 by the HIP-991 probe: a fee-gated TopicCreateTransaction capped at 20 ℏ returned ' +
        'INSUFFICIENT_TX_FEE — which is a cap, not a rejection of the fee configuration. The successful create ' +
        'was capped at 100 ℏ and charged far less.',
    },
  },

  mainnet: {
    ledgerTag: 'hedera:mainnet',
    // §15.5: hedera:mainnet is defined and undeployed at this version. The row
    // exists so the shape is stated, not so it can be selected.
    deployed: false,
    mirrorNodeUrl: 'https://mainnet-public.mirrornode.hedera.com/api/v1',
    usdc: null,
    facilitator: null, // ledger §H: no x402 facilitator for hedera:mainnet exists anywhere (D-132)
    rateSource: null,
    feeCaps: {
      feeGatedTopicCreate: 100,
      tokenCreate: 40,
      plainTopicCreate: 20,
      cite: 'carried from testnet; unverified on mainnet, which §15.5 leaves undeployed',
    },
  },
};

export function networkConstants(network: string): NetworkConstants {
  const n = NETWORKS[network];
  if (!n) throw new Error(`HEDERA_NETWORK "${network}" is not in app/src/ops/networks.ts`);
  if (!n.deployed) {
    throw new Error(`HEDERA_NETWORK "${network}" is defined and undeployed at this version (§15.5)`);
  }
  return n;
}
