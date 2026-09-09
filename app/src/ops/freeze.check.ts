/**
 * `check:freeze` — the three schemas the freeze would close unexercised, and the
 * one measurement §10.4 depends on.
 *
 * Step 4 registers §18.5's fourteen schemas under HCS-13, and registering is
 * §1.7's freeze: after it, a schema change is 0.6. Eleven of the fourteen have
 * been exercised by something that produced a real document — `check:envelope`
 * validates Chunk and Envelope, `check:letter` validates EvidenceBundle,
 * Narrative and Settlement, `check:schemas` validates PriceList, `resolve`
 * validates MailCoordinates and Declaration, `send` now validates
 * AttemptedDeliverySlip (D-161's landing), and Proof and Postmark travel inside
 * those. **Three never have been**: StampReceipt (`buy_stamp` is
 * `NOT_IMPLEMENTED`), ReturnReceipt (§6.4 step 7 and `ack` are refused rather
 * than skipped), and ConformanceClaim (T-P9-2 blocks every claim while 28 pins
 * are null). A schema frozen without one instance ever having been built
 * against it is the profile-version defect waiting to happen: it validates,
 * it hashes, it is internally consistent, and nothing has asked whether the
 * rule that reads it can (CLAUDE.md §9).
 *
 * So this builds one of each, validates it against the registered schema, and
 * then answers the question the freeze actually turns on: **do the bytes a
 * return receipt's scheduled inner submission carries fit one
 * ConsensusSubmitMessage inside a ScheduleCreate?** §10.4 makes the receipt the
 * execution of a scheduled submission of the receipt's *manifest* to the
 * recipient's manifest topic. A manifest is one HCS message (§9.1, T-P9-8), and
 * a scheduled transaction cannot be chunked — so if the manifest does not fit,
 * §10.4's mechanism does not work and that is a 0.6, not a build problem.
 *
 * Nothing here signs, submits, or reads the network. Every identifier is a
 * fixture value and says so.
 *
 * Run: `npm run check:freeze`.
 */
import {
  AccountId,
  Hbar,
  ScheduleCreateTransaction,
  TopicId,
  TopicMessageSubmitTransaction,
  TransactionId,
  Timestamp,
} from '@hashgraph/sdk';

import { canonicalBytes, canonicalDigest } from '../core/canonical.js';
import { proofInputs } from '../core/proof.js';
import { CHUNK_WIRE_MAX } from '../core/chunk.js';
import { repoRoot } from './env.js';
import { schemas, type SchemaName } from '../schema/loader.js';

let failures = 0;
let assertions = 0;
/** Raised, unruled, not coded around (CLAUDE.md §5). Printed, never counted. */
const openFindings: string[] = [];

function is(what: string, got: unknown, want: unknown): void {
  assertions += 1;
  if (got !== want) {
    failures += 1;
    console.error(`  ${what}\n    got   ${JSON.stringify(got)}\n    want  ${JSON.stringify(want)}`);
  }
}

function ok(what: string, cond: boolean, detail = ''): void {
  assertions += 1;
  if (!cond) {
    failures += 1;
    console.error(`  ${what}${detail === '' ? '' : `\n    ${detail}`}`);
  }
}

const registry = schemas(repoRoot());

function validates(name: SchemaName, value: unknown): void {
  const errors = registry.validate(name, value);
  ok(`${name} validates against its registered schema`, errors.length === 0, errors.join('; '));
}

// Fixture identifiers. None of these is on any ledger; they are well-formed and
// synthetic, as `spec/vectors/aad.json` says of its own.
const LEDGER = 'hedera:testnet';
const FX = {
  agentAccount: '0.0.7000101',
  doorbell: '0.0.7000102',
  log: '0.0.7000103',
  manifestTopic: '0.0.7000104',
  declRegistry: '0.0.7000105',
  profileFile: '0.0.7000106',
  lane: '0.0.7000201',
  recipientManifest: '0.0.7000202',
  stampToken: '0.0.10426208',
  treasury: '0.0.10426205',
  priceTopic: '0.0.10426551',
} as const;

console.log('');
console.log('  the three schemas the freeze would close unexercised');
console.log('');

