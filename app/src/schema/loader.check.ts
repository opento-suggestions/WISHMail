/**
 * `npm run check:schemas` — the registry compiles, and the price list still
 * validates exactly as it did before it went through the registry.
 *
 * The second half is the point. `validatePriceList` used to build a fresh ajv
 * and read one file; it now goes through `loader.ts`, which holds all fourteen
 * schemas of §18.5 in one instance. D-143 has the first `PriceList` validated
 * before it is signed and byte-compared after, and D-145's negative half turns
 * on `additionalProperties` rejecting a message that carries `validFrom` — so a
 * refactor that quietly loosened validation would let a wrong price list onto
 * consensus and nothing would say so.
 *
 * The expected values below are the message that is on `hedera:testnet` at
 * sequence 1 of `0.0.10426551`, read from the ops record.
 */
import fs from 'node:fs';
import path from 'node:path';
import { canonicalBytes, sha256hex } from '../core/canonical.js';
import { repoRoot } from '../ops/env.js';
import { validatePriceList } from '../ops/steps.js';
import { SCHEMA_NAMES, schemas } from './loader.js';

const root = repoRoot();
const failures: string[] = [];
let checked = 0;

function is(name: string, got: unknown, want: unknown): void {
  checked += 1;
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g !== w) failures.push(`${name}\n    got   ${g}\n    want  ${w}`);
}

// --- All fourteen load, and every cross-file $ref resolves. -----------------
const registry = schemas(root);
is('schema count', SCHEMA_NAMES.length, 14);
for (const name of SCHEMA_NAMES) {
  checked += 1;
  try {
    // Validating an empty object compiles the schema, which is what proves
    // `evidence-bundle`'s five URN `$ref`s resolved. The verdict is irrelevant.
    registry.validate(name, {});
  } catch (e) {
    failures.push(`${name} did not compile: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// --- The price list, both halves of D-143 and D-145. ------------------------
const priceList = JSON.parse(
  fs.readFileSync(path.join(root, 'app', 'price-list.hedera-testnet.json'), 'utf8'),
) as Record<string, unknown>;
delete priceList['_readme'];

const record = JSON.parse(
  fs.readFileSync(path.join(root, 'app', 'deployment', 'hedera-testnet.json'), 'utf8'),
) as { entities: Record<string, { id: string | null; policy: Record<string, unknown> }> };

const stampToken = priceList['stampToken'] as Record<string, unknown>;
stampToken['tokenId'] = record.entities['postage.token']?.id;
stampToken['treasury'] = record.entities['treasury.account']?.id;
for (const method of priceList['methods'] as Record<string, unknown>[]) {
  method['payTo'] = record.entities['prices.first']?.policy['payer'] ?? '0.0.8641261';
}

is('the price list validates', validatePriceList(root, priceList), []);
is('a price list carrying validFrom is rejected (D-145)', validatePriceList(root, { ...priceList, validFrom: '2026-01-01T00:00:00Z' }), [
  '/ must NOT have additional properties',
]);

const bytes = canonicalBytes(priceList);
const published = record.entities['prices.first']?.policy;
is('canonical length matches the published message', bytes.length, 563);
is('canonical digest matches the published message', sha256hex(bytes), published?.['sha256']);
is('it fits one HCS message (CHUNK_WIRE_MAX 1000)', bytes.length <= 1000, true);

if (failures.length > 0) {
  console.error(`check:schemas FAILED — ${failures.length} of ${checked} assertions:`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log(
  `check:schemas PASS — ${checked} assertions: §18.5's fourteen compile in one registry, ` +
    `and the published PriceList still validates, still rejects validFrom, and is still ${bytes.length} bytes.`,
);
