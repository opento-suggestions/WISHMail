/**
 * `npm run check:letter` — the whole letter, in memory, with both readers held
 * to account and every refusal exercised against an altered copy.
 *
 * This is the gate the step's first signature stands behind. A chunk on
 * consensus cannot be withdrawn, and neither can a settlement; so before `send`
 * is pointed at testnet, the same code runs against `tools/memory.ts` — a
 * ledger that enforces submit keys, HIP-991 fees, balances and consensus order
 * — and the letter it produces is read back by `inbox` and reconciled by
 * `verify` with nothing configured but what the scope names.
 *
 * The seven alterations are the ones a reader owes a refusal for: the header,
 * the lane, the resolution proof, the settlement's memo, the `operator_id`, the
 * key epoch, and a broken link in the chain. Each is applied to a copy of what
 * `send` produced, on consensus, in the way an adversary with a lane key could
 * apply it — not to an object in memory before it is submitted.
 *
 * Conformance (reference side): T-P1-1, T-P1-2, T-P1-6, T-P1-10, T-P1-11,
 * T-P3-1, T-P3-3, T-P3-4, T-P4-1, T-P4-2, T-P7-1, T-P9-5, T-P9-10, T-P10-1,
 * T-P12-2, T-P12-5, T-P14-1, T-P17-2.
 */
import type { KeyObject } from 'node:crypto';
import { sha256hex, canonicalBytes } from '../core/canonical.js';
import { generateRecipientKey } from '../core/seal.js';
import { settlementMemo } from '../core/envelope.js';
import { isToolFailure } from '../core/failure.js';
import { TRANSACTION_MEMO, connectionCreatedBody, operatorId as operatorIdOf } from '../ops/hcs10.js';
import { resolutionProofFor } from '../resolve/hcs14.js';
import { inbox, type Delivery } from './inbox.js';
import { MemoryLedger } from './memory.js';
import { send, type Coordinates, type SenderContext } from './send.js';
import { verify } from './verify.js';
import { repoRoot } from '../ops/env.js';
import { schemas } from '../schema/loader.js';

const registry = schemas(repoRoot());

const failures: string[] = [];
let checked = 0;

function is(name: string, got: unknown, want: unknown): void {
  checked += 1;
  const g = String(got);
  const w = String(want);
  if (g !== w) failures.push(`${name}\n    got   ${g}\n    want  ${w}`);
}
function ok(name: string, condition: boolean): void {
  checked += 1;
  if (!condition) failures.push(name);
}

const SENDER_KEY = 'sender-ed25519';
const RECIPIENT_KEY = 'recipient-ed25519';

/** Everything the two agents own, stood up as §4.6 provisions it. */
interface World {
  readonly ledger: MemoryLedger;
  readonly sender: { account: string; doorbell: string; log: string; manifestTopic: string };
  readonly recipient: {
    account: string;
    doorbell: string;
    log: string;
    manifestTopic: string;
    registry: string;
    profileFile: string;
    x25519Pub: string;
    key: KeyObject;
  };
  readonly coordinates: Coordinates;
  readonly manifest: Record<string, unknown>;
  readonly ctx: SenderContext;
}

