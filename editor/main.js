const electron = require("electron");
const { app, BrowserWindow, ipcMain, shell, dialog, Menu } = electron;
const { createShellExtras } = require("./shell-extras");
const fs = require("fs");
const path = require("path");
const core = require("./core");
const engine = require("./engine");
const paths = require("./paths");
const { GameLink } = require("./game-link");
const { createLauncherApi } = require("./launcher-api");

const gameLink = new GameLink();
const launcher = createLauncherApi({ gameLink, core, engine, paths, userDataDir: app.getPath("userData") });

// 獨立桌面應用：介面、引擎資源與字典都從本機隨附檔案讀取（paths.js），不依賴遠端網站。
const mode = (m) => (m === "hardcore" ? "hardcore" : "softcore");
const safeName = (f) => {
  if (typeof f !== "string" || f !== path.basename(f) || !/\.json$/i.test(f)) throw new Error("備份檔名不正確。");
  return f;
};
const wrap = (fn) => async (_e, ...args) => {
  try {
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
  const game = JSON.parse(paths.readAssetText("modifier/gamedata.json"));
  try { return { dict: JSON.parse(paths.readAssetText("lang/zh-TW.json")), game }; }
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
  void loadPage("editor");
  return { ok: true };
}));
ipcMain.handle("openGuard", wrap((m) => {
  void loadPage("guard", m ? { mode: mode(m) } : undefined);
  return { ok: true };
}));
// 遊戲控制台：頁面只能傳 withHelper／switches，執行檔路徑、資料夾、注入來源都由主程序決定
const PAGES = new Set(["launcher", "editor", "guard"]);
ipcMain.handle("launchGame", wrap((opts) => launcher.launchGame(opts)));
ipcMain.handle("gameStatus", wrap(() => launcher.gameStatus()));
ipcMain.handle("startHelper", wrap((opts) => launcher.startHelper(opts)));
ipcMain.handle("stopHelper", wrap(() => launcher.stopHelper()));
ipcMain.handle("helperSettings", wrap(() => launcher.helperSettings()));
ipcMain.handle("helperSet", wrap((p, v) => launcher.helperSet(p, v)));
ipcMain.handle("helperLive", wrap(() => launcher.helperLive()));
ipcMain.handle("langStatus", wrap(() => launcher.langStatus()));
ipcMain.handle("langApply", wrap(() => launcher.langApply()));
ipcMain.handle("langRestore", wrap(() => launcher.langRestore()));
ipcMain.handle("openPage", wrap((target) => {
  if (!PAGES.has(target)) throw new Error("不支援的頁面。");
  void loadPage(target);
  return { ok: true };
}));

const isWeb = (url) => /^https?:/i.test(url);
function loadPage(target = "editor", opts) {
  if (!win || win.isDestroyed()) return Promise.resolve();
  return win.loadURL(paths.pageUrl(target, opts));
}

function createMainWindow() {
  win = new BrowserWindow({
    width: 1240,
    height: 880,
    title: en() ? "D2 Survivors Toolkit" : "D2倖存者工具包",
    backgroundColor: "#14110d",
    autoHideMenuBar: false,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  // 頁面只能停留在隨附的本機頁面；其他外部連結交給系統瀏覽器
  win.webContents.on("will-navigate", (e, url) => {
    if (String(url).startsWith("file://")) return;
    e.preventDefault();
    if (isWeb(url)) shell.openExternal(url);
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isWeb(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.on("close", (e) => { if (!quitting && gameLink.running) { e.preventDefault(); win.hide(); } });
  win.on("closed", () => { win = null; if (!quitting && !gameLink.running) { quitting = true; app.quit(); } }); // 遊戲沒在跑時關閉主視窗＝離開（浮窗不該讓程序殘留）
  loadPage("launcher");
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: en() ? "Game Console" : "遊戲控制台", click: () => loadPage("launcher") },
    { label: en() ? "Save Editor" : "存檔修改器", click: () => loadPage("editor") },
    { label: en() ? "Save Check & Guard" : "存檔檢查與防護", click: () => loadPage("guard") },
  ]));
  createMainWindow();
  // 電腦端功能：系統匣、全域快捷鍵、狀態浮窗（遊戲執行中關閉主視窗會縮到系統匣，由匣圖示的「離開」結束）
  extras = createShellExtras({
    electron, launcher, gameLink,
    showConsole: () => { if (!win || win.isDestroyed()) createMainWindow(); if (win.isMinimized()) win.restore(); win.show(); win.focus(); },
    quit: () => { quitting = true; app.quit(); },
    log: (t) => { try { console.warn("[shell]", t); } catch {} },
  });
  const r = extras.start();
  console.log("[shell] 已註冊快捷鍵：" + r.registered.join(", "));
});
let extras = null, quitting = false;
app.on("will-quit", () => { try { extras?.stop(); } catch {} });
app.on("before-quit", () => { quitting = true; });
app.on("window-all-closed", () => app.quit());
