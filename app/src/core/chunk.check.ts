/**
 * `npm run check:chunk` — the chunker's output walked by the reader, and every
 * way §11.3 says the walk must refuse.
 *
 * The round trip is the least of it. What matters is the adversarial half: a
 * lane is bidirectional and either party can submit under its threshold key, so
 * the chain has to hold against chunks that are well-formed, carry the right
 * identifier and index, and are not the sender's. §11.3's own worked example is
 * reproduced here as a case.
 *
 * These are the conditions T-P1-11 and T-P3-3 will test on fixtures. The suite's
 * files are still stubs; this is the reference side, run now, so that the
 * chunker is not the thing under suspicion when the fixtures land.
 */
import { randomBytes } from 'node:crypto';
import { b64u, sha256hex, unb64u } from './canonical.js';
import {
  CHUNK_WIRE_MAX,
  chunkCiphertext,
  messageOperation,
  reassemble,
  wireSize,
  type Chunk,
  type ChunkHeader,
  type ObservedChunk,
} from './chunk.js';

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
function refuses(name: string, f: () => unknown): void {
  checked += 1;
  try {
    f();
    failures.push(`${name} — accepted, and must not have`);
  } catch {
    /* refusing is the pass */
  }
}

const ID = 'a'.repeat(64);
const OPERATOR = '0.0.10426553@0.0.10426206';
const SCHEMA_REF = 'hcs://13/0.0.10428113#1';

function headerFor(ciphertext: Buffer): ChunkHeader {
  return {
    l: 'hedera:testnet',
    pr: 'hcs14',
    rp: { h: 'b'.repeat(64) },
    nc: b64u(randomBytes(16)),
    ke: 1,
    ep: b64u(randomBytes(32)),
    st: '0.0.8641261@1788894030.895915675',
    w: 1,
    h: sha256hex(ciphertext),
    cb: ciphertext.length,
    rr: false,
  };
}

let ts = 1788900000;
const observe = (chunk: Chunk, operatorId = OPERATOR): ObservedChunk => {
  ts += 1;
  return { chunk, sequenceNumber: ts - 1788900000, consensusTimestamp: `${ts}.000000000`, operatorId };
};

const binds = (h: ChunkHeader): boolean => h.rp.h === 'b'.repeat(64) && h.l === 'hedera:testnet';

// --- One chunk, many chunks, and the wire bound. -----------------------------
for (const size of [1, 100, 170, 512, 2048, 16384, 65536]) {
  const ct = randomBytes(size);
  const chunks = chunkCiphertext({ id: ID, schemaRef: SCHEMA_REF, ciphertext: ct, header: headerFor(ct), operatorId: OPERATOR });

  ok(`${size}B: every message is within CHUNK_WIRE_MAX`, chunks.every((c) => wireSize(c, OPERATOR) <= CHUNK_WIRE_MAX));
  ok(`${size}B: no message carries chunkInfo (T-P9-7)`, chunks.every((c) => !('chunkInfo' in messageOperation(c, OPERATOR))));
  ok(`${size}B: data parses as a Chunk (T-P9-7)`, chunks.every((c) => {
    const parsed = JSON.parse(messageOperation(c, OPERATOR)['data'] as string) as Chunk;
    return parsed.p === 'wishmail' && parsed.id === ID && typeof parsed.d === 'string';
  }));
  is(`${size}B: n is the chunk count`, chunks.every((c) => c.n === chunks.length), true);
  is(`${size}B: indices are 0..n-1 in order`, chunks.map((c) => c.i).join(','), chunks.map((_, i) => i).join(','));
  is(`${size}B: hdr is on chunk 0 and only chunk 0`, chunks.filter((c) => c.hdr !== undefined).map((c) => c.i).join(','), '0');
  is(`${size}B: only the last chunk omits nx (T-P1-11)`, chunks.filter((c) => c.nx === undefined).map((c) => c.i).join(','), String(chunks.length - 1));
  ok(`${size}B: each nx is the next slice's digest`, chunks.every((c, i) => i === chunks.length - 1 || c.nx === sha256hex(unb64u((chunks[i + 1] as Chunk).d))));

  const r = reassemble(chunks.map((c) => observe(c)), ID, binds);
  is(`${size}B: reassembles complete`, r.state, 'complete');
  is(`${size}B: and to the same ciphertext`, r.ciphertext?.toString('hex'), ct.toString('hex'));
  is(`${size}B: nothing off-chain`, r.offChain.length, 0);
}

// The informative figures of §7.4, as this wrapper actually lands them.
{
  const ct = randomBytes(4096);
  const chunks = chunkCiphertext({ id: ID, schemaRef: SCHEMA_REF, ciphertext: ct, header: headerFor(ct), operatorId: OPERATOR });
  const payload = (c: Chunk): number => unb64u(c.d).length;
  console.log(
    `  slice sizes with this wrapper: chunk 0 ${payload(chunks[0] as Chunk)}B · ` +
      `middle ${payload(chunks[1] as Chunk)}B · last ${payload(chunks[chunks.length - 1] as Chunk)}B ` +
      `(§7.4's informative figures are ~170 / ~510 / ~565 at mainnet-length ids)`,
  );
}

