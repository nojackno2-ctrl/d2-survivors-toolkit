// D2 倖存者工具包 — 防護與存檔檢查核心模組（guard/guard.js）
// 負責：
// 1. 強制攔截並封鎖所有排行榜上傳（fetch／sendBeacon／XHR 非 GET，僅放行 /api/leaderboard/forge 鍛造）
// 2. 鎖定遊戲記憶體存檔 leaderboard.off = true（不可改、不可刪），清除並攔截 d2s:leaderboard-queue
// 3. 存檔 HMAC-SHA256 封印（sealText／sealState）與修改器寫入後防覆寫保護（protectWrite／clearWriteProtect）
// 4. 單機／線上存檔模式判定（saveMode／setSaveMode／canWriteSave／detectors）與環境偵測狀態（status）

const TESTED_GAME_BUILD = "20261105.3";
const TOOLKIT_VERSION = "1.0.13";

const win = typeof window !== "undefined" ? window : globalThis;
const QUEUE_KEY = "d2s:leaderboard-queue";
const SAVE_MODE_KEY = "d2toolkit.saveMode";

// 跨熱重載共用的內部狀態（保留已擋下次數、寫入保護與掛接紀錄）
const state = (win.__d2guardState ??= {
  blockedUploads: 0,
  writeProtect: null,
  setItemHooked: false,
});

export const MODES = {
  softcore: { key: "d2-survivors/save/v1", seal: "d2s/save-seal/1:Rakanishu-Bishibosh-Coldcrow-Griswold-Pindleskin", traces: ["d2-survivors/save/before-import"] },
  hardcore: { key: "d2-survivors/hc/v1", seal: "d2s/save-seal/hc/1:Blood-Raven-Treehead-Woodfist-Coldworm-Andariel", traces: ["d2-survivors/hc/before-import"] },
};
export const mode = (m) => MODES[m === "hardcore" ? "hardcore" : "softcore"];

// 官方網址受限參數清單（saveTransfer / itemArt 內 Sl 共 40 個，以 URLSearchParams.has 判定）
const RESTRICTED_PARAMS = [
  "t", "god", "speed", "difficulty", "first", "slots", "terror", "act", "affixes", "farm",
  "cow", "power", "mf", "mana", "manakit", "manacost", "manaregen", "manathrottle", "carry", "replay",
  "class", "smoke", "checkpoints", "probe", "inifuss", "merc", "mercpicks", "hireall", "mercranks", "mercgear",
  "counts", "thief", "modpoints", "autosell", "shard", "shards", "chase", "clone", "keys", "uber",
];

// 官方 MOD 診斷（ui 模組 ie()）檢查的 7 個原生 API
const NATIVE_CHECKS = [
  ["WeakMap.get", (w) => (w.WeakMap ?? globalThis.WeakMap)?.prototype?.get],
  ["Storage.setItem", (w) => (w.Storage ?? globalThis.Storage)?.prototype?.setItem],
  ["drawImage", (w) => (w.CanvasRenderingContext2D ?? globalThis.CanvasRenderingContext2D)?.prototype?.drawImage],
  ["putImageData", (w) => (w.CanvasRenderingContext2D ?? globalThis.CanvasRenderingContext2D)?.prototype?.putImageData],
  ["addEventListener", (w) => (w.EventTarget ?? globalThis.EventTarget)?.prototype?.addEventListener],
  ["requestAnimationFrame", (w) => w.requestAnimationFrame ?? globalThis.requestAnimationFrame],
  ["devicePixelRatio", (w) => (Object.getOwnPropertyDescriptor(w, "devicePixelRatio") ?? Object.getOwnPropertyDescriptor(globalThis, "devicePixelRatio"))?.get],
];
const isNativeFn = (fn) => typeof fn !== "function" || /\[native code\]\s*\}\s*$/.test(Function.prototype.toString.call(fn));

/* ---------- 簽章（與遊戲相同：HMAC-SHA256） ---------- */
export async function hmac(key, text) {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return [...new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(text)))].map((b) => b.toString(16).padStart(2, "0")).join("");
}
export const sealKey = (save) => (save?.mode === "hc" ? MODES.hardcore.seal : MODES.softcore.seal);
export async function sealText(save) {
  const body = JSON.stringify({ ...save, seal: undefined });
  const seal = await hmac(sealKey(save), body);
  return body === "{}" ? `{"seal":"${seal}"}` : `${body.slice(0, -1)},"seal":"${seal}"}`;
}
export async function sealState(save) {
  if (!save || save.seal === undefined) return "none";
  return (await hmac(sealKey(save), JSON.stringify({ ...save, seal: undefined }))) === save.seal ? "sealed" : "broken";
}

