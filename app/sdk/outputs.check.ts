/**
 * `npm run check:outputs` — every verb this server PUBLISHES, courted against
 * the `outputSchema` it publishes, on a real return from the model court.
 *
 * THE DEFECT CLASS THIS EXISTS TO CLOSE. A tool's published `outputSchema` and
 * what its handler puts in `structuredContent` are two separate artefacts, and
 * nothing made them agree. Twice they did not:
 *
 *   - `send` returned its whole internal `SendResult` where §6.4 says it
 *     returns chunk 0's `Postmark`. A client building from the schema would
 *     have rejected the first letter it ever received.
 *   - `inbox` returned the internal `Delivery`: a Node `Buffer` where the
 *     schema says a base64 string, plus four keys an `additionalProperties:
 *     false` schema forbids. Found LIVE, under goose, on the golden path.
 *
 * Neither was reachable from a CLI — a CLI reads the text block — and neither
 * was reachable from `check:mcp`, which compiles the schemas and validates no
 * instance. Both needed real bytes through a real shaping. That is this file.
 *
 * THREE QUESTIONS ARE ASKED OF EVERY VERB, and only the first is ajv's:
 *
 *   1. Does the shaped return VALIDATE against the published schema, after a
 *      JSON round trip? The round trip is not decoration: it is what turns a
 *      `Buffer` into `{"type":"Buffer","data":[…]}`, which is what crosses a
 *      wire, and what a client actually sees.
 *   2. Does every DECLARED key have a producer, and does every PRODUCED key
 *      have a declaration? Validation cannot ask either. An optional field
 *      nothing writes validates forever — `manifestTopic` was dropped on the
 *      floor until D-166 and every instance validated — and `postmark` and
 *      `settlement` declare no `additionalProperties` at all, so an extra key
 *      on a Postmark is invisible to ajv.
 *   3. Is every `contentEncoding` honoured? 2020-12 makes it an ANNOTATION;
 *      ajv does not enforce it and `{strict:false}` does not warn. It is the
 *      exact hole the Buffer crossed, so it is asserted by hand here.
 *
 * THE VERBS ARE READ FROM THE SERVER, NEVER RESTATED. A seventh verb published
 * tomorrow arrives here with no instance and fails, which is the only way a
 * coverage claim stays true without anyone remembering to update it.
 *
 * Nothing here touches `hedera:testnet`, reads a key, or opens a socket: the
 * ledger is `tools/memory.ts` and the world is `tools/court.ts` — the same
 * world `check:letter` stands in, deliberately, because a court whose world is
 * not the letter's world proves nothing about the letter's outputs.
 *
 * Conformance (reference side): T-P15-4, T-P11-4, T-P12-4.
 */
import type { KeyObject } from 'node:crypto';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormatsImport from 'ajv-formats';
import { bundled } from '../src/mcp/bundle.js';
import { declaredOf, pathsIn, valuesAt } from '../src/mcp/declared.js';
import { repoRoot } from '../src/ops/env.js';
import { PAYLOAD, answerTheDoor, stand } from '../src/tools/court.js';
import { ack } from '../src/tools/ack.js';
import { inbox, type Delivery } from '../src/tools/inbox.js';
import { send } from '../src/tools/send.js';
import { verify } from '../src/tools/verify.js';
import type { StampReceipt } from '../src/counter/purchase.js';
import { STRUCTURED, observedDelivery } from './structured.js';
import { affordances, six } from './tools.js';

/** ESM/CJS interop, as `schema/loader.ts` does it. */
const addFormats =
  (addFormatsImport as unknown as { default?: (a: unknown) => void }).default ??
  (addFormatsImport as unknown as (a: unknown) => void);

const failures: string[] = [];
let passed = 0;

function is(what: string, got: unknown, want: unknown): void {
  if (JSON.stringify(got) === JSON.stringify(want)) passed += 1;
  else failures.push(`${what}\n      want ${JSON.stringify(want)}\n      got  ${JSON.stringify(got)}`);
}
function ok(what: string, condition: boolean): void {
  if (condition) passed += 1;
  else failures.push(what);
}

type ToolName = 'resolve' | 'buy_stamp' | 'send' | 'inbox' | 'ack' | 'verify';
type Provenance = 'model-court' | 'hand-built';

