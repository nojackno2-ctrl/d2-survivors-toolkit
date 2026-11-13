const { app, BrowserWindow, ipcMain, shell, dialog, Menu } = require("electron");
const fs = require("fs");
const path = require("path");
const core = require("./core");
const engine = require("./engine");
const remote = require("./remote");

// 啟動器：介面、引擎資源都從 GitHub Pages 載入（remote.js），這個 exe 只負責本機存檔讀寫與物品引擎。
const mode = (m) => (m === "hardcore" ? "hardcore" : "softcore");
const safeName = (f) => {
  if (typeof f !== "string" || f !== path.basename(f) || !/\.json$/i.test(f)) throw new Error("備份檔名不正確。");
  return f;
};
// 只處理工具包網站頁面發出的呼叫（頁面是遠端載入的，不能讓任何網頁碰到本機檔案）
const wrap = (fn) => async (e, ...args) => {
  try {
    if (!remote.trusted(e.senderFrame?.url)) throw new Error("不允許的呼叫來源。");
    return await fn(...args);
  } catch (err) {
    return { error: err.message };
  }
};
const checkSave = (save) => {
  if (typeof save !== "object" || !save || typeof save.version !== "number") throw new Error("存檔格式不正確。");
};
let win;
const en = () => !app.getLocale().toLowerCase().startsWith("zh");

ipcMain.handle("load", wrap((m) => core.load(mode(m))));
ipcMain.handle("save", wrap(async (m, save) => {
  checkSave(save);
  return { ok: true, bytes: await core.store(mode(m), save) };
}));
ipcMain.handle("assets", wrap(() => core.assets()));
ipcMain.handle("engine", wrap((fn, ...args) => {
  // 函式名稱會直接代入引擎頁面執行，只接受合法識別字，其餘由引擎頁面判定是否存在
  if (typeof fn !== "string" || !/^[A-Za-z_]\w*$/.test(fn)) throw new Error("不支援的操作");
  return engine.call(fn, ...args);
}));
ipcMain.handle("i18n", wrap(async () => {
  const game = JSON.parse(await remote.text("modifier/gamedata.json"));
  try { return { dict: JSON.parse(await remote.text("lang/zh-TW.json")), game }; }
  catch { return { dict: {}, game, missing: true }; }
}));
ipcMain.handle("openBackups", wrap(() => {
  fs.mkdirSync(core.BACKUP_DIR, { recursive: true });
  return shell.openPath(core.BACKUP_DIR);
}));
ipcMain.handle("diag", wrap(() => core.diag()));
ipcMain.handle("traces", wrap((m, remove) => core.traces(mode(m), !!remove)));
ipcMain.handle("listBackups", wrap(() => core.listBackups()));
ipcMain.handle("readBackup", wrap((f) => ({ save: core.readBackup(safeName(f)) })));
ipcMain.handle("deleteBackup", wrap((f) => (core.deleteBackup(safeName(f)), { ok: true })));
ipcMain.handle("snapshot", wrap((save, label) => (checkSave(save), core.snapshot(save, label), { ok: true })));
ipcMain.handle("exportSave", wrap(async (save) => {
  checkSave(save);
  const r = await dialog.showSaveDialog(win, { title: en() ? "Export save" : "匯出存檔", defaultPath: en() ? "D2Survivors-save.json" : "D2倖存者存檔.json", filters: [{ name: en() ? "Save" : "存檔", extensions: ["json"] }] });
  if (r.canceled) return { canceled: true };
  core.writeFile(r.filePath, save);
  return { ok: true, path: r.filePath };
}));
ipcMain.handle("importSave", wrap(async () => {
  const r = await dialog.showOpenDialog(win, { title: en() ? "Import save" : "匯入存檔", filters: [{ name: en() ? "Save" : "存檔", extensions: ["json"] }], properties: ["openFile"] });
  if (r.canceled) return { canceled: true };
  const save = core.readFile(r.filePaths[0]);
  checkSave(save);
  return { save, path: r.filePaths[0] };
}));
ipcMain.handle("guardStatus", wrap(() => core.guardStatus()));
ipcMain.handle("saveMode", wrap(() => core.saveMode()));
ipcMain.handle("setSaveMode", wrap(() => core.setSaveMode()));
ipcMain.handle("close", wrap(() => {
  void loadPage(remote.PAGE);
  return { ok: true };
}));
ipcMain.handle("openGuard", wrap((m) => {
  void loadPage(remote.GUARD_PAGE, m ? { mode: mode(m) } : undefined);
  return { ok: true };
}));

const isWeb = (url) => /^https?:/i.test(url);
function openOffline(err, target = remote.PAGE) {
  const page = target.replace(/"/g, "&quot;");
  const html = `<!doctype html><meta charset="utf-8"><body style="background:#14110d;color:#e8dcc0;font-family:sans-serif;padding:24px">
<h2>無法載入工具包</h2><p>${en() ? "Cannot load the toolkit from GitHub." : "無法從 GitHub 載入工具包，請檢查網路後重試。"}</p>
<p style="color:#9d8f73">${String(err.message).replace(/</g, "&lt;")}</p><p><a style="color:#e8c46a" href="${page}">重新載入 / Retry</a></p></body>`;
  return win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
}
function loadPage(target = remote.PAGE, opts) {
  const base = target === "guard" || target === remote.GUARD_PAGE ? remote.GUARD_PAGE : remote.PAGE;
  return win.loadURL(remote.pageUrl(base, opts)).catch((err) => openOffline(err, base));
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: en() ? "Save Editor" : "存檔修改器", click: () => loadPage(remote.PAGE) },
    { label: en() ? "Save Check & Guard" : "存檔檢查與防護", click: () => loadPage(remote.GUARD_PAGE) },
  ]));
  win = new BrowserWindow({
    width: 1240,
    height: 880,
    title: en() ? "D2 Survivors Toolkit" : "D2倖存者工具包",
    backgroundColor: "#14110d",
    autoHideMenuBar: false,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  // 頁面只能停留在工具包網站；其他連結交給系統瀏覽器
  win.webContents.on("will-navigate", (e, url) => {
    if (remote.trusted(url)) return;
    e.preventDefault();
    if (isWeb(url)) shell.openExternal(url);
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isWeb(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  // ?v= 避開 Pages 約 10 分鐘的快取，避免舊的修改器頁面搭配新的引擎檔
  loadPage(remote.PAGE);
});
app.on("window-all-closed", () => app.quit());
