/**
 * The Correspondent's own MCP server — stdio, for goose.
 *
 * ONE PROCESS PER AGENT, and it is the SDK, the second-process fixture and the
 * demo client at once. Its keys are born in it and stay in it; the Postmaster
 * holds none of them, ever (P-13, T-P13-1). The only outbound call it makes is
 * `buy_stamp` to the counter, because a purchase cannot be submitted without
 * the Postmaster (§14.2); `resolve`, `inbox`, `ack` and `verify` run locally,
 * and `verify` with nothing but a mirror node, because it is the VERIFIER class
 * and P-4 says so.
 *
 * ALL SIX OF §6.1'S VERBS HAVE BODIES, as of Gate Two checkpoint two
 * (2026-09-10). `ack` was the last, and it was refused here rather than
 * half-working for as long as §10.4's schedule it witnesses did not exist — a
 * refusal that says which gate is a fact; a tool that returns a plausible empty
 * object is not. `send` now takes `returnReceipt`, because step 7 exists to
 * honour it.
 *
 * THE DOORBELL WATCHER RUNS BESIDE THE TOOLS. §6.1's verbs must stay answerable
 * while the door is being watched, so the watcher is a timer and not a loop.
 *
 * Conformance: T-P15-4, T-P4-1, T-P13-1, T-P13-2.
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { repoRoot } from '../src/ops/env.js';
import { runModeOnStderr } from '../src/ops/mode.js';
import { RELEASE } from '../src/release.js';
import { bundled } from '../src/mcp/bundle.js';
import { verify } from '../src/tools/verify.js';
import { ack } from '../src/tools/ack.js';
import { inbox } from '../src/tools/inbox.js';
import { lanesBetween, send } from '../src/tools/send.js';
import { mirrorSource, resolveHcs14, type MailCoordinates } from '../src/resolve/hcs14.js';
import { resolveHol } from '../src/resolve/hol.js';
import { TOOL_NAMES, tool, type ToolName } from '../src/mcp/tools.js';
import { CounterUnavailable, buyStamps } from './counter.js';
import { openHome } from './home.js';
import { HomeBusy, lockHome } from './lock.js';
import { liveReader } from './live.js';
import { ackContext, inboxContext, lanesOf, ringStamp, senderContext } from './letter.js';
import { MailboxRefusal, generateMailbox } from './mailbox.js';
import { RegistrationRefusal, registerAgent } from './registration.js';
import { boot, type Session } from './session.js';
import { affordances, six } from './tools.js';
import { watchDoorbell, type Watcher } from './watcher.js';

function ok(payload: unknown, structured?: Record<string, unknown>): Record<string, unknown> {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
    ...(structured === undefined ? {} : { structuredContent: structured }),
  };
}

/**
 * THE CODE goose SEES, AND THE TWO THINGS IT MUST NEVER BE.
 *
 * §6.3 fixes a tool’s failures as `STAMP_*` and §6 fixes the rest the same way,
 * so a caller can act on a code without reading prose. This handler used to map
 * every thrown error to `REFUSED`, which is a code the specification does not
 * define and a caller cannot do anything with.
 *
 * **And it must never be an exchange state.** `PAYMENT_REQUIRED`,
 * `PAYMENT_CARRYING` and `PAYMENT_CARRIED` are legs of §14.2’s exchange between
 * the Correspondent and the counter (LIMITATIONS L-5): they live on the
 * counter’s MCP, they are consumed inside `buyStamps`, and an agent talking to
 * THIS server has no business seeing one. If one ever reaches here it is a
 * defect in the client half, so it is translated rather than passed on — and
 * the message says so, because a code that lies about where a fault is costs
 * more than one that admits it.
 */
function codeFor(name: string, e: unknown): string {
  const carried = e instanceof CounterUnavailable ? e.code : '';
  if (carried.startsWith('STAMP_')) return carried;
  if (carried.startsWith('PAYMENT_')) return 'STAMP_PAYMENT_FAILED';
  if (e instanceof MailboxRefusal) return 'MAILBOX_REFUSED';
  if (e instanceof RegistrationRefusal) return 'REGISTER_REFUSED';
  // The tool’s own first failure, from §6’s table — the same fallback the
  // counter uses, and never a code this project invented.
  const known = (TOOL_NAMES as readonly string[]).includes(name);
  return known ? (tool(name as ToolName).failures[0] ?? 'REFUSED') : 'REFUSED';
}

/** An exchange state that reached the agent’s own surface is a defect, and says so. */
function detailFor(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  if (e instanceof CounterUnavailable && e.code.startsWith('PAYMENT_')) {
    return (
      `${message} — reported as STAMP_PAYMENT_FAILED because ${e.code} is a leg of the exchange between this ` +
      'Correspondent and the counter and is not a state this surface has. Seeing it here is a defect in the client ' +
      'half of the purchase, not in your call.'
    );
  }
  return message;
}

