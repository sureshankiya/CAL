/**
 * Released engine and data-library versions (PLAN.md §12.1). The hashes are
 * fingerprints of the calculation sources, injected at build time by
 * scripts/fingerprint.mjs; src/engine/lock.json records the hashes each
 * released version was locked with. A build whose sources differ from the
 * lock prints "UNLOCKED" on every sheet.
 */

declare const __ENGINE_HASH__: string;
declare const __DATA_HASH__: string;
declare const __VERSION_LOCKED__: boolean;
declare const __LOCKED_ON__: string;

export const ENGINE_VERSION = "1.0.1-wip.5";
export const DATA_VERSION = "1.1-wip.5";

const defined = <T>(get: () => T, fallback: T): T => {
  try {
    return get();
  } catch {
    return fallback;
  }
};

export const ENGINE_HASH: string = defined(() => __ENGINE_HASH__, "dev");
export const DATA_HASH: string = defined(() => __DATA_HASH__, "dev");
export const VERSION_LOCKED: boolean = defined(() => __VERSION_LOCKED__, false);
export const LOCKED_ON: string = defined(() => __LOCKED_ON__, "");

export interface SoftwareStamp {
  engine: string;
  engineHash: string;
  data: string;
  dataHash: string;
  locked: boolean;
}

export const softwareStamp = (): SoftwareStamp => ({
  engine: ENGINE_VERSION,
  engineHash: ENGINE_HASH,
  data: DATA_VERSION,
  dataHash: DATA_HASH,
  locked: VERSION_LOCKED,
});

/** One-line text for the sheet footer and the cover. */
export function softwareText(cycleId: string): string {
  const lock = VERSION_LOCKED ? `locked ${LOCKED_ON}` : "UNLOCKED build — not for issue";
  return `HouseCalc engine ${ENGINE_VERSION} (${ENGINE_HASH}); data library ${cycleId}-cycle v${DATA_VERSION} (${DATA_HASH}); ${lock}`;
}

/** Differences between the software a project file was saved with and this build. */
export function stampDifferences(saved: SoftwareStamp | undefined, now = softwareStamp()): string[] {
  if (!saved) return [];
  const out: string[] = [];
  if (saved.engine !== now.engine || saved.engineHash !== now.engineHash)
    out.push(
      `engine ${saved.engine} (${saved.engineHash}) when saved; this build is ${now.engine} (${now.engineHash})`,
    );
  if (saved.data !== now.data || saved.dataHash !== now.dataHash)
    out.push(
      `data library v${saved.data} (${saved.dataHash}) when saved; this build is v${now.data} (${now.dataHash})`,
    );
  return out;
}
