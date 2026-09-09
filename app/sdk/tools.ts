/**
 * The Correspondent's surface: §6.1's six, and the two §4.6 affordances beside
 * them.
 *
 * THE SIX COME FROM `mcp/tools.ts` UNCHANGED. §6.1 defines the surface once and
 * "every transport that exposes it exposes the same schema" (T-P15-4), so this
 * module reads that table rather than restating it — the same rule the counter
 * follows.
 *
 * THE TWO ARE NOT AMONG THEM, and the distinction is load-bearing (D-159).
 * `generate_mailbox` and `register_agent` are §4.6 affordances: no conformance
 * class is tested against them, no claim names them, and a Correspondent that
 * brought its own topics would never call either. They are marked here, in the
 * table, so that a transport cannot accidentally present eight verbs as though
 * §6.1 defined eight. Their input schemas are RELEASE artifacts under
 * `sdk/schemas/`, in a `urn:wishmail:app:0.5:affordance:` space that cannot be
 * mistaken for a registered one or for a tool's.
 *
 * THEIR DESCRIPTIONS SAY WHAT THEY REFUSE, because goose will meet the
 * refusals. Every one of them is idempotent against consensus rather than
 * against local state, so "it did nothing and said so" is the ordinary outcome
 * of a second call and must not read as a failure.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AnySchemaObject } from 'ajv';
import { tools as specTools, type ToolDefinition } from '../src/mcp/tools.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export const AFFORDANCE_NAMES = ['generate_mailbox', 'register_agent'] as const;
export type AffordanceName = (typeof AFFORDANCE_NAMES)[number];

export interface Affordance {
  readonly name: AffordanceName;
  readonly summary: string;
  /** What it will not do, and why. goose shows this to a user who asks for it. */
  readonly refuses: readonly string[];
  readonly inputSchema: AnySchemaObject;
}

function affordanceSchema(name: AffordanceName): AnySchemaObject {
  return JSON.parse(fs.readFileSync(path.join(here, 'schemas', `${name}.input.schema.json`), 'utf8')) as AnySchemaObject;
}

export function affordances(): readonly Affordance[] {
  return [
    {
      name: 'generate_mailbox',
      summary:
        'Stand up this agent’s own six topics and its HCS-11 declaration, under this agent’s own key (§4.6, §9.2). ' +
        'Not one of §6.1’s six tools: no conformance class is tested against it.',
      refuses: [
        'It creates nothing if this agent already resolves under hcs14. That is not a failure: a second doorbell cannot be undone, and §9.5 assigns `vague` where more than one registration names an address.',
        'It refuses if the agent has no account yet. The account is BOUGHT, not funded — buy a mailbox at the counter first, and the stamp transfer to your public-key alias creates it (§4.6, HIP-542).',
        'It refuses if the profile file topic already holds messages this run did not write. An HCS-1 topic has no admin key, so nothing there can be corrected.',
        'It does not return until the resolver, run from a mirror node with nothing configured, answers with the coordinates it just created. A declaration nobody can read is not a declaration.',
      ],
      inputSchema: affordanceSchema('generate_mailbox'),
    },
    {
      name: 'register_agent',
      summary:
        'Submit this agent’s own registration on the HOL anchor §9.5 names, with the agent as payer and signer (§4.6). ' +
        'Not one of §6.1’s six tools.',
      refuses: [
        'It creates nothing if this account is already registered on the anchor.',
        'It refuses if another account has already registered this address: §9.5 would then assign `vague` to every resolution of it, permanently.',
        'It refuses if this agent holds no ℏ. The agent pays for its own name — that is what keeps `blurred` off its `hol` resolution (T-P13-4) — and the mailbox purchase funds exactly that one fee.',
        'It uses no borrowed payer, deliberately. The whole value of the act is that the mirror records THIS account as the payer.',
      ],
      inputSchema: affordanceSchema('register_agent'),
    },
  ];
}

/** The six of §6.1, exactly as the specification's own table gives them. */
export function six(): readonly ToolDefinition[] {
  return specTools();
}
