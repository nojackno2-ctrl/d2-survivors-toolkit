// 用法：electron tests/live-harness/fresh10/s03-cheats-live.cjs [輸出.json]
// 實機測試員 S03：野蠻人（barbarian）純記憶體作弊與三塊定位實機測試。
// 嚴格遵守獨立全新設定檔、protocol 攔截導向本機專案檔、攔截非 GET /api、
// 先寫結果 JSON 再關視窗、整體逾時、行程結束清理設定檔。
const { app, BrowserWindow, session, net } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.resolve(__dirname, "../../..");
const PAGES = "https://nojackno2-ctrl.github.io/d2-survivors-toolkit/";
const OUT = process.argv.slice(2).find(a => !a.startsWith("--") && !a.endsWith("electron.exe") && a !== ".")
  || path.join(os.tmpdir(), "d2fresh10", "s03.json");
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), "d2fresh10-s03-"));
const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".html": "text/html", ".css": "text/css", ".svg": "image/svg+xml" };

try { fs.mkdirSync(path.dirname(OUT), { recursive: true }); } catch {}

app.setPath("userData", PROFILE);
app.on("window-all-closed", () => {});
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const results = [];
let win, timer, timedOut = false;
let blockedApiCount = 0;
const blockedApis = [];
const add = (name, ok, detail) => results.push({ name, ok: !!ok, detail });

