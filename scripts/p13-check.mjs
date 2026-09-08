/**
 * P-13's gate, as a script rather than a shell one-liner.
 *
 * P-13: the Postmaster holds no agent key, ever. Structurally, that means the
 * names under which private-key material reaches this process are read in
 * exactly two modules — `app/src/ops/env.ts`, which reads the value, and
 * `app/src/ops/identity.ts`, which turns it into a `Signer` and lets nothing
 * else out. Every other module takes a `Signer` and cannot leak a key even by
 * accident, because it is not holding one. This checks that, and fails if any
 * third module learns one of those names.
 *
 * It is a file and not a `package.json` one-liner because the one-liner was
 * `git grep … | grep -v … ; test $? -eq 1`, and npm on Windows runs a script
 * through `cmd.exe`, which parses neither the single quotes nor `test`. The
 * gate exited 255 without ever running the grep — a security check that always
 * "fails open" on the machine the build is done on is worse than none, because
 * a red exit code reads as tooling noise. Node runs the same way everywhere.
 *
 * Conformance: T-P13-1, T-P13-2.
 */
import { execFileSync } from 'node:child_process';

/**
 * The env names this gate watches. `OPERATOR_DER_KEY` is deliberately not among
 * them: the operator is the Postmaster's own payer (D-47, "the Postmaster
 * pays"), not an agent, so an entrypoint naming it is exactly what P-13
 * permits — and it names it only to hand it to `fromEnv`, which is in
 * identity.ts, so no key material leaves that module either way.
 */
const SECRET_NAMES = /(AGENT|TREASURY)_DER_KEY/;

/** The only two modules permitted to name them. See the module comment. */
const ALLOWED = new Set(['app/src/ops/env.ts', 'app/src/ops/identity.ts']);

let out = '';
try {
  out = execFileSync('git', ['grep', '-nE', SECRET_NAMES.source, '--', 'app/src'], {
    encoding: 'utf8',
  });
} catch (e) {
  // `git grep` exits 1 with no output when nothing matches. That is the
  // clean case; any other failure is a real error and must not pass silently.
  const err = /** @type {{status?: number, stderr?: string}} */ (e);
  if (err.status !== 1) {
    console.error(`p13:check could not run git grep: ${err.stderr ?? String(e)}`);
    process.exit(2);
  }
}

const offenders = out
  .split('\n')
  .filter((line) => line.trim() !== '')
  .filter((line) => !ALLOWED.has(line.slice(0, line.indexOf(':'))));

if (offenders.length > 0) {
  console.error('p13:check FAILED — a key name is read outside env.ts and identity.ts (P-13):');
  for (const line of offenders) console.error(`  ${line}`);
  process.exit(1);
}

console.log(`p13:check PASS — ${SECRET_NAMES.source} read only in ${[...ALLOWED].join(', ')}`);
