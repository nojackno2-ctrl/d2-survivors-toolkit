// 輔助器輸入模組（頁內小模組）：所有按鍵一律由此送出，不再改寫遊戲的 walkTarget／steer。
// 傳輸優先序：
//   1. window.__d2input(JSON 字串)：由 editor/game-link.js 的 Runtime.addBinding 提供，Node 端會送出「受信任」的 CDP 輸入事件。
//      格式 {"t":"key","code":"ArrowRight","action":"down|up|press","hold":60}。
//   2. 退回 document.dispatchEvent(new KeyboardEvent(...))：事件 isTrusted === false，遊戲未必接受，diagnostics() 會標明「非受信任事件」。
// 遊戲移動只認鍵盤（方向鍵／WASD），所以移動被量化成 8 個方向。
// 全域：window.__d2inputKit。模組可重複載入（先 releaseAll 舊實例）。
(() => {
  "use strict";
  window.__d2inputKit?.destroy?.();

  const KEYS = { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight" };
  const KEY_NAME = { ArrowUp: "ArrowUp", ArrowDown: "ArrowDown", ArrowLeft: "ArrowLeft", ArrowRight: "ArrowRight", Escape: "Escape" };
  const DEADZONE = 0.2;              // 平滑後向量長度小於此值視為不動（輸入為單位向量時）
  const SMOOTH = 0.6;                // 新向量占比；1 = 不平滑
  const HYSTERESIS = 10 * Math.PI / 180; // 扇區邊界遲滯，避免按鍵在邊界抖動
  const OWN_WINDOW_MS = 400;         // 自己送出的 code 在此時間內視為自己的事件

  const held = new Set();            // 目前按住的 code
  const ownAt = new Map();           // code -> 最近一次由本模組送出的時間
  let sector = -1, sx = 0, sy = 0, lastVec = null, lastTransport = "none", sent = 0, destroyed = false;

  const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
  const hasBinding = () => typeof window.__d2input === "function";

  function transport(msg) {
    ownAt.set(msg.code, now());
    sent++;
    if (hasBinding()) {
      lastTransport = "cdp";
      try { window.__d2input(JSON.stringify(msg)); } catch { /* binding 已失效：下次再試 */ }
      return;
    }
    lastTransport = "synthetic";
    const c = String(msg.code), key = KEY_NAME[c] || (c.startsWith("Digit") ? c.slice(5) : c.startsWith("Numpad") && c.length === 7 ? c.slice(6) : c.startsWith("Key") && c.length === 4 ? c.slice(3).toLowerCase() : c);
    const init = { key, code: c, bubbles: true, cancelable: true, composed: true };
    const target = document.activeElement || document.body || document;
    if (msg.action === "down" || msg.action === "press") target.dispatchEvent(new KeyboardEvent("keydown", init));
    if (msg.action === "up") target.dispatchEvent(new KeyboardEvent("keyup", init));
    if (msg.action === "press") setTimeout(() => target.dispatchEvent(new KeyboardEvent("keyup", init)), Math.max(0, msg.hold || 0));
  }

  function down(code) { if (held.has(code)) return; held.add(code); transport({ t: "key", code, action: "down" }); }
  function up(code) { if (!held.has(code)) return; held.delete(code); transport({ t: "key", code, action: "up" }); }

  // 8 方向：扇區 0 = 右，順時針（遊戲座標 y 向下，所以 dy < 0 為上）。
  const SECTOR_KEYS = [["right"], ["right", "down"], ["down"], ["left", "down"], ["left"], ["left", "up"], ["up"], ["right", "up"]];
  const TAU = Math.PI * 2, STEP = TAU / 8;
  function sectorOf(angle, previous) {
    const a = ((angle % TAU) + TAU) % TAU;
    if (previous >= 0) { // 遲滯：仍在原扇區中心 ±(STEP/2 + HYSTERESIS) 內就維持
      let d = Math.abs(a - previous * STEP); d = Math.min(d, TAU - d);
      if (d <= STEP / 2 + HYSTERESIS) return previous;
    }
    return Math.round(a / STEP) % 8;
  }

  // 依移動向量設定按住的方向鍵；只在按鍵集合改變時才送 down／up。回傳目前扇區（-1 = 停止）。
  function setMoveDir(dx, dy, opts = {}) {
    if (destroyed) return -1;
    const deadzone = opts.deadzone ?? DEADZONE, smooth = opts.smooth ?? SMOOTH;
    lastVec = { dx: Math.round(dx * 10) / 10, dy: Math.round(dy * 10) / 10 };
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) { releaseMove(); return -1; }
    const n = Math.hypot(dx, dy);
    const ux = n > 1e-6 ? dx / n : 0, uy = n > 1e-6 ? dy / n : 0;
    sx = sx * (1 - smooth) + ux * smooth; sy = sy * (1 - smooth) + uy * smooth;
    if (n <= 1e-6 || Math.hypot(sx, sy) < deadzone) { releaseMove(); return -1; }
    sector = sectorOf(Math.atan2(sy, sx), sector);
    const want = new Set(SECTOR_KEYS[sector].map((k) => KEYS[k]));
    for (const code of Object.values(KEYS)) if (held.has(code) && !want.has(code)) up(code);
    for (const code of want) down(code);
    return sector;
  }
  function releaseMove() {
    for (const code of Object.values(KEYS)) up(code);
    sector = -1; sx = 0; sy = 0;
  }
  // 放開全部按住的鍵（離場、停止、頁面隱藏時呼叫）。
  function releaseAll() { for (const code of [...held]) up(code); sector = -1; sx = 0; sy = 0; }

  // 單次按鍵：ms 為按住毫秒數（預設 60）。藥水、Escape、選卡用。
  function press(code, ms = 60) {
    if (destroyed || !code) return false;
    transport({ t: "key", code, action: "press", hold: Math.max(0, Math.min(2000, Math.round(ms))) });
    return true;
  }

  // 是否為本模組送出的事件：CDP 事件 isTrusted === true，autobot 的 manual() 要靠這個辨識，不能把自己的輸入當成玩家操作。
  function isOwn(e) {
    const code = e?.code; if (!code) return false;
    const at = ownAt.get(code);
    return at !== undefined && now() - at <= OWN_WINDOW_MS;
  }

  function diagnostics() {
    const trusted = hasBinding();
    return { trusted, transport: lastTransport, note: trusted ? "受信任事件（CDP）" : "非受信任事件（後備：KeyboardEvent，遊戲可能不接受）", held: [...held], sector, sent, lastVec };
  }
  function destroy() {
    releaseAll(); destroyed = true;
    if (window.__d2inputKit === api) delete window.__d2inputKit;
  }

  const api = { setMoveDir, releaseMove, releaseAll, press, isOwn, held: () => [...held], diagnostics, destroy, sectorKeys: SECTOR_KEYS.map((k) => k.map((x) => KEYS[x])) };
  window.__d2inputKit = api;
  window.addEventListener("blur", releaseAll);
})();
