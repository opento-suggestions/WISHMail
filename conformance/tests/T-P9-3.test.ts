/**
 * T-P9-3 — P-9 (Strict HCS-10).
 *
 * Classes: all.
 * Register: NAMED (§5.11, §7.4)
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   Every fixture chunk's `schemaRef` is `hcs://13/<topicId>#<seq>` and resolves through HCS-13 (pinned revision) to a schema whose digest equals the release's shipped Chunk schema; every fixture chunk validates; the Chunk schema fixes `nx` top-level (required on all but the last chunk, forbidden on the last and inside `hdr`) and `h` inside `hdr` only.
 *
 * NOT EXPANDED. The body below fails on purpose. A test that is not written
 * must not report that it passed, and must say what it is for while it waits.
 */
import { test } from 'node:test';

test('T-P9-3 — Strict HCS-10', () => {
  throw new Error(
    'T-P9-3 NOT EXPANDED — serves P-9 (Strict HCS-10), classes all. ' +
      'Sketch: Every fixture chunk\'s `schemaRef` is `hcs://13/<topicId>#<seq>` and resolves through HCS-13 (pinned revision) to a schema whose digest equals the release\'s shipped Chunk schema; every fixture chunk validates; the Chunk schema fixes `nx` top-level (required on all but the last chunk, forbidden on the last and inside `hdr`) and `h` inside `hdr` only.',
  );
});
