// 用法：electron tests/live-harness/fresh10/s10-online-afk-live.cjs [輸出.json]
// 實機測試員 S10 專用腳本：線上存檔模式停用項驗證 ＋ 掛機與效能頁實機驗證（職業 barbarian）
const { app, BrowserWindow, session, net } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.resolve(__dirname, "../../..");
const PAGES = "https://nojackno2-ctrl.github.io/d2-survivors-toolkit/";
const OUT = process.argv.slice(2).find(a => !a.startsWith("--") && !a.endsWith("electron.exe") && a !== ".");
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), "d2fresh10-s10-"));
const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".html": "text/html", ".css": "text/css", ".svg": "image/svg+xml" };
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

  // 1. 載入工具包與角色選單
  await run("工具包載入與模組就緒", `
    await import(${JSON.stringify(PAGES + "d2edit.js?v=")} + Date.now());
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 120 && (!window.__d2guard || !window.__d2autobot?.game); i++) {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true }));
      await sleep(500);
    }
    const guard = window.__d2guard, status = guard?.status(), features = window.__d2toolkit?.features() || [];
    const ids = features.map(x => x.id);
    return {
      ok: !!guard && status?.noUpload === true && guard.saveMode() === "local" && ["autobot", "editor", "guard", "afk", "perf"].every(x => ids.includes(x)),
      status,
      features
    };
  `);

  // 2. 選擇野蠻人（barbarian）全新存檔進場
  await run("建立全新 barbarian 角色並進場", `
    const sleep = ms => new Promise(r => setTimeout(r, ms)), g = window.__d2autobot?.game;
    if (!g) throw Error("找不到遊戲物件");
    if (g.state === "select") {
      if (!g.plainSelect().onPick) { g.chooseClass(); await sleep(1500); }
      const s = g.plainSelect(), i = s.cards.findIndex(c => c.dataset?.class === "barbarian");
      if (i < 0) throw Error("找不到 barbarian 職業卡片");
      s.select(i);
      await sleep(300);
      s.confirm(false);
    }
    for (let i = 0; i < 120 && !g.world?.player; i++) await sleep(500);
    return {
      ok: !!g.world?.player && g.kit?.id === "barbarian",
      state: g.state,
      cls: g.kit?.id,
      saveExists: localStorage.getItem("d2-survivors/save/v1") !== null
    };
  `);

  // 3. (A-1) 單機模式作弊開關與效果記錄
  await run("(A-1) 單機模式作弊開關與效果驗證", `
    const sleep = ms => new Promise(r => setTimeout(r, ms)), bot = window.__d2autobot, g = bot?.game;
    if (!g) throw Error("找不到遊戲物件");
    const root = document.querySelector("#d2autobot-panel")?.shadowRoot;
    const toggle = (n, v) => {
      const b = root?.querySelector('[data-setting="' + n + '"]');
      if (!b) throw Error("找不到設定：" + n);
      if ((b.getAttribute("aria-checked") === "true") !== v) b.click();
      if ((b.getAttribute("aria-checked") === "true") !== v) throw Error("切換失敗：" + n);
    };

    toggle("cheat.enabled", true);
    toggle("cheat.larzukMax", true);
    toggle("cheat.forgeMax", true);
    toggle("cheat.infiniteRerolls", true);

    await sleep(1200); // 讓 tick 執行 applyCheats

    const cls = g.kit?.id;
    const stash = g.save?.stashTabs?.[cls] || [];
    const inv = g.save?.inventoryByClass?.[cls] || [];
    const larzukItem = [...stash, ...inv].find(it => it?.base === "Larzuk's Essence");
    const larzukCount = larzukItem?.count;
    const ranksRerolls = g.save?.ranks?.rerolls;
    const buildRerolls = g.build?.rerolls;
    const virtualForge = bot.virtualEssence();

    const ok = larzukCount === 99 && ranksRerolls >= 999 && buildRerolls === 99 && virtualForge === true;
    return {
      ok,
      larzukCount,
      ranksRerolls,
      buildRerolls,
      virtualForge,
      stashLength: stash.length,
      invLength: inv.length
    };
  `);

  // 4. (A-2) 切換線上模式：停用項、記憶體作弊與排行榜阻擋
  await run("(A-2) 線上模式停用項、記憶體作弊與排行榜阻擋", `
    const sleep = ms => new Promise(r => setTimeout(r, ms)), bot = window.__d2autobot, g = bot?.game, guard = window.__d2guard;
    const root = document.querySelector("#d2autobot-panel")?.shadowRoot;
    const toggle = (n, v) => {
      const b = root?.querySelector('[data-setting="' + n + '"]');
      if (!b) throw Error("找不到設定：" + n);
      if ((b.getAttribute("aria-checked") === "true") !== v) b.click();
      if ((b.getAttribute("aria-checked") === "true") !== v) throw Error("切換失敗：" + n);
    };

    const cls = g.kit?.id;
    // 還原乾淨狀態：清空已產生的拉蘇克精華，重置重抽次數
    if (g.save?.stashTabs?.[cls]) {
      g.save.stashTabs[cls] = g.save.stashTabs[cls].filter(it => it?.base !== "Larzuk's Essence");
    }
    if (g.save?.inventoryByClass?.[cls]) {
      g.save.inventoryByClass[cls] = g.save.inventoryByClass[cls].filter(it => it?.base !== "Larzuk's Essence");
    }
    if (g.save?.ranks) g.save.ranks.rerolls = 0;
    if (g.build) g.build.rerolls = 0;

    // 切到線上存檔模式
    guard.setSaveMode("online");
    await sleep(600); // 讓 autobot 的 200ms 計時器執行 refreshControls()

    // 檢查面板上控制項顯示與設定值
    const larzukBtn = root.querySelector('[data-setting="cheat.larzukMax"]');
    const forgeBtn = root.querySelector('[data-setting="cheat.forgeMax"]');
    const infiniteBtn = root.querySelector('[data-setting="cheat.infiniteRerolls"]');
    const larzukLabel = root.getElementById(larzukBtn.id + "-label");
    const forgeLabel = root.getElementById(forgeBtn.id + "-label");
    const infiniteLabel = root.getElementById(infiniteBtn.id + "-label");

    const larzukUiOff = larzukBtn.getAttribute("aria-checked") === "false" && larzukBtn.disabled === true && larzukBtn.getAttribute("aria-disabled") === "true";
    const forgeUiOff = forgeBtn.getAttribute("aria-checked") === "false" && forgeBtn.disabled === true && forgeBtn.getAttribute("aria-disabled") === "true";
    const larzukTextDisabled = larzukLabel.textContent.includes("線上存檔不可用");
    const forgeTextDisabled = forgeLabel.textContent.includes("線上存檔不可用");
    const infiniteTextRunOnly = infiniteLabel.textContent.includes("本局有效");

    // 設定值保留
    const larzukSettingRetained = bot.settings.cheat.larzukMax === true;
    const forgeSettingRetained = bot.settings.cheat.forgeMax === true;

    // 實際不生效：經過 tick 運算後，不新增精華也不注入虛擬恐懼精華
    await sleep(1200);
    const stashNow = g.save?.stashTabs?.[cls] || [];
    const invNow = g.save?.inventoryByClass?.[cls] || [];
    const larzukFound = [...stashNow, ...invNow].some(it => it?.base === "Larzuk's Essence");
    const virtualEssenceNow = bot.virtualEssence();

    // infiniteRerolls: 本局有效，build.rerolls 仍被拉高至 99，但 save.ranks.rerolls 未被改寫（維持 0）
    const buildRerolls = g.build?.rerolls;
    const saveRerolls = g.save?.ranks?.rerolls;

    // 無敵等純記憶體作弊照常生效
    toggle("cheat.invincible", true);
    await sleep(300);
    const p = g.world.player, hpBefore = p.life;
    p.life = hpBefore - 30;
    await sleep(400);
    const hpAfter = p.life;

    // 排行榜上傳仍被擋
    const blockedBefore = guard.status().blockedUploads;
    let uploadRejected = false;
    try { await fetch("/api/leaderboard/runs", { method: "POST", body: "{}" }); } catch (e) { uploadRejected = true; }
    const blockedAfter = guard.status().blockedUploads;

    const ok = larzukUiOff && forgeUiOff && larzukTextDisabled && forgeTextDisabled &&
               larzukSettingRetained && forgeSettingRetained &&
               !larzukFound && virtualEssenceNow === false &&
               infiniteTextRunOnly && buildRerolls === 99 && saveRerolls === 0 &&
               hpAfter >= hpBefore &&
               uploadRejected && blockedAfter > blockedBefore;

    return {
      ok,
      larzukUiOff,
      forgeUiOff,
      larzukTextDisabled,
      forgeTextDisabled,
      larzukSettingRetained,
      forgeSettingRetained,
      larzukFound,
      virtualEssenceNow,
      infiniteTextRunOnly,
      buildRerolls,
      saveRerolls,
      hpBefore,
      hpAfter,
      uploadRejected,
      blockedBefore,
      blockedAfter
    };
  `);

  // 5. (A-3) 切回單機模式恢復開關與生效
  await run("(A-3) 切回單機模式恢復開關與重新生效", `
    const sleep = ms => new Promise(r => setTimeout(r, ms)), bot = window.__d2autobot, g = bot?.game, guard = window.__d2guard;
    const root = document.querySelector("#d2autobot-panel")?.shadowRoot;

    // 切回單機模式
    guard.setSaveMode(null);
    await sleep(600); // 讓 autobot 偵測到模式切換並更新 UI

    const larzukBtn = root.querySelector('[data-setting="cheat.larzukMax"]');
    const forgeBtn = root.querySelector('[data-setting="cheat.forgeMax"]');
    const larzukLabel = root.getElementById(larzukBtn.id + "-label");
    const forgeLabel = root.getElementById(forgeBtn.id + "-label");

    const larzukRestored = larzukBtn.getAttribute("aria-checked") === "true" && !larzukBtn.disabled;
    const forgeRestored = forgeBtn.getAttribute("aria-checked") === "true" && !forgeBtn.disabled;
    const larzukLabelRestored = !larzukLabel.textContent.includes("線上存檔不可用");
    const forgeLabelRestored = !forgeLabel.textContent.includes("線上存檔不可用");

    // 等待 tick 執行 applyCheats 重新生效
    await sleep(1200);

    const cls = g.kit?.id;
    const stash = g.save?.stashTabs?.[cls] || [];
    const inv = g.save?.inventoryByClass?.[cls] || [];
    const larzukItem = [...stash, ...inv].find(it => it?.base === "Larzuk's Essence");
    const larzukCount = larzukItem?.count;
    const virtualEssence = bot.virtualEssence();
    const saveRerolls = g.save?.ranks?.rerolls;

    const ok = larzukRestored && forgeRestored && larzukLabelRestored && forgeLabelRestored &&
               larzukCount === 99 && virtualEssence === true && saveRerolls >= 999;

    return {
      ok,
      larzukRestored,
      forgeRestored,
      larzukLabelRestored,
      forgeLabelRestored,
      larzukCount,
      virtualEssence,
      saveRerolls
    };
  `);

  // 6. (B-1) 掛機功能實機驗證（黑幕、邏輯推進、跳過繪製、喚醒）
  await run("(B-1) 掛機功能實機驗證", `
    const sleep = ms => new Promise(r => setTimeout(r, ms)), bot = window.__d2autobot, g = bot?.game;
    if (!g) throw Error("找不到遊戲物件");

    // 確保遊戲未暫停
    if (document.body.classList.contains("frontend-over-run")) document.body.classList.remove("frontend-over-run");
    try { g.resume(); } catch (e) {}
    await sleep(300);

    // 開啟工具包選單點擊「掛機」
    const launcher = window.__d2editLauncher;
    launcher.click();
    const menu = window.__d2toolkitMenu;
    const afkItem = [...menu.children].find(x => x.textContent.trim() === "掛機");
    if (!afkItem) throw Error("找不到掛機選單項目");
    afkItem.click();
    await sleep(400);

    // 1. 全螢幕黑幕出現且 window.__d2afk === true
    const afkEl = document.getElementById("d2autoforge-afk");
    const hasBlackout = !!afkEl && getComputedStyle(afkEl).position === "fixed" && getComputedStyle(afkEl).backgroundColor === "rgb(0, 0, 0)";
    const isAfk = window.__d2afk === true;

    // 2. 遊戲邏輯推進、略過主畫面繪製
    const time0 = g.world?.time || 0;
    const skipped0 = window.__d2afkStats?.skippedMain || 0;
    const kills0 = g.world?.player?.kills ?? (g.world?.kills ?? 0);

    // 啟動自動戰鬥
    bot.settings.progressEnabled = true;
    await sleep(3500);

    const time1 = g.world?.time || 0;
    const skipped1 = window.__d2afkStats?.skippedMain || 0;
    const kills1 = g.world?.player?.kills ?? (g.world?.kills ?? 0);

    const timeAdvanced = time1 > time0;
    const drawSkipped = skipped1 > skipped0;

    // 3. 點擊黑幕喚醒，畫面恢復
    afkEl.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
    await sleep(400);

    const afkRemoved = document.getElementById("d2autoforge-afk") === null;
    const afkOff = window.__d2afk === false;

    const ok = hasBlackout && isAfk && timeAdvanced && drawSkipped && afkRemoved && afkOff;

    return {
      ok,
      hasBlackout,
      isAfk,
      time0,
      time1,
      timeAdvanced,
      skipped0,
      skipped1,
      drawSkipped,
      kills0,
      kills1,
      afkRemoved,
      afkOff
    };
  `);

  // 7. (B-2) 效能頁實機驗證（開啟、指標數值、關閉、無殘留計時器錯誤）
  await run("(B-2) 效能頁實機驗證", `
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const errs = [];
    const errorHandler = e => errs.push(String(e.message || e.error || e));
    window.addEventListener("error", errorHandler);

    // 打開工具包選單點選「效能」
    const launcher = window.__d2editLauncher;
    launcher.click();
    const menu = window.__d2toolkitMenu;
    const perfItem = [...menu.children].find(x => x.textContent.trim() === "效能");
    if (!perfItem) throw Error("找不到效能選單項目");
    perfItem.click();
    await sleep(900); // 等待指標第一次 500ms 計時器更新

    // 1. 能開啟
    const page = document.getElementById("d2perf-page");
    const opened = !!page && getComputedStyle(page).display !== "none";

    // 2. 各指標有數值
    const innerText = page ? page.innerText : "";
    const requiredLabels = ["畫面更新率", "影格間隔", "JS 記憶體", "DOM 節點數", "已載入資源", "頁面載入", "視窗與裝置"];
    const hasLabels = requiredLabels.every(l => innerText.includes(l));

    // 抓取指標卡片各鍵值對確認數值非空且非純破折號
    const card = page?.querySelector("div[style*='grid']");
    const metrics = {};
    if (card) {
      const children = [...card.children];
      for (let i = 0; i < children.length; i += 2) {
        const k = children[i]?.textContent?.trim() || "";
        const v = children[i + 1]?.textContent?.trim() || "";
        if (k) metrics[k] = v;
      }
    }
    const metricsFound = Object.keys(metrics).length;
    const allMetricsHaveValues = requiredLabels.every(l => {
      const entry = Object.entries(metrics).find(([k]) => k.includes(l));
      return entry && entry[1] !== "" && entry[1] !== "—";
    });

    // 3. 可關閉
    const closeBtn = [...page.querySelectorAll("button")].find(b => b.textContent.trim() === "關閉");
    if (!closeBtn) throw Error("找不到效能頁關閉按鈕");
    closeBtn.click();
    await sleep(500);
    const closed = document.getElementById("d2perf-page") === null;

    // 4. 關閉後沒有殘留計時器造成的錯誤
    await sleep(1500);
    window.removeEventListener("error", errorHandler);
    const noResidualErrors = errs.length === 0;

    const ok = opened && hasLabels && metricsFound >= 7 && allMetricsHaveValues && closed && noResidualErrors;

    return {
      ok,
      opened,
      hasLabels,
      metricsFound,
      allMetricsHaveValues,
      metrics,
      hasLabels,
      metricsFound,
      closed,
      noResidualErrors,
      errorCount: errs.length,
      errors: errs,
      snippet: innerText.slice(0, 300)
    };
  `);
}

(async () => {
  try {
    await Promise.race([
      main(),
      new Promise((_, reject) => {
        timer = setTimeout(() => { timedOut = true; reject(Error("實機測試整體逾時")); }, 280000);
      })
    ]);
  } catch (error) {
    add("執行錯誤", false, { error: String(error?.stack || error), timedOut });
  } finally {
    clearTimeout(timer);
    try { if (OUT) fs.writeFileSync(OUT, JSON.stringify({ partial: true, results }, null, 2) + "\n"); } catch {}
    if (win && !win.isDestroyed()) win.destroy();
    try { if (app.isReady()) await session.defaultSession.flushStorageData(); } catch (error) { add("清理設定檔", false, { error: String(error) }); }
    let cleanupError;
    for (let i = 0; i < 5; i++) {
      try { fs.rmSync(PROFILE, { recursive: true, force: true }); cleanupError = null; break; }
      catch (error) { cleanupError = error; await sleep(300); }
    }
    process.on("exit", () => { try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch {} });
    if (cleanupError) console.warn("設定檔將於行程結束時清理：" + PROFILE);
    const passed = results.filter(x => x.ok).length, failed = results.length - passed;
    const report = {
      url: "https://d2survivors.lol/play/",
      role: "barbarian",
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
