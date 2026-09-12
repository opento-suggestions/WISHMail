# CLAUDE.md — WISHMail

You are building WISHMail: certified mail for agents on Hedera, and a bridge between registries — HOL ↔ NANDA first, other ledgers by extension. You are working with Sonic (Nick Altemeyer). This file is what binds you in this repository. Read it before anything else, every session.

## 0. How to resume

**Read these four first, in this order. They are the record; this file is only the rules.**

1. `docs/GATE-RECORD.md` — **the whole shape in one file**: three gates, what each proved, what it cost, what it
   created, and what went wrong, with a HashScan link on every id. It is a **reading and not a record**, so where it
   and the two below disagree, they win. Read it first anyway: it is the only place the three gates are legible end
   to end, and it takes five minutes instead of two thousand lines.
2. `STATUS.md` §0 for where it stands tonight, then §6's registers in order — **GATE ONE**, **GATE TWO CHECKPOINT
   ONE**, **CHECKPOINT TWO**, **THE REPLY**, **A2**, **GATE THREE** — then the ruled list that closes it.
   **Stop there**: everything below is dated build history from earlier days and a resume does not need it.
3. `app/OPERATIONS.md` — the gate reports and the runs of record, one pair per signed act, newest of them Gate
   Three's three sections at "Step 7". **A gate report is never amended after its run**; a correction to one goes in
   the run of record beneath it, dated.
4. `ENTITIES.md` — every entity on `hedera:testnet` with a HashScan link, including all three Correspondents.
   Generated; `npm run check:entities` fails on a hand-edit.

5. `conformance/DERIVATION.md` — **the suite's own record**, and read it before touching a test. §A is the table
   written before any body was: all 87 rows against the fixture that reaches each, what it expects, and why the
   expectation follows from the specification rather than from the code. §E is the night the resolution chain was
   captured; §F is where it landed. A body not in that table is not written.

Beside them: `LIMITATIONS.md` is what this deployment does not defend, and `plans/` holds the spent plans of
earlier days — history, not instructions. **Decisions run to D-177** in ledger §B, one ADR each in `spec/adr/`.

**Where the build stands, 2026-09-11.** The specification is **0.5.13**, tagged `v0.5.13`; **FIVE GATES
ARE RUN AND GREEN** — Gate One, Gate Two, Gate Three, Gate Zero the second, and **Gate Four**, the newest — and
nothing waits on a signature. **Twenty-four `check:*` are green** with `typecheck` and
`p13:check`. The whole
battery is the loop to run after any change: `npm run typecheck`, then every `check:*` in `package.json`, then
`npm run p13:check`, then `npm run conformance`.

**THE SUITE IS EXPANDED AND THE FINDINGS ARE THE POINT.** 53 of the 87 registered rows have bodies; 44 pass. They
were written from §A's sketches and never from the code — "the code is the defendant, not the judge" — and on their
first run they found eleven defects in the reference implementation, every one of which is now fixed and proved by
the body that found it. **A failing body is a finding brought, not a chore**: 9 expanded rows fail on a clause they
name, and `conformance/DERIVATION.md` §F lists what each waits on. Do not make one pass by narrowing it.

**Ledger §G runs to 31, and five of them are open.** Items 12–19 and 21–26 are **closed** — 26 by D-177 in the
0.5.13 patch. What stands open: **§G-20** (the provisioned path cannot be rate-priced while `PriceList` is frozen)
and **§G-29** (§5.10's bundle entry has no slot for a duplicate chunk or for an envelope with no chunk 0), both
**0.6 candidates under §1.7** that wait on a minor version rather than on a decision; **§G-27** (T-P7-2 cannot
isolate itself, because §4.3's memo already binds a settlement to one envelope) and **§G-28** (T-P1-10's `inbox`
clause asks a recipient to replay its own resolution), both sketch questions for Sonic; **§G-31**, the F-3 orphan,
which is **build work and not a spec question** — D-160 gave §11.2 the treasury route on 2026-09-09 and this
implementation has not taken it; and **§G-8**, the P-16 seam, **narrowed 2026-09-11 and not closed** — L-11 no longer
claims the keyless leg is satisfied through the x402.org facilitator, and the specification's own question (how a
Postmaster deployed only on Hedera offers any method needing no pre-funded Hedera account) stays open with §19.3 its
still-unwritten home. **§G-30 is not a defect**: T-P3-1 compares two implementations and this deployment has one, which
is the honest reason the claim is empty.

**The 0.5.13 patch is the first where the implementation was right and the register was wrong** (D-177). §A's
sketch for T-P6-1 said a resolution proof whose inputs are altered leaves the envelope *unbound*; §11.5's table says
*unverified*, and so does §11.5's own reading paragraph. The table wins, the sketch is amended, and no code changed.
It is also the first patch that changes **no normative text** — the only line that moved in `spec/` is the ledger's,
so there is no `CHANGED` marker to place — and it rides a version anyway because §5.10's claim names the suite
version and §A's sketch is the scope of the test that suite runs. D-177 records that reasoning; §1.7 does not speak
to it.

**The 0.5.12 patch has landed, and the probe decided its version.** The frozen `evidence-bundle` schema types `spec`
as a bare `{"type": "string"}` — `spec/schemas/evidence-bundle.schema.json:9-11`, verified against `spec/pins.json`
by the blob digest before it was trusted — so `"0.5"` is admissible, **no schema moves**, and it is a patch. The
bundle now carries the minor version and the Verifier’s own patch rides in `observations.verifierSpec`, outside the
digest. **A digest printed in a run of record before today reproduces only from that run’s own tag** — `8d30dfdc…`
and `00229e6f…` from `v0.5.10`, `1c4359e5…` from `v0.5.11` — and each run of record now says so beside its own
number, as does LIMITATIONS L-1. The records are not rewritten.

**The harness line, and what it means.**

```
$ npm run conformance
  register 87 · files 87 present · passed 44 · failed 43 · report conformance/reports/all.json
```

Eighty-seven registered — T-P1-12 joined them at 0.5.12 (D-176). **53 expanded, 44 passing**; of the 43 failures, 34
are rows with no body that throw `NOT EXPANDED` saying what they are for, and 9 are bodies failing on a clause they
name. A report is emitted because no pin in `spec/pins.json` is null.

