/**
 * Chunking and reassembly — §7.4 out, §11.3 back.
 *
 * §7.4: "The ciphertext is sliced in order into chunks. Chunk 0 carries the
 * header (§5.6), including the digest of the whole ciphertext; every chunk
 * carries the identifier, its index, and the count; every chunk but the last
 * carries the digest of the next slice."
 *
 * The chain is the point. "Chunk 0's header is bound to `id` by the AAD, and no
 * party but the sender can produce a header that rebuilds to it. Chunk 0 commits
 * chunk 1's slice by digest; chunk 1 commits chunk 2's; and so on to the last. A
 * slice that the chunk before it did not commit is not of the envelope, whenever
 * and by whomever it was submitted." That is what makes reassembly "a
 * computation on bytes rather than on clocks" — either party to a lane can
 * submit under its threshold key, and the identifier is public from the
 * settlement's memo before any chunk lands.
 *
 * The writer and the reader are in this one file on purpose (CLAUDE.md §9): a
 * chunker whose output its own reader cannot walk is a chunker that produced
 * something well-formed and unreadable, and only the walk says so.
 *
 * Conformance: T-P9-7, T-P1-11, T-P3-3, T-P1-1.
 */
import { createHash } from 'node:crypto';
import { b64u, unb64u } from './canonical.js';
import type { MessageLocator } from './locator.js';

/** §7.4: the whole HCS-10 `message` operation, as UTF-8 JSON, at or under this. */
export const CHUNK_WIRE_MAX = 1000;

/** §5.6's `hdr`, chunk 0 only. */
export interface ChunkHeader {
  /** ledgerTag. */
  readonly l: string;
  /** profile. */
  readonly pr: string;
  /**
   * resolutionProof in the chunk's short keys: `h` is the hash, `u` the
   * structured locator of its manifest on the sender's manifest topic (§5.2).
   * Both are on the wire: the Chunk schema requires them, and §11.2's ingestion
   * reaches the sender's manifest topic by following `hdr.rp.u` and nothing
   * else. It is known before chunk 0 exists because §6.4 publishes the manifest
   * at step 2, before assembly at step 3.
   */
  readonly rp: { readonly h: string; readonly u: MessageLocator };
  /** nonce, base64url. */
  readonly nc: string;
  /** keyEpoch. */
  readonly ke: number;
  /** ephemeralPub, base64url. */
  readonly ep: string;
  /** settlementRef. */
  readonly st: string;
  /** weight, in stamps. */
  readonly w: number;
  /** ciphertextDigest, over the WHOLE ciphertext. */
  readonly h: string;
  /** ciphertextBytes. */
  readonly cb: number;
  /** return receipt requested (§7.7). */
  readonly rr: boolean;
}

/** §5.6, the value of HCS-10 `data`. */
export interface Chunk {
  readonly p: 'wishmail';
  /** schemaRef (§5.11). */
  readonly s: string;
  /** aadHash — the envelope identifier. */
  readonly id: string;
  readonly i: number;
  readonly n: number;
  /** this slice of ciphertext, base64url. */
  readonly d: string;
  /** SHA-256 of chunk i+1's slice. Absent on the last chunk, and only there. */
  readonly nx?: string;
  readonly hdr?: ChunkHeader;
}

const sha256 = (b: Buffer): string => createHash('sha256').update(b).digest('hex');

/**
 * The HCS-10 `message` operation a chunk rides in.
 *
 * §7.4 measures `CHUNK_WIRE_MAX` against "the entire HCS-10 `message`
 * operation, as UTF-8 JSON" — not against the Chunk alone — so the wrapper is
 * built here and its size is what is checked.
 */
export function messageOperation(chunk: Chunk, operatorId: string): Record<string, unknown> {
  return { p: 'hcs-10', op: 'message', operator_id: operatorId, data: JSON.stringify(chunk) };
}

/** The wire size of a chunk: the whole operation, as UTF-8 JSON. */
export function wireSize(chunk: Chunk, operatorId: string): number {
  return Buffer.byteLength(JSON.stringify(messageOperation(chunk, operatorId)), 'utf8');
}

export interface ChunkingInput {
  readonly id: string;
  readonly schemaRef: string;
  readonly ciphertext: Buffer;
  readonly header: ChunkHeader;
  /** §7.2's fourth weld: the account the postage was affixed from. */
  readonly operatorId: string;
}

/**
 * Slice the ciphertext and build the chain.
 *
 * The slice sizes are not fixed by the specification — §7.4: "the budget
 * depends on identifier lengths and is not fixed by this document" — so they are
 * *measured*, per chunk, against the real wrapper. A constant would be wrong the
 * moment an identifier changed length, and wrong silently, since an oversized
 * message is refused by the network rather than by us.
 *
 * The chain is built backwards, because a chunk commits the digest of the NEXT
 * slice and so cannot be finished until that slice exists.
 */
