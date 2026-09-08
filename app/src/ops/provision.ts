/**
 * Stand up the Postmaster's entities on hedera:testnet.
 *
 * Run it twice: the second run creates nothing, exits 0, and prints the same
 * table. Delete one entry from app/deployment/hedera-testnet.json and re-run,
 * and it creates a new instance of that entity type and nothing else.
 *
 *   --dry-run   plan only. Resolves every Want, prints the table with what it
 *               WOULD create, and signs nothing. This is what the gate reports.
 *   --repin     authorise overwriting a stampToken pin that disagrees with the
 *               record. Re-creating the token is a decision, not an inference.
 *   --json      emit the report as data, so idempotency is assertable.
 */
import { Client } from '@hashgraph/sdk';
import { loadEnv } from './env.js';
import { bornHere, fromEnv, persistentIdentity, type Signer } from './identity.js';
import { Mirror, toMirrorTxId } from './mirror.js';
import { Record_, type EntityKey, type EntityRecord } from './record.js';
import { pinStampToken, unfilledPins } from './pins.js';
import { STEPS, buildPriceList, canonicalBytes, sha256hex, validatePriceList } from './steps.js';
import type { Ctx, Discrepancy, Outcome, Row } from './step.js';

const flags = {
  dryRun: process.argv.includes('--dry-run'),
  repin: process.argv.includes('--repin'),
  json: process.argv.includes('--json'),
};

/**
 * Generated private keys go straight to the git-ignored .env and are never
 * printed, returned, or recorded (D-149's successor rule). A key already in
 * .env is recovered, never replaced: a re-run must not orphan an entity that
 * an existing key owns.
 */
function identity(label: string, prefix: 'TREASURY' | 'AGENT'): Signer {
  // A dry run writes nothing at all, so it uses an ephemeral identity whose key
  // dies with the process; a real run persists through identity.ts, which is the
  // only module that ever sees the DER form.
  if (flags.dryRun) return bornHere(label);
  return persistentIdentity(label, prefix).signer;
}

