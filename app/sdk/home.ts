/**
 * The Correspondent's home directory — which is the agent's identity.
 *
 * D-165: "The Correspondent home directory is the agent's identity: config (the
 * operator's payer, the network, runtime locations), keystore (the account key,
 * and every epoch's X25519 key, retained — §7.6, L-1), and the durable store
 * (sent envelopes for F-3 retry, pending receipt requests, the inbox cursor). A
 * fresh home is a new agent; an existing home is a returning one."
 *
 * So a home is not a cache. It is the only thing that distinguishes one agent
 * from another, and the whole of what a returning process reloads:
 *
 *   <home>/config.json     the OPERATOR's file — payer, network, where the
 *                          counter is. Gitignored; the repository ships
 *                          `app/sdk/config.template.json` and never a filled one.
 *   <home>/keystore.json   the AGENT's keys, born on first run and loaded
 *                          thereafter. Read by `keystore.ts` and no other module.
 *   <home>/store/          the durable store (`state/store.ts` namespaces).
 *   <home>/record.json     what this agent has on consensus — its own coordinates.
 *                          NOT `app/deployment/<network>.json`, which is the
 *                          Postmaster's ops record and holds no Correspondent
 *                          entity id (CLAUDE.md §11).
 *
 * Nothing here reads the repository's own `.env`. `ops/env.ts` is the
 * Postmaster's environment and a Correspondent is a different party: a third
 * party plugs in its own keys and its own payer from its own configuration, and
 * a module that could fall back to ours would make that untrue the first time a
 * value was missing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { networkConstants, type NetworkConstants } from '../src/ops/networks.js';
import { payerKeyPresent } from './keystore.js';

/** The agent's descriptive fields, which HCS-14 hashes and §9.5 recomputes. */
export interface AgentDescription {
  /** The HCS-11 profile's `display_name`, and HCS-14's canonical `name`. */
  readonly displayName: string;
  readonly alias: string;
  readonly bio: string;
}

/**
 * The operator's configuration.
 *
 * `payer` is the seam of CLAUDE.md §11: every consensus submission the agent
 * makes is constructed *agent signs, payer signs*, and in this window the payer
 * is a local key from this file. A remote signature through the Postmaster's
 * `carry` replaces it later without anything above the seam changing.
 */
export interface CorrespondentConfig {
  readonly network: string;
  /** Optional override; the network's own mirror node is the default (P-4: a read interface). */
  readonly mirrorNodeUrl?: string;
  /** The counter — the Postmaster's Streamable HTTP MCP endpoint (§14.2). `buy_stamp` only. */
  readonly postmasterUrl: string;
  /**
   * The operator's account, and — in the same object on disk, and NOT in this
   * type — the operator's own private key.
   *
   * The key's field name is declared in `keystore.ts` and nowhere else, so that
   * this module cannot read it even by accident: P-13's gate on the
   * Postmaster's side is that the names key material travels under are known to
   * exactly two modules, and the Correspondent's side keeps the same shape with
   * one. `npm run p13:check` is what holds it.
   *
   * It is the OPERATOR's key and never the agent's: the agent signs, the
   * operator pays (§3.5). The agent's own keys are in the keystore, born there.
   */
  readonly payer: {
    readonly accountId: string;
  };
  readonly agent: AgentDescription;
}

export interface Home {
  readonly dir: string;
  readonly configPath: string;
  readonly keystorePath: string;
  readonly storeDir: string;
  readonly recordPath: string;
  readonly config: CorrespondentConfig;
  readonly constants: NetworkConstants;
  readonly mirrorNodeUrl: string;
  /** True on the run that created the keystore — the run that made this agent. */
  readonly firstRun: boolean;
}

/** Where the template lives, so an operator is told rather than guessing. */
export function templatePath(): string {
  return path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'config.template.json');
}

function fail(message: string): never {
  throw new Error(`correspondent home: ${message}`);
}

/**
 * Read a home's configuration and assert every field the process needs, before
 * anything reaches the network.
 *
 * A missing field is refused here rather than defaulted. A default payer would
 * be someone else's account; a default network would be a ledger the agent did
 * not choose; and §15.5 leaves `hedera:mainnet` undeployed, which
 * `networkConstants` is what refuses.
 */
