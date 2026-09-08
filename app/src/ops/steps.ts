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
import canonicalize from 'canonicalize';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormatsImport from 'ajv-formats';

// ajv-formats is CommonJS; under NodeNext without esModuleInterop the default
// import is the namespace, so unwrap it once here rather than at the call site.
const addFormats = ((addFormatsImport as unknown as { default?: (a: unknown) => void }).default
  ?? (addFormatsImport as unknown as (a: unknown) => void));
import { publicHex, type Signer } from './identity.js';
import { submit } from './hedera.js';
import { named, Checks, type Ctx, type Discrepancy, type Step } from './step.js';
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
}

/** The one cast in the file, in one place, rather than eleven at the call sites. */
const anon = <W>(st: Step<W>): AnyStep => st as unknown as AnyStep;

export function sha256hex(b: Buffer): string {
  return createHash('sha256').update(b).digest('hex');
}

/* --- shapes the mirror node returns ------------------------------------- */

interface MAccount { account: string; deleted: boolean; key: { _type: string; key: string } | null; balance: { balance: number } }
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

export const HCS10_TTL = 60;                       // D-138: a deployment fact
export const PRICE_TOPIC_MEMO = 'wishmail:prices:1';   // §14.3
export const MANIFEST_MEMO = 'wishmail:manifest:1';    // §9.1
export const FLOAT = 10_000n;                      // D-149
export const FEE_GATED_CAP = new Hbar(100);        // probe 2026-09-08

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
    const r = await submit(ctx.client, ctx.env.operatorId, new AccountCreateTransaction()
      .setKeyWithoutAlias(signer(ctx).publicKey)
      .setInitialBalance(new Hbar(want.initialBalanceHbar)));
    return { ...r, signedBy: ['operator'] };
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
  async create(ctx, want) {
    const r = await submit(ctx.client, ctx.env.operatorId, new TokenCreateTransaction()
      .setTokenName(want.name).setTokenSymbol(want.symbol)
      .setTokenType(TokenType.FungibleCommon)
      .setDecimals(want.decimals).setInitialSupply(want.initialSupply)
      .setSupplyType(TokenSupplyType.Infinite)
      .setTreasuryAccountId(want.treasury)
      .setSupplyKey(ctx.treasury.publicKey)
      .setMaxTransactionFee(new Hbar(40)), [ctx.treasury]);
    return { ...r, signedBy: ['operator', 'treasury'] };
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
    const r = await submit(ctx.client, ctx.env.operatorId,
      new TokenMintTransaction().setTokenId(ctx.tokenId()).setAmount(Number(want.amount)), [ctx.treasury]);
    return { ...r, signedBy: ['operator', 'treasury'] };
  },
};

/* --- associations (§4.4: the operator is the momentary bearer) ----------- */

interface AssocWant { readonly account: string; readonly token: string; readonly warrant: string }

const assocStep = (
  key: 'operator.association' | 'agent.association',
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
    const r = await submit(ctx.client, ctx.env.operatorId,
      new TokenAssociateTransaction().setAccountId(want.account).setTokenIds([want.token]), extra);
    return { ...r, signedBy: ['operator', ...extra.map((s) => s.label)] };
  },
});

/* --- topics -------------------------------------------------------------- */

interface TopicWant {
  readonly memo: string;
  readonly submitKey: string | null;
  readonly adminKey: string;
  readonly feeScheduleKey: null;
  readonly fee: { readonly amount: number; readonly collector: string; readonly token: string } | null;
  readonly feeExemptKeys: readonly string[];
  readonly autoRenewAccount: string;
  readonly warrant: string;
}

const topicStep = (
  key: 'prices.topic' | 'agent.doorbell' | 'agent.log' | 'agent.manifest',
  role: string,
  needs: readonly ('postage.token' | 'agent.account' | 'treasury.account')[],
  build: (ctx: Ctx) => TopicWant,
  keyOwner: (ctx: Ctx) => Signer,
): Step<TopicWant> => ({
  key, kind: 'topic', role, builtBy: 'TopicCreateTransaction', needs,
  want: build,
  detail: (w) =>
    `${w.memo} · submit ${w.submitKey ? w.submitKey.slice(0, 8) + '…' : 'NONE'} · admin ${w.adminKey.slice(0, 8)}…` +
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
    c.keyIs('admin_key', t.admin_key, want.adminKey);
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
        .setAdminKey(owner.publicKey)
        .setAutoRenewAccountId(want.autoRenewAccount)
        .setMaxTransactionFee(want.fee ? FEE_GATED_CAP : new Hbar(20));
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
    let r = await submit(ctx.client, ctx.env.operatorId, build2(), [owner]);
    let signedBy = ['operator', owner.label];
    if (!r.ok && r.status === 'INVALID_SIGNATURE' && want.fee) {
      // ONLY this status answers "must the fee collector sign?" — the probe
      // observed that a treasury collector need not, so this branch should be
      // dead. Any other failure is a different question and is not retried.
      r = await submit(ctx.client, ctx.env.operatorId, build2(), [owner, ctx.treasury]);
      signedBy = ['operator', owner.label, 'treasury'];
    }
    return { ...r, signedBy };
  },
});

/* --- the first PriceList (D-143 as D-145 leaves it) ---------------------- */