/**
 * WHERE EACH INSTANCE COMES FROM, AND WHAT THAT IS WORTH.
 *
 * The whole value of this check is that it validates a REAL return. An instance
 * built here to satisfy a schema proves only that whoever built it read the
 * schema, which is worth nothing. So provenance is declared, asserted, and
 * PRINTED IN THE PASS LINE: a reader of the output can see exactly which verbs
 * are courted on real bytes and which are not.
 */
const PROVENANCE: Readonly<Record<ToolName, Provenance>> = {
  resolve: 'model-court',
  buy_stamp: 'hand-built',
  send: 'model-court',
  inbox: 'model-court',
  ack: 'model-court',
  verify: 'model-court',
};

/**
 * `buy_stamp` IS NOT COURTED ON A REAL RETURN HERE, AND THIS SAYS SO.
 *
 * The receipt this verb returns is the COUNTER's, passed through unaltered
 * (`sdk/counter.ts` -> `sdk/server.ts`). Its only producer is `issueReceipt`
 * (`src/counter/purchase.ts`), which needs a state store holding a carried
 * purchase, a Mirror over four routes and a resolvable declaration chain — a
 * counter, in other words. One IS stood up offline, over a real loopback
 * socket, by `check:exchange`, and the receipt it issues is validated there
 * against the registered StampReceipt AND, since 2026-09-11, inside the wrapper
 * this surface publishes.
 *
 * So the instance below is hand-built, and it is typed `StampReceipt` — the
 * producer's own type — on purpose: `tsc` is then the link between this fixture
 * and the real builder, and a field added to `StampReceipt` that this fixture
 * does not carry is a compile error rather than a silent hole.
 */
const HAND_BUILT_RECEIPT: StampReceipt = {
  ledgerTag: 'hedera:testnet',
  tokenId: '0.0.10426208',
  amount: 12,
  txRef: '0.0.8641261@1789175795.394278638',
  price: { amount: '43.45267471', currency: 'HBAR' },
  holder: '0.0.10489361',
  provisioning: {
    price: { amount: '30', currency: 'HBAR' },
    registrationFee: '0.05',
    account: '0.0.10489361',
    doorbell: '0.0.10489363',
    log: '0.0.10489367',
    manifestTopic: '0.0.10489371',
    declRegistry: '0.0.10489373',
    profileFile: '0.0.10489375',
  },
};

/**
 * Declared paths that NOTHING in this court produces, with the reason each.
 *
 * Equality is asserted, not containment: a path leaving this list (something
 * now produces it) and a path entering it (something stopped, or a schema grew
 * a field nothing fills) both FAIL. It cannot silently absorb a regression.
 *
 * An entry may be added only with a sentence saying what would have to be true
 * for something to produce it. An entry whose reason is "nothing in the court
 * does this yet" is a COURT HOLE and is named as one in the PASS line, not
 * hidden here. The idiom is `counter/purchase.ts`'s
 * `provisioningFieldsThisCounterCannotFill`: a list of schema fields nobody can
 * fill, kept as an assertion rather than as a note.
 */
