/**
 * The report — the artifact a conformance claim names.
 *
 * §5.10 gives the claim `suite {version, date, reportDigest}`, and T-P15-3
 * fixes what that digest is for: "the report reached through
 * `suite.reportDigest` is one the suite produced, its digest matches, and it
 * records that class's suite as passed in full."
 *
 * So the report says, per class, which tests ran and how each came out, and its
 * digest is computed the way §5.1 computes every digest in this specification:
 * SHA-256 over the canonical JSON (RFC 8785) of the object with the hash field
 * itself absent. `generated` is excluded too, and for the same reason §11.6
 * excludes `observations` from an evidence bundle: two runs of the same suite
 * over the same tests at two clocks cannot agree on it, and a digest that moved
 * with the clock would name nothing.
 *
 * This module is never reached while a pin is unfilled: the runner applies
 * T-P9-2 before importing it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import canonicalize from 'canonicalize';
import { EXPECTED_EXTENSION, EXPECTED_TOTAL } from './register.mjs';

/** §5.1's hashing rule. */
function digestOf(value) {
  const s = canonicalize(value);
  if (s === undefined) throw new Error('canonicalize returned undefined');
  return createHash('sha256').update(Buffer.from(s, 'utf8')).digest('hex');
}

/**
 * Write one report and return its path and digest.
 *
 * @param {{reportsDir: string, results: object[], counts: object, pins: object,
 *          wantClass: string|undefined}} args
 */
export function writeReport({ reportsDir, results, counts, pins, wantClass }) {
  const scope = wantClass ?? 'all';

  const body = {
    _readme:
      'A conformance-suite report. §5.10 ConformanceClaim.suite.reportDigest names the `digest` below, ' +
      'which is SHA-256 over the canonical JSON (RFC 8785) of this object with `digest` and `generated` ' +
      'absent (§5.1). `generated` is excluded for the reason §11.6 excludes observations: two runs at two ' +
      'clocks cannot agree on it. A claim naming a class whose row here is not `passed in full` is refused ' +
      '(T-P15-3).',
    spec: pins.spec,
    minorVersion: pins.minorVersion,
    scope,
    register: {
      total: EXPECTED_TOTAL,
      core: EXPECTED_TOTAL - EXPECTED_EXTENSION,
      extension: EXPECTED_EXTENSION,
      source: 'spec/CONFORMANCE_TESTS_v0_5.md §A',
    },
    counts,
    passedInFull: counts.failed === 0 && counts.notRun === 0,
    pins: {
      standards: Object.fromEntries(
        Object.entries(pins.standards).map(([k, v]) => [k, { commit: v.commit, blobSha: v.blobSha }]),
      ),
      unfilled: 0,
    },
    results: [...results].sort((a, b) => a.test.localeCompare(b.test)),
  };

  const report = { ...body, generated: new Date().toISOString(), digest: digestOf(body) };

  fs.mkdirSync(reportsDir, { recursive: true });
  const file = path.join(reportsDir, `${scope}.json`);
  fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return { file, digest: report.digest };
}
