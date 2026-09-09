/**
 * The `hol` resolver — §9.5's rule, from a registry anchor on consensus.
 *
 * §9.5 in outline, and the design note in `app/OPERATIONS.md` has the diagram:
 *
 *   address ─▶ the anchor, read IN FULL, every page
 *           ─▶ a `register` operation naming the address, by either route:
 *                (a) a uaid whose identifier AND nativeId are the address's
 *                (b) an account_id equal to the address's nativeId account
 *           ─▶ carries `t_id`  ─▶ HCS-2 topic ─▶ current entry ─▶ HCS-1 file
 *              carries only account_id ─▶ §9.2's rule from the account memo,
 *                                        carrying §9.2's own endorsements
 *           ─▶ properties.wishmail ─▶ MailCoordinates + the proof
 *
 * MATCH ON THE IDENTIFIER AND `nativeId`, NEVER ON THE `registry` LABEL (D-108).
 * "A broker that relabels an agent's registry does not change what the ledger
 * recorded." The same registration is `hol` to one reader and `openconvai` to
 * another, and the ledger holds one message either way.
 *
 * WHERE `blurred` ATTACHES. §9.5: "Where the registration's payer is not the
 * address's account, the rule assigns `blurred`: the registration is on
 * consensus, and under a key that is not the agent's." Every one of the
 * testnet anchor's messages as of the 2026-09-08 census was paid by one
 * account, `0.0.2659396` — the broker's — so **every agent currently on that
 * anchor resolves with `blurred`**, and an agent that pays for its own
 * registration does not. That is the whole point of the purchase funding one
 * fee, and T-P13-4 is the test that holds it.
 *
 * `vague` is the other endorsement this rule assigns on its own: where more
 * than one registration names the address, the latest is taken and the reading
 * says so.
 *
 * IT MUST NOT CALL THE BROKER. `hol.org/registry/api/v1` is a DIRECTORY (§9.7)
 * and nothing it returns is an input (P-6). The anchor is read from a mirror
 * node with nothing configured, which is what makes this profile `math` rather
 * than `social-committee`.
 *
 * Conformance: T-P6-1, T-P6-4, T-P6-5, T-P12-1, T-P13-4.
 */
import { canonicalBytes, sha256hex } from '../core/canonical.js';
import { matchAgentId, parseUaid, type AgentData, type KeyOrder } from '../core/hcs14.js';
import { proofInputs, proofLocation } from '../core/proof.js';
import { readProfile } from '../ops/declaration.js';
import {
  parseAddress,
  resolutionProofFor,
  type Endorsement,
  type MailCoordinates,
  type ProfileSource,
  type ResolveResult,
  type SourceMessage,
} from './hcs14.js';

/** An HCS-10 `register` operation as an anchor holds it (D-164, §H). */
interface RegisterOp {
  readonly p?: string;
  readonly op?: string;
  readonly account_id?: string;
  readonly uaid?: string;
  readonly t_id?: string;
  readonly m?: string;
}

/** One registration on the anchor, with the two facts §9.5 reads beside its body. */
export interface Registration {
  readonly anchor: string;
  readonly sequenceNumber: number;
  readonly consensusTimestamp: string;
  /** Who PAID. §9.5's `blurred` turns on this and on nothing else. */
  readonly payer: string | undefined;
  readonly body: RegisterOp;
  /** Which of the two routes matched. */
  readonly route: 'uaid' | 'account';
}

/**
 * Every registration on an anchor that names this address.
 *
 * Exported because it is also the idempotency gate for `register_agent`: an
 * agent that is already registered must not register again, and §9.5 assigns
 * `vague` where more than one registration names an address — so a duplicate is
 * not merely waste, it degrades the agent's own resolution and cannot be
 * withdrawn (D-165).
 */
export async function registrationsFor(
  source: ProfileSource,
  anchor: string,
  address: string,
): Promise<readonly Registration[] | null> {
  const parsed = parseAddress(address);
  if (parsed === null) return [];
  const messages = await source.topicMessages(anchor);
  if (messages === null) return null;

  const out: Registration[] = [];
  for (const m of messages) {
    const body = m.body as RegisterOp | null;
    if (body === null || typeof body !== 'object') continue;
    if (body.op !== 'register') continue;

    const route = routeOf(body, parsed, address);
    if (route === null) continue;
    out.push({
      anchor,
      sequenceNumber: m.sequenceNumber,
      consensusTimestamp: m.consensusTimestamp,
      payer: m.payer,
      body,
      route,
    });
  }
  return out;
}

/**
 * Which route a registration matches the address by, or null.
 *
 * (a) the uaid route: the registration's `uaid` and the address agree on BOTH
 *     the identifier and `nativeId`. Agreeing on one alone is not agreement —
 *     an identifier is a hash of six fields and a `nativeId` is where the agent
 *     lives, and a registration that carried one of ours and the other's would
 *     be naming a different agent.
 * (b) the account route: `account_id` is the address's account, which is the
 *     shape HCS-10's own standard gives a registration (§9.5, D-108).
 */
