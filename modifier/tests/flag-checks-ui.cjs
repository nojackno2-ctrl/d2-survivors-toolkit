// 存檔檢查：依遊戲上傳 flags／載入檢查新增的三項（經驗值上限、技能重複、存檔模式與儲存槽）（Electron，離線夾具）
// 另以官方快照的 pack 模組原始碼核對經驗值公式與工具包實作一致。
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'd2-flagchecks-ui-'));
app.setPath('userData', path.join(temp, 'profile'));
const preload = path.join(temp, 'preload.cjs');
fs.writeFileSync(preload, `window.api={web:false,assets:async()=>({dir:'',uniques:{},sets:{},bases:{},quest:{},runes:{},gems:{}}),i18n:async()=>({dict:{},game:{stats:{},classes:{}}}),load:async()=>({save:{version:6,gold:1,stashTabs:{},equippedByClass:{},unlocked:{}},source:'fixture'}),traces:()=>[],
engine:async()=>null};`);
const watchdog = setTimeout(() => { console.error('旗標檢查測試逾時'); app.exit(1); }, 30000);
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { preload, contextIsolation: false, nodeIntegration: false } });
  await win.loadFile(path.join(__dirname, '..', '..', 'guard', 'guard.html'));

  // 0. 公式與官方快照一致：從 pack 模組原始碼取出 g=e=>Math.round(...) 與工具包 xpCap 比對 1～99 級
  const packFile = fs.readdirSync(path.join(__dirname, '..', '..', 'game-bundles', '20261105.3', 'assets')).find(f => /^pack-.*\.js$/.test(f));
  assert.ok(packFile, '找不到官方快照的 pack 模組');
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'game-bundles', '20261105.3', 'assets', packFile), 'utf8');
  const m = /,g=e=>(Math\.round\(\(5\+4\*\(e-1\)\*\*1\.35\)\*1\.1\*\*Math\.max\(0,e-25\)\*1\.1\*\*Math\.max\(0,e-90\+1\)\))/.exec(src);
  assert.ok(m, '官方經驗值公式不在預期位置，需重新核對');
  const official = new Function('e', 'return ' + m[1]);
  const mine = await win.webContents.executeJavaScript(`Array.from({length:99},(_, i)=>xpCap(i+1))`);
  for (let lv = 1; lv <= 99; lv++) assert.equal(mine[lv - 1], official(lv), '經驗值公式不一致：等級 ' + lv);

  const run = (saveJson, mode) => win.webContents.executeJavaScript(`(()=>{
    const s = ${JSON.stringify(saveJson)};
    const rows = flagChecks(s, ${JSON.stringify(mode)}).map(x => ({ ok: x.ok, text: x.text, fix: !!x.fix }));
    return { rows, s };
  })()`);
  const hero = (level, xp, skills) => ({ sorceress: { kept: { run: { level, xp }, build: { level, skills } } } });

  // 1. 正常存檔：三項都通過
  const good = await run({ heroes: hero(10, 5, [{ id: 'fireBolt', level: 1 }]) }, 'softcore');
  assert.ok(good.rows.every(r => r.ok), '正常存檔不應被判有問題：' + JSON.stringify(good.rows));

  // 1b. 沒有角色資料：不可顯示「通過」，要標示未驗證
  const empty = await run({ heroes: {} }, 'softcore');
  assert.ok(empty.rows.filter(r => /未驗證/.test(r.text)).length === 2 && !empty.rows.some(r => /經驗值與等級相符|技能欄沒有重複/.test(r.text)), '沒有角色資料時應為未驗證：' + JSON.stringify(empty.rows));

  // 2. 經驗值超過上限：判有問題，修正後等於上限
  const bad = await win.webContents.executeJavaScript(`(()=>{
    const s = { heroes: ${JSON.stringify(hero(10, 99999999, []))} };
    const list = flagChecks(s, 'softcore'); const x = list.find(r => /經驗值/.test(r.text));
    const before = x.ok; x.fix(); const after = flagChecks(s, 'softcore').find(r => /經驗值/.test(r.text)).ok;
    return { before, after, xp: s.heroes.sorceress.kept.run.xp, cap: xpCap(10) };
  })()`);
  assert.equal(bad.before, false, '超標經驗值應被判有問題');
  assert.equal(bad.after, true, '修正後應通過');
  assert.equal(bad.xp, bad.cap, '應設為該等級上限');

  // 3. 99 級：經驗值等於上限（實機 D2S1 副本為 5865600）通過，超過才判有問題
  const l99 = await run({ heroes: hero(99, 5865600, []) }, 'softcore');
  assert.ok(l99.rows.find(r => /經驗值/.test(r.text)).ok, '99 級經驗值等於上限應通過');
  const l99bad = await run({ heroes: hero(99, 999999999, []) }, 'softcore');
  assert.equal(l99bad.rows.find(r => /經驗值/.test(r.text)).ok, false, '99 級經驗值遠超上限應判有問題');
  assert.equal(mine[98], 5865600, '99 級上限應為 5865600');

  // 4. 技能重複：判有問題，修正後只剩一個
  const dup = await win.webContents.executeJavaScript(`(()=>{
    const s = { heroes: ${JSON.stringify(hero(10, 0, [{ id: 'fireBolt', level: 1 }, { id: 'fireBolt', level: 2 }, { id: 'frostNova', level: 1 }]))} };
    const x = flagChecks(s, 'softcore').find(r => /重複/.test(r.text)); const before = x.ok; x.fix();
    return { before, ids: s.heroes.sorceress.kept.build.skills.map(k => k.id) };
  })()`);
  assert.equal(dup.before, false);
  assert.deepEqual(dup.ids, ['fireBolt', 'frostNova']);

  // 5. 存檔模式與儲存槽：一般槽帶 mode:'hc' 有問題；硬核槽缺 mode 有問題；相符時通過；修正後通過
  const modeRows = await win.webContents.executeJavaScript(`(()=>{
    const pick = (s, mode) => flagChecks(s, mode).find(r => /存檔模式|硬核存檔|一般存檔/.test(r.text));
    const a = { mode: 'hc' }, b = {}, c = { mode: 'hc' }, d = {};
    const ra = pick(a, 'softcore'), rb = pick(b, 'hardcore'), rc = pick(c, 'hardcore'), rd = pick(d, 'softcore');
    ra.fix(); rb.fix();
    return { a: ra.ok, b: rb.ok, c: rc.ok, d: rd.ok, aAfter: pick(a, 'softcore').ok, bAfter: pick(b, 'hardcore').ok, aMode: a.mode, bMode: b.mode };
  })()`);
  assert.deepEqual([modeRows.a, modeRows.b, modeRows.c, modeRows.d], [false, false, true, true], '模式判斷不符：' + JSON.stringify(modeRows));
  assert.ok(modeRows.aAfter && modeRows.bAfter && modeRows.aMode === undefined && modeRows.bMode === 'hc', '模式修正不符：' + JSON.stringify(modeRows));

  // 6. 切槽競態、識別碼跳脫，以及尺寸未知時禁止重排
  const safety = await win.webContents.executeJavaScript(`(async () => {
    const originalLoad = window.api.load, originalSave = window.api.save, originalStatus = window.api.guardStatus;
    window.api.guardStatus = async () => ({ saveMode: 'local', noUpload: true });
    const pending = {}, writes = [];
    window.api.load = mode => new Promise(resolve => { pending[mode] = resolve; });
    window.api.save = async (mode, data) => { writes.push({ mode, gold: data.gold, off: data?.leaderboard?.off }); return { ok: true }; };
    document.querySelector('#mode').value = 'hardcore'; const older = load();
    const disabled = document.querySelector('#fixAll').disabled && document.querySelector('#scan').disabled && save === null;
    await new Promise(resolve => setTimeout(resolve, 30));
    document.querySelector('#mode').value = 'softcore'; const newer = load();
    await new Promise(resolve => setTimeout(resolve, 30));
    pending.softcore({ save: { gold: 12, stashTabs: {}, climbs: { '<img src=x onerror=alert(1)>': { hero: 'x' } } }, source: 'fixture' });
    await newer;
    pending.hardcore({ save: { gold: 99, stashTabs: {} }, source: 'fixture' }); await older;
    const race = { mode: loadedMode, gold: save.gold, images: document.querySelectorAll('#ids img').length, text: document.querySelector('#ids').textContent };
    document.querySelector('#mode').value = 'hardcore'; await saveAfterFix('測試');
    const rejected = writes.length === 0;
    document.querySelector('#mode').value = 'softcore';
    save.stashTabs = { shared1: [{ base: 'unknown', roll: [0, 0], at: { x: 0, y: 0 } }, { base: 'unknown', roll: [0, 0], at: { x: 0, y: 0 } }] };
    A = null; const before = JSON.stringify(save.stashTabs); const row = detectCurrent().find(x => /倉庫物品重疊檢查未驗證/.test(x.text));
    await fixAll();
    const unchanged = before === JSON.stringify(save.stashTabs);
    const savedOff = writes[0]?.off === true;
    window.api.load = originalLoad; window.api.save = originalSave; window.api.guardStatus = originalStatus;
    A = { uniques: {}, sets: {}, bases: {}, quest: {}, runes: {}, gems: {} };
    return { disabled, race, rejected, unknown: !!row?.unknown, hasFix: !!row?.fix, unchanged, savedOff };
  })()`);
  assert.equal(safety.disabled, true);
  assert.deepEqual([safety.race.mode, safety.race.gold, safety.race.images], ['softcore', 12, 0]);
  assert.ok(safety.race.text.includes('<img src=x onerror=alert(1)>'));
  assert.equal(safety.rejected, true);
  assert.equal(safety.unknown, true);
  assert.equal(safety.hasFix, false);
  assert.equal(safety.unchanged, true);
  assert.equal(safety.savedOff, false, '寫入不再強制 leaderboard.off');

  // 7. guard.html 防護狀態、一鍵修正寫回與遊戲診斷解析
  const guardUi = await win.webContents.executeJavaScript(`(async () => {
    let savedData = null, closedCount = 0;
    window.api.guardStatus = async () => ({
      version: '1.0.13',
      saveMode: 'local',
      saveModeSource: 'default',
      noUpload: true,
      leaderboardOff: true,
      queuePresent: false,
      blockedUploads: 2,
      replacedNatives: [],
      d2zh: false,
      webdriver: false,
      restrictedParams: ['seed'],
      seals: { softcore: 'sealed', hardcore: 'sealed' }
    });
    window.api.save = async (mode, s) => { savedData = { mode, gold: s.gold, off: s?.leaderboard?.off }; return { ok: true }; };
    window.api.close = async () => { closedCount++; return { ok: true }; };

    save.gold = 2e10;
    await refreshGuardStatus();
    await renderGuard();
    const fixDisabled = document.querySelector('#fixAll').disabled;
    const guardStatusHtml = document.querySelector('#guardStatusBody').textContent;

    await fixAll();
    document.querySelector('#diagIn').value = 'page: replaced Storage.setItem\\nleaderboard queue: 1 waiting, 1 refused (gear)';
    renderDiag();
    const diagOutText = document.querySelector('#diagOut').textContent;
    const diagRefCount = document.querySelectorAll('#diagRef tr').length;
    document.querySelector('#closeBtn').click();

    return { fixDisabled, guardStatusHtml, savedData, diagOutText, diagRefCount, closedCount };
  })()`);
  assert.equal(guardUi.fixDisabled, false, '桌面模式應啟用一鍵修正');
  assert.match(guardUi.guardStatusHtml, /seed/);
  assert.deepEqual(guardUi.savedData, { mode: 'softcore', gold: 1e10, off: undefined }, '一鍵修正後應透過 save 寫回，不強制 off');
  assert.match(guardUi.diagOutText, /leaderboard queue/);
  assert.ok(guardUi.diagRefCount >= 20, '應渲染診斷欄位對照表');
  assert.equal(guardUi.closedCount, 1, '右上關閉應呼叫 close()');

  // 8. editor.html：存檔檢查分頁改為遷移說明；寫入存檔維持 leaderboard.off = true
  await win.loadFile(path.join(__dirname, '..', 'editor.html'));
  const editorUi = await win.webContents.executeJavaScript(`(async () => {
    await saveCheckPromise;
    showPage('guard');
    return {
      guardText: document.querySelector('#guard').textContent.trim(),
      writeDisabled: document.querySelector('#write').disabled
    };
  })()`);
  assert.match(editorUi.guardText, /存檔檢查已移到工具包選單的「存檔檢查與防護」/);
  assert.equal(editorUi.writeDisabled, false, '桌面版修改器載入模組後應可寫入');

  const editorWrite = await win.webContents.executeJavaScript(`(async () => {
    window.confirm = () => true;
    let written = null;
    window.api.save = async (mode, s) => { written = { mode, off: s?.leaderboard?.off }; return { ok: true }; };
    await write();
    return written;
  })()`);
  assert.notEqual(editorWrite?.off, true, '修改器寫入存檔不再強制 leaderboard.off');

  console.log('存檔檢查（旗標／模式）介面測試通過'); clearTimeout(watchdog); app.exit(0);
}).catch(e => { console.error(e.stack); clearTimeout(watchdog); app.exit(1); });
