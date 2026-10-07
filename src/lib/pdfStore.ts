/**
 * Drawing files are kept in this browser only: an in-memory cache plus
 * IndexedDB when available. The project file stores drawing metadata, so a
 * project opened elsewhere asks for the PDF again. Every storage access is
 * guarded — the viewer still works for the current session without it.
 */

const memory = new Map<string, ArrayBuffer>();
const DB = "housecalc-drawings";
const STORE = "pdf";

function openDb(): Promise<IDBDatabase | undefined> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

export async function putPdf(id: string, data: ArrayBuffer): Promise<void> {
  memory.set(id, data);
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(data, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function getPdf(id: string): Promise<ArrayBuffer | undefined> {
  const m = memory.get(id);
  if (m) return m;
  const db = await openDb();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get(id);
      req.onsuccess = () => {
        const v = req.result as ArrayBuffer | undefined;
        if (v) memory.set(id, v);
        resolve(v);
      };
      req.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

export async function deletePdf(id: string): Promise<void> {
  memory.delete(id);
  const db = await openDb();
  if (!db) return;
  try {
    db.transaction(STORE, "readwrite").objectStore(STORE).delete(id);
  } catch {
    /* storage unavailable */
  }
}

/** Load pdf.js on demand (browser only) with its worker. */
export async function loadPdfJs() {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  }
  return pdfjs;
}
