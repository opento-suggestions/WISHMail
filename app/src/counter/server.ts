/**
 * The counter — the Postmaster's Streamable HTTP MCP server.
 *
 * §14.2: "The resource server is the Postmaster's MCP server; a WebMCP page is
 * a client of it and never the resource server, because the `402` and the retry
 * that answers it are one exchange whose requirements the resource server
 * issued and must recognize."
 *
 * THREE TOOLS, AND ONLY THREE. `buy_stamp`, because the counter is the only
 * party that can submit a purchase; and `verify` and `resolve`, because a
 * caller may as well use ours and neither needs anything of ours to run — both
 * read a mirror node and nothing else (P-4). `send`, `inbox` and `ack` are NOT
 * here: they need the agent's own keys, and the Postmaster holds none, ever
 * (P-13, T-P13-1). A Correspondent runs those in its own process.
 *
 * THE SCHEMAS ARE `mcp/tools.ts`'s, UNCHANGED. §6.1 defines the surface once and
 * "every transport that exposes it exposes the same schema" (T-P15-4), so this
 * server reads that table rather than restating it, exactly as the stdio server
 * does.
 *
 * CARRY, AND ITS ONE PLACE. The service side of `send` is implemented only where
 * the `hbar` leg needs it — inside `buy_stamp` (D-157, LIMITATIONS L-5). The
 * counter carries a purchase body it built itself and refuses everything else,
 * and a refusal leaves no mark (§3.5).
 *
 * Conformance: T-P15-4, T-P11-2, T-P11-5, T-P11-6, T-P13-3, T-P16-1, T-P4-1.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { pathToFileURL } from 'node:url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { Client } from '@hashgraph/sdk';
import { loadEnv } from '../ops/env.js';
import { fromEnv, persistentIdentity } from '../ops/identity.js';
import { Mirror } from '../ops/mirror.js';
import { Record_ } from '../ops/record.js';
import { RELEASE } from '../release.js';
import { bundled } from '../mcp/bundle.js';
import { tool, tools, type ToolDefinition } from '../mcp/tools.js';
import { liveReader } from '../../sdk/live.js';
import { mirrorSource, resolveHcs14 } from '../resolve/hcs14.js';
import { resolveHol } from '../resolve/hol.js';
import { verify } from '../tools/verify.js';
import { CounterRefusal, quotePurchase, settlePurchase, type CounterContext, type Holder } from './purchase.js';

/** The three the counter serves, of §6.1's six. */
const SERVED = ['buy_stamp', 'verify', 'resolve'] as const;
type ServedName = (typeof SERVED)[number];

function servedTools(): readonly ToolDefinition[] {
  return tools().filter((t) => (SERVED as readonly string[]).includes(t.name));
}

export interface CounterConfig {
  readonly ctx: CounterContext;
  readonly holAnchors: readonly string[];
}

interface BuyStampInput {
  readonly count?: number;
  readonly payment?: {
    readonly method?: string;
    readonly from?: string;
    readonly quoteRef?: string;
    readonly signature?: { readonly publicKey?: string; readonly value?: string };
  };
  readonly holder?: Holder;
  readonly provision?: boolean;
}

function textResult(payload: unknown, structured?: Record<string, unknown>): Record<string, unknown> {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
    ...(structured === undefined ? {} : { structuredContent: structured }),
  };
}

function errorResult(code: string, message: string): Record<string, unknown> {
  return {
    isError: true,
    content: [{ type: 'text' as const, text: `${code}: ${message}` }],
    _meta: { 'wishmail/code': code, 'wishmail/spec': RELEASE.spec },
  };
}

/**
 * `buy_stamp`, both halves of §14.2's exchange, over one tool.
 *
 * With no signature it QUOTES: the requirement comes back in `_meta` — never in
 * `structuredContent`, which MCP validates against the tool's `outputSchema`
 * and which is a `StampReceipt`. A requirement is not a receipt and putting one
 * there would turn "not paid yet" into a protocol error at the client, which is
 * the same lesson the stdio server's `NOT_IMPLEMENTED` diagnostic learned.
 *
 * With a signature it SETTLES and returns the receipt.
 */
