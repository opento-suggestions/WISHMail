/**
 * Gate One's driver — one Correspondent, provisioned through the counter.
 *
 * D-159's order, as amended, and nothing may reorder it:
 *
 *   1  boot            the keys are born, once, in this process (D-165)
 *   2  buy_stamp       at the counter, holder = the agent's PUBLIC KEY,
 *                      provision = true. The alias transfer creates the account.
 *   3  generate_mailbox the six rows and the declaration, agent-signed
 *   4  register_agent   on the HOL anchor, the AGENT as payer
 *   5  resolve          self, under hcs14 AND hol, with no `blurred`
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

const dryRun = process.argv.includes('--dry-run');
const dir = process.argv.slice(2).find((a) => !a.startsWith('--'));

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

async function main(): Promise<void> {
  if (dir === undefined) {
    stop('name the home directory: npm run correspondent:provision -- <dir> [--dry-run]. A home IS the agent (D-165).');
  }
  const home = openHome(path.resolve(dir));
  let s = await boot(home);

  console.log('');
  console.log(`  provisioning a Correspondent — D-159's order, ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  await report(s);

  if (dryRun) {
    console.log('  --dry-run: nothing was signed and nothing submitted.');
    console.log('');
    return;
  }

  // --- 2. The purchase, at the counter. --------------------------------------
  if (s.account === '') {
    console.log('  2. buy_stamp — holder is this agent’s public key; the alias transfer creates the account');
    await buyStamps(s, { count: 12, provision: true, onLine: say });
    // The account is on consensus now and this session predates it.
    s = await boot(home);
    if (s.account === '') stop('the purchase settled and no account under this agent’s key is on the mirror');
  } else {
    console.log(`  2. buy_stamp — skipped: ${s.account} already exists, so this agent is returning (D-165)`);
  }

  // --- 3. The mailbox. -------------------------------------------------------
  console.log('  3. generate_mailbox — the six rows, the declaration, and the resolver run on its own output');
  const mailbox = await generateMailbox(s, s.record, { onLine: say });
  if (mailbox.outcome === 'existing') say('nothing was created; consensus already carries this agent’s declaration');

  // --- 4. The registration, paid by the agent. -------------------------------
  console.log('  4. register_agent — on the HOL anchor, with the agent as payer (T-P13-4)');
  const uaid = s.record.get('profileChunks')?.policy['uaid'] as string | undefined;
  const declRegistry = s.record.get('declRegistry')?.id;
  if (uaid === undefined || !declRegistry) stop('the record carries no uaid or declaration registry; generate_mailbox did not complete');
  const registration = await registerAgent(s, s.record, { uaid, declRegistry }, say);

  // --- 5. Both resolutions, and the fact the whole order exists for. ---------
  console.log('  5. resolve — self, under hcs14 and hol');
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
  console.log(`  provisioned. mailbox ${mailbox.outcome}, registration ${registration.outcome}, and no \`blurred\` on either resolution.`);
  console.log('');
  void accountForKey;
}

main().catch((e: unknown) => {
  console.error('\nSTOPPED\n' + (e instanceof Error ? e.message : String(e)));
  process.exitCode = 3;
});
