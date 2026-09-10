/**
 * The HIP-542 probe — does a transfer to a public-key alias create the account,
 * and can that account then sign for itself with someone else paying?
 *
 * Wholly disposable (CLAUDE.md §11, D-149's posture). Its own treasury, its own
 * token, its own alias key, all born in this process and none of them persisted.
 * The real `$POSTAGE`, the real treasury and the real doorbell are not created,
 * touched, or named here, and the runner refuses to start if it sees any of
 * them. It writes nothing to `app/deployment/hedera-testnet.json` and nothing to
 * `spec/pins.json`; its whole record is `app/OPERATIONS.md`.
 *
 * WHY IT EXISTS. D-159 puts the entire provisioning order on one mechanism this
 * repository has read about and never watched: a token transfer to a public-key
 * alias that has no account creates the account under that key. §4.6 states it,
 * T-P16-1 tests it, ledger §H carries it from `docs.hedera.com` and HIP-542 —
 * and every word of that is second-hand.
 *
 * The two questions, and the second is the one D-159 actually rests on:
 *
 *   1. Does the alias transfer create the account, with the token associated,
 *      the balance credited, and — as D-159's addendum now requires — the ℏ leg
 *      credited in the same transaction?
 *   2. Can that account, holding only the fee it was given, sign a transfer OUT
 *      with the Postmaster’s payer as payer, and end with its ℏ untouched?
 *
 * If (2) fails with INSUFFICIENT_PAYER_BALANCE against the new account, that is
 * the finding and not a failure: it means a nearly-empty account cannot be a
 * non-payer signer, D-157's payer seam does not work, and "fund one fee" becomes
 * "fund every submission" — which contradicts D-156 and goes to Sonic before
 * anything else is built.
 *
 * WHAT CHANGED FROM THE GATE REPORT, and it is a finding of its own. The report
 * said the 2026-09-08 probe token and its treasury would be reused "where
 * reusable". They are not reusable. `0.0.10425740` holds 9,999 units of
 * `0.0.10425743`, and its private key was born in that run's process and
 * discarded — it is in no file, by design. Nothing can move those units, which
 * is the strongest possible sense of inert. So this probe mints its own token
 * with its own throwaway treasury, exactly as the 09-08 probe did, and leaves a
 * second inert token behind for the same reason the first one is inert.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  AccountCreateTransaction,
  Hbar,
  HbarUnit,
  TokenCreateTransaction,
  TokenMintTransaction,
  TokenSupplyType,
  TokenType,
  TransferTransaction,
} from '@hashgraph/sdk';
import { loadEnv } from './env.js';
import { runMode } from './mode.js';
import { bornHere, fromEnv, publicHex, type Signer } from './identity.js';
import { Mirror, toMirrorTxId, FRESH } from './mirror.js';
import { clientFor, submit, type Submitted } from './hedera.js';

/** The real entities. If any of these is ever named here, the probe stops. */
const FORBIDDEN = ['0.0.10426208', '0.0.10426205', '0.0.10426553', '0.0.10426206', '0.0.10426591'];

/**
 * The registration fee, as ℏ. Realistic rather than symbolic: an ordinary
 * ConsensusSubmitMessage costs a small fraction of this, and D-159's addendum
 * funds one fee and no more.
 */
const FEE_TINYBAR = 5_000_000; // 0.05 ℏ

interface Observation {
  readonly act: string;
  readonly note: string;
  readonly data: unknown;
}

const log: Observation[] = [];
const record = (act: string, note: string, data: unknown): void => {
  log.push({ act, note, data });
  console.log(`\n--- ${act} — ${note}`);
  console.log(typeof data === 'string' ? data : JSON.stringify(data, null, 2));
};

let checks = 0;
let failures = 0;
function predicate(name: string, held: boolean, detail = ''): void {
  checks += 1;
  if (!held) failures += 1;
  console.log(`  ${held ? 'ok  ' : 'FAIL'} ${name}${held || detail === '' ? '' : ` — ${detail}`}`);
}

function must(s: Submitted, what: string): Submitted {
  if (!s.ok) throw new Error(`STOP: ${what} returned ${s.status} (tx ${s.transactionId})`);
  return s;
}

interface MirrorAccountsPage {
  readonly accounts?: readonly {
    readonly account: string;
    readonly key?: { readonly _type?: string; readonly key?: string };
    readonly balance?: {
      readonly balance?: number;
      readonly tokens?: readonly { readonly token_id: string; readonly balance: number }[];
    };
  }[];
}

interface MirrorTx {
  readonly transactions?: readonly {
    readonly name?: string;
    readonly result?: string;
    readonly entity_id?: string | null;
    readonly charged_tx_fee?: number;
    readonly transfers?: readonly { readonly account: string; readonly amount: number }[];
    readonly token_transfers?: readonly {
      readonly token_id: string;
      readonly account: string;
      readonly amount: number;
    }[];
  }[];
}

