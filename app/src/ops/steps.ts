/**
 * The eleven provisioning steps, in the forced order.
 *
 * Every constant here traces to a decision: the token's parameters to
 * D-141/D-148/D-149, the topics' key policy to D-138 as completed by D-147, the
 * price topic's keys to D-142, the price list to D-143 as D-145 leaves it, the
 * account roles to D-140, and where each fact is recorded to D-144.
 *
 * The probe's findings are carried here as code, not as notes:
 *   - a fee-gated topic create needs a fee cap far above the default (20 ℏ
 *     returned INSUFFICIENT_TX_FEE);
 *   - a retry with the collector's signature is gated on INVALID_SIGNATURE
 *     alone, because inferring from any other status would put a false FETCHED
 *     into the record;
 *   - mirror numerics are compared as BigInt, never as Number;
 *   - every readback names the predicate it is waiting for.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  AccountCreateTransaction,
  AccountUpdateTransaction,
  CustomFixedFee,
  Hbar,
  TokenAssociateTransaction,
  TokenCreateTransaction,
  TokenMintTransaction,
  TokenSupplyType,
  TokenType,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
  type Key,
} from '@hashgraph/sdk';
import { schemas } from '../schema/loader.js';
import { canonicalBytes, sha256hex } from '../core/canonical.js';
import { publicHex, type Signer } from './identity.js';
import { submit } from './hedera.js';
import { named, Checks, type BackstopResult, type Ctx, type Discrepancy, type Step } from './step.js';
import { fromMirrorTxId } from './mirror.js';
import * as template from './template.js';
import { HCS10_TTL, PRICE_TOPIC_MEMO, MANIFEST_MEMO } from './template.js';
import { readHcs1 } from './hcs1.js';
import type { EntityKey } from './record.js';
import { pinRegisteredSchema } from './pins.js';
import {
  SCHEMA_REGISTER_TX_MEMO,
  schemaRefFor,
  schemaRegisterOperation,
  schemaRegistryMemo,
  schemaSources,
  type SchemaSource,
} from './schemas13.js';
import {
  HCS2_REGISTER_TX_MEMO,
  accountMemoFor,
  profileBytes,
  readProfile,
  registerOperation,
  registryMemo,
  type ProfileBytes,
} from './declaration.js';
import type { Submitted } from './hedera.js';

/** A step with its Want existentially hidden, so the ordered array is one type. */
export interface AnyStep {
  readonly key: Step<unknown>['key'];
  readonly kind: Step<unknown>['kind'];
  readonly role: string;
  readonly builtBy: string;
  readonly needs: Step<unknown>['needs'];
  want(ctx: Ctx): unknown;
  confirm(ctx: Ctx, id: string | null, want: unknown): Promise<Discrepancy[] | 'absent'>;
  create(ctx: Ctx, want: unknown): Promise<Submitted & { readonly signedBy: readonly string[] }>;
  detail(want: unknown): string;
  backstop?(ctx: Ctx, want: unknown): Promise<BackstopResult>;
}

/** The one cast in the file, in one place, rather than eleven at the call sites. */
const anon = <W>(st: Step<W>): AnyStep => st as unknown as AnyStep;

// SHA-256 and RFC 8785 now live in `src/core/canonical.ts`, because §7.2's AAD
// needs the same bytes and the same digest and one canonicalization is the
// point (§5.1). Re-exported here so every existing caller is unmoved.
export { canonicalBytes, sha256hex };

/* --- shapes the mirror node returns ------------------------------------- */

interface MAccount { account: string; deleted: boolean; memo?: string; key: { _type: string; key: string } | null; balance: { balance: number } }
interface MToken {
  token_id: string; decimals: unknown; initial_supply: unknown; total_supply: unknown;
  supply_type: string; treasury_account_id: string; type: string;
  supply_key: { key: string } | null; admin_key: unknown; freeze_key: unknown;
  wipe_key: unknown; pause_key: unknown; kyc_key: unknown; fee_schedule_key: unknown;
}
interface MTokens { tokens?: { token_id: string; balance: number }[] }
interface MFixedFee { amount: number; collector_account_id: string; denominating_token_id: string | null }
interface MTopic {
  topic_id: string; memo: string; deleted: boolean;
  admin_key: { key: string } | null; submit_key: { key: string } | null; fee_schedule_key: unknown;
  auto_renew_account: string | null;
  custom_fees?: { fixed_fees?: MFixedFee[] };
  fee_exempt_key_list?: { key: string }[];
}
interface MMessages { messages?: { sequence_number: number; consensus_timestamp: string; message: string; payer_account_id: string }[] }

/* --- constants fixed by decisions --------------------------------------- */

// D-147's six rows and their memos live in ops/template.ts, which is the ONE
// spelling of the provisioning template: this module provisions the Postmaster's
// own agent with them and sdk/mailbox.ts provisions a Correspondent with the same
// objects. Re-exported so existing importers are undisturbed.
export { HCS10_TTL, PRICE_TOPIC_MEMO, MANIFEST_MEMO } from './template.js';
export const FLOAT = 10_000n;                      // D-149
// Fee caps live in app/src/ops/networks.ts with their citation, keyed by
// HEDERA_NETWORK, because they are facts about a network and not about us.

/* --- accounts (D-140) ---------------------------------------------------- */

interface AccountWant { readonly publicKey: string; readonly initialBalanceHbar: number; readonly warrant: string }

