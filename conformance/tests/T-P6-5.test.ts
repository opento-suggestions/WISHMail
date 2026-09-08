/**
 * T-P6-5 — P-6 (Resolution witnessed, not trusted).
 *
 * Classes: CORRESPONDENT.
 * Register: NAMED (§9.5; D-104, D-108)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   `hol` rule: no registration on any anchor / profile `uaid` disagreeing in identifier or `nativeId` / recomputed AID ≠ a `uaid:aid` identifier / no `properties.wishmail` → `RESOLVE_NOT_FOUND`; registered by `uaid`+`t_id` under another key → `blurred`; registered by `account_id` → through §9.2, its endorsements beside `blurred`; own key → no `blurred`; a broker-relabelled `registry` resolves identically. Fixture pins the profile→canonical mapping.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P6-5 — Resolution witnessed, not trusted', () => {
  throw new Error(
    'T-P6-5 NOT EXPANDED — serves P-6 (Resolution witnessed, not trusted), classes CORRESPONDENT. ' +
      'Sketch: `hol` rule: no registration on any anchor / profile `uaid` disagreeing in identifier or `nativeId` / recomputed AID ≠ a `uaid:aid` identifier / no `properties.wishmail` → `RESOLVE_NOT_FOUND`; registered by `uaid`+`t_id` under another key → `blurred`; registered by `account_id` → through §9.2, its endorsements beside `blurred`; own key → no `blurred`; a broker-relabelled `registry` resolves identically. Fixture pins the profile→canonical mapping.',
  );
});
