/**
 * `npm run check:vectors` — the committed vectors are recomputed, not trusted.
 *
 * This is the reference side of T-P1-4 and T-P1-5. It reads
 * `spec/vectors/aad.json` and `spec/vectors/seal.json` off disk and rebuilds
 * every value in them from the header fields alone: the AAD bytes, the
 * identifier, §5.6's rebuild from `hdr` and the lane, the ciphertext digest and
 * length, the weight, and the plaintext recovered from the committed ciphertext
 * under the committed key.
 *
 * The other side of T-P1-5 — an independent implementation, in another
 * language, opening what is here and sealing what this opens — is the
 * conformance suite's, and is what makes these files a court rather than a
 * record of one program agreeing with itself. Until that exists this check says
 * only that the files are internally sound, and it says so honestly.
 */
import fs from 'node:fs';
import path from 'node:path';
import { AAD_PROTOCOL, AAD_VERSION, bindsTo, buildAad, rebuildAad } from '../core/aad.js';
import { canonicalBytes, sha256hex } from '../core/canonical.js';
import { createPublicKey } from 'node:crypto';
import { privateFromRaw, rawPublic } from '../core/hpke.js';
import { open, seal, weightOf } from '../core/seal.js';
import { repoRoot } from '../ops/env.js';

interface AadCase {
  readonly name: string;
  readonly header: Record<string, string>;
  readonly hdr: { readonly l: string; readonly rp: { readonly h: string }; readonly nc: string };
  readonly lane: string;
  readonly aadBytesUtf8: string;
  readonly aadBytesHex: string;
  readonly aadBytesLength: number;
  readonly id: string;
}

interface SealCase {
  readonly name: string;
  readonly id: string;
  readonly aadHex: string;
  readonly plaintextHex: string;
  readonly ephemeralPub: string;
  readonly encHex: string;
  readonly ciphertextHex: string;
  readonly ciphertextDigest: string;
  readonly ciphertextBytes: number;
  readonly weight: number;
}

const root = repoRoot();
const dir = path.join(root, 'spec', 'vectors');
const aadDoc = JSON.parse(fs.readFileSync(path.join(dir, 'aad.json'), 'utf8')) as {
  wireVersion: string;
  cases: AadCase[];
};
const sealDoc = JSON.parse(fs.readFileSync(path.join(dir, 'seal.json'), 'utf8')) as {
  suite: { kemId: number; kdfId: number; aeadId: number; info: string };
  recipient: { skRm: string; pkRm: string; x25519Pub: string };
  cases: SealCase[];
};

const failures: string[] = [];
let checked = 0;

function is(name: string, got: unknown, want: unknown): void {
  checked += 1;
  const g = String(got);
  const w = String(want);
  if (g !== w) failures.push(`${name}\n    got   ${g}\n    want  ${w}`);
}

function ok(name: string, condition: boolean): void {
  checked += 1;
  if (!condition) failures.push(name);
}

// --- T-P1-4: the AAD and the identifier. ------------------------------------
ok('aad.json holds cases', aadDoc.cases.length > 0);
is('aad.json wire version is §7.2’s', aadDoc.wireVersion, AAD_VERSION);

for (const c of aadDoc.cases) {
  // The six key names of §7.2 and no others (D-127).
  is(`${c.name}: header keys`, Object.keys(c.header).sort().join(','), 'l,lane,nc,p,rp,v');
  is(`${c.name}: header.p`, c.header['p'], AAD_PROTOCOL);
  is(`${c.name}: header.v`, c.header['v'], AAD_VERSION);

  // Rebuilt from the header fields alone.
  const built = buildAad({
    ledgerTag: c.header['l'] as string,
    lane: c.header['lane'] as string,
    resolutionProofHash: c.header['rp'] as string,
    nonce: c.header['nc'] as string,
  });
  is(`${c.name}: aad bytes (utf8)`, built.bytes.toString('utf8'), c.aadBytesUtf8);
  is(`${c.name}: aad bytes (hex)`, built.bytes.toString('hex'), c.aadBytesHex);
  is(`${c.name}: aad byte length`, built.bytes.length, c.aadBytesLength);
  is(`${c.name}: id`, built.id, c.id);
  is(`${c.name}: id is SHA-256 of the bytes`, sha256hex(built.bytes), c.id);

  // The committed bytes really are RFC 8785 canonical: canonicalizing the
  // header must reproduce them, which is the property a second implementation
  // has to match.
  is(`${c.name}: bytes are RFC 8785 canonical`, canonicalBytes(c.header).toString('utf8'), c.aadBytesUtf8);

  // §5.6's rebuild, from chunk 0's hdr and the topic the chunk arrived on.
  is(`${c.name}: §5.6 rebuild`, rebuildAad(c.hdr, c.lane).id, c.id);
  ok(`${c.name}: binds to its own lane`, bindsTo(c.hdr, c.lane, c.id));
  // And does not bind to another. This is P-1's first weld, and it is worth
  // one assertion that the check is capable of failing.
  ok(`${c.name}: does not bind to another lane`, !bindsTo(c.hdr, '0.0.999999', c.id));
}

