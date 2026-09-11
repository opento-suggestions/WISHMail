/**
 * T-P15-3 — P-15 (Claims are scoped).
 *
 * Classes: all.
 * Register: NAMED (§1.5; D-134)
 * @fixture-kind artifact
 *
 * §A’s sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   A **claim** names no class whose suite did not pass in full: for every class the claim names, the report reached through `suite.reportDigest` is one the suite produced, its digest matches, and it records that class’s suite as passed in full; a claim naming a class whose report records a failure, or naming a report the suite did not produce, is rejected.
 *
 * EXPANDED 2026-09-10 against the report the suite last produced.
 *
 * WHY THE RULE IS IMPLEMENTED HERE. §1.5’s MUST is a rule about claims, and
 * nothing in `app/` claims anything — `RELEASE.classes` is empty, which is the
 * rule obeyed by silence rather than by machinery. So the body IS the reader
 * §1.5 describes: it takes a claim and a reports directory and answers whether
 * the claim stands. Written from the sentence, checked against real claims —
 * the one this release would publish, and three that must be refused.
 *
 * THE THREE REFUSALS ARE THE TEST. A rule that only ever saw a claim it accepts
 * is a rule nobody has tried. So: a claim naming a class the report records as
 * failing; a claim naming a digest no report carries; and a claim whose digest
 * belongs to a report that has been edited since — the case that matters most,
 * because a report is a file and a file can be changed, and the digest is what
 * makes that detectable.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import canonicalize from 'canonicalize';
import { RELEASE, type ConformanceClass } from '../../app/src/release.js';
import { REPO_ROOT } from '../support/fixtures.js';

interface Result {
  readonly test: string;
  readonly classes: readonly string[];
  readonly extension: boolean;
  readonly outcome: string;
}
interface Report {
  readonly digest: string;
  readonly generated: string;
  readonly results: readonly Result[];
  readonly [key: string]: unknown;
}

function digestOfReport(report: Report): string {
  const { digest: _digest, generated: _generated, ...body } = report;
  const s = canonicalize(body);
  assert.ok(s !== undefined, 'the report canonicalizes');
  return createHash('sha256').update(Buffer.from(s, 'utf8')).digest('hex');
}

interface Claim {
  readonly classes: readonly ConformanceClass[];
  readonly suite: { readonly reportDigest: string };
}

/**
 * §1.5’s rule, written from the sentence. Returns the reason a claim is
 * rejected, or `null` where it stands.
 */
function reject(claim: Claim, reports: readonly Report[]): string | null {
  // "the report reached through `suite.reportDigest` is one the suite produced"
  const named = reports.find((r) => r.digest === claim.suite.reportDigest);
  if (named === undefined) return 'the claim names a report the suite did not produce';

  // "its digest matches" — the file could have been edited after it was written.
  if (digestOfReport(named) !== named.digest) return 'the report does not recompute to the digest it carries';

  // "it records that class’s suite as passed in full"
  for (const wanted of claim.classes) {
    const rows = named.results.filter((r) => r.classes.includes(wanted) || r.classes.includes('all'));
    if (rows.length === 0) return `the report records no test for ${wanted}`;
    // An extension test binds only a release that names the extension (§16.1),
    // and this rule is about the class’s own suite.
    const failing = rows.filter((r) => !r.extension && r.outcome !== 'passed');
    if (failing.length > 0) {
      return `${wanted}'s suite did not pass in full: ${failing.length} of ${rows.length} did not pass`;
    }
  }
  return null;
}

test('T-P15-3 — Claims are scoped', () => {
  const dir = path.join(REPO_ROOT, 'conformance', 'reports');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  assert.ok(files.length > 0, 'the suite has produced at least one report (§5.10)');
  const reports = files.map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as Report);

  const report = reports.find((r) => r.results.length > 0);
  assert.ok(report !== undefined, 'a report that records results');

  // --- The claim this release would publish. ------------------------------
  //
  // It names no class, so the loop over classes does not run and nothing is
  // claimed. "Silence claims nothing" is not a loophole here — it is the rule
  // holding trivially because there is nothing to check.
  const silent: Claim = { classes: [...RELEASE.classes], suite: { reportDigest: report.digest } };
  assert.equal(reject(silent, reports), null, 'a claim naming no class stands (§1.5, "silence claims nothing")');
  assert.equal(RELEASE.classes.length, 0, 'and this release names none');

  // --- A claim naming a class whose suite did not pass in full. -----------
  const classes: ConformanceClass[] = ['VERIFIER', 'CORRESPONDENT', 'RECIPIENT', 'POSTMASTER'];
  let refusedForFailure = 0;
  for (const wanted of classes) {
    const rows = report.results.filter((r) => r.classes.includes(wanted) || r.classes.includes('all'));
    const passesInFull = rows.length > 0 && rows.filter((r) => !r.extension).every((r) => r.outcome === 'passed');
    const verdict = reject({ classes: [wanted], suite: { reportDigest: report.digest } }, reports);

    if (passesInFull) {
      assert.equal(verdict, null, `${wanted} passes in full in this report, so a claim naming it stands`);
    } else {
      assert.ok(verdict !== null, `${wanted} does not pass in full, so a claim naming it is rejected (§1.5, D-134)`);
      refusedForFailure += 1;
    }
  }
  assert.ok(
    refusedForFailure > 0,
    'at least one class does not pass in full, so the refusal was actually exercised rather than assumed',
  );

  // --- A claim naming a report the suite did not produce. -----------------
  assert.ok(
    reject({ classes: [], suite: { reportDigest: 'f'.repeat(64) } }, reports) !== null,
    'a claim naming a digest no report carries is rejected',
  );
  assert.ok(
    reject({ classes: ['VERIFIER'], suite: { reportDigest: 'f'.repeat(64) } }, reports) !== null,
    'and naming a class does not rescue it',
  );

  // --- A report edited after it was written. ------------------------------
  //
  // The digest is what makes this detectable, and it is why §5.10 carries one.
  const tampered: Report = {
    ...report,
    results: report.results.map((r) => (r.outcome === 'failed' ? { ...r, outcome: 'passed' } : r)),
  };
  assert.notEqual(digestOfReport(tampered), tampered.digest, 'editing a report moves what it recomputes to');
  assert.equal(
    reject({ classes: ['VERIFIER'], suite: { reportDigest: tampered.digest } }, [tampered]),
    'the report does not recompute to the digest it carries',
    'a claim resting on an edited report is rejected before its outcomes are read',
  );
});