const accountStep = (
  key: 'treasury.account' | 'agent.account',
  role: string,
  signer: (c: Ctx) => Signer,
  hbar: number,
  warrant: string,
): Step<AccountWant> => ({
  key, kind: 'account', role, builtBy: 'AccountCreateTransaction', needs: [],
  want: (ctx) => ({ publicKey: publicHex(signer(ctx)), initialBalanceHbar: hbar, warrant }),
  detail: (w) => `ED25519 ${w.publicKey.slice(0, 12)}… · ${w.initialBalanceHbar} ℏ`,
  async confirm(ctx, id, want) {
    if (!id) return 'absent';
    const p = named<MAccount>('account exists and is not deleted', (a) => a.account === id && !a.deleted);
    const a = await ctx.mirror.poll<MAccount>(`/accounts/${id}`, p.test);
    if (!a || !p.test(a)) return 'absent';
    const c = new Checks();
    c.eq('account', a.account, id);
    c.eq('deleted', a.deleted, false);
    c.keyIs('key', a.key, want.publicKey);
    return c.result;
  },
  async create(ctx, want) {
    const r = await submit(ctx.client, ctx.env.postmasterPayerId, new AccountCreateTransaction()
      .setKeyWithoutAlias(signer(ctx).publicKey)
      .setInitialBalance(new Hbar(want.initialBalanceHbar)));
    return { ...r, signedBy: ['postmaster payer'] };
  },
});

/* --- $POSTAGE (D-141 posture, D-148 supply key, D-149 born at zero) ------ */

interface TokenWant {
  readonly name: string; readonly symbol: string; readonly decimals: number;
  readonly initialSupply: number; readonly supplyType: 'INFINITE';
  readonly treasury: string; readonly supplyKey: string;
  readonly absentKeys: readonly string[]; readonly warrant: string;
}

const tokenStep: Step<TokenWant> = {
  key: 'postage.token', kind: 'token', role: '$POSTAGE', builtBy: 'TokenCreateTransaction',
  needs: ['treasury.account'],
  want: (ctx) => ({
    name: 'WISHMail Postage', symbol: 'POSTAGE', decimals: 0, initialSupply: 0, supplyType: 'INFINITE',
    treasury: ctx.treasuryId(), supplyKey: publicHex(ctx.treasury),
    absentKeys: ['admin_key', 'freeze_key', 'wipe_key', 'pause_key', 'kyc_key', 'fee_schedule_key'],
    warrant: 'D-141 (decimals 0, INFINITE, six absent keys) · D-148 (supply key the treasury’s) · D-149 (born at zero)',
  }),
  detail: (w) => `POSTAGE · dec ${w.decimals} · ${w.supplyType} · born at ${w.initialSupply} · treasury ${w.treasury} · supply key only`,
  async confirm(ctx, id, want) {
    if (!id) return 'absent';
    const p = named<MToken>('token exists', (t) => t.token_id === id);
    const t = await ctx.mirror.poll<MToken>(`/tokens/${id}`, p.test);
    if (!t || !p.test(t)) return 'absent';
    const c = new Checks();
    c.eq('type', t.type, 'FUNGIBLE_COMMON');
    c.num('decimals', t.decimals, 0);
    c.num('initial_supply', t.initial_supply, 0);
    c.eq('supply_type', t.supply_type, 'INFINITE');
    c.eq('treasury_account_id', t.treasury_account_id, want.treasury);
    c.keyIs('supply_key', t.supply_key, want.supplyKey);
    c.isNull('admin_key', t.admin_key); c.isNull('freeze_key', t.freeze_key);
    c.isNull('wipe_key', t.wipe_key); c.isNull('pause_key', t.pause_key);
    c.isNull('kyc_key', t.kyc_key); c.isNull('fee_schedule_key', t.fee_schedule_key);
    return c.result;
  },
  /**
   * ABSENT-BUT-ON-LEDGER, resolver of last resort for the token.
   *
   * A token has no memo we control and no queryable creator, but it does name
   * its treasury — and our treasury is an account this run created moments
   * earlier and that holds nothing else. So "the token whose treasury_account_id
   * is ours" is exact. It must be EXACTLY ONE: two would mean a duplicate
   * already exists, and choosing between them would strand one forever, because
   * D-141's posture gives the token no admin key and TokenDelete requires one.
   */
  async backstop(ctx): Promise<BackstopResult> {
    const treasury = ctx.treasuryId();
    const held = await ctx.mirror.get<MTokens>(`/accounts/${treasury}/tokens`);
    const candidates: string[] = [];
    for (const t of held?.tokens ?? []) {
      const tok = await ctx.mirror.get<MToken>(`/tokens/${t.token_id}`);
      if (tok?.treasury_account_id === treasury) candidates.push(t.token_id);
    }
    if (candidates.length === 0) return { kind: 'none' };
    if (candidates.length > 1) return { kind: 'ambiguous', found: candidates };

    const id = candidates[0]!;
    const tok = await ctx.mirror.get<MToken & { created_timestamp?: string }>(`/tokens/${id}`);
    const createdAt = tok?.created_timestamp;
    if (!createdAt) return { kind: 'ambiguous', found: candidates };
    const tx = await ctx.mirror.get<{ transactions?: { transaction_id: string; consensus_timestamp: string; result: string }[] }>(
      `/transactions?timestamp=${createdAt}`,
    );
    const first = tx?.transactions?.[0];
    if (!first || first.result !== 'SUCCESS') return { kind: 'ambiguous', found: candidates };
    return {
      kind: 'found',
      entityId: id,
      transactionId: fromMirrorTxId(first.transaction_id),
      consensusTimestamp: first.consensus_timestamp,
    };
  },
  async create(ctx, want) {
    const r = await submit(ctx.client, ctx.env.postmasterPayerId, new TokenCreateTransaction()
      .setTokenName(want.name).setTokenSymbol(want.symbol)
      .setTokenType(TokenType.FungibleCommon)
      .setDecimals(want.decimals).setInitialSupply(want.initialSupply)
      .setSupplyType(TokenSupplyType.Infinite)
      .setTreasuryAccountId(want.treasury)
      .setSupplyKey(ctx.treasury.publicKey)
      .setMaxTransactionFee(new Hbar(ctx.env.constants.feeCaps.tokenCreate)), [ctx.treasury]);
    return { ...r, signedBy: ['postmaster payer', 'treasury'] };
  },
};

