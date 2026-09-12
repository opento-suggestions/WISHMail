/**
 * GATE FOUR'S WALLETS — brand-new operator accounts with ZERO association
 * slots, and the homes that belong to them.
 *
 * WHY THIS EXISTS BESIDE `demo-operators.ts` RATHER THAN INSIDE IT. That module
 * creates an operator wallet with `maxAutomaticTokenAssociations = -1`, asserts
 * `=== -1` on readback, and funds at 35 ℏ. Every one of those is wrong here, and
 * its `-1` assertion is a true record of how `a` and `b` were made and should
 * stay that way. A zero-slot wallet is a different act with a different
 * postcondition, so it gets its own driver.
 *
 * WHAT GATE FOUR IS FOR, IN ONE FACT. `ensurePayerHoldsStamps`
 * (`sdk/mailbox.ts`) skips the association when the operator reads `-1` or has
 * a free slot, and submits a `TokenAssociateTransaction` otherwise. **Both demo
 * operators have read `-1` every time, so that branch has NEVER executed against
 * the network.** A wallet created here reads `0`: `0 === -1` is false and
 * `0 > 0` is false, so the branch fires — at provisioning, before any topic is
 * created and long before any ring, on BOTH agents' operators.
 *
 * THE ORDER OF OPERATIONS IS THE POINT OF THE FILE, and it is Sonic's ruling
 * (2026-09-11): **the payer key is generated AND persisted to disk BEFORE
 * `AccountCreateTransaction` is submitted.**
 *
 * `demo-operators.ts` does the opposite, deliberately and for a good reason —
 * it will not write a key for an account it has not verified. But its failure
 * shape is that the readback throws AFTER the account is created and BEFORE the
 * key is written, and its own comment says what that costs: "The account exists
 * and the key for it is NOT yet written to any file; recover it by hand or
 * abandon it." At 35 ℏ that is a bad afternoon. At 250 ℏ, six times over, it is
 * not acceptable, so the order is inverted and the money is never created except
 * against a key already on disk.
 *
 * `install()` takes the account id at write time and the account does not exist
 * yet, so the write is two-phase. The sentinel below deliberately FAILS
 * `openHome()`'s `^[0-9]+\.[0-9]+\.[0-9]+$` check, so a half-written home cannot
 * be booted and says why when someone tries.
 *
 * Every crash window leaves a recoverable state:
 *
 *   between the config write and the create   key on disk, nothing funded.
 *   between the create and the id write       account created and FUNDED, and
 *                                             the key that controls it is
 *                                             already on disk. Find it on the
 *                                             mirror by public key and fill in
 *                                             `payer.accountId`.
 *
 * **A re-run can never create a second funded account**, because `install()`
 * refuses to overwrite and it is the FIRST step. So the resume is manual, and
 * this says so rather than implying idempotence.
 *
 * Usage:  npm run gate4:wallets -- [--dir <parent>] [--only <slug>] [--live]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { AccountCreateTransaction, Hbar } from '@hashgraph/sdk';
import { runMode } from './mode.js';
import { bornPayerWallet } from '../../sdk/keystore.js';
import { clientFor, submit } from './hedera.js';
import { loadEnv, repoRoot } from './env.js';
import { fromEnv } from './identity.js';
import { Mirror } from './mirror.js';
import { named } from './step.js';

/** RECORD (Sonic, 2026-09-11): 250 ℏ each. See the gate report for the arithmetic. */
const INITIAL_HBAR = 250;

/**
 * ZERO free slots, which is the whole point. Named rather than written as a
 * bare 0, because 0 in this field is a decision and not an absence.
 */
const NO_AUTO_ASSOCIATIONS = 0;

/**
 * What `payer.accountId` says between the key landing and the account existing.
 *
 * It is not `""`. It fails `openHome()`'s account-id pattern either way, but a
 * home that stopped half way should say so in words to whoever opens the file.
 */
const PENDING = 'PENDING-ACCOUNT-CREATE';

export interface NewOperator {
  /** The directory name, and nothing more. */
  readonly slug: string;
  readonly displayName: string;
  readonly alias: string;
  readonly bio: string;
  /** What this home is for, in the gate report's words. */
  readonly purpose: string;
}

const BIO = 'A WISHMail Correspondent. Certified mail for agents on Hedera.';

