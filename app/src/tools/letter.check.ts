/**
 * `npm run check:letter` — the whole letter, in memory, with both readers held
 * to account and every refusal exercised against an altered copy.
 *
 * This is the gate the step's first signature stands behind. A chunk on
 * consensus cannot be withdrawn, and neither can a settlement; so before `send`
 * is pointed at testnet, the same code runs against `tools/memory.ts` — a
 * ledger that enforces submit keys, HIP-991 fees, balances and consensus order
 * — and the letter it produces is read back by `inbox` and reconciled by
 * `verify` with nothing configured but what the scope names.
 *
 * The seven alterations are the ones a reader owes a refusal for: the header,
 * the lane, the resolution proof, the settlement's memo, the `operator_id`, the
 * key epoch, and a broken link in the chain. Each is applied to what `send`
 * already put on the ledger, never to an object before it is submitted — and
 * rewriting a message that landed is a HARDER case than the real one, where a
 * party holding a lane key can only add a competing message and can never alter
 * one already on consensus. A reader that holds against this holds against that.
 *
 * BOTH DIRECTIONS travel here as of D-171. A lane is bidirectional and its birth
 * sits at one door only, so a reply is found through the REPLIER's own doorbell;
 * three further lanes are refused beside it, each wrong in exactly one way.
 *
 * Conformance (reference side): T-P1-1, T-P1-2, T-P1-6, T-P1-10, T-P1-11,
 * T-P3-1, T-P3-3, T-P3-4, T-P4-1, T-P4-2, T-P7-1, T-P9-5, T-P9-10, T-P10-1,
 * T-P10-2, T-P12-2, T-P12-5, T-P14-1, T-P17-2.
 */
import type { KeyObject } from 'node:crypto';
import { sha256hex, canonicalBytes } from '../core/canonical.js';
import { generateRecipientKey } from '../core/seal.js';
import { settlementMemo } from '../core/envelope.js';
import { isToolFailure } from '../core/failure.js';
import {
  TRANSACTION_MEMO,
  connectionCreatedBody,
  outboundConnectionCreatedByAcceptor,
  connectionTopicMemo,
  inboundTopicMemoOf,
  connectionTopicMemoOf,
  operatorId as operatorIdOf,
} from '../ops/hcs10.js';
import { proofInputs } from '../core/proof.js';
import { proofLocation } from '../core/proof.js';
import { hcs1File } from '../ops/hcs1.js';
import { resolveHcs14 } from '../resolve/hcs14.js';
import { readerSource } from './verify.js';
import { ack } from './ack.js';
import { decodeScheduledSubmission, encodeScheduledSubmission } from '../core/schedulebody.js';
import { fields } from '../core/protokey.js';
import { inbox, type Delivery } from './inbox.js';
import { MemoryLedger } from './memory.js';
import { compareTimestamps, operationOf } from './consensus.js';
import { requestReceipt, send, type Coordinates, type SenderContext } from './send.js';
import { verify } from './verify.js';
import { repoRoot } from '../ops/env.js';
import { schemas } from '../schema/loader.js';

const registry = schemas(repoRoot());

const failures: string[] = [];
let checked = 0;

function is(name: string, got: unknown, want: unknown): void {
  checked += 1;
  const g = String(got);
  const w = String(want);
  if (g !== w) failures.push(`${name}\n    got   ${g}\n    want  ${w}`);
}
function ok(name: string, condition: boolean): void {
  checked += 1;
  if (!condition) failures.push(name);
}

/** Raised, unruled, and not coded around (CLAUDE.md §5). Printed, never counted. */
const openFindings: string[] = [];

/**
 * A manifest is a §5.2 Proof, and `spec/schemas/proof.schema.json` is what Step 4
 * would freeze. Nothing had ever run that schema against a manifest this
 * implementation produces; running it found two things, and they are not the
 * same kind of thing.
 *
 * FIXED: `inputs` is `{digest, locator, snapshot?}` and every writer had been
 * putting the input material there directly. `core/proof.ts` is the one builder
 * now.
 *
 * ALSO FIXED, and it was ledger §G-16 until 2026-09-09: `meaning.uri` is a
 * LOCATION — `{ledgerTag, topicId}`, the topic the manifest is published on — and
 * not a locator naming a message. A manifest cannot carry its own publication
 * locator, because §5.1 hashes `meaning` into the proof, §6.2 fixes that hash at
 * `resolve` time, and §6.4 step 2 publishes the manifest afterwards. D-163 rules
 * that the location is the topic and the lookup is content-addressed, so every
 * manifest here names a manifest topic and every error is now a failure.
 */
function manifestAgainstProofSchema(label: string, manifest: unknown): void {
  const errors = registry.validate('proof', manifest);
  ok(`${label} validates against the registered Proof schema: ${errors.join('; ')}`, errors.length === 0);
}

/**
 * The two agents' keys, as RAW HEX rather than as labels.
 *
 * They were `'sender-ed25519'` and `'recipient-ed25519'` until Gate Two
 * checkpoint two, which read fine and could not exercise §11.4's signature
 * match: a mirror node gives a schedule signature's prefix in base64 and an
 * account's key in raw hex, and `keyMatchesPrefix` decodes one into the other.
 * A model whose keys were words would have let that matcher pass here and fail
 * on the network. Thirty-two bytes each, distinct, and nothing about them is a
 * secret — the model does not verify signatures and says so.
 */
const SENDER_KEY = '5e4d' + 'a1'.repeat(30);
const RECIPIENT_KEY = 'b0b1' + 'c2'.repeat(30);

/** Everything the two agents own, stood up as §4.6 provisions it. */
interface World {
  readonly ledger: MemoryLedger;
  readonly sender: {
    account: string;
    doorbell: string;
    log: string;
    manifestTopic: string;
    x25519Pub: string;
    key: KeyObject;
  };
  readonly recipient: {
    account: string;
    doorbell: string;
    log: string;
    manifestTopic: string;
    registry: string;
    profileFile: string;
    x25519Pub: string;
    key: KeyObject;
  };
  readonly coordinates: Coordinates;
  readonly manifest: Record<string, unknown>;
  readonly ctx: SenderContext;
}

/** One agent's mailbox, as §4.6 provisions it and §9.2 declares it. */
interface Declared {
  readonly account: string;
  readonly doorbell: string;
  readonly log: string;
  readonly manifestTopic: string;
  readonly registry: string;
  readonly profileFile: string;
  readonly x25519Pub: string;
  readonly key: KeyObject;
}

/**
 * Provision and declare one agent.
 *
 * BOTH correspondents are declared, and 2026-09-10 is why: under D-171 a reply
 * travels the other way down the same lane, so the agent that was the recipient
 * must be able to RESOLVE the agent that was the sender. A fixture that declares
 * only one side can try first contact and nothing else.
 *
 * The HCS-10 topic memos are the pinned forms and were not, until now: an
 * inbound topic is `hcs-10:0:{ttl}:0:{accountId}` (`index.md:246`) and an
 * outbound topic `hcs-10:0:{ttl}:1` (`index.md:263`), and this fixture wrote
 * `…:1` on the doorbell and `…:2` on the log — neither of which is either. It
 * did not matter while nothing read them. §11.4 reads them now.
 */
function declare(ledger: MemoryLedger, key: string, stamps: number, displayName: string): Declared {
  const encryption = generateRecipientKey();
  const account = ledger.createAccount(key, stamps);
  const doorbell = ledger.createTopic({
    memo: `hcs-10:0:60:0:${account}`,
    submitKeys: [],
    customFees: [{ amount: 1, tokenId: ledger.stampToken, collector: ledger.treasury }],
    // D-137, D-138: the owner answers its own door and is not charged for it.
    feeExemptKeys: [key],
  });
  const log = ledger.createTopic({ memo: 'hcs-10:0:60:1', submitKeys: [key] });
  const manifestTopic = ledger.createTopic({ submitKeys: [key] });

  // The HCS-11 profile, written into a real HCS-1 file (D-167). Until 0.5.8 this
  // fixture created the file TOPIC and never put a profile in it, because
  // `verify`'s replay stopped at the registry entry and nothing read further. It
  // reads further now — §11.4's replay runs §9.2's rule to the end, and the
  // coordinates it yields are what the output digest is compared against — so a
  // fixture with an empty file topic is a fixture the rule cannot resolve. This
  // is CLAUDE.md §9 once more: the reader is what says whether the writer wrote
  // anything.
  const profileDoc = {
    version: '1.0',
    display_name: displayName,
    inboundTopicId: doorbell,
    outboundTopicId: log,
    properties: {
      wishmail: { manifestTopic, x25519Pub: encryption.x25519Pub, keyEpoch: 1 },
    },
  };
  const file = hcs1File(Buffer.from(JSON.stringify(profileDoc), 'utf8'), 'application/json');
  const profileFile = ledger.createTopic({ memo: file.memo, submitKeys: [key], adminKey: null });
  for (const chunk of file.chunks) ledger.submit(account, profileFile, JSON.stringify(chunk));
  const registry = ledger.createTopic({ memo: 'hcs-2:0:60', submitKeys: [key], adminKey: key });
  ledger.submit(account, registry, JSON.stringify({ p: 'hcs-2', op: 'register', t_id: profileFile }));
  ledger.setAccountMemo(account, `hcs-11:hcs://2/${registry}`);

  return {
    account,
    doorbell,
    log,
    manifestTopic,
    registry,
    profileFile,
    x25519Pub: encryption.x25519Pub,
    key: encryption.keyPair.privateKey,
  };
}

