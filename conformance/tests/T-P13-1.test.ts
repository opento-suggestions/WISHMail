/**
 * T-P13-1 — P-13 (Never hold the soul).
 *
 * Classes: POSTMASTER.
 * Register: NAMED (§3.5)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   The service's key store and code path contain no agent private-key material (decryption, topic, or account keys); provisioning delivers coordinates, never secrets.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P13-1 — Never hold the soul', () => {
  throw new Error(
    'T-P13-1 NOT EXPANDED — serves P-13 (Never hold the soul), classes POSTMASTER. ' +
      'Sketch: The service\'s key store and code path contain no agent private-key material (decryption, topic, or account keys); provisioning delivers coordinates, never secrets.',
  );
});