export function openHome(dir: string): Home {
  const resolved = path.resolve(dir);
  const configPath = path.join(resolved, 'config.json');
  if (!fs.existsSync(configPath)) {
    fail(`${configPath} does not exist. Copy app/sdk/config.template.json to it and fill it in.`);
  }

  let config: CorrespondentConfig;
  try {
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>;
    delete raw['_readme'];
    config = raw as unknown as CorrespondentConfig;
  } catch (e) {
    return fail(`${configPath} is not readable JSON: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (typeof config.network !== 'string' || config.network === '') fail('config.network is missing');
  const constants = networkConstants(config.network);
  if (typeof config.postmasterUrl !== 'string' || config.postmasterUrl === '') {
    fail('config.postmasterUrl is missing — the counter is where `buy_stamp` is served (§14.2)');
  }
  if (typeof config.payer?.accountId !== 'string' || !/^[0-9]+\.[0-9]+\.[0-9]+$/.test(config.payer.accountId)) {
    fail('config.payer.accountId is missing or is not an account id');
  }
  if (!payerKeyPresent(config as unknown as Record<string, unknown>)) {
    fail("the operator's own key is missing from config.payer — the operator pays (§3.5), and only keystore.ts reads it");
  }
  const a = config.agent;
  if (typeof a?.displayName !== 'string' || a.displayName === '') {
    fail('config.agent.displayName is missing — HCS-14 hashes it and §9.5 recomputes the identifier from it');
  }
  if (typeof a.alias !== 'string' || a.alias === '') fail('config.agent.alias is missing');
  if (typeof a.bio !== 'string') fail('config.agent.bio is missing');

  const storeDir = path.join(resolved, 'store');
  fs.mkdirSync(storeDir, { recursive: true });

  return {
    dir: resolved,
    configPath,
    keystorePath: path.join(resolved, 'keystore.json'),
    storeDir,
    recordPath: path.join(resolved, 'record.json'),
    config,
    constants,
    mirrorNodeUrl: config.mirrorNodeUrl?.trim() || constants.mirrorNodeUrl,
    firstRun: !fs.existsSync(path.join(resolved, 'keystore.json')),
  };
}

/* ------------------------------------------------------------------ */
/* The agent's own record. Its shape mirrors the Postmaster's ops       */
/* record for the same reason that has one: what a run creates is       */
/* written from a mirror-node read, one entity at a time, so a run that  */
/* dies mid-way leaves behind exactly what it made and nothing else.     */
/* ------------------------------------------------------------------ */

export type CorrespondentKey =
  | 'account'
  | 'doorbell'
  | 'log'
  | 'manifest'
  | 'declRegistry'
  | 'profileFile'
  | 'profileChunks'
  | 'registryEntry'
  | 'accountMemo'
  | 'holRegistration'
  | 'purchase';

export interface CorrespondentEntity {
  readonly kind: 'account' | 'topic' | 'message' | 'account-update' | 'transfer';
  readonly role: string;
  readonly id: string | null;
  readonly builtBy: string;
  /** Role names. Never a key (P-13). */
  readonly signedBy: readonly string[];
  readonly payer: string;
  readonly transactionId: string;
  readonly consensusTimestamp: string;
  readonly confirmedFrom: string;
  readonly confirmedAt: string;
  readonly policy: Readonly<Record<string, unknown>>;
  readonly specTag: string;
}

interface RecordFile {
  readonly _readme: string;
  readonly ledgerTag: string;
  readonly network: string;
  readonly specTag: string;
  readonly mirrorNodeUrl: string;
  entities: Partial<Record<CorrespondentKey, CorrespondentEntity>>;
}

const RECORD_README =
  'This Correspondent’s own entities on consensus. It lives in the agent’s home directory and NOT in ' +
  'app/deployment/<network>.json, which is the Postmaster’s ops record: no Correspondent entity id goes ' +
  'there (CLAUDE.md §11). Every field was written from a mirror-node REST read and never from an SDK ' +
  'receipt. No private-key material appears here; signedBy and payer are role names (P-13). ' +
  'This file is a CACHE OF CONSENSUS and never an authority over it: every provisioning verb re-asks ' +
  'the resolver before it creates anything, so deleting this file cannot cause a second doorbell (D-165).';

export class AgentRecord {
  private constructor(
    private readonly file: string,
    private readonly data: RecordFile,
  ) {}

  static load(home: Home, specTag: string): AgentRecord {
    if (fs.existsSync(home.recordPath)) {
      return new AgentRecord(home.recordPath, JSON.parse(fs.readFileSync(home.recordPath, 'utf8')) as RecordFile);
    }
    return new AgentRecord(home.recordPath, {
      _readme: RECORD_README,
      ledgerTag: home.constants.ledgerTag,
      network: home.config.network,
      specTag,
      mirrorNodeUrl: home.mirrorNodeUrl,
      entities: {},
    });
  }

  get(k: CorrespondentKey): CorrespondentEntity | undefined {
    return this.data.entities[k];
  }

  has(k: CorrespondentKey): boolean {
    return this.data.entities[k] !== undefined;
  }

  /** Writes immediately: batching to the end of a run manufactures the partial-failure case. */
  put(k: CorrespondentKey, e: CorrespondentEntity): void {
    this.data.entities[k] = e;
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2) + '\n');
    fs.renameSync(tmp, this.file);
  }

  get path(): string {
    return this.file;
  }
}
