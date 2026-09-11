/**
 * ONE LIVE PROCESS PER HOME, and why a lane is what makes it matter.
 *
 * The home directory IS the agent (D-165). Two processes on one home are one
 * agent running twice, and for most of what a Correspondent does that is merely
 * wasteful — two readers of a mirror node read the same bytes.
 *
 * **The doorbell watcher is the exception, and it is not recoverable.** It
 * auto-accepts connection requests (D-158) and decides what is outstanding by
 * reading consensus — which is idempotence against a *ledger*, not uniqueness
 * against a *process*. Two watchers reading one unanswered request can both
 * find it outstanding and both create a lane, because neither writes anything
 * the other can see until both have already signed. §7.1 then has two lanes
 * between the same pair and takes the earliest-created as *the* lane, so the
 * other is permanent litter on a topic that **cannot be closed**, paid for at
 * the operator's expense and confusing to every later reader.
 *
 * Nothing in the ledger prevents that, so this does. It is the one place in the
 * Correspondent where a local file is an authority rather than a cache — and it
 * is an authority about THIS MACHINE'S processes, never about consensus, which
 * is why it does not violate the rule it looks like it violates.
 *
 * **A dry run takes no lock**: it starts no watcher and can sign nothing, so
 * rehearsing while an agent is live is safe and should not be made awkward.
 *
 * The lock is a file holding a PID. A stale one — the process is gone — is
 * taken over and said so, because the alternative is an agent that will not
 * start after a crash and an operator who deletes files to make it go.
 */
import fs from 'node:fs';
import path from 'node:path';

export class HomeBusy extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HomeBusy';
  }
}

export interface HomeLock {
  readonly path: string;
  /** Whether a dead process's lock was taken over, for the record. */
  readonly tookOver: number | null;
  readonly release: () => void;
}

function alive(pid: number): boolean {
  try {
    // Signal 0 tests for existence without delivering anything.
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // EPERM means it exists and is not ours — which is still alive.
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * Take the lock on a home, or refuse and say which process holds it.
 *
 * @param dir the home directory
 * @param what a name for this process, for the message the second one reads
 */
export function lockHome(dir: string, what: string): HomeLock {
  const file = path.join(dir, 'run.lock');
  let tookOver: number | null = null;

  if (fs.existsSync(file)) {
    const held = Number.parseInt(fs.readFileSync(file, 'utf8').trim().split(/\s/)[0] ?? '', 10);
    if (Number.isInteger(held) && held !== process.pid && alive(held)) {
      throw new HomeBusy(
        `${dir} is already being run by process ${held}.\n` +
          '  A home IS the agent (D-165), and two live processes on one home means two doorbell watchers:\n' +
          '  both can find the same connection request unanswered and both create a lane, and a lane cannot\n' +
          '  be closed. Stop that process first, or point this one at a different home.\n' +
          `  If ${held} is gone, delete ${file}.`,
      );
    }
    if (Number.isInteger(held) && held !== process.pid) tookOver = held;
  }

  fs.writeFileSync(file, `${process.pid} ${what} ${new Date().toISOString()}\n`, { mode: 0o600 });

  let released = false;
  return {
    path: file,
    tookOver,
    release: () => {
      if (released) return;
      released = true;
      try {
        // Only ever remove our own: a lock taken over by someone else while we
        // were dying is theirs, and deleting it would strand them.
        const held = Number.parseInt(fs.readFileSync(file, 'utf8').trim().split(/\s/)[0] ?? '', 10);
        if (held === process.pid) fs.rmSync(file, { force: true });
      } catch {
        /* the lock is already gone, which is the state we wanted */
      }
    },
  };
}
