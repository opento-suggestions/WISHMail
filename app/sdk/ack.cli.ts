/**
 * `ack`, driven from a shell — the recipient signing for a letter.
 *
 * DRY RUN IS THE DEFAULT and `--live` must ARRIVE in this process's own argv
 * (`ops/mode.ts`, CLAUDE.md §12). This driver submits a ScheduleSign, which
 * spends the recipient's operator's ℏ and puts a manifest on consensus that
 * cannot be withdrawn — so it defaults to the mode where none of that happens.
 *
 * WHAT A DRY RUN OF `ack` PROVES, and it is more than a dry run of `send` can.
 * Every check §10.4 puts before the signature is a check on bytes already on
 * consensus: the schedule's record, the body inside it, the topic that body
 * writes to, the payer it names, and whether the manifest it carries is the one
 * this envelope, this postmark and this epoch compose. All of that runs here
 * with `--live` absent, and only the ScheduleSign is withheld. So a dry run that
 * prints `the scheduled receipt is the one these three inputs compose` has
 * checked T-P1-9 in full; what it cannot know is whether the network executes.
 *
 *   npm run ack -- <home> [--lane 0.0.N] [--envelope <id>]      checks, signs nothing
 *   npm run ack:live -- <home> [...]                            LIVE
 */
import { pathToFileURL } from 'node:url';
import { canonicalBytes } from '../src/core/canonical.js';
import { receiptManifest } from '../src/core/receipt.js';
import { decodeScheduledSubmission } from '../src/core/schedulebody.js';
import { isToolFailure } from '../src/core/failure.js';
import { runMode } from '../src/ops/mode.js';
import { ack } from '../src/tools/ack.js';
import { inbox, type Delivery } from '../src/tools/inbox.js';
import { openHome } from './home.js';
import { ackContext, inboxContext, lanesOf } from './letter.js';
import { boot } from './session.js';

const mode = runMode('ack');
const argv = [...mode.argv];

function flag(name: string): string | undefined {
  const at = argv.indexOf(`--${name}`);
  return at >= 0 ? argv[at + 1] : undefined;
}

function stop(reason: string): never {
  console.error(`\nSTOP — ${reason}`);
  process.exit(1);
}

const VALUED = new Set(['--lane', '--envelope']);
const dir = argv.find((a, i) => !a.startsWith('--') && !VALUED.has(argv[i - 1] ?? ''));

async function main(): Promise<void> {
  if (dir === undefined) stop('name the home directory: npm run ack -- <dir> [--envelope <id>]');
  const s = await boot(openHome(dir));
  try {
    const ctx = ackContext(s);
    const one = flag('lane');
    const lanes = one === undefined ? await lanesOf(s) : [one];

    console.log(`  ack — ${s.account}, home ${s.home.dir}`);
    console.log(`  payer    ${s.payerId}  — pays the ScheduleSign's own fee, and nothing else (§10.4)`);
    console.log(`  manifest ${ctx.manifestTopic}  — where the receipt lands, and only this key writes there`);
    console.log(`  lanes    ${lanes.length === 0 ? '(none)' : lanes.join(', ')}`);
    console.log('');

    const deliveries = await inbox(inboxContext(s), { lanes });
    const wanted = flag('envelope');
    const pending = deliveries.filter(
      (d) => d.opened && d.returnReceipt !== undefined && (wanted === undefined || d.envelope.aadHash === wanted),
    );
    if (pending.length === 0) {
      console.log('  nothing to acknowledge: no opened delivery on these lanes carries a pending schedule (§6.5).');
      console.log('');
      return;
    }

    for (const d of pending) await one_(s, ctx, d);
  } finally {
    s.close();
  }
}

