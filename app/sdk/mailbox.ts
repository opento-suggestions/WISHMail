/**
 * `generate_mailbox` — the six rows, the declaration, and the resolver run on
 * its own output.
 *
 * §4.6 affordance, NOT one of §6.1's six (D-159): no conformance class is tested
 * against it, and it is on the Correspondent's own MCP because the topics are
 * the agent’s and the agent signs each one.
 *
 * WHO PAYS IS NOT THIS FILE’S BUSINESS, and D-168 is what made that true rather
 * than merely tidy. Under a self-provisioned run the operator of THIS agent
 * pays, from its own config. Under a provisioning purchase the POSTMASTER pays,
 * because §G-19 is ruled (a) and §4.6’s provisioned path has the Postmaster
 * create the mailbox it sells — and the only difference visible here is that
 * `Session.payer` is a remote `Signer` and `Session.submitOpts` pins a node. Not one
 * line below asks which, and the same bytes reach consensus either way.
 *
 * IDEMPOTENT AGAINST CONSENSUS, NEVER AGAINST LOCAL STATE (D-165). The first
 * thing this does is resolve the agent's own address under `hcs14`. If
 * coordinates come back, it creates nothing and says so — so a wiped home
 * directory cannot cause a second doorbell, and a second doorbell is not merely
 * waste: §9.5 assigns `vague` where more than one registration names an address,
 * and a topic has no second creation. The record in the home directory is a
 * CACHE of consensus and never an authority over it. This is §9's
 * write-the-reader-with-the-writer applied to provisioning: **the resolver is
 * the reader.**
 *
 * AND THE READER IS RUN ON THE WRITER'S OUTPUT BEFORE THIS RETURNS (CLAUDE.md
 * §9). The Step 3 defect is why: a declaration that validated against its
 * schema, whose file digest matched its topic memo, and whose identifier was
 * consistent with itself, was still unresolvable — and an HCS-1 topic has no
 * admin key, so it was permanent. One transaction to correct, because the
 * resolver was run the same day. A day later it would have cost a superseded
 * declaration and a wrong answer to every reader in between.
 *
 * THE ORDER IS FORCED, and each row names what forces it:
 *
 *   1 doorbell  ─┐
 *   2 log        ├─ the profile carries all three, so all three precede it
 *   3 manifest  ─┘
 *   4 registry     the account memo names it
 *   5 file topic   its memo is the SHA-256 of the profile PLAINTEXT
 *   6 chunks       into the topic whose memo already commits them
 *   7 register     names the file topic
 *   8 account memo names the registry
 *
 * Conformance: T-P7-4, T-P13-1, T-P17-1, T-P17-3, T-P6-3, T-P8-3.
 */
import { AccountUpdateTransaction, CustomFixedFee, Hbar, TokenAssociateTransaction, TopicCreateTransaction, type Key, type PublicKey } from '@hashgraph/sdk';
import {
  HCS2_REGISTER_TX_MEMO,
  accountMemoFor,
  profileBytes,
  registerOperation,
  registryMemo,
  type ProfileBytes,
} from '../src/ops/declaration.js';
import { HCS10_TTL, type TemplateSubject, type TopicShape } from '../src/ops/template.js';
import * as template from '../src/ops/template.js';
import { Checks, named, type Discrepancy } from '../src/ops/step.js';
import { submit } from '../src/ops/hedera.js';
import { Mirror } from '../src/ops/mirror.js';
import { TRANSACTION_OP_MEMO } from '../src/ops/hcs10.js';
import { repoRoot } from '../src/ops/env.js';
import { mirrorSource, resolveSelf, type MailCoordinates } from '../src/resolve/hcs14.js';
import type { AgentRecord, CorrespondentKey } from './home.js';
import type { Session } from './session.js';
import { line } from '../src/tools/narration.js';

/** How a fact reaches the log as it lands (D-162). One template, three readers. */
type Emit = (l: string) => void;

