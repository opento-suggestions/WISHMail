/**
 * The `hcs14` resolver — §9.2's rule, read from a mirror node and nothing else.
 *
 * The rule, verbatim (§9.2): "Parse the address to an account: a UAID's
 * `nativeId`, or the account itself. Read the account's memo; it MUST be an
 * HCS-11 memo of one of two forms. `hcs-11:hcs://2/<registryTopic>` names an
 * HCS-2 registry of profile versions: read the registry's current entry; it
 * points at an HCS-1 file. `hcs-11:hcs://1/<fileTopic>` names an HCS-1 file
 * directly. In either form, read the file; it is the HCS-11 profile. Take
 * `account`, `inboundTopicId` as the doorbell, `outboundTopicId` as the log, and
 * `properties.wishmail.{manifestTopic, x25519Pub, keyEpoch}`."
 *
 * Every input is on consensus and re-obtainable, so the trust class is `math`
 * and no snapshot is carried — under the FIRST form. Under the second the file
 * is immutable but the account-to-file binding is a memo whose past values are
 * not re-obtainable, so the rule assigns `blurred` and carries the memo as a
 * snapshot (D-107).
 *
 * P-4: this reads consensus data and nothing else. A mirror node is a read
 * interface, not a broker, and nothing here is configured, keyed, or paid for.
 *
 * ONE RULE, TWO READERS (D-167). The rule below runs over a `ProfileSource` —
 * three reads, all of public data — rather than over a mirror-node client, so
 * that `resolve` and a Verifier's REPLAY are the same code and cannot drift.
 * They had drifted: §11.4 says a Verifier replays a resolution by running "the
 * profile's rule under the profile the manifest names", and `verify`'s replay
 * stopped at the registry entry because it had no way to read the profile file
 * through its own port. It said so in a comment and appraised on a partial
 * replay. D-167 makes the value recoverable only BY replay, so a partial replay
 * is no longer a shortcut — it is an inability to appraise. Hence the port.
 *
 * Conformance: T-P6-1, T-P6-2, T-P6-3, T-P8-3, T-P12-1.
 */
import { canonicalBytes, canonicalDigest, sha256hex } from '../core/canonical.js';
import { matchAgentId, parseUaid, type AgentData, type KeyOrder } from '../core/hcs14.js';
import type { ProofLocation } from '../core/locator.js';
import { proofInputs, proofLocation, type ProofInputs } from '../core/proof.js';
import { readProfile } from '../ops/declaration.js';
import type { Mirror } from '../ops/mirror.js';

/**
 * The fields the resolution proof's `output` digest covers (D-167).
 *
 * §5.3's MailCoordinates minus the three groups that are not the rule's output:
 * `resolutionProof`, which is the proof's own reference and would hash the proof
 * into itself; `trustClass` and `endorsements`, which live in `meaning`; and
 * `resolvedAt`, which is the query's clock rather than the registry's answer and
 * so is not reproducible by any later replay.
 *
 * ONE definition, because a writer and a reader both need it and a second
 * spelling would produce a digest that matches itself and nothing else
 * (CLAUDE.md §9). Canonical JSON sorts keys (RFC 8785), so only the SET of
 * fields matters, not the order they are written in.
 */
export function resolvedFieldsOf(coordinates: MailCoordinates): Record<string, unknown> {
  const { resolutionProof: _p, trustClass: _t, endorsements: _e, resolvedAt: _r, ...resolved } = coordinates;
  return resolved as unknown as Record<string, unknown>;
}

/** The digest a resolution manifest carries as its `output` (§10.2, D-167). */
export function outputDigestOf(coordinates: MailCoordinates): string {
  return sha256hex(canonicalBytes(resolvedFieldsOf(coordinates)));
}

/** §6.2's failure codes, and no others. */
export type ResolveFailure = 'RESOLVE_UNSUPPORTED_ADDRESS' | 'RESOLVE_NOT_FOUND' | 'RESOLVE_REGISTRY_UNREACHABLE';

/** §5.3's endorsement vocabulary. */
export type Endorsement = 'missing' | 'vague' | 'blurred' | 'stale' | 'timed-out' | 'withheld';

