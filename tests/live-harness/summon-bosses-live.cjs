// 用法：electron tests/live-harness/summon-bosses-live.cjs [輸出.json]
// 驗證兩項遊戲修改在官方 /play/ 實機是否生效：
//   1. cheat.larzukMax：拉蘇克精華（Larzuk's Essence）堆疊數量 99。
//   2. cheat.pauseStageTime：本關經過時間（world.time - world.actStart）在開啟期間不前進。
// 工具包由 PAGES 攔截至本機檔案；遊戲本體來自官方網址。僅使用隔離的 userData，不碰使用者存檔。
const { app, BrowserWindow, session, net } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");
const PAGES = "https://nojackno2-ctrl.github.io/d2-survivors-toolkit/";
const OUT = process.argv.slice(2).find((a) => !a.startsWith("--") && !a.endsWith("electron.exe") && a !== ".");
const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".html": "text/html", ".css": "text/css", ".svg": "image/svg+xml" };
app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "d2summon-")));
app.whenReady().then(async () => {
  let finished = false;
  const done = (result, code = 0) => {
    if (finished) return;
    finished = true;
    const json = JSON.stringify(result, null, 2);
    if (OUT) fs.writeFileSync(OUT, json + "\n");
    else console.log(json);
    app.exit(code);
  };
  setTimeout(() => done({ error: "實機測試逾時" }, 1), 280000);
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  try {
    session.defaultSession.protocol.handle("https", (req) => {
      if (!req.url.startsWith(PAGES)) return net.fetch(req, { bypassCustomProtocolHandlers: true });
      const rel = decodeURIComponent(new URL(req.url).pathname.slice("/d2-survivors-toolkit/".length));
      const file = path.resolve(ROOT, rel);
      if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return new Response("not found", { status: 404 });
      return new Response(fs.readFileSync(file), { headers: { "content-type": (MIME[path.extname(file)] || "application/octet-stream") + "; charset=utf-8", "access-control-allow-origin": "*", "cache-control": "no-store" } });
    });
    const win = new BrowserWindow({ width: 1100, height: 800, show: true, webPreferences: { webSecurity: false, backgroundThrottling: false } });
    await win.loadURL("https://d2survivors.lol/play/").catch(() => {});
    await sleep(4000);
    await win.webContents.executeJavaScript(`(()=>{const b=[...document.querySelectorAll("button")].find(x=>/hosted/i.test(x.textContent));if(b)b.click()})()`);
    await sleep(12000);
    const result = await win.webContents.executeJavaScript(`(async () => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      await import(${JSON.stringify(PAGES + "d2edit.js?v=")} + Date.now());
      for (let i = 0; i < 120 && !window.__d2autobot?.game; i++) {
        document.body.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true }));
        await sleep(500);
      }
      const bot = window.__d2autobot, g = bot?.game;
      if (!g) throw new Error("找不到遊戲物件：" + JSON.stringify(bot?.diagnostics?.()));
      if (g.state === "select") {
        if (!g.plainSelect().onPick) { g.chooseClass(); await sleep(1500); }
        const select = g.plainSelect(), cls = ${JSON.stringify(process.env.H_CLASS || "amazon")};
        const index = select.cards.findIndex(c => c.dataset?.class === cls);
        if (index < 0) throw new Error("找不到職業：" + cls);
        select.select(index); await sleep(300); select.confirm(false);
      }
      for (let i = 0; i < 120 && !g.world?.player; i++) await sleep(500);
      if (!g.world?.player) throw new Error("未進入遊戲：" + JSON.stringify(bot.diagnostics()));
      const root = document.querySelector("#d2autobot-panel")?.shadowRoot;
      const toggle = (name, enabled) => {
        const button = root?.querySelector('[data-setting="' + name + '"]');
        if (!button) throw new Error("找不到設定：" + name);
        if ((button.getAttribute("aria-checked") === "true") !== enabled) button.click();
        if ((button.getAttribute("aria-checked") === "true") !== enabled) throw new Error("設定切換失敗：" + name);
      };
      toggle("enabled", true); toggle("progressEnabled", true);
      for (let i = 0; i < 60 && g.state !== "playing"; i++) await sleep(500);
      await sleep(2000);
      toggle("cheat.pauseStageTime", true); toggle("cheat.invincible", true); toggle("cheat.oneHitKill", true); toggle("cheat.summonAllBosses", true); toggle("cheat.enabled", true);
      const samples = [], seen = new Map();
      let lastBoss = null, spawns = 0;
      const startKills = g.world?.kills ?? 0;
      for (let t = 0; t < 120; t++) {
        await sleep(1000);
        const w = g.world, b = w?.boss;
        if (b && b !== lastBoss) { spawns++; seen.set(b.name ?? b.monster ?? "?", (seen.get(b.name ?? b.monster ?? "?") || 0) + 1); lastBoss = b; }
        if (t % 5 === 0) samples.push({ t, state: g.state, boss: b ? (b.name ?? b.monster) : null, bossDead: !!b?.dead, bossLife: b?.life, kills: w?.kills, clearing: !!w?.clearing, act: w?.act, time: +(w?.time ?? 0).toFixed(1) });
      }
      toggle("cheat.enabled", false);
      await sleep(1000);
      return { pauseOn: true, url: location.href, class: g.kit?.id, startKills, endKills: g.world?.kills, state: g.state, bossSpawnsObserved: spawns, bossNamesObserved: Object.fromEntries(seen), samples, diagnostics: bot.diagnostics() };
    })()`);
    done(result);
  } catch (e) { done({ error: String(e?.stack || e) }, 1); }
});
