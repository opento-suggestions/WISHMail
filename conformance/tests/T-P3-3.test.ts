/**
 * T-P3-3 — P-3 (Public-data replay).
 *
 * Classes: VERIFIER.
 * Register: NAMED (§8.5)
 * @fixture-kind altered
 *
 * §A’s sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   Reassembly walks the chain — chunk 0 by its header, each later chunk by the prior’s `nx` — takes the earliest chunk the chain admits at each index, and records every off-chain, unrooted, and conflicting chunk without using it.
 *
 * EXPANDED 2026-09-10 over `checkpoint-two-receipt`’s ten-chunk envelope, in
 * five altered copies.
 *
 * WHY THE WALK IS ON BYTES AND NOT ON CLOCKS. §11.3’s rule has exactly one use
 * for consensus order — "the earliest chunk the chain admits" — and the word
 * that does the work is ADMITS. What makes a chunk a candidate at index i is
 * that its slice hashes to the previous canonical chunk’s `nx`; the ordering
 * only breaks ties among candidates. A walk that took the earliest chunk at each
 * index and then checked it would be a different rule and a weaker one: anybody
 * can post a message with somebody else’s envelope identifier and a low index,
 * and on that rule the first one to land would win.
 *
 * THE FOUR THINGS THAT ARE RECORDED AND NOT USED are what make the walk
 * auditable rather than merely correct. §11.3 keeps them because a Verifier that
 * silently dropped them would give the same answer and a poorer account: an
 * envelope with forty off-chain chunks and one with none appraise alike, and
 * only one of them was interfered with.
 *
 * A FOREIGN CHUNK LANDING BEFORE THE SENDER’S is the case §8.5 calls out by
 * name, and it is the one an ordering-first walk gets wrong. It is built here by
 * putting a stranger’s slice at an index EARLIER in consensus than the real one.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bindsTo, type ChunkHeader } from '../../app/src/core/aad.js';
import { reassemble } from '../../app/src/core/chunk.js';
import { b64u } from '../../app/src/core/canonical.js';
import { chunksOnLane } from '../../app/src/tools/inbox.js';
import { chunksOn, copy, fixture, readerOver, type Fixture } from '../support/fixtures.js';

const FIXTURE = 'checkpoint-two-receipt';
const ENVELOPE = '514e5045f706415613a6e513233f9e74007fedf7f89ed0f3b821c87ca28da2e1';

async function walkOf(f: Fixture): Promise<ReturnType<typeof reassemble>> {
  const observed = await chunksOnLane(readerOver(f), f.lane);
  return reassemble(observed, ENVELOPE, (h: ChunkHeader) => bindsTo(h, f.lane, ENVELOPE));
}

/** Add a message to the lane at a chosen consensus time, with a chosen body. */
function addMessage(f: Fixture, consensusTimestamp: string, contents: string): void {
  const lane = f.topics[f.lane];
  assert.ok(lane !== undefined, 'the lane holds messages');
  const highest = lane.reduce((n, m) => Math.max(n, m.sequenceNumber), 0);
  lane.push({
    topicId: f.lane,
    sequenceNumber: highest + 1,
    consensusTimestamp,
    runningHash: '',
    runningHashVersion: 3,
    contents,
    payer: '0.0.8641261',
  });
}

