/**
 * Save a generated file.
 *  - Normal hosting: a browser download.
 *  - claude.ai Artifact viewer with the `downloads` capability: the viewer's save (the
 *    viewer confirms it).
 *  - Artifact viewer without it: pages cannot start downloads there, so the contents are
 *    copied to the clipboard and the message says what to paste them into.
 * The capability is resolved at start-up so a click can act synchronously (clipboard writes
 * need the click's user activation).
 */

type DownloadsNs = { save(r: { filename: string; data: string | Blob }): Promise<{ status: string }> };
type ClaudeWindow = Window & { claude?: { use?: (name: string) => Promise<unknown> } };

export type SaveOutcome = "saved" | "copied" | "declined" | "unavailable" | "error";

const inViewer = () => typeof window !== "undefined" && typeof (window as ClaudeWindow).claude?.use === "function";

let ns: DownloadsNs | null | undefined;
let nsPromise: Promise<DownloadsNs | null> | undefined;
/** Start resolving the viewer's downloads capability (call once at start-up). */
export function prepareDownloads(): Promise<DownloadsNs | null> {
  if (!inViewer()) return Promise.resolve(null);
  const w = window as ClaudeWindow;
  nsPromise ??= w.claude!.use!("downloads").then(
    (x) => (ns = (x as DownloadsNs | null) ?? null),
    () => (ns = null),
  );
  return nsPromise;
}

/** true when this view can hand over real files (download or viewer save). */
export const canDownload = () => !inViewer() || !!ns;

function copyText(text: string): Promise<boolean> {
  try {
    return navigator.clipboard.writeText(text).then(
      () => true,
      () => false,
    );
  } catch {
    return Promise.resolve(false);
  }
}

export async function saveFile(filename: string, data: string | Blob | Uint8Array, mime: string): Promise<SaveOutcome> {
  const blobOf = () => (data instanceof Blob ? data : new Blob([data as BlobPart], { type: mime }));
  if (inViewer()) {
    // capability already resolved: act inside the click; otherwise wait for it
    const cap = ns === undefined ? await prepareDownloads() : ns;
    if (cap) {
      try {
        await cap.save({ filename, data: typeof data === "string" ? data : blobOf() });
        return "saved";
      } catch (e) {
        const code = (e as { code?: string })?.code;
        if (code === "declined") return "declined";
        if (code === "rate_limited" || code === "bad_request") return "error";
      }
    }
    // binary files cannot go through the clipboard
    return typeof data === "string" && (await copyText(data)) ? "copied" : "unavailable";
  }
  const url = URL.createObjectURL(blobOf());
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return "saved";
}

/** Text for the message bar after a save attempt. */
export function saveMessage(filename: string, outcome: SaveOutcome): { tone: "info" | "error"; text: string } {
  switch (outcome) {
    case "saved":
      return { tone: "info", text: `Saved ${filename}.` };
    case "copied":
      return {
        tone: "info",
        text: `This view cannot save files, so the contents were copied to the clipboard — paste them into a plain-text editor and save as ${filename}.`,
      };
    case "declined":
      return { tone: "info", text: `Save of ${filename} cancelled.` };
    default:
      return {
        tone: "error",
        text: `Could not save or copy ${filename} in this view — open HouseCalc from a regular web host to save files.`,
      };
  }
}