/* --- the mint, as an act (D-149) ---------------------------------------- */

interface MintWant { readonly amount: string; readonly to: string; readonly signedByKey: string; readonly warrant: string }

const mintStep: Step<MintWant> = {
  key: 'postage.mint', kind: 'mint', role: '$POSTAGE float', builtBy: 'TokenMintTransaction',
  needs: ['postage.token'],
  want: (ctx) => ({
    amount: FLOAT.toString(), to: ctx.treasuryId(), signedByKey: 'treasury (supply key)',
    warrant: 'D-149: a mint is an act with a transaction id a Verifier can replay, not a birth parameter',
  }),
  detail: (w) => `${w.amount} minted to the treasury, signed by the supply key`,
  async confirm(ctx, _id, want) {
    const p = named<MToken>(`total_supply reaches ${want.amount}`, (t) => t.total_supply !== undefined && String(t.total_supply) === want.amount);
    const t = await ctx.mirror.poll<MToken>(`/tokens/${ctx.tokenId()}`, p.test);
    if (!t) return 'absent';
    const c = new Checks();
    c.num('total_supply', t.total_supply, FLOAT);
    return c.result;
  },
  async create(ctx, want) {
    const r = await submit(ctx.client, ctx.env.postmasterPayerId,
      new TokenMintTransaction().setTokenId(ctx.tokenId()).setAmount(Number(want.amount)), [ctx.treasury]);
    return { ...r, signedBy: ['postmaster payer', 'treasury'] };
  },
};

/* --- associations (§4.4: the postmasterPayer is the momentary bearer) ----------- */

interface AssocWant { readonly account: string; readonly token: string; readonly warrant: string }

const assocStep = (
  key: 'postmasterPayer.association' | 'agent.association',
  role: string,
  account: (c: Ctx) => string,
  signers: (c: Ctx) => readonly Signer[],
  warrant: string,
): Step<AssocWant> => ({
  key, kind: 'association', role, builtBy: 'TokenAssociateTransaction', needs: ['postage.token'],
  want: (ctx) => ({ account: account(ctx), token: ctx.tokenId(), warrant }),
  detail: (w) => `${w.account} associated with ${w.token}`,
  async confirm(ctx, _id, want) {
    const p = named<MTokens>('the association appears', (r) => (r.tokens ?? []).some((t) => t.token_id === want.token));
    const r = await ctx.mirror.poll<MTokens>(`/accounts/${want.account}/tokens?token.id=${want.token}`, p.test);
    if (!r || !p.test(r)) return 'absent';
    return [];
  },
  async create(ctx, want) {
    const extra = signers(ctx);
    const r = await submit(ctx.client, ctx.env.postmasterPayerId,
      new TokenAssociateTransaction().setAccountId(want.account).setTokenIds([want.token]), extra);
    return { ...r, signedBy: ['postmaster payer', ...extra.map((s) => s.label)] };
  },
});

/**
 * The template subject, from the provisioning context. D-147's six rows are
 * built from `ops/template.ts` and never restated here.
 */
function subject(ctx: Ctx): template.TemplateSubject {
  return {
    account: ctx.agentId(),
    publicKey: publicHex(ctx.agent),
    treasury: ctx.treasuryId(),
    stampToken: ctx.tokenId(),
    autoRenewAccount: ctx.env.postmasterPayerId,
  };
}

/* --- topics -------------------------------------------------------------- */

// One type, from `ops/template.ts`: the shape a step declares is the shape
// the template describes, so a row cannot be created under one description
// and asserted under another.
type TopicWant = template.TopicShape;

