// 用法：electron tests/live-harness/guard-heroes-live.cjs [輸出.json]
const { app, BrowserWindow, session, net } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path");
const { spawn } = require("child_process");
const ROOT = path.resolve(__dirname, "../..");
const PAGES = "https://nojackno2-ctrl.github.io/d2-survivors-toolkit/";
const OUT = process.argv.slice(2).find(a => !a.startsWith("--") && !a.endsWith("electron.exe") && a !== ".");
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), "d2guard-heroes-"));
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
  const seed = fs.readFileSync(path.join(ROOT, "backups/quest-run-20261111/inst-01/seed.json"), "utf8");
  await win.loadURL("https://d2survivors.lol/play/").catch(() => {});
  await sleep(4000);
  await evaluate('localStorage.setItem("d2-survivors/save/v1", ' + JSON.stringify(seed) + '); return true');
  await win.loadURL("https://d2survivors.lol/play/").catch(() => {});
  await sleep(4000);
  await evaluate('const b=[...document.querySelectorAll("button")].find(x=>/hosted/i.test(x.textContent));if(b)b.click()');
  await sleep(12000);
  await run("載入工具包", loadToolkit);
  const baseline = await run("原始存檔與遊戲故障數", () => evaluate('const b=window.__d2editBackend,l=await b.load("softcore"),f=await b.engine("saveFaults",l.save); const states=Object.entries(l.save.heroes||{}).flatMap(([c,h])=>["kept","run"].filter(k=>h[k]).map(k=>({cls:c,key:k,level:h[k].run?.level,skills:h[k].build?.skills?.length})));return {ok:states.length>0&&Array.isArray(f),states,faults:f,faultCount:f?.length}'));
  let frame;
  await run("原始防護頁三項檢查", async () => { frame=await openGuard(); return frame.executeJavaScript('(()=>{const rows=[...document.querySelectorAll("#issues tr")].map(x=>x.innerText);const a=rows.filter(x=>x.includes("屬性點")),xp=rows.find(x=>x.includes("經驗值")),skills=rows.find(x=>x.includes("技能欄"));return {ok:a.length>0&&a.every(x=>x.includes("✔")&&!x.includes("未驗證"))&&xp?.includes("✔")&&skills?.includes("✔"),attribute:a,xp,skills}})()'); });
  await run("製造三種問題並寫入", () => evaluate('const b=window.__d2editBackend,l=await b.load("softcore"),states=Object.entries(l.save.heroes||{}).flatMap(([cls,h])=>["kept","run"].filter(k=>h[k]?.build?.skills?.length&&h[k]?.run).map(k=>({cls,key:k,st:h[k]})));if(!states.length)throw Error("沒有技能角色");const {cls,key,st}=states[0],lv=st.run.level,cap=Math.round((5+4*(lv-1)**1.35)*1.1**Math.max(0,lv-25)*1.1**Math.max(0,lv-89));st.run.xp=cap+100;st.build.skills.push(JSON.parse(JSON.stringify(st.build.skills[0])));st.build.unspent=10000;const r=await b.save("softcore",l.save),q=await b.load("softcore"),v=q.save.heroes[cls][key];window.__guardTest={cls,key,cap};return {ok:r?.ok===true&&v.run.xp===cap+100&&v.build.unspent===10000&&new Set(v.build.skills.map(x=>x.id)).size<v.build.skills.length,cls,key,cap,result:r}'));
  const target=await evaluate('return window.__guardTest');
  await win.reload(); await sleep(12000);
  await run("重新載入工具包", loadToolkit);
  await run("防護頁列出三種問題", async () => { frame=await openGuard(); return frame.executeJavaScript('(()=>{const rows=[...document.querySelectorAll("#issues tr")].map(x=>({text:x.innerText,buttons:[...x.querySelectorAll("button")].map(b=>b.innerText)})),details=[...document.querySelectorAll("#details tr")].map(x=>x.innerText);const a=rows.find(x=>x.text.includes("屬性點不合規")),xp=rows.find(x=>x.text.includes("經驗值超過")),skill=rows.find(x=>x.text.includes("技能欄有重複"));return {ok:!!a&&!!xp&&!!skill&&a.buttons.length===0&&xp.buttons.length>0&&skill.buttons.length>0,attribute:a,xp,skill,details}})()'); });
  for (const [name, label] of [["修正經驗值","經驗值設為該等級上限"],["修正重複技能","移除重複技能"]]) {
    await run(name, async () => { await frame.executeJavaScript('(()=>{const b=[...document.querySelectorAll("[data-fix]")].find(x=>x.innerText===' + JSON.stringify(label) + ');if(!b)throw Error("找不到修正按鈕");document.querySelector("#status").textContent="等待寫入";b.click()})()'); for(let i=0;i<100;i++){if(await frame.executeJavaScript('document.querySelector("#status").innerText.includes("並寫入存檔")').catch(()=>false))break;await sleep(250)} const status=await frame.executeJavaScript('document.querySelector("#status").innerText'); return {ok:status.includes("並寫入存檔"),status}; });
  }
  await run("重讀修正、封印與故障數", () => evaluate('const t=' + JSON.stringify(target) + ',b=window.__d2editBackend,l=await b.load("softcore"),st=l.save.heroes[t.cls][t.key],f=await b.engine("saveFaults",l.save),seal=await window.__d2guard.sealState(l.save),ids=st.build.skills.map(x=>x.id);return {ok:st.run.xp===t.cap&&new Set(ids).size===ids.length&&seal==="sealed"&&Array.isArray(f)&&f.length===' + JSON.stringify(baseline?.faultCount) + '&&st.build.unspent===10000,xp:st.run.xp,cap:t.cap,skills:ids,seal,faultCount:f?.length,faults:f,unspent:st.build.unspent}'));
  await run("屬性點問題與處理說明", async () => frame.executeJavaScript('(()=>{const issue=[...document.querySelectorAll("#issues tr")].find(x=>x.innerText.includes("屬性點不合規")),detail=[...document.querySelectorAll("#details tr")].filter(x=>x.innerText.includes("屬性點")).map(x=>x.innerText);return {ok:!!issue&&!issue.querySelector("button")&&detail.length>0,issue:issue?.innerText,detail}})()'));

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