export function chunkCiphertext(input: ChunkingInput): readonly Chunk[] {
  const { id, schemaRef, ciphertext, header, operatorId } = input;
  if (ciphertext.length === 0) throw new Error('chunk: an envelope has ciphertext');

  // 1. Find the slice boundaries, measuring each chunk at its real size.
  //
  // `n` appears in every chunk and its DECIMAL WIDTH depends on how many chunks
  // there turn out to be — which depends on the slice sizes, which depend on the
  // width. So this is a fixed point, not a single pass: measure with a width,
  // and if the result needs a wider `n`, measure again. It converges in at most
  // a couple of rounds because the count only grows as the slices shrink, and it
  // is not a nicety — the first version assumed one digit and emitted a
  // 1001-byte chunk 0 for a ten-chunk envelope, one byte over the line.
  let bounds = sliceBounds(1);
  for (let round = 0; round < 4; round += 1) {
    const width = String(bounds.length).length;
    const again = sliceBounds(width);
    if (again.length === bounds.length) { bounds = again; break; }
    bounds = again;
  }

  function sliceBounds(nWidth: number): { from: number; to: number }[] {
    const bounds: { from: number; to: number }[] = [];
    let offset = 0;
    let index = 0;
    while (offset < ciphertext.length) {
      const first = index === 0;
      // A probe chunk of the right shape, whose `d` grows until it stops fitting.
      // `nx` is present on every chunk but the last; assuming it present here is
      // the conservative choice, and the last chunk simply ends up with room to
      // spare rather than one byte too many.
      const probe = (take: number): Chunk => ({
        p: 'wishmail',
        s: schemaRef,
        id,
        i: index,
        // A placeholder of the right WIDTH: only its decimal length is measured.
        n: Number('9'.repeat(nWidth)),
        d: b64u(ciphertext.subarray(offset, offset + take)),
        nx: '0'.repeat(64),
        ...(first ? { hdr: header } : {}),
      });

      let lo = 1;
      let hi = ciphertext.length - offset;
      if (wireSize(probe(lo), operatorId) > CHUNK_WIRE_MAX) {
        throw new Error(
          `chunk: a single ciphertext byte does not fit in CHUNK_WIRE_MAX ${CHUNK_WIRE_MAX} bytes ` +
            `at index ${index}; the header or the identifiers are too large`,
        );
      }
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (wireSize(probe(mid), operatorId) <= CHUNK_WIRE_MAX) lo = mid;
        else hi = mid - 1;
      }
      bounds.push({ from: offset, to: offset + lo });
      offset += lo;
      index += 1;
    }
    return bounds;
    return bounds;
  }

  const n = bounds.length;

  // 2. Build backwards: `nx` commits the NEXT slice's digest, so the last chunk
  //    is finished first and carries none (§7.4, T-P1-11).
  const chunks: Chunk[] = new Array<Chunk>(n);
  let nextDigest: string | undefined;
  for (let i = n - 1; i >= 0; i -= 1) {
    const b = bounds[i] as { from: number; to: number };
    const slice = ciphertext.subarray(b.from, b.to);
    chunks[i] = {
      p: 'wishmail',
      s: schemaRef,
      id,
      i,
      n,
      d: b64u(slice),
      ...(nextDigest !== undefined ? { nx: nextDigest } : {}),
      ...(i === 0 ? { hdr: header } : {}),
    };
    nextDigest = sha256(slice);
  }

  // 3. Everything the specification says about the result, asserted before it
  //    is returned. A chunker that emits an oversized or unchained message
  //    produces something the network or a reader refuses, and the failure is
  //    then someone else's to diagnose.
  for (const c of chunks) {
    const size = wireSize(c, operatorId);
    if (size > CHUNK_WIRE_MAX) throw new Error(`chunk ${c.i}: ${size} bytes exceeds CHUNK_WIRE_MAX ${CHUNK_WIRE_MAX}`);
    const last = c.i === n - 1;
    if (last && c.nx !== undefined) throw new Error(`chunk ${c.i}: the last chunk carries nx`);
    if (!last && c.nx === undefined) throw new Error(`chunk ${c.i}: a non-last chunk carries no nx`);
    if ((c.i === 0) !== (c.hdr !== undefined)) throw new Error(`chunk ${c.i}: hdr is on chunk 0 and only chunk 0`);
  }
  if (Buffer.concat(chunks.map((c) => unb64u(c.d))).length !== ciphertext.length) {
    throw new Error('chunk: the slices do not reconstitute the ciphertext');
  }

  return chunks;
}

/** One chunk as it was observed on a lane, with what consensus recorded about it. */
export interface ObservedChunk {
  readonly chunk: Chunk;
  readonly sequenceNumber: number;
  readonly consensusTimestamp: string;
  /** The HCS-10 `operator_id` of the submission — §7.2's fourth weld. */
  readonly operatorId?: string;
}

export type ReassemblyState = 'complete' | 'partial' | 'unrooted';

