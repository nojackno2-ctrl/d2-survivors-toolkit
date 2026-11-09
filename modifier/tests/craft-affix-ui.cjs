const {app,BrowserWindow}=require('electron');
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert/strict');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'d2-affix-ui-'));app.setPath('userData',path.join(temp,'profile'));
const preload=path.join(temp,'preload.cjs');fs.writeFileSync(preload,`window.api={web:false,assets:async()=>({dir:'',uniques:{},sets:{},bases:{},quest:{},runes:{},gems:{}}),i18n:async()=>({dict:{},game:{stats:{},classes:{}}}),load:async()=>({save:{version:6,gold:0,stashTabs:{},equippedByClass:{},unlocked:{}},source:'fixture'}),engine:async()=>null};`);
const watchdog=setTimeout(()=>{console.error('詞綴介面測試逾時');app.exit(1)},30000);
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:false,webPreferences:{preload,contextIsolation:false,nodeIntegration:false}});await win.loadFile(path.join(__dirname,'..','editor.html'));
 const source=fs.readFileSync(require('node:path').join(__dirname,'..','engine-page.js'),'utf8');const all=JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'..','..','game-data','裝備屬性分析','魔法稀有詞綴.json'),'utf8'));
 const result=await win.webContents.executeJavaScript(`(async()=>{
  const {boot}=await import('data:text/javascript,'+encodeURIComponent(${JSON.stringify(source)}));
  const base={name:'Ogre Gauntlets',type:'gloves',itype:'glov',level:1};const names=['Godly','Bronze',"Dragon's",'of the Leech','of the Bat','of the Sun','Glimmering','Glowing'];
  const game={__setData(){},__uniques:[],__sets:[],__runewords:[],__bases:[base],__affixes:${JSON.stringify(all)}.filter(a=>names.includes(a.name)),__affixApplies:a=>a.rows.some(r=>r.on.some(t=>['armo','glov','weap'].includes(t)))&&!a.rows.every(r=>r.not.includes('glov')),__isType:(a,b)=>a===b,__seeded:(_,f)=>f(),__makeAffix:()=>({mods:[{stat:'damageReduction',value:3,implicit:true}]})};
  const engine=boot(game,JSON.stringify({bases:{}}));window.api.engine=async(fn,...args)=>engine[fn](...args);BASES=[base];await renderCraft();
  // 製作裝備為逐步選單（2026-11-09 起）：先選類型 → 品質 → 底材，屬性區塊與新增按鈕才會啟用
  const pick=(s,v)=>{const e=document.querySelector(s);e.value=v;e.onchange&&e.onchange();return new Promise(r=>setTimeout(r,150))};await pick("#xCategory","gloves");await pick("#xRar","rare");await pick("#xBase","Ogre Gauntlets");if(document.querySelector("#xBase").value!=="Ogre Gauntlets")throw new Error("逐步選單未選到底材");
  const add=(table,stat,value,kind)=>{let b=document.querySelector(table+' tbody');b.insertAdjacentHTML('beforeend',craftModRow(kind));let tr=b.lastElementChild;let sel=tr.querySelector('.stat');sel.add(new Option(stat,stat));sel.value=stat;tr.querySelector('.val').value=value;delete tr.dataset.auto;return tr};
  add('#cmods-pre','enhancedDefense',200,'prefix');add('#cmods-pre','attackRatingPoints',20,'prefix');add('#cmods-pre','mana',40,'prefix');
  add('#cmods-suf','lifeLeech',3,'suffix');add('#cmods-suf','manaLeech',3,'suffix');add('#cmods-suf','lightRadius',5,'suffix');add('#cmods-imp','damageReduction',3,'imp');
  const testRow=add('#cmods-pre','lightRadius',0,'prefix');testRow.dataset.auto='1';showRanges('#cmods-pre',engine.statRanges({base:base.name,rarity:'rare'}));const preDefault=testRow.querySelector('.val').value;const preRange=testRow.querySelector('.limit').textContent;testRow.querySelector('.stat').selectedOptions[0].dataset.value='1';showRanges('#cmods-pre',engine.statRanges({base:base.name,rarity:'rare'}));const suggested=testRow.querySelector('.val').value;testRow.remove();
  await updateCraftRanges();const enabled=!document.querySelector('#xAddSuf').disabled;
  document.querySelector('#xAddSuf').click();await new Promise(r=>setTimeout(r,400));const tr=document.querySelector('#cmods-suf tbody tr:last-child');const option=[...tr.querySelector('.stat').options].find(o=>o.value==='attackRating');
  if(option){tr.querySelector('.stat').value='attackRating';tr.querySelector('.stat').dispatchEvent(new Event('change',{bubbles:true}));await new Promise(r=>setTimeout(r,400));}
  return {preDefault,preRange,suggested,enabled,found:!!option,value:tr.querySelector('.val').value,range:tr.querySelector('.limit').textContent,rows:document.querySelectorAll('#cmods-suf tbody tr').length};
 })()`);
 assert.equal(result.preDefault,'2');assert.equal(result.suggested,'1');assert(!result.preRange.includes('5～5'));assert.equal(result.enabled,true);assert.equal(result.found,true);assert.equal(result.value,'5');assert.equal(result.rows,4);
 console.log('巨魔護手已滿三個後綴時可加入複合屬性：通過');clearTimeout(watchdog);app.exit(0);
}).catch(e=>{console.error(e.stack);clearTimeout(watchdog);app.exit(1)});