const topicStep = (
  key: EntityKey,
  role: string,
  needs: readonly ('postage.token' | 'agent.account' | 'treasury.account')[],
  build: (ctx: Ctx) => TopicWant,
  keyOwner: (ctx: Ctx) => Signer,
): Step<TopicWant> => ({
  key, kind: 'topic', role, builtBy: 'TopicCreateTransaction', needs,
  want: build,
  detail: (w) =>
    `${w.memo} · submit ${w.submitKey ? w.submitKey.slice(0, 8) + '…' : 'NONE'} · admin ${w.adminKey ? w.adminKey.slice(0, 8) + '…' : 'NONE'}` +
    (w.fee ? ` · fee ${w.fee.amount} ${w.fee.token} → ${w.fee.collector}` : ' · no fee') +
    (w.feeExemptKeys.length ? ` · exempt ${w.feeExemptKeys.length}` : ''),
  async confirm(ctx, id, want) {
    if (!id) return 'absent';
    const p = named<MTopic>('topic exists and is not deleted', (t) => t.topic_id === id && !t.deleted);
    const t = await ctx.mirror.poll<MTopic>(`/topics/${id}`, p.test);
    if (!t || !p.test(t)) return 'absent';
    const c = new Checks();
    c.eq('memo', t.memo, want.memo);
    if (want.submitKey === null) c.isNull('submit_key', t.submit_key);
    else c.keyIs('submit_key', t.submit_key, want.submitKey);
    if (want.adminKey === null) c.isNull('admin_key', t.admin_key);
    else c.keyIs('admin_key', t.admin_key, want.adminKey);
    c.isNull('fee_schedule_key', t.fee_schedule_key);
    c.eq('auto_renew_account', t.auto_renew_account, want.autoRenewAccount);
    const fees = t.custom_fees?.fixed_fees ?? [];
    if (want.fee) {
      c.num('custom_fees.fixed_fees.length', fees.length, 1);
      const f = fees[0];
      c.num('fixed_fees[0].amount', f?.amount, want.fee.amount);
      c.eq('fixed_fees[0].collector_account_id', f?.collector_account_id, want.fee.collector);
      c.eq('fixed_fees[0].denominating_token_id', f?.denominating_token_id, want.fee.token);
    } else {
      c.num('custom_fees.fixed_fees.length', fees.length, 0);
    }
    const exempt = (t.fee_exempt_key_list ?? []).map((k) => k.key);
    c.eq('fee_exempt_key_list', JSON.stringify(exempt), JSON.stringify([...want.feeExemptKeys]));
    return c.result;
  },
  async create(ctx, want) {
    const owner = keyOwner(ctx);
    const build2 = (): TopicCreateTransaction => {
      const tx = new TopicCreateTransaction()
        .setTopicMemo(want.memo)
        .setAutoRenewAccountId(want.autoRenewAccount)
        .setMaxTransactionFee(new Hbar(
          want.fee ? ctx.env.constants.feeCaps.feeGatedTopicCreate : ctx.env.constants.feeCaps.plainTopicCreate,
        ));
      // HCS-1 marks a file topic that HAS an admin key invalid and ignores it
      // (hcs-1.md:48-49, D-150), so the absence is declared and asserted rather
      // than merely omitted.
      if (want.adminKey !== null) tx.setAdminKey(owner.publicKey);
      if (want.submitKey !== null) tx.setSubmitKey(owner.publicKey);
      if (want.fee) {
        tx.setCustomFees([new CustomFixedFee()
          .setAmount(want.fee.amount)
          .setDenominatingTokenId(want.fee.token)
          .setFeeCollectorAccountId(want.fee.collector)]);
      }
      if (want.feeExemptKeys.length) {
        tx.setFeeExemptKeys([owner.publicKey as Key]);
      }
      return tx;
    };
    // The admin key must sign its own topic's creation.
    let r = await submit(ctx.client, ctx.env.postmasterPayerId, build2(), [owner]);
    let signedBy = ['postmaster payer', owner.label];
    if (!r.ok && r.status === 'INVALID_SIGNATURE' && want.fee) {
      // ONLY this status answers "must the fee collector sign?" — the probe
      // observed that a treasury collector need not, so this branch should be
      // dead. Any other failure is a different question and is not retried.
      r = await submit(ctx.client, ctx.env.postmasterPayerId, build2(), [owner, ctx.treasury]);
      signedBy = ['postmaster payer', owner.label, 'treasury'];
    }
    return { ...r, signedBy };
  },
});

/* --- the first PriceList (D-143 as D-145 leaves it) ---------------------- */

/**
 * The first PriceList is a COMMITTED FILE the script submits, not a literal in
 * code (Sonic, 2026-09-08). What the Postmaster charges should be reviewable as
 * a document: §14.3 fixes that there is one schedule, that it is on consensus
 * before it is charged, and that it is the same for everyone (§4.5).
 *
 * Exactly three fields are filled here, because they cannot be known at commit
 * time: the token and treasury ids, from the ops record, and payTo, from
 * POSTMASTER_PAYER_ID. They are null in the file, and the schema's account-id pattern
 * means a fill that did not happen is caught by validation rather than published.
 *
 * Everything else is asserted to agree with app/src/ops/networks.ts, which is
 * the source of truth for per-network constants, so the file and the table
 * cannot drift apart unnoticed.
 */
export function priceListPath(ctx: Ctx, suffix = ''): string {
  return path.join(ctx.env.repoRoot, 'app', `price-list${suffix}.${ctx.env.constants.ledgerTag.replace(':', '-')}.json`);
}

interface PLMethod { method: string; asset: string; payTo: string | null; facilitator?: string; rate?: { source: string; pair: string } }

export function buildPriceList(ctx: Ctx, suffix = ''): Record<string, unknown> {
  const raw = JSON.parse(fs.readFileSync(priceListPath(ctx, suffix), 'utf8')) as Record<string, unknown>;
  delete raw['_readme'];

  const stampToken = raw['stampToken'] as { ledgerTag: string; tokenId: string | null; treasury: string | null };
  if (stampToken.ledgerTag !== ctx.env.constants.ledgerTag) {
    throw new Error(`price list is for ${stampToken.ledgerTag}, but HEDERA_NETWORK selects ${ctx.env.constants.ledgerTag}`);
  }
  stampToken.tokenId = ctx.tokenId();
  stampToken.treasury = ctx.treasuryId();

  const k = ctx.env.constants;
  for (const m of raw['methods'] as PLMethod[]) {
    m.payTo = ctx.env.postmasterPayerId;
    if (m.method === 'x402-usdc') {
      if (k.usdc && m.asset !== k.usdc.assetId) {
        throw new Error(`price list asset ${m.asset} disagrees with networks.ts USDC ${k.usdc.assetId}`);
      }
      if (k.facilitator && m.facilitator !== k.facilitator.url) {
        throw new Error(`price list facilitator ${m.facilitator} disagrees with networks.ts ${k.facilitator.url}`);
      }
    }
    if (m.rate && k.rateSource) {
      if (m.rate.source !== k.rateSource.url || m.rate.pair !== k.rateSource.pair) {
        throw new Error(`price list rate ${m.rate.source} ${m.rate.pair} disagrees with networks.ts`);
      }
      if (m.asset !== k.rateSource.hbarId) {
        throw new Error(`price list hbar asset ${m.asset} disagrees with networks.ts ${k.rateSource.hbarId}`);
      }
    }
  }
  return raw;
}

/**
 * D-143: the first `PriceList` is validated against its schema before it is
 * submitted, and byte-compared after. The validator is now the one registry of
 * `src/schema/loader.ts`, which holds all fourteen of §18.5 in one ajv instance
 * so that cross-file `$ref`s resolve. Behaviour is unchanged: the same draft
 * 2020-12 build, the same options, the same message form — which matters,
 * because D-145's negative half turns on `additionalProperties` rejecting a
 * message that carries `validFrom`.
 */
export function validatePriceList(repoRoot: string, msg: unknown): string[] {
  return schemas(repoRoot).validate('price-list', msg);
}