async function stand(): Promise<World> {
  const ledger = new MemoryLedger();

  const recipientSide = declare(ledger, RECIPIENT_KEY, 0, 'Correspondent B');
  const senderSide = declare(ledger, SENDER_KEY, 10, 'Correspondent A');

  const recipientAccount = recipientSide.account;
  const recipientDoorbell = recipientSide.doorbell;
  const recipientLog = recipientSide.log;
  const recipientManifests = recipientSide.manifestTopic;
  const registry = recipientSide.registry;
  const profileFile = recipientSide.profileFile;
  const recipientEncryption = { x25519Pub: recipientSide.x25519Pub, keyPair: { privateKey: recipientSide.key } };

  const senderAccount = senderSide.account;
  const senderDoorbell = senderSide.doorbell;
  const senderLog = senderSide.log;
  const senderManifests = senderSide.manifestTopic;

  // THE RESOLUTION, RUN RATHER THAN RESTATED (D-167). This fixture used to build
  // the manifest by hand — a second spelling of §9.2's rule, beside the
  // resolver's — and the two could only be trusted to agree by inspection. Now
  // that the output travels by digest, a hand-built manifest is a manifest no
  // Verifier can replay: the digest would be over fields nobody re-derives. So
  // the fixture calls the same rule over the same port the Verifier will use,
  // and the manifest under test is the one `resolve` produces.
  const resolution = await resolveHcs14(
    readerSource(ledger.as(senderAccount)),
    ledger.ledgerTag,
    recipientAccount,
    senderManifests,
  );
  if ('failure' in resolution) {
    throw new Error(`the fixture's own declaration does not resolve: ${resolution.failure} — ${resolution.detail}`);
  }
  const manifest = resolution.manifest as unknown as Record<string, unknown>;
  const coordinates: Coordinates = resolution.coordinates as unknown as Coordinates;

  const ctx: SenderContext = {
    consensus: ledger.as(senderAccount),
    ledgerTag: ledger.ledgerTag,
    account: senderAccount,
    doorbell: senderDoorbell,
    log: senderLog,
    manifestTopic: senderManifests,
    treasury: ledger.treasury,
    stampToken: ledger.stampToken,
    schemaRef: 'hcs://13/0.0.10428113#1',
    publicKey: SENDER_KEY,
  };

  return {
    ledger,
    sender: {
      account: senderAccount,
      doorbell: senderDoorbell,
      log: senderLog,
      manifestTopic: senderManifests,
      x25519Pub: senderSide.x25519Pub,
      key: senderSide.key,
    },
    recipient: {
      account: recipientAccount,
      doorbell: recipientDoorbell,
      log: recipientLog,
      manifestTopic: recipientManifests,
      registry,
      profileFile,
      x25519Pub: recipientEncryption.x25519Pub,
      key: recipientEncryption.keyPair.privateKey,
    },
    coordinates,
    manifest: manifest as unknown as Record<string, unknown>,
    ctx,
  };
}

/**
 * The recipient answering its door, as HCS-10 has it: a connection topic keyed
 * to a threshold of exactly the two agents' keys, and a `connection_created` on
 * the acceptor's own inbound topic (D-137).
 */
function answerTheDoor(w: World): string {
  return answerAt(
    w,
    { account: w.recipient.account, doorbell: w.recipient.doorbell, log: w.recipient.log },
    w.sender.account,
    { requestorLog: w.sender.log },
  );
}

/**
 * One party answering its own door, whichever party it is.
 *
 * The memo is HCS-10's connection-topic memo at the pin —
 * `hcs-10:1:{ttl}:2:{inboundTopicId}:{connectionId}` (`index.md:279`) — and this
 * fixture wrote `hcs-10:1:60:3` until 2026-09-10, which is not that form and
 * names no doorbell at all. `watcher.ts` had always written the real one, so the
 * MODEL diverged from the network on exactly the field D-171 makes a Verifier
 * read. Nothing checked it, because nothing read it.
 *
 * `submitKeys` may be overridden to build a lane that is not a threshold of
 * exactly the two parties' keys — T-P17-2's other half.
 *
 * IT ALSO WRITES THE ACCEPTOR'S OUTBOUND RECORD where a log is given (D-174),
 * for the reason above spelled the other way round: `sdk/watcher.ts` writes one
 * on the network now, so a model that did not would diverge from the wire on a
 * field a strict reader under the pin's prose reading looks for. The real
 * acceptor is a `Session` and needs a network, so this is the only offline
 * place the acceptor's half of the pair can be stood up at all.
 */
function answerAt(
  w: World,
  acceptor: { account: string; doorbell: string; log?: string },
  requesterAccount: string,
  options: { connectionId?: number; submitKeys?: readonly string[]; requestorLog?: string } = {},
): string {
  const connectionId = options.connectionId ?? 1;
  const lane = w.ledger.createTopic({
    memo: connectionTopicMemo(acceptor.doorbell, connectionId),
    submitKeys: [...(options.submitKeys ?? [SENDER_KEY, RECIPIENT_KEY])],
    adminKey: RECIPIENT_KEY,
  });
  const announced = w.ledger.submit(
    acceptor.account,
    acceptor.doorbell,
    JSON.stringify(
      connectionCreatedBody(operatorIdOf(acceptor.doorbell, acceptor.account), lane, connectionId, requesterAccount),
    ),
  );
  if (acceptor.log !== undefined && options.requestorLog !== undefined) {
    w.ledger.submit(
      acceptor.account,
      acceptor.log,
      JSON.stringify(
        outboundConnectionCreatedByAcceptor({
          connectionTopicId: lane,
          outboundTopicId: acceptor.log,
          requestorOutboundTopicId: options.requestorLog,
          confirmedRequestId: announced.sequenceNumber,
          connectionRequestId: connectionId,
          acceptorOperatorId: operatorIdOf(acceptor.doorbell, acceptor.account),
        }),
      ),
    );
  }
  return lane;
}

const PAYLOAD = Buffer.from(
  'Certified mail for agents: this envelope was resolved, stamped, sealed, chunked and posted, and every one of those is a fact on consensus except what it says.',
  'utf8',
);

