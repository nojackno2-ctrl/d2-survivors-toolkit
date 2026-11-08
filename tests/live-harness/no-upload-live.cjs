// 用法：electron tests/live-harness/no-upload-live.cjs [輸出.json]
// 驗證單機模式：載入工具包後排行榜上傳強制關閉、無法打開、等待上傳佇列被刪除。
// 工具包由 PAGES 攔截至本機檔案；遊戲本體來自官方網址。僅使用隔離的 userData，不碰使用者存檔。
const { app, BrowserWindow, session, net } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");
const PAGES = "https://nojackno2-ctrl.github.io/d2-survivors-toolkit/";
const OUT = process.argv.slice(2).find((a) => !a.startsWith("--") && !a.endsWith("electron.exe") && a !== ".");
const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".html": "text/html", ".css": "text/css", ".svg": "image/svg+xml" };
app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "d2noup-")));
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
    await win.webContents.executeJavaScript(`localStorage.setItem("d2s:leaderboard-queue", JSON.stringify([{at:Date.now(),tries:0,id:"fake",body:"{}"}]))`);
    const result = await win.webContents.executeJavaScript(`(async () => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      const queueBefore = localStorage.getItem("d2s:leaderboard-queue") !== null;
      await import(${JSON.stringify(PAGES + "d2edit.js?v=")} + Date.now());
      const queueAfterLoad = localStorage.getItem("d2s:leaderboard-queue");
      for (let i = 0; i < 120 && !window.__d2autobot?.game; i++) {
        document.body.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true }));
        await sleep(500);
      }
      const g = window.__d2autobot?.game;
      if (!g) throw new Error("找不到遊戲物件");
      await sleep(1000);
      const lb = g.save.leaderboard;
      const offLocked = lb.off === true && !Object.getOwnPropertyDescriptor(lb, "off").configurable;
      let toggleErr = null;
      try { (function(){ "use strict"; const e = g.save.leaderboard; e.off ? delete e.off : e.off = true; })(); } catch (e) { toggleErr = e.constructor.name; }
      const offAfterToggle = g.save.leaderboard.off;
      const menu = g.frontend?.settings?.() ?? null;
      localStorage.setItem("d2s:leaderboard-queue", "[1]");
      const queueRewrite = localStorage.getItem("d2s:leaderboard-queue");
      let postBlocked = false; try { await fetch("/api/leaderboard", { method: "POST", body: "{}" }); } catch { postBlocked = true; }
      let getStatus = null; try { getStatus = (await fetch("/api/leaderboard")).status; } catch (e) { getStatus = "err " + e.message; }
      for (let i = 0; i < 60 && !JSON.parse(localStorage.getItem("d2-survivors/save/v1") || "{}").leaderboard?.off; i++) await sleep(1000);
      const stored = JSON.parse(localStorage.getItem("d2-survivors/save/v1") || "{}").leaderboard;
      return { queueBefore, queueAfterLoad, offLocked, toggleErr, offAfterToggle, queueRewrite, postBlocked, getStatus, storedOff: stored?.off ?? null };
    })()`);
    done(result);
  } catch (e) { done({ error: String(e && e.stack || e) }, 1); }
});
