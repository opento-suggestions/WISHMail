/**
 * Publish the THIRD `PriceList` as sequence 3 on the price topic — the rate a
 * Verifier can re-obtain.
 *
 * WHAT CHANGED, AND IT IS ABOUT REPLAY RATHER THAN ABOUT PRICE. Sequence 2
 * prices `hbar` by a rate read from `api.saucerswap.finance` — a DEX spot price.
 * T-P11-4 is the court for what was charged: "`buy_stamp` charges what the price
 * message current at the receipt's consensus timestamp yields". On a rate-priced
 * method that means a Verifier must obtain **the rate the Postmaster read, at
 * the instant it read it** — and a DEX spot price cannot be re-obtained at a
 * past timestamp by anyone. So every rate-priced receipt this deployment
 * produced would be right and unprovable, and P-12 downgrades what cannot be
 * replayed: "Appraised never exceeds declared. Non-replayable evidence
 * downgrades, never upgrades."
 *
 * Hedera's own exchange rate is consensus data with a timestamp filter, so it
 * can be (D-170). Sequence 3 is sequence 2 with one field changed.
 *
 * §14.3 makes the schedule the SEQUENCE of messages and the price current at a
 * purchase the latest message before it, so this supersedes sequence 2 **by
 * landing after it**, and sequences 1 and 2 are never edited. The counter quotes
 * at the message current by consensus timestamp, so once this lands it governs.
 *
 * The submission rule is `pricelist2.ts`'s, exported and called with different
 * arguments rather than copied: what makes a message sequence N — that the topic
 * holds exactly N-1 now — is the one stop that keeps this idempotent, and a
 * second spelling of it would be a second place for it to be wrong.
 *
 *   --dry-run   build, fill, validate, print, and sign nothing.
 */
import { publishPriceList } from './pricelist2.js';

publishPriceList({
  suffix: '-3',
  sequence: 3,
  key: 'prices.third',
  role: 'the third PriceList — the hbar rate read from the network’s own exchange rate (D-170)',
  why:
    'Sequence 3 moved the hbar rate source from a DEX spot price to the network’s own exchange rate, which a mirror ' +
    'node serves with a timestamp filter — so a Verifier holding a receipt’s rate.at can obtain exactly what the ' +
    'Postmaster read, and T-P11-4 is checkable on a rate-priced method.',
}).catch((e: unknown) => {
  console.error('\nSTOPPED\n' + (e instanceof Error ? e.message : String(e)));
  process.exitCode = 3;
});
