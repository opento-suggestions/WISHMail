/**
 * A modelled world, stood up — and NOTHING that runs a tool or decides a verdict.
 *
 * RECORD (Sonic, 2026-09-11): "The world builder in `conformance/support/`:
 * ledger, keys, topics, declarations — construction only. No call to `verify`,
 * `inbox`, `send`, or any tool; no computed expectation; each body calls the tool
 * itself and makes its own assertion."
 *
 * So this file builds consensus as a data structure and populates it with agents
 * that are well-formed under §4.6 and §9.2 — accounts, keys, a doorbell with
 * §4.4's fee, an outbound log, a manifest topic, an HCS-11 profile inside a real
 * HCS-1 file, an HCS-2 registry entry, an account memo pointing at it, and an
 * HCS-13 registration for the chunk schema. Then it stops. It does not resolve an
 * address, seal an envelope, post a letter, read an inbox or appraise anything:
 * `resolve` is one of §6.1's six and is the body's to call, like the rest.
 *
 * WHEN THE MODEL IS PERMITTED, AND WHEN IT IS NOT. RECORD, same ruling: the
 * modelled ledger is permitted for a clause whose sketch is BEHAVIOUR — a
 * refusal, an ordering, a window, a price computation — in any class; and refused
 * for any clause whose claim is replay of consensus, whose whole point is that
 * the bytes came from a real network. A row with both halves runs the model for
 * the behaviour clause and is an honest partial for the replay clause. Every
 * model-backed body is marked `model` in the report and counts toward no claim.
 *
 * WHAT THE MODEL ENFORCES, because it is what makes a refusal mean something
 * (`app/src/tools/memory.ts`): a topic with a submit key refuses a submission
 * from any other key; a topic with a HIP-991 custom fee assesses it, to the
 * collector, from the submitter, unless the submitter's key is fee-exempt; a
 * transfer moves tokens between balances and fails if the balance is short; a
 * schedule executes only when a key the inner submission REQUIRES has signed; and
 * consensus order is total. What it does NOT model is signature verification,
 * fees in HBAR, throttles or expiry — so a behaviour that needs a real network
 * refusal or a real clock is a named partial and not a thing to fake here.
 */
import type { KeyObject } from 'node:crypto';
import { hcs1File } from '../../app/src/ops/hcs1.js';
import { connectionCreatedBody, connectionTopicMemo, operatorId } from '../../app/src/ops/hcs10.js';
import { generateRecipientKey } from '../../app/src/core/seal.js';
import { MemoryLedger } from '../../app/src/tools/memory.js';

/** One agent in a modelled world, provisioned as §4.6 provisions one. */
export interface Agent {
  /** The key string this agent signs with. In the model a key IS a string. */
  readonly key: string;
  readonly account: string;
  /** HCS-10 inbound, carrying §4.4's fee with the owner fee-exempt. */
  readonly doorbell: string;
  /** HCS-10 outbound. */
  readonly log: string;
  /** Where this agent publishes its proofs (§9.1). */
  readonly manifestTopic: string;
  /** The HCS-2 declaration registry its account memo names (§9.2). */
  readonly registry: string;
  /** The HCS-1 file the registry's current entry names. */
  readonly profileFile: string;
  readonly x25519Pub: string;
  /** The private half, held by the agent's own process and nowhere else (P-13). */
  readonly openWith: KeyObject;
  readonly keyEpoch: number;
}

export interface World {
  readonly ledger: MemoryLedger;
  /** The HCS-13 locator this world's chunks may declare, and which resolves in it. */
  readonly schemaRef: string;
  readonly agents: Readonly<Record<string, Agent>>;
}

export interface AgentSpec {
  readonly name: string;
  /** A distinct key string. Two agents differ exactly where their keys differ. */
  readonly key: string;
  readonly stamps: number;
  readonly displayName: string;
  readonly keyEpoch?: number;
}

/**
 * Provision one agent into a modelled ledger, as §4.6 provisions one.
 *
 * The order is §9.2's chain read backwards: the file, then the registry entry
 * that names it, then the account memo that names the registry. A reader
 * following the chain forwards — account memo, registry, current entry, profile
 * file, `properties.wishmail` — finds every link, which is what makes the address
 * resolvable at all.
 */
