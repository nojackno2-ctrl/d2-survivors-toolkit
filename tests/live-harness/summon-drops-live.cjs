// 用法：electron tests/live-harness/summon-drops-live.cjs [輸出.json]
// 驗證「關卡內持續召喚頭目」的掉落：開啟 summonAllBosses，並把世界切到恐懼階（world.terror），
// 利用遊戲掉落紀錄 world.dropLog（Py 會把每件掉落與來源寫入此陣列）統計鑰匙、精華、器官等掉落來源。
// 工具包由 PAGES 攔截至本機檔案；遊戲本體來自官方網址。僅使用隔離的 userData，不碰使用者存檔。
const { app, BrowserWindow, session, net } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");
const PAGES = "https://nojackno2-ctrl.github.io/d2-survivors-toolkit/";
const OUT = process.argv.slice(2).find((a) => !a.startsWith("--") && !a.endsWith("electron.exe") && a !== ".");
const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".html": "text/html", ".css": "text/css", ".svg": "image/svg+xml" };
app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "d2drops-")));
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
  setTimeout(() => done({ error: "實機測試逾時" }, 1), Number(process.env.H_TIMEOUT_MS) || 285000);
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  try {
    session.defaultSession.protocol.handle("https", (req) => {
      if (!req.url.startsWith(PAGES)) return net.fetch(req, { bypassCustomProtocolHandlers: true });
      const rel = decodeURIComponent(new URL(req.url).pathname.slice("/d2-survivors-toolkit/".length));
      const file = path.resolve(ROOT, rel);
      if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return new Response("not found", { status: 404 });
      let body = fs.readFileSync(file);
      // 對照組：H_NOGUARD=1 時移除 actCleared 攔截呼叫（不改原始碼），用來確認攔截確實有作用。
      if (rel === "helper/autobot.js" && process.env.H_NOGUARD === "1") { const txt = body.toString("utf8"); if (!txt.includes("    guardActCleared(w);")) throw new Error("找不到 guardActCleared 呼叫"); body = Buffer.from(txt.replace("    guardActCleared(w);", ""), "utf8"); }
      return new Response(body, { headers: { "content-type": (MIME[path.extname(file)] || "application/octet-stream") + "; charset=utf-8", "access-control-allow-origin": "*", "cache-control": "no-store" } });
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
      if (g.state !== "playing") throw new Error("無法進入 playing：" + g.state);
      toggle("cheat.enabled", true); toggle("cheat.invincible", true); toggle("cheat.oneHitKill", true); toggle("cheat.summonAllBosses", true);
      const w = g.world;
      // 恐懼階：與遊戲的 terror 物件同形（tier 決定鑰匙與精華的掉落機率）。
      w.terror = { tier: 1, level: 86, affixes: [] };
      w.dropLog = [];
      const SAMPLE_MS = ${Number(process.env.H_SAMPLE_MS) || 240000}, t0 = performance.now();
      const bossNames = {}, samples = [], uberKills = []; let prevBoss = null;
      let lastState = g.state, stateChanges = [];
      const collected = []; let lastDropWorld = null, lastDropIdx = 0;
      let clearingSeen = 0, actsSeen = new Set(), worldSwaps = 0, lastWorld = g.world;
      while (performance.now() - t0 < SAMPLE_MS) {
        if (g.clearing) clearingSeen++;
        if (g.world && g.world !== lastWorld) { worldSwaps++; lastWorld = g.world; }
        if (g.world) actsSeen.add(g.world.act);
        if (g.world && !g.world.dropLog) g.world.dropLog = [];
        if (g.world?.dropLog) { const arr = g.world.dropLog; const from = g.world === lastDropWorld ? lastDropIdx : 0; for (let k = from; k < arr.length; k++) collected.push(arr[k]); lastDropWorld = g.world; lastDropIdx = arr.length; }
        if (g.world?.boss && !g.world.boss.dead) bossNames[g.world.boss.name] = (bossNames[g.world.boss.name] || 0) + 1;
        const cur = g.world?.boss;
        if (prevBoss && prevBoss !== cur && prevBoss.dead && !prevBoss.__logged) { prevBoss.__logged = true; uberKills.push({ name: prevBoss.name, rank: prevBoss.rank, organ: prevBoss.organ ?? null, organDropsSoFar: collected.filter(d => d.source === "organ").length, at: Math.round((performance.now() - t0) / 1000) }); }
        if (cur) prevBoss = cur;
        if (g.state !== lastState) { stateChanges.push({ at: Math.round((performance.now() - t0) / 1000), state: g.state }); lastState = g.state; }
        if (!w.terror) { w.terror = { tier: 1, level: 86, affixes: [] }; }
        await sleep(1000);
      }
      const dropLog = collected;
      const bySource = {}, byName = {};
      for (const d of dropLog) {
        bySource[d.source] = (bySource[d.source] || 0) + 1;
        const k = d.source + " / " + d.name;
        byName[k] = (byName[k] || 0) + 1;
      }
      return {
        url: location.href, class: "${process.env.H_CLASS || "amazon"}",
        durationSec: Math.round((performance.now() - t0) / 1000),
        finalState: g.state, stateChanges,
        kills: w.kills, act: w.act, time: +(w.time ?? 0).toFixed(1),
        bossNamesObserved: bossNames,
        bossKillsWithRank: uberKills,
        clearingSeenSamples: clearingSeen, actsSeen: [...actsSeen], worldSwaps,
        dropTotal: collected.length,
        dropBySource: bySource,
        dropByName: byName,
        keyDrops: collected.filter(d => d.source === "key").map(d => d.name),
        diagnostics: bot.diagnostics()
      };
    })()`);
    done(result);
  } catch (e) { done({ error: String(e?.stack || e) }, 1); }
});
