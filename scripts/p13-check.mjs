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
 *
 * The pattern is deliberately wider than the two names that exist today.
 * It read `/(AGENT|TREASURY)_DER_KEY/`, and `AGENT_X25519_DER_KEY` — the
 * encryption key §9.2's declaration needs, and the first key here that is not
 * a Hedera key — walked straight past it. A gate that has to be edited every
 * time a key is added is a gate that will one day not be (D-151).
 */
const SECRET_NAMES = /(AGENT|TREASURY)[A-Z0-9_]*_KEY/;

/** The only two modules permitted to name them. See the module comment. */
const ALLOWED = new Set(['app/src/ops/env.ts', 'app/src/ops/identity.ts']);

/**
 * The Correspondent's side of the same gate.
 *
 * A Correspondent's keys do not travel under an environment name: the agent's
 * are in its keystore file and the operator's is a field in that operator's own
 * config (CLAUDE.md §11). So the second sweep watches the FIELD names, over
 * `app/sdk`, and permits exactly one module — the one that turns them into a
 * `Signer` and lets nothing else out. `home.ts` asks `keystore.ts` whether the
 * key is present rather than looking, which is why it is not on this list.
 *
 * The template is permitted because it is what an operator fills in, and it
 * ships with the field blank; `.gitignore` covers the filled one.
 *
 * It watches the names key material TRAVELS UNDER and never the file it sits
 * in: keystore.json was in this pattern for one run and is not, because knowing
 * a filename leaks nothing and home.ts has to build the path.
 */
const KEY_FIELDS = /\b(derKey|privateKey|secretKey)\b/;
const SDK_ALLOWED = new Set(['app/sdk/keystore.ts', 'app/sdk/config.template.json']);

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

let sdkOut = '';
try {
  sdkOut = execFileSync('git', ['grep', '-nE', KEY_FIELDS.source, '--', 'app/sdk'], { encoding: 'utf8' });
} catch (e) {
  const err = /** @type {{status?: number, stderr?: string}} */ (e);
  if (err.status !== 1) {
    console.error(`p13:check could not run git grep over app/sdk: ${err.stderr ?? String(e)}`);
    process.exit(2);
  }
}

const sdkOffenders = sdkOut
  .split('\n')
  .filter((line) => line.trim() !== '')
  .filter((line) => !SDK_ALLOWED.has(line.slice(0, line.indexOf(':'))));

if (sdkOffenders.length > 0) {
  console.error('p13:check FAILED — a Correspondent key field is named outside keystore.ts (P-13):');
  for (const line of sdkOffenders) console.error(`  ${line}`);
  process.exit(1);
}

console.log(`p13:check PASS — ${SECRET_NAMES.source} read only in ${[...ALLOWED].join(', ')}`);
console.log(`             and ${KEY_FIELDS.source} named only in ${[...SDK_ALLOWED].join(', ')}`);