// --- T-P1-5: sealing. --------------------------------------------------------
is('seal.json kem_id', sealDoc.suite.kemId, 0x0020);
is('seal.json kdf_id', sealDoc.suite.kdfId, 0x0001);
is('seal.json aead_id', sealDoc.suite.aeadId, 0x0002);
is('seal.json info', sealDoc.suite.info, 'wishmail/0.5/seal');

const skR = privateFromRaw(Buffer.from(sealDoc.recipient.skRm, 'hex'));
is(
  'the recipient public key is the one its private key derives',
  rawPublic(createPublicKey(skR)).toString('hex'),
  sealDoc.recipient.pkRm,
);
is(
  'x25519Pub is pkRm in base64url',
  Buffer.from(sealDoc.recipient.x25519Pub, 'base64url').toString('hex'),
  sealDoc.recipient.pkRm,
);

// D-151's enforcement, checked here as well as in the generator: no key in the
// vectors is a key the deployment holds.
const recordPath = path.join(root, 'app', 'deployment', 'hedera-testnet.json');
if (fs.existsSync(recordPath)) {
  const record = fs.readFileSync(recordPath, 'utf8').toLowerCase();
  ok('skRm appears in no deployment record', !record.includes(sealDoc.recipient.skRm.toLowerCase()));
  ok('pkRm appears in no deployment record', !record.includes(sealDoc.recipient.pkRm.toLowerCase()));
}

const aadById = new Map(aadDoc.cases.map((c) => [c.id, c]));

for (const c of sealDoc.cases) {
  const aad = Buffer.from(c.aadHex, 'hex');
  const ct = Buffer.from(c.ciphertextHex, 'hex');

  // The seal is bound to the AAD of §7.2 for the same fixture, which is the
  // whole of "the resolution proof lives inside the AAD".
  const paired = aadById.get(c.id);
  ok(`${c.name}: its id is an id aad.json gives`, paired !== undefined);
  if (paired !== undefined) is(`${c.name}: aad bytes match aad.json`, c.aadHex, paired.aadBytesHex);

  is(`${c.name}: encHex is ephemeralPub`, Buffer.from(c.ephemeralPub, 'base64url').toString('hex'), c.encHex);
  is(`${c.name}: enc is 32 bytes`, Buffer.from(c.encHex, 'hex').length, 32);
  is(`${c.name}: ciphertextBytes`, ct.length, c.ciphertextBytes);
  is(`${c.name}: ciphertextDigest`, sha256hex(ct), c.ciphertextDigest);
  is(`${c.name}: weight (§7.5)`, weightOf(ct.length), c.weight);

  // The committed ciphertext opens to the committed plaintext.
  is(`${c.name}: opens`, open(c.ephemeralPub, skR, aad, ct).toString('hex'), c.plaintextHex);

  // And fails closed on the AAD, which is what P-1 rests on.
  checked += 1;
  const wrongAad = Buffer.from(aad);
  wrongAad[wrongAad.length - 2] = (wrongAad[wrongAad.length - 2] ?? 0) ^ 0x01;
  try {
    open(c.ephemeralPub, skR, wrongAad, ct);
    failures.push(`${c.name}: opened under an altered AAD, and must not have`);
  } catch {
    /* failing closed is the pass */
  }

  // The reverse direction the reference can do on its own: seal the same
  // plaintext afresh under the same AAD and open it. A different ephemeral key
  // every time, so a different ciphertext — which is why the vectors are frozen
  // rather than regenerated.
  const fresh = seal(sealDoc.recipient.x25519Pub, aad, Buffer.from(c.plaintextHex, 'hex'));
  is(
    `${c.name}: a fresh seal opens to the same plaintext`,
    open(fresh.ephemeralPub, skR, aad, fresh.ciphertext).toString('hex'),
    c.plaintextHex,
  );
  ok(`${c.name}: a fresh seal is a different ciphertext`, fresh.ciphertext.toString('hex') !== c.ciphertextHex);
}

if (failures.length > 0) {
  console.error(`check:vectors FAILED — ${failures.length} of ${checked} assertions:`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log(
  `check:vectors PASS — ${checked} assertions over ${aadDoc.cases.length} AAD and ${sealDoc.cases.length} seal ` +
    'vectors, every value recomputed from the committed header fields. ' +
    'T-P1-5’s independent implementation is the conformance suite’s and does not exist yet.',
);
