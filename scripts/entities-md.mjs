/**
 * `ENTITIES.md`, generated — every WISHMail entity on `hedera:testnet`, what it
 * is, and a link to it.
 *
 * WHY IT IS GENERATED AND NEVER HAND-EDITED. There are already two records of
 * what is on the ledger — `app/deployment/<network>.json`, written one entity at
 * a time from mirror-node reads, and `spec/pins.json`, which is §1.6 in
 * machine-readable form — and a third written by hand would be a third place for
 * an id to be wrong. It would also be the place a reader trusts, because it is
 * the readable one. So this file derives from those two and `npm run
 * check:entities` asserts that what is committed is what they produce; a
 * hand-edit fails the check rather than surviving as a plausible mistake.
 *
 * WHAT IT IS FOR. A judge, a reviewer, or one of us six months from now opens a
 * mirror node and finds a dozen WISHMail-shaped topics and three
 * `$POSTAGE`-shaped tokens. Exactly one set of them operates. **The RESIDUE
 * table is the point of this file**: every probe leftover and every superseded
 * entity, on the ledger permanently, each saying why it is there and why it is
 * not ours. Anything else would leave the reader to guess, and a guess about
 * which token is the stamp token is a guess about what a receipt means.
 *
 * Usage:  npm run entities:md        write it
 *         npm run check:entities     assert the committed file equals its sources
 *
 *         npm run entities:md -- --homes <parent>
 *                                    after Gate One: snapshot the record of
 *                                    every home under <parent> into
 *                                    `app/deployment/demo-agents.hedera-testnet.json`,
 *                                    then write this file from it. Only each
 *                                    home's `record.json` is read — what that
 *                                    agent has on consensus, which is public —
 *                                    and never its config or its keystore, which
 *                                    stay outside the repository (P-13).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'ENTITIES.md');
const LEDGER = 'hedera:testnet';
const NETWORK = 'testnet';

/* ------------------------------------------------------------------ */
/* Links. A HashScan route per entity kind, and nothing invented.      */
/* ------------------------------------------------------------------ */

const ROUTE = { account: 'account', token: 'token', topic: 'topic' };

/** A HashScan link for an id, by kind. Ids that are null get no link and say so. */
function link(kind, id) {
  if (id === null || id === undefined || id === '') return '—';
  const route = ROUTE[kind];
  if (route === undefined) return `\`${id}\``;
  return `[\`${id}\`](https://hashscan.io/${NETWORK}/${route}/${id})`;
}

/** A transaction link. HashScan resolves the `0.0.n@seconds.nanos` form. */
function txLink(id) {
  if (!id) return '—';
  return `[\`${id}\`](https://hashscan.io/${NETWORK}/transaction/${id})`;
}

/* ------------------------------------------------------------------ */
/* The sources.                                                        */
/* ------------------------------------------------------------------ */

/**
 * How many bytes a recorded message was, whichever way its row spells it.
 *
 * `prices.first.policy.bytes` is the base64 BODY and `prices.second`'s is a
 * COUNT — one field name, two meanings, written a day apart. Rendering the
 * first as though it were the second put seven hundred characters of base64
 * into a table cell, which is how the difference was noticed. Neither row is
 * edited to suit a reader: a record of what was submitted is not rewritten.
 *
 * A base64 body is therefore DECODED before it is measured. Measuring the
 * encoding reported sequence 1 as 752 bytes — `ceil(563/3) x 4`, the length of
 * the transport form — for a message that is 563 bytes on consensus and whose
 * recorded sha256 is over those 563. The digest was right and the count beside
 * it was not, in the one file a reader is meant to trust because it is the
 * readable one. The fix is here, in the rendering, and not in the record.
 */
function byteCount(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Buffer.from(value, 'base64').length;
  return '?';
}