**NO CLASS PASSES IN FULL, SO NOTHING IS CLAIMED, AND THAT IS CORRECT OUTPUT AND NOT A SHORTFALL.**
`RELEASE.classes` and `RELEASE.profiles` are empty (§1.5: silence claims nothing), and **T-P3-1 alone would keep
every class from passing** — it compares a fresh Verifier at another patch, time and mirror node against this one,
and this deployment has one implementation. That is not a defect to be closed by us; it is what publishing a
specification is for. The gate T-P9-2 holds is whether a release may make a claim at all — never whether tests pass.

**Setting `RELEASE.classes` is the one thing in `app/` that needs Sonic's word**, and it is set from the report and
from nothing else (T-P15-3).

**The gate discipline, and it is not negotiable.** Nothing signs on `hedera:testnet` until its gate report is
written and committed in `app/OPERATIONS.md` — what it creates, what it asserts from the mirror, what it writes
and where, how it is idempotent, and every way it stops — **and Sonic has said the word**. After the run a **run
of record** goes beneath that report with every transaction id and every mirror readback, and **the gate report
is left exactly as it stood**: one amended after the fact is not a gate report. Probes get the same in miniature
and are wholly disposable. **If a stop fires, report what is true at the stop and what is resumable, and wait** —
never repair past it, never infer.

**The Correspondents, and what to call them.** (There are three from Gate Three: A2, B, and **C** — home `c`,
`displayName` `DemoAgentC`, operator **C2OPERATOR `0.0.10450880`**, which is B's operator too, so each of the two
demo operators owns two agents. C is `0.0.10468684`, doorbell `0.0.10468687`, log `0.0.10468689`, manifest
`0.0.10468692`. B and C correspond on lane `0.0.10468898`.) **A2** — account `0.0.10462700`, home `a2`, `displayName`
`DemoAgentA2` — is the demo's first Correspondent, and it supersedes both **A** (bought 2026-09-09, stopped after
its transfer, kept exactly as it is) and the plans' name **"A′"**: where a plan or an earlier record says `A′`, it
means A2. **B** — account `0.0.10452127`, home `b` — is the other. They correspond on lane `0.0.10464056`, which
A2 opened and B answered, and which now carries letters both ways.

**The homes are outside the repository and gitignored**, because a home IS the agent (D-165) and carries the
operator's payer key and the agent's own keys (P-13). Every driver takes one as its first positional argument, so
nothing runs without knowing where they are. `app/OPERATIONS.md` writes them as `<a2 home>` and `<b home>` in every
recorded invocation and the real paths appear nowhere in the repository — which is the convention, not an oversight.
The Postmaster's own state is separate, at `.wishmail-state/` inside the repository.

**GATE THREE IS RUN, 2026-09-10, in one pass with no stop.** The whole of §6.4 in ONE `send()` call — first contact
and `returnReceipt` together. **C** (`0.0.10468684`, home `c`, `DemoAgentC`, under C2OPERATOR `0.0.10450880`) was
provisioned through the counter and resolves under both profiles with no `blurred`; B rang, C answered, lane
`0.0.10468898` carries envelope `2229a6c9…`; C opened it, signed for it, and the receipt executed onto C's manifest
topic. A stranger read it back twice at one digest, `34b314c4…`, **under specification `0.5`** — D-173 on a run of
record for the first time. All three outbound records fired live and matched their predictions. Gate report and both
runs of record are `app/OPERATIONS.md` **Step 7**.

**THE PARENT FOLDER WAS RENAMED on 2026-09-11 evening** — `ETHGlobal Hackathon` → `ETHGlobal_Hackathon` — because
Goose Desktop takes an extension command as one string and splits it, so a path with a space cannot be given to it
unquoted. **Nothing on consensus is affected and no home, key or id depends on the path**; all eighteen files under
`~/.wishmail/demo/` were searched and none names the repository. A junction was tried and **abandoned**: Node
resolves a link for `import.meta.url` but leaves `argv[1]` as given, so `app/sdk/server.ts:681`'s entrypoint guard
never matches and the process starts, does nothing and exits 0 with no banner. **That is a real trap for anyone who
symlinks this repo** — the one-line fix is to compare real paths, it is deliberately NOT made before the gate, and
it is build work for after submission.

**THE NEXT LIVE ACT IS THE RECORDED TAKE, and everything it needs already exists.** It runs on
**`gz5-x` (DemoAgentX5, SENDER)** and **`gz5-y` (DemoAgentY5, RECIPIENT)**, whose operators
`0.0.10492954` and `0.0.10492957` are brand-new, hold 250 ℏ each and read **zero association
slots** — so the associate fires again, as it did at Gate Four. **`gz6-x`/`gz6-y` are the
spare**, on `0.0.10492960` and `0.0.10492962`, so a spoiled take costs a rename and not a
second GATE FUND. All four were born under GATE FUND: configs written, **keys born**, zero accounts confirmed
and **never provisioned**.

**`gz5` IS WIRED AND WAITING.** `config.yaml` holds exactly two WISHMail entries —
`demoagentx5` and `demoagenty5`, pointed at `gz5-x` and `gz5-y`, both
**`--dry-run`**, allowlist `[buy_stamp, resolve, send, inbox, ack]`. Both command lines are
pre-flighted in a terminal and name their own operators. **No `--live` appears anywhere in the file, and
no spent home is named in it.** `gz6` has no entry: it is wired only if the take is spoiled, by the same
remove-and-rename.

**So tomorrow is: restart Goose Desktop → B0 in each window (DRY, `holder` a public key, `buyer`
reading `0.0.10492957` / `0.0.10492954`) → on the word, flip both to `--live`, start
the counter, confirm the banners in a terminal → B1 through B6.** Nothing else is outstanding.

**IT RUNS ON GATE FOUR’S HEAD, `dc418dea29e9ac26f1bb423621f777eb59d0ef1c` — RECORD (Sonic).** Anything
that must exist for the take had to land before Gate Four, and **nothing may land between the gate and the
take**. The one exception already taken is the record of the gate itself.

**The letter is `Certified agent mail proven on Hedera.`** — 38 bytes,
`Q2VydGlmaWVkIGFnZW50IG1haWwgcHJvdmVuIG9uIEhlZGVyYS4=`. **The comma is dropped deliberately** (RECORD,
Sonic): punctuation is a plausible seam for the model’s re-encoding failure, so it is **cut rather than
risked**. That is a smaller target and **not a safe one** — the mechanism is re-encoding, not length.