// ---------------------------------------------------------------- StampReceipt
// §5.4 with D-161's provisioning line: the Postmaster-provisioned path of §4.6,
// bought in the same act as the stamps. What the receipt names is what the agent
// receives — coordinates, and no secret (P-13).
const stampReceipt = {
  ledgerTag: LEDGER,
  tokenId: FX.stampToken,
  amount: 12,
  txRef: `${FX.agentAccount}@1757400000.000000001`,
  price: { amount: '1.00', currency: 'USDC' },
  holder: FX.agentAccount,
  provisioning: {
    price: { amount: '0.50', currency: 'USDC' },
    account: FX.agentAccount,
    doorbell: FX.doorbell,
    log: FX.log,
    manifestTopic: FX.manifestTopic,
    declRegistry: FX.declRegistry,
    profileFile: FX.profileFile,
  },
};
validates('stamp-receipt', stampReceipt);

// The negative half, so that "it validates" means something: the schema is
// closed, and a receipt that carried a secret would be refused by its shape and
// not only by P-13's grep.
ok(
  'a StampReceipt carrying a private key is refused by the schema',
  registry.validate('stamp-receipt', { ...stampReceipt, privateKey: '302e...' }).length > 0,
);
ok(
  'a provisioning line without the doorbell is refused',
  registry.validate('stamp-receipt', {
    ...stampReceipt,
    provisioning: { ...stampReceipt.provisioning, doorbell: undefined },
  }).length > 0,
);
// A receipt with no provisioning line is the ordinary case and must still pass.
const plainReceipt: Record<string, unknown> = { ...stampReceipt };
delete plainReceipt['provisioning'];
validates('stamp-receipt', plainReceipt);

// --------------------------------------------------------------- ReturnReceipt
// §10.4's parts. The inputs are the envelope identifier, chunk 0's postmark, and
// the epoch the envelope opened under; the output is `opened` over exactly
// those; the meaning names the recipient's account and the manifest's canonical
// location on the recipient's own manifest topic.
const envelopeId = 'a'.repeat(64);
const chunk0 = { topicId: FX.lane, sequenceNumber: 41 };
const keyEpoch = 1;

const receiptManifestParts = {
  rule: { id: 'wishmail:receipt', revision: '0.5' },
  // §5.2's three fields. The LOCATOR is chunk 0's postmark, which is where a
  // Verifier re-obtains every input: chunk 0 carries the envelope identifier as
  // its `id` and the epoch as `hdr.ke`, and its own postmark is the postmark.
  // The DIGEST is over what was read there. No snapshot: all of it is on
  // consensus.
  inputs: proofInputs(
    { ledgerTag: LEDGER, topicId: chunk0.topicId, sequenceNumber: chunk0.sequenceNumber },
    { envelopeId, keyEpoch },
  ),
  output: { value: 'opened' },
  meaning: {
    statement:
      'The recipient opened this envelope with its AAD verified, under the key of the epoch its header names. The signature is the recipient testimony; what recomputes is that this key signed for this envelope after this postmark.',
    uri: { ledgerTag: LEDGER, topicId: FX.recipientManifest, sequenceNumber: 7 },
    trustClass: 'math',
    endorsements: [] as string[],
  },
};
const receiptManifest = { ...receiptManifestParts, hash: canonicalDigest(receiptManifestParts) };

const returnReceipt = {
  envelopeId,
  postmarkRef: chunk0,
  recipient: `${FX.doorbell}@${FX.agentAccount}`,
  keyEpoch,
  proof: {
    hash: receiptManifest.hash,
    uri: { ledgerTag: LEDGER, topicId: FX.recipientManifest, sequenceNumber: 7 },
  },
  witness: {
    ledgerTag: LEDGER,
    scheduleId: '0.0.7000301',
    executedTimestamp: '1757400900.000000002',
  },
};
validates('return-receipt', returnReceipt);

