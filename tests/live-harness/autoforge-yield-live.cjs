// 自動淬鍊「使用者操作讓路」實機驗證（見 helper/autoforge-ui.js 的 yieldToUser）。
// 問題：遊戲每次送出淬鍊請求都設 forgeBusy，期間收藏箱／倉庫的分頁切換等操作會被忽略。
// 驗證：淬鍊中被 whileForgeIdle 包住的動作（切分頁）一定會執行且延遲很短，淬鍊同時照常進行。
// 用法：H_ITEM=tests/live-harness/out/hf-stats/item.json electron tests/live-harness/autoforge-yield-live.cjs [輸出.json]
// 官方 /play/ + 全新隔離存檔；工具包由 PAGES 攔截至本機檔案。
const { app, BrowserWindow, session, net } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");
const PAGES = "https://nojackno2-ctrl.github.io/d2-survivors-toolkit/";
const OUT = process.argv.slice(2).find((a) => !a.startsWith("--") && !a.endsWith("electron.exe") && a !== ".");
const CLASS = process.env.H_CLASS || "sorceress";
if (process.env.H_ITEM) process.env.H_ITEM_JSON = fs.readFileSync(process.env.H_ITEM, "utf8");
const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".html": "text/html", ".css": "text/css", ".svg": "image/svg+xml" };
app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "d2yield-")));
app.whenReady().then(async () => {
  let finished = false;
  const done = (result, code = 0) => {
    if (finished) return;
    finished = true;
    const json = JSON.stringify(result, null, 2);
    if (OUT) fs.writeFileSync(OUT, json + "\n"); else console.log(json);
    app.exit(code);
  };
  setTimeout(() => done({ error: "實機測試逾時" }, 1), 300000);
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
    const setup = await win.webContents.executeJavaScript(`(async () => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      await import(${JSON.stringify(PAGES + "d2edit.js?v=")} + Date.now());
      for (let i = 0; i < 120 && !window.__d2autobot?.game; i++) { document.body.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true })); await sleep(500); }
      for (let i = 0; i < 60 && !window.__d2autoforgeUI; i++) await sleep(500);
      const bot = window.__d2autobot, g = bot?.game;
      if (!g) throw new Error("找不到遊戲物件");
      if (g.state === "select") {
        if (!g.plainSelect().onPick) { g.chooseClass(); await sleep(1500); }
        const select = g.plainSelect(), cls = ${JSON.stringify(CLASS)};
        const index = select.cards.findIndex(c => c.dataset?.class === cls);
        if (index < 0) throw new Error("找不到職業：" + cls);
        select.select(index); await sleep(300); select.confirm(false);
      }
      for (let i = 0; i < 120 && !g.world?.player && g.state !== "camp"; i++) await sleep(500);
      const cls = g.kit?.id;
      const root = document.querySelector("#d2autobot-panel")?.shadowRoot;
      const toggle = (name, enabled) => { const b = root?.querySelector('[data-setting="' + name + '"]'); if (!b) throw new Error("找不到設定：" + name); if ((b.getAttribute("aria-checked") === "true") !== enabled) b.click(); };
      toggle("cheat.forgeMax", true); toggle("cheat.enabled", true); await sleep(2000); toggle("cheat.enabled", false); await sleep(1000);
      const it = JSON.parse(${JSON.stringify(process.env.H_ITEM_JSON || "null")});
      if (!it) throw new Error("缺少 H_ITEM");
      g.save.inventoryByClass = g.save.inventoryByClass || {};
      g.save.inventoryByClass[cls] = g.save.inventoryByClass[cls] || [];
      g.save.inventoryByClass[cls].push(it);
      const ui = window.__d2autoforgeUI;
      const lines = ui.lines(it.id);
      const targets = {}; for (const l of lines) targets[l.key] = 0;
      if (lines[0]) targets[lines[0].key] = 10; // 目標很高：會一直淬鍊／清除，持續有請求
      ui.start([{ id: it.id, name: it.name, targets }], cls);
      for (let i = 0; i < 150 && ui.state.steps < 3; i++) await sleep(100);
      return { lines: lines.length, steps: ui.state.steps, log: ui.state.log.slice(-3) };
    })()`);
    // 淬鍊進行中，隨機時間呼叫「被 whileForgeIdle 包住的動作」（等同點收藏箱分頁）：每次都必須執行、延遲要短。
    const probe = await win.webContents.executeJavaScript(`(async () => {
      const g = window.__d2autobot.game, sleep = ms => new Promise(r => setTimeout(r, ms));
      const ran = [], busyAtCall = [];
      const w = g.whileForgeIdle({ tab: (n) => ran.push([n, Date.now()]) });
      const calls = [];
      for (let n = 0; n < 40; n++) { busyAtCall.push(!!g.forgeBusy); calls.push([n, Date.now()]); w.tab(n); await sleep(100 + Math.random() * 150); }
      await sleep(1500);
      const delays = calls.map(([n, t]) => { const r = ran.find(x => x[0] === n); return r ? r[1] - t : null; });
      const done = delays.filter(d => d !== null);
      return { calls: calls.length, executed: done.length, calledWhileBusy: busyAtCall.filter(Boolean).length, maxDelayMs: Math.max(...done), avgDelayMs: Math.round(done.reduce((a, b) => a + b, 0) / (done.length || 1)), stepsDuring: window.__d2autoforgeUI.state.steps, patched: !!g.__d2idlePatched };
    })()`);
    const final = await win.webContents.executeJavaScript(`(() => { const ui = window.__d2autoforgeUI; const log = ui.state.log.slice(-3); const steps = ui.state.steps; ui.stop(); return { steps, log }; })()`);
    const phases = [probe];
    done({ setup, phases, final });
  } catch (e) { done({ error: String(e?.stack || e) }, 1); }
});
