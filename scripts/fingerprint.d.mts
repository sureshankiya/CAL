export function fingerprint(root: string): { engine: string; data: string };
export function readVersions(root: string): { engine: string; data: string };
export function readLock(root: string):
  | {
      engine: { version: string; hash: string };
      data: { version: string; hash: string };
      lockedOn: string;
      history: { engine: string; engineHash: string; data: string; dataHash: string; lockedOn: string }[];
    }
  | undefined;
export function buildDefines(root: string): Record<string, string>;
