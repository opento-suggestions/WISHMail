/**
 * T-P6-4 — P-6 (Resolution witnessed, not trusted).
 *
 * Classes: CORRESPONDENT.
 * Register: NAMED (§9.3)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   `dns` rule: `v` ≠ `wm1` → `RESOLVE_NOT_FOUND`; multi-string TXT resolves as its RFC 7208 concatenation; two `v=wm1` records → `vague`, higher `e` wins; DNSSEC-validated fixture's inputs carry the RRSIG chain, unsigned fixture's proof is `blurred`.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P6-4 — Resolution witnessed, not trusted', () => {
  throw new Error(
    'T-P6-4 NOT EXPANDED — serves P-6 (Resolution witnessed, not trusted), classes CORRESPONDENT. ' +
      'Sketch: `dns` rule: `v` ≠ `wm1` → `RESOLVE_NOT_FOUND`; multi-string TXT resolves as its RFC 7208 concatenation; two `v=wm1` records → `vague`, higher `e` wins; DNSSEC-validated fixture\'s inputs carry the RRSIG chain, unsigned fixture\'s proof is `blurred`.',
  );
});
