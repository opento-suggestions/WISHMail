/**
 * T-P9-4 — P-9 (Strict standards).
 *
 * Classes: all.
 * Register: NAMED (§5.11)
 * @fixture-kind artifact
 *
 * §A’s sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   The digest of each file in `spec/schemas/` equals the digest registered under HCS-13 for the claimed specification version.
 *
 * EXPANDED 2026-09-10 against `spec/pins.json`'s `registeredSchemas`, which
 * records what Step 4 registered on consensus.
 *
 * WHY THE EXPECTATION FOLLOWS FROM THE TEXT. §1.7’s freeze IS this equality. A
 * schema registered under HCS-13 is a fixed document at a fixed sequence number,
 * and the release that ships a different one is validating against a document no
 * reader of the wire can obtain. §5.11 makes `schemaRef` a version-pinned
 * locator precisely so that a reader CAN obtain it — and the whole of that
 * arrangement collapses the moment a shipped file and a registered one diverge
 * by a byte.
 *
 * THE DIGEST IS OVER THE FILE AS IT SITS, and that is deliberate. The pinned
 * standards in the same file are digested over the raw git blob, because a
 * working-tree checkout of a foreign repository is at the mercy of
 * `core.autocrlf`. These fourteen are ours: they are what this release ships and
 * what it registered, and the digest that matters is of the bytes a reader of
 * this repository gets.
 *
 * §18.5’s fourteen are named rather than globbed — a fifteenth file in the
 * directory is a divergence to report, not a schema to load — and the loader
 * enforces that before this body sees anything.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { SCHEMA_NAMES, schemaId, schemas } from '../../app/src/schema/loader.js';
import { REPO_ROOT, pins } from '../support/fixtures.js';

test('T-P9-4 — Strict standards', () => {
  // Loading them is itself §18.5’s check: the loader refuses a directory that
  // does not hold exactly the fourteen, and refuses a file whose `$id` is not
  // the one the minor version fixes.
  const registry = schemas(REPO_ROOT);
  assert.equal(SCHEMA_NAMES.length, 14, '§18.5 names fourteen schemas');

  const declared = pins();
  const registered = declared['registeredSchemas'] as Record<string, { schemaRef?: string; sha256?: string }>;
  assert.ok(registered !== undefined, 'spec/pins.json carries registeredSchemas (§5.11, §1.7)');

  const claimed = declared['minorVersion'];
  assert.equal(claimed, '0.5', 'the minor version whose registrations these are (§1.7)');

  for (const name of SCHEMA_NAMES) {
    const file = path.join(REPO_ROOT, 'spec', 'schemas', `${name}.schema.json`);
    const bytes = fs.readFileSync(file);
    const digest = createHash('sha256').update(bytes).digest('hex');

    const pin = registered[name];
    assert.ok(pin !== undefined, `spec/pins.json records a registration for ${name} (§5.11)`);
    assert.equal(
      typeof pin.sha256,
      'string',
      `${name}: the registration carries a digest — an unfilled pin would block every claim (T-P9-2)`,
    );
    assert.equal(
      digest,
      pin.sha256,
      `${name}.schema.json is byte-identical to the schema registered under HCS-13 for 0.5 (§1.7)`,
    );

    // And the locator is HCS-13’s version-pinned form, so a reader can fetch it.
    assert.match(
      pin.schemaRef ?? '',
      /^hcs:\/\/13\/[0-9]+\.[0-9]+\.[0-9]+#[0-9]+$/,
      `${name}: the registration’s schemaRef is HCS-13’s locator (§5.11)`,
    );

    // The document identifies itself as the minor version’s, which is what
    // makes "the claimed specification version" mean something to a reader.
    assert.equal(registry.schema(name).$id, schemaId(name), `${name}: declares the $id 0.5 fixes`);
  }

  // No registration for a schema §18.5 does not name.
  for (const name of Object.keys(registered)) {
    if (name.startsWith('_')) continue;
    assert.ok(
      (SCHEMA_NAMES as readonly string[]).includes(name),
      `spec/pins.json registers ${name}, which §18.5 does not name`,
    );
  }
});
