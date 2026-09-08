/**
 * The A.1 court: `npm run check:seal`.
 *
 * `hpke.ts` composes RFC 9180 base mode rather than depending on a library, and
 * the whole warrant for that (in `app/OPERATIONS.md`) is that an official vector
 * stands behind almost all of it. This is where that is cashed. It runs the
 * same functions `seal.ts` seals with, parameterised to RFC 9180 Appendix A.1's
 * ciphersuite, and asserts every published value.
 *
 * What this reaches: DeriveKeyPair, the DHKEM encapsulation and its shared
 * secret, the whole key schedule, and the sequence-0 AEAD in both directions.
 * What it cannot reach, because the RFC publishes no vector for §7.3's suite:
 * `aead_id` 0x0002 in the key schedule's `suite_id`, and a 32-byte AES key.
 * That remainder is `spec/vectors/seal.json`'s, opened by the independent
 * implementation T-P1-5 requires.
 *
 * It also checks the two things a vector cannot: that a tampered ciphertext
 * fails closed, and that a small-order public key is refused rather than
 * silently yielding an attacker-chosen shared secret (RFC 9180 §7.1.4).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RFC9180_A1_SUITE,
  WISHMAIL_SUITE,
  decap,
  deriveKeyPair,
  encap,
  generateKeyPair,
  keySchedule,
  nonceFor,
  openBase,
  publicFromRaw,
  rawPrivate,
  rawPublic,
  sealBase,
} from './hpke.js';

interface Vector {
  readonly mode: number;
  readonly kem_id: number;
  readonly kdf_id: number;
  readonly aead_id: number;
  readonly info: string;
  readonly ikmE: string;
  readonly pkEm: string;
  readonly skEm: string;
  readonly ikmR: string;
  readonly pkRm: string;
  readonly skRm: string;
  readonly enc: string;
  readonly shared_secret: string;
  readonly key_schedule_context: string;
  readonly secret: string;
  readonly key: string;
  readonly base_nonce: string;
  readonly exporter_secret: string;
  readonly encryption0: { readonly pt: string; readonly aad: string; readonly nonce: string; readonly ct: string };
  readonly section: string;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const v = JSON.parse(fs.readFileSync(path.join(here, 'rfc9180-a1.json'), 'utf8')) as Vector;

const hex = (b: Buffer): string => b.toString('hex');
const bin = (s: string): Buffer => Buffer.from(s, 'hex');

const failures: string[] = [];
let checked = 0;

function is(name: string, got: string, want: string): void {
  checked += 1;
  if (got !== want) failures.push(`${name}\n    got   ${got}\n    want  ${want}`);
}

function ok(name: string, condition: boolean): void {
  checked += 1;
  if (!condition) failures.push(name);
}

// --- The suite the vector declares is the suite we run it at. ---------------
is('kem_id', String(RFC9180_A1_SUITE.kemId), String(v.kem_id));
is('kdf_id', String(RFC9180_A1_SUITE.kdfId), String(v.kdf_id));
is('aead_id', String(RFC9180_A1_SUITE.aeadId), String(v.aead_id));
is('mode', '0', String(v.mode));

// --- DeriveKeyPair (§7.1.3). ------------------------------------------------
const e = deriveKeyPair(RFC9180_A1_SUITE, bin(v.ikmE));
is('DeriveKeyPair(ikmE).skEm', hex(rawPrivate(e.privateKey)), v.skEm);
is('DeriveKeyPair(ikmE).pkEm', hex(rawPublic(e.publicKey)), v.pkEm);

const r = deriveKeyPair(RFC9180_A1_SUITE, bin(v.ikmR));
is('DeriveKeyPair(ikmR).skRm', hex(rawPrivate(r.privateKey)), v.skRm);
is('DeriveKeyPair(ikmR).pkRm', hex(rawPublic(r.publicKey)), v.pkRm);

// --- DHKEM Encap / Decap (§4.1). -------------------------------------------
const encapsulated = encap(RFC9180_A1_SUITE, r.publicKey, e);
is('Encap.enc', hex(encapsulated.enc), v.enc);
is('Encap.shared_secret', hex(encapsulated.sharedSecret), v.shared_secret);
is('Decap.shared_secret', hex(decap(RFC9180_A1_SUITE, bin(v.enc), r.privateKey)), v.shared_secret);

// --- KeySchedule (§5.1). ----------------------------------------------------
const ks = keySchedule(RFC9180_A1_SUITE, bin(v.shared_secret), bin(v.info));
is('KeySchedule.key_schedule_context', hex(ks.keyScheduleContext), v.key_schedule_context);
is('KeySchedule.secret', hex(ks.secret), v.secret);
is('KeySchedule.key', hex(ks.key), v.key);
is('KeySchedule.base_nonce', hex(ks.baseNonce), v.base_nonce);
is('KeySchedule.exporter_secret', hex(ks.exporterSecret), v.exporter_secret);
is('nonce at sequence 0', hex(nonceFor(ks.baseNonce, 0)), v.encryption0.nonce);

// --- SealBase / OpenBase at sequence 0 (§6.1). ------------------------------
const sealed = sealBase(
  RFC9180_A1_SUITE,
  r.publicKey,
  bin(v.info),
  bin(v.encryption0.aad),
  bin(v.encryption0.pt),
  e,
);
is('SealBase.enc', hex(sealed.enc), v.enc);
is('SealBase.ct', hex(sealed.ct), v.encryption0.ct);

const opened = openBase(
  RFC9180_A1_SUITE,
  bin(v.enc),
  r.privateKey,
  bin(v.info),
  bin(v.encryption0.aad),
  bin(v.encryption0.ct),
);
is('OpenBase.pt', hex(opened), v.encryption0.pt);

// --- What no vector can say: it must fail closed. ---------------------------
function refuses(what: string, f: () => unknown): void {
  checked += 1;
  try {
    f();
    failures.push(`${what} — accepted, and must not have`);
  } catch {
    /* refusing is the pass */
  }
}