interface MTopic {
  readonly topic_id: string;
  readonly memo?: string;
  readonly submit_key?: { readonly key: string } | null;
  readonly admin_key?: { readonly key: string } | null;
  readonly fee_schedule_key?: unknown;
  readonly auto_renew_account?: string | null;
  readonly deleted?: boolean | null;
  readonly custom_fees?: { readonly fixed_fees?: readonly { readonly amount: number; readonly collector_account_id: string; readonly denominating_token_id: string | null }[] };
  readonly fee_exempt_key_list?: readonly { readonly key: string }[];
}
interface MMessages {
  readonly messages?: readonly { readonly sequence_number: number; readonly consensus_timestamp: string; readonly message: string }[];
}
interface MAccount {
  readonly account: string;
  readonly memo?: string;
  readonly balance?: { readonly tokens?: readonly { readonly token_id: string }[] };
}

/** Raised where the verb refuses. Every refusal names the sentence it is obeying. */
export class MailboxRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MailboxRefusal';
  }
}

export interface MailboxResult {
  /** `existing`: consensus already carries a declaration, and nothing was created. */
  readonly outcome: 'existing' | 'created';
  readonly coordinates: MailCoordinates;
  /** The lines, in order, as facts landed. The text block and `narrate()` read the same template. */
  readonly lines: readonly string[];
}

/**
 * §9.2’s rule run on an agent’s own address, re-exported from where it lives.
 *
 * It moved to `resolve/hcs14.ts` when the counter needed it too: under D-168
 * the Postmaster will not issue a provisioning receipt until the mailbox it
 * carried resolves from its own reader, and two spellings of a two-pass rule
 * would be two places for it to drift.
 */
export { resolveSelf };

/** The declared shape, rendered for the log and for the record's `policy`. */
function detail(w: TopicShape): string {
  return (
    `${w.memo} · submit ${w.submitKey ? w.submitKey.slice(0, 8) + '…' : 'NONE'}` +
    ` · admin ${w.adminKey ? w.adminKey.slice(0, 8) + '…' : 'NONE'}` +
    (w.fee ? ` · fee ${w.fee.amount} ${w.fee.token} → ${w.fee.collector}` : ' · no fee') +
    (w.feeExemptKeys.length ? ` · exempt ${w.feeExemptKeys.length}` : '')
  );
}

/** The mirror readback for one topic, against the shape it was created under. */
async function confirmTopic(mirror: Mirror, id: string, want: TopicShape): Promise<Discrepancy[] | 'absent'> {
  const p = named<MTopic>('topic exists and is not deleted', (t) => t.topic_id === id && t.deleted !== true);
  const t = await mirror.poll<MTopic>(`/topics/${id}`, p.test);
  if (t === null || !p.test(t)) return 'absent';
  const c = new Checks();
  c.eq('memo', t.memo, want.memo);
  if (want.submitKey === null) c.isNull('submit_key', t.submit_key);
  else c.keyIs('submit_key', t.submit_key, want.submitKey);
  if (want.adminKey === null) c.isNull('admin_key', t.admin_key);
  else c.keyIs('admin_key', t.admin_key, want.adminKey);
  c.isNull('fee_schedule_key', t.fee_schedule_key);
  c.eq('auto_renew_account', t.auto_renew_account, want.autoRenewAccount);
  const fees = t.custom_fees?.fixed_fees ?? [];
  if (want.fee) {
    c.num('custom_fees.fixed_fees.length', fees.length, 1);
    c.num('fixed_fees[0].amount', fees[0]?.amount, want.fee.amount);
    c.eq('fixed_fees[0].collector_account_id', fees[0]?.collector_account_id, want.fee.collector);
    c.eq('fixed_fees[0].denominating_token_id', fees[0]?.denominating_token_id, want.fee.token);
  } else {
    c.num('custom_fees.fixed_fees.length', fees.length, 0);
  }
  const exempt = (t.fee_exempt_key_list ?? []).map((k) => k.key);
  c.eq('fee_exempt_key_list', JSON.stringify(exempt), JSON.stringify([...want.feeExemptKeys]));
  return c.result;
}

