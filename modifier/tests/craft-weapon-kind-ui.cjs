const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'd2-craft-chain-'));
app.setPath('userData', path.join(temp, 'profile'));
const preload = path.join(temp, 'preload.cjs');
fs.writeFileSync(preload, `window.api={web:false,assets:async()=>({dir:'',uniques:{},sets:{},bases:{},quest:{},runes:{},gems:{}}),i18n:async()=>({dict:{},game:{stats:{},classes:{}}}),load:async()=>({save:{version:6,gold:0,stashTabs:{},equippedByClass:{},unlocked:{}},source:'fixture'}),save:async()=>({ok:true}),engine:async(fn)=>fn==='catalog'?[{rarity:'unique',name:'Test Unique',base:'Claymore',type:'weapon',lvl:1}]:fn==='kindMap'?{}:null};`);
const watchdog = setTimeout(() => { console.error('製作逐步選單測試逾時'); app.exit(1); }, 30000);
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { preload, contextIsolation: false, nodeIntegration: false } });
  await win.loadFile(path.join(__dirname, '..', 'editor.html'));
  const result = await win.webContents.executeJavaScript(`(async()=>{
    BASES=[
      {name:'Short Sword',type:'weapon',itype:'swor',level:0},
      {name:'Claymore',type:'weapon',itype:'swor',level:11},
      {name:'Hand Axe',type:'weapon',itype:'axe',level:0},
      {name:'Long Bow',type:'weapon',itype:'bow',level:8},
      {name:'Cap',type:'head',itype:'helm',level:0}
    ];
    const $=(s)=>document.querySelector(s);
    const opts=(s)=>[...$(s).options].map(o=>o.textContent);
    const vis=(s)=>!$(s).hidden;
    const pick=(s,v)=>{$(s).value=v; $(s).onchange && $(s).onchange(); return new Promise(r=>setTimeout(r,50));};
    const out={};
    await renderCraft();
    await new Promise(r=>setTimeout(r,50));
    out.initial={rar:vis('#xRar'),kind:vis('#xKind'),base:vis('#xBase'),bar:vis('#xMakeBar')};
    await pick('#xCategory','weapon');
    out.afterCat={rar:vis('#xRar'),rarOpts:opts('#xRar'),kind:vis('#xKind'),base:vis('#xBase')};
    await pick('#xRar','rare');
    out.afterRar={kind:vis('#xKind'),kindOpts:opts('#xKind'),base:vis('#xBase')};
    await pick('#xKind','swor');
    out.afterKind={base:vis('#xBase'),baseOpts:opts('#xBase')};
    await pick('#xBase','Claymore');
    out.afterBase={bar:vis('#xMakeBar'),secPre:!$('#c-sec-pre').hidden,value:$('#xBase').value};
    await pick('#xRar','normal');
    out.rarResetKind={kindVal:$('#xKind').value,baseVisible:vis('#xBase'),bar:vis('#xMakeBar')};
    await pick('#xKind','bow');
    out.bowBases=opts('#xBase');
    await pick('#xCategory','head');
    out.headAfterCat={rarVal:$('#xRar').value,rarOpts:opts('#xRar'),kind:vis('#xKind'),base:vis('#xBase')};
    await pick('#xRar','magic');
    out.headBases=opts('#xBase');
    // 未解除限制：暗金也能選（屬性固定為原版），只出現在原版有暗金的底材上
    await pick('#xCategory','weapon');
    await pick('#xRar','unique');
    out.lockedUniqueKinds=opts('#xKind');
    await pick('#xKind','swor');
    out.lockedUniqueBases=opts('#xBase');
    // 解除限制：暗金只出現在原版有暗金的底材上
    settings.unlock=true;
    await pick('#xCategory','weapon');
    await pick('#xRar','unique');
    out.uniqueKinds=opts('#xKind');
    await pick('#xKind','swor');
    out.uniqueBases=opts('#xBase');
    settings.unlock=false;
    return out;
  })()`);
  assert.deepEqual(result.initial, { rar: false, kind: false, base: false, bar: false });
  assert.equal(result.afterCat.rar, true);
  assert.deepEqual(result.afterCat.rarOpts, ['請選擇品質', '普通', '魔法', '稀有', '暗金']);
  assert.equal(result.afterCat.kind, false); assert.equal(result.afterCat.base, false);
  assert.equal(result.afterRar.kind, true);
  assert.deepEqual(result.afterRar.kindOpts, ['請選擇武器種類', '全部武器', '劍', '斧', '弓']);
  assert.equal(result.afterRar.base, false);
  assert.equal(result.afterKind.base, true);
  assert.deepEqual(result.afterKind.baseOpts.map(s => s.replace(/（.*$/, '')), ['請選擇底材', 'Short Sword', 'Claymore']);
  assert.deepEqual(result.afterBase, { bar: true, secPre: true, value: 'Claymore' });
  assert.deepEqual(result.rarResetKind, { kindVal: '', baseVisible: false, bar: false });
  assert.deepEqual(result.bowBases.map(s => s.replace(/（.*$/, '')), ['請選擇底材', 'Long Bow']);
  assert.deepEqual(result.headAfterCat.rarOpts, ['請選擇品質', '普通', '魔法', '稀有']);
  assert.equal(result.headAfterCat.rarVal, '');
  assert.equal(result.headAfterCat.kind, false); assert.equal(result.headAfterCat.base, false);
  assert.deepEqual(result.headBases.map(s => s.replace(/（.*$/, '')), ['請選擇底材', 'Cap']);
  assert.deepEqual(result.lockedUniqueKinds, ['請選擇武器種類', '全部武器', '劍']);
  assert.deepEqual(result.lockedUniqueBases.map(s => s.replace(/（.*$/, '')), ['請選擇底材', 'Claymore']);
  assert.deepEqual(result.uniqueKinds, ['請選擇武器種類', '全部武器', '劍']);
  assert.deepEqual(result.uniqueBases.map(s => s.replace(/（.*$/, '')), ['請選擇底材', 'Claymore']);
  console.log('製作裝備逐步選單測試通過');
  clearTimeout(watchdog); app.exit(0);
}).catch(e => { console.error(e.stack); clearTimeout(watchdog); app.exit(1); });
