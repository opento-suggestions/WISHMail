/**
 * Gate One's driver — one Correspondent, provisioned through the counter.
 *
 * D-159's order, as amended, and nothing may reorder it:
 *
 *   1  boot            the keys are born, once, in this process (D-165)
 *   2  buy_stamp       at the counter, holder = the agent's PUBLIC KEY,
 *                      provision = true. Three legs and one transaction: the
 *                      alias transfer creates the account. Then the mailbox —
 *                      the six rows and the declaration, every body signed by
 *                      THIS agent and paid for by the POSTMASTER over the
 *                      counter’s carry leg (§4.6, §6.1, D-168) — and last the
 *                      receipt, which names what the counter created.
 *   3  register_agent  on the HOL anchor, the AGENT as payer
 *   4  resolve         self, under hcs14 AND hol, with no `blurred`
 *
 * §G-19 is ruled (a): §4.6’s provisioned path taken as written, so §5.4’s "the
 * entities the Postmaster created for the holder" is literally true of the
 * receipt and it validates against the schema Step 4 froze. `generate_mailbox`
 * remains for an agent that brings its own account and pays for its own
 * mailbox; the demo does not take that path and this driver does not either,
 * except where it finds an account with no mailbox and has to finish the job.
 *
 * EVERY STEP IS IDEMPOTENT AGAINST CONSENSUS. A second run of this script
 * creates nothing, because each verb asks the ledger first and not this
 * machine's files (D-165). That is the acceptance test this project holds every
 * provisioning run to, and it is the last line printed.
 *
 *   --dry-run   read consensus, report what exists and what step 5 would create,
 *               and submit nothing.
 *
 * Usage:  npm run correspondent:provision -- <home directory> [--dry-run]
 */
import path from 'node:path';
import { buyStamps } from './counter.js';
import { openHome } from './home.js';
import { mirrorSource } from '../src/resolve/hcs14.js';
import { resolveHol } from '../src/resolve/hol.js';
import { generateMailbox, resolveSelf } from './mailbox.js';
import { registerAgent } from './registration.js';
import { boot, accountForKey, type Session } from './session.js';
import { registrationsFor } from '../src/resolve/hol.js';
import { HCS10_TTL, type TemplateSubject, type TopicShape } from '../src/ops/template.js';
import * as template from '../src/ops/template.js';
import { registryMemo } from '../src/ops/declaration.js';

const dryRun = process.argv.includes('--dry-run');
const dir = process.argv.slice(2).find((a) => !a.startsWith('--'));

/** Every session this run booted, so the entry point can release them all. */
const open = new Set<Session>();

function stop(reason: string): never {
  console.error(`\nSTOP — ${reason}`);
  process.exit(1);
}

function say(l: string): void {
  console.log(`  ${l}`);
}

async function report(s: Session): Promise<void> {
  const source = mirrorSource(s.mirror);
  console.log('');
  console.log(`  home        ${s.home.dir}`);
  console.log(`  network     ${s.network} (${s.ledgerTag})`);
  console.log(`  keys        ${s.keysOrigin}`);
  console.log(`  agent key   ${s.agentPublicHex.slice(0, 16)}…`);
  console.log(`  x25519      ${s.seal.x25519Pub.slice(0, 16)}… epoch ${s.seal.keyEpoch}`);
  console.log(`  payer       ${s.payerId}   (the operator pays; the agent signs — §3.5)`);
  console.log(`  counter     ${s.home.config.postmasterUrl}`);
  console.log(`  stamp token ${s.stampToken}  treasury ${s.treasury}`);
  console.log(`  hol anchor  ${s.holAnchors.join(', ') || '(none recorded)'}`);
  console.log(`  account     ${s.account === '' ? 'NOT BOUGHT — the purchase creates it (§4.6, HIP-542)' : s.account}`);
  if (s.account !== '') {
    const coords = await resolveSelf(source, s.ledgerTag, s.account);
    console.log(`  hcs14       ${coords === null ? 'does not resolve — generate_mailbox has not run' : `resolves · doorbell ${coords.doorbell} · ${coords.endorsements.length} endorsement(s)`}`);
    const anchor = s.holAnchors[0];
    if (anchor !== undefined) {
      const rs = await registrationsFor(source, anchor, s.account);
      console.log(`  hol         ${rs === null ? 'the anchor could not be read' : `${rs.length} registration(s) name this account`}`);
    }
  }
  console.log('');
}

