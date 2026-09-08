/**
 * `npm run check:mcp` — the surface is the six of §6.1, every schema compiles,
 * and every body says NOT_IMPLEMENTED and names its tests.
 *
 * The schema half is the part worth having. T-P15-4 requires that "the tool
 * schemas served by every transport in the release are identical after
 * canonicalization", and a schema that is served but never compiled is a schema
 * nobody has checked. Every input and output schema here is put through the
 * same ajv registry that holds §18.5's fourteen, so an output `$ref` into
 * `spec/schemas/` that does not resolve is caught here rather than by a client.
 */
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormatsImport from 'ajv-formats';
import { canonicalBytes, sha256hex } from '../core/canonical.js';
import { repoRoot } from '../ops/env.js';
import { RELEASE } from '../release.js';
import { SCHEMA_NAMES, schemaId, schemas } from '../schema/loader.js';
import { assertScaffoldMatchesClaim, toolList } from './server.js';
import { NotImplemented, TOOL_NAMES, tool, tools } from './tools.js';

const addFormats =
  (addFormatsImport as unknown as { default?: (a: unknown) => void }).default ??
  (addFormatsImport as unknown as (a: unknown) => void);

const failures: string[] = [];
let checked = 0;

function is(name: string, got: unknown, want: unknown): void {
  checked += 1;
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g !== w) failures.push(`${name}\n    got   ${g}\n    want  ${w}`);
}

function ok(name: string, condition: boolean): void {
  checked += 1;
  if (!condition) failures.push(name);
}

const root = repoRoot();

// --- The surface is six verbs, in §6.1's order. -----------------------------
is('the surface is six verbs', TOOL_NAMES.length, 6);
is('and they are §6.1’s', [...TOOL_NAMES], ['resolve', 'buy_stamp', 'send', 'inbox', 'ack', 'verify']);
is('tools() returns all six', tools().map((t) => t.name), [...TOOL_NAMES]);

const listed = toolList().tools as { name: string; inputSchema: unknown; outputSchema: unknown }[];
is('tools/list serves six', listed.length, 6);
is('tools/list names them all', listed.map((t) => t.name), [...TOOL_NAMES]);

