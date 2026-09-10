/**
 * The letter path, wired to live consensus — what turns a booted Session into
 * the contexts `send` and `inbox` take.
 *
 * THERE IS NO NEW LOGIC HERE AND THAT IS THE POINT. `send`, `inbox` and
 * `verify` were built against `tools/memory.ts`, consensus as a data structure,
 * and run to sixty-three assertions there before anything was signed.
 * `tools/consensus.ts` is the seam; `sdk/live.ts` is its other implementation
 * over a mirror node for reads and `@hashgraph/sdk` for writes; and
 * `Session.consensus` has been that live one since the session was first
 * booted. So this module reads ids out of the agent's own record and hands them
 * over. If the letter behaves differently on the network than it did in memory,
 * the difference is the network's and not a second spelling of the tools.
 *
 * WHERE EVERY FIELD COMES FROM, and why not from the Postmaster.
 * The agent's own topics come from `<home>/record.json`, which the agent wrote
 * from its own mirror-node readbacks. The stamp token and treasury are §18.4
 * pins. The Chunk `schemaRef` is the registered one from `spec/pins.json`,
 * which is what makes §11.5's T-P9-3 row pass rather than bite (Step 4 signed
 * 2026-09-09). Nothing is read from `app/deployment/<network>.json`: that is
 * the Postmaster's ops record and a Correspondent never opens it (CLAUDE.md
 * §11).
 *
 * NO PRIVATE KEY IS HERE. The signers are the session's, which are a public key
 * and a closure; the epoch keys `inbox` decrypts with come from
 * `keystore.ts::epochKeys` and stay inside the map it returns (P-13).
 */
import fs from 'node:fs';
import path from 'node:path';
import { repoRoot } from '../src/ops/env.js';
import { epochKeys } from './keystore.js';
import { liveReader } from './live.js';
import { operationOf } from '../src/tools/consensus.js';
import type { InboxContext } from '../src/tools/inbox.js';
import type { SenderContext } from '../src/tools/send.js';
import type { Session } from './session.js';

interface PinsFile {
  readonly registeredSchemas?: Record<string, { readonly schemaRef?: string } | undefined>;
}

/**
 * The registered Chunk schema's version-pinned locator (§5.11).
 *
 * §11.5's ladder appraises a resolution whose `schemaRef` does not resolve as
 * unverified (T-P9-3). Step 4 registered the fourteen on consensus, so this
 * reads the real one and a chunk carries a locator a Verifier can dereference.
 * A null here is a release that has not registered its schemas, and it refuses
 * rather than shipping a locator that resolves to nothing.
 */
export function chunkSchemaRef(): string {
  const pins = JSON.parse(fs.readFileSync(path.join(repoRoot(), 'spec', 'pins.json'), 'utf8')) as PinsFile;
  const ref = pins.registeredSchemas?.['chunk']?.schemaRef;
  if (typeof ref !== 'string' || ref === '') {
    throw new Error('spec/pins.json carries no registered schemaRef for `chunk`; §5.11 needs one before a chunk can name it');
  }
  return ref;
}

/** One id out of the agent's own record, or a refusal that says what is missing. */
function mine(s: Session, key: 'doorbell' | 'log' | 'manifest'): string {
  const id = s.record.get(key)?.id;
  if (typeof id !== 'string' || id === '') {
    throw new Error(`this agent has no ${key} on consensus; buy a mailbox first (§4.6) — <home>/record.json carries none`);
  }
  return id;
}

/**
 * What the sender is, for §6.4.
 *
 * `ringer` is deliberately ABSENT. D-157 closed §G-14: the sender always signs
 * the connection request, and who pays is the sender's choice — the Postmaster
 * being the default and not the required one. This deployment has the sender's
 * own operator pay, which is §3.5's arrangement for every other submission this
 * agent makes, so the request is submitted through the session's own writer and
 * the doorbell's HIP-991 fee is debited from `Session.payerId`. `ringStamp`
 * below is what puts a stamp there to be debited (§4.4).
 */
