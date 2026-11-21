// 桌面應用的電腦端功能：系統匣圖示、全域快捷鍵、遊戲狀態浮窗。
// 不依賴 electron 的具體模組（由 main.js 傳入），方便以假物件做單元測試。
// 快捷鍵（全域，遊戲在前景也有效）：
//   Ctrl+Alt+F9  開關「自動戰鬥」      Ctrl+Alt+F10 開關「戰鬥輔助」
//   Ctrl+Alt+F11 顯示／隱藏狀態浮窗   Ctrl+Alt+F12 緊急停止（放開所有按鍵、關閉兩個總開關）
//   Ctrl+Alt+F8  顯示遊戲控制台
const HOTKEYS = {
  auto: "Control+Alt+F9",
  assist: "Control+Alt+F10",
  overlay: "Control+Alt+F11",
  panic: "Control+Alt+F12",
  console: "Control+Alt+F8",
};

function createShellExtras({ electron, launcher, gameLink, showConsole, quit, log = () => {} }) {
  const { Tray, Menu, globalShortcut, BrowserWindow, nativeImage } = electron;
  let tray = null, overlay = null, timer = null, overlayVisible = true;
  const registered = [];

  // 16x16 金色方塊（避免另外打包圖檔）
  function makeIcon() {
    const size = 16, buf = Buffer.alloc(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4, edge = x === 0 || y === 0 || x === size - 1 || y === size - 1;
      const c = edge ? [0x2a, 0x20, 0x14] : [0x2e, 0xa8, 0xd4]; // BGR：金色
      buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; buf[i + 3] = 255;
    }
    return nativeImage.createFromBitmap(buf, { width: size, height: size });
  }

  async function toggle(settingPath) {
    const st = await gameLink.helperSettings().catch(() => null);
    if (!st) return { ok: false, reason: "輔助器未注入" };
    const cur = settingPath.split(".").reduce((o, k) => (o == null ? o : o[k]), st);
    const ok = await gameLink.helperSet(settingPath, !cur);
    return { ok: !!ok, value: !cur };
  }

  async function panic() {
    // 先放開按鍵，再關兩個總開關；即使 CDP 已斷線也不拋錯
    try { await gameLink.evaluate("window.__d2inputKit&&window.__d2inputKit.releaseAll()"); } catch { /* 忽略 */ }
    for (const p of ["progressEnabled", "enabled"]) { try { await gameLink.helperSet(p, false); } catch { /* 忽略 */ } }
    log("緊急停止");
    return { ok: true };
  }

  function overlayText(live, status) {
    if (!status.running) return "遊戲未執行";
    if (!status.attached) return "遊戲執行中（未連線）";
    if (!live) return "已連線｜輔助器未注入";
    const on = (b) => (b ? "開" : "關");
    return [`輔助 ${on(live.enabled)}｜自動戰鬥 ${on(live.auto)}｜${live.state || "?"}`, `Lv${live.level ?? "?"}　HP ${live.hp ?? "?"}`, live.action || "", `上傳攔截 ${status.stubHits}`].filter(Boolean).join("\n");
  }

  async function refreshOverlay() {
    if (!overlay || overlay.isDestroyed?.()) return;
    const status = gameLink.status();
    let live = null;
    if (status.attached) live = await gameLink.helperLive().catch(() => null);
    const text = overlayText(live, status);
    try { await overlay.webContents.executeJavaScript(`document.getElementById("t").textContent=${JSON.stringify(text)}`); } catch { /* 視窗關閉中 */ }
    const shouldShow = overlayVisible && status.running;
    if (shouldShow && !overlay.isVisible()) overlay.showInactive();
    if (!shouldShow && overlay.isVisible()) overlay.hide();
  }

  function createOverlay() {
    overlay = new BrowserWindow({
      width: 270, height: 92, x: 12, y: 12, frame: false, transparent: false, resizable: false, focusable: false,
      alwaysOnTop: true, skipTaskbar: true, show: false, backgroundColor: "#14110d",
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    overlay.setIgnoreMouseEvents?.(true); // 不擋遊戲的滑鼠
    overlay.setAlwaysOnTop?.(true, "screen-saver");
    const html = '<!doctype html><meta charset="utf-8"><body style="margin:0;padding:6px 8px;background:#14110d;color:#e8dcc4;font:12px/1.5 \'Microsoft JhengHei\',sans-serif;white-space:pre;border:1px solid #d4a84a;opacity:.92"><div id="t">…</div>';
    overlay.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
  }

  function buildMenu() {
    return Menu.buildFromTemplate([
      { label: "顯示遊戲控制台", click: () => showConsole() },
      { label: "啟動遊戲（含輔助器）", click: () => { launcher.launchGame({ withHelper: true }).catch((e) => log("啟動失敗：" + e.message)); } },
      { label: "開關自動戰鬥　Ctrl+Alt+F9", click: () => toggle("progressEnabled") },
      { label: "開關戰鬥輔助　Ctrl+Alt+F10", click: () => toggle("enabled") },
      { label: "顯示／隱藏狀態浮窗　Ctrl+Alt+F11", click: () => { overlayVisible = !overlayVisible; refreshOverlay(); } },
      { label: "緊急停止　Ctrl+Alt+F12", click: () => panic() },
      { type: "separator" },
      { label: "離開", click: () => quit() },
    ]);
  }

  function start() {
    tray = new Tray(makeIcon());
    tray.setToolTip("D2倖存者工具包");
    tray.setContextMenu(buildMenu());
    tray.on?.("click", () => showConsole());
    const bind = (key, fn) => { try { if (globalShortcut.register(key, fn)) registered.push(key); else log("快捷鍵註冊失敗（被其他程式占用）：" + key); } catch (e) { log("快捷鍵錯誤 " + key + "：" + e.message); } };
    bind(HOTKEYS.auto, () => toggle("progressEnabled"));
    bind(HOTKEYS.assist, () => toggle("enabled"));
    bind(HOTKEYS.overlay, () => { overlayVisible = !overlayVisible; refreshOverlay(); });
    bind(HOTKEYS.panic, () => panic());
    bind(HOTKEYS.console, () => showConsole());
    createOverlay();
    timer = setInterval(refreshOverlay, 1000);
    timer.unref?.();
    return { registered: [...registered] };
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
    for (const k of registered.splice(0)) { try { globalShortcut.unregister(k); } catch { /* 忽略 */ } }
    if (tray) { tray.destroy?.(); tray = null; }
    if (overlay && !overlay.isDestroyed?.()) overlay.destroy?.();
    overlay = null;
  }

  return { start, stop, toggle, panic, overlayText, refreshOverlay, HOTKEYS };
}

module.exports = { createShellExtras, HOTKEYS };