/**
 * The plan, and WHO PAYS FOR EACH ROW.
 *
 * Printed before anything signs, from `ops/template.ts` itself rather than from a
 * list kept beside it, so what the dry run shows is what the run submits. The
 * payer column is the point of it under D-168: a provisioning purchase has the
 * POSTMASTER paying for nine bodies this agent signs, and an operator about to
 * authorise that should be able to see it on one screen without reading code.
 */
function plan(s: Session): void {
  const buying = s.account === '';
  const subject: TemplateSubject = {
    account: s.account || '(the account this purchase creates)',
    publicKey: s.agentPublicHex,
    treasury: s.treasury,
    stampToken: s.stampToken,
    autoRenewAccount: s.operatorId,
  };
  const carried = buying ? 'POSTMASTER (carried)' : 'operator';
  const rows: readonly (readonly [string, string, string, string])[] = [
    [
      'the purchase — 3 legs, 1 transaction',
      'buyer',
      'POSTMASTER',
      'ℏ price → Postmaster · $POSTAGE treasury → the agent’s public-key alias, which CREATES the account · registration fee ℏ → that account',
    ],
    ['1 doorbell (HCS-10 inbound)', 'agent + operator', carried, detail(template.doorbell(subject))],
    ['2 log (HCS-10 outbound)', 'agent + operator', carried, detail(template.log(subject))],
    ['3 manifest', 'agent + operator', carried, detail(template.manifest(subject))],
    ['4 declaration registry (HCS-2)', 'agent + operator', carried, detail(template.declRegistry(subject, registryMemo(HCS10_TTL)))],
    ['5 HCS-11 profile file (HCS-1)', 'agent + operator', carried, detail(template.profileFile(subject, '<sha256 of the profile>:brotli:base64'))],
    ['6 the profile, as HCS-1 chunks', 'agent', carried, 'one HCS message per chunk, no chunkInfo, ≤1024 bytes on the wire (§7.4)'],
    ['7 HCS-2 register entry', 'agent', carried, 'names the profile file · transaction memo hcs-2:op:register:0'],
    ['8 §9.2’s account memo', 'agent', carried, 'hcs-11:hcs://2/<the registry above> — the first link in the chain'],
    ['9 the receipt', '(nothing)', '(nothing)', 'the counter reads back every row it paid for and resolves the holder under §9.2 before it issues one'],
    ['10 register_agent', 'agent', 'THE AGENT ITSELF', 'the mirror must record THIS account as the payer, or §9.5 assigns `blurred` (T-P13-4)'],
    ['11 resolve self', '(nothing)', '(nothing)', 'under hcs14 and hol, and no `blurred` on either'],
  ];

  console.log(buying ? '  the plan — a PROVISIONING purchase (§4.6, D-168)' : '  the plan — a returning agent, self-provisioned at its own expense (L-5)');
  console.log('');
  for (const [what, signs, pays, note] of rows) {
    console.log(`  ${what.padEnd(38)} signs: ${signs.padEnd(17)} pays: ${pays}`);
    console.log(`  ${' '.repeat(38)} ${note}`);
  }
  console.log('');
  console.log(
    '  Beside them, paid by this operator on its own client and never carried: the $POSTAGE association, ' +
      'where this operator does not already hold the token. §4.4’s doorbell fee is debited from the PAYER of a ' +
      'submission (HIP-991), and when this agent rings a door that payer is its own operator.',
  );
  console.log('');
}

/** One row’s declared shape, in the words the record will carry. */
function detail(w: TopicShape): string {
  return (
    `${w.memo} · submit ${w.submitKey ? w.submitKey.slice(0, 8) + '…' : 'NONE'}` +
    ` · admin ${w.adminKey ? w.adminKey.slice(0, 8) + '…' : 'NONE'}` +
    (w.fee ? ` · fee ${w.fee.amount} ${w.fee.token} → ${w.fee.collector}` : ' · no fee') +
    (w.feeExemptKeys.length ? ` · exempt ${w.feeExemptKeys.length}` : '') +
    ` · auto-renew ${w.autoRenewAccount}`
  );
}