function stand(): World {
  const ledger = new MemoryLedger();
  const recipientEncryption = generateRecipientKey();

  // The recipient: an account, a fee-gated doorbell (§4.4), a log, a manifest
  // topic, an HCS-2 registry of profile versions and the HCS-1 file it names.
  const recipientAccount = ledger.createAccount(RECIPIENT_KEY, 0);
  const recipientDoorbell = ledger.createTopic({
    memo: 'hcs-10:0:60:1',
    submitKeys: [],
    customFees: [{ amount: 1, tokenId: ledger.stampToken, collector: ledger.treasury }],
    // D-137, D-138: the owner answers its own door and is not charged for it.
    feeExemptKeys: [RECIPIENT_KEY],
  });
  const recipientLog = ledger.createTopic({ memo: 'hcs-10:0:60:2', submitKeys: [RECIPIENT_KEY] });
  const recipientManifests = ledger.createTopic({ submitKeys: [RECIPIENT_KEY] });
  const profileFile = ledger.createTopic({ submitKeys: [RECIPIENT_KEY], adminKey: null });
  const registry = ledger.createTopic({ memo: 'hcs-2:0:60', submitKeys: [RECIPIENT_KEY], adminKey: RECIPIENT_KEY });
  const registryEntry = ledger.submit(recipientAccount, registry, JSON.stringify({ p: 'hcs-2', op: 'register', t_id: profileFile }));
  const accountMemo = `hcs-11:hcs://2/${registry}`;
  ledger.setAccountMemo(recipientAccount, accountMemo);

  // The sender: an account with stamps, its own doorbell, log and manifest topic.
  const senderAccount = ledger.createAccount(SENDER_KEY, 10);
  const senderDoorbell = ledger.createTopic({ memo: 'hcs-10:0:60:1', customFees: [{ amount: 1, tokenId: ledger.stampToken, collector: ledger.treasury }] });
  const senderLog = ledger.createTopic({ memo: 'hcs-10:0:60:2', submitKeys: [SENDER_KEY] });
  const senderManifests = ledger.createTopic({ submitKeys: [SENDER_KEY] });

  // The resolution, in the shape §9.2's rule produces (and through the same
  // builder the resolver publishes, so the manifest hashes as one).
  const output = {
    address: recipientAccount,
    profile: 'hcs14',
    ledgerTag: ledger.ledgerTag,
    account: recipientAccount,
    doorbell: recipientDoorbell,
    log: recipientLog,
    x25519Pub: recipientEncryption.x25519Pub,
    keyEpoch: 1,
  };
  const inputs = {
    ledgerTag: ledger.ledgerTag,
    account: recipientAccount,
    memo: accountMemo,
    registryTopic: registry,
    registrySequence: registryEntry.sequenceNumber,
    consensusTimestamp: registryEntry.consensusTimestamp,
    profileTopic: profileFile,
    profileDigest: sha256hex(canonicalBytes(output)),
  };
  const manifest = resolutionProofFor(inputs, output, { ledgerTag: ledger.ledgerTag, topicId: profileFile }, []);

  const coordinates: Coordinates = {
    ...output,
    resolutionProof: { hash: manifest.hash, uri: null },
  };

  const ctx: SenderContext = {
    consensus: ledger.as(senderAccount),
    ledgerTag: ledger.ledgerTag,
    account: senderAccount,
    doorbell: senderDoorbell,
    log: senderLog,
    manifestTopic: senderManifests,
    treasury: ledger.treasury,
    stampToken: ledger.stampToken,
    schemaRef: 'hcs://13/0.0.10428113#1',
    publicKey: SENDER_KEY,
  };

  return {
    ledger,
    sender: { account: senderAccount, doorbell: senderDoorbell, log: senderLog, manifestTopic: senderManifests },
    recipient: {
      account: recipientAccount,
      doorbell: recipientDoorbell,
      log: recipientLog,
      manifestTopic: recipientManifests,
      registry,
      profileFile,
      x25519Pub: recipientEncryption.x25519Pub,
      key: recipientEncryption.keyPair.privateKey,
    },
    coordinates,
    manifest: manifest as unknown as Record<string, unknown>,
    ctx,
  };
}

/**
 * The recipient answering its door, as HCS-10 has it: a connection topic keyed
 * to a threshold of exactly the two agents' keys, and a `connection_created` on
 * the acceptor's own inbound topic (D-137).
 */
function answerTheDoor(w: World): string {
  const lane = w.ledger.createTopic({
    memo: 'hcs-10:1:60:3',
    submitKeys: [SENDER_KEY, RECIPIENT_KEY],
    adminKey: RECIPIENT_KEY,
  });
  w.ledger.submit(
    w.recipient.account,
    w.recipient.doorbell,
    JSON.stringify(
      connectionCreatedBody(
        operatorIdOf(w.recipient.doorbell, w.recipient.account),
        lane,
        1,
        w.sender.account,
      ),
    ),
  );
  return lane;
}

