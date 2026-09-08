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
commit messages that carried them out. Two examples, so the pattern is visible: the 09-08 plan's
Phase A′ proposed a doorbell fee-schedule key and that amendment was **withdrawn** on the evidence
of the pinned HIP-991 text, and its `initialSupply: 10000` at token creation became D-149's mint as
a separate act. Neither correction is in the plan; both are in the ledger.

| File | Written | Directed | Executed by |
|---|---|---|---|
| `2026-09-07-0.5.1-then-the-entities.md` | 2026-09-07 | Phase A — the 0.5.1 patch (D-135 – D-138); Phase B Step 0 (the tooling rule and the scaffold) and Step 1 (D-139 – D-144) | `603bb2b`, `9bce012`, `8acaf41` |
| `2026-09-08-0.5.2-then-the-entities.md` | 2026-09-08 | Phase A′ — the 0.5.2 patch (D-145 – D-148); the HIP-991 probe; Phase B Step 2 — the entities on `hedera:testnet`; Steps 3 and 4 | `21cb3c2` through `22108a9` |

The second plan opens by naming what the first one left standing, so the two read in order.

Both were written inside the submission window (ETHOnline 2026, opened 2026-09-04). Plan artifacts
belonging to other projects, and any predating the window, are not in this repository; what came
before WISHMail's own window is in `provenance/`, which binds nothing and is labelled as such.