interface PriceWant { readonly topic: string; readonly bytes: string; readonly sha256: string; readonly warrant: string }

const priceListStep: Step<PriceWant> = {
  key: 'prices.first', kind: 'message', role: 'the first PriceList', builtBy: 'TopicMessageSubmitTransaction',
  needs: ['prices.topic', 'postage.token'],
  want: (ctx) => {
    const bytes = canonicalBytes(buildPriceList(ctx));
    return {
      topic: ctx.record.get('prices.topic')?.id ?? '',
      bytes: bytes.toString('base64'),
      sha256: sha256hex(bytes),
      warrant: 'D-143 as D-145 leaves it: no validFrom; §14.3 selects by consensus timestamp',
    };
  },
  detail: (w) => `sequence 1 on ${w.topic} · sha256 ${w.sha256.slice(0, 12)}…`,
  async confirm(ctx, _id, want) {
    const p = named<MMessages>('sequence 1 is on the price topic', (m) => (m.messages ?? []).some((x) => x.sequence_number === 1));
    const m = await ctx.mirror.poll<MMessages>(`/topics/${want.topic}/messages?limit=1&order=asc`, p.test);
    if (!m || !p.test(m)) return 'absent';
    const c = new Checks();
    const first = m.messages?.[0];
    c.num('sequence_number', first?.sequence_number, 1);
    c.eq('payer_account_id', first?.payer_account_id, ctx.env.postmasterPayerId);
    c.eq('message (base64, byte-for-byte)', first?.message, want.bytes);
    return c.result;
  },
  async create(ctx, want) {
    // Validated against the registered schema BEFORE it is signed. A price list
    // that does not validate is not published: §14.3's MUST is what a Verifier
    // reads back, and the schema is how this release says what that shape is.
    const errors = validatePriceList(ctx.env.repoRoot, JSON.parse(Buffer.from(want.bytes, 'base64').toString('utf8')));
    if (errors.length) {
      throw new Error('the first PriceList does not validate, and is not published: ' + errors.join('; '));
    }
    const r = await submit(ctx.client, ctx.env.postmasterPayerId, new TopicMessageSubmitTransaction()
      .setTopicId(want.topic)
      .setMessage(Buffer.from(want.bytes, 'base64')), [ctx.postmasterPayer]);
    return { ...r, signedBy: ['postmaster payer'] };
  },
};


/* --- Step 3: the hcs14 declaration (D-147 rows 3-5, D-150 row 6, D-153) --- */

/**
 * The profile, resolved from the record and the seal identity. Pure: `want` may
 * not touch the network, and everything this needs is already local.
 */
function profileFor(ctx: Ctx): ProfileBytes {
  return profileBytes(ctx.env.repoRoot, {
    ledgerTag: ctx.env.constants.ledgerTag,
    network: ctx.env.network,
    account: ctx.agentId(),
    doorbell: ctx.record.get('agent.doorbell')?.id ?? '0.0.PENDING',
    log: ctx.record.get('agent.log')?.id ?? '0.0.PENDING',
    wishmail: {
      manifestTopic: ctx.record.get('agent.manifest')?.id ?? '0.0.PENDING',
      x25519Pub: ctx.seal.x25519Pub,
      keyEpoch: ctx.seal.keyEpoch,
    },
  });
}

interface ChunkWant {
  readonly topic: string;
  readonly memoDigest: string;
  readonly chunks: readonly { readonly o: number; readonly c: string }[];
  readonly warrant: string;
}

/**
 * The HCS-1 file's chunks, and the readback that matters: the bytes on
 * consensus decompress to a profile whose SHA-256 equals the topic memo's
 * digest. That is the whole integrity claim of an HCS-1 file, and it is checked
 * here rather than assumed.
 */
const profileChunksStep: Step<ChunkWant> = {
  key: 'agent.profileChunks',
  kind: 'message',
  role: 'the HCS-11 profile, as an HCS-1 file',
  builtBy: 'TopicMessageSubmitTransaction',
  needs: ['agent.profileFile'],
  want: (ctx) => {
    const p = profileFor(ctx);
    return {
      topic: ctx.record.get('agent.profileFile')?.id ?? '0.0.PENDING',
      memoDigest: p.digest,
      chunks: p.chunks,
      warrant: 'hcs-1.md:92-95 — chunks {o, c}, o=0 carries the data prefix; reassembly is by o, not sequence',
    };
  },
  detail: (w) =>
    `${w.chunks.length} chunk${w.chunks.length === 1 ? '' : 's'} on ${w.topic} · sha256 ${w.memoDigest.slice(0, 12)}…`,
  async confirm(ctx, _id, want) {
    const p = named<MMessages>(
      'every chunk of the profile is on the file topic',
      (m) => (m.messages ?? []).length >= want.chunks.length,
    );
    const m = await ctx.mirror.poll<MMessages>(`/topics/${want.topic}/messages?limit=25&order=asc`, p.test);
    if (!m || !p.test(m)) return 'absent';
    const c = new Checks();
    const got = (m.messages ?? []).map((x) => JSON.parse(Buffer.from(x.message, 'base64').toString('utf8')) as { o: number; c: string });
    c.num('chunk count', got.length, want.chunks.length);
    // The file reassembles, decompresses, and hashes to the memo — read back
    // through the mirror exactly as §9.2's rule will read it.
    const topic = await ctx.mirror.poll<MTopic>(`/topics/${want.topic}`, (t) => t.topic_id === want.topic);
    const read = readProfile(topic?.memo ?? '', got);
    c.eq('the profile digest equals the topic memo digest', read.digest, read.memoDigest);
    c.eq('and equals what was submitted', read.digest, want.memoDigest);
    return c.result;
  },
  async create(ctx, want) {
    let last: Submitted | undefined;
    for (const chunk of want.chunks) {
      last = await submit(
        ctx.client,
        ctx.env.postmasterPayerId,
        new TopicMessageSubmitTransaction()
          .setTopicId(want.topic)
          .setMessage(Buffer.from(JSON.stringify(chunk), 'utf8')),
        [ctx.agent],
      );
      if (!last.ok) break;
    }
    if (last === undefined) throw new Error('the profile produced no chunks');
    return { ...last, signedBy: ['postmaster payer', 'agent'] };
  },
};

