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

/** Something just submitted: consensus in ~3-5s, mirror ingest a little after. */
export const FRESH: WaitPolicy = { timeoutMs: 45_000, intervalMs: 1_500 };

export class Mirror {
  constructor(private readonly baseUrl: string) {}

  /** GET; 404 yields null. Throws on anything else. */
  async get<T>(p: string): Promise<T | null> {
    const url = this.baseUrl + p;
    const r = await fetch(url);
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`mirror ${r.status} for ${p}`);
    return (await r.json()) as T;
  }

  /** Poll until `ready`, or give up. Returns null on timeout. */
  async poll<T>(p: string, ready: (v: T) => boolean, w: WaitPolicy = FRESH): Promise<T | null> {
    const deadline = Date.now() + w.timeoutMs;
    for (;;) {
      const v = await this.get<T>(p);
      if (v !== null && ready(v)) return v;
      if (Date.now() >= deadline) return v;
      await new Promise((res) => setTimeout(res, w.intervalMs));
    }
  }
}

/** `0.0.8641261@1757280000.123456789` → `0.0.8641261-1757280000-123456789`. */
export function toMirrorTxId(id: string): string {
  const m = id.match(/^(\d+\.\d+\.\d+)@(\d+)\.(\d+)$/);
  if (!m) throw new Error(`unrecognised transaction id: ${id}`);
  return `${m[1]}-${m[2]}-${m[3]!.padStart(9, '0')}`;
}