export const GATE_FOUR_WALLETS: readonly NewOperator[] = [
  { slug: 'gz4-x', displayName: 'DemoAgentX4', alias: 'demo-agent-x4', bio: BIO, purpose: 'Gate Four — SENDER' },
  { slug: 'gz4-y', displayName: 'DemoAgentY4', alias: 'demo-agent-y4', bio: BIO, purpose: 'Gate Four — RECIPIENT' },
  { slug: 'gz5-x', displayName: 'DemoAgentX5', alias: 'demo-agent-x5', bio: BIO, purpose: 'the take — SENDER' },
  { slug: 'gz5-y', displayName: 'DemoAgentY5', alias: 'demo-agent-y5', bio: BIO, purpose: 'the take — RECIPIENT' },
  { slug: 'gz6-x', displayName: 'DemoAgentX6', alias: 'demo-agent-x6', bio: BIO, purpose: 'the spare — SENDER' },
  { slug: 'gz6-y', displayName: 'DemoAgentY6', alias: 'demo-agent-y6', bio: BIO, purpose: 'the spare — RECIPIENT' },
];

export function defaultHomesParent(): string {
  return path.join(os.homedir(), '.wishmail', 'demo');
}

/** The shipped template, with `_readme` kept — an operator reads it in their own file. */
function template(postmasterUrl: string, network: string, who: NewOperator): Record<string, unknown> {
  const raw = JSON.parse(
    fs.readFileSync(path.join(repoRoot(), 'app', 'sdk', 'config.template.json'), 'utf8'),
  ) as Record<string, unknown>;
  return {
    ...raw,
    network,
    postmasterUrl,
    agent: { displayName: who.displayName, alias: who.alias, bio: who.bio },
  };
}

interface MAccount {
  readonly account: string;
  readonly deleted?: boolean | null;
  readonly balance?: { readonly balance?: number };
  readonly max_automatic_token_associations?: number | null;
}

export interface Created {
  readonly slug: string;
  readonly purpose: string;
  readonly accountId: string;
  readonly configPath: string;
  readonly transactionId: string;
  readonly balanceTinybar: number;
  readonly maxAutomaticTokenAssociations: number;
}

/**
 * Fill in `payer.accountId` on a config whose key is already written.
 *
 * NOT via `install()`, which refuses to overwrite — correctly, since that
 * refusal is what makes a re-run safe. tmp + rename at 0600, the same way the
 * key was written.
 */
function writeAccountId(configPath: string, accountId: string): void {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>;
  const payer = { ...((config['payer'] as Record<string, unknown> | undefined) ?? {}) };
  if (payer['accountId'] !== PENDING) {
    throw new Error(`${configPath} does not read as pending (${String(payer['accountId'])}); refusing to rewrite it`);
  }
  payer['accountId'] = accountId;
  const tmp = configPath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({ ...config, payer }, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, configPath);
}

export async function createOne(
  env: ReturnType<typeof loadEnv>,
  mirror: Mirror,
  who: NewOperator,
  parent: string,
  postmasterUrl: string,
): Promise<Created> {
  const dir = path.join(parent, who.slug);
  const configPath = path.join(dir, 'config.json');
  if (fs.existsSync(configPath)) {
    throw new Error(
      `${configPath} already exists. A home is an agent (D-165) and this run does not overwrite one: ` +
        'move it aside, or point --dir somewhere else.',
    );
  }

  // 1 & 2. The key is born and PERSISTED, before anything is submitted.
  const wallet = bornPayerWallet();
  const written = wallet.install(dir, template(postmasterUrl, env.network, who), PENDING);
  fs.chmodSync(written, 0o600);
  console.log(`  ${who.slug}  key written to ${written} (accountId ${PENDING})`);

  // 3. Only now is money created, and it is created against a key on disk.
  const payer = fromEnv('postmaster payer', 'POSTMASTER_PAYER_DER_KEY');
  const client = clientFor(env, env.postmasterPayerId, payer);
  const tx = new AccountCreateTransaction()
    .setKeyWithoutAlias(wallet.signer.publicKey)
    .setInitialBalance(new Hbar(INITIAL_HBAR))
    .setMaxAutomaticTokenAssociations(NO_AUTO_ASSOCIATIONS)
    .setAccountMemo('')
    .setMaxTransactionFee(new Hbar(5));
  const r = await submit(client, env.postmasterPayerId, tx, [wallet.signer]);
  client.close();
  if (!r.ok) {
    throw new Error(
      `the account for ${who.slug} was not created: ${r.status} (tx ${r.transactionId}). ` +
        `The key IS on disk at ${written} and nothing was funded; delete the home or create an account for that key.`,
    );
  }
  const accountId = r.entityId;
  if (accountId === undefined) throw new Error(`the create for ${who.slug} returned no account id`);

  // 4. Read back from the MIRROR and never from the receipt: the field this run
  // exists to set is exactly the kind a receipt cannot show.
  const p = named<MAccount>(
    'the account exists, holds its initial balance, and has ZERO automatic association slots',
    (a) =>
      a.account === accountId &&
      a.deleted !== true &&
      (a.balance?.balance ?? 0) >= INITIAL_HBAR * 100_000_000 &&
      a.max_automatic_token_associations === NO_AUTO_ASSOCIATIONS,
  );
  const seen = await mirror.poll<MAccount>(`/accounts/${accountId}?limit=1`, p.test);
  if (seen === null || !p.test(seen)) {
    throw new Error(
      `${accountId} was created as ${r.transactionId} and does not read back as ${p.name}. ` +
        `THE KEY IS ON DISK at ${written} and the account IS funded, so nothing is lost: ` +
        `set payer.accountId to ${accountId} by hand once the mirror agrees.`,
    );
  }

  // 5. And now the home knows its own account.
  writeAccountId(written, accountId);

  return {
    slug: who.slug,
    purpose: who.purpose,
    accountId,
    configPath: written,
    transactionId: r.transactionId,
    balanceTinybar: seen.balance?.balance ?? 0,
    maxAutomaticTokenAssociations: seen.max_automatic_token_associations ?? 0,
  };
}

