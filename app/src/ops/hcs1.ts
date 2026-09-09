/**
 * HCS-1 files: chunking, reassembly, and the memo.
 *
 * Pinned blob `0d8cca5f0adac613a149244e769672ea3060328a` (§1.6).
 *
 *   - the topic memo is `[hash]:[algo]:[encoding]`, and "[hash] is the SHA-256
 *     hash of the file being uploaded **before any compression**" (`:56-60`);
 *   - a valid file topic "include[s] a Submit Key" and does "NOT include an
 *     Admin Key … This ensures that data cannot be deleted" (`:48-49`) — which
 *     is D-150's whole subject;
 *   - a chunk is `{o, c}` with `c` "no greater than 1024 bytes" of base64, and
 *     `o = 0` carries a `data:[mime];base64,` prefix (`:92-100`);
 *   - reassembly is by `o` and not by sequence number: "the sequence number
 *     that the chunk is uploaded in does not matter" (`:113`).
 *
 * This was inline in `declaration.ts` when only the HCS-11 profile needed it.
 * The HCS-13 schema registration needs the same thing fourteen times, so it is
 * here, once.
 */
import { createHash } from 'node:crypto';
import zlib from 'node:zlib';

/**
 * `hcs-1.md:92-95`: "The final base64 string should chunked into segments no
 * greater than 1024 bytes." Stated there as a SHOULD, and treated as the bound.
 *
 * **THE STANDARD'S MAXIMUM IS UNREACHABLE, and this is the defect Step 4's first
 * real run found (2026-09-09).** The same section says "Each chunk is uploaded to
 * a Hedera Consensus Service topic as an HCS message", and a single HCS message
 * caps at 1024 bytes — measured, ledger §H: `getRequiredChunks()` is 1 at 1024
 * and 2 at 1025. A 1024-byte segment inside `{"o":N,"c":"…"}` is 1037 bytes on
 * the wire, so the SDK silently splits it across TWO consensus messages, and
 * neither is parseable JSON on its own. Our own reader hit it: the run stopped
 * with "Unterminated string in JSON at position 1024" while reading back the
 * first schema file that needed more than one chunk. Every HCS-1 file this
 * project had written before was one chunk — the 2026-09-08 profile is 563
 * bytes — so nothing had ever exercised it.
 *
 * The two sentences cannot both hold, so we satisfy both by taking the smaller:
 * the WHOLE MESSAGE is bounded at 1024, which keeps every segment "no greater
 * than 1024" and keeps every chunk one HCS message. The standard's maximum is
 * simply not attainable, and §H records that rather than our leaving a reader to
 * rediscover it.
 */
export const HCS1_MESSAGE_MAX = 1024;

/**
 * What `{"o":N,"c":"…"}` costs around the content, exactly.
 *
 * `{"o":` is 5, the index's digits, `,"c":"` is 6, and `"}` is 2. Base64
 * and the `data:…;base64,` prefix contain no character JSON escapes, so the
 * content's length in the encoded message equals its length in bytes.
 */
function wrapperBytes(index: number): number {
  return 13 + String(index).length;
}

/**
 * `brotli` is one of the two algorithms the standard lists (`:71`, `:85-89`),
 * and the one Node compresses and decompresses with no dependency. Every live
 * agent's file read during the anchor census used it, so a reader that handles
 * what is deployed handles ours.
 */
export const HCS1_ALGO = 'brotli';
export const HCS1_ENCODING = 'base64';

export interface Hcs1File {
  /** The plaintext. Its SHA-256 is the memo's digest — before compression. */
  readonly plain: Buffer;
  readonly digest: string;
  /** `[hash]:[algo]:[encoding]`. */
  readonly memo: string;
  readonly chunks: readonly { readonly o: number; readonly c: string }[];
}

/** Compress, encode, chunk, and compute the memo. */
export function hcs1File(plain: Buffer, mimeType: string): Hcs1File {
  const digest = createHash('sha256').update(plain).digest('hex');
  const b64 = zlib.brotliCompressSync(plain).toString('base64');

  const prefix = `data:${mimeType};base64,`;
  const chunks: { o: number; c: string }[] = [];
  let offset = 0;
  let index = 0;
  // The bound is on the whole message, so the JSON wrapper and — for chunk 0 —
  // the data prefix both count against it.
  while (offset < b64.length || index === 0) {
    const room = HCS1_MESSAGE_MAX - wrapperBytes(index) - (index === 0 ? prefix.length : 0);
    const slice = b64.slice(offset, offset + room);
    chunks.push({ o: index, c: index === 0 ? prefix + slice : slice });
    offset += slice.length;
    index += 1;
    if (offset >= b64.length) break;
  }

  // The writer checks its own output against the one bound that matters, because
  // the network does not: it accepts an over-long message and splits it, and the
  // split is invisible until a reader tries to parse half of one. Cheap, and it
  // is the only thing standing between a silent split and a permanent HCS-1 file
  // that no reader can reassemble (HCS-1 topics carry no admin key, D-150).
  for (const chunk of chunks) {
    const wire = Buffer.byteLength(JSON.stringify(chunk), 'utf8');
    if (wire > HCS1_MESSAGE_MAX) {
      throw new Error(
        `hcs1File: chunk ${chunk.o} is ${wire} bytes on the wire and the ceiling is ${HCS1_MESSAGE_MAX}; ` +
          'the network would split it across two consensus messages and neither half would parse',
      );
    }
  }

  return { plain, digest, memo: `${digest}:${HCS1_ALGO}:${HCS1_ENCODING}`, chunks };
}

export interface Hcs1Read {
  readonly plain: Buffer;
  readonly digest: string;
  readonly memoDigest: string;
  /** Whether the file is what its topic memo says it is. */
  readonly intact: boolean;
}

/** Reassemble by `o`, decompress per the memo's algorithm, and hash. */
export function readHcs1(memo: string, chunks: readonly { readonly o: number; readonly c: string }[]): Hcs1Read {
  const [memoDigest, algo] = memo.split(':');
  const b64 = [...chunks]
    .sort((a, b) => a.o - b.o)
    .map((c) => c.c)
    .join('')
    .replace(/^data:[^;]*;base64,/, '');
  const compressed = Buffer.from(b64, 'base64');
  const plain =
    algo === 'brotli'
      ? zlib.brotliDecompressSync(compressed)
      : algo === 'zstd'
        ? zlib.zstdDecompressSync(compressed)
        : compressed;
  const digest = createHash('sha256').update(plain).digest('hex');
  return { plain, digest, memoDigest: memoDigest ?? '', intact: digest === memoDigest };
}