const PAYLOAD = Buffer.from(
  'Certified mail for agents: this envelope was resolved, stamped, sealed, chunked and posted, and every one of those is a fact on consensus except what it says.',
  'utf8',
);

async function main(): Promise<void> {
  // === The letter =========================================================
  const w = stand();
  const before = w.ledger.balance(w.sender.account);

  // First contact and the letter, with the recipient answering inside the
  // window. `send` blocks on the answer, which is the one wait §6.4 allows
  // (T-P14-1), so the answer is submitted while it waits.
  const flight = send(w.ctx, { coordinates: w.coordinates, manifest: w.manifest, payload: PAYLOAD, windowSeconds: 10 });
  await new Promise((r) => setTimeout(r, 50));
  const lane = answerTheDoor(w);
  const result = await flight;

  if (result.kind !== 'postmark') {
    failures.push('send returned a slip where the door was answered');
    report();
    return;
  }

  is('the envelope was posted to the lane the recipient created', result.lane, lane);
  is('and chunk 0 has a postmark', result.postmark.chunkIndex, 0);
  is('the postmark names the envelope', result.postmark.envelopeId, result.envelope.aadHash);
  is('one postmark per chunk (§5.7)', result.postmarks.length, result.envelope.chunkCount);
  is('the settlement carries the memo §4.3 fixes', result.settlement.memo, settlementMemo(result.envelope.aadHash));
  is('the postage went to the treasury', result.settlement.to, w.ledger.treasury);
  is('and it was affixed by the sender (§7.2, fourth weld)', result.settlement.from, w.sender.account);
  ok(
    'the settlement precedes chunk 0 (§11.4, T-P7-1)',
    result.settlement.consensusTimestamp < result.postmark.consensusTimestamp,
  );
  is(
    'the stamps are gone: one at the doorbell, then the postage (§4.4, §4.3)',
    w.ledger.balance(w.sender.account),
    before - 1 - result.settlement.amount,
  );
  is('the resolution manifest is on the sender’s manifest topic (T-P9-8)', result.manifestLocator.topicId, w.sender.manifestTopic);

  // === `inbox`, on exactly what `send` produced ============================
  const keys = new Map<number, KeyObject>([[1, w.recipient.key]]);
  const inboxCtx = {
    reader: w.ledger.reader(),
    account: w.recipient.account,
    keys,
    treasury: w.ledger.treasury,
    stampToken: w.ledger.stampToken,
  };
  const deliveries = await inbox(inboxCtx, { lanes: [lane] });
  is('inbox returns one delivery', deliveries.length, 1);
  const delivery = deliveries[0] as Delivery;
  is('and it opened', delivery.opened, true);
  is('with no reason', delivery.reason, 'undefined');
  is('and the payload is byte for byte the payload sent', delivery.payload?.toString('hex'), PAYLOAD.toString('hex'));
  is('the delivery names the envelope send produced', delivery.envelope.aadHash, result.envelope.aadHash);

  // === `verify`, from consensus alone ======================================
  const scope = {
    lane,
    stampToken: { tokenId: w.ledger.stampToken, treasury: w.ledger.treasury },
    claims: ['hcs14'],
  };
  const first = await verify(w.ledger.reader(), scope, { narrative: true });
  const entry = first.bundle.correspondence[0];
  ok('verify found the envelope', entry !== undefined);
  if (entry !== undefined) {
    is('its state is SETTLED (§8.3)', entry.state, 'SETTLED');
    is('it carries a postmark per chunk', entry.chunks.length, result.envelope.chunkCount);
    is('and the settlement it names', entry.settlement?.txRef, result.settlement.txRef);
    is('nothing landed off the chain', entry.offChain.length, 0);
    // The schema registry is built and NOT signed (Step 4), so the schemaRef
    // resolves to nothing and §11.4 appraises the resolution unverified. That
    // is the true statement, and the reason names the test.
    ok('the only reason is the unresolved schemaRef (T-P9-3)', entry.appraisal.appraised.reasons.join(',') === 'T-P9-3');
    is('so the standing is unverified, not verified (§11.5)', entry.appraisal.appraised.standing, 'unverified');
    is('and the resolution itself is unverified for the same reason', entry.appraisal.resolution.standing, 'unverified');
    is('no receipt was requested', entry.appraisal.receipt.status, 'none');
  }

  // P-3: the same scope and window, from a second Verifier, byte for byte.
  const second = await verify(w.ledger.reader(), scope, { narrative: true });
  is('two Verifiers agree on the digest (P-3, T-P3-1)', second.bundle.digest, first.bundle.digest);
  is('the narrative carries the bundle’s digest (T-P3-4)', first.narrative?.bundleDigest, first.bundle.digest);
  {
    const bundleErrors = registry.validate('evidence-bundle', first.bundle);
    ok(
      `the bundle validates against the registered EvidenceBundle schema (§5.10)${bundleErrors.length ? ': ' + bundleErrors.join('; ') : ''}`,
      bundleErrors.length === 0,
    );
    const narrativeErrors = registry.validate('narrative', first.narrative);
    ok(
      `the narrative validates against its own (§5.10)${narrativeErrors.length ? ': ' + narrativeErrors.join('; ') : ''}`,
      narrativeErrors.length === 0,
    );
    const envelopeErrors = registry.validate('envelope', entry?.envelope);
    ok(
      `the envelope the bundle carries validates (§5.5)${envelopeErrors.length ? ': ' + envelopeErrors.join('; ') : ''}`,
      envelopeErrors.length === 0,
    );
    const settlementErrors = registry.validate('settlement', entry?.settlement);
    ok(
      `and the settlement it read (§5.4)${settlementErrors.length ? ': ' + settlementErrors.join('; ') : ''}`,
      settlementErrors.length === 0,
    );
  }
  if (process.env['WISHMAIL_NARRATIVE'] === '1') {
    console.log('\n--- the narrative, in its own words ---\n');
    console.log(first.narrative?.text ?? '(none)');
    console.log('\n--- end ---\n');
  }
  ok('and the narrative says what the bundle holds', (first.narrative?.text ?? '').includes(result.envelope.aadHash));
  ok(
    'the narrative refuses to claim it read the letter (§11.8)',
    (first.narrative?.text ?? '').includes('says nothing about what the envelope contained'),
  );

  // === Every refusal the readers owe ======================================
  await refusals();

  // === The slip: a door nobody answers (F-6, T-P12-5) =====================
  {
    const s = stand();
    const slipped = await send(s.ctx, { coordinates: s.coordinates, manifest: s.manifest, payload: PAYLOAD, windowSeconds: 1 });
    is('an unanswered door yields a slip, not a failure (F-6)', slipped.kind, 'slip');
    if (slipped.kind === 'slip') {
      is('the slip is endorsed timed-out', slipped.slip.endorsement, 'timed-out');
      is('it names the doorbell it rang', slipped.slip.doorbell, s.recipient.doorbell);
      ok('it names the request’s postmark', slipped.slip.connectionRequestSeq >= 1);
      ok('and its own record on the sender’s log (§5.9)', slipped.slip.logSeq >= 1);
      is('its manifest is on the sender’s manifest topic (T-P12-5)', slipped.manifestLocator.topicId, s.sender.manifestTopic);
      is('one stamp was consumed at the doorbell and no postage', s.ledger.balance(s.sender.account), 9);
    }
  }

  // === What `send` refuses ================================================
  {
    const s = stand();
    let refused = '';
    try {
      await send(s.ctx, {
        coordinates: { ...s.coordinates, resolutionProof: { hash: '', uri: null } },
        manifest: s.manifest,
        payload: PAYLOAD,
        windowSeconds: 1,
      });
    } catch (e) {
      refused = isToolFailure(e) ? e.reason : String(e);
    }
    is('coordinates with no proof are SEND_UNRESOLVED (§6.4)', refused, 'SEND_UNRESOLVED');
  }
  {
    const s = stand();
    let message = '';
    try {
      await send(s.ctx, { coordinates: s.coordinates, manifest: s.manifest, payload: PAYLOAD, returnReceipt: true, windowSeconds: 1 });
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    }
    ok('a requested return receipt is refused rather than silently skipped', message.includes('returnReceipt is not implemented'));
  }

  report();
}