const tampered = Buffer.from(bin(v.encryption0.ct));
tampered[0] = (tampered[0] ?? 0) ^ 0x01;
refuses('a flipped ciphertext bit', () =>
  openBase(RFC9180_A1_SUITE, bin(v.enc), r.privateKey, bin(v.info), bin(v.encryption0.aad), tampered),
);

refuses('a changed aad', () =>
  openBase(
    RFC9180_A1_SUITE,
    bin(v.enc),
    r.privateKey,
    bin(v.info),
    Buffer.from('Count-1', 'ascii'),
    bin(v.encryption0.ct),
  ),
);

refuses('a changed info', () =>
  openBase(
    RFC9180_A1_SUITE,
    bin(v.enc),
    r.privateKey,
    Buffer.from('not the info string', 'ascii'),
    bin(v.encryption0.aad),
    bin(v.encryption0.ct),
  ),
);

// RFC 7748's small-order point: an all-zero X25519 public key.
refuses('a small-order public key', () =>
  encap(RFC9180_A1_SUITE, publicFromRaw(Buffer.alloc(32)), e),
);

// --- §7.3's own suite: a round trip, and the shapes §5.5 records. -----------
const wm = generateKeyPair();
const info = Buffer.from('wishmail/0.5/seal', 'ascii');
const aad = Buffer.from('{"l":"hedera:testnet"}', 'utf8');
const payload = Buffer.from('a letter', 'utf8');
const s = sealBase(WISHMAIL_SUITE, wm.publicKey, info, aad, payload);
ok('§7.3 enc is 32 bytes', s.enc.length === 32);
ok('§7.3 ct is the payload plus a 16-byte tag', s.ct.length === payload.length + 16);
is(
  '§7.3 round trip',
  openBase(WISHMAIL_SUITE, s.enc, wm.privateKey, info, aad, s.ct).toString('utf8'),
  'a letter',
);
refuses('§7.3 opening under a different aad', () =>
  openBase(WISHMAIL_SUITE, s.enc, wm.privateKey, info, Buffer.from('other', 'utf8'), s.ct),
);

// --- Report. ----------------------------------------------------------------
if (failures.length > 0) {
  console.error(`check:seal FAILED — ${failures.length} of ${checked} assertions:`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log(
  `check:seal PASS — ${checked} assertions against RFC 9180 Appendix A.1 ` +
    `(${v.section ?? 'A.1.1'}), plus §7.3's own round trip and its fail-closed cases.`,
);
