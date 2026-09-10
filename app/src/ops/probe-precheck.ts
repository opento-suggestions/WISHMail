/**
 * The precheck probe — does Hedera's solvency check compare the payer's balance
 * to the fee it ESTIMATES, or to the maximum the transaction DECLARES?
 *
 * Wholly disposable (CLAUDE.md §11, D-149's posture). Its own throwaway account,
 * its own throwaway topic, its own key born in this process and never persisted.
 * The real `$POSTAGE`, treasury, doorbell, price topic and Postmaster-agent are
 * not created, touched or named, and the runner refuses to start if it sees any
 * of them. It writes nothing to `app/deployment/hedera-testnet.json` and nothing
 * to `spec/pins.json`; its whole record is `app/OPERATIONS.md`.
 *
 * WHY IT EXISTS. `register_agent` is the one submission in this project whose
 * payer holds almost nothing — 0.05 ℏ, funded as the third leg of the purchase
 * (§4.6, D-159's addendum) — so it is the only one where the declared maximum
 * fee is not a formality. It declared 2 ℏ until 2026-09-09, forty times the
 * balance funding it, and was lowered to 0.02 ℏ because **this project cannot
 * cite which quantity the precheck compares**. Gate One then ran and the
 * submission succeeded, charged 0.00377436 ℏ — which is consistent with BOTH
 * readings and therefore settles neither. Declaring explicitly was what made
 * the run safe without knowing; it is not what makes the answer known.
 *
 * THE EXPERIMENT, and it is a binary. One account, one balance, one HCS message
 * whose actual cost is a tiny fraction of that balance:
 *
 *     balance   0.10 ℏ
 *     declared  1.00 ℏ     — ABOVE the balance
 *     actual    ~0.0001 ℏ  — far BELOW the balance
 *
 *   INSUFFICIENT_PAYER_BALANCE  ->  the precheck compares the DECLARED maximum.
 *   SUCCESS                     ->  the precheck compares the ESTIMATED fee.
 *
 * There is no third outcome that answers the question, and one that would
 * confuse it: `INSUFFICIENT_TX_FEE` means the declared maximum was below what
 * the network required, which is the opposite comparison and is why the declared
 * maximum here is set far above any plausible cost rather than near it.
 *
 * THE CONTROL, without which act 2 means nothing. The same submission, from the
 * same account, with the declared maximum BELOW the balance. It must succeed
 * under either reading. If it fails, the account cannot pay at all — a funding
 * or association or expiry problem — and act 2's refusal would have been about
 * that and not about the comparison.
 *
 * WHAT THE ANSWER CHANGES. If the precheck reads the DECLARED maximum, then a
 * declared maximum above the balance is refused at the node no matter how cheap
 * the transaction is, and `register_agent`'s 2 ℏ declaration would have failed
 * every time — the lowering was a fix and not a precaution. If it reads the
 * ESTIMATE, the 2 ℏ declaration would have worked and the lowering is defence in
 * depth. Either way the finding goes to ledger §H with its date, and to
 * LIMITATIONS beside the sentence that says the purchase funds exactly one fee.
 *
 * Usage:  npm run probe:precheck  [--dry-run]
 */
import {
  AccountCreateTransaction,
  Hbar,
  HbarUnit,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
} from '@hashgraph/sdk';
import { loadEnv } from './env.js';
import { runMode } from './mode.js';
import { bornHere, fromEnv, publicHex, type Signer } from './identity.js';
import { Mirror, toMirrorTxId, FRESH } from './mirror.js';
import { clientFor, submit, type Submitted } from './hedera.js';

/** The real entities. If any of these is ever named here, the probe stops. */
const FORBIDDEN = ['0.0.10426208', '0.0.10426205', '0.0.10426553', '0.0.10426206', '0.0.10426591', '0.0.10426551'];

/** What the throwaway payer is given. Small enough that 1 ℏ is plainly above it. */
const BALANCE_TINYBAR = 10_000_000; // 0.10 ℏ

/** Act 2's declaration: ABOVE the balance, and far above any plausible cost. */
const DECLARED_ABOVE = new Hbar(1); // 1.00 ℏ

/** Act 3's declaration: BELOW the balance, and still far above the cost. */
const DECLARED_BELOW = Hbar.fromTinybars(5_000_000); // 0.05 ℏ

// Dry run is the DEFAULT (ops/mode.ts): --live must arrive to submit.
const dryRun = !runMode('probe:precheck').live;