const UNPRODUCED: Readonly<Record<ToolName, readonly string[]>> = {
  // §6.2: a resolution's `uri` is null until `send` publishes the manifest, so
  // the LOCATION exists and its three children cannot. `resolutionProof.uri` IS
  // produced, as null; these are its fields.
  resolve: [
    'coordinates.resolutionProof.uri.ledgerTag',
    'coordinates.resolutionProof.uri.sequenceNumber',
    'coordinates.resolutionProof.uri.topicId',
  ],
  // §5.4: `rate` is present exactly when the method is priced by reference
  // (T-P11-4). This receipt is a fixed-price hbar purchase, so it is absent and
  // its four fields with it.
  buy_stamp: ['receipt.rate', 'receipt.rate.at', 'receipt.rate.pair', 'receipt.rate.source', 'receipt.rate.value'],
  // The slip arm of the `oneOf` carries the resolution it attempted; same §6.2
  // rule as `resolve`, same null.
  send: [
    'result.resolutionProof.uri.ledgerTag',
    'result.resolutionProof.uri.sequenceNumber',
    'result.resolutionProof.uri.topicId',
  ],
  inbox: [],
  ack: [],
  // A COURT HOLE, NAMED. One letter, opened and acked, on one lane: it produces
  // no slip, no orphan, no off-chain chunk, and no agent-identifier ordering.
  // Each of these is reachable — by a letter no door answers, a settlement with
  // no envelope, a chunk that outgrew the topic, two agents whose identifiers
  // tie — and this court posts none of them. It is coverage this check does not
  // have, not a defect in what it does cover, and the PASS line says so.
  //
  // `correspondence[].returnReceipt` is NOT in that category and is a FINDING:
  // see UNDECLARED below.
  verify: [
    'bundle.correspondence[].offChain[].chunkIndex',
    'bundle.correspondence[].offChain[].consensusTimestamp',
    'bundle.correspondence[].offChain[].envelopeId',
    'bundle.correspondence[].offChain[].ledgerTag',
    'bundle.correspondence[].offChain[].runningHash',
    'bundle.correspondence[].offChain[].runningHashVersion',
    'bundle.correspondence[].offChain[].sequenceNumber',
    'bundle.correspondence[].offChain[].topicId',
    'bundle.correspondence[].returnReceipt',
    'bundle.correspondence[].returnReceipt.envelopeId',
    'bundle.correspondence[].returnReceipt.keyEpoch',
    'bundle.correspondence[].returnReceipt.postmarkRef',
    'bundle.correspondence[].returnReceipt.postmarkRef.sequenceNumber',
    'bundle.correspondence[].returnReceipt.postmarkRef.topicId',
    'bundle.correspondence[].returnReceipt.proof',
    'bundle.correspondence[].returnReceipt.proof.hash',
    'bundle.correspondence[].returnReceipt.proof.uri',
    'bundle.correspondence[].returnReceipt.proof.uri.ledgerTag',
    'bundle.correspondence[].returnReceipt.proof.uri.sequenceNumber',
    'bundle.correspondence[].returnReceipt.proof.uri.topicId',
    'bundle.correspondence[].returnReceipt.recipient',
    'bundle.correspondence[].returnReceipt.witness',
    'bundle.correspondence[].returnReceipt.witness.executedTimestamp',
    'bundle.correspondence[].returnReceipt.witness.ledgerTag',
    'bundle.correspondence[].returnReceipt.witness.scheduleId',
    'bundle.correspondence[].slip',
    'bundle.correspondence[].slip.address',
    'bundle.correspondence[].slip.connectionRequestSeq',
    'bundle.correspondence[].slip.consensusTimestamp',
    'bundle.correspondence[].slip.doorbell',
    'bundle.correspondence[].slip.endorsement',
    'bundle.correspondence[].slip.ledgerTag',
    'bundle.correspondence[].slip.log',
    'bundle.correspondence[].slip.logSeq',
    'bundle.correspondence[].slip.profile',
    'bundle.correspondence[].slip.resolutionProof',
    'bundle.correspondence[].slip.resolutionProof.hash',
    'bundle.correspondence[].slip.resolutionProof.uri',
    'bundle.correspondence[].slip.resolutionProof.uri.ledgerTag',
    'bundle.correspondence[].slip.resolutionProof.uri.sequenceNumber',
    'bundle.correspondence[].slip.resolutionProof.uri.topicId',
    'bundle.correspondence[].slip.window',
    'bundle.observations.agentIdOrder',
    'bundle.observations.agentIdOrder[].address',
    'bundle.observations.agentIdOrder[].order',
    'bundle.observations.integrity',
    'bundle.orphans[].amount',
    'bundle.orphans[].consensusTimestamp',
    'bundle.orphans[].from',
    'bundle.orphans[].ledgerTag',
    'bundle.orphans[].memo',
    'bundle.orphans[].to',
    'bundle.orphans[].txRef',
  ],
};