function routeOf(
  body: RegisterOp,
  parsed: { readonly account: string; readonly uaid?: string },
  address: string,
): Registration['route'] | null {
  if (parsed.uaid !== undefined && typeof body.uaid === 'string') {
    try {
      const want = parseUaid(parsed.uaid);
      const have = parseUaid(body.uaid);
      if (have.identifier === want.identifier && have.parameters['nativeId'] === want.parameters['nativeId']) return 'uaid';
    } catch {
      // A registration whose uaid does not parse names no address this rule can
      // read. Skipped, not refused: the anchor is a public topic and anyone may
      // write anything to it (§9.5).
    }
  }
  if (body.account_id === parsed.account) return 'account';
  void address;
  return null;
}

/** The HCS-2 "current entry" walk, shared with §9.2's first form. */
async function currentEntryOf(
  source: ProfileSource,
  registryTopic: string,
): Promise<{ readonly fileTopic: string; readonly message: SourceMessage } | null> {
  const entries = await source.topicMessages(registryTopic);
  if (entries === null) return null;
  const registrations = entries
    .map((m) => ({ m, body: m.body as { op?: string; t_id?: string } | null }))
    .filter((e) => e.body !== null && e.body.op === 'register' && typeof e.body.t_id === 'string');
  const current = registrations[registrations.length - 1];
  if (current === undefined) return null;
  return { fileTopic: current.body?.t_id as string, message: current.m };
}

/**
 * Resolve `address` under §9.5.
 *
 * `anchors` are §9.5's deployment facts, from `spec/pins.json` — a list, read in
 * order, because §9.5 names more than one anchor per ledger on mainnet and a
 * registration on either is a registration.
 */