/**
 * WHAT A DRY RUN ANSWERS WITH, and why it is not an error.
 *
 * A verb that would sign says what it WOULD do and returns it as a result. It
 * is not a refusal: nothing went wrong, the input was accepted, and the caller
 * asked a question this process is able to answer. Making it an error would
 * teach a caller to retry, which is the opposite of the point.
 *
 * The `plan` is whatever the verb can say without signing — usually a quote or
 * a set of ids read from consensus. The one thing it never says is that
 * something happened.
 */
function planned(verb: string, what: string, plan: Record<string, unknown> = {}): Record<string, unknown> {
  const body = {
    dryRun: true,
    verb,
    wouldDo: what,
    ...plan,
    note:
      'Nothing was signed and nothing was spent: this process read no payer key and gave no client an operator. ' +
      'Restart the server with --live to sign.',
  };
  return {
    content: [{ type: 'text' as const, text: `DRY RUN — ${verb} would ${what}\n\n${JSON.stringify(body, null, 2)}` }],
    _meta: { 'wishmail/dryRun': true, 'wishmail/spec': RELEASE.spec },
  };
}

function refuse(code: string, message: string): Record<string, unknown> {
  return {
    isError: true,
    content: [{ type: 'text' as const, text: `${code}: ${message}` }],
    _meta: { 'wishmail/code': code, 'wishmail/spec': RELEASE.spec },
  };
}

/**
 * WHAT `buy_stamp` DOES ON *THIS* SURFACE, BEYOND §6.3'S SIGNATURE.
 *
 * §6.3 defines `buy_stamp` as buying stamps. On the Correspondent's MCP it is
 * also the whole of §4.6's provisioned path (D-168), and §14.2's exchange with
 * the counter happens INSIDE one call: the quote, the buyer's signature, the
 * transfer, the mailbox the Postmaster pays for, and the receipt. **The agent
 * calling this sees one result — a `StampReceipt`, or one §6 refusal.** None of
 * the exchange's intermediate states is a state of this tool.
 *
 * The sentence a caller most needs is about the SECOND call. A purchase that
 * stopped after the transfer leaves an account with no mailbox, and calling
 * again is the right move; the tool has to say so, because the alternative is
 * an agent that reads "the holder already has an account" and concludes there
 * is nothing to do.
 */
const BUY_STAMP_NOTE =
  ' On this surface it is also the whole of §4.6’s provisioned path when `provision` is set: the purchase, the mailbox ' +
  'the Postmaster pays for, and the receipt naming what it created — one call, one StampReceipt. **If a run stops part ' +
  'way, call it again with the same arguments**: it resumes the purchase this home already made, creates only what is ' +
  'missing, and never buys twice. It refuses with STAMP_HOLDER_INVALID only where this agent has an account and NO ' +
  'purchase is outstanding — which means either it already has a mailbox (buy without `provision`) or it brought its own ' +
  'account (use `generate_mailbox`, and your own operator pays).' +
  ' PRECONDITION for a NEW agent: call it with `provision: true` and `count: 12` BEFORE anything else — this agent ' +
  'has no account until this call creates one, and every other tool that writes will refuse until it does. ' +
  '`holder` and `payment` are JSON OBJECTS and never strings containing JSON. `holder` is REQUIRED by ' +
  'the schema and IGNORED by this surface: a Correspondent always buys for ITSELF — its own public key before it ' +
  'has an account, its own account after. Pass `{\"publicKey\": \"self\"}` to satisfy the schema, and know it is not read.';

/**
 * WHAT A MODEL GETS WRONG WHEN NOBODY TELLS IT — measured, 2026-09-11.
 *
 * The goose seam's first live run is in `app/OPERATIONS.md` as the Gate Zero
 * divergence. The model invented four address forms in a row — `demo`,
 * `0.0.10487063@hcs14`, `hcs14://0.0.10487063`, `test@test` — because nothing
 * on this surface ever showed it one. These notes are the cheapest possible
 * fix: the precondition, and for the two tools that take an address, the form
 * with a real example. No schema moves.
 */
const RESOLVE_NOTE =
  ' THE ADDRESS IS A HEDERA ACCOUNT ID and nothing else: `0.0.10462700`. CAIP-10 (`hedera:testnet:0.0.10462700`) ' +
  'and `uaid:` are also accepted; a name, a URL, a `scheme://` prefix and an `@profile` suffix are NOT, and come ' +
  'back RESOLVE_UNSUPPORTED_ADDRESS. The profile is a SEPARATE argument — `{"address": "0.0.10462700", "profile": ' +
  '"hcs14"}` — and never part of the address. Precondition: none. It reads a mirror node and pays nothing, so it ' +
  'works before this agent has an account (P-4).';

const SEND_NOTE =
  ' PRECONDITION: this agent must already have its mailbox — `buy_stamp` with `provision: true` — or this refuses ' +
  'SEND_UNRESOLVED. `coordinates` is the object `resolve` returned, PASSED THROUGH UNCHANGED: call `resolve` on ' +
  'the recipient first and hand its `coordinates` straight to this tool, never a re-typed address. `payload` is ' +
  'BASE64 of the bytes to send. Every object argument is a JSON OBJECT and never a string containing JSON.';