async function main(): Promise<void> {
  if (dir === undefined) {
    stop('name the home directory: npm run correspondent:provision -- <dir> [--dry-run]. A home IS the agent (D-165).');
  }
  const home = openHome(path.resolve(dir));
  let s = await boot(home);
  open.add(s);

  console.log('');
  console.log(`  provisioning a Correspondent — D-159's order, ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  await report(s);

  if (dryRun) {
    plan(s);
    console.log('  --dry-run: nothing was signed and nothing submitted.');
    console.log('');
    return;
  }

  // --- 2. The purchase, and the mailbox it pays for. -------------------------
  let outcome = 'existing';
  if (s.account === '') {
    console.log('  2. buy_stamp — the purchase, then the mailbox it pays for, then the receipt (D-168)');
    const bought = await buyStamps(s, { count: 12, provision: true, onLine: say });
    // The account is on consensus now, and so is the mailbox; the session that
    // asked for them predates both, so the one the purchase returns is taken.
    open.add(bought.session);
    s = bought.session;
    if (s.account === '') stop('the purchase settled and no account under this agent’s key is on the mirror');
    outcome = bought.mailbox?.outcome ?? outcome;
    say(
      `the receipt names account ${String(bought.receipt.provisioning?.['account'] ?? bought.receipt.holder)}, ` +
        `doorbell ${String(bought.receipt.provisioning?.['doorbell'] ?? '(none)')}, ` +
        `manifest ${String(bought.receipt.provisioning?.['manifestTopic'] ?? '(none)')}`,
    );
  } else {
    console.log(`  2. buy_stamp — skipped: ${s.account} already exists, so this agent is returning (D-165)`);
    // An account with no mailbox is a purchase that stopped between rows, or an
    // agent that brought its own account. Either way the mailbox is finished at
    // this operator’s own expense: carry lives inside the purchase and this is
    // no longer inside one (L-5).
    const mailbox = await generateMailbox(s, s.record, { onLine: say });
    outcome = mailbox.outcome;
    if (mailbox.outcome === 'existing') say('nothing was created; consensus already carries this agent’s declaration');
  }

  // --- 3. The registration, paid by the agent. -------------------------------
  console.log('  3. register_agent — on the HOL anchor, with the agent as payer (T-P13-4)');
  const uaid = s.record.get('profileChunks')?.policy['uaid'] as string | undefined;
  const declRegistry = s.record.get('declRegistry')?.id;
  if (uaid === undefined || !declRegistry) stop('the record carries no uaid or declaration registry; generate_mailbox did not complete');
  const registration = await registerAgent(s, s.record, { uaid, declRegistry }, say);

  // --- 4. Both resolutions, and the fact the whole order exists for. ---------
  console.log('  4. resolve — self, under hcs14 and hol');
  const source = mirrorSource(s.mirror);
  const hcs14 = await resolveSelf(source, s.ledgerTag, s.account);
  if (hcs14 === null) stop('this agent does not resolve under hcs14 after provisioning it');
  const hol = await resolveHol(source, s.ledgerTag, uaid, hcs14.manifestTopic, s.holAnchors);
  if ('failure' in hol) stop(`this agent does not resolve under hol: ${hol.failure} — ${hol.detail}`);

  console.log('');
  console.log(`  hcs14   ${hcs14.account} · doorbell ${hcs14.doorbell} · manifest ${hcs14.manifestTopic} · ${hcs14.trustClass} · endorsements [${hcs14.endorsements.join(', ')}]`);
  console.log(`  hol     ${hol.coordinates.account} · ${hol.coordinates.trustClass} · endorsements [${hol.coordinates.endorsements.join(', ')}]`);

  // THE fact D-159's order exists for. §9.5 assigns `blurred` where the
  // registration's payer is not the address's account, and every agent on the
  // testnet anchor today carries it. Ours must not.
  if (hol.coordinates.endorsements.includes('blurred')) {
    stop(
      'this agent resolves under hol WITH `blurred`, which means the registration was not paid by its own account. ' +
        'That is the one thing the funded registration fee exists to prevent (§4.6, T-P13-4).',
    );
  }
  console.log('');
  console.log(`  provisioned. mailbox ${outcome}, registration ${registration.outcome}, and no \`blurred\` on either resolution.`);
  console.log('');
  void accountForKey;
}

main()
  .catch((e: unknown) => {
    console.error('\nSTOPPED\n' + (e instanceof Error ? e.message : String(e)));
    process.exitCode = 3;
  })
  // Every session this run booted, released — whatever happened. A Hedera
  // client holds the event loop open, so a driver that printed its report and
  // then hung would be a driver nobody could put in a script, and a provisioning
  // purchase boots a second session when the account it bought appears.
  .finally(() => {
    for (const s of open) s.close();
  });
