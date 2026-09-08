/**
 * `app/deployment/hedera-testnet.json` — the ops record, and the provisioning
 * script's idempotency ledger.
 *
 * D-144 draws the line: `spec/pins.json` carries only what §18.4 enumerates,
 * and every other deployment fact lives here. A pin is a fact about the
 * *specification version*; this file is a fact about *one deployment of it*.
 *
 * It cites the tag `v0.5.2` and not a commit hash: a conformance claim names a
 * version (§1.7, §5.10), and a version is what a tag is.
 *
 * Every field here is written from a mirror-node REST read, never from an SDK
 * receipt, and no private-key material ever appears — `signedBy` and `payer`
 * are role names, `policy.publicKey` is a public half.
 */
import fs from 'node:fs';
import path from 'node:path';

export const SPEC_TAG = 'v0.5.2';

export type EntityKind = 'account' | 'token' | 'mint' | 'association' | 'topic' | 'message';

export type EntityKey =
  | 'treasury.account'
  | 'agent.account'
  | 'postage.token'
  | 'postage.mint'
  | 'operator.association'
  | 'agent.association'
  | 'prices.topic'
  | 'prices.first'
  | 'agent.doorbell'
  | 'agent.log'
  | 'agent.manifest';

export interface EntityRecord {
  readonly kind: EntityKind;
  readonly role: string;
  /** The entity's id, or null for an act (a mint, an association, a message). */
  readonly id: string | null;
  readonly builtBy: string;
  readonly signedBy: readonly string[];
  readonly payer: string;
  readonly transactionId: string;
  readonly consensusTimestamp: string;
  readonly confirmedFrom: string;
  readonly confirmedAt: string;
  /** The declared policy, verbatim — T-P17-1's "the policy is recorded at creation". */
  readonly policy: Readonly<Record<string, unknown>>;
}

export interface OpsRecord {
  readonly _readme: string;
  readonly ledgerTag: 'hedera:testnet';
  readonly network: 'testnet';
  readonly specTag: string;
  readonly mirrorNodeUrl: string;
  readonly provisionerVersion: number;
  readonly constants: Readonly<Record<string, unknown>>;
  entities: Partial<Record<EntityKey, EntityRecord>>;
}

const README =
  'The provisioning script’s idempotency ledger and the result of app/OPERATIONS.md’s method. ' +
  'Every field below was written from a mirror-node REST read, never from an SDK receipt (D-144). ' +
  'specTag names the specification text these entities were provisioned against — a tag, not a commit ' +
  'hash, because a conformance claim names a version (§1.7, §5.10). No private-key material appears ' +
  'here or ever will (P-13); signedBy and payer are role names.';

export class Record_ {
  private constructor(
    private readonly file: string,
    private readonly data: OpsRecord,
  ) {}

  static load(repoRoot: string, mirrorNodeUrl: string): Record_ {
    const file = path.join(repoRoot, 'app', 'deployment', 'hedera-testnet.json');
    if (fs.existsSync(file)) {
      return new Record_(file, JSON.parse(fs.readFileSync(file, 'utf8')) as OpsRecord);
    }
    return new Record_(file, {
      _readme: README,
      ledgerTag: 'hedera:testnet',
      network: 'testnet',
      specTag: SPEC_TAG,
      mirrorNodeUrl,
      provisionerVersion: 1,
      constants: {
        hcs10MemoTtl: 60,
        hcs10MemoTtlSource:
          'D-138: a deployment fact, not specification. The modal — in fact unanimous — value recon ' +
          'observed on live HCS-10 inbound and outbound topics (testnet 0.0.7124410 and 0.0.7124409, ' +
          'mainnet 0.0.10058322). WISHMail reads no TTL and §9.5 makes the memo bind nothing.',
      },
      entities: {},
    });
  }

  get(k: EntityKey): EntityRecord | undefined {
    return this.data.entities[k];
  }

  has(k: EntityKey): boolean {
    return this.data.entities[k] !== undefined;
  }

  /** Writes immediately: batching to the end of a run manufactures the partial-failure case. */
  put(k: EntityKey, e: EntityRecord): void {
    this.data.entities[k] = e;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2) + '\n');
    fs.renameSync(tmp, this.file);
  }

  get path(): string {
    return this.file;
  }
}
