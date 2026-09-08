/**
 * The `hcs14` declaration — the HCS-11 profile, and the HCS-1 file it rides in.
 *
 * §9.2's "Declaring under it": "An agent declaring under `hcs14` MUST set its
 * account memo to `hcs-11:hcs://2/<registryTopic>` where the registry is an
 * HCS-2 topic it controls, register each profile version there, and carry
 * `properties.wishmail` in the profile."
 *
 * This module builds the document and the bytes; `steps.ts` puts them on
 * consensus. It is separate because the profile's SHA-256 **before compression**
 * is the HCS-1 topic's memo (`hcs-1.md:56-60`), so the document has to be final
 * and validated before the topic that will hold it can be created — and an
 * HCS-1 topic has no admin key (D-150), so what is written stands.
 *
 * Conformance: T-P6-3, T-P8-3, T-P17-1.
 */
import { createHash } from 'node:crypto';
import zlib from 'node:zlib';
import { CANONICAL_ORDER, uaid, type AgentData } from '../core/hcs14.js';
import { schemas } from '../schema/loader.js';

/** HCS-1's chunk bound: "no greater than 1024 bytes" of base64 (`hcs-1.md:92-95`). */
export const HCS1_CHUNK_MAX = 1024;

/**
 * The compression algorithm named in the HCS-1 memo. `brotli` is one of the two
 * the standard lists (`hcs-1.md:71`, `:85-89`) and the one Node compresses and
 * decompresses without a dependency; every live agent's file read during the
 * anchor census used it, so a reader that handles what is deployed handles ours.
 */
export const HCS1_ALGO = 'brotli';
export const HCS1_ENCODING = 'base64';

/** §9.2 takes these from `properties.wishmail`; §9.1 gives the object. */
export interface WishmailProperties {
  readonly manifestTopic: string;
  readonly x25519Pub: string;
  readonly keyEpoch: number;
}

export interface ProfileInputs {
  readonly ledgerTag: 'hedera:testnet' | 'hedera:mainnet';
  readonly network: string;
  readonly account: string;
  readonly doorbell: string;
  readonly log: string;
  readonly wishmail: WishmailProperties;
}

/**
 * The six canonical fields HCS-14 hashes (`index.md:270-283`).
 *
 * `registry` is `"self"`: "For self-sovereign agents where no specific registry
 * applies, the registry field shall be set to `self`" (`index.md:288`). We are
 * not registered with any broker — §9.2 is the native profile and D-110's
 * self-registration on the HOL anchor is a separate, optional act — so `self`
 * is the accurate value and `hol` would be a claim about a registration that
 * does not exist.
 *
 * `nativeId` is the CAIP-10 account, which is what HCS-14 prescribes for
 * `hcs-10` (`index.md:296`). `skills` is empty: the enumeration is of
 * capabilities like text generation and code generation, and certified mail is
 * not among them; an empty array is what the reference function's
 * `agentData.skills || []` produces and is honest, where borrowing an unrelated
 * enum value would not be.
 */
/**
 * The agent's name and version, used in BOTH places they appear.
 *
 * `PROFILE_VERSION` is the HCS-11 profile's top-level `version` **and** the
 * HCS-14 canonical `version`, and they are one constant because they must be
 * one value. §9.5 recomputes an agent identifier "from the profile's name,
 * version, and skills together with the address's `registry`, `proto`, and
 * `nativeId` parameters" — and an HCS-11 profile has exactly one `version`
 * field. If the agent were hashed under a different string, no third party
 * could recompute the identifier from the profile, which is the whole of what
 * §9.5's MUST asks for.
 *
 * This was found by resolving our own first declaration and failing: the agent
 * was hashed under `1.0.0` while the profile said `1.0`, so the published
 * `uaid` was unrecomputable from the profile that carried it. The pair is one
 * constant now, and `profileBytes` asserts the two are equal before anything is
 * published.
 */
export const PROFILE_VERSION = '1.0';
export const AGENT_NAME = 'WISHMail Postmaster Agent';

export function agentData(inputs: ProfileInputs): AgentData {
  return {
    registry: 'self',
    name: AGENT_NAME,
    version: PROFILE_VERSION,
    protocol: 'hcs-10',
    nativeId: `hedera:${inputs.network}:${inputs.account}`,
    skills: [],
  };
}

/**
 * The HCS-11 profile document.
 *
 * `uaid` is required by HCS-11 (§H) and is emitted under `CANONICAL_ORDER` —
 * the example's order, D-153. `uid` is the HCS-10 `operator_id`,
 * `inboundTopicId@accountId`, which is what HCS-14 prescribes when the account
 * has one (`index.md:296`) and what §9.2 states.
 *
 * `properties` is where HCS-11 sanctions this: "an unstructured JSON object …
 * no predefined fields or structure" (`hcs-11.md:217`).
 */
