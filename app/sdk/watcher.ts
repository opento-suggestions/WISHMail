/**
 * The doorbell watcher — the acceptor's half of first contact.
 *
 * §7.1: "A lane is created by the acceptor in answer to a connection request on
 * its doorbell, per HCS-10 at the pinned revision. Its submit key is a threshold
 * key of the two agents' keys. Its admin key is set at creation per the
 * acceptor's declared topic policy (P-17); no key of the Postmaster appears on
 * it (D-47). It carries no custom fee."
 *
 * WHILE THE PROCESS IS UP, it reads its own doorbell for `connection_request`s
 * with no matching `connection_created` and auto-accepts. Screening is 0.6 and
 * nothing here may make it harder: the decision to accept is one function, and
 * a screen replaces its body.
 *
 * IDEMPOTENT FROM CONSENSUS. What is answered is derived by reading the
 * doorbell — every `connection_created` names the `connection_id` of the request
 * it answered — so a restart re-derives it and answers nothing twice. No local
 * file is consulted, and a wiped home cannot cause a second lane. §7.1 makes
 * that matter: "the lane between a sender and a recipient is the EARLIEST-created
 * open lane between them", so a duplicate lane is not a spare — it is a second
 * lane that neither party will use and that cannot be deleted.
 *
 * THE ACCEPTOR PAYS NOTHING AT THE DOORBELL. D-137's exemption puts the owner's
 * key on the doorbell's fee-exempt list precisely because HCS-10 has the
 * acceptor post `connection_created` on its OWN inbound topic (`index.md:498`).
 * An agent is not charged to answer its own door, and T-P7-4 is the test.
 *
 * Conformance: T-P17-2, T-P11-3, T-P7-4, T-P10-2, T-P14-1.
 */
import { Hbar, KeyList, PublicKey, TopicCreateTransaction } from '@hashgraph/sdk';
import { submit } from '../src/ops/hedera.js';
import { HCS10_TTL } from '../src/ops/template.js';
import { TRANSACTION_MEMO, accountOf, connectionCreatedBody, operatorId as operatorIdOf } from '../src/ops/hcs10.js';
import { operationOf, type TopicMessage } from '../src/tools/consensus.js';
import type { Session } from './session.js';

/**
 * HCS-10's connection-topic memo: `hcs-10:1:{ttl}:2:{inboundTopicId}:{connectionId}`
 * (recon 2026-09-06, `index.md:279`, ledger §H).
 *
 * `indexed = 1` means "only the latest message should be read", and WISHMail
 * keeps the memo and overrides the hint: §7.1's own sentence is "a lane is mail,
 * and every message on it is read", and T-P9-10 is the test that a lane wearing
 * this memo is nevertheless reassembled in full. Strict HCS-10 on the wire, our
 * reading rule in the reader (D-95).
 */
export function connectionTopicMemo(inboundTopicId: string, connectionId: number): string {
  return `hcs-10:1:${HCS10_TTL}:2:${inboundTopicId}:${connectionId}`;
}

/** A request on the doorbell that no `connection_created` answers. */
export interface Unanswered {
  readonly sequenceNumber: number;
  readonly consensusTimestamp: string;
  /** HCS-10's `inboundTopicId@accountId` for the requester. */
  readonly operatorId: string;
  readonly requesterAccount: string;
}

/**
 * Read the doorbell and say what is outstanding. Pure over the messages, so the
 * same function serves the watcher and any test that wants to know what a
 * doorbell owes without touching the network.
 */
export function unanswered(messages: readonly TopicMessage[]): readonly Unanswered[] {
  const answered = new Set<number>();
  const requests: Unanswered[] = [];
  for (const m of messages) {
    const op = operationOf(m);
    if (op === null || op['p'] !== 'hcs-10') continue;
    if (op['op'] === 'connection_created') {
      const id = op['connection_id'];
      // The pinned shape carries it as a JSON NUMBER equal to the request's
      // inbound sequence number (§H, C-6). A string here is another
      // implementation's; both are accepted for reading and only the number is
      // written, because reading is where being generous costs nothing.
      if (typeof id === 'number') answered.add(id);
      else if (typeof id === 'string' && /^\d+$/.test(id)) answered.add(Number(id));
      continue;
    }
    if (op['op'] !== 'connection_request') continue;
    const operator = op['operator_id'];
    if (typeof operator !== 'string') continue;
    let account: string;
    try {
      account = accountOf(operator);
    } catch {
      continue;
    }
    requests.push({
      sequenceNumber: m.sequenceNumber,
      consensusTimestamp: m.consensusTimestamp,
      operatorId: operator,
      requesterAccount: account,
    });
  }
  return requests.filter((r) => !answered.has(r.sequenceNumber));
}

export interface Answered {
  readonly lane: string;
  readonly connectionId: number;
  readonly requesterAccount: string;
}

