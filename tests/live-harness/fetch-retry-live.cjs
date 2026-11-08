// 用法：electron tests/live-harness/fetch-retry-live.cjs [輸出.json]
// 重現使用者 iPhone 截圖（2026-11-08）：讀取工具網站檔案的 fetch() 回「Load failed」。
// 在官方 /play/ 頁面注入故障：每個工具 JSON／HTML 前 2 次 fetch 失敗，字典 fetch 永遠失敗（測 import JSON 備援），
// 確認字典、遊戲資料、修改器頁面、物品引擎仍載入成功、自檢沒有「載入失敗」。工具包由 PAGES 攔截至本機檔案；隔離 userData。
const { app, BrowserWindow, session, net } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");
const PAGES = "https://nojackno2-ctrl.github.io/d2-survivors-toolkit/";
const OUT = process.argv.slice(2).find((a) => !a.startsWith("--") && !a.endsWith("electron.exe") && a !== ".");
const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".html": "text/html", ".css": "text/css", ".svg": "image/svg+xml" };
app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "d2retry-")));
app.whenReady().then(async () => {
  const done = (result, code = 0) => { const json = JSON.stringify(result, null, 2); if (OUT) fs.writeFileSync(OUT, json + "\n"); else console.log(json); app.exit(code); };
  setTimeout(() => done({ error: "實機測試逾時" }, 1), 240000);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
      const seed = fs.readFileSync(process.env.H_SEED, "utf8"); JSON.parse(seed);
      await win.webContents.executeJavaScript(`localStorage.setItem("d2-survivors/save/v1", ${JSON.stringify(seed)});`);
      await win.loadURL("https://d2survivors.lol/play/").catch(() => {});
    }
    await sleep(4000);
    await win.webContents.executeJavaScript(`(()=>{const b=[...document.querySelectorAll("button")].find(x=>/hosted/i.test(x.textContent));if(b)b.click()})()`);
    await sleep(12000);
    const result = await win.webContents.executeJavaScript(`(async () => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      const fails = {}, of = window.fetch;
      window.fetch = function (u, o) {
        const s = String(u?.url ?? u);
        if (s.startsWith(${JSON.stringify(PAGES)}) && /\\.(json|html)(\\?|$)/.test(s)) {
          const k = s.split("?")[0].slice(${PAGES.length}); fails[k] = (fails[k] || 0) + 1;
          if (k === "lang/zh-TW.json" || fails[k] <= 2) return Promise.reject(new TypeError("Load failed"));
        }
        return of.apply(this, arguments);
      };
      await import(${JSON.stringify(PAGES + "d2edit.js?v=")} + Date.now());
      for (let i = 0; i < 90 && !(window.__d2editSelfCheck && /載入完成/.test(window.__d2editLoading?.innerText || "")); i++) await sleep(1000);
      const text = window.__d2editLoading?.innerText || "(提示框已關閉)";
      const dict = await window.__d2zhPromise.catch(e => null), gd = await window.__d2gamedataPromise.catch(e => null);
      return { page: location.pathname, fails, loadingText: text, loadFailed: /載入失敗/.test(text),
        dictEntries: dict ? Object.keys(dict).length : 0, gamedata: !!gd,
        engine: window.__d2editBackend.diag().engine,
        selfCheck: window.__d2editSelfCheck?.issues };
    })()`);
    const pass = !result.loadFailed && result.dictEntries > 5000 && result.gamedata && result.engine?.step === "已啟動";
    done({ pass, ...result }, pass ? 0 : 1);
  } catch (e) { done({ error: String(e?.stack || e) }, 1); }
});
