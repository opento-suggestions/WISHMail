/**
 * T-P3-2 — P-3 (Public-data replay).
 *
 * Classes: VERIFIER, POSTMASTER.
 * Register: NAMED (§8.5, §11.5)
 * @fixture-kind altered
 * @disposition partial — the independent Verifier, and three cases the bundle cannot carry
 *
 * §A’s sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   Exception corpus (orphan, partial, unrooted chunk, foreign chunk landing before the sender’s, duplicate, conflicting `n`, late settlement, closed-lane envelope, duplicate receipt, receipt-before-nth) yields identical `(state, standing)` from reference and independent Verifier; for each fixture, `reasons` is the full set it was built to trigger and `standing` is the minimum over them.
 *
 * EXPANDED 2026-09-11. `conformance/corpus/` has been an empty directory since
 * the freeze; the ten cases §8.5 names are built here from captured bytes, each
 * altering one thing and declaring what it was built to trigger.
 *
 * THE SECOND CLAUSE IS A ONE-VERIFIER CLAIM AND IS DISCHARGED BELOW. "For each
 * fixture, `reasons` is the full set it was built to trigger and `standing` is
 * the minimum over them" — that is §11.5’s MUST applied case by case, and it is
 * the half that can be settled by this deployment. It is also the half that
 * catches things: a Verifier that reported SOME of the reasons, or that reported
 * a standing above the lowest, passes every single-condition test in this suite
 * and fails here.
 *
 * THE FIRST CLAUSE NEEDS A SECOND IMPLEMENTATION and is out of reach for the
 * same reason T-P3-1 is. Running this corpus through one Verifier twice shows
 * determinism; agreement is a claim about two.
 *
 * EACH CASE DECLARES WHAT IT WAS BUILT TO TRIGGER, and that declaration is the
 * test. A case whose actual reasons differ from its declared ones is reported
 * as a deviation at the end rather than quietly accepted — which is how the
 * three cases §8.5 names and the bundle cannot carry were found.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { b64u } from '../../app/src/core/canonical.js';
import { verify } from '../../app/src/tools/verify.js';
import {
  alterChunk,
  chunksOn,
  copy,
  fixture,
  readerOver,
  stampTokenPin,
  type Fixture,
} from '../support/fixtures.js';

const MULTI = 'checkpoint-two-resolved';
const MULTI_ENVELOPE = '514e5045f706415613a6e513233f9e74007fedf7f89ed0f3b821c87ca28da2e1';
const CERTIFIED = 'gate-three-resolved';
const CERTIFIED_ENVELOPE = '2229a6c909d4b6c53889d6fda5ee173ff322debec9010a6aaf9e5cb388079c01';

interface Case {
  readonly name: string;
  readonly fixture: () => Fixture;
  readonly envelope: string;
  /** The reasons this case was built to trigger, and no others. */
  readonly triggers: readonly string[];
  /** §11.5's minimum over them. */
  readonly standing: string;
  /**
   * What else the case is about, where the reasons are not the whole of it.
   * Returns a deviation to report, or nothing where the case held — so that one
   * case's finding cannot hide the next case's.
   */
  readonly also?: (entry: {
    readonly offChain: readonly unknown[];
    readonly chunks: readonly unknown[];
    readonly receipt: { readonly status: string; readonly reasons: readonly string[] };
    readonly state: string;
  }) => string | undefined;
}

/** Add one message to a lane at a chosen consensus time. */
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

function chunkMessage(f: Fixture, envelope: string, index: number): { contents: string; at: string } {
  const found = chunksOn(f).find((c) => c.chunk['id'] === envelope && c.chunk['i'] === index);
  assert.ok(found !== undefined, `chunk ${index} of ${envelope.slice(0, 12)}`);
  return { contents: found.message.contents, at: found.message.consensusTimestamp };
}