async function buyStamp(cfg: CounterConfig, input: BuyStampInput): Promise<Record<string, unknown>> {
  const method = input.payment?.method;
  if (typeof method !== 'string') return errorResult('STAMP_METHOD_UNSUPPORTED', 'payment.method is required (§6.3)');
  if (input.holder === undefined) return errorResult('STAMP_HOLDER_INVALID', 'holder is required (§6.3)');

  const signature = input.payment?.signature;
  if (signature?.publicKey !== undefined && signature.value !== undefined) {
    const reference = input.payment?.quoteRef;
    if (typeof reference !== 'string') {
      return errorResult('STAMP_PAYMENT_FAILED', 'a signed purchase names the quote it answers (payment.quoteRef)');
    }
    const receipt = await settlePurchase(cfg.ctx, reference, signature.publicKey, signature.value);
    return textResult(receipt, { receipt: receipt as unknown as Record<string, unknown> });
  }

  const requirement = await quotePurchase(cfg.ctx, {
    count: input.count ?? 1,
    method,
    holder: input.holder,
    provision: input.provision === true,
    ...(input.payment?.from === undefined ? {} : { buyer: input.payment.from }),
  });
  return {
    isError: true,
    content: [
      {
        type: 'text' as const,
        text:
          `PAYMENT_REQUIRED — this purchase is quoted and nothing is signed. Sign the body in your own process ` +
          `and call buy_stamp again with payment.quoteRef and payment.signature. The Postmaster holds no key of ` +
          `yours and never will (P-13).\n\n${JSON.stringify(requirement, null, 2)}`,
      },
    ],
    _meta: {
      'wishmail/code': 'PAYMENT_REQUIRED',
      'wishmail/requirement': requirement,
      'wishmail/spec': RELEASE.spec,
    },
  };
}

async function resolveTool(cfg: CounterConfig, input: { address?: string; profile?: string }): Promise<Record<string, unknown>> {
  const address = input.address;
  if (typeof address !== 'string') return errorResult('RESOLVE_UNSUPPORTED_ADDRESS', 'address is required (§6.2)');
  const profile = input.profile ?? 'hcs14';
  const source = mirrorSource(cfg.ctx.mirror);
  // The caller's manifest topic is where the proof WOULD be published, and a
  // counter publishes none: it resolves on someone else's behalf. So it answers
  // with the address's own account in that slot and says so — the coordinates
  // are the answer, and the proof travels when a sender publishes it (§6.2).
  const result =
    profile === 'hol'
      ? await resolveHol(source, cfg.ctx.ledgerTag, address, address, cfg.holAnchors)
      : profile === 'hcs14'
        ? await resolveHcs14(source, cfg.ctx.ledgerTag, address, address)
        : { failure: 'RESOLVE_PROFILE_MISMATCH' as const, detail: `this release resolves hcs14 and hol, not ${profile}` };
  if ('failure' in result) return errorResult(result.failure, result.detail);
  return textResult(result.coordinates, { coordinates: result.coordinates as unknown as Record<string, unknown> });
}

async function verifyTool(cfg: CounterConfig, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const scope = input['scope'] as { lane?: string; topics?: string[]; envelopeId?: string } | undefined;
  if (scope === undefined) return errorResult('VERIFY_SCOPE_INVALID', 'a scope names a lane, an envelope on a lane, or a set of topics');
  // The Verifier's half takes a READER — a mirror URL and a ledger tag, and
  // nothing else. Nothing of the counter's keys, treasury or store reaches it,
  // which is P-4 enforced by the type rather than promised in a comment.
  const reader = liveReader(cfg.ctx.mirrorNodeUrl, cfg.ctx.ledgerTag);
  const out = await verify(reader, scope, {
    ...(input['window'] === undefined ? {} : { window: input['window'] as { from: string; to: string } }),
    narrative: input['narrative'] === true,
    mirror: cfg.ctx.mirrorNodeUrl,
  });
  return textResult(out, out as unknown as Record<string, unknown>);
}