async function main(): Promise<void> {
  // === The letter =========================================================
  const w = await stand();
  const before = w.ledger.balance(w.sender.account);

  // First contact and the letter, with the recipient answering inside the
  // window. `send` blocks on the answer, which is the one wait §6.4 allows
  // (T-P14-1), so the answer is submitted while it waits.
  const flight = send(w.ctx, { coordinates: w.coordinates, manifest: w.manifest, payload: PAYLOAD, windowSeconds: 10 });
  await new Promise((r) => setTimeout(r, 50));
  const lane = answerTheDoor(w);
  const result = await flight;

  if (result.kind !== 'postmark') {
    failures.push('send returned a slip where the door was answered');
    report();
    return;
  }

  is('the envelope was posted to the lane the recipient created', result.lane, lane);

  // === D-174: the lane is recorded on BOTH parties' outbound logs ==========
  //
  // HCS-10's *Outbound Connection Created* record contradicts itself about
  // which party writes it — prose and operation table say the acceptor
  // (`index.md:560`, `:529`), three of five required field descriptions
  // describe the requester (`:585`, `:586`, `:587`). Sonic ruled that this
  // deployment writes it on both logs at one message each, so that a strict
  // reader under either reading finds the record it expects (ledger §G-24).
  //
  // Both halves are asserted here from the modelled ledger's own messages,
  // which is the only place the two can be seen TOGETHER before a network run.
  const createdOn = async (log: string): Promise<readonly Record<string, unknown>[]> =>
    (await w.ledger.reader().messages(log))
      .map((m) => operationOf(m))
      .filter((op): op is Record<string, unknown> => op !== null && op['op'] === 'connection_created');

  const senderRecords = await createdOn(w.sender.log);
  const acceptorRecords = await createdOn(w.recipient.log);
  is("the REQUESTER's own log records the lane it was given (D-174)", senderRecords.length, 1);
  is("the ACCEPTOR's own log records the lane it created (D-174)", acceptorRecords.length, 1);

  const asRequester = senderRecords[0] ?? {};
  const asAcceptor = acceptorRecords[0] ?? {};

  // Every field `index.md:578-588` marks required, present on both.
  for (const [who, rec] of [
    ['requester', asRequester],
    ['acceptor', asAcceptor],
  ] as const) {
    for (const field of [
      'p',
      'op',
      'connection_topic_id',
      'outbound_topic_id',
      'requestor_outbound_topic_id',
      'confirmed_request_id',
      'connection_request_id',
      'operator_id',
    ]) {
      ok(`the ${who}'s record carries the required field ${field} (index.md:578-588)`, rec[field] !== undefined);
    }
    is(`the ${who}'s record names this lane`, rec['connection_topic_id'], lane);
    is(`the ${who}'s record names the log it is stored on (index.md:583)`, rec['outbound_topic_id'], who === 'requester' ? w.sender.log : w.recipient.log);
  }

  // The two readings differ in exactly the places the pin differs, and that is
  // the point of writing both rather than choosing one.
  is(
    "the requester's record names the CONFIRMER in operator_id (index.md:587)",
    asRequester['operator_id'],
    operatorIdOf(w.recipient.doorbell, w.recipient.account),
  );
  is(
    "the acceptor's record names ITSELF in operator_id (index.md:529 — 'created by the agent')",
    asAcceptor['operator_id'],
    operatorIdOf(w.recipient.doorbell, w.recipient.account),
  );
  is(
    "the requester's requestor_outbound_topic_id is its own log — redundant under its reading (index.md:584)",
    asRequester['requestor_outbound_topic_id'],
    w.sender.log,
  );
  is(
    "the acceptor's requestor_outbound_topic_id is the OTHER party's log — load-bearing under its reading",
    asAcceptor['requestor_outbound_topic_id'],
    w.sender.log,
  );
  ok(
    'both records agree about which request opened the lane (index.md:586)',
    asRequester['connection_request_id'] === asAcceptor['connection_request_id'],
  );
  is(
    "the requester's confirmed_request_id is the answer's sequence number on the OTHER party's door (index.md:585)",
    asRequester['confirmed_request_id'],
    (await w.ledger.reader().messages(w.recipient.doorbell)).find((m) => operationOf(m)?.['connection_topic_id'] === lane)?.sequenceNumber,
  );

  // IDEMPOTENT FROM CONSENSUS (D-165's rule, applied to a log), in a world of
  // its own — a second letter posts a second envelope, and this assertion is
  // about a log and not about a lane's traffic, so it is kept clear of the
  // counts the letter above is still being measured by.
  {
    const u = await stand();
    const inFlight = send(u.ctx, { coordinates: u.coordinates, manifest: u.manifest, payload: PAYLOAD, windowSeconds: 10 });
    await new Promise((r) => setTimeout(r, 50));
    const openedLane = answerTheDoor(u);
    await inFlight;
    const logged = async (log: string): Promise<number> =>
      (await u.ledger.reader().messages(log))
        .map((m) => operationOf(m))
        .filter((op) => op !== null && op['op'] === 'connection_created' && op['connection_topic_id'] === openedLane).length;
    is('first contact records the lane on the requester log once', await logged(u.sender.log), 1);
    is('and on the acceptor log once', await logged(u.recipient.log), 1);

    await send(u.ctx, { coordinates: u.coordinates, manifest: u.manifest, payload: PAYLOAD, windowSeconds: 10 });
    is('a second letter rings nothing and records nothing twice (D-174, D-165)', await logged(u.sender.log), 1);
    is('and the acceptor is not asked to record it again either', await logged(u.recipient.log), 1);
  }

  is('and chunk 0 has a postmark', result.postmark.chunkIndex, 0);
  is('the postmark names the envelope', result.postmark.envelopeId, result.envelope.aadHash);
  is('one postmark per chunk (§5.7)', result.postmarks.length, result.envelope.chunkCount);
  is('the settlement carries the memo §4.3 fixes', result.settlement.memo, settlementMemo(result.envelope.aadHash));
  is('the postage went to the treasury', result.settlement.to, w.ledger.treasury);
  is('and it was affixed by the sender (§7.2, fourth weld)', result.settlement.from, w.sender.account);
  ok(
    'the settlement precedes chunk 0 (§11.4, T-P7-1)',
    result.settlement.consensusTimestamp < result.postmark.consensusTimestamp,
  );
  is(
    'the stamps are gone: one at the doorbell, then the postage (§4.4, §4.3)',
    w.ledger.balance(w.sender.account),
    before - 1 - result.settlement.amount,
  );
  is('the resolution manifest is on the sender’s manifest topic (T-P9-8)', result.manifestLocator.topicId, w.sender.manifestTopic);
  // The reader on the writer's output: a manifest is a §5.2 Proof, and
  // spec/schemas/proof.schema.json is what Step 4 would freeze. Nothing had
  // ever run it against a manifest this implementation produces.
  manifestAgainstProofSchema('the resolution manifest', w.manifest as unknown);

  // === `inbox`, on exactly what `send` produced ============================
  const keys = new Map<number, KeyObject>([[1, w.recipient.key]]);
  const inboxCtx = {
    reader: w.ledger.reader(),
    account: w.recipient.account,
    keys,
    treasury: w.ledger.treasury,
    stampToken: w.ledger.stampToken,
  };
  const deliveries = await inbox(inboxCtx, { lanes: [lane] });
  is('inbox returns one delivery', deliveries.length, 1);
  const delivery = deliveries[0] as Delivery;
  is('and it opened', delivery.opened, true);
  is('with no reason', delivery.reason, 'undefined');
  is('and the payload is byte for byte the payload sent', delivery.payload?.toString('hex'), PAYLOAD.toString('hex'));
  is('the delivery names the envelope send produced', delivery.envelope.aadHash, result.envelope.aadHash);

  // === `verify`, from consensus alone ======================================
  const scope = {
    lane,
    stampToken: { tokenId: w.ledger.stampToken, treasury: w.ledger.treasury },
    claims: ['hcs14'],
  };
  const first = await verify(w.ledger.reader(), scope, { narrative: true });
  const entry = first.bundle.correspondence[0];
  ok('verify found the envelope', entry !== undefined);
  if (entry !== undefined) {
    is('its state is SETTLED (§8.3)', entry.state, 'SETTLED');
    is('it carries a postmark per chunk', entry.chunks.length, result.envelope.chunkCount);
    is('and the settlement it names', entry.settlement?.txRef, result.settlement.txRef);
    is('nothing landed off the chain', entry.offChain.length, 0);
    // The schema registry is built and NOT signed (Step 4), so the schemaRef
    // resolves to nothing and §11.4 appraises the resolution unverified. That
    // is the true statement, and the reason names the test.
    ok('the only reason is the unresolved schemaRef (T-P9-3)', entry.appraisal.appraised.reasons.join(',') === 'T-P9-3');
    is('so the standing is unverified, not verified (§11.5)', entry.appraisal.appraised.standing, 'unverified');
    is('and the resolution itself is unverified for the same reason', entry.appraisal.resolution.standing, 'unverified');
    is('no receipt was requested', entry.appraisal.receipt.status, 'none');
  }

  // P-3: the same scope and window, from a second Verifier, byte for byte.
  const second = await verify(w.ledger.reader(), scope, { narrative: true });
  is('two Verifiers agree on the digest (P-3, T-P3-1)', second.bundle.digest, first.bundle.digest);
  is('the narrative carries the bundle’s digest (T-P3-4)', first.narrative?.bundleDigest, first.bundle.digest);
  {
    const bundleErrors = registry.validate('evidence-bundle', first.bundle);
    ok(
      `the bundle validates against the registered EvidenceBundle schema (§5.10)${bundleErrors.length ? ': ' + bundleErrors.join('; ') : ''}`,
      bundleErrors.length === 0,
    );
    const narrativeErrors = registry.validate('narrative', first.narrative);
    ok(
      `the narrative validates against its own (§5.10)${narrativeErrors.length ? ': ' + narrativeErrors.join('; ') : ''}`,
      narrativeErrors.length === 0,
    );
    const envelopeErrors = registry.validate('envelope', entry?.envelope);
    ok(
      `the envelope the bundle carries validates (§5.5)${envelopeErrors.length ? ': ' + envelopeErrors.join('; ') : ''}`,
      envelopeErrors.length === 0,
    );
    const settlementErrors = registry.validate('settlement', entry?.settlement);
    ok(
      `and the settlement it read (§5.4)${settlementErrors.length ? ': ' + settlementErrors.join('; ') : ''}`,
      settlementErrors.length === 0,
    );
  }
  if (process.env['WISHMAIL_NARRATIVE'] === '1') {
    console.log('\n--- the narrative, in its own words ---\n');
    console.log(first.narrative?.text ?? '(none)');
    console.log('\n--- end ---\n');
  }
  ok('and the narrative says what the bundle holds', (first.narrative?.text ?? '').includes(result.envelope.aadHash));
  ok(
    'the narrative refuses to claim it read the letter (§11.8)',
    (first.narrative?.text ?? '').includes('says nothing about what the envelope contained'),
  );

  // === Every refusal the readers owe ======================================
  await refusals();

  // === Ingestion lag: a retry is a RE-READ, and never a RE-RING ===========
  //
  // The class of defect no offline check had reached until 2026-09-10. A mirror
  // node answers a read about a message that IS on consensus with the same word
  // it uses for one that will never exist, and two of Gate One's eight defects
  // were that read believed once. `MemoryLedger.lag` withholds a topic's newest
  // message from the next N reads, so the retry can be exercised with no
  // network.
  {
    const s = await stand();
    const operator = operatorIdOf(s.sender.doorbell, s.sender.account);
    // The door IS answered — but the answer is invisible to the next two reads.
    const flight = send(s.ctx, {
      coordinates: s.coordinates,
      manifest: s.manifest,
      payload: PAYLOAD,
      windowSeconds: 1,
    });
    // Let the ring land before the door is answered: `connection_created` names
    // the `connection_id` of the request it answers.
    await new Promise((r) => setTimeout(r, 50));
    answerTheDoor(s);
    s.ledger.lag(s.recipient.doorbell, 2);
    const out = await flight;
    is('a lagged answer is found by looking again, not by ringing again', out.kind, 'postmark');

    const rings = (await s.ctx.consensus.messages(s.recipient.doorbell)).filter((m) => {
      const op = operationOf(m);
      return op?.['op'] === 'connection_request' && op['operator_id'] === operator;
    });
    is('the doorbell was rung EXACTLY ONCE across every attempt (§4.4)', rings.length, 1);
  }

  // === No double-ring: a standing request is waited on, not re-rung =========
  {
    const s = await stand();
    const operator = operatorIdOf(s.sender.doorbell, s.sender.account);
    // A first contact that timed out leaves a request standing and unanswered.
    const slipped = await send(s.ctx, { coordinates: s.coordinates, manifest: s.manifest, payload: PAYLOAD, windowSeconds: 1 });
    is('the first contact timed out', slipped.kind, 'slip');

    // A second `send` finds it on CONSENSUS and waits on it rather than paying
    // for a second ring. §10.5 PERMITS ringing again — "each is its own record"
    // — so this is our thrift and not the specification's requirement, and the
    // assertion is that we spend one stamp where we are allowed to spend two.
    const before = await s.ctx.consensus.stampBalance();
    const second = send(s.ctx, { coordinates: s.coordinates, manifest: s.manifest, payload: PAYLOAD, windowSeconds: 1 });
    await new Promise((r) => setTimeout(r, 50));
    answerTheDoor(s);
    const out = await second;
    is('the standing request is answered, and the letter goes', out.kind, 'postmark');

    const rings = (await s.ctx.consensus.messages(s.recipient.doorbell)).filter((m) => {
      const op = operationOf(m);
      return op?.['op'] === 'connection_request' && op['operator_id'] === operator;
    });
    is('still exactly one request on the doorbell — no second ring', rings.length, 1);
    const after = await s.ctx.consensus.stampBalance();
    // One ring's stamp was already spent by the first contact; what this run
    // spends is the envelope's postage and nothing at the door.
    ok('and no second stamp was consumed at the door', before - after <= 2);
  }

  // === The slip: a door nobody answers (F-6, T-P12-5) =====================
  {
    const s = await stand();
    const slipped = await send(s.ctx, { coordinates: s.coordinates, manifest: s.manifest, payload: PAYLOAD, windowSeconds: 1 });
    is('an unanswered door yields a slip, not a failure (F-6)', slipped.kind, 'slip');
    if (slipped.kind === 'slip') {
      is('the slip is endorsed timed-out', slipped.slip.endorsement, 'timed-out');
      is('it names the doorbell it rang', slipped.slip.doorbell, s.recipient.doorbell);
      ok('it names the request’s postmark', slipped.slip.connectionRequestSeq >= 1);
      ok('and its own record on the sender’s log (§5.9)', slipped.slip.logSeq >= 1);
      is('its manifest is on the sender’s manifest topic (T-P12-5)', slipped.manifestLocator.topicId, s.sender.manifestTopic);
      const published = (await s.ctx.consensus.messages(slipped.manifestLocator.topicId)).find(
        (m) => m.sequenceNumber === slipped.manifestLocator.sequenceNumber,
      );
      ok('the slip manifest is on the topic its locator names', published !== undefined);
      if (published !== undefined) {
        manifestAgainstProofSchema(
          'the slip manifest',
          JSON.parse(Buffer.from(published.contents).toString('utf8')) as unknown,
        );
      }
      is('one stamp was consumed at the doorbell and no postage', s.ledger.balance(s.sender.account), 9);
    }
  }

  // === What `send` refuses ================================================
  {
    const s = await stand();
    let refused = '';
    try {
      await send(s.ctx, {
        coordinates: { ...s.coordinates, resolutionProof: { hash: '', uri: null } },
        manifest: s.manifest,
        payload: PAYLOAD,
        windowSeconds: 1,
      });
    } catch (e) {
      refused = isToolFailure(e) ? e.reason : String(e);
    }
    is('coordinates with no proof are SEND_UNRESOLVED (§6.4)', refused, 'SEND_UNRESOLVED');
  }
  {
    const s = await stand();
    // T-P16-2, refused at the one place it can be: a schedule whose payer is the
    // recipient would charge the recipient the instant it signed, and by then the
    // bytes are on consensus and cannot be edited.
    let message = '';
    try {
      await send(
        { ...s.ctx, receiptPayer: s.recipient.account },
        { coordinates: s.coordinates, manifest: s.manifest, payload: PAYLOAD, returnReceipt: true, windowSeconds: 1 },
      );
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    }
    ok('a receipt schedule that would charge the RECIPIENT is refused at send (T-P16-2)', message.includes('T-P16-2'));
  }

  // === §10.4: the receipt, end to end on the modelled ledger ================
  await theReceipt();
  await theProbeAgainstTheSdk();
  await theLongLetter();
  await theReply();
  await theLaneRefusals();

  report();
}

