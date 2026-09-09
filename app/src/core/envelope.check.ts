/**
 * `npm run check:envelope` — a letter assembled, validated against the
 * registered schemas, walked back by the reader, and opened.
 *
 * This is the CLAUDE.md §9 rule run as a program. Every earlier module has its
 * own court — the AAD against `spec/vectors/aad.json`, the seal against RFC
 * 9180's A.1, the chain against §11.3's worked example — and each of those can
 * pass on an envelope no recipient can open, because none of them is the rule
 * that reads the whole thing. Here the writer's output goes through the reader:
 * the Chunk schema, the Envelope schema, the reassembly walk, the AAD rebuild,
 * and the HPKE open, in that order, with the payload compared byte for byte at
 * the end.
 *
 * Nothing here touches a network and nothing here signs. It is what must pass
 * before `send` is allowed to submit anything.
 *
 * Conformance (reference side): T-P1-4, T-P1-11, T-P7-3, T-P9-3, T-P9-7,
 * T-P9-11, T-P10-1.
 */
import { randomBytes } from 'node:crypto';
import { bindsTo } from './aad.js';
import { b64u, unb64u } from './canonical.js';
import { CHUNK_WIRE_MAX, messageOperation, reassemble, wireSize, type Chunk, type ChunkHeader, type ObservedChunk } from './chunk.js';
import {
  affix,
  ciphertextOf,
  envelopeIdOfMemo,
  headerPostage,
  headerWeightAgrees,
  recoverEnvelope,
  sealEnvelope,
  settlementMemo,
  type AssemblyInput,
} from './envelope.js';
import { isToolFailure } from './failure.js';
import { generateRecipientKey, open } from './seal.js';
import { repoRoot } from '../ops/env.js';
import { schemas } from '../schema/loader.js';

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
/**
 * A refusal is a pass. Where §6 names a code for the condition, the code is
 * given and checked; where it names none — a malformed argument no tool input
 * can carry — `reason` is omitted, because inventing a `TOOL_REASON` for it
 * would be inventing a failure §6 does not fix.
 */
function refuses(name: string, f: () => unknown, reason?: string): void {
  checked += 1;
  try {
    f();
    failures.push(`${name} — accepted, and must not have`);
    return;
  } catch (e) {
    if (reason === undefined) return;
    if (!isToolFailure(e)) failures.push(`${name} — threw ${String(e)}, wanted the failure ${reason}`);
    else if (e.reason !== reason) failures.push(`${name} — refused as ${e.reason}, wanted ${reason}`);
  }
}

const registry = schemas(repoRoot());

// The recipient's key is born here and lives only in this process (P-13).
const recipient = generateRecipientKey();

const LANE = '0.0.7000042';
const OPERATOR = '0.0.10426553@0.0.10426206';
const SETTLEMENT = '0.0.10426206@1788894030.895915675';
const PROOF_HASH = 'f'.repeat(64);
const SCHEMA_REF = 'hcs://13/0.0.10428113#1';
const MANIFEST = { ledgerTag: 'hedera:testnet', topicId: '0.0.10426591', sequenceNumber: 7 } as const;

function inputFor(payload: Buffer, returnReceipt = false): AssemblyInput {
  return {
    ledgerTag: 'hedera:testnet',
    lane: LANE,
    profile: 'hcs14',
    resolutionProof: { hash: PROOF_HASH, uri: MANIFEST },
    recipientX25519Pub: recipient.x25519Pub,
    keyEpoch: 1,
    payload,
    returnReceipt,
    schemaRef: SCHEMA_REF,
    operatorId: OPERATOR,
  };
}

// --- The letter, end to end, offline. ---------------------------------------
const PAYLOAD = Buffer.from(
  'The postal service does not read the letter. It carries it, marks when it was posted, and can say so afterwards.',
  'utf8',
);

const sealed = sealEnvelope(inputFor(PAYLOAD, true));
const assembled = affix(sealed, SETTLEMENT);

is('the identifier is the AAD hash', sealed.id.length, 64);
is('the settlement memo is wishmail: + the identifier', sealed.memo, settlementMemo(sealed.id));
is('and a reader recovers the identifier from that memo', envelopeIdOfMemo(sealed.memo), sealed.id);
is('a memo naming no envelope yields null', envelopeIdOfMemo('hello'), 'null');
is('the weight is one ounce for a short letter (§7.5)', sealed.weight, 1);
is('the postage is weight + 1 with a receipt requested (§7.5)', sealed.postage, 2);
is('and the header agrees with it', headerPostage(assembled.header), 2);
ok('the header’s weight is the one §7.5 computes from its own size', headerWeightAgrees(assembled.header));

