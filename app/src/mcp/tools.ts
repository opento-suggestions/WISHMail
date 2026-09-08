/**
 * The six tools of §6.1 — the surface, its schemas, and the tests each answers to.
 *
 * §6.1: "WISHMail's tool surface is six verbs acting on one noun. Each tool is
 * defined once, here; every transport that exposes it — a WebMCP page, an MCP
 * server, an SDK, a command line — exposes the same schema." T-P15-4 is the
 * test: "the tool schemas served by every transport in the release are
 * identical after canonicalization." So this module is the one definition, and
 * every transport reads it rather than restating it.
 *
 * WHERE THE SCHEMAS LIVE, AND WHY THEY ARE NOT ALL IN spec/schemas/.
 * §18.5 fixes the fourteen files in `spec/schemas/`, one per §5 object plus the
 * §9.1 declaration, and §1.7 says a schema change without a specification
 * change is not a change to WISHMail. The six tools' *outputs* are §5 objects
 * and bind straight to those URNs. Their *inputs* are not: §6 gives them as
 * signatures, in prose. Neither is `inbox`'s `Delivery` (§6.5), which is
 * `{envelope, opened, payload?, reason?, returnReceipt?}` and no §5 object at
 * all. Adding files to `spec/schemas/` for them would be a specification
 * change; so they are release artifacts, under `src/mcp/schemas/`, with `$id`s
 * in a `urn:wishmail:app:` space that cannot be mistaken for a registered one.
 * Reported as a divergence with the Step 3 record.
 *
 * Conformance: T-P15-4.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { AnySchemaObject } from 'ajv';
import { repoRoot } from '../ops/env.js';
import { schemaId, type SchemaName } from '../schema/loader.js';

/** The six verbs, in §6.1's order. */
export const TOOL_NAMES = ['resolve', 'buy_stamp', 'send', 'inbox', 'ack', 'verify'] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

export interface ToolDefinition {
  readonly name: ToolName;
  /** The one-line purpose, in §6's words. */
  readonly summary: string;
  /** Which classes use it (§6.1's table). */
  readonly usedBy: readonly string[];
  /** Whether it reads consensus, writes it, and who pays (§6.1's table). */
  readonly reads: boolean;
  readonly writes: boolean;
  readonly pays: string;
  /** The tests this tool's body will answer to, from §6's `Conformance:` notes. */
  readonly conformance: readonly string[];
  /** §6's failure codes for this tool, `TOOL_REASON`, uppercase and fixed. */
  readonly failures: readonly string[];
  /** The input schema, a release artifact under `src/mcp/schemas/`. */
  readonly inputSchema: AnySchemaObject;
  /** The output schema, by reference. `$ref` into `spec/schemas/` where §5 has the object. */
  readonly outputSchema: AnySchemaObject;
}

/**
 * Resolved from the repository root rather than from this module's own
 * directory. The schemas are data, not code, so `tsc` does not copy them into
 * `dist/` and a module-relative path works under `tsx` and fails once built.
 * `spec/schemas/` is already read from the root the same way (`schema/loader.ts`).
 */
const schemaDir = path.join(repoRoot(), 'app', 'src', 'mcp', 'schemas');

function readSchema(file: string): AnySchemaObject {
  return JSON.parse(fs.readFileSync(path.join(schemaDir, file), 'utf8')) as AnySchemaObject;
}

function inputSchema(tool: ToolName): AnySchemaObject {
  return readSchema(`${tool}.input.schema.json`);
}

/**
 * An output schema, wrapped in an object.
 *
 * MCP requires a tool's `outputSchema` to be object-typed, because what it
 * carries back is `structuredContent`, which is an object. §6's outputs are not
 * all objects — `inbox` returns an array and `send` returns one of two things —
 * so each is carried in one named field of a wrapper.
 *
 * This is a TRANSPORT adaptation and not a change to §5: the object inside the
 * field is the registered schema, by `$ref`, unmodified. Every other transport
 * in this release wraps identically, because all of them read this table rather
 * than restating it, which is what T-P15-4 asks for.
 */
function wrap(field: string, inner: AnySchemaObject, description: string): AnySchemaObject {
  return {
    type: 'object',
    description,
    properties: { [field]: inner },
    required: [field],
    additionalProperties: false,
  };
}

/** An output that is exactly one §5 object, carried in one named field. */
function outputOf(field: string, name: SchemaName, description: string): AnySchemaObject {
  return wrap(field, { $ref: schemaId(name) }, description);
}

/** The `Delivery` output schema, the one output shape §5 does not define. */
function deliverySchema(): AnySchemaObject {
  return readSchema('delivery.output.schema.json');
}

let cached: readonly ToolDefinition[] | undefined;