/**
 * Keys a handler PRODUCES that its schema does not declare — RECORDED, NOT
 * FIXED, and each one a finding of this check's first run (2026-09-11).
 *
 * Every entry below is on `verify`, which is a VERIFIER-side verb and not on
 * the goose allowlist the demo drives, so none is on the golden path. Two of
 * the three would need a FROZEN schema to move, which is a 0.6 event under §1.7
 * and never a patch (§G-33).
 *
 * They are invisible to ajv, and that is the point of the assertion that lists
 * them: `settlement.schema.json` and `evidence-bundle.schema.json`'s
 * `observations` both omit `additionalProperties`, so a key nobody declared
 * validates perfectly. Equality is asserted here, so a fourth one fails.
 */
const UNDECLARED: Readonly<Record<ToolName, readonly string[]>> = {
  resolve: [],
  buy_stamp: [],
  send: [],
  inbox: [],
  ack: [],
  verify: [
    // §5.6's Settlement declares seven fields and this is an eighth. §11.4 needs
    // the token to say the postage was $POSTAGE and not another token, so the
    // implementation carries it; the frozen schema does not declare it.
    'bundle.correspondence[].settlement.tokenId',
    // Written when the scope names no stamp token, to say §11.4's token and
    // treasury checks did not run — silence about a check is worse than a
    // sentence, so the sentence is written and the schema does not know it.
    'bundle.observations.stampTokenUnknown',
    // D-173 (0.5.12) put the Verifier's own PATCH here, outside the digest, so
    // that the bundle's `spec` could be the MINOR version. The schema was not
    // amended in the same patch, and it is frozen.
    'bundle.observations.verifierSpec',
  ],
};

/**
 * `contentEncoding` asserted by hand, because ajv treats it as an annotation.
 *
 * THE ROUND TRIP IS THE TEST, and it is stricter than a pattern. Node's decoder
 * is lenient: it skips characters outside the alphabet, tolerates missing
 * padding, and accepts base64url characters under 'base64'. Re-encoding and
 * demanding equality rejects every one of those, and rejects non-canonical
 * trailing bits too — `Buffer.from('QR==','base64').toString('base64')` is
 * `'QQ=='`, so `'QR=='` fails, as it should. The empty string round-trips to
 * itself and passes, which is right: an empty payload is still bytes.
 */
function encodingFault(value: unknown, encoding: string): string | null {
  if (typeof value !== 'string') {
    const what =
      value === null
        ? 'null'
        : Array.isArray(value)
          ? 'an array'
          : typeof value === 'object' && (value as { type?: unknown }).type === 'Buffer'
            ? 'a serialised Node Buffer, {"type":"Buffer","data":[…]} — THE DEFECT THIS CHECK EXISTS FOR'
            : typeof value;
    return `is ${what}, and ${encoding} is a STRING`;
  }
  if (encoding !== 'base64' && encoding !== 'base64url') return null;
  const enc: BufferEncoding = encoding === 'base64url' ? 'base64url' : 'base64';
  if (Buffer.from(value, enc).toString(enc) !== value) {
    return `is not canonical ${encoding}: it does not survive a decode/encode round trip`;
  }
  return null;
}

