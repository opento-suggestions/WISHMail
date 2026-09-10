/**
 * Publish the SECOND `PriceList` as sequence 2 on the price topic.
 *
 * §14.3: "The price current at a purchase is the latest price message with a
 * consensus timestamp before the purchase's." A price list is therefore never
 * edited and never replaced — the schedule on consensus IS the sequence of
 * messages, and a second schedule is a second message. Sequence 1 stands
 * untouched, which is also what `priceListStep.confirm` requires: it rebuilds
 * `app/price-list.<network>.json` and compares it byte-for-byte against the
 * message at sequence 1 on every later run.
 *
 * WHY THERE IS A SECOND. D-159's addendum makes the provisioning purchase one
 * atomic transaction with three legs, one of which is the registration fee the
 * Postmaster funds into the agent's account. §14.3 forbids charging under a
 * price that has not been published, so the provisioned path of §4.6 cannot be
 * sold until its price is on the topic. The first message omitted `provisioning`
 * entirely (D-57: provisioning is never required).
 *
 * The numbers are RECORD (Sonic, 2026-09-09) and live in
 * `app/price-list-2.<network>.json` as a reviewable document, not in code —
 * §14.3's own discipline, and the same as the first message's.
 *
 *   --dry-run   build, fill, validate, print, and sign nothing.
 */
import { TopicMessageSubmitTransaction } from '@hashgraph/sdk';
import { Client } from '@hashgraph/sdk';
import { loadEnv } from './env.js';
import { fromEnv } from './identity.js';
import { Mirror } from './mirror.js';
import { Record_, SPEC_TAG } from './record.js';
import { submit } from './hedera.js';
import { buildPriceList, canonicalBytes, sha256hex, validatePriceList } from './steps.js';
import type { Ctx } from './step.js';

const dryRun = process.argv.includes('--dry-run');

interface MMessages {
  readonly messages?: readonly {
    readonly sequence_number: number;
    readonly message: string;
    readonly payer_account_id: string;
    readonly consensus_timestamp: string;
  }[];
}

function stop(reason: string): never {
  console.error(`\nSTOP — ${reason}`);
  process.exit(1);
}

