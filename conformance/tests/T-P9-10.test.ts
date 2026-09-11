/**
 * T-P9-10 — P-9 (Strict standards).
 *
 * Classes: RECIPIENT, VERIFIER.
 * Register: NAMED (§7.1)
 * @fixture-kind captured
 *
 * §A’s sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   A fixture lane whose memo carries HCS-10’s non-indexed flag (`hcs-10:1:…:2:…`) and holds an `n`-chunk envelope is fully reassembled by `inbox` and by the VERIFIER suite.
 *
 * EXPANDED 2026-09-10 over `checkpoint-two-receipt` and `checkpoint-two-resolved`,
 * whose lane `0.0.10464056` carries the memo `hcs-10:1:60:2:0.0.10452149:1` and
 * a ten-chunk envelope — 4,424 ciphertext bytes of the Emancipation
 * Proclamation, the only multi-chunk envelope this deployment has produced.
 *
 * WHY THE EXPECTATION FOLLOWS FROM THE TEXT. The non-indexed flag is HCS-10’s
 * own statement that the topic is not enumerated by a registry, and §7.1 makes
 * it the lane’s ordinary form. §11.3’s reassembly is a walk on the chain — chunk
 * 0 by its header rebuilding to `id`, each later chunk by the prior’s `nx` — and
 * "fully reassembled" means the walk completed: `n` links, in order, with no
 * gaps and no integrity failure.
 *
 * BOTH READERS, because the sketch says both. `inbox` reassembles before it
 * reaches a key, so a keyless caller still sees the walk complete — it comes
 * back `INBOX_EPOCH_UNKNOWN` (§6.5), which is a statement about the key and not
 * about the reassembly, and it carries one postmark per link.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reassemble } from '../../app/src/core/chunk.js';
import { bindsTo, type ChunkHeader } from '../../app/src/core/aad.js';
import { connectionTopicMemoOf } from '../../app/src/ops/hcs10.js';
import { chunksOnLane, envelopeIdsOf, inbox } from '../../app/src/tools/inbox.js';
import { verify } from '../../app/src/tools/verify.js';
import { fixture, readerOver } from '../support/fixtures.js';

const MULTI = 'checkpoint-two-receipt';
const ENVELOPE = '514e5045f706415613a6e513233f9e74007fedf7f89ed0f3b821c87ca28da2e1';

test('T-P9-10 — Strict standards', async () => {
  const f = fixture(MULTI);
  const reader = readerOver(f);

  // --- HCS-10’s non-indexed flag, off the lane’s own memo. -----------------
  const laneInfo = f.topicInfo[f.lane];
  assert.ok(laneInfo !== undefined && laneInfo !== null, 'the capture holds the lane’s own record');
  assert.match(
    laneInfo.memo,
    /^hcs-10:1:[0-9]+:2:[0-9]+\.[0-9]+\.[0-9]+:[0-9]+$/,
    `the lane memo ${JSON.stringify(laneInfo.memo)} is HCS-10’s non-indexed connection form`,
  );
  const parsedMemo = connectionTopicMemoOf(laneInfo.memo);
  assert.ok(parsedMemo !== null, 'and it parses, naming the doorbell the lane was born on');

  // --- An n-chunk envelope. -----------------------------------------------
  const observed = await chunksOnLane(reader, f.lane);
  assert.ok(envelopeIdsOf(observed).includes(ENVELOPE), 'the lane carries the multi-chunk envelope');

  const zero = observed.find((o) => o.chunk.id === ENVELOPE && o.chunk.i === 0);
  assert.ok(zero !== undefined, 'chunk 0 is on the lane');
  const n = zero.chunk.n;
  assert.ok(n > 1, `the envelope is ${n} chunks, so "fully reassembled" has something to say`);

  // --- §11.3’s walk, directly. --------------------------------------------
  const walk = reassemble(observed, ENVELOPE, (h: ChunkHeader) => bindsTo(h, f.lane, ENVELOPE));
  assert.equal(walk.state, 'complete', '§8.5: the chain is complete');
  assert.equal(walk.integrityFailed, false, 'and the slices concatenate to the digest the header declares');
  assert.equal(walk.chain.length, n, `all ${n} links are on the chain`);
  for (let i = 0; i < n; i += 1) {
    assert.equal(walk.chain[i]?.chunk.i, i, `link ${i} is at index ${i}, in order`);
  }

  // --- By `inbox`, with no key at all. ------------------------------------
  const deliveries = await inbox({ reader, account: '0.0.10452127', keys: new Map() }, { lanes: [f.lane] });
  const delivery = deliveries.find((d) => d.envelope.aadHash === ENVELOPE);
  assert.ok(delivery !== undefined, 'inbox returned a delivery for it');
  assert.equal(
    delivery.chunkPostmarks.length,
    n,
    `inbox reassembled all ${n} links before it reached a key (§6.5)`,
  );
  assert.equal(
    delivery.reason,
    'INBOX_EPOCH_UNKNOWN',
    'and stopped at the key, which is a statement about the key and not about the reassembly',
  );

  // --- By the VERIFIER suite. ---------------------------------------------
  const { bundle } = await verify(reader, { lane: f.lane }, {});
  const entry = bundle.correspondence.find((e) => e.envelope.aadHash === ENVELOPE);
  assert.ok(entry !== undefined, 'the Verifier reconciled it');
  assert.equal(entry.chunks.length, n, `the Verifier postmarked all ${n} links`);
  assert.equal(entry.offChain.length, 0, 'and used every one of them: nothing went off-chain');
  assert.equal(entry.envelope.chunkCount, n, 'the envelope declares the count the walk found');
  assert.equal(entry.state, 'ACKED', 'a complete walk is SETTLED, and this one was signed for (§8.3)');

  // The other capture of the same lane agrees, which is the same bytes read a
  // second time at a different hour through the mirror.
  const again = await verify(readerOver(fixture('checkpoint-two-resolved')), { lane: f.lane }, {});
  const twin = again.bundle.correspondence.find((e) => e.envelope.aadHash === ENVELOPE);
  assert.equal(twin?.chunks.length, n, 'a second capture of the same lane reassembles the same n links');
});
