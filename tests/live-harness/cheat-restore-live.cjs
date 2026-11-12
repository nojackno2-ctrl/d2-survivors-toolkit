// 用法：electron tests/live-harness/cheat-restore-live.cjs [輸出.json]
// H_SEED 指向存檔 JSON 副本；H_CLASS 指定職業（預設 amazon）。僅在隔離設定檔內使用存檔。
const { app, BrowserWindow, session, net } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");
const PAGES = "https://nojackno2-ctrl.github.io/d2-survivors-toolkit/";
const OUT = process.argv.slice(2).find((a) => !a.startsWith("--") && !a.endsWith("electron.exe") && a !== ".");
const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".html": "text/html", ".css": "text/css", ".svg": "image/svg+xml" };
app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "d2restore-")));
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
    if (process.env.H_SEED) {
      const seed = fs.readFileSync(process.env.H_SEED, "utf8");
      JSON.parse(seed);
      await win.webContents.executeJavaScript(`localStorage.setItem("d2-survivors/save/v1", ${JSON.stringify(seed)});`);
      await win.loadURL("https://d2survivors.lol/play/").catch(() => {});
    }
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
      const snapshot = () => {
        const p = g.world.player, o = {};
        for (const k of ["criticalStrike", "deadlyStrike", "might", "weaponDamage", "mastery", "magicFind", "uniqueBoost", "rareBoost", "setBoost", "goldGain"]) o[k] = p[k] ?? null;
        o["passiveLevels.criticalStrike"] = p.passiveLevels?.criticalStrike ?? null;
        for (const k of Object.keys(p)) if (k.endsWith("DamageMult")) o[k] = p[k];
        return JSON.parse(JSON.stringify(o));
      };
      const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
      const names = ["cheat.maxCrit", "cheat.oneHitKill", "cheat.maxDropRate", "cheat.maxGoldRate"];
      const reset = async () => { toggle("cheat.enabled", false); for (const n of names) toggle(n, false); await sleep(500); };
      const items = {};
      for (const name of names) {
        await reset();
        const before = snapshot();
        toggle(name, true); toggle("cheat.enabled", true);
        await sleep(1500);
        const during = snapshot();
        toggle(name, false);
        await sleep(1500);
        const after = snapshot();
        items[name] = { before, during, after, restored: same(before, after) };
      }
      await reset();
      const before = snapshot();
      for (const n of names) toggle(n, true);
      toggle("cheat.enabled", true);
      await sleep(1500);
      const during = snapshot();
      toggle("cheat.enabled", false);
      await sleep(1500);
      const after = snapshot();
      items["cheat.enabled(全部)"] = { before, during, after, restored: same(before, after) };
      return { url: location.href, class: g.kit?.id ?? null, items, diagnostics: bot.diagnostics() };
    })()`);
    done(result);
  } catch (e) { done({ error: String(e?.stack || e) }, 1); }
});
