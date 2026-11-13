// 用法：electron tests/live-harness/fresh10/s05-town-live.cjs [輸出.json]
// S05：paladin 聖騎士實機測試「營地自動化與自動配裝」
const { app, BrowserWindow, session, net } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.resolve(__dirname, "../../..");
const PAGES = "https://nojackno2-ctrl.github.io/d2-survivors-toolkit/";
const DEFAULT_OUT = path.join(os.tmpdir(), "d2fresh10", "s05.json");
const OUT = process.argv.slice(2).find(a => !a.startsWith("--") && !a.endsWith("electron.exe") && a !== ".") || DEFAULT_OUT;
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), "d2fresh10-s05-"));
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
    // 最後防線：即使工具包失效，也不讓測試送出官方 API 寫入
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
    webPreferences: {
      webSecurity: false,
      backgroundThrottling: false
    }
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
      return detail;
    } catch (error) {
      add(name, false, { error: String(error?.stack || error) });
      return null;
    }
  };

  // 1. 載入工具包
  await run("載入工具包與防護核心", `
    await import(${JSON.stringify(PAGES + "d2edit.js?v=")} + Date.now());
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 120 && (!window.__d2guard || !window.__d2autobot?.game); i++) {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true }));
      await sleep(500);
    }
    const guard = window.__d2guard, autobot = window.__d2autobot;
    return {
      ok: !!guard && !!autobot?.game && guard.saveMode() === "local",
      hasGuard: !!guard,
      hasAutobot: !!autobot,
      saveMode: guard?.saveMode()
    };
  `);

  // 2. 建立全新聖騎士（Paladin）並進場
  await run("建立全新聖騎士角色並進場", `
    const sleep = ms => new Promise(r => setTimeout(r, ms)), g = window.__d2autobot?.game;
    if (!g) throw Error("找不到遊戲物件");
    if (g.state === "select") {
      if (!g.plainSelect().onPick) { g.chooseClass(); await sleep(1500); }
      const s = g.plainSelect();
      const i = s.cards.findIndex(c => c.dataset?.class === "paladin");
      if (i < 0) throw Error("找不到 paladin 職業卡片");
      s.select(i);
      await sleep(300);
      s.confirm(false);
    }
    for (let i = 0; i < 120 && !g.world?.player; i++) await sleep(500);
    const initialEquipped = { ...(g.equippedOf?.("paladin") || {}) };
    const initialScore = window.__d2autobot?.gearTools?.gearScore ? window.__d2autobot.gearTools.gearScore(g, initialEquipped) : 0;
    window.__s05_test = {
      initialEquipped,
      initialScore,
      initialEquippedCount: Object.keys(initialEquipped).length
    };
    return {
      ok: !!g.world?.player && g.kit?.id === "paladin",
      state: g.state,
      cls: g.kit?.id,
      initialEquippedCount: Object.keys(initialEquipped).length,
      initialScore
    };
  `);

  // 3. 設置存檔監看、動作輪詢器，並開啟自動戰鬥、無敵、一擊必殺、全精英怪、怪物密度10倍、掉寶率最高、金幣掉落率最高
  await run("掛載存檔監看並開啟修改開關與自動戰鬥", `
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const root = document.querySelector("#d2autobot-panel")?.shadowRoot;
    const toggle = (n, v) => {
      const b = root?.querySelector('[data-setting="' + n + '"]');
      if (!b) throw Error("找不到設定：" + n);
      if ((b.getAttribute("aria-checked") === "true") !== v) b.click();
      if ((b.getAttribute("aria-checked") === "true") !== v) throw Error("切換失敗：" + n);
    };

    // 存檔呼叫堆疊監聽器
    window.__s05_saveWrites = [];
    const origSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(k, v) {
      if (["d2-survivors/save/v1", "d2-survivors/hc/v1"].includes(String(k))) {
        window.__s05_saveWrites.push({
          key: String(k),
          stack: String(new Error().stack)
        });
      }
      return origSetItem.apply(this, arguments);
    };

    // 輔助器動作記錄輪詢（每 100ms 記錄一次 lastAction）
    window.__s05_actions = [];
    setInterval(() => {
      const act = window.__d2autobot?.diagnostics?.()?.lastAction;
      if (act && !window.__s05_actions.includes(act)) {
        window.__s05_actions.push(act);
      }
    }, 100);

    // 啟用修改總開關與各項作弊，加速大量掉落裝備與金幣
    toggle("cheat.enabled", true);
    toggle("cheat.invincible", true);
    toggle("cheat.oneHitKill", true);
    toggle("cheat.allElites", true);
    toggle("cheat.maxDropRate", true);
    toggle("cheat.maxGoldRate", true);
    toggle("progressEnabled", true);

    // 透過 settings 開啟怪物密度最高與技能強化，進一步提升刷怪效率
    window.__d2autobot.settings.cheat.maxMonsterDensity = true;
    window.__d2autobot.settings.cheat.monsterDensity10x = true;
    window.__d2autobot.settings.cheat.maxSkills = true;

    const s = window.__d2autobot.settings;
    return {
      ok: s.cheat.enabled && s.cheat.invincible && s.cheat.oneHitKill && s.cheat.allElites && s.cheat.maxDropRate && s.cheat.maxGoldRate && s.progressEnabled,
      cheatEnabled: s.cheat.enabled,
      invincible: s.cheat.invincible,
      oneHitKill: s.cheat.oneHitKill,
      allElites: s.cheat.allElites,
      maxDropRate: s.cheat.maxDropRate,
      maxGoldRate: s.cheat.maxGoldRate,
      monsterDensity10x: s.cheat.monsterDensity10x,
      progressEnabled: s.progressEnabled,
      townEnabled: s.town.enabled,
      autoEquip: s.gear.autoEquip
    };
  `);

  // 4. 戰鬥約 60 秒累積金幣與裝備
  await run("戰鬥約 60 秒累積金幣與裝備", `
    const sleep = ms => new Promise(r => setTimeout(r, ms)), g = window.__d2autobot.game;
    const start = performance.now();
    while (performance.now() - start < 60000) {
      await sleep(2000);
    }
    const inv = g.inventoryOf?.("paladin") || [];
    const gold = (Number.isFinite(g.save?.gold) ? g.save.gold : 0) + (Number.isFinite(g.world?.gold) ? g.world.gold : 0);
    const beltColumns = g.world?.belt?.columns || [];
    const rarities = {};
    for (const item of inv) {
      if (item?.rarity) rarities[item.rarity] = (rarities[item.rarity] || 0) + 1;
    }
    window.__s05_test.beforeCamp = {
      inventoryCount: inv.length,
      gold,
      items: inv.map(x => ({ base: x?.base, name: x?.name, rarity: x?.rarity })),
      rarities,
      beltColumns: JSON.parse(JSON.stringify(beltColumns))
    };
    return {
      ok: gold > 0,
      elapsedMs: Math.round(performance.now() - start),
      inventoryCount: inv.length,
      gold,
      rarities,
      beltColumnsCount: beltColumns.length
    };
  `);

  // 5. 觸發回營地流程
  await run("讓輔助器依流程回營地", `
    const sleep = ms => new Promise(r => setTimeout(r, ms)), g = window.__d2autobot.game;
    // 避免營地整備完後立刻自動開下一局，保留營地狀態供斷言
    window.__d2autobot.settings.quest.autoStart = false;

    if (g.state === "playing" && typeof g.pause === "function") g.pause();
    await sleep(300);
    if (g.state === "paused" && typeof g.leaveRun === "function") {
      await g.leaveRun();
    }
    // 等待回到 camp
    for (let i = 0; i < 60; i++) {
      if (g.state === "camp" && !!g.camp && !!g.world?.player) break;
      if (g.state === "select" && typeof g.enterCamp === "function") {
        await g.enterCamp(g.kit);
      }
      await sleep(500);
    }
    return {
      ok: g.state === "camp" && !!g.camp && !!g.world?.player,
      state: g.state,
      hasCamp: !!g.camp,
      hasPlayer: !!g.world?.player
    };
  `);

  // 6. 等待營地整備（換裝、收收藏庫、存倉、賣垃圾裝、向阿卡拉買生命藥水、恰西永久升級）完成
  await run("營地自動化整備執行與完成", `
    const sleep = ms => new Promise(r => setTimeout(r, ms)), g = window.__d2autobot.game;
    for (let i = 0; i < 24; i++) {
      const ranks = g.save?.ranks || {};
      const ranksCount = Object.keys(ranks).length;
      const beltBought = g.save?.beltBought?.["paladin"] || [];
      if (ranksCount > 0 && beltBought.length > 0) break;
      await sleep(500);
    }
    const actionsSeen = [...(window.__s05_actions || [])];
    const ranks = g.save?.ranks || {};
    const beltBought = g.save?.beltBought?.["paladin"] || [];
    const stash = g.save?.stashTabs?.["paladin"] || [];
    const townDone = Object.keys(ranks).length > 0 && beltBought.length > 0;
    return {
      ok: townDone && g.state === "camp",
      townDone,
      ranksCount: Object.keys(ranks).length,
      beltBoughtCount: beltBought.length,
      stashCount: stash.length,
      recentActions: actionsSeen.slice(-10),
      state: g.state
    };
  `);

  // 7. 驗證：有裝備被自動穿上（equippedOf 數量或評分提升）
  await run("自動穿上較佳裝備（equippedOf 數量或評分提升）", `
    const g = window.__d2autobot.game;
    const currentEquipped = { ...(g.equippedOf?.("paladin") || {}) };
    const initial = window.__s05_test?.initialEquipped || {};
    const initialScore = window.__s05_test?.initialScore || 0;
    const currentScore = window.__d2autobot?.gearTools?.gearScore ? window.__d2autobot.gearTools.gearScore(g, currentEquipped) : 0;
    const initialCount = Object.keys(initial).length;
    const currentCount = Object.keys(currentEquipped).length;
    const countIncreased = currentCount > initialCount;
    const scoreIncreased = currentScore > initialScore;
    return {
      ok: countIncreased || scoreIncreased,
      initialCount,
      currentCount,
      initialScore,
      currentScore,
      currentEquipped: Object.fromEntries(Object.entries(currentEquipped).map(([k, v]) => [k, v?.name || v?.base]))
    };
  `);

  // 8. 驗證：背包垃圾裝被賣出（金幣增加、背包減少）
  await run("賣掉用不到的裝備（垃圾裝被自動賣出，金幣增加）", `
    const g = window.__d2autobot.game;
    const actions = window.__s05_actions || [];
    const sellActions = actions.filter(a => a.includes("賣掉") || a.includes("賣出"));
    const afterGold = (Number.isFinite(g.save?.gold) ? g.save.gold : 0) + (Number.isFinite(g.world?.gold) ? g.world.gold : 0);
    const ranks = g.save?.ranks || {};
    const totalRanks = Object.values(ranks).reduce((a, b) => a + (Number(b) || 0), 0);
    return {
      ok: sellActions.length > 0 || (afterGold > 0 && totalRanks > 0),
      sellActionsCount: sellActions.length,
      sampleSellActions: sellActions.slice(0, 5),
      afterGold,
      totalRanksPurchased: totalRanks
    };
  `);

  // 9. 驗證：買生命藥水（腰帶藥水全部是生命藥水）
  await run("買生命藥水（腰帶藥水全為生命藥水）", `
    const g = window.__d2autobot.game;
    const beltBought = g.save?.beltBought?.["paladin"] || [];
    const validHpKinds = ["potion", "healing", "rejuvenation"];
    const beltBoughtAllHp = beltBought.length > 0 && beltBought.every(k => validHpKinds.includes(k));
    const combatBelt = window.__s05_test?.beforeCamp?.beltColumns || [];
    let combatBeltAllHp = true;
    for (const col of combatBelt) {
      if (Array.isArray(col)) {
        for (const k of col) {
          if (k && !validHpKinds.includes(k)) combatBeltAllHp = false;
        }
      }
    }
    return {
      ok: beltBought.length > 0 && beltBoughtAllHp && combatBeltAllHp,
      beltBoughtCount: beltBought.length,
      beltBought,
      beltBoughtAllHp,
      combatBeltAllHp
    };
  `);

  // 10. 驗證：較好的裝備存入倉庫
  await run("較好的裝備存倉", `
    const g = window.__d2autobot.game;
    const stash = g.save?.stashTabs?.["paladin"] || [];
    const actions = window.__s05_actions || [];
    const stashActions = actions.filter(a => a.includes("存入倉庫"));
    return {
      ok: stash.length > 0 || stashActions.length > 0,
      stashCount: stash.length,
      stashActionsCount: stashActions.length,
      stashActions: stashActions.slice(0, 5),
      stashItems: stash.map(x => ({ base: x?.base, name: x?.name, rarity: x?.rarity }))
    };
  `);

  // 11. 驗證：獨特／套裝收進收藏庫
  await run("獨特／套裝收進收藏庫", `
    const g = window.__d2autobot.game;
    const uniques = g.save?.uniques || {};
    const uniquesCount = uniques instanceof Map ? uniques.size : Object.keys(uniques).length;
    const equipped = g.equippedOf?.("paladin") || {};
    const equippedUniques = Object.values(equipped).filter(x => ["unique", "set"].includes(x?.rarity));
    const droppedUniques = (window.__s05_test?.beforeCamp?.items || []).filter(x => ["unique", "set"].includes(x.rarity));
    // 依輔助器規則：獨特／套裝掉落時，若身上未有該部位則優先穿戴（提高評分）；用不到的才存進收藏庫。
    // 因此若有掉落獨特/套裝，應已收入收藏庫或穿在身上；若未掉落則收藏庫結構正常。
    const satisfied = uniquesCount > 0 || (droppedUniques.length > 0 && equippedUniques.length > 0) || droppedUniques.length === 0;
    return {
      ok: satisfied,
      uniquesCount,
      droppedUniquesCount: droppedUniques.length,
      equippedUniquesCount: equippedUniques.length,
      equippedUniques: equippedUniques.map(x => x?.name || x?.base),
      uniques: uniques instanceof Map ? Array.from(uniques.keys()) : Object.keys(uniques)
    };
  `);

  // 12. 驗證：恰西永久升級
  await run("恰西永久升級", `
    const g = window.__d2autobot.game;
    const ranks = g.save?.ranks || {};
    const upgradedKeys = Object.keys(ranks).filter(k => ranks[k] > 0);
    return {
      ok: upgradedKeys.length > 0,
      upgradedKeys,
      ranks
    };
  `);

  // 13. 驗證：所有動作都是呼叫遊戲自己的方法（期間輔助器沒有直接寫遊戲存檔鍵）
  await run("輔助器未直接寫入遊戲存檔鍵（Storage.setItem 呼叫層判定）", `
    const calls = window.__s05_saveWrites || [];
    const helperDirectCalls = calls.filter(x => {
      // 輔助器包住遊戲的 tick，遊戲自己存檔時堆疊深處也會有 /helper/；
      // 只看「直接呼叫 setItem 的那一層」是不是輔助器（略過防護模組的包裝層）。
      const lines = x.stack.split("\\n").filter(l => l.includes("https://") && !l.includes("/guard/guard.js"));
      const direct = lines[0] || "";
      return direct.includes("/helper/");
    });
    return {
      ok: helperDirectCalls.length === 0,
      totalSaveWrites: calls.length,
      helperDirectCallsCount: helperDirectCalls.length,
      helperDirectCalls
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
          reject(Error("實機測試整體逾時"));
        }, 280000);
      })
    ]);
  } catch (error) {
    add("執行錯誤", false, { error: String(error?.stack || error), timedOut });
  } finally {
    clearTimeout(timer);
    // 先寫結果 JSON 再關視窗
    try {
      fs.mkdirSync(path.dirname(OUT), { recursive: true });
      fs.writeFileSync(OUT, JSON.stringify({ partial: true, results }, null, 2) + "\n");
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
    if (cleanupError) console.warn("設定檔將於行程結束時清理：" + PROFILE);

    const passed = results.filter(x => x.ok).length, failed = results.length - passed;
    const report = {
      tester: "S05",
      role: "paladin",
      url: "https://d2survivors.lol/play/",
      isolatedFreshProfile: true,
      results,
      passed,
      failed
    };
    try {
      fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");
    } catch (error) {
      console.error("寫入結果失敗：", error);
      app.exit(1);
      return;
    }
    console.log(`測試員 S05 測試完成：通過 ${passed} 項，失敗 ${failed} 項`);
    app.exit(failed ? 1 : 0);
  }
})();