/**
 * The session, and the one moment it changes.
 *
 * A Correspondent boots before it has an account: the account is BOUGHT, and
 * the purchase that buys it is a tool call on this very server (§4.6, D-159).
 * Everything below the payer seam closes over an account id, so the session is
 * held in a box and re-booted once, at the moment the purchase creates one.
 * Nothing else mutates it: a fresh home is a new agent and an existing home is
 * a returning one (D-165), and neither is something a running process becomes.
 */
export interface SessionBox {
  s: Session;
  readonly reboot: () => Promise<void>;
}

/**
 * OBJECT ARGUMENTS THAT ARRIVE AS STRINGS, AND WHY THIS IS HERE.
 *
 * Measured, 2026-09-11, in goose's own session database (Gate Zero, Part A):
 * the model serialises nested object arguments as JSON STRINGS. Every
 * occurrence, both nights, across two sessions:
 *
 *   20260911_1 22:55:53  buy_stamp  holder:string  payment:string
 *   20260911_1 22:59:34  verify     scope:string   window:OBJECT   <- inconsistent
 *   20260912_1 00:24:16  buy_stamp  payment:string holder:string
 *   20260912_1 00:27:11  send       coordinates:string             <- the blocker
 *
 * `buy_stamp` survived it by accident, because its handler reads neither
 * `holder` nor `payment`. `send` did not: the guard below it tests
 * `typeof coordinates !== 'object'`, so the golden path ends at the letter
 * with SEND_UNRESOLVED. This is the whole of what stopped Gate Zero's second
 * question being asked at all.
 *
 * SO THE SURFACE IS LENIENT IN EXACTLY ONE DIRECTION. A string that parses to
 * a JSON OBJECT is parsed, and then validated exactly as an object would have
 * been — no validation is skipped and no refusal is softened. Anything else —
 * a string that does not parse, or one that parses to a number, a string, a
 * null or an array — is left as it arrived, and the handler refuses as before.
 *
 * WHAT IS NOT COERCED, and deliberately:
 *   - `payload`. It is base64 TEXT (§6.4: "payload is bytes", and a tool input
 *     is JSON), so a payload that happened to look like JSON must stay the
 *     string it is. It is not in the list below and must never be.
 *   - numbers and booleans. `count`, `provision`, `returnReceipt` and
 *     `dryRun` arrived correctly typed in every one of the calls above, so
 *     widening to them would be inventing a defect nobody has observed.
 *
 * No schema moves: this widens what is ACCEPTED, never what is published
 * (§1.7). LIMITATIONS L-14 records the leniency.
 */
const OBJECT_ARGUMENTS = ['coordinates', 'payment', 'holder', 'scope', 'window', 'receiptWindow'] as const;

/** A plain JSON object — not an array, not null. What the schemas mean by "object". */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Parse any of {@link OBJECT_ARGUMENTS} that arrived as a JSON string. Returns
 * the arguments to use, and the names of any that arrived as a string and
 * could NOT be read as an object — so a refusal can say that rather than
 * calling the argument missing, which sends a caller hunting for the wrong bug.
 */
export function readObjectArguments(args: Record<string, unknown>): {
  readonly args: Record<string, unknown>;
  readonly unreadable: readonly string[];
} {
  const out: Record<string, unknown> = { ...args };
  const unreadable: string[] = [];
  for (const key of OBJECT_ARGUMENTS) {
    const v = out[key];
    if (typeof v !== 'string') continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(v);
    } catch {
      unreadable.push(key);
      continue;
    }
    if (isPlainObject(parsed)) out[key] = parsed;
    else unreadable.push(key);
  }
  return { args: out, unreadable };
}

/** The sentence a refusal adds where the argument it wanted arrived as a string. */
export function arrivedAsString(key: string): string {
  return (
    `\`${key}\` arrived as a STRING containing text, and this tool takes an object. ` +
    'Pass it as a JSON object, not as a string with JSON inside it.'
  );
}

