/**
 * T-P9-2 — P-9 (Strict standards).
 *
 * Classes: all.
 * Register: NAMED (§1.6)
 * @fixture-kind artifact
 *
 * §A’s sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   The suite refuses to produce a report when `spec/pins.json` (tracking §1.6 and the §4.1 stamp token / treasury) contains an unfilled pin.
 *
 * EXPANDED 2026-09-10 against `spec/pins.json` and a doctored copy of it in a
 * scratch directory. **Nothing here writes to `spec/pins.json`.** A test that
 * edited the real file and restored it would leave the repository wrong if it
 * crashed between the two, and this is the one file whose wrongness silently
 * permits a claim.
 *
 * WHY THE GATE IS WORTH MORE THAN THE CONVENIENCE. §1.6’s second MUST is that a
 * claim MUST NOT be made against a version whose pins are unfilled, and a pin is
 * the substance of P-9: conformance is to a named revision of a named text, and
 * a null pin means nobody has said which text. The refusal is therefore
 * unconditional — there is deliberately no flag that produces a report anyway,
 * because a way past T-P9-2 would be a way past P-9.
 *
 * THE PREDICATE IS WRITTEN TWICE ON PURPOSE. `app/src/ops/pins.ts` counts the
 * nulls for the tools; the runner counts them again inline before it will import
 * the report writer; and this body counts them a third time from §1.6’s sentence.
 * Three readings that must agree is how a gate this important is held, and the
 * body checks they do.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { unfilledPins } from '../../app/src/ops/pins.js';
import { REPO_ROOT } from '../support/fixtures.js';

/** §1.6’s sentence, counted: "a value of null is an UNFILLED pin". */
function nulls(node: unknown): number {
  if (node === null) return 1;
  if (Array.isArray(node)) return node.reduce<number>((n, v) => n + nulls(v), 0);
  if (typeof node === 'object') return Object.values(node as Record<string, unknown>).reduce<number>((n, v) => n + nulls(v), 0);
  return 0;
}

test('T-P9-2 — Strict standards', () => {
  const real = path.join(REPO_ROOT, 'spec', 'pins.json');
  const pins = JSON.parse(fs.readFileSync(real, 'utf8')) as Record<string, unknown>;

  // --- Today: no unfilled pin, by three readings that agree. --------------
  assert.equal(nulls(pins), 0, 'spec/pins.json carries no unfilled pin, so a report is permitted (§1.6)');
  assert.equal(unfilledPins(REPO_ROOT), 0, 'and the tools count the same');

  // The §4.1 half the sketch names explicitly: the stamp token and its treasury
  // for the deployed ledger tag. A null here would block a claim as surely as a
  // null standard, and D-154 is why `hedera:mainnet` is absent rather than null.
  const stampToken = pins['stampToken'] as Record<string, unknown>;
  const testnet = stampToken['hedera:testnet'] as { tokenId?: unknown; treasury?: unknown } | undefined;
  assert.ok(testnet !== undefined, 'the deployed ledger tag has a stamp-token entry (§4.1)');
  assert.equal(typeof testnet.tokenId, 'string', 'with a token');
  assert.equal(typeof testnet.treasury, 'string', 'and a treasury');
  assert.equal(
    Object.prototype.hasOwnProperty.call(stampToken, 'hedera:mainnet'),
    false,
    'a tag this version does not deploy to is absent rather than null (D-154): a null means a pin this deployment owes',
  );

  // --- A pin nulled, in a scratch copy: the count rises. ------------------
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'wishmail-tp92-'));
  try {
    fs.mkdirSync(path.join(scratch, 'spec'), { recursive: true });

    for (const [label, doctor] of [
      ['a standard', (p: Record<string, unknown>) => {
        const standards = p['standards'] as Record<string, Record<string, unknown>>;
        (standards['hcs-10'] as Record<string, unknown>)['blobSha'] = null;
      }],
      ['a registered schema', (p: Record<string, unknown>) => {
        const registered = p['registeredSchemas'] as Record<string, Record<string, unknown>>;
        (registered['chunk'] as Record<string, unknown>)['sha256'] = null;
      }],
      ['the stamp token', (p: Record<string, unknown>) => {
        const token = p['stampToken'] as Record<string, Record<string, unknown>>;
        (token['hedera:testnet'] as Record<string, unknown>)['tokenId'] = null;
      }],
    ] as const) {
      const doctored = JSON.parse(fs.readFileSync(real, 'utf8')) as Record<string, unknown>;
      doctor(doctored);
      fs.writeFileSync(path.join(scratch, 'spec', 'pins.json'), JSON.stringify(doctored, null, 2));

      assert.equal(nulls(doctored), 1, `${label} nulled: §1.6’s sentence counts one unfilled pin`);
      assert.equal(unfilledPins(scratch), 1, `${label} nulled: the tools count one, and a report is refused`);
    }
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }

  // The real file is untouched by all of the above.
  assert.equal(nulls(JSON.parse(fs.readFileSync(real, 'utf8'))), 0, 'spec/pins.json was not written to');

  // --- There is no flag that produces a report anyway. --------------------
  //
  // The refusal is in the runner, before the report writer is even imported.
  // What is asserted is the absence of a way past it, which is a property of
  // the source and is read there.
  const runner = fs.readFileSync(path.join(REPO_ROOT, 'conformance', 'runner.mjs'), 'utf8');
  assert.ok(runner.includes('NO REPORT'), 'the runner refuses in so many words');
  assert.ok(
    runner.indexOf('unfilled > 0') < runner.indexOf("await import('./report.mjs')"),
    'and it refuses BEFORE the report writer is reachable',
  );
  for (const escape of ['--force', '--anyway', '--no-pins', '--skip-pins', '--allow-unfilled']) {
    assert.equal(runner.includes(escape), false, `the runner offers no ${escape}: a way past T-P9-2 is a way past P-9`);
  }
});
