/**
 * `register_agent` — the agent's own name on the HOL anchor, paid by the agent.
 *
 * §4.6: "Where a registry anchor admits submissions from any account (§9.5),
 * provisioning MAY prepare the agent's registration for the agent to submit
 * under its own key, as payer, and MAY fund that fee; the agent resolves under
 * `hol` without `blurred` because the account that paid for the registration is
 * the account it names. The registration is the agent's, not the Postmaster's:
 * the Postmaster never signs or submits it."
 *
 * THIS IS THE ONE PLACE THE AGENT PAYS. "An agent's account never holds ℏ, with
 * one exception" — this is the exception, and it is why the purchase funds
 * exactly one fee and no more (§3.9: funding is a payment and not a party). The
 * payer seam is deliberately NOT used here: the whole value of the act is that
 * the mirror records this account as the payer, and a borrowed payer would put
 * `blurred` on every resolution of this agent forever.
 *
 * THE OPERATION IS D-164's. `{p, op, account_id, uaid, t_id, m}` — HCS-2's four
 * pinned fields plus the two the deployed anchor's readers parse; the pin
 * forbids no additional field. And it carries NO transaction memo: §6.1 says a
 * tool carries the memo HCS-10 defines for an operation "and MUST carry none
 * where HCS-10 defines none", and `register` has no enum slot at the pin.
 *
 * IDEMPOTENT AGAINST CONSENSUS (D-165). The anchor is read first, in full, and
 * a registration this account already has is left alone. A duplicate is not
 * waste: §9.5 assigns `vague` where more than one registration names an
 * address, so registering twice degrades this agent's own resolution, for
 * everyone, permanently.
 *
 * Conformance: T-P13-4, T-P6-4, T-P6-5.
 */
import { Hbar, TopicMessageSubmitTransaction } from '@hashgraph/sdk';
import { clientFor } from '../src/ops/hedera.js';
import { submit } from '../src/ops/hedera.js';
import { TRANSACTION_OP_MEMO } from '../src/ops/hcs10.js';
import { line } from '../src/tools/narration.js';
import { mirrorSource, type MailCoordinates } from '../src/resolve/hcs14.js';
import { registrationsFor, resolveHol } from '../src/resolve/hol.js';
import type { Env } from '../src/ops/env.js';
import type { AgentRecord } from './home.js';
import type { Session } from './session.js';

export class RegistrationRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RegistrationRefusal';
  }
}

export interface RegisterResult {
  readonly outcome: 'existing' | 'created';
  readonly coordinates: MailCoordinates;
  readonly lines: readonly string[];
}

/**
 * The address this agent is registered under.
 *
 * Its own UAID, from the profile it published — not a rebuilt one. §9.5
 * recomputes the identifier from the profile's own name, version and skills,
 * so the string that goes on the anchor must be the string in the file, or the
 * two disagree and no reader can match them.
 */
export interface RegistrationInputs {
  readonly uaid: string;
  /** The agent's HCS-2 declaration registry: what a reader follows to the profile. */
  readonly declRegistry: string;
}