export function build(box: SessionBox, watcherFor: () => Watcher | undefined): Server {
  const server = new Server({ name: 'wishmail-correspondent', version: RELEASE.spec }, { capabilities: { tools: {} } });
  const root = repoRoot();

  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: [
      ...six().map((t) => ({
        name: t.name,
        description:
          `${t.summary}${t.name === 'buy_stamp' ? BUY_STAMP_NOTE : t.name === 'resolve' ? RESOLVE_NOTE : t.name === 'send' ? SEND_NOTE : ''} Used by ${t.usedBy.join(', ')}. ` +
          `Reads consensus: ${t.reads ? 'yes' : 'no'}; writes: ${t.writes ? 'yes' : 'no'}; pays: ${t.pays}. ` +
          `Failures: ${t.failures.join(', ')}.` +
          '',
        inputSchema: bundled(t.inputSchema, root),
        outputSchema: bundled(t.outputSchema, root),
        _meta: { 'wishmail/spec': RELEASE.spec, 'wishmail/conformance': t.conformance, 'wishmail/kind': 'tool' },
      })),
      ...affordances().map((a) => ({
        name: a.name,
        description: `${a.summary} It refuses: ${a.refuses.join(' ')}`,
        inputSchema: bundled(a.inputSchema, root),
        _meta: { 'wishmail/spec': RELEASE.spec, 'wishmail/kind': 'affordance', 'wishmail/conformance': [] },
      })),
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    // Object arguments that arrived as JSON strings are read as objects here,
    // ONCE, before any handler sees them — so every verb is lenient in the
    // same way and none of them is lenient twice.
    const raw = (request.params.arguments ?? {}) as Record<string, unknown>;
    const { args, unreadable } = readObjectArguments(raw);
    /** Name an argument that arrived as an unreadable string, for a refusal. */
    const asString = (key: string): string | null => (unreadable.includes(key) ? arrivedAsString(key) : null);
    const s = box.s;
    try {
      switch (name) {
        case 'resolve': {
          const address = args['address'];
          if (typeof address !== 'string') return refuse('RESOLVE_UNSUPPORTED_ADDRESS', 'address is required (§6.2)');
          const profile = (args['profile'] as string | undefined) ?? 'hcs14';
          const source = mirrorSource(s.mirror);
          // The proof's canonical location is THIS agent's manifest topic
          // (D-163), which it knows before it resolves anything — which is why
          // the sentence in §10.2 is a lookup rule and not a remark.
          const mine = s.record.get('manifest')?.id ?? s.account;
          const r =
            profile === 'hol'
              ? await resolveHol(source, s.ledgerTag, address, mine, s.holAnchors)
              : profile === 'hcs14'
                ? await resolveHcs14(source, s.ledgerTag, address, mine)
                : { failure: 'RESOLVE_PROFILE_MISMATCH' as const, detail: `this release resolves hcs14 and hol, not ${profile}` };
          if ('failure' in r) return refuse(r.failure, r.detail);
          return ok(r.coordinates, { coordinates: r.coordinates as unknown as Record<string, unknown> });
        }

        case 'verify': {
          const scope = args['scope'] as { lane?: string; topics?: string[]; envelopeId?: string } | undefined;
          if (scope === undefined) {
            return refuse(
              'VERIFY_SCOPE_INVALID',
              asString('scope') ?? 'a scope names a lane, an envelope on a lane, or a set of topics',
            );
          }
          // A READER and nothing else: no key, no stamp, no account, no counter.
          const out = await verify(liveReader(s.home.mirrorNodeUrl, s.ledgerTag), scope, {
            ...(args['window'] === undefined ? {} : { window: args['window'] as { from: string; to: string } }),
            narrative: args['narrative'] === true,
            mirror: s.home.mirrorNodeUrl,
          });
          return ok(out, out as unknown as Record<string, unknown>);
        }

        case 'buy_stamp': {
          const count = (args['count'] as number | undefined) ?? 1;
          if (!Number.isInteger(count) || count < 1) {
            return refuse('STAMP_HOLDER_INVALID', `count must be a whole number of at least 1, not ${String(count)} (§6.3)`);
          }
          if (s.dryRun) {
            // §14.2's exchange begins with a QUOTE, which is read-only — but it
            // is a round trip to the counter, and standing a counter up is not
            // something a dry run should require of whoever is rehearsing. So
            // this reports the purchase it would make and stops before the
            // first leg rather than before the transfer.
            return planned('buy_stamp', `buy ${count} stamp(s)${args['provision'] === true ? ' and provision this agent’s mailbox' : ''}`, {
              count,
              provision: args['provision'] === true,
              holder: s.account === '' ? { publicKey: s.agentPublicHex } : { account: s.account },
              buyer: s.homePayerId,
              counter: s.home.config.postmasterUrl,
            });
          }
          const hadNoAccount = s.account === '';
          // With `provision`, this is the whole of §4.6’s provisioned path: the
          // transfer, then the mailbox — signed here, paid for at the counter —
          // then the receipt naming what the counter created (D-168). goose sees
          // one call, because it is one purchase.
          const bought = await buyStamps(s, {
            count,
            ...(args['provision'] === true ? { provision: true } : {}),
            onLine: (l) => console.error(`  ${l}`),
          });
          // The account this purchase created is not this session's yet.
          if (hadNoAccount) await box.reboot();
          // The door is watched from the moment there is a door.
          if (bought.mailbox !== undefined) watcherFor();
          return ok(bought.receipt, {
            receipt: bought.receipt as unknown as Record<string, unknown>,
          });
        }

        case 'generate_mailbox': {
          const r = await generateMailbox(s, s.record, {
            // The server's own mode wins over the argument, and cannot be
            // overridden upward: a caller may ask a live server for a dry run,
            // and may not ask a dry server to sign.
            ...(args['dryRun'] === true || s.dryRun ? { dryRun: true } : {}),
            onLine: (l) => console.error(`  ${l}`),
          });
          // The door is watched from the moment there is a door.
          watcherFor();
          return ok({ outcome: r.outcome, coordinates: r.coordinates, log: r.lines });
        }

        case 'register_agent': {
          const uaid = (s.record.get('profileChunks')?.policy['uaid'] as string | undefined) ?? undefined;
          const declRegistry = s.record.get('declRegistry')?.id;
          if (uaid === undefined || declRegistry === undefined || declRegistry === null) {
            return refuse(
              'REGISTER_NOT_DECLARED',
              'this agent has published no declaration yet; run generate_mailbox first (§9.5 registers what §9.2 declared)',
            );
          }
          // THE FLAG THIS TOOL PUBLISHED AND DID NOT HONOUR, until 2026-09-11.
          // Its schema has always declared `dryRun` — "report whether a
          // registration exists and what would be submitted, and submit
          // nothing" — and this handler never read it, so a caller asking for a
          // dry run submitted on the anchor and spent the agent's only ℏ. It is
          // the smallest instance of the thing the server's own mode fixes, and
          // both are honoured here: either one withholds the signature.
          if (args['dryRun'] === true || s.dryRun) {
            const anchor = s.holAnchors[0] ?? '(no anchor pinned for this ledger)';
            return planned('register_agent', `submit this agent’s registration on the HOL anchor ${anchor}`, {
              anchor,
              account: s.account,
              uaid,
              declRegistry,
              payer: s.account,
              whyTheAgentPays:
                '§9.5 assigns `blurred` where the registration’s payer is not the address’s own account, so this is the one submission the agent pays for itself (§4.6).',
            });
          }
          const r = await registerAgent(s, s.record, { uaid, declRegistry }, (l) => console.error(`  ${l}`));
          return ok({ outcome: r.outcome, coordinates: r.coordinates, log: r.lines });
        }

        case 'send': {
          // §6.4 in order, over the live seam. The tools are the ones
          // `check:letter` exercises; `sdk/letter.ts` only hands them this
          // agent's own ids. Nothing here knows it is on a network.
          //
          // THIS HANDLER TAKES WHAT ITS PUBLISHED SCHEMA SAYS IT TAKES, and
          // until 2026-09-11 it did not. The schema declares §6.4's own
          // signature — `coordinates`, a base64 `payload`, `window` — and this
          // read `address`, utf8 and `windowSeconds`, so a client that built its
          // call from the published schema got SEND_UNRESOLVED on its first
          // letter. It was reachable only from an MCP client, and every gate so
          // far was driven by a CLI, which is why three clean gates never met
          // it. T-P15-4's premise is that the surface is defined once.
          const coordinates = args['coordinates'] as MailCoordinates | undefined;
          if (coordinates === undefined || typeof coordinates !== 'object' || typeof coordinates.address !== 'string') {
            return refuse(
              'SEND_UNRESOLVED',
              asString('coordinates') ??
                '`coordinates` is required: §6.4 takes the coordinates `resolve` returned, which carry a resolution proof',
            );
          }
          const payload = args['payload'];
          if (typeof payload !== 'string') {
            return refuse('SEND_UNRESOLVED', '`payload` is required, base64 — §6.4: "payload is bytes", and a tool input is JSON');
          }
          // The recipient is resolved HERE, by this agent, from a mirror node —
          // and the proof that resolution produces is what `send` welds into the
          // AAD. A letter to an address nobody resolved is what §10 exists to
          // make impossible.
          //
          // THE MANIFEST IS NEVER CARRIED IN-BAND (§5.3), so it is rebuilt here
          // and then checked against the proof the caller handed over. §6.4 step
          // 2 publishes the manifest, and coordinates carry only its hash and a
          // locator that is null until that happens — so a `send` given
          // coordinates and nothing else would have nothing to publish.
          //
          // Re-resolving is therefore the check and not a redundancy: the
          // caller's coordinates become an input this process VERIFIES rather
          // than one it trusts. That is strictly stronger than what stood here
          // before, which resolved from an address and ignored whatever
          // coordinates the caller was holding.
          const mine = s.record.get('manifest')?.id ?? s.account;
          const r = await resolveHcs14(mirrorSource(s.mirror), s.ledgerTag, coordinates.address, mine);
          if ('failure' in r) return refuse(r.failure, r.detail);
          const claimed = coordinates.resolutionProof?.hash;
          if (typeof claimed === 'string' && claimed !== r.manifest.hash) {
            return refuse(
              'SEND_UNRESOLVED',
              `these coordinates carry resolution proof ${claimed}, and resolving ${coordinates.address} now yields ` +
                `${r.manifest.hash}. Re-resolve and send the coordinates that come back: §7.2 welds the proof's hash ` +
                'into the AAD, so a letter under a proof this agent cannot reproduce would not bind.',
            );
          }

          // §4.4's first hop, where the payer is not the sender's own account:
          // the fee is debited from the PAYER, so the payer must hold a stamp.
          // Only where a doorbell will actually be rung — a reused lane charges
          // no fee (§7.1), and a hop with no fee to pay strands a stamp.
          //
          // Asked by §7.1's OWN rule, the one `send` is about to use: the lane is
          // found on the doorbell of whichever party answered — the recipient's,
          // or this agent's own where the letter is a reply (D-171). A second
          // spelling of that rule here would be a second place for it to be
          // wrong, and the two would disagree on exactly the case that matters:
          // a reply rings nothing, so a hop for a reply strands a stamp.
          const ctx = senderContext(s);
          const willRing =
            (
              await lanesBetween(
                liveReader(s.home.mirrorNodeUrl, s.ledgerTag),
                { doorbell: ctx.doorbell, account: s.account },
                { doorbell: r.coordinates.doorbell, account: r.coordinates.account },
              )
            ).length === 0;
          if (s.dryRun) {
            // Everything above this line is a READ, and every read has run: the
            // recipient was resolved, the proof the caller carried was checked
            // against it, and §7.1's own rule was asked whether a door would be
            // rung. So the plan is measured rather than assumed, and the first
            // thing that would move a stamp is the line below.
            return planned('send', `post one ${args['returnReceipt'] === true ? 'certified ' : ''}envelope to ${coordinates.address}`, {
              recipient: {
                address: coordinates.address,
                account: r.coordinates.account,
                doorbell: r.coordinates.doorbell,
                manifestTopic: r.coordinates.manifestTopic,
                keyEpoch: r.coordinates.keyEpoch,
              },
              resolution: {
                profile: r.coordinates.profile,
                trustClass: r.coordinates.trustClass,
                endorsements: r.coordinates.endorsements,
                proofHash: r.manifest.hash,
              },
              lane: willRing ? 'NONE — this is first contact, and a doorbell would be rung' : 'an open lane exists and would be reused; nothing would be rung',
              wouldRing: willRing,
              payloadBytes: Buffer.from(payload, 'base64').length,
              returnReceipt: args['returnReceipt'] === true,
              stamps: willRing ? 'the envelope’s weight, plus one at the door (§4.4)' : 'the envelope’s weight',
            });
          }
          const hop = await ringStamp(s, willRing);
          if (hop !== null) console.error(`  one stamp to the payer for the doorbell fee (§4.4): ${hop}`);

          // THE LETTER'S OWN STORY, to both readers that were missing it
          // (D-162). Each line goes to this process's log as the fact lands —
          // the live surface, since goose renders no progress notifications —
          // and the whole of it comes back as the result's text block, which is
          // the retrospective one. Same sentence, same template, two readers
          // that could not learn different things from it if they tried.
          const story: string[] = [];
          const narrating = {
            ...ctx,
            onLine: (l: string) => {
              story.push(l);
              console.error(`  ${l}`);
            },
          };
          const out = await send(narrating, {
            coordinates: r.coordinates,
            manifest: r.manifest as unknown as Record<string, unknown>,
            payload: Buffer.from(payload, 'base64'),
            // §6.4 step 7, and §7.7's header bit with it. The postage the
            // envelope affixes includes the receipt fee when this is true, so a
            // caller that asks for one pays for one (§4.2, §7.5).
            returnReceipt: args['returnReceipt'] === true,
            // §6.4's own name for it, which is what the schema publishes.
            ...(typeof args['window'] === 'number' ? { windowSeconds: args['window'] } : {}),
            ...(typeof args['receiptWindow'] === 'number' ? { receiptWindowSeconds: args['receiptWindow'] } : {}),
          });
          // §6.4's result, in the ONE FIELD the published `outputSchema` names.
          // MCP types a tool's output as an object, so each of §6's outputs is
          // carried in a named field (`src/mcp/tools.ts`'s `wrap`); this handler
          // returned the bare result and would have been rejected by any client
          // that validates `structuredContent` — which the reference SDK does.
          // The other five verbs already wrapped; `send` was the odd one out.
          // WHAT §6.4 SAYS `send` RETURNS, and it is not what this returned.
          //
          // "`send` then returns chunk 0's `Postmark` (D-30)", or an
          // `AttemptedDeliverySlip` — and the published `outputSchema` is a
          // `oneOf` over exactly those two registered schemas, each
          // `additionalProperties: false`. This handler returned the whole
          // internal `SendResult` — `{kind, postmark, envelope, postmarks,
          // settlement, manifestLocator, lane, receipt?}` — which is not a
          // Postmark and which the schema forbids twice over.
          //
          // Found by validating a REAL result from the modelled ledger against
          // the schema this server publishes (`check:letter`). Nothing had ever
          // validated it, which is how a surface came to promise one shape and
          // send another.
          //
          // So `result` is now exactly the §5 object §6.4 names. The rest is not
          // discarded — it is the evidence a caller wants and none of it is
          // secret — but it travels as OBSERVATION, in `_meta`, where a schema
          // does not claim it is the tool's output. The card carries it in
          // prose for whoever is reading rather than parsing.
          const spec64 = out.kind === 'postmark' ? out.postmark : out.slip;
          return {
            content: [
              {
                type: 'text' as const,
                text: `${story.join('\n')}\n\n${JSON.stringify(out, null, 2)}`,
              },
            ],
            structuredContent: { result: spec64 as unknown as Record<string, unknown> },
            _meta: { 'wishmail/spec': RELEASE.spec, 'wishmail/send': out as unknown as Record<string, unknown> },
          };
        }

        case 'inbox': {
          // §6.5 writes nothing: reading a lane leaves no mark on it (D-29).
          const lane = args['lane'];
          const lanes =
            typeof lane === 'string' && lane !== '' ? [lane] : await lanesOf(s);
          const out = await inbox(inboxContext(s), {
            lanes,
            ...(typeof args['since'] === 'string' ? { since: args['since'] } : {}),
          });
          return ok(out, { deliveries: out as unknown as Record<string, unknown>[] });
        }

        case 'ack': {
          // §6.6, over one delivery THIS agent's own `inbox` returned. The
          // delivery is what attests that the envelope opened with its AAD
          // verified, which is §6.6's precondition, so `ack` is never handed an
          // identifier alone — it is handed the reading that earned it.
          const envelopeId = args['envelopeId'];
          if (typeof envelopeId !== 'string' || envelopeId === '') {
            return refuse('ACK_NOT_OPENED', 'envelopeId is required: `ack` acknowledges one envelope (§6.6)');
          }
          const lane = args['lane'];
          const lanes = typeof lane === 'string' && lane !== '' ? [lane] : await lanesOf(s);
          const deliveries = await inbox(inboxContext(s), { lanes });
          const delivery = deliveries.find((d) => d.envelope.aadHash === envelopeId);
          if (delivery === undefined) {
            return refuse(
              'ACK_NOT_OPENED',
              `no envelope ${envelopeId} is on this agent's lanes; §6.6 acknowledges what this agent's own inbox opened`,
            );
          }
          if (s.dryRun) {
            // The envelope was read, reassembled and opened to get here, and
            // every one of §6.6's preconditions has been checked. What is
            // withheld is the ScheduleSign — which is the whole act, since the
            // network executes the receipt the instant it lands.
            return planned('ack', `sign the scheduled receipt for envelope ${envelopeId}`, {
              envelopeId,
              lane: delivery.lane,
              opened: delivery.opened,
              scheduleId: delivery.returnReceipt?.scheduleId ?? null,
              receiptWouldLandOn: s.record.get('manifest')?.id ?? null,
              cost: 'nothing to this agent: the sender named its own side as the inner transaction’s payer (T-P16-2).',
            });
          }
          const out = await ack(ackContext(s), delivery);
          // The schedule this signed, and whether the network had already
          // executed it, are facts the caller asked for and used to be dropped
          // here. `receipt` stays the structured output its schema names.
          return ok(
            { receipt: out.receipt, schedule: out.schedule, alreadyExecuted: out.alreadyExecuted },
            { receipt: out.receipt as unknown as Record<string, unknown> },
          );
        }

        default:
          return refuse(
            'UNKNOWN_TOOL',
            `${String(name)} is not on this surface. §6.1 fixes six verbs — ${six().map((t) => t.name).join(', ')} — ` +
              `and this release adds the two §4.6 affordances ${affordances().map((a) => a.name).join(' and ')}.`,
          );
      }
    } catch (e) {
      return refuse(codeFor(String(request.params.name), e), detailFor(e));
    }
  });

  return server;
}