function sources() {
  const record = JSON.parse(fs.readFileSync(path.join(ROOT, 'app', 'deployment', 'hedera-testnet.json'), 'utf8'));
  const pins = JSON.parse(fs.readFileSync(path.join(ROOT, 'spec', 'pins.json'), 'utf8'));
  return { record, pins };
}

/** One row of the ops record, or a refusal that names what is missing. */
function entity(record, key) {
  const e = record.entities?.[key];
  if (e === undefined) throw new Error(`ENTITIES.md: app/deployment/hedera-testnet.json has no entity \`${key}\``);
  return e;
}

/* ------------------------------------------------------------------ */
/* The document.                                                       */
/* ------------------------------------------------------------------ */

function operating(record, pins) {
  const L = [];
  const row = (what, key, note) => {
    const e = entity(record, key);
    L.push(`| ${what} | ${link(e.kind, e.id)} | ${note} | ${txLink(e.transactionId)} |`);
  };

  L.push('## The deployment — what operates');
  L.push('');
  L.push(`On \`${record.ledgerTag}\`. Every id below was read back from a mirror node, never from an SDK receipt (D-144), and`);
  L.push('each row names the transaction that created it. The ops record carries a `specTag` per entity, because the eleven of');
  L.push('Step 2 were provisioned against a different text from the fourteen of Step 4, and one tag over both would be false.');
  L.push('');
  L.push('### Postage');
  L.push('');
  L.push('| What | Id | What it is | Created by |');
  L.push('|---|---|---|---|');
  {
    const p = entity(record, 'postage.token').policy ?? {};
    row(
      '**$POSTAGE**',
      'postage.token',
      `\`${p.symbol ?? '?'}\`, ${p.decimals ?? '?'} decimals, ${p.supplyType ?? '?'} supply — the stamp token §1.6 pins. ` +
        'No admin key, no freeze key, no pause key, no wipe key: what it cannot do is the point (§4.1).',
    );
    row(
      '**Treasury**',
      'treasury.account',
      'Holds the unissued supply, and collects every stamp consumed — §4.3 and §4.4’s doorbell fee alike.',
    );
  }
  L.push('');

  L.push('### The price list (§14.3)');
  L.push('');
  L.push('| What | Id | What it is | Created by |');
  L.push('|---|---|---|---|');
  {
    const first = entity(record, 'prices.first');
    const second = entity(record, 'prices.second');
    const topic = entity(record, 'prices.topic');
    row(
      '**Price topic**',
      'prices.topic',
      `Memo \`${topic.policy?.memo ?? '?'}\`. §14.3: the schedule is on consensus before it is charged, and the current ` +
        'price is the message current at the purchase.',
    );
    L.push(
      `| **PriceList, sequence 1** | \`${topic.id}\` #1 | ${byteCount(first.policy?.bytes)} bytes, sha256 \`${first.policy?.sha256 ?? '?'}\`. The first schedule; \`provisioning\` omitted. | ${txLink(first.transactionId)} |`,
    );
    const prov = second.policy?.provisioning ?? {};
    L.push(
      `| **PriceList, sequence 2** | \`${topic.id}\` #${second.policy?.sequenceNumber ?? '?'} | ${byteCount(second.policy?.bytes)} bytes, sha256 \`${second.policy?.sha256 ?? '?'}\`. Prices the provisioned path: ${prov.unitPrice ?? '?'} ℏ, registration fee ${prov.registrationFee ?? '?'} ℏ (D-159’s addendum). **This is the schedule Gate One buys at.** | ${txLink(second.transactionId)} |`,
    );
    // A later message renders where the record holds one. The schedule is the
    // sequence, so this table grows by a row and never by an edit.
    //
    // "Current now" belongs to the LAST row that exists and to no other. §14.3
    // makes the price current at a purchase the latest message before it, so a
    // superseded row still labelled current would be this file — the one a judge
    // follows — giving the wrong answer to every reader of it.
    const third = record.entities?.['prices.third'];
    const fourth = record.entities?.['prices.fourth'];
    const currentNow = ' **This is the schedule current now.**';
    if (third !== undefined) {
      const n = third.policy?.sequenceNumber ?? 3;
      L.push(
        `| **PriceList, sequence ${n}** | \`${topic.id}\` #${n} | ${byteCount(third.policy?.bytes)} bytes, ` +
          `sha256 \`${third.policy?.sha256 ?? '?'}\`. The hbar rate is read from the NETWORK's own exchange rate, which ` +
          `a mirror node serves with a timestamp filter — so a Verifier holding a receipt's \`rate.at\` obtains exactly ` +
          `what the Postmaster read (D-170).${fourth === undefined ? currentNow : ''} | ${txLink(third.transactionId)} |`,
      );
    }
    if (fourth !== undefined) {
      const n = fourth.policy?.sequenceNumber ?? 4;
      const p4 = fourth.policy?.provisioning ?? {};
      L.push(
        `| **PriceList, sequence ${n}** | \`${topic.id}\` #${n} | ${byteCount(fourth.policy?.bytes)} bytes, ` +
          `sha256 \`${fourth.policy?.sha256 ?? '?'}\`. Reprices the provisioned path at ${p4.unitPrice ?? '?'} ℏ. ` +
          `Sequences 2 and 3 published 2 ℏ, set before a HIP-991 fee-gated topic had been created on this network; ` +
          `Gate One measured one mailbox at 27.78102934 ℏ, of which the doorbell alone is 26.31542199 ℏ. Registration ` +
          `fee unchanged at ${p4.registrationFee ?? '?'} ℏ.${currentNow} | ${txLink(fourth.transactionId)} |`,
      );
    }
  }
  L.push('');
  L.push('§14.3 makes the schedule the *sequence* of messages, so a new schedule is a new message and no published one is');
  L.push('ever edited. **The price current at a purchase is the latest message before it**, so the last row above governs.');
  L.push('');

  L.push('### The Postmaster-agent');
  L.push('');
  L.push('The Postmaster runs a Correspondent of its own (§3.5), and it is provisioned from the same six-row template every');
  L.push('Correspondent is — `app/src/ops/template.ts`, read by both provisioners and by the counter’s carry policy.');
  L.push('');
  L.push('| What | Id | Declared shape | Created by |');
  L.push('|---|---|---|---|');
  const agentRows = [
    ['**Account**', 'agent.account', 'The agent’s own account, under the agent’s own key.'],
    ['**Doorbell** (HCS-10 inbound)', 'agent.doorbell', null],
    ['**Log** (HCS-10 outbound)', 'agent.log', null],
    ['**Manifest topic**', 'agent.manifest', null],
    ['**Declaration registry** (HCS-2)', 'agent.declRegistry', null],
    ['**Profile file** (HCS-1)', 'agent.profileFile', null],
  ];
  for (const [what, key, override] of agentRows) {
    const e = entity(record, key);
    const p = e.policy ?? {};
    const shape =
      override ??
      [
        p.memo ? `memo \`${p.memo}\`` : null,
        p.submitKey === null ? 'no submit key' : p.submitKey ? 'submit key the agent’s' : null,
        p.adminKey === null ? '**no admin key** (D-150)' : p.adminKey ? 'admin key the agent’s' : null,
        p.fee ? `HIP-991 fee of ${p.fee.amount} $POSTAGE to the treasury (§4.4)` : null,
        (p.feeExemptKeys ?? []).length ? 'the agent’s key exempt (D-137)' : null,
      ]
        .filter(Boolean)
        .join(' · ');
    L.push(`| ${what} | ${link(e.kind, e.id)} | ${shape} | ${txLink(e.transactionId)} |`);
  }
  L.push('');
  L.push('§9.2’s chain runs account memo → declaration registry → profile file → `properties.wishmail`, and it resolves: that');
  L.push('is what `npm run check:hcs14` walks and what the resolver is run against before anything else is built on it.');
  L.push('');

  L.push('### The fourteen registered schemas (§5.11, HCS-13)');
  L.push('');
  L.push('§18.5 fixes fourteen schema files by name. Each is an HCS-1 file topic holding the schema’s bytes and an HCS-2');
  L.push('registry topic naming it; the `schemaRef` pins a version to a **sequence number on that registry**, which is what a');
  L.push('chunk’s `schemaRef` dereferences (§5.11). **§1.7 has fired**: these are registered, so no file in `spec/schemas/`');
  L.push('moves again under 0.5.');
  L.push('');
  L.push('| Schema | File topic (HCS-1) | Registry topic (HCS-2) | `schemaRef` | sha256 |');
  L.push('|---|---|---|---|---|');
  const names = [...new Set(Object.keys(record.entities ?? {}).filter((k) => k.startsWith('schema.')).map((k) => k.split('.')[1]))].sort();
  for (const name of names) {
    const file = entity(record, `schema.${name}.file`);
    const registry = entity(record, `schema.${name}.registry`);
    const pin = pins.registeredSchemas?.[name];
    if (pin === undefined || pin.schemaRef === null || pin.schemaRef === undefined) {
      throw new Error(`ENTITIES.md: spec/pins.json carries no registered schemaRef for \`${name}\``);
    }
    L.push(`| \`${name}\` | ${link(file.kind, file.id)} | ${link(registry.kind, registry.id)} | \`${pin.schemaRef}\` | \`${pin.sha256}\` |`);
  }
  L.push('');
  L.push(`${names.length} schemas. A release's shipped \`spec/schemas/<name>.schema.json\` must digest to the \`sha256\` above;`);
  L.push('`npm run check:schemas` is what asserts it.');
  L.push('');
  return L;
}