/** §5.3 MailCoordinates. */
export interface MailCoordinates {
  readonly address: string;
  readonly profile: string;
  readonly ledgerTag: string;
  readonly account: string;
  readonly doorbell: string;
  readonly log?: string;
  /**
   * The recipient's manifest topic (§5.3, D-166). `send` schedules the receipt's
   * submission here (§6.4 step 7, §10.4), and a Verifier checks that a receipt
   * landed here (T-P1-8) — which it can only do from the resolution proof's
   * output, because re-resolving now would answer at its own clock (§11.6).
   */
  readonly manifestTopic: string;
  readonly x25519Pub: string;
  readonly keyEpoch: number;
  /**
   * §5.2: a proof travels by reference. `uri` is a STRUCTURED locator and not a
   * string — "Locators and canonical locations are structured, not strings" —
   * and is null until `send` publishes the manifest (§6.2).
   */
  readonly resolutionProof: {
    readonly hash: string;
    readonly uri: { readonly ledgerTag: string; readonly topicId: string; readonly sequenceNumber: number } | null;
  };
  readonly trustClass: 'math' | 'economic-game' | 'hardware-TEE' | 'social-committee';
  readonly endorsements: readonly Endorsement[];
  readonly resolvedAt: string;
}

/** §5.2's Proof, as this rule fills it. */
export interface ResolutionProof {
  readonly rule: { readonly id: string; readonly revision: string };
  /** §5.2: {digest, locator, snapshot?} and nothing else — core/proof.ts. */
  readonly inputs: ProofInputs;
  /**
   * §5.2: "{digest} | value". For a resolution it is the DIGEST (D-167): the
   * SHA-256 of the canonical JSON of the resolved fields, which a Verifier
   * recomputes by replay and compares (§10.2, §11.4). The value is not carried.
   */
  readonly output: Record<string, unknown>;
  readonly meaning: {
    readonly statement: string;
    /** §5.2's canonical location: the resolving agent's own manifest topic (D-163). */
    readonly uri: ProofLocation;
    readonly trustClass: string;
    readonly endorsements: readonly Endorsement[];
  };
  readonly hash: string;
}

export interface Resolution {
  readonly coordinates: MailCoordinates;
  /** The manifest — the full proof, published on the sender's manifest topic by `send`. */
  readonly manifest: ResolutionProof;
  /**
   * §11.6's observation: which of HCS-14's two canonical key orders the profile's
   * `uaid` matched under, where one was present and the address was a UAID.
   */
  readonly observations: { readonly agentIdOrder?: readonly { address: string; order: KeyOrder }[] };
}

export type ResolveResult = Resolution | { readonly failure: ResolveFailure; readonly detail: string };

const ACCOUNT = /^[0-9]+\.[0-9]+\.[0-9]+$/;
const CAIP10 = /^hedera:([a-z]+):([0-9]+\.[0-9]+\.[0-9]+)$/;

/** §9.2's addresses: a UAID whose `nativeId` is a Hedera account, or the account. */
export function parseAddress(address: string): { readonly account: string; readonly uaid?: string } | null {
  const trimmed = address.trim();
  if (ACCOUNT.test(trimmed)) return { account: trimmed };
  const caip = CAIP10.exec(trimmed);
  if (caip) return { account: caip[2] as string };
  if (trimmed.startsWith('uaid:')) {
    const u = parseUaid(trimmed);
    const native = u.parameters['nativeId'] ?? '';
    const m = CAIP10.exec(native);
    if (m) return { account: m[2] as string, uaid: trimmed };
    if (ACCOUNT.test(native)) return { account: native, uaid: trimmed };
  }
  return null;
}

/** One message on a topic, as §9.2's rule needs it: its place, and its body. */
export interface SourceMessage {
  readonly sequenceNumber: number;
  readonly consensusTimestamp: string;
  /** The body parsed as JSON, or null where it is not JSON. */
  readonly body: unknown;
  /**
   * The account that PAID for the message. §9.2's rule never reads it; §9.5's
   * does, and it is the whole of `blurred`: "Where the registration's payer is
   * not the address's account, the rule assigns `blurred` — the registration is
   * on consensus, and under a key that is not the agent's." One port serves both
   * rules, so the field is here and optional, and `hol` refuses to appraise a
   * registration whose payer a source could not supply rather than assuming one.
   */
  readonly payer?: string;
}

/**
 * What §9.2's rule reads, and the whole of it: an account's memo, a topic's
 * memo, and a topic's messages in consensus order. Three reads of public data,
 * with nothing to configure and no key anywhere (P-4).
 *
 * A mirror-node client satisfies it (`mirrorSource` below) and so does a
 * Verifier's `Reader` (`tools/verify.ts`), which is the point: the rule that
 * resolves and the rule that replays are one function.
 */
