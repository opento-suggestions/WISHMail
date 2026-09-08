/**
 * The generator for `spec/vectors/aad.json` and `spec/vectors/seal.json`.
 *
 * T-P1-4: "`spec/vectors/aad.json` gives header fields, AAD bytes, and `id` for
 * fixture envelopes, and every class recomputes them exactly."
 * T-P1-5: "`spec/vectors/seal.json` gives HPKE test vectors for fixture
 * envelopes; the reference seals and an independent implementation opens, and
 * the reverse."
 *
 * The vectors are FROZEN, not regenerated. HPKE base mode draws a fresh
 * ephemeral key for every seal (§7.3), so a second run produces a different
 * `enc` and a different ciphertext — both correct, neither equal to the first.
 * That is not a problem for T-P1-5, which wants a committed artefact that an
 * outside implementation can open and can seal against, and it would be a
 * problem for a court that changed under it. So this refuses to overwrite an
 * existing file unless `--regenerate` is passed deliberately, and a regenerated
 * `seal.json` is a new court, which is a decision and not a chore.
 *
 * D-151 governs the key material. The recipient private key is in the file,
 * because without it nothing can open what the reference sealed. It is born
 * here for the vector, bound to no account, topic or epoch, and this refuses to
 * emit any key that appears in `app/deployment/hedera-testnet.json`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { AAD_VERSION, buildAad, rebuildAad } from '../core/aad.js';
import { b64u, sha256hex } from '../core/canonical.js';
import { WISHMAIL_SUITE, rawPrivate, rawPublic } from '../core/hpke.js';
import { SEAL_INFO, generateRecipientKey, open, seal, weightOf } from '../core/seal.js';
import { repoRoot } from '../ops/env.js';

const root = repoRoot();
const vectorsDir = path.join(root, 'spec', 'vectors');
const regenerate = process.argv.includes('--regenerate');

/**
 * D-151's enforcement: no key this emits may be a key the deployment holds.
 * The ops record carries public halves only, which is exactly what makes the
 * check possible without any secret being read.
 */
function refuseDeploymentKeys(candidates: readonly string[]): void {
  const recordPath = path.join(root, 'app', 'deployment', 'hedera-testnet.json');
  if (!fs.existsSync(recordPath)) return;
  const text = fs.readFileSync(recordPath, 'utf8').toLowerCase();
  for (const c of candidates) {
    if (c.length >= 32 && text.includes(c.toLowerCase())) {
      throw new Error(
        `refusing to write a vector: ${c.slice(0, 16)}… appears in app/deployment/hedera-testnet.json (D-151)`,
      );
    }
  }
}

/**
 * The fixtures. The lane and proof identifiers are well-formed and synthetic:
 * no lane exists yet, and a vector for §7.2 needs no lane to exist — the AAD is
 * a function of its six fields and nothing else. They are fixed literals rather
 * than random, so that a reader can see that two vectors differ only where they
 * are meant to.
 */
const FIXTURES = [
  {
    name: 'testnet-minimal',
    note: 'The ordinary case: one lane, one proof, a fresh nonce.',
    ledgerTag: 'hedera:testnet',
    lane: '0.0.7000001',
    resolutionProofHash: sha256hex(Buffer.from('wishmail vector resolution proof 1', 'utf8')),
    payload: 'Beauty is truth, truth beauty',
  },
  {
    name: 'testnet-multichunk',
    note: 'A payload past one chunk, so that a reader has a ciphertext to slice (§7.4).',
    ledgerTag: 'hedera:testnet',
    lane: '0.0.7000002',
    resolutionProofHash: sha256hex(Buffer.from('wishmail vector resolution proof 2', 'utf8')),
    payload: 'x'.repeat(2048),
  },
  {
    name: 'mainnet-tag',
    note: 'The other ledger tag §5.1 defines, so the tag is visibly part of the identifier.',
    ledgerTag: 'hedera:mainnet',
    lane: '0.0.7000003',
    resolutionProofHash: sha256hex(Buffer.from('wishmail vector resolution proof 3', 'utf8')),
    payload: 'Beauty is truth, truth beauty',
  },
] as const;

const AAD_README =
  'Vectors for WISHMAIL_SPEC_v0_5.md §7.2 — the AAD and the envelope identifier. ' +
  'T-P1-4: every class recomputes `bytes` and `id` from `header` exactly. ' +
  'The key names are §7.2’s six and no others (D-127); `bytes` is their RFC 8785 canonical JSON, ' +
  'which sorts them l, lane, nc, p, rp, v whatever order they are written in; `id` is SHA-256 over `bytes`, ' +
  'lowercase hex. `rebuild` is §5.6’s other direction: a reader with chunk 0’s `hdr` and the topic the ' +
  'chunk arrived on rebuilds the same bytes and so binds the header to the `id` every chunk carries. ' +
  'Lane and proof identifiers here are well-formed and synthetic — the AAD is a function of its six ' +
  'fields and of nothing on any ledger. Frozen; regenerating is a decision, not a chore.';

