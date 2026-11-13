// 網頁版 iframe 不注入 preload，透過父頁 postMessage 驗證後端橋接。
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const root = fs.realpathSync(path.resolve(__dirname, '../..'));
const guardFile = process.env.GUARD_IFRAME_HTML || path.join(root, 'guard/guard.html');
const html = fs.readFileSync(guardFile, 'utf8');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'guard_iframe_t8-'));
app.setPath('userData', profile);
let server;
const watchdog = setTimeout(() => { console.error('iframe 測試總逾時'); app.exit(1); }, 60000);
const parent = `<!doctype html><html><body style="margin:0"><iframe id="guard" style="width:100vw;height:100vh;border:0"></iframe><script>
window.calls = []; let mode = 'local';
window.addEventListener('message', e => {
  if (e.origin !== location.origin || e.source !== document.querySelector('#guard').contentWindow || e.data?.d2edit !== 'call') return;
  const { id, fn, args } = e.data; calls.push({ fn, args }); let result;
  switch (fn) {
    case 'load': result = { save: { version: 6, gold: 1, stashTabs: {}, equippedByClass: {}, unlocked: {}, heroes: {} }, source: 'localStorage', seal: 'sealed' }; break;
    case 'guardStatus': result = { version: '1.0.13', saveMode: mode, saveModeSource: 'override', noUpload: true, leaderboardOff: true, queuePresent: false, blockedUploads: 0, replacedNatives: [], d2zh: false, webdriver: false, restrictedParams: [], seals: { softcore: 'sealed', hardcore: 'sealed' } }; break;
    case 'saveMode': result = mode; break;
    case 'setSaveMode': mode = args[0] || 'local'; result = { saveMode: mode, saveModeSource: 'override' }; break;
    case 'engine': result = ['faults', 'saveFaults', 'generateMany'].includes(args[0]) ? [] : {}; break;
    case 'assets': result = { dir: '', uniques: {}, sets: {}, bases: {}, quest: {}, runes: {}, gems: {} }; break;
    case 'i18n': result = { dict: {}, game: { stats: {}, classes: {} } }; break;
    case 'traces': result = []; break;
    case 'diag': result = {}; break;
    case 'gameBuild': result = '20261105.3'; break;
    case 'close': result = { ok: true }; break;
    default: result = {};
  }
  e.source.postMessage({ d2edit: 'reply', id, result }, e.origin);
});
document.querySelector('#guard').src = '/guard/guard.html?origin=' + encodeURIComponent(location.origin) + '&mode=softcore&v=test';
</script></body></html>`;

async function waitFor(win, expression, label) {
  const end = Date.now() + 12000;
  while (Date.now() < end) {
    const value = await win.webContents.executeJavaScript(expression);
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const state = await win.webContents.executeJavaScript(`({ calls: window.calls, status: document.querySelector('#guard').contentDocument?.querySelector('#status')?.textContent })`);
  throw new Error(label + '逾時：' + JSON.stringify(state));
}

app.whenReady().then(async () => {
  server = http.createServer((req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(parent); }
      if (url.pathname === '/guard/guard.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(html); }
      const file = fs.realpathSync(path.resolve(root, '.' + decodeURIComponent(url.pathname)));
      if (!file.startsWith(root + path.sep) || !fs.statSync(file).isFile()) { res.writeHead(403); return res.end(); }
      const type = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.html': 'text/html' }[path.extname(file)] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type + '; charset=utf-8' });
      res.end(fs.readFileSync(file));
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const win = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false, contextIsolation: true } });
  const messages = [];
  win.webContents.on('console-message', (_event, _level, message) => messages.push(message));
  await win.loadURL('http://127.0.0.1:' + server.address().port + '/');
  const frame = "document.querySelector('#guard').contentDocument";
  await waitFor(win, `${frame}?.querySelector('#status')?.textContent.includes('已讀取')`, '讀取存檔');
  assert.ok(await win.webContents.executeJavaScript(`${frame}.querySelectorAll('#guardStatusBody tr').length > 0`), '防護狀態表應有內容');
  await win.webContents.executeJavaScript(`${frame}.querySelector('#modeBtnOnline').click()`);
  await waitFor(win, `window.calls.some(c => c.fn === 'setSaveMode' && c.args[0] === 'online') && ${frame}.querySelector('#fixAll').disabled`, '切換線上模式');
  await win.webContents.executeJavaScript(`${frame}.querySelector('#closeBtn').click()`);
  await waitFor(win, `window.calls.some(c => c.fn === 'close')`, '關閉');
  assert.doesNotMatch(messages.join('\n'), /Maximum call stack|後端逾時/i, '主控台不應出現遞迴或後端逾時');
  const bridge = html.slice(html.indexOf('const backend = (() => {'), html.indexOf('window.backend = backend;'));
  assert.ok(bridge.startsWith('const backend ='), '找不到後端橋接程式');
  assert.doesNotMatch(bridge, /window\.api\s*\[\s*fn\s*\]\s*\(/, '橋接不得直接呼叫 window.api[fn]');
  console.log('防護頁網頁版 iframe 回歸測試通過');
  clearTimeout(watchdog); server.close(); app.exit(0);
}).catch(error => {
  console.error(error.stack || error); clearTimeout(watchdog); if (server) server.close(); app.exit(1);
});
