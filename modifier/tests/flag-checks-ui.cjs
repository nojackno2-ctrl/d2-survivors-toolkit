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
    window.api.guardStatus = async () => ({ saveMode: 'local' });
    window.api.saveMode = async () => 'local'; currentSaveMode = 'local';
    const pending = {}, writes = [];
    window.api.load = mode => new Promise(resolve => { pending[mode] = resolve; });
    window.api.save = async (mode, data) => { writes.push({ mode, gold: data.gold }); return { ok: true }; };
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
    window.api.saveMode = async () => { throw new Error('失敗'); };
    const beforeWrites = writes.length; await saveAfterFix('測試');
    const failedModeBlocked = writes.length === beforeWrites && document.querySelector('#fixAll').disabled && !document.querySelector('#onlineNotice').hidden;
    window.api.load = originalLoad; window.api.save = originalSave; window.api.guardStatus = originalStatus;
    A = { uniques: {}, sets: {}, bases: {}, quest: {}, runes: {}, gems: {} };
    return { disabled, race, rejected, unknown: !!row?.unknown, hasFix: !!row?.fix, unchanged, failedModeBlocked };
  })()`);
  assert.equal(safety.disabled, true);
  assert.deepEqual([safety.race.mode, safety.race.gold, safety.race.images], ['softcore', 12, 0]);
  assert.ok(safety.race.text.includes('<img src=x onerror=alert(1)>'));
  assert.equal(safety.rejected, true);
  assert.equal(safety.unknown, true);
  assert.equal(safety.hasFix, false);
  assert.equal(safety.unchanged, true);
  assert.equal(safety.failedModeBlocked, true);

  // 舊後端缺少模式查詢時可寫入；線上模式、錯誤及逾時必須拒絕。
  const guardModes = await win.webContents.executeJavaScript(`(async () => {
    let writes = 0; window.api.save = async () => { writes++; return { ok: true }; };
    delete window.api.saveMode; delete window.api.guardStatus;
    await refreshGuardStatus(); const legacyUi = currentSaveMode;
    await saveAfterFix('測試'); const legacy = writes;
    window.api.saveMode = async () => 'online'; await saveAfterFix('測試'); const online = writes;
    window.api.saveMode = async () => { throw new Error('失敗'); }; await saveAfterFix('測試');
    const error = { writes, text: document.querySelector('#status').textContent };
    window.api.saveMode = () => new Promise(() => {}); await saveAfterFix('測試');
    const timeout = { writes, text: document.querySelector('#status').textContent };
    window.api.saveMode = async () => ({ error: '不支援的操作：saveMode' }); await saveAfterFix('測試');
    return { legacyUi, legacy, online, error, timeout, unsupported: writes };
  })()`);
  assert.equal(guardModes.legacyUi, 'local');
  assert.equal(guardModes.legacy, 1);
  assert.equal(guardModes.online, 1);
  assert.deepEqual(guardModes.error, { writes: 1, text: '無法確認存檔模式，請重試' });
  assert.deepEqual(guardModes.timeout, { writes: 1, text: '無法確認存檔模式，請重試' });
  assert.equal(guardModes.unsupported, 2);

  // 7. guard.html 防護狀態、單機／線上模式切換、一鍵修正寫回與遊戲診斷解析
  const guardUi = await win.webContents.executeJavaScript(`(async () => {
    let savedData = null, closedCount = 0, modeState = 'online', modeSource = 'override';
    window.api.guardStatus = async () => ({
      version: '1.0.13',
      saveMode: modeState,
      saveModeSource: modeSource,
      noUpload: true,
      leaderboardOff: true,
      queuePresent: false,
      blockedUploads: 2,
      replacedNatives: ['Storage.setItem'],
      d2zh: false,
      webdriver: false,
      restrictedParams: ['seed'],
      seals: { softcore: 'sealed', hardcore: 'sealed' }
    });
    window.api.saveMode = async () => modeState;
    window.api.setSaveMode = async (m) => { modeState = m || 'local'; modeSource = m ? 'override' : 'detected'; return { saveMode: modeState, saveModeSource: modeSource }; };
    window.api.save = async (mode, s) => { savedData = { mode, gold: s.gold }; return { ok: true }; };
    window.api.close = async () => { closedCount++; return { ok: true }; };

    save.gold = 2e10;
    await refreshGuardStatus();
    await renderGuard();
    const onlineBannerHidden = document.querySelector('#onlineNotice').hidden;
    const onlineBannerText = document.querySelector('#onlineNotice').textContent;
    const fixDisabledOnline = document.querySelector('#fixAll').disabled;
    const guardStatusHtml = document.querySelector('#guardStatusBody').textContent;

    await switchSaveMode('local');
    const localBannerHidden = document.querySelector('#onlineNotice').hidden;
    const fixDisabledLocal = document.querySelector('#fixAll').disabled;
    await fixAll();
    document.querySelector('#diagIn').value = 'page: replaced Storage.setItem\\nleaderboard queue: 1 waiting, 1 refused (gear)';
    renderDiag();
    const diagOutText = document.querySelector('#diagOut').textContent;
    const diagRefCount = document.querySelectorAll('#diagRef tr').length;
    document.querySelector('#closeBtn').click();

    return { onlineBannerHidden, onlineBannerText, fixDisabledOnline, guardStatusHtml, localBannerHidden, fixDisabledLocal, savedData, diagOutText, diagRefCount, closedCount };
  })()`);
  assert.equal(guardUi.onlineBannerHidden, false, '線上模式應顯示提示');
  assert.match(guardUi.onlineBannerText, /線上存檔：只檢查、不寫入/);
  assert.equal(guardUi.fixDisabledOnline, true, '線上模式應停用一鍵修正');
  assert.match(guardUi.guardStatusHtml, /Storage\.setItem/);
  assert.match(guardUi.guardStatusHtml, /seed/);
  assert.equal(guardUi.localBannerHidden, true, '單機模式應隱藏線上提示');
  assert.equal(guardUi.fixDisabledLocal, false, '單機模式應啟用一鍵修正');
  assert.deepEqual(guardUi.savedData, { mode: 'softcore', gold: 1e10 }, '單機模式一鍵修正後應透過 save 寫回');
  assert.match(guardUi.diagOutText, /leaderboard queue/);
  assert.ok(guardUi.diagRefCount >= 20, '應渲染診斷欄位對照表');
  assert.equal(guardUi.closedCount, 1, '右上關閉應呼叫 close()');

  // 7. editor.html：存檔檢查分頁改為遷移說明；線上模式顯示頁首橫幅並停用寫入按鈕
  await win.loadFile(path.join(__dirname, '..', 'editor.html'));
  const editorUi = await win.webContents.executeJavaScript(`(async () => {
    window.api.saveMode = async () => 'online';
    await checkSaveMode();
    showPage('guard');
    return {
      guardText: document.querySelector('#guard').textContent.trim(),
      bannerHidden: document.querySelector('#onlineModeBanner').hidden,
      bannerText: document.querySelector('#onlineModeBanner').textContent.trim(),
      writeDisabled: document.querySelector('#write').disabled
    };
  })()`);
  assert.match(editorUi.guardText, /存檔檢查已移到工具包選單的「存檔檢查與防護」/);
  assert.equal(editorUi.bannerHidden, false, '修改器線上模式應顯示頁首橫幅');
  assert.equal(editorUi.bannerText, '線上存檔模式：修改器只修改單機存檔，目前僅供檢視');
  assert.equal(editorUi.writeDisabled, true, '修改器線上模式應停用寫入按鈕');

  const editorModes = await win.webContents.executeJavaScript(`(async () => {
    await saveCheckPromise; window.confirm = () => true;
    let writes = 0; window.api.save = async () => { writes++; return { ok: true }; };
    delete window.api.saveMode; await write(); const legacy = writes;
    window.api.saveMode = async () => 'online'; await write(); const online = writes;
    window.api.saveMode = async () => { throw new Error('失敗'); }; await write();
    const error = { writes, text: document.querySelector('#status').textContent };
    window.api.saveMode = () => new Promise(() => {}); await write();
    const timeout = { writes, text: document.querySelector('#status').textContent };
    window.api.saveMode = async () => ({ error: '不支援的操作：saveMode' }); await write();
    return { legacy, online, error, timeout, unsupported: writes };
  })()`);
  assert.equal(editorModes.legacy, 1);
  assert.equal(editorModes.online, 1);
  assert.deepEqual(editorModes.error, { writes: 1, text: '無法確認存檔模式，請重試' });
  assert.deepEqual(editorModes.timeout, { writes: 1, text: '無法確認存檔模式，請重試' });
  assert.equal(editorModes.unsupported, 2);

  console.log('存檔檢查（旗標／模式）介面測試通過'); clearTimeout(watchdog); app.exit(0);
}).catch(e => { console.error(e.stack); clearTimeout(watchdog); app.exit(1); });
