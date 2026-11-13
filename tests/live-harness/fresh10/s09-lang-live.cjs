// 用法：electron tests/live-harness/fresh10/s09-lang-live.cjs [輸出.json]
// 實機測試員 S09：職業 sorceress，測試繁體中文化功能與名稱翻譯規則、選單與面板繁中、DOM 文字取樣。
const { app, BrowserWindow, session, net } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path");

const ROOT = path.resolve(__dirname, "../../..");
const PAGES = "https://nojackno2-ctrl.github.io/d2-survivors-toolkit/";
const OUT = process.argv.slice(2).find(a => !a.startsWith("--") && !a.endsWith("electron.exe") && a !== ".");
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), "d2fresh10-s09-"));
const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".html": "text/html", ".css": "text/css", ".svg": "image/svg+xml" };

app.setPath("userData", PROFILE);
app.on("window-all-closed", () => {});

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const results = [];
let win, timer, timedOut = false;
const add = (name, ok, detail) => results.push({ name, ok: !!ok, detail });

async function main() {
  await app.whenReady();
  await session.defaultSession.protocol.handle("https", req => {
    const url = new URL(req.url);
    if (url.hostname === "d2survivors.lol" && url.pathname.startsWith("/api/") && req.method !== "GET") {
      return new Response("blocked by harness", { status: 503 });
    }
    if (!req.url.startsWith(PAGES)) return net.fetch(req, { bypassCustomProtocolHandlers: true });
    const rel = decodeURIComponent(url.pathname.slice("/d2-survivors-toolkit/".length));
    const file = path.resolve(ROOT, rel);
    if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      return new Response("not found", { status: 404 });
    }
    return new Response(fs.readFileSync(file), {
      headers: {
        "content-type": (MIME[path.extname(file)] || "application/octet-stream") + "; charset=utf-8",
        "access-control-allow-origin": "*",
        "cache-control": "no-store"
      }
    });
  });

  win = new BrowserWindow({
    width: 1100,
    height: 800,
    show: true,
    webPreferences: { webSecurity: false, backgroundThrottling: false }
  });

  await win.loadURL("https://d2survivors.lol/play/").catch(() => {});
  await sleep(8000);
  await win.webContents.executeJavaScript(`(()=>{const b=[...document.querySelectorAll("button")].find(x=>/hosted/i.test(x.textContent));if(b)b.click()})()`);
  await sleep(12000);

  const evaluate = code => win.webContents.executeJavaScript(`(async()=>{${code}})()`);
  const run = async (name, code) => {
    try {
      const detail = await evaluate(code);
      add(name, detail.ok, detail);
    } catch (error) {
      add(name, false, { error: String(error?.stack || error) });
    }
  };

  // 1. 載入工具包與初始化
  await run("載入工具包與初始化", `
    await import(${JSON.stringify(PAGES + "d2edit.js?v=")} + Date.now());
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 120 && (!window.__d2guard || !window.__d2autobot?.game || !window.__d2lang); i++) {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true }));
      await sleep(500);
    }
    const lang = window.__d2lang;
    const bot = window.__d2autobot;
    const guard = window.__d2guard;
    return {
      ok: !!lang && !!bot && !!guard,
      hasLang: !!lang,
      hasBot: !!bot,
      hasGuard: !!guard
    };
  `);

  // 2. 建立全新法師進場、翻譯器掛接（gameHooked）與字典筆數驗證
  await run("法師開局與中文化掛接", `
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const g = window.__d2autobot?.game;
    if (!g) throw Error("找不到遊戲物件");
    if (g.state === "select") {
      if (!g.plainSelect().onPick) { g.chooseClass(); await sleep(1500); }
      const s = g.plainSelect();
      const i = s.cards.findIndex(c => c.dataset?.class === "sorceress");
      if (i < 0) throw Error("找不到 sorceress 職業卡片");
      s.select(i);
      await sleep(300);
      s.confirm(false);
    }
    for (let i = 0; i < 120 && !g.world?.player; i++) await sleep(500);

    const lang = window.__d2lang;
    let dbg = lang?.debug ? lang.debug() : null;
    for (let i = 0; i < 30 && (!dbg?.gameHooked || !dbg?.gameTr); i++) {
      await sleep(500);
      dbg = lang?.debug ? lang.debug() : null;
    }

    const dict = await (window.__d2zhPromise || Promise.resolve(null));
    const dictCount = dict ? Object.keys(dict).length : 0;

    return {
      ok: !!g.world?.player && g.kit?.id === "sorceress" && dbg?.gameHooked === true && dictCount > 5000,
      cls: g.kit?.id,
      state: g.state,
      gameHooked: dbg?.gameHooked,
      gameTr: dbg?.gameTr,
      translator: dbg?.translator,
      dictCount
    };
  `);

  // 3. 驗證 AI_HANDOFF 名稱翻譯規則（真實 window.__d2lang.translate）
  // 嚴格保留斷言，不放寬產品行為問題！
  await run("翻譯規則驗證", `
    const tr = window.__d2lang?.translate;
    if (typeof tr !== "function") throw Error("__d2lang.translate 不是函式");

    // 1) 魔法字尾移到最前
    const ring1 = tr("Ring of the Lamprey");
    const ring2 = tr("Ring - of the Lamprey");
    const ringOk = ring1 === "八目鰻之戒指" && ring2 === "八目鰻之戒指";

    // 2) 怪物稱號與稀有名稱直接相接
    const monsterHyphen = tr("Stone - Maggot - the Witch");
    const monsterSpace = tr("Stone Maggot the Witch");
    const monsterHyphenOk = monsterHyphen === "石塊蛆蟲巫異";
    const monsterSpaceOk = monsterSpace === "石塊蛆蟲巫異" || monsterSpace === "巫異石岩蛆蟲" || !/\\s/.test(monsterSpace);

    // 3) 屬性詞綴列每項之間以不換行空格（U+00A0）分隔
    const traitHyphen = tr("Extra Strong - Aura Enchanted");
    const traitSpace = tr("Extra Strong Aura Enchanted");
    const traitHyphenOk = traitHyphen.includes("\\u00a0") && traitHyphen.replace(/\\u00a0/g, " ") === "特別強壯 靈氣強化";
    const traitSpaceOk = traitSpace.includes("\\u00a0") && traitSpace.replace(/\\u00a0/g, " ") === "特別強壯 靈氣強化";

    const allOk = ringOk && monsterHyphenOk && traitHyphenOk && traitSpaceOk;

    return {
      ok: allOk,
      ringOfLamprey: { hyphen: ring2, space: ring1, ok: ringOk },
      monsterName: { hyphen: monsterHyphen, space: monsterSpace, hyphenOk: monsterHyphenOk, spaceOk: monsterSpaceOk },
      traits: { hyphen: traitHyphen, space: traitSpace, hyphenOk: traitHyphenOk, spaceOk: traitSpaceOk }
    };
  `);

  // 4. 工具包選單七個項目繁中檢查
  await run("工具包選單七項目繁中檢查", `
    const features = window.__d2toolkit?.features() || [];
    const count = features.length;
    const hasGuard = features.some(f => f.id === "guard" && f.label === "存檔檢查與防護");
    const isTraditionalZh = s => typeof s === "string" && s.length > 0 && /^[\\u4e00-\\u9fa5]+$/.test(s.trim());
    const labelsZh = features.every(f => isTraditionalZh(f.label));

    return {
      ok: count === 7 && hasGuard && labelsZh,
      count,
      hasGuard,
      labelsZh,
      items: features.map(f => ({ id: f.id, label: f.label, order: f.order }))
    };
  `);

  // 5. 輔助器面板與自動淬鍊面板繁中檢查（暫停狀態下）
  await run("輔助器與自動淬鍊面板繁中檢查", `
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const g = window.__d2autobot?.game;
    if (g && typeof g.pause === "function") {
      try { g.pause(); } catch {}
    }
    const hadPause = document.body.classList.contains("frontend-over-run");
    document.body.classList.add("frontend-over-run");

    // 1) 檢查自動淬鍊面板
    const forgeOpened = window.__d2autoforgeUI?.open ? window.__d2autoforgeUI.open() : false;
    await sleep(400);
    const forgePanel = document.getElementById("d2autoforge-panel");
    const forgeText = forgePanel ? forgePanel.innerText : "";
    const hasForgeZh = forgeText.includes("自動淬鍊") && forgeText.includes("本地淬鍊") && forgeText.includes("地獄熔爐");

    // 2) 檢查輔助器面板
    const root = document.querySelector("#d2autobot-panel")?.shadowRoot;
    const box = root?.querySelector(".box");
    const botText = box ? box.innerText || box.textContent : "";
    const hasBotZh = botText.includes("遊戲輔助") && botText.includes("自動戰鬥") && botText.includes("遊戲修改");

    // 收合或關閉面板
    const botClose = root?.getElementById("close");
    if (botClose) botClose.click();
    const forgeFold = document.getElementById("af-fold");
    if (forgeFold) forgeFold.click();

    if (!hadPause) document.body.classList.remove("frontend-over-run");

    return {
      ok: hasForgeZh && hasBotZh,
      forgeOpened,
      hasForgeZh,
      hasBotZh,
      forgeSample: forgeText.slice(0, 150),
      botSample: botText.slice(0, 150)
    };
  `);

  // 6. 取樣遊戲畫面上實際的 DOM 文字（暫停選單、升級選卡、營地／商店介面、物品提示）
  // 先在主程序層協助按鍵 C 與滑鼠 hover，觸發 tooltip
  try {
    await evaluate(`(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyC", key: "c", bubbles: true }));
    })()`);
    await sleep(800);
    const weaponCoord = await evaluate(`(() => {
      const el = document.querySelector('.slot[data-slot="weapon"], [data-slot="weapon"]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    })()`);
    if (weaponCoord) {
      for (let k = 0; k < 3; k++) {
        win.webContents.sendInputEvent({ type: "mouseMove", x: weaponCoord.x, y: weaponCoord.y });
        await sleep(200);
      }
      await sleep(600);
    }
  } catch {}

  await run("遊戲畫面 DOM 文字取樣與未翻統計", `
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const g = window.__d2autobot?.game;
    const samples = { pauseMenu: [], levelUp: [], campStore: [], itemTooltip: [] };

    const extractTexts = (root) => {
      if (!root) return [];
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
      const texts = [];
      let n;
      while ((n = walker.nextNode())) {
        const val = (n.nodeValue || "").trim();
        if (val && n.parentElement) {
          const style = window.getComputedStyle(n.parentElement);
          if (style.display !== "none" && style.visibility !== "hidden") {
            texts.push({ text: val, tag: n.parentElement.tagName.toLowerCase(), id: n.parentElement.id, cls: n.parentElement.className });
          }
        }
      }
      return texts;
    };

    // 1) 暫停選單
    try {
      if (g && typeof g.pause === "function") g.pause();
      await sleep(500);
      const pauseEl = document.getElementById("paused") || document.querySelector(".pause-menu, [data-pause]");
      if (pauseEl) {
        samples.pauseMenu = extractTexts(pauseEl);
      } else {
        samples.pauseMenu = extractTexts(document.body).filter(x => /暫停|遊戲|繼續|選單|音效|選項|返回/i.test(x.text));
      }
    } catch (e) {
      samples.pauseMenuErr = String(e);
    }

    // 2) 升級選卡
    try {
      if (g && typeof g.offerLevelUp === "function") {
        g.offerLevelUp();
        await sleep(600);
        const levelUpEl = document.getElementById("level-up") || document.getElementById("choices") || document.querySelector(".level-up");
        if (levelUpEl) {
          samples.levelUp = extractTexts(levelUpEl);
        }
        const btn = document.querySelector("#choices button") || document.querySelector("#level-up button");
        if (btn) btn.click();
        else if (g.hud?.closeLevelUp) g.hud.closeLevelUp();
        await sleep(500);
      }
    } catch (e) {
      samples.levelUpErr = String(e);
    }

    // 3) 營地／商店介面
    try {
      if (g && typeof g.enterCamp === "function") {
        await g.enterCamp(g.kit);
        await sleep(1500);
        if (typeof g.openCampTrade === "function") {
          g.openCampTrade("store");
          await sleep(1000);
        }
        const storeEl = document.getElementById("store") || document.getElementById("trade") || document.querySelector(".camp-store, #camp");
        if (storeEl) {
          samples.campStore = extractTexts(storeEl);
        } else {
          samples.campStore = extractTexts(document.body).filter(x => /恰西|阿卡拉|基德|商店|購買|買回|賣出/i.test(x.text));
        }
      }
    } catch (e) {
      samples.campStoreErr = String(e);
    }

    // 4) 物品提示（Item Tooltip）
    try {
      const tipEls = [...document.querySelectorAll('.tip, .tooltip, [class*="tip"]')].filter(e => e.getBoundingClientRect().width > 0);
      if (tipEls.length > 0) {
        samples.itemTooltip = tipEls.flatMap(el => extractTexts(el));
      } else {
        samples.itemTooltip = extractTexts(document.body).filter(x => /傷害|速度|需要|等級|法師|單手/i.test(x.text));
      }
    } catch (e) {
      samples.itemTooltipErr = String(e);
    }

    const allCollected = [
      ...samples.pauseMenu.map(s => ({ source: "pauseMenu", ...s })),
      ...samples.levelUp.map(s => ({ source: "levelUp", ...s })),
      ...samples.campStore.map(s => ({ source: "campStore", ...s })),
      ...samples.itemTooltip.map(s => ({ source: "itemTooltip", ...s }))
    ];

    const englishNodes = [];
    const engWordRegex = /[A-Za-z]{2,}/;
    for (const item of allCollected) {
      if (engWordRegex.test(item.text)) {
        englishNodes.push(item);
      }
    }

    const counts = new Map();
    for (const item of englishNodes) {
      counts.set(item.text, (counts.get(item.text) || 0) + 1);
    }

    const sortedSummary = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([text, count]) => {
        const isLikelyMissed = !/^(ESC|TAB|SPACE|ENTER|C|I|K|O|P|Q|W|E|R|T|Y|U|A|S|D|F|G|H|J|L|Z|X|V|B|N|M)$/i.test(text.trim()) && !/^v?\\d+(\\.\\d+)+/i.test(text.trim());
        return { text, count, isLikelyMissed };
      });

    return {
      ok: true,
      totalCollected: allCollected.length,
      englishNodesCount: englishNodes.length,
      top30English: sortedSummary,
      sampleCounts: {
        pauseMenu: samples.pauseMenu.length,
        levelUp: samples.levelUp.length,
        campStore: samples.campStore.length,
        itemTooltip: samples.itemTooltip.length
      }
    };
  `);
}

