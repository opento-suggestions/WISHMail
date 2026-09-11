/**
 * T-P15-4 — P-15 (Claims are scoped).
 *
 * Classes: all.
 * Register: NAMED (§6.1)
 * @fixture-kind artifact
 *
 * §A's sketch, verbatim — the scope of this test, which is not widened without
 * a decision (`conformance/README.md`):
 *
 *   Tool schemas served by every transport in the release are identical after canonicalization.
 *
 * EXPANDED 2026-09-10 over the two MCP transports this release ships: the
 * Postmaster's server (`app/src/mcp/server.ts`) and the Correspondent's
 * (`app/sdk/server.ts`).
 *
 * WHY THIS MATTERS AND WHAT IT IS GUARDING. §6.1 defines the surface once. A
 * transport that served a slightly different schema — one extra optional field,
 * one looser pattern — would make the same tool mean two things depending on
 * which door an agent came through, and a conformance claim naming "the tools of
 * §6.1" would name neither. Canonicalization (RFC 8785) is what makes the
 * comparison exact rather than approximate: two schemas that differ only in key
 * order are the same schema, and two that differ in anything else are not.
 *
 * WHAT THIS BODY COMPARES, STATED PLAINLY. The Postmaster's transport is asked
 * for its actual served payload, `toolList()`. The Correspondent's list is built
 * inside `build()`, which needs a live session box, so what is compared on that
 * side is its source — `six()` from `app/sdk/tools.ts` — put through the same
 * `bundled()` the Correspondent's handler applies to it at `sdk/server.ts:151-159`.
 * That is one step short of asking the running server, and the step is named
 * here rather than glossed.
 *
 * The structural guarantee underneath is stronger than the comparison: `six()`
 * returns `specTools()` unchanged, so the two transports do not have two tables
 * that must be kept in step — they have one. This test is what would notice if
 * that ever stopped being true.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import canonicalize from 'canonicalize';
import { bundled } from '../../app/src/mcp/bundle.js';
import { toolList } from '../../app/src/mcp/server.js';
import { TOOL_NAMES, tools } from '../../app/src/mcp/tools.js';
import { affordances, six } from '../../app/sdk/tools.js';
import { schemas } from '../../app/src/schema/loader.js';
import { REPO_ROOT } from '../support/fixtures.js';

function canonical(value: unknown): string {
  const s = canonicalize(value);
  assert.ok(s !== undefined, 'the schema canonicalizes (RFC 8785)');
  return s;
}

test('T-P15-4 — Claims are scoped', () => {
  const root = schemas(REPO_ROOT).dir;

  // --- §6.1 fixes six verbs, and both transports serve those six. ---------
  assert.equal(TOOL_NAMES.length, 6, '§6.1 defines six tools');

  const postmaster = new Map(
    (toolList().tools as { name: string; inputSchema: unknown; outputSchema: unknown }[]).map((t) => [t.name, t]),
  );
  const correspondent = new Map(
    six().map((t) => [
      t.name,
      { name: t.name, inputSchema: bundled(t.inputSchema, root), outputSchema: bundled(t.outputSchema, root) },
    ]),
  );

  assert.deepEqual(
    [...postmaster.keys()].sort(),
    [...TOOL_NAMES].sort(),
    'the Postmaster transport serves exactly §6.1`s six',
  );
  assert.deepEqual(
    [...correspondent.keys()].sort(),
    [...TOOL_NAMES].sort(),
    'and so does the Correspondent transport',
  );

  // --- Identical after canonicalization. ----------------------------------
  for (const name of TOOL_NAMES) {
    const a = postmaster.get(name);
    const b = correspondent.get(name);
    assert.ok(a !== undefined && b !== undefined, `${name} is on both transports`);
    assert.equal(canonical(a.inputSchema), canonical(b.inputSchema), `${name}: one input schema, not two (§6.1)`);
    assert.equal(canonical(a.outputSchema), canonical(b.outputSchema), `${name}: one output schema, not two`);
  }

  // --- And the table itself is one table. ---------------------------------
  assert.equal(
    canonical(six().map((t) => ({ name: t.name, inputSchema: t.inputSchema, outputSchema: t.outputSchema }))),
    canonical(tools().map((t) => ({ name: t.name, inputSchema: t.inputSchema, outputSchema: t.outputSchema }))),
    "the Correspondent reads §6.1's own table rather than restating it",
  );

  // --- The §4.6 affordances are NOT among the six, and say so. ------------
  //
  // D-159: no conformance class is tested against `generate_mailbox` or
  // `register_agent`, and their schemas live in a namespace that cannot be
  // mistaken for a registered one. A transport presenting eight verbs as though
  // §6.1 defined eight is exactly what this separation prevents.
  for (const affordance of affordances()) {
    assert.equal(
      (TOOL_NAMES as readonly string[]).includes(affordance.name),
      false,
      `${affordance.name} is a §4.6 affordance and not one of §6.1's six`,
    );
    assert.equal(
      postmaster.has(affordance.name),
      false,
      `${affordance.name} is not served as a §6.1 tool by the Postmaster transport`,
    );
    assert.match(
      String((affordance.inputSchema as { $id?: unknown }).$id ?? ''),
      /^urn:wishmail:app:0\.5:affordance:/,
      `${affordance.name}'s schema is in the affordance namespace, not a registered one`,
    );
  }

  // Serving twice gives the same bytes, so "identical" is a property of the
  // surface and not of one call.
  assert.equal(canonical(toolList()), canonical(toolList()), 'the served payload is stable across calls');
});
