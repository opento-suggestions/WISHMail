/**
 * The letter, driven from a shell — Gate Two checkpoint one.
 *
 * DRY RUN IS THE DEFAULT and `--live` must ARRIVE in this process's own argv
 * (`ops/mode.ts`, CLAUDE.md §12). On 2026-09-10 a provisioning run signed under
 * an invocation that carried `--dry-run` and lost it to a nested npm; this
 * driver can ring a doorbell, spend stamps and write to consensus, so it
 * defaults to the mode where none of that happens.
 *
 * WHAT A DRY RUN OF THIS PATH PROVES, AND WHAT IT CANNOT.
 *
 * It proves everything that is a function of bytes: the recipient resolves and
 * the resolution's trust class and endorsements are what they are; the proof's
 * hash and the manifest that carries it; the AAD, built by the same
 * `sealEnvelope` the tool calls, and therefore the envelope identifier, which is
 * its SHA-256; the weight in ounces and the postage in stamps; the settlement
 * memo, exactly; the chunk count and every chunk's wire size against
 * `CHUNK_WIRE_MAX`; and whether the sender and its payer hold what the run will
 * need. Those are the same functions `send` runs, not a second spelling of them.
 *
 * It cannot prove one thing, and it is the thing that matters: **anything inside
 * a submit→learn window.** There is no offline consensus node, so a dry run
 * never learns whether a doorbell answers, whether a fee assesses, whether a
 * threshold key list is what was asked for, or whether a chunk lands without
 * `chunk_info`. Every defect Gate One found lived in exactly that gap.
 *
 *   npm run letter:plan -- <sender home> --to <address>     composes, submits nothing
 *   npm run letter -- <sender home> --to <address>          LIVE
 */
import { pathToFileURL } from 'node:url';
import { sealEnvelope } from '../src/core/envelope.js';
import { CHUNK_WIRE_MAX, messageOperation } from '../src/core/chunk.js';
import { runMode } from '../src/ops/mode.js';
import { mirrorSource, resolveHcs14 } from '../src/resolve/hcs14.js';
import { lanesFromDoorbell } from '../src/tools/send.js';
import { send } from '../src/tools/send.js';
import { liveReader } from './live.js';
import { openHome } from './home.js';
import { inboxContext, lanesOf, ringStamp, senderContext } from './letter.js';
import { boot, type Session } from './session.js';
import { inbox } from '../src/tools/inbox.js';

const mode = runMode('letter');
const argv = [...mode.argv];

function flag(name: string): string | undefined {
  const at = argv.indexOf(`--${name}`);
  return at >= 0 ? argv[at + 1] : undefined;
}

function stop(reason: string): never {
  console.error(`\nSTOP — ${reason}`);
  process.exit(1);
}

/** Flags that take a value, so their value is not mistaken for the home. */
const VALUED = new Set(['--to', '--text', '--window']);

/** The first positional argument: the sender's home directory. */
const dir = argv.find((a, i) => !a.startsWith('--') && !VALUED.has(argv[i - 1] ?? ''));

