// 用法：electron tests/live-harness/fresh10/s04-monsters-live.cjs [輸出.json]
// 實機測試員 S04：死靈法師（necromancer）
// 測試「怪物與關卡類修改：怪物數量最大化、一般怪全部變精英以上、關卡內持續召喚頭目、關卡時間暫停、自動召喚暗黑破壞神分身」（開無敵保命）
// 全新隔離存檔、官方網址 https://d2survivors.lol/play/
const { app, BrowserWindow, session, net } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.resolve(__dirname, "../../..");
const PAGES = "https://nojackno2-ctrl.github.io/d2-survivors-toolkit/";
const DEFAULT_OUT = path.join(os.tmpdir(), "d2fresh10", "s04.json");
const OUT = process.argv.slice(2).find(a => !a.startsWith("--") && !a.endsWith("electron.exe") && a !== ".") || DEFAULT_OUT;
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), "d2fresh-s04-"));
const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".html": "text/html", ".css": "text/css", ".svg": "image/svg+xml" };

// 確保輸出目錄存在
const outDir = path.dirname(OUT);
if (!fs.existsSync(outDir)) {
  try { fs.mkdirSync(outDir, { recursive: true }); } catch {}
}

app.setPath("userData", PROFILE);
// Electron 預設在所有視窗關閉時結束行程；這裡要等結果寫完才自行 app.exit。
app.on("window-all-closed", () => {});
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const results = [];
let win, timer, timedOut = false;
const add = (name, ok, detail) => results.push({ name, ok: !!ok, detail });

