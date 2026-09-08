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
  'the deployed order reproduces the on-chain identifier',
  agentIdHash(BOB, 'deployed'),
  ON_CHAIN,
);
ok(
  'the lexicographic order does not',
  agentIdHash(BOB, 'lexicographic') !== ON_CHAIN,
);
is(
  'the deployed canonical JSON is skills-first',
  canonicalAgentJson(BOB, 'deployed'),
  '{"skills":[0,4],"name":"Bob","nativeId":"hedera:testnet:0.0.7124407","protocol":"hcs-10","registry":"hol","version":"1.0"}',
);
is(
  'the lexicographic canonical JSON is what the reference code emits',
  canonicalAgentJson(BOB, 'lexicographic'),
  '{"name":"Bob","nativeId":"hedera:testnet:0.0.7124407","protocol":"hcs-10","registry":"hol","skills":[0,4],"version":"1.0"}',
);
is('CANONICAL_ORDER is not yet ruled', CANONICAL_ORDER, undefined);

// --- Normalization (index.md:355-359). --------------------------------------
is(
  'registry and protocol are lowercased and strings trimmed',
  agentIdHash({ ...BOB, registry: '  HOL ', protocol: 'HCS-10' }, 'deployed'),
  ON_CHAIN,
);
is(
  'skills are sorted numerically, not lexically',
  agentIdHash({ ...BOB, skills: [4, 0] }, 'deployed'),
  ON_CHAIN,
);
ok(
  'a changed nativeId is a changed identifier',
  agentIdHash({ ...BOB, nativeId: 'hedera:testnet:0.0.7124408' }, 'deployed') !== ON_CHAIN,
);

// --- Required fields are required. -----------------------------------------
for (const field of ['registry', 'name', 'version', 'protocol', 'nativeId'] as const) {
  checked += 1;
  try {
    agentIdHash({ ...BOB, [field]: '' }, 'deployed');
    failures.push(`an empty ${field} was accepted, and must not have been`);
  } catch {
    /* refusing is the pass */
  }
}

// --- The full UAID, and §9.2's comparison. ---------------------------------
{
  const full = uaid(BOB, { uid: '0.0.7124410@0.0.7124407' }, 'deployed');
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
  `check:hcs14 PASS — ${checked} assertions. The deployed key order reproduces a live testnet agent's ` +
    'on-chain UAID; the order the standard calls normative does not. CANONICAL_ORDER is unruled, so ' +
    'nothing emits a UAID yet.',
);
