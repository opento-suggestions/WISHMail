/**
 * The HIP-991 probe.
 *
 * Wholly disposable (D-149): its own treasury, token, topic, owner and
 * stranger. The real $POSTAGE, the real treasury and the Postmaster-agent's
 * topics are not created, touched or named here. It mirrors the real shape
 * exactly, because a probe that proves something about a different shape proves
 * nothing about the template.
 *
 * It writes nothing to app/deployment/hedera-testnet.json and nothing to
 * spec/pins.json. Its whole record is app/OPERATIONS.md, and the gate report
 * there — what it creates, what it asserts, what it reads back, what it leaves
 * on the network — was committed before this file was ever run.
 *
 * What it settles:
 *   - whether a fee collector must be associated with the denominating token
 *     (ledger §H holds this as MINE);
 *   - the mirror node's actual name and shape for the fee-exempt list;
 *   - whether the exempt list is amendable under the admin key
 *     (hip-991.md:110-113, observed rather than read);
 *   - which account hip-991.md:101 debits when payer and signer differ, which
 *     is the read the doorbell depends on (S3).
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  AccountCreateTransaction,
  CustomFeeLimit,
  CustomFixedFee,
  Hbar,
  TokenAssociateTransaction,
  TokenCreateTransaction,
  TokenDissociateTransaction,
  TokenMintTransaction,
  TokenSupplyType,
  TokenType,
  TopicCreateTransaction,
  TopicDeleteTransaction,
  TopicMessageSubmitTransaction,
  TopicUpdateTransaction,
  TransferTransaction,
  type Client,
} from '@hashgraph/sdk';
import { loadEnv } from './env.js';
import { runMode } from './mode.js';
import { bornHere, fromEnv, publicHex, type Signer } from './identity.js';
import { Mirror, toMirrorTxId } from './mirror.js';
import { clientFor, submit, type Submitted } from './hedera.js';

const TOPIC_MEMO = 'wishmail:probe:hip991';
const FLOAT = 10_000;

interface Observation {
  readonly step: string;
  readonly note: string;
  readonly data: unknown;
}

const log: Observation[] = [];
const record = (step: string, note: string, data: unknown): void => {
  log.push({ step, note, data });
  console.log(`\n--- ${step} — ${note}`);
  console.log(typeof data === 'string' ? data : JSON.stringify(data, null, 2));
};

function must(s: Submitted, what: string): Submitted {
  if (!s.ok) throw new Error(`STOP: ${what} failed with ${s.status} (tx ${s.transactionId})`);
  return s;
}

async function main(): Promise<void> {
  // A probe signs. Dry run is the DEFAULT (ops/mode.ts): --live must ARRIVE,
  // and a probe that is not told to go live reports what it would do and stops.
  if (!runMode('probe').live) {
    console.log('  DRY RUN: this probe signs when it runs, and it was not told to. Nothing was submitted.');
    console.log('  to run it for real, pass --live — and read the argv line above to see that it arrived.');
    console.log('');
    return;
  }
  const env = loadEnv();
  const mirror = new Mirror(env.mirrorNodeUrl);
  const postmasterPayer = fromEnv('postmaster payer', 'POSTMASTER_PAYER_DER_KEY');
  const client = clientFor(env, env.postmasterPayerId, postmasterPayer);

  const treasury = bornHere('probe treasury');
  const owner = bornHere('owner');
  const owner2 = bornHere('owner2');
  const stranger = bornHere('stranger');

  record('start', 'the probe is disposable; nothing here is written to pins.json or the ops record', {
    network: env.network,
    postmasterPayer: env.postmasterPayerId,
    mirrorNodeUrl: env.mirrorNodeUrl,
    publicKeys: {
      probeTreasury: publicHex(treasury),
      owner: publicHex(owner),
      owner2: publicHex(owner2),
      stranger: publicHex(stranger),
    },
  });

  let topicId: string | undefined;
  let tokenId: string | undefined;
  let treasuryId: string | undefined;

  try {
    // ---- 1. accounts -----------------------------------------------------
    const mkAccount = async (s: Signer, hbar: number): Promise<string> => {
      const r = must(
        await submit(
          client,
          env.postmasterPayerId,
          new AccountCreateTransaction().setKeyWithoutAlias(s.publicKey).setInitialBalance(new Hbar(hbar)),
        ),
        `create ${s.label}`,
      );
      record(`account:${s.label}`, 'created, the Postmaster’s payer paying', {
        accountId: r.entityId,
        transactionId: r.transactionId,
        publicKey: publicHex(s),
        initialBalanceHbar: hbar,
      });
      return r.entityId!;
    };

    treasuryId = await mkAccount(treasury, 5);
    const ownerId = await mkAccount(owner, 3);
    const strangerId = await mkAccount(stranger, 3);

    // ---- 2. the token, born at zero (D-149) ------------------------------
    const tokenCreate = must(
      await submit(
        client,
        env.postmasterPayerId,
        new TokenCreateTransaction()
          .setTokenName('WISHMail probe stamp')
          .setTokenSymbol('PROBE')
          .setTokenType(TokenType.FungibleCommon)
          .setDecimals(0)
          .setInitialSupply(0)
          .setSupplyType(TokenSupplyType.Infinite)
          .setTreasuryAccountId(treasuryId)
          .setSupplyKey(treasury.publicKey)
          .setMaxTransactionFee(new Hbar(40)),
        [treasury],
      ),
      'create the probe token',
    );
    tokenId = tokenCreate.entityId!;
    record('token:create', 'born at initialSupply 0, supply key the probe treasury (D-141 posture, D-148 key, D-149 birth)', {
      tokenId,
      transactionId: tokenCreate.transactionId,
    });

    const tokenBefore = await mirror.poll<Record<string, unknown>>(
      `/tokens/${tokenId}`,
      (t) => t['token_id'] === tokenId,
    );
    record('token:readback-before-mint', 'RAW mirror-node JSON', tokenBefore);

    // ---- 3. the mint, as its own act (D-149) -----------------------------
    const mint = must(
      await submit(
        client,
        env.postmasterPayerId,
        new TokenMintTransaction().setTokenId(tokenId).setAmount(FLOAT),
        [treasury],
      ),
      'mint the float',
    );
    record('token:mint', 'a mint is an act with a transaction id, not a birth parameter', {
      amount: FLOAT,
      signedBy: 'probe treasury (supply key)',
      transactionId: mint.transactionId,
    });

    const tokenAfter = await mirror.poll<Record<string, unknown>>(
      `/tokens/${tokenId}`,
      (t) => Number(t['total_supply']) === FLOAT,
    );
    record('token:readback-after-mint', 'RAW mirror-node JSON', tokenAfter);

    // ---- 4. associations and units ---------------------------------------
    for (const [s, id] of [
      [owner, ownerId],
      [stranger, strangerId],
    ] as const) {
      must(
        await submit(
          client,
          env.postmasterPayerId,
          new TokenAssociateTransaction().setAccountId(id).setTokenIds([tokenId]),
          [s],
        ),
        `associate ${s.label}`,
      );
    }
    const opAssoc = must(
      await submit(
        client,
        env.postmasterPayerId,
        new TokenAssociateTransaction().setAccountId(env.postmasterPayerId).setTokenIds([tokenId]),
      ),
      'associate the Postmaster’s payer',
    );
    record('associate', 'owner, stranger and the Postmaster’s payer; the treasury is associated by construction', {
      operatorAssociationTx: opAssoc.transactionId,
    });

    const fund = must(
      await submit(
        client,
        env.postmasterPayerId,
        new TransferTransaction()
          .addTokenTransfer(tokenId, treasuryId, -5)
          .addTokenTransfer(tokenId, ownerId, 1)
          .addTokenTransfer(tokenId, strangerId, 1)
          .addTokenTransfer(tokenId, env.postmasterPayerId, 3),
        [treasury],
      ),
      'fund owner, stranger and the Postmaster’s payer',
    );
    record('fund', 'owner 1, stranger 1, the Postmaster’s payer 3 — so a failed exemption reads as a charge, not an inability to pay', {
      transactionId: fund.transactionId,
    });

    // ---- 5. the topic, in D-138's doorbell shape --------------------------
    const fee = new CustomFixedFee()
      .setAmount(1)
      .setDenominatingTokenId(tokenId)
      .setFeeCollectorAccountId(treasuryId);

    const buildTopic = (): TopicCreateTransaction =>
      new TopicCreateTransaction()
        .setTopicMemo(TOPIC_MEMO)
        .setAdminKey(postmasterPayer.publicKey)
        .setAutoRenewAccountId(env.postmasterPayerId)
        .setCustomFees([fee])
        .setFeeExemptKeys([owner.publicKey])
        .setMaxTransactionFee(new Hbar(100));

    // First without the collector's signature, to learn whether one is required.
    let topicCreate = await submit(client, env.postmasterPayerId, buildTopic());
    let collectorSignatureRequired: boolean | 'unknown' = false;
    if (!topicCreate.ok) {
      record('topic:create-attempt-1', 'attempted WITHOUT the fee collector signing', {
        status: topicCreate.status,
      });
      if (topicCreate.status === 'INVALID_SIGNATURE') {
        // The only status that answers "must the collector sign?". Anything else
        // is a different question, and inferring from it would put a false
        // FETCHED into ledger §H.
        collectorSignatureRequired = true;
        topicCreate = await submit(client, env.postmasterPayerId, buildTopic(), [treasury]);
      } else {
        collectorSignatureRequired = 'unknown';
      }
    }
    must(topicCreate, 'create the probe topic');
    topicId = topicCreate.entityId!;
    record('topic:create', 'no submit key, admin key the Postmaster’s payer, no fee schedule key, 1 unit to the probe treasury', {
      topicId,
      transactionId: topicCreate.transactionId,
      collectorSignatureRequired,
      exemptListAtCreation: publicHex(owner),
    });

    const topicRead = await mirror.poll<Record<string, unknown>>(
      `/topics/${topicId}`,
      (t) => t['topic_id'] === topicId,
    );
    record('topic:readback', 'RAW mirror-node JSON — note the fee-exempt list field name and shape', topicRead);

    // ---- 6. the six submissions ------------------------------------------
    const limitFor = (payerId: string): CustomFeeLimit =>
      new CustomFeeLimit()
        .setAccountId(payerId)
        .setFees([new CustomFixedFee().setAmount(1).setDenominatingTokenId(tokenId!)]);

    const submissions: {
      id: string;
      payerId: string;
      payer: Signer;
      signers: readonly Signer[];
      expect: string;
      why: string;
    }[] = [
      { id: 'S1', payerId: strangerId, payer: stranger, signers: [], expect: 'charged 1', why: 'the fee mechanism at its simplest' },
      { id: 'S2', payerId: env.postmasterPayerId, payer: postmasterPayer, signers: [stranger], expect: 'charged 1', why: "§4.4's shape: the Postmaster pays, the sender signs" },
      { id: 'S3', payerId: env.postmasterPayerId, payer: postmasterPayer, signers: [owner], expect: 'exempt, 0', why: 'PRODUCTION SHAPE — D-137/D-139: the Postmaster pays and the owner signs' },
      { id: 'S4', payerId: ownerId, payer: owner, signers: [], expect: 'exempt, 0', why: 'control: the weaker read, owner as its own payer' },
    ];

    const results: Record<string, unknown> = {};

    const runSubmission = async (s: (typeof submissions)[number], label: string): Promise<void> => {
      const c = clientFor(env, s.payerId, s.payer);
      const r = await submit(
        c,
        s.payerId,
        new TopicMessageSubmitTransaction()
          .setTopicId(topicId!)
          .setMessage(`{"p":"probe","op":"${s.id}"}`)
          .setCustomFeeLimits([limitFor(s.payerId)]),
        s.signers,
      );
      c.close();
      let tx: unknown = null;
      if (r.transactionId !== '(unassigned)') {
        tx = await mirror.poll<Record<string, unknown>>(
          `/transactions/${toMirrorTxId(r.transactionId)}`,
          () => true,
        );
      }
      results[s.id] = { payer: s.payerId, signers: s.signers.map((x) => x.label), expect: s.expect, why: s.why, status: r.status, transactionId: r.transactionId, transaction: tx };
      record(`submission:${s.id}`, `${label} — payer ${s.payer.label}, signers [${s.signers.map((x) => x.label).join(', ') || 'payer only'}], expected ${s.expect}`, {
        status: r.status,
        transactionId: r.transactionId,
        transaction: tx,
      });
    };

    for (const s of submissions) await runSubmission(s, s.why);

    // ---- 7. amend the exempt list under the admin key ---------------------
    const update = must(
      await submit(
        client,
        env.postmasterPayerId,
        new TopicUpdateTransaction().setTopicId(topicId).setFeeExemptKeys([owner2.publicKey]),
      ),
      'amend the exempt list under the admin key',
    );
    record('topic:update', 'exempt list replaced with owner2, signed by the admin key — hip-991.md:110-113 observed', {
      transactionId: update.transactionId,
      newExemptKey: publicHex(owner2),
    });

    // The predicate must be the CHANGE, not "any answer": a mirror node that has
    // not yet ingested the update answers with the pre-update list and a poll of
    // () => true accepts it. Run 1 of this probe recorded exactly that stale read.
    const owner2Hex = publicHex(owner2);
    const topicAfter = await mirror.poll<{ fee_exempt_key_list?: { key: string }[] }>(
      `/topics/${topicId}`,
      (t) => (t.fee_exempt_key_list ?? []).some((k) => k.key === owner2Hex),
    );
    record('topic:readback-after-update', 'RAW mirror-node JSON', topicAfter);

    for (const s of [
      { id: 'S5', payerId: env.postmasterPayerId, payer: postmasterPayer, signers: [owner] as const, expect: 'charged 1 — owner no longer exempt', why: 'that the update removes an exemption' },
      { id: 'S6', payerId: env.postmasterPayerId, payer: postmasterPayer, signers: [owner2] as const, expect: 'exempt, 0 — owner2 now exempt', why: 'that the update grants one' },
    ]) {
      await runSubmission({ ...s, signers: [...s.signers] }, s.why);
    }

    record('submissions:summary', 'all six, with the debit each actually produced', results);
  } finally {
    // ---- 8. what it leaves ------------------------------------------------
    if (topicId) {
      const del = await submit(client, env.postmasterPayerId, new TopicDeleteTransaction().setTopicId(topicId));
      record('topic:delete', 'under the admin key, in a finally, on every path', {
        topicId,
        status: del.status,
        transactionId: del.transactionId,
      });
    }
    if (tokenId && treasuryId) {
      // Return whatever units the Postmaster’s payer still holds, then dissociate, so the
      // one account the deployment keeps carries nothing of the probe afterwards.
      const bal = await mirror.get<{ tokens?: { token_id: string; balance: number }[] }>(
        `/accounts/${env.postmasterPayerId}/tokens?token.id=${tokenId}`,
      );
      const held = bal?.tokens?.[0]?.balance ?? 0;
      if (held > 0) {
        const back = await submit(
          client,
          env.postmasterPayerId,
          new TransferTransaction()
            .addTokenTransfer(tokenId, env.postmasterPayerId, -held)
            .addTokenTransfer(tokenId, treasuryId, held),
        );
        record('cleanup:return', `returned ${held} unit(s) to the probe treasury`, {
          status: back.status,
          transactionId: back.transactionId,
        });
      }
      const dis = await submit(
        client,
        env.postmasterPayerId,
        new TokenDissociateTransaction().setAccountId(env.postmasterPayerId).setTokenIds([tokenId]),
      );
      record('cleanup:dissociate', 'the Postmaster’s payer is dissociated from the probe token', {
        status: dis.status,
        transactionId: dis.transactionId,
      });
    }

    const out = process.env.PROBE_OUT ?? path.join(env.repoRoot, 'probe-observations.json');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(log, null, 2) + '\n');
    console.log(`\nobservations written to ${out}`);
    client.close();
  }
}

main().catch((e: unknown) => {
  console.error('\nPROBE STOPPED\n' + (e instanceof Error ? e.message : String(e)));
  process.exitCode = 3;
});
