/**
 * The pre-Step-4 sweep: every registered shape the post-freeze build will write,
 * constructed from the specification's own sentences and validated against the
 * schema Step 4 would freeze.
 *
 * `check:freeze` covered the three schemas Step 4 would close *unexercised* —
 * StampReceipt, ReturnReceipt, ConformanceClaim. This covers the ones the build
 * after the freeze will write and that no fixture has yet produced in every
 * shape the specification allows. Its rule is the same, and it is CLAUDE.md §9's:
 * a document can validate, hash correctly and be internally consistent while
 * being unreadable by the rule it exists for, and nothing but the rule will say
 * so. Here the rule is the registered schema and the reader is ajv.
 *
 * Four sweeps:
 *
 *   1. StampReceipt on the `hbar` leg, carrying §14.3's `rate` — "the receipt
 *      records the rate used and when". The x402 leg is deferred this window
 *      (L-11) and the hbar leg is what the MVP sells, so the rate-priced shape
 *      is the one the build will actually write and the one no fixture had.
 *   2. MailCoordinates as §5.3 fixes it, asked one question: does it carry what
 *      §6.4 step 7 and §11.4 need to find the RECIPIENT's manifest topic?
 *   3. One resolution manifest per profile — hcs14, hol, dns, nanda — each with
 *      the `inputs.locator` shape and the snapshot rule §9 fixes FOR THAT
 *      PROFILE, against proof.schema.json. The two consensus profiles carry no
 *      snapshot; the two off-consensus ones must.
 *   4. One EvidenceBundle carrying a receipt in each of the four states §5.10
 *      enumerates — acked, unclaimed, invalid, none — and a `hol` resolution's
 *      observations, which is where D-152's `agentIdOrder` lands.
 *
 * Nothing here signs, submits, or reads a network.
 */
import {
  canonicalBytes,
  canonicalDigest,
  sha256hex,
} from '../core/canonical.js';
import { proofInputs, proofLocation, type Endorsement } from '../core/proof.js';
import { repoRoot } from './env.js';
import { schemas, type SchemaName } from '../schema/loader.js';

const registry = schemas(repoRoot());

let assertions = 0;
let failures = 0;
const openFindings: string[] = [];
function ok(what: string, held: boolean, detail = ''): void {
  assertions += 1;
  if (!held) failures += 1;
  console.log(`  ${held ? 'ok  ' : 'FAIL'} ${what}${held || detail === '' ? '' : ` — ${detail}`}`);
}
function validates(name: SchemaName, value: unknown, label = ''): void {
  const errors = registry.validate(name, value);
  ok(`${label || name} validates against its registered schema`, errors.length === 0, errors.join('; '));
}
function refuses(what: string, name: SchemaName, value: unknown): void {
  ok(what, registry.validate(name, value).length > 0);
}

// Synthetic and well-formed, as `spec/vectors/aad.json` says of its own. None of
// these is on any ledger.
const LEDGER = 'hedera:testnet';
const FX = {
  senderManifest: '0.0.7000104',
  recipientAccount: '0.0.7000301',
  recipientDoorbell: '0.0.7000302',
  recipientLog: '0.0.7000303',
  recipientManifest: '0.0.7000304',
  registry: '0.0.7000305',
  profileFile: '0.0.7000306',
  lane: '0.0.7000201',
  anchor: '0.0.6913983',
  stampToken: '0.0.10426208',
  treasury: '0.0.10426205',
} as const;
const X25519 = 'Qu7g_QH2CtBSHxZ6NbbnPdomI536QDbgJ2bwmovCQF4';

// A real UAID, read from the live HOL testnet anchor at sequence 380 on
// 2026-09-09. 168 characters, and every one of them lands in a manifest's
// `output.address` — "the typed address, as resolved" (§5.3).
const REAL_UAID =
  'uaid:aid:7wC7Cm3h2TGrCa4YA7uSQKp7Fht756tRtCJniaUdbAa4DNrj6fqsUxxKm2AysYkTwy;uid=sdk-agentverse-demo-1763503536585;registry=hashgraph-online;proto=a2a;nativeId=127.0.0.1';

