/**
 * Fixture plumbing for the registered bodies — and NOTHING that decides a
 * verdict.
 *
 * `conformance/DERIVATION.md` fixes the line this file sits on: the registered
 * bodies share fixtures with the twenty-two `check:*` courts and share no code
 * that decides a verdict. Loading captured bytes, wrapping them in a `Reader`,
 * copying them, and re-packing one altered chunk are all plumbing — they say
 * nothing about whether a test passes. Every assertion lives in the body that
 * makes it, which is why `readerOver` here and `readerOver` in
 * `app/src/tools/captured.check.ts` are two functions and not one.
 *
 * P-4 governs everything reached from here: no key, no account, no stamp, no
 * counter, no network. A `Reader` is an interface with no write on it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  Reader,
  ScheduleRecord,
  Settlement,
  TopicInfo,
  TopicMessage,
} from '../../app/src/tools/consensus.js';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * The four correspondences captured from `hedera:testnet` while the gates ran.
 *
 * Each stops where §11.2's ingestion table stops: the lane, the birth doorbell,
 * the manifests, the settlements, the schedules, and the HCS-13 registration a
 * chunk's `schemaRef` resolves through. None of them carries the HCS-2 registry
 * or the HCS-1 profile file behind an account's HCS-11 memo, so no replay of
 * §9.2's rule can run over one.
 */
export const RUN_FIXTURE_NAMES = [
  'checkpoint-one-letter',
  'checkpoint-two-receipt',
  'checkpoint-two-reply',
  'gate-three-certified',
  // Registered together 2026-09-12, the first act after the recorded take
  // (RECORD, Sonic). All three post-date D-173, so each carries the minor
  // version and needs no SPEC_WHEN_CAPTURED substitution. The first two were
  // held out deliberately so the battery entered Gate Four and the take
  // exactly as green as it was; the third is the take itself.
  'gate-zero-two-certified',
  'gate-four-certified',
  'recorded-take-certified',
] as const;

/**
 * The two captured on 2026-09-10 night with the resolution chain included.
 *
 * A mirror read and nothing else — no key, no account, no signature — naming
 * the declaration registry and the profile file of A2, B and C with `--topic`,
 * so that §9.2's rule can be re-run from the fixture. **The four above are
 * records and are not rewritten**; these stand beside them, and the digests the
 * runs of record printed still reproduce from the tags those runs name.
 *
 * With them, a Verifier claiming `hcs14` reaches `verified` — which is what
 * §11.4's resolution paragraph has always described and what nothing offline
 * could try until now.
 */
export const RESOLVED_FIXTURE_NAMES = ['gate-three-resolved', 'checkpoint-two-resolved'] as const;

export const FIXTURE_NAMES = [...RUN_FIXTURE_NAMES, ...RESOLVED_FIXTURE_NAMES] as const;

export type FixtureName = (typeof FIXTURE_NAMES)[number];
export type ResolvedFixtureName = (typeof RESOLVED_FIXTURE_NAMES)[number];

/**
 * One captured correspondence, in the shape `sdk/capture.cli.ts` writes.
 *
 * `appraisal`, `bundleDigest` and `narrative` are what the network produced on
 * the day of the run. They are a RECORD: a body may compare against them and
 * may never rewrite them.
 */
export interface Fixture {
  readonly ledgerTag: string;
  readonly capturedAt: string;
  readonly lane: string;
  readonly topics: Record<string, TopicMessage[]>;
  readonly topicInfo: Record<string, TopicInfo | null>;
  readonly accounts: Record<string, { memo: string | null; key: string | null }>;
  readonly settlements: Record<string, Settlement>;
  readonly schedules?: Record<string, ScheduleRecord>;
  readonly envelope: Record<string, unknown>;
  readonly appraisal: {
    readonly declared: { readonly trustClass: string; readonly endorsements: readonly string[] };
    readonly appraised: { readonly standing: string; readonly reasons: readonly string[] };
    readonly resolution: { readonly standing: string; readonly reasons: readonly string[] };
    readonly receipt: { readonly status: string; readonly reasons: readonly string[] };
  };
  readonly correspondence?: readonly Record<string, unknown>[];
  readonly bundleDigest: string;
  readonly narrative?: { readonly bundleDigest: string; readonly text: string };
}

export function fixturePath(name: FixtureName): string {
  return path.join(REPO_ROOT, 'conformance', 'fixtures', `${name}.json`);
}

export function fixture(name: FixtureName): Fixture {
  return JSON.parse(fs.readFileSync(fixturePath(name), 'utf8')) as Fixture;
}

/** Every captured correspondence, in the order they were run. */
export function allFixtures(): readonly { readonly name: FixtureName; readonly f: Fixture }[] {
  return FIXTURE_NAMES.map((name) => ({ name, f: fixture(name) }));
}

/** The two that carry the resolution chain, for a body that claims a profile. */
export function resolvedFixtures(): readonly { readonly name: ResolvedFixtureName; readonly f: Fixture }[] {
  return RESOLVED_FIXTURE_NAMES.map((name) => ({ name, f: fixture(name) }));
}

/** A deep copy, so one alteration never leaks into the next. */
export function copy(f: Fixture): Fixture {
  return JSON.parse(JSON.stringify(f)) as Fixture;
}

