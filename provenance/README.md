# provenance/

**This folder is READ-ONLY HISTORY, with one exception added on 2026-09-10 and named below. It is superseded in every
particular by `spec/`, and it is kept because Start Fresh permits prior thinking to guide** (CLAUDE.md §2) — prior
thinking, never prior code. **These files bind nothing.** The only normative document is
`spec/WISHMAIL_SPEC_v0_5.md`; where any file here disagrees with it, the specification wins, without exception and
without argument.

**The sentence above used to read "it has been untouched since 2026-09-07 by design", and that stopped being true on
2026-09-10.** It is corrected here rather than quietly restated, because a folder whose README describes it
inaccurately is worse than a folder with a mixed brief. What arrived is an **outbound** document — a draft addressed
to the maintainers of a pinned standard — and outbound is a different thing from the inbound history everything else
here is. It lives here because a draft that binds nothing and may never be sent belongs with the other things that
bind nothing, and because `spec/` is for text that governs.

They are kept for one working reason besides: the ADRs in `spec/adr/` are backfilled from them, and an ADR whose source
is not in the repository cannot be checked.

```
WISHMAIL-SPEC-v0.3.md            2026-09-04. The consolidation ledger that preceded the
                                 specification. §13 is the D-1 - D-41 decisions log the
                                 backfill was written from; §10.1 is the invariant
                                 concordance that became §18.3.
WISHMAIL-HANDOFF-2026-09-04.md   2026-09-04. The bridge thesis, the first invariant set,
                                 D-1 - D-23, the build set, and the repository posture.
RESEARCH_USPS_PES_2026-09-04.md  Day-one research. The postal law behind §17 - which is
                                 informative, and whose citations were each verified by
                                 hand on 2026-09-07 (ledger §G item 7).
WISHMAIL-DIAGRAM-INITIAL-        The Excalidraw scope map, checkpoint c53c11444bd1459986.
  2026-09-04.png                 The ratified scope line (D-23): green/blue = BUILD,
                                 orange = STRETCH, dashed = SPEC or VENUE.
WISHMAIL-DEMO-FLOW-              2026-09-09. The demo flow as it stands after Gate One:
  2026-09-09.png                 the purchase, the carried mailbox, the letter loop, the
                                 stranger's verify. A working artifact, not documentation.
ETHGlobal-rules.md               The venue's rules, as read on 2026-09-07. Provenance
                                 because a deadline is context and binds no line of code.
recon/                           Dated fetches of the standards, and the pins drafted from
                                 them. See its own README.
```

**And one file that is not history** — added 2026-09-10, and the reason the opening sentence changed:

```
HCS-10-OUTBOUND-CONNECTION-      DRAFT, NOT SENT. An issue report for the maintainers of
  CREATED-2026-09-10.md          hiero-consensus-specifications: at the pinned commit, the
                                 Outbound Connection Created operation is introduced by
                                 prose and a table row that name the ACCEPTOR as its writer
                                 (index.md:529, :560) and specified by three of five required
                                 field descriptions that name the REQUESTER (:585, :586,
                                 :587). All are required, so no implementation can satisfy
                                 both. Written in the shape ledger §G-24 uses — file, line,
                                 the two readings, no opinion and no preferred fix — so that
                                 it reports rather than lobbies. Sonic's to send or not.
                                 What THIS deployment does meanwhile is D-174: write the
                                 record on both parties' logs and record the contradiction
                                 FETCHED rather than resolve it. That is a decision about
                                 our code and not a reading of the standard.
```

**Two paths moved on 2026-09-09**, in a hygiene pass that changed no byte of any file's content: `recon/` is now
`provenance/recon/`, `ETHGlobal-rules.md` is now `provenance/ETHGlobal-rules.md`, and three files with spaces or mixed
case in their names were slugged as above. **Anything written before that date cites the old paths** — the CHANGELOG,
ledger §B and §H, and several ADRs — and those citations were deliberately not rewritten, because they are the record
of what was true when they were written. Read `recon/…` in an older document as `provenance/recon/…`.

## Reading them without being misled

Two things in here are wrong now, and both are wrong in ways an implementer could act on.

**The identifiers moved.** v0.3 numbers the invariants differently, and the names moved with the numbers. `P-1` there is *keyless verification*, which was merged into public-data replay and is `P-3` here. `P-2` there is *payment–envelope binding*, which is `P-1` here. `P-3` there is *never hold the soul*, which is `P-13` here, widened to every agent private key. §18.3 of the specification carries the full concordance, and the ledger carries the same table with the provenance of each correspondence. Every conformance test is keyed to the specification's identifiers and to no earlier set.

**Decisions were superseded.** v0.3 §13 records the state of the design on 2026-09-04, and the ADRs say what happened to each: D-18's HOL disposition was replaced by D-103/D-104/D-108, D-20 was answered by D-49, D-28's receipt mechanism by D-76/D-78, D-33's set-valued `resolve` by D-133, D-39's version by D-125, and D-41's L-13 wording by D-130. Read `spec/adr/D-0nn.md` beside any row here before treating it as current.

The diagram is an image, and images do not belong in the specification or in docs — every diagram there is ASCII, because a diagram in a specification has to survive a diff. This one is a working artifact of the scope decision, not documentation.
