/**
 * One template, three readers (D-162).
 *
 * `sentences.json` beside this file is the template; this is the renderer. The
 * three readers are:
 *
 *   1. the process log, written as each consensus fact lands — the LIVE surface,
 *      because goose renders tool-call cards and final payloads and does not
 *      render `notifications/progress`;
 *   2. the text block a tool returns beside its structured result — the
 *      RETROSPECTIVE surface, the same lines in the same order;
 *   3. `narrate()`'s sentences over an `EvidenceBundle` — what a stranger reads
 *      about a correspondence it had no part in.
 *
 * Same sentence, three readers, and that is the whole point: a reader who saw
 * only the log and a reader who saw only the narrative must not come away with
 * different facts. Two spellings of a sentence is two places for it to start
 * claiming something the specification does not permit — and §2.3 reserves
 * *delivery* for the lane while §11.8 forbids turning silence into refusal, so
 * what these sentences may not say matters more than what they do.
 *
 * A MISSING PLACEHOLDER IS AN ERROR AND NOT A HOLE. `line()` throws where a
 * template names a field the caller did not supply, so a sentence with `{lane}`
 * in the middle of it can never reach a log or a narrative.
 *
 * Conformance: T-P3-4.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

let cache: Readonly<Record<string, string>> | undefined;

/** The template file, read once. */
export function sentences(): Readonly<Record<string, string>> {
  if (cache !== undefined) return cache;
  const raw = JSON.parse(fs.readFileSync(path.join(here, 'sentences.json'), 'utf8')) as Record<string, unknown>;
  delete raw['_readme'];
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v !== 'string') throw new Error(`sentences.json: ${k} is not a sentence`);
    out[k] = v;
  }
  cache = out;
  return out;
}

export type Fields = Readonly<Record<string, string | number | boolean>>;

/** One sentence, from the template, with every placeholder filled. */
export function line(key: string, fields: Fields = {}): string {
  const template = sentences()[key];
  if (template === undefined) throw new Error(`sentences.json has no sentence named ${key}`);
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (_m, name: string) => {
    const v = fields[name];
    if (v === undefined) throw new Error(`the sentence ${key} names {${name}} and the caller supplied no value for it`);
    return String(v);
  });
}

/**
 * Every key the template defines, so a check can assert that the callers and
 * the file agree in both directions — a sentence nobody renders is as much a
 * drift as a caller with no sentence.
 */
export function sentenceKeys(): readonly string[] {
  return Object.keys(sentences()).sort();
}