export interface Reassembly {
  readonly state: ReassemblyState;
  /** The canonical chain, in index order, as far as it goes. */
  readonly chain: readonly ObservedChunk[];
  /** The ciphertext, present only when complete AND it hashes to `hdr.h`. */
  readonly ciphertext?: Buffer;
  /** Complete but the slices do not hash to `hdr.h` — unbound, and not opened (§11.3). */
  readonly integrityFailed: boolean;
  /** Chunks that landed but are not on the chain (§11.3: recorded, never used). */
  readonly offChain: readonly ObservedChunk[];
  /** Byte-identical repeats of a canonical chunk. */
  readonly duplicates: readonly ObservedChunk[];
  readonly reason?: string;
}

/**
 * §11.3's walk, and §8.5's derivation.
 *
 * "Chunk 0 is the earliest chunk with `(id, 0)` whose header rebuilds to `id`
 * … From chunk 0, each subsequent chunk is the earliest chunk with `(id, i)`
 * whose slice hashes to the previous canonical chunk's `nx`."
 *
 * `headerBinds` is passed in rather than computed here: rebuilding the AAD needs
 * the lane the chunk arrived on and the wire version its `schemaRef` is
 * registered under (§5.6), which are the caller's to know. Keeping it out means
 * this walk is a function of bytes and ordering and nothing else.
 */
export function reassemble(
  observed: readonly ObservedChunk[],
  id: string,
  headerBinds: (header: ChunkHeader) => boolean,
): Reassembly {
  // Consensus ordering is total, and the walk depends on it: "a copy cannot
  // precede what it copies."
  const ordered = [...observed]
    .filter((o) => o.chunk.id === id)
    .sort((a, b) => (a.consensusTimestamp < b.consensusTimestamp ? -1 : a.consensusTimestamp > b.consensusTimestamp ? 1 : 0));

  const used = new Set<ObservedChunk>();
  const offChain: ObservedChunk[] = [];
  const duplicates: ObservedChunk[] = [];

  const zero = ordered.find((o) => o.chunk.i === 0 && o.chunk.hdr !== undefined && headerBinds(o.chunk.hdr));
  if (zero === undefined) {
    return {
      state: 'unrooted',
      chain: [],
      integrityFailed: false,
      offChain: ordered,
      duplicates: [],
      reason: 'no chunk 0 whose header rebuilds to the envelope identifier (§5.6, §11.3)',
    };
  }
  used.add(zero);

  const chain: ObservedChunk[] = [zero];
  const n = zero.chunk.n;
  let previous = zero;

  for (let i = 1; i < n; i += 1) {
    const want = previous.chunk.nx;
    if (want === undefined) break; // the previous chunk claims to be last
    // §8.5: "a chunk whose `n` differs from chunk 0's is a conflicting chunk and
    // is not of this envelope." It was not compared, so such a chunk was taken
    // onto the chain whenever it landed before the sender's — and the sender's
    // own was then filed as its duplicate. Nothing observable moved, because a
    // candidate must still hash to the previous chunk's `nx`; what moved was the
    // EVIDENCE, since §5.7's postmark is taken from the message the walk used,
    // so the bundle cited a stranger's sequence number for a link the sender
    // posted. Found by T-P3-2's corpus and by T-P3-3.
    const next = ordered.find(
      (o) => !used.has(o) && o.chunk.i === i && o.chunk.n === n && sha256(unb64u(o.chunk.d)) === want,
    );
    if (next === undefined) break;
    used.add(next);
    chain.push(next);
    previous = next;
  }

  // Everything the walk did not take. A byte-identical repeat of a canonical
  // chunk is a duplicate; anything else with this id is off the chain. Neither
  // is used (§11.3).
  const canonicalBytes = new Set(chain.map((c) => `${c.chunk.i}:${c.chunk.d}`));
  for (const o of ordered) {
    if (used.has(o)) continue;
    // A CONFLICTING CHUNK IS NOT A DUPLICATE, and the duplicate test alone could
    // not tell them apart: it compares `(index, slice)` and `n` is in neither.
    // So a chunk declaring another count but carrying the same slice was filed
    // as a byte-identical repeat of something it is not of (§8.5).
    if (o.chunk.n !== n) offChain.push(o);
    else if (canonicalBytes.has(`${o.chunk.i}:${o.chunk.d}`)) duplicates.push(o);
    else offChain.push(o);
  }

  if (chain.length < n) {
    return {
      state: 'partial',
      chain,
      integrityFailed: false,
      offChain,
      duplicates,
      reason: `the chain is ${chain.length} of ${n} links (F-4)`,
    };
  }

  const ciphertext = Buffer.concat(chain.map((c) => unb64u(c.chunk.d)));
  const header = zero.chunk.hdr as ChunkHeader;
  const intact = sha256(ciphertext) === header.h && ciphertext.length === header.cb;

  return {
    state: 'complete',
    chain,
    integrityFailed: !intact,
    offChain,
    duplicates,
    ...(intact ? { ciphertext } : {}),
    ...(intact
      ? {}
      : { reason: 'complete, but the slices do not hash to hdr.h: unbound, and not opened (§11.3, T-P1-11)' }),
  };
}
