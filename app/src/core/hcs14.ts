/**
 * HCS-14 universal agent IDs — the `uaid:aid:` form §9.2 accepts and the
 * HCS-11 profile requires.
 *
 * FETCHED 2026-09-08 from `hiero-ledger/hiero-consensus-specifications` at
 * commit `7046156c`, `docs/standards/hcs-14/index.md`, whose blob hashes to
 * `969de3aa2fccaea10f50165f82620ae6172b017d` — the pin §1.6 names, verified
 * with `git hash-object` rather than assumed.
 *
 * The normative steps (`index.md:538-549`, "implementations shall perform steps
 * 1–6"):
 *
 *   1. validate the required fields
 *   2. normalize — lowercase `registry` and `protocol`, trim every string
 *   3. sort skills numerically and object keys lexicographically
 *   4. serialize to canonical JSON with sorted keys
 *   5. SHA-384 over the UTF-8 bytes
 *   6. Base58
 *
 * The canonical object is SIX fields and no others (`index.md:270-283`):
 * `registry`, `name`, `version`, `protocol`, `nativeId`, `skills`.
 * "Communication details (endpoints, topic IDs, etc.) are NOT included in the
 * hash", which is why an agent's identifier survives a change of topics.
 *
 * TWO DEFECTS IN THE STANDARD, recorded rather than worked around:
 *
 *   - Its test vectors publish the expected UAID as the literal string
 *     `uaid:aid:{base58hash};…` (`index.md:709`, `:739`) — a placeholder, not a
 *     value. HCS-14 therefore courts nothing, and this module is checked
 *     against a live agent's on-chain UAID instead (`hcs14.check.ts`).
 *   - It contradicts itself on the parameters. The reference function emits
 *     `registry, proto, nativeId, uid` (`index.md:583-587`); test vector 1
 *     shows `uid, registry, nativeId` with no `proto` at all (`index.md:709`).
 *     §9.2 states the order as `uid, registry, proto, nativeId, domain`, and
 *     that is what this emits — safely, because §9.2 also fixes that only the
 *     identifier and `nativeId` are compared and "parameters outside the
 *     identifier are routing hints and are not compared".
 *
 * Conformance: T-P6-3 (the `hcs14` rule), §9.2.
 */
import { createHash } from 'node:crypto';

/** The six canonical fields, before normalization (`index.md:274-281`). */
export interface AgentData {
  readonly registry: string;
  readonly name: string;
  readonly version: string;
  readonly protocol: string;
  readonly nativeId: string;
  readonly skills?: readonly number[];
}

/** The Bitcoin Base58 alphabet, which `bs58.encode` in the reference uses. */
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** Base58, leading zero bytes preserved as '1's, as Base58 always does. */
export function base58(bytes: Buffer): string {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros += 1;

  // Starts EMPTY, not [0]: seeding a zero digit appends a spurious '1' to every
  // result whose value is zero, so `base58(Buffer.alloc(0))` returned '1' and
  // `base58(<00>)` returned '11'. The main path was unaffected — a SHA-384
  // digest is neither empty nor all zeros — which is exactly why it needed a
  // test at the edges rather than one live value.
  const digits: number[] = [];
  for (let i = zeros; i < bytes.length; i += 1) {
    let carry = bytes[i] as number;
    for (let j = 0; j < digits.length; j += 1) {
      carry += (digits[j] as number) << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }

  let out = '1'.repeat(zeros);
  for (let i = digits.length - 1; i >= 0; i -= 1) out += B58[digits[i] as number];
  return out;
}

/**
 * Steps 2–4: the normalized object, and the bytes that are hashed.
 *
 * `JSON.stringify(canonical, Object.keys(canonical).sort())` is what the
 * reference does — a replacer ARRAY, which both filters the keys and fixes
 * their order. It is not RFC 8785, and for these six fields the two agree; the
 * reference's form is followed because P-9 is conformance to the pinned blob
 * and not to a better idea.
 */
/**
 * Which key order the canonical JSON uses — the open question of this module.
 *
 * `normative` is what the standard's normative step 3 says ("sort ...
 * object keys lexicographically") and what its reference code does
 * (`Object.keys(canonical).sort()`, `index.md:585`).
 *
 * `example` puts `skills` first and the rest alphabetically, which is what the
 * standard's OWN "Canonical JSON" example shows (`index.md:697-706`) and what
 * every agent on the ledger actually has: it reproduces the live testnet
 * agent's on-chain identifier exactly, and `normative` does not
 * (`hcs14.check.ts`).
 *
 * The two produce different identifiers for the same agent. Which one WISHMail
 * emits is Sonic's ruling and not this module's, so there is no default: every
 * caller names an order, and `CANONICAL_ORDER` stays `undefined` until the
 * ruling lands, at which point it becomes the one answer and the callers stop
 * naming it.
 */
export type KeyOrder = 'normative' | 'example';

/**
 * The order WISHMail EMITS for its own declaration. Unruled: ledger §G item 12.
 *
 * This is not the same question as which orders a rule ACCEPTS. §9.1 settles
 * that (D-152): every rule accepts either, normative first. What is still open
 * is the one order our own profile's `uaid` is written under, and it is open
 * because an HCS-1 file topic has no admin key, so the choice is permanent.
 */
export const CANONICAL_ORDER: KeyOrder | undefined = undefined;

export function canonicalAgentJson(agent: AgentData, order: KeyOrder): string {
  for (const [field, value] of Object.entries({
    registry: agent.registry,
    name: agent.name,
    version: agent.version,
    protocol: agent.protocol,
    nativeId: agent.nativeId,
  })) {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error(`hcs14: missing required field ${field} (index.md:544)`);
    }
  }

  const canonical = {
    registry: agent.registry.toLowerCase().trim(),
    name: agent.name.trim(),
    version: agent.version.trim(),
    protocol: agent.protocol.toLowerCase().trim(),
    nativeId: agent.nativeId.trim(),
    skills: [...(agent.skills ?? [])].sort((a, b) => a - b),
  };

  if (order === 'normative') {
    // The reference code's form: a replacer ARRAY, which both filters the keys
    // and fixes their order. Not RFC 8785; for these six fields they agree.
    return JSON.stringify(canonical, Object.keys(canonical).sort() as never);
  }
  // The standard's own example, and what is on the ledger: skills first.
  return JSON.stringify({
    skills: canonical.skills,
    name: canonical.name,
    nativeId: canonical.nativeId,
    protocol: canonical.protocol,
    registry: canonical.registry,
    version: canonical.version,
  });
}

