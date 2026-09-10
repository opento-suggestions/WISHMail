/**
 * Publish the FOURTH `PriceList` as sequence 4 on the price topic — the
 * provisioned path priced at what it costs.
 *
 * WHY THERE IS A FOURTH. Sequence 2 priced the provisioned path at 2 ℏ and
 * sequence 3 carried that number forward untouched. Both were written before a
 * HIP-991 fee-gated topic had ever been created on this network, so 2 ℏ was an
 * estimate of a cost nobody had paid. Gate One paid it: one mailbox costs the
 * Postmaster 27.78102934 ℏ across its eight rows, of which the fee-gated
 * doorbell alone is 26.31542199 ℏ. Sequence 4 prices it at 30 ℏ.
 * `registrationFee` is unchanged at 0.05 ℏ — it is not a margin but the ℏ the
 * purchase funds into the agent's own account so the agent can pay for its own
 * registration (§4.6, D-159's addendum), and the measurement did not move it.
 *
 * §14.3 makes the schedule the SEQUENCE of messages and the price current at a
 * purchase the latest message before it, so this supersedes sequence 3 **by
 * landing after it**, and sequences 1, 2 and 3 are never edited. Correspondent B
 * bought under sequence 3 and is never repriced: a receipt is never
 * reconstructed by the party that charged it.
 *
 * The submission rule is `pricelist2.ts`'s, exported and called with different
 * arguments rather than copied: what makes a message sequence N — that the topic
 * holds exactly N-1 now — is the one stop that keeps this idempotent, and a
 * second spelling of it would be a second place for it to be wrong.
 *
 * WHAT THIS FILE ADDS, AND WHY IT IS AN ASSERTION RATHER THAN A CONSTRUCTION.
 * The claim this message makes to a reader is that one leaf moved. A document
 * built from a local file cannot prove that by itself — the file is what a hand
 * touched. So before anything can be signed, the sequence-3 message is fetched
 * from the mirror, decoded, and diffed leaf by leaf against what this run
 * composed. Exactly one leaf, at `provisioning.unitPrice`, or it stops. That
 * reaches further than a comparison against the sibling file: `buildPriceList`
 * fills `stampToken.tokenId`, `stampToken.treasury` and each method's `payTo`
 * from the environment and the deployment record, so a wrong environment would
 * otherwise reach consensus inside a message that validates against its schema
 * and hashes correctly.
 *
 * And the reader is run on the writer's output before that output is signed
 * (CLAUDE.md §9): a schema validates a document against its shape, never against
 * the rule that reads it, so `currentPriceList` and `quote` — the two the
 * counter calls at `buy_stamp` — are run over these bytes here.
 *
 *   --dry-run   build, assert, read, print, and sign nothing.
 */
import { loadEnv } from './env.js';
import { Mirror } from './mirror.js';
import { Record_ } from './record.js';
import { publishPriceList } from './pricelist2.js';
import { buildPriceList, canonicalBytes, sha256hex } from './steps.js';
import { currentPriceList, quote, scaled } from '../counter/pricing.js';
import type { Ctx } from './step.js';

/** What sequence 4 prices the provisioned path at (RECORD, Sonic 2026-09-10). */
const UNIT_PRICE = '30';
/** Unchanged from sequences 2 and 3, and asserted rather than assumed. */
const REGISTRATION_FEE = '0.05';
/** The one leaf that may move, as a dotted path into the message. */
const THE_ONE_LEAF = 'provisioning.unitPrice';

interface MMessages {
  readonly messages?: readonly { readonly sequence_number: number; readonly message: string }[];
}

/**
 * Every leaf at which two documents differ, as dotted paths.
 *
 * Arrays are walked by index like objects, so a method reordered or a bundle
 * added shows as the leaves it moved rather than as one opaque difference.
 */
function leafDiffs(a: unknown, b: unknown, path = ''): string[] {
  const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
  if (isObj(a) && isObj(b) && Array.isArray(a) === Array.isArray(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].flatMap((k) => leafDiffs(a[k], b[k], path === '' ? k : `${path}.${k}`));
  }
  if (JSON.stringify(a) === JSON.stringify(b)) return [];
  return [`${path}: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`];
}