// The statement the resolver actually writes today, at its actual length. A
// short placeholder here would measure a manifest nobody produces.
const REAL_STATEMENT =
  'The account named by this address declares these coordinates under HCS-11, through the HCS-2 registry its memo names, in an HCS-1 file whose topic memo is the digest of the profile it holds.';

/** §9.1: a manifest is one HCS message, whose body is {p, t, ...proof}. */
const wireBytes = (proof: Record<string, unknown>): number =>
  canonicalBytes({ p: 'wishmail', t: 'manifest', ...proof }).length;

console.log('');
console.log('  1. StampReceipt on the hbar leg — §14.3, "the receipt records the rate used and when"');
console.log('');

// §5.4: `rate` is present exactly when the method that bought these stamps is
// priced by reference to another asset. The committed price list prices `hbar`
// by a rate and `x402-usdc` by a unitPrice, so THIS is the shape the MVP writes
// and the fixed-price one is the shape it does not.
const rateReceipt = {
  ledgerTag: LEDGER,
  tokenId: FX.stampToken,
  amount: 12,
  txRef: `0.0.7000401@1757400000.000000001`,
  price: { amount: '4.7562', currency: 'HBAR' },
  rate: {
    source: 'https://api.saucerswap.finance/tokens',
    pair: 'HBAR/USD',
    value: '0.21025',
    at: '1757400000.000000000',
  },
  holder: '0.0.7000401',
};
validates('stamp-receipt', rateReceipt, 'a rate-priced StampReceipt');

// The negative halves, so that "it validates" means something.
refuses('a rate missing `at` is refused — §14.3 requires the rate AND when', 'stamp-receipt', {
  ...rateReceipt,
  rate: { source: rateReceipt.rate.source, pair: rateReceipt.rate.pair, value: rateReceipt.rate.value },
});
refuses('a rate whose value is a JSON number is refused (§14.3: decimal strings)', 'stamp-receipt', {
  ...rateReceipt,
  rate: { ...rateReceipt.rate, value: 0.21025 },
});
refuses('a rate carrying an extra field is refused: the shape is closed', 'stamp-receipt', {
  ...rateReceipt,
  rate: { ...rateReceipt.rate, quotedFor: 12 },
});

// A holder that is a public-key alias rather than an account — §5.4's "account
// or public-key alias", which is what a first-time buyer presents (P-16).
validates(
  'stamp-receipt',
  { ...rateReceipt, holder: 'fb9dab4911678cd198ec031997f37de35a890bc272301131bc1b78ff8f74dc12' },
  'a StampReceipt whose holder is a public-key alias',
);

console.log('');
console.log('  2. MailCoordinates — §5.3, and what §6.4 step 7 needs from it');
console.log('');

const coordinates: Record<string, unknown> = {
  address: `uaid:aid:0x0f1e2d3c`,
  profile: 'hcs14',
  ledgerTag: LEDGER,
  account: FX.recipientAccount,
  doorbell: FX.recipientDoorbell,
  log: FX.recipientLog,
  manifestTopic: FX.recipientManifest,
  x25519Pub: X25519,
  keyEpoch: 1,
  resolutionProof: { hash: 'a'.repeat(64), uri: null },
  trustClass: 'math',
  endorsements: [] as string[],
  resolvedAt: '1757400000.000000000',
};
validates('mail-coordinates', coordinates, 'MailCoordinates carrying manifestTopic');

