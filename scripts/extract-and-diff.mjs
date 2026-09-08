/**
 * The extract-and-diff, as a script rather than a shell pipeline.
 *
 * CLAUDE.md §9 and CONTRIBUTING.md require, after any edit to the specification
 * or the ledger, that every `T-P*` identifier in the specification exists as a
 * row in ledger §A and every row in §A appears in the specification. This runs
 * that check in both directions and exits non-zero on any divergence.
 *
 * It reads §A **as rows**, not by grepping the whole ledger, and that is not a
 * detail: §A's own footer names `T-P5-4`, the test D-112 dropped, so a naive
 * grep of the ledger finds 84 identifiers where the register holds 83.
 *
 * The register's size is asserted too — 83 (78 core + 5 extension) — because a
 * row silently lost from §A and its `Conformance:` note silently lost from the
 * specification would agree with each other and with nothing else.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPEC = path.join(root, 'spec', 'WISHMAIL_SPEC_v0_5.md');
const LEDGER = path.join(root, 'spec', 'CONFORMANCE_TESTS_v0_5.md');

const EXPECTED_TOTAL = 83;
const EXPECTED_EXTENSION = 5;

/** Every `T-P<n>-<m>` mentioned anywhere in the specification. */
function specIds() {
  const text = fs.readFileSync(SPEC, 'utf8');
  return new Set(text.match(/T-P\d+-\d+/g) ?? []);
}

/**
 * §A's rows. The register runs from the table's header line to the first blank
 * line after it; a row is `| T-P<n>-<m> | …` and nothing else is.
 */
function registerRows() {
  const lines = fs.readFileSync(LEDGER, 'utf8').split(/\r?\n/);
  const start = lines.findIndex((l) => l.startsWith('## A. '));
  if (start < 0) throw new Error('ledger §A not found');
  const rows = [];
  for (let i = start; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.startsWith('## ') && i > start) break;
    const m = /^\|\s*(T-P\d+-\d+)\s*\|/.exec(line);
    if (m) rows.push({ id: m[1], extension: /;\s*extension\)/.test(line) });
  }
  return rows;
}

const spec = specIds();
const rows = registerRows();
const register = new Set(rows.map((r) => r.id));

const specOnly = [...spec].filter((id) => !register.has(id)).sort();
const registerOnly = [...register].filter((id) => !spec.has(id)).sort();
const duplicates = rows.length - register.size;
const extension = rows.filter((r) => r.extension).length;

const faults = [];
if (specOnly.length) faults.push(`in the specification, not in §A: ${specOnly.join(', ')}`);
if (registerOnly.length) faults.push(`in §A, not in the specification: ${registerOnly.join(', ')}`);
if (duplicates) faults.push(`§A holds ${duplicates} duplicate row(s)`);
if (register.size !== EXPECTED_TOTAL) faults.push(`§A holds ${register.size} tests, expected ${EXPECTED_TOTAL}`);
if (extension !== EXPECTED_EXTENSION) faults.push(`§A marks ${extension} extension tests, expected ${EXPECTED_EXTENSION}`);

if (faults.length) {
  console.error('extract-and-diff FAILED:');
  for (const f of faults) console.error(`  ${f}`);
  process.exit(1);
}

console.log(
  `extract-and-diff PASS — ${register.size} tests (${register.size - extension} core + ${extension} extension), ` +
    'one-for-one between the specification and ledger §A, both ways.',
);
