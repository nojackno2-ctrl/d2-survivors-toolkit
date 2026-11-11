// 在官方遊戲及隔離設定檔比較技能配置與錯誤的歷史紀錄。
const fs = require('fs'), path = require('path'), os = require('os'), zlib = require('zlib');
const root = path.resolve(__dirname, '../..');
const source = process.env.H_SOURCE || 'C:/Users/nojac/.claude/uploads/145514bd-c663-4e40-8f23-e9287d00ab0f/b8157ea2-D2-Survivors-save-2026-11-04-2240.txt';
const sleep = ms => new Promise(r => setTimeout(r, ms));
if (!process.argv.includes('--worker')) {
  const { spawnSync } = require('child_process');
  const dir = process.env.H_OUT || fs.mkdtempSync(path.join(os.tmpdir(), 'd2-build-edit-'));
  fs.mkdirSync(dir, { recursive: true });
  const text = fs.readFileSync(source, 'utf8').trim();
  if (!text.startsWith('D2S1:')) throw Error('存檔前綴錯誤');
  const original = JSON.parse(zlib.inflateSync(Buffer.from(text.slice(5), 'base64url')));
  fs.writeFileSync(path.join(dir, 'decoded.json'), JSON.stringify(original));
  const skills = ['fireBolt','iceBolt','chargedBolt','nova','blaze','fireWall','frostNova','iceBlast','shiverArmor','inferno'].map(id => ({id, level:['fireWall','shiverArmor'].includes(id) ? 1 : 8, cooldown:0}));
  const asset = fs.readFileSync(path.join(root, 'game-bundles/20261105.3/assets', fs.readdirSync(path.join(root, 'game-bundles/20261105.3/assets')).find(x => /^itemArt-.*\.js$/.test(x))), 'utf8');
  for (const s of skills) if (!new RegExp('(?:skills:\\{|,)' + s.id + ':\\{name:[^}]{0,180}maxLevel:' + s.level + '(?:,|})').test(asset)) throw Error('無法確認技能與等級：' + s.id);
  const edited = JSON.parse(JSON.stringify(original));
  // 與修改器相同：進行中的冒險（run）與保留的角色（kept）一併改寫，遊戲接續時用的是 run
  const builds = ['kept', 'run'].map(k => edited.heroes.sorceress[k]?.build).filter(Boolean);
  for (const b of builds) { b.skills = skills.map(s => ({...s})); delete b.passives.enchant; b.passives.frw = 5; b.passives.telekinesis = 5; b.slots = 10; }
  const wrong = JSON.parse(JSON.stringify(edited));
  for (const b of builds) {
    b.history = b.history.filter(x => !x.startsWith('passive:'));
    for (const [id, level] of Object.entries(b.passives)) for (let i = 0; i < level; i++) b.history.push('passive:' + id);
  }
  const exe = path.join(root, 'editor/node_modules/electron/dist/electron.exe');
  for (const [name, save] of (process.env.H_CONTROL ? [['control', original]] : [['correct', edited], ['mismatched-history', wrong]])) {
    const seed = path.join(dir, name + '-seed.json'), output = path.join(dir, name + '-result.json');
    fs.writeFileSync(seed, JSON.stringify(save));
    const env = {...process.env, H_SEED:seed, H_OUT:dir, H_CASE:name}; delete env.ELECTRON_RUN_AS_NODE;
    const p = spawnSync(exe, [__filename, '--worker'], {env, encoding:'utf8', timeout:180000, windowsHide:true});
    console.log(JSON.stringify({case:name, exit:p.status, signal:p.signal, error:p.error?.message, stdout:p.stdout, stderr:p.stderr, resultFile:fs.existsSync(output) ? output : null}));
  }
  console.log('輸出目錄：' + dir);
} else {
  const {app, BrowserWindow, session, net} = require('electron');
  const dir = process.env.H_OUT, name = process.env.H_CASE, pages = 'https://nojackno2-ctrl.github.io/d2-survivors-toolkit/';
  const seed = fs.readFileSync(process.env.H_SEED, 'utf8');
  const log = [], result = {case:name, url:'https://d2survivors.lol/play/', messages:log};
  app.setPath('userData', path.join(dir, name + '-profile'));
  const finish = () => { fs.writeFileSync(path.join(dir, name + '-result.json'), JSON.stringify(result, null, 2)); app.exit(); };
  setTimeout(() => { result.timeout = true; finish(); }, 165000).unref();
  app.whenReady().then(async () => {
    session.defaultSession.protocol.handle('https', req => {
      if (!req.url.startsWith(pages)) return net.fetch(req, {bypassCustomProtocolHandlers:true});
      const rel = decodeURIComponent(new URL(req.url).pathname.slice('/d2-survivors-toolkit/'.length));
      const file = path.resolve(root, rel);
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return new Response('not found', {status:404});
      const mime = {'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.html':'text/html','.css':'text/css'};
      return new Response(fs.readFileSync(file), {headers:{'content-type':mime[path.extname(file)] || 'application/octet-stream','access-control-allow-origin':'*'}});
    });
    const win = new BrowserWindow({show:false, webPreferences:{webSecurity:false, backgroundThrottling:false}});
    win.webContents.on('console-message', (e, level, message) => { if (level >= 2 || /could not be read/i.test(message)) log.push({type:'console', message}); });
    win.webContents.on('did-fail-load', (e, code, description, url) => log.push({type:'load', code, description, url}));
    win.webContents.on('dialog', (e, type, message, defaultId, callback) => { log.push({type, message}); callback(type === 'confirm'); });
    await win.loadURL(result.url).catch(e => log.push({type:'navigation', message:String(e)}));
    await sleep(4000);
    await win.webContents.executeJavaScript(`localStorage.setItem('d2-survivors/save/v1', ${JSON.stringify(seed)});`);
    await win.loadURL(result.url).catch(e => log.push({type:'navigation', message:String(e)}));
    await sleep(4000);
    await win.webContents.executeJavaScript(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/hosted/i.test(x.textContent));if(b)b.click()})()`);
    await sleep(12000);
    result.beforeImport = await win.webContents.executeJavaScript(`({url:location.href, text:document.body.innerText.slice(0,12000), save:JSON.parse(localStorage.getItem('d2-survivors/save/v1')||'null')?.heroes?.sorceress?.kept?.build})`);
    try { await win.webContents.executeJavaScript(`import(${JSON.stringify(pages + 'd2edit.js?v=' + Date.now())}).then(()=>true)`); } catch(e) { result.importError = String(e); }
    await sleep(6000);
    result.observed = await win.webContents.executeJavaScript(`(async()=>{
      const wait=ms=>new Promise(r=>setTimeout(r,ms));
      const wanted=JSON.parse(${JSON.stringify(seed)}).heroes.sorceress.kept.build;
      const out={text:document.body.innerText.slice(0,12000), saved:JSON.parse(localStorage.getItem('d2-survivors/save/v1')||'null')?.heroes?.sorceress?.kept?.build};
      try {out.saveFaults=await window.__d2editBackend?.engine('saveFaults',JSON.parse(${JSON.stringify(seed)}));}catch(e){out.saveFaultsError=String(e)}
      for(let i=0;i<80&&!window.__d2autobot?.game;i++){document.body.dispatchEvent(new KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true}));await wait(500)}
      const g=window.__d2autobot?.game;if(!g){out.error='無法取得遊戲物件';return out}
      out.gameSaved=g.save?.heroes?.sorceress?.kept?.build;
      try {if(g.state==='select'){if(g.frontend?.open&&!g.plainSelect().onPick){g.frontend.actions.play();await wait(3000)}if(!g.plainSelect().onPick){g.chooseClass();await wait(1500)}const s=g.plainSelect(),i=s.cards.findIndex(c=>c.dataset?.class==='sorceress');out.classIndex=i;if(i>=0){s.select(i);await wait(300);s.confirm(false)}}}catch(e){out.continueError=String(e.stack||e)}
      for(let i=0;i<40&&!g.world?.player;i++)await wait(500);
      out.state=g.state;out.kit=g.kit?.id;out.textAfter=document.body.innerText.slice(0,12000);
      const p=g.world?.player;out.player=p?{keys:Object.keys(p),skills:p.skills,passives:p.passives,skillLevels:p.skillLevels,passiveLevels:p.passiveLevels,build:p.build}:null;
      out.worldBuild=g.world?.build;out.gameBuild=g.build?{skills:g.build.skills,passives:g.build.passives}:null;out.expected={skills:wanted.skills,passives:wanted.passives};
      return JSON.parse(JSON.stringify(out,(k,v)=>typeof v==='function'?undefined:v));
    })()`);
  }).catch(e => {result.error=String(e.stack||e);}).finally(finish);
}
