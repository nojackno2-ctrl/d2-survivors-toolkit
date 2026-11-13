// 用法：electron tests/live-harness/toolkit-roles-live.cjs [輸出.json]
// 僅使用全新隔離設定檔；正式執行前須等各模組整合完成。
const { app, BrowserWindow, session, net } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.resolve(__dirname, "../..");
const PAGES = "https://nojackno2-ctrl.github.io/d2-survivors-toolkit/";
const OUT = process.argv.slice(2).find(a => !a.startsWith("--") && !a.endsWith("electron.exe") && a !== ".");
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), "d2roles-"));
const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".html": "text/html", ".css": "text/css", ".svg": "image/svg+xml" };
app.setPath("userData", PROFILE);
// Electron 預設在所有視窗關閉時結束行程；這裡要等結果寫完才自行 app.exit。
app.on("window-all-closed", () => {});
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const results = [];
let win, timer, timedOut = false;
const add = (name, ok, detail) => results.push({ name, ok: !!ok, detail });

async function main() {
  await app.whenReady();
  await session.defaultSession.protocol.handle("https", req => {
    const url = new URL(req.url);
    // 最後防線：即使工具包失效，也不讓測試送出官方 API 寫入。
    if (url.hostname === "d2survivors.lol" && url.pathname.startsWith("/api/") && req.method !== "GET") return new Response("blocked by harness", { status: 503 });
    if (!req.url.startsWith(PAGES)) return net.fetch(req, { bypassCustomProtocolHandlers: true });
    const rel = decodeURIComponent(url.pathname.slice("/d2-survivors-toolkit/".length));
    const file = path.resolve(ROOT, rel);
    if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return new Response("not found", { status: 404 });
    return new Response(fs.readFileSync(file), { headers: { "content-type": (MIME[path.extname(file)] || "application/octet-stream") + "; charset=utf-8", "access-control-allow-origin": "*", "cache-control": "no-store" } });
  });
  win = new BrowserWindow({ width: 1100, height: 800, show: true, webPreferences: { webSecurity: false, backgroundThrottling: false } });
  await win.loadURL("https://d2survivors.lol/play/").catch(() => {});
  await sleep(8000);
  await win.webContents.executeJavaScript(`(()=>{const b=[...document.querySelectorAll("button")].find(x=>/hosted/i.test(x.textContent));if(b)b.click()})()`);
  await sleep(12000);
  const evaluate = code => win.webContents.executeJavaScript(`(async()=>{${code}})()`);
  const run = async (name, code) => {
    try { const detail = await evaluate(code); add(name, detail.ok, detail); }
    catch (error) { add(name, false, { error: String(error?.stack || error) }); }
  };
  await run("工具包與角色選單", `
    await import(${JSON.stringify(PAGES + "d2edit.js?v=")} + Date.now());
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    for(let i=0;i<120 && (!window.__d2guard || !window.__d2autobot?.game);i++) { document.body.dispatchEvent(new KeyboardEvent("keydown",{key:" ",code:"Space",bubbles:true})); await sleep(500); }
    const guard=window.__d2guard, status=guard?.status(), features=window.__d2toolkit?.features() || [];
    const ids=features.map(x=>x.id), guardItem=features.find(x=>x.id==="guard");
    return {ok:!!guard && status?.noUpload===true && guard.saveMode()==="local" && ["autobot","editor","guard"].every(x=>ids.includes(x)) && guardItem?.label==="存檔檢查與防護",status,features};
  `);
  await run("建立全新角色並進場", `
    const sleep=ms=>new Promise(r=>setTimeout(r,ms)), g=window.__d2autobot?.game;
    if(!g) throw Error("找不到遊戲物件");
    if(g.state==="select") { if(!g.plainSelect().onPick){g.chooseClass();await sleep(1500)} const s=g.plainSelect(), i=s.cards.findIndex(c=>c.dataset?.class==="amazon"); if(i<0) throw Error("找不到 amazon"); s.select(i);await sleep(300);s.confirm(false); }
    for(let i=0;i<120&&!g.world?.player;i++) await sleep(500);
    return {ok:!!g.world?.player,state:g.state,cls:g.kit?.id,saveExists:localStorage.getItem("d2-survivors/save/v1")!==null};
  `);
  await run("排行榜鎖定與佇列攔截", `
    const guard=window.__d2guard, lb=window.__d2autobot.game.save.leaderboard, initial=lb.off, before=guard.status().blockedUploads;
    let assignmentError=null, deletionError=null, rejected=false;
    try{(function(){"use strict";lb.off=false})()}catch(e){assignmentError=String(e)}
    const afterAssignment=lb.off;
    try{(function(){"use strict";delete lb.off})()}catch(e){deletionError=String(e)}
    const afterDeletion=lb.off;
    try{await fetch("/api/leaderboard/runs",{method:"POST",body:"{}"})}catch(e){rejected=true}
    localStorage.setItem("d2s:leaderboard-queue","x"); const queue=localStorage.getItem("d2s:leaderboard-queue"), after=guard.status().blockedUploads;
    return {ok:initial===true&&afterAssignment===true&&afterDeletion===true&&rejected&&after>before&&queue===null,initial,afterAssignment,afterDeletion,assignmentError,deletionError,rejected,before,after,queue};
  `);
  await run("無敵生效與輔助器存檔寫入監看", `
    const sleep=ms=>new Promise(r=>setTimeout(r,ms)), root=document.querySelector("#d2autobot-panel")?.shadowRoot;
    const toggle=(n,v)=>{const b=root?.querySelector('[data-setting="'+n+'"]');if(!b)throw Error("找不到設定："+n);if((b.getAttribute("aria-checked")==="true")!==v)b.click();if((b.getAttribute("aria-checked")==="true")!==v)throw Error("切換失敗："+n)};
    const original=Storage.prototype.setItem, calls=[];
    Storage.prototype.setItem=function(k,v){if(["d2-survivors/save/v1","d2-survivors/hc/v1"].includes(String(k)))calls.push({key:String(k),stack:String(new Error().stack)});return original.apply(this,arguments)};
    try { toggle("cheat.enabled",true);toggle("cheat.invincible",true);await sleep(1500);const p=window.__d2autobot.game.world.player, before=p.life;p.life=before-30;await sleep(300);const after=p.life;await sleep(8200);const helperCalls=calls.filter(x=>{/* 輔助器包住遊戲的 tick，遊戲自己存檔時堆疊深處也會有 /helper/；只看「直接呼叫 setItem 的那一層」是不是輔助器（略過防護模組的包裝層）。 */const f=x.stack.split("\\n").filter(l=>l.includes("https://")&&!l.includes("/guard/guard.js"))[0]||"";return f.includes("/helper/")});return {ok:after>=before&&helperCalls.length===0,before,after,observedMs:10000,totalSaveWrites:calls.length,helperCalls}; }
    finally {Storage.prototype.setItem=original}
  `);
  await run("線上模式限制與記憶體作弊", `
    const sleep=ms=>new Promise(r=>setTimeout(r,ms)), guard=window.__d2guard, backend=window.__d2editBackend, root=document.querySelector("#d2autobot-panel")?.shadowRoot;
    const toggle=(n,v)=>{const b=root?.querySelector('[data-setting="'+n+'"]');if(!b)throw Error("找不到設定："+n);if((b.getAttribute("aria-checked")==="true")!==v)b.click();if((b.getAttribute("aria-checked")==="true")!==v)throw Error("切換失敗："+n)};
    // 線上模式下該開關會被停用（顯示關閉、不能按），所以先在單機模式打開，再切線上，確認「設定值保留、實際不生效、面板顯示關閉」。
    const loaded=await backend.load("softcore"), local=window.__d2forgeLocal, original=local.settings();local.set({enabled:true});const localEnabled=local.enabled();guard.setSaveMode("online");
    try { const canWrite=guard.canWriteSave();/* 面板只在遊戲暫停時顯示（與工具包選單相同的判定：body 有 frontend-over-run）；檢查期間標成暫停，查完還原。 */const hadPause=document.body.classList.contains("frontend-over-run");document.body.classList.add("frontend-over-run");const opened=window.__d2autoforgeUI.open();await sleep(300);if(!hadPause)setTimeout(()=>document.body.classList.remove("frontend-over-run"),1200);const ctl=document.querySelector('#af-local-enabled'), shownOff=!!ctl&&ctl.getAttribute("aria-checked")==="false", ctlDisabled=!!ctl?.disabled, message=document.querySelector('#af-local-unavailable')?.textContent||"";const forgeSetting=local.settings().enabled, forgeEnabled=local.enabled(), forgeAvailable=local.available();
      const p=window.__d2autobot.game.world.player, hpBefore=p.life;p.life=hpBefore-30;await sleep(300);const hpAfter=p.life;
      const before=localStorage.getItem("d2-survivors/save/v1");let error="";try{await backend.save("softcore",loaded.save)}catch(e){error=String(e.message||e)}const after=localStorage.getItem("d2-survivors/save/v1");
      const blockedBefore=guard.status().blockedUploads;let rejected=false;try{await fetch("/api/leaderboard/runs",{method:"POST",body:"{}"})}catch(e){rejected=true}const blockedAfter=guard.status().blockedUploads;
      guard.setSaveMode(null);await sleep(600);const restoredEnabled=local.enabled(), restoredAvailable=local.available();
      return {ok:localEnabled&&shownOff&&ctlDisabled&&message.includes("線上存檔不可用")&&canWrite===false&&forgeSetting===true&&forgeEnabled===false&&forgeAvailable===false&&restoredEnabled&&restoredAvailable&&hpAfter>=hpBefore&&error.includes("線上存檔")&&before!==null&&before===after&&rejected&&blockedAfter>blockedBefore,canWrite,localEnabled,shownOff,ctlDisabled,message,forgeSetting,forgeEnabled,forgeAvailable,restoredEnabled,restoredAvailable,hpBefore,hpAfter,error,saveUnchanged:before===after,rejected,blockedBefore,blockedAfter};
    } finally {guard.setSaveMode(null);local.set(original);await sleep(600)}
  `);
  await run("還原單機模式", `const g=window.__d2guard;return {ok:g.saveMode()==="local"&&g.canWriteSave()===true,mode:g.saveMode(),canWrite:g.canWriteSave()}`);
  await run("開啟防護選單", `
    const menu=window.__d2toolkitMenu, launcher=window.__d2editLauncher;launcher.click();
    const item=[...menu.children].find(x=>x.textContent.trim()==="存檔檢查與防護");if(!item)throw Error("找不到防護選單項目");item.click();
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));let frame;for(let i=0;i<40;i++){frame=[...document.querySelectorAll("iframe")].find(x=>x.src.includes("/guard/guard.html"));if(frame)break;await sleep(250)}
    if(!frame)throw Error("找不到防護 iframe");const rect=frame.getBoundingClientRect(),style=getComputedStyle(frame);
    return {ok:style.position==="fixed"&&rect.left<=1&&rect.top<=1&&rect.width>=innerWidth-1&&rect.height>=innerHeight-1,src:frame.src,rect:{left:rect.left,top:rect.top,width:rect.width,height:rect.height},viewport:{width:innerWidth,height:innerHeight},position:style.position};
  `);
  try {
    let frame;
    for (let i = 0; i < 60; i++) { frame = win.webContents.mainFrame.framesInSubtree.find(f => f.url.includes("/guard/guard.html")); if (frame && await frame.executeJavaScript("document.readyState === 'complete'").catch(() => false)) break; await sleep(250); }
    if (!frame) throw Error("找不到防護頁面 frame");
    const detail = await frame.executeJavaScript(`(()=>{const text=document.body?.innerText||"";const buttons=[...document.querySelectorAll("button,[role=button]")];const close=buttons.find(x=>/關閉|返回|×|✕/.test((x.textContent||"")+" "+(x.getAttribute("aria-label")||"")));return {hasSaveCheck:text.includes("存檔檢查"),hasProtection:text.includes("防護"),closeFound:!!close,closeText:close?.textContent};})()`);
    // 防護頁要真的能透過 postMessage 叫到遊戲頁後端（不是只有靜態文字）：存檔模式查得到、存檔讀得進來、防護狀態表有內容。
    for (let i = 0; i < 80; i++) { if (await frame.executeJavaScript(`/已讀取|無法讀取|找不到/.test(document.body.innerText)`).catch(() => false)) break; await sleep(250); }
    Object.assign(detail, await frame.executeJavaScript(`(async()=>{const m=await window.backend.saveMode();const gs=await window.backend.guardStatus();return {backendMode:m,loaded:/已讀取/.test(document.body.innerText),guardStatus:gs&&!gs.error?{noUpload:gs.noUpload,leaderboardOff:gs.leaderboardOff,seals:gs.seals,replacedNatives:gs.replacedNatives}:gs,verdict:(document.querySelector("#verdict")?.innerText||"").slice(0,200)}})()`));
    await frame.executeJavaScript(`(()=>{const b=[...document.querySelectorAll("button,[role=button]")].find(x=>/關閉|返回|×|✕/.test((x.textContent||"")+" "+(x.getAttribute("aria-label")||"")));if(b)b.click()})()`);
    await sleep(500);
    const closed = await evaluate(`return ![...document.querySelectorAll("iframe")].some(x=>x.src.includes("/guard/guard.html"));`);
    add("防護頁內容與關閉", detail.hasSaveCheck && detail.hasProtection && detail.closeFound && detail.backendMode === "local" && detail.loaded && closed, { ...detail, closed });
  } catch (error) { add("防護頁內容與關閉", false, { error: String(error?.stack || error) }); }
  // 最後寫入：修改器可能要求重新載入並保護已寫入的存檔。
  await run("修改器單機寫入與封印", `
    const backend=window.__d2editBackend, guard=window.__d2guard, loaded=await backend.load("softcore"), result=await backend.save("softcore",loaded.save), stored=await backend.load("softcore"), seal=await guard.sealState(stored.save);
    return {ok:result?.ok===true&&seal==="sealed",result,seal,loadedSeal:loaded.seal,storedSeal:stored.seal};
  `);
}