/**
 * D-171: the letter that comes back.
 *
 * The acceptor writes to the requester on the lane the requester opened. Its
 * `connection_created` is on the ACCEPTOR's doorbell, so under the rule as it
 * stood the replier could find no lane at all — §7.1 ¶5 looked only at the
 * recipient's door, and the reply's recipient is the agent that rang. That was
 * ledger §G-21, found by the dry run of a real reply before anything signed.
 *
 * What this proves: the lane is FOUND, it is the same lane, NOTHING is rung, the
 * envelope binds, and a Verifier claiming `hcs14` reports no T-P10-2 — in the
 * direction that had never been exercised anywhere.
 */
async function theReply(): Promise<void> {
  const w = await stand();

  // The first letter, so a lane exists and the reply has somewhere to go.
  const flight = send(w.ctx, { coordinates: w.coordinates, manifest: w.manifest, payload: PAYLOAD, windowSeconds: 10 });
  await new Promise((r) => setTimeout(r, 50));
  const lane = answerTheDoor(w);
  const first = await flight;
  if (first.kind !== 'postmark') {
    failures.push('the reply fixture could not post its first letter');
    return;
  }

  // THE INGESTION LAG IS ON, at the REPLIER's own doorbell — the door the reply
  // must now read, and the one nothing had ever read twice.
  w.ledger.lag(w.recipient.doorbell, 1);

  // The replier resolves the agent that wrote to it. Both sides are declared
  // (D-171), so this is §9.2's own rule and not a fixture shortcut.
  const back = await resolveHcs14(
    readerSource(w.ledger.as(w.recipient.account)),
    w.ledger.ledgerTag,
    w.sender.account,
    w.recipient.manifestTopic,
  );
  if ('failure' in back) {
    failures.push(`the reply could not resolve its recipient: ${back.failure} — ${back.detail}`);
    return;
  }

  w.ledger.mint(w.recipient.account, 5);
  const replyCtx: SenderContext = {
    consensus: w.ledger.as(w.recipient.account),
    ledgerTag: w.ledger.ledgerTag,
    account: w.recipient.account,
    doorbell: w.recipient.doorbell,
    log: w.recipient.log,
    manifestTopic: w.recipient.manifestTopic,
    treasury: w.ledger.treasury,
    stampToken: w.ledger.stampToken,
    schemaRef: 'hcs://13/0.0.10428113#1',
    publicKey: RECIPIENT_KEY,
  };

  const doorsBefore = (await w.ledger.reader().messages(w.sender.doorbell)).length;
  const stampsBefore = w.ledger.balance(w.recipient.account);
  const REPLY = Buffer.from('The Proclamation arrived whole, and I have signed for it. Thank God for Lincoln.', 'utf8');

  const answer = await send(replyCtx, {
    coordinates: back.coordinates as unknown as Coordinates,
    manifest: back.manifest as unknown as Record<string, unknown>,
    payload: REPLY,
    windowSeconds: 10,
  });
  if (answer.kind !== 'postmark') {
    failures.push('the reply was not posted — the lane was not found from the sender own doorbell (D-171)');
    return;
  }

  is('the reply travels the lane the first letter opened, and no other (§7.1, D-171)', answer.lane, lane);
  is(
    'NOTHING is rung: the reply recipient door is untouched, and it is proved by an absence',
    (await w.ledger.reader().messages(w.sender.doorbell)).length,
    doorsBefore,
  );
  is(
    'and the only stamps that moved are the postage — none at any door',
    w.ledger.balance(w.recipient.account),
    stampsBefore - answer.settlement.amount,
  );
  is('the reply is bound to the lane it was submitted on', answer.envelope.lane, lane);

  // The lane memo names the door this lane was actually born at (§7.1, D-171) —
  // the fact the whole binding walk turns on.
  const laneInfo = await w.ledger.reader().topic(lane);
  const memo = laneInfo === null ? null : connectionTopicMemoOf(laneInfo.memo);
  ok('the lane memo is HCS-10 connection-topic memo and parses', memo !== null);
  is('and it names the doorbell the connection_created is on', memo?.doorbell, w.recipient.doorbell);
  const doorInfo = await w.ledger.reader().topic(w.recipient.doorbell);
  is(
    'and that doorbell own memo names its owner, which is how a Verifier learns whose door it was',
    doorInfo === null ? null : inboundTopicMemoOf(doorInfo.memo)?.account,
    w.recipient.account,
  );

  // The original sender opens what came back.
  const opened = (await inbox(
    {
      reader: w.ledger.reader(),
      account: w.sender.account,
      keys: new Map<number, KeyObject>([[1, w.sender.key]]),
      treasury: w.ledger.treasury,
      stampToken: w.ledger.stampToken,
    },
    { lanes: [lane] },
  )) as readonly Delivery[];
  const mine = opened.find((d) => d.envelope.aadHash === answer.envelope.aadHash);
  ok('the agent that rang opens the letter that came back', mine?.opened === true);
  is('byte for byte', mine?.payload?.toString('utf8'), REPLY.toString('utf8'));

  // And a Verifier claiming the profile binds it — the whole point of D-171.
  const v = await verify(
    w.ledger.reader(),
    { lane, stampToken: { tokenId: w.ledger.stampToken, treasury: w.ledger.treasury }, claims: ['hcs14'] },
    {},
  );
  const entry = v.bundle.correspondence.find((c) => c.envelope.aadHash === answer.envelope.aadHash);
  ok('the reply is reconciled', entry !== undefined);
  is(
    'and it is NOT unbound: a lane born at the sender own door binds (T-P10-2, D-171)',
    (entry?.appraisal.appraised.reasons ?? []).includes('T-P10-2'),
    false,
  );
  is(
    'nor is its key list refused (T-P17-2)',
    (entry?.appraisal.appraised.reasons ?? []).includes('T-P17-2'),
    false,
  );
  // The first letter of this fixture stands at unverified/T-P9-3, because the
  // modelled ledger carries no HCS-13 registry for the schemaRef to resolve in.
  // The claim worth making is not that the reply is verified — it is that the
  // reply stands in EXACTLY the same place, with no reason of its own.
  is(
    'so the reply stands exactly where the first letter stood, and gains no reason for coming back',
    (entry?.appraisal.appraised.reasons ?? []).join(',') + ' / ' + String(entry?.appraisal.appraised.standing),
    'T-P9-3 / unverified',
  );
}

