// D2 倖存者工具包（網頁版）
// 由書籤載入，在 d2survivors.lol 的頁面裡執行：直接讀寫遊戲的 localStorage 存檔，
// 修改器介面放在全螢幕 iframe 裡，透過 postMessage 跟這裡溝通。
const HOST = new URL(".", import.meta.url).href;
// 書籤每次帶不同的 v，這裡載入的其他檔案也帶同一個 v，避免手機瀏覽器用舊的快取
const VER = new URL(import.meta.url).searchParams.get("v") || String(Date.now());
const at = (f) => HOST + f + (f.includes("?") ? "&" : "?") + "v=" + VER;
// 依使用者 iPhone 截圖（2026-11-08）：同一次載入中 import() 腳本都成功，但 fetch() 字典、遊戲資料、修改器頁面、特徵碼全部「Load failed」（網路層錯誤）。
// 工具網站的檔案改用這裡讀取：失敗時重試 3 次（第 2 次起略過快取），JSON 最後再用 import(…, { with: { type: "json" } }) 備援。
async function hostFetch(url, as = "json") {
  let last;
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(i ? url + (url.includes("?") ? "&" : "?") + "r=" + i : url, i ? { cache: "reload" } : undefined);
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r[as]();
    } catch (e) { last = e; if (i < 3) await new Promise((ok) => setTimeout(ok, 600 * (i + 1))); }
  }
  if (as === "json") {
    try { return (await import(url + (url.includes("?") ? "&" : "?") + "j=1", { with: { type: "json" } })).default; } catch (e) { console.warn("JSON import 備援也失敗：" + url, e); }
  }
  throw last;
}
window.__d2hostFetch = hostFetch;
const MODES = {
  softcore: { key: "d2-survivors/save/v1", seal: "d2s/save-seal/1:Rakanishu-Bishibosh-Coldcrow-Griswold-Pindleskin", traces: ["d2-survivors/save/before-import"] },
  hardcore: { key: "d2-survivors/hc/v1", seal: "d2s/save-seal/hc/1:Blood-Raven-Treehead-Woodfist-Coldworm-Andariel", traces: ["d2-survivors/hc/before-import"] },
};
const mode = (m) => MODES[m === "hardcore" ? "hardcore" : "softcore"];
// 工具包定位為單機爽玩：載入後強制關閉排行榜上傳，玩家無法再打開。
// 1. 擋下所有送往 /api/leaderboard 的非 GET 請求（仍可瀏覽排行榜；僅放行 /api/leaderboard/forge 鍛造請求）。
// 2. 遊戲記憶體中的存檔 leaderboard.off 鎖成不可改、不可刪的 true；遊戲選項的「上傳」開關按下時會失敗、維持關閉。
(() => {
  if (window.__d2noUpload) return;
  window.__d2noUpload = true;
  // 鍛造請求的路徑也是 /api/leaderboard/forge（遊戲的 wi 常數即 /api/leaderboard），必須放行，否則淬鍊會「No reply」。
  const isUpload = (url, method) => /\/api\/leaderboard/.test(String(url)) && !/\/api\/leaderboard\/forge(\?|$)/.test(String(url)) && String(method || "GET").toUpperCase() !== "GET";
  const blocked = () => console.info("[D2 工具包] 單機模式：已擋下排行榜上傳");
  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    const url = input instanceof Request ? input.url : input, method = init?.method ?? (input instanceof Request ? input.method : "GET");
    if (isUpload(url, method)) { blocked(); return Promise.reject(new TypeError("D2 工具包單機模式：排行榜上傳已關閉")); }
    return origFetch.apply(this, arguments);
  };
  const origBeacon = navigator.sendBeacon?.bind(navigator);
  if (origBeacon) navigator.sendBeacon = (url, data) => (isUpload(url, "POST") ? (blocked(), false) : origBeacon(url, data));
  const xo = XMLHttpRequest.prototype.open, xs = XMLHttpRequest.prototype.send, flag = Symbol("d2noUpload");
  XMLHttpRequest.prototype.open = function (method, url) { this[flag] = isUpload(url, method); return xo.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function () { if (this[flag]) { blocked(); this.abort(); return; } return xs.apply(this, arguments); };
  const lock = (save) => {
    if (!save || typeof save !== "object") return;
    let lb = save.leaderboard;
    if (!lb || typeof lb !== "object") lb = save.leaderboard = {};
    const d = Object.getOwnPropertyDescriptor(lb, "off");
    if (d && d.value === true && !d.writable && !d.configurable) return;
    if (d && !d.configurable) { save.leaderboard = lb = { ...lb }; }
    else delete lb.off;
    Object.defineProperty(lb, "off", { value: true, enumerable: true, writable: false, configurable: false });
  };
  // 3. 刪除遊戲正在等待上傳的排行榜紀錄（佇列鍵見遊戲 saveTransfer：d2s:leaderboard-queue），之後也不再寫入。
  const QUEUE = "d2s:leaderboard-queue";
  try { localStorage.removeItem(QUEUE); } catch {}
  const qSet = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) {
    if (this === localStorage && k === QUEUE) { try { localStorage.removeItem(QUEUE); } catch {} return; }
    return qSet.call(this, k, v);
  };
  const tick = () => { try { lock(window.__d2autobot?.game?.save); } catch {} try { if (localStorage.getItem(QUEUE) !== null) localStorage.removeItem(QUEUE); } catch {} };
  tick(); setInterval(tick, 300);
  window.__d2lockLeaderboard = lock;
})();

/* ---------- 簽章（與遊戲相同：HMAC-SHA256） ---------- */
async function hmac(key, text) {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return [...new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(text)))].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const sealKey = (save) => (save.mode === "hc" ? MODES.hardcore.seal : MODES.softcore.seal);
async function sealText(save) {
  const body = JSON.stringify({ ...save, seal: undefined });
  const seal = await hmac(sealKey(save), body);
  return body === "{}" ? `{"seal":"${seal}"}` : `${body.slice(0, -1)},"seal":"${seal}"}`;
}
async function sealState(save) {
  if (save.seal === undefined) return "none";
  return (await hmac(sealKey(save), JSON.stringify({ ...save, seal: undefined }))) === save.seal ? "sealed" : "broken";
}