// The question this sweep exists to ask. §6.4 step 7 has `send` create §10.4's
// scheduled submission, whose inner transaction writes to THE RECIPIENT'S
// manifest topic; and §11.4 has a Verifier read the receipt manifest there. The
// only thing `send` is given about the recipient is `coordinates`, and the only
// replay-stable record of what the envelope resolved to is the resolution
// proof's output — which IS the coordinates.
ok(
  "MailCoordinates carries the recipient's manifest topic (§6.4 step 7, §10.4, §11.4)",
  registry.validate('mail-coordinates', coordinates).length === 0 &&
    Object.prototype.hasOwnProperty.call(coordinates, 'manifestTopic'),
);

console.log('');
console.log('  3. One manifest per profile — §9, each with its own locator and snapshot rule');
console.log('');

interface ProfileCase {
  readonly id: string;
  readonly trustClass: 'math' | 'social-committee';
  readonly locator: Record<string, unknown>;
  readonly read: unknown;
  readonly snapshot?: unknown;
  readonly endorsements: readonly Endorsement[];
  readonly why: string;
}

const output = {
  address: 'the address, as resolved',
  profile: '',
  ledgerTag: LEDGER,
  account: FX.recipientAccount,
  doorbell: FX.recipientDoorbell,
  log: FX.recipientLog,
  manifestTopic: FX.recipientManifest,
  x25519Pub: X25519,
  keyEpoch: 1,
};

const profiles: readonly ProfileCase[] = [
  {
    // §9.2, first form. §9.1's table: inputs on consensus, math, no snapshot.
    id: 'hcs14',
    trustClass: 'math',
    locator: {
      ledgerTag: LEDGER,
      account: FX.recipientAccount,
      registryTopic: FX.registry,
      registrySequence: 2,
      consensusTimestamp: '1757390000.000000001',
      profileTopic: FX.profileFile,
    },
    read: { registryEntry: { p: 'hcs-2', op: 'register', t_id: FX.profileFile }, profileDigest: 'b'.repeat(64) },
    endorsements: [],
    why: 'consensus profile, first form: no snapshot, no blurred',
  },
  {
    // §9.5: "the locator is {ledgerTag, anchorTopic, sequenceNumber}"; a snapshot
    // only where §9.2's second form carries one — which this shape does not.
    // `blurred` because the registration's payer is not the address's account.
    id: 'hol',
    trustClass: 'math',
    locator: { ledgerTag: LEDGER, anchorTopic: FX.anchor, sequenceNumber: 380 },
    read: {
      registration: { p: 'hcs-10', op: 'register', account_id: FX.recipientAccount, uaid: 'uaid:aid:0x0f1e2d3c', t_id: FX.registry },
      registryEntry: { p: 'hcs-2', op: 'register', t_id: FX.profileFile },
      profileDigest: 'c'.repeat(64),
    },
    endorsements: ['blurred'],
    why: "consensus profile: no snapshot; blurred because the anchoring signature is the registry operator's (§9.5)",
  },
  {
    // §9.3: "the locator is {name, type: TXT, resolver, queryTime}; the snapshot
    // is the RRset bytes and RRSIGs". NOTE: no ledgerTag in this locator at all.
    id: 'dns',
    trustClass: 'social-committee',
    locator: { name: '_wishmail.example.test', type: 'TXT', resolver: '9.9.9.9', queryTime: '1757400000.000000000' },
    read: { rrset: ['v=wm1; l=hedera:testnet; a=0.0.7000301; d=0.0.7000302; m=0.0.7000304; k=' + X25519 + '; e=1'] },
    snapshot: {
      rrset: ['v=wm1; l=hedera:testnet; a=0.0.7000301; d=0.0.7000302; m=0.0.7000304; k=' + X25519 + '; e=1'],
      rrsigs: [],
      ttl: 300,
    },
    endorsements: ['blurred'],
    why: 'off-consensus: snapshot REQUIRED (§9.1, T-P6-2); blurred because the answer is unsigned (§9.3)',
  },
  {
    // §9.4: "the locator is {indexHost, urn, fetchTime}; the snapshot is the
    // whole index_record". `blurred` always.
    id: 'nanda',
    trustClass: 'social-committee',
    locator: { indexHost: 'index.example.test', urn: 'urn:ai:domain:example.test', fetchTime: '1757400000.000000000' },
    read: { index_record: { status: 'active', metadata: { 'org.wishmail': { v: 1 } } } },
    snapshot: {
      index_record: {
        status: 'active',
        ttl_seconds: 86_400,
        metadata: {
          'org.wishmail': {
            v: 1,
            ledgerTag: LEDGER,
            account: FX.recipientAccount,
            doorbell: FX.recipientDoorbell,
            manifestTopic: FX.recipientManifest,
            x25519Pub: X25519,
            keyEpoch: 1,
          },
        },
      },
    },
    endorsements: ['blurred'],
    why: 'off-consensus: snapshot REQUIRED; blurred always (§9.4: no signature, no content address, no log)',
  },
];

