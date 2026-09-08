/**
 * `npm run check:report` — the report artifact, exercised.
 *
 * The runner refuses to write a report while any pin is null (T-P9-2), and
 * thirty are, so nothing in a normal run ever reaches `report.mjs`. An artifact
 * a conformance claim will name is not a thing to ship unexercised, so this
 * calls it directly with a synthetic, fully-pinned input and a scratch
 * directory. It never reads or writes `spec/pins.json` and never writes into
 * `conformance/reports/`.
 *
 * What it holds:
 *   - the digest is §5.1's — SHA-256 over the canonical JSON of the object with
 *     its own `digest` absent, and recomputable by anyone from the file;
 *   - `generated` is outside the digest, so two runs at two clocks agree
 *     (the reason §11.6 gives for excluding `observations`);
 *   - `passedInFull` is false when anything failed or did not run, which is
 *     what T-P15-3 reads to refuse a claim.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import canonicalize from 'canonicalize';
import { writeReport } from './report.mjs';

const failures = [];
let checked = 0;

function is(name, got, want) {
  checked += 1;
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g !== w) failures.push(`${name}\n    got   ${g}\n    want  ${w}`);
}

function ok(name, condition) {
  checked += 1;
  if (!condition) failures.push(name);
}

const pins = {
  spec: '0.5.3',
  minorVersion: '0.5',
  standards: { 'hcs-10': { commit: '7046156c', blobSha: '0cb5d2eb' } },
};

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'wishmail-report-'));

try {
  const green = [
    { test: 'T-P4-1', invariant: 'P-4', classes: ['VERIFIER'], extension: false, outcome: 'passed' },
    { test: 'T-P3-1', invariant: 'P-3', classes: ['VERIFIER'], extension: false, outcome: 'passed' },
  ];
  const counts = { registered: 83, selected: 2, passed: 2, failed: 0, notRun: 0 };

  const first = writeReport({ reportsDir: scratch, results: green, counts, pins, wantClass: 'VERIFIER' });
  const doc = JSON.parse(fs.readFileSync(first.file, 'utf8'));

  is('the file is named for the scope', path.basename(first.file), 'VERIFIER.json');
  is('the report carries the digest the runner printed', doc.digest, first.digest);
  is('it records the specification version', doc.spec, '0.5.3');
  is('and the register it was run against', doc.register.total, 83);
  is('results are sorted, so the digest does not depend on run order', doc.results.map((r) => r.test), ['T-P3-1', 'T-P4-1']);
  is('a clean run is passed in full (T-P15-3)', doc.passedInFull, true);

  // §5.1's rule, recomputed the way any reader would.
  const { digest: _d, generated: _g, ...body } = doc;
  const recomputed = createHash('sha256').update(Buffer.from(canonicalize(body), 'utf8')).digest('hex');
  is('the digest recomputes from the file (§5.1)', recomputed, doc.digest);

  // A second write at a later clock: same digest, different `generated`.
  const second = writeReport({ reportsDir: scratch, results: green, counts, pins, wantClass: 'VERIFIER' });
  const again = JSON.parse(fs.readFileSync(second.file, 'utf8'));
  is('the digest is stable across runs', second.digest, first.digest);
  ok('and generated is outside it', typeof again.generated === 'string');

  // A failure must be visible, and must stop `passedInFull`.
  const red = [...green, { test: 'T-P1-1', invariant: 'P-1', classes: ['RECIPIENT'], extension: false, outcome: 'failed' }];
  const redReport = writeReport({
    reportsDir: scratch,
    results: red,
    counts: { registered: 83, selected: 3, passed: 2, failed: 1, notRun: 0 },
    pins,
    wantClass: 'RECIPIENT',
  });
  const redDoc = JSON.parse(fs.readFileSync(redReport.file, 'utf8'));
  is('a failure means not passed in full', redDoc.passedInFull, false);
  ok('and the failing test is named', redDoc.results.some((r) => r.test === 'T-P1-1' && r.outcome === 'failed'));
  ok('a different result is a different digest', redReport.digest !== first.digest);

  // A test that did not run is not a test that passed.
  const notRun = writeReport({
    reportsDir: scratch,
    results: [{ test: 'T-P4-1', invariant: 'P-4', classes: ['VERIFIER'], extension: false, outcome: 'not-run' }],
    counts: { registered: 83, selected: 1, passed: 0, failed: 0, notRun: 1 },
    pins,
    wantClass: 'VERIFIER',
  });
  is('a test that did not run is not passed in full', JSON.parse(fs.readFileSync(notRun.file, 'utf8')).passedInFull, false);
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error(`check:report FAILED — ${failures.length} of ${checked} assertions:`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log(
  `check:report PASS — ${checked} assertions: the digest is §5.1's and recomputes from the file, it is ` +
    'stable across runs while `generated` is not inside it, and a failed or unrun test stops `passedInFull`.',
);
