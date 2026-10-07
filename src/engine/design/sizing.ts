/**
 * Sizing helpers used by the member modules: lightest passing size from an
 * ordered candidate list, longest passing span, and largest passing spacing.
 * Each helper runs the full member design for every trial, so the result is
 * always backed by a complete set of checks.
 */

export interface SizingRun {
  pass: boolean;
  governing: { name: string; ratio: number };
}

export interface SizingTrial<T, R extends SizingRun> {
  candidate: T;
  result?: R;
  error?: string;
}

export interface SizingOutcome<T, R extends SizingRun> {
  /** first passing candidate in list order (lists run lightest → heaviest) */
  chosen?: SizingTrial<T, R>;
  trials: SizingTrial<T, R>[];
}

/** Run each candidate in order and stop at the first that passes every check. */
export function firstPassing<T, R extends SizingRun>(candidates: readonly T[], run: (c: T) => R): SizingOutcome<T, R> {
  const trials: SizingTrial<T, R>[] = [];
  for (const candidate of candidates) {
    try {
      const result = run(candidate);
      const trial = { candidate, result };
      trials.push(trial);
      if (result.pass) return { chosen: trial, trials };
    } catch (e) {
      trials.push({ candidate, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { trials };
}

/**
 * Largest value in [lo, hi] for which the design passes, by bisection to the
 * given resolution (default 1 in. when the value is a span in ft), returned as
 * the largest multiple of the resolution that passes. Assumes the design fails
 * monotonically as the value grows. Returns undefined when even lo fails, and
 * hi when hi passes.
 */
export function maxPassing(
  run: (v: number) => SizingRun,
  lo: number,
  hi: number,
  resolution = 1 / 12,
): number | undefined {
  const ok = (v: number) => {
    try {
      return run(v).pass;
    } catch {
      return false;
    }
  };
  if (!ok(lo)) return undefined;
  if (ok(hi)) return hi;
  let a = lo;
  let b = hi;
  while (b - a > resolution) {
    const m = (a + b) / 2;
    if (ok(m)) a = m;
    else b = m;
  }
  // round down to the resolution, then step up while the next increment still passes
  let v = Math.floor(a / resolution + 1e-9) * resolution;
  while (v + resolution <= hi && ok(v + resolution)) v += resolution;
  return v;
}

/** Standard joist / rafter spacings, in. */
export const STANDARD_SPACINGS = [12, 16, 19.2, 24] as const;

/** Largest spacing from the list that passes (list in ascending order). */
export function maxPassingSpacing(
  run: (s: number) => SizingRun,
  spacings: readonly number[] = STANDARD_SPACINGS,
): number | undefined {
  let best: number | undefined;
  for (const s of spacings) {
    try {
      if (run(s).pass) best = s;
      else break;
    } catch {
      break;
    }
  }
  return best;
}
