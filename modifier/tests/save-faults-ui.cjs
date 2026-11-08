// 存檔檢查：遊戲自己的存檔總檢查（saveFaults）是否列進「存檔檢查」頁（Electron，離線夾具）
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'd2-savefaults-ui-'));
app.setPath('userData', path.join(temp, 'profile'));
const preload = path.join(temp, 'preload.cjs');
// engine：faults 不使用；saveFaults 依測試設定的 window.__sf 回傳（null 代表引擎不可用）
fs.writeFileSync(preload, `window.__sf = undefined; window.__if = null;
window.api={web:false,assets:async()=>({dir:'',uniques:{},sets:{},bases:{},quest:{},runes:{},gems:{}}),i18n:async()=>({dict:{},game:{stats:{},classes:{}}}),load:async()=>({save:{version:6,gold:1,stashTabs:{shared1:[{id:'i1',name:'Enigma',base:'Mage Plate',rarity:'runeword'}]},equippedByClass:{},unlocked:{}},source:'fixture'}),traces:()=>[],
engine:async(fn)=> fn==='saveFaults' ? window.__sf : fn==='faults' ? window.__if : null};`);
const watchdog = setTimeout(() => { console.error('存檔檢查測試逾時'); app.exit(1); }, 30000);
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { preload, contextIsolation: false, nodeIntegration: false } });
  await win.loadFile(path.join(__dirname, '..', 'editor.html'));
  const run = (sf, itemFaults = null) => win.webContents.executeJavaScript(`(async()=>{
    window.__sf = ${JSON.stringify(sf)};
    window.__if = ${JSON.stringify(itemFaults)};
    await renderGuard();
    const txt = (id) => document.getElementById(id).textContent;
    const rows = [...document.querySelectorAll('#details tr')].map(r => r.textContent);
    const issues = [...document.querySelectorAll('#issues tr')].map(r => r.textContent);
    return { verdict: txt('verdict'), issues, rows };
  })()`);

  // 1. 遊戲判定有問題：摘要列＋逐條明細（含單件物品遊戲判定原文）
  const bad = await run(['gold 2e10 exceeds limit', 'Item not what its roll makes'], [{ fault: 'roll', why: 'Item not what its roll makes' }]);
  assert.ok(bad.issues.some(t => t.includes('遊戲存檔檢查判定 2 項問題')), 'summary row missing: ' + bad.issues.join(' | '));
  assert.ok(bad.rows.some(t => t.includes('遊戲判定：gold 2e10 exceeds limit')), 'detail 1 missing');
  assert.ok(bad.rows.some(t => t.includes('遊戲判定：Item not what its roll makes')), 'detail 2 missing');
  assert.ok(bad.rows.some(t => t.includes('「Enigma」：遊戲判定：Item not what its roll makes')), 'item fault原文 missing: ' + bad.rows.join(' | '));
  assert.equal(bad.rows.filter(t => t.includes('遊戲存檔檢查（saveFaults）')).length, 2, 'detail rows duplicated');
  assert.ok(bad.verdict.includes('已編輯／有問題'), 'verdict should flag problems: ' + bad.verdict);

  // 2. 遊戲判定通過：不產生明細
  const good = await run([]);
  assert.ok(good.issues.some(t => t.includes('遊戲存檔總檢查通過')), 'pass row missing');
  assert.ok(!good.rows.some(t => t.includes('遊戲存檔檢查（saveFaults）')), 'pass should not add detail rows');

  // 3. 引擎不可用（回傳 null）：標示未驗證，不誤判為通過
  const none = await run(null);
  assert.ok(none.issues.some(t => t.includes('遊戲存檔總檢查未驗證')), 'unknown row missing');
  assert.ok(!none.issues.some(t => t.includes('遊戲存檔總檢查通過')), 'null must not show as pass');
  const unknownOnly = await win.webContents.executeJavaScript(`(() => {
    faultyItems = null; ruleBad = null; gameSaveFaults = null; save.leaderboard = {};
    renderDetails([{ unknown: true, text: '未驗證' }]);
    return { verdict: document.querySelector('#verdict').textContent, details: document.querySelector('#details').textContent };
  })()`);
  assert.ok(unknownOnly.verdict.includes('未驗證') && !unknownOnly.verdict.includes('沒有發現問題'), 'unknown verdict: ' + unknownOnly.verdict);
  assert.ok(!unknownOnly.details.includes('沒有問題'), 'unknown details must not claim success');

  console.log('存檔檢查（遊戲 saveFaults）介面測試通過'); clearTimeout(watchdog); app.exit(0);
}).catch(e => { console.error(e.stack); clearTimeout(watchdog); app.exit(1); });
