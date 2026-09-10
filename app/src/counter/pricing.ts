/**
 * What the counter charges, and where every number in it came from.
 *
 * §14.3: "The price current at a purchase is the latest price message with a
 * consensus timestamp before the purchase's; the Postmaster reads it from a
 * mirror node at every purchase, and a Verifier reads the same message to check
 * what was charged." So the price is not a constant in this repository and not a
 * field in a config file — it is read from consensus, on every quote, by the
 * same route a Verifier reads it.
 *
 * THE THREE MUSTs, and where each is enforced:
 *   - publish before charging          → `currentPriceList` refuses an empty topic
 *   - charge exactly what it yields    → `quote` computes from the message alone
 *   - never charge under an unpublished price → a method or a `provisioning`
 *     entry the current message does not carry is refused, not defaulted
 *
 * ARITHMETIC IS INTEGER, ALWAYS. Every amount in a price list is a decimal
 * string in the asset's natural unit, "not as a JSON number, because the
 * message is canonical JSON (§5.1) and a float is a hazard". The same hazard is
 * in the conversion, so nothing here becomes a `number`: amounts are scaled to
 * integers and divided as `bigint`.
 *
 * Conformance: T-P11-4, T-P11-2, T-P16-1.
 */
import { Mirror } from '../ops/mirror.js';
import { schemas } from '../schema/loader.js';

/** Tinybar-grade fixed point: eight decimal places, which is ℏ's own. */
const SCALE = 8;
const ONE = 10n ** BigInt(SCALE);

/** A decimal string to a scaled integer. Refuses anything that is not one. */
export function scaled(decimal: string): bigint {
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(decimal.trim());
  if (m === null) throw new Error(`pricing: ${JSON.stringify(decimal)} is not a decimal amount`);
  const frac = (m[3] ?? '').padEnd(SCALE, '0');
  if (frac.length > SCALE) throw new Error(`pricing: ${decimal} carries more than ${SCALE} decimal places`);
  const v = BigInt(m[2] as string) * ONE + BigInt(frac);
  return m[1] === '-' ? -v : v;
}

/** A scaled integer back to the decimal string a receipt carries. */
export function unscaled(value: bigint): string {
  const whole = value / ONE;
  const frac = (value % ONE).toString().padStart(SCALE, '0').replace(/0+$/, '');
  return frac === '' ? whole.toString() : `${whole}.${frac}`;
}

export interface PriceMethod {
  readonly method: string;
  readonly network: string;
  readonly asset: string;
  readonly payTo?: string | null;
  readonly facilitator?: string;
  readonly unitPrice?: string;
  readonly rate?: { readonly source: string; readonly pair: string; readonly reference: { readonly amount: string; readonly asset: string } };
  readonly bundles?: readonly { readonly count: number; readonly price: string }[];
}

export interface PriceList {
  readonly spec: string;
  readonly stampToken: { readonly ledgerTag: string; readonly tokenId: string; readonly treasury: string };
  readonly methods: readonly PriceMethod[];
  readonly provisioning?: { readonly method: string; readonly unitPrice: string; readonly registrationFee?: string };
}

export interface CurrentPrice {
  readonly list: PriceList;
  readonly sequenceNumber: number;
  readonly consensusTimestamp: string;
}

interface MMessages {
  readonly messages?: readonly { readonly sequence_number: number; readonly consensus_timestamp: string; readonly message: string }[];
}

/**
 * The price message current now, from consensus.
 *
 * "The latest price message with a consensus timestamp before the purchase's" —
 * and the purchase's is later than this read by construction, so the latest
 * message on the topic at read time is the one that governs. A topic with no
 * message is not a Postmaster with a free price: §14.3 forbids charging under a
 * price that has not been published, so it is a refusal.
 */
export async function currentPriceList(mirror: Mirror, priceTopic: string, repoRoot: string): Promise<CurrentPrice> {
  const page = await mirror.get<MMessages>(`/topics/${priceTopic}/messages?limit=100&order=desc`);
  const latest = (page?.messages ?? [])[0];
  if (latest === undefined) {
    throw new Error(`the price topic ${priceTopic} carries no price message; §14.3 forbids charging under an unpublished price`);
  }
  const list = JSON.parse(Buffer.from(latest.message, 'base64').toString('utf8')) as PriceList;
  // Validated against the REGISTERED schema on the way in as well as on the way
  // out: a Verifier reads this same message and appraises against the same
  // shape, and a counter that quoted from a message a Verifier would reject
  // would be charging under something that is not a price list.
  const errors = schemas(repoRoot).validate('price-list', list);
  if (errors.length > 0) {
    throw new Error(`the current price message does not validate against the registered PriceList schema: ${errors.join('; ')}`);
  }
  return { list, sequenceNumber: latest.sequence_number, consensusTimestamp: latest.consensus_timestamp };
}