async function main(): Promise<void> {
  const env = loadEnv();
  const mirror = new Mirror(env.mirrorNodeUrl);
  const postmasterPayer = fromEnv('postmaster payer', 'POSTMASTER_PAYER_DER_KEY');
  const record = Record_.load(env.repoRoot, env.mirrorNodeUrl);

  const topic = record.get('prices.topic')?.id;
  const tokenId = record.get('postage.token')?.id;
  const treasuryId = record.get('treasury.account')?.id;
  if (!topic) stop('the price topic is not in the record; run the Step 2 provisioning first');
  if (!tokenId || !treasuryId) stop('the stamp token or its treasury is not in the record');

  // `buildPriceList` fills exactly three fields from the record and the
  // environment — the token, the treasury, and each method's payTo — and asserts
  // every per-network constant against `networks.ts`, so the document and the
  // table cannot drift. The second message goes through the same builder as the
  // first, pointed at the second file.
  const ctx = {
    env,
    record,
    tokenId: () => tokenId,
    treasuryId: () => treasuryId,
  } as unknown as Ctx;

  const msg = buildPriceList(ctx, '-2');
  const bytes = canonicalBytes(msg);
  const digest = sha256hex(bytes);

  console.log('');
  console.log('  the second PriceList (§14.3), for sequence 2 on the price topic');
  console.log('');
  console.log(`  topic       ${topic}`);
  console.log(`  canonical   ${bytes.length} bytes (RFC 8785), sha256 ${digest}`);
  console.log(`  provisioning ${JSON.stringify((msg as { provisioning?: unknown }).provisioning)}`);
  console.log('');
  console.log(JSON.stringify(msg, null, 2).split('\n').map((l) => `    ${l}`).join('\n'));
  console.log('');

  // Validated against the registered schema BEFORE it is signed, exactly as the
  // first was: §14.3's MUST is what a Verifier reads back, and the schema is how
  // this release says what that shape is.
  const errors = validatePriceList(env.repoRoot, msg);
  if (errors.length) stop('the second PriceList does not validate, and is not published: ' + errors.join('; '));
  console.log('  validates against spec/schemas/price-list.schema.json');

  // §9.1's one-message rule is about manifests, but the reason is the network's
  // and applies to every message we submit: past 1024 bytes the SDK splits, and
  // a half-message is not a price list.
  if (bytes.length > 1024) stop(`the message is ${bytes.length} bytes and a single HCS message caps at 1024`);
  console.log('  fits one HCS message');

  // The stop that makes this idempotent: this message is sequence 2, and it is
  // sequence 2 only if the topic holds exactly one message now. Two runs cannot
  // publish two second messages.
  const before = await mirror.get<MMessages>(`/topics/${topic}/messages?limit=25&order=asc`);
  const count = before?.messages?.length ?? 0;
  if (count === 0) stop('the price topic holds no message; sequence 1 must be published first');
  if (count > 1) {
    const existing = before?.messages?.[1];
    if (existing && existing.message === bytes.toString('base64')) {
      console.log(`\n  already published: sequence ${existing.sequence_number}, byte-for-byte identical. Nothing to do.`);
      return;
    }
    stop(`the price topic already holds ${count} messages, and sequence 2 is not this message. Publishing would make a third.`);
  }
  console.log('  the topic holds exactly one message, so this is sequence 2');

  if (dryRun) {
    console.log('\n  --dry-run: nothing signed, nothing submitted.');
    return;
  }

  const client = Client.forName(env.network);
  client.setOperatorWith(env.postmasterPayerId, postmasterPayer.publicKey, postmasterPayer.sign);

  // No transaction memo: §6.1 and T-P9-5 bound a memo to what HCS-10 defines for
  // an operation, and a price list is not an HCS-10 operation. The first message
  // carried none either.
  const r = await submit(
    client,
    env.postmasterPayerId,
    new TopicMessageSubmitTransaction().setTopicId(topic).setMessage(bytes),
    [postmasterPayer],
  );
  if (!r.ok) stop(`the submission returned ${r.status} (tx ${r.transactionId})`);
  console.log(`\n  submitted   ${r.transactionId}  ${r.status}`);

  // Read back from the mirror and never from the SDK receipt, and compare the
  // bytes rather than the digest: a digest that matches a message nobody can
  // read is not a published price list.
  const after = await mirror.poll<MMessages>(
    `/topics/${topic}/messages?limit=25&order=asc`,
    (m) => (m.messages ?? []).some((x) => x.sequence_number === 2),
  );
  const second = after?.messages?.find((x) => x.sequence_number === 2);
  if (!second) stop('the mirror does not hold a sequence 2 on the price topic');
  if (second.message !== bytes.toString('base64')) stop('sequence 2 is not the message that was submitted, byte-for-byte');
  if (second.payer_account_id !== env.postmasterPayerId) stop(`sequence 2 was paid by ${second.payer_account_id}`);

  const first = after?.messages?.find((x) => x.sequence_number === 1);
  console.log(`  confirmed   sequence 2, payer ${second.payer_account_id}, consensus ${second.consensus_timestamp}`);
  console.log(`  byte-for-byte identical to what was signed`);
  console.log(`  sequence 1 is untouched: ${first ? 'still present' : 'MISSING — investigate'}`);

  record.put('prices.second', {
    kind: 'message',
    role: 'the second PriceList — the provisioned path priced (D-159 addendum)',
    id: topic,
    builtBy: 'TopicMessageSubmitTransaction',
    signedBy: ['postmaster payer'],
    payer: env.postmasterPayerId,
    transactionId: r.transactionId,
    consensusTimestamp: second.consensus_timestamp,
    confirmedFrom: `GET /topics/${topic}/messages`,
    confirmedAt: new Date().toISOString(),
    policy: {
      sequenceNumber: 2,
      sha256: digest,
      bytes: bytes.length,
      provisioning: (msg as { provisioning?: unknown }).provisioning,
      warrant: '§14.3: the schedule is the sequence of messages; the current price is the latest before the purchase',
    },
    specTag: SPEC_TAG,
  });
  console.log('\n  recorded as prices.second');
}

main().catch((e: unknown) => {
  console.error('\nSTOPPED\n' + (e instanceof Error ? e.message : String(e)));
  process.exitCode = 3;
});
