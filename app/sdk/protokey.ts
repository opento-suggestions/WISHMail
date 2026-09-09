/**
 * Reading a KEY LIST back from a mirror node — forty lines of protobuf, and
 * why they are here rather than a dependency.
 *
 * §7.1 requires a lane's submit key to be "a threshold of the two agents' keys,
 * and MUST NOT include any other key" (T-P17-2), and §11.4 has a Verifier check
 * that from consensus. A mirror node returns a single key as
 * `{_type: "ED25519", key: "<raw hex>"}` and needs nothing — but it returns a
 * key LIST as `{_type: "ProtobufEncoded", key: "<hex of the protobuf Key>"}`,
 * so the list has to be decoded before the invariant can be checked at all.
 *
 * THE ALTERNATIVES, AND WHY NEITHER. A `TopicInfoQuery` against a consensus
 * node returns the structure already parsed — and it is a PAID query, so a
 * Verifier would need an account and a balance to check a lane, which is
 * exactly what P-4 forbids: "the VERIFIER suite runs with nothing configured".
 * And `@hashgraph/proto`, which ships the generated decoder, is not in this
 * repository's dependency tree: it resolves today only from a `node_modules`
 * directory ABOVE the repository, so importing it would work on this machine
 * and fail on a clean clone — the worst kind of dependency, because it passes
 * here.
 *
 * So it is composed here, on the same grounds the seal is (`OPERATIONS.md`):
 * the surface is tiny, it is a READ of public data, it cannot fail silently in
 * the way a mis-composed cipher can — a wrong parse yields keys that do not
 * match the two accounts, which is a loud refusal — and the wire format is
 * fixed by protobuf itself rather than by a draft.
 *
 * The message definitions, from `hedera-protobufs/services/basic_types.proto`:
 *
 *   message Key {                       // a oneof; only the branches we can meet
 *     ...
 *     bytes        ed25519         = 2;
 *     ThresholdKey thresholdKey    = 5;
 *     KeyList      keyList         = 6;
 *     bytes        ECDSASecp256k1  = 7;
 *     ...
 *   }
 *   message KeyList      { repeated Key keys = 1; }
 *   message ThresholdKey { uint32 threshold = 1; KeyList keys = 2; }
 *
 * Every field this reads is wire type 2 (length-delimited) except
 * `ThresholdKey.threshold`, which is a varint and is skipped: T-P17-2 is a
 * statement about WHICH keys a topic names, not about how many must sign.
 *
 * Conformance: T-P17-2, T-P11-3.
 */

/** A varint, and the offset after it. Protobuf's base-128, little-endian groups. */
function varint(b: Buffer, at: number): { readonly value: number; readonly next: number } {
  let value = 0;
  let shift = 0;
  let i = at;
  for (;;) {
    if (i >= b.length) throw new Error('protokey: a varint runs past the end of the message');
    const byte = b[i] as number;
    value += (byte & 0x7f) * 2 ** shift;
    i += 1;
    if ((byte & 0x80) === 0) break;
    shift += 7;
    if (shift > 35) throw new Error('protokey: a varint is longer than 5 groups');
  }
  return { value, next: i };
}

/**
 * Every ed25519 or ECDSA public key a protobuf `Key` names, at any depth, as
 * raw hex — the same form a mirror node gives a single key in, so a caller
 * compares one list of strings and never two encodings.
 *
 * FLATTENED, deliberately. §7.1's constraint is on the SET of keys a lane's
 * submit key names; a threshold of two over a list of two and a bare list of
 * two name the same two agents, and T-P17-2 asks whether any third key is
 * there.
 */
export function keysOfProtobuf(encoded: Buffer, depth = 0): string[] {
  return readKey(encoded, depth);
}

/** Walk one length-delimited field at a time, calling back with (field, body). */
function fields(b: Buffer, visit: (field: number, body: Buffer) => void): void {
  let i = 0;
  while (i < b.length) {
    const tag = varint(b, i);
    i = tag.next;
    const field = Math.floor(tag.value / 8);
    const wire = tag.value % 8;
    if (wire === 0) { i = varint(b, i).next; continue; }
    if (wire === 5) { i += 4; continue; }
    if (wire === 1) { i += 8; continue; }
    if (wire !== 2) throw new Error(`protokey: unexpected wire type ${wire} for field ${field}`);
    const len = varint(b, i);
    const end = len.next + len.value;
    if (end > b.length) throw new Error('protokey: a length-delimited field runs past the end');
    visit(field, b.subarray(len.next, end));
    i = end;
  }
}

/**
 * FIELD NUMBERS ARE PER MESSAGE, not global, so the three messages are three
 * functions. A context-free walker reads `ThresholdKey.keys` (field 2) as
 * `Key.ed25519` (also field 2) and hands back the KeyList's own bytes as though
 * they were a public key — which is exactly what `check:correspondent` caught
 * on the first version of this file, and exactly the kind of wrong answer that
 * looks like a right one: a 68-byte "key" that matches nobody.
 */
function readKey(b: Buffer, depth: number): string[] {
  if (depth > 8) throw new Error('protokey: the key structure nests deeper than 8, which no lane does');
  const out: string[] = [];
  fields(b, (field, body) => {
    if (field === 2 || field === 7) out.push(body.toString('hex')); // ed25519 | ECDSASecp256k1
    else if (field === 5) out.push(...readThresholdKey(body, depth + 1));
    else if (field === 6) out.push(...readKeyList(body, depth + 1));
    // Any other branch is a key kind WISHMail does not use (contract, RSA,
    // delegatable). Skipped rather than refused: a topic carrying one names no
    // key this rule recognises, which is what T-P17-2 will then report.
  });
  return out;
}

/** `KeyList { repeated Key keys = 1; }` */
function readKeyList(b: Buffer, depth: number): string[] {
  const out: string[] = [];
  fields(b, (field, body) => {
    if (field === 1) out.push(...readKey(body, depth + 1));
  });
  return out;
}

/**
 * `ThresholdKey { uint32 threshold = 1; KeyList keys = 2; }` — the threshold is
 * a varint and is skipped: T-P17-2 is a statement about WHICH keys a topic
 * names, not about how many of them must sign.
 */
function readThresholdKey(b: Buffer, depth: number): string[] {
  const out: string[] = [];
  fields(b, (field, body) => {
    if (field === 2) out.push(...readKeyList(body, depth + 1));
  });
  return out;
}

/** A mirror-node key object, in the shape `/topics/{id}` and `/accounts/{id}` return. */
export interface MirrorKey {
  readonly _type: string;
  readonly key: string;
}

/**
 * A mirror-node key object to the flattened list of raw-hex public keys it
 * names. A single key is already raw hex; a list is the protobuf above.
 */
export function flattenMirrorKey(k: MirrorKey | null | undefined): string[] {
  if (k === null || k === undefined) return [];
  if (k._type !== 'ProtobufEncoded') return [k.key];
  return keysOfProtobuf(Buffer.from(k.key, 'hex'));
}