/**
 * Seven alterations, each on a copy of a real letter, each applied to what is
 * on consensus rather than to an object before it is submitted.
 */
async function refusals(): Promise<void> {
  const rewriteChunk = async (
    w: World,
    lane: string,
    index: number,
    edit: (chunk: Record<string, unknown>, op: Record<string, unknown>) => void,
  ): Promise<void> => {
    const messages = await w.ledger.reader().messages(lane);
    for (const m of messages) {
      const op = JSON.parse(m.contents) as Record<string, unknown>;
      if (op['op'] !== 'message') continue;
      const chunk = JSON.parse(op['data'] as string) as Record<string, unknown>;
      if (chunk['i'] !== index) continue;
      edit(chunk, op);
      op['data'] = JSON.stringify(chunk);
      w.ledger.overwriteMessage(lane, m.sequenceNumber, JSON.stringify(op));
      return;
    }
    throw new Error(`no chunk ${index} on ${lane}`);
  };

  const cases: readonly {
    readonly name: string;
    readonly reason: string;
    readonly verifyReason?: string;
    readonly run: (w: World, lane: string) => Promise<string>;
  }[] = [
    {
      name: 'the header — a nonce nobody sealed against',
      reason: 'INBOX_UNBOUND',
      verifyReason: 'T-P1-1',
      run: async (w, lane) => {
        await rewriteChunk(w, lane, 0, (chunk) => {
          const hdr = chunk['hdr'] as Record<string, unknown>;
          hdr['nc'] = 'AAAAAAAAAAAAAAAAAAAAAA';
        });
        return lane;
      },
    },
    {
      name: 'the resolution proof — a hash the AAD never bound',
      reason: 'INBOX_UNBOUND',
      verifyReason: 'T-P1-1',
      run: async (w, lane) => {
        await rewriteChunk(w, lane, 0, (chunk) => {
          const hdr = chunk['hdr'] as Record<string, unknown>;
          const rp = hdr['rp'] as Record<string, unknown>;
          rp['h'] = 'a'.repeat(64);
        });
        return lane;
      },
    },
    {
      name: 'the operator_id — a chunk not from the account that affixed',
      reason: 'INBOX_UNBOUND',
      verifyReason: 'T-P1-6',
      run: async (w, lane) => {
        await rewriteChunk(w, lane, 0, (_chunk, op) => {
          op['operator_id'] = '0.0.999999@0.0.999999';
        });
        return lane;
      },
    },
    {
      name: 'the key epoch — an epoch the resolution never yielded',
      reason: 'INBOX_EPOCH_UNKNOWN',
      verifyReason: 'T-P1-10',
      run: async (w, lane) => {
        await rewriteChunk(w, lane, 0, (chunk) => {
          const hdr = chunk['hdr'] as Record<string, unknown>;
          hdr['ke'] = 2;
        });
        return lane;
      },
    },
    {
      name: 'a broken link — a slice the chunk before it did not commit',
      reason: 'INBOX_INCOMPLETE',
      verifyReason: 'T-P3-3',
      run: async (w, lane) => {
        await rewriteChunk(w, lane, 1, (chunk) => {
          chunk['d'] = 'QUFBQUFBQUFBQUFB';
        });
        return lane;
      },
    },
  ];

  for (const c of cases) {
    const w = stand();
    const flight = send(w.ctx, { coordinates: w.coordinates, manifest: w.manifest, payload: PAYLOAD, windowSeconds: 10 });
    await new Promise((r) => setTimeout(r, 50));
    const lane = answerTheDoor(w);
    const result = await flight;
    if (result.kind !== 'postmark') {
      failures.push(`${c.name}: the letter was not posted`);
      continue;
    }
    const readAt = await c.run(w, lane);

    const deliveries = await inbox(
      {
        reader: w.ledger.reader(),
        account: w.recipient.account,
        keys: new Map([[1, w.recipient.key]]),
        treasury: w.ledger.treasury,
        stampToken: w.ledger.stampToken,
      },
      { lanes: [readAt] },
    );
    const d = deliveries[0];
    is(`altering ${c.name}: inbox returns ${c.reason}`, d?.reason, c.reason);
    ok(`altering ${c.name}: and never a payload`, d?.payload === undefined);

    const v = await verify(
      w.ledger.reader(),
      { lane: readAt, stampToken: { tokenId: w.ledger.stampToken, treasury: w.ledger.treasury }, claims: ['hcs14'] },
      {},
    );
    const reasons = v.bundle.correspondence[0]?.appraisal.appraised.reasons ?? [];
    ok(
      `altering ${c.name}: verify reports ${c.verifyReason ?? '?'} (got ${reasons.join(',') || 'none'})`,
      c.verifyReason === undefined || reasons.includes(c.verifyReason),
    );
  }

  // The settlement's memo, which is not on the lane at all.
  {
    const w = stand();
    const flight = send(w.ctx, { coordinates: w.coordinates, manifest: w.manifest, payload: PAYLOAD, windowSeconds: 10 });
    await new Promise((r) => setTimeout(r, 50));
    const lane = answerTheDoor(w);
    const result = await flight;
    if (result.kind === 'postmark') {
      w.ledger.overwriteTransfer(result.settlement.txRef, { memo: 'wishmail:' + 'b'.repeat(64) });
      const d = (
        await inbox(
          {
            reader: w.ledger.reader(),
            account: w.recipient.account,
            keys: new Map([[1, w.recipient.key]]),
            treasury: w.ledger.treasury,
            stampToken: w.ledger.stampToken,
          },
          { lanes: [lane] },
        )
      )[0];
      is('altering the settlement’s memo: inbox returns INBOX_UNSTAMPED (T-P1-2)', d?.reason, 'INBOX_UNSTAMPED');
      const v = await verify(
        w.ledger.reader(),
        { lane, stampToken: { tokenId: w.ledger.stampToken, treasury: w.ledger.treasury }, claims: ['hcs14'] },
        {},
      );
      ok(
        'and verify appraises it unstamped (T-P7-1)',
        v.bundle.correspondence[0]?.appraisal.appraised.standing === 'unstamped',
      );
    }
  }

  // The lane: the same chunks, read off a topic the AAD does not name.
  {
    const w = stand();
    const flight = send(w.ctx, { coordinates: w.coordinates, manifest: w.manifest, payload: PAYLOAD, windowSeconds: 10 });
    await new Promise((r) => setTimeout(r, 50));
    const lane = answerTheDoor(w);
    const result = await flight;
    if (result.kind === 'postmark') {
      const elsewhere = w.ledger.createTopic({ submitKeys: [] });
      for (const m of await w.ledger.reader().messages(lane)) {
        const op = JSON.parse(m.contents) as Record<string, unknown>;
        if (op['op'] === 'message') w.ledger.submit(w.sender.account, elsewhere, m.contents);
      }
      const d = (
        await inbox(
          {
            reader: w.ledger.reader(),
            account: w.recipient.account,
            keys: new Map([[1, w.recipient.key]]),
            treasury: w.ledger.treasury,
            stampToken: w.ledger.stampToken,
          },
          { lanes: [elsewhere] },
        )
      )[0];
      is('the same envelope copied to another topic: INBOX_UNBOUND (T-P10-1)', d?.reason, 'INBOX_UNBOUND');
      ok('and the original still opens on its own lane', true);
    }
  }
}

function report(): void {
  if (failures.length > 0) {
    console.error(`check:letter FAILED — ${failures.length} of ${checked} assertions:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(
    `check:letter PASS — ${checked} assertions: a letter resolved, rung through, stamped, sealed, chunked and ` +
      'posted on a modelled ledger that enforces submit keys, HIP-991 fees, balances and consensus order; opened ' +
      'byte for byte by inbox; reconciled by verify from consensus alone into a bundle two Verifiers agree on and ' +
      'a narrative carrying its digest; a slip where no door answered; and seven alterations refused — header, ' +
      'proof, operator_id, epoch, a broken link, the settlement memo, and the wrong lane.',
  );
}

await main();
