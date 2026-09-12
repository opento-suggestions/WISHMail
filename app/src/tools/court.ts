/**
 * THE MODEL COURT — the world `check:letter` and `check:outputs` both stand in.
 *
 * This was `letter.check.ts`, lines 109-403, until 2026-09-11. It moved here
 * unchanged, byte for byte, when a SECOND court needed the same world:
 * `sdk/outputs.check.ts` validates every verb's real return against the
 * `outputSchema` this server publishes, and the returns it validates have to
 * be the LETTER'S returns. A second world built beside this one would be a
 * second spelling of §4.6 and §9.2, agreeing with the first only by
 * inspection — which `core/hcs14.ts` and CLAUDE.md §9 both refuse — and, worse,
 * a court whose world is not the letter’s world proves nothing about the
 * letter's outputs.
 *
 * So it is one world, in one file, with two courts reading it. Nothing here
 * asserts: there is no `ok`, no `is` and no counter, and that is deliberate —
 * this module builds the world and the courts judge it.
 *
 * The doc comments below are the record of three real defects (the HCS-10 memo
 * forms, the empty profile file, the unresolvable schema locator) and travel
 * with the code they describe.
 */
import type { KeyObject } from 'node:crypto';
import { generateRecipientKey } from '../core/seal.js';
import {
  connectionCreatedBody,
  outboundConnectionCreatedByAcceptor,
  connectionTopicMemo,
  operatorId as operatorIdOf,
} from '../ops/hcs10.js';
import { hcs1File } from '../ops/hcs1.js';
import { resolveHcs14 } from '../resolve/hcs14.js';
import { readerSource } from './verify.js';
import { MemoryLedger } from './memory.js';
import type { Coordinates, SenderContext } from './send.js';

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
export const SENDER_KEY = '5e4d' + 'a1'.repeat(30);
export const RECIPIENT_KEY = 'b0b1' + 'c2'.repeat(30);

/** Everything the two agents own, stood up as §4.6 provisions it. */
export interface World {
  readonly ledger: MemoryLedger;
  /** The HCS-13 locator this world's chunks declare, and which resolves in it. */
  readonly schemaRef: string;
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
export interface Declared {
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
export function declare(ledger: MemoryLedger, key: string, stamps: number, displayName: string): Declared {
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

export async function stand(): Promise<World> {
  const ledger = new MemoryLedger();

  const recipientSide = declare(ledger, RECIPIENT_KEY, 0, 'Correspondent B');
  const senderSide = declare(ledger, SENDER_KEY, 10, 'Correspondent A');

  // THE SCHEMA REGISTRY, BECAUSE A MODEL MUST WEAR THE WIRE'S OWN SHAPES.
  //
  // §5.11 makes a chunk's `s` an HCS-13 version-pinned locator, and Step 4
  // registered the fourteen schemas on consensus. This world carried a locator
  // that resolved to nothing — harmless for as long as only `verify` read it,
  // which reported `T-P9-3` and appraised unverified, and a false green the hour
  // `inbox` began reading it too (§6.5's INBOX_SCHEMA_UNRESOLVED, F-9). That is
  // the same defect as the modelled lane memo of 2026-09-10, and the same rule
  // catches it: a field nothing reads today is a field something reads tomorrow.
  //
  // The registry is modelled PUBLIC, and that is a limit worth naming rather
  // than a shortcut: who may register a schema is the Postmaster's business and
  // is courted by `check:freeze` and by T-P9-4 against the real registration.
  // What this world needs is only that the locator its chunks declare RESOLVES,
  // which is the fact `inbox` and `verify` read.
  const schemaFile = ledger.createTopic({ memo: 'chunkschema:brotli:base64', submitKeys: [], adminKey: null });
  const schemaRegistry = ledger.createTopic({ memo: 'hcs-2:0:60', submitKeys: [] });
  ledger.submit(
    senderSide.account,
    schemaRegistry,
    JSON.stringify({ p: 'hcs-2', op: 'register', t_id: schemaFile, metadata: { name: 'chunk' } }),
  );
  const schemaRef = `hcs://13/${schemaRegistry}#1`;

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
    schemaRef,
    publicKey: SENDER_KEY,
  };

  return {
    ledger,
    schemaRef,
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
export function answerTheDoor(w: World): string {
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
export function answerAt(
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

export const PAYLOAD = Buffer.from(
  'Certified mail for agents: this envelope was resolved, stamped, sealed, chunked and posted, and every one of those is a fact on consensus except what it says.',
  'utf8',
);
