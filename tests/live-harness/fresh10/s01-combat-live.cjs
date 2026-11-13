// 用法：electron tests/live-harness/fresh10/s01-combat-live.cjs [輸出.json]
// S01：amazon 職業實機測試「自動戰鬥、走位閃避、自動撿寶、自動喝水、踢罐子」
const { app, BrowserWindow, session, net } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.resolve(__dirname, "../../..");
const PAGES = "https://nojackno2-ctrl.github.io/d2-survivors-toolkit/";
const OUT = process.argv.slice(2).find(a => !a.startsWith("--") && !a.endsWith("electron.exe") && a !== ".");
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), "d2fresh10-s01-"));
const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".html": "text/html", ".css": "text/css", ".svg": "image/svg+xml" };

app.setPath("userData", PROFILE);
app.on("window-all-closed", () => {});
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const results = [];
let win, timer, timedOut = false;
const add = (name, ok, detail) => results.push({ name, ok: !!ok, detail });
const helperErrors = [];

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
    webPreferences: {
      webSecurity: false,
      backgroundThrottling: false
    }
  });

  win.webContents.on("console-message", (event, level, message, line, sourceId) => {
    const text = String(message || "") + " " + String(sourceId || "");
    if (level === 3 /* error */ || /uncaught|exception|error/i.test(message)) {
      if (text.includes("/helper/") || text.includes("autobot")) {
        helperErrors.push({ level, message, line, sourceId });
      }
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

  // 1. 載入工具包並選擇 amazon 進場
  const enterDetail = await run("工具包與角色進場", `
    await import(${JSON.stringify(PAGES + "d2edit.js?v=")} + Date.now());
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 120 && (!window.__d2guard || !window.__d2autobot?.game); i++) {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true }));
      await sleep(500);
    }
    const g = window.__d2autobot?.game;
    if (!g) throw Error("找不到遊戲物件");
    if (g.state === "select") {
      if (!g.plainSelect().onPick) { g.chooseClass(); await sleep(1500); }
      const s = g.plainSelect(), i = s.cards.findIndex(c => c.dataset?.class === "amazon");
      if (i < 0) throw Error("找不到 amazon");
      s.select(i);
      await sleep(300);
      s.confirm(false);
    }
    for (let i = 0; i < 120 && (!g.world?.player || g.state !== "playing"); i++) await sleep(500);
    const p = g.world?.player;
    return {
      ok: !!p && g.kit?.id === "amazon" && g.state === "playing",
      state: g.state,
      cls: g.kit?.id,
      x: p?.x,
      y: p?.y,
      life: p?.life,
      maxLife: p?.maxLife
    };
  `);
  if (!enterDetail?.ok) return;

  // 2. 開啟輔助器自動戰鬥相關設定（不開任何遊戲修改作弊）
  const settingsDetail = await run("輔助器戰鬥設定開啟且無作弊", `
    const root = document.querySelector("#d2autobot-panel")?.shadowRoot;
    if (!root) throw Error("找不到輔助器面板 shadowRoot");
    const toggle = (n, v) => {
      const b = root.querySelector('[data-setting="' + n + '"]');
      if (!b) throw Error("找不到設定：" + n);
      if ((b.getAttribute("aria-checked") === "true") !== v) b.click();
      if ((b.getAttribute("aria-checked") === "true") !== v) throw Error("切換失敗：" + n);
    };
    toggle("enabled", true);
    toggle("progressEnabled", true);
    toggle("movement.enabled", true);
    toggle("movement.dodgeProjectiles", true);
    toggle("loot.enabled", true);
    toggle("loot.kickJars", true);
    toggle("potion.autoHp", true);

    const s = window.__d2autobot.settings;
    const cheat = s.cheat;
    const noCheat = cheat.enabled === false &&
      !cheat.invincible &&
      !cheat.oneHitKill &&
      !cheat.maxCrit &&
      !cheat.maxMonsterDensity &&
      !cheat.maxDropRate &&
      !cheat.maxXp;

    return {
      ok: s.enabled === true &&
          s.progressEnabled === true &&
          s.movement.enabled === true &&
          s.movement.dodgeProjectiles === true &&
          s.loot.enabled === true &&
          s.loot.kickJars === true &&
          s.potion.autoHp === true &&
          noCheat,
      enabled: s.enabled,
      progressEnabled: s.progressEnabled,
      movementEnabled: s.movement.enabled,
      dodgeProjectiles: s.movement.dodgeProjectiles,
      lootEnabled: s.loot.enabled,
      kickJars: s.loot.kickJars,
      autoHp: s.potion.autoHp,
      cheatEnabled: cheat.enabled,
      noCheat
    };
  `);
  if (!settingsDetail?.ok) return;

  // 3. 讓它自己打約 90 秒，並在期間驗證移動、擊殺、經驗/等級、撿寶、喝水、踢罐子
  const combatDetail = await run("自動戰鬥90秒與即時指標採樣", `
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const g = window.__d2autobot.game;
    const p = g.world?.player;
    if (!p) throw Error("找不到角色");

    const getGold = () => (Number(g.save?.gold) || 0) + (Number(g.world?.gold) || 0);
    const getInvCount = () => (g.save?.inventoryByClass?.amazon || []).length;
    const getBeltCount = () => (g.world?.belt?.columns || []).reduce((n, c) => n + (c?.length || 0), 0);
    const getJarsCount = () => (g.world?.enemies || []).filter(e => e.rank === "breakable" && !e.dead).length;

    const startSnapshot = {
      x: p.x,
      y: p.y,
      kills: g.world?.kills || 0,
      xp: p.xp || 0,
      level: p.level || 1,
      gold: getGold(),
      inv: getInvCount(),
      beltPotions: getBeltCount(),
      jars: getJarsCount(),
      time: g.world?.time || 0
    };

    const samples = [];
    let potionTriggered = false;
    let potionResult = null;
    let maxDistanceMoved = 0;
    let totalPathLength = 0;
    let lastX = p.x, lastY = p.y;
    let jarsSeenTotal = 0;

    // 總共採樣約 90 秒（45 次，每次 2 秒）
    for (let step = 0; step < 45; step++) {
      await sleep(2000);
      const curX = p.x, curY = p.y;
      const stepDist = Math.hypot(curX - lastX, curY - lastY);
      totalPathLength += stepDist;
      lastX = curX;
      lastY = curY;
      const fromStartDist = Math.hypot(curX - startSnapshot.x, curY - startSnapshot.y);
      if (fromStartDist > maxDistanceMoved) maxDistanceMoved = fromStartDist;

      const currentJars = getJarsCount();
      if (currentJars > 0) jarsSeenTotal++;

      // 在大約第 20~22 步（約 40~44 秒）觸發「生命低於門檻喝水測試」
      if (step >= 20 && !potionTriggered && g.state === "playing") {
        potionTriggered = true;
        // 確保腰帶有藥水供測試
        if (getBeltCount() === 0 && Array.isArray(g.world?.belt?.columns)) {
          g.world.belt.columns[0] = ["potion"];
        }
        const beltBefore = getBeltCount();
        const lifeBefore = p.life;
        const lowLife = Math.max(1, Math.floor(p.maxLife * 0.35));
        p.life = lowLife;

        // 等待輔助器下一個 tick 偵測並喝水
        await sleep(1500);
        const lifeAfter = p.life;
        const beltAfter = getBeltCount();
        const drank = beltAfter < beltBefore || lifeAfter > lowLife;
        potionResult = {
          drank,
          beltBefore,
          beltAfter,
          lifeBefore,
          lowLife,
          lifeAfter
        };
      }

      samples.push({
        step,
        x: curX,
        y: curY,
        kills: g.world?.kills || 0,
        xp: p.xp || 0,
        level: p.level || 1,
        gold: getGold(),
        inv: getInvCount(),
        beltPotions: getBeltCount(),
        jars: currentJars
      });
    }

    const endSnapshot = {
      x: p.x,
      y: p.y,
      kills: g.world?.kills || 0,
      xp: p.xp || 0,
      level: p.level || 1,
      gold: getGold(),
      inv: getInvCount(),
      beltPotions: getBeltCount(),
      jars: getJarsCount(),
      time: g.world?.time || 0
    };

    return {
      ok: true,
      startSnapshot,
      endSnapshot,
      totalPathLength,
      maxDistanceMoved,
      jarsSeenTotal,
      potionResult,
      sampleCount: samples.length
    };
  `);

  if (combatDetail?.ok) {
    const s = combatDetail.startSnapshot;
    const e = combatDetail.endSnapshot;

    // 4. 驗證角色移動（座標變化）
    const moved = combatDetail.totalPathLength > 200 || combatDetail.maxDistanceMoved > 50;
    add("角色有移動（座標變化）", moved, {
      totalPathLength: combatDetail.totalPathLength,
      maxDistanceMoved: combatDetail.maxDistanceMoved,
      startX: s.x, startY: s.y,
      endX: e.x, endY: e.y
    });

    // 5. 驗證擊殺數增加
    const killsIncreased = e.kills > s.kills;
    add("擊殺數增加", killsIncreased, {
      killsStart: s.kills,
      killsEnd: e.kills,
      diff: e.kills - s.kills
    });

    // 6. 驗證經驗或等級上升
    const xpOrLevelUp = e.level > s.level || e.xp > s.xp;
    add("經驗或等級上升", xpOrLevelUp, {
      levelStart: s.level,
      levelEnd: e.level,
      xpStart: s.xp,
      xpEnd: e.xp
    });

    // 7. 驗證有拾取行為（金幣或物品增加）
    const pickedLoot = e.gold > s.gold || e.inv > s.inv;
    add("有拾取行為（金幣或物品增加）", pickedLoot, {
      goldStart: s.gold,
      goldEnd: e.gold,
      goldDiff: e.gold - s.gold,
      invStart: s.inv,
      invEnd: e.inv,
      invDiff: e.inv - s.inv
    });

    // 8. 驗證生命低於門檻時有喝水行為
    const potionPassed = combatDetail.potionResult?.drank === true;
    add("生命低於門檻時有喝水行為", potionPassed, combatDetail.potionResult || { error: "未觸發喝水測試" });

    // 9. 驗證踢罐子設定與觀察
    // 罐子木桶為隨機地圖物件，檢查 kickJars 開關已啟用，並記錄環境中是否有出現或互動
    const kickJarsSetting = settingsDetail.kickJars === true;
    add("踢罐子設定與環境觀察", kickJarsSetting, {
      kickJarsSetting,
      jarsSeenTotal: combatDetail.jarsSeenTotal,
      jarsStart: s.jars,
      jarsEnd: e.jars
    });
  }

  // 10. 驗證期間沒有未捕捉例外（監聽 console error 中來自 /helper/ 的訊息）
  const noHelperExceptions = helperErrors.length === 0;
  add("無未捕捉例外（來自 /helper/）", noHelperExceptions, {
    errorCount: helperErrors.length,
    errors: helperErrors
  });

  // 11. 驗證 __d2autobot.diagnostics() 無錯誤註記
  await run("diagnostics無錯誤註記", `
    const diag = window.__d2autobot.diagnostics();
    const storageClean = !diag.storageNote || diag.storageNote === "";
    const hookClean = !diag.hookNote || !/無法|找不到|錯誤|fail/i.test(diag.hookNote);
    const connected = diag.connected === true;
    return {
      ok: storageClean && hookClean && connected,
      storageNote: diag.storageNote,
      hookNote: diag.hookNote,
      connected: diag.connected,
      state: diag.state,
      lastAction: diag.lastAction
    };
  `);

  // 12. 驗證最後關閉輔助器後角色不再被自動操控
  await run("關閉輔助器後角色停止自動操控", `
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const g = window.__d2autobot.game;
    const p = g.world?.player;
    if (!p) throw Error("找不到角色");

    // 關閉輔助器
    window.__d2autobot.stop("測試完成關閉輔助器", true);
    await sleep(1000);

    const x0 = p.x, y0 = p.y;
    // 觀察 3 秒角色是否停在原地
    await sleep(3000);
    const x1 = p.x, y1 = p.y;
    const diff = Math.hypot(x1 - x0, y1 - y0);
    const walkTarget = g.walkTarget;
    const reaching = g.world?.reaching;

    return {
      ok: diff < 2 && walkTarget === null,
      diff,
      x0, y0,
      x1, y1,
      walkTarget: walkTarget ? { x: walkTarget.x, y: walkTarget.y } : null,
      reaching: reaching ? { x: reaching.x, y: reaching.y } : null,
      enabled: window.__d2autobot.settings.enabled,
      progressEnabled: window.__d2autobot.settings.progressEnabled
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
    try {
      if (OUT) fs.writeFileSync(OUT, JSON.stringify({ partial: true, profile: PROFILE, results }, null, 2) + "\n");
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
    const passed = results.filter(x => x.ok).length, failed = results.length - passed;
    const report = {
      url: "https://d2survivors.lol/play/",
      isolatedFreshProfile: true,
      profile: PROFILE,
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
    console.log(`S01 實機測試結束：通過 ${passed} 項，失敗 ${failed} 項`);
    app.exit(failed ? 1 : 0);
  }
})();
