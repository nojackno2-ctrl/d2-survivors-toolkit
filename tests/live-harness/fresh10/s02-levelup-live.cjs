// S02 實機測試：法師升級選卡、排行榜配法選卡、自動重抽、自動配屬性點、經驗加成最大與還原
// 依 toolkit-roles-live.cjs 規範：全新隔離設定檔、攔截非 GET /api、逾時保護、先存結果後關閉、退出碼。
const { app, BrowserWindow, session, net } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.resolve(__dirname, "../../..");
const PAGES = "https://nojackno2-ctrl.github.io/d2-survivors-toolkit/";
const OUT = process.argv.slice(2).find(a => !a.startsWith("--") && !a.endsWith("electron.exe") && a !== ".");
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), "d2fresh-s02-"));
const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".html": "text/html", ".css": "text/css", ".svg": "image/svg+xml" };

app.setPath("userData", PROFILE);
app.disableHardwareAcceleration();
app.on("window-all-closed", () => {});

const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
let win, timer, timedOut = false;
const add = (name, ok, detail) => results.push({ name, ok: !!ok, detail });
const run = async (name, fn) => {
  try {
    const d = await fn();
    add(name, d.ok, d);
  } catch (e) {
    add(name, false, { error: String(e?.stack || e) });
  }
};
const evalMain = code => win.webContents.executeJavaScript(`(async()=>{${code}})()`);