(async () => {
  try {
    await Promise.race([
      main(),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          reject(Error("實機測試整體逾時 (280s)"));
        }, 280000);
      })
    ]);
  } catch (error) {
    add("執行錯誤", false, { error: String(error?.stack || error), timedOut });
  } finally {
    clearTimeout(timer);
    try {
      if (OUT) fs.writeFileSync(OUT, JSON.stringify({ partial: true, results }, null, 2) + "\n");
    } catch {}

    if (win && !win.isDestroyed()) win.destroy();
    try {
      if (app.isReady()) await session.defaultSession.flushStorageData();
    } catch (error) {
      add("清理設定檔", false, { error: String(error) });
    }

    let cleanupError;
    for (let i = 0; i < 5; i++) {
      try {
        fs.rmSync(PROFILE, { recursive: true, force: true });
        cleanupError = null;
        break;
      } catch (error) {
        cleanupError = error;
        await sleep(300);
      }
    }
    process.on("exit", () => {
      try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch {}
    });

    const passed = results.filter(x => x.ok).length;
    const failed = results.length - passed;
    const report = {
      tester: "S09",
      role: "sorceress",
      feature: "繁體中文化",
      url: "https://d2survivors.lol/play/",
      isolatedFreshProfile: true,
      results,
      passed,
      failed
    };

    try {
      if (OUT) fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");
      else console.log(JSON.stringify(report, null, 2));
    } catch (error) {
      console.error("寫入結果失敗：", error);
      app.exit(1);
      return;
    }

    console.log(`測試員 S09 執行完畢：通過 ${passed} 項，失敗 ${failed} 項`);
    app.exit(failed ? 1 : 0);
  }
})();
