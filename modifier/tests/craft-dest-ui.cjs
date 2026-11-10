// 製作裝備「放到」位置只能是：共用倉庫 1～3、遊戲目前角色的個人倉庫與背包。
const {app,BrowserWindow}=require('electron');
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert/strict');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'d2-craft-dest-'));app.setPath('userData',path.join(temp,'profile'));
const preload=path.join(temp,'preload.cjs');
// classPick.softcore 指定遊戲目前選的角色（測試用：necromancer）
fs.writeFileSync(preload,`window.api={web:false,assets:async()=>({dir:'',uniques:{},sets:{},bases:{},quest:{},runes:{},gems:{}}),i18n:async()=>({dict:{},game:{stats:{},classes:{}}}),load:async()=>({save:{version:6,gold:0,stashTabs:{},equippedByClass:{},unlocked:{}},source:'fixture'}),engine:async()=>null,diag:async()=>({classPick:{softcore:'necromancer',hardcore:null}})};`);
const watchdog=setTimeout(()=>{console.error('製作放置位置測試逾時');app.exit(1)},30000);
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:false,webPreferences:{preload,contextIsolation:false,nodeIntegration:false}});
 await win.loadFile(path.join(__dirname,'..','editor.html'));
 const result=await win.webContents.executeJavaScript(`(async()=>{
  const out={};
  const values=()=>{const s=document.createElement('select');s.innerHTML=craftDestOptions();return [...s.options].map(o=>o.value)};
  save={version:6,gold:0,stashTabs:{},inventoryByClass:{},equippedByClass:{},charmsByClass:{},unlocked:{sorceress:'normal',necromancer:'normal'}};
  // 1) 遊戲目前角色 = necromancer
  await detectCraftHeroCls();
  out.cls=craftHeroCls; out.opts=values();
  out.containers=containers().map(c=>c.id).filter(Boolean);
  // 2) 放置：允許的位置寫入成功，其他位置拒絕
  const mk=(id)=>({id,base:'Ogre Gauntlets',rarity:'rare',name:'Ogre Gauntlets'});
  const tryPlace=(dest)=>{try{placeCrafted(dest,mk(dest+'-item'));return 'ok'}catch(e){return 'err'}};
  out.place={};
  for (const d of ['st:shared1','st:necromancer','inv:necromancer','st:sorceress','inv:sorceress','ch:necromancer','eq:necromancer','keys','uniques','st:shared9'])
    out.place[d]=tryPlace(d);
  out.counts={shared1:(save.stashTabs.shared1||[]).length,necro:(save.stashTabs.necromancer||[]).length,bag:((save.inventoryByClass||{}).necromancer||[]).length,sorc:(save.stashTabs.sorceress||[]).length};
  // 3) 無法判定遊戲目前角色：只剩共用倉庫
  save.stashTabs={};save.inventoryByClass={};
  $('#mode').value='hardcore';await detectCraftHeroCls();
  out.clsHc=craftHeroCls; out.optsHc=values();
  // 4) 選單與目前角色同步：refreshCraftDests 會重建 #xDest
  $('#mode').value='softcore';await detectCraftHeroCls();
  if (!$('#xDest')) { const s=document.createElement('select');s.id='xDest';document.body.appendChild(s); }
  refreshCraftDests(); out.xDest=[...$('#xDest').options].map(o=>o.value);
  return out;
 })()`);
 assert.equal(result.cls,'necromancer');
 assert.deepEqual(result.opts,['st:shared1','st:shared2','st:shared3','st:necromancer','inv:necromancer']);
 assert.equal(result.place['st:shared1'],'ok');
 assert.equal(result.place['st:necromancer'],'ok');
 assert.equal(result.place['inv:necromancer'],'ok');
 assert.equal(result.place['st:sorceress'],'err');
 assert.equal(result.place['inv:sorceress'],'err');
 assert.equal(result.place['ch:necromancer'],'err');
 assert.equal(result.place['eq:necromancer'],'err');
 assert.equal(result.place['keys'],'err');
 assert.equal(result.place['uniques'],'err');
 assert.equal(result.place['st:shared9'],'err');
 assert.equal(result.counts.shared1,1);
 assert.equal(result.counts.necro,1);
 assert.equal(result.counts.bag,1);
 assert.equal(result.counts.sorc,0);
 assert.equal(result.clsHc,null);
 assert.deepEqual(result.optsHc,['st:shared1','st:shared2','st:shared3']);
 assert.deepEqual(result.xDest,['st:shared1','st:shared2','st:shared3','st:necromancer','inv:necromancer']);
 console.log('製作裝備放置位置限制（共用倉庫 + 當前角色個人倉庫／背包）：通過');clearTimeout(watchdog);app.exit(0);
}).catch(e=>{console.error(e.stack);clearTimeout(watchdog);app.exit(1)});