**TWO NETS, and they are the whole mitigation.** **B3½** is the read-back *before* the spend — the model
repeats the payload string, calls no tool, and the operator compares 52 characters by eye before a stamp moves;
it is the only place the payload can be checked, because a letter cannot be withdrawn. **B5** is the
rendered-against-printed check *after* — the card must render the sentence in full beside the plaintext printed
in B4, and a missing character means stop, do not `ack`. B3½ prevents; B5 catches.

**Fixture registration is the FIRST ACT AFTER THE TAKE, never before it** (RECORD, Sonic).
`gate-zero-two-certified` and `gate-four-certified` are captured and deliberately absent from
`conformance/support/fixtures.ts`, so the battery goes into the take exactly as it stands: **87 registered,
44 passed, 43 failed**, report digest `51453eea…`. Both are registered together afterward and whatever
the ~ten fixture-iterating bodies then say is reported as findings, never narrowed away.
**GATE FOUR IS RUN AND GREEN** (2026-09-11), and it closes the question four gates could not ask. Two
**brand-new operator wallets** — `0.0.10492952` and `0.0.10492953`, created under GATE FUND
with **zero automatic association slots** — carried two agents through the whole lifecycle under goose. **The
thing it exists to see happened on both:** `ensurePayerHoldsStamps`' `TokenAssociateTransaction`
branch (`app/sdk/mailbox.ts`) **executed against the network for the first time in five gates**, at
0.67094579 ℏ each, paid and signed by each operator on its own client, **after that agent’s purchase and before
that agent’s first topic** — when no doorbell in the gate had a single message on it. It fired on the
recipient’s operator too, which never rings and ends **associated with a balance of zero**: one association
bought for nothing, predicted in the report and measured in the run.

**DemoAgentY4** is `0.0.10493463` (home `gz4-y`) and **DemoAgentX4** is `0.0.10493552`
(home `gz4-x`); they correspond on lane `0.0.10493664`. GREEN from the mirror: schedule
`0.0.10493669` executed at `1789191546.406458105`, the receipt manifest at **sequence 1 of her own**
topic `0.0.10493477` at that instant to the nanosecond, chained to chunk 0 at `1789191200.199570248`.
A stranger read it back twice at `d452d9b7…`. **All five stamp predictions matched exactly**, and
**zero transactions name the recipient** (T-P16-2, measured). The Postmaster netted **+27.06223486 ℏ** over the
gate, funding excluded.

**One divergence, and it is not this implementation’s:** the letter reads *"Certified agent mail,proven on
Hedera."* — 38 bytes, a space short. **The model re-encodes the payload rather than copying it**, which the
second Gate Zero’s 69-byte letter was the first instance of; that one looked like truncation and this one
proves it is not, being the same length as the literal and carrying padding the literal lacks. **Found in one
glance because of the UTF-8 rendering that landed hours earlier.** The fix is `docs/OPERATOR-SCRIPT.md`
**B3½**, a read-back before the irreversible step. Run of record: `app/OPERATIONS.md`, **GATE FOUR —
THE RUN OF RECORD**.

