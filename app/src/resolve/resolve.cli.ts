/**
 * `npm run resolve -- <address>` — §6.2's verb, over the `hcs14` profile.
 *
 * §6.2: "`resolve` reads and pays nothing: it may be called by anyone,
 * including a Verifier re-resolving during appraisal." So this configures
 * nothing but a mirror node URL: no key, no account, no stamp, no broker (P-4).
 *
 * The result is validated against `spec/schemas/mail-coordinates.schema.json`
 * before it is printed. A tool that returns an object its own schema rejects has
 * not resolved anything.
 */
import { loadEnv } from '../ops/env.js';
import { Mirror } from '../ops/mirror.js';
import { schemas } from '../schema/loader.js';
import { resolveHcs14 } from './hcs14.js';

const address = process.argv[2];
if (address === undefined || address === '') {
  console.error('usage: npm run resolve -- <uaid:aid:… | 0.0.N | hedera:testnet:0.0.N>');
  process.exit(2);
}

const env = loadEnv();
const mirror = new Mirror(env.mirrorNodeUrl);

console.log(`resolve(${address}) under hcs14`);
console.log(`  ledger  ${env.constants.ledgerTag}`);
console.log(`  mirror  ${env.mirrorNodeUrl}`);
console.log('  keys, stamps, accounts, brokers configured: none (P-4)\n');

const result = await resolveHcs14(mirror, env.constants.ledgerTag, address);

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
