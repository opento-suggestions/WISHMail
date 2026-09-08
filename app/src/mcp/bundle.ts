/**
 * Bundling: making a served tool schema self-contained.
 *
 * The tool schemas `$ref` the registered schemas of §18.5 by URN —
 * `urn:wishmail:0.5:mail-coordinates` and the rest. That is right for a schema
 * in this repository, where the registry holds all fourteen, and wrong for one
 * put on a wire: a client has no such registry, so the reference dangles and
 * the schema is rejected before any tool is called. Found by a live stdio round
 * trip against the reference client, not by reading.
 *
 * So a served schema carries what it refers to. This is JSON Schema 2020-12's
 * own bundling: every referenced resource is embedded under `$defs` with its
 * `$id` intact, and the `$ref`s are left exactly as they were. A resolver
 * therefore finds `urn:wishmail:0.5:envelope` inside the document rather than
 * outside it, and the URN in the `$ref` still says which registered schema is
 * meant — which matters, because the whole point of `schemaRef` and of §5.11 is
 * that a reader can tell one.
 *
 * Bundling is transitive: `evidence-bundle` refers to five others. Each keeps
 * its own `$id`, so its internal `#/$defs/...` references resolve against
 * itself and not against the wrapper.
 *
 * Conformance: T-P15-4.
 */
import type { AnySchemaObject } from 'ajv';
import { SCHEMA_NAMES, schemaId, schemas, type SchemaName } from '../schema/loader.js';

const BY_ID = new Map<string, SchemaName>(SCHEMA_NAMES.map((n) => [schemaId(n), n]));

/** Every `urn:wishmail:0.5:*` reference anywhere in a schema. */
function refsIn(node: unknown, found: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) refsIn(item, found);
    return;
  }
  if (node === null || typeof node !== 'object') return;
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === '$ref' && typeof value === 'string' && BY_ID.has(value)) found.add(value);
    else refsIn(value, found);
  }
}

/**
 * Return the schema with every registered schema it refers to — and everything
 * those refer to — embedded under `$defs`.
 */
export function bundled(schema: AnySchemaObject, repoRoot: string): AnySchemaObject {
  const registry = schemas(repoRoot);

  const needed = new Set<string>();
  refsIn(schema, needed);

  // Transitive closure: a referenced schema may refer to others.
  const queue = [...needed];
  while (queue.length > 0) {
    const id = queue.shift() as string;
    const name = BY_ID.get(id);
    if (name === undefined) continue;
    const inner = new Set<string>();
    refsIn(registry.schema(name), inner);
    for (const next of inner) {
      if (!needed.has(next)) {
        needed.add(next);
        queue.push(next);
      }
    }
  }

  if (needed.size === 0) return schema;

  const defs: Record<string, unknown> = {};
  for (const id of [...needed].sort()) {
    const name = BY_ID.get(id) as SchemaName;
    // The embedded resource keeps its own `$id`. That is what makes the `$ref`
    // resolve to it, and what keeps its internal `#/$defs/...` pointing at
    // itself. Its `$schema` is dropped: an embedded resource may not declare a
    // different dialect than the document it sits in, and every one of ours
    // declares the same 2020-12 dialect anyway.
    const { $schema: _dialect, ...rest } = registry.schema(name) as Record<string, unknown>;
    defs[name] = rest;
  }

  const existing = (schema as { $defs?: Record<string, unknown> }).$defs ?? {};
  return { ...schema, $defs: { ...existing, ...defs } } as AnySchemaObject;
}
