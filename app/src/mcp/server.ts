/**
 * The MCP server — §14.2's resource server, and the transport §6.1's surface
 * is served over.
 *
 * §14.2: "The resource server is the Postmaster's MCP server; a WebMCP page is
 * a client of it and never the resource server, because the `402` and the retry
 * that answers it are one exchange whose requirements the resource server
 * issued and must recognize."
 *
 * The tools are registered through the LOW-LEVEL `Server` rather than
 * `McpServer.registerTool`, and that is deliberate. `registerTool` takes Zod
 * schemas and converts them; our schemas are JSON Schema draft 2020-12, in
 * `spec/schemas/` and `src/mcp/schemas/`, and MCP's own wire format for
 * `tools/list` is JSON Schema. Going through a Zod translation would put a
 * conversion between the schema this release ships and the schema it serves,
 * and T-P15-4 is exactly the test that those are the same object. Here they are
 * the same object.
 *
 * Every body returns NOT_IMPLEMENTED and names the tests it will answer to.
 *
 * Conformance: T-P15-4, T-P11-6.
 */
import { pathToFileURL } from 'node:url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { repoRoot } from '../ops/env.js';
import { RELEASE, claimsAnything } from '../release.js';
import { bundled } from './bundle.js';
import { NotImplemented, TOOL_NAMES, tool, tools, type ToolName } from './tools.js';

/**
 * The guard that keeps the scaffold from outliving the claim.
 *
 * §1.5: "A claim MUST NOT name a class whose suite did not pass in full"
 * (T-P15-3). Every tool body here throws NOT_IMPLEMENTED, so a release that
 * named a class would be claiming one whose suite cannot have passed. Rather
 * than trust that someone remembers to remove this comment, the server refuses
 * to start.
 */
export function assertScaffoldMatchesClaim(): void {
  if (claimsAnything()) {
    throw new Error(
      `release.ts names ${RELEASE.classes.join(', ')} while every tool body still returns ` +
        'NOT_IMPLEMENTED. A claim names no class whose suite did not pass in full (§1.5, T-P15-3).',
    );
  }
}

/**
 * The `tools/list` payload: the one definition of §6.1, bundled.
 *
 * "Bundled" and not "verbatim": the schemas `$ref` the registered schemas of
 * §18.5 by URN, and a client has no registry to resolve those against, so every
 * referenced resource is embedded under `$defs` with its `$id` intact
 * (`bundle.ts`). The `$ref`s are unchanged, so the URN still says which
 * registered schema is meant.
 */
export function toolList(): { tools: unknown[] } {
  const root = repoRoot();
  return {
    tools: tools().map((t) => ({
      name: t.name,
      description:
        `${t.summary} Used by ${t.usedBy.join(', ')}. ` +
        `Reads consensus: ${t.reads ? 'yes' : 'no'}; writes: ${t.writes ? 'yes' : 'no'}; pays: ${t.pays}. ` +
        `Failures: ${t.failures.join(', ')}.`,
      inputSchema: bundled(t.inputSchema, root),
      outputSchema: bundled(t.outputSchema, root),
      _meta: {
        'wishmail/spec': RELEASE.spec,
        'wishmail/conformance': t.conformance,
      },
    })),
  };
}

/** Build the server, with the six registered and every body unimplemented. */
export function build(): Server {
  assertScaffoldMatchesClaim();

  const server = new Server(
    { name: 'wishmail', version: RELEASE.spec },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, () => toolList());

  server.setRequestHandler(CallToolRequestSchema, (request) => {
    const name = request.params.name as ToolName;
    if (!(TOOL_NAMES as readonly string[]).includes(name)) {
      // Not one of the six. §6.1 fixes the surface at six verbs.
      return {
        isError: true,
        content: [
          {
            type: 'text' as const,
            text: `UNKNOWN_TOOL: ${String(request.params.name)}. The surface is six verbs: ${TOOL_NAMES.join(', ')} (§6.1).`,
          },
        ],
      };
    }
    const t = tool(name);
    const notImplemented = new NotImplemented(t);
    // The diagnostic goes in `_meta` and NOT in `structuredContent`. When a tool
    // declares an `outputSchema`, MCP validates `structuredContent` against it —
    // so a diagnostic put there is checked against the shape of a MailCoordinates
    // or an EvidenceBundle and rejected at the client, which turns "not built
    // yet" into a protocol error. Found by a live round trip.
    return {
      isError: true,
      content: [{ type: 'text' as const, text: notImplemented.message }],
      _meta: {
        'wishmail/code': notImplemented.code,
        'wishmail/tool': t.name,
        'wishmail/conformance': t.conformance,
        'wishmail/spec': RELEASE.spec,
        'wishmail/classes': RELEASE.classes,
      },
    };
  });

  return server;
}

/**
 * Run over stdio. The HTTP transport §14.2 needs for the `402` exchange lands
 * with `buy_stamp`'s body; a resource server that issues no requirements has
 * nothing to serve over HTTP yet, and standing one up now would be a surface
 * with nothing behind it.
 */
export async function main(): Promise<void> {
  const server = build();
  await server.connect(new StdioServerTransport());
}

// `pathToFileURL` and not a hand-built `file://` string: on Windows an absolute
// path is `C:...`, whose URL is `file:///C:/...` with three slashes, so the
// hand-built form never matched — the server started, registered nothing and
// exited, which reads to a client exactly like a crash.
const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
}
