# ADR template

**Where this file lives.** The repository's subfolders (`spec/`, `conformance/`, `app/`) are not yet built. Until `spec/adr/` exists, this template lives in the project root. When the layout of `CLAUDE.md` §4 is created, move it to `spec/adr/TEMPLATE.md` and delete it here; do not keep two copies.

**What an ADR is here.** One file per decision, `spec/adr/D-nnn.md`, keyed to the decision number in `CONFORMANCE_TESTS_v0_5.md` §B. D-42 onward are written from §B's rows, which are their source of truth; D-1 – D-41 are backfilled from `WISHMAIL_SPEC_v0_3.md` and the 2026-09-04 handoff and marked as carried. A new decision gets the next number after the last in §B, a row in §B, and a file here — the same change.

**Register.** Every claim in an ADR is marked RECORD (Sonic said it), FETCHED (from the web or a recon; date and file:line), or MINE (Claude's inference). Sonic's ruling is the decision; Claude's reasoning is context. Never present MINE as RECORD.

---

```
# D-nnn — <title: what was decided, in the spec's vocabulary>

Status:      proposed | accepted | superseded by D-mmm | carried (D-1 – D-41 only)
Date:        YYYY-MM-DD
Decided by:  Sonic
Drafted by:  Claude | Claude Code | Sonic
Sections:    §x.y, §z            (every spec section the decision shaped)
Tests:       T-P?-n, …           (every test added, moved, or amended; "none" if none)
Supersedes:  D-kkk | none
Spec marker: CHANGED: D-nnn on §x.y | none (pre-freeze, folded into 0.5.0)

## Context
What was true before, and what made a decision necessary. Cite the spec text as it
stood, the recon fact (FETCHED, dated, file:line), or Sonic's words (RECORD, quoted).

## Decision
The ruling, in one paragraph, in the indicative. This is what the spec text now says
and why. If a MUST was added: the sentence, and the Conformance: note that names its
test.

## Alternatives considered
Each alternative in one line, and why it lost. Claude's leans are MINE and say so.

## Consequences
What the decision binds: sections amended, tests registered or moved, schemas
changed (a schema change is a new minor version), anything an implementer must now
do differently. What it leaves open, with the §19 entry if one exists.

## Provenance
Ledger §B row; the chat or recon it came from, by date; the CHANGELOG entry.
```

---

**Rules that hold for every ADR.** A decision that adds a MUST names a test, and the test exists in §A before the ADR is `accepted`. A decision that changes a wire string or a registered schema is a new minor version, and the ADR says so. A superseded ADR is not edited; it gets `Status: superseded by D-mmm` and stays. An ADR never narrates the spec's history in the spec's voice — that is what the ADR is for, so the spec doesn't have to.

**Backfill note (D-1 – D-41).** Write each from v0.3's §18 and §19 tables and the handoff; mark `Status: carried`; where v0.4/v0.5 later changed the decision, add `Supersedes`/`superseded by` pointing at the §B row that did (for example, D-30's `send` return is held; D-23's build set is carried into `STATUS.md`). Where v0.3's wording and 0.5.0's differ, 0.5.0 governs and the ADR says what was carried and what was not.