/** What the Postmaster read to convert a rate-priced method, and when (§5.4's `rate`). */
export interface RateReading {
  readonly source: string;
  readonly pair: string;
  readonly value: string;
  readonly at: string;
}

interface SaucerToken {
  readonly id: string;
  readonly priceUsd?: number | string;
}

/**
 * Read the rate the price list names.
 *
 * The source is whatever the published message says, and never a constant here:
 * §14.3 has the buyer sign the amount the Postmaster quotes and the receipt
 * record "the rate used and when", so a Verifier checking the charge follows
 * the message's own `source` and `pair`. `networks.ts` records what that URL
 * returns and why the read is the list filtered to id `0.0.0` — the singular
 * endpoint rejects it.
 */
/**
 * Hedera's own exchange rate, as a mirror node serves it (HIP-1 / the network's
 * `ExchangeRateSet`): `cent_equivalent` cents buy `hbar_equivalent` ℏ, and the
 * record is in force until `expiration_time`.
 */
interface ExchangeRate {
  readonly current_rate?: { readonly cent_equivalent: number; readonly hbar_equivalent: number; readonly expiration_time: number };
  /** The consensus timestamp of the record. What a Verifier passes back to re-obtain it. */
  readonly timestamp?: string;
}

/** A source that is the network's own rate rather than somebody's market view. */
function isNetworkExchangeRate(source: string): boolean {
  return source.includes('/network/exchangerate');
}

/**
 * THE RATE A VERIFIER CAN RE-OBTAIN, AND WHY THAT DECIDES WHICH SOURCE IS READ.
 *
 * T-P11-4 is the court for what was charged — "`buy_stamp` charges what the price
 * message current at the receipt’s consensus timestamp yields" — and on a
 * rate-priced method that means a Verifier must obtain **the rate the Postmaster
 * read, at the instant it read it**. A DEX spot price cannot be re-obtained at a
 * past timestamp by anyone, so a receipt priced from one is right and unprovable,
 * and P-12 downgrades what cannot be replayed. Hedera’s own exchange rate is
 * consensus data with a timestamp filter, so it can (D-170).
 *
 * **The value is computed in integers and truncated to the scale the arithmetic
 * uses**, and the receipt carries that number — so the figure a Verifier reads is
 * the figure the price was divided by, and a replay reaches the same tinybar
 * rather than one off. Truncating rather than rounding is a choice with a
 * direction: a smaller divisor makes the price higher, so the rounding that
 * remains is against the Postmaster and never against the buyer.
 *
 * **`at` is the rate record’s own consensus timestamp**, not a wall clock: it is
 * what a Verifier passes back to the mirror, and querying at it returns that same
 * record (verified 2026-09-09). §5.4 types `at` as a string and constrains it no
 * further, so nothing in a frozen schema moves.
 *
 * The market source is still read where a schedule names one — sequences 1 and 2
 * on `0.0.10426551` do, and they are on consensus and cannot be edited. What a
 * receipt under them says is true; what it is not is replayable, and LIMITATIONS
 * says so.
 */
