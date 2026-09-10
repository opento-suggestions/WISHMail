/**
 * `inbox`, driven from a shell — what the recipient sees.
 *
 * NO MODE GATE, AND THAT IS NOT AN OVERSIGHT. §6.5: "`inbox` writes nothing.
 * Reading a lane leaves no mark on it (blind delivery, D-29)." A tool that
 * cannot submit cannot sign, so there is nothing for `--live` to guard. The
 * mode rule of CLAUDE.md §12 exists for drivers that can spend, and this one
 * cannot.
 *
 * It reads the caller's lanes FROM CONSENSUS — §7.1's rule over the caller's
 * own doorbell, one implementation shared with `send` and `verify` — reassembles
 * each envelope by its chain, rebuilds the AAD from the header and the lane,
 * checks it against `id`, fetches the settlement and checks memo and amount, and
 * decrypts under the key of the envelope's epoch. An envelope that fails any
 * check comes back unopened with a reason, and none of those reasons is a
 * failure of the tool (P-12).
 *
 *   npm run inbox -- <home> [--lane 0.0.N] [--since <ts>]
 */
import { pathToFileURL } from 'node:url';
import { inbox } from '../src/tools/inbox.js';
import { openHome } from './home.js';
import { inboxContext, lanesOf } from './letter.js';
import { boot } from './session.js';

const argv = process.argv.slice(2);

function flag(name: string): string | undefined {
  const at = argv.indexOf(`--${name}`);
  return at >= 0 ? argv[at + 1] : undefined;
}

const VALUED = new Set(['--lane', '--since']);
const dir = argv.find((a, i) => !a.startsWith('--') && !VALUED.has(argv[i - 1] ?? ''));

async function main(): Promise<void> {
  if (dir === undefined) {
    console.error('name the home directory: npm run inbox -- <dir> [--lane 0.0.N]');
    process.exit(2);
  }
  const s = await boot(openHome(dir));
  try {
    const one = flag('lane');
    const lanes = one === undefined ? await lanesOf(s) : [one];
    console.log('');
    console.log(`  inbox — ${s.account}, home ${s.home.dir}`);
    console.log(`  lanes  ${lanes.length === 0 ? '(none)' : lanes.join(', ')}   — from consensus, by §7.1's rule`);
    console.log('');

    const deliveries = await inbox(inboxContext(s), {
      lanes,
      ...(flag('since') === undefined ? {} : { since: flag('since') as string }),
    });

    for (const d of deliveries) {
      console.log(`  envelope   ${d.envelope.aadHash}   lane ${d.lane}`);
      console.log(`  opened     ${d.opened}${d.reason === undefined ? '' : `   reason ${d.reason}`}`);
      if (d.payload !== undefined) {
        console.log(`  payload    ${JSON.stringify(d.payload.toString('utf8'))}`);
        console.log(`  bytes      ${d.payload.length}`);
      }
      console.log('');
    }
    if (deliveries.length === 0) console.log('  nothing on these lanes.');
    console.log(`  ${deliveries.length} delivery(ies). inbox wrote nothing (§6.5).`);
    console.log('');
  } finally {
    s.close();
  }
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((e: unknown) => {
    console.error('\nSTOPPED\n' + (e instanceof Error ? e.message : String(e)));
    process.exitCode = 3;
  });
}
