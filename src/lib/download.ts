/**
 * Save a generated file. Inside the claude.ai Artifact viewer the page cannot start a
 * download itself: the file goes through the viewer's `downloads` capability (the viewer
 * confirms the save). Elsewhere a normal browser download is used.
 */

type DownloadsNs = { save(r: { filename: string; data: string | Blob }): Promise<{ status: string }> };
type ClaudeWindow = Window & { claude?: { use?: (name: string) => Promise<unknown> } };

export type SaveOutcome = "saved" | "declined" | "unavailable" | "error";

let nsPromise: Promise<DownloadsNs | null> | undefined;
function downloadsNs(): Promise<DownloadsNs | null> {
  const use = (window as ClaudeWindow).claude?.use;
  if (typeof use !== "function") return Promise.resolve(null);
  nsPromise ??= use.call((window as ClaudeWindow).claude, "downloads").then(
    (ns) => (ns as DownloadsNs | null) ?? null,
    () => null,
  );
  return nsPromise;
}

export async function saveFile(filename: string, data: string | Blob, mime: string): Promise<SaveOutcome> {
  const ns = await downloadsNs();
  if (ns) {
    try {
      await ns.save({ filename, data });
      return "saved";
    } catch (e) {
      const code = (e as { code?: string })?.code;
      return code === "declined"
        ? "declined"
        : code === "rate_limited" || code === "bad_request"
          ? "error"
          : "unavailable";
    }
  }
  const blob = typeof data === "string" ? new Blob([data], { type: mime }) : data;
  const url = URL.createObjectURL(blob);
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
  if (outcome === "saved") return { tone: "info", text: `Saved ${filename}.` };
  if (outcome === "declined") return { tone: "info", text: `Save of ${filename} cancelled.` };
  return {
    tone: "error",
    text: `Could not save ${filename} in this view — use Copy, or open HouseCalc from a regular web host.`,
  };
}