/** Steps 5–6: the identifier itself, without the `uaid:aid:` prefix. */
export function agentIdHash(agent: AgentData, order: KeyOrder): string {
  return base58(
    createHash('sha384').update(Buffer.from(canonicalAgentJson(agent, order), 'utf8')).digest(),
  );
}

/** The routing parameters, in the order §9.2 states. */
export interface UaidParameters {
  /** §9.2: the account's HCS-10 `operator_id`, `inboundTopicId@accountId`. */
  readonly uid?: string;
  readonly domain?: string;
}

/**
 * The full `uaid:aid:<hash>;<parameters>` of §9.2.
 *
 * Parameter order is §9.2's — `uid, registry, proto, nativeId, domain` — and
 * `registry`, `proto` and `nativeId` come from the same values that were
 * hashed, so the identifier and the `nativeId` §9.2 compares cannot disagree
 * with each other.
 */
export function uaid(agent: AgentData, parameters: UaidParameters, order: KeyOrder): string {
  const params: string[] = [];
  if (parameters.uid !== undefined) params.push(`uid=${parameters.uid}`);
  params.push(`registry=${agent.registry.toLowerCase().trim()}`);
  params.push(`proto=${agent.protocol.toLowerCase().trim()}`);
  params.push(`nativeId=${agent.nativeId.trim()}`);
  if (parameters.domain !== undefined) params.push(`domain=${parameters.domain}`);
  return `uaid:aid:${agentIdHash(agent, order)};${params.join(';')}`;
}

/**
 * §9.1's dual-order match: recompute the identifier under the **normative**
 * order first and, if that does not match, under the **example** order; accept
 * a match under either; report which matched.
 *
 * The normative order is tried first because it is the one the standard marks
 * normative, and trying it first is what makes the fallback a fallback rather
 * than a preference. `null` is "matches under neither", which is a mismatch and
 * not a third order.
 *
 * A Verifier reports the answer under `observations.agentIdOrder` (§11.6): it
 * is a fact about how the rule found its match and it bears on no standing,
 * which is exactly what an observation is.
 *
 * Conformance: T-P6-3, T-P6-5.
 */
export function matchAgentId(agent: AgentData, identifier: string): KeyOrder | null {
  for (const order of ['normative', 'example'] as const) {
    if (agentIdHash(agent, order) === identifier) return order;
  }
  return null;
}

/**
 * Parse a UAID far enough for §9.2's comparison: "its identifier and `nativeId`
 * MUST agree with the address when the address was a UAID; parameters outside
 * the identifier are routing hints and are not compared."
 */
export function parseUaid(value: string): {
  readonly method: 'aid' | 'did';
  readonly identifier: string;
  readonly parameters: Readonly<Record<string, string>>;
} {
  const m = /^uaid:(aid|did):([^;]+)(;.*)?$/.exec(value.trim());
  if (m === null) throw new Error(`hcs14: not a uaid:aid or uaid:did — ${value}`);
  const parameters: Record<string, string> = {};
  for (const part of (m[3] ?? '').split(';')) {
    if (part === '') continue;
    const eq = part.indexOf('=');
    if (eq > 0) parameters[part.slice(0, eq)] = part.slice(eq + 1);
  }
  return { method: m[1] as 'aid' | 'did', identifier: m[2] as string, parameters };
}
