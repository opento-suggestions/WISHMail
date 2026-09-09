/**
 * `npm run resolve -- <address>` — §6.2's verb, over the `hcs14` profile.
 *
 * §6.2: "`resolve` reads and pays nothing: it may be called by anyone,
 * including a Verifier re-resolving during appraisal." So this configures
 * nothing but a mirror node URL and one public topic id: no key, no account, no
 * stamp, no broker (P-4).
 *
 * The topic id is the CALLER's own manifest topic — where the proof this prints
 * would be published — and it is required because D-163 puts the manifest's
 * canonical location inside the proof's meaning, and the meaning inside the hash
 * (§5.2, §5.1). Two agents resolving one address therefore compute two different
 * proof hashes, which is correct: a resolution proof is the resolver's proof,
 * and where it lives is part of what it says. It is a public entity id and not a
 * credential, so P-4 is untouched.
 *
 * The result is validated against `spec/schemas/mail-coordinates.schema.json`
 * before it is printed. A tool that returns an object its own schema rejects has
 * not resolved anything.
 */
import { loadEnv } from '../ops/env.js';
import { Mirror } from '../ops/mirror.js';
import { schemas } from '../schema/loader.js';
import { mirrorSource, resolveHcs14 } from './hcs14.js';

const address = process.argv[2];
if (address === undefined || address === '') {
  console.error('usage: npm run resolve -- <uaid:aid:… | 0.0.N | hedera:testnet:0.0.N> [<own manifest topic 0.0.N>]');
  process.exit(2);
}

// The caller's own manifest topic: an argument, or WISHMAIL_MANIFEST_TOPIC.
// There is no default and there is no placeholder: a manifest topic invented for
// the sake of printing something would put a location in the hash that names a
// topic nobody publishes on, which is exactly the condition T-P6-7 exists to
// catch.
const manifestTopic = process.argv[3] ?? process.env['WISHMAIL_MANIFEST_TOPIC'] ?? '';
if (!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(manifestTopic)) {
  console.error(
    'resolve: the caller\'s own manifest topic is required — pass it as the second argument or set',
  );
  console.error(
    "  WISHMAIL_MANIFEST_TOPIC. It is the topic this resolution's manifest would be published on, it is",
  );
  console.error("  inside the proof's meaning and therefore inside its hash (\u00a75.2, D-163), and it has no default.");
  process.exit(2);
}

const env = loadEnv();
const mirror = new Mirror(env.mirrorNodeUrl);

console.log(`resolve(${address}) under hcs14`);
console.log(`  ledger  ${env.constants.ledgerTag}`);
console.log(`  mirror  ${env.mirrorNodeUrl}`);
console.log(`  manifest ${manifestTopic}  (the caller's own; the proof's canonical location, §5.2)`);
console.log('  keys, stamps, accounts, brokers configured: none (P-4)\n');

const result = await resolveHcs14(mirrorSource(mirror), env.constants.ledgerTag, address, manifestTopic);

if ('failure' in result) {
  console.error(`  ${result.failure} — ${result.detail}`);
  process.exit(1);
}

const errors = schemas(env.repoRoot).validate('mail-coordinates', result.coordinates);
if (errors.length > 0) {
  console.error('  the coordinates do not validate against spec/schemas/mail-coordinates.schema.json:');
  for (const e of errors) console.error(`    ${e}`);
  process.exit(1);
}

// The manifest is a §5.2 Proof, and `spec/schemas/proof.schema.json` is what
// Step 4 would register. A resolution whose own manifest the registered schema
// rejects has resolved nothing (CLAUDE.md §9) — and until D-163 that was
// exactly the case: `meaning.uri` named the profile file and the schema wanted
// a message locator. Validated here so the CLI cannot print one that would not
// survive publication.
const manifestErrors = schemas(env.repoRoot).validate('proof', result.manifest);
if (manifestErrors.length > 0) {
  console.error('  the manifest does not validate against spec/schemas/proof.schema.json:');
  for (const e of manifestErrors) console.error(`    ${e}`);
  process.exit(1);
}

console.log('  MailCoordinates (§5.3), valid against its schema:\n');
console.log(
  JSON.stringify(result.coordinates, null, 2)
    .split('\n')
    .map((l) => `    ${l}`)
    .join('\n'),
);
console.log('\n  the resolution proof, which `send` publishes on the manifest topic (§6.4 step 2):\n');
console.log(
  JSON.stringify(result.manifest, null, 2)
    .split('\n')
    .map((l) => `    ${l}`)
    .join('\n'),
);
if (result.observations.agentIdOrder !== undefined) {
  console.log('\n  observations (§11.6) — bearing on no standing:\n');
  console.log(`    agentIdOrder  ${JSON.stringify(result.observations.agentIdOrder)}`);
}
