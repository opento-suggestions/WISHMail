/**
 * D-147's provisioning template, as D-150 leaves it — the six rows, in one place.
 *
 * Every agent WISHMail provisions gets the same six topics with the same
 * declared shapes, whoever pays for them: the Postmaster's own agent, which
 * `ops/steps.ts` provisioned in Steps 2 and 3, and every Correspondent, which
 * `sdk/mailbox.ts` provisions for itself under `generate_mailbox` (D-159).
 *
 * THE SHAPES ARE HERE AND NOT IN EITHER CALLER, because a second spelling of a
 * rule is a second place for it to be wrong, and this project has already paid
 * for that once: `ops/declaration.ts` carried its own copy of `hcs1File`'s chunk
 * loop with the same off-by-thirteen bug, and it went unseen because the two
 * paths never produced the same input. Two provisioners that agreed about a
 * doorbell's fee today and disagreed about its exempt list tomorrow would be
 * the same failure with a permanent artefact at the end of it: a topic has no
 * second creation.
 *
 * Each row names the standard's own sentence as its warrant, because the shape
 * is not ours — §4.4's MUST selects HCS-10's fee-gated inbound option, and
 * HCS-1 is what forbids a file topic an admin key.
 *
 * Conformance: T-P7-4, T-P17-1, T-P17-3.
 */

/** D-138: a deployment fact, not specification. The value recon observed on every live HCS-10 topic. */
export const HCS10_TTL = 60;
/** §9.1: a manifest topic's memo. */
export const MANIFEST_MEMO = 'wishmail:manifest:1';
/** §14.3's price topic. Not part of the template — the Postmaster has one and an agent has none. */
export const PRICE_TOPIC_MEMO = 'wishmail:prices:1';

/**
 * A topic's DECLARED shape: what is asked for at creation and what is asserted
 * from the mirror afterwards, in one object, so that the second cannot drift
 * from the first (T-P17-1: "the policy is recorded at creation").
 */
export interface TopicShape {
  readonly memo: string;
  readonly submitKey: string | null;
  readonly adminKey: string | null;
  readonly feeScheduleKey: null;
  readonly fee: { readonly amount: number; readonly collector: string; readonly token: string } | null;
  readonly feeExemptKeys: readonly string[];
  readonly autoRenewAccount: string;
  readonly warrant: string;
}

/** What every row of the template needs to know about the agent it is for. */
export interface TemplateSubject {
  /** The agent's account. Row 1's memo carries it. */
  readonly account: string;
  /** The agent's public key, raw hex — the key every row of the template names. */
  readonly publicKey: string;
  /** §4.4's collector: the Postmaster's treasury. */
  readonly treasury: string;
  /** $POSTAGE (§4.1). */
  readonly stampToken: string;
  /**
   * Who pays a topic's renewal. A PAYER role and not a key (D-47): an
   * auto-renew account is not an admin, submit or fee-schedule key, it signs
   * nothing, and it authorises nothing on the topic. For the Postmaster's own
   * agent this is the operator; for a Correspondent it is that Correspondent's
   * operator, which is the same relation with a different party in it.
   */
  readonly autoRenewAccount: string;
}

/**
 * Row 1 — the doorbell: HCS-10 inbound, fee-gated at one stamp to the treasury,
 * with the agent's own key exempt so it can answer its own door (D-137/D-138).
 *
 * The exemption is not a convenience: HCS-10 has the acceptor post
 * `connection_created` on its OWN inbound topic (`index.md:498`), so without it
 * an agent would pay a stamp to answer every request it received. T-P7-4 is the
 * test, in both halves — one stamp from a stranger, zero from the owner.
 */