/**
 * The counter's own price-read path, over the bytes this run composed.
 *
 * `currentPriceList` takes a `Mirror` because §14.3 has the price read from
 * consensus at every purchase and never from a constant. To run it on bytes that
 * are not on consensus yet, the mirror is modelled rather than the reader
 * reimplemented — the same duck-typed route `counter/exchange.check.ts` uses,
 * and the cast is required because `Mirror.baseUrl` is private.
 *
 * `quote` is then called exactly as `counter/purchase.ts` calls it. Its
 * `readRate` fetches the source the MESSAGE names, live, which is what the
 * counter does at purchase and what makes this a reading of the schedule rather
 * than of our expectations about it.
 */
async function readTheReader(bytes: Buffer, repoRoot: string): Promise<void> {
  const topic = '0.0.0';
  const page: MMessages = { messages: [{ sequence_number: 1, message: bytes.toString('base64') }] };
  const fake = {
    get: <T>(p: string): Promise<T | null> =>
      Promise.resolve(/^\/topics\/[0-9.]+\/messages/.test(p) ? (page as T) : null),
    poll: <T>(): Promise<T | null> => Promise.resolve(null),
  } as unknown as Mirror;

  const current = await currentPriceList(fake, topic, repoRoot);
  const q = await quote(current, 'hbar', 1, true);

  console.log('');
  console.log('  THE READER, over these bytes — currentPriceList() then quote(), as buy_stamp calls them');
  console.log('');
  console.log(`  one stamp      ${q.amount} ${q.currency}`);
  console.log(`  rate           ${q.rate?.value} ${q.rate?.pair} at ${q.rate?.at}`);
  console.log(`  rate source    ${q.rate?.source}`);
  console.log(`  provisioning   ${q.provisioning?.amount} ${q.provisioning?.currency}` +
    `, registrationFee ${q.provisioning?.registrationFee}`);
  console.log(`  stampToken     ${current.list.stampToken.tokenId} / ${current.list.stampToken.treasury}`);

  const p = q.provisioning;
  if (p === undefined) throw new Error('the reader returned no provisioning line for a provision:true quote');
  // Compared BY VALUE and never by spelling (§14.3, D-169): `30`, `30.0` and
  // `30.00` are one amount, and what is asserted is what would be charged.
  if (scaled(p.amount) !== scaled(UNIT_PRICE)) {
    throw new Error(`the reader quotes ${p.amount} for the provisioned path, not ${UNIT_PRICE}`);
  }
  if (p.registrationFee === undefined || scaled(p.registrationFee) !== scaled(REGISTRATION_FEE)) {
    throw new Error(`the reader quotes a registrationFee of ${p.registrationFee}, not ${REGISTRATION_FEE}`);
  }
  if (p.currency !== '0.0.0') throw new Error(`the provisioned path quotes in ${p.currency}, not ℏ`);
  // The stamp line is the half of the schedule that did NOT move, so it is
  // asserted here rather than assumed: a rate-priced stamp still reads the
  // network's own exchange rate, which is what a Verifier re-obtains (D-170).
  if (q.rate === undefined || !q.rate.source.includes('/network/exchangerate')) {
    throw new Error(`the stamp line reads ${q.rate?.source ?? 'no rate'}, not the network's own exchange rate`);
  }
  if (q.rate.pair !== 'HBAR/USD') throw new Error(`the stamp line reads the pair ${q.rate.pair}`);
  if (scaled(q.amount) <= 0n) throw new Error(`the reader quotes ${q.amount} for one stamp`);
  if (current.list.stampToken.tokenId !== '0.0.10426208' || current.list.stampToken.treasury !== '0.0.10426205') {
    throw new Error('the stampToken this message names is not the deployment’s $POSTAGE and treasury');
  }
  console.log('');
  console.log(`  the reader charges ${UNIT_PRICE} ℏ for the provisioned path and funds ${REGISTRATION_FEE} ℏ`);
  console.log('  the stamp line is unchanged: rate-priced against the network’s own exchange rate');
}

/**
 * The one-leaf assertion, against what consensus holds and not against a file.
 */