/** The MCP server, with the three tools registered from the one table. */
export function build(cfg: CounterConfig): Server {
  const server = new Server({ name: 'wishmail-counter', version: RELEASE.spec }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: servedTools().map((t) => ({
      name: t.name,
      description:
        `${t.summary} Used by ${t.usedBy.join(', ')}. ` +
        `Reads consensus: ${t.reads ? 'yes' : 'no'}; writes: ${t.writes ? 'yes' : 'no'}; pays: ${t.pays}. ` +
        `Failures: ${t.failures.join(', ')}.`,
      inputSchema: bundled(t.inputSchema, cfg.ctx.repoRoot),
      outputSchema: bundled(t.outputSchema, cfg.ctx.repoRoot),
      _meta: { 'wishmail/spec': RELEASE.spec, 'wishmail/conformance': t.conformance },
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name as ServedName;
    if (!(SERVED as readonly string[]).includes(name)) {
      return errorResult(
        'UNKNOWN_TOOL',
        `${String(request.params.name)} is not served here. The counter serves ${SERVED.join(', ')}; ` +
          '`send`, `inbox` and `ack` need your own keys and run in your own process (P-13).',
      );
    }
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;
    try {
      if (name === 'buy_stamp') return await buyStamp(cfg, args as BuyStampInput);
      if (name === 'resolve') return await resolveTool(cfg, args as { address?: string; profile?: string });
      return await verifyTool(cfg, args);
    } catch (e) {
      if (e instanceof CounterRefusal) return errorResult(e.reason, e.message.slice(e.reason.length + 2));
      const t = tool(name);
      return errorResult(t.failures[0] ?? 'STAMP_PAYMENT_FAILED', e instanceof Error ? e.message : String(e));
    }
  });

  return server;
}

/**
 * Serve it over Streamable HTTP, statelessly.
 *
 * A new `Server` and transport per request, with no session id: the counter's
 * state that matters is the DURABLE one — the requirements it issued and the
 * references it settled — and that lives in `state/store.ts` because §14.2
 * requires it to survive a restart (T-P11-6). Session state in memory would be
 * a second place for the exchange to live and the wrong one.
 */
export async function serve(cfg: CounterConfig, bind: string, port: number): Promise<void> {
  const http = createServer((req: IncomingMessage, res: ServerResponse) => {
    void (async () => {
      try {
        const server = build(cfg);
        // STATELESS: no session id. The two casts are the MCP SDK type meeting
        // `exactOptionalPropertyTypes`, which this repository has on and the SDK
        // does not: its options type spells the stateless mode as an ABSENT
        // sessionIdGenerator while typing the field as required, and its
        // Transport spells `onclose` the same way. Narrow, local, and about the
        // shape of an optional field rather than about behaviour.
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
        } as unknown as ConstructorParameters<typeof StreamableHTTPServerTransport>[0]);
        res.on('close', () => {
          void transport.close();
          void server.close();
        });
        await server.connect(transport as unknown as Parameters<typeof server.connect>[0]);
        await transport.handleRequest(req, res);
      } catch (e) {
        if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
      }
    })();
  });
  await new Promise<void>((resolve) => http.listen(port, bind, resolve));
  console.log(`the counter is at http://${bind}:${port}/  — buy_stamp, verify, resolve (§14.2)`);
}

export async function main(): Promise<void> {
  const env = loadEnv();
  const record = Record_.load(env.repoRoot, env.mirrorNodeUrl);
  const operator = fromEnv('operator', 'OPERATOR_DER_KEY');
  const treasury = persistentIdentity('treasury', 'TREASURY', { persist: false }).signer;

  const token = record.get('postage.token')?.id;
  const treasuryId = record.get('treasury.account')?.id;
  const priceTopic = record.get('prices.topic')?.id;
  if (!token || !treasuryId || !priceTopic) {
    throw new Error('the counter needs the stamp token, its treasury and the price topic in the ops record; run provisioning first');
  }

  const client = Client.forName(env.network);
  client.setOperatorWith(env.operatorId, operator.publicKey, operator.sign);

  const ctx: CounterContext = {
    repoRoot: env.repoRoot,
    ledgerTag: env.constants.ledgerTag,
    mirror: new Mirror(env.mirrorNodeUrl),
    mirrorNodeUrl: env.mirrorNodeUrl,
    client,
    stateDir: env.stateDir,
    operatorId: env.operatorId,
    operator,
    treasuryId,
    treasury,
    stampToken: token,
    priceTopic,
  };

  const pins = JSON.parse(fs.readFileSync(path.join(env.repoRoot, 'spec', 'pins.json'), 'utf8')) as {
    registryAnchors?: { hol?: Record<string, readonly string[]> };
  };

  await serve(
    { ctx, holAnchors: pins.registryAnchors?.hol?.[env.constants.ledgerTag] ?? [] },
    env.mcpBind,
    env.mcpPort ?? 4600,
  );
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
}