const SEAL_README =
  'Vectors for WISHMAIL_SPEC_v0_5.md §7.3 — HPKE sealing. ' +
  'T-P1-5: the reference seals and an independent implementation opens, and the reverse. ' +
  'Ciphersuite: DHKEM(X25519, HKDF-SHA256), HKDF-SHA256, AES-256-GCM — IDs 0x0020 / 0x0001 / 0x0002 — ' +
  'base mode, single-shot, `info` the ASCII "wishmail/0.5/seal", `aad` the AAD bytes of §7.2. ' +
  'RFC 9180 publishes NO test vector for this ciphersuite (Appendix A stops at A.1, the same KEM and KDF ' +
  'with AES-128-GCM), which is why this file exists and why the reference is checked against A.1 separately ' +
  '(app/src/core/rfc9180-a1.json, npm run check:seal). ' +
  'ABOUT THE PRIVATE KEY: `recipient.skRm` is here because without it nothing can open what the reference ' +
  'sealed, exactly as RFC 9180 publishes `skRm` beside its own vectors. It was born for this vector. It is ' +
  'bound to no account, no topic and no key epoch; it opens nothing that was ever sent; and no agent this ' +
  'deployment provisioned holds it or ever will. P-13 forbids the private key of an AGENT (§12.2), and this ' +
  'is not one — see spec/adr/D-151.md. The generator refuses to emit any key that appears in ' +
  'app/deployment/hedera-testnet.json. Frozen; regenerating is a decision, not a chore.';

function build(): { aad: unknown; seal: unknown } {
  const recipient = generateRecipientKey();
  const skRm = rawPrivate(recipient.keyPair.privateKey).toString('hex');
  const pkRm = rawPublic(recipient.keyPair.publicKey).toString('hex');
  refuseDeploymentKeys([skRm, pkRm]);

  const aadCases: unknown[] = [];
  const sealCases: unknown[] = [];

  for (const f of FIXTURES) {
    const nonce = b64u(randomBytes(16));
    const a = buildAad({
      ledgerTag: f.ledgerTag,
      lane: f.lane,
      resolutionProofHash: f.resolutionProofHash,
      nonce,
    });

    // §5.6's rebuild must land on the same identifier, from the header a chunk
    // carries and the topic it arrived on. Asserted here so a vector that did
    // not round-trip could never be written in the first place.
    const header = { l: f.ledgerTag, rp: { h: f.resolutionProofHash }, nc: nonce };
    const rebuilt = rebuildAad(header, f.lane);
    if (rebuilt.id !== a.id) throw new Error(`${f.name}: §5.6 rebuild does not reach the identifier`);

    aadCases.push({
      name: f.name,
      note: f.note,
      header: a.header,
      hdr: { ...header, note: 'chunk 0’s hdr fields that the AAD is rebuilt from (§5.6)' },
      lane: f.lane,
      aadBytesUtf8: a.bytes.toString('utf8'),
      aadBytesHex: a.bytes.toString('hex'),
      aadBytesLength: a.bytes.length,
      id: a.id,
    });

    const payload = Buffer.from(f.payload, 'utf8');
    const sealed = seal(recipient.x25519Pub, a.bytes, payload);

    // Open it back before it is written down. A vector nobody has opened is a
    // claim, not a court.
    const reopened = open(sealed.ephemeralPub, recipient.keyPair.privateKey, a.bytes, sealed.ciphertext);
    if (!reopened.equals(payload)) throw new Error(`${f.name}: the vector does not open`);

    sealCases.push({
      name: f.name,
      note: f.note,
      id: a.id,
      aadHex: a.bytes.toString('hex'),
      plaintextUtf8: f.payload,
      plaintextHex: payload.toString('hex'),
      ephemeralPub: sealed.ephemeralPub,
      encHex: Buffer.from(sealed.ephemeralPub, 'base64url').toString('hex'),
      ciphertextHex: sealed.ciphertext.toString('hex'),
      ciphertextDigest: sealed.ciphertextDigest,
      ciphertextBytes: sealed.ciphertextBytes,
      weight: weightOf(sealed.ciphertextBytes),
    });
  }

  return {
    aad: {
      _readme: AAD_README,
      spec: '0.5.3',
      wireVersion: AAD_VERSION,
      section: '§7.2, with §5.6’s rebuild',
      conformance: ['T-P1-4'],
      generated: new Date().toISOString().slice(0, 10),
      cases: aadCases,
    },
    seal: {
      _readme: SEAL_README,
      spec: '0.5.3',
      section: '§7.3',
      conformance: ['T-P1-5'],
      generated: new Date().toISOString().slice(0, 10),
      suite: {
        kem: 'DHKEM(X25519, HKDF-SHA256)',
        kemId: WISHMAIL_SUITE.kemId,
        kdf: 'HKDF-SHA256',
        kdfId: WISHMAIL_SUITE.kdfId,
        aead: 'AES-256-GCM',
        aeadId: WISHMAIL_SUITE.aeadId,
        mode: 'base',
        shot: 'single',
        info: SEAL_INFO.toString('ascii'),
        infoHex: SEAL_INFO.toString('hex'),
      },
      recipient: {
        note: 'Born for this vector. No agent’s key (D-151).',
        skRm,
        pkRm,
        x25519Pub: recipient.x25519Pub,
        keyEpoch: 1,
      },
      cases: sealCases,
    },
  };
}

function write(name: string, value: unknown): void {
  const file = path.join(vectorsDir, name);
  if (fs.existsSync(file) && !regenerate) {
    console.log(`  ${name} exists; left alone. Pass --regenerate to replace it (a new court).`);
    return;
  }
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  console.log(`  wrote ${name}`);
}

const built = build();
console.log(`vectors -> ${vectorsDir}`);
write('aad.json', built.aad);
write('seal.json', built.seal);
