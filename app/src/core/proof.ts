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
 * THE SECOND HALF, ruled 2026-09-09 as D-163 (ledger §G item 16, closed).
 * `meaning.uri` is the proof's CANONICAL LOCATION, and a location is
 * `{ledgerTag, topicId}` — **the topic this manifest is published on**, and no
 * sequence number. The reason is the same defect `check:freeze` surfaced: §5.1
 * hashes `meaning` into the proof, §6.2 fixes that hash at `resolve` time, and
 * §6.4 step 2 publishes the manifest afterwards with the AAD already binding it,
 * so no manifest can carry its own publication locator. Every writer knows its
 * TOPIC before it writes — the sender's manifest topic for a resolution proof
 * and for a slip, the recipient's for a receipt, which the sender already
 * targets in the ScheduleCreate — and the manifest there is found by hash, which
 * is what §9.1 has said all along: "a manifest that recomputes to that hash is
 * the one the envelope meant, whoever published it."
 *
 * What this code took BEFORE the ruling, recorded because a reader of the diff
 * will want it: each writer named the EVIDENCE it stood on. The resolver named
 * the HCS-1 profile file topic; the slip named its own log entry; the receipt
 * named sequence number 7, which nobody could have known, because the manifest
 * lands only when the recipient signs and the bytes are pre-filled before that.
 * All three now name a manifest topic.
 *
 * The hash is unchanged in rule: SHA-256 over the canonical JSON of
 * {rule, inputs, output, meaning}, `hash` absent (§5.1).
 */
import { canonicalBytes, canonicalDigest, sha256hex } from './canonical.js';
import type { ProofLocation } from './locator.js';

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
    /** §5.2's canonical location: the TOPIC this manifest is published on (D-163). */
    readonly uri: ProofLocation;
    readonly trustClass: 'math' | 'economic-game' | 'hardware-TEE' | 'social-committee';
    readonly endorsements: readonly Endorsement[];
  };
  readonly hash: string;
}

/**
 * The location a manifest published on `manifestTopic` is found at (§5.2, §9.1).
 *
 * One function rather than an object literal in four places, for the same reason
 * `proofInputs` is one function: a proof's hash covers its meaning, so a second
 * construction that spelled a field differently would produce a manifest that
 * hashes correctly to itself and to nothing else (CLAUDE.md §9).
 */
export function proofLocation(ledgerTag: string, manifestTopic: string): ProofLocation {
  return { ledgerTag, topicId: manifestTopic };
}

/**
 * §11.1's lookup, as a predicate over what a topic holds.
 *
 * "Read the topic the proof's canonical location names for a message whose body
 * recomputes to the proof's hash." Content-addressed, so the caller supplies the
 * bodies it read from that topic and this decides which of them, if any, is the
 * manifest. Absence is T-P6-7 and is a downgrade, never an error (P-12).
 */
export function manifestAmong(
  bodies: readonly Record<string, unknown>[],
  hash: string,
): Record<string, unknown> | null {
  for (const body of bodies) {
    if (body['hash'] !== hash) continue;
    if (canonicalDigest(body, 'hash') !== hash) continue;
    return body;
  }
  return null;
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
