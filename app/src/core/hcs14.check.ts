/**
 * `npm run check:hcs14` — the identifier is checked against a live agent's
 * on-chain UAID, because the standard's own test vectors court nothing.
 *
 * HCS-14 publishes its expected UAIDs as the literal string
 * `uaid:aid:{base58hash};…` (`index.md:709`, `:739`) — a placeholder where the
 * value should be. So there is no published vector to run against, and the only
 * real check is an agent that already exists on the ledger.
 *
 * That agent is "Bob" on `hedera:testnet`, account `0.0.7124407`: its HCS-10
 * `register` message carries a `uaid:aid:` (recon 2026-09-06, `:90`) and its
 * HCS-11 profile carries the six canonical fields (`:461`). Recomputing the one
 * from the other is what tells us the algorithm is right — and it is what found
 * that the standard contradicts itself about key order.
 */
import {
  CANONICAL_ORDER,
  agentIdHash,
  base58,
  canonicalAgentJson,
  matchAgentId,
  parseUaid,
  uaid,
} from './hcs14.js';

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

/**
 * The live agent. Fields read from its HCS-11 profile: `display_name` is the
 * name, the profile's TOP-LEVEL `version` is the version (not
 * `properties.version`, which is "2.0.0" and does not reproduce), and
 * `aiAgent.capabilities` are the skills.
 */
const BOB = {
  registry: 'hol',
  name: 'Bob',
  version: '1.0',
  protocol: 'hcs-10',
  nativeId: 'hedera:testnet:0.0.7124407',
  skills: [0, 4],
} as const;

/** Its identifier, as it stands on `hedera:testnet` today. */
const ON_CHAIN = '2cSNjEjwwQTkHNRUp98JsqYFpHwZX168DsavYMTVjCfqdEDCZboUGtYZwYkJBcvZ6w';

// --- Base58, on its own. ----------------------------------------------------
is('base58 of the empty string', base58(Buffer.alloc(0)), '');
is('base58 preserves leading zero bytes as 1s', base58(Buffer.from([0, 0, 1])), '112');
is('base58 of 0x00', base58(Buffer.from([0])), '1');
is('base58 of 0x39 is the 58th alphabet symbol', base58(Buffer.from([0x39])), 'z');
is('base58 of 0x3a carries into two digits', base58(Buffer.from([0x3a])), '21');

// --- The live agent, both ways. --------------------------------------------
is(
  'the example order reproduces the on-chain identifier',
  agentIdHash(BOB, 'example'),
  ON_CHAIN,
);
ok(
  'the normative order does not',
  agentIdHash(BOB, 'normative') !== ON_CHAIN,
);
is(
  'the example canonical JSON is skills-first',
  canonicalAgentJson(BOB, 'example'),
  '{"skills":[0,4],"name":"Bob","nativeId":"hedera:testnet:0.0.7124407","protocol":"hcs-10","registry":"hol","version":"1.0"}',
);
is(
  'the normative canonical JSON is what the reference code emits',
  canonicalAgentJson(BOB, 'normative'),
  '{"name":"Bob","nativeId":"hedera:testnet:0.0.7124407","protocol":"hcs-10","registry":"hol","skills":[0,4],"version":"1.0"}',
);
is('CANONICAL_ORDER is not yet ruled', CANONICAL_ORDER, undefined);

// --- A second live agent, and the newest on the anchor. ---------------------
//
// One live value proves an algorithm can reproduce one value. Two, of different
// protocol, registry, skills and name shape, twenty-five days apart, is what
// makes the finding about the standard rather than about one agent.
//
// Sequence 380 on the HOL testnet anchor 0.0.6913983, consensus
// 1763503558.796733702 (2025-11-18T22:05:58Z) — the newest registration the
// anchor carries. Its profile was read through the register's `t_id` to an
// HCS-2 registry to an HCS-1 file whose memo digest matched the decompressed
// bytes, from a mirror node.
const NEWEST = {
  registry: 'hashgraph-online',
  name: 'AgentVerse Local Bridge (sdk-agentverse-demo-1763503536585)',
  version: '1.0',
  protocol: 'a2a',
  nativeId: '127.0.0.1',
  skills: [0],
} as const;
const NEWEST_ON_CHAIN = '7wC7Cm3h2TGrCa4YA7uSQKp7Fht756tRtCJniaUdbAa4DNrj6fqsUxxKm2AysYkTwy';