export interface ProfileSource {
  accountMemo(account: string): Promise<string | null>;
  topicMemo(topicId: string): Promise<string | null>;
  topicMessages(topicId: string): Promise<readonly SourceMessage[] | null>;
}

interface MirrorAccount {
  readonly account: string;
  readonly memo?: string;
  readonly deleted?: boolean;
}
interface MirrorMessages {
  readonly messages?: {
    readonly message: string;
    readonly sequence_number: number;
    readonly consensus_timestamp: string;
    readonly payer_account_id?: string;
  }[];
  readonly links?: { readonly next?: string | null };
}
interface MirrorTopic {
  readonly topic_id: string;
  readonly memo?: string;
}

const decode = (m: { message: string }): unknown => {
  try {
    return JSON.parse(Buffer.from(m.message, 'base64').toString('utf8'));
  } catch {
    return null;
  }
};

/**
 * A `ProfileSource` over a mirror node's REST API — what `resolve` uses.
 *
 * `null` from a read is "the mirror does not hold this", which the rule turns
 * into RESOLVE_NOT_FOUND or RESOLVE_REGISTRY_UNREACHABLE as §9.2 fixes.
 */
export function mirrorSource(mirror: Mirror): ProfileSource {
  return {
    async accountMemo(account) {
      const a = await mirror.get<MirrorAccount>(`/accounts/${account}`);
      return a === null ? null : (a.memo ?? '');
    },
    async topicMemo(topicId) {
      const t = await mirror.get<MirrorTopic>(`/topics/${topicId}`);
      return t === null ? null : (t.memo ?? '');
    },
    async topicMessages(topicId) {
      // EVERY PAGE. §9.5 says an anchor is "read in full, every page" and the
      // testnet one is already past 380 messages; a reader that stopped at the
      // mirror's 100-message maximum would answer RESOLVE_NOT_FOUND for every
      // agent registered before the last hundred — a wrong answer that looks
      // exactly like a right one.
      let path: string | null = `/topics/${topicId}/messages?limit=100&order=asc`;
      const out: SourceMessage[] = [];
      let sawAnything = false;
      while (path !== null) {
        const r: MirrorMessages | null = await mirror.get<MirrorMessages>(path);
        if (r === null) return sawAnything ? out : null;
        sawAnything = true;
        for (const m of r.messages ?? []) {
          out.push({
            sequenceNumber: m.sequence_number,
            consensusTimestamp: m.consensus_timestamp,
            body: decode(m),
            ...(m.payer_account_id === undefined ? {} : { payer: m.payer_account_id }),
          });
        }
        const next: string | null = r.links?.next ?? null;
        path = next === null ? null : next.replace(/^\/api\/v1/, '');
      }
      return out;
    },
  };
}

/**
 * Resolve an address under `hcs14`.
 *
 * `ledgerTag` is the tag of the mirror node being read; a resolution is a fact
 * about one ledger (§5.1).
 */
/**
 * §5.2's Proof as this rule fills it, built in one place.
 *
 * The fixture that exercises `verify` builds its manifest through this
 * function rather than restating its shape: a Verifier's lookup compares the
 * manifest's own hash to the one the AAD bound, so a second construction that
 * ordered a field differently would produce a manifest that hashes correctly to
 * itself and to nothing else (CLAUDE.md §9).
 */
export function resolutionProofFor(
  inputs: ProofInputs,
  output: Record<string, unknown>,
  location: ProofLocation,
  endorsements: readonly Endorsement[],
  rule: { readonly id: string; readonly revision: string } = { id: 'hcs14', revision: '0.5' },
  statement = 'Declared under HCS-11 via the HCS-2 registry the account memo names.',
): ResolutionProof {
  // WHICH RULE PRODUCED IT is inside the hash, because §11.4 replays "the
  // profile's rule under the profile the manifest names": a manifest that did
  // not say would be replayed under whichever rule the reader guessed, and two
  // rules over the same locator do not produce the same output.
  const proofBody = {
    rule,
    // §5.2's `inputs` is `{digest, locator, snapshot?}` and the registered Proof
    // schema requires exactly that, closed. `core/proof.ts` says what this rule
    // puts in each and why; the material itself is hashed into `digest` and
    // re-obtained through `locator`.
    inputs,
    // §5.2 gives the output as "{digest} | value", and for a resolution it is
    // the VALUE. §11.2's ingestion table reaches the recipient's account and
    // doorbell from "the resolution manifest's output", and §11.4 requires the
    // replayed output to equal "the coordinates the manifest carries" — neither
    // of which a digest alone can answer. Found by writing the reader: verify
    // could look the manifest up and hash it, and could not learn from it which
    // doorbell the lane had to be born from (CLAUDE.md §9).
    output,
    meaning: {
      // §9.1's budget, D-167: a statement is at most N = 70 bytes, because the
      // manifest must be one HCS message and the locator at a UAID address
      // spends most of what there is. The long form this used to carry is in
      // §9.2, which is where a reader should look for what the rule does; a
      // manifest's statement is a label, not an explanation.
      statement,
      // §5.2's canonical location, as D-163 rules it: the topic THIS manifest
      // is published on — the resolving agent's own manifest topic — and not the
      // evidence the proof stands on, which is already in `inputs.locator`, and
      // not a message, which no proof can name before it is one (§6.4).
      uri: location,
      trustClass: 'math',
      endorsements: [...endorsements],
    },
  };
  return { ...proofBody, hash: canonicalDigest(proofBody) };
}