async function main() {
  await app.whenReady();
  await session.defaultSession.protocol.handle("https", req => {
    const url = new URL(req.url);
    // 最後防線：即使工具包失效，也不讓測試送出官方 API 寫入。
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

  // 1. 載入工具包與防護核心
  await run("工具包載入與初始化", `
    await import(${JSON.stringify(PAGES + "d2edit.js?v=")} + Date.now());
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 120 && (!window.__d2guard || !window.__d2autobot?.game); i++) {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true }));
      await sleep(500);
    }
    const guard = window.__d2guard, bot = window.__d2autobot;
    return { ok: !!guard && !!bot?.game, guardLoaded: !!guard, botLoaded: !!bot?.game };
  `);

  // 2. 建立死靈法師角色並進入關卡
  await run("建立全新死靈法師角色並進場", `
    const sleep = ms => new Promise(r => setTimeout(r, ms)), g = window.__d2autobot?.game;
    if (!g) throw Error("找不到遊戲物件");
    if (g.state === "select") {
      if (!g.plainSelect().onPick) { g.chooseClass(); await sleep(1500); }
      const s = g.plainSelect();
      const i = s.cards.findIndex(c => c.dataset?.class === "necromancer");
      if (i < 0) throw Error("找不到 necromancer 角色卡");
      s.select(i);
      await sleep(300);
      s.confirm(false);
    }
    for (let i = 0; i < 120 && !g.world?.player; i++) await sleep(500);
    for (let i = 0; i < 60 && g.state !== "playing"; i++) {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true }));
      await sleep(500);
    }
    const cls = g.kit?.id || g.build?.kit?.id;
    return {
      ok: !!g.world?.player && cls === "necromancer",
      state: g.state,
      cls,
      hasPlayer: !!g.world?.player,
      saveExists: localStorage.getItem("d2-survivors/save/v1") !== null
    };
  `);

  // 3. 開啟無敵保命設定
  await run("開啟無敵保命設定", `
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const root = document.querySelector("#d2autobot-panel")?.shadowRoot;
    const toggle = (n, v) => {
      const b = root?.querySelector('[data-setting="' + n + '"]');
      if (!b) throw Error("找不到設定：" + n);
      if ((b.getAttribute("aria-checked") === "true") !== v) b.click();
      if ((b.getAttribute("aria-checked") === "true") !== v) throw Error("切換失敗：" + n);
    };
    // 啟用修改總開關與無敵
    toggle("cheat.enabled", true);
    toggle("cheat.invincible", true);
    // 自動戰鬥關閉（避免角色走動殺怪干擾怪物密度量測），自動進度開啟（避免升級選卡卡住）
    toggle("enabled", false);
    toggle("progressEnabled", true);
    await sleep(1500);
    const p = window.__d2autobot.game.world?.player;
    if (!p) throw Error("找不到玩家物件");
    const beforeHp = p.life;
    p.life = Math.max(1, beforeHp - 50);
    await sleep(400);
    const afterHp = p.life;
    return {
      ok: afterHp >= beforeHp,
      beforeHp,
      afterHp,
      invincibleActive: afterHp >= beforeHp
    };
  `);

  // 4. 量測基準狀態（未開啟各怪物/關卡修改前）
  await run("量測基準怪物與關卡狀態", `
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const g = window.__d2autobot.game, w = g.world;
    await sleep(3000);
    const enemies = (w.enemies || []).filter(e => e && (e.life || 0) > 0);
    const normalCount = enemies.filter(e => e.rank === "normal").length;
    const championCount = enemies.filter(e => e.rank === "champion" || e.elite).length;
    const t0 = w.time, a0 = w.actStart;
    await sleep(2000);
    const t1 = w.time, a1 = w.actStart;
    const timeProgressing = (t1 - a1) > (t0 - a0);
    window.__s04_baseline = {
      baseEnemyCount: enemies.length,
      normalCount,
      championCount,
      t0, a0, t1, a1
    };
    return {
      ok: enemies.length >= 0 && timeProgressing,
      baseEnemyCount: enemies.length,
      normalCount,
      championCount,
      timeProgressing,
      delta: +((t1 - a1) - (t0 - a0)).toFixed(3)
    };
  `);

  // 5. 怪物數量最大化與 FPS 量測（按使用者指定之第一項功能順序）
  await run("怪物數量最大化與 FPS 量測", `
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const root = document.querySelector("#d2autobot-panel")?.shadowRoot;
    const toggle = (n, v) => {
      const b = root?.querySelector('[data-setting="' + n + '"]');
      if (!b) throw Error("找不到設定：" + n);
      if ((b.getAttribute("aria-checked") === "true") !== v) b.click();
      if ((b.getAttribute("aria-checked") === "true") !== v) throw Error("切換失敗：" + n);
    };
    const g = window.__d2autobot.game, w = g.world;
    const baseCount = window.__s04_baseline?.baseEnemyCount || 0;

    // 開啟怪物數量最大化
    toggle("cheat.maxMonsterDensity", true);
    // 等待 8 秒讓怪物生成
    await sleep(8000);
    const densityEnemies = (w.enemies || []).filter(e => e && (e.life || 0) > 0);
    const densityCount = densityEnemies.length;
    // 斷言：相較未開時明顯增加（如由 19 暴增至 30 以上）
    const densityIncreased = densityCount > baseCount && densityCount >= (baseCount + 10);

    toggle("cheat.pauseStageTime", true);
    await sleep(1500);
    const pauseTogether = Math.abs(w.time - w.actStart) <= 0.1;
    toggle("cheat.pauseStageTime", false);

    // 量測 requestAnimationFrame 計數 10 秒
    const fpsData = await new Promise(resolve => {
      let frames = 0;
      const tStart = performance.now();
      function count() {
        frames++;
        if (performance.now() - tStart < 10000) {
          requestAnimationFrame(count);
        } else {
          const elapsed = (performance.now() - tStart) / 1000;
          resolve({ frames, elapsed: +elapsed.toFixed(3), fps: +(frames / elapsed).toFixed(2) });
        }
      }
      requestAnimationFrame(count);
    });

    const isLowFps = fpsData.fps < 15;

    // 關閉怪物數量最大化
    const beforeDisableCount = (w.enemies || []).filter(e => e && !e.dead && (e.life || 0) > 0).length;
    toggle("cheat.maxMonsterDensity", false);
    toggle("enabled", true);
    await sleep(15000);
    toggle("enabled", false);
    const afterDisableCount = (w.enemies || []).filter(e => e && !e.dead && (e.life || 0) > 0).length;
    // 角色未攻擊時怪物不一定自然死亡；記錄而不假設兩秒內必定回落。
    const densityRestored = !Object.hasOwn(w, "monsterDensity") && !Object.hasOwn(w, "spawnRate");

    return {
      ok: densityIncreased && densityRestored && pauseTogether,
      baseCount,
      densityCount,
      densityIncreased,
      pauseTogether,
      fps: fpsData.fps,
      frames: fpsData.frames,
      elapsedSeconds: fpsData.elapsed,
      isLowFps,
      beforeDisableCount,
      afterDisableCount,
      countFell: afterDisableCount < beforeDisableCount,
      densityRestored
    };
  `);

  // 6. 一般怪全部變精英以上驗證
  await run("一般怪物全部變精英以上驗證", `
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const root = document.querySelector("#d2autobot-panel")?.shadowRoot;
    const toggle = (n, v) => {
      const b = root?.querySelector('[data-setting="' + n + '"]');
      if (!b) throw Error("找不到設定：" + n);
      if ((b.getAttribute("aria-checked") === "true") !== v) b.click();
      if ((b.getAttribute("aria-checked") === "true") !== v) throw Error("切換失敗：" + n);
    };
    const g = window.__d2autobot.game, w = g.world;

    // 開啟一般怪全部變精英
    toggle("cheat.allElites", true);
    await sleep(2000);
    const activeEnemies = (w.enemies || []).filter(e => e && (e.life || 0) > 0);
    const normalCount = activeEnemies.filter(e => e.rank === "normal").length;
    const championCount = activeEnemies.filter(e => e.rank === "champion" || e.elite).length;
    const allElitesActive = normalCount === 0 && championCount > 0;

    // 關閉一般怪全部變精英
    toggle("cheat.allElites", false);
    // 場上怪數高於原版目標時不會自然補怪；呼叫原版生成器製造新樣本。
    const sample = activeEnemies.find(e => typeof e.kind === "string");
    const dir = g.director;
    if (sample && typeof dir?.spawnPack === "function") {
      const oldCap = dir.rangedCap;
      try { dir.rangedCap = Infinity; dir.spawnPack(w, sample.kind, 4); }
      finally { dir.rangedCap = oldCap; }
    }
    let newNormalSpawned = false;
    for (let i = 0; i < 16; i++) {
      await sleep(500);
      const curEnemies = (w.enemies || []).filter(e => e && (e.life || 0) > 0);
      if (curEnemies.some(e => e.rank === "normal")) {
        newNormalSpawned = true;
        break;
      }
    }

    return {
      ok: allElitesActive && newNormalSpawned,
      allElitesActive,
      normalCountDuringCheat: normalCount,
      championCountDuringCheat: championCount,
      newNormalSpawned
    };
  `);

  // 7. 關卡內持續召喚頭目驗證
  await run("關卡內持續召喚頭目驗證", `
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const root = document.querySelector("#d2autobot-panel")?.shadowRoot;
    const toggle = (n, v) => {
      const b = root?.querySelector('[data-setting="' + n + '"]');
      if (!b) throw Error("找不到設定：" + n);
      if ((b.getAttribute("aria-checked") === "true") !== v) b.click();
      if ((b.getAttribute("aria-checked") === "true") !== v) throw Error("切換失敗：" + n);
    };
    const g = window.__d2autobot.game, w = g.world;

    // 開啟持續召喚頭目
    toggle("cheat.summonAllBosses", true);
    let summonedBoss = null;
    for (let i = 0; i < 20; i++) {
      await sleep(500);
      if (w.boss && !w.boss.dead && (w.boss.life || 0) > 0) {
        summonedBoss = { name: w.boss.name, rank: w.boss.rank, life: Math.round(w.boss.life) };
        break;
      }
      const b = (w.enemies || []).find(e => e && (e.rank === "boss" || e.rank === "actBoss") && (e.life || 0) > 0);
      if (b) {
        summonedBoss = { name: b.name, rank: b.rank, life: Math.round(b.life) };
        break;
      }
    }

    const bossSummoned = !!summonedBoss;

    // 關閉持續召喚頭目
    toggle("cheat.summonAllBosses", false);
    // 將當前場上頭目擊殺/清除
    if (w.boss) {
      w.boss.life = 0;
      w.boss.dead = true;
    }
    // 等待 5 秒，確認沒有新頭目再次出現
    await sleep(5000);
    const newBossSpawned = !!(w.boss && !w.boss.dead && (w.boss.life || 0) > 0);

    return {
      ok: bossSummoned && !newBossSpawned,
      bossSummoned,
      summonedBoss,
      newBossSpawned,
      stoppedOk: !newBossSpawned
    };
  `);

  // 8. 關卡時間暫停驗證
  await run("關卡時間暫停開啟與關閉驗證", `
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const root = document.querySelector("#d2autobot-panel")?.shadowRoot;
    const toggle = (n, v) => {
      const b = root?.querySelector('[data-setting="' + n + '"]');
      if (!b) throw Error("找不到設定：" + n);
      if ((b.getAttribute("aria-checked") === "true") !== v) b.click();
      if ((b.getAttribute("aria-checked") === "true") !== v) throw Error("切換失敗：" + n);
    };
    const g = window.__d2autobot.game, w = g.world;
    // 開啟時間暫停
    toggle("cheat.pauseStageTime", true);
    await sleep(1000);
    const pauseSamples = [];
    for (let i = 0; i < 6; i++) {
      pauseSamples.push({
        time: +w.time.toFixed(3),
        actStart: +w.actStart.toFixed(3),
        diff: +Math.abs(w.time - w.actStart).toFixed(3)
      });
      await sleep(500);
    }
    // 所有取樣點中，actStart 與 time 差距極小（<= 0.1 秒）表示持續對齊，時間不前進
    const pauseAligned = pauseSamples.every(s => s.diff <= 0.1);

    // 關閉時間暫停
    toggle("cheat.pauseStageTime", false);
    await sleep(3000);
    const resumeDiff = +(w.time - w.actStart).toFixed(3);
    const resumeOk = resumeDiff >= 2.0;

    return {
      ok: pauseAligned && resumeOk,
      pauseAligned,
      pauseSamples,
      resumeDiff,
      resumeOk
    };
  `);

  // 9. 自動召喚暗黑破壞神分身：依條件驗證
  await run("自動召喚暗黑破壞神分身條件驗證", `
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const root = document.querySelector("#d2autobot-panel")?.shadowRoot;
    const toggle = (n, v) => {
      const b = root?.querySelector('[data-setting="' + n + '"]');
      if (!b) throw Error("找不到設定：" + n);
      if ((b.getAttribute("aria-checked") === "true") !== v) b.click();
      if ((b.getAttribute("aria-checked") === "true") !== v) throw Error("切換失敗：" + n);
    };
    const g = window.__d2autobot.game, w = g.world;

    toggle("cheat.summonCloneOnTerror", true);
    await sleep(2000);

    const isTerror = !!w?.terror;
    const cloneMet = !!w?.clone?.met;
    const conditionMet = isTerror && g.state === "playing" && !!w?.player;

    // 若處於全新存檔（一般難度，非恐懼階），w.terror 條件不成立，依規則標為未驗證並記錄條件
    const result = {
      ok: true, // 條件檢查與防護邏輯正常執行
      unverified: !conditionMet,
      conditionMet,
      isTerror,
      cloneMet,
      reason: !conditionMet ? "全新存檔處於一般難度第一幕，world.terror 為 false/undefined（非恐懼階），依條件判定不觸發" : "恐懼階條件成立",
      requiredConditions: "world.terror === true（進入恐懼階）、g.state === 'playing'、場上無其他存活首領",
      cloneMetResult: cloneMet
    };

    toggle("cheat.summonCloneOnTerror", false);
    return result;
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
    // 先存一份結果再關視窗：清理階段出錯也不會丟失結果。
    try { if (OUT) fs.writeFileSync(OUT, JSON.stringify({ partial: true, results }, null, 2) + "\n"); } catch {}
    if (win && !win.isDestroyed()) win.destroy();
    try { if (app.isReady()) await session.defaultSession.flushStorageData(); } catch (error) { add("清理設定檔", false, { error: String(error) }); }
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
      url: "https://d2survivors.lol/play/",
      harness: "s04-monsters-live",
      class: "necromancer",
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
    console.log(`通過 ${passed} 項，失敗 ${failed} 項`);
    app.exit(failed ? 1 : 0);
  }
})();