/* ---------- 遊戲資料網址 ---------- */
// 跟遊戲一樣依頁面上的 #d2-files 清單加上 ?h=版本；不加的話會拿到網站上舊版的檔案（例如沒有符文之語）
let manifestP = null;
function manifest() {
  return (manifestP ??= (async () => {
    try { const t = document.getElementById("d2-files")?.textContent; if (t) return JSON.parse(t); } catch {}
    try {
      const h = await fetch(new URL("/play/", location.origin), { cache: "no-store" }).then((r) => r.text());
      const m = h.match(/<script[^>]*id="d2-files"[^>]*>([\s\S]*?)<\/script>/);
      return m ? JSON.parse(m[1]) : null;
    } catch { return null; }
  })());
}
async function d2url(file) {
  const man = await manifest(), i = file.lastIndexOf("/"), dir = i < 0 ? "" : file.slice(0, i), h = man?.hashes?.[dir];
  return new URL("/d2/" + file + (h ? "?h=" + h : ""), location.origin).href;
}

/* ---------- 物品引擎：載入遊戲自己的產生器 ---------- */
let enginePromise = null;
// 診斷用：引擎啟動到哪一步、找到哪些程式區塊
const engineInfo = { step: "未啟動" };
function activeGameScript() {
  // 排除本工具用 fetch 掃描的檔案；只採用頁面實際載入或預載的遊戲模組。
  const scripts = new Set(performance.getEntriesByType("resource").filter((e) => ["script", "link", "other"].includes(e.initiatorType)).map((e) => {
    try { return new URL(e.name).pathname.match(/\/(Game-[\w-]+\.js)$/)?.[1]; } catch { return null; }
  }).filter(Boolean));
  return scripts.size === 1 ? [...scripts][0] : null;
}
async function startEngine() {
  engineInfo.step = "讀取程式清單";
  const itemstatsP = (async () => {
    const statsUrl = window.__D2EDIT_ITEMSTATS || (await d2url("itemstats.json"));
    return fetch(statsUrl).then((r) => { engineInfo.itemstats = r.status; if (!r.ok) throw new Error("讀不到遊戲物品資料（請先進入過遊戲一次）。"); return r.text(); });
  })();
  itemstatsP.catch(() => {});
  const [{ patch }, signatures] = await Promise.all([import(at("modifier/patch.mjs")), hostFetch(at("modifier/signatures.json"))]);
  // 從頁面已載入的腳本開始，順著 "./xxx.js" 參照把同資料夾的區塊都抓下來
  const base = new URL("/assets/", location.origin).href;
  const seen = new Set(), files = {};
  const queue = [...document.querySelectorAll("script[src],link[rel=modulepreload]")].map((e) => e.src || e.href)
    .concat(performance.getEntriesByType("resource").map((e) => e.name))
    .filter((u) => u.startsWith(base) && u.endsWith(".js")).map((u) => u.slice(base.length));
  // 目前頁面不一定載入了物品程式（例如停在設定頁），所以也從遊戲主頁的程式清單開始找
  // 依使用者回報（物品引擎載入很久）：主頁清單與各程式區塊改為並行抓取（舊版逐一等待 45 個檔案），每一波抓完再找下一波參照。
  const t0 = performance.now(), mark = (k) => { (engineInfo.ms ??= {})[k] = Math.round(performance.now() - t0); };
  const isTargetChunk = (f) => /^(?:itemArt|saveTransfer)-[\w-]+\.js$/.test(f);
  const fetchChunk = (f) => fetch(base + f, { cache: "force-cache" }).then((r) => (r.ok ? r.text() : null)).catch(() => null);
  // iPhone 實測抓取 3.3 秒：程式區塊檔名帶雜湊（遊戲更新檔名就變），直接用瀏覽器快取（force-cache），不再逐一向伺服器確認；/play/ 已有清單就不抓首頁。
  for (const page of ["/play/", "/"]) {
    if (page === "/play/" && location.pathname.startsWith("/play") && queue.length) break;
    const html = await fetch(new URL(page, location.origin), { cache: "no-store" }).then((r) => (r.ok ? r.text() : "")).catch(() => "");
    const found = [...html.matchAll(/\/assets\/([\w.-]+\.js)/g)].map((m) => m[1]);
    queue.push(...found);
    if (found.length) break;
  }
  // 最佳化：所有特徵碼（signatures.json）皆位於 itemArt-*.js 與 saveTransfer-*.js。
  // 先抓這兩個目標區塊（若清單只有入口檔則先透過 Game-*.js／game-*.js 找出參照），若特徵碼已全部命中就略過其餘 40+ 個 Pixi／介面分塊；若有缺漏才退回完整波段掃描。
  let targets = [...new Set(queue)].filter(isTargetChunk);
  if (targets.length < 2) {
    const entry = [...new Set(queue)].filter((f) => /^(?:Game|game)-[\w-]+\.js$/.test(f) && !seen.has(f));
    for (const f of entry) seen.add(f);
    const srcs = await Promise.all(entry.map(fetchChunk));
    entry.forEach((f, i) => {
      const src = srcs[i]; if (src == null) return; files[f] = src;
      for (const m of src.matchAll(/["'`]\.\/([\w.-]+\.js)["'`]/g)) queue.push(m[1]);
    });
    targets = [...new Set(queue)].filter((f) => isTargetChunk(f) && !seen.has(f));
  }
  if (targets.length) {
    for (const f of targets) seen.add(f);
    const srcs = await Promise.all(targets.map(fetchChunk));
    targets.forEach((f, i) => { const src = srcs[i]; if (src != null) files[f] = src; });
  }
  let patchRes = Object.keys(files).length ? patch(files, signatures) : null;
  const sigCount = Object.keys(signatures).filter((k) => k !== "_").length;
  if (!patchRes || patchRes.missing.length || Object.keys(patchRes.found).length < sigCount) {
    let wave = [...new Set(queue)].filter((f) => !seen.has(f));
    while (wave.length) {
      const todo = wave.filter((f) => !seen.has(f)); for (const f of todo) seen.add(f);
      const srcs = await Promise.all(todo.map(fetchChunk));
      const next = new Set();
      todo.forEach((f, i) => { const src = srcs[i]; if (src == null) return; files[f] = src; for (const m of src.matchAll(/["'`]\.\/([\w.-]+\.js)["'`]/g)) if (!seen.has(m[1])) next.add(m[1]); });
      wave = [...next];
    }
    patchRes = patch(files, signatures);
  }
  mark("抓取程式");
  const { patched, missing, found } = patchRes;
  mark("比對特徵碼");
  Object.assign(engineInfo, { step: "比對遊戲程式", chunks: Object.keys(files).length, found, missing });
  if (missing.length) throw new Error("遊戲版本不相容：找不到 " + missing.join("、"));
  // 加了 export 的區塊用 blob 載入（相對參照改成絕對網址）；再用 import map 讓所有區塊對它的參照都指向這份，
  // 整個模組圖只有一個實例
  const map = {};
  for (const [f, src] of Object.entries(patched)) {
    const abs = src.replace(/(["'`])\.\/([\w.-]+\.js)\1/g, (_, q, d) => q + base + d + q);
    map[base + f] = URL.createObjectURL(new Blob([abs], { type: "text/javascript" }));
  }
  engineInfo.step = "讀取物品資料";
  mark("建立模組");
  const itemstats = await itemstatsP;
  engineInfo.step = "載入產生器";
  // 遊戲本身已經載入同一批程式，再載一次會重複註冊；所以放進隱藏的同源 iframe，用它自己的模組環境執行
  const box = document.createElement("iframe");
  box.style.display = "none";
  box.srcdoc = `<!doctype html><meta charset=utf-8><script type="importmap">${JSON.stringify({ imports: map }).replace(/</g, "\\u003c")}<\/script>`;
  await new Promise((ok) => { box.onload = ok; document.body.appendChild(box); });
  const w = box.contentWindow;
  w.__entries = Object.keys(map);
  w.__itemstats = itemstats;
  w.__gameIdentity = { items: found.setData, save: found.rankDefs };
  mark("讀取物品資料");
  return w.eval(`(async () => {
    const [mods, { boot }] = await Promise.all([
      Promise.all(__entries.map((u) => import(u))),
      import(${JSON.stringify(at("modifier/engine-page.js"))}),
    ]);
    return boot(Object.assign({}, ...mods), __itemstats, __gameIdentity);
  })()`);
}
let engineStartedAt = 0;
const engine = () => (enginePromise ??= (engineStartedAt = performance.now(), startEngine())
  .then((e) => { engineInfo.step = "已啟動"; if (engineInfo.ms) engineInfo.ms.完成 = Math.round(performance.now() - engineStartedAt); return e; })
  .catch((e) => { engineInfo.error = String(e?.message ?? e); enginePromise = null; throw e; }));

/* ---------- 診斷 ---------- */
// 上次寫入的紀錄存在遊戲頁面的 sessionStorage（同一個分頁重新載入後還在），用來比對遊戲有沒有採用
const LAST_WRITE = "d2edit:lastWrite";
let written = false, lastText = null, keepHooked = false;
function summarize(text) {
  try {
    const s = JSON.parse(text);
    const flat = (o) => Object.values(o ?? {}).flatMap((v) => v ?? []);
    const rar = {};
    for (const u of s.uniques ?? []) rar[u.rarity] = (rar[u.rarity] ?? 0) + 1;
    return {
      gold: s.gold, uniques: (s.uniques ?? []).length, uniquesByRarity: rar,
      stash: flat(s.stashTabs).length, equipped: Object.values(s.equippedByClass ?? {}).reduce((n, o) => n + Object.keys(o ?? {}).length, 0),
      gearHash: hashStr(JSON.stringify(Object.values(s.equippedByClass ?? {}).map((o) => Object.values(o ?? {}).map((i) => i.mods)))),
      gen: s.gen, version: s.version, mode: s.mode ?? "softcore",
    };
  } catch (e) { return { error: "無法解析：" + e.message }; }
}
function hashStr(t) { let h = 0; for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return (h >>> 0).toString(16); }

/* ---------- 給 iframe 呼叫的功能 ---------- */
const backend = {
  async load(m) {
    const text = localStorage.getItem(mode(m).key);
    if (text == null) throw new Error(`找不到${m === "hardcore" ? "硬核" : "一般"}模式的存檔。`);
    const save = JSON.parse(text);
    return { save, source: "localStorage", seal: await sealState(save) };
  },
  async save(m, save) {
    if (typeof save !== "object" || !save || typeof save.version !== "number") throw new Error("存檔格式不正確。");
    save = { ...save, leaderboard: { ...save.leaderboard, off: true } }; // 單機模式：修改器寫入的存檔一律關閉排行榜上傳
    const text = await sealText(save);
    // 同一頁第二次寫入時，上一次的防護還在；先清掉，讓修改器自己的這次寫入通過（否則會被擋下、顯示讀回不一致）。
    const prevGuard = lastText;
    lastText = null;
    try { localStorage.setItem(mode(m).key, text); }
    catch (e) { lastText = prevGuard; throw e; } // 寫入失敗時保留上一次成功寫入的防護，避免遊戲以舊記憶體覆寫
    written = true;
    // 遊戲在關卡中會於 pagehide／切到背景時用記憶體裡的舊存檔覆寫（有多個監聽，順序不定）。
    // 寫入後到頁面重新載入前，擋掉遊戲對同一存檔鍵的其他寫入；修改器開著時遊戲無法操作，關閉即重新載入，不會吃掉遊戲進度。
    lastText = { key: mode(m).key, text };
    if (!keepHooked) {
      keepHooked = true;
      const setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) {
        if (this === localStorage && lastText && k === lastText.key && v !== lastText.text) return;
        return setItem.call(this, k, v);
      };
    }
    const readback = localStorage.getItem(mode(m).key) === text;
    try { sessionStorage.setItem(LAST_WRITE, JSON.stringify({ time: new Date().toISOString(), key: mode(m).key, bytes: text.length, readback, summary: summarize(text) })); } catch {}
    if (!readback) throw new Error("寫入後讀回的內容不一致，存檔可能沒有寫進去。");
    return { ok: true, bytes: text.length, reload: true };
  },
  sealText,
  async assets() {
    return (backend._assetsP ??= (async () => {
      const dir = new URL("/d2", location.origin).href, man = await manifest();
      try {
        const j = await fetch(await d2url("items.json")).then((r) => r.json());
        const slim = (o) => Object.fromEntries(Object.entries(o ?? {}).map(([k, v]) => [k, (v.inv ?? []).map((i) => [i.file, i.width, i.height])]));
        return { dir, hashes: man?.hashes, webp: man?.webp, bases: slim(j.bases), uniques: slim(j.uniques), sets: slim(j.sets), quest: slim(j.quest), runes: slim(j.runes), gems: slim(j.gems) };
      } catch {
        backend._assetsP = null;
        return { dir, bases: {}, uniques: {}, sets: {}, quest: {}, runes: {}, gems: {} };
      }
    })());
  },
  // 中文：與遊戲語言模組共用內建繁體字典。
  async i18n() {
    const game = await (window.__d2gamedataPromise || loadGameData());
    let dict = {};
    if (window.__d2zhPromise) {
      const shared = await window.__d2zhPromise;
      if (shared && typeof shared === "object") dict = shared;
    }
    // 實測：手機在網站部署期間或網路不穩時字典偶爾抓不到，整頁底材、物品都退回英文；失敗時重試 3 次。
    for (let i = 0; i < 3 && !Object.keys(dict).length; i++) {
      try { const response = await fetch(at("lang/zh-TW.json"), i ? { cache: "reload" } : undefined); if (!response.ok) throw new Error("字典讀取失敗"); dict = await response.json(); }
      catch { dict = {}; if (i < 2) await new Promise((r) => setTimeout(r, 800 * (i + 1))); }
    }
    return { dict, game, missing: !Object.keys(dict).length };
  },
  async engine(fn, ...args) {
    if (!["capabilities", "catalog", "generateMany", "faults", "saveFaults", "bases", "runewordBases", "affixOk", "rankDefs", "skillModDefs", "itemModMax", "affixInfo", "statRanges", "resolveName", "validateItems", "allowedStatsMany", "affixSlots", "fixedInfo", "fixedBuild", "sanitizeItem", "kindMap"].includes(fn)) throw new Error("不支援的操作");
    const e = await engine();
    const capability = e.capabilities(activeGameScript());
    if (fn === "capabilities") return JSON.parse(JSON.stringify(capability));
    // 結果來自另一個 iframe，複製一份成這邊的物件
    return JSON.parse(JSON.stringify(await e[fn](...args) ?? null));
  },
  traces(m, remove) {
    const found = mode(m).traces.filter((k) => localStorage.getItem(k) != null);
    if (remove) for (const k of found) localStorage.removeItem(k);
    return found;
  },
  close() { close(); return true; },
  // 遊戲版本：修改器在 GitHub 頁面的 iframe 內，跨網站讀不到遊戲的 changelog.json，改由這裡（遊戲同源）讀取。
  async gameBuild() {
    let list = null;
    try { list = await (window.__d2changelogPromise ??= fetch("/changelog.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null)); } catch { list = null; }
    const gameJs = performance.getEntriesByType("resource").map((e) => e.name).concat([...document.querySelectorAll("script[src],link[rel=modulepreload]")].map((e) => e.src || e.href)).map((u) => u.match(/\/(Game-[\w-]+\.js)/)?.[1]).find(Boolean) || "";
    return { build: list?.[0]?.build || "", date: list?.[0]?.date || "", gameJs };
  },
  // 診斷資訊（不含排行榜 ID 等識別碼）
  diag() {
    let last = null;
    try { last = JSON.parse(sessionStorage.getItem(LAST_WRITE) || "null"); } catch {}
    const keys = Object.keys(localStorage).filter((k) => /^d2/.test(k)).sort()
      .map((k) => `${k} (${(localStorage.getItem(k) ?? "").length})`);
    const now = {};
    for (const [name, m] of Object.entries(MODES)) { const t = localStorage.getItem(m.key); if (t) now[name] = summarize(t); }
    return {
      page: location.pathname, editor: HOST, userAgent: navigator.userAgent,
      d2files: !!document.getElementById("d2-files"), serviceWorker: !!navigator.serviceWorker?.controller,
      modeKey: localStorage.getItem("d2-survivors/mode/v1"), zh: window.D2I18N ? window.D2I18N.language : "未載入",
      engine: { ...engineInfo, found: engineInfo.found ? Object.keys(engineInfo.found).join(",") : undefined },
      storageKeys: keys, savesNow: now, lastWrite: last, writtenThisSession: written,
      // 遊戲記住的目前職業（選角畫面）：一鍵解鎖地獄火炬時依此給對應職業技能
      selfCheck: window.__d2editSelfCheck ? { build: window.__d2editSelfCheck.build, tested: window.__d2editSelfCheck.tested, issues: window.__d2editSelfCheck.issues } : null,
      classPick: { softcore: localStorage.getItem("d2-survivors/class/v1"), hardcore: localStorage.getItem("d2-survivors/hc/class/v1") },
    };
  },
};

/* ---------- 全螢幕介面 ---------- */
let frame = null;
function close() {
  frame?.remove();
  frame = null;
  window.__d2editLauncher && (window.__d2editLauncher.style.display = "none");
  window.removeEventListener("message", onMessage);
  if (written) location.reload();
}
async function onMessage(e) {
  if (!frame || e.source !== frame.contentWindow || e.data?.d2edit !== "call") return;
  const { id, fn, args } = e.data;
  let result;
  try {
    if (!Object.hasOwn(backend, fn)) throw new Error("不支援的操作：" + fn);
    result = await backend[fn](...args);
  } catch (err) {
    result = { error: String(err?.message ?? err) };
  }
  frame?.contentWindow.postMessage({ d2edit: "reply", id, result }, new URL(HOST).origin);
}

window.__d2editBackend = backend; // 方便除錯（同一頁面本來就能讀寫這些存檔）
// 每次點書籤都用這次載入的最新版本：先關掉之前開的修改器與按鈕（不論是哪個版本）
const prevClose = window.__d2editClose;
if (prevClose) prevClose(true);
window.__d2editLauncher?.remove();
window.__d2toolkitMenu?.remove();
window.__d2perfClose?.(); // 重新點書籤時關掉舊的效能頁與其動畫迴圈
document.getElementById("d2autoforge-afk")?.remove(); window.__d2afk = false; // 掛機遮罩（重新點書籤時清掉舊的）
window.__d2editStopWatch?.();
window.__d2editClose = (quiet) => { if (frame) { frame.remove(); frame = null; window.removeEventListener("message", onMessage); } if (!quiet && written) location.reload(); };
window.__d2editIsOpen = () => !!frame;
const editorUrl = () => at("modifier/editor.html") + "&origin=" + encodeURIComponent(location.origin) + "&mode=" + (localStorage.getItem("d2-survivors/mode/v1") === "hardcore" ? "hardcore" : "softcore");
function openEditor() {
  if (frame) return;
  frame = document.createElement("iframe");
  frame.src = editorUrl();
  frame.style.cssText = "position:fixed;inset:0;width:100vw;width:100dvw;height:100vh;height:100dvh;border:0;z-index:2147483647;background:#14110d";
  window.addEventListener("message", onMessage);
  document.body.appendChild(frame);
}
// 點書籤後不直接開啟：留在遊戲中，按暫停時畫面左上角才出現「修改器」按鈕
// 工具包單一按鈕：把「輔助器」「語言」「修改器」收進同一個下拉選單。
// 輔助器與語言仍由各自模組建立與處理，這裡只隱藏它們原本的浮動按鈕，點選單項目時代為觸發。
const toolkitStyle = document.getElementById("d2toolkit-style") || document.head.appendChild(Object.assign(document.createElement("style"), { id: "d2toolkit-style" }));
toolkitStyle.textContent = "#d2autobot-launcher,#d2lang-btn{display:none!important}";
const launcher = document.createElement("button");
launcher.type = "button";
launcher.id = "d2toolkit-launcher";
launcher.textContent = "工具包";
launcher.title = "D2 倖存者工具包：輔助器、中文化、修改器";
launcher.style.cssText = "position:fixed;top:max(12px, env(safe-area-inset-top));left:max(12px, env(safe-area-inset-left));z-index:2147483646;display:none;"
  + "padding:8px 14px;min-height:44px;border:1px solid #d4a84a;border-radius:6px;background:rgba(20,17,13,.92);color:#d4a84a;font:bold 15px 'Microsoft JhengHei',system-ui,sans-serif;cursor:pointer;touch-action:manipulation";
const toolkitMenu = document.createElement("div");
toolkitMenu.id = "d2toolkit-menu";
toolkitMenu.style.cssText = "position:fixed;top:calc(max(12px, env(safe-area-inset-top)) + 50px);left:max(12px, env(safe-area-inset-left));z-index:2147483647;display:none;"
  + "min-width:170px;max-height:calc(100dvh - 80px);overflow:auto;padding:4px 0;background:rgba(20,17,13,.98);border:1px solid #d4a84a;border-radius:6px;box-shadow:0 6px 16px rgba(0,0,0,.6);touch-action:manipulation";
// 工具包功能登錄表：之後新增的功能呼叫 window.__d2toolkit.register({ id, label, open }) 即可出現在選單裡。
// 面板每次開啟時重新排列，同一個 id 重複登錄會覆蓋舊的。
const toolkitFeatures = new Map();
function registerToolkitFeature({ id, label, open, order = 100 }) {
  if (!id || typeof open !== "function") throw new TypeError("toolkit feature needs id and open()");
  toolkitFeatures.set(id, { id, label, open, order });
}
window.__d2toolkit = { register: registerToolkitFeature, features: () => [...toolkitFeatures.values()].map(({ id, label, order }) => ({ id, label, order })) };
registerToolkitFeature({ id: "autobot", label: "輔助器", order: 10, open: () => document.getElementById("d2autobot-launcher")?.click() });
registerToolkitFeature({ id: "autoforge", label: "自動淬鍊", order: 15, open: () => { if (!window.__d2autoforgeUI?.open()) alert("請先進入遊戲（選好職業）再開啟自動淬鍊"); } });
registerToolkitFeature({ id: "lang", label: "中文化", order: 20, open: () => document.getElementById("d2lang-btn")?.click() });
registerToolkitFeature({ id: "editor", label: "修改器", order: 30, open: () => openEditor() });
// 效能頁面：全螢幕顯示即時指標（只讀取，不修改遊戲與存檔）。
registerToolkitFeature({ id: "perf", label: "效能", order: 40, open: () => openPerfPage() });
// 優化開關（效能頁）：只保留「掛機時略過主畫面繪製」。
// 2026-11-10 實機同場對照（tests/live-harness/perf-ab-live.cjs）：「減少特效」「記憶體整理」「降低解析度」量不到效益，
// 且降低解析度會與遊戲自己的動態解析度互相覆蓋，三項已移除；舊存檔設定裡的這些欄位直接忽略。
const PERF_OPT_KEY = "d2toolkit.perfopts.v1";
const perfOpts = (() => {
  const d = { afkSkipMain: true };
  try { const saved = JSON.parse(localStorage.getItem(PERF_OPT_KEY) || "{}"); return { afkSkipMain: typeof saved?.afkSkipMain === "boolean" ? saved.afkSkipMain : d.afkSkipMain }; } catch (e) { return d; }
})();
window.__d2perfOpts = perfOpts;
function savePerfOpts() { try { localStorage.setItem(PERF_OPT_KEY, JSON.stringify(perfOpts)); } catch (e) { /* 無法寫入時只是不會記住 */ } }
// 重新點書籤時，清掉上一版留下的效能計時器（舊版的解析度／特效計時器會繼續改遊戲畫面）。
for (const id of window.__d2perfTimers || []) clearInterval(id);
window.__d2perfTimers = [];

// 掛機（工具包選單）：整個畫面蓋上黑幕，遊戲與輔助器照常執行（打怪、升級、自動淬鍊）；點畫面喚醒。
// 省電方式只略過「主畫面」的 Pixi 繪製（container 為 app.stage 且沒有 target），離屏貼圖（如物品圖示）照常繪製。
let afkEl = null;
function hookRenderer(g) {
  const r = g?.app?.renderer, stage = g?.app?.stage;
  if (!r || !stage || r.__d2afkHooked || typeof r.render !== "function") return;
  const orig = r.render;
  r.render = function (...args) {
    if (window.__d2afk) {
      const opts = args[0];
      const container = opts && typeof opts === "object" && "container" in opts ? opts.container : opts;
      const target = opts && typeof opts === "object" ? opts.target : undefined;
      const stats = (window.__d2afkStats ??= { skippedMain: 0, passedOffscreen: 0, passedMainTarget: 0 });
      // 讀 window 上目前這一版的設定：繪製掛接只裝一次，重新點書籤後不能繼續用舊版的 perfOpts。
      if (container === stage && !target && (window.__d2perfOpts ?? perfOpts).afkSkipMain) { stats.skippedMain++; return; }
      stats[target ? "passedOffscreen" : "passedMainTarget"]++;
    }
    return orig.apply(this, args);
  };
  r.__d2afkHooked = true;
}
function setAfk(on) {
  window.__d2afk = !!on;
  if (!on) { afkEl?.remove(); afkEl = null; window.__d2autoforgeUI?.redraw?.(); return; }
  hookRenderer(window.__d2autobot?.game);
  if (afkEl?.isConnected) return;
  afkEl = document.createElement("div");
  afkEl.id = "d2autoforge-afk";
  afkEl.title = "點擊畫面喚醒";
  afkEl.style.cssText = "position:fixed;inset:0;z-index:2147483600;background:#000;cursor:pointer;color:#111;font:12px sans-serif;display:flex;align-items:flex-end;justify-content:center;padding-bottom:12px;user-select:none;";
  afkEl.textContent = "掛機中（點擊畫面喚醒）";
  afkEl.addEventListener("pointerdown", (e) => { e.stopPropagation(); e.preventDefault(); setAfk(false); });
  document.body.append(afkEl);
}
function enterAfk() {
  const g = window.__d2autobot?.game;
  if (!g?.kit) { alert("請先進入遊戲（選好職業）再掛機"); return; }
  if (pausedNow()) { try { g.resume(); } catch (e) { console.warn("[D2 工具包] 無法恢復遊戲", e); } }
  setAfk(true);
}
registerToolkitFeature({ id: "afk", label: "掛機", order: 16, open: () => enterAfk() });
let perfPage = null;
function openPerfPage() {
  if (perfPage) return;
  const page = document.createElement("div");
  page.id = "d2perf-page";
  page.style.cssText = "position:fixed;inset:0;z-index:2147483647;overflow:auto;background:#14110d;color:#e8dcc4;font:15px 'Microsoft JhengHei',system-ui,sans-serif;padding:max(12px, env(safe-area-inset-top)) 16px 24px;box-sizing:border-box;touch-action:manipulation";
  for (const ev of ["pointerdown", "mousedown", "touchstart", "keydown"]) page.addEventListener(ev, (e) => e.stopPropagation());
  const head = document.createElement("div");
  head.style.cssText = "display:flex;align-items:center;justify-content:space-between;max-width:520px;margin:0 auto 12px;";
  const title = document.createElement("div");
  title.textContent = "效能";
  title.style.cssText = "font:bold 20px 'Microsoft JhengHei',system-ui,sans-serif;color:#d4a84a";
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.textContent = "關閉";
  closeBtn.style.cssText = "min-height:44px;min-width:72px;padding:0 14px;border:1px solid #d4a84a;border-radius:6px;background:transparent;color:#d4a84a;font:bold 15px 'Microsoft JhengHei',system-ui,sans-serif;cursor:pointer";
  head.append(title, closeBtn);
  const card = document.createElement("div");
  card.style.cssText = "max-width:520px;margin:0 auto;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px 16px;padding:14px 16px;border:1px solid #d4a84a;border-radius:8px;background:rgba(20,17,13,.95);font-variant-numeric:tabular-nums";
  const note = document.createElement("div");
  note.style.cssText = "max-width:520px;margin:10px auto 0;font-size:13px;color:#a89878;line-height:1.5";
  note.textContent = "畫面更新率與影格間隔由本頁面自己的動畫迴圈量測；遊戲暫停時仍會反映當前畫面的負載。數據每 0.5 秒更新。";
  // 優化開關：目前只有掛機一組
  const optCard = document.createElement("div");
  optCard.style.cssText = "max-width:520px;margin:12px auto 0;padding:14px 16px;border:1px solid #d4a84a;border-radius:8px;background:rgba(20,17,13,.95)";
  const addToggle = (group, label, hint, key, onChange) => {
    const row = document.createElement("label");
    row.style.cssText = "display:flex;gap:10px;align-items:flex-start;margin-top:10px;cursor:pointer;min-height:44px";
    const cb = document.createElement("input");
    cb.type = "checkbox"; cb.checked = !!perfOpts[key]; cb.style.cssText = "width:22px;height:22px;margin-top:2px;flex:0 0 auto";
    const txt = document.createElement("div");
    txt.innerHTML = "";
    const l = document.createElement("div"); l.textContent = label; l.style.cssText = "font-weight:bold";
    const h = document.createElement("div"); h.textContent = hint; h.style.cssText = "font-size:13px;color:#a89878;line-height:1.5";
    txt.append(l, h);
    row.append(cb, txt);
    cb.onchange = () => { perfOpts[key] = cb.checked; savePerfOpts(); onChange?.(); };
    optCard.append(row);
    return group;
  };
  const gTitle = (t) => { const d = document.createElement("div"); d.textContent = t; d.style.cssText = "font-weight:bold;color:#d4a84a;margin-top:6px"; optCard.append(d); };
  gTitle("掛機（不需畫面）");
  addToggle(0, "掛機時略過主畫面繪製", "掛機遮罩蓋住畫面時不畫主畫面，遊戲邏輯與淬鍊照常執行；離屏貼圖仍會繪製。", "afkSkipMain");
  page.append(head, card, optCard, note);

  // 指標列：[名稱, 值的更新函式（僅在打開時與每 0.5 秒呼叫）]
  const rows = [];
  const addRow = (label) => {
    const k = document.createElement("div");
    k.textContent = label;
    k.style.cssText = "color:#d4a84a;overflow-wrap:anywhere;min-width:0";
    const v = document.createElement("div");
    v.textContent = "—";
    v.style.cssText = "text-align:right;word-break:break-word";
    card.append(k, v);
    return (text) => { v.textContent = text; };
  };
  const setFps = addRow("畫面更新率（FPS）");
  const setFrame = addRow("影格間隔（平均／最慢）");
  const setLong = addRow("長任務（>50ms，自開啟後）");
  const setHeap = addRow("JS 記憶體（已用／上限）");
  const setDom = addRow("DOM 節點數");
  const setRes = addRow("已載入資源（數量／約略大小）");
  const setLoad = addRow("頁面載入（DOMContentLoaded／load）");
  const setDev = addRow("視窗與裝置");

  // 影格量測：記錄最近 1 秒的 rAF 時間戳。
  const stamps = [];
  let rafId = 0;
  const sampleFrame = (now) => {
    stamps.push(now);
    while (stamps.length && now - stamps[0] > 1000) stamps.shift();
    rafId = requestAnimationFrame(sampleFrame);
  };
  rafId = requestAnimationFrame(sampleFrame);

  // 長任務觀察（Chrome／Edge 支援；其他瀏覽器會顯示不支援）。
  let longCount = 0, longMax = 0, observer = null;
  try {
    observer = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) { longCount++; if (e.duration > longMax) longMax = e.duration; }
    });
    observer.observe({ type: "longtask", buffered: false });
  } catch (e) { observer = null; }

  const nav = performance.getEntriesByType?.("navigation")?.[0];
  const fmtMs = (n) => (Number.isFinite(n) ? Math.round(n) + " ms" : "—");
  const fmtMb = (n) => (Number.isFinite(n) ? (n / 1048576).toFixed(1) + " MB" : "—");
  const fmtKb = (n) => (Number.isFinite(n) ? (n / 1024).toFixed(0) + " KB" : "—");
  setLoad(nav ? fmtMs(nav.domContentLoadedEventEnd) + " ／ " + fmtMs(nav.loadEventEnd) : "不支援");
  setDev(Math.round(innerWidth) + "×" + Math.round(innerHeight) + "，DPR " + devicePixelRatio + (navigator.hardwareConcurrency ? "，" + navigator.hardwareConcurrency + " 核心" : ""));
  if (!observer) setLong("此瀏覽器不支援");

  const update = () => {
    if (stamps.length >= 2) {
      const span = stamps[stamps.length - 1] - stamps[0];
      let worst = 0;
      for (let i = 1; i < stamps.length; i++) worst = Math.max(worst, stamps[i] - stamps[i - 1]);
      setFps(String(stamps.length));
      setFrame((span / (stamps.length - 1)).toFixed(1) + " ms ／ " + worst.toFixed(1) + " ms");
    } else setFps("—");
    if (observer) setLong(longCount + " 次，最長 " + Math.round(longMax) + " ms");
    const m = performance.memory;
    setHeap(m ? fmtMb(m.usedJSHeapSize) + " ／ " + fmtMb(m.jsHeapSizeLimit) : "此瀏覽器不提供");
    setDom(String(document.getElementsByTagName("*").length));
    const res = performance.getEntriesByType?.("resource") || [];
    const bytes = res.reduce((s, e) => s + (e.transferSize || e.encodedBodySize || 0), 0);
    setRes(res.length + " 個 ／ " + fmtKb(bytes));
  };
  update();
  const timer = setInterval(update, 500);

  const close = () => {
    cancelAnimationFrame(rafId);
    clearInterval(timer);
    observer?.disconnect();
    page.remove();
    perfPage = null;
  };
  closeBtn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); close(); };
  perfPage = { close };
  window.__d2perfClose = close;
  document.body.append(page);
}
function renderToolkitMenu() {
  toolkitMenu.textContent = "";
  const list = [...toolkitFeatures.values()].sort((a, b) => a.order - b.order);
  for (const f of list) {
    const item = document.createElement("div");
    item.textContent = f.label;
    item.style.cssText = "padding:10px 16px;min-height:44px;color:#f2e5c6;font:14px 'Microsoft JhengHei',system-ui,sans-serif;cursor:pointer;";
    item.onclick = (e) => { e.preventDefault(); e.stopPropagation(); toolkitMenu.style.display = "none"; try { f.open(); } catch (err) { console.warn("[D2 工具包] 功能失敗：" + f.id, err); } };
    for (const ev of ["pointerdown", "mousedown", "touchstart", "keydown"]) item.addEventListener(ev, (e) => e.stopPropagation());
    toolkitMenu.append(item);
  }
}
launcher.onclick = (e) => { e.preventDefault(); e.stopPropagation(); if (toolkitMenu.style.display === "block") { toolkitMenu.style.display = "none"; return; } renderToolkitMenu(); toolkitMenu.style.display = "block"; };
for (const ev of ["pointerdown", "mousedown", "touchstart", "keydown"]) {
  launcher.addEventListener(ev, (e) => e.stopPropagation());
  toolkitMenu.addEventListener(ev, (e) => e.stopPropagation());
}
document.body.append(launcher, toolkitMenu);
window.__d2editLauncher = launcher;
window.__d2toolkitMenu = toolkitMenu;
// 遊戲的暫停選單畫在 canvas 上：暫停時 body 會加上 frontend-over-run（實測 d2survivors.lol 營地與冒險中皆同）；舊版或其他畫面用 #paused
const pausedNow = () => {
  if (document.body.classList.contains("frontend-over-run") || document.body.classList.contains("frontend-open")) return true;
  const p = document.getElementById("paused");
  return !!p && !p.classList.contains("hidden") && getComputedStyle(p).display !== "none";
};
// 依使用者要求：整個工具讀取完畢前不讓玩家使用，「修改器」按鈕等載入完成才出現。
let toolsReady = false;
// 每 500 毫秒及畫面變動時執行：值相同時不寫入 style，避免無謂的樣式重算
const sync = () => { const v = toolsReady && pausedNow() && !frame ? "block" : "none"; if (launcher.style.display !== v) launcher.style.display = v; if (v === "none" && toolkitMenu.style.display !== "none") toolkitMenu.style.display = "none"; };
let watched = null;
const observer = new MutationObserver(() => {
  const p = document.getElementById("paused");
  if (p && p !== watched) { watched = p; observer.observe(p, { attributes: true, attributeFilter: ["class", "style"] }); }
  sync();
});
observer.observe(document.body, { childList: true, subtree: false, attributes: true, attributeFilter: ["class"] });
const p0 = document.getElementById("paused");
if (p0) { watched = p0; observer.observe(p0, { attributes: true, attributeFilter: ["class", "style"] }); }
const timer = setInterval(sync, 500); // 保險：遊戲用其他方式切換畫面時也會更新
window.__d2editStopWatch = () => { observer.disconnect(); clearInterval(timer); };
sync();
// 輔助器狀態列與語言模組共用同一份繁中字典與遊戲資料 Promise，避免重複下載與解析 891KB 字典。
window.__d2zhUrl = at("lang/zh-TW.json");
const loadZhDict = () => (window.__d2zhPromise ??= hostFetch(window.__d2zhUrl).catch((e) => { window.__d2zhPromise = null; throw e; }));
const loadGameData = () => (window.__d2gamedataPromise ??= hostFetch(at("modifier/gamedata.json")).catch((e) => { window.__d2gamedataPromise = null; throw e; }));
window.__d2changelogPromise ??= fetch("/changelog.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
// 依使用者要求：點書籤後預先讀完輔助器、字典、遊戲資料、物品引擎與修改器頁面，畫面中央顯示進度條；
// 各模組改為並行載入以縮短等待時間，單一步驟失敗不卡住（標示警告後繼續），全部結束才開放「修改器」按鈕。
(async () => {
  window.__d2editLoading?.remove();
  const box = document.createElement("div"), bar = document.createElement("div"), fill = document.createElement("div"), text = document.createElement("div");
  box.style.cssText = "position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:2147483647;width:min(360px,86vw);padding:16px 18px;border:1px solid #d4a84a;border-radius:8px;background:rgba(20,17,13,.95);color:#e8dcc4;font:14px 'Microsoft JhengHei',system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.6)";
  bar.style.cssText = "height:10px;margin-top:10px;border-radius:5px;background:#3a3127;overflow:hidden";
  fill.style.cssText = "height:100%;width:0;background:#d4a84a;transition:width .2s";
  bar.append(fill); box.append(text, bar); document.body.append(box); window.__d2editLoading = box;
  for (const ev of ["pointerdown", "mousedown", "touchstart", "keydown"]) box.addEventListener(ev, (e) => e.stopPropagation());
  let langP = null, botP = null, selfCheckP = null;
  const loadLang = () => (langP ??= import(at("lang/lang.js")));
  const loadBot = () => (botP ??= import(at("helper/autobot.js")));
  const loadSelfCheck = () => (selfCheckP ??= import(at("helper/selfcheck.js")));
  const steps = [
    ["繁中字典", loadZhDict],
    ["遊戲資料", loadGameData],
    ["中文化模組", loadLang],
    ["輔助器", loadBot],
    ["自動淬鍊", async () => { await import(at("helper/autoforge.js")); await import(at("helper/autoforge-ui.js")); }],
    ["物品引擎（遊戲裝備產生器）", () => engine()],
    ["修改器頁面", () => Promise.all([hostFetch(editorUrl(), "text"), backend.assets()])],
    // 自檢與其他步驟並行：載入進度條跑的同時檢查工具包與當前遊戲是否相符；問題只輸出，不阻擋遊玩。
    ["相容性自檢", async () => {
      const { runSelfCheck } = await loadSelfCheck();
      selfCheck = await runSelfCheck({ engine, engineInfo, backend, dict: loadZhDict, gamedata: loadGameData, gameScript: activeGameScript, ready: () => Promise.allSettled([loadLang(), loadBot()]) });
      window.__d2editSelfCheck = selfCheck;
    }],
  ];
  const warn = [];
  let done = 0, selfCheck = null;
  text.textContent = ("D2 倖存者工具載入中（0/") + steps.length + ("）…");
  await Promise.all(steps.map(async ([name, run]) => {
    try { await run(); } catch (err) { warn.push(name); console.warn("載入失敗：" + name, err); }
    done++;
    text.textContent = ("D2 倖存者工具載入中（") + done + "/" + steps.length + ("）：") + name + "…";
    fill.style.width = Math.round(done / steps.length * 100) + "%";
  }));
  fill.style.width = "100%";
  const issues = (selfCheck?.issues || []).filter((i) => i.level !== "info");
  const label = { error: "錯誤", warn: "注意" };
  if (selfCheck?.issues?.length) {
    console.groupCollapsed("[D2 工具包自檢] " + (issues.length ? issues.length + " 項問題" : "通過（僅提示）"));
    for (const i of selfCheck.issues) console[i.level === "error" ? "error" : i.level === "warn" ? "warn" : "info"](`[${i.area}] ${i.msg}`);
    console.groupEnd();
  }
  const problems = [...warn.map((n) => ({ level: "warn", area: n, msg: "載入失敗，相關功能可能無法使用" })), ...issues];
  text.textContent = problems.length
    ? ("載入完成，自檢發現以下問題（不影響繼續遊玩，點一下關閉）：")
    : ("載入完成，自檢通過，按暫停後左上角開啟修改器");
  const dismiss = () => { box.remove(); if (window.__d2editLoading === box) window.__d2editLoading = null; };
  if (problems.length) {
    const list = document.createElement("div");
    list.style.cssText = "margin-top:8px;max-height:40vh;overflow:auto;font-size:13px;line-height:1.5";
    for (const i of problems) {
      const row = document.createElement("div");
      row.style.cssText = "margin-top:4px;color:" + (i.level === "error" ? "#ff8a80" : "#ffcf70");
      row.textContent = `【${label[i.level]}】${i.area}：${i.msg}`;
      list.append(row);
    }
    box.append(list); box.style.cursor = "pointer"; box.addEventListener("click", dismiss);
    fill.style.background = problems.some((i) => i.level === "error") || warn.length ? "#c0504d" : "#e0a030";
  }
  toolsReady = true; sync();
  setTimeout(dismiss, problems.length ? 30000 : 1800);
  // 遊戲若還在選角畫面，掛接檢查當時只能給提示；約 25 秒後補查一次，新發現的問題寫進主控台與結果。
  if (selfCheck?.issues.some((i) => i.level === "info" && (i.area === "輔助器" || i.area === "語言"))) {
    setTimeout(async () => {
      try {
        const { checkGameHook } = await loadSelfCheck();
        // 補查結果取代當時的掛接提示（已掛上的就不再留著「尚未掛上」）。
        const recheck = await checkGameHook(2000), later = recheck.filter((i) => i.level !== "info");
        const stale = selfCheck.issues.filter((i) => i.level === "info" && (i.area === "輔助器" || i.area === "語言"));
        for (const i of stale) selfCheck.issues.splice(selfCheck.issues.indexOf(i), 1);
        selfCheck.issues.push(...recheck);
        if (!later.length) return;
        selfCheck.ok = false;
        for (const i of later) console.warn(`[D2 工具包自檢（進入遊戲後）][${i.area}] ${i.msg}`);
      } catch {}
    }, 25000);
  }
})();