/**
 * Resolve `address` under §9.2's rule.
 *
 * `manifestTopic` is the CALLER's own manifest topic — where the proof this
 * returns would be published — and it is inside the proof's hash, because §5.2's
 * canonical location is part of `meaning` (D-163). It is not a credential and
 * not a configuration in P-4's sense: it is a public topic id, and §6.2's
 * "reads and pays nothing" is untouched. A caller that publishes nothing — a
 * Verifier re-resolving during appraisal — replays the manifest it read rather
 * than rebuilding one, so it never reaches this argument (§11.4).
 */
export async function resolveHcs14(
  source: ProfileSource,
  ledgerTag: string,
  address: string,
  manifestTopic: string,
): Promise<ResolveResult> {
  const parsed = parseAddress(address);
  if (parsed === null) {
    return { failure: 'RESOLVE_UNSUPPORTED_ADDRESS', detail: `not an hcs14 address: ${address}` };
  }

  const memo = await source.accountMemo(parsed.account);
  if (memo === null) {
    return { failure: 'RESOLVE_NOT_FOUND', detail: `no such account: ${parsed.account}` };
  }

  const endorsements: Endorsement[] = [];
  // §5.2: the LOCATOR is where a Verifier re-obtains the inputs; the DIGEST is
  // over what was read there; a SNAPSHOT is carried only where an input is not
  // re-obtainable. §9.2 gives this profile's locator as its "Inputs and
  // locator" object.
  //
  // D-167 adds `address` to it. §9.2's list did not name the address, and until
  // the output travelled by digest that was harmless: a Verifier read the
  // address out of the output. Now it must RECOMPUTE the output, and the
  // address is the rule's own first input — "parse the address to an account" —
  // so a locator that cannot re-obtain it cannot re-obtain the inputs, which is
  // what §5.2 says a locator is for. `memo` is added because §9.2's list names
  // it and this code had left it out.
  const locator: Record<string, unknown> = {
    ledgerTag,
    address,
    account: parsed.account,
    memo,
  };
  let snapshot: unknown;
  let readMaterial: Record<string, unknown> = {};

  // The two forms of §9.2, and nothing else is an HCS-11 memo.
  let fileTopic: string;
  const viaRegistry = /^hcs-11:hcs:\/\/2\/([0-9]+\.[0-9]+\.[0-9]+)$/.exec(memo);
  const viaFile = /^hcs-11:hcs:\/\/1\/([0-9]+\.[0-9]+\.[0-9]+)$/.exec(memo);

  if (viaRegistry) {
    const registryTopic = viaRegistry[1] as string;
    const entries = await source.topicMessages(registryTopic);
    if (entries === null) return { failure: 'RESOLVE_REGISTRY_UNREACHABLE', detail: registryTopic };
    // "read the registry's current entry" — the latest `register` (D-70).
    const registrations = entries
      .map((m) => ({ m, body: m.body as { p?: string; op?: string; t_id?: string } | null }))
      .filter((e) => e.body !== null && e.body.op === 'register' && typeof e.body.t_id === 'string');
    const current = registrations[registrations.length - 1];
    if (current === undefined) {
      return { failure: 'RESOLVE_NOT_FOUND', detail: `no current entry on registry ${registryTopic}` };
    }
    fileTopic = current.body?.t_id as string;
    locator['registryTopic'] = registryTopic;
    locator['registrySequence'] = current.m.sequenceNumber;
    locator['consensusTimestamp'] = current.m.consensusTimestamp;
    // §9.2's first form: "every element on consensus and re-obtainable from any
    // mirror node at any later time, unchanged, with no snapshot". What was read
    // is the registry entry and the file it names; the memo is how the rule got
    // there and is not what the proof stands on, which is why this form assigns
    // no `blurred`.
    readMaterial['registryEntry'] = current.body;
  } else if (viaFile) {
    fileTopic = viaFile[1] as string;
    // D-107: the file is on consensus and immutable, but the binding of the
    // account to it at resolution time is a memo, and a memo's past values are
    // not re-obtainable. So: `blurred`, for the binding and not for the file,
    // and the memo travels as the snapshot.
    endorsements.push('blurred');
    snapshot = { memo };
    readMaterial['memo'] = memo;
  } else {
    return { failure: 'RESOLVE_NOT_FOUND', detail: `account memo is not an HCS-11 memo of either form: ${JSON.stringify(memo)}` };
  }
  locator['profileTopic'] = fileTopic;

  const topicMemo = await source.topicMemo(fileTopic);
  if (topicMemo === null) return { failure: 'RESOLVE_NOT_FOUND', detail: `no such file topic: ${fileTopic}` };
  const chunkMessages = await source.topicMessages(fileTopic);
  if (chunkMessages === null) return { failure: 'RESOLVE_REGISTRY_UNREACHABLE', detail: fileTopic };

  const chunks = chunkMessages
    .map((m) => m.body as { o: number; c: string } | null)
    .filter((c): c is { o: number; c: string } => c !== null && typeof c.o === 'number' && typeof c.c === 'string');
  if (chunks.length === 0) return { failure: 'RESOLVE_NOT_FOUND', detail: `file topic ${fileTopic} holds no chunks` };

  let read;
  try {
    read = readProfile(topicMemo, chunks);
  } catch (e) {
    return { failure: 'RESOLVE_NOT_FOUND', detail: `the file did not decode: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (read.digest !== read.memoDigest) {
    return {
      failure: 'RESOLVE_NOT_FOUND',
      detail: `the file's digest ${read.digest} does not equal its topic memo's ${read.memoDigest}`,
    };
  }
  // The profile's own bytes, as the file topic's memo commits them (§9.2).
  readMaterial['profileDigest'] = read.digest;

  const profile = read.profile as {
    inboundTopicId?: string;
    outboundTopicId?: string;
    uaid?: string;
    display_name?: string;
    version?: string;
    properties?: { wishmail?: { manifestTopic?: string; x25519Pub?: string; keyEpoch?: number } };
  };

  const wishmail = profile.properties?.wishmail;
  // §9.2's rule takes `properties.wishmail.{manifestTopic, x25519Pub, keyEpoch}` —
  // all three. The guard had checked two of them, which is the same omission
  // D-166 found in the coordinates: a declaration missing its manifest topic is
  // not a declaration, and T-P6-3 says a profile carrying no
  // `properties.wishmail` resolves to RESOLVE_NOT_FOUND rather than to
  // coordinates with a hole in them.
  if (
    wishmail === undefined ||
    typeof wishmail.manifestTopic !== 'string' ||
    typeof wishmail.x25519Pub !== 'string' ||
    typeof wishmail.keyEpoch !== 'number'
  ) {
    return { failure: 'RESOLVE_NOT_FOUND', detail: 'the profile carries no complete properties.wishmail declaration (§9.1: account, doorbell, log?, manifestTopic, x25519Pub, keyEpoch)' };
  }
  if (typeof profile.inboundTopicId !== 'string') {
    return { failure: 'RESOLVE_NOT_FOUND', detail: 'the profile carries no inboundTopicId' };
  }

  // §9.1's dual-order comparison (D-152), where the address was a UAID and the
  // profile carries one.
  const agentIdOrder: { address: string; order: KeyOrder }[] = [];
  if (parsed.uaid !== undefined && typeof profile.uaid === 'string') {
    const want = parseUaid(parsed.uaid);
    const have = parseUaid(profile.uaid);
    if (have.parameters['nativeId'] !== want.parameters['nativeId']) {
      return { failure: 'RESOLVE_NOT_FOUND', detail: "the profile's uaid nativeId disagrees with the address" };
    }
    if (have.identifier !== want.identifier) {
      return { failure: 'RESOLVE_NOT_FOUND', detail: "the profile's uaid identifier disagrees with the address" };
    }
    const agent: AgentData = {
      registry: have.parameters['registry'] ?? 'self',
      name: profile.display_name ?? '',
      version: profile.version ?? '',
      protocol: have.parameters['proto'] ?? 'hcs-10',
      nativeId: have.parameters['nativeId'] ?? '',
      skills: [],
    };
    const order = matchAgentId(agent, have.identifier);
    if (order === null) {
      return {
        failure: 'RESOLVE_NOT_FOUND',
        detail: "the profile's uaid identifier recomputes under neither canonical order (§9.1)",
      };
    }
    agentIdOrder.push({ address, order });
  }

  // §5.1 writes a timestamp as `seconds.nanos`, and §5.3's `resolvedAt` is
  // "query time, as bound into the proof's inputs" — the same form a consensus
  // timestamp takes, because it is compared against a profile's TTL beside them.
  const now = Date.now();
  const resolvedAt = `${Math.floor(now / 1000)}.${String((now % 1000) * 1_000_000).padStart(9, '0')}`;
  // THE RESOLVED FIELDS: what §9.2's rule produced, and what a Verifier
  // recomputes by running the same rule at the same locator (§11.4). These are
  // §5.3's MailCoordinates minus the three groups that are not the rule's
  // output: `resolutionProof` (the proof's own reference — including it would
  // hash the proof into itself), `trustClass` and `endorsements` (which live in
  // `meaning`), and `resolvedAt` (the query's clock, not the registry's answer).
  const resolved = {
    address,
    profile: 'hcs14',
    ledgerTag,
    account: parsed.account,
    doorbell: profile.inboundTopicId,
    ...(typeof profile.outboundTopicId === 'string' ? { log: profile.outboundTopicId } : {}),
    // Read from properties.wishmail all along (§9.2) and, until D-166, dropped
    // on the floor: two of the three made it into the coordinates and this one
    // did not, for no stated reason. §10.4 is what needed it.
    manifestTopic: wishmail.manifestTopic,
    x25519Pub: wishmail.x25519Pub,
    keyEpoch: wishmail.keyEpoch,
  };

  // §5.2's Proof. The manifest's own canonical location is the resolver's
  // manifest topic — known before anything is resolved (D-163). The COORDINATES'
  // `resolutionProof.uri` is a reference and stays empty until `send` publishes
  // the manifest and learns its sequence number (§6.2, §6.4 step 2).
  // D-167: the output travels as `{digest}` — §5.2 already gives the shape as
  // "{digest} | value" and this proof takes the first. The value is what a
  // Verifier recomputes by replay and compares (§10.2, §11.4). What is hashed is
  // `resolved` above and nothing else, so the digest is non-circular: the
  // proof's own hash is computed over this output, and a digest over the whole
  // of §5.3 would have had to contain it.
  const manifest = resolutionProofFor(
    proofInputs(locator, readMaterial, snapshot),
    { digest: sha256hex(canonicalBytes(resolved)) },
    proofLocation(ledgerTag, manifestTopic),
    endorsements,
  );

  const coordinates: MailCoordinates = {
    ...resolved,
    resolutionProof: { hash: manifest.hash, uri: null },
    trustClass: 'math',
    endorsements: [...endorsements],
    resolvedAt,
  };

  return {
    coordinates,
    manifest,
    observations: agentIdOrder.length > 0 ? { agentIdOrder } : {},
  };
}

/**
 * Resolve an account’s OWN address under this rule — two passes, the first
 * one’s proof discarded.
 *
 * `resolveHcs14` takes the CALLER’s manifest topic because §5.2’s canonical
 * location is inside the proof’s hash (D-163), and on the very first read an
 * agent does not yet know its own. So pass one is run with the account id in
 * that slot purely to learn whether a declaration exists and what manifest
 * topic it names, and pass two is run with the real one. Nothing from pass one
 * is published, carried, or compared: only its `manifestTopic` is read, from the
 * coordinates, which is the registry’s answer and not the proof’s.
 *
 * IT IS HERE AND NOT IN A CALLER because both parties run it. The agent runs
 * it on its own output before `generate_mailbox` returns, and the counter runs it
 * on the mailbox it carried before it will issue a receipt naming those
 * coordinates (D-168). Two spellings of §9.2’s two-pass rule would be two
 * places for it to drift.
 */
export async function resolveSelf(
  source: ProfileSource,
  ledgerTag: string,
  account: string,
): Promise<MailCoordinates | null> {
  const first = await resolveHcs14(source, ledgerTag, account, account);
  if ('failure' in first) return null;
  const second = await resolveHcs14(source, ledgerTag, account, first.coordinates.manifestTopic);
  if ('failure' in second) return null;
  return second.coordinates;
}