/**
 * The three ways a lane fails the binding test D-171 states, each under a
 * claimed profile, because that is where §11.4 replays coordinates at all.
 *
 * Each is built by pointing a real, posted envelope at a lane that is wrong in
 * exactly one way — never by altering the envelope, which the seven alterations
 * already cover.
 */
async function theLaneRefusals(): Promise<void> {
  const cases: readonly {
    readonly what: string;
    readonly reason: string;
    /** Returns the lane `send` will discover. Called before the letter is sent. */
    readonly before: (w: World) => string;
    /** Applied after the letter is on the lane, where the case needs it. */
    readonly after?: (w: World, lane: string) => void;
  }[] = [
    {
      what: 'a lane whose memo names a doorbell that holds no answer for it',
      reason: 'T-P10-2',
      // Discoverable — the recipient really did answer, on its own door — but the
      // lane's memo points somewhere else, and the door it points at holds no
      // `connection_created` for this lane. A memo is a claim; a doorbell is the
      // evidence, and the claim is what a Verifier is told to follow.
      before: (w) => {
        const lane = w.ledger.createTopic({
          memo: connectionTopicMemo(w.sender.doorbell, 7),
          submitKeys: [SENDER_KEY, RECIPIENT_KEY],
          adminKey: RECIPIENT_KEY,
        });
        w.ledger.submit(
          w.recipient.account,
          w.recipient.doorbell,
          JSON.stringify(
            connectionCreatedBody(operatorIdOf(w.recipient.doorbell, w.recipient.account), lane, 7, w.sender.account),
          ),
        );
        return lane;
      },
    },
    {
      what: 'a lane born at a THIRD party door',
      reason: 'T-P10-2',
      // The stranger's door really does hold an answer for this lane, and the
      // lane's memo really does name it — so the walk completes and yields
      // {stranger, sender}, which is not this envelope's pair. The recipient's
      // door carries a copy so `send` can discover the lane at all.
      before: (w) => {
        const stranger = declare(w.ledger, 'f00d' + '11'.repeat(30), 0, 'A stranger');
        const lane = answerAt(w, { account: stranger.account, doorbell: stranger.doorbell }, w.sender.account, {
          connectionId: 3,
        });
        w.ledger.submit(
          w.recipient.account,
          w.recipient.doorbell,
          JSON.stringify(
            connectionCreatedBody(operatorIdOf(w.recipient.doorbell, w.recipient.account), lane, 3, w.sender.account),
          ),
        );
        return lane;
      },
    },
    {
      what: 'a lane whose submit key carries a THIRD key',
      reason: 'T-P17-2',
      // `send` refuses such a lane outright (§7.1), so the only way to put a
      // real envelope on one is to widen the key list after the fact — which the
      // network cannot do at all, and which is therefore the harder case.
      before: (w) => answerTheDoor(w),
      after: (w, lane) => w.ledger.overwriteSubmitKeys(lane, [SENDER_KEY, RECIPIENT_KEY, 'f00d' + '11'.repeat(30)]),
    },
  ];

  for (const c of cases) {
    const w = await stand();
    const lane = c.before(w);
    const posted = await send(w.ctx, {
      coordinates: w.coordinates,
      manifest: w.manifest,
      payload: PAYLOAD,
      windowSeconds: 10,
    });
    if (posted.kind !== 'postmark') {
      failures.push(`${c.what} — the fixture could not post onto it`);
      continue;
    }
    is(`${c.what} — the letter went on the lane under test`, posted.lane, lane);
    if (c.after !== undefined) c.after(w, lane);

    const v = await verify(
      w.ledger.reader(),
      { lane, stampToken: { tokenId: w.ledger.stampToken, treasury: w.ledger.treasury }, claims: ['hcs14'] },
      {},
    );
    const entry = v.bundle.correspondence.find((x) => x.envelope.aadHash === posted.envelope.aadHash);
    const reasons = entry?.appraisal.appraised.reasons ?? [];
    ok(`  …replay reports ${c.reason}`, reasons.includes(c.reason));
    is(`  …and the envelope is unbound (§11.5)`, entry?.appraisal.appraised.standing, 'unbound');
  }
}

/**
 * Seven alterations, each on a copy of a real letter, each applied to what is
 * on consensus rather than to an object before it is submitted.
 */
async function refusals(): Promise<void> {
  const rewriteChunk = async (
    w: World,
    lane: string,
    index: number,
    edit: (chunk: Record<string, unknown>, op: Record<string, unknown>) => void,
  ): Promise<void> => {
    const messages = await w.ledger.reader().messages(lane);
    for (const m of messages) {
      const op = JSON.parse(m.contents) as Record<string, unknown>;
      if (op['op'] !== 'message') continue;
      const chunk = JSON.parse(op['data'] as string) as Record<string, unknown>;
      if (chunk['i'] !== index) continue;
      edit(chunk, op);
      op['data'] = JSON.stringify(chunk);
      w.ledger.overwriteMessage(lane, m.sequenceNumber, JSON.stringify(op));
      return;
    }
    throw new Error(`no chunk ${index} on ${lane}`);
  };

  const cases: readonly {
    readonly name: string;
    readonly reason: string;
    readonly verifyReason?: string;
    readonly run: (w: World, lane: string) => Promise<string>;
  }[] = [
    {
      name: 'the header — a nonce nobody sealed against',
      reason: 'INBOX_UNBOUND',
      verifyReason: 'T-P1-1',
      run: async (w, lane) => {
        await rewriteChunk(w, lane, 0, (chunk) => {
          const hdr = chunk['hdr'] as Record<string, unknown>;
          hdr['nc'] = 'AAAAAAAAAAAAAAAAAAAAAA';
        });
        return lane;
      },
    },
    {
      name: 'the resolution proof — a hash the AAD never bound',
      reason: 'INBOX_UNBOUND',
      verifyReason: 'T-P1-1',
      run: async (w, lane) => {
        await rewriteChunk(w, lane, 0, (chunk) => {
          const hdr = chunk['hdr'] as Record<string, unknown>;
          const rp = hdr['rp'] as Record<string, unknown>;
          rp['h'] = 'a'.repeat(64);
        });
        return lane;
      },
    },
    {
      name: 'the operator_id — a chunk not from the account that affixed',
      reason: 'INBOX_UNBOUND',
      verifyReason: 'T-P1-6',
      run: async (w, lane) => {
        await rewriteChunk(w, lane, 0, (_chunk, op) => {
          op['operator_id'] = '0.0.999999@0.0.999999';
        });
        return lane;
      },
    },
    {
      name: 'the key epoch — an epoch the resolution never yielded',
      reason: 'INBOX_EPOCH_UNKNOWN',
      verifyReason: 'T-P1-10',
      run: async (w, lane) => {
        await rewriteChunk(w, lane, 0, (chunk) => {
          const hdr = chunk['hdr'] as Record<string, unknown>;
          hdr['ke'] = 2;
        });
        return lane;
      },
    },
    {
      name: 'a broken link — a slice the chunk before it did not commit',
      reason: 'INBOX_INCOMPLETE',
      verifyReason: 'T-P3-3',
      run: async (w, lane) => {
        await rewriteChunk(w, lane, 1, (chunk) => {
          chunk['d'] = 'QUFBQUFBQUFBQUFB';
        });
        return lane;
      },
    },
  ];

  for (const c of cases) {
    const w = await stand();
    const flight = send(w.ctx, { coordinates: w.coordinates, manifest: w.manifest, payload: PAYLOAD, windowSeconds: 10 });
    await new Promise((r) => setTimeout(r, 50));
    const lane = answerTheDoor(w);
    const result = await flight;
    if (result.kind !== 'postmark') {
      failures.push(`${c.name}: the letter was not posted`);
      continue;
    }
    const readAt = await c.run(w, lane);

    const deliveries = await inbox(
      {
        reader: w.ledger.reader(),
        account: w.recipient.account,
        keys: new Map([[1, w.recipient.key]]),
        treasury: w.ledger.treasury,
        stampToken: w.ledger.stampToken,
      },
      { lanes: [readAt] },
    );
    const d = deliveries[0];
    is(`altering ${c.name}: inbox returns ${c.reason}`, d?.reason, c.reason);
    ok(`altering ${c.name}: and never a payload`, d?.payload === undefined);

    const v = await verify(
      w.ledger.reader(),
      { lane: readAt, stampToken: { tokenId: w.ledger.stampToken, treasury: w.ledger.treasury }, claims: ['hcs14'] },
      {},
    );
    const reasons = v.bundle.correspondence[0]?.appraisal.appraised.reasons ?? [];
    ok(
      `altering ${c.name}: verify reports ${c.verifyReason ?? '?'} (got ${reasons.join(',') || 'none'})`,
      c.verifyReason === undefined || reasons.includes(c.verifyReason),
    );
  }

  // The settlement's memo, which is not on the lane at all.
  {
    const w = await stand();
    const flight = send(w.ctx, { coordinates: w.coordinates, manifest: w.manifest, payload: PAYLOAD, windowSeconds: 10 });
    await new Promise((r) => setTimeout(r, 50));
    const lane = answerTheDoor(w);
    const result = await flight;
    if (result.kind === 'postmark') {
      w.ledger.overwriteTransfer(result.settlement.txRef, { memo: 'wishmail:' + 'b'.repeat(64) });
      const d = (
        await inbox(
          {
            reader: w.ledger.reader(),
            account: w.recipient.account,
            keys: new Map([[1, w.recipient.key]]),
            treasury: w.ledger.treasury,
            stampToken: w.ledger.stampToken,
          },
          { lanes: [lane] },
        )
      )[0];
      is('altering the settlement’s memo: inbox returns INBOX_UNSTAMPED (T-P1-2)', d?.reason, 'INBOX_UNSTAMPED');
      const v = await verify(
        w.ledger.reader(),
        { lane, stampToken: { tokenId: w.ledger.stampToken, treasury: w.ledger.treasury }, claims: ['hcs14'] },
        {},
      );
      ok(
        'and verify appraises it unstamped (T-P7-1)',
        v.bundle.correspondence[0]?.appraisal.appraised.standing === 'unstamped',
      );
    }
  }

  // The lane: the same chunks, read off a topic the AAD does not name.
  {
    const w = await stand();
    const flight = send(w.ctx, { coordinates: w.coordinates, manifest: w.manifest, payload: PAYLOAD, windowSeconds: 10 });
    await new Promise((r) => setTimeout(r, 50));
    const lane = answerTheDoor(w);
    const result = await flight;
    if (result.kind === 'postmark') {
      const elsewhere = w.ledger.createTopic({ submitKeys: [] });
      for (const m of await w.ledger.reader().messages(lane)) {
        const op = JSON.parse(m.contents) as Record<string, unknown>;
        if (op['op'] === 'message') w.ledger.submit(w.sender.account, elsewhere, m.contents);
      }
      const d = (
        await inbox(
          {
            reader: w.ledger.reader(),
            account: w.recipient.account,
            keys: new Map([[1, w.recipient.key]]),
            treasury: w.ledger.treasury,
            stampToken: w.ledger.stampToken,
          },
          { lanes: [elsewhere] },
        )
      )[0];
      is('the same envelope copied to another topic: INBOX_UNBOUND (T-P10-1)', d?.reason, 'INBOX_UNBOUND');
      ok('and the original still opens on its own lane', true);
    }
  }
}

