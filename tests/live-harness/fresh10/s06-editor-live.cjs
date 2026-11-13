// S06：官方遊戲、全新隔離存檔與本機工具包實機測試。
const { app, BrowserWindow, session, net } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.resolve(__dirname, "../../.."), PAGES = "https://nojackno2-ctrl.github.io/d2-survivors-toolkit/";
const OUT = process.argv.slice(2).find(a => !a.startsWith("--") && !a.endsWith("electron.exe") && a !== ".");
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), "d2fresh-s06-"));
const MIME = { ".js":"text/javascript", ".mjs":"text/javascript", ".json":"application/json", ".html":"text/html", ".css":"text/css", ".svg":"image/svg+xml" };
app.setPath("userData", PROFILE);
app.disableHardwareAcceleration();
app.on("window-all-closed", () => {});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = []; let win, timer, timedOut = false, frame;
const add = (name, ok, detail) => results.push({name, ok: !!ok, detail});
const run = async (name, fn) => { try { const d = await fn(); add(name, d.ok, d); } catch (e) { add(name, false, {error:String(e?.stack || e)}); } };
const evalMain = code => win.webContents.executeJavaScript(`(async()=>{${code}})()`);
const evalFrame = code => frame.executeJavaScript(`(async()=>{${code}})()`);
async function openEditor() {
  await evalMain(`window.__d2editLauncher.click();const x=[...window.__d2toolkitMenu.children].find(e=>e.textContent.trim()==="修改器");if(!x)throw Error("找不到修改器選單");x.click()`);
  for (let i=0;i<100;i++) { frame=win.webContents.mainFrame.framesInSubtree.find(f=>f.url.includes('/modifier/editor.html')); if (frame && await frame.executeJavaScript(`document.readyState==='complete' && /已讀取/.test(document.querySelector('#status')?.textContent||'')`).catch(()=>false)) return; await sleep(300); }
  throw Error("修改器未完成讀取");
}
async function main() {
  await app.whenReady();
  await session.defaultSession.protocol.handle("https", req => {
    const u=new URL(req.url);
    if(u.hostname==="d2survivors.lol" && u.pathname.startsWith("/api/") && req.method!=="GET") return new Response("blocked by harness",{status:503});
    if(!req.url.startsWith(PAGES)) return net.fetch(req,{bypassCustomProtocolHandlers:true});
    const file=path.resolve(ROOT,decodeURIComponent(u.pathname.slice('/d2-survivors-toolkit/'.length)));
    if(!file.startsWith(ROOT+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()) return new Response("not found",{status:404});
    return new Response(fs.readFileSync(file),{headers:{"content-type":(MIME[path.extname(file)]||"application/octet-stream")+"; charset=utf-8","access-control-allow-origin":"*","cache-control":"no-store"}});
  });
  win=new BrowserWindow({width:1100,height:800,show:true,webPreferences:{webSecurity:false,backgroundThrottling:false}});
  await win.loadURL('https://d2survivors.lol/play/').catch(()=>{}); await sleep(8000);
  await evalMain(`const b=[...document.querySelectorAll('button')].find(x=>/hosted/i.test(x.textContent));if(b)b.click()`); await sleep(12000);
  await run('全新德魯伊進場',async()=>evalMain(`
    await import(${JSON.stringify(PAGES+'d2edit.js?v=')}+Date.now());const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    for(let i=0;i<120&&!window.__d2autobot?.game;i++){document.body.dispatchEvent(new KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true}));await sleep(500)}
    const g=window.__d2autobot?.game;if(!g)throw Error('找不到遊戲物件');
    if(g.state==='select'){if(!g.plainSelect().onPick){g.chooseClass();await sleep(1500)}const s=g.plainSelect(),i=s.cards.findIndex(c=>c.dataset?.class==='druid');if(i<0)throw Error('找不到 druid');s.select(i);await sleep(300);s.confirm(false)}
    for(let i=0;i<120&&!g.world?.player;i++)await sleep(500);
    return {ok:!!g.world?.player&&g.kit?.id==='druid'&&localStorage.getItem('d2-survivors/save/v1')!==null,state:g.state,cls:g.kit?.id,saveExists:localStorage.getItem('d2-survivors/save/v1')!==null};`));
  await run('修改器全螢幕與存檔檢查說明',async()=>{await openEditor();const d=await evalMain(`const f=[...document.querySelectorAll('iframe')].find(x=>x.src.includes('/modifier/editor.html')),r=f.getBoundingClientRect();return {position:getComputedStyle(f).position,rect:{left:r.left,top:r.top,width:r.width,height:r.height},viewport:{width:innerWidth,height:innerHeight}}`);const t=await evalFrame(`document.querySelector('[data-page=guard]').click();return {text:document.querySelector('#guard').innerText,rows:document.querySelectorAll('#guard table').length}`);return {...d,...t,ok:d.position==='fixed'&&d.rect.left<=1&&d.rect.top<=1&&d.rect.width>=d.viewport.width-1&&d.rect.height>=d.viewport.height-1&&t.text.includes('存檔檢查已移到')&&t.rows===0}});
  await run('一鍵解鎖收藏庫與德魯伊火炬',async()=>evalFrame(`
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));window.__confirms=[];window.confirm=m=>(window.__confirms.push(m),true);
    document.querySelector('[data-page=items]').click();document.querySelector('#tree [data-c=uniques]').click();
    for(let i=0;i<100&&!document.querySelector('#unlockAll');i++)await sleep(200);
    const cls=document.querySelector('#torchCls')?.value, before=save.uniques?.length||0;document.querySelector('#unlockAll').click();
    for(let i=0;i<500;i++){await sleep(200);if(/完成：補齊|失敗|錯誤/.test(document.querySelector('#status').textContent))break}
    const cat=await window.api.engine('catalog'), available=cat.filter(x=>!x.unavailable).length, items=save.uniques||[], torch=items.filter(x=>x.name==='Hellfire Torch');
    return {ok:cls==='druid'&&items.length===available&&torch.length>0&&torch.every(x=>x.mods.some(m=>m.stat==='classskills5'&&m.value===3)&&x.stats.some(m=>m.stat==='item_addclassskills'&&m.param===5&&m.value===3))&&/完成：補齊/.test(document.querySelector('#status').textContent),cls,before,count:items.length,catalogCount:cat.length,available,torch,status:document.querySelector('#status').textContent,confirms:window.__confirms};`));
  await run('下拉選擇屬性製作裝備',async()=>evalFrame(`
    const sleep=ms=>new Promise(r=>setTimeout(r,ms)),pick=async(s,v)=>{const x=document.querySelector(s);x.value=v;x.dispatchEvent(new Event('change',{bubbles:true}));await sleep(1500)};
    document.querySelector('[data-page=craft]').click();await sleep(2500);await pick('#xCategory','head');await pick('#xRar','magic');const base=[...document.querySelector('#xBase').options].find(x=>x.value&&!x.disabled)?.value;if(!base)throw Error('無底材選項');await pick('#xBase',base);await sleep(1500);document.querySelector('#xAddPre').click();await sleep(2000);
    const row=document.querySelector('#cmods-pre tbody tr'),select=row?.querySelector('.stat'),opt=[...(select?.options||[])].find(x=>x.value&&!x.disabled);if(!opt)throw Error('無屬性選項');await pick('#cmods-pre tbody tr .stat',opt.value);await sleep(1500);
    const val=row.querySelector('.val').value, chosen=select.selectedOptions[0], max=chosen.dataset.value, dest=document.querySelector('#xDest').value;document.querySelector('#xMake').click();await sleep(5000);
    const items=Object.values(save.stashTabs||{}).flat(), item=items.at(-1);window.__s06item=item;
    return {ok:!!item&&val!==''&&max!==undefined&&Number(val)===Number(max)&&/已製作/.test(document.querySelector('#status').textContent),base,stat:opt.value,value:val,max,dest,item,status:document.querySelector('#status').textContent};`));
  await run('設定金幣及確認寫入',async()=>evalFrame(`
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));document.querySelector('[data-page=hero]').click();const x=document.querySelector('[data-path=gold]');x.value='123456';x.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#write').click();
    for(let i=0;i<300;i++){await sleep(200);if(/寫入完成|失敗|錯誤|拒絕/.test(document.querySelector('#status').textContent))break}
    return {ok:/寫入完成/.test(document.querySelector('#status').textContent)&&window.__confirms.some(x=>x.includes('確定寫入')),gold:save.gold,status:document.querySelector('#status').textContent,confirms:window.__confirms};`));
  await run('關閉後頁面重新載入',async()=>{let navigated=false;const onNav=(_e,url,_same,main)=>{if(main&&url.includes('d2survivors.lol/play/'))navigated=true};win.webContents.on('did-start-navigation',onNav);await evalFrame(`document.querySelector('#closeWeb').click()`);for(let i=0;i<100&&!navigated;i++)await sleep(300);await sleep(12000);win.webContents.removeListener('did-start-navigation',onNav);return {ok:navigated,navigated,url:win.webContents.getURL()}});
  await run('重載後存檔與遊戲記憶體',async()=>evalMain(`
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));await import(${JSON.stringify(PAGES+'d2edit.js?v=')}+Date.now());for(let i=0;i<120&&!window.__d2autobot?.game;i++){document.body.dispatchEvent(new KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true}));await sleep(500)}
    const b=window.__d2editBackend,g=window.__d2autobot?.game,loaded=await b.load('softcore'),s=loaded.save,cat=await b.engine('catalog'),sf=await b.engine('saveFaults',s),items=Object.values(s.stashTabs||{}).flat(),it=items.find(x=>x.base==='Cap'&&x.name==="Lizard's Cap"),faults=it?await b.engine('faults',[it]):null;
    if(g.state==='select'){if(!g.plainSelect().onPick){g.chooseClass();await sleep(1500)}const v=g.plainSelect(),i=v.cards.findIndex(c=>c.dataset?.class==='druid');if(i<0)throw Error('重載後找不到 druid');v.select(i);await sleep(300);v.confirm(false)}for(let i=0;i<120&&!g.world?.player;i++)await sleep(500);
    return {ok:loaded.seal==='sealed'&&Array.isArray(sf)&&sf.length===0&&s.uniques?.length===cat.filter(x=>!x.unavailable).length&&!!it&&Array.isArray(faults)&&faults.length===1&&faults[0]===null&&s.gold===123456&&s.leaderboard?.off===true&&!!g.world?.player&&g.kit?.id==='druid'&&g.save?.gold===s.gold&&g.save?.uniques?.length===s.uniques?.length,seal:loaded.seal,saveFaults:sf,collection:s.uniques?.length,available:cat.filter(x=>!x.unavailable).length,item:it,itemFaults:faults,gold:s.gold,leaderboard:s.leaderboard,gameState:g?.state,gameClass:g?.kit?.id,player:!!g.world?.player,gameGold:g?.save?.gold,gameCollection:g?.save?.uniques?.length};`));
  await run('線上模式唯讀與還原',async()=>{await evalMain(`window.__d2guard.setSaveMode('online')`);try{await openEditor();const ui=await evalFrame(`return {banner:document.querySelector('#onlineModeBanner').textContent,hidden:document.querySelector('#onlineModeBanner').hidden,disabled:document.querySelector('#write').disabled}`);const d=await evalMain(`const b=window.__d2editBackend,l=await b.load('softcore'),before=localStorage.getItem('d2-survivors/save/v1');let error='';try{await b.save('softcore',l.save)}catch(e){error=String(e.message||e)}return {error,unchanged:before===localStorage.getItem('d2-survivors/save/v1')}`);return {...ui,...d,ok:!ui.hidden&&ui.banner.includes('線上存檔模式')&&ui.disabled&&d.error.includes('線上存檔')&&d.unchanged}}finally{await evalMain(`window.__d2guard.setSaveMode(null)`);}});
}
(async()=>{try{await Promise.race([main(),new Promise((_,reject)=>{timer=setTimeout(()=>{timedOut=true;reject(Error('實機測試整體逾時'))},280000)})])}catch(e){add('執行錯誤',false,{error:String(e?.stack||e),timedOut})}finally{
  clearTimeout(timer);try{if(OUT)fs.writeFileSync(OUT,JSON.stringify({partial:true,results},null,2)+'\n')}catch{}
  if(win&&!win.isDestroyed())win.destroy();try{if(app.isReady())await session.defaultSession.flushStorageData()}catch(e){add('清理設定檔',false,{error:String(e)})}
  let err;for(let i=0;i<5;i++){try{fs.rmSync(PROFILE,{recursive:true,force:true});err=null;break}catch(e){err=e;await sleep(300)}}
  process.on('exit',()=>{try{fs.rmSync(PROFILE,{recursive:true,force:true})}catch{}});if(err)console.warn('設定檔將於行程結束時清理：'+PROFILE);
  const passed=results.filter(x=>x.ok).length,failed=results.length-passed,report={url:'https://d2survivors.lol/play/',isolatedFreshProfile:true,profile:PROFILE,results,passed,failed};
  try{if(OUT)fs.writeFileSync(OUT,JSON.stringify(report,null,2)+'\n');else console.log(JSON.stringify(report,null,2))}catch(e){console.error(e);app.exit(1);return}console.log(`通過 ${passed} 項，失敗 ${failed} 項`);app.exit(failed?1:0);
}})();