/**
 * One declared shape, as a transaction.
 *
 * Exported because the counter’s carry policy decides whether to PAY for a
 * body of exactly this construction (D-168), and `check:correspondent` courts
 * the two against each other with no network: it builds each row here, freezes
 * it offline, and asserts that `counter/body.ts` decodes what was built and
 * `counter/carry.ts` recognises which row it is. A builder the policy was
 * tested against a COPY of would drift from it silently, and the first sign
 * would be a refusal in the middle of a provisioning purchase that has already
 * created three topics.
 */
export function topicCreateFor(
  want: TopicShape,
  agentKey: PublicKey,
  feeCaps: { readonly feeGatedTopicCreate: number; readonly plainTopicCreate: number },
): TopicCreateTransaction {
  const tx = new TopicCreateTransaction()
    .setTopicMemo(want.memo)
    .setAutoRenewAccountId(want.autoRenewAccount)
    .setMaxTransactionFee(new Hbar(want.fee ? feeCaps.feeGatedTopicCreate : feeCaps.plainTopicCreate));
  // HCS-1 marks a file topic that HAS an admin key invalid and ignores it
  // (hcs-1.md:48-49, D-150), so the absence is declared and asserted rather
  // than merely omitted.
  if (want.adminKey !== null) tx.setAdminKey(agentKey);
  if (want.submitKey !== null) tx.setSubmitKey(agentKey);
  if (want.fee) {
    tx.setCustomFees([
      new CustomFixedFee().setAmount(want.fee.amount).setDenominatingTokenId(want.fee.token).setFeeCollectorAccountId(want.fee.collector),
    ]);
  }
  if (want.feeExemptKeys.length) tx.setFeeExemptKeys([agentKey as Key]);
  return tx;
}

/**
 * Create one topic under a declared shape, confirm it from the mirror, and
 * record it.
 *
 * THREE PARTIES, AND EACH ONE NAMED. The AGENT signs, because the admin key is
 * the agent’s and the topic is the agent’s. The OPERATOR signs, because it is
 * the auto-renew account the row names and a topic that names an account takes
 * that account’s signature. The PAYER pays — the operator again on a
 * self-provisioned run, the Postmaster under a purchase (D-168).
 */
async function topicRow(
  s: Session,
  record: AgentRecord,
  key: CorrespondentKey,
  role: string,
  want: TopicShape,
  push: Emit,
): Promise<string> {
  const existing = record.get(key);
  if (existing?.id) {
    const d = await confirmTopic(s.mirror, existing.id, want);
    if (d === 'absent') throw new MailboxRefusal(`the record names ${key} as ${existing.id} and the mirror does not hold it`);
    if (d.length > 0) throw new MailboxRefusal(`${key} at ${existing.id} diverges from its declared shape: ${JSON.stringify(d)}`);
    push(line('provision.existing', { role, id: existing.id }));
    return existing.id;
  }

  const tx = topicCreateFor(want, s.agent.publicKey, s.constants.feeCaps);

  // Both signatures are asked for unconditionally. Where the operator is also
  // the payer the SDK would sign with it anyway and the duplicate is dropped;
  // where it is not, the auto-renew account still has to sign. A topic with no
  // admin key takes the agent’s signature harmlessly. Two branches fewer to be
  // wrong about, on a transaction that has no second chance.
  const r = await submit(s.client, s.payerId, tx, [s.agent, s.operator], s.submitOpts);
  if (!r.ok) throw new MailboxRefusal(`${role} was not created: ${r.status} (tx ${r.transactionId})`);
  const id = r.entityId;
  if (id === undefined) throw new MailboxRefusal(`${role} was created but the receipt names no topic`);

  const d = await confirmTopic(s.mirror, id, want);
  if (d === 'absent') throw new MailboxRefusal(`${role} ${id} was created and the mirror does not hold it`);
  if (d.length > 0) throw new MailboxRefusal(`${role} ${id} diverges from its declared shape: ${JSON.stringify(d)}`);

  record.put(key, {
    kind: 'topic',
    role,
    id,
    builtBy: 'TopicCreateTransaction',
    signedBy: ['agent', 'operator (auto-renew)'],
    payer: s.payerId,
    transactionId: r.transactionId,
    consensusTimestamp: '',
    confirmedFrom: `GET /topics/${id}`,
    confirmedAt: new Date().toISOString(),
    policy: { ...want },
    specTag: s.specTag,
  });
  push(line('provision.created', { role, id, detail: detail(want) }));
  return id;
}

