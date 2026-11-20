// 視覺實機測試：用 Electron 開官方網址 https://d2survivors.lol/play/（隔離暫存設定檔），
// 載入使用者存檔複本（H_SEED），再依步驟檔（H_STEPS）截圖、點擊、按鍵、執行 JS。
// 遊戲頁的載入方式與 craft-live.cjs 相同：工具包由本機倉庫檔案回應（尚未發布的修改）。
// 用法：H_SEED=存檔.json H_STEPS=steps.json H_SHOTS=輸出資料夾 electron keys-visual.cjs out.json
// 步驟格式（陣列）：{op:"wait",ms} {op:"shot",name} {op:"click",x,y} {op:"key",key} {op:"js",code,as}
const { app, BrowserWindow, session, net } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path");
if (!process.env.H_SEED || !fs.existsSync(process.env.H_SEED)) { console.error("缺少或找不到 H_SEED：請先設定環境變數指向存檔副本，例如 $env:H_SEED='存檔.json'"); process.exit(2); }
const out = process.argv.slice(2).find((a) => a.endsWith(".json"));
const ROOT = path.resolve(__dirname, "..", ".."), PAGES = "https://nojackno2-ctrl.github.io/d2-survivors-toolkit/";
const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".html": "text/html", ".svg": "image/svg+xml", ".css": "text/css" };
app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "d2visual-")));
const shotDir = process.env.H_SHOTS; if (shotDir) fs.mkdirSync(shotDir, { recursive: true });
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
  const log = [];
  const finish = () => { fs.writeFileSync(out, JSON.stringify(log, null, 1)); app.exit(0); };
  setTimeout(() => { log.push({ error: "timeout" }); finish(); }, Number(process.env.H_TIMEOUT || 420000));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    await win.loadURL(process.env.H_URL || "https://d2survivors.lol/play/").catch(() => {});
    await sleep(4000);
    await win.webContents.executeJavaScript(`localStorage.setItem("d2-survivors/save/v1", ${JSON.stringify(fs.readFileSync(process.env.H_SEED, "utf8"))}); 1`);
    await win.loadURL(process.env.H_URL || "https://d2survivors.lol/play/").catch(() => {});
    await sleep(4000);
    await win.webContents.executeJavaScript(`(()=>{const b=[...document.querySelectorAll("button")].find((x)=>/hosted/i.test(x.textContent));if(b)b.click();return !!b})()`);
    await sleep(12000);
    if (process.env.H_PRE) await win.webContents.executeJavaScript(process.env.H_PRE);
    await win.webContents.executeJavaScript(`import(${JSON.stringify(PAGES + "d2edit.js?v=" + Date.now())}).then(()=>new Promise(r=>setTimeout(r,4000)))`);
    const steps = JSON.parse(fs.readFileSync(process.env.H_STEPS, "utf8"));
    let n = 0;
    for (const s of steps) {
      if (s.op === "wait") await sleep(s.ms);
      else if (s.op === "shot") { const img = await win.webContents.capturePage(); const f = path.join(shotDir, `${String(++n).padStart(2, "0")}-${s.name}.png`); fs.writeFileSync(f, img.toPNG()); log.push({ shot: f }); }
      else if (s.op === "click") {
        // 先移動游標讓畫布按鈕進入 hover 狀態，再按下放開
        win.webContents.sendInputEvent({ type: "mouseMove", x: s.x, y: s.y });
        await sleep(250);
        win.webContents.sendInputEvent({ type: "mouseDown", x: s.x, y: s.y, button: "left", clickCount: 1 });
        await sleep(80);
        win.webContents.sendInputEvent({ type: "mouseUp", x: s.x, y: s.y, button: "left", clickCount: 1 });
        log.push({ click: [s.x, s.y] });
      }
      else if (s.op === "key") { win.webContents.sendInputEvent({ type: "keyDown", keyCode: s.key }); win.webContents.sendInputEvent({ type: "keyUp", keyCode: s.key }); log.push({ key: s.key }); }
      else if (s.op === "size") { win.setSize(s.w, s.h); await sleep(1500); log.push({ size: [s.w, s.h] }); }
      else if (s.op === "frame") {
        // 在修改器 iframe（editor.html）內執行 JS；找不到 iframe 就記錄
        const f = win.webContents.mainFrame.framesInSubtree.find((x) => x.url.includes("editor.html"));
        if (!f) log.push({ [s.as ?? "frame"]: { error: "找不到修改器 iframe" } });
        else { const r = await f.executeJavaScript(`(async()=>{try{return await (async()=>{${s.code}})()}catch(e){return {error:String(e&&e.stack||e)}}})()`); log.push({ [s.as ?? "frame"]: r }); }
      }
      else if (s.op === "js") { const r = await win.webContents.executeJavaScript(`(async()=>{try{return await (async()=>{${s.code}})()}catch(e){return {error:String(e&&e.stack||e)}}})()`); log.push({ [s.as ?? "js"]: r }); }
    }
    finish();
  } catch (e) { log.push({ error: String((e && e.stack) || e) }); finish(); }
});
