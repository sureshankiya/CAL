// HouseCalc desktop: a native window around the static build (dist-static/). Calculations,
// sheets, PDF / Word export and project files all run locally, offline.
const { app, BrowserWindow, shell } = require("electron");
const path = require("node:path");

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    title: "HouseCalc",
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  win.loadFile(path.join(__dirname, "..", "dist-static", "index.html"));
  // links open in the system browser, never inside the app window
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith("file:")) {
      e.preventDefault();
      if (/^https?:/.test(url)) shell.openExternal(url);
    }
  });
}

// one window: a second launch focuses the first, so autosave never races between two copies
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => BrowserWindow.getAllWindows()[0]?.focus());
  app.whenReady().then(createWindow);
  app.on("activate", () => BrowserWindow.getAllWindows().length || createWindow());
  app.on("window-all-closed", () => process.platform === "darwin" || app.quit());
}