// --- §11.3's worked example, reproduced. -------------------------------------
{
  const ct = randomBytes(1400);
  const chunks = chunkCiphertext({ id: ID, schemaRef: SCHEMA_REF, ciphertext: ct, header: headerFor(ct), operatorId: OPERATOR });
  ok('the example needs at least three chunks', chunks.length >= 3);

  const foreign: Chunk = { ...(chunks[1] as Chunk), d: b64u(randomBytes(unb64u((chunks[1] as Chunk).d).length)) };

  // Order on the lane: canonical 0, a FOREIGN chunk 1 landing FIRST, the
  // sender's chunk 1, chunk 2, then a byte-identical duplicate of chunk 1.
  const lane = [
    observe(chunks[0] as Chunk),
    observe(foreign, '0.0.999999@0.0.999999'),
    observe(chunks[1] as Chunk),
    ...chunks.slice(2).map((c) => observe(c)),
    observe(chunks[1] as Chunk),
  ];

  const r = reassemble(lane, ID, binds);
  is('§11.3 example: complete', r.state, 'complete');
  is('§11.3 example: the sender’s chunk is canonical though the foreign one landed first (T-P1-11)', r.ciphertext?.toString('hex'), ct.toString('hex'));
  is('§11.3 example: the foreign chunk is recorded off-chain, not used', r.offChain.length, 1);
  is('§11.3 example: and it is the foreign one', r.offChain[0]?.chunk.d, foreign.d);
  is('§11.3 example: the repeat is recorded as a duplicate', r.duplicates.length, 1);
}

// --- Every way the walk must refuse. -----------------------------------------
{
  const ct = randomBytes(1400);
  const header = headerFor(ct);
  const chunks = chunkCiphertext({ id: ID, schemaRef: SCHEMA_REF, ciphertext: ct, header, operatorId: OPERATOR });

  // No chunk 0 at all.
  is('unrooted: without chunk 0', reassemble(chunks.slice(1).map((c) => observe(c)), ID, binds).state, 'unrooted');

  // A chunk 0 whose header does not rebuild to the identifier (P-1's first weld).
  const badHeader: Chunk = { ...(chunks[0] as Chunk), hdr: { ...header, rp: { h: 'c'.repeat(64) } } };
  is('unrooted: a chunk 0 whose header does not bind', reassemble([observe(badHeader), ...chunks.slice(1).map((c) => observe(c))], ID, binds).state, 'unrooted');

  // A missing middle link.
  const gapped = [chunks[0] as Chunk, ...chunks.slice(2)];
  const gap = reassemble(gapped.map((c) => observe(c)), ID, binds);
  is('partial: a missing link (F-4)', gap.state, 'partial');
  is('partial: the chain stops at the break', gap.chain.length, 1);

  // Complete, but the slices do not hash to hdr.h — unbound, and not opened.
  const lyingHeader = { ...header, h: 'd'.repeat(64) };
  const lying = chunkCiphertext({ id: ID, schemaRef: SCHEMA_REF, ciphertext: ct, header: lyingHeader, operatorId: OPERATOR });
  const bad = reassemble(lying.map((c) => observe(c)), ID, binds);
  is('complete but not intact: state', bad.state, 'complete');
  is('complete but not intact: integrityFailed', bad.integrityFailed, true);
  is('complete but not intact: NO ciphertext is handed back (T-P1-11)', bad.ciphertext, undefined);

  // A chunk carrying another envelope's identifier is not of this envelope.
  const otherId: Chunk = { ...(chunks[1] as Chunk), id: 'e'.repeat(64) };
  const mixed = reassemble([observe(chunks[0] as Chunk), observe(otherId), ...chunks.slice(1).map((c) => observe(c))], ID, binds);
  is('a foreign identifier is filtered out entirely', mixed.state, 'complete');
  is('and is not even recorded as off-chain for this envelope', mixed.offChain.length, 0);
}

// --- The chunker refuses what it must not emit. ------------------------------
refuses('an empty ciphertext', () =>
  chunkCiphertext({ id: ID, schemaRef: SCHEMA_REF, ciphertext: Buffer.alloc(0), header: headerFor(Buffer.alloc(0)), operatorId: OPERATOR }),
);
refuses('a schemaRef so long that no ciphertext byte fits', () =>
  chunkCiphertext({
    id: ID,
    schemaRef: 'x'.repeat(CHUNK_WIRE_MAX),
    ciphertext: randomBytes(10),
    header: headerFor(randomBytes(10)),
    operatorId: OPERATOR,
  }),
);

if (failures.length > 0) {
  console.error(`check:chunk FAILED — ${failures.length} of ${checked} assertions:`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log(
  `check:chunk PASS — ${checked} assertions: seven ciphertext sizes chunked and walked back, §11.3's worked ` +
    'example reproduced (the foreign chunk lands first and the sender’s is still canonical), and every refusal ' +
    'the walk owes — unrooted, unbound header, a broken link, and complete-but-not-intact handing back nothing.',
);
