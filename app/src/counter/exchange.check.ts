/**
 * `npm run check:exchange` — §14.2's exchange over a REAL Streamable HTTP
 * socket, on loopback, against a modelled ledger.
 *
 * WHY THIS EXISTS AS A SEPARATE CHECK. `check:correspondent` runs the carry
 * policy by calling `carrySignature` directly, and `check:mcp` compiles every
 * tool schema — and between them they never open a socket. So until now nothing
 * had established that the counter's HTTP transport carries what the two sides
 * think it carries: that a requirement survives `_meta`, that a refusal arrives
 * as a `STAMP_*` code rather than a transport error, that a signature made on
 * one side of a socket verifies on the other, and that the receipt leg's
 * "not yet" is distinguishable from its "here it is". Every one of those is a
 * wire fact, and a wire fact that has never crossed a wire is a guess.
 *
 * WHAT IS REAL HERE. The counter's own `build()` and `serve()`, on an ephemeral
 * loopback port. The MCP SDK's own `StreamableHTTPServerTransport` and
 * `StreamableHTTPClientTransport`. The real tool table, the real bundled
 * schemas, the real `quotePurchase`, `carrySignature` and `issueReceipt`, the
 * real `TransactionBody` decoder, the real §9.2 resolver, and the registered
 * `StampReceipt` schema.
 *
 * WHAT IS MODELLED. The ledger. A small in-memory `Mirror` serves the four
 * routes the counter reads — an account, a topic, a topic's messages, a
 * transaction — and is seeded with the committed sequence-2 `PriceList`, a
 * complete §9.2 declaration chain, and the transactions the carried rows landed
 * as. Freezing a transaction offline needs no network, so every body signed
 * here is a body the SDK really produced.
 *
 * WHAT IS NOT EXERCISED, AND WHY IT CANNOT BE. **The two submissions.** The
 * transfer that settles a purchase and the nine bodies the counter co-signs go
 * to a consensus node, and there is no offline consensus node. So this check
 * drives the settle leg down its REPLAY path — the one a second call takes once
 * the transfer has landed, which returns where the purchase got to and touches
 * no network — and every other leg for real. What remains untested until Gate
 * One is `submit()` itself, which is the same thing that was untested before
 * this check existed; what is now tested is everything around it.
 *
 * Conformance: T-P15-4, T-P11-2, T-P11-5, T-P13-1, T-P13-3, T-P16-1, T-P4-1.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { AccountId, AccountUpdateTransaction, Client, Hbar, PrivateKey, Transaction, TransactionId } from '@hashgraph/sdk';
import { Client as McpClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { HCS2_REGISTER_TX_MEMO, accountMemoFor, profileBytes, registerOperation, registryMemo } from '../ops/declaration.js';
import { UnchunkedTopicMessageSubmitTransaction } from '../ops/hcs10.js';
import { repoRoot } from '../ops/env.js';
import { networkConstants } from '../ops/networks.js';
import { HCS10_TTL, doorbell, log as logRow, manifest, declRegistry, profileFile, type TemplateSubject } from '../ops/template.js';
import { topicCreateFor } from '../../sdk/mailbox.js';
import { schemas } from '../schema/loader.js';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormatsImport from 'ajv-formats';
import { bundled } from '../mcp/bundle.js';
import { tool } from '../mcp/tools.js';
import { build } from './server.js';
import { carryFeeCapTinybars } from './server.js';
import { openCarry } from './carry.js';
import type { CounterContext } from './context.js';
import type { Mirror } from '../ops/mirror.js';
import type { Signer } from '../ops/identity.js';

let passed = 0;
const failures: string[] = [];
function is(what: string, got: unknown, want: unknown): void {
  try {
    assert.deepEqual(got, want);
    passed += 1;
  } catch {
    failures.push(`${what}\n      want ${JSON.stringify(want)}\n      got  ${JSON.stringify(got)}`);
  }
}
function ok(what: string, condition: boolean): void {
  if (condition) passed += 1;
  else failures.push(what);
}

/* ------------------------------------------------------------------ */
/* The parties, and the ledger they are modelled against.              */
/* ------------------------------------------------------------------ */