export async function resolveHol(
  source: ProfileSource,
  ledgerTag: string,
  address: string,
  manifestTopic: string,
  anchors: readonly string[],
): Promise<ResolveResult> {
  const parsed = parseAddress(address);
  if (parsed === null) return { failure: 'RESOLVE_UNSUPPORTED_ADDRESS', detail: `not an hol address: ${address}` };
  if (anchors.length === 0) return { failure: 'RESOLVE_REGISTRY_UNREACHABLE', detail: `no hol anchor is recorded for ${ledgerTag}` };

  const endorsements: Endorsement[] = [];
  const found: Registration[] = [];
  for (const anchor of anchors) {
    const rs = await registrationsFor(source, anchor, address);
    if (rs === null) return { failure: 'RESOLVE_REGISTRY_UNREACHABLE', detail: anchor };
    found.push(...rs);
  }
  if (found.length === 0) return { failure: 'RESOLVE_NOT_FOUND', detail: `no registration on ${anchors.join(', ')} names ${address}` };

  // §9.5: more than one is `vague`, and the latest is taken. Latest by consensus
  // timestamp and never by sequence number, because two anchors have two
  // sequences and only one clock.
  const ordered = [...found].sort((a, b) => (a.consensusTimestamp < b.consensusTimestamp ? -1 : a.consensusTimestamp > b.consensusTimestamp ? 1 : 0));
  const registration = ordered[ordered.length - 1] as Registration;
  if (ordered.length > 1) endorsements.push('vague');

  // §9.5's `blurred`, and the one thing it turns on.
  if (registration.payer === undefined) {
    return {
      failure: 'RESOLVE_REGISTRY_UNREACHABLE',
      detail:
        `the source could not supply the payer of the registration at ${registration.anchor}#${registration.sequenceNumber}, ` +
        'and §9.5 decides `blurred` on it. Refusing to appraise rather than assume.',
    };
  }
  if (registration.payer !== parsed.account) endorsements.push('blurred');

  // §5.2's locator: §9.5's own words, plus the address, because D-167 makes the
  // output travel as a digest and a rule whose first input cannot be re-obtained
  // cannot be re-run.
  const locator: Record<string, unknown> = {
    ledgerTag,
    address,
    anchorTopic: registration.anchor,
    sequenceNumber: registration.sequenceNumber,
  };
  const readMaterial: Record<string, unknown> = { registration: registration.body, payer: registration.payer };
  let snapshot: unknown;

  // --- Which shape the registration takes, and where the profile is. ---------
  let fileTopic: string;
  if (typeof registration.body.t_id === 'string') {
    // The hol chain: the registration names an HCS-2 topic of profile versions.
    const current = await currentEntryOf(source, registration.body.t_id);
    if (current === null) return { failure: 'RESOLVE_NOT_FOUND', detail: `no current entry on registry ${registration.body.t_id}` };
    fileTopic = current.fileTopic;
    locator['registryTopic'] = registration.body.t_id;
    locator['registrySequence'] = current.message.sequenceNumber;
    locator['consensusTimestamp'] = current.message.consensusTimestamp;
    readMaterial['registryEntry'] = current.message.body;
  } else {
    // The HCS-10 shape: the registration names only an account, so §9.2's rule
    // takes over from the account memo — and its endorsements come with it.
    const memo = await source.accountMemo(parsed.account);
    if (memo === null) return { failure: 'RESOLVE_NOT_FOUND', detail: `no such account: ${parsed.account}` };
    locator['account'] = parsed.account;
    locator['memo'] = memo;
    const viaRegistry = /^hcs-11:hcs:\/\/2\/([0-9]+\.[0-9]+\.[0-9]+)$/.exec(memo);
    const viaFile = /^hcs-11:hcs:\/\/1\/([0-9]+\.[0-9]+\.[0-9]+)$/.exec(memo);
    if (viaRegistry) {
      const current = await currentEntryOf(source, viaRegistry[1] as string);
      if (current === null) return { failure: 'RESOLVE_NOT_FOUND', detail: `no current entry on registry ${viaRegistry[1]}` };
      fileTopic = current.fileTopic;
      locator['registryTopic'] = viaRegistry[1] as string;
      locator['registrySequence'] = current.message.sequenceNumber;
      readMaterial['registryEntry'] = current.message.body;
    } else if (viaFile) {
      fileTopic = viaFile[1] as string;
      // D-107, carried through §9.5: the file is immutable and the account-to-
      // file binding is a memo whose past values are not re-obtainable. So a
      // registration by `account_id` whose memo names a file directly resolves
      // `blurred` TWICE OVER, for two different reasons, and both are reported.
      endorsements.push('blurred');
      snapshot = { memo };
      readMaterial['memo'] = memo;
    } else {
      return { failure: 'RESOLVE_NOT_FOUND', detail: `account memo is not an HCS-11 memo of either form: ${JSON.stringify(memo)}` };
    }
  }
  locator['profileTopic'] = fileTopic;

  // --- The file, and the profile in it. -------------------------------------
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
    return { failure: 'RESOLVE_NOT_FOUND', detail: `the file's digest ${read.digest} does not equal its topic memo's ${read.memoDigest}` };
  }
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
  if (
    wishmail === undefined ||
    typeof wishmail.manifestTopic !== 'string' ||
    typeof wishmail.x25519Pub !== 'string' ||
    typeof wishmail.keyEpoch !== 'number'
  ) {
    return { failure: 'RESOLVE_NOT_FOUND', detail: 'the profile carries no complete properties.wishmail declaration (§9.1)' };
  }
  if (typeof profile.inboundTopicId !== 'string') {
    return { failure: 'RESOLVE_NOT_FOUND', detail: 'the profile carries no inboundTopicId' };
  }

  // §9.5's identifier recomputation: "from the profile's name, version, and
  // skills together with the address's registry, proto and nativeId
  // parameters", under BOTH of HCS-14's canonical key orders, the normative one
  // first (§9.1, D-152). Reporting which matched keeps the fact visible without
  // letting it touch anything: a match under either is agreement.
  const agentIdOrder: { address: string; order: KeyOrder }[] = [];
  const uaidString = parsed.uaid ?? (typeof registration.body.uaid === 'string' ? registration.body.uaid : undefined);
  if (uaidString !== undefined && typeof profile.uaid === 'string') {
    const have = parseUaid(profile.uaid);
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
      return { failure: 'RESOLVE_NOT_FOUND', detail: "the profile's uaid identifier recomputes under neither canonical order (§9.1)" };
    }
    agentIdOrder.push({ address, order });
  }

  const now = Date.now();
  const resolvedAt = `${Math.floor(now / 1000)}.${String((now % 1000) * 1_000_000).padStart(9, '0')}`;

  const resolved = {
    address,
    profile: 'hol',
    ledgerTag,
    account: parsed.account,
    doorbell: profile.inboundTopicId,
    ...(typeof profile.outboundTopicId === 'string' ? { log: profile.outboundTopicId } : {}),
    manifestTopic: wishmail.manifestTopic,
    x25519Pub: wishmail.x25519Pub,
    keyEpoch: wishmail.keyEpoch,
  };

  const manifest = resolutionProofFor(
    proofInputs(locator, readMaterial, snapshot),
    { digest: sha256hex(canonicalBytes(resolved)) },
    proofLocation(ledgerTag, manifestTopic),
    endorsements,
    { id: 'hol', revision: '0.5' },
    // §9.1's budget, D-167: at most N = 70 bytes, and `hol`'s own remainder is
    // 72. This is 57. The explanation of what the rule does is §9.5, which is
    // where a reader should look for it; a manifest's statement is a label.
    'Registered on the HOL anchor; profile read from consensus.',
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
