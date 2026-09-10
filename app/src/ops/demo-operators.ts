/**
 * Two demo operators' wallets — funding, and not a sale.
 *
 * Gate One needs two Correspondents, and a Correspondent needs an Operator with
 * a funded testnet wallet (§3.3, §3.5: the agent signs, the operator pays). In
 * a real deployment those wallets are the operators' own and this file does not
 * exist. In the demo we are all three parties, so the Postmaster's payer creates
 * them — and **that is funding, not a purchase**. Nothing here touches the price
 * list, the treasury, `$POSTAGE` or the counter; no `StampReceipt` is issued and
 * no reference is settled. The ops record files it under `residue` beside the
 * probes, for exactly that reason.
 *
 * WHAT IT CREATES, per operator:
 *
 *   a fresh ED25519 key, born in THIS process and never printed
 *   an `AccountCreateTransaction` paid by the Postmaster's payer
 *   35 ℏ of initial balance
 *   maxAutomaticTokenAssociations = -1
 *
 * **Why unlimited auto-associations rather than an association transaction.**
 * §4.4's doorbell fee is a HIP-991 fixed fee in `$POSTAGE`, debited from the
 * PAYER of the submission (probe-observed 2026-09-08), so when an operator pays
 * for its agent's connection request the stamp leaves the operator's account —
 * and an account cannot hold a token it is not associated with. D-157's
 * two-hop ring therefore needs the operator associated before the first
 * `send`. HIP-542 lets an account be created with unlimited automatic
 * associations, so the association happens when the first stamp arrives and
 * costs no transaction and no decision. `generate_mailbox` keeps its explicit
 * association for an operator that was NOT created this way, which is every
 * real one.
 *
 * THE KEY NEVER LEAVES ITS CLOSURE. `bornPayerWallet()` hands back a `Signer`
 * and an `install`; this module holds neither the key nor its DER string, and
 * therefore cannot print one, log one, or write one anywhere but the config
 * `install` writes (P-13, T-P13-1). Nothing reaches `.env`, nothing reaches
 * `app/deployment/<network>.json`, and the output shows two account ids and
 * nothing else.
 *
 * THE HOMES LIVE OUTSIDE THE REPOSITORY. A filled home carries a private key
 * and the repository ships a template and never a filled one (CLAUDE.md §11).
 * The default is under the user's own home directory, so the question does not
 * arise; the gitignore's home-directory and keystore patterns are a second line
 * for anyone who points this somewhere else.
 *
 * Usage:  npm run demo:operators -- [--dir <parent>] [--dry-run]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { AccountCreateTransaction, Hbar } from '@hashgraph/sdk';
import { bornPayerWallet } from '../../sdk/keystore.js';
import { clientFor, submit } from './hedera.js';
import { loadEnv, repoRoot } from './env.js';
import { fromEnv } from './identity.js';
import { Mirror } from './mirror.js';
import { named } from './step.js';

/** RECORD (Sonic, 2026-09-09): 35 ℏ each. */
const INITIAL_HBAR = 35;

/**
 * HIP-542's sentinel for "associate with anything". Named rather than written
 * as a bare -1, because -1 in a balance field would be nonsense and the reader
 * of this line should not have to work out which it is.
 */
const UNLIMITED_AUTO_ASSOCIATIONS = -1;

export interface DemoOperator {
  /** `a` or `b` — the directory name and nothing more. */
  readonly slug: string;
  readonly displayName: string;
  readonly alias: string;
  readonly bio: string;
}

export const DEMO_OPERATORS: readonly DemoOperator[] = [
  {
    slug: 'a',
    displayName: 'Correspondent A',
    alias: 'correspondent-a',
    bio: 'A WISHMail Correspondent. Certified mail for agents on Hedera.',
  },
  {
    slug: 'b',
    displayName: 'Correspondent B',
    alias: 'correspondent-b',
    bio: 'A WISHMail Correspondent. Certified mail for agents on Hedera.',
  },
];

/** Where a home goes by default: outside the repository, under the user's own home. */
export function defaultHomesParent(): string {
  return path.join(os.homedir(), '.wishmail', 'demo');
}