interface RegisterWant {
  readonly topic: string;
  readonly fileTopic: string;
  readonly bytes: string;
  readonly txMemo: string;
  readonly warrant: string;
}

/** The HCS-2 `register` entry: the registry's current entry names the file. */
const registryEntryStep: Step<RegisterWant> = {
  key: 'agent.registryEntry',
  kind: 'message',
  role: 'the HCS-2 register entry',
  builtBy: 'TopicMessageSubmitTransaction',
  needs: ['agent.declRegistry', 'agent.profileFile'],
  want: (ctx) => {
    const fileTopic = ctx.record.get('agent.profileFile')?.id ?? '0.0.PENDING';
    return {
      topic: ctx.record.get('agent.declRegistry')?.id ?? '0.0.PENDING',
      fileTopic,
      bytes: Buffer.from(JSON.stringify(registerOperation(fileTopic)), 'utf8').toString('base64'),
      txMemo: HCS2_REGISTER_TX_MEMO,
      warrant: 'D-70 · §9.2:1284 “register each profile version there” · §H:359 register is {p, op, t_id}',
    };
  },
  detail: (w) => `current entry on ${w.topic} → t_id ${w.fileTopic} · memo ${w.txMemo}`,
  async confirm(ctx, _id, want) {
    // The CURRENT entry, not the first. §9.2's rule reads "the registry's
    // current entry", and §9.2:1284 has rotation add "a new profile file
    // registered as a new entry" while "prior entries stay on the registry
    // topic" — so a registry that has ever been rotated has an older entry at
    // sequence 1, and asserting on that would call a correct registry wrong.
    const p = named<MMessages>('the current entry on the declaration registry names this profile file', (m) =>
      (m.messages ?? []).some((x) => x.message === want.bytes),
    );
    const m = await ctx.mirror.poll<MMessages>(`/topics/${want.topic}/messages?limit=1&order=desc`, p.test);
    if (!m || !p.test(m)) return 'absent';
    const c = new Checks();
    const current = m.messages?.[0];
    c.eq('payer_account_id', current?.payer_account_id, ctx.env.postmasterPayerId);
    c.eq('message (base64, byte-for-byte)', current?.message, want.bytes);
    const body = JSON.parse(Buffer.from(current?.message ?? '', 'base64').toString('utf8')) as Record<string, unknown>;
    c.eq('p', body['p'], 'hcs-2');
    c.eq('op', body['op'], 'register');
    c.eq('t_id names the profile file', body['t_id'], want.fileTopic);
    return c.result;
  },
  async create(ctx, want) {
    const r = await submit(
      ctx.client,
      ctx.env.postmasterPayerId,
      new TopicMessageSubmitTransaction()
        .setTopicId(want.topic)
        .setMessage(Buffer.from(want.bytes, 'base64'))
        .setTransactionMemo(want.txMemo),
      [ctx.agent],
    );
    return { ...r, signedBy: ['postmaster payer', 'agent'] };
  },
};

interface MemoWant {
  readonly account: string;
  readonly memo: string;
  readonly registry: string;
  readonly warrant: string;
}

/**
 * The account memo — §9.2's MUST, and the last act.
 *
 * It is last because it is the only reversible one: until it is set, the
 * registry and the file are inert, since §9.2's rule starts here. Signed by the
 * agent, because it is the agent's account (P-13: the Postmaster pays and does
 * not own).
 */
const accountMemoStep: Step<MemoWant> = {
  key: 'agent.accountMemo',
  kind: 'account-update',
  role: 'the account memo (§9.2’s first link)',
  builtBy: 'AccountUpdateTransaction',
  needs: ['agent.declRegistry'],
  want: (ctx) => {
    const registry = ctx.record.get('agent.declRegistry')?.id ?? '0.0.PENDING';
    return {
      account: ctx.agentId(),
      registry,
      memo: accountMemoFor(registry),
      warrant: '§9.2:1284 — an agent declaring under hcs14 MUST set its account memo to hcs-11:hcs://2/<registryTopic>',
    };
  },
  detail: (w) => `${w.account} memo → ${w.memo}`,
  async confirm(ctx, _id, want) {
    const p = named<MAccount>('the account memo names the declaration registry', (a) => a.memo === want.memo);
    const a = await ctx.mirror.poll<MAccount>(`/accounts/${want.account}`, p.test);
    if (!a) return 'absent';
    const c = new Checks();
    c.eq('memo', a.memo, want.memo);
    c.eq('deleted', a.deleted, false);
    return c.result;
  },
  async create(ctx, want) {
    const r = await submit(
      ctx.client,
      ctx.env.postmasterPayerId,
      new AccountUpdateTransaction().setAccountId(want.account).setAccountMemo(want.memo),
      [ctx.agent],
    );
    return { ...r, signedBy: ['postmaster payer', 'agent'] };
  },
};

/* --- Step 4: the HCS-13 schema registration (§5.11) — BUILT, NOT SIGNED --- */

interface SchemaFileWant {
  readonly name: string;
  readonly memo: string;
  readonly submitKey: string;
  readonly adminKey: null;
  readonly sha256: string;
  readonly blobSha: string;
  readonly warrant: string;
}

interface SchemaChunkWant {
  readonly name: string;
  readonly topic: string;
  readonly memoDigest: string;
  readonly chunks: readonly { readonly o: number; readonly c: string }[];
}

