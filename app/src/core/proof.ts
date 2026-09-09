/**
 * §5.2's Proof, in one place — because three writers produce one and each of
 * them was producing a different shape.
 *
 * THE DEFECT THIS FILE EXISTS FOR (Claude Code, 2026-09-09, found by
 * `check:freeze`). §5.2 fixes a proof's `inputs` as `{digest, locator,
 * snapshot?}` — "digest of the canonical input bytes; a structured locator that
 * dereferences to them; for inputs not on consensus, a snapshot of the bytes
 * read" — and `spec/schemas/proof.schema.json` requires exactly that, closed.
 * Every manifest this implementation produced put the input *material* directly
 * in `inputs`: the resolver's `{ledgerTag, account, memo, registryTopic, …}`,
 * the slip's `{resolutionProofHash, doorbell, request, log, window}`. Each
 * validated against nothing, because nothing had ever validated a manifest
 * against the Proof schema. All three would have been refused by the schema
 * Step 4 is about to freeze, and after the freeze the only way to make them
 * agree would have been a new minor version. It is the profile-version defect
 * of Step 3 exactly: internally consistent, correctly hashed, and unreadable by
 * the rule it exists for (CLAUDE.md §9).
 *
 * WHAT GOES WHERE, and this part is MINE, read off §5.2 with §9.2 and §10.5
 * beside it:
 *
 *   locator   the coordinates a Verifier re-obtains the inputs FROM. §9.2 calls
 *             its own object "Inputs and locator" and gives it as one object;
 *             the Proof schema types `locator` as an object with no fixed
 *             properties, "its shape is the profile's or the proof kind's
 *             (§9, §10)". So §9.2's object is the locator.
 *   digest    over the canonical JSON of what was actually READ at that
 *             locator — the registry entry and the profile under §9.2's first
 *             form, the memo and the profile under its second. This is what
 *             §11.4's replay compares against after re-obtaining.
 *   snapshot  present exactly where an input is not re-obtainable: §9.2's
 *             second form carries the memo, and every non-consensus profile
 *             carries the bytes it read (§9.1, T-P6-2).
 *
 * The hash is unchanged in rule: SHA-256 over the canonical JSON of
 * {rule, inputs, output, meaning}, `hash` absent (§5.1).
 */
import { canonicalBytes, canonicalDigest, sha256hex } from './canonical.js';

/** §2.2's endorsements. */
export type Endorsement = 'missing' | 'vague' | 'blurred' | 'stale' | 'timed-out' | 'withheld';

/** §5.2's `inputs`, and nothing else may be in it — the schema is closed. */
export interface ProofInputs {
  readonly digest: string;
  readonly locator: Record<string, unknown>;
  readonly snapshot?: unknown;
}

/** §5.2's proof, sealed: the four parts and the hash over them. */
export interface Proof {
  readonly rule: { readonly id: string; readonly revision: string };
  readonly inputs: ProofInputs;
  readonly output: unknown;
  readonly meaning: {
    readonly statement: string;
    readonly uri: Record<string, unknown>;
    readonly trustClass: 'math' | 'economic-game' | 'hardware-TEE' | 'social-committee';
    readonly endorsements: readonly Endorsement[];
  };
  readonly hash: string;
}

/**
 * Build §5.2's `inputs` from what was read and where it is re-obtained.
 *
 * `read` is hashed as canonical JSON; `locator` is carried as it is given;
 * `snapshot` is present only when passed, because a snapshot on a consensus
 * profile would be a claim that the input is not re-obtainable (§9.1).
 */
export function proofInputs(
  locator: Record<string, unknown>,
  read: unknown,
  snapshot?: unknown,
): ProofInputs {
  const digest = sha256hex(canonicalBytes(read));
  return snapshot === undefined ? { digest, locator } : { digest, locator, snapshot };
}

/** Seal a proof: the four parts, then the hash over them (§5.1, §5.2). */
export function sealProof(parts: Omit<Proof, 'hash'>): Proof {
  return { ...parts, hash: canonicalDigest(parts as unknown as Record<string, unknown>) };
}