export function doorbell(s: TemplateSubject): TopicShape {
  // THE OWNER IS NOT OPTIONAL. HCS-10's inbound memo names the account the door
  // belongs to, and `hcs-10:0:60:0:` with nothing after it is not that memo —
  // it is a door with no house. A topic cannot be un-created, so this refuses
  // where it can still be refused: before the shape reaches a TopicCreate.
  // Measured, not supposed: on 2026-09-11 `generate_mailbox` ran on a home whose
  // purchase had not happened, and 0.0.10487041 and 0.0.10487067 are on
  // hedera:testnet permanently, each with this memo (app/OPERATIONS.md, the
  // Gate Zero divergence).
  if (s.account === '') {
    throw new Error(
      'the doorbell memo has no owner: an HCS-10 inbound topic names the account it belongs to, and this agent has ' +
        'no account yet. Buy one with `buy_stamp` and `provision` — the purchase creates the account (§4.6, HIP-542).',
    );
  }
  return {
    memo: `hcs-10:0:${HCS10_TTL}:0:${s.account}`,
    submitKey: null,
    adminKey: s.publicKey,
    feeScheduleKey: null,
    fee: { amount: 1, collector: s.treasury, token: s.stampToken },
    feeExemptKeys: [s.publicKey],
    autoRenewAccount: s.autoRenewAccount,
    warrant:
      'D-138/D-147 row 1 · §4.4’s MUST selects HCS-10’s fee-gated inbound option (index.md:113) · ' +
      'D-137’s exemption · no fee schedule key: the fee is immutable at birth',
  };
}

/** Row 2 — the log: HCS-10 outbound, the agent's alone to write. */
export function log(s: TemplateSubject): TopicShape {
  return {
    memo: `hcs-10:0:${HCS10_TTL}:1`,
    submitKey: s.publicKey,
    adminKey: s.publicKey,
    feeScheduleKey: null,
    fee: null,
    feeExemptKeys: [],
    autoRenewAccount: s.autoRenewAccount,
    warrant: 'D-138/D-147 row 2 · index.md:114 “Has submit key (only agent can write)”',
  };
}

/** Row 3 — the manifest topic (§9.1): sole submit key the agent's, and nothing else on it. */
export function manifest(s: TemplateSubject): TopicShape {
  return {
    memo: MANIFEST_MEMO,
    submitKey: s.publicKey,
    adminKey: s.publicKey,
    feeScheduleKey: null,
    fee: null,
    feeExemptKeys: [],
    autoRenewAccount: s.autoRenewAccount,
    warrant: 'D-138/D-147 row 3 · §9.1:1255 a manifest topic MUST have the agent’s key as its sole submit key (T-P17-3)',
  };
}

/** Row 5 — the HCS-2 declaration registry, indexed 0 so prior entries stay readable (T-P8-3). */
export function declRegistry(s: TemplateSubject, memo: string): TopicShape {
  return {
    memo,
    submitKey: s.publicKey,
    adminKey: s.publicKey,
    feeScheduleKey: null,
    fee: null,
    feeExemptKeys: [],
    autoRenewAccount: s.autoRenewAccount,
    warrant: 'D-147 row 5 · indexed 0 so prior entries stay readable at their consensus timestamps (T-P8-3)',
  };
}

/**
 * Row 6 — the HCS-1 profile file (D-150). **No admin key**: HCS-1 marks a file
 * topic that has one invalid and ignores it (`hcs-1.md:48-49`), so §4.6's
 * "admin key set to the agent's" cannot reach it and the amended sentence says
 * so. The memo is the profile's SHA-256 before compression, which is why the
 * profile must be final before this topic can exist.
 */
export function profileFile(s: TemplateSubject, memo: string): TopicShape {
  return {
    memo,
    submitKey: s.publicKey,
    adminKey: null,
    feeScheduleKey: null,
    fee: null,
    feeExemptKeys: [],
    autoRenewAccount: s.autoRenewAccount,
    warrant:
      'D-150 row 6 · hcs-1.md:48-49 — a file topic with an admin key is marked invalid and ignored, ' +
      'so it has none and the submit key is the agent’s',
  };
}