const manifests: Record<string, Record<string, unknown>> = {};
for (const p of profiles) {
  const parts = {
    rule: { id: p.id, revision: '0.5' },
    inputs: proofInputs(p.locator, p.read, p.snapshot),
    output: { ...output, profile: p.id },
    meaning: {
      statement: REAL_STATEMENT,
      // Every profile's manifest is published on the SENDER's manifest topic,
      // on Hedera, whatever ledger or non-ledger its inputs came from (§9.1,
      // D-163). So a `dns` proof's location is a Hedera topic even though its
      // locator names no ledger at all.
      uri: proofLocation(LEDGER, FX.senderManifest),
      trustClass: p.trustClass,
      endorsements: [...p.endorsements],
    },
  };
  const manifest = { ...parts, hash: canonicalDigest(parts) };
  manifests[p.id] = manifest;
  validates('proof', manifest, `the ${p.id} manifest (${p.why})`);

  // §9.1's snapshot rule, both directions, per profile.
  const hasSnapshot = Object.prototype.hasOwnProperty.call(manifest['inputs'] as object, 'snapshot');
  ok(
    `the ${p.id} manifest ${p.trustClass === 'math' ? 'carries no snapshot' : 'carries a snapshot'} (§9.1's table)`,
    hasSnapshot === (p.trustClass !== 'math'),
  );

  // T-P6-1: altering the inputs after resolution breaks the hash.
  const tampered = { ...manifest, inputs: { ...(manifest['inputs'] as object), digest: 'f'.repeat(64) } };
  ok(
    `the ${p.id} manifest no longer hashes to itself when its inputs are altered (T-P6-1)`,
    canonicalDigest(tampered as Record<string, unknown>, 'hash') !== manifest['hash'],
  );

  // §9.1, T-P9-8: one HCS message, at or under CHUNK_WIRE_MAX. Measured on the
  // WIRE form — {p, t, ...proof} — because that is what the message carries and
  // what T-P9-8 counts, and measured at TWO addresses, because §5.3's
  // `output.address` is "the typed address, as resolved" and a UAID is 168
  // characters where an account id is 12.
  const short = wireBytes(manifest);
  const wideOutput = { ...(manifest['output'] as Record<string, unknown>), address: REAL_UAID };
  const wideParts = { rule: manifest['rule'], inputs: manifest['inputs'], output: wideOutput, meaning: manifest['meaning'] };
  const wide = wireBytes({ ...wideParts, hash: canonicalDigest(wideParts as Record<string, unknown>) });
  console.log(`       ${p.id.padEnd(6)} wire bytes: ${String(short).padStart(5)} at an account address, ${String(wide).padStart(5)} at a real UAID  (limit 1000)`);
  if (short > 1000 || wide > 1000) {
    openFindings.push(
      `the ${p.id} manifest is ${short} bytes at an account address and ${wide} at a real UAID; §9.1's limit is 1000`,
    );
  }
}

// The one negative that matters for D-163 and is not profile-specific.
refuses('a manifest whose location carries a sequenceNumber is refused (D-163)', 'proof', {
  ...manifests['hcs14'],
  meaning: {
    ...(manifests['hcs14']!['meaning'] as object),
    uri: { ledgerTag: LEDGER, topicId: FX.senderManifest, sequenceNumber: 3 },
  },
});