export function buildPriceList(ctx: Ctx): Record<string, unknown> {
  return {
    spec: '0.5.2',
    stampToken: { ledgerTag: 'hedera:testnet', tokenId: ctx.tokenId(), treasury: ctx.treasuryId() },
    methods: [
      {
        method: 'x402-usdc', network: 'hedera:testnet', asset: '0.0.429274',
        payTo: ctx.env.operatorId, facilitator: 'https://x402.org/facilitator',
        unitPrice: '0.10', bundles: [{ count: 12, price: '1.00' }],
      },
      {
        method: 'hbar', network: 'hedera:testnet', asset: '0.0.0',
        payTo: ctx.env.operatorId,
        rate: {
          source: 'https://api.saucerswap.finance/tokens', pair: 'HBAR/USD',
          reference: { amount: '0.10', asset: 'USD' },
        },
        bundles: [{ count: 12, price: '1.00' }],
      },
    ],
  };
}

export function validatePriceList(repoRoot: string, msg: unknown): string[] {
  const schema = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'spec', 'schemas', 'price-list.schema.json'), 'utf8'),
  ) as object;
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  return validate(msg) ? [] : (validate.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message ?? ''}`.trim());
}

/** RFC 8785 (§5.1). One library here and in the AAD of §7.2, never hand-rolled. */
export function canonicalBytes(msg: unknown): Buffer {
  const s = canonicalize(msg);
  if (s === undefined) throw new Error('canonicalize returned undefined');
  return Buffer.from(s, 'utf8');
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
    c.eq('payer_account_id', first?.payer_account_id, ctx.env.operatorId);
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
    const r = await submit(ctx.client, ctx.env.operatorId, new TopicMessageSubmitTransaction()
      .setTopicId(want.topic)
      .setMessage(Buffer.from(want.bytes, 'base64')), [ctx.operator]);
    return { ...r, signedBy: ['operator'] };
  },
};


/* --- the ordered set ----------------------------------------------------- */

export const STEPS: readonly AnyStep[] = [
  anon(accountStep('treasury.account', 'treasury', (c) => c.treasury, 20,
    'D-140: holds the unissued $POSTAGE supply; its key is hot because §14.2’s purchase is atomic')),
  anon(accountStep('agent.account', 'postmaster-agent', (c) => c.agent, 20,
    'D-140: the service’s own Correspondent identity; an operational choice, not a spec role')),
  anon(tokenStep),
  anon(mintStep),
  anon(assocStep('operator.association', 'operator ↔ $POSTAGE', (c) => c.env.operatorId, () => [],
    '§4.4: the sender transfers a stamp to the Postmaster, which then pays the doorbell fee (D-140)')),
  anon(assocStep('agent.association', 'postmaster-agent ↔ $POSTAGE', (c) => c.agentId(), (c) => [c.agent],
    'the agent buys and affixes postage like any Correspondent')),
  anon(topicStep('prices.topic', 'price topic', [], (ctx) => ({
    memo: PRICE_TOPIC_MEMO,
    submitKey: publicHex(ctx.operator), adminKey: publicHex(ctx.operator), feeScheduleKey: null,
    fee: null, feeExemptKeys: [], autoRenewAccount: ctx.env.operatorId,
    warrant: 'D-142: the price list is the service speaking, so its keys are the operator’s; §4.6 and T-P17-1 do not reach it (D-146)',
  }), (c) => c.operator)),
  anon(priceListStep),
  anon(topicStep('agent.doorbell', 'doorbell (HCS-10 inbound)', ['postage.token', 'agent.account'], (ctx) => ({
    memo: `hcs-10:0:${HCS10_TTL}:0:${ctx.agentId()}`,
    submitKey: null, adminKey: publicHex(ctx.agent), feeScheduleKey: null,
    fee: { amount: 1, collector: ctx.treasuryId(), token: ctx.tokenId() },
    feeExemptKeys: [publicHex(ctx.agent)],
    autoRenewAccount: ctx.env.operatorId,
    warrant: 'D-138/D-147 row 1 · §4.4’s MUST selects HCS-10’s fee-gated inbound option (index.md:113) · D-137’s exemption · no fee schedule key: the fee is immutable at birth',
  }), (c) => c.agent)),
  anon(topicStep('agent.log', 'log (HCS-10 outbound)', ['agent.account'], (ctx) => ({
    memo: `hcs-10:0:${HCS10_TTL}:1`,
    submitKey: publicHex(ctx.agent), adminKey: publicHex(ctx.agent), feeScheduleKey: null,
    fee: null, feeExemptKeys: [], autoRenewAccount: ctx.env.operatorId,
    warrant: 'D-138/D-147 row 2 · index.md:114 “Has submit key (only agent can write)”',
  }), (c) => c.agent)),
  anon(topicStep('agent.manifest', 'manifest', ['agent.account'], (ctx) => ({
    memo: MANIFEST_MEMO,
    submitKey: publicHex(ctx.agent), adminKey: publicHex(ctx.agent), feeScheduleKey: null,
    fee: null, feeExemptKeys: [], autoRenewAccount: ctx.env.operatorId,
    warrant: 'D-138/D-147 row 3 · §9.1:1255 a manifest topic MUST have the agent’s key as its sole submit key (T-P17-3)',
  }), (c) => c.agent)),
];

export type { Discrepancy };