/**
 * A `Reader` over captured bytes. Nothing configured, nothing to configure
 * (P-4). A topic the capture does not hold answers as a mirror node answers for
 * a topic it does not hold, which is `null` and an empty list — never a throw.
 */
export function readerOver(f: Fixture): Reader {
  return {
    ledgerTag: f.ledgerTag,
    messages: (topicId) => Promise.resolve(f.topics[topicId] ?? []),
    topic: (topicId) => Promise.resolve(f.topicInfo[topicId] ?? null),
    transfer: (txRef) => Promise.resolve(f.settlements[txRef] ?? null),
    accountMemo: (account) => Promise.resolve(f.accounts[account]?.memo ?? null),
    accountKey: (account) => Promise.resolve(f.accounts[account]?.key ?? null),
    schedule: (scheduleId) => Promise.resolve(f.schedules?.[scheduleId] ?? null),
  };
}

/** Every HCS-10 operation on a topic, parsed, with the message it rode on. */
export function operationsOn(
  f: Fixture,
  topicId: string,
): readonly { readonly message: TopicMessage; readonly op: Record<string, unknown> }[] {
  const out: { message: TopicMessage; op: Record<string, unknown> }[] = [];
  for (const message of f.topics[topicId] ?? []) {
    try {
      const parsed: unknown = JSON.parse(message.contents);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        out.push({ message, op: parsed as Record<string, unknown> });
      }
    } catch {
      // A message that is not an operation is not one. §11.3 walks past it.
    }
  }
  return out;
}

/** Every `message` operation on the lane, with its `data` parsed as a Chunk. */
export function chunksOn(
  f: Fixture,
  topicId: string = f.lane,
): readonly {
  readonly message: TopicMessage;
  readonly op: Record<string, unknown>;
  readonly chunk: Record<string, unknown>;
}[] {
  const out: { message: TopicMessage; op: Record<string, unknown>; chunk: Record<string, unknown> }[] = [];
  for (const { message, op } of operationsOn(f, topicId)) {
    if (op['p'] !== 'hcs-10' || op['op'] !== 'message') continue;
    const data = op['data'];
    if (typeof data !== 'string') continue;
    try {
      const chunk: unknown = JSON.parse(data);
      if (typeof chunk === 'object' && chunk !== null && !Array.isArray(chunk)) {
        out.push({ message, op, chunk: chunk as Record<string, unknown> });
      }
    } catch {
      // Likewise.
    }
  }
  return out;
}

/**
 * Re-pack one lane message from an edited operation and its edited chunk.
 *
 * The chunk goes back into `op.data` as a JSON string, exactly as the wire
 * carries it (§7.4), and the operation goes back into `contents`. An alteration
 * that skipped either layer would be altering something no reader reads.
 */
export function repack(
  f: Fixture,
  topicId: string,
  sequenceNumber: number,
  op: Record<string, unknown>,
  chunk?: Record<string, unknown>,
): void {
  const messages = f.topics[topicId];
  if (messages === undefined) throw new Error(`the fixture holds no topic ${topicId}`);
  const index = messages.findIndex((m) => m.sequenceNumber === sequenceNumber);
  if (index < 0) throw new Error(`the fixture holds no message ${sequenceNumber} on ${topicId}`);
  const next = { ...op };
  if (chunk !== undefined) next['data'] = JSON.stringify(chunk);
  (messages[index] as { contents: string }).contents = JSON.stringify(next);
}

/**
 * Alter one chunk of one envelope on the lane and return the altered copy.
 *
 * `which` picks the chunk by its index within the envelope, so a body says
 * "chunk 0" and not "sequence number 2".
 */
export function alterChunk(
  f: Fixture,
  envelopeId: string,
  which: number,
  edit: (op: Record<string, unknown>, chunk: Record<string, unknown>) => void,
): Fixture {
  const g = copy(f);
  const found = chunksOn(g).find((c) => c.chunk['id'] === envelopeId && c.chunk['i'] === which);
  if (found === undefined) throw new Error(`no chunk ${which} of ${envelopeId} on lane ${g.lane}`);
  edit(found.op, found.chunk);
  repack(g, g.lane, found.message.sequenceNumber, found.op, found.chunk);
  return g;
}

/** Every envelope identifier on a fixture's lane, in consensus order of chunk 0. */
export function envelopeIds(f: Fixture): readonly string[] {
  const seen: string[] = [];
  for (const { chunk } of chunksOn(f)) {
    const id = chunk['id'];
    if (typeof id === 'string' && !seen.includes(id)) seen.push(id);
  }
  return seen;
}

/** The stamp token and treasury §11.4 needs in scope, from `spec/pins.json`. */
export function stampTokenPin(ledgerTag: string): { readonly tokenId: string; readonly treasury: string } {
  const pins = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'spec', 'pins.json'), 'utf8')) as {
    stampToken: Record<string, { tokenId: string; treasury: string }>;
  };
  const pin = pins.stampToken[ledgerTag];
  if (pin === undefined) throw new Error(`spec/pins.json pins no stamp token for ${ledgerTag}`);
  return { tokenId: pin.tokenId, treasury: pin.treasury };
}

/** `spec/pins.json`, whole. */
export function pins(): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'spec', 'pins.json'), 'utf8')) as Record<string, unknown>;
}
