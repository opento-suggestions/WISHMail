/**
 * The one narrow write to `spec/pins.json`.
 *
 * D-144: §18.4 enumerates that file's contents and names no fourth kind of
 * thing, so this phase adds exactly `stampToken["hedera:testnet"]` and nothing
 * else. The line is structural rather than a matter of care — this module's
 * parameter type has no field for anything else, so it physically cannot write
 * a topic id, an account, or a key.
 *
 * T-P9-2 is why it matters: the suite refuses to report while any pin is
 * unfilled, so every entry here gates every conformance claim.
 */
import fs from 'node:fs';
import path from 'node:path';

export interface StampTokenPin {
  readonly tokenId: string;
  readonly treasury: string;
}

export type PinOutcome =
  | { readonly kind: 'written'; readonly remainingNulls: number }
  | { readonly kind: 'already'; readonly remainingNulls: number }
  | { readonly kind: 'conflict'; readonly pinned: StampTokenPin; readonly found: StampTokenPin };

function countNulls(o: unknown): number {
  if (o === null) return 1;
  if (typeof o !== 'object' || Array.isArray(o)) return 0;
  return Object.values(o as Record<string, unknown>).reduce<number>((n, v) => n + countNulls(v), 0);
}

/**
 * Fill `stampToken["hedera:testnet"]`. Refuses to overwrite a different
 * non-null pin: re-creating the token is a decision that also requires
 * re-pinning, and the caller must say so rather than have it inferred.
 *
 * The write is a SURGICAL TEXT EDIT of one line, not a re-serialisation.
 * `JSON.stringify` would reformat the whole file — dropping the blank lines
 * between blocks and re-wrapping the single-line standards entries — and turn a
 * two-value change into an eighty-line diff nobody can review. §1.6 is the
 * appendix of record and this file is its machine-readable form; a reviewer must
 * be able to see that exactly two values moved.
 */
export function pinStampToken(repoRoot: string, next: StampTokenPin, repin: boolean): PinOutcome {
  const file = path.join(repoRoot, 'spec', 'pins.json');
  const raw = fs.readFileSync(file, 'utf8');
  const json = JSON.parse(raw) as {
    stampToken: Record<string, { tokenId: string | null; treasury: string | null }>;
  };
  const slot = json.stampToken['hedera:testnet'];
  if (!slot) throw new Error('spec/pins.json has no stampToken["hedera:testnet"] slot');

  if (slot.tokenId !== null || slot.treasury !== null) {
    const found = { tokenId: slot.tokenId ?? '', treasury: slot.treasury ?? '' };
    const same = found.tokenId === next.tokenId && found.treasury === next.treasury;
    if (same) return { kind: 'already', remainingNulls: countNulls(json) };
    if (!repin) return { kind: 'conflict', pinned: found, found: next };
  }

  // Match the one line, whatever it currently holds, and replace only it.
  const line = /^(\s*)"hedera:testnet": \{ "tokenId": (?:null|"[^"]*"), "treasury": (?:null|"[^"]*") \}(,?)$/m;
  const m = raw.match(line);
  if (!m) {
    throw new Error(
      'spec/pins.json: the stampToken["hedera:testnet"] line is not in the expected one-line form. ' +
        'Refusing to rewrite the file, because a re-serialisation would reformat every other pin.',
    );
  }
  const replaced = raw.replace(
    line,
    `${m[1]}"hedera:testnet": { "tokenId": "${next.tokenId}", "treasury": "${next.treasury}" }${m[2]}`,
  );
  fs.writeFileSync(file, replaced);
  return { kind: 'written', remainingNulls: countNulls(JSON.parse(replaced)) };
}

/** Read-only: how many pins are still unfilled, for the report. */
/**
 * The second narrow writer: one `registeredSchemas` entry, and nothing else.
 *
 * Like `pinStampToken`, it edits ONE LINE of the machine-readable file of record
 * and refuses to write if that line is not in its expected form. A reviewer must
 * be able to see that exactly one value moved — the rule Step 2 earned the hard
 * way. Its parameter type has no field for anything but a `schemaRef` and a
 * `sha256`, so it physically cannot write a topic id anywhere else.
 *
 * The line is found by string search rather than by a regular expression: the
 * form is fixed and known, and a search that does not find it fails loudly,
 * where a regex that is subtly wrong finds the wrong line quietly.
 */
export interface RegisteredSchemaPin {
  readonly schemaRef: string;
  readonly sha256: string;
}

export type SchemaPinOutcome =
  | { readonly kind: 'written'; readonly remainingNulls: number }
  | { readonly kind: 'already'; readonly remainingNulls: number }
  | { readonly kind: 'conflict'; readonly found: string };

export function pinRegisteredSchema(
  repoRoot: string,
  name: string,
  next: RegisteredSchemaPin,
): SchemaPinOutcome {
  const file = path.join(repoRoot, 'spec', 'pins.json');
  const text = fs.readFileSync(file, 'utf8');

  const key = `"${name}": {`;
  const start = text.indexOf(key);
  if (start < 0) throw new Error(`pins.json has no registeredSchemas entry for ${name}`);
  const end = text.indexOf('}', start);
  if (end < 0) throw new Error(`pins.json's ${name} entry is not one line in its expected form`);
  const found = text.slice(start, end + 1);

  const unfilled = `"${name}": { "schemaRef": null, "sha256": null }`;
  const filled = `"${name}": { "schemaRef": "${next.schemaRef}", "sha256": "${next.sha256}" }`;

  if (found === filled) return { kind: 'already', remainingNulls: unfilledPins(repoRoot) };
  if (found !== unfilled) return { kind: 'conflict', found };

  fs.writeFileSync(file, text.slice(0, start) + filled + text.slice(end + 1));
  return { kind: 'written', remainingNulls: unfilledPins(repoRoot) };
}

export function unfilledPins(repoRoot: string): number {
  return countNulls(JSON.parse(fs.readFileSync(path.join(repoRoot, 'spec', 'pins.json'), 'utf8')));
}