test('T-P3-2 — Public-data replay', async () => {
  const multi = fixture(MULTI);
  const certified = fixture(CERTIFIED);

  const corpus: readonly Case[] = [
    {
      name: 'partial — a link is missing and the chain stops',
      envelope: MULTI_ENVELOPE,
      fixture: () => {
        const g = copy(multi);
        const target = chunksOn(g).find((c) => c.chunk['id'] === MULTI_ENVELOPE && c.chunk['i'] === 6);
        assert.ok(target !== undefined, 'chunk 6');
        g.topics[g.lane] = (g.topics[g.lane] ?? []).filter((m) => m.sequenceNumber !== target.message.sequenceNumber);
        return g;
      },
      triggers: ['T-P3-3'],
      standing: 'unbound',
      also: (e) => assert.ok(e.chunks.length < 10, 'the walk stopped short'),
    },
    {
      name: 'unrooted — no chunk 0 whose header rebuilds to the identifier',
      envelope: MULTI_ENVELOPE,
      fixture: () => {
        const g = copy(multi);
        const target = chunksOn(g).find((c) => c.chunk['id'] === MULTI_ENVELOPE && c.chunk['i'] === 0);
        assert.ok(target !== undefined, 'chunk 0');
        g.topics[g.lane] = (g.topics[g.lane] ?? []).filter((m) => m.sequenceNumber !== target.message.sequenceNumber);
        return g;
      },
      triggers: ['T-P1-1'],
      standing: 'unbound',
      also: (e) => assert.equal(e.chunks.length, 0, '§8.5: until a canonical chunk 0 exists, no chunk is canonical'),
    },
    {
      name: 'a foreign chunk landing before the sender’s',
      envelope: MULTI_ENVELOPE,
      fixture: () => {
        const g = copy(multi);
        const five = chunkMessage(g, MULTI_ENVELOPE, 5);
        const foreign = JSON.parse(five.contents) as Record<string, unknown>;
        const chunk = JSON.parse(foreign['data'] as string) as Record<string, unknown>;
        chunk['d'] = b64u(Buffer.from('a stranger’s bytes, posted first'));
        foreign['data'] = JSON.stringify(chunk);
        foreign['operator_id'] = '0.0.999998@0.0.999999';
        addMessage(g, `${String(Number(five.at.split('.')[0]) - 1)}.000000000`, JSON.stringify(foreign));
        return g;
      },
      triggers: [],
      standing: 'verified',
      also: (e) => {
        assert.equal(e.offChain.length, 1, '§11.3: recorded off-chain');
        assert.equal(e.chunks.length, 10, 'and not used — the sender’s chain is intact');
      },
    },
    {
      name: 'a duplicate — a byte-identical repeat of a canonical chunk',
      envelope: MULTI_ENVELOPE,
      fixture: () => {
        const g = copy(multi);
        const five = chunkMessage(g, MULTI_ENVELOPE, 5);
        addMessage(g, '1789070299.000000000', five.contents);
        return g;
      },
      triggers: [],
      standing: 'verified',
      also: (e) => {
        assert.equal(e.chunks.length, 10, 'the chain is unaffected');
        // §8.5 records duplicates. §5.10's CorrespondenceEntry carries `chunks`
        // and `offChain` and no third list, so a duplicate reaches the
        // reassembly and stops there.
        return e.offChain.length === 1
          ? undefined
          : '§8.5 names `duplicate` among the things a walk RECORDS. `reassemble` does record it — and ' +
              '§5.10’s CorrespondenceEntry carries `chunks` and `offChain` and nothing else, so `verify` ' +
              'drops it. A correspondence somebody replayed forty times and one nobody touched produce ' +
              'identical evidence.';
      },
    },
    {
      name: 'a conflicting `n` — same id and index, another count',
      envelope: MULTI_ENVELOPE,
      fixture: () => {
        const g = copy(multi);
        const five = chunkMessage(g, MULTI_ENVELOPE, 5);
        const conflicting = JSON.parse(five.contents) as Record<string, unknown>;
        const chunk = JSON.parse(conflicting['data'] as string) as Record<string, unknown>;
        chunk['n'] = 99;
        conflicting['data'] = JSON.stringify(chunk);
        addMessage(g, `${String(Number(five.at.split('.')[0]) - 1)}.000000000`, JSON.stringify(conflicting));
        return g;
      },
      triggers: [],
      standing: 'verified',
      also: (e) =>
        e.offChain.length === 1
          ? undefined
          : '§8.5: "a chunk whose `n` differs from chunk 0’s is a conflicting chunk and is not of this ' +
            'envelope" — `reassemble` never compares a later chunk’s `n` against chunk 0’s, so this one is ' +
            'taken onto the chain when it lands first and filed as a duplicate when it lands after. Neither ' +
            'is "recorded without being used".',
    },
    {
      name: 'a late settlement — postage affixed after the letter was posted',
      envelope: CERTIFIED_ENVELOPE,
      fixture: () => {
        const g = copy(certified);
        const zero = chunkMessage(g, CERTIFIED_ENVELOPE, 0);
        for (const ref of Object.keys(g.settlements)) {
          (g.settlements[ref] as { consensusTimestamp: string }).consensusTimestamp =
            `${String(Number(zero.at.split('.')[0]) + 1)}.000000000`;
        }
        return g;
      },
      triggers: ['T-P7-1'],
      standing: 'unstamped',
    },
    {
      name: 'a closed-lane envelope — a close_connection at or before submission',
      envelope: CERTIFIED_ENVELOPE,
      fixture: () => {
        const g = copy(certified);
        const zero = chunkMessage(g, CERTIFIED_ENVELOPE, 0);
        addMessage(
          g,
          `${String(Number(zero.at.split('.')[0]) - 60)}.000000000`,
          JSON.stringify({
            p: 'hcs-10',
            op: 'close_connection',
            operator_id: '0.0.10468687@0.0.10468684',
            reason: 'closed',
          }),
        );
        return g;
      },
      triggers: ['T-P9-6'],
      standing: 'unbound',
    },
    {
      name: 'a duplicate receipt — two requests for one envelope',
      envelope: CERTIFIED_ENVELOPE,
      fixture: () => {
        const g = copy(certified);
        const request = (g.topics[g.lane] ?? []).find((m) => m.contents.includes('"op":"transaction"'));
        assert.ok(request !== undefined, 'the lane carries a receipt request');
        addMessage(g, '1789090999.000000000', request.contents);
        return g;
      },
      triggers: [],
      standing: 'verified',
      also: (e) => {
        // §10.4: "A sender MAY request again … each request is its own record."
        assert.equal(e.receipt.status, 'acked', 'an envelope with two requests, one signed for, IS acknowledged');
        assert.equal(e.state, 'ACKED', 'and the state follows');
      },
    },
    {
      name: 'receipt-before-nth — the execution precedes the last chunk',
      envelope: CERTIFIED_ENVELOPE,
      fixture: () => {
        const g = copy(certified);
        const zero = chunkMessage(g, CERTIFIED_ENVELOPE, 0);
        for (const id of Object.keys(g.schedules ?? {})) {
          ((g.schedules as Record<string, Record<string, unknown>>)[id] as Record<string, unknown>)[
            'executedTimestamp'
          ] = `${String(Number(zero.at.split('.')[0]) - 1)}.000000000`;
        }
        return g;
      },
      triggers: [],
      standing: 'verified',
      also: (e) => {
        assert.equal(e.receipt.status, 'invalid', '§8.3: a receipt witnessed before the nth chunk is invalid');
        assert.ok(e.receipt.reasons.includes('T-P1-7'), 'naming T-P1-7');
        assert.equal(e.state, 'SETTLED', 'and it moves nothing');
        // §11.5: "the receipt does not lower it — an invalid receipt is a fact
        // about the receipt — and nothing raises it."
      },
    },
  ];

  const deviations: string[] = [];

  for (const one of corpus) {
    const f = one.fixture();
    const { bundle } = await verify(
      readerOver(f),
      { lane: f.lane, claims: ['hcs14'], stampToken: stampTokenPin(f.ledgerTag) },
      {},
    );
    const entry = bundle.correspondence.find((e) => e.envelope.aadHash === one.envelope);
    if (entry === undefined) {
      // §8.5: "Until a canonical chunk 0 exists, no chunk of `id` is canonical;
      // such chunks are recorded as unrooted." Recorded WHERE is the question,
      // and the answer here is nowhere: with no chunk 0 at all, `verify` has no
      // header to describe the envelope from and skips it — its own comment
      // says "chunks with no header: recorded on no entry". Nine chunks of a
      // real correspondence leave no trace in the evidence.
      deviations.push(
        `${one.name}\n        no entry in the bundle at all — §8.5 records unrooted chunks and §5.10 has nowhere to put them`,
      );
      continue;
    }

    // "reasons is the full set it was built to trigger" — both ways.
    const got = [...entry.appraisal.appraised.reasons];
    if (JSON.stringify(got) !== JSON.stringify([...one.triggers])) {
      deviations.push(`${one.name}\n        built to trigger ${JSON.stringify(one.triggers)}, got ${JSON.stringify(got)}`);
    }

    // "standing is the minimum over them".
    assert.equal(
      entry.appraisal.appraised.standing,
      one.standing,
      `${one.name}: §11.5 — the standing is the lowest any check yielded`,
    );

    // And running it twice gives the same answer, which is what a corpus is for.
    const { bundle: again } = await verify(
      readerOver(one.fixture()),
      { lane: f.lane, claims: ['hcs14'], stampToken: stampTokenPin(f.ledgerTag) },
      {},
    );
    assert.equal(again.digest, bundle.digest, `${one.name}: the same bytes give the same evidence, byte for byte`);

    const deviation = one.also?.({
      offChain: entry.offChain,
      chunks: entry.chunks,
      receipt: entry.appraisal.receipt,
      state: entry.state,
    });
    if (deviation !== undefined) deviations.push(`${one.name}
        ${deviation}`);
  }

  assert.deepEqual(
    deviations,
    [],
    `§11.5 and T-P3-2: for each fixture, \`reasons\` is the full set it was built to trigger. ` +
      `${deviations.length} of ${corpus.length} cases differ:\n      ${deviations.join('\n      ')}`,
  );

  assert.fail(
    `T-P3-2 PARTIAL — ${corpus.length} of §8.5’s ten exception cases are built and each yields the standing ` +
      'the minimum over its reasons, reproducibly. Two things remain. The ORPHAN case is not built at all: ' +
      '§11.2’s ingestion table is closed and reaches a settlement only through a chunk, so postage affixed ' +
      'with no chunk ever submitted is unreachable by the table — `verify.ts` records that finding in its own ' +
      'header (MINE, 2026-09-08) and it is a §G question before it is a build one. And the first clause, ' +
      '"yields identical `(state, standing)` from reference and INDEPENDENT Verifier", needs a second ' +
      'implementation, exactly as T-P3-1 does: one Verifier run twice shows determinism, and agreement is a ' +
      'claim about two. Recorded rather than quietly dropped (conformance/DERIVATION.md).',
  );
});
