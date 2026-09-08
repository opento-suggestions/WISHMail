# Contributing to WISHMail

WISHMail is certified mail for agents on Hedera. The specification is `spec/WISHMAIL_SPEC_v0_5.md` and it is the only normative document in this repository. Everything below serves one thing: that a reviewer with the specification in one hand and the git history in the other can follow every change without asking anyone what happened.

License: Apache 2.0 (`LICENSE`).

## The chain of custody

**The specification leads, the schema follows, the tests are the court.**

The order of work for any feature is fixed:

```
   the spec sentence exists
        -> the schema in spec/schemas/ tracks it
             -> the test its `Conformance:` note names exists, and fails
                  -> the implementation in app/ makes it pass
```

Never the reverse. Two rules follow:

- **A schema change without a specification change is not a change to WISHMail** (§1.7, §5.11). A pull request that touches `spec/schemas/` and not `spec/WISHMAIL_SPEC_v0_5.md` does not merge.
- **No MUST without a test.** Every uppercase RFC 2119 keyword in the specification carries a `Conformance:` note naming at least one test in `conformance/`, registered in §A of `spec/CONFORMANCE_TESTS_v0_5.md`. A requirement with no named test is a defect in the specification, not a requirement (§1.3).

## Changing the specification

The specification was frozen at 0.5.0 (2026-09-07) and is at 0.5.2. It can still be wrong. When implementation shows a sentence is wrong, incomplete, or untestable:

1. Stop. Do not code around it.
2. Write the finding as a decision candidate: what the text says, what reality says, what you propose, marked MINE.
3. The maintainer rules. A ruling becomes `D-nnn` in `spec/CONFORMANCE_TESTS_v0_5.md` §B, dated — the next number after the last row there.
4. The specification text changes, with `<!-- CHANGED: D-nnn -->` on the line before the amended paragraph.
5. An ADR is written: `spec/adr/D-nnn.md`, from `spec/adr/TEMPLATE.md`.
6. If a MUST was added, its `Conformance:` note names a test and that test is registered in §A.
7. A `CHANGELOG.md` entry records the diff.

All of that is **one change**, not a series of them.

A change to a wire string or to a schema already registered under HCS-13 is a new **minor** version (0.6), never a patch (§1.7).

After any edit to the specification or the ledger, run the extract-and-diff — every `T-P*` identifier in the specification exists as a row in ledger §A, and every row in §A appears in the specification:

```
grep -o 'T-P[0-9]\+-[0-9]\+' spec/WISHMAIL_SPEC_v0_5.md | sort -u > /tmp/a
grep -o '^| T-P[0-9]\+-[0-9]\+' spec/CONFORMANCE_TESTS_v0_5.md | sed 's/^| //' | sort -u > /tmp/b
diff /tmp/a /tmp/b        # must be empty
```

## Register discipline

Every claim in an ADR, in the ledger, and in a commit message is marked:

- **RECORD** — the maintainer said it.
- **FETCHED** — from the web or a reconnaissance report; give the date and `file:line`.
- **MINE** — an inference or a lean.

Never present MINE as RECORD.

Four of the six standards WISHMail rides on are Draft (§1.6, L-7). **Fetch before asserting anything about one.** Conformance is to the git blob §1.6 names, not to the standard's name; a documentation site's paraphrase is not the pin. If the text you need is not in ledger §H or a recon report, fetch it at the pinned commit and record the fetch with its date.

## Commits

### Sign-off (DCO)

Every commit carries a `Signed-off-by` line certifying the Developer Certificate of Origin 1.1 (`DCO`):

```
git commit -s -m "..."
```

which appends:

```
Signed-off-by: Your Name <your.email@example.com>
```

The name and email must be your real ones and must match your git identity. There is no CLA.

### Conventional Commits

Commit subjects follow [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/):

```
<type>(<scope>): <subject>

<body>

Signed-off-by: ...
```

**Types**

| Type | For |
|---|---|
| `feat` | a capability the specification states and did not have |
| `fix` | a defect in an implementation, a schema, or a test |
| `spec` | a change to `spec/WISHMAIL_SPEC_v0_5.md` — always carries a `D-nnn` |
| `test` | a conformance test, a fixture, or the exception corpus |
| `docs` | prose that binds nothing: README, CONTRIBUTING, LIMITATIONS, STATUS |
| `chore` | repository plumbing, tooling, dependencies |
| `refactor` | a change with no behavioural difference and no test change |

**Scopes** — the part of the monorepo touched: `spec`, `schemas`, `vectors`, `pins`, `adr`, `ledger`, `conformance`, `app`, `sdk`, `cli`, `mcp`, `web`, `repo`.

**Subjects** are imperative, lower case, no trailing period, and at most 72 bytes (the hook counts bytes, so a subject with em dashes has less room than its character count suggests). A breaking change carries `!` after the scope and a `BREAKING CHANGE:` footer.

### What a commit message must say

The body says **what changed and why, in terms of the specification's sections and the test it serves** — enough that a reviewer with no access to any AI can follow it. Cite the section (`§7.4`), the invariant (`P-9`), the test (`T-P9-7`), and the decision (`D-96`) where each applies.

The postal motifs used in working sessions do not appear in commit messages, in the specification, or in code. The specification's own postal vocabulary (§2.2, §17) is the vocabulary.

```
spec(schemas): fix nx top-level, forbidden on the last chunk

§7.4 required every chunk but the last to commit the next slice by digest but
did not say where `nx` lives, so a chunk could carry it inside `hdr` and still
validate. The Chunk schema now fixes `nx` top-level and forbids it inside
`hdr`; `h` appears inside `hdr` only.

Serves P-9. Test: T-P9-3. Decision: D-96.

Signed-off-by: ...
```

### The hook

`.githooks/commit-msg` checks the subject against Conventional Commits and refuses a commit with no `Signed-off-by`. Enable it once per clone:

```
git config core.hooksPath .githooks
```

## Documentation

- **ASCII diagrams, never images**, in the specification and in docs. Every diagram in `spec/WISHMAIL_SPEC_v0_5.md` is ASCII for this reason: a diagram in a specification has to survive a diff.
- The specification's register is indicative and present tense. It never narrates its own history ("v0.5 said", "before the chain"). History lives in `spec/CONFORMANCE_TESTS_v0_5.md` and in `CHANGELOG.md`; reasoning lives in `spec/adr/`.
- Vocabulary follows §2.2 and the field names of §5. A lane is a lane, a doorbell is a doorbell, an envelope is an envelope. The tools are `resolve`, `buy_stamp`, `send`, `inbox`, `ack`, `verify`. Failure codes are `TOOL_REASON` as §6 fixes them. Do not introduce synonyms.

## Keys and secrets

**No private-key material anywhere.** Not in a tool input, not in a schema field, not in a configuration file, not in a log, not in a fixture, not in a commit (P-13; T-P13-1, T-P13-2). Keys are born in the agent's process and stay there. `.gitignore` matches `.env*` — a prefix, not `*.env`, so that `.env.local` and `.env.testnet` are caught too — with `!.env.example` negated back in. `.env.example` lists names with blank values and is the only one committed.

## The AI clause

Use agents — subagents, tools, generation — as much as helps. But **every change must be explainable with the agent closed**: the commit message says what changed and why in terms of the specification's sections and the test it serves, and a reviewer with no access to any AI can follow it. If you cannot explain a diff without the conversation that produced it, the diff is not ready.
