// D2 Survivors 遊戲內語言模組 (lang.js)
// 支援即時切換遊戲語言（預設繁體中文 zh-TW）、以 MutationObserver 翻譯遊戲 DOM（文字、placeholder、title、aria-label）、
// 樣板替換（數字 -> #/*）、保存原文 WeakMap 以便切回英文 en 還原、略過特定節點與修改器/輔助器 Shadow Host。
(() => {
  "use strict";

  function keepFunctionName(original, replacement) {
    if (typeof original === "function" && typeof replacement === "function" && replacement.name !== original.name) {
      try { Object.defineProperty(replacement, "name", { configurable: true, value: original.name }); } catch {}
    }
    return replacement;
  }

  if (window.__d2lang?.version) return;

  const STORAGE_KEY = "d2lang";
  // 繁體中文統一使用 zh-TW.json；其他語言使用 locales/<code>.json。
  const LOCALES = [
    { code: "zh-TW", name: "繁體中文", base: "zh-TW.json", file: null },
    { code: "en", name: "English (Original)", file: null },
  ];

  // 清單串接用字（新增語言可在此加一行；沒有的語言用 default）
  const LIST_SEP = {
    "zh-TW": { comma: " ", and: " ", or: " / " },
    default: { comma: ", ", and: " & ", or: " / " },
  };

  const registry = new Map();
  let currentLang = "zh-TW";
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) currentLang = saved;
  } catch {}

  // 原始文字與屬性保存（WeakMap），以便切回 en 還原
  const originalTexts = new WeakMap();
  const originalAttrs = new WeakMap(); // Map<string, string> per element
  const translatedTexts = new WeakMap();

  let dict = {};
  let lowerDict = null;
  let numPatterns = null; // { key, val, re }
  let observer = null;
  let batchScheduled = false;
  const pendingNodes = new Set();

  // 取得模組基本路徑（以 lang.js 所在路徑為準）
  const getBaseUrl = () => {
    // 書籤以 import() 載入時沒有 script 標籤：用 d2edit.js 設定的字典網址推出工具所在目錄
    try { if (window.__d2zhUrl) return new URL(".", window.__d2zhUrl).href; } catch {}
    try {
      const scripts = document.querySelectorAll("script[src]");
      for (const s of scripts) {
        if (s.src && s.src.includes("lang.js")) {
          return new URL(".", s.src).href;
        }
      }
    } catch {}
    return new URL(".", window.location.href).href;
  };
  const BASE_URL = getBaseUrl();

  const fontRange = "U+2E80-9FFF, U+F900-FAFF, U+FF00-FFEF, U+3000-303F";
  let installedFaces = [];
  function fontDatabase() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open("d2lang", 1);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains("fonts")) req.result.createObjectStore("fonts"); };
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
    });
  }
  async function fontStorage(mode, value) {
    const db = await fontDatabase();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction("fonts", mode), store = tx.objectStore("fonts");
        const req = mode === "readonly" ? store.get("d2r") : store.put(value, "d2r");
        let result;
        req.onsuccess = () => { result = req.result; };
        tx.oncomplete = () => resolve(result);
        tx.onerror = tx.onabort = () => reject(tx.error);
      });
    } finally { db.close(); }
  }
  async function installFont(bytes, persist = true) {
    try {
      const data = bytes instanceof ArrayBuffer ? bytes : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      const faces = await Promise.all(["D2 Hangul", "D2 Hangul 14", "D2R Kodia", "D2R Iris", "D2L CJK"].map(async family => {
        const face = new FontFace(family, data.slice(0), { unicodeRange: fontRange });
        return face.load();
      }));
      for (const face of installedFaces) document.fonts.delete(face);
      for (const face of faces) document.fonts.add(face);
      installedFaces = faces;
      let style = document.getElementById("d2lang-font-style");
      if (!style) { style = document.createElement("style"); style.id = "d2lang-font-style"; document.head.appendChild(style); }
      const family = getComputedStyle(document.body).fontFamily || "sans-serif";
      if (!style.textContent) style.textContent = `:root body { font-family: ${family}, "D2L CJK"; }
canvas.d2-text, #game-container canvas, #app canvas { filter: contrast(1.18) brightness(1.12); }`;
      if (persist) try { await fontStorage("readwrite", data); } catch (e) { console.warn("[d2lang] 字型儲存失敗", e); }
      clearTextCaches(); redrawStaticCanvases();
      return true;
    } catch (e) { console.warn("[d2lang] 字型載入失敗", e); return false; }
  }

  // 找遊戲模組的網址：網頁版看資源紀錄；桌面版（app:// 協定沒有資源紀錄）從頁面的入口腳本沿 import 往下找。
  // 一定要用頁面載入時的同一個網址 import，才會拿到同一個模組實例。
  // 爬過的網址與待爬佇列跨呼叫保留；找到目標就停（入口檔先引入大量繪圖模組，固定上限會爬不到 translate／lang）
  const assetSeen = new Set(), assetQueue = [];
  let assetStarted = false;
  async function assetUrl(re) {
    const hit = performance.getEntriesByType("resource").map((e) => e.name).find((n) => re.test(n));
    if (hit) return hit;
    const known = [...assetSeen, ...assetQueue].find((n) => re.test(n));
    if (known) return known;
    if (!assetStarted) {
      assetStarted = true;
      assetQueue.push(...[...document.querySelectorAll("script[type=module][src], link[rel=modulepreload][href]")].map((s) => s.src || s.href).filter((u) => /\/assets\//.test(u)));
    }
    while (assetQueue.length && assetSeen.size < 400) {
      const url = assetQueue.shift();
      if (assetSeen.has(url)) continue;
      assetSeen.add(url);
      if (re.test(url)) return url;
      try {
        const src = await (await fetch(url)).text();
        for (const m of src.matchAll(/["'`]\.\/([\w.-]+\.js)["'`]/g)) {
          const next = new URL(m[1], url).href;
          if (re.test(next)) return next;
          if (!assetSeen.has(next)) assetQueue.push(next);
        }
      } catch {}
    }
    return null;
  }

  let capturedGame = null, gameHookPending = false;
  const getGame = () => window.__d2autobot?.game || capturedGame;
  async function captureGame() {
    if (getGame() || gameHookPending) return;
    gameHookPending = true;
    try {
      const url = await assetUrl(/\/Game-[\w-]+\.js(?:\?|$)/);
      if (!url) return;
      const mod = await import(url);
      const Game = Object.values(mod).find(v => typeof v === "function" && typeof v.prototype?.tick === "function");
      if (!Game || Game.prototype.tick.__d2langCapture) return;
      const tick = Game.prototype.tick;
      const wrapped = keepFunctionName(tick, function (...args) { capturedGame = this; return tick.apply(this, args); });
      wrapped.__d2langCapture = true;
      Game.prototype.tick = wrapped;
    } catch (e) { console.warn("[d2lang] 無法取得遊戲物件", e); }
    finally { gameHookPending = false; }
  }

  // 建構樣板快取以加速數字樣板查詢（僅在未載入 GameTranslator 的備援模式時延遲建構）
  function buildPatternIndex(d) {
    dict = d || {};
    lowerDict = null;
    numPatterns = null;
  }
  function ensurePatternIndex() {
    if (lowerDict && numPatterns) return;
    lowerDict = {};
    numPatterns = [];
    if (!dict) return;

    for (const [k, v] of Object.entries(dict)) {
      lowerDict[k.toLowerCase()] = v;
      if (k.includes("#") || k.includes("*")) {
        // 把 # 或 * 替換為數字比對群組
        const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, (m) => {
          if (m === "*" || m === "#") return m;
          return "\\" + m;
        });
        const patternStr = "^" + escaped.replace(/#/g, "(\\d+(?:\\.\\d+)?)").replace(/\\\*/g, "(\\d+(?:\\.\\d+)?)") + "$";
        try {
          const re = new RegExp(patternStr, "i");
          numPatterns.push({ key: k, val: v, re });
        } catch {}
      }
    }
  }

  // 遊戲原生翻譯器（translate-*.js 的類別，遊戲韓文版用的同一套比對：大小寫、# 數字、* 萬用與巢狀、清單分隔）
  // 找得到就用它來查我們的字典；找不到（遊戲改版、測試頁）才用下面的簡易比對
  let GameTranslator = null, gameTr = null;
  const missing = new Set();
  async function loadGameTranslator() {
    try {
      // 網頁版在 translate-*.js；桌面版併在 lang-*.js（tools/desktop-lang.mjs 補了匯出）
      const url = await assetUrl(/\/assets\/translate-[\w-]+\.js(\?|$)/) || await assetUrl(/\/assets\/lang-[\w-]+\.js(\?|$)/);
      if (!url) return;
      const mod = await import(url);
      GameTranslator = Object.values(mod).find((v) => typeof v === "function" && v.prototype && typeof v.prototype.translate === "function" && typeof v.prototype.translateAs === "function") || null;
    } catch (e) { console.warn("[d2lang] 無法使用遊戲翻譯器，改用簡易比對", e); }
  }
  // 原版詞綴英文（冠軍怪、唯一怪的詞綴列）：詞綴之間以單一空白分隔；名稱（怪物、物品）則直接相接
  const TRAIT_EN = new Set(["Cursed", "Aura Enchanted", "Extra Fast", "Extra Strong", "Cold Enchanted", "Fire Enchanted", "Lightning Enchanted", "Mana Burn", "Magic Resistant", "Teleportation", "Spectral Hit", "Stone Skin", "Multiple Shots", "Champion", "Fanatic", "Berserker", "Ghostly", "Possessed", "Demon", "Undead"]);
  const isTrait = (s) => TRAIT_EN.has(s) || /^Immune to (Physical|Magic|Fire|Lightning|Cold|Poison)$/.test(s);
  // 組合規則：遊戲以「 - 」串接的名稱，依原版規則重組（不再用正則替換譯文）
  // 物品「字首 底材 of 字尾」→ 字尾＋字首＋底材；兩個字的稀有名稱 → 兩字分別翻譯
  // 只用字典的精確詞條（不走萬用樣板，免得「Ring of Craftsmanship」這種片段被樣板誤配）
  const up = (s) => s.replace(/\s+/g, " ").trim().toUpperCase();
  const exactOf = (self, kind, s) => self.exact?.get(up(`${kind}:${s}`)) ?? self.exact?.get(up(s)) ?? null;
  // 遊戲把技能名稱串成清單（「A and B」「A, +19% of B」）再代入樣板；萬用樣板至少要 3 個大寫字母，
  // 串接詞撐不起來，逐段翻譯後用中文標點組回（只在本模組的字典上，韓文原版不受影響）
  function composeFind(P) {
    if (typeof P.find !== "function") return;
    const origFind = P.find;
    const itemName = function (e) {
      const words = e.trim().split(/\s+/);
      if (words.length < 2 || words.length > 8 || !words.every((w) => /^(of|the|[A-Z][\w'’-]*)$/.test(w))) return null;
      for (let len = words.length - 1; len >= 1; len--) {
        for (let i = 0; i + len <= words.length; i++) {
          if (/^(of|the)$/.test(words[i])) continue; // 底材不會以 of／the 開頭（否則「Ring of the Lamprey」會把字尾當底材）
          const base = exactOf(this, "item", words.slice(i, i + len).join(" "));
          if (base === null) continue;
          const pre = words.slice(0, i).join(" "), suf = words.slice(i + len).join(" ");
          // 原版只有魔法字尾（of …）會移到最前面；沒有 of 的（怪物稱號、稀有名稱）維持原順序
          if (suf && !/^of /.test(suf)) continue;
          const p = pre ? exactOf(this, "affix", pre) : "", s = suf ? exactOf(this, "affix", suf) : "";
          if (p !== null && s !== null) return cleanCJK(`${s}${p}${base}`);
        }
      }
      if (words.length === 2) {
        const [a, b] = words.map((w) => exactOf(this, "affix", w));
        if (a !== null && b !== null) return cleanCJK(a + b);
      }
      return null;
    };
    P.find = keepFunctionName(origFind, function (e, depth) {
      if (this !== gameTr || depth > 3) return origFind.call(this, e, depth);
      const sep = LIST_SEP[currentLang] || LIST_SEP.default;
      const part = (s) => {
        const m = /^([+-]?\d[\d.,]*%?) of (.+)$/.exec(s.trim());
        if (m) { const n = origFind.call(this, m[2], depth + 1); return n === null ? null : `${n} ${m[1]}`; }
        return origFind.call(this, s.trim(), depth + 1);
      };
      if (e.includes(" - ")) {
        const segs = e.split(" - ").map((s) => s.trim());
        if (segs.every(isTrait)) {
          const tr = segs.map(part);
          if (tr.every((x) => x !== null)) return tr.join(" "); // 不換行空白：cleanCJK 不會刪，寬度同一般空格
        }
        const item = itemName.call(this, segs.join(" "));
        if (item !== null) return item;
        const out = segs.map(part);
        if (out.every((x) => x !== null)) return out.join("");
      }
      // 「底材 of 字尾」整串：萬用樣板會照英文順序翻（戒指八目鰻之），先套物品規則（八目鰻之戒指）
      if (/ of /.test(e)) { const it = itemName.call(this, e); if (it !== null) return it; }
      const r = origFind.call(this, e, depth);
      if (r !== null) return r;
      for (const [re, glue] of [[/, (?:and )?/, sep.comma], [/ and /, sep.and], [/ or /, sep.or]]) {
        if (!re.test(e)) continue;
        const outList = e.split(re).map(part);
        if (outList.every((x) => x !== null)) return outList.join(glue);
      }
      return itemName.call(this, e, depth);
    });
  }
  // 韓文原生流程：只有遊戲本來使用韓文翻譯器時才接管 translate；其他語言只接組合規則，翻譯仍走本模組字典
  let gameHooked = false;
  async function hookGameTranslation() {
    if (gameHooked || !GameTranslator) return;
    try {
      const nativeKo = document.documentElement.lang === "ko";
      const P = GameTranslator.prototype;
      if (nativeKo) {
        const orig = { translate: P.translate, translateAs: P.translateAs, translateMagic: P.translateMagic };
        const via = (name, self, args, raw) => currentLang === "en" || !gameTr ? orig[name].apply(self, args) : orig[name].apply(gameTr, args);
        P.translate = keepFunctionName(orig.translate, function (s) { return cleanCJK(via("translate", this, [s], s)); });
        P.translateAs = keepFunctionName(orig.translateAs, function (kind, s) { return cleanCJK(via("translateAs", this, [kind, s], s)); });
        P.translateMagic = keepFunctionName(orig.translateMagic, function (s, base) { return cleanCJK(via("translateMagic", this, [s, base], s)); });
      }
      composeFind(P);
      document.documentElement.lang = currentLang === "zh-TW" ? "zh-Hant" : currentLang;
      gameHooked = true;
    } catch (e) { console.warn("[d2lang] 無法接上遊戲翻譯流程，只翻譯 DOM 與 Canvas 文字", e); }
  }
  // 遊戲的 D2 點陣字型只認拉丁字元，韓文另以網頁字型畫上（判斷函式只認韓文），其他字元一律畫成「?」。
  // 從遊戲物件找到點陣字型實例，把原型上用到該判斷的方法以相同原始碼重建，判斷改成「韓文或中日文字元／全形標點」。
  const isForeign = (ch) => {
    const c = ch.charCodeAt(0);
    return (c >= 44032 && c <= 55203) || (c >= 12592 && c <= 12687) || (c >= 4352 && c <= 4607) ||
      (c >= 0x2e80 && c <= 0x9fff) || (c >= 0xf900 && c <= 0xfaff) || (c >= 0xff00 && c <= 0xffef);
  };
  let fontCtx = null;
  window.__d2langForeign = isForeign;
  window.__d2langCtx = () => (fontCtx ??= document.createElement("canvas").getContext("2d"));
  let fontPatched = false;
  const CJK_SCALE = 1.25; // 遊戲畫布中文字級倍率
  // 走訪遊戲物件：收集點陣字型的原型，以及畫好的文字畫布快取（Map 的值是 canvas，例如 surface.texts）
  function scanGame(root) {
    const seen = new Set(), queue = [[root, 0]], protos = new Set(), caches = new Set();
    while (queue.length) {
      const [o, d] = queue.shift();
      if (!o || typeof o !== "object" || seen.has(o) || d > 6) continue;
      seen.add(o);
      if (o instanceof Map) {
        const first = o.values().next().value;
        if (typeof HTMLCanvasElement !== "undefined" && first instanceof HTMLCanvasElement && [...o.keys()].every((k) => typeof k === "string")) caches.add(o);
        continue;
      }
      const p = Object.getPrototypeOf(o);
      if (p && typeof p.advanceOf === "function" && typeof p.foreignFont === "function") protos.add(p);
      if (o instanceof Node || ArrayBuffer.isView(o) || Array.isArray(o) && o.length > 500) continue;
      let keys; try { keys = Object.keys(o); } catch { continue; }
      for (const k of keys.slice(0, 300)) { let v; try { v = o[k]; } catch { continue; } if (v && typeof v === "object") queue.push([v, d + 1]); }
    }
    return { protos: [...protos], caches: [...caches] };
  }
  let textCaches = [];
  // 沿用舊畫布的樣式，但寬高依新畫布尺寸按原本的縮放比例重設（換行數不同時才不會被裁掉或拉伸）
  function copyCanvasStyle(from, to) {
    to.className = from.className;
    if (from.style.cssText) to.style.cssText = from.style.cssText;
    // 依原畫布的縮放比例設定大小；寬度不超過原方框（超過就等比例縮小），換行數變多時高度跟著增加、不會被裁掉
    const box = { width: from.offsetWidth || parseFloat(from.style.width) || 0 }, scale = (box.width / from.width) || 1;
    let w = to.width * scale, h = to.height * scale;
    if (box.width > 0 && w > box.width) { h *= box.width / w; w = box.width; }
    to.style.width = `${w}px`; to.style.height = `${h}px`;
  }


  const liveCanvases = new Set();
  // 用記下的原文與參數，以目前語言重畫遊戲建立的文字畫布
  function redrawLiveCanvases() {
    for (const c of [...liveCanvases]) {
      if (!c.isConnected) { liveCanvases.delete(c); continue; }
      const src = c.__d2langSrc; if (!src) continue;
      try {
        const next = src.font.canvas(src.text, ...src.rest);
        if (next instanceof HTMLCanvasElement && next !== c) {
          copyCanvasStyle(c, next);
          c.replaceWith(next); liveCanvases.delete(c);
        }
      } catch {}
    }
  }
  // 記下遊戲最後一次建立升級畫面的參數：即時換語言時請遊戲用同樣參數重建，整張卡片以新語言重畫
  // （卡片的「進化為…」是分段畫的，逐段重畫只能逐字翻）
  let lastLevelUp = null;
  function wrapHud() {
    const hud = getGame()?.hud;
    if (!hud || hud.__d2langWrapped || typeof hud.showLevelUp !== "function") return;
    const orig = hud.showLevelUp;
    hud.showLevelUp = keepFunctionName(orig, function (...args) { lastLevelUp = args; return orig.apply(this, args); });
    hud.__d2langWrapped = true;
  }
  function rebuildScreens() {
    const g = getGame();
    if (g?.state === "levelUp" && lastLevelUp) try { g.hud.showLevelUp(...lastLevelUp); return true; } catch (e) { console.warn("[d2lang] 升級畫面重建失敗", e); }
    return false;
  }
  const replacedCanvases = new Map();
  let cachedFonts = null, cachedFontGame = null;
  function redrawStaticCanvases(target = null) {
    if (!target) {
      for (const [replacement, original] of replacedCanvases) {
        if (replacement.isConnected) replacement.replaceWith(original);
      }
      replacedCanvases.clear();
    }
    const game = getGame(), d2 = game?.hud?.d2;
    if (currentLang === "en" || !d2 || !fontPatched) return;
    let fonts = cachedFontGame === game && cachedFonts?.length ? cachedFonts : null;
    if (!fonts) {
      fonts = [];
      const seen = new Set(), queue = [[game, 0]];
      while (queue.length) {
        const [obj, depth] = queue.shift();
        if (!obj || typeof obj !== "object" || seen.has(obj) || depth > 6 || obj instanceof Node || ArrayBuffer.isView(obj)) continue;
        seen.add(obj);
        if (typeof obj.measure === "function" && typeof obj.canvas === "function") fonts.push(obj);
        if (obj instanceof Map) { for (const value of obj.values()) queue.push([value, depth + 1]); continue; }
        for (const key of Object.keys(obj).slice(0, 300)) try { if (obj[key] && typeof obj[key] === "object") queue.push([obj[key], depth + 1]); } catch {}
      }
      if (fonts.length) { cachedFonts = fonts; cachedFontGame = game; }
    }
    for (const canvas of target ? [target] : document.querySelectorAll("canvas.d2-text")) try {
      if (!canvas.isConnected || replacedCanvases.has(canvas)) continue;
      const text = [...canvas.childNodes].map(n => originalTexts.get(n) ?? n.textContent).join("");
      if (!/[A-Za-z]/.test(text) || translateString(text) === text) continue;
      let font;
      const saved = currentLang;
      // 帶陰影的畫布寬高各多 1 像素；多行的高度是行高的倍數，所以只比對單行寬度與高度的誤差
      let shadow = false;
      try {
        currentLang = "en";
        // 依原版換行規則（含「 · 」分隔的提示會一段一行）試兩種：不換行、以畫布寬度換行
        font = fonts.find(f => { try {
          for (const lines of [text.split("\n"), f.wrapLines(text, canvas.width)]) {
            const w = Math.max(...lines.map((l) => f.measure(l))), h = lines.length * f.lineHeight - (f.lineHeight - f.info.height);
            if (Math.abs(w - canvas.width) <= 2 && Math.abs(h - canvas.height) <= 2) { shadow = canvas.width === w + 1; return true; }
          }
          return false;
        } catch { return false; } });
      }
      finally { currentLang = saved; }
      if (!font) continue;
      let color = null;
      try {
        const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
        const counts = new Map();
        for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3] > 200) {
          const rgb = (pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2];
          counts.set(rgb, (counts.get(rgb) || 0) + 1);
        }
        const dominant = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
        for (const table of [d2, game.ui?.colors]) for (const [key, value] of Object.entries(table || {})) {
          if (typeof value === "number" && (value & 0xffffff) === dominant) color = value;
          if (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) && parseInt(value.slice(1), 16) === dominant) color = value;
        }
      } catch {}
      const next = font.canvas(translateString(text), { color, align: "center", maxWidth: canvas.width, balance: true, shadow });
      if (next instanceof HTMLCanvasElement) {
        copyCanvasStyle(canvas, next);
        // 重畫時傳入的是譯文，原文要記成英文，切回 English 才畫得回來
        if (next.__d2langSrc) next.__d2langSrc.text = text;
        canvas.replaceWith(next); replacedCanvases.set(next, canvas);
      }
    } catch (e) { console.warn("[d2lang] 畫布重畫失敗", e); }
  }
  // 換語言後讓已快取的文字畫布重畫
  function clearTextCaches() { for (const m of textCaches) try { m.clear(); } catch {} }
  function patchBitmapFont() {
    if (fontPatched) return true;
    const game = getGame();
    if (!game) return false;
    const { protos, caches } = scanGame(game);
    if (!protos.length) return false;
    textCaches = caches;
    wrapHud();
    let ok = false;
    for (const P of protos) ok = patchFontProto(P) || ok;
    if (!ok) return false;
    fontPatched = true;
    return true;
  }
  function patchFontProto(P) {
    if (P.__d2langPatched) return true;
    const adv = String(P.advanceOf);
    const isName = /if\(!(\w+)\(e\)\)return/.exec(adv)?.[1], ctxName = /let \w+=(\w+)\(\);\w+\.font=this\.foreignFont/.exec(adv)?.[1];
    if (!isName) return false;
    for (const name of Object.getOwnPropertyNames(P)) {
      const orig = P[name];
      if (typeof orig !== "function" || name === "constructor") continue;
      const src = String(orig);
      // 判斷函式可能被直接呼叫或當參數傳（例如 [...t].some(判斷)），識別字出現處全部換掉
      const ident = new RegExp(`(?<![\\w$.])${isName}(?![\\w$])`, "g");
      if (!ident.test(src) || /^(get|set|async|static)\s/.test(src)) continue;
      let body = src.replace(ident, "window.__d2langForeign");
      if (ctxName) body = body.replace(new RegExp(`\\b${ctxName}\\(\\)`, "g"), "window.__d2langCtx()");
      let rebuilt;
      try { rebuilt = new Function(`return function ${body}`)(); } catch { continue; }
      let broken = false;
      P[name] = keepFunctionName(orig, function (...a) {
        if (!broken) try { return rebuilt.apply(this, a); } catch (e) { broken = true; console.warn("[d2lang] 點陣字型方法還原原版：" + name, e); }
        return orig.apply(this, a);
      });
    }
    // 中文等外文字：原版只在點陣字型本身有描邊時才加外框，戰鬥中的世界文字（區域名、地上物品、拾取金幣）
    // 因此是無框細字，壓在亮的技能特效上看不清。非英文時改用粗體，並先畫一圈深色描邊。
    if (typeof P.foreignFont === "function" && typeof P.drawForeign === "function") {
      const origFont = P.foreignFont, origDraw = P.drawForeign;
      P.foreignFont = keepFunctionName(origFont, function (...a) {
        let f = origFont.apply(this, a);
        // 中文字級放大：原版字級是為韓文算的，中文筆畫多、偏小。記下原字級，依語言切換倍率（寬度快取一併清掉）
        if (this.foreignSize) {
          this.__d2langBase ??= this.foreignSize;
          // 小字畫布有固定高度；放大超過畫布會裁掉筆畫並擠壓角色屬性頁。
          const want = currentLang === "en" ? this.__d2langBase : Math.min(Math.round(this.__d2langBase * CJK_SCALE), this.info?.height || Infinity);
          if (this.foreignSize !== want) {
            this.foreignSize = want;
            try { this.foreignWidths?.clear?.(); } catch {}
            f = f.replace(/\d+px/, `${want}px`);
          }
        }
        if (currentLang === "en" || /^bold /.test(f)) return f;
        // 寬度快取是用原本字重量的，第一次換粗體時清掉重量
        if (!this.__d2langBold) { this.__d2langBold = true; try { this.foreignWidths?.clear?.(); } catch {} }
        return "bold " + f;
      });
      const RING = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];
      P.drawForeign = keepFunctionName(origDraw, function (ctx, text, x, y, ...rest) {
        if (currentLang !== "en" && ctx && typeof text === "string") try {
          const foreign = window.__d2langForeign;
          if ([...text].some(foreign)) {
            ctx.font = this.foreignFont(); ctx.textBaseline = "alphabetic";
            const s = this.foreignSize >= 28 ? 2 : 1;
            ctx.fillStyle = "rgba(0,0,0,0.9)";
            for (const [dx, dy] of RING) {
              let cx = x;
              for (const ch of text) { if (foreign(ch)) ctx.fillText(ch, cx + dx * s, y + this.baseline + dy * s); cx += this.advanceOf(ch); }
            }
          }
        } catch {}
        return origDraw.call(this, ctx, text, x, y, ...rest);
      });
    }
    // 有些文字在書籤載入前就已取得英文並快取（例如 D2 資料檔的「Level Up」），畫字的入口再翻一次
    for (const name of ["canvas", "width", "wrap", "balance"]) {
      const orig = P[name];
      if (typeof orig !== "function") continue;
      P[name] = keepFunctionName(orig, function (text, ...rest) {
        const raw = text, out = orig.call(this, typeof text === "string" && currentLang !== "en" ? translateString(text) : text, ...rest);
        // 記下原文與繪製參數，換語言（含切回 English）時可原地以新語言重畫，不必重新整理
        if (name === "canvas" && typeof raw === "string" && out instanceof HTMLCanvasElement) {
          // 點陣圖與瀏覽器文字混畫後同步讀取，避免部分環境批次繪製時出現黑塊。
          if (currentLang !== "en" && HAS_CJK.test(out.textContent || "")) {
            try { out.getContext("2d")?.getImageData(0, 0, 1, 1); } catch {}
          }
          out.__d2langSrc = { font: this, text: raw, rest }; liveCanvases.add(out);
        }
        return out;
      });
    }
    // 原版換行只在空白處斷行（英文、韓文有空白），中文整句沒有空白會變成一行而超出版面：
    // 含中日文字時改成逐字也可斷行（標點不放行首）
    if (typeof P.wrapLines === "function") {
      const origWrap = P.wrapLines;
      const CJK = /[⺀-鿿豈-﫿＀-￯　-〿]/, NO_HEAD = /^[，。、：；！？）」』】〉》,.:;!?)·]/;
      P.wrapLines = keepFunctionName(origWrap, function (text, max) {
        if (typeof text !== "string" || !CJK.test(text) || !(max > 0)) return origWrap.call(this, text, max);
        const out = [];
        const fits = (t) => this.measure(t) <= max;
        for (const para of text.split("\n")) {
          // 有「 · 」分隔的提示（例如商店操作說明）：跟原版一樣以分隔處為單位排行，整段放得下就不拆
          const parts = para.split(" · ");
          if (parts.length > 1 && parts.every(fits)) {
            let line = "";
            for (const part of parts) {
              const next = line ? `${line} · ${part}` : part;
              if (line && !fits(next)) { out.push(line); line = part; } else line = next;
            }
            out.push(line);
            continue;
          }
          // 切成：連續拉丁字（含空白後綴）或單一中日文字
          const tokens = para.match(/[⺀-鿿豈-﫿＀-￯　-〿]|[^⺀-鿿豈-﫿＀-￯　-〿\s]+\s*|\s+/g) || [""];
          let line = "";
          for (const t of tokens) {
            const next = line + t;
            if (line && this.measure(next.trimEnd()) > max && !NO_HEAD.test(t)) { out.push(line.trimEnd()); line = t.trimStart(); }
            else line = next;
          }
          out.push(line.trimEnd());
        }
        return out;
      });
    }
    P.__d2langPatched = true;
    return true;
  }

  const CJK_PUNCT = /[，,、]/, CJK_PUNCT_ALL = /[，,、]+/g, MULTI_SPACE = /[^\S ]{2,}/g;
  const CJK_CHAR = /[\u4e00-\u9fa5\u3400-\u4dbf]/, CJK_GAP = /([\u4e00-\u9fa5\u3400-\u4dbf])[^\S\u00a0]+(?=[\u4e00-\u9fa5\u3400-\u4dbf])/g;
  // 淨化中文字串：移除怪物名稱中文字之間的空格、精英怪屬性中間的逗號／頓號
  function cleanCJK(str) {
    if (!str || typeof str !== "string" || currentLang === "en") return str;
    let s = str;
    // 將逗號、頓號替換為空格，多餘空格縮減
    if (CJK_PUNCT.test(s)) {
      s = s.replace(CJK_PUNCT_ALL, " ").replace(MULTI_SPACE, " ").trim();
    }
    // 移除中文字（CJK字元）之間的空格，保留中英或數字之間的合理空格；以前瞻一次處理連續字元，免重複掃描
    if (CJK_CHAR.test(s)) s = s.replace(CJK_GAP, "$1");
    return s;
  }
  function useDict(d) {
    buildPatternIndex(d);
    cache.clear();
    gameTr = null;
    if (GameTranslator && d && Object.keys(d).length) try { gameTr = new GameTranslator([d]); } catch { gameTr = null; }
  }
  const cache = new Map();
  const HAS_LETTER = /[A-Za-z]/, HAS_CJK = /[　-鿿가-힣＀-￯]/;
  function translateString(str) {
    if (!str || typeof str !== "string" || currentLang === "en" || !HAS_LETTER.test(str)) return str;
    let r = cache.get(str);
    if (r !== undefined) return r;
    const look = (s) => (gameTr ? gameTr.translate(s) : simpleTranslate(s));
    const synergyList = (s) => {
      const segs = s.split(/,\s*(?=\+)/);
      if (segs.length < 2) return null;
      const out = [];
      for (const seg of segs) {
        const m = /^\+(\d+(?:\.\d+)?)% (?:damage per level of|of) (.+)$/.exec(seg.trim());
        if (!m) return null;
        const name = m[2].trim(), zh = look(name);
        if (zh === name || !/[一-鿿]/.test(zh)) return null;
        out.push(`${zh}每級傷害 +${m[1]}%`);
      }
      return out.join("；");
    };
    // 整句完全相符時直接用字典原文：遊戲翻譯器在原文沒有換行時會把譯文的換行刪掉，版面需要的換行就沒了
    const key = str.trim(), exact = Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : undefined;
    // 版本號後面帶雜湊（例如「Build 20261101.1 ·4e657e90」）：只換「Build」字樣，譯文放在字典鍵「Build (version)」
    const build = /^(\s*)Build (\d+(?:\.\d+)*)(\s*·\s*[a-f\d]+)(\s*)$/i.exec(str), word = dict["Build (version)"];
    // 怪物名優先：與技能等一般詞條同名的怪物（Horror、Slayer、Blood Wing、Plague Bearer）也要翻成怪物譯名
    const mon0 = gameTr?.translateAs && /^[A-Z][A-Za-z' -]{1,40}$/.test(key) ? gameTr.translateAs("monster", key) : null;
    if (mon0 && mon0 !== key) r = str.replace(key, mon0);
    else if (typeof exact === "string" && exact) r = str.replace(key, exact);
    else if (build && word) r = build[1] + word + " " + build[2] + build[3] + build[4];
    // 技能的多段數值列表（遊戲執行時組合）：「+19% damage per level of Frost Nova, +19% of Ice Blast, …」
    // 逐段查技能名，每段譯成「技能名每級傷害 +N%」，段與段以「；」相接（中文逗號會被 cleanCJK 刪除）。
    // 任一段查不到技能名就放棄，改走一般流程，避免譯出半中半英
    else if (synergyList(key) !== null) r = str.replace(key, synergyList(key));
    else {
      r = look(str);
      // 遊戲用空白串起來的整行（例如 Boss 詞綴 "Demon Extra Strong Aura Enchanted"）整句查不到時，逐段查字典再接回
      // 原版在韓文模式下才會逐項翻譯，中文模式會原樣保留英文
      if (r === str && /^[A-Za-z][A-Za-z' -]*$/.test(str.trim()) && str.includes(" ")) {
        const words = str.trim().split(/\s+/);
        // 冠軍怪、唯一怪的屬性列（遊戲把各屬性以空白串起）：逐項切開，屬性之間保留一個空格（不換行空白，cleanCJK 不刪）
        const traits = [];
        for (let i = 0; i < words.length;) {
          let j = Math.min(words.length, i + 4);
          while (j > i && !isTrait(words.slice(i, j).join(" "))) j--;
          if (j === i) { traits.length = 0; break; }
          traits.push(words.slice(i, j).join(" ")); i = j;
        }
        const tr = traits.map((t) => look(t));
        if (traits.length > 1 && tr.every((t, k) => t !== traits[k])) { r = tr.join("\u00a0"); words.length = 0; }
        const parts = [];
        for (let i = 0; i < words.length;) {
          let hit = null, used = 1;
          for (let j = words.length; j > i; j--) {
            const cand = words.slice(i, j).join(" "), t = look(cand);
            if (t !== cand) { hit = t; used = j - i; break; }
          }
          parts.push(hit ?? words[i]);
          i += used;
        }
        // 中文字之間的空白會被 cleanCJK 刪掉，所以改用「 · 」分隔（與遊戲其他清單一致）
        // 全部譯好的名稱（怪物名＋稱號等）照原版直接相接；仍夾英文時才用空格（不再用「 · 」，點陣字型會畫成「-」）
        if (words.length && parts.join(" ") !== words.join(" ")) r = parts.some((p) => /[A-Za-z]/.test(p)) ? parts.join(" ") : parts.join("");
      }
    }
    // 怪物類型名（例如冠軍怪標題「Enslaved」）在字典裡以 monster: 前綴存放，遊戲畫面直接用原名畫出時要補查
    if (r === str && gameTr?.translateAs && /^[A-Z][A-Za-z' -]{1,40}$/.test(str.trim())) {
      const mon = gameTr.translateAs("monster", str.trim());
      if (mon && mon !== str.trim()) r = str.replace(str.trim(), mon);
    }
    // 已含中日韓文字的（我們自己的工具介面、已翻好的）不算缺漏
    // 缺漏清單只供除錯，限制數量避免長時間遊玩（例如持續變動的數字字串）讓記憶體無限成長
    if (r === str && missing.size < 5000 && str.trim().length > 1 && !HAS_CJK.test(str)) missing.add(str.trim());
    r = cleanCJK(r);
    if (cache.size > 20000) cache.clear();
    cache.set(str, r);
    return r;
  }

  // 簡易比對（備援）
  function simpleTranslate(str) {
    if (!str || typeof str !== "string") return str;
    const trimmed = str.trim();
    if (!trimmed || !dict) return str;
    ensurePatternIndex();

    // 1. 精確比對
    if (dict[trimmed] !== undefined) {
      return str.replace(trimmed, dict[trimmed]);
    }

    // 2. 不分大小寫比對
    const lower = trimmed.toLowerCase();
    if (lowerDict[lower] !== undefined) {
      return str.replace(trimmed, lowerDict[lower]);
    }

    // 3. 含數字樣板比對
    const nums = trimmed.match(/\d+(?:\.\d+)?/g);
    if (nums && nums.length > 0) {
      // 快速替換為 # 查字典
      const tHash = trimmed.replace(/\d+(?:\.\d+)?/g, "#");
      if (dict[tHash] !== undefined) {
        const res = dict[tHash].replace(/\{(\d+)\}/g, (_, i) => nums[i] ?? "");
        return str.replace(trimmed, res);
      }
      const tHashLower = tHash.toLowerCase();
      if (lowerDict[tHashLower] !== undefined) {
        const res = lowerDict[tHashLower].replace(/\{(\d+)\}/g, (_, i) => nums[i] ?? "");
        return str.replace(trimmed, res);
      }
      // 快速替換為 * 查字典
      const tStar = trimmed.replace(/\d+(?:\.\d+)?/g, "*");
      if (dict[tStar] !== undefined) {
        const res = dict[tStar].replace(/\{(\d+)\}/g, (_, i) => nums[i] ?? "");
        return str.replace(trimmed, res);
      }
      const tStarLower = tStar.toLowerCase();
      if (lowerDict[tStarLower] !== undefined) {
        const res = lowerDict[tStarLower].replace(/\{(\d+)\}/g, (_, i) => nums[i] ?? "");
        return str.replace(trimmed, res);
      }
      // 正規式 fallback 比對樣板清單
      for (let j = 0; j < numPatterns.length; j++) {
        const p = numPatterns[j];
        const m = trimmed.match(p.re);
        if (m) {
          const vals = m.slice(1);
          const res = p.val.replace(/\{(\d+)\}/g, (_, i) => vals[i] ?? "");
          return str.replace(trimmed, res);
        }
      }
    }

    return str;
  }

  // 判定是否略過節點
  function shouldSkip(node) {
    if (!node) return true;
    const parent = node.nodeType === 3 ? node.parentNode : node;
    if (!parent) return true;
    const tag = parent.tagName ? parent.tagName.toUpperCase() : "";
    if (tag === "SCRIPT" || tag === "STYLE" || tag === "CODE" || tag === "PRE" || tag === "CANVAS") return true;

    // 略過我們自己的輔助器與修改器介面、語言選擇按鈕
    if (parent.closest?.("#d2autobot-panel, #d2autobot-launcher, #d2autobot-status, #d2lang-menu, #d2lang-btn") ||
        parent.id === "d2autobot-panel" || parent.id === "d2lang-menu" || parent.id === "d2lang-btn") {
      return true;
    }
    // 略過 iframe（修改器內部）
    if (tag === "IFRAME") return true;
    return false;
  }

  const ATTRS = ["placeholder", "title", "aria-label"];

  // 處理單一節點翻譯
  function processNode(node) {
    if (shouldSkip(node)) return;

    if (node.nodeType === 3) { // Text Node
      if (node.parentNode?.tagName === "TEXTAREA" || node.parentNode?.tagName === "INPUT") return;
      const curVal = node.nodeValue;
      if (!curVal || !curVal.trim()) return;

      if (currentLang === "en") {
        if (originalTexts.has(node)) {
          const orig = originalTexts.get(node);
          if (node.nodeValue !== orig) node.nodeValue = orig;
        }
        return;
      }

      // 如果尚未記錄原文，先記錄
      if (!originalTexts.has(node)) {
        originalTexts.set(node, curVal);
      }
      const original = originalTexts.get(node);
      const translated = translateString(original);
      if (translated !== curVal) {
        node.nodeValue = translated;
        translatedTexts.set(node, translated);
      }
      return;
    }

    if (node.nodeType === 1) { // Element Node
      for (const attr of ATTRS) {
        if (node.hasAttribute(attr)) {
          const curVal = node.getAttribute(attr);
          if (!curVal || !curVal.trim()) continue;

          let map = originalAttrs.get(node);
          if (!map) {
            map = new Map();
            originalAttrs.set(node, map);
          }

          if (currentLang === "en") {
            if (map.has(attr)) {
              const orig = map.get(attr);
              if (node.getAttribute(attr) !== orig) node.setAttribute(attr, orig);
            }
          } else {
            if (!map.has(attr)) {
              map.set(attr, curVal);
            }
            const orig = map.get(attr);
            const translated = translateString(orig);
            if (translated !== curVal) {
              node.setAttribute(attr, translated);
            }
          }
        }
      }

      for (let child = node.firstChild; child; child = child.nextSibling) {
        processNode(child);
      }
    }
  }

  function flushBatch() {
    batchScheduled = false;
    const nodes = Array.from(pendingNodes);
    pendingNodes.clear();
    for (const node of nodes) {
      processNode(node);
    }
  }

  function scheduleBatch(node) {
    pendingNodes.add(node);
    if (!batchScheduled) {
      batchScheduled = true;
      requestAnimationFrame(flushBatch);
    }
  }

  function startObserver() {
    if (observer) return;
    observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "characterData") {
          // 若是我們自己剛更新的值，跳過避免循環
          if (m.target && translatedTexts.get(m.target) === m.target.nodeValue) {
            continue;
          }
          scheduleBatch(m.target);
        } else if (m.type === "attributes") {
          scheduleBatch(m.target);
        } else if (m.type === "childList") {
          for (let i = 0; i < m.addedNodes.length; i++) {
            scheduleBatch(m.addedNodes[i]);
          }
        }
      }
    });

    if (document.body) {
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ATTRS,
      });
      processNode(document.body);
    }
  }

  // 語言載入與登錄
  const api = {
    version: 1,
    register(code, { name, dict: customDict }) {
      registry.set(code, { name, dict: customDict || null });
    },
    async set(code) {
      if (!registry.has(code)) return;
      currentLang = code;
      try { localStorage.setItem(STORAGE_KEY, code); } catch {}

      if (code === "en") {
        useDict({});
      } else {
        const item = registry.get(code);
        if (!item.dict) item.dict = await loadLocale(code);
        useDict(item.dict);
        // 從 English 即時切換過來：字典備好後才接上遊戲翻譯流程
        if (!gameHooked && fontPatched) await hookGameTranslation();
      }
      missing.clear();

      // 同步設定到 window.LANG 與修改器
      window.LANG = code === "zh-TW" ? "zh" : code;
      try { localStorage.setItem("d2se:lang", window.LANG); } catch {}

      // 觸發全頁重新套用翻譯
      if (document.body) {
        processNode(document.body);
      }
      clearTextCaches();
      rebuildScreens();
      redrawLiveCanvases();
      redrawStaticCanvases();
      updateButtonText();
    },
    get() {
      return currentLang;
    },
    list() {
      return Array.from(registry.entries()).map(([code, data]) => ({ code, name: data.name }));
    },
    translate: translateString,
    useFontBytes: installFont,
    // 測試與除錯用：目前掛接到的遊戲物件（沒有輔助器的桌面版也能取得）
    game: () => getGame(),
    debug: () => ({ translator: !!GameTranslator, gameTr: !!gameTr, fontPatched, gameHooked, game: !!getGame(), assets: assetSeen.size }),
    // 目前畫面上出現過、字典沒有的英文（遊戲更新後找缺漏用：copy(__d2lang.missing().join("\n"))）
    // 排除本模組自己的語言選單（語言名稱本來就以各自的語言顯示）
    missing() { const own = [...registry.values()].map((r) => r.name); return [...new Set([...missing, ...(gameTr?.missing ?? [])])].filter((s) => !/[　-鿿가-힣＀-￯]/.test(s) && !own.some((n) => s.includes(n))); },
  };

  // 讀語言檔：base 大字典 + file 補充（後者覆蓋前者）
  async function loadLocale(code) {
    const conf = LOCALES.find((l) => l.code === code) || { file: `locales/${code}.json` };
    const out = {};
    for (const f of [conf.base, conf.file]) {
      if (!f) continue;
      try {
        if (f === "zh-TW.json" && window.__d2zhPromise) {
          const shared = await window.__d2zhPromise;
          if (shared && typeof shared === "object") { Object.assign(out, shared); continue; }
        }
        const res = await fetch(new URL(f, BASE_URL).href);
        if (res.ok) Object.assign(out, await res.json());
        else console.warn("[d2lang] 載入語言檔失敗: " + f, res.status);
      } catch (err) { console.warn("[d2lang] 載入語言檔失敗: " + f, err); }
    }
    return out;
  }

  // 遊戲畫在 Canvas 上的文字（PixiJS 以 2D context 量字與繪字）：量與畫都換成譯文，寬度才一致
  for (const C of [window.CanvasRenderingContext2D, window.OffscreenCanvasRenderingContext2D]) {
    if (!C) continue;
    for (const fn of ["fillText", "strokeText", "measureText"]) {
      const orig = C.prototype[fn];
      if (typeof orig !== "function") continue;
      C.prototype[fn] = keepFunctionName(orig, function (text, ...rest) {
        if (currentLang !== "en" && typeof text === "string" && text.length > 1) text = translateString(text);
        return orig.call(this, text, ...rest);
      });
    }
  }

  // 註冊內建語言
  for (const loc of LOCALES) {
    registry.set(loc.code, { name: loc.name, dict: null });
  }

  window.__d2lang = api;

  // 檢查遊戲暫停狀態（與 autobot 同判定：#paused 可見或 body.frontend-over-run）
  const pausedNow = () => {
    if (document.body.classList.contains("frontend-over-run") || document.body.classList.contains("frontend-open")) return true;
    const p = document.getElementById("paused");
    return !!p && !p.classList.contains("hidden") && getComputedStyle(p).display !== "none";
  };

  // 建立左上角的語言按鈕與下拉選單
  let btn = null;
  let menu = null;

  function updateButtonText() {
    if (!btn) return;
    btn.textContent = "語言";
    btn.setAttribute("aria-label", "語言");
  }

  function createUI() {
    if (btn) return;

    btn = document.createElement("button");
    btn.id = "d2lang-btn";
    btn.type = "button";
    updateButtonText();
    btn.style.cssText = "position:fixed;top:calc(max(12px, env(safe-area-inset-top)) + 50px);left:max(12px, env(safe-area-inset-left));z-index:2147483646;display:none;" +
      "padding:8px 14px;min-height:44px;border:1px solid #d4a84a;border-radius:6px;background:rgba(20,17,13,.95);color:#d4a84a;" +
      "font:bold 15px 'Microsoft JhengHei',system-ui,sans-serif;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.5);touch-action:manipulation;";

    menu = document.createElement("div");
    menu.id = "d2lang-menu";
    menu.style.cssText = "position:fixed;top:calc(max(12px, env(safe-area-inset-top)) + 50px);left:min(calc(max(12px, env(safe-area-inset-left)) + 84px), calc(100vw - 210px));max-width:calc(100vw - 24px);max-height:calc(100dvh - 64px);overflow:auto;z-index:2147483647;display:none;" +
      "background:rgba(20,17,13,.98);border:1px solid #d4a84a;border-radius:6px;min-width:140px;padding:4px 0;box-shadow:0 6px 16px rgba(0,0,0,0.6);touch-action:manipulation;";

    function renderMenu() {
      menu.innerHTML = "";
      for (const loc of api.list()) {
        const item = document.createElement("div");
        item.textContent = (loc.code === currentLang ? "✓ " : "  ") + loc.name;
        item.style.cssText = "padding:8px 16px;color:#f2e5c6;font:14px system-ui,sans-serif;cursor:pointer;transition:background .15s;";
        item.onmouseenter = () => { item.style.background = "#3a3127"; };
        item.onmouseleave = () => { item.style.background = "transparent"; };
        item.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          menu.style.display = "none";
          if (loc.code === currentLang) return;
          // 從原文 English 換成其他語言：即時切換，重建目前畫面並重畫畫面上的文字（不必重新整理、網頁版也不必再點書籤）。
          // 從翻譯換成其他語言（含回到 English）：遊戲很多文字在建立時就已翻好、沒有原文可還原，
          // 跟遊戲原生的語言切換一樣重新整理；桌面版重新整理後會自動再載入本模組，網頁版重新整理後就是原版英文
          try { localStorage.setItem(STORAGE_KEY, loc.code); } catch {}
          // 遊戲的文字畫布都記下了原文，任何方向都即時切換；只有接不上遊戲（例如遊戲改版）時才重新整理
          if (fontPatched || loc.code !== "en") { api.set(loc.code); return; }
          location.reload();
        };
        for (const ev of ["pointerdown", "mousedown", "touchstart", "keydown"]) {
          item.addEventListener(ev, (e) => e.stopPropagation());
        }
        menu.appendChild(item);
      }
      for (const [mode, label] of [["top", "比較框上方並列"], ["game", "比較框原版位置"]]) {
        const layoutItem = document.createElement("div");
        layoutItem.textContent = (tipLayout === mode ? "✓ " : "  ") + label;
        layoutItem.style.cssText = "padding:8px 16px;color:#f2e5c6;font:14px system-ui,sans-serif;cursor:pointer;";
        layoutItem.onclick = (e) => {
          e.preventDefault(); e.stopPropagation(); menu.style.display = "none";
          setTipLayout(mode);
        };
        for (const ev of ["pointerdown", "mousedown", "touchstart", "keydown"]) {
          layoutItem.addEventListener(ev, (e) => e.stopPropagation());
        }
        menu.appendChild(layoutItem);
      }
      const fontItem = document.createElement("div");
      fontItem.textContent = "使用 D2R 原版字型…";
      fontItem.style.cssText = "padding:8px 16px;color:#f2e5c6;font:14px system-ui,sans-serif;cursor:pointer;";
      fontItem.onclick = async (e) => {
        e.preventDefault(); e.stopPropagation(); menu.style.display = "none";
        try {
          const root = await window.showDirectoryPicker();
          const mod = await import(new URL("./d2rfont.js", BASE_URL).href);
          await installFont(await mod.extractD2rFont(root));
        } catch (err) { if (err.name !== "AbortError") console.warn("[d2lang] 無法讀取 D2R 字型", err); }
      };
      menu.appendChild(fontItem);
    }

    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (menu.style.display === "block") {
        menu.style.display = "none";
      } else {
        renderMenu();
        menu.style.display = "block";
      }
    };

    for (const ev of ["pointerdown", "mousedown", "touchstart", "keydown"]) {
      btn.addEventListener(ev, (e) => e.stopPropagation());
      menu.addEventListener(ev, (e) => e.stopPropagation());
    }

    document.addEventListener("click", () => {
      if (menu) menu.style.display = "none";
    });

    document.body.appendChild(btn);
    document.body.appendChild(menu);

    const syncBtn = () => {
      const isPaused = pausedNow(), want = isPaused ? "block" : "none";
      // 每 300 毫秒執行：值相同時不寫入 style，避免無謂的樣式重算
      if (btn.style.display !== want) btn.style.display = want;
      if (!isPaused && menu && menu.style.display !== "none") menu.style.display = "none";
    };

    setInterval(syncBtn, 300);
    syncBtn();
    requestAnimationFrame(tipLoop);
  }

  // ===== 裝備比較框排版（觸控裝置）=====
  // 遊戲把物品框 #tooltip 與比較框 .worn-box 放在物品旁邊，手機上會蓋住下方的「丟下／出售／移動」鍵。
  // 預設改為：可見的框上緣對齊畫面上方、並排放在一起，縮放到不超過按鈕上緣；可在「語言」選單切回原版位置。
  const TIP_LAYOUT_KEY = "d2lang:tipLayout";
  let tipLayout = "top";
  try { if (localStorage.getItem(TIP_LAYOUT_KEY) === "game") tipLayout = "game"; } catch {}
  const tipTouched = new Set();
  // 遊戲原本排出的縮放（以它實際畫出的寬度 ÷ 版面寬度量得）；我們自己寫入的 transform 不會被當成遊戲的值
  const tipNatural = new WeakMap();
  const tipOwnTf = new WeakMap();

  // 純函式（不碰 DOM）：boxes 為未縮放的版面尺寸 {w, h}；回傳共用縮放、各框 left 與共同 top
  function planTipLayout({ vw, top, bottom, base = 1, gap = 6, margin = 8, boxes }) {
    const n = boxes.length;
    if (!n) return { scale: base, top, lefts: [] };
    const sumW = boxes.reduce((a, b) => a + b.w, 0) || 1;
    const maxH = Math.max(1, ...boxes.map((b) => b.h));
    const availW = vw - margin * 2 - gap * (n - 1);
    const availH = bottom - top;
    const scale = Math.max(0.1, Math.min(base, availW / sumW, availH / maxH));
    const total = sumW * scale + gap * (n - 1);
    let x = Math.max(margin, (vw - total) / 2);
    const lefts = boxes.map((b) => {
      const left = x;
      x += b.w * scale + gap;
      return left;
    });
    return { scale, top, lefts };
  }

  function tipVisibleBoxes() {
    const list = [];
    const tip = document.getElementById("tooltip");
    if (tip) list.push(tip);
    for (const w of document.querySelectorAll(".worn-box")) list.push(w);
    return list.filter((el) => !el.classList.contains("hidden") && el.offsetWidth > 0 && el.offsetHeight > 0);
  }

  function restoreTipLayout() {
    for (const el of tipTouched) {
      el.style.left = "";
      el.style.top = "";
      el.style.transform = "";
      el.style.transformOrigin = "";
      tipOwnTf.delete(el);
      tipNatural.delete(el);
    }
    tipTouched.clear();
  }

  function applyTipLayout() {
    // 只在觸控裝置（遊戲手機版的物品框是點擊後顯示）套用；桌機的滑鼠提示框維持原樣
    const touch = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
    const boxes = tipLayout === "top" && touch ? tipVisibleBoxes() : [];
    if (!boxes.length) { if (tipTouched.size) restoreTipLayout(); return; }

    const vw = document.documentElement.clientWidth || innerWidth;
    const vh = innerHeight;
    // 每個框的原始縮放：遊戲改過 transform 才重新量；否則沿用上次量到的值
    for (const el of boxes) {
      if (tipOwnTf.get(el) !== el.style.transform || !tipNatural.has(el)) {
        const s = el.getBoundingClientRect().width / (el.offsetWidth || 1);
        if (s > 0) tipNatural.set(el, s);
      }
    }
    // 共用縮放取各框原始縮放的最小值，避免並列時大小不一
    const base = Math.min(1, ...boxes.map((el) => tipNatural.get(el) || 1));
    // 安全區：頂部取 env(safe-area-inset-top)，底部下限為「丟下／出售／移動」鍵的上緣
    const probe = document.createElement("div");
    probe.style.cssText = "position:fixed;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top);";
    document.body.appendChild(probe);
    const safeTop = parseFloat(getComputedStyle(probe).paddingTop) || 0;
    probe.remove();
    const top = safeTop + 8;
    const btnTops = ["drop-held", "sell-held", "move-held"]
      .map((id) => document.getElementById(id))
      .filter((b) => b && b.offsetWidth > 0 && getComputedStyle(b).display !== "none")
      .map((b) => b.getBoundingClientRect().top);
    const bottom = btnTops.length ? Math.min(...btnTops) - 8 : vh - 120;
    if (bottom - top < 120) { if (tipTouched.size) restoreTipLayout(); return; }

    const plan = planTipLayout({
      vw, top, bottom, base, boxes: boxes.map((el) => ({ w: el.offsetWidth, h: el.offsetHeight })),
    });
    boxes.forEach((el, i) => {
      const left = `${plan.lefts[i]}px`, t = `${plan.top}px`, tf = `scale(${plan.scale})`;
      if (el.style.left !== left) el.style.left = left;
      if (el.style.top !== t) el.style.top = t;
      if (el.style.transform !== tf) el.style.transform = tf;
      if (el.style.transformOrigin !== "0px 0px" && el.style.transformOrigin !== "0 0") el.style.transformOrigin = "0 0";
      tipOwnTf.set(el, el.style.transform);
      tipTouched.add(el);
    });
  }

  function tipLoop() {
    try { applyTipLayout(); } catch (e) { console.warn("[d2lang] 比較框排版失敗", e); }
    requestAnimationFrame(tipLoop);
  }

  function setTipLayout(mode) {
    tipLayout = mode === "game" ? "game" : "top";
    try { localStorage.setItem(TIP_LAYOUT_KEY, tipLayout); } catch {}
    if (tipLayout === "game") restoreTipLayout();
  }

  // 初始化並套用預設語言
  (async () => {
    try { const bytes = await fontStorage("readonly"); if (bytes) await installFont(bytes, false); } catch (e) { console.warn("[d2lang] 無法讀取已儲存字型", e); }
    await loadGameTranslator();
    if (!registry.has(currentLang)) currentLang = "zh-TW";
    if (currentLang !== "en") {
      const item = registry.get(currentLang);
      item.dict = await loadLocale(currentLang);
      useDict(item.dict);
    }
    // 點陣字型能畫中文後才接上遊戲翻譯流程（否則 Canvas 上會變成「??」；DOM 與一般 Canvas 文字照常由本模組翻譯）
    (async () => {
      for (let i = 0; i < 240 && !patchBitmapFont(); i++) { await captureGame(); await new Promise((r) => setTimeout(r, 500)); }
      if (fontPatched) { if (currentLang !== "en") await hookGameTranslation(); clearTextCaches(); redrawStaticCanvases(); }
      else console.warn("[d2lang] 找不到遊戲點陣字型，遊戲畫布上的選單維持原文");
    })();

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => {
        createUI();
        startObserver();
      });
    } else {
      createUI();
      startObserver();
    }
  })();
})();