const agentKey = PrivateKey.generateED25519();
const postmasterKey = PrivateKey.generateED25519();
const strangerKey = PrivateKey.generateED25519();

const POSTMASTER = '0.0.800';
const BUYER = '0.0.900';
const ACCOUNT = '0.0.1000';
const TREASURY = '0.0.2002';
const TOKEN = '0.0.3003';
/**
 * The node the counter pins is the SDK's own choice from its network map, so
 * this check learns it from the quote rather than asserting a number. What it
 * then asserts is the thing that matters: every carried body must be addressed
 * to that same node, and one addressed elsewhere is refused.
 */
let NODE = '';
const OTHER_NODE = '0.0.4';
const PRICE_TOPIC = '0.0.7';
const DOORBELL = '0.0.5001';
const LOG = '0.0.5002';
const MANIFEST = '0.0.5003';
const REGISTRY = '0.0.5004';
const FILE_TOPIC = '0.0.5005';
const REFERENCE = `${POSTMASTER}@1757000000.000000001`;

const constants = networkConstants('testnet');
const client = Client.forName('testnet');
client.setOperator(POSTMASTER, postmasterKey);

const subject: TemplateSubject = {
  account: ACCOUNT,
  publicKey: agentKey.publicKey.toStringRaw(),
  treasury: TREASURY,
  stampToken: TOKEN,
  autoRenewAccount: BUYER,
};

/**
 * The profile the modelled agent declared, built by the SAME function
 * `sdk/mailbox.ts` builds it with — so the digest in the file topic's memo, the
 * chunks on it, and the identifier §9.5 recomputes are all the real ones.
 */
const profile = profileBytes(repoRoot(), {
  ledgerTag: constants.ledgerTag,
  network: 'testnet',
  account: ACCOUNT,
  doorbell: DOORBELL,
  log: LOG,
  wishmail: { manifestTopic: MANIFEST, x25519Pub: 'a'.repeat(43), keyEpoch: 1 },
  identity: { displayName: 'Correspondent X', alias: 'correspondent-x', bio: 'A modelled Correspondent.' },
});

/* ------------------------------------------------------------------ */
/* A Mirror over a map. Four routes, and it answers nothing else.      */
/* ------------------------------------------------------------------ */

interface Message {
  readonly sequence_number: number;
  readonly consensus_timestamp: string;
  readonly message: string;
  readonly payer_account_id: string;
  readonly running_hash: string;
  readonly running_hash_version: number;
}

const accounts = new Map<string, unknown>();
const topics = new Map<string, unknown>();
const messages = new Map<string, Message[]>();
const transactions = new Map<string, string>();

let clock = 1757000100;
function post(topicId: string, body: unknown, payer = ACCOUNT): void {
  const list = messages.get(topicId) ?? [];
  list.push({
    sequence_number: list.length + 1,
    consensus_timestamp: `${(clock += 1)}.000000000`,
    message: Buffer.from(typeof body === 'string' ? body : JSON.stringify(body), 'utf8').toString('base64'),
    payer_account_id: payer,
    running_hash: '00'.repeat(48),
    running_hash_version: 3,
  });
  messages.set(topicId, list);
}

/** `0.0.n@s.nanos` as a mirror node spells it, so a lookup finds what was recorded. */
function mirrorTx(id: string): string {
  const m = id.match(/^(\d+\.\d+\.\d+)@(\d+)\.(\d+)$/);
  return m === null ? id : `${m[1]}-${m[2]}-${m[3]?.padStart(9, '0')}`;
}