console.log('');
console.log("  4. One EvidenceBundle — a receipt in each of §5.10's four states, and hol's observations");
console.log('');

// §5.7: a postmark is Consensus's record that a chunk was submitted, so it
// names WHICH chunk of WHICH envelope. §5.10's abbreviated block writes
// "chunks [Postmark]" and the Postmark schema is what fixes the fields.
const postmark = (envelopeId: string, index: number, seq: number, at: string) => ({
  ledgerTag: LEDGER,
  topicId: FX.lane,
  sequenceNumber: seq,
  consensusTimestamp: at,
  runningHash: 'd'.repeat(96),
  envelopeId,
  chunkIndex: index,
});

// §5.10's `envelope` is the Envelope OBJECT (the schema $refs it), not the
// identifier: §11.3 has a Verifier rebuild the envelope from chunk 0's header,
// and the bundle carries what it rebuilt. One builder, so four entries cannot
// drift apart.
const envelopeFor = (id: string) => ({
  ledgerTag: LEDGER,
  lane: FX.lane,
  profile: 'hcs14',
  resolutionProof: { hash: 'a'.repeat(64), uri: { ledgerTag: LEDGER, topicId: FX.senderManifest, sequenceNumber: 3 } },
  nonce: 'bm9uY2VfZm9yX3RoZV9zd2VlcA',
  aad: 'eyJwIjoid2lzaG1haWwifQ',
  aadHash: id,
  keyEpoch: 1,
  ephemeralPub: X25519,
  ciphertextDigest: 'b'.repeat(64),
  ciphertextBytes: 512,
  weight: 1,
  settlementRef: '0.0.7000401@1757400000.000000001',
  schemaRef: 'hcs://13/0.0.7000305#1',
  chunkCount: 1,
});

const settlement = (id: string) => ({
  ledgerTag: LEDGER,
  txRef: '0.0.7000401@1757400000.000000001',
  from: '0.0.7000401',
  to: FX.treasury,
  amount: 2,
  memo: `wishmail:${id}`,
  consensusTimestamp: '1757400001.000000000',
});

const ENV = { acked: '1'.repeat(64), unclaimed: '2'.repeat(64), invalid: '3'.repeat(64), none: '4'.repeat(64) };

const receiptManifestHash = 'e'.repeat(64);