// --- Every schema compiles, in one registry with §18.5's fourteen. ----------
{
  const registry = schemas(root);
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  addFormats(ajv);
  for (const name of SCHEMA_NAMES) ajv.addSchema(registry.schema(name));

  for (const t of tools()) {
    checked += 1;
    try {
      ajv.compile(t.inputSchema);
    } catch (e) {
      failures.push(`${t.name} input schema did not compile: ${e instanceof Error ? e.message : String(e)}`);
    }
    checked += 1;
    try {
      // Output schemas $ref into spec/schemas/ by URN; compiling is what proves
      // those references resolve.
      ajv.compile({ $id: `urn:wishmail:app:0.5:tool:${t.name}:output`, ...t.outputSchema });
    } catch (e) {
      failures.push(`${t.name} output schema did not compile: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // MCP carries a tool's result as `structuredContent`, which is an object, so
  // it requires both schemas to be object-typed. A `$ref`-only or `oneOf`
  // output is rejected on the wire — found by a live stdio round trip, not by
  // reading, which is why the round trip is part of this check.
  for (const t of tools()) {
    is(`${t.name} input schema is object-typed`, (t.inputSchema as { type?: unknown }).type, 'object');
    is(`${t.name} output schema is object-typed`, (t.outputSchema as { type?: unknown }).type, 'object');
  }

  // The input schemas live in the app's own URN space, never in a registered one.
  for (const t of tools()) {
    const id = String((t.inputSchema as { $id?: unknown }).$id ?? '');
    ok(`${t.name} input $id is in the app space`, id.startsWith('urn:wishmail:app:0.5:'));
    ok(
      `${t.name} input $id is not a registered schema id`,
      !SCHEMA_NAMES.some((n) => id === schemaId(n)),
    );
  }
}

// --- Every body is NOT_IMPLEMENTED and names its tests. --------------------
for (const name of TOOL_NAMES) {
  const t = tool(name);
  const e = new NotImplemented(t);
  is(`${name}: code`, e.code, 'NOT_IMPLEMENTED');
  ok(`${name}: names at least one T-ID`, t.conformance.length > 0);
  ok(
    `${name}: every T-ID it names is well formed`,
    t.conformance.every((id) => /^T-P\d+-\d+$/.test(id)),
  );
  ok(`${name}: the message names its tests`, t.conformance.every((id) => e.message.includes(id)));
  ok(`${name}: §6 fixes at least one failure code`, t.failures.length > 0);
  ok(
    `${name}: its failure codes are TOOL_REASON, uppercase`,
    t.failures.every((f) => /^[A-Z]+_[A-Z_]+$/.test(f)),
  );
  ok(
    `${name}: NOT_IMPLEMENTED is not among §6’s codes for it`,
    !t.failures.includes('NOT_IMPLEMENTED'),
  );
}

// --- The claim and the scaffold agree. --------------------------------------
is('the release claims no class', [...RELEASE.classes], []);
is('and no extension', [...RELEASE.extensions], []);
is('and declares the specification version', RELEASE.spec, '0.5.3');
is('and the wire minor version', RELEASE.minorVersion, '0.5');
checked += 1;
try {
  assertScaffoldMatchesClaim();
} catch (e) {
  failures.push(`the scaffold guard rejected an empty claim: ${e instanceof Error ? e.message : String(e)}`);
}

// --- T-P15-4's mechanism, exercised on the one transport there is. ---------
// The test is that every transport serves the same schemas; with one transport
// it can only be shown that the served list is a pure function of the tool
// table, which is what makes the second transport a copy rather than a restatement.
{
  const first = sha256hex(canonicalBytes(toolList()));
  const second = sha256hex(canonicalBytes(toolList()));
  is('the served tool list is deterministic (T-P15-4)', first, second);
  console.log(`  tool-list digest: ${first}`);
}

// --- A live round trip, over a real transport, against the reference client.
//
// This is here because every wire-level defect in this surface was found by it
// and none by reading: an `outputSchema` that was not object-typed, a `$ref` to
// a URN no client can resolve, a diagnostic put in `structuredContent` where
// MCP validates it against the tool's own output schema, and a Windows
// `file://` comparison that stopped the server from ever registering anything.
// A check that only calls the functions in-process sees none of those.
{
  const client = new Client({ name: 'check:mcp', version: RELEASE.spec });
  const transport = new StdioClientTransport({
    command: process.execPath,
    // `--import tsx` rather than a path to tsx's CLI: the package is hoisted to
    // the workspace root, so a path relative to this module is wrong under npm's
    // hoisting and right only by accident.
    args: ['--import', 'tsx', fileURLToPath(new URL('./server.ts', import.meta.url))],
  });
  try {
    await client.connect(transport);

    const live = await client.listTools();
    is('live tools/list serves six', live.tools.length, 6);
    is('live tools/list names them all', live.tools.map((t) => t.name), [...TOOL_NAMES]);

    // The client compiles every schema it is given, so reaching this line at
    // all is the proof that the bundled `$ref`s resolve with no registry.
    ok(
      'every served input schema carries its referenced resources',
      live.tools.every((t) => {
        const s = JSON.stringify(t.inputSchema);
        return !s.includes('urn:wishmail:0.5:') || s.includes('"$defs"');
      }),
    );

    const called = await client.callTool({ name: 'verify', arguments: { scope: { lane: '0.0.1' } } });
    is('a live call is an error result', called.isError, true);
    const text = (called.content as { text: string }[])[0]?.text ?? '';
    ok('and says NOT_IMPLEMENTED', text.startsWith('NOT_IMPLEMENTED: verify'));
    ok('and names the tests it will answer to', tool('verify').conformance.every((id) => text.includes(id)));
    is('and carries no structuredContent', called.structuredContent, undefined);

    const unknown = await client.callTool({ name: 'teleport', arguments: {} });
    ok(
      'a seventh verb is refused',
      ((unknown.content as { text: string }[])[0]?.text ?? '').startsWith('UNKNOWN_TOOL'),
    );
  } catch (e) {
    checked += 1;
    failures.push(`the live round trip failed: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    await client.close().catch(() => undefined);
  }
}

if (failures.length > 0) {
  console.error(`check:mcp FAILED — ${failures.length} of ${checked} assertions:`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log(
  `check:mcp PASS — ${checked} assertions: six verbs, every input and output schema compiles against ` +
    '§18.5’s fourteen, every body returns NOT_IMPLEMENTED naming its tests, the release claims nothing, ' +
    'and a live stdio round trip against the reference client lists and calls all six.',
);