const mirror = {
  get: <T>(p: string): Promise<T | null> => {
    const accountMatch = p.match(/^\/accounts\/([0-9.]+)/);
    if (accountMatch) return Promise.resolve((accounts.get(accountMatch[1] as string) ?? null) as T | null);
    const msgMatch = p.match(/^\/topics\/([0-9.]+)\/messages/);
    if (msgMatch) {
      const list = messages.get(msgMatch[1] as string);
      return Promise.resolve(list === undefined ? null : ({ messages: list, links: { next: null } } as T));
    }
    const topicMatch = p.match(/^\/topics\/([0-9.]+)$/);
    if (topicMatch) return Promise.resolve((topics.get(topicMatch[1] as string) ?? null) as T | null);
    const txMatch = p.match(/^\/transactions\/(\S+)$/);
    if (txMatch) {
      const entity = transactions.get(txMatch[1] as string);
      if (entity === undefined) return Promise.resolve(null);
      return Promise.resolve({
        transactions: [{ transaction_id: txMatch[1], result: 'SUCCESS', entity_id: entity, consensus_timestamp: '1757000200.000000000' }],
      } as T);
    }
    return Promise.resolve(null);
  },
  poll: <T>(p: string, ready: (v: T) => boolean): Promise<T | null> =>
    mirror.get<T>(p).then((v) => (v !== null && ready(v) ? v : null)),
} as unknown as Mirror;

/** Seed the modelled ledger: the price schedule, and one complete §9.2 chain. */
function seed(): void {
  const priceList = JSON.parse(fs.readFileSync(path.join(repoRoot(), 'app', 'price-list-2.hedera-testnet.json'), 'utf8')) as Record<string, unknown>;
  delete priceList['_readme'];
  priceList['stampToken'] = { ledgerTag: constants.ledgerTag, tokenId: TOKEN, treasury: TREASURY };
  for (const m of priceList['methods'] as Record<string, unknown>[]) {
    m['payTo'] = POSTMASTER;
    // The committed schedule prices `hbar` by a live HBAR/USD rate, and a quote
    // under it reaches api.saucerswap.finance. That is right on the network and
    // wrong in a check: this one is against a MODELLED ledger, and a check that
    // fetched a market price would be a check that fails when a market endpoint
    // does. The rate path is arithmetic and `check:correspondent` is its court;
    // what is on trial here is the wire. So the modelled method is fixed-priced.
    if (m['method'] === 'hbar') {
      delete m['rate'];
      m['unitPrice'] = '0.10';
    }
  }
  post(PRICE_TOPIC, priceList, POSTMASTER);

  accounts.set(ACCOUNT, { account: ACCOUNT, memo: accountMemoFor(REGISTRY), key: { _type: 'ED25519', key: agentKey.publicKey.toStringRaw() } });
  accounts.set(POSTMASTER, { account: POSTMASTER, memo: '', key: { _type: 'ED25519', key: postmasterKey.publicKey.toStringRaw() } });
  topics.set(REGISTRY, { topic_id: REGISTRY, memo: registryMemo(HCS10_TTL) });
  topics.set(FILE_TOPIC, { topic_id: FILE_TOPIC, memo: profile.memo });
  topics.set(MANIFEST, { topic_id: MANIFEST, memo: 'wishmail:manifest:1' });
  post(REGISTRY, registerOperation(FILE_TOPIC));
  for (const chunk of profile.chunks) post(FILE_TOPIC, chunk);
}

/* ------------------------------------------------------------------ */
/* The counter, on a real socket.                                      */
/* ------------------------------------------------------------------ */

const postmasterPayer: Signer = {
  label: 'postmaster payer',
  publicKey: postmasterKey.publicKey,
  sign: (m) => Promise.resolve(postmasterKey.sign(m)),
};

const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wishmail-exchange-'));
const ctx = {
  repoRoot: repoRoot(),
  ledgerTag: constants.ledgerTag,
  constants,
  mirror,
  mirrorNodeUrl: '',
  client,
  stateDir,
  postmasterPayerId: POSTMASTER,
  postmasterPayer,
  treasuryId: TREASURY,
  treasury: postmasterPayer,
  stampToken: TOKEN,
  priceTopic: PRICE_TOPIC,
  carryFeeCap: carryFeeCapTinybars(constants.feeCaps.feeGatedTopicCreate),
} as unknown as CounterContext;

