// 用法：electron tests/live-harness/perf-mobile-live.cjs [輸出.json]   （H_SEED 可指定存檔副本，預設 backups/saves/test-fixture/save.json）
// 驗證效能頁在手機寬度（390px）下無水平溢出、開關觸控區不小於 44px。
// 驗證「效能」頁面：工具包選單出現「效能」、點開後全螢幕頁面顯示即時指標（FPS、影格、長任務、記憶體、DOM、資源、載入時間）、
// 數值會更新、關閉按鈕可收回。只讀取，不改遊戲與存檔。隔離 Electron 設定檔，不碰使用者真實存檔。
const { app, BrowserWindow, session, net } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");
const PAGES = "https://nojackno2-ctrl.github.io/d2-survivors-toolkit/";
const OUT = process.argv.slice(2).find((a) => !a.startsWith("--") && !a.endsWith("electron.exe") && a !== ".");
const CLASS = process.env.H_CLASS || "sorceress";
const SEED_PATH = process.env.H_SEED || path.join(ROOT, "backups", "saves", "test-fixture", "save.json");
const SEED = fs.readFileSync(SEED_PATH, "utf8");
// 測試裝備（暗金戒指，僅注入隔離存檔的背包，不影響使用者存檔）
const ITEM_JSON = fs.readFileSync(process.env.H_ITEM || path.join(ROOT, "tests", "live-harness", "out", "hf-stats", "item.json"), "utf8");
const SHOT = process.env.H_SHOT || path.join(os.tmpdir(), "toolkit-menu.png");
const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".html": "text/html", ".css": "text/css", ".svg": "image/svg+xml" };
app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "d2toolkit-")));
app.whenReady().then(async () => {
  let finished = false;
  const done = (result, code = 0) => {
    if (finished) return;
    finished = true;
    const json = JSON.stringify(result, null, 2);
    if (OUT) fs.writeFileSync(OUT, json + "\n"); else console.log(json);
    app.exit(code);
  };
  setTimeout(() => done({ error: "實機測試逾時" }, 1), 600000);
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  try {
    // 工具包網址攔截到本機檔案（等同玩家書籤載入待測版本）；遊戲本身仍是官方 d2survivors.lol/play/
    // H_PUBLISHED=1：不攔截，直接載入 GitHub Pages 上已發布的工具包（等同玩家書籤）
    if (!process.env.H_PUBLISHED) session.defaultSession.protocol.handle("https", (req) => {
      if (!req.url.startsWith(PAGES)) return net.fetch(req, { bypassCustomProtocolHandlers: true });
      const rel = decodeURIComponent(new URL(req.url).pathname.slice("/d2-survivors-toolkit/".length));
      const file = path.resolve(ROOT, rel);
      if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return new Response("not found", { status: 404 });
      return new Response(fs.readFileSync(file), { headers: { "content-type": (MIME[path.extname(file)] || "application/octet-stream") + "; charset=utf-8", "access-control-allow-origin": "*", "cache-control": "no-store" } });
    });
    const win = new BrowserWindow({ width: 1100, height: 800, show: true, webPreferences: { webSecurity: false, backgroundThrottling: false } });
    await win.loadURL("https://d2survivors.lol/play/").catch(() => {});
    await sleep(4000);
    await win.webContents.executeJavaScript(`localStorage.setItem("d2-survivors/save/v1", ${JSON.stringify(SEED)}); localStorage.removeItem("d2autoforge.memory");`);
    await win.loadURL("https://d2survivors.lol/play/").catch(() => {});
    await sleep(4000);
    await win.webContents.executeJavaScript(`(()=>{const b=[...document.querySelectorAll("button")].find(x=>/hosted/i.test(x.textContent));if(b)b.click()})()`);
    await sleep(12000);
    win.setContentSize(390, 844);
    await sleep(800);
    const result = await win.webContents.executeJavaScript(`(async () => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      const trace = {};
      window.__d2autobotSwitches = { enabled: false, progressEnabled: false, cheat: false };
      await import(${JSON.stringify(PAGES + "d2edit.js?v=")} + Date.now());
      for (let i = 0; i < 120 && !window.__d2autobot?.game; i++) { document.body.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true })); await sleep(500); }
      for (let i = 0; i < 120 && window.__d2editLoading; i++) await sleep(500);
      const g = window.__d2autobot?.game;
      if (!g) throw new Error("找不到遊戲物件");
      if (g.state === "select") {
        if (!g.plainSelect().onPick) { g.chooseClass(); await sleep(1500); }
        const select = g.plainSelect(), cls = ${JSON.stringify(CLASS)};
        const index = select.cards.findIndex(c => c.dataset?.class === cls);
        if (index < 0) throw new Error("找不到職業：" + cls);
        select.select(index); await sleep(300); select.confirm(false);
      }
      for (let i = 0; i < 120 && !g.world?.player && g.state !== "camp"; i++) await sleep(500);
      await sleep(1500);
      const paused = () => document.body.classList.contains("frontend-over-run") || document.body.classList.contains("frontend-open") || (() => { const p = document.getElementById("paused"); return !!p && !p.classList.contains("hidden") && getComputedStyle(p).display !== "none"; })();
      for (let i = 0; i < 20 && !paused(); i++) { try { g.pause(); } catch (e) {} await sleep(700); }
      await sleep(600);
      trace.viewport = { w: innerWidth, h: innerHeight };
      document.getElementById("d2toolkit-launcher")?.click(); await sleep(400);
      trace.menuItemsRect = [...(document.getElementById("d2toolkit-menu")?.children || [])].map(c => { const r = c.getBoundingClientRect(); return { t: c.textContent, h: Math.round(r.height), right: Math.round(r.right) }; });
      [...(document.getElementById("d2toolkit-menu")?.children || [])].find(c => c.textContent === "效能")?.click(); await sleep(1200);
      const page = document.getElementById("d2perf-page");
      trace.pageOpened = !!page;
      trace.pageScrollW = page?.scrollWidth; trace.pageClientW = page?.clientWidth;
      trace.docScrollW = document.documentElement.scrollWidth;
      trace.overflowing = page ? [...page.querySelectorAll("*")].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1); }).slice(0, 6).map(e => (e.textContent || "").slice(0, 30)) : null;
      trace.toggleRows = page ? [...page.querySelectorAll("label")].map(l => Math.round(l.getBoundingClientRect().height)) : [];
      trace.labelFontSize = page ? getComputedStyle(page.querySelector("label div") || page).fontSize : null;
      trace.errors = (window.__d2toolkitErrors || []);
      return trace;
    })()`);
    try {
      await sleep(300);
      const img = await win.webContents.capturePage();
      fs.writeFileSync(SHOT, img.toPNG());
      result.shot = SHOT;
    } catch (e) { result.shot = "截圖失敗：" + String(e?.message || e); }
    done(result);
  } catch (e) { done({ error: String(e?.stack || e) }, 1); }
});
