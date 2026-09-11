/**
 * T-P13-2 — P-13 (Keys stay home).
 *
 * Classes: CORRESPONDENT, RECIPIENT.
 * Register: NAMED (§3.3)
 * @fixture-kind artifact
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   No tool input, schema field, or service endpoint carries private-key material; reference SDK key generation executes in the agent's process.
 *
 * EXPANDED 2026-09-10 over §18.5's fourteen schemas, §6.1's six tool surfaces,
 * the two §4.6 affordance schemas, and the SDK's key generation.
 *
 * WHY THE SCHEMAS ARE WHERE THIS IS LOOKED FOR. A schema field is where a key
 * would first appear, and it is the only place it could appear *legitimately* —
 * everything else is an implementation detail that a later implementation is
 * free to change, while a declared field is a promise to every implementation
 * that there is a place to put one. §3.3's sentence is that there is no such
 * place: "keys are born in the agent's process", and a tool input that could
 * carry one would make that a convention rather than a constraint.
 *
 * THE SECOND CLAUSE IS THE SAME SENTENCE FROM THE OTHER END. If generation
 * happened anywhere but the agent's process, a key would have to travel to
 * reach it, and the first clause would be false. So the body checks that the
 * SDK generates in-process — one module, called on first run into the agent's
 * own keystore — and that nothing in the counter's or the Postmaster's surface
 * generates a key on an agent's behalf.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { affordances, six } from '../../app/sdk/tools.js';
import { SCHEMA_NAMES, schemas } from '../../app/src/schema/loader.js';
import { tools } from '../../app/src/mcp/tools.js';
import { REPO_ROOT } from '../support/fixtures.js';

/**
 * Names private-key material travels under. `publicKey`, `adminKey`,
 * `submitKeys` and `accountKey` are deliberately absent: a public key is public
 * data, and §11.4 reads account keys off consensus by name.
 */
const SECRET = ['privateKey', 'secretKey', 'derKey', 'privKey', 'skRm', 'mnemonic', 'seedPhrase', 'keyMaterial'];

function gitGrep(pattern: string, tree: string): string[] {
  try {
    return execFileSync('git', ['grep', '-nE', pattern, '--', tree], { cwd: REPO_ROOT, encoding: 'utf8' })
      .split('\n')
      .filter((line) => line.trim() !== '');
  } catch (e) {
    const err = e as { status?: number; stderr?: string };
    if (err.status === 1) return [];
    throw new Error(`git grep could not run: ${err.stderr ?? String(e)}`);
  }
}

/** Every property name a JSON Schema declares, at any depth. */
function propertyNames(schema: unknown, into: Set<string> = new Set()): Set<string> {
  if (Array.isArray(schema)) {
    for (const item of schema) propertyNames(item, into);
    return into;
  }
  if (typeof schema !== 'object' || schema === null) return into;
  for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
    if (key === 'properties' && typeof value === 'object' && value !== null) {
      for (const name of Object.keys(value as Record<string, unknown>)) into.add(name);
    }
    propertyNames(value, into);
  }
  return into;
}

test('T-P13-2 — Keys stay home', () => {
  const registry = schemas(REPO_ROOT);

  // --- No schema field. ----------------------------------------------------
  for (const name of SCHEMA_NAMES) {
    const declared = propertyNames(registry.schema(name));
    for (const forbidden of SECRET) {
      assert.equal(
        declared.has(forbidden),
        false,
        `${name}.schema.json declares a field named ${forbidden} — §3.3 gives key material no place to be (P-13)`,
      );
    }
  }

  // --- No tool input, on either transport. --------------------------------
  const surfaces = [
    ...tools().map((t) => ({ name: `§6.1 ${t.name}`, schema: [t.inputSchema, t.outputSchema] })),
    ...six().map((t) => ({ name: `Correspondent ${t.name}`, schema: [t.inputSchema, t.outputSchema] })),
    ...affordances().map((a) => ({ name: `§4.6 ${a.name}`, schema: [a.inputSchema] })),
  ];
  assert.ok(surfaces.length >= 14, `${surfaces.length} tool surfaces checked`);

  for (const surface of surfaces) {
    const declared = propertyNames(surface.schema);
    for (const forbidden of SECRET) {
      assert.equal(
        declared.has(forbidden),
        false,
        `${surface.name} declares ${forbidden} — no tool input or output carries key material (§3.3)`,
      );
    }
  }

  // --- No service endpoint. ------------------------------------------------
  //
  // The counter is the one service a Correspondent talks to. What crosses that
  // wire outward is a public key and a signature, and what comes back is a
  // signature (`sdk/carry.ts`). A key field named anywhere in the counter would
  // be a key crossing it.
  assert.deepEqual(
    gitGrep(`\\b(${SECRET.join('|')})\\b`, 'app/src/counter'),
    [],
    'the counter names no private-key field: what crosses that wire is a public key and a signature',
  );

  // --- Key generation executes in the agent's process. ---------------------
  //
  // One module generates, into the agent's own keystore, and it is the same one
  // module P-13's gate permits to name a key field at all (T-P13-1).
  const generators = gitGrep('generateED25519|generateECDSA|PrivateKey\\.generate|generateKeyPairSync', 'app/sdk');
  assert.ok(generators.length > 0, 'the reference SDK generates keys');
  const generatingModules = new Set(generators.map((line) => line.slice(0, line.indexOf(':'))));

  // An offline court that stands up a modelled world generates throwaway keys
  // inside its own run and is not the SDK's key path — probes are disposable
  // and their keys are born in the run and discarded with it (CLAUDE.md §11).
  // It is excluded by name rather than by silence, so a `.check.ts` is the only
  // thing that can be excluded and a new module cannot hide behind the same word.
  const shipped = [...generatingModules].filter((m) => !m.endsWith('.check.ts')).sort();
  assert.deepEqual(
    shipped,
    ['app/sdk/keystore.ts'],
    "generation happens in the agent's own keystore module and nowhere else (§3.3, D-165)",
  );
  for (const court of [...generatingModules].filter((m) => m.endsWith('.check.ts'))) {
    assert.match(court, /^app\/sdk\/[a-z0-9.-]+\.check\.ts$/, `${court} is an offline court, not a shipped path`);
  }

  // And the Postmaster generates no key on an agent's behalf: if it did, the
  // key would have to travel to the agent, and the first clause would be false.
  const postmasterGenerators = gitGrep('generateED25519|generateECDSA|PrivateKey\\.generate', 'app/src/counter')
    .map((line) => line.slice(0, line.indexOf(':')))
    .filter((module) => !module.endsWith('.check.ts'));
  assert.deepEqual(
    [...new Set(postmasterGenerators)],
    [],
    'the counter generates no key for anybody on any shipped path (§3.5, P-13)',
  );
});
