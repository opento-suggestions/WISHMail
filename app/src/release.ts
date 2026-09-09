/**
 * What this release declares, and what it claims.
 *
 * §1.5: "A release that claims conformance MUST publish a conformance claim
 * naming: the specification version; each class claimed; the resolution
 * profiles claimed per class; the pinned revisions (§1.6) tested against; and
 * the conformance-suite version and date of the passing run." And then the
 * sentence that governs this file: "A claim is scoped to the classes, profiles,
 * and pins it names. **Silence claims nothing.**"
 *
 * So this declares the specification version and claims nothing else. Not
 * modesty — accuracy. `conformance/` holds 86 test files and none is expanded;
 * `spec/pins.json` carries thirty unfilled pins, and T-P9-2 refuses a report
 * while any is null. A class named here would be a claim §1.5 forbids
 * (T-P15-3), and the tool bodies all return NOT_IMPLEMENTED.
 *
 * Conformance: T-P15-1, T-P15-3.
 */

/** §1.4's four classes. */
export type ConformanceClass = 'VERIFIER' | 'CORRESPONDENT' | 'RECIPIENT' | 'POSTMASTER';

/** §9's profile identifiers, and §16's extension profile. */
export type ProfileId = 'hcs14' | 'dns' | 'nanda' | 'hol';

export interface Release {
  /** The specification version this release is built against (§1.7). */
  readonly spec: string;
  /** The minor version the wire carries. A patch never changes it (§1.7). */
  readonly minorVersion: string;
  /** Classes claimed. Empty: silence claims nothing (§1.5). */
  readonly classes: readonly ConformanceClass[];
  /** Profiles claimed, per class (§1.4). */
  readonly profiles: Readonly<Partial<Record<ConformanceClass, readonly ProfileId[]>>>;
  /** Extensions claimed (§16.1). The five extension tests bind only a release that names one. */
  readonly extensions: readonly string[];
}

export const RELEASE: Release = {
  spec: '0.5.8',
  minorVersion: '0.5',
  classes: [],
  profiles: {},
  extensions: [],
};

/** Whether this release claims any class at all. */
export function claimsAnything(release: Release = RELEASE): boolean {
  return release.classes.length > 0;
}