let checks = 0;
let failures = 0;
function predicate(name: string, held: boolean, detail = ''): void {
  checks += 1;
  if (!held) failures += 1;
  console.log(`  ${held ? 'ok  ' : 'FAIL'} ${name}${held || detail === '' ? '' : ` — ${detail}`}`);
}

function say(act: string, note: string): void {
  console.log(`\n--- ${act} — ${note}`);
}

function must(s: Submitted, what: string): Submitted {
  if (!s.ok) throw new Error(`STOP: ${what} returned ${s.status} (tx ${s.transactionId})`);
  return s;
}

interface MirrorTx {
  readonly transactions?: readonly {
    readonly name?: string;
    readonly result?: string;
    readonly charged_tx_fee?: number;
    readonly max_fee?: string;
    readonly transaction_id?: string;
  }[];
}

interface MirrorAccount {
  readonly account?: string;
  readonly balance?: { readonly balance?: number };
  readonly deleted?: boolean;
}

async function main(): Promise<void> {
  const env = loadEnv();
  const mirror = new Mirror(env.mirrorNodeUrl);

  console.log('');
  console.log(`  the precheck probe — DECLARED or ESTIMATED, ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`  network       ${env.network}`);
  console.log(`  payer         ${env.postmasterPayerId}   (pays for the disposable entities only)`);
  console.log(`  balance       ${BALANCE_TINYBAR} tinybars given to the throwaway account`);
  console.log(`  act 2         declares ${DECLARED_ABOVE.toString()} — ABOVE that balance`);
  console.log(`  act 3         declares ${DECLARED_BELOW.toString()} — BELOW it, the control`);
  console.log('');

  if (dryRun) {
    console.log('  --dry-run: nothing was signed and nothing submitted.');
    console.log('');
    return;
  }

  const postmasterPayer = fromEnv('postmaster payer', 'POSTMASTER_PAYER_DER_KEY');
  const client = clientFor(env, env.postmasterPayerId, postmasterPayer);

  try {
    // --- act 0: a throwaway topic. No submit key, so any account may submit to
    // it; no custom fee, so nothing is owed beyond the transaction fee itself.
    say('act 0', 'a disposable topic, paid for by the Postmaster payer');
    const topicTx = new TopicCreateTransaction().setTopicMemo('wishmail:probe:precheck').setMaxTransactionFee(new Hbar(5));
    const topic = must(await submit(client, env.postmasterPayerId, topicTx, [postmasterPayer]), 'the topic create');
    const topicId = topic.entityId;
    if (topicId === undefined) throw new Error('STOP: the topic create returned no entity id');
    if (FORBIDDEN.includes(topicId)) throw new Error(`STOP: ${topicId} is a real entity`);
    console.log(`  topic ${topicId}  (tx ${topic.transactionId})`);

    // --- act 1: a throwaway account, holding exactly the balance under test.
    say('act 1', 'a disposable account, born in this process, holding 0.10 hbar');
    const throwaway: Signer = bornHere('probe-precheck-payer');
    const acctTx = new AccountCreateTransaction()
      .setKeyWithoutAlias(throwaway.publicKey)
      .setInitialBalance(Hbar.fromTinybars(BALANCE_TINYBAR))
      .setMaxTransactionFee(new Hbar(5));
    const acct = must(await submit(client, env.postmasterPayerId, acctTx, [postmasterPayer, throwaway]), 'the account create');
    const accountId = acct.entityId;
    if (accountId === undefined) throw new Error('STOP: the account create returned no entity id');
    console.log(`  account ${accountId}  key ${publicHex(throwaway).slice(0, 16)}…  (tx ${acct.transactionId})`);

    // Read the balance back from the MIRROR and not from the receipt: the whole
    // question is what a node compares a balance to, so the balance had better
    // be the one consensus records.
    const born = await mirror.poll<MirrorAccount>(`/accounts/${accountId}`, (a) => (a.balance?.balance ?? 0) > 0, FRESH);
    const bornBalance = born?.balance?.balance ?? 0;
    predicate('the throwaway account holds exactly the balance under test', bornBalance === BALANCE_TINYBAR, `${bornBalance}`);
    predicate('and it is not deleted', born?.deleted !== true);

    // A client whose OPERATOR is the throwaway account: it is the payer for both
    // acts below, which is the only way the precheck is asked about it at all.
    const payerClient = clientFor(env, accountId, throwaway);

    try {
      // --- act 2: THE QUESTION.
      say('act 2', `THE QUESTION — declared ${DECLARED_ABOVE.toString()} against a ${bornBalance}-tinybar balance`);
      const above = new TopicMessageSubmitTransaction()
        .setTopicId(topicId)
        .setMessage('precheck probe: declared above the balance')
        .setMaxTransactionFee(DECLARED_ABOVE);
      const answer = await submit(payerClient, accountId, above, [throwaway]);
      console.log(`  status ${answer.status}   (tx ${answer.transactionId})`);

      const declaredReading = !answer.ok && /INSUFFICIENT_PAYER_BALANCE/.test(answer.status);
      const estimatedReading = answer.ok;
      predicate(
        'the outcome is one of the two that answer the question',
        declaredReading || estimatedReading,
        `${answer.status} answers neither; INSUFFICIENT_TX_FEE would mean the declaration was BELOW what was required`,
      );

      // --- act 3: THE CONTROL. Must succeed under either reading.
      say('act 3', `THE CONTROL — declared ${DECLARED_BELOW.toString()}, below the balance`);
      const below = new TopicMessageSubmitTransaction()
        .setTopicId(topicId)
        .setMessage('precheck probe: control, declared below the balance')
        .setMaxTransactionFee(DECLARED_BELOW);
      const control = await submit(payerClient, accountId, below, [throwaway]);
      console.log(`  status ${control.status}   (tx ${control.transactionId})`);
      predicate(
        'the control succeeds, so act 2 was about the comparison and not about the account',
        control.ok,
        control.status,
      );

      // --- what the mirror says it cost, and what the account has left.
      say('act 4', 'the mirror on what was charged, and the balance after');
      const seen = await mirror.poll<MirrorTx>(
        `/transactions/${toMirrorTxId(control.transactionId)}`,
        (t) => (t.transactions ?? []).some((x) => x.result === 'SUCCESS'),
        FRESH,
      );
      const charged = (seen?.transactions ?? []).find((x) => x.result === 'SUCCESS')?.charged_tx_fee ?? 0;
      console.log(`  the control cost ${charged} tinybars (${(charged / 1e8).toFixed(8)} hbar)`);
      predicate('the actual cost is far below the balance, which is what makes act 2 a clean question', charged < bornBalance / 10, `${charged} vs ${bornBalance}`);

      const after = await mirror.get<MirrorAccount>(`/accounts/${accountId}`);
      console.log(`  balance after  ${after?.balance?.balance ?? '(unread)'} tinybars`);

      /* ---------------- the finding ---------------- */

      console.log('');
      console.log('  ================= THE FINDING =================');
      if (declaredReading) {
        console.log('  The precheck compares the payer balance to the DECLARED MAXIMUM.');
        console.log('  A declared maximum above the balance is refused at the node however cheap');
        console.log('  the transaction is. register_agent declaring 2 hbar against a 0.05 hbar');
        console.log('  balance WOULD have failed every time; lowering it to 0.02 was a FIX.');
      } else if (estimatedReading) {
        console.log('  The precheck compares the payer balance to the FEE IT ESTIMATES.');
        console.log('  A declared maximum above the balance is accepted so long as the actual');
        console.log('  cost fits. register_agent declaring 2 hbar against a 0.05 hbar balance');
        console.log('  would have worked; lowering it to 0.02 is defence in depth, not a fix.');
      } else {
        console.log(`  UNRESOLVED. act 2 returned ${answer.status}, which answers neither reading.`);
        console.log('  Report it as unresolved; do not infer.');
      }
      console.log('  ==============================================');
      console.log('');
      console.log(`  act 2 declared  ${DECLARED_ABOVE.toString()} (${DECLARED_ABOVE.to(HbarUnit.Tinybar).toString()} tinybars)`);
      console.log(`  balance         ${bornBalance} tinybars`);
      console.log(`  actual cost     ${charged} tinybars`);
      console.log(`  act 2 status    ${answer.status}`);
      console.log(`  act 3 status    ${control.status}`);
      console.log('');
      console.log(`  disposable: topic ${topicId}, account ${accountId}. The account's key was born in this`);
      console.log('  process and is discarded with it; nothing here is in the ops record or in spec/pins.json.');
      console.log('');
      console.log(`  ${checks - failures} of ${checks} predicates held.`);
      console.log('');
    } finally {
      payerClient.close();
    }
  } finally {
    client.close();
  }

  if (failures > 0) process.exitCode = 1;
}

main().catch((e: unknown) => {
  console.error('\nSTOPPED\n' + (e instanceof Error ? e.message : String(e)));
  process.exitCode = 3;
});