async function main(): Promise<number> {
  const env = loadEnv();
  const mirror = new Mirror(env.mirrorNodeUrl);
  const operator = fromEnv('operator', 'OPERATOR_DER_KEY');
  const record = Record_.load(env.repoRoot, env.mirrorNodeUrl);

  const treasury = identity('treasury', 'TREASURY');
  const agent = identity('agent', 'AGENT');

  const client = Client.forName(env.network);
  client.setOperatorWith(env.operatorId, operator.publicKey, operator.sign);

  const idOf = (k: EntityKey): string => {
    const r = record.get(k);
    if (!r?.id) throw new Error(`${k} is not in the record yet`);
    return r.id;
  };

  const ctx: Ctx = {
    env, client, mirror, record, operator, treasury, agent,
    treasuryId: () => (flags.dryRun && !record.has('treasury.account') ? '0.0.PENDING' : idOf('treasury.account')),
    agentId: () => (flags.dryRun && !record.has('agent.account') ? '0.0.PENDING' : idOf('agent.account')),
    tokenId: () => (flags.dryRun && !record.has('postage.token') ? '0.0.PENDING' : idOf('postage.token')),
    flags: { dryRun: flags.dryRun, repin: flags.repin },
  };

  let preflight = 'no USDC asset declared for this network';

  // ---- pre-flight -------------------------------------------------------
  // Row 8 publishes the operator as payTo for the x402-usdc method, and a payTo
  // that cannot receive the asset is a false publication: §14.3 has the price
  // list say where the money goes, and §14.2's PAYMENT-REQUIRED carries that
  // address to the buyer. On Hedera an account must be associated with an HTS
  // token to receive it, so this is asserted before anything is signed rather
  // than discovered by a buyer.
  const usdc = env.constants.usdc;
  if (usdc) {
    const held = await mirror.get<{ tokens?: { token_id: string; automatic_association?: boolean }[] }>(
      `/accounts/${env.operatorId}/tokens?token.id=${usdc.assetId}`,
    );
    const assoc = (held?.tokens ?? []).find((t) => t.token_id === usdc.assetId);
    if (!assoc) {
      console.error(`\nSTOP — PRE-FLIGHT: the operator ${env.operatorId} is not associated with ${usdc.assetId}, the USDC asset app/src/ops/networks.ts names for ${env.network}.`);
      console.error('The first PriceList publishes that account as payTo for the x402-usdc method, and a payTo that cannot receive the asset is a false publication (§14.2, §14.3).');
      console.error('Associate it, or correct the asset in networks.ts, and re-run. Nothing was signed.');
      return 1;
    }
    preflight = `operator associated with USDC ${usdc.assetId} (${assoc.automatic_association ? 'automatic' : 'explicit'})`;
  }

  const rows: Row[] = [];
  let created = 0;
  let n = 0;

  const stop = (key: EntityKey, reason: string, d?: readonly Discrepancy[]): number => {
    console.error(`\nSTOP — ${reason}\n  step  ${key}`);
    for (const x of d ?? []) console.error(`  ${x.field}: want ${x.want}, got ${x.got}`);
    console.error('\nNothing further was submitted. The record is unchanged for this step.');
    return 1;
  };

  for (const step of STEPS) {
    n += 1;
    const missing = step.needs.filter((k) => !record.has(k));
    if (missing.length && !flags.dryRun) return stop(step.key, `prerequisite not in the record: ${missing.join(', ')}`);

    const want = step.want(ctx);
    const detail = step.detail(want);
    const existing = record.get(step.key);

    if (existing) {
      const d = await step.confirm(ctx, existing.id, want);
      if (d === 'absent') return stop(step.key, 'RECORDED-BUT-ABSENT — the mirror node does not hold an entity this record says was confirmed from it. Confirm MIRROR_NODE_URL and HEDERA_NETWORK; if the entity is genuinely gone, delete this entry from the record to authorise a re-creation.');
      if (d.length) return stop(step.key, 'DIVERGED — what exists is not what is declared', d);
      rows.push({ n, key: step.key, id: existing.id, outcome: 'existing', detail });
      continue;
    }

    if (flags.dryRun) {
      rows.push({ n, key: step.key, id: null, outcome: 'planned', detail });
      continue;
    }

    const r = await step.create(ctx, want);
    if (!r.ok) return stop(step.key, `create failed with ${r.status}`);
    const d = await step.confirm(ctx, r.entityId ?? null, want);
    if (d === 'absent' || d.length) {
      return stop(step.key, 'CREATED-WRONG — the entity exists on the ledger and is not what was declared. The record is deliberately NOT written: recording it would launder a wrong entity into the ledger. Delete it under its admin key and re-run, or amend the declared policy.', d === 'absent' ? [] : d);
    }

    const entry: EntityRecord = {
      kind: step.kind, role: step.role, id: r.entityId ?? null,
      builtBy: step.builtBy, signedBy: r.signedBy, payer: env.operatorId,
      transactionId: r.transactionId,
      consensusTimestamp: await consensusTimestampOf(mirror, r.transactionId),
      confirmedFrom: `GET ${mirrorPathFor(step.key, r.entityId ?? null, ctx)}`,
      confirmedAt: new Date().toISOString(),
      policy: want as Record<string, unknown>,
    };
    record.put(step.key, entry);
    rows.push({ n, key: step.key, id: r.entityId ?? null, outcome: 'created', detail });
    created += 1;
  }

  // D-144: spec/pins.json takes stampToken["hedera:testnet"] and nothing else.
  let pinNote = 'not written (dry run)';
  if (!flags.dryRun && record.has('postage.token')) {
    const out = pinStampToken(env.repoRoot, { tokenId: idOf('postage.token'), treasury: idOf('treasury.account') }, flags.repin);
    if (out.kind === 'conflict') {
      console.error(`\nSTOP — spec/pins.json already pins ${out.pinned.tokenId} / ${out.pinned.treasury}, and the record says ${out.found.tokenId} / ${out.found.treasury}.`);
      console.error('Re-creating the token is a decision that also requires re-pinning. Re-run with --repin to authorise it.');
      return 1;
    }
    pinNote = `${out.kind}, ${out.remainingNulls} pins still unfilled`;
  } else {
    pinNote = `${unfilledPins(env.repoRoot)} pins unfilled`;
  }

  report(env.operatorId, env.mirrorNodeUrl, record.path, rows, created, pinNote, preflight);

  if (flags.dryRun && !flags.json) priceListGate(ctx);
  client.close();
  return 0;
}