interface SchemaRegisterWant {
  readonly name: string;
  readonly topic: string;
  readonly fileTopic: string;
  readonly bytes: string;
  readonly txMemo: string;
  readonly sha256: string;
}

/**
 * The four steps one schema needs, generated for each of §18.5's fourteen.
 *
 * The order inside a schema is forced the same way the declaration's was: the
 * file topic's memo carries the digest of the bytes, so the bytes are final
 * first; the register names the file topic; and the `schemaRef` is only known
 * once the register has a sequence number, which is why the pin is written from
 * the readback rather than predicted.
 */
function schemaSteps(source: SchemaSource): readonly AnyStep[] {
  const n = source.name;

  const fileTopic: Step<SchemaFileWant> = {
    key: `schema.${n}.file`, kind: 'topic', role: `${n} schema file (HCS-1)`,
    builtBy: 'TopicCreateTransaction', needs: [],
    want: (ctx) => ({
      name: n,
      memo: source.file.memo,
      submitKey: publicHex(ctx.postmasterPayer),
      adminKey: null,
      sha256: source.sha256,
      blobSha: source.blobSha,
      warrant: 'hcs-13.md:136 step 1 · hcs-1.md:48-49 forbids an admin key on a file topic (D-150)',
    }),
    detail: (w) => `${w.memo.slice(0, 20)}… · blob ${w.blobSha.slice(0, 8)} · admin NONE`,
    async confirm(ctx, id, want) {
      if (!id) return 'absent';
      const p = named<MTopic>('the schema file topic exists and is not deleted', (t) => t.topic_id === id && !t.deleted);
      const t = await ctx.mirror.poll<MTopic>(`/topics/${id}`, p.test);
      if (!t || !p.test(t)) return 'absent';
      const c = new Checks();
      c.eq('memo', t.memo, want.memo);
      c.keyIs('submit_key', t.submit_key, want.submitKey);
      c.isNull('admin_key', t.admin_key);
      c.isNull('fee_schedule_key', t.fee_schedule_key);
      return c.result;
    },
    async create(ctx, want) {
      const r = await submit(ctx.client, ctx.env.postmasterPayerId, new TopicCreateTransaction()
        .setTopicMemo(want.memo)
        .setSubmitKey(ctx.postmasterPayer.publicKey)
        .setAutoRenewAccountId(ctx.env.postmasterPayerId)
        .setMaxTransactionFee(new Hbar(ctx.env.constants.feeCaps.plainTopicCreate)), [ctx.postmasterPayer]);
      return { ...r, signedBy: ['postmaster payer'] };
    },
  };

  const chunks: Step<SchemaChunkWant> = {
    key: `schema.${n}.chunks`, kind: 'message', role: `${n} schema, as an HCS-1 file`,
    builtBy: 'TopicMessageSubmitTransaction', needs: [`schema.${n}.file`],
    want: (ctx) => ({
      name: n,
      topic: ctx.record.get(`schema.${n}.file`)?.id ?? '0.0.PENDING',
      memoDigest: source.file.digest,
      chunks: source.file.chunks,
    }),
    detail: (w) => `${w.chunks.length} chunk${w.chunks.length === 1 ? '' : 's'} on ${w.topic} · sha256 ${w.memoDigest.slice(0, 12)}…`,
    async confirm(ctx, _id, want) {
      const p = named<MMessages>('every chunk of the schema is on its file topic',
        (m) => (m.messages ?? []).length >= want.chunks.length);
      const m = await ctx.mirror.poll<MMessages>(`/topics/${want.topic}/messages?limit=25&order=asc`, p.test);
      if (!m || !p.test(m)) return 'absent';
      const c = new Checks();
      const got = (m.messages ?? []).map((x) => JSON.parse(Buffer.from(x.message, 'base64').toString('utf8')) as { o: number; c: string });
      c.num('chunk count', got.length, want.chunks.length);
      const topic = await ctx.mirror.poll<MTopic>(`/topics/${want.topic}`, (t) => t.topic_id === want.topic);
      const read = readHcs1(topic?.memo ?? '', got);
      c.eq('the file digest equals its topic memo digest', read.digest, read.memoDigest);
      c.eq('and equals the committed schema', read.digest, want.memoDigest);
      return c.result;
    },
    async create(ctx, want) {
      let last: Submitted | undefined;
      for (const chunk of want.chunks) {
        last = await submit(ctx.client, ctx.env.postmasterPayerId, new TopicMessageSubmitTransaction()
          .setTopicId(want.topic)
          .setMessage(Buffer.from(JSON.stringify(chunk), 'utf8')), [ctx.postmasterPayer]);
        if (!last.ok) break;
      }
      if (last === undefined) throw new Error(`${want.name} produced no chunks`);
      return { ...last, signedBy: ['postmaster payer'] };
    },
  };

  // The registry is an ordinary HCS-2 topic under the postmasterPayer's keys, so it
  // reuses topicStep rather than restating its readback: the same nine field
  // assertions run on it as on every other topic this build creates.
  const registry = topicStep(`schema.${n}.registry`, `${n} schema registry (HCS-2)`, [], (ctx) => ({
    memo: schemaRegistryMemo(HCS10_TTL),
    submitKey: publicHex(ctx.postmasterPayer), adminKey: publicHex(ctx.postmasterPayer), feeScheduleKey: null,
    fee: null, feeExemptKeys: [], autoRenewAccount: ctx.env.postmasterPayerId,
    warrant: 'hcs-13.md:138 step 2 — an HCS-2 topic to manage versions OF THE SCHEMA; indexed 0 so every schemaRef stays resolvable at its sequence number',
  }), (c) => c.postmasterPayer);

  const register: Step<SchemaRegisterWant> = {
    key: `schema.${n}.register`, kind: 'message', role: `${n} schema registration`,
    builtBy: 'TopicMessageSubmitTransaction',
    needs: [`schema.${n}.registry`, `schema.${n}.file`],
    want: (ctx) => {
      const ft = ctx.record.get(`schema.${n}.file`)?.id ?? '0.0.PENDING';
      return {
        name: n,
        topic: ctx.record.get(`schema.${n}.registry`)?.id ?? '0.0.PENDING',
        fileTopic: ft,
        bytes: Buffer.from(JSON.stringify(schemaRegisterOperation(ft, n as never)), 'utf8').toString('base64'),
        txMemo: SCHEMA_REGISTER_TX_MEMO,
        sha256: source.sha256,
      };
    },
    detail: (w) => `register on ${w.topic} → t_id ${w.fileTopic} · schemaRef hcs://13/${w.topic}#<seq>`,
    async confirm(ctx, _id, want) {
      const p = named<MMessages>('the current entry on the schema registry names this file',
        (m) => (m.messages ?? []).some((x) => x.message === want.bytes));
      const m = await ctx.mirror.poll<MMessages>(`/topics/${want.topic}/messages?limit=1&order=desc`, p.test);
      if (!m || !p.test(m)) return 'absent';
      const c = new Checks();
      const current = m.messages?.[0];
      c.eq('message (base64, byte-for-byte)', current?.message, want.bytes);
      // §5.11's schemaRef is only knowable HERE: the sequence number the network
      // assigned. It is read back and pinned, never predicted.
      const seq = current?.sequence_number;
      if (typeof seq === 'number') {
        const outcome = pinRegisteredSchema(ctx.env.repoRoot, want.name, {
          schemaRef: schemaRefFor(want.topic, seq),
          sha256: want.sha256,
        });
        if (outcome.kind === 'conflict') {
          c.eq(`spec/pins.json registeredSchemas.${want.name}`, outcome.found, 'an unfilled entry');
        }
      }
      return c.result;
    },
    async create(ctx, want) {
      const r = await submit(ctx.client, ctx.env.postmasterPayerId, new TopicMessageSubmitTransaction()
        .setTopicId(want.topic)
        .setMessage(Buffer.from(want.bytes, 'base64'))
        .setTransactionMemo(want.txMemo), [ctx.postmasterPayer]);
      return { ...r, signedBy: ['postmaster payer'] };
    },
  };

  return [anon(fileTopic), anon(chunks), anon(registry), anon(register)];
}

