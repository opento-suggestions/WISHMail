# provenance/

Where WISHMail came from. **These files bind nothing.** The only normative document is `spec/WISHMAIL_SPEC_v0_5.md`; where any file here disagrees with it, the specification wins, without exception and without argument.

They are kept because the ADRs in `spec/adr/` are backfilled from them, and an ADR whose source is not in the repository cannot be checked.

```
WISHMAIL SPEC v0 3.md            2026-09-04. The consolidation ledger that preceded the
                                 specification. §13 is the D-1 - D-41 decisions log the
                                 backfill was written from; §10.1 is the invariant
                                 concordance that became §18.3.
WISHMAIL HANDOFF 2026-09-04.md   2026-09-04. The bridge thesis, the first invariant set,
                                 D-1 - D-23, the build set, and the repository posture.
RESEARCH_USPS_PES_2026-09-04.md  Day-one research. The postal law behind §17 - which is
                                 informative, and whose citations were each verified by
                                 hand on 2026-09-07 (ledger §G item 7).
WISHMail-diagram-initial.png     The Excalidraw scope map, checkpoint c53c11444bd1459986.
                                 The ratified scope line (D-23): green/blue = BUILD,
                                 orange = STRETCH, dashed = SPEC or VENUE.
```

## Reading them without being misled

Two things in here are wrong now, and both are wrong in ways an implementer could act on.

**The identifiers moved.** v0.3 numbers the invariants differently, and the names moved with the numbers. `P-1` there is *keyless verification*, which was merged into public-data replay and is `P-3` here. `P-2` there is *payment–envelope binding*, which is `P-1` here. `P-3` there is *never hold the soul*, which is `P-13` here, widened to every agent private key. §18.3 of the specification carries the full concordance, and the ledger carries the same table with the provenance of each correspondence. Every conformance test is keyed to the specification's identifiers and to no earlier set.

**Decisions were superseded.** v0.3 §13 records the state of the design on 2026-09-04, and the ADRs say what happened to each: D-18's HOL disposition was replaced by D-103/D-104/D-108, D-20 was answered by D-49, D-28's receipt mechanism by D-76/D-78, D-33's set-valued `resolve` by D-133, D-39's version by D-125, and D-41's L-13 wording by D-130. Read `spec/adr/D-0nn.md` beside any row here before treating it as current.

The diagram is an image, and images do not belong in the specification or in docs — every diagram there is ASCII, because a diagram in a specification has to survive a diff. This one is a working artifact of the scope decision, not documentation.
