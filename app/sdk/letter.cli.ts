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
 *   npm run letter:plan -- <home> --to <address> [--text <s> | --file <path>] [--receipt]
 *   npm run letter -- <home> --to <address> [...]                     LIVE
 *   npm run letter -- <home> --to <address> --resume <envelope id>    LIVE, step 7 only
 *
 * `--resume` IS NOT A RERUN, and the difference is P-7. §7.2 requires a fresh
 * nonce for every envelope, so running this driver again composes a DIFFERENT
 * envelope and affixes a SECOND settlement — which is a second letter, not a
 * retry. A run that died after SETTLED and before §6.4's step 7 is resumed by
 * naming the envelope it already paid for; the identifier is in the home's own
 * store, and `--resume` with no value lists what is there.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { affix, sealEnvelope, type SealedEnvelope } from '../src/core/envelope.js';
import { sha256hex } from '../src/core/canonical.js';
import { MAX_WEIGHT } from '../src/core/seal.js';
import { CHUNK_WIRE_MAX, messageOperation } from '../src/core/chunk.js';
import { runMode } from '../src/ops/mode.js';
import { mirrorSource, resolveHcs14 } from '../src/resolve/hcs14.js';
import { lanesFromDoorbell } from '../src/tools/send.js';
import { SCHEDULE_MAX_LIFETIME, resumeReceipt, send } from '../src/tools/send.js';
import { liveReader } from './live.js';
import { openHome } from './home.js';
import { inboxContext, lanesOf, ringStamp, senderContext, sentEnvelopeRows } from './letter.js';
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
const VALUED = new Set(['--to', '--text', '--window', '--file', '--resume', '--receipt-window']);

/**
 * §10.4's acknowledgment window, in DAYS on the command line and seconds in the
 * tool. A window is a human decision measured in days, and a driver that asked
 * for 2592000 would be asking for a number nobody can check by reading it.
 */
const DAY_SECONDS = 86_400;

/**
 * How many chunks this envelope becomes, measured by the real chunker.
 *
 * `affix` needs a settlement reference and the dry run has none, so a
 * well-formed placeholder is used: nothing about the SLICE BOUNDARIES depends on
 * which transaction id it is, only on how long one is, and every Hedera
 * transaction id is `0.0.n@seconds.nanos` in the same range of lengths. The
 * count is therefore exact for this letter and would move by at most a chunk if
 * an id were a digit longer.
 */
function assembledChunkCount(sealed: SealedEnvelope, _schemaRef: string, _operatorId: string): number {
  return affix(sealed, '0.0.9999999@1789000000.000000000').chunks.length;
}

/** The first positional argument: the sender's home directory. */
const dir = argv.find((a, i) => !a.startsWith('--') && !VALUED.has(argv[i - 1] ?? ''));