export function buildProfile(inputs: ProfileInputs): Record<string, unknown> {
  const agent = agentData(inputs);
  return {
    version: PROFILE_VERSION,
    type: 1,
    display_name: agent.name,
    alias: 'wishmail-postmaster',
    bio: 'The WISHMail Postmaster’s own Correspondent identity. Certified mail for agents on Hedera.',
    uaid: uaid(agent, { uid: `${inputs.doorbell}@${inputs.account}` }, CANONICAL_ORDER),
    inboundTopicId: inputs.doorbell,
    outboundTopicId: inputs.log,
    properties: {
      wishmail: {
        v: 1,
        ledgerTag: inputs.ledgerTag,
        account: inputs.account,
        doorbell: inputs.doorbell,
        log: inputs.log,
        manifestTopic: inputs.wishmail.manifestTopic,
        x25519Pub: inputs.wishmail.x25519Pub,
        keyEpoch: inputs.wishmail.keyEpoch,
      },
    },
  };
}

export interface ProfileBytes {
  /** The document, as it will be read back. */
  readonly profile: Record<string, unknown>;
  /** The plaintext bytes. Their SHA-256 is the memo's digest. */
  readonly plain: Buffer;
  /** SHA-256 of `plain` — "the hash of the file being uploaded before any compression". */
  readonly digest: string;
  /** The HCS-1 topic memo: `<hash>:<algo>:<encoding>`. */
  readonly memo: string;
  /** The HCS-1 chunk messages, in order. */
  readonly chunks: readonly { readonly o: number; readonly c: string }[];
}

/**
 * Serialize, validate, compress, chunk — in that order, because the digest is
 * of the plaintext and the memo carries the digest.
 *
 * The `properties.wishmail` object is validated against
 * `spec/schemas/declaration.schema.json` **before** the digest is taken. A
 * profile that does not validate is not published, on D-143's precedent for the
 * price list: the file topic has no admin key, so a wrong profile is permanent.
 */
export function profileBytes(repoRoot: string, inputs: ProfileInputs): ProfileBytes {
  const profile = buildProfile(inputs);

  const declaration = (profile['properties'] as { wishmail: unknown }).wishmail;
  const errors = schemas(repoRoot).validate('declaration', declaration);
  if (errors.length > 0) {
    throw new Error(`the declaration does not validate, and is not published: ${errors.join('; ')}`);
  }

  // §9.5 recomputes the identifier from the profile's own name, version and
  // skills. If they disagree with what was hashed, the published uaid is
  // unrecomputable from the profile carrying it — and the file topic has no
  // admin key, so it would be unrecomputable permanently.
  const agent = agentData(inputs);
  if (profile['version'] !== agent.version || profile['display_name'] !== agent.name) {
    throw new Error(
      'the profile and the hashed agent disagree about name or version, so §9.5 could not recompute the identifier',
    );
  }

  const plain = Buffer.from(JSON.stringify(profile), 'utf8');
  const digest = createHash('sha256').update(plain).digest('hex');
  const compressed = zlib.brotliCompressSync(plain);
  const b64 = compressed.toString('base64');

  // `o = 0` carries the data prefix (`hcs-1.md:97-100`); the bound is on the
  // chunk's own content, so the prefix is counted with it.
  const prefix = 'data:application/json;base64,';
  const chunks: { o: number; c: string }[] = [];
  let offset = 0;
  let index = 0;
  while (offset < b64.length || index === 0) {
    const room = HCS1_CHUNK_MAX - (index === 0 ? prefix.length : 0);
    const slice = b64.slice(offset, offset + room);
    chunks.push({ o: index, c: index === 0 ? prefix + slice : slice });
    offset += slice.length;
    index += 1;
    if (offset >= b64.length) break;
  }

  return { profile, plain, digest, memo: `${digest}:${HCS1_ALGO}:${HCS1_ENCODING}`, chunks };
}

/**
 * The reader's half: chunks back to a profile, exactly as §9.2's rule and the
 * anchor census read one. Ordered by `o` and never by sequence number —
 * "because of the `o` property … the sequence number that the chunk is uploaded
 * in does not matter" (`hcs-1.md:113`).
 */
export function readProfile(
  memo: string,
  chunks: readonly { readonly o: number; readonly c: string }[],
): { readonly profile: Record<string, unknown>; readonly digest: string; readonly memoDigest: string } {
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
  return {
    profile: JSON.parse(plain.toString('utf8')) as Record<string, unknown>,
    digest: createHash('sha256').update(plain).digest('hex'),
    memoDigest: memoDigest ?? '',
  };
}

/** The HCS-2 `register` operation (§H:359): `{p, op, t_id, [metadata], [m]}`. */
export function registerOperation(fileTopic: string): Record<string, unknown> {
  return { p: 'hcs-2', op: 'register', t_id: fileTopic };
}

/** HCS-2's transaction memo, `hcs-2:op:<enum>:<registryType>` — a SHOULD (§H:359). */
export const HCS2_REGISTER_TX_MEMO = 'hcs-2:op:register:0';

/** The HCS-2 registry topic memo: `hcs-2:[indexed]:[ttl]`, indexed 0 (D-147). */
export function registryMemo(ttl: number): string {
  return `hcs-2:0:${ttl}`;
}

/** §9.2's account memo, the first link in the chain. */
export function accountMemoFor(registryTopic: string): string {
  return `hcs-11:hcs://2/${registryTopic}`;
}