async function main() {
  await app.whenReady();
  await session.defaultSession.protocol.handle("https", async (req) => {
    const url = new URL(req.url);
    // 最後防線：即使工具包失效，也不讓測試送出官方 API 寫入
    if (url.hostname === "d2survivors.lol" && url.pathname.startsWith("/api/") && req.method !== "GET") {
      blockedApiCount++;
      let body = null;
      try { body = await req.clone().text(); } catch {}
      blockedApis.push({ method: req.method, path: url.pathname, length: body ? body.length : 0 });
      return new Response("blocked by harness", { status: 503 });
    }
    if (!req.url.startsWith(PAGES)) return net.fetch(req, { bypassCustomProtocolHandlers: true });
    const rel = decodeURIComponent(url.pathname.slice("/d2-survivors-toolkit/".length));
    const file = path.resolve(ROOT, rel);
    if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return new Response("not found", { status: 404 });
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
      return detail;
    } catch (error) {
      add(name, false, { error: String(error?.stack || error) });
      return null;
    }
  };

  // 1. 工具包載入與 Storage 監控
  await run("工具包載入與存檔寫入監聽", `
    const originalSet = Storage.prototype.setItem;
    window.__s03_setItemCalls = [];
    Storage.prototype.setItem = function(k, v) {
      if (["d2-survivors/save/v1", "d2-survivors/hc/v1"].includes(String(k))) {
        window.__s03_setItemCalls.push({
          key: String(k),
          stack: String(new Error().stack)
        });
      }
      return originalSet.apply(this, arguments);
    };

    await import(${JSON.stringify(PAGES + "d2edit.js?v=")} + Date.now());
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 120 && (!window.__d2guard || !window.__d2autobot?.game); i++) {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true }));
      await sleep(500);
    }
    const guard = window.__d2guard;
    const bot = window.__d2autobot;
    return {
      ok: !!guard && !!bot?.game,
      guardLoaded: !!guard,
      botLoaded: !!bot?.game,
      saveMode: guard?.saveMode?.()
    };
  `);

  // 2. 全新野蠻人進場
  await run("全新野蠻人進場", `
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const g = window.__d2autobot?.game;
    if (!g) throw Error("找不到遊戲物件");
    if (g.state === "select") {
      if (!g.plainSelect().onPick) { g.chooseClass(); await sleep(1500); }
      const s = g.plainSelect();
      const i = s.cards.findIndex(c => c.dataset?.class === "barbarian");
      if (i < 0) throw Error("找不到 barbarian 職業卡片");
      s.select(i);
      await sleep(300);
      s.confirm(false);
    }
    for (let i = 0; i < 120 && !g.world?.player; i++) await sleep(500);
    const p = g.world?.player;
    return {
      ok: !!p && g.kit?.id === "barbarian",
      class: g.kit?.id,
      state: g.state,
      hasPlayer: !!p,
      life: p?.life,
      maxLife: p?.maxLife
    };
  `);

  // 3. 逐項測試作弊：無敵（cheat.invincible）
  await run("作弊驗證：無敵（cheat.invincible）開啟與還原", `
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const g = window.__d2autobot.game, p = g.world.player;
    const root = document.querySelector("#d2autobot-panel")?.shadowRoot;
    const toggle = (n, v) => {
      const b = root?.querySelector('[data-setting="' + n + '"]');
      if (!b) throw Error("找不到設定：" + n);
      if ((b.getAttribute("aria-checked") === "true") !== v) b.click();
      if ((b.getAttribute("aria-checked") === "true") !== v) throw Error("切換失敗：" + n);
    };

    toggle("cheat.enabled", true);
    await sleep(300);

    const beforeDamageTaken = p.damageTaken;
    const beforeLife = p.life;

    toggle("cheat.invincible", true);
    await sleep(1000);
    const duringDamageTaken = p.damageTaken;
    p.life = beforeLife - 20;
    await sleep(300);
    const protectedLife = p.life;

    toggle("cheat.invincible", false);
    await sleep(1000);
    const afterDamageTaken = p.damageTaken;
    const hp = p.life;
    p.life = hp - 5;
    const reducedLife = p.life;
    p.life = hp; // 補回

    const ok = duringDamageTaken === 0 && protectedLife >= beforeLife && afterDamageTaken === beforeDamageTaken && reducedLife === hp - 5;
    return {
      ok,
      before: { damageTaken: beforeDamageTaken, life: beforeLife },
      during: { damageTaken: duringDamageTaken, lifeAttempt: beforeLife - 20, lifeResult: protectedLife },
      after: { damageTaken: afterDamageTaken, reducedLife, restoredLife: hp }
    };
  `);

  // 4. 逐項測試作弊：致命攻擊（cheat.maxCrit）
  await run("作弊驗證：致命攻擊（cheat.maxCrit）開啟與還原", `
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const g = window.__d2autobot.game, p = g.world.player;
    const root = document.querySelector("#d2autobot-panel")?.shadowRoot;
    const toggle = (n, v) => {
      const b = root?.querySelector('[data-setting="' + n + '"]');
      if (!b) throw Error("找不到設定：" + n);
      if ((b.getAttribute("aria-checked") === "true") !== v) b.click();
      if ((b.getAttribute("aria-checked") === "true") !== v) throw Error("切換失敗：" + n);
    };

    const before = {
      criticalStrike: p.criticalStrike ?? null,
      deadlyStrike: p.deadlyStrike ?? null,
      passiveCrit: p.passiveLevels?.criticalStrike ?? null
    };

    toggle("cheat.maxCrit", true);
    await sleep(1000);
    const during = {
      criticalStrike: p.criticalStrike,
      deadlyStrike: p.deadlyStrike,
      passiveCrit: p.passiveLevels?.criticalStrike
    };

    toggle("cheat.maxCrit", false);
    await sleep(1000);
    const after = {
      criticalStrike: p.criticalStrike ?? null,
      deadlyStrike: p.deadlyStrike ?? null,
      passiveCrit: p.passiveLevels?.criticalStrike ?? null
    };

    const ok = during.criticalStrike === 100 && during.deadlyStrike === 100 && during.passiveCrit >= 99 && JSON.stringify(after) === JSON.stringify(before);
    return { ok, before, during, after };
  `);

  // 5. 逐項測試作弊：一擊必殺（cheat.oneHitKill）
  await run("作弊驗證：一擊必殺（cheat.oneHitKill）開啟與還原", `
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const g = window.__d2autobot.game, p = g.world.player;
    const root = document.querySelector("#d2autobot-panel")?.shadowRoot;
    const toggle = (n, v) => {
      const b = root?.querySelector('[data-setting="' + n + '"]');
      if (!b) throw Error("找不到設定：" + n);
      if ((b.getAttribute("aria-checked") === "true") !== v) b.click();
      if ((b.getAttribute("aria-checked") === "true") !== v) throw Error("切換失敗：" + n);
    };

    const before = {
      might: p.might ?? null,
      weaponDamage: p.weaponDamage ?? null,
      damageMult: p.damageMult ?? null,
      physicalDamageMult: p.physicalDamageMult ?? null,
      mastery: p.mastery ? { ...p.mastery } : null
    };

    toggle("cheat.oneHitKill", true);
    await sleep(1000);
    const during = {
      might: p.might,
      weaponDamage: p.weaponDamage,
      damageMult: p.damageMult,
      physicalDamageMult: p.physicalDamageMult,
      mastery: p.mastery ? { ...p.mastery } : null
    };

    toggle("cheat.oneHitKill", false);
    await sleep(1000);
    const after = {
      might: p.might ?? null,
      weaponDamage: p.weaponDamage ?? null,
      damageMult: p.damageMult ?? null,
      physicalDamageMult: p.physicalDamageMult ?? null,
      mastery: p.mastery ? { ...p.mastery } : null
    };

    const ok = during.might >= 100 && during.weaponDamage >= 100 && during.damageMult === 100 && during.physicalDamageMult === 100 && JSON.stringify(after) === JSON.stringify(before);
    return { ok, before, during, after };
  `);

  // 6. 逐項測試作弊：所有技能 +20（cheat.maxSkills）
  await run("作弊驗證：所有技能 +20（cheat.maxSkills）開啟與還原", `
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const g = window.__d2autobot.game, p = g.world.player;
    const root = document.querySelector("#d2autobot-panel")?.shadowRoot;
    const toggle = (n, v) => {
      const b = root?.querySelector('[data-setting="' + n + '"]');
      if (!b) throw Error("找不到設定：" + n);
      if ((b.getAttribute("aria-checked") === "true") !== v) b.click();
      if ((b.getAttribute("aria-checked") === "true") !== v) throw Error("切換失敗：" + n);
    };

    if (typeof p.allSkills !== "number") p.allSkills = 0;
    const beforeSkills = p.allSkills;

    toggle("cheat.maxSkills", true);
    await sleep(1000);
    const duringSkills = p.allSkills;

    toggle("cheat.maxSkills", false);
    await sleep(1000);
    const afterSkills = p.allSkills;

    const ok = duringSkills === beforeSkills + 20 && afterSkills === beforeSkills;
    return { ok, before: beforeSkills, during: duringSkills, after: afterSkills };
  `);

  // 7. 逐項測試作弊：掉寶率最高（cheat.maxDropRate）
  await run("作弊驗證：掉寶率最高（cheat.maxDropRate）開啟與還原", `
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const g = window.__d2autobot.game, p = g.world.player;
    const root = document.querySelector("#d2autobot-panel")?.shadowRoot;
    const toggle = (n, v) => {
      const b = root?.querySelector('[data-setting="' + n + '"]');
      if (!b) throw Error("找不到設定：" + n);
      if ((b.getAttribute("aria-checked") === "true") !== v) b.click();
      if ((b.getAttribute("aria-checked") === "true") !== v) throw Error("切換失敗：" + n);
    };

    const before = {
      magicFind: p.magicFind ?? null,
      uniqueBoost: p.uniqueBoost ?? null,
      rareBoost: p.rareBoost ?? null,
      setBoost: p.setBoost ?? null
    };

    toggle("cheat.maxDropRate", true);
    await sleep(1000);
    const during = {
      magicFind: p.magicFind,
      uniqueBoost: p.uniqueBoost,
      rareBoost: p.rareBoost,
      setBoost: p.setBoost
    };

    toggle("cheat.maxDropRate", false);
    await sleep(1000);
    const after = {
      magicFind: p.magicFind ?? null,
      uniqueBoost: p.uniqueBoost ?? null,
      rareBoost: p.rareBoost ?? null,
      setBoost: p.setBoost ?? null
    };

    const ok = during.magicFind === 999999 && during.uniqueBoost === 9999 && during.rareBoost === 9999 && during.setBoost === 9999 && JSON.stringify(after) === JSON.stringify(before);
    return { ok, before, during, after };
  `);

  // 8. 逐項測試作弊：金幣掉落率最高（cheat.maxGoldRate）
  await run("作弊驗證：金幣掉落率最高（cheat.maxGoldRate）開啟與還原", `
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const g = window.__d2autobot.game, p = g.world.player;
    const root = document.querySelector("#d2autobot-panel")?.shadowRoot;
    const toggle = (n, v) => {
      const b = root?.querySelector('[data-setting="' + n + '"]');
      if (!b) throw Error("找不到設定：" + n);
      if ((b.getAttribute("aria-checked") === "true") !== v) b.click();
      if ((b.getAttribute("aria-checked") === "true") !== v) throw Error("切換失敗：" + n);
    };

    const beforeGoldGain = p.goldGain ?? null;

    toggle("cheat.maxGoldRate", true);
    await sleep(1000);
    const duringGoldGain = p.goldGain;

    toggle("cheat.maxGoldRate", false);
    await sleep(1000);
    const afterGoldGain = p.goldGain ?? null;

    const ok = duringGoldGain === 999999 && afterGoldGain === beforeGoldGain;
    return { ok, before: beforeGoldGain, during: duringGoldGain, after: afterGoldGain };
  `);

  // 9. 全作弊開啟戰鬥 40 秒驗證（擊殺與金幣大量增加）
  await run("全作弊開啟戰鬥 40 秒驗證（擊殺與金幣大量增加）", `
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const g = window.__d2autobot.game, p = g.world.player;
    const root = document.querySelector("#d2autobot-panel")?.shadowRoot;
    const toggle = (n, v) => {
      const b = root?.querySelector('[data-setting="' + n + '"]');
      if (!b) throw Error("找不到設定：" + n);
      if ((b.getAttribute("aria-checked") === "true") !== v) b.click();
      if ((b.getAttribute("aria-checked") === "true") !== v) throw Error("切換失敗：" + n);
    };

    const getGold = () => {
      let gld = 0;
      if (g.purse && typeof g.purse.found === "function") gld = g.purse.found(g.world);
      else if (g.purse && typeof g.purse.carried === "function") gld = g.purse.carried(g.save, g.world);
      else if (Number.isFinite(g.world?.gold)) gld = g.world.gold;
      else if (Number.isFinite(g.save?.gold)) gld = g.save.gold;
      return gld || 0;
    };

    const getKills = () => {
      if (typeof g.world?.kills === "number") return g.world.kills;
      return 0;
    };

    // 記錄戰鬥前的 baseline
    const goldBefore = getGold();
    const killsBefore = getKills();
    const levelBefore = p.level || g.level || 1;
    const timeBefore = g.world?.time || 0;

    // 開啟戰鬥、自動吸金幣與全體作弊
    toggle("enabled", true);
    toggle("progressEnabled", true);
    toggle("loot.vacuumGold", true);
    toggle("cheat.enabled", true);
    toggle("cheat.invincible", true);
    toggle("cheat.maxCrit", true);
    toggle("cheat.oneHitKill", true);
    toggle("cheat.maxSkills", true);
    toggle("cheat.maxDropRate", true);
    toggle("cheat.maxGoldRate", true);

    // 戰鬥 40 秒
    // 金幣要「有掉落物並被吸過來」才會入帳，40 秒內不一定剛好掉金幣（實測 4 次有 2 次是 0）。
    // 每 2 秒取樣地上金幣數；40 秒後若仍未入帳，最多再等到 120 秒。
    // 這樣可以分辨「這段時間沒掉金幣」與「金幣掉在地上卻沒被吸走」（後者才是產品問題）。
    const start = Date.now();
    const groundGold = () => (g.world?.pickups || []).filter(e => e && e.kind === "gold" && !e.dead && !e.discarded).length;
    let maxGroundGold = 0, groundSamples = 0, groundSeen = 0;
    while (Date.now() - start < 120000) {
      await sleep(2000);
      const n = groundGold(); groundSamples++; if (n > 0) groundSeen++; if (n > maxGroundGold) maxGroundGold = n;
      if (Date.now() - start >= 40000 && getGold() - goldBefore > 0) break;
    }
    const durationMs = Date.now() - start;

    const goldAfter = getGold();
    const killsAfter = getKills();
    const levelAfter = p.level || g.level || 1;
    const timeAfter = g.world?.time || 0;

    const goldGained = goldAfter - goldBefore;
    const killsGained = killsAfter - killsBefore;
    const levelsGained = levelAfter - levelBefore;

    // 判定擊殺很快與金幣大量增加：
    // 在一擊必殺+暴擊下，擊殺數大幅提升（或等級提升多級），金幣倍率 999999 下金幣顯著增加
    const combatFast = killsGained > 10 || levelsGained >= 2;
    const goldMassive = goldGained > 10000 || goldAfter > 10000;
    const ok = p.life > 0 && combatFast && goldMassive;

    return {
      ok,
      durationMs,
      gold: { before: goldBefore, after: goldAfter, gained: goldGained },
      groundGold: { samples: groundSamples, samplesWithGoldOnGround: groundSeen, max: maxGroundGold, leftAtEnd: groundGold() },
      kills: { before: killsBefore, after: killsAfter, gained: killsGained },
      level: { before: levelBefore, after: levelAfter, gained: levelsGained },
      combatFast,
      goldMassive,
      playerAlive: p.life > 0,
      currentLife: p.life
    };
  `);

  // 10. 三塊定位驗證（純記憶體、tainted/runRecord不變、排行榜鎖定）
  await run("三塊定位驗證（純記憶體、tainted/runRecord不變、排行榜鎖定）", `
    const g = window.__d2autobot.game;
    const calls = window.__s03_setItemCalls || [];
    const helperCalls = calls.filter(x => {
      const f = x.stack.split("\\n").filter(l => l.includes("https://") && !l.includes("/guard/guard.js"))[0] || "";
      return f.includes("/helper/");
    });

    const tainted = g.tainted;
    let rec = null;
    try {
      rec = g.runRecord ? g.runRecord("probe0000000000000000") : null;
    } catch (e) {
      rec = { error: String(e) };
    }
    const flags = rec?.flags;
    const notes = rec?.notes;
    const leaderboardOff = g.save?.leaderboard?.off;

    const ok = helperCalls.length === 0 && tainted !== true && leaderboardOff === true;
    return {
      ok,
      helperCallsCount: helperCalls.length,
      helperCalls,
      totalSaveWrites: calls.length,
      tainted,
      flags,
      notes,
      leaderboardOff
    };
  `);

  // 11. API 攔截驗證（無任何非 GET 的 /api 請求送出）
  add("API攔截驗證（零非GET請求送出）", blockedApiCount === 0, {
    blockedApiCount,
    blockedApis
  });
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
    try { if (OUT) fs.writeFileSync(OUT, JSON.stringify({ partial: true, profile: PROFILE, results }, null, 2) + "\n"); } catch {}
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
      tester: "S03",
      class: "barbarian",
      isolatedFreshProfile: true,
      profile: PROFILE,
      blockedApiCount,
      blockedApis,
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
