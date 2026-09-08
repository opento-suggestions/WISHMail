/**
 * One ajv registry for `spec/schemas/`.
 *
 * §5.11: "Every object in this section, and the declaration of §9.1, has a JSON
 * Schema in `spec/schemas/`, one file per object, tracking this specification."
 * §18.5 names the fourteen. They declare draft 2020-12 and identify themselves
 * by URN — `urn:wishmail:0.5:<name>` — and `evidence-bundle.schema.json` `$ref`s
 * five of the others by that URN. So they cannot be compiled one at a time: all
 * fourteen go into one instance, and `$ref` resolves against what is in it.
 *
 * This generalises what `src/ops/steps.ts` did for the price list alone, where
 * a fresh `Ajv2020` was built and one file read on every call. That function now
 * calls this one, and must behave identically: T-P17-1's provisioning run
 * validates the first `PriceList` before it is signed, and D-145's negative half
 * requires that the same message carrying `validFrom` is rejected.
 *
 * Conformance: T-P9-3, T-P9-4, T-P15-1.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormatsImport from 'ajv-formats';
import type { AnySchemaObject, ValidateFunction } from 'ajv';

// `verbatimModuleSyntax` is on and `esModuleInterop` is off, so the CJS default
// of `ajv-formats` is unwrapped by hand. `src/ops/steps.ts` does the same.
const addFormats =
  (addFormatsImport as unknown as { default?: (a: unknown) => void }).default ??
  (addFormatsImport as unknown as (a: unknown) => void);

/**
 * The fourteen of §18.5, in the order that section lists them. The list is
 * written out rather than globbed: §18.5 fixes which schemas exist, and a
 * fifteenth file appearing in the directory is a divergence to be reported, not
 * a schema to be loaded.
 */
export const SCHEMA_NAMES = [
  'proof',
  'mail-coordinates',
  'stamp-receipt',
  'settlement',
  'envelope',
  'chunk',
  'postmark',
  'return-receipt',
  'attempted-delivery-slip',
  'evidence-bundle',
  'narrative',
  'conformance-claim',
  'declaration',
  'price-list',
] as const;

export type SchemaName = (typeof SCHEMA_NAMES)[number];

/** The URN a schema identifies itself by. §1.7: the wire carries the minor version. */
export function schemaId(name: SchemaName): string {
  return `urn:wishmail:0.5:${name}`;
}

export interface Registry {
  /** Validate a value; an empty array is a pass. */
  readonly validate: (name: SchemaName, value: unknown) => string[];
  /** The raw schema object, for a digest or a diagnostic. */
  readonly schema: (name: SchemaName) => AnySchemaObject;
  /** The directory the schemas were read from. */
  readonly dir: string;
}

let cached: Registry | undefined;

/**
 * Load and compile all fourteen. Cached, because compiling is the expensive
 * part and the schemas do not change while a process runs.
 */
export function schemas(repoRoot: string): Registry {
  if (cached !== undefined) return cached;

  const dir = path.join(repoRoot, 'spec', 'schemas');
  const onDisk = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.schema.json'))
    .map((f) => f.replace(/\.schema\.json$/, ''))
    .sort();
  const expected = [...SCHEMA_NAMES].sort();
  if (onDisk.join(',') !== expected.join(',')) {
    throw new Error(
      `spec/schemas/ does not hold §18.5's fourteen.\n  on disk: ${onDisk.join(', ')}\n  §18.5:   ${expected.join(', ')}`,
    );
  }

  const ajv = new Ajv2020({ strict: false, allErrors: true });
  addFormats(ajv);

  const raw = new Map<SchemaName, AnySchemaObject>();
  for (const name of SCHEMA_NAMES) {
    const file = path.join(dir, `${name}.schema.json`);
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as AnySchemaObject;
    if (parsed.$id !== schemaId(name)) {
      throw new Error(`${name}.schema.json declares $id ${String(parsed.$id)}, expected ${schemaId(name)}`);
    }
    raw.set(name, parsed);
    // Every schema is added before any is compiled, so `evidence-bundle`'s five
    // cross-file `$ref`s resolve whatever order the names come in.
    ajv.addSchema(parsed);
  }

  const compiled = new Map<SchemaName, ValidateFunction>();
  const validator = (name: SchemaName): ValidateFunction => {
    const already = compiled.get(name);
    if (already !== undefined) return already;
    const fn = ajv.getSchema(schemaId(name));
    if (fn === undefined) throw new Error(`schema ${name} did not compile`);
    compiled.set(name, fn);
    return fn;
  };

  cached = {
    dir,
    schema: (name) => {
      const s = raw.get(name);
      if (s === undefined) throw new Error(`no such schema: ${name}`);
      return s;
    },
    validate: (name, value) => {
      const fn = validator(name);
      if (fn(value)) return [];
      // The same message form `src/ops/steps.ts` used, so a failure reads the
      // same wherever it is printed.
      return (fn.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message ?? ''}`.trim());
    },
  };
  return cached;
}

/** Drop the cache. For a test that rewrites a schema on disk between runs. */
export function resetSchemaCache(): void {
  cached = undefined;
}