/** The six, defined once. */
export function tools(): readonly ToolDefinition[] {
  if (cached !== undefined) return cached;

  cached = [
    {
      name: 'resolve',
      summary: 'Turn an address into coordinates and a resolution proof under a named profile.',
      usedBy: ['CORRESPONDENT', 'VERIFIER'],
      reads: true,
      writes: false,
      pays: 'nobody',
      conformance: ['T-P5-1', 'T-P5-2', 'T-P6-1', 'T-P12-1'],
      failures: [
        'RESOLVE_UNSUPPORTED_ADDRESS',
        'RESOLVE_PROFILE_MISMATCH',
        'RESOLVE_NOT_FOUND',
        'RESOLVE_REGISTRY_UNREACHABLE',
      ],
      inputSchema: inputSchema('resolve'),
      outputSchema: outputOf(
        'coordinates',
        'mail-coordinates',
        '§6.2 — MailCoordinates (§5.3), with a resolution proof whose uri is empty until send publishes the manifest.',
      ),
    },
    {
      name: 'buy_stamp',
      summary: 'Buy stamps from the Postmaster.',
      usedBy: ['CORRESPONDENT', 'POSTMASTER'],
      reads: true,
      writes: true,
      pays: 'the buyer',
      conformance: ['T-P11-2', 'T-P16-1'],
      failures: [
        'STAMP_PAYMENT_FAILED',
        'STAMP_PAYMENT_UNSETTLED',
        'STAMP_HOLDER_INVALID',
        'STAMP_METHOD_UNSUPPORTED',
      ],
      inputSchema: inputSchema('buy_stamp'),
      outputSchema: outputOf('receipt', 'stamp-receipt', '§6.3 — StampReceipt (§5.4), whose txRef is the transfer.'),
    },
    {
      name: 'send',
      summary: 'Send one sealed envelope to one resolved address.',
      usedBy: ['CORRESPONDENT', 'POSTMASTER'],
      reads: true,
      writes: true,
      pays: 'the sender, in stamps; the Postmaster, in fees',
      conformance: ['T-P7-1', 'T-P7-2', 'T-P7-3', 'T-P9-5', 'T-P10-1', 'T-P14-1'],
      failures: [
        'SEND_UNRESOLVED',
        'SEND_INSUFFICIENT_STAMPS',
        'SEND_TOO_HEAVY',
        'SEND_STALE_KEY',
        'SEND_LANE_INVALID',
        'SEND_AFFIX_FAILED',
        'SEND_SUBMIT_FAILED',
        'SEND_SETTLE_TIMEOUT',
      ],
      inputSchema: inputSchema('send'),
      outputSchema: wrap(
        'result',
        { oneOf: [{ $ref: schemaId('postmark') }, { $ref: schemaId('attempted-delivery-slip') }] },
        '§6.4 — chunk 0’s Postmark (§5.7), or an AttemptedDeliverySlip (§5.9) when a first contact’s window closes. The slip is a result, not a failure (F-6).',
      ),
    },
    {
      name: 'inbox',
      summary: 'Read the caller’s lanes; open what binds.',
      usedBy: ['RECIPIENT', 'CORRESPONDENT'],
      reads: true,
      writes: false,
      pays: 'nobody',
      conformance: ['T-P1-1', 'T-P1-2', 'T-P8-1'],
      failures: ['INBOX_MIRROR_UNREACHABLE'],
      inputSchema: inputSchema('inbox'),
      outputSchema: wrap(
        'deliveries',
        { type: 'array', items: deliverySchema() },
        '§6.5 — [Delivery]. An envelope that fails any check is returned unopened with a reason; none of those reasons is a failure of the tool (P-12).',
      ),
    },
    {
      name: 'ack',
      summary: 'Acknowledge an envelope that opened: produce its return receipt.',
      usedBy: ['RECIPIENT', 'POSTMASTER'],
      reads: true,
      writes: true,
      pays: 'the sender, in advance',
      conformance: ['T-P1-3', 'T-P1-9', 'T-P16-2'],
      failures: ['ACK_NOT_OPENED', 'ACK_NOT_REQUESTED', 'ACK_DUPLICATE', 'ACK_SUBMIT_FAILED'],
      inputSchema: inputSchema('ack'),
      outputSchema: outputOf('receipt', 'return-receipt', '§6.6 — ReturnReceipt (§5.8), witnessed by the ScheduleSign of §10.4.'),
    },
    {
      name: 'verify',
      summary: 'Reconcile a correspondence from consensus alone.',
      usedBy: ['VERIFIER'],
      reads: true,
      writes: false,
      pays: 'nobody',
      conformance: ['T-P3-1', 'T-P4-1', 'T-P12-2'],
      failures: ['VERIFY_MIRROR_UNREACHABLE', 'VERIFY_SCOPE_INVALID'],
      inputSchema: inputSchema('verify'),
      outputSchema: {
        type: 'object',
        description:
          '§6.7 — an EvidenceBundle (§5.10), and a Narrative when one was asked for. Nothing is written. VERIFY_SCHEMA_UNRESOLVED is an appraisal on an envelope, not a failure of the tool.',
        properties: {
          bundle: { $ref: schemaId('evidence-bundle') },
          narrative: { $ref: schemaId('narrative') },
        },
        required: ['bundle'],
        additionalProperties: false,
      },
    },
  ];

  if (cached.length !== TOOL_NAMES.length) throw new Error('the tool table is not the six of §6.1');
  return cached;
}

/** One tool by name. */
export function tool(name: ToolName): ToolDefinition {
  const found = tools().find((t) => t.name === name);
  if (found === undefined) throw new Error(`no such tool: ${name}`);
  return found;
}

/**
 * What every body returns today.
 *
 * NOT_IMPLEMENTED is a build marker and NOT one of §6's `TOOL_REASON` codes:
 * §6.1 fixes those per tool and none of them means "this release has not built
 * this yet". It is here so that a caller is told the truth rather than given a
 * plausible empty object, and it names the tests the body will answer to when
 * it exists. `RELEASE.classes` is empty, so no class is claimed and no tool is
 * required to work (§1.5); `assertScaffoldMatchesClaim` is what keeps those two
 * facts from drifting apart.
 */
export class NotImplemented extends Error {
  readonly code = 'NOT_IMPLEMENTED';
  readonly tool: ToolName;
  readonly conformance: readonly string[];

  constructor(t: ToolDefinition) {
    super(
      `NOT_IMPLEMENTED: ${t.name} — ${t.summary} It will answer to ${t.conformance.join(', ')}. ` +
        'This release claims no conformance class (§1.5: silence claims nothing).',
    );
    this.name = 'NotImplemented';
    this.tool = t.name;
    this.conformance = t.conformance;
  }
}