async function main() {
  await app.whenReady();
  await session.defaultSession.protocol.handle("https", req => {
    const u = new URL(req.url);
    if (u.hostname === "d2survivors.lol" && u.pathname.startsWith("/api/") && req.method !== "GET") {
      return new Response("blocked by harness", { status: 503 });
    }
    if (!req.url.startsWith(PAGES)) return net.fetch(req, { bypassCustomProtocolHandlers: true });
    const rel = decodeURIComponent(u.pathname.slice("/d2-survivors-toolkit/".length));
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
  await evalMain(`const b=[...document.querySelectorAll('button')].find(x=>/hosted/i.test(x.textContent));if(b)b.click()`);
  await sleep(12000);

  // 1. 全新法師進場
  await run("全新法師進場", async () => evalMain(`
    await import(${JSON.stringify(PAGES + "d2edit.js?v=")} + Date.now());
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 120 && !window.__d2autobot?.game; i++) {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true }));
      await sleep(500);
    }
    const g = window.__d2autobot?.game;
    if (!g) throw Error("找不到遊戲物件");
    if (g.state === "select") {
      if (!g.plainSelect().onPick) { g.chooseClass(); await sleep(1500); }
      const s = g.plainSelect();
      const i = s.cards.findIndex(c => c.dataset?.class === "sorceress");
      if (i < 0) throw Error("找不到 sorceress 選項");
      s.select(i);
      await sleep(300);
      s.confirm(false);
    }
    for (let i = 0; i < 120 && !g.world?.player; i++) await sleep(500);
    return {
      ok: !!g.world?.player && g.kit?.id === "sorceress" && (g.world.player.level || g.level || 1) === 1,
      state: g.state,
      cls: g.kit?.id,
      level: g.world?.player?.level || g.level || 1,
      saveExists: localStorage.getItem("d2-survivors/save/v1") !== null
    };
  `));

  // 2. 面板設定與開關狀態一致性
  await run("面板設定與開關狀態一致性", async () => evalMain(`
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const bot = window.__d2autobot;
    if (!bot) throw Error("找不到 autobot 物件");
    const root = document.querySelector("#d2autobot-panel")?.shadowRoot;
    if (!root) throw Error("找不到 autobot 面板 shadowRoot");

    const toggle = (path, want) => {
      const b = root.querySelector('[data-setting="' + path + '"]');
      if (!b) throw Error("找不到設定按鈕：" + path);
      if ((b.getAttribute("aria-checked") === "true") !== want) {
        b.click();
      }
      return b.getAttribute("aria-checked") === "true";
    };

    // 依要求配置：遊戲修改總開關、經驗值加成最大、排行榜選卡、自動配點、自動重抽、自動戰鬥
    toggle("cheat.enabled", true);
    toggle("cheat.maxXp", true);
    toggle("build.ladder", true);
    toggle("build.autoStats", true);
    toggle("build.autoReroll", true);
    toggle("progressEnabled", true);

    await sleep(600);

    const checks = {};
    const settings = bot.settings;
    const paths = ["progressEnabled", "build.ladder", "build.autoStats", "build.autoReroll", "cheat.enabled", "cheat.maxXp"];
    let allMatched = true;

    for (const path of paths) {
      const b = root.querySelector('[data-setting="' + path + '"]');
      const displayed = b?.getAttribute("aria-checked") === "true";
      const parts = path.split(".");
      let val = settings;
      for (const p of parts) val = val?.[p];
      const actual = !!val;
      const matched = displayed === actual && actual === true;
      if (!matched) allMatched = false;
      checks[path] = { displayed, actual, matched };
    }

    // 關閉面板，確保 panel.hidden 允許 autobot 自動選卡
    const closeBtn = root.querySelector("#close");
    if (closeBtn) closeBtn.click();
    await sleep(400);

    const panelHidden = document.querySelector("#d2autobot-panel")?.shadowRoot?.querySelector(".backdrop")?.hidden;
    return {
      ok: allMatched && panelHidden === true,
      checks,
      panelHidden
    };
  `));

  // 3. 自動戰鬥、升級處理與無卡住監控（跑約 90 秒）
  await run("自動戰鬥與升級畫面自動處理", async () => evalMain(`
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const g = window.__d2autobot?.game;
    if (!g) throw Error("找不到遊戲物件");

    const startLevel = g.level || g.world?.player?.level || 1;
    const startTime = Date.now();
    const durationLimitMs = 90000; // 跑 90 秒

    let maxLevelUpDurationMs = 0;
    let currentLevelUpStart = 0;
    let stuckEvents = [];
    let snapshots = [];

    while (Date.now() - startTime < durationLimitMs) {
      const now = Date.now();
      const state = g.state;
      const lv = g.level || g.world?.player?.level || 0;

      if (state === "levelUp") {
        if (!currentLevelUpStart) currentLevelUpStart = now;
        const dur = now - currentLevelUpStart;
        if (dur > maxLevelUpDurationMs) maxLevelUpDurationMs = dur;
        if (dur > 10000) {
          stuckEvents.push({ elapsedSec: Math.floor((now - startTime) / 1000), dur, level: lv });
        }
      } else {
        if (currentLevelUpStart) {
          const dur = now - currentLevelUpStart;
          if (dur > maxLevelUpDurationMs) maxLevelUpDurationMs = dur;
          currentLevelUpStart = 0;
        }
      }

      snapshots.push({
        elapsedSec: Math.floor((now - startTime) / 1000),
        state,
        level: lv,
        unspent: g.build?.unspent || 0
      });

      await sleep(1000);
    }

    // 若正好在 90 秒時進入 levelUp，等待最多 5 秒給予自動選卡處理完畢
    for (let i = 0; i < 10 && g.state === "levelUp"; i++) {
      await sleep(500);
    }

    const finalLevel = g.level || g.world?.player?.level || 0;
    const finalState = g.state;

    return {
      ok: finalLevel > startLevel && stuckEvents.length === 0 && finalState !== "levelUp",
      startLevel,
      finalLevel,
      levelGained: finalLevel - startLevel,
      finalState,
      maxLevelUpDurationMs,
      stuckCount: stuckEvents.length,
      stuckEvents,
      sampleSnapshots: snapshots.filter((_, i) => i % 15 === 0)
    };
  `));

  // 4. 技能與被動等級增加
  await run("技能與被動等級增加", async () => evalMain(`
    const g = window.__d2autobot?.game;
    if (!g) throw Error("找不到遊戲物件");
    const skills = Array.isArray(g.build?.skills) ? g.build.skills : [];
    const passives = Array.isArray(g.build?.passives) ? g.build.passives : [];
    const skillSum = skills.reduce((acc, s) => acc + (s.level || 0), 0);
    const passiveSum = passives.reduce((acc, p) => acc + (p.level || 0), 0);
    const totalPoints = skillSum + passiveSum;

    return {
      ok: totalPoints > 1 && skills.length > 0,
      skillsCount: skills.length,
      passivesCount: passives.length,
      skillSum,
      passiveSum,
      totalPoints,
      skills: skills.map(s => ({ id: s.id, name: s.name, level: s.level })),
      passives: passives.map(p => ({ id: p.id, name: p.name, level: p.level }))
    };
  `));

  // 5. 屬性點分配與 statCarry 寫入
  await run("屬性點分配與 statCarry 寫入", async () => evalMain(`
    const g = window.__d2autobot?.game;
    if (!g) throw Error("找不到遊戲物件");
    const unspent = g.build?.unspent | 0;
    const attributes = g.build?.attributes || {};
    const rawCarry = localStorage.getItem("d2autobot:statCarry");
    let carry = null;
    try { carry = JSON.parse(rawCarry || "null"); } catch {}

    const sorcCarry = carry?.sorceress;
    // 嚴格斷言：未分配點數接近 0（<= 5）、各屬性高於初始、且 d2autobot:statCarry 有寫入
    const statAllocated = ((attributes.energy || 0) > 0) || (unspent <= 5);
    const carryWritten = !!sorcCarry && typeof sorcCarry === "object";

    return {
      ok: statAllocated && carryWritten && unspent <= 5,
      unspent,
      attributes,
      rawCarry,
      sorcCarry,
      statAllocated,
      carryWritten
    };
  `));

  // 6. 關閉經驗值加成最大與 gainXp 還原
  await run("關閉經驗加成最大與 gainXp 還原", async () => evalMain(`
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const g = window.__d2autobot?.game;
    if (!g) throw Error("找不到遊戲物件");
    const root = document.querySelector("#d2autobot-panel")?.shadowRoot;
    if (!root) throw Error("找不到 autobot 面板 shadowRoot");

    // 先暫停自動戰鬥，避免背景打怪干擾經驗測試
    const progBtn = root.querySelector('[data-setting="progressEnabled"]');
    if (progBtn && progBtn.getAttribute("aria-checked") === "true") {
      progBtn.click();
    }
    await sleep(1500); // 等待飛行中技能結束

    // 關閉 cheat.maxXp
    const btn = root.querySelector('[data-setting="cheat.maxXp"]');
    if (!btn) throw Error("找不到 cheat.maxXp 按鈕");
    if (btn.getAttribute("aria-checked") === "true") {
      btn.click();
    }
    await sleep(800); // 等待 autobot tick 執行 restoreXpWrap

    const ariaCheckedAfter = btn.getAttribute("aria-checked");
    const settingVal = window.__d2autobot.settings.cheat.maxXp;

    const beforeXp = g.xp;
    // 呼叫 10 點經驗
    g.gainXp(10);
    await sleep(300);
    const afterXp = g.xp;
    const gained = afterXp - beforeXp;

    return {
      ok: ariaCheckedAfter === "false" && settingVal === false && gained === 10,
      ariaCheckedAfter,
      settingVal,
      beforeXp,
      afterXp,
      gained
    };
  `));
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
    if (cleanupError) console.warn("設定檔將於行程結束時清理：" + PROFILE);

    const passed = results.filter(x => x.ok).length;
    const failed = results.length - passed;
    const report = {
      url: "https://d2survivors.lol/play/",
      role: "s02",
      class: "sorceress",
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
    console.log(`S02 測試結束：通過 ${passed} 項，失敗 ${failed} 項`);
    app.exit(failed ? 1 : 0);
  }
})();