test('T-P3-3 — Public-data replay', async () => {
  const pristine = fixture(FIXTURE);

  // --- The walk as captured. ----------------------------------------------
  const base = await walkOf(pristine);
  assert.equal(base.state, 'complete', 'the captured chain is complete (§8.5)');
  const n = base.chain.length;
  assert.equal(n, 10, 'ten links');
  assert.deepEqual([...base.offChain], [], 'nothing off the chain');
  assert.deepEqual([...base.duplicates], [], 'and nothing repeated');

  // The chain IS the chain §11.3 describes: chunk 0 by its header, each later
  // chunk by the prior's `nx`.
  for (let i = 1; i < n; i += 1) {
    const previous = base.chain[i - 1];
    const link = base.chain[i];
    assert.ok(previous !== undefined && link !== undefined, `link ${i}`);
    assert.equal(link.chunk.i, i, `link ${i} is at index ${i}`);
    assert.equal(
      typeof previous.chunk.nx,
      'string',
      `link ${i - 1} names the next slice’s digest — §7.4 requires it on every chunk but the last`,
    );
  }
  assert.equal(base.chain[n - 1]?.chunk.nx, undefined, 'and the last chunk names no next (§7.4)');

  const laneMessages = chunksOn(pristine).filter((c) => c.chunk['id'] === ENVELOPE);
  const realFive = laneMessages.find((c) => c.chunk['i'] === 5);
  assert.ok(realFive !== undefined, 'chunk 5 is on the lane');

  // --- 1. A duplicate: byte-identical, recorded as a duplicate. -----------
  {
    const g = copy(pristine);
    addMessage(g, '1789070299.000000000', realFive.message.contents);
    const walk = await walkOf(g);
    assert.equal(walk.state, 'complete', 'a repeat does not break the chain');
    assert.equal(walk.chain.length, n, 'the chain is the same ten links');
    assert.equal(walk.duplicates.length, 1, '§11.3: the repeat is RECORDED as a duplicate');
    assert.deepEqual([...walk.offChain], [], 'and is not called off-chain, because it is byte-identical');
  }

  // --- 2. A conflicting `n`: same id, another count. ----------------------
  //
  // §8.5: "a chunk whose `n` differs from chunk 0's is a conflicting chunk and
  // is not of this envelope." Two arrangements are tried, and the assertion at
  // the end of this body records what they showed.
  let conflictingUsedAt: number | undefined;
  let conflictingFiledAs: string | undefined;
  {
    // (a) Landing AFTER the sender's chunk, with the same slice.
    const g = copy(pristine);
    const conflicting = JSON.parse(realFive.message.contents) as Record<string, unknown>;
    const chunk = JSON.parse(conflicting['data'] as string) as Record<string, unknown>;
    chunk['n'] = 99;
    conflicting['data'] = JSON.stringify(chunk);
    addMessage(g, '1789070299.000000000', JSON.stringify(conflicting));

    const walk = await walkOf(g);
    assert.equal(walk.state, 'complete', 'the real chain is unaffected');
    assert.equal(walk.chain.length, n, 'still ten links');
    conflictingFiledAs = walk.duplicates.length === 1 ? 'duplicate' : walk.offChain.length === 1 ? 'off-chain' : 'neither';
  }
  {
    // (b) Landing BEFORE the sender's chunk, with the same slice. This is where
    // §8.5's sentence has to do work, because the chain admits the slice and
    // only `n` marks the chunk as not of this envelope.
    const g = copy(pristine);
    const conflicting = JSON.parse(realFive.message.contents) as Record<string, unknown>;
    const chunk = JSON.parse(conflicting['data'] as string) as Record<string, unknown>;
    chunk['n'] = 99;
    conflicting['data'] = JSON.stringify(chunk);
    const seconds = Number(realFive.message.consensusTimestamp.split('.')[0]) - 1;
    addMessage(g, `${String(seconds)}.000000000`, JSON.stringify(conflicting));

    const walk = await walkOf(g);
    assert.equal(walk.state, 'complete', 'the walk completes either way');
    const taken = walk.chain[5];
    assert.ok(taken !== undefined, 'index 5 was filled');
    conflictingUsedAt = taken.chunk.n;
  }

  // --- 3. A foreign chunk landing BEFORE the sender’s. --------------------
  //
  // The case §8.5 names. Its slice does not hash to chunk 4’s `nx`, so the
  // chain does not admit it however early it landed — which is the difference
  // between "the earliest the chain admits" and "the earliest".
  {
    const g = copy(pristine);
    const foreign = JSON.parse(realFive.message.contents) as Record<string, unknown>;
    const chunk = JSON.parse(foreign['data'] as string) as Record<string, unknown>;
    chunk['d'] = b64u(Buffer.from('a stranger’s bytes, posted first'));
    foreign['data'] = JSON.stringify(chunk);
    foreign['operator_id'] = '0.0.999998@0.0.999999';
    // One second before the real chunk 5 reached consensus.
    const seconds = Number(realFive.message.consensusTimestamp.split('.')[0]) - 1;
    addMessage(g, `${String(seconds)}.000000000`, JSON.stringify(foreign));

    const walk = await walkOf(g);
    assert.equal(walk.state, 'complete', 'the sender’s chain still completes');
    assert.equal(walk.chain.length, n, 'ten links');
    assert.equal(
      walk.chain[5]?.consensusTimestamp,
      realFive.message.consensusTimestamp,
      'and index 5 is the SENDER’s chunk, though the foreign one landed first (§8.5)',
    );
    assert.equal(walk.offChain.length, 1, 'the foreign chunk is recorded');
    assert.equal(walk.integrityFailed, false, 'and was not used: the ciphertext still hashes to hdr.h');
  }

  // --- 4. Unrooted: no chunk 0 whose header rebuilds to the identifier. ---
  {
    const g = copy(pristine);
    g.topics[g.lane] = (g.topics[g.lane] ?? []).filter((m) => {
      try {
        const op = JSON.parse(m.contents) as Record<string, unknown>;
        if (op['op'] !== 'message') return true;
        const chunk = JSON.parse(op['data'] as string) as Record<string, unknown>;
        return !(chunk['id'] === ENVELOPE && chunk['i'] === 0);
      } catch {
        return true;
      }
    });

    const walk = await walkOf(g);
    assert.equal(walk.state, 'unrooted', '§8.5: until a canonical chunk 0 exists, no chunk of the id is canonical');
    assert.deepEqual([...walk.chain], [], 'the chain is empty');
    assert.equal(walk.offChain.length, n - 1, `and all ${n - 1} remaining chunks are recorded as unrooted`);
  }

  // --- 5. A gap: the chain stops where `nx` leads nowhere. ----------------
  {
    const g = copy(pristine);
    const target = laneMessages.find((c) => c.chunk['i'] === 6);
    assert.ok(target !== undefined, 'chunk 6 is on the lane');
    g.topics[g.lane] = (g.topics[g.lane] ?? []).filter(
      (m) => m.sequenceNumber !== target.message.sequenceNumber,
    );

    const walk = await walkOf(g);
    assert.equal(walk.state, 'partial', 'the walk stops rather than skipping (§11.3)');
    assert.equal(walk.chain.length, 6, 'at six links: 0 through 5');
    assert.equal(
      walk.offChain.length,
      n - 1 - 6,
      'and the chunks beyond the gap are recorded without being used — they are past a link nothing reaches',
    );
    assert.equal(walk.ciphertext, undefined, 'no ciphertext is produced from a partial walk');
  }

  // --- WHAT THE CONFLICTING-`n` CASES SHOWED. -----------------------------
  //
  // §8.5 names four things a walk records without using: off-chain, unrooted,
  // duplicate, and CONFLICTING. Three of them are implemented and the fourth is
  // not: `reassemble` filters candidates by `id` and by the slice digest the
  // previous chunk's `nx` names, and never compares a later chunk's `n` against
  // chunk 0's. So a chunk the specification says "is not of this envelope" is
  //
  //   - filed as a DUPLICATE when it lands after the sender's, because the
  //     duplicate test is on `(index, slice)` and `n` is not part of it; and
  //   - TAKEN ONTO THE CHAIN when it lands before, with the sender's own chunk
  //     then filed as the duplicate of a stranger's.
  //
  // Nothing observable moves in either case — the slice is the same, so the
  // ciphertext is the same and the standing is the same. What moves is the
  // EVIDENCE: §5.7's postmark is taken from the message the walk used, so the
  // bundle would cite a stranger's sequence number and consensus timestamp for
  // a link the sender posted. That is a fact about who posted what, and the
  // bundle is where such facts are supposed to be settled.
  assert.equal(
    conflictingFiledAs,
    'off-chain',
    `§8.5: a chunk whose \`n\` differs is a CONFLICTING chunk and is not of this envelope — landing after the sender's, it was filed as ${String(conflictingFiledAs)}`,
  );
  assert.equal(
    conflictingUsedAt,
    n,
    `§8.5: and landing before the sender's, the walk TOOK it — index 5 came from a chunk declaring n = ${String(conflictingUsedAt)} against chunk 0's ${n}`,
  );
});
