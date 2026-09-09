/**
 * The durable record §14.2 requires, behind `WISHMAIL_STATE_DIR`.
 *
 * §14.2: "The Postmaster keeps its own durable record of settled payment
 * references — retained until the payment it names can no longer land, and
 * surviving restarts — and does not rely on the scheme's replay rule for it."
 * And: "A Postmaster MUST accept a `PAYMENT-SIGNATURE` only against
 * requirements it issued, and MUST issue and recognise them from one durable
 * place."
 *
 * Two tests turn on the restart. T-P11-5: a replayed x402 payload and a
 * re-submitted `hbar` purchase each return the original `StampReceipt` with no
 * second transfer, before and after a Postmaster restart. T-P11-6: requirements
 * issued before a restart are accepted after it. In-memory state fails both.
 *
 * WHY THIS IS NOT A DEPENDENCY: `app/OPERATIONS.md`, "the two things that are
 * not". A keyed set of tens of rows, and `src/ops/journal.ts` already
 * established the discipline — write a temp file, then rename, so a
 * half-written file is never observed. A rename over an existing file is atomic
 * on both NTFS and POSIX, which is the whole durability requirement here.
 *
 * Conformance: T-P11-5, T-P11-6.
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * A namespace is a directory. `payments` holds §14.2's two kinds of row —
 * requirements this Postmaster issued, and payment references it has settled.
 * `carry` holds what a provisioning purchase is still carrying (D-168): the
 * holder, the node, and the row-by-row record of what the counter has paid for,
 * so a purchase that stops between rows is resumable from either side.
 */
export type Namespace = 'payments' | 'requirements' | 'carry';

/** What a stored row carries beside its value: when it was written, and when it may go. */
export interface Entry<T> {
  readonly key: string;
  readonly value: T;
  /** ISO 8601, when this row was written. */
  readonly writtenAt: string;
  /**
   * ISO 8601, the earliest a sweep may drop this row. §14.2 retains a settled
   * reference "until the payment it names can no longer land" — so the caller
   * sets this from the payment's own validity, never this module.
   */
  readonly retainUntil?: string;
}

export interface PutOptions {
  /**
   * ISO 8601, the earliest a sweep may drop the row. §14.2 retains a settled
   * reference "until the payment it names can no longer land", so the caller
   * sets this from the payment's own validity.
   */
  readonly retainUntil?: string;
  /** Replace an existing row. Absent by default; see `put`. */
  readonly overwrite?: boolean;
}

export interface Store {
  readonly dir: string;
  /** The entry under a key, or undefined. */
  get: <T>(key: string) => Entry<T> | undefined;
  /**
   * Write a key. Returns `'written'`, or `'kept'` when the key already exists
   * and `overwrite` was not asked for.
   *
   * The default is NOT to overwrite, and that is the point rather than caution:
   * §14.2 says "A payment reference MUST settle at most one purchase", so a
   * second write under the same reference is the replay T-P11-5 describes, and
   * the right answer is to keep the first row and return its receipt.
   */
  put: <T>(key: string, value: T, options?: PutOptions) => 'written' | 'kept';
  /** Remove a key. Returns whether there was one. */
  remove: (key: string) => boolean;
  /** Every key in the namespace, sorted. */
  keys: () => string[];
  /** Every entry, in key order. */
  entries: <T>() => Entry<T>[];
}

/**
 * Keys become filenames, so they are constrained rather than escaped. A payment
 * reference is a Hedera transaction id or an x402 payload digest, and both fit;
 * anything that does not is a caller's bug and should say so loudly rather than
 * become a surprising path.
 */
const KEY = /^[A-Za-z0-9][A-Za-z0-9._@-]{0,199}$/;

function checkKey(key: string): void {
  if (!KEY.test(key)) throw new Error(`store: key ${JSON.stringify(key)} is not a safe key`);
}

/**
 * Open a namespace under a state directory. The directory is created if it does
 * not exist; opening is cheap and holds nothing, so a caller may open per use
 * and a restart is simply a fresh open over the same files.
 */
export function open(stateDir: string, namespace: Namespace): Store {
  const dir = path.join(stateDir, namespace);
  fs.mkdirSync(dir, { recursive: true });

  const file = (key: string): string => path.join(dir, `${key}.json`);

  const read = <T>(key: string): Entry<T> | undefined => {
    try {
      return JSON.parse(fs.readFileSync(file(key), 'utf8')) as Entry<T>;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw e;
    }
  };

  return {
    dir,

    get: <T>(key: string): Entry<T> | undefined => {
      checkKey(key);
      return read<T>(key);
    },

    put: <T>(key: string, value: T, options?: PutOptions): 'written' | 'kept' => {
      checkKey(key);
      if (options?.overwrite !== true && read(key) !== undefined) return 'kept';
      const entry: Entry<T> = {
        key,
        value,
        writtenAt: new Date().toISOString(),
        ...(options?.retainUntil !== undefined ? { retainUntil: options.retainUntil } : {}),
      };
      // Temp file, then rename — `src/ops/journal.ts`'s discipline, for the
      // same reason: a process that dies mid-write must leave either the old
      // row or the new one, never half of either.
      const tmp = `${file(key)}.tmp`;
      fs.writeFileSync(tmp, `${JSON.stringify(entry, null, 2)}\n`, 'utf8');
      fs.renameSync(tmp, file(key));
      return 'written';
    },

    remove: (key: string): boolean => {
      checkKey(key);
      try {
        fs.unlinkSync(file(key));
        return true;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') return false;
        throw e;
      }
    },

    keys: (): string[] =>
      fs
        .readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.replace(/\.json$/, ''))
        .sort(),

    entries: <T>(): Entry<T>[] => {
      const out: Entry<T>[] = [];
      for (const key of fs
        .readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.replace(/\.json$/, ''))
        .sort()) {
        const e = read<T>(key);
        if (e !== undefined) out.push(e);
      }
      return out;
    },
  };
}