function residue(record) {
  const L = [];
  L.push('## RESIDUE — NOT OPERATING');
  L.push('');
  L.push('**Everything below is on `hedera:testnet` and none of it is the deployment.** It is here because a mirror node');
  L.push('cannot tell them apart and a reader should not have to. Three `$POSTAGE`-shaped tokens exist on this network and');
  L.push('exactly one is the stamp token; the other two were minted to prove a mechanism and are worth nothing.');
  L.push('');
  L.push('Most of it cannot be removed, and the reasons are the same two: a token with **no admin key** cannot be deleted —');
  L.push('which is the posture under test, and the one the real token has — and a token’s treasury cannot be removed while');
  L.push('the token exists. An HCS-1 file topic has no admin key either (D-150), so a superseded one is permanent.');
  L.push('');
  L.push('| Kind | What | Id | Why it is here, and why it is not ours |');
  L.push('|---|---|---|---|');
  for (const r of record.residue ?? []) {
    const kind = r.kind ?? 'topic';
    const what = r.role ?? r.key ?? '—';
    const flag = r.deleted === true ? ' **(deleted)**' : '';
    L.push(`| ${kind} | ${what}${flag} | ${link(kind, r.id)} | ${(r.why ?? '').replace(/\|/g, '\\|')} |`);
  }
  L.push('');
  L.push('Nothing here is in `spec/pins.json`, nothing here is in `entities`, and nothing here is charged for, read from, or');
  L.push('written to by any code in this repository.');
  L.push('');
  return L;
}