// --- Every chunk validates against the REGISTERED Chunk schema. -------------
for (const c of assembled.chunks) {
  const errors = registry.validate('chunk', c);
  ok(`chunk ${c.i} validates against the Chunk schema (T-P9-3)${errors.length ? `: ${errors.join('; ')}` : ''}`, errors.length === 0);
  ok(`chunk ${c.i} is within CHUNK_WIRE_MAX (T-P9-7)`, wireSize(c, OPERATOR) <= CHUNK_WIRE_MAX);
  ok(`chunk ${c.i}'s operation carries no chunkInfo (T-P9-7)`, !('chunkInfo' in messageOperation(c, OPERATOR)));
}

// --- The Envelope validates against the REGISTERED Envelope schema. ---------
{
  const errors = registry.validate('envelope', assembled.envelope);
  ok(`the assembled Envelope validates (§5.5)${errors.length ? `: ${errors.join('; ')}` : ''}`, errors.length === 0);
}

// --- The reader, on the writer's output. ------------------------------------
let clock = 1788900000;
const observe = (chunk: Chunk, operatorId = OPERATOR): ObservedChunk => {
  clock += 1;
  return { chunk, sequenceNumber: clock - 1788900000, consensusTimestamp: `${clock}.000000000`, operatorId };
};

const binds = (h: ChunkHeader): boolean => bindsTo(h, LANE, sealed.id);
const walked = reassemble(assembled.chunks.map((c) => observe(c)), sealed.id, binds);

is('the walk is complete', walked.state, 'complete');
is('and yields the ciphertext the seal produced', walked.ciphertext?.toString('hex'), sealed.ciphertext.toString('hex'));
is('the concatenation helper agrees', ciphertextOf(walked.chain.map((o) => o.chunk)).toString('hex'), sealed.ciphertext.toString('hex'));

const recovered = recoverEnvelope(walked.chain[0]?.chunk as Chunk, LANE);
ok('the recovered header rebuilds to the identifier (P-1, first weld)', recovered.bound);
is('and the recovered envelope is the assembled one, field for field', JSON.stringify(recovered.envelope), JSON.stringify(assembled.envelope));
{
  const errors = registry.validate('envelope', recovered.envelope);
  ok(`the RECOVERED Envelope validates too${errors.length ? `: ${errors.join('; ')}` : ''}`, errors.length === 0);
}

// The open: the payload, byte for byte, against the AAD the reader rebuilt.
const opened = open(
  recovered.envelope.ephemeralPub,
  recipient.keyPair.privateKey,
  unb64u(recovered.envelope.aad),
  walked.ciphertext as Buffer,
);
is('the payload opens byte for byte', opened.toString('hex'), PAYLOAD.toString('hex'));

// --- Every way the reader must refuse. ---------------------------------------
// Each alteration is of a header field, on a copy, with everything else intact.
const alterations: readonly { readonly name: string; readonly header: ChunkHeader }[] = [
  { name: 'the nonce', header: { ...assembled.header, nc: b64u(randomBytes(16)) } },
  { name: 'the resolution proof’s hash', header: { ...assembled.header, rp: { ...assembled.header.rp, h: 'a'.repeat(64) } } },
  { name: 'the ledger tag', header: { ...assembled.header, l: 'hedera:mainnet' } },
];
for (const { name, header } of alterations) {
  const zero: Chunk = { ...(assembled.chunks[0] as Chunk), hdr: header };
  const r = reassemble([observe(zero), ...assembled.chunks.slice(1).map((c) => observe(c))], sealed.id, binds);
  is(`an altered ${name} leaves the envelope unrooted (T-P1-1)`, r.state, 'unrooted');
  ok(`and the recovery says it does not bind`, !recoverEnvelope(zero, LANE).bound);
}

// The lane is not in the chunk: it is the topic the chunk arrived on. An
// envelope read off any other topic does not bind (T-P10-1).
ok('the same chunk 0 on another lane does not bind (T-P10-1)', !recoverEnvelope(assembled.chunks[0] as Chunk, '0.0.7000043').bound);