async function main(): Promise<void> {
  const root = repoRoot();
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  addFormats(ajv);

  // ===== The world, and the real returns it produces =======================
  const w = await stand();

  const story: string[] = [];
  const flight = send(
    { ...w.ctx, onLine: (l) => story.push(l) },
    {
      coordinates: w.coordinates,
      manifest: w.manifest,
      payload: PAYLOAD,
      returnReceipt: true,
      windowSeconds: 10,
      receiptWindowSeconds: 30 * 86_400,
    },
  );
  await new Promise((r) => setTimeout(r, 50));
  const lane = answerTheDoor(w);
  const posted = await flight;
  if (posted.kind !== 'postmark') {
    failures.push('the court did not post a letter; nothing downstream can be courted');
    report();
    return;
  }

  // The slip arm of §6.4's `oneOf`: a door that never answers inside the window.
  const s = await stand();
  const slipped = await send(s.ctx, {
    coordinates: s.coordinates,
    manifest: s.manifest,
    payload: PAYLOAD,
    windowSeconds: 1,
  });

  const keys = new Map<number, KeyObject>([[1, w.recipient.key]]);
  const inboxCtx = {
    reader: w.ledger.reader(),
    account: w.recipient.account,
    keys,
    treasury: w.ledger.treasury,
    stampToken: w.ledger.stampToken,
  };
  const deliveries = await inbox(inboxCtx, { lanes: [lane] });
  const delivered = deliveries[0] as Delivery;

  // AN UNOPENED DELIVERY, FROM A REAL CALL AND NOT BUILT HERE. §6.5's `reason`
  // is only reachable on a delivery that did not open, and a court whose letter
  // always opens never exercises it. The same `inbox`, over the same lane, with
  // no key for the epoch: P-12 says that is a downgrade and not a failure, so it
  // returns a Delivery carrying a reason rather than throwing.
  const unopened = await inbox({ ...inboxCtx, keys: new Map<number, KeyObject>() }, { lanes: [lane] });

  const acked = await ack(
    {
      consensus: w.ledger.as(w.recipient.account),
      ledgerTag: w.ledger.ledgerTag,
      account: w.recipient.account,
      doorbell: w.recipient.doorbell,
      manifestTopic: w.recipient.manifestTopic,
    },
    delivered,
  );

  const verified = await verify(w.ledger.reader(), { lane }, { narrative: true });

  // ===== What each verb's handler would put on the wire =====================
  const INSTANCES: Readonly<Record<ToolName, readonly Record<string, unknown>[]>> = {
    resolve: [STRUCTURED.resolve(w.coordinates)],
    buy_stamp: [STRUCTURED.buy_stamp(HAND_BUILT_RECEIPT)],
    send: [STRUCTURED.send(posted), STRUCTURED.send(slipped)],
    inbox: [STRUCTURED.inbox(deliveries), STRUCTURED.inbox(unopened)],
    ack: [STRUCTURED.ack(acked.receipt)],
    verify: [STRUCTURED.verify(verified)],
  };

  ok('the court opened the letter, so inbox is courted on an OPENED delivery', delivered.opened);
  ok('and it carries a payload, so `contentEncoding` is actually exercised', delivered.payload !== undefined);
  ok('and a pending schedule, so §6.5’s fourth field is exercised', delivered.returnReceipt !== undefined);
  ok('and send is courted on BOTH arms of §6.4’s oneOf', posted.kind === 'postmark' && slipped.kind === 'slip');
  is('and inbox on an unopened delivery too, so §6.5’s reason has a producer', unopened[0]?.reason, 'INBOX_EPOCH_UNKNOWN');

  // ===== The three questions, per verb ======================================
  for (const t of six()) {
    const name = t.name as ToolName;
    const instances = INSTANCES[name] ?? [];
    ok(
      `${name}: the court produced at least one instance of what its handler returns — ` +
        'a published verb with NO PRODUCER is not covered, and this check will not pass as though it were',
      instances.length > 0,
    );
    if (instances.length === 0) continue;

    const schema = bundled(t.outputSchema, root);
    const validate = ajv.compile(schema);
    const declared = declaredOf(schema);

    // --- 1. Validation, after the round trip a wire imposes. ----------------
    const onTheWire = instances.map((i) => JSON.parse(JSON.stringify(i)) as Record<string, unknown>);
    for (const [i, instance] of onTheWire.entries()) {
      const valid = validate(instance) === true;
      ok(
        `${name}: a real handler return validates against its own published outputSchema` +
          (instances.length > 1 ? ` (instance ${i + 1} of ${instances.length})` : '') +
          (valid ? '' : ` — ${ajv.errorsText(validate.errors)}`),
        valid,
      );
    }

    // --- 2. Every produced key declared; every declared key produced. -------
    const observed = new Set<string>();
    for (const instance of onTheWire) for (const p of pathsIn(instance)) observed.add(p);

    const undeclared = [...observed].filter((p) => !declared.paths.has(p)).sort();
    is(
      `${name}: the keys it produces that its schema does not declare are exactly the ones written down ` +
        '(the only assertion that reaches postmark, settlement and observations, which declare no additionalProperties)',
      undeclared,
      [...(UNDECLARED[name] ?? [])].sort(),
    );

    const unproduced = [...declared.paths].filter((p) => !observed.has(p)).sort();
    is(
      `${name}: the declared keys nothing produces are exactly the ones written down, each with a reason`,
      unproduced,
      [...(UNPRODUCED[name] ?? [])].sort(),
    );

    // --- 3. contentEncoding, which ajv does not enforce. --------------------
    let encodingsSeen = 0;
    for (const [path, encoding] of declared.encodings) {
      for (const instance of onTheWire) {
        for (const value of valuesAt(instance, path)) {
          encodingsSeen += 1;
          const fault = encodingFault(value, encoding);
          ok(
            `${name}: ${path} ${fault ?? `is canonical ${encoding}`} ` +
              '(contentEncoding is annotation-only in ajv; asserted by hand)',
            fault === null,
          );
        }
      }
    }
    if (name === 'inbox') {
      ok('inbox actually exercised a contentEncoding field, rather than passing vacuously', encodingsSeen > 0);
    }
  }

  // ===== Provenance is declared for every verb, and for no other ============
  is(
    'every verb the server publishes has a declared provenance, and none that it does not',
    Object.keys(PROVENANCE).sort(),
    six()
      .map((t) => t.name)
      .sort(),
  );

  // ===== The affordances publish no outputSchema, and that is a FACT ========
  // Asserted so that the reason they have no instances is a decision rather
  // than an omission — and so that giving one an outputSchema without giving it
  // a producer fails here rather than at a client.
  for (const a of affordances()) {
    ok(
      `${a.name}: a §4.6 affordance publishes no outputSchema, so it returns no structuredContent ` +
        '(it is not one of §6.1’s six and no class is tested against it)',
      (a as unknown as { outputSchema?: unknown }).outputSchema === undefined,
    );
  }

  // ===== THE REGRESSION, KEPT RATHER THAN NARRATED =========================
  // What `inbox` returned until 2026-09-11, asserted to FAIL. This is the
  // evidence the defect was real, and it is permanent: the day someone puts the
  // internal Delivery back on the wire, this line goes green and the one above
  // it goes red, and the pair of them say exactly what happened.
  {
    const validate = ajv.compile(bundled(six().find((t) => t.name === 'inbox')!.outputSchema, root));
    // The RAW internal Delivery, which is what `ok(out, { deliveries: out })`
    // put on the wire — not `observedDelivery`, whose payload is already base64.
    const asItWas = JSON.parse(JSON.stringify({ deliveries }));
    ok(
      'the shape `inbox` returned until 2026-09-11 — the internal Delivery, Buffer payload and all — ' +
        'does NOT validate against the schema this server has always published (the defect, kept)',
      validate(asItWas) !== true,
    );
    const payload = (asItWas as { deliveries: { payload?: unknown }[] }).deliveries[0]?.payload;
    is(
      'and the payload in it is a serialised Node Buffer, which is what goose rendered as decimal soup',
      (payload as { type?: unknown } | undefined)?.type,
      'Buffer',
    );
  }

  report();
}