**GATE FUND** created **six** wallets at 250 ℏ each with zero slots — `gz4-*` for this gate,
`gz5-*` for the recorded take, `gz6-*` spare. Its funding table is kept clean of every
economics line.
**THE SECOND GATE ZERO IS RUN AND GREEN** (2026-09-12), and it is **the first gate driven by goose**. Six
instructions, one per turn, one pass, no stop: both agents provisioned on fresh homes, a lane born
(`0.0.10489454`), one certified letter with a return receipt, opened and signed for, and the receipt executed
onto the recipient's own manifest topic. GREEN from the mirror: schedule `0.0.10489457` executed at
`1789176191.217453809`, receipt at `0.0.10489371` #1 at that instant, chained to chunk 0 at
`1789176126.262539578`; a stranger read it back twice at digest `fca22d10…`, state ACKED. **All five stamp
predictions matched exactly** and **§4.4's hop fired for the first time**. **DemoAgentY2** is `0.0.10489361`
(home `gz2-y`) and **DemoAgentX2** is `0.0.10489394` (home `gz2-x`). Run of record: `app/OPERATIONS.md`,
**GATE ZERO, THE SECOND — THE RUN OF RECORD**, with one divergence recorded (§3's carry estimate undercounted
revenue; the Postmaster netted **+26.97999223 ℏ**). **Not proved and named**: no `hol` resolution, no `verified`
appraisal (this release claims no profile, so T-P12-4's `unverified` is correct output), and no brand-new
wallet — `mailbox.ts:287-294`'s TokenAssociate branch still has never run live, which is Gate Four.

**The superseded preparation note:** Report: `app/OPERATIONS.md`,
**GATE ZERO, THE SECOND**, committed before anything can sign. Fresh homes **`gz2-x`** (DemoAgentX2, SENDER,
C2OPERATOR `0.0.10450880`, zero `$POSTAGE` so the hop fires) and **`gz2-y`** (DemoAgentY2, RECIPIENT,
C1OPERATOR `0.0.10450879`); keys born on first boot, both unprovisioned, zero accounts under either key, both
operators `autoAssoc -1`. Goose entries point at them and are **`--dry-run`**; AUTHORIZED means `--live`.
**Part A passed and cleared the blocker**: the model stringifies object arguments, so the surface now parses an
object argument that arrives as a JSON string (never `payload`) and names a string that will not parse instead of
calling it missing — courted at 149 assertions, proved under goose, no schema moved.

**THE FIRST GATE ZERO RAN AND DID NOT REACH THE GOLDEN PATH** (2026-09-11 night). Driven by
goose with no script, the model called `generate_mailbox` on a home with no account; four topics per agent were
submitted before the declaration validator refused, so **eight permanent topics are on `hedera:testnet`**, two of
them doorbells whose memo names no owner — and **the doorbells are numbered before the accounts**, which is the tell.
No `send`, no `ack`, no lane: 121.87558034 ℏ of the operators' own money and no letter. The run of record, the
mechanism at file:line, the two fixes and five findings recorded-and-not-fixed are `app/OPERATIONS.md`, **GATE ZERO
— THE DIVERGENCE, AND THE RUN OF RECORD**; the entities are residue, each with a why. **`gz-x` and `gz-y` are
DRY/debug homes now and never go live again** (RECORD). **The next live act is a second Gate Zero on the demo
operators with fresh homes**; Gate Four, on brand-new wallets, follows it. The operator script that drives either is
`docs/OPERATOR-SCRIPT.md` — one instruction per turn — because **the model does not work the flow out**. What
follows is the gate report as it was written, and it is not amended: Its report is `app/OPERATIONS.md`, committed before
anything can sign, fill-in unfilled. It is the first time **goose** drives the Correspondent MCP server on
consensus — two throwaway agents on the operator wallets we already own, provision → buy → send → ack → verify — and
it is deliberately separate from Gate Four so that Gate Four can ask its own question: whether a brand-new HBAR-only
wallet survives the lifecycle. **It is a gate and not a probe** (real `$POSTAGE`, real counter, real anchor,
permanent entities); its entities are recorded as **residue**.

**What a cold session needs to resume it, in one paragraph.** The two homes are **outside the repo** at
`~/.wishmail/demo/gz-x` (**SENDER**, C2OPERATOR `0.0.10450880`) and `~/.wishmail/demo/gz-y` (**RECIPIENT**,
C1OPERATOR `0.0.10450879`); keys **born**, both **unprovisioned**. **The roles are reversed from the gate report on
purpose** (RECORD): the sender's operator holds zero `$POSTAGE`, so §4.4's hop fires under goose for the first time.
**No flag means DRY** — `app/sdk/server.ts:566`, verified by an actual no-flag run. **The DRY pre-flight passed
under a reference MCP client and NOT under goose**, so goose's own client is untested; the **two Goose Desktop
entries are written and TESTED** in `app/OPERATIONS.md` Gate Zero §9 — the from-anywhere proof ran at the
post-rename path on 2026-09-11 from an unrelated working directory, in both launch shapes including the
single-string one Goose Desktop splits: banner, `argv as received` carrying the home and `--dry-run`, a clean
`initialize` on stdout and nothing else on that channel, exit 0 on stdin close, no lock and no surviving process. **The stop condition is in the goose
conversation, not stderr**: the first call in each DRY session is `buy_stamp` and its card must say DRY / would-do,
a connection error to `127.0.0.1:4600` means that session is LIVE and is the stop, `send` must refuse *no account
yet*, and `generate_mailbox` and `register_agent` are not called in pre-flight. **The counter stays down until the
fill-in.** **One extension per goose session.** **GREEN** is `executed_timestamp` on the schedule and the receipt
manifest at its topic + sequence on DemoAgentY's manifest topic, chained back to chunk 0's postmark — not `send`
returning, and not the card. **The fill-in is unfilled.**

**The goose seam had never been exercised, and that is where the defects were.** All three gates were driven by
CLIs. On 2026-09-11 the MCP surface was read end to end (`provenance/PROBES-2026-09-11.md`) and five things were
found and fixed: `send`'s published input schema and its handler disagreed, so a client building from the schema got
`SEND_UNRESOLVED` on its first letter; `send`'s result did not match its own `outputSchema`, which §6.4 settles —
"send then returns chunk 0's `Postmark`" — so `structuredContent` now carries exactly that and the richer result
travels in `_meta`; the watcher had no shutdown path and no uniqueness; `register_agent` declared a `dryRun` its
handler never read, so asking for a rehearsal signed; and all ten `send.*` narration sentences were dead.

**The MCP server has a real DRY mode and it is structural.** In DRY it reads no payer key and gives no client an
operator — proved against a home whose payer key is deliberately unparseable: `--dry-run` boots and serves,
`--live` prints LIVE and dies reading the key. The watcher does not start in DRY, because `answer()` signs.
`npm run correspondent` is the dry default; `correspondent:live` bakes `--live` into the workspace script. **A gate
fill-in is now physical**: `AUTHORIZED` means restarting with `--live` and the banner saying so.

**One live process per home** — `<home>/run.lock`. Two watchers on one doorbell can both answer one request and both
birth a lane, and a lane cannot be closed; consensus-idempotence is not process-uniqueness.

What else is open is ruling and building, in that order: the five §G items above,
and the build work the suite named and nobody has ruled on yet — chief among it **T-P10-2's gap**, where
`laneRefusal` checks a lane's deletion, close, fees and key list and does not walk its birth, so discovery offers a
lane that binding refuses and a sender can pay postage for letters that will every one appraise unbound.
**§G-31's orphan** is the other: `Reader` has no method that reaches an account's transfers, so `orphans` is always
empty. Three divergences from Gate Three stand recorded and unrepaired, all above the ledger: the provisioning
driver does not exit after talking to the counter, `inbox.cli.ts` renders no pending receipt request, and one run's
console output was lost to a `tail` pipe.

**Two more captures exist and they are not records of a gate.** `gate-three-resolved` and
`checkpoint-two-resolved` were taken on 2026-09-10 night — a mirror read, no key, no signature — with the
declaration registry and profile file of A2, B and C named by `--topic`, so §9.2's rule can be re-run from a
fixture. With them a Verifier claiming `hcs14` reaches **verified**, which nothing offline could try before. **The
four original captures and their digests are untouched.**

## 1. The documents, and their order

1. `spec/WISHMAIL_SPEC_v0_5.md` — **the only normative document.** Version 0.5.13 — frozen at 0.5.0 on 2026-09-07, patched to 0.5.1 the same day (D-135 – D-138), to 0.5.2 (D-145 – D-148), 0.5.3 (D-150, D-151) and 0.5.4 (D-152) on 2026-09-08, and on 2026-09-09 to 0.5.5 (D-157, D-159, D-160, D-161), 0.5.6 (D-159 amended, D-163), 0.5.7 (D-166), 0.5.8 (D-167), 0.5.9 (D-167’s §10.2 text) and 0.5.10 (D-169: decimal amounts compare by value), and on 2026-09-10 to 0.5.11 (D-171: a lane binds from either party’s doorbell; D-172: T-P1-8 as the ledger can show it) and 0.5.12 (D-173: the evidence bundle’s `spec` is the minor version; D-175: §5.3’s `resolvedAt` gloss; D-176: T-P1-12, the register’s eighty-seventh row), and on 2026-09-11 to 0.5.13 (D-177: §11.5’s table wins — a resolution that does not replay leaves the envelope unverified, not unbound; a ledger sketch amended and no normative text changed); wire strings carry `0.5`, because a patch changes none (§1.7). **The fourteen schemas are registered on consensus and frozen for the life of 0.5** (Step 4): after that, the smallest field is 0.6. Every implementation decision is measured against it. Where any other file disagrees with it, the spec wins.
2. `spec/CONFORMANCE_TESTS_v0_5.md` — the working ledger. Section A is the test register (87 tests: 82 core + 5 extension) you build the suite from — it was 86 until 0.5.12, when D-176 registered T-P1-12 for a requirement §11.4 had always stated and no test had ever named. Section B is the decision record D-42 – D-176 and the source of the ADRs. Section H is verified facts about the pinned standards with file:line. Sections D–G are open-item status and the build-phase list. Nothing in it is normative.
3. `provenance/recon/` — the recon reports and pins JSONs (`pins-recon`, `nanda-recon`, `hol-x402-recon`, `openconvai-recon`, `impl-study`, all 2026-09-06) — dated fetches of the standards. Read one only when H's row isn't enough.
4. `provenance/` — `WISHMAIL-SPEC-v0.3.md`, the handoff, the day-one research, and the scope map. **Provenance only.** They bind nothing. The ADR backfill D-1 – D-41 is done; read them only to check what an ADR carried.
5. `STATUS.md` — the build set as Sonic ranks it, and the demo shape. The one file where "what we build first" is an ordering.
6. The Excalidraw scope map — the ratified scope line: green/blue = BUILD, orange = STRETCH, dashed = SPEC or VENUE. Do not re-propose scoping down. Full product is the judging posture, and the registry layer is load-bearing.

Read the spec in order: §1 (scope, classes, pins, versioning), §2 (vocabulary — the names in code are these names), §5 (objects and wire format), §6 (the six tools), §7 (envelope and binding), §8 (state machine), §9 (resolution profiles), §10 (the proof chain), §11 (replay and appraisal), §12 (invariants — the key every test reads backward), §14 (payments), §15 (limitations). §3, §4, §13, §16–§19 give the why. Check a file's length before reading it and read it in full; never a default truncating view.

## 2. Start Fresh

The build originates in this window (ETHOnline 2026, Sept 4–13th submission deadline). Prior thinking may guide; prior code may not. Do not import, port, or paraphrase code from any earlier WISHMail, Witness Required, or Ontologic repository. Every line here is written here.

## 3. Non-negotiables

These are stated in the spec with tests; they are repeated here because they are the things most likely to be quietly violated by a reasonable-looking shortcut.

- **Strict HCS-10** at the pinned blobs (§1.6; `hiero-ledger/hiero-consensus-specifications @ 7046156c`). Envelopes ride inside HCS-10 `message` operations on HCS-10 topics. One HCS message per chunk; `CHUNK_WIRE_MAX` = 1000 bytes on the whole operation; no `chunkInfo`; no HCS-1 for content (§7.4). Every operation carries HCS-10's transaction memo and none where HCS-10 defines none (§6.1).
- **The resolution proof lives inside the AAD** (§7.2). The AAD's key names are `{p, v, l, lane, rp, nc}` — exactly those, canonical JSON per RFC 8785 — and its SHA-256 is the envelope identifier. `spec/vectors/aad.json` is the court (T-P1-4).
- **No broker, key, or credit is required for conformance** (P-4). The VERIFIER suite runs with nothing configured. A mirror node is a read interface, not a broker.
- **P-12 wins any conflict.** Appraised never exceeds declared. Non-replayable evidence downgrades, never upgrades. A Verifier reports; it never errors where a downgrade will do.
- **The chain from the header** (§7.4, §8.5, §11.3). Reassembly is a walk on bytes, not clocks: chunk 0 by its header rebuilding to `id`, each later chunk by the prior's `nx`.
- **Standing order** verified > unverified > unstamped > unbound; reasons are test identifiers, in the order of §11.5's table.
- **The token is `$POSTAGE`**; stamps are consumed to the treasury, doorbell fee included (§4.3, §4.4, §14.4). No token other than the stamp is postage. The price list lives on consensus (§14.3).
- **The Postmaster pays; the agent signs** (§3.5). The Postmaster holds no agent key, ever — not a decryption key, not a topic key, not an account key (P-13). Keys are born in the agent's process. No tool input, schema field, config file, or log carries private-key material.
- **We are not a registry broker.** WISHMail reads registries and adjudicates between none. The HOL broker is a directory, never an input (§9.5, §9.7). Nothing a directory says enters a resolution.
- **Testnet only** at this version (§15.5). `hedera:mainnet` is defined and undeployed. Two ledger tags exist; any other is refused (§5.1).
- **No Solidity. No smart contract. No broadcast. No push surface.**
- **FETCH before asserting anything about a Draft standard.** Four of the six pinned standards are Draft. Conformance is to the blob §1.6 names, not to the name. If the text you need isn't in H or a recon, fetch it at the pinned commit and record the fetch with its date.
- **Apache 2.0 Licensed**.

## 4. The repository

One monorepo, mirroring `agentrust-io`:

```
spec/            WISHMAIL_SPEC_v0_5.md and CONFORMANCE_TESTS_v0_5.md; spec/schemas/ one JSON
                 Schema per §5 object and the §9.1 declaration (fourteen files, named per
                 §18.5, suffix .schema.json); spec/vectors/ (aad.json, seal.json);
                 spec/pins.json; spec/adr/ TEMPLATE.md and D-nnn.md, D-1 onward
conformance/     one test per T-<P-ID>-<n>, keyed to §12; fixtures; the §8.5 exception corpus;
                 the report a conformance claim names
app/             the reference implementation: MCP server (the resource server of §14.2),
                 the WebMCP page as its client, SDK, CLI, resolvers — each declaring the
                 spec version and the classes and profiles it claims
CHANGELOG.md · LIMITATIONS.md (fourteen sections, L-1 – L-14, in order) · STATUS.md · LICENSE
CONTRIBUTING.md · DCO · .githooks/commit-msg (git config core.hooksPath .githooks)
```

**Outfit the repo before writing code.** DCO sign-off on every commit. Conventional Commits. `CHANGELOG.md` from the first commit. ASCII diagrams, never images, in spec and docs. Schemas follow the spec; a schema change without a spec change is not a change to WISHMail (§1.7).

**Spec leads, schema follows, tests are the court.** The order of work for any feature: the spec sentence exists → the schema tracks it → the test named in its `Conformance:` note exists and fails → the implementation makes it pass. Never the reverse.

**No MUST without a test.** If you find yourself needing a requirement the spec doesn't state, that is a spec change (§5 below), not a line of code.

**Every named test exists.** Section A of the ledger lists 87. Each becomes one test file, keyed by its ID, serving the invariant in its P-ID. Tests are not expanded in scope beyond their sketch without a decision. Extension tests (T-P2-3, T-P5-5, T-P6-6, T-P11-7, T-P12-7) bind only a release that claims the extension; build them last or not at all.

**Vocabulary.** Names in code follow §2.2 and the field names of §5. A lane is a lane, a doorbell is a doorbell, an envelope is an envelope; the tools are `resolve`, `buy_stamp`, `send`, `inbox`, `ack`, `verify`; failure codes are `TOOL_REASON` as §6 fixes them. Do not introduce synonyms.

## 5. Changing the spec

The spec is frozen. It can still be wrong. When implementation shows a sentence is wrong, incomplete, or untestable:

1. Stop. Do not code around it.
2. Write the finding as a decision candidate: what the text says, what reality says, what you propose, marked MINE.
3. Sonic rules. A ruling becomes `D-nnn` in ledger section B (next number after the last row there), dated.
4. The spec text changes, with `<!-- CHANGED: D-nnn -->` on the line before the amended paragraph, and a CHANGELOG entry.
5. If a MUST is added, its `Conformance:` note names a test, and that test is registered in ledger section A the same change.
6. A change to a wire string or a registered schema is a new minor version (0.6), never a patch.

The spec's register is indicative, present tense; it never narrates its own history ("v0.5 said", "measured at", "before the chain"). History lives in the ledger. Decisions are cited in the spec sparingly, as ADR pointers.

## 6. Register discipline — in the ledger, in commit messages, in what you say to Sonic

Mark claims: **RECORD** (Sonic said it), **FETCHED** (from the web or a recon; give the date and file:line), **MINE** (your inference or lean). Never present MINE as RECORD. A MINE becomes RECORD only when Sonic says so.

When you are wrong, say so in the same turn, before he catches it. Honest uncertainty over false confidence. If you don't know, say you don't know and go fetch.

## 7. The AI clause

Use agents — subagents, tools, generation — as much as helps. But every change must be explainable with the agent closed: the commit message says what changed and why in terms of the spec's sections and the test it serves, and a reviewer with no access to any AI can follow it. If you cannot explain a diff without the conversation that produced it, the diff is not ready.

## 8. Working with Sonic

He is a verbal processor: reason with him, present a lean, and assert a connection by asking about it. Spec-first: actors, I/O, invariants, failure modes before implementation. Match his depth (cryptographic protocols, DLT, Peirce/Tarski/Floridi). Prose over bullets in conversation unless he asks for a list; this file is a list because it's a file. Do not schedule, sequence, or prioritize his tasks, do not frame items as "flag for later," and never initiate wrap-up — he manages his own time and closes when he's ready. His Christ-centered faith is load-bearing infrastructure, not decoration.

The postal motifs — the Postman, the uniform, the umpire — are the working interface between Sonic and Claude and appear in the ledger's reasoning. They do not appear in the spec, in code, in comments, or in commit messages. The spec's own postal vocabulary (§2.2, §17) is the vocabulary.

## 9. Editing method

Copy a file out before editing it. Anchor every `str_replace` on a short exact string and check that it matched exactly once — scripts abort silently on a mismatch and write nothing. After any edit to the spec or the ledger, run the extract-and-diff: every `T-P*` identifier in the spec exists as a row in ledger section A and vice versa. Present both files whenever either changed.

**A schema validates a document against its shape, not against a rule that reads it.** So every writer is built in the same step as its reader — the sealer with the opener, the declaration with the resolver, `send` with `inbox` and `verify` — and the reader is run on the writer's output *before* that output is signed or published. A document can validate, hash correctly, and be internally consistent while being unreadable by the rule it exists for, and nothing but the rule will say so.

**Push per landing.** Every commit goes to `origin` as it lands, with every tag — `git push origin main --follow-tags`. Not at the end of a session and not in a batch: an unpushed commit is work only this machine has, and the point of the record is that someone else can read it. Report the commit and confirm `git status` clean and `git log origin/main..main` empty.

The case is in `app/OPERATIONS.md`, Step 3 section 8. The first `hcs14` declaration hashed the agent's identifier under `version "1.0.0"` while the HCS-11 profile carrying it said `"1.0"`; a profile has exactly one `version` field, and section 9.5 recomputes the identifier from the profile's own name, version and skills. The declaration validated against its schema, the file's digest matched its topic memo, and the identifier was consistent with itself. It was inconsistent only with the one `version` a reader can see, and an HCS-1 topic has no admin key, so it was permanent. Running the resolver against our own address returned `RESOLVE_NOT_FOUND` and cost one transaction to correct; had the resolver come a day later it would have cost a superseded declaration and a wrong answer to every reader in between.

## 10. Things that are not open

Do not reopen: broadcast; a broker dependency; Solidity; a Postmaster that attests; a score computed off consensus that touches a standing; a token other than `$POSTAGE`; HCS-1 for envelope content; a non-blocking `send` (D-30, held); WebMCP as a normative dependency (D-124: unpinned and unsurveyed by choice, decided by the release that ships the page). Each has a record in §18.2 and ledger B. What *is* open is §19, and only §19.

## 11. The MVP build, and the line between us and an operator

This section is the 2026-09-09 rulings (D-156 – D-170). It governs `app/` for this window. **What HAPPENED under them is STATUS §6 and `app/OPERATIONS.md`, not here** — this section is the rules and they are the record. Where it and the spec appear to differ, the spec is what binds and this is what we ship.

**Roles, and the vocabulary.** Three human roles: **OPERATOR** — us, running the Postmaster: treasury, the `$POSTAGE` supply key, the price topic, the Postmaster-agent, the counter. **C1OPERATOR** and **C2OPERATOR** — the Correspondents' operators, each bringing a funded testnet wallet. Beside them the agents: **Correspondent B**, provisioned; **A**, whose purchase stopped and which stays as it is; and **A2** (`0.0.10462700`, home `a2`, `displayName` `DemoAgentA2`, provisioned 2026-09-10 under C1OPERATOR's wallet `0.0.10450879` — the same wallet A's home names), which the plans call **A′** and which supersedes both A and that name. **An operator may own many agents** — the wallet is the operator's, the home is the agent's, and a fresh home is a new agent (D-165). *The agent signs; the operator pays.* Use these words consistently in ADRs, STATUS, README, LIMITATIONS, plans, and commit messages.

**"Operator" is a word of §3.3 and survives in prose only.** §3.3 fixes an *Operator* as "the human or organization behind an agent", and all three roles above are Operators in that sense — we are the Postmaster-agent's. What is **not** an Operator is an account, and the repository used to call the Postmaster's payer account one: `OPERATOR_ID`, `OPERATOR_DER_KEY`, `env.operatorId`, `ctx.operator`. Two roles under one word, in a codebase where a Correspondent's payer now appears in the same call, is how a key gets read from the wrong side. **Identifiers name the role**: `POSTMASTER_PAYER_ID` and `POSTMASTER_PAYER_DER_KEY` in the environment, `postmasterPayerId` / `postmasterPayer` in the Postmaster's code, `homePayerId` / `homePayer` in the Correspondent's, and `payer` in a Correspondent's config — which is what §3.5 has always called it. **HCS-10's `operator_id` keeps its name**: it is a pinned standard's field and it names the agent, not a person, which §2.2 already says in as many words.

**Config boundary.** Every private key, every payer wallet, and every operator-specific value the Correspondent MCP reads comes from that operator's own configuration file or environment — never from code. `OPERATOR`, `C1OPERATOR`, `C2OPERATOR` are **demo labels, not identifiers**: they must not appear in `app/` as a value, constant, default, enum member, or filename. A third party plugs in its own keys and its own payer from its own configuration. The repository ships a config **template** for a Correspondent; a filled config is gitignored, and `npm run p13:check` is what keeps it that way. `app/deployment/<network>.json` is the Postmaster's ops record only — no Correspondent entity ID goes in it.

**The payer seam, and its remote half is exercised against the network.** Every consensus submission an agent makes is constructed *agent signs, payer signs*, with the payer an injected signer. Nothing above the seam may know which. **Under a provisioning purchase the payer is REMOTE** (D-168): for each frozen body the agent has signed, the Correspondent sends the body bytes and the purchase reference to the counter and receives the Postmaster’s payer signature, and the transaction id names the Postmaster as payer. That is §6.1’s carry, and it is why the seam was built as a seam and not as a shortcut — the same `generateMailbox` runs over a local wallet and a carried one, unchanged. **Gate One ran all eight bodies of one mailbox through it on `hedera:testnet`, every one signed by the agent and paid for by the Postmaster** (STATUS §6). Everything **outside** a purchase is paid by that agent’s own operator, from that operator’s own configuration (§4.4, §6.1, D-157, L-5).

**Provisioning order** (D-159, amended the same day, and D-168), per agent: boot the keys in the agent’s own process → **`buy_stamp` with `provision`**, which is the whole of §4.6’s provisioned path — the three-legged transfer, then the mailbox with the counter as payer, then the receipt — → `register_agent`, the agent as its own payer and signer → `resolve` its own address under `hcs14` and `hol`. **The purchase is one atomic transaction with three legs**: ℏ from the buyer to the Postmaster for the price, `$POSTAGE` from the treasury to the agent's public-key alias, and the registration fee in ℏ from the Postmaster to that same alias. The account is *bought, not funded*, and is born holding stamps and exactly one fee. **The invariant is the POSTMASTER's, and it is about what the Postmaster funds: the Postmaster never funds an agent's account beyond the single registration fee** (RECORD, Sonic 2026-09-10, amending the earlier phrasing "an agent's account never holds ℏ, with one exception" and "the agent holds ℏ once … and never again"). What an agent's *own operator* puts into its own agent's account is that operator's affair and no concern of this specification — A2 holds 150 ℏ from C1OPERATOR's own wallet, which is intentional funding of a test deployment and not a sale, a gift from the Postmaster, or a departure from anything. What §4.4 and §9.5 turn on is unchanged: **who pays for the registration**, because §9.5 assigns `blurred` where that payer is not the address's own account. **That submission declares an explicit maximum below the balance** (0.02 ℏ against 0.05 ℏ): the precheck compares the balance to the fee it *estimates* and would accept more (probe 2026-09-09, ledger §H), but a declared maximum is what a reader of the transaction sees on consensus, and one far above the balance says something false about what that agent can afford. The price list prices the fee (`provisioning.registrationFee`) and the receipt records it, so a Verifier sees it as a leg of the purchase and not as a gift. `generate_mailbox` and `register_agent` live on the Correspondent MCP and are **not** among §6.1's six; they are §4.6 affordances and no class is tested against them. **`generate_mailbox` is the SELF-PROVISIONED path** — an agent that brings its own account and pays for its own mailbox — and the demo does not say it: `buy_stamp` with `provision` does the whole thing and returns the receipt (D-168). `register_agent` emits `{p, op, account_id, uaid, t_id, m}` — the pinned fields plus the two the deployed anchor's readers parse; the pin forbids no additional field (D-164, ledger §H).

**An agent that outlives the demo** (D-165). **The Correspondent home directory is the agent's identity**: config (the operator's payer, the network, runtime locations), keystore (the account key, and every epoch's X25519 key, retained — §7.6, L-1), and the durable store (sent envelopes for F-3 retry, pending receipt requests, the inbox cursor). A fresh home is a new agent; an existing home is a returning one. **Keys are born once**, on first run, into the keystore; every later boot loads them. A process that regenerated on boot would make every restart a new agent.

**Every provisioning verb is idempotent against consensus, not against local state.** `generate_mailbox` first resolves the agent's own address under `hcs14` and does nothing if coordinates exist; `register_agent` first resolves under `hol` and does nothing if a registration by this account exists; `buy_stamp` with `provision` refuses if the holder's account already exists, so a returning agent buys without it. A wiped local file never causes a second doorbell or a duplicate registration — and a duplicate registration is not merely waste: §9.5 assigns `vague` where more than one names an address. This is §9's write-the-reader-with-the-writer applied to provisioning: **the resolver is the reader**, and a local file is a cache of consensus, never an authority over it.

**Lanes are reused, never re-rung.** §7.1: the earliest-created open lane between two agents is *the* lane, for `send`, `inbox` and replay. The doorbell watcher decides by reading the doorbell for requests with no `connection_created`, so it too is idempotent from consensus. A second letter to the same recipient rings nothing, **and neither does a reply** (D-171): a lane's birth sits on the doorbell of whichever party answered, so both doorbells are read to find it — the recipient's for a first letter, the sender's own for a reply. **A Verifier finds it differently and deliberately**: it reads the lane's own memo down to the door that answered and that door's memo down to its owner, so it needs no resolution and gets the same answer in both directions. Discovery and binding are two rules because they answer two questions. Rotation stays out of the MVP, and nothing built here may make it harder — no local assumption that there is only ever one epoch.

**One template, three readers** (D-162). The lines `send` logs as consensus facts land, the text block `send` returns beside its structured `Postmark`, and `narrate()`'s sentences over a bundle come from one template file. Same sentence, three readers. **None of the three may imply receipt or delivery** — §2.3 reserves *delivery* for the lane, and §11.8 forbids turning silence into refusal. goose renders tool-call cards and final payloads and does *not* render `notifications/progress`, so the Correspondent's own log is the live surface and the result's text block is the retrospective one.

**The demo is recorded, not performed.** Provisioning happens before recording: the demo shows it as facts already on consensus — the receipt card scrolled up in goose, HashScan links — and spends its minutes on the letter loop and the stranger’s `verify`. Everything shown as a fact was signed.

**MVP scoping, and who is named for it.** This window covers pre-funded operator paths only. Deferred: the `x402-usdc` purchase leg; Postmaster-pays carry for an agent's own submissions, so **T-P4-2 is untested**; carry exists only inside `buy_stamp`; the WebMCP send side; `dns` and `nanda` in the letter path; HCS-25; rotation. **LIMITATIONS names our scoping as the reason for each — never Hedera, never the spec.** A deferred claim is honest; a widened specification or an invented deployment artifact is not.

**Probes are disposable.** Throwaway keys, born in the run and discarded with it; never the real `$POSTAGE` and never the real doorbell, which the runner carries in a `FORBIDDEN` list and stops on. Each probe gets its own small gate report before anything signs, and a run of record after. **A probe leaves nothing reusable and that is the point**: its keys are gone, so nobody can move what it left, including us — the 2026-09-08 token was assumed reusable and is not, which is how we know.

## 12. What the build taught, as rules

Each is one sentence and each names where it came from. They are rules because each was learned by something going wrong, or nearly. What happened is in STATUS §6 and `app/OPERATIONS.md`; this is only what it obliges.

- **The fourteen schemas are frozen: a field the build needs and a schema lacks is a §G entry and a 0.6 candidate, never coded around** (§1.7, Step 4's HCS-13 registration; §G-19 is the worked example, where the code refused the sale rather than inventing a receipt).
- **Every gate report for a consensus write names the window between a signature leaving this process and its outcome being learned, and says how a run resumes from inside it** (Gate One: eight defects, every one in that window, and no offline check can reach it because there is no offline consensus node).
- **Measure what a new topic type costs on the network before anything is priced against it** (the doorbell: 26.31542199 ℏ, against a 2 ℏ published price, discovered by selling one).
- **Protobuf field numbers are probed against the SDK's own bytes, never recalled** (`core/protokey.ts`, `counter/body.ts`; a confident memory put `CryptoUpdateTransactionBody.memo` at 26 and it is 14).
- **A receipt is never reconstructed from the ledger by the party that charged** (Correspondent A: the sale settled, its record was deleted, and nothing was assembled from consensus to replace it — §11 rests on a Verifier checking evidence the issuer did not author).
- **The solvency precheck compares the balance to the fee the network estimates, not to the declared maximum — and our own gates still refuse below the declaration, because a gate should err stricter than the network** (probe 2026-09-09, ledger §H).
- **Every driver that can sign defaults to DRY RUN and goes live only when `--live` ARRIVES in its own argv, which it prints before it reads a key** (2026-09-10: an appended `--dry-run` was eaten by a root script's nested `npm run … --workspace app`, the driver printed LIVE, and a Correspondent was provisioned unauthorised — so trace the script chain and prove by npm's own echo that every flag you rely on reached the process, because a flag's name is not proof it arrived).
- **A model must wear the wire's own shapes, because a field nothing reads today is a field something reads tomorrow** (2026-09-10: `check:letter` gave its modelled lane the memo `hcs-10:1:60:3`, which is not HCS-10's connection-topic form and names no doorbell, while `watcher.ts` had always written the real one — harmless for as long as nothing read it, and a false green the hour D-171 made a Verifier read it; the fixture had been agreeing with itself).
- **Document text is never the replacement STRING of `String.replace`, because `$&`, `` $` `` and `$'` are expanded there and a `$` before a closing backtick
  is ordinary prose** (2026-09-11: a gate report quoting the account-id pattern `^[0-9]+\.[0-9]+\.[0-9]+$` inside backticks therefore carried a literal `` $` ``, which
  means "insert everything before the match", and spliced **7,194 lines of `app/OPERATIONS.md` into itself** — in a diff that was one hunk, insertions only, with every heading still present, so the
  line count was the only tell. Pass a FUNCTION, `replace(a, () => b)`, which is never scanned for
  `$` — the scripts that did so that night were unharmed, which is the whole evidence for the rule.)
- **A fee is read from the mirror's own measured rows, never recalled** (2026-09-11, twice in one night:
  GATE FUND predicted six `CryptoCreateAccount` fees at ~0.05 h each and they charged **0.67192702**,
  and the same 0.05 h sat in the shipped config template for a `TokenAssociateTransaction` this
  deployment had already paid **twice, at 0.62811176 and 0.62936798**, at Step 4 — both right numbers were on
  the mirror and in this repository the whole time. The **bound** written beside the first estimate is what
  kept it honest, so write a bound beside every prediction, and prefer this repository's own measurement to
  a recollection of it.)
- **The goose model RE-ENCODES a long string literal from its own reading of it rather than copying it**
  (2026-09-11/12, twice on consensus: a 96-character payload arrived as 92 and the letter landed *"…on
  consensu."*; a 52-character payload arrived as **52 characters carrying padding the literal does not have**
  and the letter landed *"mail,proven"*. A copy is byte-identical, so the second proves the first was never a
  truncation — **length was never the mechanism** and shortening the literal was never the fix. Two nets, and
  both are needed: **read-back-before-spend** (`docs/OPERATOR-SCRIPT.md` **B3½** — the model repeats the
  string, calls no tool, and the operator compares before a stamp moves, because a letter cannot be withdrawn)
  and the **rendered-against-printed check** at **B5**. B5 was only possible at all once `inbox` returned
  base64 instead of a Node `Buffer` — which is why a card a human can read is a safety property and not
  a courtesy.)
- **Where believing a single read would cost an irreversible act, look twice before acting and never after** (2026-09-10: a lane taken for absent is a doorbell rung, a ring that need not have happened opens a second lane, and a lane cannot be closed — so `send` re-READS where the other party has rung its door, which is Gate One's "mirror-lag read believed once" in the one place the cost is permanent).
