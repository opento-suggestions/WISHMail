/**
 * T-P13-1 — P-13 (Keys stay home).
 *
 * Classes: POSTMASTER.
 * Register: NAMED (§3.5)
 * @fixture-kind artifact
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   The service's key store and code path contain no agent private-key material (decryption, topic, or account keys); provisioning delivers coordinates, never secrets.
 *
 * EXPANDED 2026-09-10 over the repository's own source.
 *
 * WHY P-13 IS TESTED STRUCTURALLY AND NOT BY INSPECTION. "The Postmaster holds
 * no agent key, ever" is not a property of a run — a run that happened not to
 * hold one proves nothing about the next. It is a property of the code: the
 * names under which key material can reach this process are read in exactly two
 * modules, and every other module is handed a `Signer` and cannot leak a key
 * even by accident, because it is not holding one. So what is checked is which
 * modules can name key material, and the answer must be those two and no third.
 *
 * THE PATTERN IS DELIBERATELY WIDER THAN THE NAMES THAT EXIST. It read
 * `/(AGENT|TREASURY)_DER_KEY/` once, and `AGENT_X25519_DER_KEY` — the encryption
 * key §9.2's declaration needs, and the first key here that is not a Hedera key
 * — walked straight past it (D-151). A gate that must be edited every time a key
 * is added is a gate that will one day not be.
 *
 * `POSTMASTER_PAYER_DER_KEY` is deliberately not watched: it is the Postmaster's
 * own payer (D-47, "the Postmaster pays") and not an agent's, so an entrypoint
 * naming it is exactly what P-13 permits.
 *
 * "PROVISIONING DELIVERS COORDINATES, NEVER SECRETS" is checked where it would
 * fail: §5's MailCoordinates, which is what provisioning hands back.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { schemas } from '../../app/src/schema/loader.js';
import { REPO_ROOT } from '../support/fixtures.js';

/** Key material travelling under an environment name (§3.5, D-151). */
const SECRET_NAMES = '(AGENT|TREASURY)[A-Z0-9_]*_KEY';
/** The only two modules permitted to name them: one reads, one turns it into a Signer. */
const ALLOWED = new Set(['app/src/ops/env.ts', 'app/src/ops/identity.ts']);

/** Every line in a tree where the pattern appears, `path:line:text`. */
function gitGrep(pattern: string, tree: string): string[] {
  try {
    return execFileSync('git', ['grep', '-nE', pattern, '--', tree], { cwd: REPO_ROOT, encoding: 'utf8' })
      .split('\n')
      .filter((line) => line.trim() !== '');
  } catch (e) {
    // `git grep` exits 1 with no output when nothing matches: the clean case.
    const err = e as { status?: number; stderr?: string };
    if (err.status === 1) return [];
    throw new Error(`git grep could not run: ${err.stderr ?? String(e)}`);
  }
}

test('T-P13-1 — Keys stay home', () => {
  // --- The code path. ------------------------------------------------------
  const hits = gitGrep(SECRET_NAMES, 'app/src');
  const offenders = hits.filter((line) => !ALLOWED.has(line.slice(0, line.indexOf(':'))));
  assert.deepEqual(
    offenders,
    [],
    'an agent key name is read outside env.ts and identity.ts — P-13 says the Postmaster holds no agent key, ever',
  );

  // THE SWEEP IS PROVED TO WORK BEFORE ITS ANSWER IS BELIEVED. A gate that
  // returned nothing because it could not run would read exactly like a gate
  // that returned nothing because there was nothing to find, and the second is
  // the answer this release wants. So a name that IS present is grepped for
  // first: `POSTMASTER_PAYER_DER_KEY`, the Postmaster's own payer, which P-13
  // permits by name (D-47) and which the sweep deliberately does not watch.
  const control = gitGrep('POSTMASTER_PAYER_DER_KEY', 'app/src');
  assert.ok(control.length > 0, 'the sweep can find a name that is there, so its silence means something');

  // AND THE ANSWER IS ZERO, WHICH IS STRONGER THAN THE ALLOWLIST ASSUMES.
  // `app/src` names no agent key anywhere, not even in the two modules the gate
  // permits: `identity.ts` builds the variable name from a prefix
  // (`${prefix}_DER_KEY`, identity.ts:79 and :119) rather than writing any
  // literal, so no agent key name appears in the Postmaster's tree at all. The
  // allowlist is therefore unexercised today and the gate is not — it fires the
  // moment a third module writes one, which is the thing it exists for.
  assert.equal(hits.length, 0, 'no module in app/src names agent key material, permitted or otherwise');

  // --- The key store. ------------------------------------------------------
  //
  // A Correspondent's keys travel under a FIELD name and not an environment
  // one, because the agent's are in its own keystore and the operator's is a
  // field in that operator's config (CLAUDE.md §11). One module turns those into
  // a `Signer`; the template is what an operator fills in and ships blank.
  const sdkHits = gitGrep('\\b(derKey|privateKey|secretKey)\\b', 'app/sdk');
  const sdkAllowed = new Set(['app/sdk/keystore.ts', 'app/sdk/config.template.json']);
  assert.deepEqual(
    sdkHits.filter((line) => !sdkAllowed.has(line.slice(0, line.indexOf(':')))),
    [],
    'a Correspondent key field is named outside the keystore and the config template (P-13)',
  );

  // --- Provisioning delivers coordinates, never secrets. -------------------
  //
  // MailCoordinates is what provisioning hands back, and it is a schema: a field
  // that could carry a secret would have to be declared here first.
  const registry = schemas(REPO_ROOT);
  const coordinates = JSON.stringify(registry.schema('mail-coordinates'));
  for (const forbidden of ['privateKey', 'secretKey', 'derKey', 'seed', 'mnemonic', 'skRm']) {
    assert.equal(
      coordinates.includes(forbidden),
      false,
      `MailCoordinates declares no ${forbidden}: provisioning delivers coordinates, never secrets (§4.6)`,
    );
  }

  // And the Postmaster's own ops record carries no Correspondent secret — nor,
  // per CLAUDE.md §11, any Correspondent entity at all.
  const deployment = gitGrep('\\b(derKey|privateKey|secretKey|mnemonic)\\b', 'app/deployment');
  assert.deepEqual(deployment, [], 'the Postmaster ops record carries no key material');
});
