# Planning artifacts

The plans this build was directed by, verbatim as they were approved. **Nothing here is normative.**
`spec/WISHMAIL_SPEC_v0_5.md` governs; `spec/CONFORMANCE_TESTS_v0_5.md` is the working ledger; a plan
is neither. Where a plan disagrees with the specification, the specification wins — and where a plan
disagrees with what was built, the git history and `app/OPERATIONS.md` are the record of what
actually happened.

They are here because the work was directed rather than typed. ETHGlobal's rules require that a
spec-driven workflow include its spec files, prompts and planning artifacts in the submission
repository, so that a judge can see how the AI was directed and not only what it produced. The
standing instruction is `CLAUDE.md`, at the repository root, read at the start of every session.
These are the per-window plans written under it.

Each was written in plan mode, presented to Sonic with its open questions, amended by his rulings,
and only then executed. The amendments are not in the files — a plan is what was approved, and the
rulings that changed it are in `spec/CONFORMANCE_TESTS_v0_5.md` §B as decision records and in the
commit messages that carried them out. Three examples, so the pattern is visible. The 09-08
`0.5.2` plan's Phase A′ proposed a doorbell fee-schedule key and that amendment was **withdrawn**
on the evidence of the pinned HIP-991 text, and its `initialSupply: 10000` at token creation became
D-149's mint as a separate act. And the `0.5.3` plan's Phase D treated HCS-14's hashing algorithm
as a settled fact to be confirmed by a fetch before signing; the fetch found the standard
contradicting **itself** about the canonical key order, which stopped the declaration mid-step and
produced an entire further patch — 0.5.4, D-152 and D-153 — that appears nowhere in the plan that
was executing when it happened. None of those corrections is in a plan file; all of them are in the
ledger.

That last one is why the version in a plan's filename is the version the plan *directed*, and not
the version the repository reached while executing it.

One plan was also rewritten **before** approval rather than after: the `0.5.3` plan's first form
took an HPKE library as a dependency, Sonic refused it, and the file here is the rewritten plan in
which RFC 9180 base mode is composed on `node:crypto` with the RFC's own Appendix A.1 as its court.
The refusal is not visible in the file, because the file is what was approved; the reasoning is in
`app/OPERATIONS.md`, written in the same form as the ruling that reached the opposite conclusion
about the canonicalizer.

| File | Written | Directed | Executed by |
|---|---|---|---|
| `2026-09-07-0.5.1-then-the-entities.md` | 2026-09-07 | Phase A — the 0.5.1 patch (D-135 – D-138); Phase B Step 0 (the tooling rule and the scaffold) and Step 1 (D-139 – D-144) | `603bb2b`, `9bce012`, `8acaf41` |
| `2026-09-08-0.5.2-then-the-entities.md` | 2026-09-08 | Phase A′ — the 0.5.2 patch (D-145 – D-148); the HIP-991 probe; Phase B Step 2 — the entities on `hedera:testnet`; Steps 3 and 4 | `21cb3c2` through `22108a9` |
| `2026-09-08-0.5.3-the-wiring.md` | 2026-09-08 | Phase A″ — the 0.5.3 patch (D-150, D-151); Phase B — the primitives and their vectors, the schema registry, the durable store, the MCP surface, and the conformance harness with its 83 stubs; Phase D — the `hcs14` declaration, the only signatures in the step | `1b6f243` through `ca9d45c` |
| `2026-09-09-0.5.5-the-mvp-build.md` | 2026-09-09 | The MVP scope line; seven rulings (D-156 – D-162); the 0.5.5 patch — the ring and the payer seam, `carry`, the orphans row, the provisioning order, the `provisioning` line; two read-only checks; the Step 4 freeze gate. **Nothing signed** | `54c8a15` onward |
| `2026-09-09-0.5.6-the-gate-and-the-probe.md` | 2026-09-09 | The second window of the same day: §G-16 ruled (D-163), D-159 amended in place, the register op's shape (D-164) and the persistence rules (D-165); the 0.5.6 patch and three schema changes; the HIP-542 probe **signed and run**; the Step 4 freeze re-confirmed and **not signed** | `8b8d272` through `bab4a44` |

Each plan opens by naming what the one before it left standing, so they read in order.

**Not every window has a plan file, and the gap is deliberate rather than lost.** Steps 4 and 5 were
directed by instruction inside the session rather than in plan mode. So was the 09-09 window above,
whose file is written from the prompt that directed it rather than reconstructed afterwards — the
rulings it carries are in ledger §B as D-156 – D-162 and the sentences they moved carry `CHANGED`
markers, so a reader can check the file against the record rather than take its word. What stands in for a plan there
is the **gate report**, written and committed *before* the step's first signature and in the same
shape a plan has: what the step creates, what it asserts, what it writes and where, and every way it
stops. They are `app/OPERATIONS.md` §Step 4 and §Step 5 — the second opening with `send`'s actors,
inputs and outputs, the invariants as each binds at send, the failure modes, and the tests the step
answers to, all before a line of it was implemented. The instructions themselves are not in this
repository; their substance is in those reports and in the commit messages that carried them out.

All three were written inside the submission window (ETHOnline 2026, opened 2026-09-04). Plan artifacts
belonging to other projects, and any predating the window, are not in this repository; what came
before WISHMail's own window is in `provenance/`, which binds nothing and is labelled as such.