/* ---------- 排行榜封鎖與寫入保護 ---------- */
export function lockLeaderboard(save) {
  if (!save || typeof save !== "object") return;
  let lb = save.leaderboard;
  if (!lb || typeof lb !== "object") lb = save.leaderboard = {};
  const d = Object.getOwnPropertyDescriptor(lb, "off");
  if (d && d.value === true && !d.writable && !d.configurable) return;
  if (d && !d.configurable) { save.leaderboard = lb = { ...lb }; }
  else delete lb.off;
  Object.defineProperty(lb, "off", { value: true, enumerable: true, writable: false, configurable: false });
}

function getLocalStorage() {
  try { return win.localStorage ?? globalThis.localStorage ?? null; } catch { return null; }
}

function wrapSetItem(target) {
  if (!target || typeof target.setItem !== "function" || target.setItem.__d2guardWrapped) return;
  const origSet = target.setItem;
  const wrapped = function (k, v) {
    const ls = getLocalStorage();
    if (!ls || this === ls || target === ls) {
      if (k === QUEUE_KEY) {
        try { ls?.removeItem?.(QUEUE_KEY); } catch {}
        return;
      }
      const wp = state.writeProtect;
      if (wp && k === wp.key && v !== wp.text) return;
    }
    return origSet.call(this, k, v);
  };
  Object.defineProperty(wrapped, "__d2guardWrapped", { value: true });
  target.setItem = wrapped;
}

function ensureSetItemHook() {
  const proto = (win.Storage ?? globalThis.Storage)?.prototype;
  if (proto) wrapSetItem(proto);
  const ls = getLocalStorage();
  if (ls && (!proto || !(ls instanceof (win.Storage ?? globalThis.Storage)))) wrapSetItem(ls);
  state.setItemHooked = true;
}

// 修改器寫入存檔後到頁面重新載入前，擋掉遊戲在 pagehide／背景切換時以舊記憶體存檔覆寫同一存檔鍵。
export function protectWrite(key, text) {
  if (key && typeof key === "object") {
    state.writeProtect = { key: String(key.key), text: String(key.text) };
  } else if (typeof key === "string" && key) {
    state.writeProtect = { key, text: String(text) };
  } else {
    state.writeProtect = null;
  }
  ensureSetItemHook();
  return state.writeProtect;
}

export function clearWriteProtect() {
  const prev = state.writeProtect;
  state.writeProtect = null;
  return prev;
}

// 工具包載入後強制關閉排行榜上傳（local 與 online 模式皆生效，無關閉 API）。
// 沿用 window.__d2noUpload 防重入旗標，熱重載不重複掛接。
(() => {
  ensureSetItemHook();
  if (!win.__d2noUpload) {
    win.__d2noUpload = true;
    // 鍛造請求的路徑也是 /api/leaderboard/forge（遊戲的 wi 常數即 /api/leaderboard），必須放行，否則淬鍊會「No reply」。
    const isUpload = (url, method) => /\/api\/leaderboard/.test(String(url)) && !/\/api\/leaderboard\/forge(\?|$)/.test(String(url)) && String(method || "GET").toUpperCase() !== "GET";
    const blocked = () => {
      state.blockedUploads++;
      console.info("[D2 工具包] 單機模式：已擋下排行榜上傳");
    };
    if (typeof win.fetch === "function") {
      const origFetch = win.fetch;
      win.fetch = function (input, init) {
        const isReq = typeof Request !== "undefined" && input instanceof Request;
        const url = isReq ? input.url : input?.url ?? input;
        const method = init?.method ?? (isReq ? input.method : input?.method ?? "GET");
        if (isUpload(url, method)) {
          blocked();
          return Promise.reject(new TypeError("D2 工具包單機模式：排行榜上傳已關閉"));
        }
        return origFetch.apply(this, arguments);
      };
    }
    const nav = win.navigator ?? globalThis.navigator;
    const origBeacon = nav?.sendBeacon?.bind(nav);
    if (origBeacon) {
      nav.sendBeacon = (url, data) => (isUpload(url, "POST") ? (blocked(), false) : origBeacon(url, data));
    }
    const XHR = win.XMLHttpRequest ?? globalThis.XMLHttpRequest;
    if (XHR?.prototype) {
      const xo = XHR.prototype.open, xs = XHR.prototype.send, flag = Symbol("d2noUpload");
      XHR.prototype.open = function (method, url) {
        this[flag] = isUpload(url, method);
        return xo.apply(this, arguments);
      };
      XHR.prototype.send = function () {
        if (this[flag]) {
          blocked();
          this.abort?.();
          return;
        }
        return xs.apply(this, arguments);
      };
    }
    // 刪除遊戲正在等待上傳的排行榜紀錄（佇列鍵見遊戲 saveTransfer：d2s:leaderboard-queue），之後也不再寫入。
    try { getLocalStorage()?.removeItem(QUEUE_KEY); } catch {}
    const tick = () => {
      try { lockLeaderboard(win.__d2autobot?.game?.save); } catch {}
      try {
        const ls = getLocalStorage();
        if (ls && ls.getItem(QUEUE_KEY) !== null) ls.removeItem(QUEUE_KEY);
      } catch {}
    };
    tick();
    const timer = setInterval(tick, 300);
    timer?.unref?.();
  }
  win.__d2lockLeaderboard = lockLeaderboard;
})();

