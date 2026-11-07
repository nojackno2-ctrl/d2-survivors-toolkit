// 製作裝備實機測試：用 Electron 開官方網址 https://d2survivors.lol/play/（隔離暫存設定檔，不碰任何存檔），
// 像玩家點書籤一樣載入 https://nojackno2-ctrl.github.io/d2-survivors-toolkit/d2edit.js，
// 但該網域的請求改由本機倉庫檔案回應（測試尚未發布的修改），其他網址照常連線。
// 用法：electron craft-live.cjs <測試腳本.js> <輸出檔.json>
//   H_IN=editor＝腳本在修改器 iframe 內執行、H_SEED＝測試用存檔 JSON（寫進隔離設定檔）、H_SHOW＝顯示視窗、H_NOIMPORT＝不載入工具包只跑腳本
// 測試腳本在遊戲頁面內執行，可用 window.__d2editBackend.engine(...) 與修改器 iframe；回傳值會被 JSON 化。
const { app, BrowserWindow, session, net } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path");
const [script, out] = process.argv.slice(2).filter((a) => !a.startsWith("--") && !a.endsWith("electron.exe") && a !== ".");
const ROOT = path.resolve(__dirname, "..", ".."), PAGES = "https://nojackno2-ctrl.github.io/d2-survivors-toolkit/";
const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".html": "text/html", ".svg": "image/svg+xml", ".css": "text/css" };
app.setPath("userData", process.env.H_PROFILE ? path.resolve(process.env.H_PROFILE) : fs.mkdtempSync(path.join(os.tmpdir(), "d2craft-"))); // H_PROFILE：共用設定檔目錄（跨多次執行保留 localStorage，例如語言切換會重新載入）
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1100, height: 800, show: !!process.env.H_SHOW, webPreferences: { webSecurity: false } });
  session.defaultSession.protocol.handle("https", (req) => {
    if (req.url.startsWith(PAGES)) {
      const rel = decodeURIComponent(new URL(req.url).pathname.slice("/d2-survivors-toolkit/".length));
      const file = path.join(ROOT, rel);
      if (!file.startsWith(ROOT) || !fs.existsSync(file)) return new Response("not found", { status: 404 });
      return new Response(fs.readFileSync(file), { headers: { "content-type": (MIME[path.extname(file)] ?? "application/octet-stream") + "; charset=utf-8", "access-control-allow-origin": "*", "cache-control": "no-store" } });
    }
    return net.fetch(req, { bypassCustomProtocolHandlers: true });
  });
  const done = (r) => { fs.writeFileSync(out, typeof r === "string" ? r : JSON.stringify(r, null, 1)); app.exit(0); };
  setTimeout(() => done({ error: "timeout" }), 280000);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    await win.loadURL("https://d2survivors.lol/play/").catch(() => {});
    await sleep(4000);
    // H_SEED：測試用存檔 JSON（隔離設定檔內寫入，不碰使用者的真實存檔）
    if (process.env.H_SEED) {
      await win.webContents.executeJavaScript(`localStorage.setItem("d2-survivors/save/v1", ${JSON.stringify(fs.readFileSync(process.env.H_SEED, "utf8"))}); 1`);
      await win.loadURL("https://d2survivors.lol/play/").catch(() => {});
    }
    await sleep(4000);
    // 全新設定檔會停在 setup 頁：點「hosted」讓遊戲從官方網址載入資產
    await win.webContents.executeJavaScript(`(()=>{const b=[...document.querySelectorAll("button")].find((x)=>/hosted/i.test(x.textContent));if(b)b.click();return !!b})()`);
    await sleep(12000);
    if (!process.env.H_NOIMPORT) await win.webContents.executeJavaScript(`import(${JSON.stringify(PAGES + "d2edit.js?v=" + Date.now())}).then(()=>new Promise(r=>setTimeout(r,4000)))`);
    const code = fs.readFileSync(script, "utf8");
    if (process.env.H_IN === "editor") {
      // 在修改器 iframe 內執行腳本（腳本裡的 document 就是修改器介面）
      await win.webContents.executeJavaScript(`window.__d2editLauncher.click(); 1`);
      await sleep(8000);
      const f = win.webContents.mainFrame.framesInSubtree.find((x) => x.url.includes("editor.html"));
      if (!f) return done({ error: "找不到修改器 iframe" });
      const [editorPart, mainPart] = code.split(/^\/\/=====MAIN\s*$/m); // 只認獨立成行的標記，註解裡提到的字樣不切段
      const first = await f.executeJavaScript(`(async()=>{try{return await (async()=>{${editorPart}})()}catch(e){return {error:String(e&&e.stack||e)}}})()`);
      if (mainPart === undefined) return done(first);
      // 第二段：重新載入遊戲頁（同一個隔離設定檔，修改器寫入的存檔還在），在遊戲頁面內檢查
      await win.loadURL("https://d2survivors.lol/play/").catch(() => {});
      await sleep(15000);
      const second = await win.webContents.executeJavaScript(`(async()=>{try{return await (async()=>{${mainPart}})()}catch(e){return {error:String(e&&e.stack||e)}}})()`);
      return done({ editor: first, game: second });
    }
    const r = await win.webContents.executeJavaScript(`(async()=>{try{return await (async()=>{${code}})()}catch(e){return {error:String(e&&e.stack||e)}}})()`);
    done(r);
  } catch (e) { done({ error: String(e && e.stack || e) }); }
});
