/**
 * T-P6-3 — P-6 (Resolution witnessed, not trusted).
 *
 * Classes: CORRESPONDENT.
 * Register: NAMED (§9.2; D-107)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   `hcs14` rule: memo of neither form / no current entry / no `properties.wishmail` / `uaid` identifier or `nativeId` disagreeing → `RESOLVE_NOT_FOUND`; a direct-HCS-1 memo resolves with `blurred` + memo snapshot; an HCS-2 memo resolves without `blurred`; manifests recompute from locators.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P6-3 — Resolution witnessed, not trusted', () => {
  throw new Error(
    'T-P6-3 NOT EXPANDED — serves P-6 (Resolution witnessed, not trusted), classes CORRESPONDENT. ' +
      'Sketch: `hcs14` rule: memo of neither form / no current entry / no `properties.wishmail` / `uaid` identifier or `nativeId` disagreeing → `RESOLVE_NOT_FOUND`; a direct-HCS-1 memo resolves with `blurred` + memo snapshot; an HCS-2 memo resolves without `blurred`; manifests recompute from locators.',
  );
});