/* ---------- 存檔模式（local / online）與環境狀態 ---------- */
// 遊戲目前尚無線上存檔；日後遊戲推出線上存檔時，可在此陣列註冊偵測函式（回傳 "online"／"local" 或 boolean）。
export const detectors = Array.isArray(win.__d2guard?.detectors) ? win.__d2guard.detectors : [];

function resolveSaveMode() {
  try {
    const ov = getLocalStorage()?.getItem(SAVE_MODE_KEY);
    if (ov === "local" || ov === "online") return { mode: ov, source: "override" };
  } catch {}
  for (const fn of detectors) {
    try {
      const r = fn();
      if (r === "online" || r === true) return { mode: "online", source: "detected" };
      if (r === "local") return { mode: "local", source: "detected" };
    } catch {}
  }
  return { mode: "local", source: "default" };
}

export function saveMode() {
  return resolveSaveMode().mode;
}

export function setSaveMode(v) {
  const ls = getLocalStorage();
  if (v === null || v === undefined || v === "" || v === "auto" || v === "default") {
    try { ls?.removeItem(SAVE_MODE_KEY); } catch {}
    return saveMode();
  }
  if (v !== "local" && v !== "online") throw new Error("存檔模式僅支援 \"local\"、\"online\" 或 null");
  try { ls?.setItem(SAVE_MODE_KEY, v); } catch {}
  return saveMode();
}

export function canWriteSave() {
  return saveMode() === "local";
}

export function status() {
  const { mode: currentMode, source: saveModeSource } = resolveSaveMode();
  const memSave = win.__d2autobot?.game?.save;
  const leaderboardOff = memSave && typeof memSave === "object" ? memSave.leaderboard?.off === true : null;
  let queuePresent = false;
  try { queuePresent = getLocalStorage()?.getItem(QUEUE_KEY) !== null && getLocalStorage()?.getItem(QUEUE_KEY) !== undefined; } catch {}
  const replacedNatives = NATIVE_CHECKS.filter(([, getter]) => {
    try { return !isNativeFn(getter(win)); } catch { return false; }
  }).map(([name]) => name);
  const d2zh = Boolean(win.__D2ZH ?? globalThis.__D2ZH);
  const webdriver = Boolean((win.navigator ?? globalThis.navigator)?.webdriver);
  let restrictedParams = [];
  try {
    const search = (win.location ?? globalThis.location)?.search || "";
    const params = new URLSearchParams(search);
    restrictedParams = RESTRICTED_PARAMS.filter((p) => params.has(p));
  } catch {}
  return {
    version: 1,
    saveMode: currentMode,
    saveModeSource,
    noUpload: true,
    leaderboardOff,
    queuePresent,
    blockedUploads: state.blockedUploads,
    replacedNatives,
    d2zh,
    webdriver,
    restrictedParams,
  };
}

win.__d2guard = {
  version: 1,
  MODES,
  mode,
  sealText,
  sealState,
  lockLeaderboard,
  saveMode,
  setSaveMode,
  canWriteSave,
  protectWrite,
  clearWriteProtect,
  status,
  detectors,
};
