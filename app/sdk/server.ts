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
import { RELEASE } from '../src/release.js';
import { bundled } from '../src/mcp/bundle.js';
import { verify } from '../src/tools/verify.js';
import { ack } from '../src/tools/ack.js';
import { inbox } from '../src/tools/inbox.js';
import { lanesFromDoorbell, send } from '../src/tools/send.js';
import { mirrorSource, resolveHcs14 } from '../src/resolve/hcs14.js';
import { resolveHol } from '../src/resolve/hol.js';
import { TOOL_NAMES, tool, type ToolName } from '../src/mcp/tools.js';
import { CounterUnavailable, buyStamps } from './counter.js';
import { openHome } from './home.js';
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
  'account (use `generate_mailbox`, and your own operator pays).';

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

export function build(box: SessionBox, watcherFor: () => Watcher | undefined): Server {
  const server = new Server({ name: 'wishmail-correspondent', version: RELEASE.spec }, { capabilities: { tools: {} } });
  const root = repoRoot();

  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: [
      ...six().map((t) => ({
        name: t.name,
        description:
          `${t.summary}${t.name === 'buy_stamp' ? BUY_STAMP_NOTE : ''} Used by ${t.usedBy.join(', ')}. ` +
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
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;
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
          if (scope === undefined) return refuse('VERIFY_SCOPE_INVALID', 'a scope names a lane, an envelope on a lane, or a set of topics');
          // A READER and nothing else: no key, no stamp, no account, no counter.
          const out = await verify(liveReader(s.home.mirrorNodeUrl, s.ledgerTag), scope, {
            ...(args['window'] === undefined ? {} : { window: args['window'] as { from: string; to: string } }),
            narrative: args['narrative'] === true,
            mirror: s.home.mirrorNodeUrl,
          });
          return ok(out, out as unknown as Record<string, unknown>);
        }

        case 'buy_stamp': {
          const hadNoAccount = s.account === '';
          // With `provision`, this is the whole of §4.6’s provisioned path: the
          // transfer, then the mailbox — signed here, paid for at the counter —
          // then the receipt naming what the counter created (D-168). goose sees
          // one call, because it is one purchase.
          const bought = await buyStamps(s, {
            count: (args['count'] as number | undefined) ?? 1,
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
            ...(args['dryRun'] === true ? { dryRun: true } : {}),
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
          const r = await registerAgent(s, s.record, { uaid, declRegistry }, (l) => console.error(`  ${l}`));
          return ok({ outcome: r.outcome, coordinates: r.coordinates, log: r.lines });
        }

        case 'send': {
          // §6.4 in order, over the live seam. The tools are the ones
          // `check:letter` exercises; `sdk/letter.ts` only hands them this
          // agent's own ids. Nothing here knows it is on a network.
          const address = args['address'];
          if (typeof address !== 'string' || address === '') {
            return refuse('SEND_UNRESOLVED', 'address is required: `send` takes one resolved recipient (§6.4)');
          }
          const payload = args['payload'];
          if (typeof payload !== 'string') {
            return refuse('SEND_UNRESOLVED', 'payload is required, as text or base64 (§6.4)');
          }
          // The recipient is resolved HERE, by this agent, from a mirror node —
          // and the proof that resolution produces is what `send` welds into the
          // AAD. A letter to an address nobody resolved is what §10 exists to
          // make impossible.
          const mine = s.record.get('manifest')?.id ?? s.account;
          const r = await resolveHcs14(mirrorSource(s.mirror), s.ledgerTag, address, mine);
          if ('failure' in r) return refuse(r.failure, r.detail);

          // §4.4's first hop, where the payer is not the sender's own account:
          // the fee is debited from the PAYER, so the payer must hold a stamp.
          // Only where a doorbell will actually be rung — a reused lane charges
          // no fee (§7.1), and a hop with no fee to pay strands a stamp.
          //
          // Asked by §7.1's OWN rule, the one `send` is about to use: the lane is
          // found on the RECIPIENT's doorbell, not on this agent's. A second
          // spelling of that rule here would be a second place for it to be
          // wrong, and the two would disagree on exactly the case that matters.
          const willRing =
            (await lanesFromDoorbell(liveReader(s.home.mirrorNodeUrl, s.ledgerTag), r.coordinates.doorbell, s.account))
              .length === 0;
          const hop = await ringStamp(s, willRing);
          if (hop !== null) console.error(`  one stamp to the payer for the doorbell fee (§4.4): ${hop}`);

          const out = await send(senderContext(s), {
            coordinates: r.coordinates,
            manifest: r.manifest as unknown as Record<string, unknown>,
            payload: Buffer.from(payload, 'utf8'),
            // §6.4 step 7, and §7.7's header bit with it. The postage the
            // envelope affixes includes the receipt fee when this is true, so a
            // caller that asks for one pays for one (§4.2, §7.5).
            returnReceipt: args['returnReceipt'] === true,
            ...(typeof args['windowSeconds'] === 'number' ? { windowSeconds: args['windowSeconds'] } : {}),
            ...(typeof args['receiptWindowSeconds'] === 'number'
              ? { receiptWindowSeconds: args['receiptWindowSeconds'] }
              : {}),
          });
          return ok(out, out as unknown as Record<string, unknown>);
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
          const out = await ack(ackContext(s), delivery);
          return ok(out.receipt, { receipt: out.receipt as unknown as Record<string, unknown> });
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
  const dir = process.env['WISHMAIL_HOME'] ?? process.argv[2];
  if (dir === undefined) {
    throw new Error('name the home directory: WISHMAIL_HOME=<dir>, or as the first argument. A home IS the agent (D-165).');
  }
  const home = openHome(path.resolve(dir));
  const s = await boot(home);

  // The watcher starts as soon as there is a doorbell to watch, and is started
  // once: a second watcher would answer the same request twice and §7.1's
  // earliest-created lane would then have a twin nobody uses.
  const box: SessionBox = {
    s,
    reboot: async () => {
      const previous = box.s;
      box.s = await boot(home);
      // The old session's clients hold the event loop; a server that re-booted
      // on every purchase and kept them would leak one pair per sale.
      previous.close();
    },
  };

  let watcher: Watcher | undefined;
  const ensureWatcher = (): Watcher | undefined => {
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
      `account ${s.account === '' ? '(not bought yet)' : s.account}, payer ${s.payerId}`,
  );

  await build(box, ensureWatcher).connect(new StdioServerTransport());
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
}
