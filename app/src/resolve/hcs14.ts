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
 * P-4: this reads a mirror node's REST API directly. A mirror node is a read
 * interface, not a broker, and nothing here is configured, keyed, or paid for.
 *
 * Conformance: T-P6-1, T-P6-2, T-P6-3, T-P8-3, T-P12-1.
 */
import { canonicalDigest } from '../core/canonical.js';
import { matchAgentId, parseUaid, type AgentData, type KeyOrder } from '../core/hcs14.js';
import { readProfile } from '../ops/declaration.js';
import type { Mirror } from '../ops/mirror.js';

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
  readonly inputs: Record<string, unknown>;
  /** §5.2: "{digest} | value". For a resolution it is the coordinates themselves (§11.2, §11.4). */
  readonly output: Record<string, unknown>;
  readonly meaning: {
    readonly statement: string;
    readonly uri: Record<string, unknown>;
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

interface MirrorAccount {
  readonly account: string;
  readonly memo?: string;
  readonly deleted?: boolean;
}
interface MirrorMessages {
  readonly messages?: { readonly message: string; readonly sequence_number: number; readonly consensus_timestamp: string }[];
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
  inputs: Record<string, unknown>,
  output: Record<string, unknown>,
  meaningUri: Record<string, unknown>,
  endorsements: readonly Endorsement[],
): ResolutionProof {
  const proofBody = {
    rule: { id: 'hcs14', revision: '0.5' },
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
      statement:
        'The account named by this address declares these coordinates under HCS-11, through the HCS-2 registry its memo names, in an HCS-1 file whose topic memo is the digest of the profile it holds.',
      uri: meaningUri,
      trustClass: 'math',
      endorsements: [...endorsements],
    },
  };
  return { ...proofBody, hash: canonicalDigest(proofBody) };
}

export async function resolveHcs14(
  mirror: Mirror,
  ledgerTag: string,
  address: string,
): Promise<ResolveResult> {
  const parsed = parseAddress(address);
  if (parsed === null) {
    return { failure: 'RESOLVE_UNSUPPORTED_ADDRESS', detail: `not an hcs14 address: ${address}` };
  }

  const account = await mirror.get<MirrorAccount>(`/accounts/${parsed.account}`);
  if (account === null) {
    return { failure: 'RESOLVE_NOT_FOUND', detail: `no such account: ${parsed.account}` };
  }
  const memo = account.memo ?? '';

  const endorsements: Endorsement[] = [];
  const inputs: Record<string, unknown> = {
    ledgerTag,
    account: parsed.account,
    memo,
  };

  // The two forms of §9.2, and nothing else is an HCS-11 memo.
  let fileTopic: string;
  const viaRegistry = /^hcs-11:hcs:\/\/2\/([0-9]+\.[0-9]+\.[0-9]+)$/.exec(memo);
  const viaFile = /^hcs-11:hcs:\/\/1\/([0-9]+\.[0-9]+\.[0-9]+)$/.exec(memo);

  if (viaRegistry) {
    const registryTopic = viaRegistry[1] as string;
    const entries = await mirror.get<MirrorMessages>(`/topics/${registryTopic}/messages?limit=100&order=asc`);
    if (entries === null) return { failure: 'RESOLVE_REGISTRY_UNREACHABLE', detail: registryTopic };
    // "read the registry's current entry" — the latest `register` (D-70).
    const registrations = (entries.messages ?? [])
      .map((m) => ({ m, body: decode(m) as { p?: string; op?: string; t_id?: string } | null }))
      .filter((e) => e.body !== null && e.body.op === 'register' && typeof e.body.t_id === 'string');
    const current = registrations[registrations.length - 1];
    if (current === undefined) {
      return { failure: 'RESOLVE_NOT_FOUND', detail: `no current entry on registry ${registryTopic}` };
    }
    fileTopic = current.body?.t_id as string;
    inputs['registryTopic'] = registryTopic;
    inputs['registrySequence'] = current.m.sequence_number;
    inputs['consensusTimestamp'] = current.m.consensus_timestamp;
  } else if (viaFile) {
    fileTopic = viaFile[1] as string;
    // D-107: the file is on consensus and immutable, but the binding of the
    // account to it at resolution time is a memo, and a memo's past values are
    // not re-obtainable. So: `blurred`, for the binding and not for the file,
    // and the memo travels as the snapshot.
    endorsements.push('blurred');
    inputs['snapshot'] = { memo };
  } else {
    return { failure: 'RESOLVE_NOT_FOUND', detail: `account memo is not an HCS-11 memo of either form: ${JSON.stringify(memo)}` };
  }
  inputs['profileTopic'] = fileTopic;

  const topic = await mirror.get<MirrorTopic>(`/topics/${fileTopic}`);
  if (topic === null) return { failure: 'RESOLVE_NOT_FOUND', detail: `no such file topic: ${fileTopic}` };
  const chunkMessages = await mirror.get<MirrorMessages>(`/topics/${fileTopic}/messages?limit=100&order=asc`);
  if (chunkMessages === null) return { failure: 'RESOLVE_REGISTRY_UNREACHABLE', detail: fileTopic };

  const chunks = (chunkMessages.messages ?? [])
    .map((m) => decode(m) as { o: number; c: string } | null)
    .filter((c): c is { o: number; c: string } => c !== null && typeof c.o === 'number' && typeof c.c === 'string');
  if (chunks.length === 0) return { failure: 'RESOLVE_NOT_FOUND', detail: `file topic ${fileTopic} holds no chunks` };

  let read;
  try {
    read = readProfile(topic.memo ?? '', chunks);
  } catch (e) {
    return { failure: 'RESOLVE_NOT_FOUND', detail: `the file did not decode: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (read.digest !== read.memoDigest) {
    return {
      failure: 'RESOLVE_NOT_FOUND',
      detail: `the file's digest ${read.digest} does not equal its topic memo's ${read.memoDigest}`,
    };
  }
  inputs['profileDigest'] = read.digest;

  const profile = read.profile as {
    inboundTopicId?: string;
    outboundTopicId?: string;
    uaid?: string;
    display_name?: string;
    version?: string;
    properties?: { wishmail?: { manifestTopic?: string; x25519Pub?: string; keyEpoch?: number } };
  };

  const wishmail = profile.properties?.wishmail;
  if (wishmail === undefined || typeof wishmail.x25519Pub !== 'string' || typeof wishmail.keyEpoch !== 'number') {
    return { failure: 'RESOLVE_NOT_FOUND', detail: 'the profile carries no properties.wishmail declaration' };
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
  const output = {
    address,
    profile: 'hcs14',
    ledgerTag,
    account: parsed.account,
    doorbell: profile.inboundTopicId,
    ...(typeof profile.outboundTopicId === 'string' ? { log: profile.outboundTopicId } : {}),
    x25519Pub: wishmail.x25519Pub,
    keyEpoch: wishmail.keyEpoch,
  };

  // §5.2's Proof. The `uri` is empty until `send` publishes the manifest (§6.2).
  const manifest = resolutionProofFor(inputs, output, { ledgerTag, topicId: fileTopic }, endorsements);

  const coordinates: MailCoordinates = {
    ...output,
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