async function main(): Promise<void> {
  if (dir === undefined) stop('name the sender\'s home directory: npm run letter:plan -- <dir> --to <address>');
  const to = flag('to');
  if (to === undefined) stop('name the recipient: --to <uaid | 0.0.N>');
  const text = flag('text') ?? 'Certified mail for agents, on Hedera.';

  const s: Session = await boot(openHome(dir));
  try {
    const ctx = senderContext(s);
    console.log(`  sender      ${s.account}  (home ${s.home.dir})`);
    console.log(`  payer       ${s.payerId}  — the operator pays; the agent signs (§3.5)`);
    console.log(`  doorbell    ${ctx.doorbell}   log ${ctx.log}   manifest ${ctx.manifestTopic}`);
    console.log(`  schemaRef   ${ctx.schemaRef}`);
    console.log('');

    // 1. RESOLVE — read-only, from a mirror node, and the proof it produces is
    //    what gets welded into the AAD.
    const r = await resolveHcs14(mirrorSource(s.mirror), s.ledgerTag, to, ctx.manifestTopic);
    if ('failure' in r) stop(`${r.failure}: ${r.detail}`);
    const c = r.coordinates;
    console.log(`  recipient   ${c.account}  doorbell ${c.doorbell}  manifest ${c.manifestTopic}`);
    console.log(`  resolution  ${r.manifest.meaning.trustClass} · ${r.manifest.meaning.endorsements.length} endorsement(s)`);
    console.log(`  proof hash  ${r.manifest.hash}`);
    console.log(`  epoch       ${c.keyEpoch}`);
    console.log('');

    // 2. THE LANE, from consensus and by §7.1's own rule — the earliest-created
    //    open lane between these two, found on the RECIPIENT's doorbell.
    const reader = liveReader(s.home.mirrorNodeUrl, s.ledgerTag);
    const lanes = await lanesFromDoorbell(reader, c.doorbell, s.account);
    console.log(
      lanes.length === 0
        ? '  lane        NONE — this is first contact; send rings the doorbell and waits (§6.4 step 1)'
        : `  lane        ${lanes[0]?.topicId} created ${lanes[0]?.createdAt} — reused, nothing is rung (§7.1)`,
    );

    // 3. WHAT THE RING WILL COST, AND WHO PAYS IT. §4.4: the HIP-991 fee is
    //    debited from the transaction PAYER, so the payer must hold a stamp.
    const held = await s.consensus.stampBalance();
    console.log(`  stamps      the agent holds ${held}`);
    if (lanes.length === 0) {
      console.log(`  ring        one stamp, debited from ${s.payerId} — §4.4's two-hop, the agent transfers it first`);
    }
    console.log('');

    // 4. COMPOSITION — the same sealEnvelope the tool calls, so what is printed
    //    is what would go on the wire.
    const lane = lanes[0]?.topicId ?? '0.0.0';
    const sealed = sealEnvelope({
      ledgerTag: s.ledgerTag,
      lane,
      profile: c.profile,
      resolutionProof: { hash: r.manifest.hash, uri: { ledgerTag: s.ledgerTag, topicId: ctx.manifestTopic, sequenceNumber: 0 } },
      recipientX25519Pub: c.x25519Pub,
      keyEpoch: c.keyEpoch,
      payload: Buffer.from(text, 'utf8'),
      returnReceipt: false,
      schemaRef: ctx.schemaRef,
      operatorId: `${ctx.doorbell}@${s.account}`,
    });
    console.log(`  payload     ${text.length} bytes of text`);
    console.log(`  ciphertext  ${sealed.ciphertextBytes} bytes`);
    console.log(`  weight      ${sealed.weight} oz · postage ${sealed.postage} stamp(s) · returnReceipt false`);
    console.log(`  envelope id ${sealed.id}`);
    console.log(`  memo        ${sealed.memo}   (§4.3 — this exact string, on the settlement)`);
    console.log('');

    if (!mode.live) {
      console.log('  DRY RUN: nothing was signed and nothing submitted.');
      console.log('  What this could NOT check: whether the doorbell answers, whether the fee assesses, whether the');
      console.log('  lane key list is the threshold that was asked for, and whether a chunk lands without chunk_info.');
      console.log('  There is no offline consensus node, and every defect Gate One found lived in that gap.');
      console.log('');
      return;
    }

    // LIVE — §6.4 in order, through the tool.
    const hop = await ringStamp(s);
    if (hop !== null) console.log(`  one stamp to the payer for the doorbell fee (§4.4): ${hop}`);
    const out = await send(ctx, {
      coordinates: c,
      manifest: r.manifest as unknown as Record<string, unknown>,
      payload: Buffer.from(text, 'utf8'),
      returnReceipt: false,
      windowSeconds: Number(flag('window') ?? 120),
    });
    console.log('');
    console.log(JSON.stringify(out, null, 2));
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

export { inbox, inboxContext, lanesOf, CHUNK_WIRE_MAX, messageOperation };
