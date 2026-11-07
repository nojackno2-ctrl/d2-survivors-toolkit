// 用法：electron tests/live-harness/temper-translate-live.cjs [輸出.json]
// 驗證「淬鍊後綴 ×N」的屬性句在官方 /play/ 實機是否被譯出（使用遊戲真實的 __d2lang.translate）。
// 工具包由 PAGES 攔截至本機檔案；遊戲本體來自官方網址。僅使用隔離的 userData，不碰使用者存檔。
const { app, BrowserWindow, session, net } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");
const PAGES = "https://nojackno2-ctrl.github.io/d2-survivors-toolkit/";
const OUT = process.argv.slice(2).find((a) => !a.startsWith("--") && !a.endsWith("electron.exe") && a !== ".");
const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".html": "text/html", ".css": "text/css", ".svg": "image/svg+xml" };
// 截圖中的淬鍊屬性句（含不換行空白 U+00A0 接 ×N）
const SAMPLES = [
  "+28% Faster Cast Rate ×2",
  "+4 to Fire Mastery (Sorceress Only) ×2",
  "+3 to Lightning Mastery (Sorceress Only) ×1",
  "+4 to Cold Mastery (Sorceress Only) ×2",
  "+12 to Energy ×1",
  "+68 to Life ×1",
  "+92 to Mana ×1",
];
app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "d2temper-")));
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
  setTimeout(() => done({ error: "實機測試逾時" }, 1), 200000);
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
    await sleep(8000);
    const result = await win.webContents.executeJavaScript(`(async () => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      await import(${JSON.stringify(PAGES + "d2edit.js?v=")} + Date.now());
      for (let i = 0; i < 60 && !window.__d2lang?.translate; i++) await sleep(500);
      const lt = window.__d2lang;
      if (!lt?.translate) throw new Error("__d2lang 未就緒");
      const samples = ${JSON.stringify(SAMPLES)};
      return { lang: lt.debug?.().lang ?? null, rows: samples.map(s => ({ source: s, translated: lt.translate(s) })) };
    })()`);
    done(result, 0);
  } catch (e) {
    done({ error: String(e && e.stack || e) }, 1);
  }
});
