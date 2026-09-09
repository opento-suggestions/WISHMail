/**
 * `TOOL_REASON` — §6's failure codes, as a thrown value.
 *
 * §6.1: "Failure codes are `TOOL_REASON`, uppercase, fixed below. A failure is
 * returned only when the tool cannot produce its object. Where a tool can
 * produce its object with a caveat, it returns the object and an endorsement
 * (P-12); it does not fail."
 *
 * So this type is deliberately narrow. A `ToolFailure` is thrown only where §6
 * names a code for the condition; everything else is a downgrade, an
 * endorsement, or an unopened delivery with a reason — none of which is an
 * error, and all of which are values a tool returns (P-12).
 */

/** Every code §6 fixes, tool by tool. A code not in this list is not a failure. */
export const TOOL_REASONS = [
  // §6.2
  'RESOLVE_UNSUPPORTED_ADDRESS',
  'RESOLVE_PROFILE_MISMATCH',
  'RESOLVE_NOT_FOUND',
  'RESOLVE_REGISTRY_UNREACHABLE',
  // §6.3
  'STAMP_PAYMENT_FAILED',
  'STAMP_PAYMENT_UNSETTLED',
  'STAMP_HOLDER_INVALID',
  'STAMP_METHOD_UNSUPPORTED',
  // §6.4
  'SEND_UNRESOLVED',
  'SEND_INSUFFICIENT_STAMPS',
  'SEND_TOO_HEAVY',
  'SEND_STALE_KEY',
  'SEND_LANE_INVALID',
  'SEND_AFFIX_FAILED',
  'SEND_SUBMIT_FAILED',
  'SEND_SETTLE_TIMEOUT',
  // §6.5
  'INBOX_MIRROR_UNREACHABLE',
  // §6.6
  'ACK_NOT_OPENED',
  'ACK_NOT_REQUESTED',
  'ACK_DUPLICATE',
  'ACK_SUBMIT_FAILED',
  // §6.7
  'VERIFY_MIRROR_UNREACHABLE',
  'VERIFY_SCOPE_INVALID',
] as const;

export type ToolReason = (typeof TOOL_REASONS)[number];

/**
 * A tool that cannot produce its object. The `reason` is what the caller sees;
 * `detail` is for a human reading a log and is never a second reason code.
 */
export class ToolFailure extends Error {
  readonly reason: ToolReason;
  readonly detail: string;

  constructor(reason: ToolReason, detail: string) {
    super(`${reason}: ${detail}`);
    this.name = 'ToolFailure';
    this.reason = reason;
    this.detail = detail;
  }
}

/** Throw one. Reads as the specification's sentence does: the tool refuses. */
export function refuse(reason: ToolReason, detail: string): never {
  throw new ToolFailure(reason, detail);
}

/** Whether a thrown value is a tool failure rather than a defect. */
export function isToolFailure(e: unknown): e is ToolFailure {
  return e instanceof ToolFailure;
}