is(
  'the newest anchor registration reproduces under the example order',
  agentIdHash(NEWEST, 'example'),
  NEWEST_ON_CHAIN,
);
ok(
  'and not under the normative one',
  agentIdHash(NEWEST, 'normative') !== NEWEST_ON_CHAIN,
);

// --- §9.1's dual-order match (D-152). --------------------------------------
is('matchAgentId finds the example order for the older agent', matchAgentId(BOB, ON_CHAIN), 'example');
is('matchAgentId finds it for the newest too', matchAgentId(NEWEST, NEWEST_ON_CHAIN), 'example');
is(
  'matchAgentId returns null when neither order matches',
  matchAgentId(BOB, 'z'.repeat(60)),
  null,
);
is(
  'a normative-order identifier is accepted, and named as such',
  matchAgentId(BOB, agentIdHash(BOB, 'normative')),
  'normative',
);

// --- Normalization (index.md:355-359). --------------------------------------
is(
  'registry and protocol are lowercased and strings trimmed',
  agentIdHash({ ...BOB, registry: '  HOL ', protocol: 'HCS-10' }, 'example'),
  ON_CHAIN,
);
is(
  'skills are sorted numerically, not lexically',
  agentIdHash({ ...BOB, skills: [4, 0] }, 'example'),
  ON_CHAIN,
);
ok(
  'a changed nativeId is a changed identifier',
  agentIdHash({ ...BOB, nativeId: 'hedera:testnet:0.0.7124408' }, 'example') !== ON_CHAIN,
);

// --- Required fields are required. -----------------------------------------
for (const field of ['registry', 'name', 'version', 'protocol', 'nativeId'] as const) {
  checked += 1;
  try {
    agentIdHash({ ...BOB, [field]: '' }, 'example');
    failures.push(`an empty ${field} was accepted, and must not have been`);
  } catch {
    /* refusing is the pass */
  }
}

// --- The full UAID, and §9.2's comparison. ---------------------------------
{
  const full = uaid(BOB, { uid: '0.0.7124410@0.0.7124407' }, 'example');
  const parsed = parseUaid(full);
  is('the identifier is the hash', parsed.identifier, ON_CHAIN);
  is('nativeId is carried as a parameter', parsed.parameters['nativeId'], BOB.nativeId);
  is('uid is §9.2’s operator_id', parsed.parameters['uid'], '0.0.7124410@0.0.7124407');
  is('registry is the hashed value', parsed.parameters['registry'], 'hol');

  // The on-chain UAID for this agent, parsed: §9.2 compares the identifier and
  // nativeId and treats every other parameter as a routing hint.
  const live = parseUaid(
    `uaid:aid:${ON_CHAIN};uid=bob;registry=hol;proto=hcs-10;nativeId=hedera:testnet:0.0.7124407`,
  );
  is('§9.2’s comparison: identifiers agree', parsed.identifier, live.identifier);
  is('§9.2’s comparison: nativeIds agree', parsed.parameters['nativeId'], live.parameters['nativeId']);
  ok('and uid differs, which §9.2 does not compare', parsed.parameters['uid'] !== live.parameters['uid']);

  is('a uaid:did: parses too', parseUaid('uaid:did:abc_0.0.1;uid=x').method, 'did');
  checked += 1;
  try {
    parseUaid('not-a-uaid');
    failures.push('a malformed UAID was accepted');
  } catch {
    /* refusing is the pass */
  }
}

if (failures.length > 0) {
  console.error(`check:hcs14 FAILED — ${failures.length} of ${checked} assertions:`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log(
  `check:hcs14 PASS — ${checked} assertions. Two live testnet agents, twenty-five days apart and of ` +
    'different protocol, registry and skills, both reproduce under the EXAMPLE order and neither under ' +
    'the NORMATIVE one. matchAgentId accepts either, normative first (§9.1, D-152). CANONICAL_ORDER — ' +
    'the order we emit for our own declaration — is unruled, so nothing emits a UAID yet.',
);