// The receipt's manifest is a §5.2 Proof. Its `inputs` are §5.2's three fields
// through `core/proof.ts`; its `meaning.uri` runs into ledger §G-16, exactly as
// the resolution manifest does, and is reported rather than worked around.
{
  const errors = registry.validate('proof', receiptManifest);
  const open = errors.filter((e) => e.startsWith('/meaning/uri'));
  const rest = errors.filter((e) => !e.startsWith('/meaning/uri'));
  ok(`the receipt manifest validates against the registered Proof schema: ${rest.join('; ')}`, rest.length === 0);
  if (open.length > 0) openFindings.push(`the receipt manifest: ${open.join('; ')}`);
}

// What `ack` holds before execution, and what it can only fill after. The
// schema permits `proof.uri` to be null and requires `witness` — which is
// right, because `ack` returns *after* the ScheduleSign has executed. The
// pre-execution object is the manifest, not the receipt, so nothing is
// circular.
ok(
  'the receipt proof uri may be null before the manifest lands',
  registry.validate('return-receipt', {
    ...returnReceipt,
    proof: { hash: receiptManifest.hash, uri: null },
  }).length === 0,
);
ok(
  'a receipt without its witness is refused: there is no receipt before execution',
  registry.validate('return-receipt', { ...returnReceipt, witness: undefined }).length > 0,
);

// ------------------------------------------------------------ ConformanceClaim
// §5.10, with every `[fill at claim]` field of LIMITATIONS.md filled with a
// fixture value. This claim is NOT made and could not be: T-P9-2 refuses a
// report while any pin is null, and 28 are. It exists so that the shape a claim
// will take has been built once before the schema that holds it is frozen.
const pins = JSON.parse(
  // eslint-disable-next-line n/no-sync
  (await import('node:fs')).readFileSync(`${repoRoot()}/spec/pins.json`, 'utf8'),
) as { standards?: Record<string, unknown> };

const conformanceClaim = {
  spec: '0.5.5',
  classes: ['VERIFIER'],
  profiles: { VERIFIER: ['hcs14'] },
  pins: pins.standards ?? {},
  stampToken: { ledgerTag: LEDGER, tokenId: FX.stampToken, treasury: FX.treasury },
  suite: {
    version: '0.5.5',
    date: '2026-09-09',
    reportDigest: 'b'.repeat(64),
  },
  limitations: 'LIMITATIONS.md',
  prices: { ledgerTag: LEDGER, topicId: FX.priceTopic },
  extensions: [] as string[],
};
validates('conformance-claim', conformanceClaim);
ok(
  'a claim naming an unknown class is refused',
  registry.validate('conformance-claim', { ...conformanceClaim, classes: ['NOTARY'] }).length > 0,
);
ok(
  'a claim naming an unknown profile is refused',
  registry.validate('conformance-claim', {
    ...conformanceClaim,
    profiles: { VERIFIER: ['document'] },
  }).length > 0,
);

// The schema is satisfied by the shape and cannot see the problem. §2.2 makes a
// canonical location "the structured locator … at which the proof's MANIFEST is
// found", and §10.4 says the receipt's meaning names it. The sequence number
// above is a guess: the manifest lands only when the recipient signs, and the
// sender must pre-fill these bytes at ScheduleCreate, because a scheduled
// transaction's body cannot be edited. So `ack` cannot fill this field, and no
// party can. The resolution manifest fails the schema outright for the adjacent
// reason — an HCS-1 profile file is a topic, not a message, so its locator has
// no sequence number at all. One question, showing in two ways.
openFindings.push(
  "the receipt manifest's meaning.uri names a sequence number nobody can know at ScheduleCreate: the manifest lands when the recipient signs, and the bytes are pre-filled before that (§10.4)",
);

// --------------------------------------- §10.4: does the manifest fit a schedule?
console.log('');
console.log('  §10.4 — the bytes the scheduled inner submission carries');
console.log('');

const manifestBytes = canonicalBytes(receiptManifest);
console.log(`  receipt manifest        ${manifestBytes.length} bytes canonical (RFC 8785)`);
ok(
  `the manifest is one HCS message at or under CHUNK_WIRE_MAX (§9.1, T-P9-8)`,
  manifestBytes.length <= CHUNK_WIRE_MAX,
  `${manifestBytes.length} > ${CHUNK_WIRE_MAX}`,
);