export async function readRate(m: PriceMethod): Promise<RateReading> {
  if (m.rate === undefined) throw new Error(`pricing: the ${m.method} method is not rate-priced`);
  const source = m.rate.source;

  if (isNetworkExchangeRate(source)) {
    const r = await fetch(source, { signal: AbortSignal.timeout(15_000) });
    if (!r.ok) throw new Error(`pricing: the rate source ${source} returned ${r.status}`);
    const body = (await r.json()) as ExchangeRate;
    const rate = body.current_rate;
    if (rate === undefined || body.timestamp === undefined) {
      throw new Error(`pricing: ${source} returned no current_rate with a timestamp`);
    }
    if (!(rate.hbar_equivalent > 0) || !(rate.cent_equivalent > 0)) {
      throw new Error(`pricing: ${source} returned ${rate.cent_equivalent} cents for ${rate.hbar_equivalent} ℏ`);
    }
    // USD per ℏ = cents / (100 × ℏ), at SCALE, truncated. Integers throughout:
    // a float here would put a rounding error inside the number the receipt
    // publishes as the divisor.
    const perHbar = (BigInt(rate.cent_equivalent) * ONE) / (100n * BigInt(rate.hbar_equivalent));
    if (perHbar <= 0n) throw new Error(`pricing: ${source} yields a non-positive rate for ${m.rate.pair}`);
    return { source, pair: m.rate.pair, value: unscaled(perHbar), at: body.timestamp };
  }

  const r = await fetch(source, { signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`pricing: the rate source ${source} returned ${r.status}`);
  const tokens = (await r.json()) as readonly SaucerToken[];
  const hbar = tokens.find((t) => t.id === m.asset);
  if (hbar?.priceUsd === undefined) {
    throw new Error(`pricing: the rate source carries no price for ${m.asset} on the pair ${m.rate.pair}`);
  }
  return { source, pair: m.rate.pair, value: String(hbar.priceUsd), at: new Date().toISOString() };
}

export interface Quote {
  /** What is charged, in the method's own asset, as the receipt's `price`. */
  readonly amount: string;
  readonly currency: string;
  /** Present exactly when the method is rate-priced (§5.4). */
  readonly rate?: RateReading;
  /** The provisioned path's own price, where the purchase bought it (§4.6, §14.3). */
  readonly provisioning?: { readonly amount: string; readonly currency: string; readonly registrationFee?: string };
  /** The message the quote came from — what a Verifier re-reads. */
  readonly from: { readonly sequenceNumber: number; readonly consensusTimestamp: string };
}

/**
 * §14.3's arithmetic, and T-P11-4's three cases: `count × unitPrice`, a bundle's
 * price at its count, or the referenced rate applied to the reference price.
 *
 * A bundle is taken only at EXACTLY its count. §14.3 calls it "a price for a
 * count, offered to everyone alike", not a discount schedule, and inventing a
 * best-price search would be charging something the message does not yield.
 *
 * Rounding is UP, to the asset's natural precision. A quote that rounded down
 * would charge less than the published price yields, and the MUST is "charge
 * exactly what the price message current at the purchase yields"; the residue
 * is one tinybar, and it is on the side that cannot be a discount nobody
 * published.
 */
export async function quote(
  current: CurrentPrice,
  method: string,
  count: number,
  provision: boolean,
): Promise<Quote> {
  const m = current.list.methods.find((x) => x.method === method);
  if (m === undefined) throw new Error(`STAMP_METHOD_UNSUPPORTED: the current price message publishes no ${method} method`);
  if (count < 1 || !Number.isInteger(count)) throw new Error(`pricing: count must be an integer of at least 1, not ${count}`);

  const bundle = (m.bundles ?? []).find((b) => b.count === count);

  let amount: bigint;
  let rate: RateReading | undefined;
  if (m.unitPrice !== undefined) {
    amount = bundle ? scaled(bundle.price) : scaled(m.unitPrice) * BigInt(count);
  } else if (m.rate !== undefined) {
    // The basis is the REFERENCE asset — "a bundle's price follows its method's
    // pricing basis … the reference asset where it is rate-priced — so that the
    // rate converts a bundle at purchase exactly as it converts `reference`."
    const inReference = bundle ? scaled(bundle.price) : (scaled(m.rate.reference.amount) * BigInt(count));
    rate = await readRate(m);
    const perUnit = scaled(rate.value);
    if (perUnit <= 0n) throw new Error(`pricing: the rate source returned ${rate.value} for ${m.rate.pair}`);
    // reference-units ÷ (reference per asset-unit) = asset-units, rounded up.
    amount = (inReference * ONE + perUnit - 1n) / perUnit;
  } else {
    throw new Error(`pricing: the ${method} method carries neither unitPrice nor rate, and §14.3 requires one`);
  }

  let provisioning: Quote['provisioning'];
  if (provision) {
    const p = current.list.provisioning;
    if (p === undefined) {
      throw new Error(
        'STAMP_METHOD_UNSUPPORTED: the current price message publishes no provisioning price, and §6.3 makes ' +
          '`provision` false unless the Postmaster publishes one',
      );
    }
    if (p.method !== method) {
      throw new Error(`STAMP_METHOD_UNSUPPORTED: provisioning is published on the ${p.method} method and this purchase is ${method}`);
    }
    provisioning = {
      amount: p.unitPrice,
      currency: currencyOf(m),
      ...(p.registrationFee === undefined ? {} : { registrationFee: p.registrationFee }),
    };
  }

  return {
    amount: unscaled(amount),
    currency: currencyOf(m),
    ...(rate === undefined ? {} : { rate }),
    ...(provisioning === undefined ? {} : { provisioning }),
    from: { sequenceNumber: current.sequenceNumber, consensusTimestamp: current.consensusTimestamp },
  };
}

/**
 * What a price is denominated in, on the wire.
 *
 * §5.4's `price.currency` is a string and the specification fixes no
 * vocabulary, so it is the method's own asset id — which is what the price
 * list names and what a Verifier can look up. For the `hbar` method that is
 * `0.0.0`, which is how the rate source itself identifies ℏ (`networks.ts`).
 */
function currencyOf(m: PriceMethod): string {
  return m.asset;
}
