/**
 * WHAT EACH VERB PUTS IN `structuredContent`, DEFINED ONCE.
 *
 * MCP validates a tool's `structuredContent` against the `outputSchema` that
 * tool published. Twice now a handler has put something else there, and both
 * times every CLI was blind to it because a CLI reads the text block:
 *
 *   - `send` returned its whole internal `SendResult` — `{kind, postmark,
 *     envelope, postmarks, settlement, manifestLocator, lane, receipt?}` —
 *     against a schema that is a `oneOf` over two registered §5 objects, each
 *     `additionalProperties: false`. Caught 2026-09-11 by validating a real
 *     result from the modelled ledger against the server's own schema.
 *   - `inbox` returned the internal `Delivery`, whose `payload` is a Node
 *     `Buffer` and which carries four keys the schema forbids. Caught the same
 *     night, live, under goose: the payload crossed the wire as
 *     `{"type":"Buffer","data":[84,104,105,…]}` where the schema says a base64
 *     string. goose does not validate, so it cost nothing mechanically and
 *     rendered the letter as decimal soup.
 *
 * Both are the same defect: a published schema and a handler return that
 * disagree, unreachable from a CLI, visible only on real bytes through a real
 * client. So the shaping is a FUNCTION, here, and `sdk/outputs.check.ts`
 * validates the output of THESE functions against `mcp/tools.ts`'s published
 * schemas, on real instances from the model court. A court that restated the
 * shaping would court its own restatement — which is what `core/hcs14.ts` and
 * CLAUDE.md §9 refuse, and it is how two spellings come to disagree.
 *
 * THE RULE THE TWO FIXES SHARE (D-178): `structuredContent` carries exactly
 * what §6 names; `_meta` carries the evidence the implementation also holds;
 * the text block carries the prose. Nothing is discarded and nothing is
 * promised under a schema that does not describe it.
 */
import type { Delivery } from '../src/tools/inbox.js';
import type { SendResult } from '../src/tools/send.js';

/** A JSON object on the wire. The casts are the MCP SDK's shape, not a claim. */
type Json = Record<string, unknown>;

const asJson = (v: unknown): Json => v as unknown as Json;

/**
 * One §6.5 `Delivery`, in the shape the published schema names and no other.
 *
 * WHAT IS DROPPED, AND WHY NOTHING IS LOST. `lane` is already `envelope.lane`
 * and `openedUnderEpoch` is already `envelope.keyEpoch` — both REQUIRED fields
 * of the §5.5 Envelope this delivery carries, so the outer copies were a second
 * spelling and somewhere for them to disagree. `detail` says of itself that it
 * is not part of §6.5's shape (`tools/inbox.ts`: "a reason code is not a
 * diagnosis"). `chunkPostmarks` is real evidence and is NOT a §5.7 Postmark —
 * it has no `ledgerTag`, `topicId`, `envelopeId` or `chunkIndex` — so it
 * travels where `send` already puts its postmarks: `_meta`.
 *
 * `payload` is BASE64, because the schema says so and because
 * `send.input.schema.json` takes a payload in base64: what this surface accepts
 * in one alphabet it returns in the same one. A `Buffer` is a Node
 * serialisation artefact and not a wire shape, and §6.1/T-P15-4 requires every
 * transport to expose the same schema.
 */
export function onTheWire(d: Delivery): Json {
  return {
    envelope: asJson(d.envelope),
    opened: d.opened,
    ...(d.payload === undefined ? {} : { payload: d.payload.toString('base64') }),
    ...(d.reason === undefined ? {} : { reason: d.reason }),
    ...(d.returnReceipt === undefined ? {} : { returnReceipt: { ...d.returnReceipt } }),
  };
}

/** The same delivery with the evidence a schema does not claim is the output. */
export function observedDelivery(d: Delivery): Json {
  return {
    ...onTheWire(d),
    lane: d.lane,
    chunkPostmarks: d.chunkPostmarks.map((p) => ({ ...p })),
    ...(d.detail === undefined ? {} : { detail: d.detail }),
    ...(d.openedUnderEpoch === undefined ? {} : { openedUnderEpoch: d.openedUnderEpoch }),
  };
}