function report(): void {
  console.log('');
  for (const f of failures) console.log(`  FAIL  ${f}`);
  if (failures.length > 0) {
    console.log(`\ncheck:outputs FAILED — ${failures.length} of ${passed + failures.length}\n`);
    process.exit(1);
  }
  const real = (Object.keys(PROVENANCE) as ToolName[]).filter((n) => PROVENANCE[n] === 'model-court');
  const hand = (Object.keys(PROVENANCE) as ToolName[]).filter((n) => PROVENANCE[n] === 'hand-built');
  console.log(
    `check:outputs PASS — ${passed} assertions over every verb this server publishes, each validated against ` +
      `its OWN published outputSchema after the JSON round trip a wire imposes. REAL handler returns from the ` +
      `model court: ${real.join(', ')} — send on both arms of §6.4's oneOf, inbox on an opened delivery ` +
      `carrying a payload and a pending schedule. HAND-BUILT and NOT courted on a real return here: ` +
      `${hand.join(', ')} — its only producer is the counter, which check:exchange stands up over a socket and ` +
      `which validates the same receipt inside this wrapper. Every declared key is either produced by a real ` +
      `instance or on a written list with a reason; every produced key is declared, which is the only assertion ` +
      `that reaches postmark and settlement; and every base64 field is round-tripped, because ajv treats ` +
      `contentEncoding as an annotation and a Node Buffer crossed that hole live under goose.\n`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 3;
});
