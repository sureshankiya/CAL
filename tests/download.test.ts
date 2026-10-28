/** saveFile in the claude.ai viewer: an extension the viewer refuses is saved inside a zip. */

import { describe, expect, it } from "vitest";
import JSZip from "jszip";

describe("saveFile — viewer allowlist fallback", () => {
  it("re-offers a refused .dxf as <name>.dxf.zip containing the file", async () => {
    const calls: Array<{ filename: string; data: string | Blob }> = [];
    const cap = {
      async save(r: { filename: string; data: string | Blob }) {
        calls.push(r);
        if (r.filename.endsWith(".dxf")) throw { code: "rejected_extension", message: "no" };
        return { status: "saved" };
      },
    };
    (globalThis as { window?: unknown }).window = { claude: { use: async () => cap } };
    const { saveFile, saveMessage } = await import("@/lib/download");
    expect(await saveFile("job-schedules.dxf", "0\nEOF\n", "application/dxf")).toBe("zipped");
    expect(calls.map((c) => c.filename)).toEqual(["job-schedules.dxf", "job-schedules.dxf.zip"]);
    const zip = await JSZip.loadAsync(await (calls[1].data as Blob).arrayBuffer());
    expect(await zip.file("job-schedules.dxf")!.async("string")).toBe("0\nEOF\n");
    expect(saveMessage("job-schedules.dxf", "zipped").text).toMatch(/\.dxf\.zip/);
    delete (globalThis as { window?: unknown }).window;
  });
});
