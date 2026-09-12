/**
 * WHAT A PUBLISHED SCHEMA DECLARES, AND WHAT AN INSTANCE ACTUALLY CARRIES.
 *
 * `sdk/outputs.check.ts` asks two questions ajv cannot answer, and this module
 * is what lets it ask them.
 *
 * THE FIRST is "does anything produce this field?". A schema validates an
 * instance against a shape; it never says that a declared field was filled by
 * anybody, and an OPTIONAL field that nothing writes validates perfectly
 * forever. That is not hypothetical here: `manifestTopic` was read out of the
 * §9.2 profile and dropped on the floor until D-166 — two of the three
 * coordinates made it through and this one did not — and every instance
 * validated the whole time (`resolve/hcs14.ts`). Comparing the set of paths a
 * schema DECLARES against the set an instance OBSERVES is the only assertion
 * that catches it.
 *
 * THE SECOND is the mirror image: "is this field even declared?". Two of the
 * fourteen — `postmark` and `settlement` — state no `additionalProperties` at
 * all, so ajv accepts any extra key on them silently. A handler that bolts a
 * field onto a Postmark is invisible to validation and loud to a path diff.
 *
 * AND `contentEncoding` IS AN ANNOTATION, NOT AN ASSERTION. JSON Schema
 * 2020-12 makes it one, ajv does not enforce it, and `{strict: false}` does not
 * even warn. So the encodings are collected here and asserted by hand at the
 * court. That is the exact hole a Node `Buffer` crossed: `{"type":"Buffer",
 * "data":[…]}` where the schema said a base64 string.
 *
 * ON BUNDLED SCHEMAS. Everything here expects the output of `bundle.ts`'s
 * `bundled()`, where each referenced resource is embedded under `$defs` KEEPING
 * ITS OWN `$id`. So a `$ref` is resolved by `$id` first; a `#/…` pointer is
 * resolved against the NEAREST ENCLOSING `$id` and not against the document
 * root, because that is what keeping the `$id` means — `evidence-bundle` refers
 * to `#/$defs/reasons`, which is its own, three times over.
 *
 * PATH GRAMMAR. Dotted property names, with `[]` for "each element of the array
 * here": `deliveries[].envelope.resolutionProof.uri.topicId`. An array
 * contributes no path of its own — `deliveries` is a path and `deliveries[]` is
 * not — so the two sides of a diff are directly comparable.
 */
import type { AnySchemaObject } from 'ajv';

export interface Declared {
  /** Every property path the schema names. */
  readonly paths: ReadonlySet<string>;
  /** The paths declaring a `contentEncoding`, and which one. */
  readonly encodings: ReadonlyMap<string, string>;
}

type Node = Record<string, unknown>;

function isObject(v: unknown): v is Node {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Every subschema in the document that declares an `$id`, by that `$id`. */
function resourcesIn(root: unknown): Map<string, Node> {
  const byId = new Map<string, Node>();
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (!isObject(node)) return;
    const id = node['$id'];
    if (typeof id === 'string' && !byId.has(id)) byId.set(id, node);
    for (const value of Object.values(node)) walk(value);
  };
  walk(root);
  return byId;
}

/** Resolve a `#/a/b` JSON pointer against one resource. */
function pointer(resource: Node, ref: string): Node | undefined {
  if (ref === '#') return resource;
  if (!ref.startsWith('#/')) return undefined;
  let at: unknown = resource;
  for (const raw of ref.slice(2).split('/')) {
    const key = raw.replace(/~1/g, '/').replace(/~0/g, '~');
    if (!isObject(at)) return undefined;
    at = at[key];
  }
  return isObject(at) ? at : undefined;
}

export function declaredOf(schema: AnySchemaObject): Declared {
  const byId = resourcesIn(schema);
  const paths = new Set<string>();
  const encodings = new Map<string, string>();

  // A branch is identified by the resource it sits in and the path it is being
  // walked at. Nothing in these fourteen is self-recursive today; the guard is
  // four lines and the day one is, this terminates instead of hanging a check.
  const seen = new Set<string>();

  const visit = (node: unknown, path: string, resource: Node): void => {
    if (!isObject(node)) return;

    const ref = node['$ref'];
    if (typeof ref === 'string') {
      const target = byId.get(ref) ?? pointer(resource, ref);
      if (target !== undefined) {
        const key = `${String(target['$id'] ?? '')}|${path}`;
        if (!seen.has(key)) {
          seen.add(key);
          visit(target, path, byId.has(ref) ? target : resource);
        }
      }
      // A `$ref` beside other keywords is legal in 2020-12, so fall through.
    }

    // An embedded resource rebases every `#/…` beneath it.
    const here = typeof node['$id'] === 'string' ? node : resource;

    const encoding = node['contentEncoding'];
    if (typeof encoding === 'string' && path !== '') encodings.set(path, encoding);

    const properties = node['properties'];
    if (isObject(properties)) {
      for (const [name, sub] of Object.entries(properties)) {
        const at = path === '' ? name : `${path}.${name}`;
        paths.add(at);
        visit(sub, at, here);
      }
    }

    const items = node['items'];
    if (isObject(items)) visit(items, `${path}[]`, here);

    for (const keyword of ['oneOf', 'anyOf', 'allOf'] as const) {
      const arms = node[keyword];
      if (Array.isArray(arms)) for (const arm of arms) visit(arm, path, here);
    }
  };

  visit(schema as unknown as Node, '', schema as unknown as Node);
  return { paths, encodings };
}

/**
 * Every path an instance carries.
 *
 * A key counts as present even where its value is `null`: `resolve` returns
 * `resolutionProof.uri: null` by §6.2 — null until `send` publishes the
 * manifest — and that is the field being produced, not omitted.
 */
export function pathsIn(instance: unknown): ReadonlySet<string> {
  const paths = new Set<string>();
  const walk = (node: unknown, path: string): void => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item, `${path}[]`);
      return;
    }
    if (!isObject(node)) return;
    for (const [name, value] of Object.entries(node)) {
      const at = path === '' ? name : `${path}.${name}`;
      paths.add(at);
      walk(value, at);
    }
  };
  walk(instance, '');
  return paths;
}

/** Every value an instance carries at a dotted path; arrays fan out. */
export function valuesAt(instance: unknown, path: string): readonly unknown[] {
  let at: unknown[] = [instance];
  for (const segment of path.split('.')) {
    const name = segment.replace(/(\[\])+$/, '');
    const depth = (segment.length - name.length) / 2;
    at = at.flatMap((node) => (isObject(node) && name in node ? [node[name]] : []));
    for (let i = 0; i < depth; i += 1) {
      at = at.flatMap((node) => (Array.isArray(node) ? node : []));
    }
  }
  return at;
}