/**
 * Answer one request: create the lane, then post `connection_created` on this
 * agent's OWN doorbell.
 *
 * The order is forced — the answer names the lane — and the lane's submit key
 * is built from the two accounts' keys AS CONSENSUS HOLDS THEM, never from
 * anything the request carried. A requester that named someone else's key in
 * its own message would otherwise get a lane that key could write to.
 */
export async function answer(s: Session, doorbell: string, request: Unanswered): Promise<Answered> {
  const requesterKey = await s.consensus.accountKey(request.requesterAccount);
  if (requesterKey === null) {
    throw new Error(`the requester ${request.requesterAccount} has no key on consensus; refusing to create a lane`);
  }

  const submitKey = new KeyList(
    [PublicKey.fromString(requesterKey), s.agent.publicKey],
    // A THRESHOLD of the two, at one: either party may post on the lane, which
    // is what a lane is for. T-P17-2 is a statement about WHICH keys the topic
    // names — exactly these two and no other — and not about the threshold.
    1,
  );

  const tx = new TopicCreateTransaction()
    .setTopicMemo(connectionTopicMemo(doorbell, request.sequenceNumber))
    .setSubmitKey(submitKey)
    // "per the acceptor's declared topic policy (P-17)" — and ours is D-146's:
    // the agent's own key, recorded at creation.
    .setAdminKey(s.agent.publicKey)
    .setAutoRenewAccountId(s.payerId)
    .setMaxTransactionFee(new Hbar(s.constants.feeCaps.plainTopicCreate));
  // NO custom fee. §7.1's MUST, and T-P11-3 is `send` refusing a lane that has one.

  const created = await submit(s.client, s.payerId, tx, [s.agent]);
  if (!created.ok || created.entityId === undefined) {
    throw new Error(`the lane was not created: ${created.status} (tx ${created.transactionId})`);
  }
  const lane = created.entityId;

  // Confirm the shape from the mirror before announcing it. A lane whose submit
  // key is not exactly the two keys is one `send` will refuse and a Verifier
  // will not bind to, and announcing it first would put a `connection_created`
  // on consensus pointing at it.
  const info = await s.consensus.topic(lane);
  const keys = [...(info?.submitKeys ?? [])].sort();
  const want = [requesterKey, s.agentPublicHex].sort();
  if (keys.length !== want.length || keys.some((k, i) => k !== want[i])) {
    throw new Error(`the lane ${lane}'s submit key is ${JSON.stringify(keys)} and not the two agents' keys (§7.1, T-P17-2)`);
  }
  if ((info?.customFees ?? []).length > 0) throw new Error(`the lane ${lane} carries a custom fee (§7.1, T-P11-3)`);

  // The answer goes on the ACCEPTOR's own inbound topic (`index.md:498`), which
  // is why D-137 exempts the owner's key from the doorbell's fee: an agent is
  // not charged to answer its own door (T-P7-4).
  await s.consensus.submitMessage(
    doorbell,
    connectionCreatedBody(
      operatorIdOf(doorbell, s.account),
      lane,
      request.sequenceNumber,
      request.requesterAccount,
    ),
    TRANSACTION_MEMO.connection_created,
  );

  return { lane, connectionId: request.sequenceNumber, requesterAccount: request.requesterAccount };
}

export interface WatcherOptions {
  readonly intervalMs?: number;
  readonly onAnswer?: (a: Answered) => void;
  readonly onError?: (e: Error) => void;
}

export interface Watcher {
  /** One pass. Exposed so a run can drive it deterministically instead of waiting. */
  readonly tick: () => Promise<readonly Answered[]>;
  readonly stop: () => void;
}

/**
 * Start watching. `start()` does not block: the process it belongs to is an MCP
 * server, and §6.1's tools must stay answerable while the door is being watched.
 */
export function watchDoorbell(s: Session, doorbell: string, options: WatcherOptions = {}): Watcher {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;

  const tick = async (): Promise<readonly Answered[]> => {
    const out: Answered[] = [];
    const messages = await s.consensus.messages(doorbell);
    for (const request of unanswered(messages)) {
      // A request from this agent to itself is not answered: §7.1 puts a lane
      // "between exactly two agents".
      if (request.requesterAccount === s.account) continue;
      const a = await answer(s, doorbell, request);
      out.push(a);
      options.onAnswer?.(a);
    }
    return out;
  };

  const loop = async (): Promise<void> => {
    if (stopped) return;
    try {
      await tick();
    } catch (e) {
      // A watcher that died on one bad request would stop answering every later
      // one. Reported and carried on; the doorbell is a public topic and anyone
      // may write anything to it.
      options.onError?.(e instanceof Error ? e : new Error(String(e)));
    }
    if (!stopped) timer = setTimeout(() => void loop(), options.intervalMs ?? 5_000);
  };

  void loop();
  return {
    tick,
    stop: () => {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
    },
  };
}