export async function registerAgent(
  s: Session,
  record: AgentRecord,
  inputs: RegistrationInputs,
  onLine?: (l: string) => void,
): Promise<RegisterResult> {
  const lines: string[] = [];
  const push = (l: string): void => {
    lines.push(l);
    onLine?.(l);
  };

  if (s.holAnchors.length === 0) {
    throw new RegistrationRefusal(`spec/pins.json records no hol anchor for ${s.ledgerTag}`);
  }
  const anchor = s.holAnchors[0] as string;
  const source = mirrorSource(s.mirror);

  // --- The gate, and it reads the anchor and not the record. -----------------
  const existing = await registrationsFor(source, anchor, inputs.uaid);
  if (existing === null) throw new RegistrationRefusal(`the anchor ${anchor} could not be read; refusing to register blind`);
  const mine = existing.filter((r) => r.body.account_id === s.account);
  if (mine.length > 0) {
    push(line('register.existing', { account: s.account, anchor }));
    return { outcome: 'existing', coordinates: await requireHol(s, inputs.uaid, push), lines };
  }
  if (existing.length > 0) {
    throw new RegistrationRefusal(
      `${existing.length} registration(s) on ${anchor} already name this address under another account. ` +
        'Registering would make §9.5 assign `vague` to every resolution of it. Read them first.',
    );
  }

  // --- The agent pays for its own name. --------------------------------------
  const balance = await hbarBalance(s);
  if (balance <= 0n) {
    throw new RegistrationRefusal(
      `${s.account} holds no ℏ, and §4.6 has the agent pay for its own registration so that §9.5 does not ` +
        'assign `blurred`. The purchase funds exactly this one fee (D-159 addendum); buy the mailbox first.',
    );
  }

  const body = {
    p: 'hcs-10',
    op: 'register',
    account_id: s.account,
    uaid: inputs.uaid,
    t_id: inputs.declRegistry,
    m: 'WISHMail',
  };

  // A client whose OPERATOR is the agent — the one submission in this project
  // where the agent is its own payer, and the reason it holds ℏ at all.
  const client = clientFor({ network: s.network } as Env, s.account, s.agent);
  const r = await submit(
    client,
    s.account,
    new TopicMessageSubmitTransaction()
      .setTopicId(anchor)
      .setMessage(Buffer.from(JSON.stringify(body), 'utf8'))
      .setMaxTransactionFee(new Hbar(2)),
    [s.agent],
  );
  if (!r.ok) throw new RegistrationRefusal(`the registration returned ${r.status} (tx ${r.transactionId})`);
  void TRANSACTION_OP_MEMO; // `register` has no HCS-10 memo enum at the pin (§6.1, D-94).

  // Read it back from the anchor, and check the fact the whole act exists for:
  // that the PAYER on the mirror is this account.
  const after = await registrationsFor(source, anchor, inputs.uaid);
  const landed = (after ?? []).find((x) => x.body.account_id === s.account);
  if (landed === undefined) throw new RegistrationRefusal(`the registration did not read back from ${anchor}`);
  if (landed.payer !== s.account) {
    throw new RegistrationRefusal(
      `the registration at ${anchor}#${landed.sequenceNumber} was paid by ${landed.payer ?? '(unknown)'} and not by ` +
        `${s.account}, so §9.5 assigns \`blurred\` and T-P13-4 does not hold. It cannot be withdrawn.`,
    );
  }

  record.put('holRegistration', {
    kind: 'message',
    role: 'the agent’s own registration on the HOL anchor (§9.5, T-P13-4)',
    id: anchor,
    builtBy: 'TopicMessageSubmitTransaction',
    signedBy: ['agent'],
    payer: s.account,
    transactionId: r.transactionId,
    consensusTimestamp: landed.consensusTimestamp,
    confirmedFrom: `GET /topics/${anchor}/messages`,
    confirmedAt: new Date().toISOString(),
    policy: { sequenceNumber: landed.sequenceNumber, operation: body, transactionMemo: '', warrant: '§4.6 · D-164 · the agent is its own payer so §9.5 assigns no `blurred`' },
    specTag: s.specTag,
  });
  push(line('register.submitted', { anchor, sequenceNumber: landed.sequenceNumber, payer: s.account }));

  return { outcome: 'created', coordinates: await requireHol(s, inputs.uaid, push), lines };
}

/** Resolve under §9.5 and refuse to call it done while `blurred` is on it. */
async function requireHol(s: Session, address: string, push: (l: string) => void): Promise<MailCoordinates> {
  const source = mirrorSource(s.mirror);
  // Two passes for the same reason `resolveSelf` has two: §5.2's canonical
  // location is inside the proof's hash (D-163), and the caller's manifest topic
  // is what fills it.
  const first = await resolveHol(source, s.ledgerTag, address, s.account, s.holAnchors);
  if ('failure' in first) throw new RegistrationRefusal(`${address} does not resolve under hol: ${first.failure} — ${first.detail}`);
  const second = await resolveHol(source, s.ledgerTag, address, first.coordinates.manifestTopic, s.holAnchors);
  if ('failure' in second) throw new RegistrationRefusal(`${address} does not resolve under hol: ${second.failure} — ${second.detail}`);
  push(line('register.resolved', { address, endorsements: second.coordinates.endorsements.length }));
  return second.coordinates;
}

interface MAccount {
  readonly balance?: { readonly balance?: number };
}

async function hbarBalance(s: Session): Promise<bigint> {
  const a = await s.mirror.get<MAccount>(`/accounts/${s.account}?limit=1`);
  return BigInt(a?.balance?.balance ?? 0);
}