const bundle = {
  spec: '0.5',
  ledgerTags: [LEDGER],
  window: { from: '1757390000.000000000', to: '1757410000.000000000' },
  topics: [FX.lane, FX.senderManifest, FX.recipientManifest, FX.recipientDoorbell],
  correspondence: [
    {
      // ACKED — §11.4: a receipt that recomputes and was witnessed after
      // delivery, on an envelope standing verified.
      envelope: envelopeFor(ENV.acked),
      state: 'ACKED',
      chunks: [postmark(ENV.acked, 0, 41, '1757400010.000000000')],
      offChain: [],
      settlement: settlement(ENV.acked),
      returnReceipt: {
        envelopeId: ENV.acked,
        postmarkRef: { topicId: FX.lane, sequenceNumber: 41 },
        recipient: `${FX.recipientDoorbell}@${FX.recipientAccount}`,
        keyEpoch: 1,
        proof: { hash: receiptManifestHash, uri: { ledgerTag: LEDGER, topicId: FX.recipientManifest, sequenceNumber: 9 } },
        witness: { ledgerTag: LEDGER, scheduleId: '0.0.7000501', executedTimestamp: '1757400020.000000000' },
      },
      requests: [
        { scheduleId: '0.0.7000501', sequenceNumber: 42, consensusTimestamp: '1757400011.000000000', status: 'executed' },
      ],
      appraisal: {
        declared: { trustClass: 'math', endorsements: [] },
        appraised: { standing: 'verified', reasons: [] },
        resolution: { standing: 'verified', reasons: [] },
        receipt: { status: 'acked', reasons: [] },
      },
    },
    {
      // UNCLAIMED — §11.4: "a request whose schedule expired unsigned".
      // T-P15-5: the envelope stays SETTLED, standing unchanged.
      envelope: envelopeFor(ENV.unclaimed),
      state: 'SETTLED',
      chunks: [postmark(ENV.unclaimed, 0, 51, '1757400030.000000000')],
      offChain: [],
      settlement: settlement(ENV.unclaimed),
      requests: [
        { scheduleId: '0.0.7000502', sequenceNumber: 52, consensusTimestamp: '1757400031.000000000', status: 'expired' },
      ],
      appraisal: {
        declared: { trustClass: 'math', endorsements: [] },
        appraised: { standing: 'verified', reasons: [] },
        resolution: { standing: 'verified', reasons: [] },
        receipt: { status: 'unclaimed', reasons: [] },
      },
    },
    {
      // INVALID — §11.4/§8.6: "a receipt witnessed before delivery … is
      // invalid: recorded, the envelope's state unchanged". The reason names
      // the test whose condition was found (§11.5) — T-P1-7.
      envelope: envelopeFor(ENV.invalid),
      state: 'SETTLED',
      chunks: [postmark(ENV.invalid, 0, 61, '1757400050.000000000')],
      offChain: [],
      settlement: settlement(ENV.invalid),
      returnReceipt: {
        envelopeId: ENV.invalid,
        postmarkRef: { topicId: FX.lane, sequenceNumber: 61 },
        recipient: `${FX.recipientDoorbell}@${FX.recipientAccount}`,
        keyEpoch: 1,
        proof: { hash: receiptManifestHash, uri: { ledgerTag: LEDGER, topicId: FX.recipientManifest, sequenceNumber: 11 } },
        witness: { ledgerTag: LEDGER, scheduleId: '0.0.7000503', executedTimestamp: '1757400040.000000000' },
      },
      requests: [
        { scheduleId: '0.0.7000503', sequenceNumber: 62, consensusTimestamp: '1757400051.000000000', status: 'executed' },
      ],
      appraisal: {
        declared: { trustClass: 'math', endorsements: [] },
        appraised: { standing: 'verified', reasons: [] },
        resolution: { standing: 'verified', reasons: [] },
        // P-12: an invalid receipt is a fact about the receipt and does not
        // lower the envelope's standing (§11.5).
        receipt: { status: 'invalid', reasons: ['T-P1-7'] },
      },
    },
    {
      // NONE — §11.4: "an envelope with no request and no receipt is none".
      // Resolved under `hol`, so this is the entry whose observations carry
      // D-152's agentIdOrder, and whose declared endorsements carry §9.5's
      // `blurred` — which P-12 forbids a Verifier to remove.
      envelope: envelopeFor(ENV.none),
      state: 'SETTLED',
      chunks: [postmark(ENV.none, 0, 71, '1757400060.000000000')],
      offChain: [],
      settlement: settlement(ENV.none),
      requests: [],
      appraisal: {
        declared: { trustClass: 'math', endorsements: ['blurred'] },
        appraised: { standing: 'verified', reasons: [] },
        resolution: { standing: 'verified', reasons: [] },
        receipt: { status: 'none', reasons: [] },
      },
    },
  ],
  orphans: [settlement('0'.repeat(64))],
  observations: {
    appraisedAt: '1757410000.000000000',
    mirror: 'https://testnet.mirrornode.hedera.com/api/v1',
    drift: [],
    disagreement: [],
    // §9.1/D-152, and §11.6: which canonical order matched. The `hol` and
    // `hcs14` rules both recompute an identifier, so both report.
    agentIdOrder: [{ address: 'uaid:aid:0x0f1e2d3c', order: 'example' }],
  },
  digest: 'f'.repeat(64),
};

validates('evidence-bundle', bundle, 'an EvidenceBundle with all four receipt states');

