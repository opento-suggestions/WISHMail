/**
 * The extract-and-diff, as a script rather than a shell pipeline.
 *
 * CLAUDE.md §9 and CONTRIBUTING.md require, after any edit to the specification
 * or the ledger, that every `T-P*` identifier in the specification exists as a
 * row in ledger §A and every row in §A appears in the specification. This runs
 * that check in both directions and exits non-zero on any divergence.
 *
 * The reading of §A lives in `conformance/register.mjs`, which the conformance
 * runner also uses: one parser, so the check and the suite cannot disagree
 * about what the register says. That file records why §A is read as rows and
 * never grepped.
 */
import { EXPECTED_EXTENSION, EXPECTED_TOTAL, faults, registerRows } from '../conformance/register.mjs';

const found = faults();
if (found.length > 0) {
  console.error('extract-and-diff FAILED:');
  for (const f of found) console.error(`  ${f}`);
  process.exit(1);
}

const rows = registerRows();
console.log(
  `extract-and-diff PASS — ${EXPECTED_TOTAL} tests (${EXPECTED_TOTAL - EXPECTED_EXTENSION} core + ` +
    `${EXPECTED_EXTENSION} extension), one-for-one between the specification and ledger §A, both ways; ` +
    `${rows.filter((r) => r.status.startsWith('EXPANDED')).length} expanded.`,
);
