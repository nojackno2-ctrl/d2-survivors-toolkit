// 全新存檔（隔離設定檔，不讀任何使用者存檔）＋指定職業＋載入本機工具包後，在頁面內執行評估腳本。
// 用法：H_CLASS=sorceress electron fresh-eval-live.cjs <頁面腳本.js> <輸出.json>
// 頁面腳本可用變數：g（遊戲物件）、tools（autobot.gearTools）、corpus（H_CORPUS 指定 ndjson 的前 H_LIMIT 行解析後陣列）、cls。
const { app, BrowserWindow, session, net } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.resolve(__dirname, "..", ".."), PAGES = "https://nojackno2-ctrl.github.io/d2-survivors-toolkit/";
const [script, out] = process.argv.slice(2).filter((a) => !a.startsWith("--") && !a.endsWith("electron.exe") && a !== ".");
const CLASS = process.env.H_CLASS || "sorceress";
const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".html": "text/html", ".css": "text/css", ".svg": "image/svg+xml" };
app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "d2eval-")));
app.whenReady().then(async () => {
  let finished = false;
  const done = (r, code = 0) => { if (finished) return; finished = true; fs.writeFileSync(out, JSON.stringify(r, null, 1)); app.exit(code); };
  setTimeout(() => done({ error: "逾時" }, 1), Number(process.env.H_TIMEOUT || 1500000));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    session.defaultSession.protocol.handle("https", (req) => {
      if (!req.url.startsWith(PAGES)) return net.fetch(req, { bypassCustomProtocolHandlers: true });
      const rel = decodeURIComponent(new URL(req.url).pathname.slice("/d2-survivors-toolkit/".length)), file = path.resolve(ROOT, rel);
      if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return new Response("not found", { status: 404 });
      return new Response(fs.readFileSync(file), { headers: { "content-type": (MIME[path.extname(file)] || "application/octet-stream") + "; charset=utf-8", "access-control-allow-origin": "*", "cache-control": "no-store" } });
    });
    const win = new BrowserWindow({ width: 1100, height: 800, show: !!process.env.H_SHOW, webPreferences: { webSecurity: false, backgroundThrottling: false } });
    await win.loadURL("https://d2survivors.lol/play/").catch(() => {});
    await sleep(4000);
    await win.webContents.executeJavaScript(`localStorage.removeItem("d2-survivors/save/v1");`);
    await win.loadURL("https://d2survivors.lol/play/").catch(() => {});
    await sleep(4000);
    await win.webContents.executeJavaScript(`(()=>{const b=[...document.querySelectorAll("button")].find(x=>/hosted/i.test(x.textContent));if(b)b.click()})()`);
    await sleep(12000);
    let corpus = [];
    if (process.env.H_CORPUS) {
      const lim = Number(process.env.H_LIMIT || 20000), lines = fs.readFileSync(process.env.H_CORPUS, "utf8").split("\n", lim).filter(Boolean);
      corpus = lines.map((l) => JSON.parse(l));
    }
    const boot = await win.webContents.executeJavaScript(`(async () => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      await import(${JSON.stringify(PAGES + "d2edit.js?v=")} + Date.now());
      for (let i = 0; i < 120 && !window.__d2autobot?.game; i++) { document.body.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true })); await sleep(500); }
      const g = window.__d2autobot?.game; if (!g) throw new Error("找不到遊戲物件");
      if (g.state === "select") {
        if (!g.plainSelect().onPick) { g.chooseClass(); await sleep(1500); }
        const select = g.plainSelect(), index = select.cards.findIndex(c => c.dataset?.class === ${JSON.stringify(CLASS)});
        if (index < 0) throw new Error("找不到職業");
        select.select(index); await sleep(300); select.confirm(false);
      }
      for (let i = 0; i < 120 && !g.world?.player && g.state !== "camp"; i++) await sleep(500);
      return { state: g.state, cls: g.kit?.id, hasPlayer: !!g.world?.player, tools: Object.keys(window.__d2autobot?.gearTools || {}) };
    })()`);
    if (!boot?.tools?.length) return done({ error: "啟動失敗", boot });
    const code = (process.env.H_PRE || "") + fs.readFileSync(script, "utf8");
    const result = await win.webContents.executeJavaScript(`(async () => { try { const g = window.__d2autobot.game, tools = window.__d2autobot.gearTools, cls = g.kit.id, corpus = ${JSON.stringify(corpus)}; return await (async () => {${code}})(); } catch (e) { return { error: String(e && e.stack || e) }; } })()`);
    done({ boot, result });
  } catch (e) { done({ error: String(e && e.stack || e) }, 1); }
});
