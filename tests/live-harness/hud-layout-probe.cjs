// 官方遊戲介面定位探查；使用隔離設定檔與存檔副本。
const { app, BrowserWindow, session, net } = require("electron");
const fs = require("fs"), path = require("path"), os = require("os"), zlib = require("zlib");
const root = path.resolve(__dirname, "../.."), pages = "https://nojackno2-ctrl.github.io/d2-survivors-toolkit/";
const sleep = ms => new Promise(r => setTimeout(r, ms));
app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "d2-hud-probe-")));
app.whenReady().then(async () => {
  const timer = setTimeout(() => app.exit(1), 120000);
  try {
    const source = process.env.H_SAVE_SOURCE;
    if (!source) throw Error("請指定 H_SAVE_SOURCE");
    session.defaultSession.protocol.handle("https", req => {
      if (!req.url.startsWith(pages)) return net.fetch(req, { bypassCustomProtocolHandlers: true });
      const rel = decodeURIComponent(new URL(req.url).pathname.slice("/d2-survivors-toolkit/".length)), file = path.resolve(root, rel);
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return new Response("", { status: 404 });
      const mime = { ".js": "text/javascript", ".json": "application/json", ".html": "text/html" };
      return new Response(fs.readFileSync(file), { headers: { "content-type": (mime[path.extname(file)] || "application/octet-stream") + "; charset=utf-8", "access-control-allow-origin": "*", "cache-control": "no-store" } });
    });
    const win = new BrowserWindow({ width: 1200, height: 900, show: false, webPreferences: { webSecurity: false, backgroundThrottling: false } });
    win.webContents.debugger.attach("1.3");
    await win.webContents.debugger.sendCommand("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    const js = s => win.webContents.executeJavaScript(s);
    await win.loadURL("https://d2survivors.lol/play/").catch(() => {}); await sleep(4000);
    const seed = JSON.parse(zlib.inflateSync(Buffer.from(fs.readFileSync(source, "utf8").trim().slice(5), "base64url")));
    await js(`localStorage.setItem('d2-survivors/save/v1', ${JSON.stringify(JSON.stringify(seed))}); 1`);
    await win.loadURL("https://d2survivors.lol/play/").catch(() => {}); await sleep(4000);
    await js(`document.querySelectorAll('button').forEach(b => { if (/hosted/i.test(b.textContent)) b.click() }); 1`); await sleep(12000);
    await js(`window.__d2autobotSwitches={enabled:true,progressEnabled:true,cheat:false}; import(${JSON.stringify(pages + "d2edit.js?v=")}+Date.now()).then(()=>true)`); await sleep(7000);
    await js(`(async()=>{const sleep=ms=>new Promise(r=>setTimeout(r,ms));for(let i=0;i<50&&!window.__d2autobot?.game;i++){document.body.dispatchEvent(new KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true}));await sleep(400)}const g=window.__d2autobot?.game;if(!g)throw Error('沒有遊戲物件');if(g.state==='select'){if(!g.plainSelect().onPick){g.chooseClass();await sleep(1500)}const s=g.plainSelect(),i=s.cards.findIndex(c=>c.dataset?.class==='sorceress');s.select(i);await sleep(300);s.confirm(false)}for(let i=0;i<90&&!g.world?.player;i++)await sleep(500);return g.state})()`);
    for (const [width,height] of [[390,844],[844,390],[1200,900]]) {
      win.setContentSize(width,height); await sleep(5000);
      console.log(JSON.stringify(await js(`(()=>{let ids=['clock','run-info','area','act','kills','tier-wave','revives','tier-affixes','dps','belt-slots'];let boxes={};for(const id of ids){let e=document.getElementById(id);if(!e)continue;let r=e.getBoundingClientRect();boxes[id]={x:r.x,y:r.y,w:r.width,h:r.height,text:e.innerText,display:getComputedStyle(e).display}}return {viewport:[innerWidth,innerHeight],portrait:document.documentElement.className,state:window.__d2autobot.game.state,boxes}})()`)));
    }
    clearTimeout(timer); win.destroy(); app.exit(0);
  } catch(e) { console.error(e.stack); clearTimeout(timer); app.exit(1); }
});