async function one_(
  s: Awaited<ReturnType<typeof boot>>,
  ctx: ReturnType<typeof ackContext>,
  d: Delivery,
): Promise<void> {
  const request = d.returnReceipt;
  if (request === undefined) return;
  console.log(`  envelope   ${d.envelope.aadHash}`);
  console.log(`  lane       ${d.lane}   chunk 0 at sequence ${d.chunkPostmarks[0]?.sequenceNumber ?? '?'}`);
  console.log(`  epoch      ${d.openedUnderEpoch}   — the epoch it OPENED under, which is what a receipt names`);
  console.log(`  schedule   ${request.scheduleId}   requested on the lane at sequence ${request.sequenceNumber}`);
  console.log(`  hdr.rr     ${request.requestedByHeader}   — the sender's postage paid the receipt fee (§7.7)`);

  // THE CHECK, RUN WHETHER OR NOT THIS IS LIVE. Everything §10.4 puts before the
  // signature reads consensus and signs nothing, so a dry run does all of it.
  const record = await s.consensus.schedule(request.scheduleId);
  if (record === null) {
    console.log('  STOP — consensus holds no such schedule; an expired schedule is deleted and the envelope is unclaimed (§10.4).');
    console.log('');
    return;
  }
  const inner = decodeScheduledSubmission(Buffer.from(record.transactionBody, 'base64'));
  const chunkZeroSeq = d.chunkPostmarks[0]?.sequenceNumber ?? 0;
  const want = receiptManifest({
    ledgerTag: ctx.ledgerTag,
    envelopeId: d.envelope.aadHash,
    postmarkRef: { topicId: d.lane, sequenceNumber: chunkZeroSeq },
    keyEpoch: d.openedUnderEpoch ?? -1,
    recipientAccount: ctx.account,
    manifestTopic: ctx.manifestTopic,
  });
  const bytes = canonicalBytes(want as unknown as Record<string, unknown>);
  console.log(`  inner      ConsensusSubmitMessage to ${inner.topicId}, ${inner.message.length} bytes, chunk_info ${inner.chunked ? 'PRESENT' : 'none'}`);
  console.log(`  payer      ${record.payer}   — ${record.payer === ctx.account ? 'THE RECIPIENT, which §10.4 forbids (T-P16-2)' : 'not the recipient (T-P16-2)'}`);
  console.log(`  expires    ${record.expirationTime ?? '(none)'}   waitForExpiry ${record.waitForExpiry}`);
  console.log(`  composes   ${want.hash}`);
  console.log(`  carries    ${inner.message.equals(bytes) ? 'EXACTLY those bytes (T-P1-9)' : 'DIFFERENT bytes — this would be refused'}`);
  console.log(`  executed   ${record.executedTimestamp ?? 'not yet'}`);
  console.log('');

  if (!mode.live) {
    console.log('  DRY RUN: every check §10.4 puts before the signature has been run above and nothing was signed.');
    console.log('  What it could NOT check: whether the network executes the submission when the signature lands.');
    console.log('');
    return;
  }

  try {
    const out = await ack(ctx, d);
    console.log(`  SIGNED     schedule ${out.schedule.scheduleId}${out.alreadyExecuted ? ' (it had already executed; nothing was signed)' : ''}`);
    console.log(`  executed   ${out.schedule.executedTimestamp}`);
    console.log(`  receipt    ${out.receipt.proof.hash}`);
    console.log(
      `  published  ${out.receipt.proof.uri === null ? '(not yet visible on the manifest topic)' : `${out.receipt.proof.uri.topicId} #${out.receipt.proof.uri.sequenceNumber}`}`,
    );
    console.log('');
    console.log(JSON.stringify(out.receipt, null, 2));
    console.log('');
  } catch (e) {
    if (isToolFailure(e)) {
      console.error(`  REFUSED    ${e.reason}: ${e.detail}`);
      console.error('');
      process.exitCode = 1;
      return;
    }
    throw e;
  }
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((e: unknown) => {
    console.error('\nSTOPPED\n' + (e instanceof Error ? e.message : String(e)));
    process.exitCode = 3;
  });
}