(async () => {
  try {
    await Promise.race([main(), new Promise((_, reject) => { timer = setTimeout(() => { timedOut = true; reject(Error("實機測試整體逾時")); }, 280000); })]);
  } catch (error) { add("執行錯誤", false, { error: String(error?.stack || error), timedOut }); }
  finally {
    clearTimeout(timer);
    // 先存一份結果再關視窗：清理階段出錯也不會丟失結果。
    try { if (OUT) fs.writeFileSync(OUT, JSON.stringify({ partial: true, results }, null, 2) + "\n"); } catch {}
    if (win && !win.isDestroyed()) win.destroy();
    try { if (app.isReady()) await session.defaultSession.flushStorageData(); } catch (error) { add("清理設定檔", false, { error: String(error) }); }
    let cleanupError;
    for (let i = 0; i < 5; i++) { try { fs.rmSync(PROFILE, { recursive: true, force: true }); cleanupError = null; break; } catch (error) { cleanupError = error; await sleep(300); } }
    // Chromium 快取檔在行程結束前可能仍被鎖住：行程結束時再刪一次；刪不掉只提示，不算功能失敗。
    process.on("exit", () => { try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch {} });
    if (cleanupError) console.warn("設定檔將於行程結束時清理：" + PROFILE);
    const passed = results.filter(x => x.ok).length, failed = results.length - passed;
    const report = { url: "https://d2survivors.lol/play/", isolatedFreshProfile: true, results, passed, failed };
    try { if (OUT) fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n"); else console.log(JSON.stringify(report, null, 2)); }
    catch (error) { console.error("寫入結果失敗：", error); app.exit(1); return; }
    console.log(`通過 ${passed} 項，失敗 ${failed} 項`);
    app.exit(failed ? 1 : 0);
  }
})();
