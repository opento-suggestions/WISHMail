/**
 * A Correspondent's session — what a booted agent is, in one object.
 *
 * Everything a verb needs and nothing it does not: the two signers of the payer
 * seam, the account they act for, the public facts of the deployment, and a
 * `Consensus` built over them. Assembling it is the boot, so the boot is one
 * function and every verb takes its result.
 *
 * WHERE THE PUBLIC FACTS COME FROM, and why not from the Postmaster's record.
 * The stamp token and its treasury are §18.4 PINS: `spec/pins.json` is the
 * machine-readable form of §1.6 and it ships with the release, so a
 * Correspondent reads them there. `app/deployment/hedera-testnet.json` is the
 * Postmaster's ops record and a Correspondent never reads it — no Correspondent
 * entity id goes in, and no Postmaster entity comes out (CLAUDE.md §11). The
 * HOL anchor comes from the same pins file, for the same reason.
 *
 * NOTHING HERE IS A SECRET. The two `Signer`s are a public key and a closure,
 * as they are everywhere else in this project; the session holds no private key
 * and cannot leak one (P-13).
 */
import fs from 'node:fs';
import path from 'node:path';
import { Client } from '@hashgraph/sdk';
import { repoRoot } from '../src/ops/env.js';
import { Mirror } from '../src/ops/mirror.js';
import { SPEC_TAG } from '../src/ops/record.js';
import type { NetworkConstants } from '../src/ops/networks.js';
import type { SealIdentity, Signer } from '../src/ops/identity.js';
import type { Consensus } from '../src/tools/consensus.js';
import type { ProfileIdentity } from '../src/ops/declaration.js';
import { liveConsensus } from './live.js';
import { agentPublicHex, agentSeal, agentSigner, ensureKeys, payerSigner } from './keystore.js';
import { AgentRecord, type Home } from './home.js';

/** §18.4's deployment pins, as a Correspondent reads them. */
export interface DeploymentFacts {
  readonly stampToken: string;
  readonly treasury: string;
  /** §9.5's registry anchors for `hol` on this ledger, read in full and in order. */
  readonly holAnchors: readonly string[];
}

interface PinsFile {
  readonly stampToken?: Record<string, { readonly tokenId: string; readonly treasury: string }>;
  readonly registryAnchors?: { readonly hol?: Record<string, readonly string[]> };
}

export function deploymentFacts(ledgerTag: string): DeploymentFacts {
  const pins = JSON.parse(fs.readFileSync(path.join(repoRoot(), 'spec', 'pins.json'), 'utf8')) as PinsFile;
  const stamp = pins.stampToken?.[ledgerTag];
  if (stamp === undefined) {
    // D-154: a tag with no deployment has no entry at all, and `hedera:mainnet`
    // is defined and undeployed (§15.5). An absent entry is not a null pin.
    throw new Error(`spec/pins.json carries no stamp token for ${ledgerTag}; §15.5 leaves it undeployed`);
  }
  return {
    stampToken: stamp.tokenId,
    treasury: stamp.treasury,
    holAnchors: pins.registryAnchors?.hol?.[ledgerTag] ?? [],
  };
}

export interface Session {
  readonly home: Home;
  readonly network: string;
  readonly ledgerTag: string;
  readonly constants: NetworkConstants;
  readonly mirror: Mirror;
  readonly client: Client;
  /** The agent: what signs. */
  readonly agent: Signer;
  readonly agentPublicHex: string;
  readonly seal: SealIdentity;
  readonly identity: ProfileIdentity;
  /** The operator: what pays. The seam (CLAUDE.md §11). */
  readonly payer: Signer;
  readonly payerId: string;
  /** The agent's account, once it exists. Empty before the purchase creates it. */
  readonly account: string;
  readonly stampToken: string;
  readonly treasury: string;
  readonly holAnchors: readonly string[];
  readonly consensus: Consensus;
  readonly specTag: string;
  readonly record: AgentRecord;
  /** Whether this boot is the one that made the agent (D-165). */
  readonly keysOrigin: 'born' | 'loaded';
}

interface MAccounts {
  readonly accounts?: readonly { readonly account: string; readonly deleted?: boolean | null }[];
}

/**
 * The agent's account, found from consensus by the key that owns it.
 *
 * HIP-542: the purchase's stamp transfer to the agent's PUBLIC-KEY ALIAS creates
 * the account, so the agent learns its own account id from the ledger and never
 * from a message anyone sent it. Two accounts under one key is refused rather
 * than resolved: a second account would mean a second purchase, and choosing
 * between them would strand one.
 */
export async function accountForKey(mirror: Mirror, publicKeyHex: string): Promise<string | null> {
  const r = await mirror.get<MAccounts>(`/accounts?account.publickey=${publicKeyHex}&balance=false&limit=5`);
  const live = (r?.accounts ?? []).filter((a) => a.deleted !== true);
  if (live.length === 0) return null;
  if (live.length > 1) {
    throw new Error(
      `two or more accounts on this ledger are owned by this agent's key (${live.map((a) => a.account).join(', ')}). ` +
        'A mailbox purchase creates exactly one; refusing to choose.',
    );
  }
  return live[0]?.account ?? null;
}

export interface BootOptions {
  /** Skip the account lookup — for the boot that runs before the purchase. */
  readonly withoutAccount?: boolean;
}

/**
 * Boot a Correspondent from its home directory.
 *
 * Keys are born here, once, on the first boot (D-165) — a process that
 * regenerated on boot would make every restart a new agent — and loaded on
 * every later one. Which of the two happened is returned rather than hidden,
 * because a caller that reports "born" for an agent that already has
 * coordinates is a caller about to provision a second one.
 */
export async function boot(home: Home, options: BootOptions = {}): Promise<Session> {
  const keysOrigin = ensureKeys(home);
  const agent = agentSigner(home);
  const payer = payerSigner(home);
  const publicHex = agentPublicHex(home);
  const mirror = new Mirror(home.mirrorNodeUrl);
  const facts = deploymentFacts(home.constants.ledgerTag);
  const account = options.withoutAccount === true ? '' : ((await accountForKey(mirror, publicHex)) ?? '');

  const client = Client.forName(home.config.network);
  client.setOperatorWith(home.config.payer.accountId, payer.publicKey, payer.sign);

  const consensus = liveConsensus({
    env: { network: home.config.network },
    account,
    agent,
    payerId: home.config.payer.accountId,
    payer,
    stampToken: facts.stampToken,
    mirrorNodeUrl: home.mirrorNodeUrl,
    ledgerTag: home.constants.ledgerTag,
  });

  return {
    home,
    network: home.config.network,
    ledgerTag: home.constants.ledgerTag,
    constants: home.constants,
    mirror,
    client,
    agent,
    agentPublicHex: publicHex,
    seal: agentSeal(home),
    identity: {
      displayName: home.config.agent.displayName,
      alias: home.config.agent.alias,
      bio: home.config.agent.bio,
    },
    payer,
    payerId: home.config.payer.accountId,
    account,
    stampToken: facts.stampToken,
    treasury: facts.treasury,
    holAnchors: facts.holAnchors,
    consensus,
    specTag: SPEC_TAG,
    record: AgentRecord.load(home, SPEC_TAG),
    keysOrigin,
  };
}
