# provenance/recon/

**Read-only history, like everything under `provenance/`.** Dated fetches of the standards WISHMail rides on, and the
pins drafted from them, none of them touched since 2026-09-07. This folder was at the repository root until
2026-09-09; documents written before then cite it as `recon/`. **Nothing here is normative.** The specification's §1.6 is the appendix of record for pins and `spec/pins.json` is its machine-readable form; these files are the working papers those were built from.

Read one only when the corresponding row in `spec/CONFORMANCE_TESTS_v0_5.md` §H is not enough. §H is the digest: verified facts with their sources and `file:line`, and it is what the build leans on.

```
pins-recon-2026-09-06.md        the six HCS standards at hiero-ledger/hiero-consensus-
pins.draft.json                 specifications @ 7046156c. Ten OPEN items (O-1..O-10),
                                including the 1KB-in-bytes question that D-96 settled.
nanda-recon-2026-09-06.md       the NANDA v2 index. Source of D-97 and D-98: there is no
nanda.pins.draft.json           ans://, nothing in the read path is signed, and the index
                                enforces no TTL - hence social-committee and blurred (§9.4).
hol-x402-recon-2026-09-06.md    the HOL broker and x402. Source of D-102 (x402-foundation
hol-x402.pins.draft.json        is the normative repo; coinbase/x402 a fork 480 commits
                                behind), D-103, D-104 and D-132 (the x402.org facilitator).
openconvai-recon-2026-09-06.md  there is no OpenConvAI registry. Source of D-108: the
openconvai.pins.draft.json      broker's label is not what the ledger recorded, and the
                                rule matches on identifier and nativeId, never the label.
impl-study-2026-09-06.md        the qisma study. Shape only - nothing inherited as code
                                (Start Fresh, D-13). Source of D-106 and D-109.
```

## Two things to carry forward

**Digests are over raw git blob bytes.** Every `sha256` in a pins draft was computed with `git cat-file blob <blobSha> | sha256sum`, never over a working-tree checkout: `core.autocrlf=true` on the machine that ran the recon corrupts working-tree digests. Reproduce them the same way or they will not match.

**Four of the six standards are Draft and change by pull request** (L-7, F-9). Conformance is to the blob §1.6 names, not to the standard's name, and a documentation site's rendering of `main` is not the pin. If a fact you need is not in §H or here, fetch it at the pinned commit and file it in §H with its date.
