// 官方遊戲、獨立全新設定檔；工具包由本機檔案提供。
const { app, BrowserWindow, session, net } = require('electron');
const fs = require('fs'), os = require('os'), path = require('path');
const ROOT = path.resolve(__dirname, '../../..');
const PAGES = 'https://nojackno2-ctrl.github.io/d2-survivors-toolkit/';
const OUT = process.argv.slice(2).find(x => x.endsWith('.json'));
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), 'd2s08-'));
const MIME = { '.js':'text/javascript', '.mjs':'text/javascript', '.json':'application/json', '.html':'text/html', '.css':'text/css', '.svg':'image/svg+xml' };
app.setPath('userData', PROFILE);
app.on('window-all-closed', () => {});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = []; let win, timer, forgeCount = 0;
const add = (name, ok, detail) => results.push({ name, ok: !!ok, detail });
async function main() {
  await app.whenReady();
  await session.defaultSession.protocol.handle('https', req => {
    const u = new URL(req.url);
    if (u.hostname === 'd2survivors.lol' && u.pathname.startsWith('/api/') && req.method !== 'GET') {
      if (u.pathname.endsWith('/forge')) forgeCount++;
      return new Response('blocked by harness', { status: 503 });
    }
    if (!req.url.startsWith(PAGES)) return net.fetch(req, { bypassCustomProtocolHandlers: true });
    const file = path.resolve(ROOT, decodeURIComponent(u.pathname.slice('/d2-survivors-toolkit/'.length)));
    if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return new Response('not found', {status:404});
    return new Response(fs.readFileSync(file), {headers:{'content-type':(MIME[path.extname(file)] || 'application/octet-stream')+'; charset=utf-8','access-control-allow-origin':'*','cache-control':'no-store'}});
  });
  win = new BrowserWindow({width:1100,height:800,show:true,webPreferences:{webSecurity:false,backgroundThrottling:false}});
  await win.loadURL('https://d2survivors.lol/play/').catch(()=>{}); await sleep(8000);
  await win.webContents.executeJavaScript(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/hosted/i.test(x.textContent));if(b)b.click()})()`); await sleep(12000);
  const run = async (name, code) => { try { const d = await win.webContents.executeJavaScript(`(async()=>{${code}})()`); add(name,d.ok,d); } catch(e) { add(name,false,{error:String(e.stack||e)}); } };
  await run('舊設定遷移與載入', `
    localStorage.removeItem('d2forgeLocal.settings'); localStorage.setItem('d2autobot:settings',JSON.stringify({cheat:{forgeLocal:true,forgeLocalSure:true}}));
    await import(${JSON.stringify(PAGES + 'd2edit.js?v=')}+Date.now()); const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    for(let i=0;i<120&&(!window.__d2autobot?.game||!window.__d2forgeLocal||!window.__d2autoforgeUI);i++){document.body.dispatchEvent(new KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true}));await sleep(500)}
    const settings=window.__d2forgeLocal?.settings(), stored=JSON.parse(localStorage.getItem('d2forgeLocal.settings')||'null'), old=JSON.parse(localStorage.getItem('d2autobot:settings')||'{}');
    return {ok:settings?.enabled===true&&settings?.sure===true&&stored?.enabled===true&&stored?.sure===true&&!('forgeLocal' in (old.cheat||{}))&&!('forgeLocalSure' in (old.cheat||{})),settings,stored,oldCheat:old.cheat};
  `);
  await run('全新 amazon 角色', `
    const sleep=ms=>new Promise(r=>setTimeout(r,ms)),g=window.__d2autobot?.game;if(!g)throw Error('找不到遊戲');
    if(g.state==='select'){if(!g.plainSelect().onPick){g.chooseClass();await sleep(1500)}const s=g.plainSelect(),i=s.cards.findIndex(c=>c.dataset?.class==='amazon');if(i<0)throw Error('找不到 amazon');s.select(i);await sleep(300);s.confirm(false)}
    for(let i=0;i<120&&!g.world?.player;i++)await sleep(500);return {ok:!!g.world?.player&&g.kit?.id==='amazon',cls:g.kit?.id,state:g.state,player:!!g.world?.player};
  `);
  await run('面板按鈕與持久設定', `
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));document.body.classList.add('frontend-over-run');window.__d2autoforgeUI.open();await sleep(300);
    const get=()=>{const a=document.querySelector('#af-local-enabled'),b=document.querySelector('#af-local-sure');return {enabled:{checked:a?.getAttribute('aria-checked'),text:a?.textContent,disabled:a?.disabled},sure:{checked:b?.getAttribute('aria-checked'),text:b?.textContent,disabled:b?.disabled},settings:window.__d2forgeLocal.settings(),active:window.__d2forgeLocal.enabled(),stored:JSON.parse(localStorage.getItem('d2forgeLocal.settings')||'null')}};
    document.querySelector('#af-local-enabled').click();const off=get();document.querySelector('#af-local-enabled').click();document.querySelector('#af-local-sure').click();document.querySelector('#af-local-sure').click();const on=get();
    return {ok:off.enabled.checked==='false'&&off.enabled.text==='關閉'&&off.sure.disabled&&off.sure.checked==='false'&&!off.active&&!off.settings.enabled&&on.enabled.checked==='true'&&on.enabled.text==='開啟'&&on.sure.checked==='true'&&on.sure.text==='開啟'&&!on.sure.disabled&&on.active&&on.settings.enabled&&on.settings.sure&&on.stored.enabled&&on.stored.sure,off,on};
  `);
  const before=forgeCount;
  await run('面板自動淬鍊十次', `
    const sleep=ms=>new Promise(r=>setTimeout(r,ms)),g=window.__d2autobot.game,cls=g.kit.id,ui=window.__d2autoforgeUI,local=window.__d2forgeLocal;
    const item={id:'s08_ring_'+Date.now(),base:'Ring',type:'ring',rarity:'unique',name:'The Stone of Jordan',level:99,stats:[{stat:'maxmana',value:20},{stat:'item_maxmana_percent',value:25},{stat:'lightmindam',value:1},{stat:'item_allskills',value:1},{stat:'lightmaxdam',value:12}],mods:[{stat:'mana',value:20},{stat:'fcr',value:6.25},{stat:'lightningMinDamage',value:1},{stat:'allSkills',value:1},{stat:'lightningMaxDamage',value:12}],roll:[1,1018700716,99]};
    g.save.inventoryByClass[cls].push(item,{id:'s08_essence_'+Date.now(),base:'Burning Essence of Terror',type:'essence',name:'Burning Essence of Terror',count:99});
    const lines=ui.lines(item.id),targets={};for(const l of lines)targets[l.key]='X';if(lines[0])targets[lines[0].key]=5;if(lines[1])targets[lines[1].key]=5;
    let beforeHellforge=null;const originalForgeTry=g.forgeTry;g.forgeTry=function(c,l,act,...rest){if(act==='hellforge'){const current=(g.inventoryOf(cls)||[]).find(x=>x.id===item.id);beforeHellforge=JSON.parse(JSON.stringify(current?.forge||{}))}return originalForgeTry.call(this,c,l,act,...rest)};
    const statsBefore=JSON.parse(JSON.stringify(local.stats)),textBefore=document.querySelector('#af-local-stats')?.textContent;ui.start([{id:item.id,name:item.name,targets}],cls);
    for(let i=0;i<1200&&ui.state.running;i++)await sleep(100);
    await sleep(500);const found=(g.inventoryOf(cls)||[]).find(x=>x.id===item.id),forge=found?.forge||{},t=forge.t||{},total=Object.values(t).reduce((a,b)=>a+Number(b||0),0),statsAfter=JSON.parse(JSON.stringify(local.stats)),textAfter=document.querySelector('#af-local-stats')?.textContent;
    g.forgeTry=originalForgeTry;const pre=beforeHellforge?.t||{},preTotal=Object.values(pre).reduce((a,b)=>a+Number(b||0),0),sum=s=>Object.values(s.local).reduce((a,b)=>a+b,0);return {ok:lines.length>=2&&!ui.state.running&&preTotal===10&&pre[lines[0].key]===5&&pre[lines[1].key]===5&&Object.entries(pre).every(([k,v])=>!v||targets[k]===5)&&statsAfter.local.temper-statsBefore.local.temper===10&&forge.hf===1&&total===20&&t[lines[0].key]===10&&t[lines[1].key]===10&&sum(statsAfter)>sum(statsBefore)&&textBefore!==textAfter,lines,targets,beforeHellforge,preTotal,forge,total,statsBefore,statsAfter,textBefore,textAfter,running:ui.state.running,steps:ui.state.steps,log:ui.state.log.slice(-25)};
  `);
  const localRequests=forgeCount-before;add('本地淬鍊官方請求數',localRequests===0,{requests:localRequests});
  const passBefore=forgeCount;
  await run('關閉本地淬鍊後送出 look', `
    const b=document.querySelector('#af-local-enabled');if(b?.getAttribute('aria-checked')==='true')b.click();
    let status=null,error=null;try{const r=await fetch('/api/leaderboard/forge',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({v:2,player:'s08',hc:false,act:'look',item:{i:'s08-pass',b:'Ring',t:'ring',r:'u',n:'The Stone of Jordan',l:99}})});status=r.status}catch(e){error=String(e)}
    return {ok:!window.__d2forgeLocal.enabled(),enabled:window.__d2forgeLocal.enabled(),status,error};
  `);
  add('關閉後官方 forge 請求計數',forgeCount-passBefore>0,{requests:forgeCount-passBefore});
  await run('線上模式停用與切回恢復', `
    const sleep=ms=>new Promise(r=>setTimeout(r,ms)),guard=window.__d2guard;document.querySelector('#af-local-enabled').click();
    const read=()=>{const a=document.querySelector('#af-local-enabled'),b=document.querySelector('#af-local-sure');return {enabled:{checked:a?.getAttribute('aria-checked'),text:a?.textContent,disabled:a?.disabled},sure:{checked:b?.getAttribute('aria-checked'),text:b?.textContent,disabled:b?.disabled},message:document.querySelector('#af-local-unavailable')?.textContent,settings:window.__d2forgeLocal.settings(),active:window.__d2forgeLocal.enabled()}};
    guard.setSaveMode('online');await sleep(600);const online=read();guard.setSaveMode(null);await sleep(600);const restored=read();
    return {ok:online.enabled.checked==='false'&&online.sure.checked==='false'&&online.enabled.text==='關閉'&&online.sure.text==='關閉'&&online.enabled.disabled&&online.sure.disabled&&online.message.includes('線上存檔不可用')&&!online.active&&restored.enabled.checked==='true'&&restored.sure.checked==='true'&&!restored.enabled.disabled&&!restored.sure.disabled&&restored.active,online,restored};
  `);
}
(async()=>{try{await Promise.race([main(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('實機測試整體逾時')),280000)})])}catch(e){add('執行錯誤',false,{error:String(e.stack||e)})}finally{
  clearTimeout(timer);try{if(OUT)fs.writeFileSync(OUT,JSON.stringify({partial:true,results},null,2))}catch{}
  if(win&&!win.isDestroyed())win.destroy();try{if(app.isReady())await session.defaultSession.flushStorageData()}catch(e){add('清理設定檔',false,{error:String(e)})}
  for(let i=0;i<5;i++){try{fs.rmSync(PROFILE,{recursive:true,force:true});break}catch{await sleep(300)}}
  process.on('exit',()=>{try{fs.rmSync(PROFILE,{recursive:true,force:true})}catch{}});
  const failed=results.filter(x=>!x.ok).length,report={url:'https://d2survivors.lol/play/',profile:PROFILE,isolatedFreshProfile:true,results,passed:results.length-failed,failed};
  try{if(OUT)fs.writeFileSync(OUT,JSON.stringify(report,null,2));else console.log(JSON.stringify(report,null,2))}catch(e){console.error(e);app.exit(1);return}app.exit(failed?1:0);
}})();