/**
 * §4.4's consequence for the payer, stated in the config template and enforced
 * here (D-157).
 *
 * HIP-991 debits the doorbell's fee from the PAYER of the submission. When this
 * agent rings a door, the party paying for that submission is its OWN operator
 * — carry covers the mailbox it bought and nothing after it (L-5) — so the
 * operator must be able to hold a stamp. The agent’s own account needs no
 * association: HIP-542 creates it with unlimited auto-associations, which the
 * 2026-09-09 probe observed, so the stamp transfer associates it as it arrives.
 *
 * IT IS THE OPERATOR HERE AND NOT `payerId`, deliberately. Under a provisioning
 * purchase `payerId` is the Postmaster, and associating the Postmaster with
 * $POSTAGE would be both useless and outside the carry policy — which would
 * refuse it, correctly. This association is the operator’s own act, paid by the
 * operator, on the local client.
 */
async function ensurePayerHoldsStamps(s: Session, push: Emit): Promise<void> {
  const a = await s.mirror.get<MAccount>(`/accounts/${s.operatorId}?limit=1`);
  if (a === null) throw new MailboxRefusal(`the operator ${s.operatorId} is not an account on this ledger`);
  if ((a.balance?.tokens ?? []).some((t) => t.token_id === s.stampToken)) return;
  const r = await submit(
    s.localClient,
    s.operatorId,
    new TokenAssociateTransaction().setAccountId(s.operatorId).setTokenIds([s.stampToken]).setMaxTransactionFee(new Hbar(2)),
    [s.operator],
  );
  if (!r.ok) throw new MailboxRefusal(`the operator could not associate with $POSTAGE: ${r.status}`);
  push(line('provision.associated', { account: s.operatorId, token: s.stampToken }));
}

/** §6.4's step-2 shape, reused: the HCS-1 chunk messages onto the file topic. */
async function writeChunks(s: Session, record: AgentRecord, fileTopic: string, file: ProfileBytes, push: Emit): Promise<void> {
  if (record.has('profileChunks')) return;
  const existing = await s.mirror.get<MMessages>(`/topics/${fileTopic}/messages?limit=25&order=asc`);
  if ((existing?.messages ?? []).length > 0) {
    throw new MailboxRefusal(
      `the profile file topic ${fileTopic} already holds ${existing?.messages?.length} message(s) and this run did not write them. ` +
        'An HCS-1 topic has no admin key, so nothing here can be corrected: stop and read it.',
    );
  }
  let last = '';
  for (const chunk of file.chunks) {
    const wire = Buffer.byteLength(JSON.stringify(chunk), 'utf8');
    if (wire > 1024) {
      throw new MailboxRefusal(`chunk ${chunk.o} is ${wire} bytes on the wire and one HCS message caps at 1024 (ops/hcs1.ts)`);
    }
    const m = await s.consensus.submitMessage(fileTopic, chunk as unknown as Record<string, unknown>, TRANSACTION_OP_MEMO);
    last = m.consensusTimestamp;
  }
  record.put('profileChunks', {
    kind: 'message',
    role: 'HCS-11 profile, as HCS-1 chunks',
    id: fileTopic,
    builtBy: 'TopicMessageSubmitTransaction',
    signedBy: ['agent'],
    payer: s.payerId,
    transactionId: '',
    consensusTimestamp: last,
    confirmedFrom: `GET /topics/${fileTopic}/messages`,
    confirmedAt: new Date().toISOString(),
    policy: {
      chunks: file.chunks.length,
      digest: file.digest,
      memo: file.memo,
      // §9.5 recomputes the identifier "from the profile's own name, version and
      // skills", so the string that later goes on the anchor must be the string
      // IN THE FILE. Recorded, not rebuilt.
      uaid: file.profile['uaid'],
    },
    specTag: s.specTag,
  });
  push(line('provision.profile', { topic: fileTopic, chunks: file.chunks.length, digest: file.digest }));
}

