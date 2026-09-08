/**
 * Mirror-node REST. Every read in this project goes through here.
 *
 * `app/OPERATIONS.md`: a receipt says what was submitted; the mirror node says
 * what consensus holds, which is the only thing a Verifier can check
 * afterwards. P-3 makes replay a function of public consensus data and P-4
 * forbids a broker, which together fix a mirror node as a read interface.
 *
 * No SDK query, no agent kit, no service that reads on our behalf.
 */

export interface WaitPolicy {
  readonly timeoutMs: number;
  readonly intervalMs: number;
}

/** No single mirror request may outlive this. `fetch` has no default timeout. */
export const REQUEST_TIMEOUT_MS = 15_000;

/** Something just submitted: consensus in ~3-5s, mirror ingest a little after. */
export const FRESH: WaitPolicy = { timeoutMs: 45_000, intervalMs: 1_500 };

export class Mirror {
  constructor(private readonly baseUrl: string) {}

  /**
   * GET; 404 yields null. Throws on anything else.
   *
   * Every request carries its own timeout. `fetch` has none by default, and a
   * stalled connection then hangs the process for as long as anyone is willing
   * to wait — which is exactly what happened on the first Step 2 run
   * (2026-09-08): the token was created, the readback never returned, and the
   * record was never written for an entity that exists.
   */
  async get<T>(p: string, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T | null> {
    const r = await fetch(this.baseUrl + p, { signal: AbortSignal.timeout(timeoutMs) });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`mirror ${r.status} for ${p}`);
    return (await r.json()) as T;
  }

  /**
   * Poll until `ready`, or give up at the deadline.
   *
   * A request that times out or fails transiently is "not yet", not a crash: a
   * mirror node is a read interface and a slow one is still a mirror node. A
   * request that keeps failing runs out the deadline like any other unmet
   * predicate, so the caller still gets an answer rather than a hang.
   */
  async poll<T>(p: string, ready: (v: T) => boolean, w: WaitPolicy = FRESH): Promise<T | null> {
    const deadline = Date.now() + w.timeoutMs;
    let last: T | null = null;
    for (;;) {
      try {
        last = await this.get<T>(p);
        if (last !== null && ready(last)) return last;
      } catch {
        // transient: fall through to the deadline check and try again
      }
      if (Date.now() >= deadline) return last;
      await new Promise((res) => setTimeout(res, w.intervalMs));
    }
  }
}

/** `0.0.8641261-1757280000-123456789` → `0.0.8641261@1757280000.123456789`. */
export function fromMirrorTxId(id: string): string {
  const m = id.match(/^(\d+\.\d+\.\d+)-(\d+)-(\d+)$/);
  if (!m) throw new Error(`unrecognised mirror transaction id: ${id}`);
  return `${m[1]}@${m[2]}.${m[3]}`;
}

/** `0.0.8641261@1757280000.123456789` → `0.0.8641261-1757280000-123456789`. */
export function toMirrorTxId(id: string): string {
  const m = id.match(/^(\d+\.\d+\.\d+)@(\d+)\.(\d+)$/);
  if (!m) throw new Error(`unrecognised transaction id: ${id}`);
  return `${m[1]}-${m[2]}-${m[3]!.padStart(9, '0')}`;
}
