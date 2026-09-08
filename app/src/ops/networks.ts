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
  /** What a rate-priced method reads at purchase (§14.3, D-136, D-143). */
  readonly rateSource: { readonly url: string; readonly pair: string; readonly hbarId: string; readonly cite: string } | null;
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
      url: 'https://api.saucerswap.finance/tokens',
      pair: 'HBAR/USD',
      hbarId: '0.0.0',
      cite:
        'D-143; FETCHED 2026-09-07 — /tokens returns HBAR as id "0.0.0" with priceUsd, so the price list ' +
        'inherits that identifier rather than inventing one. The singular /tokens/{id} endpoint rejects 0.0.0, ' +
        'so the read is the list filtered to id === "0.0.0". The pair is HBAR/USD and not a testnet USDC pool ratio, ' +
        'which prices at pool noise.',
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