async function main(): Promise<void> {
  if (dir === undefined) stop('name the sender\'s home directory: npm run letter:plan -- <dir> --to <address>');
  const to = flag('to');
  if (to === undefined) stop('name the recipient: --to <uaid | 0.0.N>');

  // THE BODY: text on the command line, or a file read as BYTES.
  //
  // Read as bytes and never re-encoded: what a recipient must get back is what
  // is on disk, byte for byte, and a driver that normalised line endings or
  // re-wrapped a paragraph would have changed the letter before it was sealed.
  // §4.2 weighs the ciphertext and knows nothing about what it says.
  const file = flag('file');
  const payload =
    file === undefined
      ? Buffer.from(flag('text') ?? 'Certified mail for agents, on Hedera.', 'utf8')
      : fs.readFileSync(path.resolve(file));
  const returnReceipt = argv.includes('--receipt');
  const receiptWindowDays = Number(flag('receipt-window') ?? 30);
  const receiptWindowSeconds = Math.round(receiptWindowDays * DAY_SECONDS);
  if (receiptWindowSeconds > SCHEDULE_MAX_LIFETIME) {
    stop(
      `an acknowledgment window of ${receiptWindowDays} days is ${receiptWindowSeconds}s, over ` +
        `SCHEDULE_MAX_LIFETIME ${SCHEDULE_MAX_LIFETIME}s (§1.6, §10.4) — the network's maximum is ${SCHEDULE_MAX_LIFETIME / DAY_SECONDS} days`,
    );
  }
  const resume = flag('resume');

  const s: Session = await boot(openHome(dir));
  try {
    const ctx = senderContext(s);
    console.log(`  sender      ${s.account}  (home ${s.home.dir})`);
    console.log(`  payer       ${s.payerId}  — the operator pays; the agent signs (§3.5)`);
    console.log(`  doorbell    ${ctx.doorbell}   log ${ctx.log}   manifest ${ctx.manifestTopic}`);
    console.log(`  schemaRef   ${ctx.schemaRef}`);
    console.log('');

    // 0. RESUME — step 7 alone, for an envelope this sender already paid for.
    //    Listed rather than guessed: an envelope identifier is 64 hex
    //    characters and nobody types one from memory.
    if (resume !== undefined || argv.includes('--resume')) {
      const rows = sentEnvelopeRows(s);
      if (resume === undefined || resume.startsWith('--')) {
        console.log('  envelopes this sender has affixed (D-165, P-7):');
        for (const row of rows) {
          console.log(`    ${row.envelopeId}  ${row.stage}  lane ${row.lane}  rr ${row.returnReceipt}${row.scheduleId === undefined ? '' : `  schedule ${row.scheduleId}`}`);
        }
        if (rows.length === 0) console.log('    (none)');
        console.log('');
        console.log('  name one: --resume <envelope id>. A rerun without it is a SECOND letter (§7.2).');
        return;
      }
      const r0 = await resolveHcs14(mirrorSource(s.mirror), s.ledgerTag, to, ctx.manifestTopic);
      if ('failure' in r0) stop(`${r0.failure}: ${r0.detail}`);
      if (!mode.live) {
        console.log(`  DRY RUN: --resume ${resume} would create §10.4's schedule and post the lane's transaction op.`);
        console.log('  Nothing was signed.');
        return;
      }
      const out = await resumeReceipt(ctx, r0.coordinates, resume);
      console.log('');
      console.log(JSON.stringify(out, null, 2));
      return;
    }

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
      payload,
      returnReceipt,
      schemaRef: ctx.schemaRef,
      operatorId: `${ctx.doorbell}@${s.account}`,
    });

    // THE QUOTE. Everything a stamp knows about a letter: its ciphertext, its
    // weight in ounces, and its postage in stamps — plus one for the receipt
    // (§4.2, §7.5). The chunk count is measured against the real wrapper, so a
    // chunk that would not fit is refused here and not by the network.
    const chunks = assembledChunkCount(sealed, ctx.schemaRef, `${ctx.doorbell}@${s.account}`);
    console.log(`  body        ${file === undefined ? 'inline text' : path.resolve(file)}`);
    console.log(`  payload     ${payload.length} bytes · sha256 ${sha256hex(payload)}`);
    console.log(`  ciphertext  ${sealed.ciphertextBytes} bytes`);
    console.log(`  chunks      ${chunks} · CHUNK_WIRE_MAX ${CHUNK_WIRE_MAX} bytes per operation (§7.4)`);
    console.log(`  weight      ${sealed.weight} oz of ${MAX_WEIGHT} (§7.5)`);
    console.log(
      `  postage     ${sealed.postage} stamp(s) = ${sealed.weight} weight${returnReceipt ? ' + 1 receipt fee' : ''} · returnReceipt ${returnReceipt}`,
    );
    console.log(`  envelope id ${sealed.id}`);
    console.log(`  memo        ${sealed.memo}   (§4.3 — this exact string, on the settlement)`);
    if (returnReceipt) {
      console.log(`  receipt     schedule paid by ${ctx.receiptPayer} — never the recipient (§10.4, T-P16-2)`);
      console.log(
        `  window      ${receiptWindowDays} days = ${receiptWindowSeconds}s, under SCHEDULE_MAX_LIFETIME ${SCHEDULE_MAX_LIFETIME}s (§1.6)`,
      );
    }
    if (sealed.postage > held) {
      stop(
        `the postage is ${sealed.postage} stamp(s) and this agent holds ${held}. Buy what is needed at the counter ` +
          'before sending; `send` refuses SEND_INSUFFICIENT_STAMPS rather than posting a postage-due envelope (§4.2, T-P7-3).',
      );
    }
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
    // The hop happens only where the doorbell will actually be rung: §4.4's
    // first hop is for a fee, and a reused lane charges none (§7.1).
    const hop = await ringStamp(s, lanes.length === 0);
    if (hop !== null) console.log(`  one stamp to the payer for the doorbell fee (§4.4): ${hop}`);
    const out = await send(ctx, {
      coordinates: c,
      manifest: r.manifest as unknown as Record<string, unknown>,
      payload,
      returnReceipt,
      windowSeconds: Number(flag('window') ?? 120),
      receiptWindowSeconds,
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
