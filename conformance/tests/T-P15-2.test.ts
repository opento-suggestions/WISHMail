/**
 * T-P15-2 — P-15 (Claims are scoped).
 *
 * Classes: all.
 * Register: NAMED (§1.5, §15.4)
 * @fixture-kind artifact
 *
 * §A’s sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   `LIMITATIONS.md` is present, carries a section for each of L-1 – L-14 in order, and every claim that a limitation does not apply names a test the suite ran and passed.
 *
 * EXPANDED 2026-09-10 against `LIMITATIONS.md` and `spec/CONFORMANCE_TESTS_v0_5.md` §A.
 *
 * WHY THE EXPECTATION FOLLOWS FROM THE TEXT. §15.4 requires the document and
 * §1.5 makes it part of what a claim names. The ORDER is not decoration: §15.3
 * numbers the limitations, and a reader checking whether a deployment addresses
 * L-7 should find L-7 where L-7 belongs rather than hunting. The third clause is
 * the one with teeth — a limitation that a release says does not apply to it is
 * a claim, and §1.5’s whole posture is that a claim names the test that shows
 * it. A document that could say "does not apply" with nothing behind it would
 * be the one place in this specification where an assertion costs nothing.
 *
 * THE THIRD CLAUSE IS CURRENTLY VACUOUS, AND THE BODY SAYS SO RATHER THAN
 * HIDING IT. This release’s LIMITATIONS makes no "does not apply" claim about
 * any of the fourteen: every section states how the limitation applies. So the
 * clause holds because there is nothing for it to catch — which is a true pass
 * and a weak one, and the assertion below names the count so that a future
 * release which starts making such claims is caught by the same line.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from '../support/fixtures.js';
import { registerRows } from '../register.mjs';

/** §15.3’s fourteen, which §15.4’s document carries one section for each of. */
const LIMITATIONS = Array.from({ length: 14 }, (_, i) => `L-${i + 1}`);

test('T-P15-2 — Claims are scoped', () => {
  const file = path.join(REPO_ROOT, 'LIMITATIONS.md');
  assert.ok(fs.existsSync(file), 'LIMITATIONS.md is present (§15.4)');
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);

  // --- One section for each of L-1 – L-14, IN ORDER. ----------------------
  const headings: { id: string; line: number }[] = [];
  lines.forEach((line, i) => {
    const m = /^##\s+(L-\d+)\b/.exec(line);
    if (m !== null) headings.push({ id: m[1] as string, line: i + 1 });
  });

  assert.deepEqual(
    headings.map((h) => h.id),
    LIMITATIONS,
    'LIMITATIONS.md carries a section for each of L-1 – L-14, in order and with no other',
  );

  // Each section says something. A heading with nothing under it would satisfy
  // the letter of "carries a section" and none of its purpose.
  headings.forEach((h, i) => {
    const end = i + 1 < headings.length ? (headings[i + 1] as { line: number }).line - 1 : lines.length;
    const body = lines.slice(h.line, end).join('\n').trim();
    assert.ok(body.length > 0, `${h.id}: the section states how the limitation applies to this release`);
  });

  // --- Every "does not apply" names a test the suite ran and passed. ------
  const registered = new Set(registerRows().map((r) => r.id));
  const testsDir = path.join(REPO_ROOT, 'conformance', 'tests');

  const claims: { id: string; line: number; text: string }[] = [];
  let current = 'the preamble';
  lines.forEach((line, i) => {
    const m = /^##\s+(L-\d+)\b/.exec(line);
    if (m !== null) current = m[1] as string;
    // The preamble describes the convention; a claim is a section asserting it.
    if (current === 'the preamble') return;
    if (/does not apply|no longer applies|is not a limitation of this release/i.test(line)) {
      claims.push({ id: current, line: i + 1, text: line });
    }
  });

  for (const claim of claims) {
    const named = [...(claim.text.match(/T-P\d+-\d+/g) ?? [])];
    assert.ok(
      named.length > 0,
      `LIMITATIONS.md:${claim.line} (${claim.id}) says a limitation does not apply and names no test (§1.5)`,
    );
    for (const id of named) {
      assert.ok(registered.has(id), `LIMITATIONS.md:${claim.line}: ${id} is a row in §A`);
      assert.ok(
        fs.existsSync(path.join(testsDir, `${id}.test.ts`)),
        `LIMITATIONS.md:${claim.line}: ${id} exists in the suite`,
      );
      // "and passed": a test the suite ran and passed is what the report says,
      // and the report is written after this body runs. What is asserted here is
      // that the named test is one the suite RUNS — the passing half is
      // T-P15-3’s rule over the report, and the two are deliberately not one.
    }
  }

  // The count, so that a release which starts making such claims meets this
  // line rather than sailing past a clause that has never had work to do.
  assert.equal(
    claims.length,
    0,
    `this release makes no "does not apply" claim; ${claims.length} found, so each must name a passing test`,
  );

  // §1.5 names the document, so the path a claim would carry must reach it.
  assert.equal(path.basename(file), 'LIMITATIONS.md', 'the path a ConformanceClaim names (§5.10, T-P15-1)');
});