// A header whose `ep` is swapped still rebuilds — `ep` is not in the AAD — and
// that is exactly why the open has to fail closed instead (§7.3).
{
  const other = generateRecipientKey();
  const swapped: ChunkHeader = { ...assembled.header, ep: sealEnvelope(inputFor(PAYLOAD)).ephemeralPub };
  const zero: Chunk = { ...(assembled.chunks[0] as Chunk), hdr: swapped };
  ok('a swapped ephemeral key still rebuilds to the identifier — it is not in the AAD', recoverEnvelope(zero, LANE).bound);
  checked += 1;
  try {
    open(swapped.ep, recipient.keyPair.privateKey, sealed.aad, sealed.ciphertext);
    failures.push('a swapped ephemeral key opened, and must not have (§7.3 fails closed)');
  } catch {
    /* failing closed is the pass */
  }
  checked += 1;
  try {
    open(recovered.envelope.ephemeralPub, other.keyPair.privateKey, sealed.aad, sealed.ciphertext);
    failures.push('another recipient’s key opened the envelope');
  } catch {
    /* failing closed is the pass */
  }
}

// An altered AAD fails the open even where the ciphertext is untouched: the AAD
// is authenticated data, which is the whole of why the weld holds.
checked += 1;
try {
  const tampered = Buffer.from(sealed.aad);
  tampered[tampered.length - 3] = (tampered[tampered.length - 3] as number) ^ 0x01;
  open(recovered.envelope.ephemeralPub, recipient.keyPair.privateKey, tampered, sealed.ciphertext);
  failures.push('an altered AAD opened, and must not have (§7.2, §7.3)');
} catch {
  /* failing closed is the pass */
}

// --- What assembly itself refuses. -------------------------------------------
refuses('a ledger tag no ledger is defined for (T-P9-11)', () =>
  sealEnvelope({ ...inputFor(PAYLOAD), ledgerTag: 'ethereum:1' }),
);
refuses(
  'a payload past MAX_WEIGHT (§7.5)',
  () => sealEnvelope(inputFor(randomBytes(16 * 4096 + 1))),
  'SEND_TOO_HEAVY',
);
ok('but a payload at exactly MAX_WEIGHT assembles', sealEnvelope(inputFor(randomBytes(16 * 4096 - 16))).weight === 16);
refuses('a settlement reference that is not one', () => affix(sealed, '0.0.10426206'));

// A header that lies about its weight is short postage dressed as correct
// postage; the reader is what says so (§11.4).
ok('a header claiming a lighter weight than its size does not agree', !headerWeightAgrees({ ...assembled.header, w: 1, cb: 9000 }));

// --- A multi-chunk letter, because one chunk hides the chain. ---------------
{
  const long = randomBytes(6000);
  const s2 = sealEnvelope(inputFor(long));
  const a2 = affix(s2, SETTLEMENT);
  ok('a 6 kB payload takes several chunks', a2.chunks.length > 3);
  is('and its weight is two ounces', a2.envelope.weight, 2);
  for (const c of a2.chunks) {
    ok(`long chunk ${c.i} validates`, registry.validate('chunk', c).length === 0);
  }
  const r2 = reassemble(
    [...a2.chunks].reverse().map((c) => observe(c)),
    s2.id,
    (h) => bindsTo(h, LANE, s2.id),
  );
  is('chunks that reach consensus in reverse order still reassemble (§7.4)', r2.state, 'complete');
  const o2 = open(a2.envelope.ephemeralPub, recipient.keyPair.privateKey, unb64u(a2.envelope.aad), r2.ciphertext as Buffer);
  is('and the long payload opens byte for byte', o2.toString('hex'), long.toString('hex'));
}

if (failures.length > 0) {
  console.error(`check:envelope FAILED — ${failures.length} of ${checked} assertions:`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log(
  `check:envelope PASS — ${checked} assertions: a letter assembled, every chunk and the envelope validated against ` +
    'the registered schemas, the chain walked back, the header rebuilt to the identifier, the payload opened byte ' +
    'for byte, and every alteration refused — a nonce, a proof hash, a ledger tag, the wrong lane, a swapped ' +
    'ephemeral key, another recipient’s key, and a flipped bit in the AAD.',
);
