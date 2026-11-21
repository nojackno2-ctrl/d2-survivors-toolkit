// shell-extras 單元測試（假 electron 物件，不開視窗）
const test = require("node:test"), assert = require("node:assert/strict");
const { createShellExtras, HOTKEYS } = require("../shell-extras");

function fakes() {
  const reg = new Map(), calls = [], windows = [];
  const electron = {
    Tray: class { constructor() { calls.push("tray"); } setToolTip() {} setContextMenu(m) { this.menu = m; } on() {} destroy() { calls.push("tray.destroy"); } },
    Menu: { buildFromTemplate: (t) => ({ items: t }) },
    nativeImage: { createFromBitmap: (b, o) => ({ size: b.length, ...o }) },
    globalShortcut: { register: (k, f) => { reg.set(k, f); return true; }, unregister: (k) => reg.delete(k) },
    BrowserWindow: class { constructor(o) { this.o = o; this.text = ""; this.visible = false; windows.push(this); this.webContents = { executeJavaScript: async (s) => { this.text = s; } }; } setIgnoreMouseEvents() {} setAlwaysOnTop() {} loadURL() {} isVisible() { return this.visible; } showInactive() { this.visible = true; } hide() { this.visible = false; } isDestroyed() { return false; } destroy() { calls.push("overlay.destroy"); } },
  };
  const settings = { enabled: true, progressEnabled: false };
  const sets = [], evals = [];
  const gameLink = {
    status: () => ({ running: true, attached: true, stubHits: 2 }),
    helperSettings: async () => ({ ...settings }),
    helperSet: async (p, v) => { sets.push([p, v]); settings[p] = v; return true; },
    helperLive: async () => ({ state: "playing", level: 12, hp: "100/100", action: "全圖走位", enabled: true, auto: true }),
    evaluate: async (e) => { evals.push(e); },
  };
  return { electron, reg, calls, windows, gameLink, sets, evals, settings };
}

test("start 註冊五個快捷鍵、建立匣圖示與浮窗，stop 全部釋放", () => {
  const f = fakes(); let shown = 0;
  const x = createShellExtras({ electron: f.electron, launcher: {}, gameLink: f.gameLink, showConsole: () => shown++, quit: () => {} });
  const r = x.start();
  assert.deepEqual(new Set(r.registered), new Set(Object.values(HOTKEYS)));
  assert.equal(f.windows.length, 1); assert.equal(f.windows[0].o.alwaysOnTop, true); assert.equal(f.windows[0].o.focusable, false);
  f.reg.get(HOTKEYS.console)(); assert.equal(shown, 1);
  x.stop(); assert.equal(f.reg.size, 0); assert.ok(f.calls.includes("tray.destroy")); assert.ok(f.calls.includes("overlay.destroy"));
});

test("快捷鍵開關自動戰鬥／戰鬥輔助（切換目前值）", async () => {
  const f = fakes();
  const x = createShellExtras({ electron: f.electron, launcher: {}, gameLink: f.gameLink, showConsole() {}, quit() {} }); x.start();
  await f.reg.get(HOTKEYS.auto)(); await f.reg.get(HOTKEYS.assist)();
  assert.deepEqual(f.sets, [["progressEnabled", true], ["enabled", false]]);
});

test("緊急停止：先放開按鍵再關兩個總開關，連線失敗也不拋錯", async () => {
  const f = fakes();
  const x = createShellExtras({ electron: f.electron, launcher: {}, gameLink: f.gameLink, showConsole() {}, quit() {} });
  await x.panic();
  assert.match(f.evals[0], /releaseAll/); assert.deepEqual(f.sets, [["progressEnabled", false], ["enabled", false]]);
  f.gameLink.evaluate = async () => { throw new Error("cdp closed"); }; f.gameLink.helperSet = async () => { throw new Error("cdp closed"); };
  assert.deepEqual(await x.panic(), { ok: true });
});

test("浮窗文字依狀態顯示，快捷鍵重複註冊失敗不崩潰", async () => {
  const f = fakes(); f.electron.globalShortcut.register = () => false;
  const logs = []; const x = createShellExtras({ electron: f.electron, launcher: {}, gameLink: f.gameLink, showConsole() {}, quit() {}, log: (t) => logs.push(t) });
  assert.deepEqual(x.start().registered, []); assert.ok(logs.length >= 5);
  assert.equal(x.overlayText(null, { running: false }), "遊戲未執行");
  assert.match(x.overlayText({ state: "playing", level: 3, hp: "1/2", enabled: true, auto: false, action: "走位" }, { running: true, attached: true, stubHits: 1 }), /Lv3[\s\S]*上傳攔截 1/);
  await x.refreshOverlay(); assert.match(f.windows[0].text, /全圖走位/); assert.equal(f.windows[0].visible, true);
});
