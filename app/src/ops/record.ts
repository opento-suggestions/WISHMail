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

/**
 * The specification tag entities are provisioned against from here on. It is
 * per-ENTITY and not per-record: the eleven of Step 2 were provisioned against
 * `v0.5.2`, and the declaration against `v0.5.4`, and Step 4 onward against
 * `v0.5.12`, so a single top-level field
 * would be false about one of them the moment the second landed. The record's
 * own `specTag` is the tag it was opened under and stays what it was.
 */
export const SPEC_TAG = 'v0.5.12';

export type EntityKind = 'account' | 'token' | 'mint' | 'association' | 'topic' | 'message' | 'account-update';

export type EntityKey =
  | 'treasury.account'
  | 'agent.account'
  | 'postage.token'
  | 'postage.mint'
  | 'postmasterPayer.association'
  | 'agent.association'
  | 'prices.topic'
  | 'prices.first'
  // The second PriceList, sequence 2: the provisioned path priced (D-159's
  // addendum). §14.3's schedule is the sequence of messages, so a new schedule
  // is a new message and sequence 1 is never edited.
  | 'prices.second'
  // The third, sequence 3: the hbar rate read from the NETWORK's exchange rate
  // rather than a DEX spot price, so a Verifier can re-obtain it at the receipt's
  // `at` and T-P11-4 is checkable on a rate-priced method (D-170).
  | 'prices.third'
  // The fourth, sequence 4: the provisioned path priced at what it costs. Gate
  // One measured a mailbox at 27.78 ℏ against a 2 ℏ published price, of which
  // the HIP-991 fee-gated doorbell alone is 26.31 ℏ.
  | 'prices.fourth'
  | 'agent.doorbell'
  | 'agent.log'
  | 'agent.manifest'
  // Step 3, the hcs14 declaration (D-147 rows 3-5, D-150 row 6, D-153).
  | 'agent.profileFile'
  | 'agent.profileChunks'
  | 'agent.declRegistry'
  | 'agent.registryEntry'
  | 'agent.accountMemo'
  // Step 4, the HCS-13 schema registration (§5.11). Four per schema, fourteen
  // schemas: HCS-13 at the pin has one HCS-2 topic manage ONE schema's versions
  // (`hcs-13.md:134-160`), and §5.11 pins a schemaRef to a sequence number ON
  // THAT TOPIC — so the topics are per schema and are not shared.
  | `schema.${string}.file`
  | `schema.${string}.chunks`
  | `schema.${string}.registry`
  | `schema.${string}.register`;

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
  /** The specification tag this entity was provisioned against. Per entity: see SPEC_TAG. */
  readonly specTag: string;
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
        autoRenewAccount: 'postmaster payer',
        autoRenewAccountNote:
          'Every topic sets autoRenewAccountId to the postmasterPayer explicitly rather than inheriting the ' +
          'SDK default, so the record shows a choice. This is a PAYER role and not a key: §4.6 and D-47 ' +
          'have the Postmaster pay, and paying a topic’s renewal is the same kind of act as paying for ' +
          'its creation. D-47’s rule about postmasterPayer keys is therefore untouched — an auto-renew account ' +
          'is not an admin, submit or fee-schedule key, it signs nothing, and it authorises nothing on ' +
          'the topic. On an agent-owned topic the agent holds the admin key and can change it at will ' +
          '(T-P17-1, §4.6:583), so naming the postmasterPayer here takes nothing away from the agent’s ownership.',
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
    this.flush();
  }

  private flush(): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2) + '\n');
    fs.renameSync(tmp, this.file);
  }

  get path(): string {
    return this.file;
  }
}