async function assertOneLeafMoved(): Promise<Buffer> {
  const env = loadEnv();
  const mirror = new Mirror(env.mirrorNodeUrl);
  const record = Record_.load(env.repoRoot, env.mirrorNodeUrl);

  const topic = record.get('prices.topic')?.id;
  const tokenId = record.get('postage.token')?.id;
  const treasuryId = record.get('treasury.account')?.id;
  if (!topic) throw new Error('the price topic is not in the record; run the Step 2 provisioning first');
  if (!tokenId || !treasuryId) throw new Error('the stamp token or its treasury is not in the record');

  // The same builder, the same suffix and the same record `publishPriceList`
  // will use, so the bytes asserted here are the bytes it composes. Both print
  // their digest, and a reader of the dry run compares them.
  const ctx = { env, record, tokenId: () => tokenId, treasuryId: () => treasuryId } as unknown as Ctx;
  const bytes = canonicalBytes(buildPriceList(ctx, '-4'));
  const composed = JSON.parse(bytes.toString('utf8')) as Record<string, unknown>;

  const page = await mirror.get<MMessages>(`/topics/${topic}/messages?limit=25&order=asc`);
  const three = (page?.messages ?? []).find((m) => m.sequence_number === 3);
  if (three === undefined) throw new Error(`the price topic ${topic} holds no sequence 3 to diff against`);
  const previous = JSON.parse(Buffer.from(three.message, 'base64').toString('utf8')) as Record<string, unknown>;

  console.log('');
  console.log(`  THE DIFF, against sequence 3 as the mirror holds it (topic ${topic})`);
  console.log('');
  const diffs = leafDiffs(previous, composed);
  for (const d of diffs) console.log(`    ${d}`);
  if (diffs.length === 0) console.log('    (none)');

  const expected = `${THE_ONE_LEAF}: ${JSON.stringify('2')} -> ${JSON.stringify(UNIT_PRICE)}`;
  if (diffs.length !== 1 || diffs[0] !== expected) {
    throw new Error(
      `sequence 4 must differ from sequence 3 at exactly one leaf, ${expected}. ` +
        `It differs at ${diffs.length}: ${diffs.join(' | ')}. A second difference is not a note, it is a stop: ` +
        'every constant in this message is filled from the environment and the deployment record, so a ' +
        'difference here is a difference between this machine and what consensus already holds.',
    );
  }
  console.log('');
  console.log(`  exactly one leaf moved: ${expected}`);

  // Sequence 3 is 666 bytes with a one-character price, so sequence 4 is 665
  // plus this price. Asserted as an arithmetic fact rather than a range: a
  // length that is merely "close" is a second change nobody looked at.
  const want = 665 + UNIT_PRICE.length;
  console.log(`  canonical   ${bytes.length} bytes, sha256 ${sha256hex(bytes)}`);
  if (bytes.length !== want) {
    throw new Error(`sequence 4 is ${bytes.length} canonical bytes and must be ${want} (sequence 3's 666, less "2", plus "${UNIT_PRICE}")`);
  }
  console.log(`  which is sequence 3's 666, less "2", plus "${UNIT_PRICE}"`);

  await readTheReader(bytes, env.repoRoot);
  return bytes;
}

async function main(): Promise<void> {
  await assertOneLeafMoved();
  await publishPriceList({
    suffix: '-4',
    sequence: 4,
    key: 'prices.fourth',
    role: 'the fourth PriceList — the provisioned path priced at what it costs',
    why:
      'Sequence 3 priced provisioning at 2 ℏ, set before the provisioning topic set’s cost was measured. ' +
      'Gate One measured it: one mailbox costs the Postmaster 27.78 ℏ, of which the HIP-991 fee-gated doorbell ' +
      'alone is 26.31 ℏ. Sequence 4 prices it at 30 ℏ; registrationFee is unchanged at 0.05 ℏ. ' +
      'Correspondent B bought under sequence 3 and is never repriced.',
  });
}

main().catch((e: unknown) => {
  console.error('\nSTOPPED\n' + (e instanceof Error ? e.message : String(e)));
  process.exitCode = 3;
});
