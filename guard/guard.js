// D2 倖存者工具包 — 防護與存檔檢查核心模組（guard/guard.js）
// 桌面版定位：
// 1. 存檔 HMAC-SHA256 封印（sealText／sealState）
// 2. 存檔合規檢查由 guard/save-check.js 提供（修改器寫入前亦會直接 import）。

const win = typeof window !== "undefined" ? window : globalThis;

export const MODES = {
  softcore: { key: "d2-survivors/save/v1", seal: "d2s/save-seal/1:Rakanishu-Bishibosh-Coldcrow-Griswold-Pindleskin", traces: ["d2-survivors/save/before-import"] },
  hardcore: { key: "d2-survivors/hc/v1", seal: "d2s/save-seal/hc/1:Blood-Raven-Treehead-Woodfist-Coldworm-Andariel", traces: ["d2-survivors/hc/before-import"] },
};
export const mode = (m) => MODES[m === "hardcore" ? "hardcore" : "softcore"];

// 官方受限參數清單（saveTransfer / itemArt 內 Sl 共 40 個，以 URLSearchParams.has 判定）
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

function getLocalStorage() {
  try { return win.localStorage ?? globalThis.localStorage ?? null; } catch { return null; }
}

export function status() {
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
    saveMode: "local",
    saveModeSource: "default",
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
  status,
};
