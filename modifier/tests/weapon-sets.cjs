const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const sources = [path.resolve(__dirname, '../editor.html')].filter(fs.existsSync); // 只有根目錄一份來源（editor/ 副本已移除）
assert(sources.length, '找不到修改器頁面');
for (const file of sources) {
  const src = fs.readFileSync(file, 'utf8');
  const take = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); assert(i >= 0 && j > i, file + ': ' + a); return src.slice(i, j); };
  const code = `
    const CLASSES = ['amazon']; const CLASS_ZH = {amazon:'亞馬遜'};
    const SLOT_ZH = {weapon:'武器',shield:'副手',head:'頭盔'};
    let save; let counter = 0; let supportsWeaponSets = true;
    const newId = () => 'new-' + (++counter), unlocked = () => true;
    ${take('const sharedCont = ', 'function renderTree()')}
    ${take('function alternateWeaponItems(s)', 'async function unlockAndMax(')}
    ${take('function placeInto(', 'function removeFrom(')}
    ${take('function allItems(s)', '// 遊戲對')}
    const riskyItem = () => false;
    ${take('const KEEP = {', '/* ---------- 存檔管理 ---------- */')}
    globalThis.subject = {set:s => save=s, containers, placeInto, allItems, ownedGear, freshSave, swapWeaponSets};
  `;
  const ctx = vm.createContext({structuredClone}); vm.runInContext(code, ctx);
  const x = ctx.subject, primary = {id:'primary',type:'weapon',rarity:'unique'}, alternate = {id:'alt',type:'weapon',rarity:'unique'};
  const data = {version:6, unlocked:{amazon:'normal'}, equippedByClass:{amazon:{weapon:primary}}, weaponSets:{amazon:{active:2,weapon:alternate}}, stashTabs:{}};
  x.set(data);
  let c = x.containers(); assert.equal(c.find(v=>v.id==='alt:amazon').label,'備用武器組 1');
  assert.equal(c.find(v=>v.id==='eq:amazon').label,'身上裝備（武器組 2）');
  assert(x.allItems(data).includes(alternate)); assert(x.ownedGear(data).includes(alternate));
  x.swapWeaponSets(data, 'amazon');
  assert.equal(data.equippedByClass.amazon.weapon, alternate); assert.equal(data.weaponSets.amazon.weapon, primary); assert.equal(data.weaponSets.amazon.active, 1);
  x.swapWeaponSets(data, 'amazon');
  assert.equal(data.equippedByClass.amazon.weapon, primary); assert.equal(data.weaponSets.amazon.weapon, alternate); assert.equal(data.weaponSets.amazon.active, 2);
  const copy = x.freshSave(data, {gear:true}); assert.equal(copy.weaponSets.amazon.active,2); assert.equal(copy.weaponSets.amazon.weapon.id,'new-2'); assert.equal(data.weaponSets.amazon.weapon.id,'alt');
  const blank = {unlocked:{amazon:'normal'},equippedByClass:{amazon:{}},stashTabs:{}}; x.set(blank);
  c=x.containers(); c.find(v=>v.id==='alt:amazon').obj(); assert.equal(blank.weaponSets,undefined);
  assert.throws(()=>x.placeInto('alt:amazon',{type:'head'})); assert.equal(blank.weaponSets,undefined);
  assert.throws(()=>x.placeInto('alt:amazon',{type:'shield'})); assert.equal(blank.weaponSets,undefined);
  x.swapWeaponSets(blank, 'amazon'); assert.equal(blank.weaponSets.amazon.active, 2);
  x.swapWeaponSets(blank, 'amazon'); assert.equal(blank.weaponSets, undefined);
  console.log(path.basename(file) + '：雙武器組顯示、檢查、新存檔複製、空組及放置限制通過');
}
