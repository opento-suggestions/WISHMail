/**
 * `npm run check:store` — the store survives a restart, and a replay keeps the
 * first row.
 *
 * Those are the two properties §14.2 asks for and that T-P11-5 and T-P11-6
 * test. A restart is modelled the way it actually happens: every handle is
 * dropped and the namespace is opened again over the same directory, with
 * nothing carried across in memory.
 *
 * It runs against a scratch directory, never `WISHMAIL_STATE_DIR`, so running
 * it cannot disturb a Postmaster's real record.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { open } from './store.js';

const failures: string[] = [];
let checked = 0;

function is(name: string, got: unknown, want: unknown): void {
  checked += 1;
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g !== w) failures.push(`${name}\n    got   ${g}\n    want  ${w}`);
}

function ok(name: string, condition: boolean): void {
  checked += 1;
  if (!condition) failures.push(name);
}

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'wishmail-store-'));

try {
  const receipt = { txRef: '0.0.8641261@1788894030.895915675', amount: 12, tokenId: '0.0.10426208' };

  // --- A row is written, and read back through the same handle. -------------
  {
    const s = open(scratch, 'payments');
    is('a fresh namespace is empty', s.keys(), []);
    is('put writes', s.put('0.0.5@1788894030.895915675', receipt), 'written');
    is('get returns the value', s.get<typeof receipt>('0.0.5@1788894030.895915675')?.value, receipt);
    ok('the entry carries when it was written', typeof s.get('0.0.5@1788894030.895915675')?.writtenAt === 'string');
  }

  // --- The restart. Every handle above is out of scope; nothing is in memory.
  {
    const s = open(scratch, 'payments');
    is('the row survives a restart (T-P11-6)', s.get<typeof receipt>('0.0.5@1788894030.895915675')?.value, receipt);

    // §14.2: "A payment reference MUST settle at most one purchase." A second
    // write under the same reference is T-P11-5's replay, and the first row is
    // what must come back.
    is('a replayed reference keeps the first row (T-P11-5)', s.put('0.0.5@1788894030.895915675', { txRef: 'a second transfer', amount: 999 }), 'kept');
    is('and the first receipt is what is returned', s.get<typeof receipt>('0.0.5@1788894030.895915675')?.value, receipt);

    // Overwrite is available, but only when asked for by name.
    is('overwrite is possible when asked for', s.put('0.0.5@1788894030.895915675', { ...receipt, amount: 1 }, { overwrite: true }), 'written');
    is('and it took', s.get<typeof receipt>('0.0.5@1788894030.895915675')?.value.amount, 1);
  }

  // --- Retention, listing, removal, and namespace separation. ---------------
  {
    const s = open(scratch, 'payments');
    s.put('later', { n: 2 }, { retainUntil: '2026-12-31T00:00:00.000Z' });
    is('retainUntil is kept as given', s.get('later')?.retainUntil, '2026-12-31T00:00:00.000Z');
    is('keys are sorted', s.keys(), ['0.0.5@1788894030.895915675', 'later']);
    is('entries match keys', s.entries().map((e) => e.key), ['0.0.5@1788894030.895915675', 'later']);
    is('remove reports', s.remove('later'), true);
    is('removing again reports nothing removed', s.remove('later'), false);
    is('get on a missing key is undefined', s.get('later'), undefined);

    const other = open(scratch, 'requirements');
    is('a second namespace is its own directory', other.keys(), []);
    other.put('req-1', { scheme: 'exact' });
    is('and does not leak into the first', s.keys(), ['0.0.5@1788894030.895915675']);
  }

  // --- A key that would be a surprising path is refused, not escaped. -------
  {
    const s = open(scratch, 'payments');
    for (const bad of ['../escape', 'with/slash', '', 'a'.repeat(300)]) {
      checked += 1;
      try {
        s.put(bad, { n: 0 });
        failures.push(`the key ${JSON.stringify(bad)} was accepted, and must not have been`);
      } catch {
        /* refusing is the pass */
      }
    }
    ok('no stray file was created', s.keys().length === 1);
  }

  // --- No temp file is left behind. ----------------------------------------
  ok(
    'no .tmp file survives a write',
    fs.readdirSync(path.join(scratch, 'payments')).every((f) => !f.endsWith('.tmp')),
  );
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error(`check:store FAILED — ${failures.length} of ${checked} assertions:`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log(
  `check:store PASS — ${checked} assertions: a row survives a restart, a replayed reference keeps the first ` +
    'row, namespaces do not leak, and an unsafe key is refused rather than escaped.',
);
