/**
 * The register, read from §A — one parser, used by the runner and by the
 * extract-and-diff.
 *
 * `spec/CONFORMANCE_TESTS_v0_5.md` §A is the register: 83 tests, 78 core and 5
 * extension. `conformance/README.md`: "Every one of them becomes one test file,
 * keyed by its identifier." Nothing here is normative — the specification and
 * §A are — but everything that reads §A reads it through this file, so that two
 * readings cannot disagree about what the register says.
 *
 * §A is read AS ROWS and never by grepping the ledger, because §A's own footer
 * names `T-P5-4`, the test D-112 dropped: a grep of the whole file finds 84
 * identifiers where the register holds 83.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LEDGER = path.join(REPO_ROOT, 'spec', 'CONFORMANCE_TESTS_v0_5.md');
export const SPEC = path.join(REPO_ROOT, 'spec', 'WISHMAIL_SPEC_v0_5.md');

/** §A's own tally, and `conformance/README.md`'s. */
export const EXPECTED_TOTAL = 83;
export const EXPECTED_EXTENSION = 5;

/**
 * The five extension tests. §16.1 and D-111: they "bind only a release that
 * names that extension in its claim", and `RELEASE.extensions` is empty.
 */
export const EXTENSION_TESTS = ['T-P2-3', 'T-P5-5', 'T-P6-6', 'T-P11-7', 'T-P12-7'];

/**
 * One row of §A.
 * @typedef {{id: string, invariant: string, classes: string[], sketch: string,
 *            status: string, extension: boolean}} Row
 */

/**
 * Every row of §A, in file order.
 * @returns {Row[]}
 */
export function registerRows() {
  const lines = fs.readFileSync(LEDGER, 'utf8').split(/\r?\n/);
  const start = lines.findIndex((l) => l.startsWith('## A. '));
  if (start < 0) throw new Error('ledger §A not found');

  /** @type {Row[]} */
  const rows = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.startsWith('## ')) break;
    const m = /^\|\s*(T-P\d+-\d+)\s*\|(.*)$/.exec(line);
    if (m === null) continue;
    // Split on unescaped pipes; §A's sketches contain none, and a row that did
    // would be caught by the column count below.
    const cells = m[2].split('|').map((c) => c.trim());
    if (cells.length < 4) throw new Error(`§A row ${m[1]} does not have five columns`);
    rows.push({
      id: m[1],
      invariant: cells[0],
      classes: cells[1].split(',').map((c) => c.trim()).filter((c) => c !== ''),
      sketch: cells[2],
      status: cells[3],
      extension: /;\s*extension\)/.test(line),
    });
  }
  return rows;
}

/** Every `T-P<n>-<m>` mentioned anywhere in the specification. */
export function specIds() {
  return new Set(fs.readFileSync(SPEC, 'utf8').match(/T-P\d+-\d+/g) ?? []);
}

/**
 * The seventeen invariants of §12.2, by identifier — `P-1` to its title. Read
 * from the specification rather than copied, so a stub that names "P-1
 * (Binding)" is naming what §12.2 currently calls it.
 * @returns {Map<string, string>}
 */
export function invariantTitles() {
  const text = fs.readFileSync(SPEC, 'utf8');
  const out = new Map();
  for (const m of text.matchAll(/\*\*(P-\d+) — ([^.*]+)\.\*\*/g)) out.set(m[1], m[2].trim());
  if (out.size !== 17) throw new Error(`§12.2 gave ${out.size} invariants, expected 17`);
  return out;
}

/**
 * Check the register against its own tally and against the specification, both
 * ways. Returns a list of faults; empty is a pass.
 * @returns {string[]}
 */
export function faults() {
  const rows = registerRows();
  const ids = new Set(rows.map((r) => r.id));
  const spec = specIds();
  const found = [];

  const specOnly = [...spec].filter((id) => !ids.has(id)).sort();
  const registerOnly = [...ids].filter((id) => !spec.has(id)).sort();
  if (specOnly.length) found.push(`in the specification, not in §A: ${specOnly.join(', ')}`);
  if (registerOnly.length) found.push(`in §A, not in the specification: ${registerOnly.join(', ')}`);

  if (rows.length !== ids.size) found.push(`§A holds ${rows.length - ids.size} duplicate row(s)`);
  if (ids.size !== EXPECTED_TOTAL) found.push(`§A holds ${ids.size} tests, expected ${EXPECTED_TOTAL}`);

  const extension = rows.filter((r) => r.extension).map((r) => r.id).sort();
  if (extension.join(',') !== [...EXTENSION_TESTS].sort().join(',')) {
    found.push(`§A marks ${extension.join(', ') || 'none'} as extension; expected ${EXTENSION_TESTS.join(', ')}`);
  }
  return found;
}
