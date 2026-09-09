/**
 * Write a stub for every test in §A that has no file yet.
 *
 * `conformance/README.md`: "85 tests — 80 core and 5 extension. Every one of
 * them becomes one test file, keyed by its identifier." This writes the ones
 * that are missing and NEVER touches one that exists, so a test that has been
 * expanded can never be reverted to a stub by running this again.
 *
 * Each stub fails, and it fails saying what it is for: its identifier, the
 * invariant it serves in §12's words, the classes §A names, and §A's sketch
 * verbatim. A stub that passed would be a test that is not yet written telling
 * the suite that it is.
 *
 * Run: `node conformance/scaffold.mjs` (`--check` to report without writing).
 */
import fs from 'node:fs';
import path from 'node:path';
import { EXTENSION_TESTS, REPO_ROOT, faults, invariantTitles, registerRows } from './register.mjs';

const checkOnly = process.argv.includes('--check');
const testsDir = path.join(REPO_ROOT, 'conformance', 'tests');

const found = faults();
if (found.length > 0) {
  console.error('scaffold: the register does not agree with the specification; fix that first.');
  for (const f of found) console.error(`  ${f}`);
  process.exit(1);
}

fs.mkdirSync(testsDir, { recursive: true });

const titles = invariantTitles();
const rows = registerRows();

/** Escape a sketch for a single-quoted JavaScript string. */
const q = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

function stub(row) {
  const title = titles.get(row.invariant) ?? row.invariant;
  const isExtension = EXTENSION_TESTS.includes(row.id);
  const extensionNote = isExtension
    ? `\n * EXTENSION (§16.1, D-111): this test binds only a release whose claim names\n * the extension it belongs to. \`RELEASE.extensions\` is empty, so it is not\n * required of this release — and it is registered, so it is not forgotten.\n *`
    : '';

  return `/**
 * ${row.id} — ${row.invariant} (${title}).
 *
 * Classes: ${row.classes.join(', ')}.
 * Register: ${row.status}
 *${extensionNote}
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (\`conformance/README.md\`):
 *
 *   ${row.sketch.replace(/\n/g, ' ')}
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('${row.id} — ${q(title)}', () => {
  throw new Error(
    '${row.id} NOT EXPANDED — serves ${row.invariant} (${q(title)}), classes ${q(row.classes.join(', '))}. ' +
      'Sketch: ${q(row.sketch.replace(/\n/g, ' '))}',
  );
});
`;
}

let written = 0;
let kept = 0;
const missing = [];

for (const row of rows) {
  const file = path.join(testsDir, `${row.id}.test.ts`);
  if (fs.existsSync(file)) {
    kept += 1;
    continue;
  }
  missing.push(row.id);
  if (!checkOnly) {
    fs.writeFileSync(file, stub(row), 'utf8');
    written += 1;
  }
}

// A file with no row in §A is a test nobody registered, which is exactly what
// "every named test exists" is meant to exclude in the other direction.
const ids = new Set(rows.map((r) => r.id));
const stray = fs
  .readdirSync(testsDir)
  .filter((f) => f.endsWith('.test.ts'))
  .map((f) => f.replace(/\.test\.ts$/, ''))
  .filter((id) => !ids.has(id));

if (stray.length > 0) {
  console.error(`scaffold: ${stray.length} test file(s) with no row in §A: ${stray.join(', ')}`);
  process.exit(1);
}

if (checkOnly) {
  if (missing.length > 0) {
    console.error(`scaffold --check: ${missing.length} test(s) in §A have no file: ${missing.join(', ')}`);
    process.exit(1);
  }
  console.log(`scaffold --check PASS — all ${rows.length} tests in §A have a file, and no file is unregistered.`);
} else {
  console.log(`scaffold — ${written} written, ${kept} left alone, ${rows.length} in §A.`);
}
