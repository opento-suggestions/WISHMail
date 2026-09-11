/**
 * DRY RUN IS THE DEFAULT, AND GOING LIVE TAKES AN EXPLICIT WORD.
 *
 * On 2026-09-10 a Correspondent was provisioned on `hedera:testnet` — an
 * account bought, six topics created, a name registered — by an invocation that
 * carried `--dry-run` and that `app/OPERATIONS.md` documented as the dry run.
 * The flag never reached the process. The root script forwards to the workspace
 * as `npm run <name> --workspace app`, so an appended `--dry-run` lands on a
 * SECOND npm invocation, where npm consumes it as its own option instead of
 * passing it on; the positional home directory survived because it is
 * positional. `dryRun` read `false`, the driver printed `LIVE`, and it signed.
 *
 * Nothing offline could have caught it. The driver was correct, the flag was
 * spelled correctly, and the loss happened between the terminal and `argv`.
 *
 * So the default is inverted here rather than patched there. A flag that does
 * not arrive now leaves the process in DRY RUN, which is the only arrangement
 * where losing an argument is safe. Going live requires `--live` to ARRIVE —
 * and every live npm script bakes it into the script string in `package.json`,
 * where no forwarding can eat it, which is the arrangement that kept the
 * price-list plan safe that same morning.
 *
 * **The mode and the argv actually received are printed before anything reads a
 * key**, so a reader of the output never has to infer which mode ran. That is
 * the second half of the lesson: the run that signed said `LIVE` on line one,
 * and nobody was looking at line one because the command said `--dry-run`.
 */

/** What a driver was actually asked to do, having looked at what actually arrived. */
export interface RunMode {
  /** True only if `--live` reached this process. */
  readonly live: boolean;
  /** The arguments this process received, as received. */
  readonly argv: readonly string[];
}

/**
 * Decide the mode, announce it, and return it.
 *
 * Call this FIRST in any driver that can submit to a network — before a key is
 * read, before a client is built, before a mirror is queried. `name` is what the
 * driver calls itself in its own output.
 */
export function runMode(name: string): RunMode {
  const argv = process.argv.slice(2);
  const live = argv.includes('--live');
  const dry = argv.includes('--dry-run');

  // Both is not a preference, it is a mistake about which one was meant, and
  // guessing either way is how the thing this module exists to prevent happens.
  if (live && dry) {
    console.error(`\nSTOP — ${name} was given both --live and --dry-run, and it will not choose between them.`);
    process.exit(2);
  }

  console.log('');
  console.log(`  ${name} — ${live ? 'LIVE: this run CAN SIGN and CAN SPEND' : 'DRY RUN: nothing will be signed'}`);
  console.log(`  argv as received  ${JSON.stringify(argv)}`);
  if (!live) {
    console.log('  to go live        pass --live, and check the line above says it arrived');
  }
  console.log('');

  return { live, argv };
}

/**
 * The same decision, announced on STDERR — for a stdio MCP server.
 *
 * `runMode` writes to stdout, which is right for a CLI and catastrophic for a
 * server whose stdout IS the JSON-RPC channel: a banner there is a parse error
 * at the client, not a banner. So the Correspondent's server gets this instead,
 * with the same rule and the same two printed facts.
 *
 * It exists because the one surface goose touches had no mode at all until
 * 2026-09-11, while every CLI that can sign has had one since the day one of
 * them signed by accident. A gate line that changes nothing in the process is
 * not a gate, and `AUTHORIZED` has to mean something a process does
 * differently — here, that it was restarted with `--live` and said so.
 */
export function runModeOnStderr(name: string): RunMode {
  const argv = process.argv.slice(2);
  const live = argv.includes('--live');
  const dry = argv.includes('--dry-run');

  if (live && dry) {
    console.error(`\nSTOP — ${name} was given both --live and --dry-run, and it will not choose between them.`);
    process.exit(2);
  }

  console.error('');
  console.error(`  ${name} — ${live ? 'LIVE: this run CAN SIGN and CAN SPEND' : 'DRY RUN: nothing will be signed'}`);
  console.error(`  argv as received  ${JSON.stringify(argv)}`);
  if (!live) {
    console.error('  to go live        restart with --live, and check the line above says it arrived');
  }
  console.error('');

  return { live, argv };
}
