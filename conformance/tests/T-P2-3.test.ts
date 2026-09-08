/**
 * T-P2-3 — P-2 (No Postmaster authority).
 *
 * Classes: POSTMASTER, VERIFIER.
 * Register: NAMED (§16.2; extension)
 *
 * EXTENSION (§16.1, D-111): this test binds only a release whose claim names
 * the extension it belongs to. `RELEASE.extensions` is empty, so it is not
 * required of this release — and it is registered, so it is not forgotten.
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   *(ext §16.2)* The reference Postmaster has no `attest` tool and its key signs no Attestation; a Verifier given a fixture Attestation that disagrees with the evidence appraises from the evidence and reports the Attestation under `observations`.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P2-3 — No Postmaster authority', () => {
  throw new Error(
    'T-P2-3 NOT EXPANDED — serves P-2 (No Postmaster authority), classes POSTMASTER, VERIFIER. ' +
      'Sketch: *(ext §16.2)* The reference Postmaster has no `attest` tool and its key signs no Attestation; a Verifier given a fixture Attestation that disagrees with the evidence appraises from the evidence and reports the Attestation under `observations`.',
  );
});
