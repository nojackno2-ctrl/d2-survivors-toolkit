// 用法：electron tests/live-harness/clone-after-boss-live.cjs [輸出.json]
// 驗證「恐懼階自動召喚分身」在場上仍有首領時不會放棄機會，首領死亡後才召喚：
//   1. 場上放一隻首領（血量極高，不會在測試中死亡）並把世界切到恐懼階。
//   2. 首領存活期間分身不應被召喚（w.clone.met 維持 false）。
//   3. 把首領設為死亡後，分身應在數秒內被召喚（w.clone.met 變為 true）。
// 工具包由 PAGES 攔截至本機檔案；遊戲本體來自官方網址。僅使用隔離的 userData，不碰使用者存檔。
const { app, BrowserWindow, session, net } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");
const PAGES = "https://nojackno2-ctrl.github.io/d2-survivors-toolkit/";
const OUT = process.argv.slice(2).find((a) => !a.startsWith("--") && !a.endsWith("electron.exe") && a !== ".");
const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".html": "text/html", ".css": "text/css", ".svg": "image/svg+xml" };
app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "d2clone-")));
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
      // 讓遊戲進入 playing（選卡由自動戰鬥處理）。
      toggle("enabled", true); toggle("progressEnabled", true);
      for (let i = 0; i < 60 && g.state !== "playing"; i++) await sleep(500);
      if (g.state !== "playing") throw new Error("無法進入 playing：" + g.state);
      toggle("cheat.enabled", true); toggle("cheat.invincible", true); toggle("cheat.summonCloneOnTerror", true);
      await sleep(1000);
      const w = g.world;
      // 場上放一隻高血量的安達莉爾，並切到恐懼階。
      g.director.boss(w, "andariel", "Andariel", []);
      await sleep(800);
      const boss = w.boss;
      if (!boss) throw new Error("首領未出現");
      boss.life = 1e9;
      w.terror = true;
      const snap = (phase) => ({ phase, t: +(w.time ?? 0).toFixed(2), state: g.state, cloneMet: !!w.clone?.met, bossAlive: !!(w.boss && !w.boss.dead), bossLife: w.boss ? Math.round(w.boss.life) : null, terror: !!w.terror });
      const samplesA = [];
      for (let i = 0; i < 24; i++) { samplesA.push(snap("boss-alive")); await sleep(500); }
      const cloneWhileBossAlive = samplesA.some(s => s.cloneMet);
      // 首領死亡。
      const killedAt = +(w.time ?? 0).toFixed(2);
      w.boss.life = 0; w.boss.dead = true;
      const samplesB = [];
      for (let i = 0; i < 20; i++) { samplesB.push(snap("boss-dead")); await sleep(500); }
      const firstClone = samplesB.find(s => s.cloneMet);
      return {
        url: location.href, class: "${process.env.H_CLASS || "amazon"}",
        cloneWhileBossAlive,
        killedAtWorldTime: killedAt,
        cloneAfterKill: !!firstClone,
        secondsAfterKillToClone: firstClone ? +((firstClone.t - killedAt)).toFixed(2) : null,
        samplesBossAlive: samplesA.filter((_, i) => i % 4 === 0),
        samplesBossDead: samplesB.filter((_, i) => i % 2 === 0),
        diagnostics: bot.diagnostics()
      };
    })()`);
    const pass = result.cloneWhileBossAlive === false && result.cloneAfterKill === true;
    done({ pass, ...result });
  } catch (e) { done({ error: String(e?.stack || e) }, 1); }
});
