/**
 * T-P10-2 — P-10 (A lane is a lane).
 *
 * Classes: CORRESPONDENT, VERIFIER.
 * Register: NAMED (§7.1)
 * @fixture-kind captured, altered
 *
 * §A’s sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   `send` refuses, and replay appraises unbound, an envelope whose lane’s `connection_created` is on the doorbell of neither party, or is absent from the doorbell the lane’s own memo names; and a reply bound through the sender’s own doorbell binds. Amended at 0.5.11 by D-171: a lane is bidirectional, so its birth is read from whichever party answered.
 *
 * EXPANDED 2026-09-10 over `checkpoint-two-resolved` — whose lane carries a
 * letter each way — and `gate-three-resolved`, with two altered copies.
 *
 * WHAT D-171 SETTLED, AND WHY THE TEST HAS THE SHAPE IT HAS. §7.1 said a lane
 * was bidirectional and its own MUST said a reply could not use one, because
 * `connection_created` lives on the ACCEPTOR’s doorbell and a replier is the
 * party that answered. Both sentences could not be obeyed. The ruling made the
 * rule an iff over a SET: the lane’s submit key is a threshold of exactly the
 * two parties' keys, and its `connection_created` is on the doorbell of ONE of
 * them and names the other.
 *
 * THE ELEGANCE IS THAT SYMMETRY FALLS OUT OF THE CONSTRUCCTION RATHER THAN BEING
 * ASSERTED TWICE. A Verifier walks the lane’s own memo to the doorbell it was
 * born on, that doorbell’s memo to its owner, and the `connection_created` there
 * to the requester — four reads of public data, no resolution of anybody, and
 * ONE computation whichever way the letter travelled, because a lane has one
 * birth however many letters cross it. The first letter’s `{recipient, sender}`
 * and the reply’s `{recipient, sender}` are the same set, and that is asserted
 * below on the same lane in both directions.
 *
 * DISCOVERY AND BINDING ARE TWO RULES BECAUSE THEY ANSWER TWO QUESTIONS, and the
 * body keeps them apart as `send` and `verify` do: `lanesBetween` is how a
 * sender FINDS the lane (reading both doorbells), `laneBirth` is how a Verifier
 * BINDS to it (reading the lane).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lanesBetween } from '../../app/src/tools/send.js';
import { laneBirth, verify } from '../../app/src/tools/verify.js';
import { copy, fixture, readerOver, type Fixture } from '../support/fixtures.js';

const A2 = { account: '0.0.10462700', doorbell: '0.0.10462704' };
const B = { account: '0.0.10452127', doorbell: '0.0.10452149' };

test('T-P10-2 — A lane is a lane', async () => {
  const f = fixture('checkpoint-two-resolved');
  const reader = readerOver(f);

  // --- One birth, read from the lane, whichever way a letter travelled. ---
  const birth = await laneBirth(reader, f.lane);
  assert.ok(birth !== null, 'the lane’s own memo names the doorbell it was born on (§7.1, §11.4)');
  assert.equal(birth.doorbell, B.doorbell, 'B answered, so the lane was born on B’s doorbell');
  assert.equal(birth.owner, B.account, 'and that doorbell’s memo names B');
  assert.equal(birth.requester, A2.account, 'and the connection_created there names A2, who rang');

  const born = new Set([birth.owner, birth.requester]);
  assert.deepEqual([...born].sort(), [A2.account, B.account].sort(), 'the two parties, as a SET (D-171)');

  // --- Both directions bind, and the replay says so. ----------------------
  const { bundle } = await verify(reader, { lane: f.lane, claims: ['hcs14'] }, {});
  assert.equal(bundle.correspondence.length, 3, 'the lane carries three letters');

  const senders = new Set<string>();
  for (const e of bundle.correspondence) {
    const sender = e.settlement?.from;
    assert.ok(sender !== undefined, `${e.envelope.aadHash.slice(0, 12)}: the postage names its sender (§7.2)`);
    senders.add(sender);
    assert.equal(
      e.appraisal.appraised.reasons.includes('T-P10-2'),
      false,
      `${e.envelope.aadHash.slice(0, 12)}: binds — no T-P10-2 among its reasons`,
    );
    assert.equal(e.appraisal.appraised.standing, 'verified', 'and appraises verified on a lane it is bound to');
  }
  assert.deepEqual(
    [...senders].sort(),
    [A2.account, B.account].sort(),
    'letters travelled BOTH WAYS on this one lane, and the same birth bound them all — which is D-171',
  );

  // --- A reply rings nothing: the sender finds the lane from its own door. -
  //
  // `lanesBetween` reads both doorbells and deduplicates by topic, so B — the
  // party that ANSWERED — still finds the lane when it comes to reply. Before
  // D-171 it would not have, and a reply would have rung a second doorbell and
  // opened a second lane that could never be closed.
  const found = await lanesBetween(reader, B, A2);
  assert.ok(
    found.some((lane) => lane.topicId === f.lane),
    'B finds the existing lane when replying, so nothing is rung (§7.1)',
  );
  const fromA2 = await lanesBetween(reader, A2, B);
  assert.deepEqual(
    found.map((l) => l.topicId),
    fromA2.map((l) => l.topicId),
    'and both parties find the same lanes in the same order — §7.1’s earliest-created is one answer, not two',
  );

  // --- The two refusals. ---------------------------------------------------
  const refusals: readonly { readonly what: string; readonly make: () => Fixture }[] = [
    {
      // The case the memo route creates and must therefore answer: the lane’s
      // memo names a doorbell that holds no answer for it.
      what: 'the connection_created is absent from the doorbell the lane’s memo names',
      make: () => {
        const g = copy(f);
        g.topics[birth.doorbell] = (g.topics[birth.doorbell] ?? []).filter(
          (m) => !m.contents.includes('"op":"connection_created"'),
        );
        return g;
      },
    },
    {
      // On a THIRD party’s doorbell: the lane’s memo names a door whose owner is
      // neither party. A third party can post a connection_created on its own
      // doorbell naming anyone — which is why the key list is the other half of
      // the test (T-P17-2).
      what: 'the lane was born on the doorbell of neither party',
      make: () => {
        const g = copy(f);
        const stranger = '0.0.777777';
        g.topicInfo[stranger] = {
          topicId: stranger,
          memo: 'hcs-10:0:60:0:0.0.777776',
          submitKeys: [],
          adminKey: null,
          customFees: [],
          feeExemptKeys: [],
          deleted: false,
        };
        g.topics[stranger] = (g.topics[birth.doorbell] ?? []).map((m) => ({
          ...m,
          topicId: stranger,
          contents: m.contents.replace(/"operator_id":"[^"]*"/, `"operator_id":"${stranger}@0.0.777776"`),
        }));
        // MOVED and not copied: the lane was born on the stranger’s door and
        // nowhere else, so discovery and binding are looking at one world.
        g.topics[birth.doorbell] = (g.topics[birth.doorbell] ?? []).filter(
          (m) => !m.contents.includes('"op":"connection_created"'),
        );
        const laneInfo = g.topicInfo[g.lane] as { memo: string };
        laneInfo.memo = laneInfo.memo.replace(birth.doorbell, stranger);
        return g;
      },
    },
  ];

  for (const refusal of refusals) {
    const g = refusal.make();
    const readerOverAltered = readerOver(g);

    // The Verifier’s walk finds no birth it can bind to.
    const walked = await laneBirth(readerOverAltered, g.lane);
    const bindsToTheParties =
      walked !== null &&
      new Set([walked.owner, walked.requester]).size === 2 &&
      [A2.account, B.account].every((p) => walked.owner === p || walked.requester === p);
    assert.equal(bindsToTheParties, false, `${refusal.what}: the walk does not reach these two parties`);

    // And the replay appraises unbound, naming this test.
    const { bundle: after } = await verify(readerOverAltered, { lane: g.lane, claims: ['hcs14'] }, {});
    for (const e of after.correspondence) {
      assert.equal(
        e.appraisal.appraised.standing,
        'unbound',
        `${refusal.what}: ${e.envelope.aadHash.slice(0, 12)} appraises unbound (§11.5)`,
      );
      assert.ok(
        e.appraisal.appraised.reasons.includes('T-P10-2'),
        `${refusal.what}: with T-P10-2 among its reasons`,
      );
    }

    // And a sender would not have found it: discovery refuses too, which is the
    // `send` half of the sketch, over a `Reader` and no writer.
    const discoverable = await lanesBetween(readerOverAltered, A2, B);
    assert.equal(
      discoverable.some((lane) => lane.topicId === g.lane),
      false,
      `${refusal.what}: neither doorbell offers this lane, so send never selects it (§7.1)`,
    );
  }

  // === THE CASE SEND DOES NOT REFUSE, MEASURED RATHER THAN ASSERTED AROUND ==
  //
  // Both refusals above remove the `connection_created` from the party's own
  // doorbell, and discovery then refuses along with binding. But an acceptor
  // sets its lane's memo at creation and holds that topic's admin key, so it can
  // make a lane whose memo names a THIRD PARTY'S doorbell while still posting a
  // perfectly good `connection_created` on its own. Then:
  //
  //   - discovery reads doorbells, finds the answer on B's, and OFFERS the lane;
  //   - binding reads the lane's own memo, walks to a stranger, and REFUSES it.
  //
  // The two rules are deliberately different (CLAUDE.md §11, "discovery and
  // binding are two rules because they answer two questions"), and this is where
  // the difference has a cost: a sender can be led onto a lane every letter of
  // which will appraise unbound, and will pay postage for each. `laneRefusal`
  // checks the lane's deletion, its close, its fees and its key list, and does
  // not walk its birth — so nothing in §6.4 closes the gap.
  {
    const g = copy(f);
    const stranger = '0.0.777777';
    g.topicInfo[stranger] = {
      topicId: stranger,
      memo: 'hcs-10:0:60:0:0.0.777776',
      submitKeys: [],
      adminKey: null,
      customFees: [],
      feeExemptKeys: [],
      deleted: false,
    };
    // The stranger's door holds nothing for this lane; B's still holds the real
    // answer. Only the lane's memo was changed.
    g.topics[stranger] = [];
    const laneInfo = g.topicInfo[g.lane] as { memo: string };
    laneInfo.memo = laneInfo.memo.replace(birth.doorbell, stranger);

    const altered = readerOver(g);

    const { bundle: appraised } = await verify(altered, { lane: g.lane, claims: ['hcs14'] }, {});
    for (const e of appraised.correspondence) {
      assert.equal(e.appraisal.appraised.standing, 'unbound', 'replay refuses it: the lane`s memo leads nowhere');
      assert.ok(e.appraisal.appraised.reasons.includes('T-P10-2'), 'naming this test');
    }

    const offered = await lanesBetween(altered, A2, B);
    const sendWouldSelect = offered.some((lane) => lane.topicId === g.lane);

    assert.equal(
      sendWouldSelect,
      true,
      'MEASURED: discovery still offers the lane, because B`s doorbell still answers for it',
    );

    assert.fail(
      'T-P10-2 PARTIAL — the replay half holds in every case above, and so does the `send` half wherever ' +
        'discovery and binding agree. They do not always agree. An acceptor sets its lane memo at creation and ' +
        'holds that topic’s admin key, so it can point the memo at a third party’s doorbell while posting a good ' +
        '`connection_created` on its own: discovery reads doorbells and OFFERS the lane, binding reads the lane’s ' +
        'own memo and REFUSES it, and `laneRefusal` does not walk the birth. §A requires `send` to refuse an ' +
        'envelope whose lane was born on the doorbell of neither party, and here it does not — the sender pays ' +
        'postage for letters that will every one appraise unbound. Brought, not adjusted (conformance/DERIVATION.md).',
    );
  }
});