/** The counter's own `serve()`, minus its console line and on a port the OS picks. */
async function listen(): Promise<{ readonly url: string; readonly close: () => Promise<void> }> {
  const http = createServer((req: IncomingMessage, res: ServerResponse) => {
    void (async () => {
      try {
        const server = build({ ctx, holAnchors: [] });
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
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  const address = http.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  return {
    url: `http://127.0.0.1:${port}/mcp`,
    close: () => new Promise<void>((resolve) => http.close(() => resolve())),
  };
}

interface ToolResult {
  readonly isError?: boolean;
  readonly content?: readonly { readonly type: string; readonly text?: string }[];
  readonly structuredContent?: Record<string, unknown>;
  readonly _meta?: Record<string, unknown>;
}

/* ------------------------------------------------------------------ */

async function main(): Promise<void> {
  seed();
  const server = await listen();
  const mcp = new McpClient({ name: 'wishmail-exchange-check', version: '0.5.13' }, { capabilities: {} });
  await mcp.connect(new StreamableHTTPClientTransport(new URL(server.url)) as unknown as Parameters<typeof mcp.connect>[0]);

  const call = async (args: Record<string, unknown>): Promise<ToolResult> =>
    (await mcp.callTool({ name: 'buy_stamp', arguments: args })) as unknown as ToolResult;

  /* ---- the surface, over the wire ---- */
  {
    const listed = (await mcp.listTools()) as unknown as { tools: readonly { name: string; inputSchema: unknown; outputSchema: unknown }[] };
    is(
      'the counter serves exactly three of §6.1’s six over Streamable HTTP (T-P15-4)',
      listed.tools.map((t) => t.name).sort(),
      ['buy_stamp', 'resolve', 'verify'],
    );
    ok(
      'and every one of them carries a bundled input AND output schema across the wire',
      listed.tools.every((t) => typeof t.inputSchema === 'object' && t.inputSchema !== null && typeof t.outputSchema === 'object' && t.outputSchema !== null),
    );
  }

  /* ---- leg 1: the quote ---- */
  let body = '';
  let quoteOfRecord: Record<string, unknown> = {};
  {
    const quoted = await call({ count: 12, payment: { method: 'hbar', from: BUYER }, holder: { publicKey: agentKey.publicKey.toStringDer() }, provision: true });
    const requirement = quoted._meta?.['wishmail/requirement'] as
      | {
          reference: string;
          body: string;
          node: string;
          carriedBy?: string;
          quote: { amount: string; currency: string; provisioning?: { amount: string; registrationFee?: string } };
        }
      | undefined;
    ok('a quote comes back as PAYMENT_REQUIRED with the requirement in _meta and never in structuredContent', requirement !== undefined && quoted.structuredContent === undefined);
    is('and the code the client reads is the one the counter set', quoted._meta?.['wishmail/code'], 'PAYMENT_REQUIRED');
    if (requirement === undefined) {
      throw new Error(`the quote carried no requirement; nothing after this can run — ${(quoted.content ?? []).map((c) => c.text).join(' ')}`);
    }
    body = requirement.body;
    quoteOfRecord = requirement.quote as unknown as Record<string, unknown>;
    ok('the quote pins one node and says which, so a carried body can be addressed to it', /^\d+\.\d+\.\d+$/.test(requirement.node));
    NODE = requirement.node;
    is('and names the account that will pay for the provisioning bodies', requirement.carriedBy, POSTMASTER);
    // "1" and not "1.00". §14.3 fixes amounts as decimal strings and `unscaled`
    // returns the NORMALISED one, so a receipt says what the price IS and not
    // what the message spelled. Asserted as it is rather than as it reads,
    // because it is worth a reader knowing: **T-P11-4, when it is written, must
    // compare these as fixed-point VALUES and not as strings**, or it will fail a
    // receipt that is exactly right. Nothing is contradicted — §14.3 requires no
    // literal echo — so this is a note for that test and not a §G entry.
    is('the price is sequence 2’s bundle at exactly twelve, in its normalised form', requirement.quote.amount, '1');
    is('and the provisioned path is priced at what the schedule publishes', requirement.quote.provisioning?.amount, '2');
    is('and the registration fee it funds', requirement.quote.provisioning?.registrationFee, '0.05');
    is('and the registration fee the purchase funds is the one the schedule publishes', requirement.quote.provisioning?.registrationFee, '0.05');
  }

  /* ---- leg 2: the buyer signs, on this side of the socket ---- */
  let signature = '';
  {
    const frozen = Transaction.fromBytes(Buffer.from(body, 'base64'));
    const bodies = frozen.signableNodeBodyBytesList;
    is('the counter quoted exactly one body, because it froze against one node', bodies.length, 1);
    const bytes = (bodies[0] as { signableTransactionBodyBytes: Uint8Array }).signableTransactionBodyBytes;
    signature = Buffer.from(await postmasterPayer.sign(bytes)).toString('base64');
    ok(
      'and a signature made over the body that crossed the wire verifies against it — the bytes survived the transport',
      postmasterKey.publicKey.verify(bytes, Buffer.from(signature, 'base64')),
    );
  }

  /* ---- leg 3: settle, down the replay path a landed transfer takes ---- */
  {
    // What a settled transfer leaves behind. The submission itself needs a
    // consensus node and is Gate One's; everything the HTTP leg carries is here.
    openCarry(ctx, {
      reference: REFERENCE,
      txRef: REFERENCE,
      count: 12,
      // The quote the counter itself gave, not one this check invents — the
      // receipt is built from it, so inventing one here would test the check.
      quote: quoteOfRecord as never,
      holderKey: agentKey.publicKey.toStringRaw(),
      account: ACCOUNT,
      buyer: BUYER,
      node: NODE,
      feeCap: ctx.carryFeeCap,
    });
    const settled = await call({
      count: 12,
      payment: { method: 'hbar', from: BUYER, quoteRef: REFERENCE, signature: { publicKey: postmasterKey.publicKey.toStringDer(), value: signature } },
      holder: { publicKey: agentKey.publicKey.toStringDer() },
      provision: true,
    });
    const carrying = settled._meta?.['wishmail/carrying'] as { account?: string; node?: string; feeCap?: number } | undefined;
    ok('a provisioning purchase whose transfer has landed answers with what it is carrying, and no receipt', carrying !== undefined && settled.structuredContent === undefined);
    is('and it says which state it is in, so a caller can tell it from a §6.3 failure', settled._meta?.['wishmail/code'], 'PAYMENT_CARRYING');
    is('and it names the account the purchase created', carrying?.account, ACCOUNT);
    is('and the node every carried body must be addressed to', carrying?.node, NODE);
  }

  /* ---- leg 4: carry, every row, over the wire ---- */
  const bodyOf = async (tx: Transaction, payer = POSTMASTER, node = NODE): Promise<Buffer> => {
    tx.setTransactionId(TransactionId.generate(payer)).setNodeAccountIds([AccountId.fromString(node)]);
    const frozen = await tx.freezeWith(client);
    const one = frozen.signableNodeBodyBytesList[0] as { signableTransactionBodyBytes: Uint8Array } | undefined;
    if (one === undefined) throw new Error('a body frozen against one node produced no signable bytes');
    return Buffer.from(one.signableTransactionBodyBytes);
  };
  const carry = async (bytes: Buffer): Promise<ToolResult> =>
    call({
      count: 12,
      payment: { method: 'hbar', from: BUYER, quoteRef: REFERENCE, carry: { body: bytes.toString('base64') } },
      holder: { publicKey: agentKey.publicKey.toStringDer() },
      provision: true,
    });

  const rows = [
    ['doorbell', doorbell(subject), DOORBELL],
    ['log', logRow(subject), LOG],
    ['manifest', manifest(subject), MANIFEST],
    ['declRegistry', declRegistry(subject, registryMemo(HCS10_TTL)), REGISTRY],
    ['profileFile', profileFile(subject, profile.memo), FILE_TOPIC],
  ] as const;

  for (const [name, shape, becomes] of rows) {
    const bytes = await bodyOf(topicCreateFor(shape, agentKey.publicKey, constants.feeCaps));
    const answer = await carry(bytes);
    const decision = answer._meta?.['wishmail/carried'] as { row?: string; signature?: string; transactionId?: string } | undefined;
    is(`row \`${name}\` is recognised and paid for, over the wire`, decision?.row, name);
    ok(
      `and the signature that came back verifies against the very bytes that went out (\`${name}\`)`,
      decision?.signature !== undefined && postmasterKey.publicKey.verify(bytes, Buffer.from(decision.signature, 'base64')),
    );
    if (decision?.transactionId !== undefined) transactions.set(mirrorTx(decision.transactionId), becomes);
  }

  {
    const chunk = await bodyOf(new UnchunkedTopicMessageSubmitTransaction().setTopicId(FILE_TOPIC).setMessage(Buffer.from(JSON.stringify(profile.chunks[0]))));
    is('an HCS-1 chunk on the file topic it paid for is carried', ((await carry(chunk))._meta?.['wishmail/carried'] as { row?: string } | undefined)?.row, 'profileChunks');
    const register = await bodyOf(
      new UnchunkedTopicMessageSubmitTransaction()
        .setTopicId(REGISTRY)
        .setMessage(Buffer.from(JSON.stringify(registerOperation(FILE_TOPIC))))
        .setTransactionMemo(HCS2_REGISTER_TX_MEMO),
    );
    is('the HCS-2 register entry on the registry it paid for is carried', ((await carry(register))._meta?.['wishmail/carried'] as { row?: string } | undefined)?.row, 'registryEntry');
    const memo = await bodyOf(new AccountUpdateTransaction().setAccountId(ACCOUNT).setAccountMemo(accountMemoFor(REGISTRY)).setMaxTransactionFee(new Hbar(2)));
    is('§9.2’s account memo is carried', ((await carry(memo))._meta?.['wishmail/carried'] as { row?: string } | undefined)?.row, 'accountMemo');
  }

  /* ---- and the refusals, as codes rather than transport errors ---- */
  {
    const refused = async (what: string, bytes: Buffer): Promise<void> => {
      const answer = await carry(bytes);
      ok(`over the wire, the counter refuses to pay for ${what}`, answer.isError === true);
      ok(
        `and the refusal arrives as a §6.3 code, not as a transport error (${what})`,
        typeof answer._meta?.['wishmail/code'] === 'string' && String(answer._meta['wishmail/code']).startsWith('STAMP_'),
      );
    };
    await refused('a row whose keys are a stranger’s', await bodyOf(topicCreateFor(logRow(subject), strangerKey.publicKey, constants.feeCaps)));
    await refused('a body whose payer is not the Postmaster', await bodyOf(topicCreateFor(manifest(subject), agentKey.publicKey, constants.feeCaps), BUYER));
    await refused('a body addressed to a node this purchase did not pin', await bodyOf(topicCreateFor(manifest(subject), agentKey.publicKey, constants.feeCaps), POSTMASTER, OTHER_NODE));
    await refused(
      'an account update that also rotates the account’s key',
      await bodyOf(new AccountUpdateTransaction().setAccountId(ACCOUNT).setKey(strangerKey.publicKey).setMaxTransactionFee(new Hbar(2))),
    );
  }

  /* ---- leg 5: the receipt, and its "not yet" ---- */
  {
    const withheld = await call({ count: 12, payment: { method: 'hbar', from: BUYER, quoteRef: `${POSTMASTER}@1757000000.000000009`, receipt: true }, holder: { account: ACCOUNT } });
    ok('asking for the receipt of a reference this counter never opened is a refusal and not a crash', withheld.isError === true);

    const issued = await call({ count: 12, payment: { method: 'hbar', from: BUYER, quoteRef: REFERENCE, receipt: true }, holder: { publicKey: agentKey.publicKey.toStringDer() }, provision: true });
    const receipt = issued.structuredContent?.['receipt'] as Record<string, unknown> | undefined;
    const outstanding = issued._meta?.['wishmail/outstanding'] as readonly string[] | undefined;
    if (receipt === undefined) {
      failures.push(`the receipt was not issued over the wire; outstanding: ${JSON.stringify(outstanding)} — ${(issued.content ?? []).map((c) => c.text).join(' ')}`);
    } else {
      passed += 1;
      const provisioning = receipt['provisioning'] as Record<string, unknown>;
      is('the receipt names the doorbell the counter paid for, read back from the mirror', provisioning['doorbell'], DOORBELL);
      is('and the manifest topic', provisioning['manifestTopic'], MANIFEST);
      is('and the account the purchase created', provisioning['account'], ACCOUNT);
      is('and the registration fee the schedule published', provisioning['registrationFee'], '0.05');
      is(
        'and the whole receipt validates against the REGISTERED StampReceipt schema, after crossing the wire',
        schemas(repoRoot()).validate('stamp-receipt', receipt),
        [],
      );
      {
        // AND INSIDE THE WRAPPER THIS SURFACE PUBLISHES, which is a different
        // claim: MCP validates `structuredContent` against the tool's
        // `outputSchema`, and that schema is `{receipt: <StampReceipt>}` with
        // `additionalProperties: false` — not the bare receipt. `check:outputs`
        // courts every other verb on a real return and courts THIS one on a
        // hand-built receipt, because the only producer of a real one is a
        // counter; one is standing right here, so the real thing is courted
        // here instead of nowhere.
        const addFormats =
          (addFormatsImport as unknown as { default?: (a: unknown) => void }).default ??
          (addFormatsImport as unknown as (a: unknown) => void);
        const ajv = new Ajv2020({ strict: false, allErrors: true });
        addFormats(ajv);
        const validate = ajv.compile(bundled(tool('buy_stamp').outputSchema, repoRoot()));
        const valid = validate(JSON.parse(JSON.stringify(issued.structuredContent))) === true;
        ok(
          'and the structuredContent this counter actually returned validates against buy_stamp’s own ' +
            'published outputSchema' +
            (valid ? '' : ` — ${ajv.errorsText(validate.errors)}`),
          valid,
        );
      }
      const again = await call({ count: 12, payment: { method: 'hbar', from: BUYER, quoteRef: REFERENCE, receipt: true }, holder: { publicKey: agentKey.publicKey.toStringDer() }, provision: true });
      is(
        'and a replayed reference returns the receipt it already bought, never a second one (T-P11-5)',
        (again.structuredContent?.['receipt'] as Record<string, unknown> | undefined)?.['txRef'],
        receipt['txRef'],
      );
    }
  }

  /* ---- and the two verbs a caller may use without holding anything (P-4) ---- */
  {
    const resolved = (await mcp.callTool({ name: 'resolve', arguments: { address: ACCOUNT, profile: 'hcs14' } })) as unknown as ToolResult;
    const coordinates = resolved.structuredContent?.['coordinates'] as Record<string, unknown> | undefined;
    is('`resolve` answers over the wire with the coordinates §9.2’s chain leads to', coordinates?.['doorbell'], DOORBELL);
    is('and with the manifest topic D-166 added, which `send` has no other way to learn', coordinates?.['manifestTopic'], MANIFEST);
    const badScope = (await mcp.callTool({ name: 'verify', arguments: {} })) as unknown as ToolResult;
    is('`verify` with no scope refuses with its own §6.6 code and does not fall over', badScope._meta?.['wishmail/code'], 'VERIFY_SCOPE_INVALID');
    const unknown = (await mcp.callTool({ name: 'send', arguments: {} })) as unknown as ToolResult;
    ok(
      '`send` is not served here — it needs the agent’s own keys and the Postmaster holds none (P-13)',
      unknown.isError === true && unknown._meta?.['wishmail/code'] === 'UNKNOWN_TOOL',
    );
  }

  await mcp.close();
  await server.close();
  client.close();
  fs.rmSync(stateDir, { recursive: true, force: true });

  console.log('');
  for (const f of failures) console.log(`  FAIL  ${f}`);
  if (failures.length > 0) {
    console.log(`\ncheck:exchange FAILED — ${failures.length} of ${passed + failures.length}\n`);
    process.exit(1);
  }
  console.log(
    `check:exchange PASS — ${passed} assertions over a real Streamable HTTP socket on loopback: §6.1's three verbs and ` +
      'their bundled schemas; §14.2\'s quote in `_meta` and never in `structuredContent`; a body that survives the ' +
      'transport and a signature made on one side that verifies on the other; every row of the provisioning template ' +
      'carried and every near-miss refused as a §6.3 code rather than a transport error; and a receipt built from the ' +
      "counter's own readback that validates against the registered schema. The two SUBMISSIONS are Gate One's: there " +
      'is no offline consensus node, so the settle leg runs down the replay path a landed transfer takes.',
  );
  console.log('');
}

main().catch((e: unknown) => {
  console.error('\ncheck:exchange STOPPED\n' + (e instanceof Error ? (e.stack ?? e.message) : String(e)));
  process.exit(2);
});