/** D-144 asks for each entity's creation transaction id AND its consensus timestamp. */
async function consensusTimestampOf(mirror: Mirror, transactionId: string): Promise<string> {
  const p = await mirror.poll<{ transactions?: { consensus_timestamp: string }[] }>(
    `/transactions/${toMirrorTxId(transactionId)}`,
    (t) => Boolean(t.transactions?.[0]?.consensus_timestamp),
  );
  return p?.transactions?.[0]?.consensus_timestamp ?? '';
}

/**
 * The first PriceList must be proven to validate before anything is signed, and
 * proven in both directions: a constraint that accepts everything proves
 * nothing. D-145 dropped validFrom, so the schema must now REJECT it.
 */
function priceListGate(ctx: Ctx): void {
  // The plan runs before the token and treasury exist, so their ids are
  // placeholders. They are schema-shaped rather than the table's "0.0.PENDING",
  // because the point here is to prove the MESSAGE's shape; the real run
  // validates the real message, with the real ids, before it signs anything.
  const real = buildPriceList(ctx);
  const msg = JSON.parse(
    JSON.stringify(real).split('0.0.PENDING').join('0.0.999999999'),
  ) as Record<string, unknown>;
  const bytes = canonicalBytes(msg);
  const pos = validatePriceList(ctx.env.repoRoot, msg);
  const neg = validatePriceList(ctx.env.repoRoot, { ...msg, validFrom: '1757280000.000000000' });
  console.log('\n  the first PriceList, against spec/schemas/price-list.schema.json:');
  console.log('    (token and treasury ids are placeholders until they exist; the real run validates the real message before signing)');
  console.log(`    POSITIVE  ${pos.length === 0 ? 'valid' : 'INVALID: ' + pos.join('; ')}`);
  console.log(`    NEGATIVE  with validFrom: ${neg.length ? 'rejected — ' + neg.join('; ') : 'ACCEPTED, which is wrong (D-145)'}`);
  console.log(`    canonical ${bytes.length} bytes (RFC 8785), sha256 ${sha256hex(bytes)}`);
  console.log(`    fits one HCS message: ${bytes.length <= 1000 ? 'yes' : 'NO — exceeds CHUNK_WIRE_MAX 1000'}`);
}

function mirrorPathFor(k: EntityKey, id: string | null, ctx: Ctx): string {
  if (k.endsWith('.account')) return `/accounts/${id}`;
  if (k === 'postage.token' || k === 'postage.mint') return `/tokens/${ctx.tokenId()}`;
  if (k.endsWith('.association')) return `/accounts/{account}/tokens?token.id=${ctx.tokenId()}`;
  if (k === 'prices.first') return `/topics/{priceTopic}/messages?limit=1&order=asc`;
  return `/topics/${id}`;
}

function report(op: string, mirrorUrl: string, recordPath: string, rows: readonly Row[], created: number, pinNote: string, preflightNote: string): void {
  if (flags.json) {
    console.log(JSON.stringify({ rows, summary: { created, pins: pinNote } }, null, 2));
    return;
  }
  console.log(`\nWISHMail provisioning — hedera:testnet${flags.dryRun ? '  [DRY RUN — nothing is signed]' : ''}`);
  console.log(`  operator  ${op}`);
  console.log(`  mirror    ${mirrorUrl}`);
  console.log(`  record    ${recordPath}`);
  console.log(`  spec      v0.5.2 · every transaction @hashgraph/sdk, every read mirror-node REST`);
  console.log(`  pre-flight ${preflightNote}\n`);
  console.log('  #   ENTITY                 ID              STATUS    DETAIL');
  for (const r of rows) {
    console.log(
      `  ${String(r.n).padStart(2)}  ${r.key.padEnd(22)} ${(r.id ?? '—').padEnd(15)} ${r.outcome.padEnd(9)} ${r.detail}`,
    );
  }
  const counts = rows.reduce<Record<Outcome, number>>((a, r) => ({ ...a, [r.outcome]: (a[r.outcome] ?? 0) + 1 }), {} as Record<Outcome, number>);
  console.log(`\n  ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  console.log(`  spec/pins.json  ${pinNote}`);
}

main()
  .then((code) => { process.exitCode = code; })
  .catch((e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('\nPROVISIONING STOPPED\n' + msg.replace(/302e[0-9a-f]{20,}/gi, '<redacted key material>'));
    process.exitCode = 1;
  });
