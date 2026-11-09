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
  await updateCraftRanges();
  const parent=[...document.querySelectorAll('#cmods-suf tbody tr')].find(tr=>tr.querySelector('.stat').value==='lightRadius');
  const optionLabel=parent.querySelector('.stat').selectedOptions[0].textContent;
  parent.querySelector('.stat').dispatchEvent(new Event('change',{bubbles:true}));await new Promise(r=>setTimeout(r,600));
  const row=[...document.querySelectorAll('#cmods-suf tbody tr')].find(tr=>tr.querySelector('.stat').value==='attackRating');
  const note=document.querySelector('#c-companion-note').textContent;
  const value=row?.querySelector('.val').value, count=document.querySelectorAll('#cmods-suf tbody tr').length;
  const embedded=parent.querySelector('.companion-fields input');const grouped=!!embedded && row.style.display==='none';
  if(embedded){embedded.value='4';embedded.dispatchEvent(new Event('input',{bubbles:true}));} const modified=row?.querySelector('.val').value;
  parent.querySelector('.rm').click(); await new Promise(r=>setTimeout(r,300));
  const removed=![...document.querySelectorAll('#cmods-suf tbody tr')].some(tr=>tr.querySelector('.stat').value==='attackRating');
  const ambiguous=add('#cmods-suf','lightRadius',5,'suffix');
  window.api.engine=async(fn,...args)=>fn==='affixInfo'?{combinations:[{kind:'suffix',stat:'lightRadius',min:5,max:5,alike:[],also:null},{kind:'suffix',stat:'lightRadius',min:5,max:5,alike:[],also:{stat:'attackRating',min:5,max:5}}]}:engine[fn](...args);
  await addCraftCompanions(ambiguous);const ambiguousNote=document.querySelector('#c-companion-note').textContent;
  const ambiguousAdded=!![...document.querySelectorAll('#cmods-suf tbody tr')].find(tr=>tr.querySelector('.stat').value==='attackRating');
  return {added:!!row,value,count,note,removed,ambiguousNote,ambiguousAdded,optionLabel,grouped,modified};
 })()`);
 assert.match(result.optionLabel,/配套/);assert.equal(result.grouped,true);assert.equal(result.modified,'4');assert.equal(result.added,true);assert.equal(result.value,'5');assert.equal(result.count,4);assert.match(result.note,/自動新增/);assert.equal(result.removed,true);assert.match(result.ambiguousNote,/不同詞綴/);assert.equal(result.ambiguousAdded,false);
 console.log('巨魔護手複合屬性自動新增、提示及刪除：通過');clearTimeout(watchdog);app.exit(0);
}).catch(e=>{console.error(e.stack);clearTimeout(watchdog);app.exit(1)});