/**
 * Where the demo agents' public entities are committed.
 *
 * NOT `hedera-testnet.json`, which is the Postmaster's ops record and takes no
 * Correspondent entity id (CLAUDE.md §11). A separate file, so the rule holds
 * and the generator still reads only committed sources.
 */
const DEMO_SNAPSHOT = path.join(ROOT, 'app', 'deployment', 'demo-agents.hedera-testnet.json');

/**
 * Copy what each home has on consensus into a committed snapshot.
 *
 * A home lives outside the repository and its path is this machine's, so
 * generating DEMO AGENTS straight from it would make ENTITIES.md reproducible
 * on exactly one computer and `check:entities` a check about a username. The
 * snapshot is the committed source; the homes are where it is taken from, once,
 * by whoever ran Gate One.
 *
 * **Only `record.json` is read** — what the agent has on consensus, every field
 * of which is public and none of which is a key — and the config and keystore
 * beside it are never opened (P-13).
 */
function snapshotHomes(homesParent) {
  const agents = [];
  for (const slug of fs.readdirSync(homesParent, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()) {
    const rp = path.join(homesParent, slug, 'record.json');
    if (!fs.existsSync(rp)) continue;
    const rec = JSON.parse(fs.readFileSync(rp, 'utf8'));
    const entities = [];
    // Which OPERATOR's wallet stands behind this agent, taken from consensus
    // rather than from the home's config, which is never opened (P-13). Every
    // topic a mailbox owns names the operator as its auto-renew account — the
    // Postmaster sells a mailbox once and does not undertake to renew it — so
    // the readback of any one of them says whose wallet it is. An operator may
    // own many agents (D-165): the wallet is the operator's and the home is the
    // agent's, and this column is where two agents show as one operator's.
    let operatorWallet = null;
    for (const [key, e] of Object.entries(rec.entities ?? {})) {
      if (operatorWallet === null && typeof e?.policy?.autoRenewAccount === 'string') {
        operatorWallet = e.policy.autoRenewAccount;
      }
      if (!e || e.id === null || e.id === undefined) continue;
      entities.push({
        key,
        kind: e.kind,
        role: e.role,
        id: e.id,
        payer: e.payer ?? null,
        transactionId: e.transactionId ?? '',
        consensusTimestamp: e.consensusTimestamp ?? '',
        // The purchase row alone carries a STATE, and it is the difference
        // between an agent that has a mailbox and one whose purchase stopped
        // (Gate One, 2026-09-09). Both are on consensus and both are true; only
        // this says which. Nothing here is a key: a reference is a transaction
        // id and a state is one of three words.
        ...(key === 'purchase' && e.policy
          ? { state: e.policy.state ?? null, reference: e.policy.reference ?? null }
          : {}),
      });
    }
    if (entities.length > 0) agents.push({ slug, ledgerTag: rec.ledgerTag ?? LEDGER, operatorWallet, entities });
  }
  // An EMPTY snapshot is never written. Pointed at the wrong parent, or run
  // before Gate One, this would otherwise replace a real snapshot with nothing
  // and the replacement would look like a successful run.
  if (agents.length === 0) {
    throw new Error(
      `no home under ${homesParent} carries a record.json with entities on consensus. ` +
        'Gate One has not run there, or --homes names the wrong parent. Nothing was written.',
    );
  }

  const snapshot = {
    _readme:
      'The demo Correspondents’ own entities on consensus, snapshotted from each home’s record.json by ' +
      '`npm run entities:md -- --homes <parent>`. It is here and NOT in hedera-testnet.json because that file is the ' +
      'Postmaster’s ops record and takes no Correspondent entity id (CLAUDE.md §11). Every field is public: an id, a ' +
      'role, and the account that paid. No key, no config, no keystore — those stay in the home, outside the ' +
      'repository, and are never read by the generator (P-13). ENTITIES.md is generated from this file and is never ' +
      'hand-edited; `npm run check:entities` is what holds that.',
    ledgerTag: LEDGER,
    takenAt: new Date().toISOString(),
    agents,
  };
  fs.writeFileSync(DEMO_SNAPSHOT, JSON.stringify(snapshot, null, 2) + '\n');
  return agents.length;
}

/** The demo Correspondents, from the committed snapshot. Public facts only. */
function demoAgents() {
  const L = [];
  L.push('## DEMO AGENTS');
  L.push('');
  const snapshot = fs.existsSync(DEMO_SNAPSHOT)
    ? JSON.parse(fs.readFileSync(DEMO_SNAPSHOT, 'utf8'))
    : { agents: [] };
  if ((snapshot.agents ?? []).length === 0) {
    L.push('**Empty until Gate One.** No demo Correspondent exists yet: an agent’s account is *bought* rather than');
    L.push('funded (§4.6, HIP-542), so nothing here exists until the counter’s first two sales. Their **Operators’** wallets');
    L.push('do — `app/OPERATIONS.md`, "Demo-operator funding" — and that was funding and not a sale, which is why those two');
    L.push('accounts are not entities of this deployment and are not listed above.');
    L.push('');
    L.push('Filled by `npm run entities:md -- --homes <parent>` once a home carries a record. **A home is read for its');
    L.push('`record.json` only** — what that agent has on consensus, which is public — and never for its config or its');
    L.push('keystore, which stay outside the repository (P-13).');
    L.push('');
    return L;
  }
  L.push('From `app/deployment/demo-agents.hedera-testnet.json`, snapshotted from each home’s own `record.json`. Every id');
  L.push('below is public and nothing here is a key: a home’s config and keystore are never read (P-13).');
  L.push('');
  L.push('| Agent | Status | Account | Operator wallet | Purchase reference |');
  L.push('|---|---|---|---|---|');
  for (const a of snapshot.agents) {
    const purchase = a.entities.find((e) => e.key === 'purchase');
    const provisioned = a.entities.some((e) => e.key === 'doorbell');
    const status = provisioned ? '**provisioned**' : '**stopped**';
    L.push(
      `| ${a.slug} | ${status} | ${purchase ? `\`${purchase.id}\`` : '—'} | ` +
        `${a.operatorWallet ? `\`${a.operatorWallet}\`` : '—'} | ` +
        `${purchase?.reference ? `\`${purchase.reference}\`` : '—'} |`,
    );
  }
  L.push('');
  L.push('**An operator may own many agents** (D-165): the wallet is the operator’s, the home is the agent’s, and a fresh');
  L.push('home is a new agent. The operator wallet above is read from **consensus** and never from a home’s config, which is');
  L.push('never opened (P-13) — every topic a mailbox owns names its operator as the auto-renew account, because the');
  L.push('Postmaster sells a mailbox once and does not undertake to renew it. An agent whose purchase stopped owns no topic,');
  L.push('so no row on consensus names its operator and the column is `—`; its wallet is known only to its own home.');
  L.push('');
  if (snapshot.agents.some((a) => !a.entities.some((e) => e.key === 'doorbell'))) {
    L.push('**`stopped` means the account was bought and paid for and the mailbox was never finished.** The transfer is on');
    L.push('consensus, the account holds its stamps and its registration fee, and nothing was charged twice — a transaction');
    L.push('id is single-use. What is missing is the six topics and the receipt. Gate One (2026-09-09) stopped one purchase');
    L.push('this way: a defect deleted the counter’s record of the sale — the quote it charged and the rate it charged at —');
    L.push('before the receipt was built, and §5.4 builds a receipt from those, so no receipt exists and none was');
    L.push('reconstructed, because reconstructing it would manufacture the evidence a receipt is. The defect is fixed. The');
    L.push('reference above was restored to that agent’s home from consensus alone. `app/OPERATIONS.md` Step 5 has the run');
    L.push('of record.');
    L.push('');
  }
  L.push('| Agent | What | Id | Payer of record |');
  L.push('|---|---|---|---|');
  for (const a of snapshot.agents) {
    for (const e of a.entities) {
      L.push(`| ${a.slug} | ${e.role ?? e.key} | ${link(e.kind, e.id)} | \`${e.payer ?? '—'}\` |`);
    }
  }
  L.push('');
  L.push('**The payer column is the point of it.** Every row of a mailbox names the Postmaster as payer — it provisioned');
  L.push('what it sold (D-168) — and the registration on the HOL anchor names **the agent’s own account**, which is the one');
  L.push('fact §9.5 reads to decide `blurred` and the reason the purchase funds exactly one fee (T-P13-4).');
  L.push('');
  return L;
}

