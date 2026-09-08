/**
 * The conformance runner.
 *
 * It does four things, in this order, and the order matters:
 *
 *   1. Reads §A and checks it against the specification, both ways. A suite run
 *      against a register that disagrees with the text it is testing proves
 *      nothing about the text.
 *   2. Checks that every test in §A has a file and that no file is
 *      unregistered — "every named test exists" (CLAUDE.md §4), read both ways.
 *   3. Runs them, through `node --test`.
 *   4. Applies T-P9-2 and then, only if it passes, writes the report.
 *
 * T-P9-2: "the suite refuses to produce a report while `spec/pins.json`, which
 * tracks §1.6, contains an unfilled pin." There is deliberately NO flag that
 * produces a report anyway. A way past T-P9-2 would be a way past P-9, and the
 * gate is worth more than the convenience.
 *
 * The report is the artifact a conformance claim names: §5.10 gives
 * `ConformanceClaim.suite {version, date, reportDigest}`, and `reportDigest` is
 * the SHA-256 over the canonical JSON (RFC 8785, §5.1) of the report with its
 * own `digest` field absent.
 *
 * Usage: `node conformance/runner.mjs [--class VERIFIER] [--filter T-P1]`
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  EXPECTED_EXTENSION,
  EXPECTED_TOTAL,
  EXTENSION_TESTS,
  REPO_ROOT,
  faults,
  registerRows,
} from './register.mjs';

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
};
const wantClass = flag('--class');
const filter = flag('--filter');

const testsDir = path.join(REPO_ROOT, 'conformance', 'tests');
const reportsDir = path.join(REPO_ROOT, 'conformance', 'reports');

/* --- 1. the register agrees with the specification ----------------------- */

const registerFaults = faults();
if (registerFaults.length > 0) {
  console.error('runner: the register does not agree with the specification.');
  for (const f of registerFaults) console.error(`  ${f}`);
  process.exit(1);
}

let rows = registerRows();
const totalRegistered = rows.length;

/* --- 2. every named test exists, and nothing else does ------------------- */

const onDisk = fs.existsSync(testsDir)
  ? fs.readdirSync(testsDir).filter((f) => f.endsWith('.test.ts')).map((f) => f.replace(/\.test\.ts$/, ''))
  : [];
const ids = new Set(rows.map((r) => r.id));
const missing = rows.map((r) => r.id).filter((id) => !onDisk.includes(id));
const stray = onDisk.filter((id) => !ids.has(id));

if (missing.length > 0 || stray.length > 0) {
  console.error('runner: the suite and the register do not match.');
  if (missing.length > 0) console.error(`  in §A, no file: ${missing.join(', ')}`);
  if (stray.length > 0) console.error(`  a file, no row in §A: ${stray.join(', ')}`);
  process.exit(1);
}

/* --- selection ----------------------------------------------------------- */

if (wantClass !== undefined) {
  rows = rows.filter((r) => r.classes.includes(wantClass) || r.classes.includes('all'));
}
if (filter !== undefined) {
  rows = rows.filter((r) => r.id.startsWith(filter));
}
if (rows.length === 0) {
  console.error('runner: no test selected.');
  process.exit(1);
}

/* --- 3. run them --------------------------------------------------------- */

const files = rows.map((r) => path.join(testsDir, `${r.id}.test.ts`));
const run = spawnSync(
  process.execPath,
  ['--import', 'tsx', '--test', '--test-reporter', 'tap', ...files],
  { cwd: REPO_ROOT, encoding: 'utf8', env: { ...process.env, NODE_NO_WARNINGS: '1' } },
);

if (run.error !== undefined) {
  console.error(`runner: could not run the suite: ${run.error.message}`);
  process.exit(2);
}

const tap = `${run.stdout ?? ''}`;
// TAP names each test with the string the stub passes to `test()`, which begins
// with the identifier. That is the only thing read out of the output.
const passed = new Set();
const failed = new Set();
for (const line of tap.split(/\r?\n/)) {
  const m = /^(not ok|ok)\s+\d+\s+-\s+(T-P\d+-\d+)/.exec(line.trim());
  if (m === null) continue;
  (m[1] === 'ok' ? passed : failed).add(m[2]);
}

const results = rows.map((r) => ({
  test: r.id,
  invariant: r.invariant,
  classes: r.classes,
  extension: EXTENSION_TESTS.includes(r.id),
  outcome: passed.has(r.id) ? 'passed' : failed.has(r.id) ? 'failed' : 'not-run',
}));

const counts = {
  registered: totalRegistered,
  selected: rows.length,
  passed: results.filter((r) => r.outcome === 'passed').length,
  failed: results.filter((r) => r.outcome === 'failed').length,
  notRun: results.filter((r) => r.outcome === 'not-run').length,
};

console.log('');
console.log(`  register        ${totalRegistered} tests (${totalRegistered - EXPECTED_EXTENSION} core + ${EXPECTED_EXTENSION} extension), §A`);
console.log(`  files           ${onDisk.length} present, 0 missing, 0 unregistered`);
console.log(`  selected        ${counts.selected}${wantClass ? ` for ${wantClass}` : ''}${filter ? ` matching ${filter}` : ''}`);
console.log(`  passed          ${counts.passed}`);
console.log(`  failed          ${counts.failed}`);
if (counts.notRun > 0) console.log(`  not run         ${counts.notRun}`);
console.log('');

/* --- 4. T-P9-2, and only then the report -------------------------------- */

const pins = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'spec', 'pins.json'), 'utf8'));
const countNulls = (node) => {
  if (node === null) return 1;
  if (Array.isArray(node)) return node.reduce((n, v) => n + countNulls(v), 0);
  if (typeof node === 'object') return Object.values(node).reduce((n, v) => n + countNulls(v), 0);
  return 0;
};
const unfilled = countNulls(pins);

if (unfilled > 0) {
  console.log(
    `  NO REPORT — ${unfilled} unfilled pins in spec/pins.json (T-P9-2).\n` +
      '  The suite refuses to produce a report while any pin is null, and there is no flag\n' +
      '  that overrides it. Until then no conformance claim is possible (§1.6).',
  );
  console.log('');
  process.exit(counts.failed > 0 ? 1 : 0);
}

const { writeReport } = await import('./report.mjs');
const written = writeReport({ reportsDir, results, counts, pins, wantClass });
console.log(`  report          ${path.relative(REPO_ROOT, written.file)}`);
console.log(`  reportDigest    ${written.digest}`);
console.log('');
process.exit(counts.failed > 0 ? 1 : 0);