async function main(): Promise<void> {
  // A probe signs. Dry run is the DEFAULT (ops/mode.ts): --live must ARRIVE,
  // and a probe that is not told to go live reports what it would do and stops.
  if (!runMode('probe:542').live) {
    console.log('  DRY RUN: this probe signs when it runs, and it was not told to. Nothing was submitted.');
    console.log('  to run it for real, pass --live — and read the argv line above to see that it arrived.');
    console.log('');
    return;
  }
  const env = loadEnv();
  const mirror = new Mirror(env.mirrorNodeUrl);
  const postmasterPayer = fromEnv('postmaster payer', 'POSTMASTER_PAYER_DER_KEY');
  const client = clientFor(env, env.postmasterPayerId, postmasterPayer);

  // Every identity in this run is born here and dies with the process.
  const probeTreasury: Signer = bornHere('probe treasury');
  const alias: Signer = bornHere('the new agent');

  record('start', 'disposable: nothing here is written to pins.json or the ops record', {
    network: env.network,
    postmasterPayer: env.postmasterPayerId,
    mirrorNodeUrl: env.mirrorNodeUrl,
    feeTinybar: FEE_TINYBAR,
    publicKeys: { probeTreasury: publicHex(probeTreasury), alias: publicHex(alias) },
    note: "the 2026-09-08 probe token is not reusable: its treasury's key was born in that process and discarded",
  });

  let treasuryId: string | undefined;
  let tokenId: string | undefined;

  try {
    // ---- act 0: the probe treasury account -------------------------------
    treasuryId = must(
      await submit(
        client,
        env.postmasterPayerId,
        new AccountCreateTransaction().setKeyWithoutAlias(probeTreasury.publicKey).setInitialBalance(new Hbar(2)),
      ),
      'create the probe treasury',
    ).entityId!;
    record('act 0', 'probe treasury created, the Postmaster’s payer paying', { treasuryId });

    // ---- act 1: the probe token, born at zero and minted -----------------
    // D-141's posture and D-149's birth-then-mint, so the probe mirrors the
    // real token's shape rather than a convenient one.
    tokenId = must(
      await submit(
        client,
        env.postmasterPayerId,
        new TokenCreateTransaction()
          .setTokenName('WISHMail HIP-542 probe stamp')
          .setTokenSymbol('P542')
          .setTokenType(TokenType.FungibleCommon)
          .setDecimals(0)
          .setInitialSupply(0)
          .setSupplyType(TokenSupplyType.Infinite)
          .setTreasuryAccountId(treasuryId)
          .setSupplyKey(probeTreasury.publicKey)
          .setMaxTransactionFee(new Hbar(40)),
        [probeTreasury],
      ),
      'create the probe token',
    ).entityId!;
    for (const id of FORBIDDEN) {
      if (id === tokenId || id === treasuryId) throw new Error(`STOP: the probe named a real entity: ${id}`);
    }
    record('act 1a', 'probe token created', { tokenId, treasuryId });

    must(
      await submit(
        client,
        env.postmasterPayerId,
        new TokenMintTransaction().setTokenId(tokenId).setAmount(10),
        [probeTreasury],
      ),
      'mint',
    );
    record('act 1b', '10 units minted to the probe treasury', { tokenId });

    // ---- act 2: ONE transaction, two legs, to a key that has no account ---
    // This is the purchase's shape under D-159's addendum: stamps and the
    // registration fee arriving together, so the account is born holding both.
    // The alias is the PUBLIC KEY (§H); AccountId.fromEvmAddress is NOT used,
    // because an EVM-address alias makes a hollow account with no key.
    const aliasAccount = alias.publicKey.toAccountId(0, 0);
    const act2 = must(
      await submit(
        client,
        env.postmasterPayerId,
        new TransferTransaction()
          .addTokenTransfer(tokenId, treasuryId, -1)
          .addTokenTransfer(tokenId, aliasAccount, 1)
          .addHbarTransfer(env.postmasterPayerId, Hbar.fromTinybars(-FEE_TINYBAR))
          .addHbarTransfer(aliasAccount, Hbar.fromTinybars(FEE_TINYBAR))
          .setMaxTransactionFee(new Hbar(5)),
        [probeTreasury],
      ),
      'the two-leg transfer to the alias',
    );
    record('act 2', 'one transfer: 1 stamp and the fee, both to the public-key alias', {
      transactionId: act2.transactionId,
      status: act2.status,
      alias: aliasAccount.toString(),
    });

    // ---- act 3: what the mirror says, and never an SDK receipt ------------
    const raw = publicHex(alias);
    const page = await mirror.poll<MirrorAccountsPage>(
      `/accounts?account.publickey=${raw}&balance=true`,
      (v) => (v.accounts?.length ?? 0) > 0,
      FRESH,
    );
    const created = page?.accounts?.[0];
    record('act 3a', 'the mirror, asked for an account under the generated public key', page);

    predicate('an account exists at the alias', created !== undefined);
    if (created === undefined) throw new Error('STOP: no account was created at the alias; question 1 is answered no');

    const newAccountId = created.account;
    predicate('its key is the generated public key', created.key?.key === raw, `mirror says ${created.key?.key}`);
    const hbarAfter2 = created.balance?.balance ?? -1;
    predicate(
      `its ℏ balance equals the tinybars sent (${FEE_TINYBAR})`,
      hbarAfter2 === FEE_TINYBAR,
      `mirror says ${hbarAfter2}`,
    );
    const tokenAfter2 = created.balance?.tokens?.find((t) => t.token_id === tokenId)?.balance ?? -1;
    predicate('its token balance is 1', tokenAfter2 === 1, `mirror says ${tokenAfter2}`);

    const act2Tx = await mirror.poll<MirrorTx>(
      `/transactions/${toMirrorTxId(act2.transactionId)}`,
      (v) => (v.transactions?.length ?? 0) > 0,
      FRESH,
    );
    record('act 3b', "act 2's transaction as the mirror recorded it, children included", act2Tx);
    const parent2 = act2Tx?.transactions?.find((t) => t.name === 'CRYPTOTRANSFER') ?? act2Tx?.transactions?.[0];
    const paidBy2 = (parent2?.transfers ?? []).filter((t) => t.amount < 0).map((t) => t.account);
    predicate(
      'the account-creation fee was charged to the Postmaster’s payer, not to the new account',
      paidBy2.includes(env.postmasterPayerId) && !paidBy2.includes(newAccountId),
      `debited: ${paidBy2.join(', ')}`,
    );

    // ---- act 4: the new account signs OUT, with the Postmaster’s payer paying -------
    // The affix shape under D-157's seam: the agent signs as the stamps' owner
    // (§4.3), the Postmaster’s payer pays. Everything after step 2 of D-159 depends on it.
    const act4 = await submit(
      client,
      env.postmasterPayerId,
      new TransferTransaction()
        .addTokenTransfer(tokenId, newAccountId, -1)
        .addTokenTransfer(tokenId, treasuryId, 1)
        .setMaxTransactionFee(new Hbar(5)),
      [alias],
    );
    record('act 4', 'the new account signs a transfer out; the Postmaster’s payer is the payer', {
      transactionId: act4.transactionId,
      status: act4.status,
    });
    if (!act4.ok) {
      predicate('the new account can sign as a non-payer', false, act4.status);
      if (act4.status.includes('INSUFFICIENT_PAYER_BALANCE')) {
        console.log('\n  THE FINDING: a nearly-empty account cannot sign as a non-payer.');
        console.log('  D-157’s payer seam does not work and D-156 changes. Stop here; this goes to Sonic.');
      }
      throw new Error(`STOP: act 4 returned ${act4.status}`);
    }
    predicate('the new account can sign as a non-payer', true);

    // ---- act 5: what the mirror says about who paid ----------------------
    const act4Tx = await mirror.poll<MirrorTx>(
      `/transactions/${toMirrorTxId(act4.transactionId)}`,
      (v) => (v.transactions?.length ?? 0) > 0,
      FRESH,
    );
    record('act 5a', "act 4's transaction as the mirror recorded it", act4Tx);
    const parent4 = act4Tx?.transactions?.[0];
    const tt = parent4?.token_transfers ?? [];
    predicate(
      'token_transfers shows -1 from the new account and +1 to the probe treasury',
      tt.some((t) => t.account === newAccountId && t.amount === -1) &&
        tt.some((t) => t.account === treasuryId && t.amount === 1),
      JSON.stringify(tt),
    );
    const paidBy4 = (parent4?.transfers ?? []).filter((t) => t.amount < 0).map((t) => t.account);
    predicate(
      'the fee was paid by the Postmaster’s payer and not by the signer',
      paidBy4.includes(env.postmasterPayerId) && !paidBy4.includes(newAccountId),
      `debited: ${paidBy4.join(', ')}`,
    );

    const after = await mirror.poll<MirrorAccountsPage>(
      `/accounts?account.publickey=${raw}&balance=true`,
      (v) => {
        const t = v.accounts?.[0]?.balance?.tokens?.find((x) => x.token_id === tokenId);
        return (t?.balance ?? -1) === 0;
      },
      FRESH,
    );
    record('act 5b', 'the new account after signing out', after);
    const hbarAfter4 = after?.accounts?.[0]?.balance?.balance ?? -1;
    predicate(
      `its ℏ balance is unchanged at ${FEE_TINYBAR} (the payer paid)`,
      hbarAfter4 === FEE_TINYBAR,
      `mirror says ${hbarAfter4}`,
    );

    record('summary', 'both questions answered from the mirror node', {
      newAccountId,
      tokenId,
      treasuryId,
      hbarAtBirth: hbarAfter2,
      hbarAfterSigning: hbarAfter4,
      act2TransactionId: act2.transactionId,
      act4TransactionId: act4.transactionId,
    });
  } finally {
    const out = process.env['PROBE_OUT'] ?? path.join(env.repoRoot, 'probe542-observations.json');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(log, null, 2) + '\n');
    console.log(`\nobservations written to ${out}`);
    console.log(`\nprobe:542 — ${checks - failures} of ${checks} predicates held`);
    client.close();
    if (failures > 0) process.exitCode = 1;
  }
}

main().catch((e: unknown) => {
  console.error('\nPROBE STOPPED\n' + (e instanceof Error ? e.message : String(e)));
  process.exitCode = 3;
});