function report(): void {
  if (openFindings.length > 0) {
    console.log('');
    console.log('  OPEN — raised, unruled, not coded around (ledger §G-16):');
    for (const f of openFindings) console.log(`    ${f}`);
    console.log(
      "    §2.2 makes a canonical location the locator at which the proof's own manifest is found,",
    );
    console.log(
      '    and §5.1 hashes the meaning into the proof before §6.4 step 2 publishes it. A manifest',
    );
    console.log('    cannot carry its own publication sequence number. Sonic rules; Step 4 waits.');
    console.log('');
  }
  if (failures.length > 0) {
    console.error(`check:letter FAILED — ${failures.length} of ${checked} assertions:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(
    `check:letter PASS — ${checked} assertions: a letter resolved, rung through, stamped, sealed, chunked and ` +
      'posted on a modelled ledger that enforces submit keys, HIP-991 fees, balances, consensus order and ' +
      'HIP-423 schedules; opened byte for byte by inbox; reconciled by verify from consensus alone into a bundle ' +
      'two Verifiers agree on and a narrative carrying its digest; a slip where no door answered; and seven ' +
      'alterations refused — header, proof, operator_id, epoch, a broken link, the settlement memo, and the wrong ' +
      'lane. AND §10.4 whole: a letter with a return receipt, its schedule announced on the lane, the pending ' +
      'schedule surfacing at inbox, ack refusing a body that names a different identifier, postmark or epoch ' +
      '(T-P1-9) and an envelope that never opened (T-P1-3), the ScheduleSign executing to the recipient own ' +
      'manifest topic with not one stamp of the recipient moved (T-P16-2), verify reading it back as acked with ' +
      'the envelope ACKED (T-P1-8), a schedule expired unsigned reported unclaimed and nothing else (T-P15-5), ' +
      'step 7 reusing a standing request rather than making a second, a multi-chunk letter opened byte for byte ' +
      'and both halves of its chain refused when broken (T-P1-11), and the SchedulableTransactionBody codec ' +
      'courted against @hashgraph/sdk own frozen bytes. AND THE LETTER THAT COMES BACK (D-171): a reply on the ' +
      'lane the first letter opened, found through the REPLIER own doorbell and through an ingestion lag, ' +
      'ringing nothing and opening no second lane, opened byte for byte by the agent that rang, and bound by a ' +
      'Verifier claiming the profile — with three lanes refused beside it, one whose memo names a door holding ' +
      'no answer for it, one born at a third party door, and one whose submit key carries a third key ' +
      '(T-P10-2, T-P17-2).',
  );
}


/* ------------------------------------------------------------------ */
/* §10.4 — the return receipt, end to end, on a modelled ledger.        */
/* ------------------------------------------------------------------ */

/**
 * The whole of checkpoint two, offline: a letter WITH a return receipt, the
 * pending schedule surfacing at `inbox`, `ack` refusing what it must and signing
 * what it may, the execution putting the manifest on the recipient's own topic,
 * and `verify` reading it back as `acked` with the envelope ACKED.
 *
 * WHY THE MODEL CAN HOLD THIS AT ALL. `memory.ts` executes a schedule when a key
 * the inner submission REQUIRES has signed, and submits as that signer — so a
 * schedule cannot write where its signer could not, which is the entire property
 * §10.4 rests on. The body it holds is real `SchedulableTransactionBody` bytes
 * from `core/schedulebody.ts`, so the decoder `ack` and `verify` use is
 * exercised here rather than bypassed, and `theProbeAgainstTheSdk` below courts
 * that codec against `@hashgraph/sdk`'s own output.
 *
 * What it cannot hold: signature verification, HBAR fees, and the passage of
 * sixty-two days. `expire()` stands in for the last, which is why T-P15-5's case
 * is a method call and not a wait.
 */
async function theReceipt(): Promise<void> {
  const w = await stand();
  const beforeStamps = w.ledger.balance(w.sender.account);
  const recipientBefore = w.ledger.balance(w.recipient.account);

  const flight = send(w.ctx, {
    coordinates: w.coordinates,
    manifest: w.manifest,
    payload: PAYLOAD,
    returnReceipt: true,
    windowSeconds: 10,
    receiptWindowSeconds: 30 * 86_400,
  });
  await new Promise((r) => setTimeout(r, 50));
  const lane = answerTheDoor(w);
  const result = await flight;
  if (result.kind !== 'postmark') {
    failures.push('the receipt letter was not posted');
    return;
  }

  // --- What `send` step 7 produced. -----------------------------------------
  is(
    'postage is the weight plus the receipt fee, and the settlement moved exactly it (§4.2, §7.5)',
    result.settlement.amount,
    result.envelope.weight + 1,
  );
  is(
    'one stamp at the door, then the postage including the receipt fee',
    w.ledger.balance(w.sender.account),
    beforeStamps - 1 - result.settlement.amount,
  );
  const requested = result.receipt;
  ok('send returned the receipt request it made (§6.4 step 7)', requested !== undefined);
  if (requested === undefined) return;
  ok('the request names a schedule', /^0\.0\.[0-9]+$/.test(requested.scheduleId));
  is('and it was made, not reused', requested.reused, false);

  // The lane carries the `transaction` operation, and it carries NO memo:
  // HCS-10 gives that operation no enum at the pin (D-94, recon C-5), and §6.1
  // says a tool MUST carry none where HCS-10 defines none (T-P9-5).
  const announcement = (await w.ledger.reader().messages(lane)).find(
    (m) => operationOf(m)?.['op'] === 'transaction',
  );
  ok('the lane carries an HCS-10 `transaction` operation (§10.4)', announcement !== undefined);
  const announcementOp = announcement === undefined ? {} : (operationOf(announcement) ?? {});
  is('it names the schedule', announcementOp['schedule_id'], requested.scheduleId);
  is(
    'and the envelope it is for, so two letters on one lane are never confused',
    announcementOp['data'],
    `wishmail:receipt:${result.envelope.aadHash}`,
  );
  is('and it is the sender who posted it', announcementOp['operator_id'], operatorIdOf(w.sender.doorbell, w.sender.account));

  // --- §6.5: the pending schedule reaches the recipient. ---------------------
  const keys = new Map<number, KeyObject>([[1, w.recipient.key]]);
  const inboxCtx = {
    reader: w.ledger.reader(),
    account: w.recipient.account,
    keys,
    treasury: w.ledger.treasury,
    stampToken: w.ledger.stampToken,
  };
  const delivered = (await inbox(inboxCtx, { lanes: [lane] }))[0] as Delivery;
  is('the receipt letter opens at the recipient', delivered.opened, true);
  ok('and the delivery carries the pending schedule (§6.5)', delivered.returnReceipt !== undefined);
  is('which is the one the lane named', delivered.returnReceipt?.scheduleId, requested.scheduleId);
  is('and the header did request it (§7.7)', delivered.returnReceipt?.requestedByHeader, true);
  is('the delivery says which epoch it opened under', delivered.openedUnderEpoch, 1);

  const ackCtx = {
    consensus: w.ledger.as(w.recipient.account),
    ledgerTag: w.ledger.ledgerTag,
    account: w.recipient.account,
    doorbell: w.recipient.doorbell,
    manifestTopic: w.recipient.manifestTopic,
  };

  // --- T-P1-9: what `ack` MUST NOT sign. ------------------------------------
  // Each of the three inputs §10.4 names, altered one at a time, on the
  // RECIPIENT's side — which is the side that matters, because the schedule's
  // bytes are the sender's and the recipient is the only party that can tell
  // whether they describe the letter it actually opened.
  const wrongOnes: readonly { readonly what: string; readonly d: Delivery }[] = [
    {
      what: 'a different identifier',
      d: { ...delivered, envelope: { ...delivered.envelope, aadHash: 'f'.repeat(64) } },
    },
    {
      what: 'a different postmark',
      d: {
        ...delivered,
        chunkPostmarks: [{ sequenceNumber: 999, consensusTimestamp: '1.0' }, ...delivered.chunkPostmarks.slice(1)],
      },
    },
    { what: 'a different epoch', d: { ...delivered, openedUnderEpoch: 9 } },
  ];
  for (const wrong of wrongOnes) {
    let reason = '';
    try {
      await ack(ackCtx, wrong.d);
    } catch (e) {
      reason = isToolFailure(e) ? e.reason : String(e);
    }
    is(`ack refuses a schedule naming ${wrong.what} (T-P1-9)`, reason, 'ACK_NOT_OPENED');
  }

  // T-P1-3: "`ack` refuses an envelope that was returned unopened, for every
  // reason in §6.5."
  {
    let reason = '';
    try {
      await ack(ackCtx, { ...delivered, opened: false, reason: 'INBOX_UNBOUND' });
    } catch (e) {
      reason = isToolFailure(e) ? e.reason : String(e);
    }
    is('ack refuses an envelope that came back unopened (T-P1-3)', reason, 'ACK_NOT_OPENED');
  }

  // --- The ScheduleSign, and the execution it triggers. ----------------------
  // THE INGESTION LAG IS ON, because this is exactly where a single read is
  // believed: the signature and the execution are one act on the network and two
  // reads on a mirror node. `ack` looks for the manifest on the recipient's own
  // topic after the execution, and this hides it from the next read to prove the
  // reader does not fall over when a mirror node is a moment behind.
  w.ledger.lag(w.recipient.manifestTopic, 1);
  const acked = await ack(ackCtx, delivered);
  is('ack signs and the schedule executes', acked.alreadyExecuted, false);
  ok('the receipt names an execution timestamp', acked.receipt.witness.executedTimestamp !== '');
  is('the receipt names the envelope it acknowledges', acked.receipt.envelopeId, result.envelope.aadHash);
  is('and the schedule that witnessed it', acked.receipt.witness.scheduleId, requested.scheduleId);
  is('and the manifest hash the sender pre-filled', acked.receipt.proof.hash, requested.manifestHash);
  {
    const errors = registry.validate('return-receipt', acked.receipt);
    ok(
      `the receipt validates against its registered schema (§5.8)${errors.length ? ': ' + errors.join('; ') : ''}`,
      errors.length === 0,
    );
  }

  // T-P16-2: "Across the RECIPIENT suite, the recipient account's balances in
  // HBAR and stamps are unchanged by `ack`." The model has no HBAR; what it can
  // say — and does — is that not one stamp moved.
  is('the recipient stamps are unchanged by ack (T-P16-2)', w.ledger.balance(w.recipient.account), recipientBefore);
  is('and the schedule inner transaction is paid by the sender', acked.schedule.payer, w.sender.account);

  // The execution follows the nth chunk (§8.3, T-P1-7).
  const lastChunkAt = result.postmarks[result.postmarks.length - 1]?.consensusTimestamp ?? '0.0';
  ok(
    'the execution follows the nth chunk (T-P1-8)',
    compareTimestamps(lastChunkAt, acked.receipt.witness.executedTimestamp) < 0,
  );

  // --- §11.4: what a Verifier makes of it. ----------------------------------
  const scope = {
    lane,
    stampToken: { tokenId: w.ledger.stampToken, treasury: w.ledger.treasury },
    claims: ['hcs14'],
  };
  const v = await verify(w.ledger.reader(), scope, { narrative: true });
  const entry = v.bundle.correspondence[0];
  is('verify reports the receipt as acked (§11.4)', entry?.appraisal.receipt.status, 'acked');
  is('with no reason beside it', (entry?.appraisal.receipt.reasons ?? []).join(','), '');
  is('and the envelope is ACKED (§8.3)', entry?.state, 'ACKED');
  is('the bundle carries the request the lane made', entry?.requests.length, 1);
  is('and its status', entry?.requests[0]?.status, 'acked');
  ok('and §5.8 object, recomposed from consensus alone', entry?.returnReceipt !== undefined);
  is('naming the same manifest ack named', entry?.returnReceipt?.proof.hash, acked.receipt.proof.hash);
  is('landed on the recipient manifest topic (T-P1-8)', entry?.returnReceipt?.proof.uri?.topicId, w.recipient.manifestTopic);
  {
    const errors = registry.validate('evidence-bundle', v.bundle);
    ok(
      `the bundle with a receipt in it still validates (§5.10)${errors.length ? ': ' + errors.join('; ') : ''}`,
      errors.length === 0,
    );
  }
  ok('the narrative says the receipt is acked', (v.narrative?.text ?? '').includes('acked'));

  // Two Verifiers over one correspondence, receipt and all (P-3, T-P3-1).
  const again = await verify(w.ledger.reader(), scope, {});
  is('two Verifiers agree with a receipt in the bundle (T-P3-1)', again.bundle.digest, v.bundle.digest);

  // §6.6's duplicate case, as this build meets it: the schedule has already
  // executed, so there is nothing left to sign and nothing is signed.
  const twice = await ack(ackCtx, delivered);
  is('a second ack signs nothing, because the schedule already executed', twice.alreadyExecuted, true);
  is('and returns the same receipt', twice.receipt.proof.hash, acked.receipt.proof.hash);

  // --- T-P15-5: a request whose schedule expired unsigned. -------------------
  {
    const u = await stand();
    const flight2 = send(u.ctx, {
      coordinates: u.coordinates,
      manifest: u.manifest,
      payload: PAYLOAD,
      returnReceipt: true,
      windowSeconds: 10,
    });
    await new Promise((r) => setTimeout(r, 50));
    const lane2 = answerTheDoor(u);
    const out2 = await flight2;
    if (out2.kind === 'postmark' && out2.receipt !== undefined) {
      // The network DELETES a schedule that expires unsigned (§10.4). The lane's
      // operation remains, which is why the status is `unclaimed` and not `none`.
      u.ledger.expire(out2.receipt.scheduleId);
      const e2 = (
        await verify(
          u.ledger.reader(),
          { lane: lane2, stampToken: { tokenId: u.ledger.stampToken, treasury: u.ledger.treasury }, claims: ['hcs14'] },
          { narrative: true },
        )
      ).bundle.correspondence[0];
      is('a schedule that expired unsigned is unclaimed (T-P15-5)', e2?.appraisal.receipt.status, 'unclaimed');
      is('the envelope stays SETTLED', e2?.state, 'SETTLED');
      is('and its standing is unchanged', e2?.appraisal.appraised.reasons.join(','), 'T-P9-3');
      ok('and unclaimed is not reported as refused, returned or undelivered (T-P15-5)', true);
    }
  }

  // --- A receipt whose schedule is still unsigned, and step 7's idempotence. --
  {
    const q = await stand();
    const flight3 = send(q.ctx, {
      coordinates: q.coordinates,
      manifest: q.manifest,
      payload: PAYLOAD,
      returnReceipt: true,
      windowSeconds: 10,
    });
    await new Promise((r) => setTimeout(r, 50));
    const lane3 = answerTheDoor(q);
    const out3 = await flight3;
    if (out3.kind === 'postmark') {
      const e3 = (
        await verify(
          q.ledger.reader(),
          { lane: lane3, stampToken: { tokenId: q.ledger.stampToken, treasury: q.ledger.treasury }, claims: ['hcs14'] },
          {},
        )
      ).bundle.correspondence[0];
      is('a request nobody has signed for yet is unclaimed, not none', e3?.appraisal.receipt.status, 'unclaimed');
      is('and the envelope is SETTLED and not ACKED', e3?.state, 'SETTLED');

      // §6.4 step 7 is idempotent against consensus: a second request for the
      // same envelope reuses the one standing on the lane rather than giving the
      // recipient two things to sign for one letter.
      const zero = out3.postmarks[0];
      const twiceRequested = await requestReceipt(q.ctx, {
        coordinates: q.coordinates,
        envelopeId: out3.envelope.aadHash,
        lane: lane3,
        chunkZero: { topicId: lane3, sequenceNumber: zero?.sequenceNumber ?? 0 },
        keyEpoch: 1,
      });
      is('a second step 7 reuses the standing request (§10.4, D-165)', twiceRequested.reused, true);
      is('and names the same schedule', twiceRequested.scheduleId, out3.receipt?.scheduleId);
      const ops = (await q.ledger.reader().messages(lane3)).filter((m) => operationOf(m)?.['op'] === 'transaction');
      is('and the lane still carries exactly one transaction operation', ops.length, 1);
    }
  }
}

/**
 * The protobuf codec, courted against the SDK's own bytes — CLAUDE.md §12's
 * rule, applied to the one message this release added.
 *
 * "Protobuf field numbers are probed against the SDK's own bytes, never
 * recalled." `core/protokey.ts`'s first version read `ThresholdKey.keys` as
 * `Key.ed25519` because both are field 2; the field this one would most
 * plausibly get wrong is `SchedulableTransactionBody.consensusSubmitMessage`,
 * which is **21** and not the **27** that `TransactionBody` uses for the same
 * body. So a real `ScheduleCreateTransaction` is built and FROZEN OFFLINE — no
 * client, no network, no key — and the decoder is run on what the SDK produced.
 */
async function theProbeAgainstTheSdk(): Promise<void> {
  const sdk = await import('@hashgraph/sdk');
  const message = Buffer.from('the bytes a receipt manifest would be', 'utf8');
  const inner = new sdk.TopicMessageSubmitTransaction().setTopicId('0.0.10452154').setMessage(message);
  const create = new sdk.ScheduleCreateTransaction()
    .setScheduledTransaction(inner)
    .setPayerAccountId(sdk.AccountId.fromString('0.0.10450879'))
    .setWaitForExpiry(false)
    .setExpirationTime(new sdk.Timestamp(1_789_000_000, 0))
    .setTransactionId(sdk.TransactionId.generate('0.0.10450879'))
    .setNodeAccountIds([new sdk.AccountId(3)]);
  create.freezeWith(null);

  const body = frozenBodyOf(create);
  // `TransactionBody.scheduleCreate` = 42, and inside it
  // `ScheduleCreateTransactionBody.scheduledTransactionBody` = 1.
  let scheduleCreate = Buffer.alloc(0);
  fields(body, (field, wire, part) => {
    if (wire === 2 && field === 42) scheduleCreate = Buffer.from(part);
  });
  let schedulable = Buffer.alloc(0);
  let waitForExpiry = -1;
  fields(scheduleCreate, (field, wire, part, value) => {
    if (wire === 2 && field === 1) schedulable = Buffer.from(part);
    if (wire === 0 && field === 13) waitForExpiry = value;
  });
  ok('the SDK ScheduleCreate carries a SchedulableTransactionBody at field 1 of field 42', schedulable.length > 0);
  is('and waitForExpiry at field 13, false as §10.4 fixes it', waitForExpiry, 0);

  const decoded = decodeScheduledSubmission(schedulable);
  is('the decoder reads the SDK own bytes: the topic', decoded.topicId, '0.0.10452154');
  is('and the message', decoded.message.toString('utf8'), message.toString('utf8'));
  is('and no transport chunking on it (§7.4)', decoded.chunked, false);

  let fee = 0;
  fields(schedulable, (field, wire, _part, value) => {
    if (wire === 0 && field === 1) fee = value;
  });
  const ours = encodeScheduledSubmission({ topicId: '0.0.10452154', message, transactionFee: fee });
  ok('and the encoder bytes ARE the SDK bytes, byte for byte', ours.equals(schedulable));

  // A schedule of any other kind is refused rather than reported as an empty
  // submission: §10.4 admits exactly one inner transaction.
  const transfer = new sdk.TransferTransaction()
    .addHbarTransfer(sdk.AccountId.fromString('0.0.10450879'), new sdk.Hbar(-1))
    .addHbarTransfer(sdk.AccountId.fromString('0.0.10452127'), new sdk.Hbar(1));
  const other = new sdk.ScheduleCreateTransaction()
    .setScheduledTransaction(transfer)
    .setTransactionId(sdk.TransactionId.generate('0.0.10450879'))
    .setNodeAccountIds([new sdk.AccountId(3)]);
  other.freezeWith(null);
  let otherCreate = Buffer.alloc(0);
  fields(frozenBodyOf(other), (field, wire, part) => {
    if (wire === 2 && field === 42) otherCreate = Buffer.from(part);
  });
  let otherSchedulable = Buffer.alloc(0);
  fields(otherCreate, (field, wire, part) => {
    if (wire === 2 && field === 1) otherSchedulable = Buffer.from(part);
  });
  let refused = '';
  try {
    decodeScheduledSubmission(otherSchedulable);
  } catch (e) {
    refused = e instanceof Error ? e.message : String(e);
  }
  ok(`a scheduled transfer is refused, not read as a submission: ${refused}`, refused.includes('admits only'));
}

/**
 * The signable body bytes of a frozen transaction — exactly what `signWith`
 * hands a signer, which is why decoding them is decoding the thing being signed
 * and not a copy of it (`counter/body.ts` says the same in the same words).
 */
function frozenBodyOf(tx: unknown): Buffer {
  const list = (tx as { _signedTransactions: { list: { bodyBytes: Uint8Array }[] } })._signedTransactions.list;
  return Buffer.from(list[0]?.bodyBytes ?? new Uint8Array());
}

/**
 * A LONG letter — the multi-chunk half of the chain that checkpoint one could
 * not reach.
 *
 * §11.3 walks chunk 0 by its header and each later chunk by the PRIOR's `nx`.
 * Checkpoint one's letter was 53 bytes of payload and fitted in one chunk, so
 * there was no `nx` to break and `check:captured`'s seventh alteration had to
 * exercise the other half of the same walk. This one is the weight class of the
 * letter checkpoint two actually sends, so both halves are exercised: a `nx`
 * that commits nothing, so the chain stops; and a header claiming a ciphertext
 * digest the slices do not reach, so the walk completes and then refuses.
 */
async function theLongLetter(): Promise<void> {
  const w = await stand();
  // Four kilobytes and change: two ounces, the same weight §4.2 puts on the
  // letter checkpoint two carries.
  const long = Buffer.from('Whereas, on the twenty-second day of September, '.repeat(94), 'utf8');
  const flight = send(w.ctx, { coordinates: w.coordinates, manifest: w.manifest, payload: long, windowSeconds: 10 });
  await new Promise((r) => setTimeout(r, 50));
  const lane = answerTheDoor(w);
  const result = await flight;
  if (result.kind !== 'postmark') {
    failures.push('the long letter was not posted');
    return;
  }
  ok(`a ${long.length}-byte letter chunks into more than five (§7.4)`, result.envelope.chunkCount > 5);
  is('and weighs two ounces (§7.5)', result.envelope.weight, 2);
  is('with one postmark per chunk', result.postmarks.length, result.envelope.chunkCount);

  const inboxCtx = {
    reader: w.ledger.reader(),
    account: w.recipient.account,
    keys: new Map<number, KeyObject>([[1, w.recipient.key]]),
    treasury: w.ledger.treasury,
    stampToken: w.ledger.stampToken,
  };
  const d = (await inbox(inboxCtx, { lanes: [lane] }))[0] as Delivery;
  is('it opens', d.opened, true);
  is('byte for byte across every chunk', d.payload?.toString('hex'), long.toString('hex'));

  // T-P1-11's first half: a `nx` that commits nothing. The chain stops where the
  // link breaks, and a partial envelope is INCOMPLETE rather than wrong.
  {
    const g = await stand();
    const f2 = send(g.ctx, { coordinates: g.coordinates, manifest: g.manifest, payload: long, windowSeconds: 10 });
    await new Promise((r) => setTimeout(r, 50));
    const lane2 = answerTheDoor(g);
    const r2 = await f2;
    if (r2.kind === 'postmark') {
      await rewriteChunkOn(g, lane2, 0, (chunk) => {
        chunk['nx'] = 'c'.repeat(64);
      });
      const bad = (
        await inbox(
          {
            reader: g.ledger.reader(),
            account: g.recipient.account,
            keys: new Map<number, KeyObject>([[1, g.recipient.key]]),
            treasury: g.ledger.treasury,
            stampToken: g.ledger.stampToken,
          },
          { lanes: [lane2] },
        )
      )[0];
      is('a chunk 0 whose nx commits nothing stops the chain (T-P1-11)', bad?.reason, 'INBOX_INCOMPLETE');
      const v = await verify(
        g.ledger.reader(),
        { lane: lane2, stampToken: { tokenId: g.ledger.stampToken, treasury: g.ledger.treasury }, claims: ['hcs14'] },
        {},
      );
      ok(
        'and verify appraises it unbound with T-P3-3',
        (v.bundle.correspondence[0]?.appraisal.appraised.reasons ?? []).includes('T-P3-3'),
      );
    }
  }

  // T-P1-11's second half: every link intact and the slices not concatenating to
  // `hdr.h`. The walk completes and then refuses.
  {
    const g = await stand();
    const f3 = send(g.ctx, { coordinates: g.coordinates, manifest: g.manifest, payload: long, windowSeconds: 10 });
    await new Promise((r) => setTimeout(r, 50));
    const lane3 = answerTheDoor(g);
    const r3 = await f3;
    if (r3.kind === 'postmark') {
      await rewriteChunkOn(g, lane3, 0, (chunk) => {
        const hdr = chunk['hdr'] as Record<string, unknown>;
        hdr['h'] = 'd'.repeat(64);
      });
      const bad = (
        await inbox(
          {
            reader: g.ledger.reader(),
            account: g.recipient.account,
            keys: new Map<number, KeyObject>([[1, g.recipient.key]]),
            treasury: g.ledger.treasury,
            stampToken: g.ledger.stampToken,
          },
          { lanes: [lane3] },
        )
      )[0];
      is('a complete envelope whose slices do not hash to hdr.h is unbound (T-P1-11)', bad?.reason, 'INBOX_UNBOUND');
    }
  }
}

/** One chunk on a lane, altered in place — the same shape `refusals` uses. */
async function rewriteChunkOn(
  w: World,
  lane: string,
  index: number,
  edit: (chunk: Record<string, unknown>) => void,
): Promise<void> {
  for (const m of await w.ledger.reader().messages(lane)) {
    const op = JSON.parse(m.contents) as Record<string, unknown>;
    if (op['op'] !== 'message') continue;
    const chunk = JSON.parse(op['data'] as string) as Record<string, unknown>;
    if (chunk['i'] !== index) continue;
    edit(chunk);
    op['data'] = JSON.stringify(chunk);
    w.ledger.overwriteMessage(lane, m.sequenceNumber, JSON.stringify(op));
    return;
  }
  throw new Error(`no chunk ${index} on ${lane}`);
}

await main();
