/**
 * §9.1's manifest byte budget, computed rather than guessed (D-167).
 *
 * §9.1: "a manifest MUST be one HCS message at or under `CHUNK_WIRE_MAX` bytes".
 * §5.2 requires `meaning.statement` and bounds its length nowhere. Nothing
 * reconciled the two, and the pre-Step-4 sweep found that at a real address the
 * manifest did not fit (ledger §G-17). D-167 answers it in two parts: the
 * resolution proof's `output` travels by digest, which takes the coordinates
 * value out of the message; and §9.1 writes the remaining budget down, which is
 * what this module computes.
 *
 * The budget is computed PER PROFILE, at each profile's own worst case, and N is
 * the smallest of them — the bound that holds everywhere. Computing one
 * synthetic maximum instead would be wrong twice over: it would combine
 * endorsements no single rule can assign (§9.2 assigns `blurred`; §9.5 `blurred`
 * and `vague`; §9.3 and §9.4 at most four each) and it would combine locator
 * fields no single form produces.
 *
 * Exported so the specification's sentence, the schema's `maxLength` and
 * `check:prefreeze` all come from ONE calculation rather than from a constant
 * someone typed three times (CLAUDE.md §9).
 */
import { canonicalBytes } from '../core/canonical.js';

/** §7.4, D-96. The network's own single-message ceiling is 1024; ours is 1000. */
export const CHUNK_WIRE_MAX = 1000;

/**
 * The longest real UAID on the HOL testnet anchor — sequence 380, read
 * 2026-09-09. HCS-14 fixes no maximum, so this is a measured worst case and the
 * budget says so rather than pretending to a bound the standard does not give.
 */
export const LONGEST_OBSERVED_UAID =
  'uaid:aid:7wC7Cm3h2TGrCa4YA7uSQKp7Fht756tRtCJniaUdbAa4DNrj6fqsUxxKm2AysYkTwy;uid=sdk-agentverse-demo-1763503536585;registry=hashgraph-online;proto=a2a;nativeId=127.0.0.1';

const ENTITY = '0.0.99999999';
const TS = '9999999999.999999999';

export interface ProfileBudget {
  readonly id: string;
  /** Bytes spent on everything but `meaning.statement` and `inputs.snapshot`. */
  readonly fixed: number;
  /** What is left of CHUNK_WIRE_MAX for the statement plus any snapshot. */
  readonly left: number;
  /** The bytes this profile's rule MUST spend on a snapshot (§9.1's table). */
  readonly snapshot: number;
  readonly why: string;
}

/** Each profile at its own worst case, from §9's own sentences. */
export function profileBudgets(): readonly ProfileBudget[] {
  const skeleton = (
    rule: { id: string; revision: string },
    locator: Record<string, unknown>,
    endorsements: readonly string[],
    trustClass: string,
  ): number =>
    canonicalBytes({
      p: 'wishmail',
      t: 'manifest',
      rule,
      inputs: { digest: '0'.repeat(64), locator },
      output: { digest: '0'.repeat(64) },
      meaning: { statement: '', uri: { ledgerTag: 'hedera:testnet', topicId: ENTITY }, trustClass, endorsements },
      hash: '0'.repeat(64),
    }).length;

  const A = LONGEST_OBSERVED_UAID;

  // §9.2, first form at a UAID, plus `memo` which §9.2's list names. `blurred`
  // is the only endorsement this rule assigns (D-107, second form).
  const hcs14 = skeleton(
    { id: 'hcs14', revision: '0.5' },
    { ledgerTag: 'hedera:testnet', address: A, account: ENTITY, memo: `hcs-11:hcs://2/${ENTITY}`, registryTopic: ENTITY, registrySequence: 999999, consensusTimestamp: TS, profileTopic: ENTITY },
    ['blurred'],
    'math',
  );

  // §9.5: "{ledgerTag, anchorTopic, sequenceNumber} and, for the account-memo
  // shape, §9.2's locator beside it". Endorsements: `blurred`, `vague`.
  const hol = skeleton(
    { id: 'hol', revision: '0.5' },
    { ledgerTag: 'hedera:testnet', address: A, anchorTopic: ENTITY, sequenceNumber: 999999, account: ENTITY, memo: `hcs-11:hcs://2/${ENTITY}`, registryTopic: ENTITY, registrySequence: 999999, consensusTimestamp: TS, profileTopic: ENTITY },
    ['blurred', 'vague'],
    'math',
  );

  // §9.3: locator `{name, type, resolver, queryTime}`; the address is
  // `dns:<fqdn>`, far shorter than a UAID. Endorsements: blurred, vague, stale.
  const dns = skeleton(
    { id: 'dns', revision: '0.5' },
    { ledgerTag: 'hedera:testnet', address: 'dns:a-fairly-long-agent-name.example.test', name: '_wishmail.a-fairly-long-agent-name.example.test', type: 'TXT', resolver: '2001:0db8:85a3:0000:0000:8a2e:0370:7334', queryTime: TS },
    ['blurred', 'stale', 'vague'],
    'social-committee',
  );

  // §9.4: locator `{indexHost, urn, fetchTime}`; the address is
  // `nanda:<urn>@<index-host>`. Endorsements: blurred, stale, vague, withheld.
  const nandaAddr = 'nanda:urn:ai:domain:a-fairly-long-agent-name.example.test:agent:correspondent-b@index.example.test';
  const nanda = skeleton(
    { id: 'nanda', revision: '0.5' },
    { ledgerTag: 'hedera:testnet', address: nandaAddr, indexHost: 'index.example.test', urn: 'urn:ai:domain:a-fairly-long-agent-name.example.test:agent:correspondent-b', fetchTime: TS },
    ['blurred', 'stale', 'vague', 'withheld'],
    'social-committee',
  );

  // §9.1's table: the two consensus profiles carry no snapshot; the two
  // off-consensus ones MUST (T-P6-2). What a snapshot costs is the profile's
  // own: a memo for §9.2's second form, the RRset for `dns`, the index record
  // for `nanda`. Measured from the sweep's fixtures.
  const memoSnapshot = canonicalBytes({ snapshot: { memo: `hcs-11:hcs://1/${ENTITY}` } }).length;

  return [
    { id: 'hcs14', fixed: hcs14, left: CHUNK_WIRE_MAX - hcs14, snapshot: memoSnapshot, why: '§9.2 first form at a UAID, with §9.2\'s `memo`; `blurred` under the second form' },
    { id: 'hol', fixed: hol, left: CHUNK_WIRE_MAX - hol, snapshot: 0, why: "§9.5's anchor locator with §9.2's beside it, at a UAID; `blurred`, `vague`" },
    { id: 'dns', fixed: dns, left: CHUNK_WIRE_MAX - dns, snapshot: 0, why: '§9.3, an IPv6 resolver and a long name; `blurred`, `stale`, `vague`' },
    { id: 'nanda', fixed: nanda, left: CHUNK_WIRE_MAX - nanda, snapshot: 0, why: '§9.4, a long URN; `blurred`, `stale`, `vague`, `withheld`' },
  ];
}

/**
 * N — the bytes §9.1 allows for `meaning.statement` plus any snapshot, being the
 * smallest remainder across §9's four profiles, rounded DOWN to a round number
 * so the specification states a figure rather than an artefact of a measurement.
 */
export function budget(): { readonly worst: ProfileBudget; readonly exact: number; readonly N: number } {
  const all = profileBudgets();
  const worst = all.reduce((a, b) => (a.left <= b.left ? a : b));
  return { worst, exact: worst.left, N: Math.floor(worst.left / 10) * 10 };
}
