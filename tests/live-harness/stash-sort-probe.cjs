// 官方遊戲的倉庫介面與格子資料探查，使用隔離設定檔及存檔副本。
const { app, BrowserWindow, session, net } = require("electron");
const fs = require("fs"), path = require("path"), os = require("os"), zlib = require("zlib");
const root = path.resolve(__dirname, "../.."), pages = "https://nojackno2-ctrl.github.io/d2-survivors-toolkit/";
const source = process.env.H_SAVE_SOURCE;
const sleep = ms => new Promise(r => setTimeout(r, ms));
app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "d2-stash-probe-")));
app.whenReady().then(async () => {
  const timeout = setTimeout(() => { console.error("測試逾時"); app.exit(1); }, 180000);
  try {
    if (!source) throw Error("請用 H_SAVE_SOURCE 指定 D2S1 存檔副本");
    session.defaultSession.protocol.handle("https", req => {
      if (!req.url.startsWith(pages)) return net.fetch(req, { bypassCustomProtocolHandlers: true });
      const rel = decodeURIComponent(new URL(req.url).pathname.slice("/d2-survivors-toolkit/".length)), file = path.resolve(root, rel);
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return new Response("not found", { status: 404 });
      const mime = { ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".html": "text/html" };
      return new Response(fs.readFileSync(file), { headers: { "content-type": (mime[path.extname(file)] || "application/octet-stream") + "; charset=utf-8", "access-control-allow-origin": "*", "cache-control": "no-store" } });
    });
    const win = new BrowserWindow({ width: 1200, height: 900, show: false, webPreferences: { webSecurity: false, backgroundThrottling: false } });
    const js = s => win.webContents.executeJavaScript(s);
    await win.loadURL("https://d2survivors.lol/play/").catch(() => {}); await sleep(4000);
    const seed = JSON.parse(zlib.inflateSync(Buffer.from(fs.readFileSync(source, "utf8").trim().slice(5), "base64url")));
    await js(`localStorage.setItem('d2-survivors/save/v1', ${JSON.stringify(JSON.stringify(seed))}); 1`);
    await win.loadURL("https://d2survivors.lol/play/").catch(() => {}); await sleep(4000);
    await js(`document.querySelectorAll('button').forEach(b => { if (/hosted/i.test(b.textContent)) b.click() }); 1`); await sleep(12000);
    await js(`import(${JSON.stringify(pages + "d2edit.js?v=")}+Date.now()).then(()=>true)`); await sleep(7000);
    const out = await js(`(async()=>{
      const sleep=ms=>new Promise(r=>setTimeout(r,ms)), copy=x=>JSON.parse(JSON.stringify(x));
      for(let i=0;i<50&&!window.__d2autobot?.game;i++){document.body.dispatchEvent(new KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true}));await sleep(400)}
      const g=window.__d2autobot?.game;if(!g)throw Error('沒有遊戲物件');
      if(g.state==='select'){if(!g.plainSelect().onPick){g.chooseClass();await sleep(1500)}const s=g.plainSelect(),i=s.cards.findIndex(c=>c.dataset?.class==='sorceress');s.select(i);await sleep(300);s.confirm(false)}
      for(let i=0;i<90&&!g.world?.player;i++)await sleep(500);
      window.__d2autobot.stop(); await g.enterCamp(g.kit); await sleep(1500);
      const camp={state:g.state,ready:!!g.camp}; g.openCampTrade('stash');await sleep(1000);
      const alerts=[];window.alert=x=>alerts.push(x);const tabs=document.querySelector('#stash-tabs'),btn=document.querySelector('#d2-stash-sort');
      if(!btn)throw Error('找不到整理按鈕');
      const rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}};
      const buttonRect=rect(btn), stashRect=rect(document.querySelector('#stash-panel'));
      const checks=[];
      for(const tab of ['personal','shared1','shared2','shared3']){
        tabs.querySelector('[data-stash-tab="'+tab+'"]').click();await sleep(500);
        const key=tab==='personal'?g.kit.id:tab, before=copy(g.save.stashTabs), beforePage=copy(g.save.stashTabs[key]);
        const nonPosition=x=>x.map(item=>{let o={...item};delete o.at;return o});
        const visible=!btn.hidden&&!btn.disabled, area=document.querySelector('#stash').querySelectorAll('[data-item]').length;
        btn.click();await sleep(500);
        const after=copy(g.save.stashTabs), placements=g.stashView(g.kit.id).tabs[tab];
        const ids=new Set(placements.map(p=>p.item.id));
        const overlaps=[];let occupied=new Set();for(const tile of document.querySelectorAll('#stash [data-item]')){let m=tile.style.gridArea.match(/^(\\d+) \\/ (\\d+) \\/ span (\\d+) \\/ span (\\d+)$/);if(!m){overlaps.push('尺寸不明');continue}let [,y,x,h,w]=m.map(Number);for(let dy=0;dy<h;dy++)for(let dx=0;dx<w;dx++){let pos=(x+dx)+','+(y+dy);if(x+dx>10||y+dy>12||occupied.has(pos))overlaps.push(pos);occupied.add(pos)}}
        checks.push({tab,visible,area,count:after[key].length,changed:JSON.stringify(beforePage)!==JSON.stringify(after[key]),sameItems:JSON.stringify(nonPosition(beforePage))===JSON.stringify(nonPosition(after[key])),othersSame:Object.keys(before).filter(k=>k!==key).every(k=>JSON.stringify(before[k])===JSON.stringify(after[k])),rendered:ids.size===after[key].length&&area===after[key].length,overlaps,stillOpen:g.stashTab===tab,stored:JSON.stringify(JSON.parse(localStorage.getItem('d2-survivors/save/v1')).stashTabs[key])===JSON.stringify(after[key])});
      }
      tabs.querySelector('[data-stash-tab="uniques"]').click();await sleep(600);const collectionHidden=btn.hidden&&getComputedStyle(btn).display==='none';
      tabs.querySelector('[data-stash-tab="personal"]').click();await sleep(500);const saveBefore=JSON.stringify(g.save.stashTabs);g.save.cursor={item:g.save.stashTabs[g.kit.id][0],cls:g.kit.id,from:'personal'};window.__d2stashSort.sync();const holdingDisabled=btn.disabled;btn.click();const holdingUnchanged=saveBefore===JSON.stringify(g.save.stashTabs);delete g.save.cursor;window.__d2stashSort.sync();
      g.openCampTrade('store');await sleep(800);g.openCharacter('town',g.kit.id);await sleep(800);const storeTabs=document.querySelector('#stash-tabs');const storeBefore=JSON.stringify(g.save.stashTabs);const storeTab=storeTabs.querySelector('[data-stash-tab="shared1"]');if(storeTab)storeTab.click();await sleep(500);const storeVisible=!!storeTab&&!btn.hidden&&!btn.disabled;btn.click();await sleep(500);const storeAfter=JSON.stringify(g.save.stashTabs),storeOpen=g.stashTab==='shared1';
      return {camp,buttonRect,stashRect,checks,collectionHidden,holdingDisabled,holdingUnchanged,alerts,store:{visible:storeVisible,unchangedOnRepeat:storeBefore===storeAfter,open:storeOpen},final:copy(g.save.stashTabs)};
    })()`);
    const layouts = [];
    for (const [width, height] of [[1200, 900], [390, 844], [844, 390]]) {
      win.setContentSize(width, height); await sleep(1200);
      layouts.push(await js(`(()=>{const b=document.querySelector('#d2-stash-sort'),r=b.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return {viewport:[innerWidth,innerHeight],visible:!b.hidden&&getComputedStyle(b).display!=='none',within:r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,clickable:hit===b||b.contains(hit),rect:{x:r.x,y:r.y,width:r.width,height:r.height}}})()`));
    }
    fs.writeFileSync(path.join(os.tmpdir(), "d2-stash-probe.png"), (await win.webContents.capturePage()).toPNG());
    await win.loadURL("https://d2survivors.lol/play/").catch(() => {}); await sleep(4000);
    const reload = await js(`JSON.parse(localStorage.getItem('d2-survivors/save/v1')).stashTabs`);
    const reloadMatches = JSON.stringify(reload) === JSON.stringify(out.final);
    await js(`document.querySelectorAll('button').forEach(b => { if (/hosted/i.test(b.textContent)) b.click() }); 1`); await sleep(12000);
    await js(`import(${JSON.stringify(pages + "d2edit.js?v=reload-")}+Date.now()).then(()=>true)`);
    const gameReload = await js(`(async()=>{for(let i=0;i<60&&!window.__d2autobot?.game;i++){document.body.dispatchEvent(new KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true}));await new Promise(r=>setTimeout(r,400))}return window.__d2autobot?.game?.save?.stashTabs||null})()`);
    const positions = obj => Object.fromEntries(Object.entries(obj || {}).map(([k, list]) => [k, list.map(item => [item.id, item.at])]));
    const gameReloadMatches = JSON.stringify(positions(gameReload)) === JSON.stringify(positions(out.final));
    delete out.final;
    const ok = out.camp.state === "camp" && out.camp.ready && out.collectionHidden && out.holdingDisabled && out.holdingUnchanged && out.store.visible && out.store.unchangedOnRepeat && out.store.open && !out.alerts.length && reloadMatches && gameReloadMatches && out.checks.every(x => x.visible && x.changed && x.sameItems && x.othersSame && x.rendered && !x.overlaps.length && x.stillOpen && x.stored) && layouts.every(x => x.visible && x.within && x.clickable);
    console.log(JSON.stringify({ ...out, layouts, reloadMatches, gameReloadMatches, ok }));
    if (!ok) throw Error("倉庫整理實機驗證未通過");
    clearTimeout(timeout); app.exit(0);
  } catch (e) { console.error(e.stack); clearTimeout(timeout); app.exit(1); }
});
