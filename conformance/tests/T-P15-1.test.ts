/**
 * T-P15-1 — P-15 (Claims are scoped).
 *
 * Classes: all.
 * Register: NAMED (§1.5)
 * @fixture-kind artifact
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   The conformance claim validates against `spec/schemas/conformance-claim.schema.json`; every test it names exists in the suite.
 *
 * EXPANDED 2026-09-10 over a claim built from `app/src/release.ts`,
 * `spec/pins.json` and the report the suite last produced.
 *
 * WHY A CLAIM IS BUILT RATHER THAN READ. This release claims nothing — §1.5's
 * "silence claims nothing", and `RELEASE.classes` is empty — so there is no
 * published claim document to validate. That does not make the row vacuous: what
 * §1.5 requires is that the claim a release WOULD publish is a well-formed one,
 * and the way to find out is to build it from the release's own facts and put it
 * to the schema. A claim that could not be built would be found on the day it
 * was needed and not before, which is the freeze defect in miniature.
 *
 * WHAT "EVERY TEST IT NAMES" MEANS. §5.10's claim names no test directly; it
 * names a report through `suite.reportDigest`, and the report names every test
 * the suite ran. So the tests a claim names are the report's, reached the way a
 * reader would reach them — and each must be a row in §A with a file in the
 * suite, both ways.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import canonicalize from 'canonicalize';
import { RELEASE } from '../../app/src/release.js';
import { schemas } from '../../app/src/schema/loader.js';
import { REPO_ROOT, pins } from '../support/fixtures.js';
import { registerRows } from '../register.mjs';

interface Report {
  readonly spec: string;
  readonly digest: string;
  readonly generated: string;
  readonly counts: { readonly passed: number; readonly failed: number; readonly notRun: number };
  readonly passedInFull: boolean;
  readonly results: readonly { readonly test: string; readonly outcome: string; readonly classes: readonly string[] }[];
}

/** §5.1's digest, as `report.mjs` computes it: `digest` and `generated` absent. */
function digestOfReport(report: Report): string {
  const { digest: _digest, generated: _generated, ...body } = report;
  const s = canonicalize(body);
  assert.ok(s !== undefined, 'the report canonicalizes (RFC 8785)');
  return createHash('sha256').update(Buffer.from(s, 'utf8')).digest('hex');
}

test('T-P15-1 — Claims are scoped', () => {
  const registry = schemas(REPO_ROOT);
  const declared = pins();

  const reportFile = path.join(REPO_ROOT, 'conformance', 'reports', 'all.json');
  assert.ok(fs.existsSync(reportFile), 'the suite has produced a report for a claim to name (§5.10)');
  const report = JSON.parse(fs.readFileSync(reportFile, 'utf8')) as Report;

  // --- The claim, built from the release's own facts. ---------------------
  const stampToken = (declared['stampToken'] as Record<string, { tokenId: string; treasury: string }>)['hedera:testnet'];
  assert.ok(stampToken !== undefined, 'spec/pins.json pins the stamp token for the deployed ledger tag');

  const priceTopic = readPriceTopic();

  const claim = {
    spec: RELEASE.spec,
    classes: [...RELEASE.classes],
    profiles: { ...RELEASE.profiles },
    pins: declared['standards'] as Record<string, unknown>,
    stampToken: { ledgerTag: 'hedera:testnet', tokenId: stampToken.tokenId, treasury: stampToken.treasury },
    suite: {
      version: report.spec,
      date: report.generated.slice(0, 10),
      reportDigest: report.digest,
    },
    limitations: 'LIMITATIONS.md',
    prices: { ledgerTag: 'hedera:testnet', topicId: priceTopic },
    extensions: [...RELEASE.extensions],
  };

  // --- It validates. -------------------------------------------------------
  const faults = registry.validate('conformance-claim', claim);
  assert.deepEqual(faults, [], 'the claim this release would publish validates against §5.10`s schema');

  // And the things §1.5 turns on are the things it carries.
  assert.equal(claim.spec, RELEASE.spec, 'the specification version claimed (§1.5)');
  assert.equal(claim.limitations, 'LIMITATIONS.md', 'the LIMITATIONS document (§15.4, T-P15-2)');
  assert.ok(fs.existsSync(path.join(REPO_ROOT, claim.limitations)), 'and the path reaches it');
  assert.match(claim.suite.reportDigest, /^[0-9a-f]{64}$/, 'the report digest is SHA-256 (§5.1)');

  // --- The report it names is the one the suite produced. -----------------
  assert.equal(
    digestOfReport(report),
    report.digest,
    'the report recomputes to the digest it carries, so a reader can check the claim points at it',
  );

  // --- Every test it names exists in the suite, both ways. ----------------
  const rows = new Map(registerRows().map((r) => [r.id, r]));
  const named = new Set(report.results.map((r) => r.test));
  assert.ok(named.size > 0, 'the report names the tests the suite ran');

  for (const id of named) {
    assert.ok(rows.has(id), `${id} is named by the report and is a row in §A`);
    assert.ok(
      fs.existsSync(path.join(REPO_ROOT, 'conformance', 'tests', `${id}.test.ts`)),
      `${id} is named by the report and exists in the suite`,
    );
  }
  for (const id of rows.keys()) {
    assert.ok(named.has(id), `${id} is a row in §A and the report names it — a claim cannot silently omit a test`);
  }
});

/**
 * The price topic, from the Postmaster's own ops record (§14.3).
 *
 * Found by its MEMO and not by a key name, because `wishmail:prices:1` is what
 * §14.3 fixes and a key in a deployment record is not normative.
 */
function readPriceTopic(): string {
  const file = path.join(REPO_ROOT, 'app', 'deployment', 'hedera-testnet.json');
  const deployment = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;

  let found: string | undefined;
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (typeof node !== 'object' || node === null) return;
    const record = node as Record<string, unknown>;
    const policy = record['policy'] as Record<string, unknown> | undefined;
    const memo = record['memo'] ?? policy?.['memo'];
    const id = record['id'];
    if (memo === 'wishmail:prices:1' && typeof id === 'string') found = id;
    for (const value of Object.values(record)) walk(value);
  };
  walk(deployment);

  assert.ok(found !== undefined, 'the Postmaster ops record names a topic memoed wishmail:prices:1 (§14.3)');
  return found;
}
