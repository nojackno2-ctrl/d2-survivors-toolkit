// 用法：electron tests/live-harness/guard-fix-live.cjs [輸出.json]
const { app, BrowserWindow, session, net } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path");
const { spawn } = require("child_process");
const ROOT = path.resolve(__dirname, "../..");
const PAGES = "https://nojackno2-ctrl.github.io/d2-survivors-toolkit/";
const OUT = process.argv.slice(2).find(a => !a.startsWith("--") && !a.endsWith("electron.exe") && a !== ".");
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), "d2guard-fix-"));
const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".html": "text/html", ".css": "text/css", ".svg": "image/svg+xml" };
app.setPath("userData", PROFILE);
app.on("window-all-closed", () => {});
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const results = [];
let win, timer, timedOut = false;
const add = (name, ok, detail) => results.push({ name, ok: !!ok, detail });
async function main() {
  await app.whenReady();
  await session.defaultSession.protocol.handle("https", req => {
    const url = new URL(req.url);
    if (url.hostname === "d2survivors.lol" && url.pathname.startsWith("/api/") && req.method !== "GET") return new Response("blocked by harness", { status: 503 });
    if (!req.url.startsWith(PAGES)) return net.fetch(req, { bypassCustomProtocolHandlers: true });
    const file = path.resolve(ROOT, decodeURIComponent(url.pathname.slice("/d2-survivors-toolkit/".length)));
    if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return new Response("not found", { status: 404 });
    return new Response(fs.readFileSync(file), { headers: { "content-type": (MIME[path.extname(file)] || "application/octet-stream") + "; charset=utf-8", "access-control-allow-origin": "*", "cache-control": "no-store" } });
  });
  win = new BrowserWindow({ width: 1100, height: 800, show: true, webPreferences: { webSecurity: false, backgroundThrottling: false } });
  const evaluate = code => win.webContents.executeJavaScript(`(async()=>{${code}})()`);
  const run = async (name, fn) => { try { const detail = await fn(); add(name, detail.ok, detail); return detail; } catch (error) { add(name, false, { error: String(error?.stack || error) }); return null; } };
  const loadToolkit = async () => evaluate(`await import(${JSON.stringify(PAGES + "d2edit.js?v=")}+Date.now()); const sleep=ms=>new Promise(r=>setTimeout(r,ms));for(let i=0;i<120&&(!window.__d2guard||!window.__d2autobot?.game);i++){document.body.dispatchEvent(new KeyboardEvent("keydown",{key:" ",code:"Space",bubbles:true}));await sleep(500)}return {ok:!!window.__d2guard&&!!window.__d2autobot?.game}`);
  const openGuard = async () => {
    await evaluate(`window.__d2editLauncher.click();const item=[...window.__d2toolkitMenu.children].find(x=>x.textContent.trim()==="存檔檢查與防護");if(!item)throw Error("找不到防護選單");item.click()`);
    let frame;
    for (let i = 0; i < 120; i++) { frame = win.webContents.mainFrame.framesInSubtree.find(f => f.url.includes("/guard/guard.html")); if (frame && await frame.executeJavaScript(`document.readyState==='complete' && /已讀取|無法讀取|找不到/.test(document.body.innerText)`).catch(() => false)) return frame; await sleep(250); }
    throw Error("防護頁載入逾時");
  };
  await win.loadURL("https://d2survivors.lol/play/").catch(() => {});
  await sleep(8000);
  await evaluate(`const b=[...document.querySelectorAll("button")].find(x=>/hosted/i.test(x.textContent));if(b)b.click()`);
  await sleep(12000);
  await run("載入工具包", loadToolkit);
  await run("建立全新角色並進場", () => evaluate(`const sleep=ms=>new Promise(r=>setTimeout(r,ms)),g=window.__d2autobot?.game;if(!g)throw Error("找不到遊戲物件");if(g.state==="select"){if(!g.plainSelect().onPick){g.chooseClass();await sleep(1500)}const s=g.plainSelect(),i=s.cards.findIndex(c=>c.dataset?.class==="amazon");if(i<0)throw Error("找不到 amazon");s.select(i);await sleep(300);s.confirm(false)}for(let i=0;i<120&&!g.world?.player;i++)await sleep(500);return {ok:!!g.world?.player,state:g.state,cls:g.kit?.id}`));
  await run("製造超額金幣並寫入", () => evaluate(`const b=window.__d2editBackend,l=await b.load("softcore");if(!l?.save)throw Error(JSON.stringify(l));const original=l.save.gold;l.save.gold=10000000001;const result=await b.save("softcore",l.save),stored=await b.load("softcore");return {ok:result?.ok===true&&stored.save?.gold===10000000001,original,gold:stored.save?.gold,result,heroes:!!stored.save?.heroes}`));
  await win.reload(); await sleep(12000);
  await run("重新載入工具包", loadToolkit);
  let frame;
  await run("開啟防護頁與問題明細", async () => { frame = await openGuard(); return frame.executeJavaScript(`(()=>{const status=document.querySelector('#status').innerText,details=document.querySelector('#details').innerText,issues=document.querySelector('#issues').innerText;return {ok:status.includes('已讀取')&&details.includes('金幣')&&details.includes('超過 100 億'),status,details,issues}})()`); });
  await run("線上模式停用所有修正", async () => { if (!frame) throw Error("防護頁未載入"); await frame.executeJavaScript(`document.querySelector('#modeBtnOnline').click()`); await sleep(1500); return frame.executeJavaScript(`(()=>{const fixes=[...document.querySelectorAll('[data-fix]')],notice=document.querySelector('#onlineNotice');return {ok:!notice.hidden&&notice.innerText.includes('只檢查、不寫入')&&document.querySelector('#fixAll').disabled&&document.querySelector('#newLbId').disabled&&fixes.length>0&&fixes.every(x=>x.disabled),notice:notice.innerText,hidden:notice.hidden,fixAll:document.querySelector('#fixAll').disabled,newLbId:document.querySelector('#newLbId').disabled,fixes:fixes.map(x=>({text:x.innerText,disabled:x.disabled}))}})()`); });
  await run("切回自動", async () => { await frame.executeJavaScript(`document.querySelector('#modeBtnAuto').click()`); await sleep(1200); return frame.executeJavaScript(`(async()=>({ok:(await window.backend.saveMode())==='local'&&!document.querySelector('#fixAll').disabled,mode:await window.backend.saveMode(),disabled:document.querySelector('#fixAll').disabled}))()`); });
  await run("一鍵修正顯示已寫回", async () => { await frame.executeJavaScript(`document.querySelector('#fixAll').click()`); for(let i=0;i<80;i++){if(await frame.executeJavaScript(`/已寫回|並寫入存檔/.test(document.querySelector('#status').innerText)`).catch(()=>false))break;await sleep(250)} return frame.executeJavaScript(`(()=>{const status=document.querySelector('#status').innerText;return {ok:/已寫回|並寫入存檔/.test(status),status,details:document.querySelector('#details').innerText}})()`); });
  await run("重新讀取確認修正與封印", () => evaluate(`const l=await window.__d2editBackend.load('softcore'),seal=await window.__d2guard.sealState(l.save);return {ok:l.save?.gold===10000000000&&seal==='sealed',gold:l.save?.gold,seal,loadedSeal:l.seal}`));
  await run("修正後線上模式與自動模式", async () => { await frame.executeJavaScript(`document.querySelector('#modeBtnOnline').click()`); await sleep(1000); const online=await frame.executeJavaScript(`(()=>({notice:!document.querySelector('#onlineNotice').hidden,fixAll:document.querySelector('#fixAll').disabled,fixes:[...document.querySelectorAll('[data-fix]')].every(x=>x.disabled)}))()`); await frame.executeJavaScript(`document.querySelector('#modeBtnAuto').click()`); await sleep(1000); const mode=await frame.executeJavaScript(`window.backend.saveMode()`); return {ok:online.notice&&online.fixAll&&online.fixes&&mode==='local',online,mode}; });
  await frame.executeJavaScript(`document.querySelector('#closeBtn').click()`); await sleep(12000);
  await run("關閉後重新載入工具包", loadToolkit);
  win.setContentSize(390, 844); await sleep(1000);
  await run("手機排版與截圖", async () => { frame=await openGuard(); await sleep(1500); const detail=await frame.executeJavaScript(`(()=>{const d=document.documentElement,ids=['reload','closeBtn','scan','fixAll','newLbId','modeBtnAuto','modeBtnLocal','modeBtnOnline','refreshGuardStatus'],buttons=ids.map(id=>{const b=document.getElementById(id);return {id,height:b.getBoundingClientRect().height}});return {ok:d.scrollWidth<=d.clientWidth+1&&buttons.every(b=>b.height>=44),scrollWidth:d.scrollWidth,clientWidth:d.clientWidth,buttons,viewport:{width:innerWidth,height:innerHeight}}})()`); const shot=path.join(OUT?path.dirname(path.resolve(OUT)):os.tmpdir(),'guard-fix-mobile.png'); await win.webContents.capturePage(); await sleep(300); fs.writeFileSync(shot,(await win.webContents.capturePage()).toPNG()); detail.screenshot=shot; return detail; });
}
(async () => {
  try { await Promise.race([main(), new Promise((_, reject) => { timer=setTimeout(()=>{timedOut=true;reject(Error("實機測試整體逾時"))},280000); })]); }
  catch(error) { add("執行錯誤",false,{error:String(error?.stack||error),timedOut}); }
  finally {
    clearTimeout(timer);
    try { if(OUT)fs.writeFileSync(OUT,JSON.stringify({partial:true,results},null,2)+"\n"); } catch {}
    if(win&&!win.isDestroyed())win.destroy();
    try { if(app.isReady())await session.defaultSession.flushStorageData(); } catch(error) { add("清理設定檔",false,{error:String(error)}); }
    let cleanupError; for(let i=0;i<5;i++){try{fs.rmSync(PROFILE,{recursive:true,force:true});cleanupError=null;break}catch(error){cleanupError=error;await sleep(300)}}
    process.on("exit",()=>{try{fs.rmSync(PROFILE,{recursive:true,force:true})}catch{}});
    if(cleanupError) {
      // Windows 可能要等 Electron 完全結束才釋放 Chromium 快取檔。
      const cleanup = spawn(process.execPath, ["-e", "const fs=require('fs');const p=process.argv[1];let n=0;const t=setInterval(()=>{try{fs.rmSync(p,{recursive:true,force:true});clearInterval(t)}catch(e){if(++n>=30)clearInterval(t)}},500)", PROFILE], { detached:true, stdio:"ignore", windowsHide:true, env:{...process.env,ELECTRON_RUN_AS_NODE:"1"} });
      cleanup.unref();
      console.warn("設定檔將於行程結束後清理："+PROFILE);
    }
    const passed=results.filter(x=>x.ok).length,failed=results.length-passed,report={url:"https://d2survivors.lol/play/",isolatedFreshProfile:true,results,passed,failed};
    try { if(OUT)fs.writeFileSync(OUT,JSON.stringify(report,null,2)+"\n");else console.log(JSON.stringify(report,null,2)); } catch(error){console.error("寫入結果失敗：",error);app.exit(1);return}
    console.log(`通過 ${passed} 項，失敗 ${failed} 項`);app.exit(failed?1:0);
  }
})();
