// 使用隔離存檔觀察官方遊戲與輔助器的牛群狀態。
const { app, BrowserWindow } = require("electron");
const fs = require("fs"), path = require("path"), http = require("http");
const root = path.resolve(__dirname, "../.."), out = process.env.H_OUT;
if (!out || !process.env.H_SEED || process.env.H_BASE !== "http://localhost:8773/") throw Error("缺少測試環境變數");
fs.mkdirSync(out, { recursive: true });
app.setPath("userData", path.join(out, "profile"));
const log = (...a) => fs.appendFileSync(path.join(out, "log.txt"), new Date().toISOString() + " " + a.join(" ") + "\n");
const server = http.createServer((req, res) => {
  const p = path.resolve(root, "." + decodeURIComponent(new URL(req.url, "http://localhost").pathname));
  if (!p.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
  const rel = path.relative(root, p).replaceAll("\\", "/");
  const allowed = new Set(["d2edit.js", "version.json", "helper/autobot.js", "helper/autoforge.js", "helper/autoforge-ui.js", "helper/selfcheck.js", "lang/lang.js", "lang/zh-TW.json", "modifier/patch.mjs", "modifier/signatures.json", "modifier/gamedata.json", "modifier/engine-page.js", "modifier/overrides/game-overrides.js"]);
  if (!allowed.has(rel)) { res.writeHead(403); return res.end(); }
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404); return res.end(); }
    const mime = { ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".css": "text/css" };
    res.writeHead(200, { "Access-Control-Allow-Origin": "https://d2survivors.lol", "Content-Type": mime[path.extname(p)] || "application/octet-stream", "Cache-Control": "no-store" }); res.end(data);
  });
});
let finished = false;
function finish(result, code = 0) { if (finished) return; finished = true; fs.writeFileSync(path.join(out, "result.json"), JSON.stringify(result, null, 2)); log(JSON.stringify(result)); server.close(); app.exit(code); }
setTimeout(() => finish({ error: "實機測試逾時" }, 1), 180000);
server.on("error", e => finish({ error: String(e) }, 1));
server.listen(8773, "localhost", () => app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({ show: true, webPreferences: { backgroundThrottling: false } });
    win.webContents.on("console-message", (_e, level, message) => { if (level >= 2) log("console", message.slice(0, 1000)); });
    win.webContents.on("did-fail-load", (_e, code, description, url) => log("load-error", code, description, url));
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    await win.loadURL("https://d2survivors.lol/play/").catch(e => log("導頁", e.message)); await sleep(4000);
    await win.webContents.executeJavaScript("localStorage.setItem('d2-survivors/save/v1'," + JSON.stringify(fs.readFileSync(process.env.H_SEED, "utf8")) + ")");
    await win.loadURL("https://d2survivors.lol/play/").catch(e => log("導頁", e.message)); await sleep(4000);
    await win.webContents.executeJavaScript("(()=>{const b=[...document.querySelectorAll('button')].find(x=>/hosted/i.test(x.textContent));if(b)b.click()})()"); await sleep(12000);
    const result = await win.webContents.executeJavaScript(`(async()=>{
      const sleep=ms=>new Promise(r=>setTimeout(r,ms));
      await import('http://localhost:8773/d2edit.js?v='+Date.now());
      for(let i=0;i<120&&!window.__d2autobot?.game;i++){document.body.dispatchEvent(new KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true}));await sleep(500)}
      const bot=window.__d2autobot,g=bot?.game;if(!g)throw Error('找不到遊戲物件');
      if(g.state==='select'){if(g.frontend?.open&&!g.plainSelect().onPick){g.frontend.actions.play();await sleep(3000)}if(!g.plainSelect().onPick){g.chooseClass();await sleep(1500)}const s=g.plainSelect(),i=s.cards.findIndex(c=>c.dataset?.class==='sorceress');if(i<0)throw Error('找不到職業');s.select(i);await sleep(300);s.confirm(false)}
      for(let i=0;i<120&&!g.world?.player;i++)await sleep(500);
      if(!g.world?.player)throw Error('未進入遊戲 '+JSON.stringify(bot.diagnostics()));
      const panel=document.querySelector('#d2autobot-panel')?.shadowRoot;
      function toggle(n,v){const b=panel?.querySelector('[data-setting="'+n+'"]');if(!b)throw Error('找不到設定 '+n);if((b.getAttribute('aria-checked')==='true')!==v)b.click()}
      toggle('enabled',true);toggle('progressEnabled',true);toggle('cheat.enabled',true);toggle('cheat.invincible',true);toggle('cheat.maxMonsterDensity',true);
      for(let i=0;i<60&&g.state!=='playing';i++)await sleep(500);
      await sleep(2000);
      const before={director:!!g.director,state:g.state};
      g.travel('farm');
      for(let i=0;i<90 && !(g.world?.farm && g.world.enemies?.some(e=>e.kind==='hellbovine'&&!e.dead));i++)await sleep(500);
      const w=g.world, cow=w.enemies?.find(e=>e.kind==='hellbovine'&&!e.dead);
      if(!cow)return {url:location.href,before,state:g.state,farm:!!w.farm,enemyCount:w.enemies?.length,cows:0,diagnostics:bot.diagnostics(),error:'未等到活牛'};
      toggle('cheat.maxMonsterDensity',false);
      const clones=[];
      for(let i=0;i<9;i++){const c=Object.assign(Object.create(Object.getPrototypeOf(cow)),cow);c._cheatClone=true;c.x+=i*5;c.y+=i*5;clones.push(c)}
      w.enemies.push(...clones);
      toggle('cheat.oneHitKill',true);
      const snap=()=>({time:w.time,state:g.state,farm:!!w.farm,allCows:w.enemies.filter(e=>e.kind==='hellbovine').length,liveCows:w.enemies.filter(e=>!e.dead&&e.kind==='hellbovine').length,clonesPresent:clones.filter(e=>w.enemies.includes(e)).length,clonesDead:clones.filter(e=>e.dead).length,clonesAlive:clones.filter(e=>!e.dead).length});
      const samples=[snap()];
      for(let i=0;i<30;i++){await sleep(1000);samples.push(snap())}
      return {url:location.href,method:'遊戲 API travel(farm)；依輔助器複製方式注入九隻複製牛',before,samples,diagnostics:bot.diagnostics()};
    })()`);
    finish(result);
  } catch (e) { finish({ error: String(e?.stack || e) }, 1); }
}));
