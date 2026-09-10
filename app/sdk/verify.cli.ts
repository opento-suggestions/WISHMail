/**
 * `verify`, driven from a shell — the stranger's tool.
 *
 * NOTHING IS CONFIGURED, AND THAT IS THE WHOLE CLAIM. P-4: "No broker, key, or
 * credit is required for conformance. The VERIFIER suite runs with nothing
 * configured. A mirror node is a read interface, not a broker." So this takes a
 * mirror-node URL and a scope and nothing else: no home, no keystore, no
 * account, no stamp, no counter, and no mode gate, because a `Reader` cannot
 * write and there is nothing here to sign.
 *
 * It is deliberately NOT given a home directory. A verifier that needed one
 * would be a verifier somebody had to provision, and the second of WISHMail's
 * two claims is that reconstructing a correspondence takes none of that.
 *
 *   npm run verify -- --lane 0.0.N [--mirror <url>] [--narrative] [--json]
 */
import { pathToFileURL } from 'node:url';
import { verify, narrate } from '../src/tools/verify.js';
import { liveReader } from './live.js';

const argv = process.argv.slice(2);

function flag(name: string): string | undefined {
  const at = argv.indexOf(`--${name}`);
  return at >= 0 ? argv[at + 1] : undefined;
}

const LEDGER = 'hedera:testnet';
const DEFAULT_MIRROR = 'https://testnet.mirrornode.hedera.com/api/v1';

async function main(): Promise<void> {
  const lane = flag('lane');
  if (lane === undefined) {
    console.error('usage: npm run verify -- --lane 0.0.N [--mirror <url>] [--narrative]');
    process.exit(2);
  }
  const mirror = flag('mirror') ?? DEFAULT_MIRROR;

  console.log('');
  console.log('  verify — configured with NOTHING (P-4)');
  console.log(`  mirror   ${mirror}`);
  console.log(`  scope    lane ${lane}`);
  console.log('  holding  no key · no account · no stamp · no counter · no home');
  console.log('');

  const out = await verify(liveReader(mirror, LEDGER), { lane }, { narrative: true, mirror });
  const bundle = out.bundle;

  if (argv.includes('--json')) {
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  console.log(`  bundle digest   ${bundle.digest}`);
  console.log(`  correspondence  ${bundle.correspondence.length} envelope(s)`);
  for (const e of bundle.correspondence) {
    console.log('');
    console.log(`    envelope      ${e.envelope.aadHash}`);
    console.log(`    state         ${e.state}`);
    console.log(`    chunks        ${e.chunks.length} · settlement ${e.settlement === undefined ? '(none)' : e.settlement.txRef}`);
    console.log(`    APPRAISED     ${e.appraisal.appraised.standing}`);
    console.log(`    reasons       ${e.appraisal.appraised.reasons.join(', ') || '(none)'}`);
    console.log(`    DECLARED      trust class ${e.appraisal.declared.trustClass} · ` +
      `${e.appraisal.declared.endorsements.length} endorsement(s)`);
    console.log(`    resolution    ${e.appraisal.resolution.standing}` +
      `${e.appraisal.resolution.reasons.length === 0 ? '' : ` (${e.appraisal.resolution.reasons.join(', ')})`}`);
    console.log(`    receipt       ${e.appraisal.receipt.status}`);
  }
  console.log('');
  const n = out.narrative ?? narrate(bundle);
  console.log(`  narrative.bundleDigest  ${n.bundleDigest}`);
  console.log(`  matches the bundle      ${n.bundleDigest === bundle.digest}`);
  console.log('');
  console.log(n.text);
  console.log('');
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((e: unknown) => {
    console.error('\nSTOPPED\n' + (e instanceof Error ? e.message : String(e)));
    process.exitCode = 3;
  });
}