export interface MailboxOptions {
  /** Build and confirm every shape, and submit nothing. */
  readonly dryRun?: boolean;
  /** Collects the lines as facts land, so a caller can stream them (D-162). */
  readonly onLine?: (l: string) => void;
}

export async function generateMailbox(s: Session, record: AgentRecord, options: MailboxOptions = {}): Promise<MailboxResult> {
  const lines: string[] = [];
  const push = (l: string): void => {
    lines.push(l);
    options.onLine?.(l);
  };
  const source = mirrorSource(s.mirror);

  // --- The idempotency gate, and it reads CONSENSUS (D-165). -----------------
  const already = await resolveSelf(source, s.ledgerTag, s.account);
  if (already !== null) {
    push(line('provision.already', { account: s.account, doorbell: already.doorbell }));
    return { outcome: 'existing', coordinates: already, lines };
  }

  if (options.dryRun === true) {
    throw new MailboxRefusal('--dry-run: the shapes are built and confirmed above; nothing was submitted.');
  }

  await ensurePayerHoldsStamps(s, push);

  const subject: TemplateSubject = {
    account: s.account,
    publicKey: s.agentPublicHex,
    treasury: s.treasury,
    stampToken: s.stampToken,
    // The Correspondent’s own operator, and never whoever is paying today. A
    // Postmaster that named itself here would be undertaking to renew every
    // mailbox it ever sold, on consensus, where every reader can see it — and
    // the carry policy refuses a row that says so (D-168).
    autoRenewAccount: s.operatorId,
  };

  // --- Rows 1-3: the three topics the profile names. -------------------------
  const doorbell = await topicRow(s, record, 'doorbell', 'doorbell (HCS-10 inbound)', template.doorbell(subject), push);
  const log = await topicRow(s, record, 'log', 'log (HCS-10 outbound)', template.log(subject), push);
  const manifestTopic = await topicRow(s, record, 'manifest', 'manifest', template.manifest(subject), push);

  // --- Row 4: the registry the account memo will name. -----------------------
  const registry = await topicRow(
    s,
    record,
    'declRegistry',
    'declaration registry (HCS-2)',
    template.declRegistry(subject, registryMemo(HCS10_TTL)),
    push,
  );

  // --- The profile. Final and validated BEFORE its topic exists, because the
  //     topic's memo is the SHA-256 of these very bytes.
  const file = profileBytes(repoRoot(), {
    ledgerTag: s.constants.ledgerTag,
    network: s.network,
    account: s.account,
    doorbell,
    log,
    wishmail: { manifestTopic, x25519Pub: s.seal.x25519Pub, keyEpoch: s.seal.keyEpoch },
    identity: s.identity,
  });

  const fileTopic = await topicRow(
    s,
    record,
    'profileFile',
    'HCS-11 profile file (HCS-1)',
    template.profileFile(subject, file.memo),
    push,
  );
  await writeChunks(s, record, fileTopic, file, push);

  // --- Row 7: the HCS-2 register entry naming the file topic. ----------------
  if (!record.has('registryEntry')) {
    const m = await s.consensus.submitMessage(registry, registerOperation(fileTopic), HCS2_REGISTER_TX_MEMO);
    record.put('registryEntry', {
      kind: 'message',
      role: 'HCS-2 register entry naming the profile file',
      id: registry,
      builtBy: 'TopicMessageSubmitTransaction',
      signedBy: ['agent'],
      payer: s.payerId,
      transactionId: '',
      consensusTimestamp: m.consensusTimestamp,
      confirmedFrom: `GET /topics/${registry}/messages`,
      confirmedAt: new Date().toISOString(),
      policy: { sequenceNumber: m.sequenceNumber, t_id: fileTopic, transactionMemo: HCS2_REGISTER_TX_MEMO },
      specTag: s.specTag,
    });
    push(line('provision.registered', { registry, sequenceNumber: m.sequenceNumber, fileTopic }));
  }

  // --- Row 8: the account memo — §9.2's first link, and the last act. --------
  if (!record.has('accountMemo')) {
    const memo = accountMemoFor(registry);
    const r = await submit(
      s.client,
      s.payerId,
      new AccountUpdateTransaction().setAccountId(s.account).setAccountMemo(memo).setMaxTransactionFee(new Hbar(2)),
      [s.agent],
      s.submitOpts,
    );
    if (!r.ok) throw new MailboxRefusal(`the account memo was not set: ${r.status} (tx ${r.transactionId})`);
    const p = named<MAccount>('the account memo names the registry', (a) => a.memo === memo);
    const a = await s.mirror.poll<MAccount>(`/accounts/${s.account}?limit=1`, p.test);
    if (a === null || !p.test(a)) throw new MailboxRefusal(`the account memo did not read back as ${memo}`);
    record.put('accountMemo', {
      kind: 'account-update',
      role: '§9.2’s account memo, the first link in the chain',
      id: s.account,
      builtBy: 'AccountUpdateTransaction',
      signedBy: ['agent'],
      payer: s.payerId,
      transactionId: r.transactionId,
      consensusTimestamp: '',
      confirmedFrom: `GET /accounts/${s.account}`,
      confirmedAt: new Date().toISOString(),
      policy: { memo, predicate: p.name },
      specTag: s.specTag,
    });
    push(line('provision.memo', { account: s.account, memo }));
  }

  // --- THE READER, ON THIS RUN'S OWN OUTPUT. --------------------------------
  // Not a formality and not a test: the Step 3 defect passed every check above
  // and was still unresolvable, and the topic that carried it can never be
  // deleted. `generate_mailbox` does not return until §9.2's rule, run from a
  // mirror node with nothing configured, answers with this agent's coordinates.
  const coordinates = await resolveSelf(source, s.ledgerTag, s.account);
  if (coordinates === null) {
    throw new MailboxRefusal(
      'the declaration this run wrote does not resolve under §9.2 from a mirror node. Everything above is on ' +
        'consensus and the profile file cannot be deleted (D-150). Read the chain by hand before writing anything else.',
    );
  }
  const disagreements: string[] = [];
  if (coordinates.doorbell !== doorbell) disagreements.push(`doorbell ${coordinates.doorbell} ≠ ${doorbell}`);
  if (coordinates.log !== log) disagreements.push(`log ${coordinates.log ?? '(absent)'} ≠ ${log}`);
  if (coordinates.manifestTopic !== manifestTopic) disagreements.push(`manifestTopic ${coordinates.manifestTopic} ≠ ${manifestTopic}`);
  if (coordinates.x25519Pub !== s.seal.x25519Pub) disagreements.push('x25519Pub does not match this process’s key');
  if (coordinates.keyEpoch !== s.seal.keyEpoch) disagreements.push(`keyEpoch ${coordinates.keyEpoch} ≠ ${s.seal.keyEpoch}`);
  if (disagreements.length > 0) {
    throw new MailboxRefusal(`the resolver answered with coordinates this run did not create: ${disagreements.join('; ')}`);
  }
  push(line('provision.resolved', { account: s.account, trustClass: coordinates.trustClass, endorsements: coordinates.endorsements.length }));

  return { outcome: 'created', coordinates, lines };
}