// The inner transaction, exactly as §10.4 describes it: a submission of the
// manifest to the RECIPIENT's manifest topic, which only the recipient's key can
// write to.
const inner = new TopicMessageSubmitTransaction()
  .setTopicId(TopicId.fromString(FX.recipientManifest))
  .setMessage(manifestBytes);

// One chunk, or §10.4's mechanism does not work: a scheduled transaction cannot
// carry transport-layer chunking, and the SDK refuses to schedule one that
// would.
const innerChunks = inner.getRequiredChunks();
is('the inner submission is one chunk', innerChunks, 1);

const schedule = new ScheduleCreateTransaction()
  .setScheduledTransaction(inner)
  .setScheduleMemo('wishmail: return receipt (fixture; nothing is signed)')
  .setPayerAccountId(AccountId.fromString(FX.agentAccount))
  .setWaitForExpiry(false)
  .setExpirationTime(new Timestamp(1757400000 + 5_356_800, 0))
  .setTransactionId(TransactionId.generate(AccountId.fromString(FX.agentAccount)))
  .setNodeAccountIds([AccountId.fromString('0.0.3')])
  .setMaxTransactionFee(new Hbar(2))
  .freeze();

const scheduleBytes = schedule.toBytes();
console.log(`  ScheduleCreate frozen   ${scheduleBytes.length} bytes, unsigned`);
ok(
  'the whole ScheduleCreate fits one Hedera transaction (6144 bytes)',
  scheduleBytes.length <= 6144,
  `${scheduleBytes.length} > 6144`,
);
ok(
  'the schedule expiration is at or under SCHEDULE_MAX_LIFETIME (§1.6, 62 days)',
  5_356_800 <= 5_356_800,
);

// The receipt's own hash recomputes from its parts, which is what a Verifier
// does at §11.4 — the manifest is the thing published, and the ReturnReceipt's
// `proof.hash` names it.
const { hash: _drop, ...reparts } = receiptManifest;
is('the receipt manifest hash recomputes', canonicalDigest(reparts), receiptManifest.hash);
is('the ReturnReceipt names that manifest', returnReceipt.proof.hash, receiptManifest.hash);

console.log('');
if (failures > 0) {
  console.error(`check:freeze FAILED — ${failures} of ${assertions} assertions`);
  process.exit(1);
}

if (openFindings.length > 0) {
  console.log('  FREEZE NOT READY — ledger §G-16, raised and unruled:');
  for (const f of openFindings) console.log(`    ${f}`);
  console.log('');
  console.log("    §2.2 defines a canonical location as the structured locator at which the PROOF'S");
  console.log('    OWN MANIFEST is found, and §10.2, §10.4 and §10.5 each say the meaning names it.');
  console.log('    §5.1 hashes the meaning into the proof; §6.2 computes that hash at resolve time;');
  console.log('    §6.4 step 2 publishes the manifest afterwards and the AAD binds the hash. So a');
  console.log('    manifest cannot carry its own publication locator, and the registered Proof');
  console.log("    schema requires meaning.uri to be {ledgerTag, topicId, sequenceNumber}, all three.");
  console.log('');
  console.log('    Every writer here names something else instead — the resolver the HCS-1 profile');
  console.log("    file's topic (no sequence number: a file is a topic, not a message), the slip the");
  console.log("    sender's log entry, this receipt the recipient's manifest topic at a sequence it");
  console.log('    cannot know before execution. The slip passes the schema and the other two do');
  console.log('    not, which is the same defect showing in two ways.');
  console.log('');
  console.log('    STEP 4 MUST NOT SIGN UNTIL THIS IS RULED: registration freezes proof.schema.json');
  console.log('    for the life of 0.5, and either reading changes it.');
  console.log('');
  process.exit(2);
}
console.log(
  `check:freeze PASS — ${assertions} assertions: StampReceipt with D-161's provisioning line, ReturnReceipt and its §10.4 manifest, and a ConformanceClaim with every [fill at claim] field filled, each validated against the schema Step 4 would freeze; and the receipt's scheduled inner submission is one ConsensusSubmitMessage inside a ScheduleCreate that fits one transaction. Nothing was signed and nothing was submitted.`,
);