const statuses = bundle.correspondence.map((c) => c.appraisal.receipt.status).sort();
ok(
  "all four of §5.10's receipt states appear: acked, invalid, none, unclaimed",
  JSON.stringify(statuses) === JSON.stringify(['acked', 'invalid', 'none', 'unclaimed']),
  statuses.join(', '),
);
ok(
  "an invalid receipt does not lower the envelope's standing (§11.5, P-12)",
  bundle.correspondence[2]!.appraisal.appraised.standing === 'verified',
);
ok(
  "the hol entry's declared endorsements keep `blurred` (§9.5, P-12: never removed)",
  (bundle.correspondence[3]!.appraisal.declared.endorsements as string[]).includes('blurred'),
);
ok(
  'observations carry agentIdOrder for the recomputed identifier (D-152, §11.6)',
  bundle.observations.agentIdOrder.length === 1,
);

refuses('a fifth receipt status is refused: §5.10 fixes exactly four', 'evidence-bundle', {
  ...bundle,
  correspondence: [
    {
      ...bundle.correspondence[0]!,
      appraisal: { ...bundle.correspondence[0]!.appraisal, receipt: { status: 'pending', reasons: [] } },
    },
  ],
});

// §11.7: the digest is over the bundle with `digest` and `observations` absent,
// so two Verifiers at two clocks agree (P-3).
{
  const { digest: _d, observations: _o, ...evidence } = bundle;
  const computed = sha256hex(canonicalBytes(evidence));
  const withOtherClock = { ...bundle, observations: { ...bundle.observations, appraisedAt: '1799999999.000000000' } };
  const { digest: _d2, observations: _o2, ...evidence2 } = withOtherClock;
  ok(
    'the evidence digest is unchanged by an observation at another clock (§11.7, P-3, T-P3-1)',
    computed === sha256hex(canonicalBytes(evidence2)),
  );
}

console.log('');
if (failures > 0) {
  console.error(`check:prefreeze FAILED — ${failures} of ${assertions} assertions`);
  process.exit(1);
}

if (openFindings.length > 0) {
  console.log('  OPEN — ledger §G-17, raised and unruled:');
  for (const f of openFindings) console.log(`    ${f}`);
  console.log('');
  console.log("    §9.1: 'a manifest MUST be one HCS message at or under CHUNK_WIRE_MAX bytes'");
  console.log("    (T-P9-8), and CHUNK_WIRE_MAX is 1000 (§7.4, D-96). §5.2 requires a");
  console.log("    meaning.statement and bounds its length nowhere. The two have no agreed");
  console.log('    budget between them, and today the statement spends it.');
  console.log('');
  console.log('    Measured against the LIVE declaration on hedera:testnet, wire form:');
  console.log('      hcs14, account address, first form            997   fits, by 3 bytes');
  console.log('      hcs14, real UAID address                     1153   OVER by 153');
  console.log('      hcs14, account address, second form          1056   OVER by 56  (D-107, T-P6-3)');
  console.log('      hol,   real UAID address                     1056   OVER by 56');
  console.log('      with the 190-character statement emptied      963   fits, by 37');
  console.log('');
  console.log('    So the only shape that fits is the one our own demo uses, and it fits by');
  console.log('    three bytes. NOT a schema question as it stands, so it does NOT block the');
  console.log('    freeze — unless the ruling is to bound the statement field in the schema, which');
  console.log('    would have to land before Step 4. Ledger §G-17 states both candidates.');
  console.log('');
  process.exit(2);
}
console.log(
  `check:prefreeze PASS — ${assertions} assertions: a rate-priced StampReceipt on the hbar leg, MailCoordinates carrying the recipient's manifest topic, one resolution manifest per profile with §9's own locator and snapshot rule for each, and an EvidenceBundle carrying a receipt in all four of §5.10's states with a hol resolution's observations. Nothing was signed and nothing was submitted.`,
);
