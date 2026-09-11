/**
 * T-P7-4 — P-7 (Postage is consumed).
 *
 * Classes: RECIPIENT, CORRESPONDENT.
 * Register: NAMED (§4.4; D-105, D-137)
 * @fixture-kind captured
 * @disposition partial — one clause needs a ledger that refuses
 *
 * §A’s sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   Every fixture doorbell carries a HIP-991 custom fee of exactly one unit of the pinned stamp token with the **treasury** as collector; a fee-less connection request is rejected at the network; a doorbell naming another collector fails provisioning and is resolved to by no fixture; and an owner’s `connection_created` on its own doorbell assesses the owner zero stamps (§4.4: the recipient "owes nothing to answer").
 *
 * EXPANDED 2026-09-11 over every doorbell the six captures hold.
 *
 * WHY THE DOORBELL CHARGES AND THE LANE DOES NOT. §4.4 puts the cost of first
 * contact on the act of ringing: a stranger pays one stamp to put a request in
 * front of somebody who did not ask for it, and the stamp is consumed to the
 * treasury like any other postage. Everything after that is paid for by the
 * letters themselves. So the doorbell is the only fee-gated topic in the whole
 * arrangement, and its fee is fixed rather than chosen — one unit, to the
 * treasury — because a doorbell whose owner set its own price would be a
 * toll-gate, and §4.5 makes postage profile-independent for the same reason.
 *
 * THE FOURTH CLAUSE IS THE PRETTY ONE. "The recipient owes nothing to answer":
 * the owner must write a `connection_created` on its own doorbell to open the
 * lane, and if the fee applied to that, answering would cost a stamp and a
 * recipient could be made poorer by being written to. HIP-991’s fee-exempt key
 * list is what prevents it, and every captured doorbell carries exactly the
 * owner’s key there — measured below, not assumed.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inboundTopicMemoOf } from '../../app/src/ops/hcs10.js';
import { allFixtures, operationsOn, stampTokenPin } from '../support/fixtures.js';

test('T-P7-4 — Postage is consumed', () => {
  const pin = stampTokenPin('hedera:testnet');
  let doorbells = 0;
  let answered = 0;

  for (const { name, f } of allFixtures()) {
    for (const [topicId, info] of Object.entries(f.topicInfo)) {
      if (info === null) continue;
      const memo = inboundTopicMemoOf(info.memo);
      if (memo === null) continue;
      const where = `${name} / ${topicId}`;

      // --- Exactly one unit of the pinned stamp, to the treasury. ---------
      assert.equal(info.customFees.length, 1, `${where}: a doorbell carries one custom fee (§4.4, D-105)`);
      const fee = info.customFees[0];
      assert.ok(fee !== undefined, `${where}: and it was captured`);
      assert.equal(fee.amount, 1, `${where}: exactly one unit — ringing costs a stamp, not a price`);
      assert.equal(fee.tokenId, pin.tokenId, `${where}: of the pinned stamp token (§4.1)`);
      assert.equal(
        fee.collector,
        pin.treasury,
        `${where}: collected by the TREASURY — a stamp is consumed, never earned by the recipient (§4.3)`,
      );

      // --- The owner owes nothing to answer. ------------------------------
      const ownerKey = f.accounts[memo.account]?.key;
      assert.ok(
        typeof ownerKey === 'string',
        `${where}: the capture carries the key of the account this doorbell names (${memo.account})`,
      );
      assert.deepEqual(
        [...info.feeExemptKeys].map((k) => k.toLowerCase()),
        [ownerKey.toLowerCase()],
        `${where}: §4.4 — the owner's key is fee-exempt and nobody else's is, so answering costs the recipient nothing`,
      );

      // And it DID answer, on its own doorbell, with the fee not applying.
      for (const { op } of operationsOn(f, topicId)) {
        if (op['op'] !== 'connection_created') continue;
        assert.equal(
          typeof op['connected_account_id'],
          'string',
          `${where}: the answer names the party that rang (§7.1, D-171)`,
        );
        answered += 1;
      }

      doorbells += 1;
    }
  }

  assert.ok(doorbells >= 2, `${doorbells} doorbells across the captures, every one priced the same`);
  assert.ok(answered > 0, `${answered} answers written by owners on their own doorbells, each assessed nothing`);

  // --- "a doorbell naming another collector … is resolved to by no fixture" -
  //
  // The checkable half of the third clause: no captured correspondence resolves
  // to a doorbell whose fee goes anywhere but the treasury. Asserted over every
  // doorbell above, so this is the count rather than a new check.
  for (const { name, f } of allFixtures()) {
    for (const [topicId, info] of Object.entries(f.topicInfo)) {
      if (info === null || inboundTopicMemoOf(info.memo) === null) continue;
      assert.equal(
        info.customFees.every((fee) => fee.collector === pin.treasury),
        true,
        `${name} / ${topicId}: no fixture resolves to a doorbell collecting elsewhere`,
      );
    }
  }

  assert.fail(
    'T-P7-4 PARTIAL — three of the four clauses hold over every captured doorbell: the fee is exactly one unit ' +
      'of the pinned stamp collected by the treasury; the owner’s key and only the owner’s key is fee-exempt, ' +
      'so answering costs the recipient nothing; and no fixture resolves to a doorbell collecting elsewhere. ' +
      'The clauses that remain are about REFUSALS BY A LEDGER: "a fee-less connection request is rejected at ' +
      'the network" and "a doorbell naming another collector fails provisioning". Neither is a fact a capture ' +
      'can hold — a capture records what happened, and these are things that must be shown not to. They need a ' +
      'ledger that assesses fees and refuses, which is the modelled one (`tools/memory.ts` enforces HIP-991 ' +
      'fees by design), permitted for a behaviour clause (RECORD, 2026-09-10) and not yet written. Recorded ' +
      'rather than quietly dropped (conformance/DERIVATION.md).',
  );
});