/**
 * One entry per verb the server publishes.
 *
 * `verify` is routed through here even though its shape is right today
 * (`tools/verify.ts` returns exactly `{bundle, narrative?}`): the handler
 * spreads whatever `verify` returns into `structuredContent`, and the published
 * wrapper is `additionalProperties: false`, so the day a third field is added
 * the break is at a client. One line now closes that.
 */
export const STRUCTURED = {
  resolve: (coordinates: unknown): Json => ({ coordinates: asJson(coordinates) }),
  buy_stamp: (receipt: unknown): Json => ({ receipt: asJson(receipt) }),
  send: (out: SendResult): Json => ({ result: asJson(out.kind === 'postmark' ? out.postmark : out.slip) }),
  inbox: (deliveries: readonly Delivery[]): Json => ({ deliveries: deliveries.map(onTheWire) }),
  ack: (receipt: unknown): Json => ({ receipt: asJson(receipt) }),
  verify: (out: { readonly bundle: unknown; readonly narrative?: unknown }): Json => ({
    bundle: asJson(out.bundle),
    ...(out.narrative === undefined ? {} : { narrative: asJson(out.narrative) }),
  }),
} as const;

/**
 * A payload rendered as text, WHEN AND ONLY WHEN the bytes are valid UTF-8.
 *
 * The bytes are what was sent and they stay base64 in `structuredContent`,
 * because that is what the schema and §6.4 say. This is a RENDERING, for the
 * human reading the card, and the card labels it as one.
 *
 * `TextDecoder` with `fatal: true`, and NOT `Buffer.toString('utf8')`:
 * `toString` substitutes U+FFFD silently, so it would render every byte string
 * and call it text. `ignoreBOM: true` so a leading BOM is shown rather than
 * quietly eaten — a rendering that drops a byte is not a rendering of those
 * bytes.
 */
const UTF8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

export function renderedUtf8(bytes: Buffer): string | null {
  let text: string;
  try {
    text = UTF8.decode(bytes);
  } catch {
    return null;
  }
  // A card goes to a terminal. C0 controls other than tab, newline and return
  // are not text a reader reads; they are bytes that would rewrite the card.
  // Declining to render them never replaces them: they are in `payload`.
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) return null;
  return text;
}

/** §6.5's deliveries in prose, for whoever is reading rather than parsing. */
export function inboxCard(deliveries: readonly Delivery[], lanes: readonly string[]): string {
  const lines = [
    `${deliveries.length} delivery(ies) on ${lanes.length} lane(s). inbox wrote nothing (§6.5, D-29).`,
  ];
  for (const d of deliveries) {
    if (!d.opened) {
      lines.push(
        `  ${d.envelope.aadHash} — returned unopened: ${d.reason ?? 'no reason given'} ` +
          '(P-12: not a failure of the tool)',
      );
      if (d.detail !== undefined) lines.push(`      ${d.detail}`);
      continue;
    }
    lines.push(
      `  ${d.envelope.aadHash} — OPENED on ${d.lane}, key epoch ${d.openedUnderEpoch ?? '?'}, ` +
        `${d.chunkPostmarks.length} chunk(s), ${d.payload?.length ?? 0} byte(s)`,
    );
    if (d.returnReceipt !== undefined) {
      lines.push(
        `      a receipt is pending on schedule ${d.returnReceipt.scheduleId}; \`ack\` signs it (§6.6, §10.4)`,
      );
    }
    const text = d.payload === undefined ? null : renderedUtf8(d.payload);
    if (text === null) {
      lines.push(
        '      the bytes are not valid UTF-8 text; they are in `deliveries[].payload`, base64, unaltered',
      );
    } else {
      lines.push('      a RENDERING of those bytes as UTF-8 — the bytes themselves stay base64 in the result:');
      for (const line of text.split('\n')) lines.push(`      | ${line}`);
    }
  }
  return lines.join('\n');
}
