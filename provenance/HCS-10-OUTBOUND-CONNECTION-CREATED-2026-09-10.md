# Draft upstream issue — HCS-10 *Outbound Connection Created*: prose and field table name different writers

**Status: DRAFT, NOT SENT.** Written 2026-09-10 for Sonic to send to
`hiero-ledger/hiero-consensus-specifications` or not. It is deliberately written
as a report and not as a proposal: file, line, the two readings, no opinion, no
preferred fix. Nothing in this file is normative for WISHMail; ledger §G-24 and
`spec/adr/D-174.md` record what this project does meanwhile.

If it is sent, the title above is the issue title and everything from the rule
below is the issue body.

---

## Summary

At commit `7046156c85eaaf29e149fa10232964d33a58d34e`,
`docs/standards/hcs-10/index.md` (git blob sha
`0cb5d2eb6b98e12e4b44fa8c4fea6e10937b615a`) describes the **Outbound Connection
Created** operation twice, and the two descriptions name different agents as its
writer. An implementer cannot satisfy both.

## Where

**Reading A — the acceptor writes it** (the agent that received the
`connection_request` and created the connection topic):

- `index.md:529`, the Outbound Topic Operations table:
  > | `connection_created` | Record of a connection created **by the agent** | ✅ |

- `index.md:560`, the operation's introductory sentence:
  > Recorded on an agent's Outbound Topic when it successfully processes a
  > `connection_request` and creates a new Connection Topic.

**Reading B — the requester writes it** (the agent that sent the
`connection_request`):

- `index.md:585`, `confirmed_request_id`:
  > The sequence number of the `connection_created` message **received** on the
  > agent's inbound topic, confirming the connection request.

  An agent that *creates* the connection topic posts that message on its own
  inbound topic rather than receiving one.

- `index.md:586`, `connection_request_id`:
  > The sequence number of the original `connection_request` **sent by this
  > agent**, linking the confirmation back to the initial request.

  The agent that created the connection topic sent no `connection_request`.

- `index.md:587`, `operator_id`:
  > Identifier for the agent that **confirmed** the connection (**the recipient
  > of the original request**) in the format `inboundTopicId@accountId`.

  Under Reading A the writer is the confirmer, so this field would name the
  writer; under Reading B it names the counterparty. The parenthetical is what
  makes the two incompatible rather than merely redundant.

**A sixth field points at the disagreement without resolving it** —
`index.md:584`, `requestor_outbound_topic_id`:

> The ID of the outbound topic belonging to the agent who initiated the
> connection request.

Under Reading A this is the counterparty's topic and is the only way a reader
learns it. Under Reading B it is the writer's own topic, already given by
`outbound_topic_id` at `:583`.

## Why it is not resolvable by reading

All five fields at `:584`–`:587` plus `:583` are marked **required**, so an
implementation cannot omit the ones that do not fit its reading. The two
readings produce records that differ in `operator_id` (which of the two agents
it names) and in `requestor_outbound_topic_id` (whether it repeats
`outbound_topic_id`), so a consumer cannot distinguish "written under the other
reading" from "written incorrectly".

The neighbouring **Outbound Connection Request** operation (`index.md:549-556`)
is unambiguous by comparison: `:553` states explicitly that `operator_id` names
"the agent which is being requested … (not the agent making the request)", and
the writer is named in the introductory sentence at `:534`. The Outbound
Connection Created operation has no equivalent disambiguating parenthetical on
its writer.

## What a report of this needs from maintainers

Which agent writes an Outbound Connection Created record — and, if it is the
acceptor, how `confirmed_request_id` and `connection_request_id` are to be read
by a party that received a request rather than sending one.

## Environment

Read at the pinned commit only. No claim is made about `main` or any later
revision; the digest above is what was read.
