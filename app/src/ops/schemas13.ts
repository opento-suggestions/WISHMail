/**
 * Step 4 — the HCS-13 registration of §18.5's fourteen schemas.
 *
 * §5.11: "The schemas of a minor version are registered under HCS-13 at the
 * revision pinned in §1.6: **each as an HCS-1 file registered on an HCS-2 topic
 * that manages the schema's versions.** A `schemaRef` is HCS-13's version-pinned
 * resource locator for that registration, `hcs://13/<topicId>#<sequenceNumber>`,
 * where the topic is the HCS-2 topic managing the schema and the sequence number
 * is that of the register operation for the version claimed."
 *
 * HCS-13 at the pinned blob `07f1ac67b344d6655b98ce8196b3053fe1b4f566`, FETCHED
 * 2026-09-08 and verified with `git hash-object`, says the same in its own words
 * (`hcs-13.md:134-160`):
 *
 *   1. Create an HCS-1 file containing the JSON Schema definition
 *   2. Create an HCS-2 topic to manage versions of the schema
 *   3. Register the HCS-1 file in the HCS-2 topic using the register operation
 *
 * so this is **one HCS-2 topic per schema**, not one shared registry. See the
 * gate report in `app/OPERATIONS.md` for why that matters and what was proposed
 * instead.
 *
 * WHICH BYTES. `spec/pins.json` records `sha256` as "the digest of the
 * registered schema, which a release's shipped `spec/schemas/` file must equal"
 * (T-P9-4), and HCS-1's memo carries "the SHA-256 hash of the file being
 * uploaded before any compression". Those must be the SAME BYTES or T-P9-4
 * compares two different things and passes or fails by accident. The bytes are
 * therefore taken from the **git blob** — ledger §H: "Digests were computed from
 * raw blob bytes (`git cat-file`); `core.autocrlf=true` corrupts working-tree
 * digests" — and the working tree is compared against them, and this **stops**
 * if they differ, because then the shipped file and the registered file are not
 * the same file.
 *
 * Conformance: T-P9-3, T-P9-4, T-P9-9, T-P9-2.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { SCHEMA_NAMES, type SchemaName } from '../schema/loader.js';
import { hcs1File, type Hcs1File } from './hcs1.js';

/** HCS-2's registry memo, `hcs-2:[indexed]:[ttl]` (§H:359). */
export function schemaRegistryMemo(ttl: number): string {
  return `hcs-2:0:${ttl}`;
}

/**
 * `indexed` is 0 — read all — and not 1. §5.11 pins a `schemaRef` to a sequence
 * number, and T-P9-9 has a release "claiming any patch of that minor version"
 * ship schemas whose digests equal the registered ones; both need prior entries
 * to stay readable at their sequence numbers. Indexed 1 makes only the last
 * message state, which would make every earlier `schemaRef` unresolvable. Same
 * reasoning as D-147's registry.
 */
export const SCHEMA_REGISTRY_INDEXED = 0;

export interface SchemaSource {
  readonly name: SchemaName;
  readonly repoPath: string;
  /** The bytes as committed. */
  readonly bytes: Buffer;
  readonly sha256: string;
  readonly blobSha: string;
  readonly file: Hcs1File;
}

/** `git cat-file blob` for one path at HEAD — the committed bytes, whatever the checkout did. */
function blobBytes(repoRoot: string, repoPath: string): { readonly bytes: Buffer; readonly blobSha: string } {
  const blobSha = execFileSync('git', ['rev-parse', `HEAD:${repoPath}`], { cwd: repoRoot, encoding: 'utf8' }).trim();
  const bytes = execFileSync('git', ['cat-file', 'blob', blobSha], { cwd: repoRoot, maxBuffer: 32 * 1024 * 1024 });
  return { bytes: Buffer.from(bytes), blobSha };
}

/**
 * The fourteen, with the bytes that will be registered and the digest that will
 * be pinned — one value, used for both.
 *
 * Stops rather than registering where the working tree and the blob differ:
 * `spec/schemas/` is what a release ships and T-P9-4 compares it to what was
 * registered, so registering bytes the repository does not hold would make that
 * test's subject a file nobody has.
 */
export function schemaSources(repoRoot: string): readonly SchemaSource[] {
  const out: SchemaSource[] = [];
  const divergent: string[] = [];

  for (const name of SCHEMA_NAMES) {
    const repoPath = `spec/schemas/${name}.schema.json`;
    const { bytes, blobSha } = blobBytes(repoRoot, repoPath);
    const onDisk = fs.readFileSync(path.join(repoRoot, repoPath));
    if (!onDisk.equals(bytes)) {
      divergent.push(
        `${repoPath}: working tree ${onDisk.length} bytes, committed blob ${bytes.length} bytes ` +
          '(core.autocrlf rewrites line endings on checkout; the blob is what a reader gets)',
      );
      continue;
    }
    out.push({
      name,
      repoPath,
      bytes,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      blobSha,
      file: hcs1File(bytes, 'application/schema+json'),
    });
  }

  if (divergent.length > 0) {
    throw new Error(
      'STOP — the working tree and the committed blob differ for:\n  ' +
        divergent.join('\n  ') +
        '\nRegistering one and pinning the other would make T-P9-4 compare two different files.',
    );
  }

  // The confirmation Sonic asked for, run rather than assumed: the digest HCS-1's
  // memo carries and the digest spec/pins.json will record are over the same
  // bytes. It is true by construction today — both read `bytes` — and it is
  // checked anyway, because "they come from the same place" is a property of
  // this function and the guarantee is a property of the deployment.
  const disagreeing = out.filter((s) => !digestsAgree(s)).map((s) => s.name);
  if (disagreeing.length > 0) {
    throw new Error(
      `STOP — the HCS-1 memo digest and the pins digest are over different bytes for: ${disagreeing.join(', ')}. ` +
        'T-P9-4 compares the registered schema to the shipped one, and it could not.',
    );
  }
  return out;
}

/**
 * The check the gate report states: the digest HCS-1's memo carries and the
 * digest `spec/pins.json` will record are over the same bytes.
 *
 * It is trivially true because both come from `SchemaSource.bytes` — and it is
 * asserted anyway, because "they come from the same place" is a property of
 * today's code and the thing being guaranteed is a property of the deployment.
 */
export function digestsAgree(source: SchemaSource): boolean {
  return source.file.digest === source.sha256;
}

/** §5.11's version-pinned locator. */
export function schemaRefFor(registryTopic: string, sequenceNumber: number): string {
  return `hcs://13/${registryTopic}#${sequenceNumber}`;
}

/** HCS-13's schema registration, into the schema's own HCS-2 topic (`hcs-13.md:150-160`). */
export function schemaRegisterOperation(fileTopic: string, name: SchemaName): Record<string, unknown> {
  return {
    p: 'hcs-2',
    op: 'register',
    t_id: fileTopic,
    metadata: { name, description: `WISHMail ${name} schema, specification minor version 0.5 (§18.5)` },
  };
}

/** HCS-2's transaction memo, `hcs-2:op:<enum>:<registryType>` — a SHOULD (§H:359). */
export const SCHEMA_REGISTER_TX_MEMO = 'hcs-2:op:register:0';