/** The shipped template, with `_readme` kept — an operator reads it in their own file. */
function template(postmasterUrl: string, network: string, who: DemoOperator): Record<string, unknown> {
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

export interface Funded {
  readonly slug: string;
  readonly accountId: string;
  readonly configPath: string;
  readonly transactionId: string;
  readonly balanceTinybar: number;
  readonly maxAutomaticTokenAssociations: number;
}

export async function fundOne(
  env: ReturnType<typeof loadEnv>,
  mirror: Mirror,
  who: DemoOperator,
  parent: string,
): Promise<Funded> {
  const dir = path.join(parent, who.slug);
  const configPath = path.join(dir, 'config.json');
  if (fs.existsSync(configPath)) {
    throw new Error(
      `${configPath} already exists. A home is an agent (D-165) and this run does not overwrite one: ` +
        'move it aside, or point --dir somewhere else.',
    );
  }

  const wallet = bornPayerWallet();
  const payer = fromEnv('postmaster payer', 'POSTMASTER_PAYER_DER_KEY');
  const client = clientFor(env, env.postmasterPayerId, payer);

  const tx = new AccountCreateTransaction()
    .setKeyWithoutAlias(wallet.signer.publicKey)
    .setInitialBalance(new Hbar(INITIAL_HBAR))
    .setMaxAutomaticTokenAssociations(UNLIMITED_AUTO_ASSOCIATIONS)
    .setAccountMemo('')
    .setMaxTransactionFee(new Hbar(5));

  // The new account's own key must sign a create that names it, and the
  // Postmaster's payer signs as payer. Two signatures, two parties — the same
  // shape as everything else here, with the operator's wallet being born rather
  // than borrowed.
  const r = await submit(client, env.postmasterPayerId, tx, [wallet.signer]);
  client.close();
  if (!r.ok) throw new Error(`the account for operator ${who.slug} was not created: ${r.status} (tx ${r.transactionId})`);
  const accountId = r.entityId;
  if (accountId === undefined) throw new Error(`the create for operator ${who.slug} returned no account id`);

  // Read back from the MIRROR and never from the receipt, as every other step
  // here does: what matters is what consensus recorded, and the two fields this
  // run exists to set are exactly the two a receipt cannot show.
  const p = named<MAccount>(
    'the account exists, holds its initial balance, and auto-associates without limit',
    (a) =>
      a.account === accountId &&
      a.deleted !== true &&
      (a.balance?.balance ?? 0) >= INITIAL_HBAR * 100_000_000 &&
      a.max_automatic_token_associations === UNLIMITED_AUTO_ASSOCIATIONS,
  );
  const seen = await mirror.poll<MAccount>(`/accounts/${accountId}?limit=1`, p.test);
  if (seen === null || !p.test(seen)) {
    throw new Error(
      `${accountId} was created as ${r.transactionId} and does not read back as ${p.name}. ` +
        'The account exists and the key for it is NOT yet written to any file; recover it by hand or abandon it.',
    );
  }

  // Only now, when the account is known good, is the key written — and it is
  // written by the module that owns the field, not by this one.
  const written = wallet.install(dir, template(demoPostmasterUrl(env), env.network, who), accountId);
  fs.chmodSync(written, 0o600);

  return {
    slug: who.slug,
    accountId,
    configPath: written,
    transactionId: r.transactionId,
    balanceTinybar: seen.balance?.balance ?? 0,
    maxAutomaticTokenAssociations: seen.max_automatic_token_associations ?? 0,
  };
}

/** Where this machine's counter listens, so a filled config points at it. */
function demoPostmasterUrl(env: ReturnType<typeof loadEnv>): string {
  return `http://${env.mcpBind}:${env.mcpPort ?? 4600}/mcp`;
}

export async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const at = argv.indexOf('--dir');
  const parent = at >= 0 && argv[at + 1] !== undefined ? path.resolve(argv[at + 1] as string) : defaultHomesParent();

  const env = loadEnv();
  const mirror = new Mirror(env.mirrorNodeUrl);

  console.log('');
  console.log('  demo-operator funding — FUNDING, NOT A SALE');
  console.log(`  network        ${env.network} (${env.constants.ledgerTag})`);
  console.log(`  paid by        ${env.postmasterPayerId}  (the Postmaster's payer)`);
  console.log(`  homes under    ${parent}`);
  console.log(`  each account   ${INITIAL_HBAR} ℏ · maxAutomaticTokenAssociations ${UNLIMITED_AUTO_ASSOCIATIONS} (HIP-542)`);
  console.log(`  each key       born in this process, written only to that home's config, printed nowhere`);
  console.log('');
  for (const who of DEMO_OPERATORS) {
    console.log(`  ${who.slug}  ${who.displayName} → ${path.join(parent, who.slug, 'config.json')}`);
  }
  console.log('');

  const balance = await mirror.get<MAccount>(`/accounts/${env.postmasterPayerId}?limit=1`);
  const have = (balance?.balance?.balance ?? 0) / 100_000_000;
  const need = INITIAL_HBAR * DEMO_OPERATORS.length + 2;
  console.log(`  the payer holds ${have} ℏ and this run needs about ${need} ℏ`);
  if (have < need) throw new Error(`the Postmaster's payer holds ${have} ℏ and this run needs about ${need} ℏ`);
  console.log('');

  if (dryRun) {
    console.log('  --dry-run: nothing was signed and nothing submitted.');
    console.log('');
    return;
  }

  const funded: Funded[] = [];
  for (const who of DEMO_OPERATORS) {
    const f = await fundOne(env, mirror, who, parent);
    funded.push(f);
    console.log(`  ${f.slug}  account ${f.accountId}  ·  ${f.balanceTinybar / 100_000_000} ℏ  ·  auto-associations ${f.maxAutomaticTokenAssociations}  ·  tx ${f.transactionId}`);
  }

  console.log('');
  console.log('  the two account ids above are the whole of what this run discloses.');
  console.log('  each key is in that home\'s config.json, mode 0600, outside the repository, and nowhere else.');
  console.log('');
  console.log('  next:  npm run correspondent:provision -- <home> --dry-run');
  console.log('');
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((e: unknown) => {
    console.error('\nSTOPPED\n' + (e instanceof Error ? e.message : String(e)));
    process.exit(1);
  });
}
