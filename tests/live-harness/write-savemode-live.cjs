// 實機驗證：官方網址＋使用者存檔副本，開修改器 → 獨特收藏「一鍵解鎖」→「寫入存檔」，
// 確認視窗關閉後的 focus 事件不會讓寫入前檢查誤報「無法確認存檔模式」。
// 用法：H_SAVE_SOURCE=<D2S1存檔> electron tests/live-harness/write-savemode-live.cjs
const { app, BrowserWindow, session, net } = require("electron");
const fs = require("fs"), path = require("path"), os = require("os"), zlib = require("zlib");
const root = path.resolve(__dirname, "../.."), pages = "https://nojackno2-ctrl.github.io/d2-survivors-toolkit/";
const sleep = ms => new Promise(r => setTimeout(r, ms));
app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "d2-write-mode-")));
app.whenReady().then(async () => {
  const timeout = setTimeout(() => { console.error("測試逾時"); app.exit(1); }, 240000);
  try {
    const raw = fs.readFileSync(process.env.H_SAVE_SOURCE, "utf8").trim();
    const seed = raw.startsWith("D2S1:") ? JSON.parse(zlib.inflateSync(Buffer.from(raw.slice(5), "base64url"))) : JSON.parse(raw);
    session.defaultSession.protocol.handle("https", req => {
      if (!req.url.startsWith(pages)) return net.fetch(req, { bypassCustomProtocolHandlers: true });
      const rel = decodeURIComponent(new URL(req.url).pathname.slice("/d2-survivors-toolkit/".length)), file = path.resolve(root, rel);
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return new Response("not found", { status: 404 });
      const mime = { ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".html": "text/html" };
      return new Response(fs.readFileSync(file), { headers: { "content-type": (mime[path.extname(file)] || "application/octet-stream") + "; charset=utf-8", "access-control-allow-origin": "*", "cache-control": "no-store" } });
    });
    const win = new BrowserWindow({ width: 1200, height: 900, show: false, webPreferences: { webSecurity: false, backgroundThrottling: false } });
    const js = s => win.webContents.executeJavaScript(s);
    await win.loadURL("https://d2survivors.lol/play/").catch(() => {}); await sleep(4000);
    await js(`localStorage.setItem('d2-survivors/save/v1', ${JSON.stringify(JSON.stringify(seed))}); 1`);
    await win.loadURL("https://d2survivors.lol/play/").catch(() => {}); await sleep(4000);
    await js(`document.querySelectorAll('button').forEach(b => { if (/hosted/i.test(b.textContent)) b.click() }); 1`); await sleep(12000);
    await js(`import(${JSON.stringify(pages + "d2edit.js?v=")}+Date.now()).then(()=>true)`); await sleep(5000);
    await js(`(async()=>{const sleep=ms=>new Promise(r=>setTimeout(r,ms));
      for(let i=0;i<120&&!window.__d2autobot?.game;i++){document.body.dispatchEvent(new KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true}));await sleep(500)}
      const g=window.__d2autobot?.game; if(!g) throw Error('沒有遊戲物件');
      if(g.state==='select'){if(!g.plainSelect().onPick){g.chooseClass();await sleep(1500)}const s=g.plainSelect(),i=s.cards.findIndex(c=>c.dataset?.class==='sorceress');s.select(i);await sleep(300);s.confirm(false)}
      for(let i=0;i<90&&!g.world?.player&&g.state!=='camp';i++)await sleep(500);
      window.__d2autobot.stop?.(); await sleep(1500);
      document.querySelector('#d2toolkit-launcher').click(); await sleep(500);
      const m=[...document.querySelectorAll('#d2toolkit-menu *')].filter(b=>b.children.length===0&&b.textContent.trim()==='修改器').pop()||[...document.querySelectorAll('*')].filter(b=>b.children.length===0&&b.textContent.trim()==='修改器').pop();
      if(!m) throw Error('選單沒有修改器'); m.click(); return 1})()`);
    await sleep(8000);
    const editor = win.webContents.mainFrame.framesInSubtree.find(f => /editor\.html/.test(f.url));
    if (!editor) throw Error("找不到修改器 iframe：" + JSON.stringify(win.webContents.mainFrame.framesInSubtree.map(f => f.url)) + await js(`String(!!window.__d2editLauncher)+document.title`));
    const before = await js(`JSON.parse(localStorage.getItem('d2-survivors/save/v1')).uniques?.length ?? 0`);
    const r = await editor.executeJavaScript(`(async()=>{
      const sleep=ms=>new Promise(r=>setTimeout(r,ms));
      // 與真實對話框一致：確認關閉後立刻觸發 focus
      window.confirm = () => { setTimeout(() => window.dispatchEvent(new Event('focus')), 0); return true; };
      showPage('items'); await sleep(800); cur='uniques'; sel=null; refresh(); await sleep(2500);
      const u=document.querySelector('#unlockAll'); if(!u) return {error:'找不到一鍵解鎖'};
      u.click(); await sleep(6000);
      const unlockStatus=document.querySelector('#status').textContent;
      const writeDisabled=document.querySelector('#write').disabled;
      document.querySelector('#write').click(); await sleep(6000);
      return {unlockStatus,writeDisabled,status:document.querySelector('#status').textContent,banner:document.querySelector('#onlineModeBanner')?.textContent};
    })()`);
    const after = await js(`JSON.parse(localStorage.getItem('d2-survivors/save/v1')).uniques?.length ?? 0`);
    const out = { before, after, ...r, ok: !/無法確認/.test(r.status || "") && /寫入完成/.test(r.status || "") };
    console.log(JSON.stringify(out));
    clearTimeout(timeout); app.exit(out.ok ? 0 : 1);
  } catch (e) { console.error(e.stack); clearTimeout(timeout); app.exit(1); }
});