export async function main(): Promise<void> {
  // FIRST, BEFORE A KEY IS READ. Every CLI that can sign has printed its mode
  // and its received argv since 2026-09-10; the one surface goose touches had
  // no mode at all until 2026-09-11, which meant a gate line changed nothing in
  // the process it was gating. On stderr, because stdout is the JSON-RPC
  // channel and a banner there is a parse error at the client.
  const mode = runModeOnStderr('wishmail correspondent');
  const dryRun = !mode.live;

  const dir = process.env['WISHMAIL_HOME'] ?? process.argv.slice(2).find((a) => !a.startsWith('--'));
  if (dir === undefined) {
    throw new Error('name the home directory: WISHMAIL_HOME=<dir>, or as the first argument. A home IS the agent (D-165).');
  }
  const home = openHome(path.resolve(dir));

  // ONE LIVE PROCESS PER HOME. A dry run takes no lock: it starts no watcher
  // and can sign nothing, so rehearsing beside a live agent is safe.
  const lock = dryRun
    ? { path: '(none — dry run)', tookOver: null, release: () => {} }
    : lockHome(home.dir, 'correspondent');
  if (lock.tookOver !== null) {
    console.error(`  took over the lock left by process ${lock.tookOver}, which is gone.`);
  }

  const s = await boot(home, dryRun ? { dryRun: true } : {});

  // The watcher starts as soon as there is a doorbell to watch, and is started
  // once: a second watcher would answer the same request twice and §7.1's
  // earliest-created lane would then have a twin nobody uses.
  const box: SessionBox = {
    s,
    reboot: async () => {
      const previous = box.s;
      box.s = await boot(home, dryRun ? { dryRun: true } : {});
      // The old session's clients hold the event loop; a server that re-booted
      // on every purchase and kept them would leak one pair per sale.
      previous.close();
    },
  };

  let watcher: Watcher | undefined;
  const ensureWatcher = (): Watcher | undefined => {
    // THE WATCHER SIGNS, so a dry run does not start one. `answer()` creates
    // the lane with a TopicCreateTransaction — the auto-accepter is the one
    // part of this server that acts without a tool call, and a DRY server whose
    // watcher went on birthing lanes would be the exact defect the mode exists
    // to prevent.
    if (dryRun) return undefined;
    const doorbell = box.s.record.get('doorbell')?.id;
    if (doorbell === null || doorbell === undefined) return undefined;
    watcher ??= watchDoorbell(box.s, doorbell, {
      onAnswer: (a) => console.error(`  answered ${a.requesterAccount}: lane ${a.lane}`),
      onError: (e) => console.error(`  the doorbell watcher: ${e.message}`),
    });
    return watcher;
  };
  ensureWatcher();

  console.error(
    `wishmail correspondent — home ${home.dir}, keys ${s.keysOrigin}, ` +
      `account ${s.account === '' ? '(not bought yet)' : s.account}, payer ${s.payerId}` +
      (dryRun
        ? '\n  DRY RUN — no payer key was read and no client has an operator; the doorbell watcher is NOT running.'
        : `\n  LIVE — the doorbell watcher ${watcher === undefined ? 'starts when there is a door' : 'is running'}.`),
  );

  // --- Shutting down on purpose, and saying where it stopped. ---------------
  //
  // Until 2026-09-11 this process had no way out. `Watcher.stop()` existed and
  // was never called; there was no signal handler anywhere in `app/`, and no
  // `onclose` on the transport. So when goose closed stdio the server did not
  // exit — the watcher's five-second timer and the Hedera client's day-long one
  // both hold the event loop — and it went on auto-accepting, creating lanes
  // and spending the operator's ℏ with no client attached. The next goose put a
  // SECOND watcher on the same doorbell.
  //
  // An in-flight write is NOT abandoned here. A submission that has left this
  // process has an outcome on consensus whatever happens next, and killing the
  // wait for it would only lose our knowledge of it — the window CLAUDE.md §12
  // names. So shutdown stops the watcher from starting anything NEW, releases
  // the network handles, and says plainly what was in flight.
  let closing = false;
  const shutdown = (why: string): void => {
    if (closing) return;
    closing = true;
    const w = watcher;
    if (w !== undefined) w.stop();
    const answering = w === undefined ? 0 : 1;
    console.error(
      `\nwishmail correspondent — stopping: ${why}.\n` +
        `  home            ${home.dir}\n` +
        `  account         ${box.s.account === '' ? '(not bought yet)' : box.s.account}\n` +
        `  doorbell watch  ${answering === 0 ? 'was not running' : 'stopped; it starts nothing new'}\n` +
        `  in flight       nothing this process can lose: every submission that left it has an outcome on\n` +
        '                  consensus, and `npm run verify -- --lane <lane>` is what reads it back.\n',
    );
    box.s.close();
    lock.release();
    process.exit(0);
  };

  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    process.on(sig, () => shutdown(`received ${sig}`));
  }

  const transport = new StdioServerTransport();
  // goose closing its end is the ordinary way this process ends, and it is not
  // an error: the client went away, so the agent has nobody to serve.
  //
  // WATCH `process.stdin` AND NOT ONLY THE TRANSPORT, because the transport
  // does not see it. `StdioServerTransport` subscribes to `data` and `error` on
  // stdin and to nothing else (`server/stdio.js`), so its `onclose` fires when
  // something calls `close()` and never when the client hangs up — which is the
  // one case that matters here. Found by closing stdin and watching the process
  // stay up, not by reading. `connect()` chains rather than replaces a handler
  // already on the transport, so keeping both costs nothing and covers both.
  transport.onclose = () => shutdown('the transport closed');
  process.stdin.on('end', () => shutdown('the client closed stdio'));
  process.stdin.on('close', () => shutdown('the client closed stdio'));
  await build(box, ensureWatcher).connect(transport);
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((e: unknown) => {
    // A busy home is a refusal and not a crash: it says which process holds the
    // home and what to do, and there is nothing to read a stack trace for.
    console.error(e instanceof HomeBusy ? `\nSTOP — ${e.message}\n` : e instanceof Error ? e.message : String(e));
    process.exit(e instanceof HomeBusy ? 3 : 1);
  });
}