/**
 * Step 4's ordered set — DELIBERATELY NOT IN `STEPS`.
 *
 * §1.7: "once a minor version's schemas are registered it changes no schema".
 * Registering is the freeze, and this build is not ready to be frozen: the six
 * tool bodies return `NOT_IMPLEMENTED` and no fixture has exercised a schema
 * against a real object. So `npm run provision` cannot reach these steps at all;
 * they run only under an explicit `--schemas`, and the gate report says what
 * must be true before that is a real run rather than a plan.
 */
export function schemaStepsAll(repoRoot: string): readonly AnyStep[] {
  return schemaSources(repoRoot).flatMap((s) => schemaSteps(s));
}

/* --- the ordered set ----------------------------------------------------- */

export const STEPS: readonly AnyStep[] = [
  anon(accountStep('treasury.account', 'treasury', (c) => c.treasury, 20,
    'D-140: holds the unissued $POSTAGE supply; its key is hot because §14.2’s purchase is atomic')),
  anon(accountStep('agent.account', 'postmaster-agent', (c) => c.agent, 20,
    'D-140: the service’s own Correspondent identity; an operational choice, not a spec role')),
  anon(tokenStep),
  anon(mintStep),
  anon(assocStep('postmasterPayer.association', 'postmasterPayer ↔ $POSTAGE', (c) => c.env.postmasterPayerId, () => [],
    '§4.4: the sender transfers a stamp to the Postmaster, which then pays the doorbell fee (D-140)')),
  anon(assocStep('agent.association', 'postmaster-agent ↔ $POSTAGE', (c) => c.agentId(), (c) => [c.agent],
    'the agent buys and affixes postage like any Correspondent')),
  anon(topicStep('prices.topic', 'price topic', [], (ctx) => ({
    memo: PRICE_TOPIC_MEMO,
    submitKey: publicHex(ctx.postmasterPayer), adminKey: publicHex(ctx.postmasterPayer), feeScheduleKey: null,
    fee: null, feeExemptKeys: [], autoRenewAccount: ctx.env.postmasterPayerId,
    warrant: 'D-142: the price list is the service speaking, so its keys are the postmasterPayer’s; §4.6 and T-P17-1 do not reach it (D-146)',
  }), (c) => c.postmasterPayer)),
  anon(priceListStep),
  anon(topicStep('agent.doorbell', 'doorbell (HCS-10 inbound)', ['postage.token', 'agent.account'],
    (ctx) => template.doorbell(subject(ctx)), (c) => c.agent)),
  anon(topicStep('agent.log', 'log (HCS-10 outbound)', ['agent.account'],
    (ctx) => template.log(subject(ctx)), (c) => c.agent)),
  anon(topicStep('agent.manifest', 'manifest', ['agent.account'],
    (ctx) => template.manifest(subject(ctx)), (c) => c.agent)),
  // Step 3 — the hcs14 declaration. The order is forced: the file topic's memo
  // carries the SHA-256 of the profile plaintext, the registry entry names the
  // file topic, and the account memo names the registry topic.
  anon(topicStep('agent.profileFile', 'HCS-11 profile file (HCS-1)', ['agent.account'],
    (ctx) => template.profileFile(subject(ctx), profileFor(ctx).memo), (c) => c.agent)),
  anon(profileChunksStep),
  anon(topicStep('agent.declRegistry', 'declaration registry (HCS-2)', ['agent.account'],
    (ctx) => template.declRegistry(subject(ctx), registryMemo(HCS10_TTL)), (c) => c.agent)),
  anon(registryEntryStep),
  anon(accountMemoStep),
];

export type { Discrepancy };