export function render() {
  const { record, pins } = sources();
  const L = [];
  L.push('# WISHMail on `hedera:testnet` — every entity, and which of them operate');
  L.push('');
  L.push('<!-- GENERATED FILE. Do not edit.');
  L.push('     Written by `npm run entities:md` from `app/deployment/hedera-testnet.json` and `spec/pins.json`.');
  L.push('     `npm run check:entities` asserts that this file is what those sources produce; a hand-edit fails it. -->');
  L.push('');
  L.push(`**Ledger** \`${LEDGER}\` · **specification** ${pins.spec} · **minor version** ${pins.minorVersion} · testnet only at this version (§15.5).`);
  L.push('');
  L.push('This file is generated and is never hand-edited. Two records already say what is on the ledger — the ops record,');
  L.push('written one entity at a time from mirror-node reads, and `spec/pins.json`, which is §1.6 in machine-readable form —');
  L.push('and a third written by hand would be a third place for an id to be wrong, and the place a reader trusts, because it');
  L.push('is the readable one.');
  L.push('');
  L.push(...operating(record, pins));
  L.push('---');
  L.push('');
  L.push(...residue(record));
  L.push('---');
  L.push('');
  L.push(...demoAgents());
  return L.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
}

/* ------------------------------------------------------------------ */