function provision(ledger: MemoryLedger, spec: AgentSpec): Agent {
  const keyEpoch = spec.keyEpoch ?? 1;
  const encryption = generateRecipientKey();
  const account = ledger.createAccount(spec.key, spec.stamps);

  const doorbell = ledger.createTopic({
    memo: `hcs-10:0:60:0:${account}`,
    submitKeys: [],
    // §4.4: ringing a stranger's bell costs one stamp, consumed to the treasury.
    customFees: [{ amount: 1, tokenId: ledger.stampToken, collector: ledger.treasury }],
    // D-137, D-138: "the recipient owes nothing to answer".
    feeExemptKeys: [spec.key],
  });
  const log = ledger.createTopic({ memo: 'hcs-10:0:60:1', submitKeys: [spec.key] });
  const manifestTopic = ledger.createTopic({ memo: 'wishmail:manifest:1', submitKeys: [spec.key] });

  const profileDoc = {
    version: '1.0',
    display_name: spec.displayName,
    inboundTopicId: doorbell,
    outboundTopicId: log,
    properties: {
      wishmail: { manifestTopic, x25519Pub: encryption.x25519Pub, keyEpoch },
    },
  };
  const file = hcs1File(Buffer.from(JSON.stringify(profileDoc), 'utf8'), 'application/json');
  // An HCS-1 file topic has no admin key (D-150), so what lands there is final.
  const profileFile = ledger.createTopic({ memo: file.memo, submitKeys: [spec.key], adminKey: null });
  for (const chunk of file.chunks) ledger.submit(account, profileFile, JSON.stringify(chunk));

  const registry = ledger.createTopic({ memo: 'hcs-2:0:60', submitKeys: [spec.key], adminKey: spec.key });
  ledger.submit(account, registry, JSON.stringify({ p: 'hcs-2', op: 'register', t_id: profileFile }));
  ledger.setAccountMemo(account, `hcs-11:hcs://2/${registry}`);

  return {
    key: spec.key,
    account,
    doorbell,
    log,
    manifestTopic,
    registry,
    profileFile,
    x25519Pub: encryption.x25519Pub,
    openWith: encryption.keyPair.privateKey,
    keyEpoch,
  };
}

/** Two agents, distinct keys, one with stamps to spend and one without. */
export const TWO: readonly AgentSpec[] = [
  { name: 'sender', key: `5e4d${'a1'.repeat(30)}`, stamps: 40, displayName: 'Correspondent A' },
  { name: 'recipient', key: `b0b1${'c2'.repeat(30)}`, stamps: 0, displayName: 'Correspondent B' },
];

/**
 * Stand up a world.
 *
 * The HCS-13 registration is here because a chunk declares one (§5.11) and both
 * readers now resolve it — `verify` for `T-P9-3` and `inbox` for §6.5's
 * `INBOX_SCHEMA_UNRESOLVED`. A world whose locator resolved to nothing would be a
 * world where every letter comes back unopened for a reason the test is not
 * about. The registry is modelled PUBLIC: who may register a schema is the
 * Postmaster's business and is courted elsewhere, and what a body needs from it
 * here is only that the locator resolves.
 */
export function stand(specs: readonly AgentSpec[] = TWO): World {
  const ledger = new MemoryLedger();

  const agents: Record<string, Agent> = {};
  for (const spec of specs) agents[spec.name] = provision(ledger, spec);

  const schemaFile = ledger.createTopic({ memo: 'chunkschema:brotli:base64', submitKeys: [], adminKey: null });
  const schemaRegistry = ledger.createTopic({ memo: 'hcs-2:0:60', submitKeys: [] });
  const first = specs[0];
  if (first === undefined) throw new Error('a world stands up at least one agent');
  ledger.submit(
    (agents[first.name] as Agent).account,
    schemaRegistry,
    JSON.stringify({ p: 'hcs-2', op: 'register', t_id: schemaFile, metadata: { name: 'chunk' } }),
  );

  return { ledger, schemaRef: `hcs://13/${schemaRegistry}#1`, agents };
}

/**
 * Open a lane between two agents, as §7.1 has one opened.
 *
 * Construction, not behaviour: this puts on consensus exactly what a doorbell
 * watcher puts there when it answers — the connection topic, whose memo names
 * the doorbell it was born on and whose submit key is a threshold of exactly the
 * two parties' keys, and the `connection_created` on the ACCEPTOR's own doorbell
 * naming the party that rang. A Verifier walks those backwards to bind an
 * envelope to the lane (§11.4, D-171), and a body that wants a letter to travel
 * needs a lane for it to travel on.
 *
 * It is here and not in a body because standing up a lane decides nothing: every
 * assertion about lanes — that a reply rings nothing, that a third key is
 * refused, that a lane born at a stranger's door does not bind — is the body's.
 */
export function openLane(
  world: World,
  args: {
    readonly acceptor: Agent;
    readonly requester: Agent;
    readonly connectionId?: number;
    /** Override the key list, for a body testing §7.1's "exactly" (T-P17-2). */
    readonly submitKeys?: readonly string[];
  },
): string {
  const connectionId = args.connectionId ?? 1;
  const lane = world.ledger.createTopic({
    memo: connectionTopicMemo(args.acceptor.doorbell, connectionId),
    submitKeys: [...(args.submitKeys ?? [args.requester.key, args.acceptor.key])],
    adminKey: args.acceptor.key,
  });
  world.ledger.submit(
    args.acceptor.account,
    args.acceptor.doorbell,
    JSON.stringify(
      connectionCreatedBody(
        operatorId(args.acceptor.doorbell, args.acceptor.account),
        lane,
        connectionId,
        args.requester.account,
      ),
    ),
  );
  return lane;
}

/** The two parties of `TWO`, named, for the bodies that use the default world. */
export function pair(world: World): { readonly sender: Agent; readonly recipient: Agent } {
  const sender = world.agents['sender'];
  const recipient = world.agents['recipient'];
  if (sender === undefined || recipient === undefined) throw new Error('this world holds no sender and recipient');
  return { sender, recipient };
}