export function senderContext(s: Session): SenderContext {
  if (s.account === '') throw new Error('this agent has no account yet; the purchase creates it (§4.6, HIP-542)');
  return {
    consensus: s.consensus,
    ledgerTag: s.ledgerTag,
    account: s.account,
    doorbell: mine(s, 'doorbell'),
    log: mine(s, 'log'),
    manifestTopic: mine(s, 'manifest'),
    treasury: s.treasury,
    stampToken: s.stampToken,
    schemaRef: chunkSchemaRef(),
    publicKey: s.agentPublicHex,
  };
}

/**
 * What the recipient is, for §6.5.
 *
 * The reader takes no key and no account: `liveReader` is constructible from a
 * mirror-node URL and a ledger tag and nothing else (P-4). `treasury` and
 * `stampToken` are passed because the caller knows them and §11.4's postage
 * check is stricter with them than without.
 */
export function inboxContext(s: Session): InboxContext {
  return {
    reader: liveReader(s.home.mirrorNodeUrl, s.ledgerTag),
    account: s.account,
    keys: epochKeys(s.home),
    treasury: s.treasury,
    stampToken: s.stampToken,
  };
}

/**
 * §4.4's first hop, and it is a deployment's arrangement rather than a rule.
 *
 * "The fee is charged to the transaction payer … A sender that borrows a payer
 * — the Postmaster by default, or any other account it names — first transfers
 * one stamp to that payer, bearer custody in transit and not key custody, and
 * the payer's submission of the request the sender signed pays the doorbell's
 * fee to the treasury." This deployment's payer is the agent's own operator
 * (§3.5), so the operator is the account HIP-991 debits, and an account cannot
 * be debited a token it does not hold.
 *
 * **It moves exactly one stamp and only when the payer holds none.** A ring
 * costs the sender one stamp either way; what this decides is which account it
 * leaves from on its way to the treasury. Where the payer IS the sender's own
 * account — a sender paying for itself, which §4.4 calls the one-hop ring —
 * nothing moves and this returns null.
 *
 * Returns the transfer's reference where one happened, so a gate report can
 * name it, and null where none was needed.
 */
export async function ringStamp(s: Session): Promise<string | null> {
  if (s.payerId === s.account) return null;
  if ((await payerStamps(s)) >= 1) return null;
  const ref = s.consensus.pinTransferRef();
  const settlement = await s.consensus.transferStamps(ref, s.payerId, 1, '');
  return settlement.txRef;
}

/**
 * How many stamps the payer holds, read from a mirror node.
 *
 * `Consensus.stampBalance()` answers for the AGENT, which is the account §6.4's
 * precondition is about. The doorbell's fee is a different question — HIP-991
 * debits the transaction PAYER — so it is asked of the payer directly and never
 * inferred from the agent's.
 */
async function payerStamps(s: Session): Promise<number> {
  const r = await s.mirror.get<{ tokens?: readonly { token_id: string; balance: number }[] }>(
    `/accounts/${s.payerId}/tokens?token.id=${s.stampToken}&limit=1`,
  );
  return (r?.tokens ?? []).find((t) => t.token_id === s.stampToken)?.balance ?? 0;
}

/**
 * This agent's lanes, FROM CONSENSUS and never from a local file.
 *
 * §7.1 fixes the rule and `send` exports it, so `inbox` and `verify` and this
 * all read one implementation of it: a lane between two agents is found from
 * the `connection_created` operations on the recipient's own doorbell. A wiped
 * local file therefore loses no lane, which is the same reason every
 * provisioning verb asks the ledger first (D-165).
 *
 * `withAccount` narrows to the lanes shared with one correspondent; without it,
 * every lane this doorbell ever answered.
 */
export async function lanesOf(s: Session, withAccount?: string): Promise<readonly string[]> {
  const reader = liveReader(s.home.mirrorNodeUrl, s.ledgerTag);
  const doorbell = mine(s, 'doorbell');
  const messages = await reader.messages(doorbell);
  const lanes: string[] = [];
  for (const m of messages) {
    const op = operationOf(m);
    if (op === null || op['p'] !== 'hcs-10' || op['op'] !== 'connection_created') continue;
    if (withAccount !== undefined && op['connected_account_id'] !== withAccount) continue;
    const topicId = op['connection_topic_id'];
    if (typeof topicId === 'string' && !lanes.includes(topicId)) lanes.push(topicId);
  }
  return lanes;
}