function postmasterUrlFor(env: ReturnType<typeof loadEnv>): string {
  return `http://${env.mcpBind}:${env.mcpPort ?? 4600}/mcp`;
}

export async function main(): Promise<void> {
  // DRY RUN IS THE DEFAULT (ops/mode.ts): `--live` must ARRIVE to submit, and
  // the live npm script bakes it in where no forwarding can eat it.
  const mode = runMode('gate4:wallets');
  const argv = [...mode.argv];
  const dryRun = !mode.live;

  const at = argv.indexOf('--dir');
  const parent = at >= 0 && argv[at + 1] !== undefined ? path.resolve(argv[at + 1] as string) : defaultHomesParent();
  const onlyAt = argv.indexOf('--only');
  const only = onlyAt >= 0 ? argv[onlyAt + 1] : undefined;
  const wallets = only === undefined ? GATE_FOUR_WALLETS : GATE_FOUR_WALLETS.filter((w) => w.slug === only);
  if (wallets.length === 0) throw new Error(`--only ${String(only)} names no wallet in this list`);

  const env = loadEnv();
  const mirror = new Mirror(env.mirrorNodeUrl);

  console.log(`  homes parent   ${parent}`);
  console.log(`  funding from   ${env.postmasterPayerId} (the Postmaster's payer)`);
  console.log(`  each wallet    ${INITIAL_HBAR} h, maxAutomaticTokenAssociations ${NO_AUTO_ASSOCIATIONS}`);
  console.log(`  wallets        ${wallets.map((w) => w.slug).join(', ')}`);
  console.log(`  total          ${INITIAL_HBAR * wallets.length} h`);
  console.log('');

  if (dryRun) {
    for (const w of wallets) {
      const dir = path.join(parent, w.slug);
      const exists = fs.existsSync(path.join(dir, 'config.json'));
      console.log(`  would create  ${w.slug.padEnd(6)} ${w.purpose.padEnd(24)} -> ${dir}${exists ? '   ALREADY EXISTS — would REFUSE' : ''}`);
    }
    console.log('\n  DRY RUN — no key was born, no config was written and nothing was submitted.');
    console.log('  This is GATE FUND; it does not run until its report is committed and Sonic has said the word.\n');
    return;
  }

  const done: Created[] = [];
  try {
    for (const w of wallets) {
      console.log(`\n--- ${w.slug} (${w.purpose}) ---`);
      const c = await createOne(env, mirror, w, parent, postmasterUrlFor(env));
      done.push(c);
      console.log(
        `  ${c.slug}  account ${c.accountId}  ${(c.balanceTinybar / 1e8).toFixed(8)} h  ` +
          `autoAssoc ${c.maxAutomaticTokenAssociations}  tx ${c.transactionId}`,
      );
    }
  } finally {
    console.log('\n=== created ===');
    for (const c of done) {
      console.log(
        `  ${c.slug.padEnd(6)} ${c.accountId.padEnd(14)} ${(c.balanceTinybar / 1e8).toFixed(8).padStart(16)} h  ` +
          `slots ${c.maxAutomaticTokenAssociations}  ${c.transactionId}`,
      );
    }
    if (done.length < wallets.length) {
      console.log(`\n  STOPPED after ${done.length} of ${wallets.length}. Every key born is on disk.`);
      console.log('  Report what is true at the stop and wait; do not repair past it.\n');
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main();
}
