/**
 * T-P9-9 — P-9 (Strict standards).
 *
 * Classes: all.
 * Register: NAMED (§1.7)
 * @fixture-kind artifact
 * @disposition partial — the T-P1-5 clause needs a second implementation
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   `spec/pins.json` records the minor version's registered schema digests and wire strings; a release claiming any patch of that minor version ships `spec/schemas/` with equal digests and passes T-P1-4 / T-P1-5 against the minor version's vectors.
 *
 * EXPANDED 2026-09-10 — **PARTIAL, and it fails on purpose at the end.** Every
 * clause but one is discharged below. The last, "passes T-P1-5", needs an
 * implementation of §7.2–§7.3 that does not share the reference's code path, and
 * this deployment has one implementation. `conformance/DERIVATION.md` records the
 * rule this follows: a body covers its whole sketch or it says which clause it
 * could not reach and fails, because a partial body that passed would tell the
 * register something false.
 *
 * WHY THIS ROW IS THE VERSIONING RULE ITSELF. §1.7 says the wire carries
 * `major.minor` and nothing finer, and that the schemas registered for a minor
 * version are its schemas. Everything that follows from that is here: a patch
 * may not move a wire string, may not move a registered digest, and must still
 * satisfy the minor version's vectors. D-173 is the worked example — it moved the
 * evidence bundle's `spec` from the patch to the minor version precisely because
 * a digest that varied with the reader's patch made §11.7's MUST satisfiable
 * only by accident.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { AAD_PROTOCOL, AAD_VERSION, buildAad, rebuildAad } from '../../app/src/core/aad.js';
import { RELEASE } from '../../app/src/release.js';
import { SCHEMA_NAMES } from '../../app/src/schema/loader.js';
import { REPO_ROOT, pins } from '../support/fixtures.js';

interface AadCase {
  readonly name: string;
  readonly header: { readonly l: string; readonly lane: string; readonly rp: string; readonly nc: string };
  readonly hdr: { readonly l: string; readonly rp: { readonly h: string }; readonly nc: string };
  readonly lane: string;
  readonly aadBytesUtf8: string;
  readonly id: string;
}

test('T-P9-9 — Strict standards', () => {
  const declared = pins();
  const minor = declared['minorVersion'];
  assert.equal(minor, '0.5', 'spec/pins.json records the minor version these registrations belong to');

  // --- "a release claiming ANY PATCH of that minor version" ---------------
  assert.equal(declared['spec'], RELEASE.spec, 'spec/pins.json and the release agree on the patch');
  assert.equal(RELEASE.minorVersion, minor, 'and the release knows which minor version its patch is of (§1.7)');
  assert.match(RELEASE.spec, /^0\.5\.\d+$/, `${RELEASE.spec} is a patch of ${String(minor)}`);

  // --- The wire strings, which a patch may never move. --------------------
  const wire = declared['wireStrings'] as Record<string, string>;
  assert.equal(wire['aadProtocol'], AAD_PROTOCOL, '§7.2`s protocol string is the one pinned for this minor version');
  assert.equal(wire['aadVersion'], AAD_VERSION, '§7.2`s version string carries major.minor and nothing finer (§1.7)');
  assert.equal(wire['aadVersion'], minor, 'and it IS the minor version');
  assert.equal(wire['hpkeInfo'], `wishmail/${String(minor)}/seal`, '§7.3`s HPKE info string');
  assert.equal(wire['schemaRefMinorVersion'], minor, '§5.11`s schemaRef is pinned to the minor version');

  // Nothing on the wire carries the patch. This is the sentence §1.7 turns on
  // and the one D-173 restored to the evidence bundle.
  for (const [name, value] of Object.entries(wire)) {
    if (name.startsWith('_')) continue;
    assert.equal(
      value.includes(RELEASE.spec),
      false,
      `the wire string ${name} = ${JSON.stringify(value)} carries the patch ${RELEASE.spec} — §1.7 forbids it`,
    );
  }

  // --- Equal digests: the release ships what the minor version registered. -
  const registered = declared['registeredSchemas'] as Record<string, { sha256?: string }>;
  for (const name of SCHEMA_NAMES) {
    const bytes = fs.readFileSync(path.join(REPO_ROOT, 'spec', 'schemas', `${name}.schema.json`));
    assert.equal(
      createHash('sha256').update(bytes).digest('hex'),
      registered[name]?.sha256,
      `${name}: this patch ships the digest registered for ${String(minor)} (§1.7)`,
    );
  }

  // --- "passes T-P1-4 against the minor version's vectors". ----------------
  const vectors = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, 'spec', 'vectors', 'aad.json'), 'utf8'),
  ) as { wireVersion: string; cases: readonly AadCase[] };
  assert.equal(vectors.wireVersion, minor, 'the vectors are the minor version`s');

  for (const c of vectors.cases) {
    const built = buildAad({
      ledgerTag: c.header.l,
      lane: c.header.lane,
      resolutionProofHash: c.header.rp,
      nonce: c.header.nc,
    });
    assert.equal(built.bytes.toString('utf8'), c.aadBytesUtf8, `${c.name}: this patch recomputes the vector's bytes`);
    assert.equal(built.id, c.id, `${c.name}: and its identifier`);
    assert.equal(rebuildAad(c.hdr, c.lane, vectors.wireVersion).id, c.id, `${c.name}: and the rebuild (§5.6)`);
  }

  const seal = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'spec', 'vectors', 'seal.json'), 'utf8')) as {
    spec: string;
    cases: readonly unknown[];
  };
  assert.ok(seal.cases.length > 0, '§7.3`s vectors exist for the minor version');

  // --- THE CLAUSE THIS BODY CANNOT REACH. ---------------------------------
  //
  // T-P1-5 is "the reference seals and an INDEPENDENT implementation opens, and
  // the reverse". Independent means an implementation that does not share the
  // reference's code path — STATUS §5 records the intent, a second minimal
  // implementation of §7.2–§7.3 in another language inside `conformance/`, and
  // `spec/vectors/README.md` records that it does not exist. Running the
  // reference against its own vectors would prove that the reference agrees with
  // itself, which is what T-P1-5 exists to not settle for.
  assert.fail(
    'T-P9-9 PARTIAL — every clause above holds: the minor version, the wire strings that carry no patch, ' +
      `the fourteen registered digests, and T-P1-4 over ${vectors.cases.length} vectors at patch ${RELEASE.spec}. ` +
      'The remaining clause, "passes T-P1-5 against the minor version\'s vectors", needs a second implementation ' +
      'of §7.2–§7.3 that does not share the reference code path. This deployment has one implementation, so the ' +
      'clause is unreachable and is reported rather than quietly dropped (conformance/DERIVATION.md).',
  );
});
