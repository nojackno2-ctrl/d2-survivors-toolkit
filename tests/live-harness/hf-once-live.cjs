// 隔離設定檔驗證舊版淬鍊資料；所有輸出均位於 H_OUT。
const fs = require('fs'), path = require('path'), http = require('http'), zlib = require('zlib');
const { app } = require('electron');
const root = path.resolve(__dirname, '../..'), out = process.env.H_OUT;
if (!out || !process.env.H_SEED) throw new Error('必須指定 H_OUT 與 H_SEED');
fs.mkdirSync(out, { recursive: true });
const raw = fs.readFileSync(process.env.H_SEED, 'utf8').trim();
const save = JSON.parse(zlib.inflateSync(Buffer.from(raw.slice(4), 'base64url')));
const items = [save.inventoryByClass.sorceress.find(x => x.id === 'zud0t1i1mvuxy3vc'), save.stashTabs.sorceress.find(x => x.id === '6qtwom6hmvvygeyu')];
if (items.some(x => !x)) throw new Error('找不到指定暗金裝備');
items[0].forge = { t: { damageReduced: 12 } };
items[1].forge = { t: { mana: 22 } };
fs.writeFileSync(path.join(out, 'input-forge.json'), JSON.stringify(items.map(x => ({ id: x.id, forge: x.forge })), null, 2));
process.env.H_SEED = path.join(out, 'seed.json');
fs.writeFileSync(process.env.H_SEED, JSON.stringify(save));
process.env.H_CLASS = 'sorceress'; process.env.H_BASE = 'http://localhost:8774/';
process.env.H_BOT = path.join(root, 'helper/autobot.js');
const mime = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.html': 'text/html' };
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Content-Type': (mime[path.extname(file)] || 'application/octet-stream') + '; charset=utf-8', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});
server.listen(8774, '127.0.0.1');
require('./main.js');
let sent = false;
const timer = setInterval(() => {
  if (sent || !fs.existsSync(path.join(out, 'status.json'))) return;
  const status = JSON.parse(fs.readFileSync(path.join(out, 'status.json'), 'utf8'));
  if (!status.cls) return;
  sent = true;
  const code = `(()=>{const g=window.__d2autobot.game, cls=g.kit.id, ids=${JSON.stringify(items.map(x => x.id))}; const pool=[...(g.inventoryOf?.(cls)||[]),...(g.save?.stashTabs?.[cls]||[])]; return {url:location.href,cls,connected:window.__d2autobot.diagnostics(),items:ids.map(id=>{const x=pool.find(v=>v.id===id);return {id,found:!!x,forge:x?.forge??null,eligible:!!x&&['unique','set','runeword'].includes(x.rarity)&&Array.isArray(x.mods)&&x.mods.length>0,usedHellforge:!!x?.forge?.hf,source:x?(g.inventoryOf?.(cls)||[]).some(v=>v.id===id)?'bag':'stash':null};})}})()`;
  fs.writeFileSync(path.join(out, 'cmd.js'), code);
  setTimeout(() => { clearInterval(timer); server.close(); app.exit(0); }, 20000);
}, 2000);
setTimeout(() => { server.close(); app.exit(1); }, 180000);
