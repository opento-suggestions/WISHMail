/**
 * T-P1-4 — P-1 (Binding).
 *
 * Classes: all.
 * Register: NAMED (§7.2)
 * @fixture-kind artifact
 *
 * §A’s sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   `spec/vectors/aad.json`: header fields → AAD bytes → `id`; every class recomputes exactly.
 *
 * EXPANDED 2026-09-10 from `spec/vectors/aad.json`, the artifact the sketch
 * itself names as its court (`conformance/DERIVATION.md`, kind: artifact).
 *
 * WHY THE EXPECTATION FOLLOWS FROM THE TEXT AND NOT FROM THE CODE. §7.2 fixes
 * three things and this test reads all three off the vector rather than off
 * `aad.ts`: the AAD’s key names are exactly `{p, v, l, lane, rp, nc}`; its bytes
 * are their RFC 8785 canonical JSON, which sorts them `l, lane, nc, p, rp, v`;
 * and its SHA-256 is the envelope identifier. The vector carries `aadBytesUtf8`,
 * `aadBytesHex`, `aadBytesLength` and `id` for each case, so the body checks the
 * implementation against published bytes — and also checks the vector against
 * itself, because a vector whose hex and UTF-8 disagree would make any
 * implementation that matched one of them look right.
 *
 * §5.6’s other direction is in the same vector and is the same weld read
 * backwards: a reader with chunk 0’s `hdr` and the topic the chunk arrived on
 * rebuilds the same bytes. That is what `INBOX_UNBOUND`'s header case is
 * (§6.5), so it is checked here where the vector can check it exactly.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { buildAad, rebuildAad, bindsTo } from '../../app/src/core/aad.js';
import { REPO_ROOT } from '../support/fixtures.js';

interface Case {
  readonly name: string;
  readonly header: { readonly p: string; readonly v: string; readonly l: string; readonly lane: string; readonly rp: string; readonly nc: string };
  readonly hdr: { readonly l: string; readonly rp: { readonly h: string }; readonly nc: string };
  readonly lane: string;
  readonly aadBytesUtf8: string;
  readonly aadBytesHex: string;
  readonly aadBytesLength: number;
  readonly id: string;
}

interface Vectors {
  readonly wireVersion: string;
  readonly cases: readonly Case[];
}

test('T-P1-4 — Binding', () => {
  const vectors = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, 'spec', 'vectors', 'aad.json'), 'utf8'),
  ) as Vectors;

  assert.ok(vectors.cases.length > 0, 'spec/vectors/aad.json carries no cases');

  for (const c of vectors.cases) {
    const where = `aad.json case ${JSON.stringify(c.name)}`;

    // --- The vector against itself, before anything is compared to it. -------
    const published = Buffer.from(c.aadBytesUtf8, 'utf8');
    assert.equal(published.toString('hex'), c.aadBytesHex, `${where}: the vector’s own hex and UTF-8 disagree`);
    assert.equal(published.length, c.aadBytesLength, `${where}: the vector’s own byte length disagrees`);
    assert.equal(
      createHash('sha256').update(published).digest('hex'),
      c.id,
      `${where}: the vector’s own id is not SHA-256 over its own bytes (§7.2)`,
    );

    // --- §7.2: exactly six key names, and no others (D-127). ----------------
    const parsed = JSON.parse(c.aadBytesUtf8) as Record<string, unknown>;
    assert.deepEqual(
      Object.keys(parsed).sort(),
      ['l', 'lane', 'nc', 'p', 'rp', 'v'],
      `${where}: §7.2’s AAD carries exactly {p, v, l, lane, rp, nc}`,
    );
    // RFC 8785 sorts by UTF-16 code unit, so the ORDER on the wire is fixed too.
    assert.deepEqual(
      Object.keys(parsed),
      ['l', 'lane', 'nc', 'p', 'rp', 'v'],
      `${where}: the canonical order of §7.2’s six is l, lane, nc, p, rp, v (RFC 8785)`,
    );

    // --- Header fields → AAD bytes → id. ------------------------------------
    const built = buildAad({
      ledgerTag: c.header.l,
      lane: c.header.lane,
      resolutionProofHash: c.header.rp,
      nonce: c.header.nc,
    });
    assert.equal(built.bytes.toString('utf8'), c.aadBytesUtf8, `${where}: the AAD bytes are the published bytes`);
    assert.equal(built.id, c.id, `${where}: the identifier is SHA-256 over them (§7.2)`);

    // --- §5.6’s rebuild, from `hdr` and the topic the chunk arrived on. ------
    const rebuilt = rebuildAad(c.hdr, c.lane, vectors.wireVersion);
    assert.equal(rebuilt.bytes.toString('utf8'), c.aadBytesUtf8, `${where}: the rebuild yields the same bytes (§5.6)`);
    assert.equal(rebuilt.id, c.id, `${where}: and so binds the header to the id every chunk carries`);
    assert.ok(bindsTo(c.hdr, c.lane, c.id, vectors.wireVersion), `${where}: bindsTo agrees`);

    // The weld holds only for the lane the chunks are ON. §7.2 builds `lane`
    // from the topic and not from a header field, which is what makes it a weld.
    assert.equal(
      bindsTo(c.hdr, '0.0.999999', c.id, vectors.wireVersion),
      false,
      `${where}: the same header on another topic does not bind (§7.2)`,
    );
  }
});