function main() {
  const argv = process.argv.slice(2);
  const check = argv.includes('--check');
  const at = argv.indexOf('--homes');

  // Snapshot BEFORE rendering, so the render reads one kind of thing: a
  // committed file. --homes is how the snapshot gets taken and never how the
  // document gets built.
  if (at >= 0 && argv[at + 1] !== undefined) {
    if (check) throw new Error('--homes takes a snapshot and --check asserts one; they are not run together');
    const n = snapshotHomes(path.resolve(argv[at + 1]));
    console.log(`demo-agents.hedera-testnet.json written — ${n} agent(s) with entities on consensus`);
  }
  const rendered = render();

  if (!check) {
    fs.writeFileSync(OUT, rendered);
    const ids = (rendered.match(/hashscan\.io/g) ?? []).length;
    console.log(`ENTITIES.md written — ${rendered.split('\n').length} lines, ${ids} HashScan links`);
    return;
  }

  if (!fs.existsSync(OUT)) {
    console.error('check:entities FAILED — ENTITIES.md does not exist. Run `npm run entities:md`.');
    process.exit(1);
  }
  const committed = fs.readFileSync(OUT, 'utf8');
  if (committed === rendered) {
    console.log('check:entities PASS — ENTITIES.md is exactly what app/deployment/hedera-testnet.json and spec/pins.json produce.');
    return;
  }
  // Say WHERE, not just that. A generated file that differs is either a stale
  // generation or a hand-edit, and the first differing line tells you which.
  const a = committed.split('\n');
  const b = rendered.split('\n');
  const at2 = a.findIndex((l, i) => l !== b[i]);
  console.error('check:entities FAILED — ENTITIES.md is not what its sources produce.');
  console.error(`  first difference at line ${at2 + 1}`);
  console.error(`  committed: ${JSON.stringify(a[at2] ?? '(end of file)')}`);
  console.error(`  generated: ${JSON.stringify(b[at2] ?? '(end of file)')}`);
  console.error('  Either the sources changed and `npm run entities:md` has not been run, or the file was hand-edited.');
  process.exit(1);
}

try {
  main();
} catch (e) {
  // A generator that dies with a stack trace tells a reader about this file;
  // one that dies with a sentence tells them about their ledger.
  console.error(`\nSTOPPED — ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
}
