// 官方遊戲、隔離設定檔與本機修改器的技能配置實機驗證。
const fs = require('fs'), path = require('path'), os = require('os'), zlib = require('zlib');
const root = path.resolve(__dirname, '../..');
const source = 'C:/Users/nojac/.claude/uploads/145514bd-c663-4e40-8f23-e9287d00ab0f/b8157ea2-D2-Survivors-save-2026-11-04-2240.txt';
const sleep = ms => new Promise(r => setTimeout(r, ms));
if (!process.argv.includes('--worker')) {
  const { spawnSync } = require('child_process');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'd2-build-ui-'));
  const data = fs.readFileSync(source, 'utf8').trim();
  if (!data.startsWith('D2S1:')) throw Error('存檔前綴錯誤');
  fs.writeFileSync(path.join(dir, 'seed.json'), JSON.stringify(JSON.parse(zlib.inflateSync(Buffer.from(data.slice(5), 'base64url')))));
  const env = {...process.env, H_OUT:dir}; delete env.ELECTRON_RUN_AS_NODE;
  const exe = path.join(root, 'editor/node_modules/electron/dist/electron.exe');
  const p = spawnSync(exe, [__filename, '--worker'], {env, encoding:'utf8', timeout:240000, windowsHide:true});
  console.log(JSON.stringify({directory:dir, exit:p.status, error:p.error?.message, stdout:p.stdout, stderr:p.stderr}, null, 2));
} else {
  const {app, BrowserWindow, session, net, dialog} = require('electron');
  const dir = process.env.H_OUT, pages = 'https://nojackno2-ctrl.github.io/d2-survivors-toolkit/';
  const seed = fs.readFileSync(path.join(dir, 'seed.json'), 'utf8');
  const result = {url:'https://d2survivors.lol/play/', messages:[], checks:{}};
  app.setPath('userData', path.join(dir, 'profile'));
  let finished = false;
  function finish() { if (finished) return; finished=true; fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify(result, null, 2)); app.exit(); }
  setTimeout(() => { result.timeout=true; finish(); }, 225000).unref();
  app.whenReady().then(async () => {
    session.defaultSession.protocol.handle('https', req => {
      if (!req.url.startsWith(pages)) return net.fetch(req, {bypassCustomProtocolHandlers:true});
      const rel = decodeURIComponent(new URL(req.url).pathname.slice('/d2-survivors-toolkit/'.length)), file = path.resolve(root, rel);
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return new Response('not found', {status:404});
      const mime = {'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.html':'text/html','.css':'text/css'};
      let body=fs.readFileSync(file);
      if (process.env.H_DIAGNOSTIC && rel==='d2edit.js') body=Buffer.from(body.toString('utf8').replace('"skillModDefs", "itemModMax"','"skillModDefs", "buildDefs", "itemModMax"'));
      return new Response(body, {headers:{'content-type':(mime[path.extname(file)] || 'application/octet-stream')+'; charset=utf-8','access-control-allow-origin':'*','cache-control':'no-store'}});
    });
    const win = new BrowserWindow({width:1400,height:1000,show:false,webPreferences:{webSecurity:false,backgroundThrottling:false}});
    win.webContents.on('console-message', (e, level, message, line, sourceId) => { if (level >= 2) result.messages.push({phase:result.phase,level,message,line,source:sourceId}); });
    win.webContents.on('did-fail-load', (e, code, description, url) => result.messages.push({phase:result.phase,code,description,url}));
    dialog.showMessageBox = async (...args) => { result.messages.push({phase:result.phase,dialog:args.at(-1)}); return {response:0,checkboxChecked:false}; };
    const js = code => win.webContents.executeJavaScript(code);
    result.phase='control';
    await win.loadURL(result.url).catch(e=>result.messages.push({phase:result.phase,navigation:String(e)})); await sleep(4000);
    await js(`localStorage.setItem('d2-survivors/save/v1', ${JSON.stringify(seed)}); 1`);
    await win.loadURL(result.url).catch(e=>result.messages.push({phase:result.phase,navigation:String(e)})); await sleep(4000);
    await js(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/hosted/i.test(x.textContent));if(b)b.click()})()`); await sleep(12000);
    await js(`window.addEventListener('error',e=>console.error('捕獲堆疊',e.error?.stack||e.message));window.addEventListener('unhandledrejection',e=>console.error('未處理拒絕',e.reason?.stack||String(e.reason))); 1`);
    await js(`import(${JSON.stringify(pages+'d2edit.js?v='+Date.now())}).then(()=>true)`); await sleep(6000);
    result.backend = await js(`(async()=>{let defs;try{defs=await window.__d2editBackend?.engine('buildDefs',['sorceress','paladin'])}catch(e){defs={error:String(e.stack||e)}}return {game:!!window.__d2autobot?.game,backend:!!window.__d2editBackend,defs}})()`);
    result.before = await js(`JSON.parse(localStorage.getItem('d2-survivors/save/v1'))`);
    result.phase='editor';
    await js(`window.__d2editLauncher.click();setTimeout(()=>[...(window.__d2toolkitMenu?.children||[])].find(x=>x.textContent==='修改器'||x.textContent==='Editor')?.click(),300); 1`); await sleep(8000);
    const frame = win.webContents.mainFrame.framesInSubtree.find(f=>f.url.includes('editor.html'));
    if (!frame) throw Error('找不到修改器 iframe');
    const run = code => frame.executeJavaScript(`(async()=>{${code}})()`);
    result.frameUrl=frame.url;
    result.ui = await run(`document.querySelector('[data-page="hero"]').click(); await new Promise(r=>setTimeout(r,3000)); const box=document.querySelector('#buildBox'); return {text:box.innerText,html:box.innerHTML.slice(0,4000), sections:[...box.querySelectorAll('details')].map(d=>({title:d.querySelector('summary').innerText,keys:[...new Set([...d.querySelectorAll('[data-build]')].map(s=>s.dataset.build))]})), selects:[...box.querySelectorAll('select[data-build]')].map(s=>({key:s.dataset.build,kind:s.dataset.kind,value:s.value,level:s.closest('tr').querySelector('[data-build-lv]').value,options:[...s.options].map(o=>({value:o.value,text:o.textContent,disabled:o.disabled}))}))};`);
    await run(`document.querySelector('#buildBox details')?.setAttribute('open','');document.querySelector('#buildBox').scrollIntoView();return true;`); await sleep(500); fs.writeFileSync(path.join(dir,'before.png'),(await win.webContents.capturePage()).toPNG());
    result.edits = await run(`const wait=ms=>new Promise(r=>setTimeout(r,ms)); const get=(key,kind)=>[...document.querySelectorAll('select[data-build="'+key+'"][data-kind="'+kind+'"]')]; const edit=(s,v)=>{if(!s||![...s.options].some(o=>o.value===v&&!o.disabled)) throw Error('無法選擇 '+v);s.value=v;s.dispatchEvent(new Event('change',{bubbles:true}));return {value:s.value,level:s.closest('tr').querySelector('[data-build-lv]').value,max:s.closest('tr').querySelector('[data-build-lv]').options.length}}; const a=get('sorceress.run','skill'),p=get('sorceress.run','passive'),sa=get('paladin.kept','skill'),sp=get('paladin.kept','passive'); let out={}; out.first=edit(a[0],'fireBolt');out.fourth=edit(a[3],'nova');out.passive=edit(p.find(s=>s.value==='enchant'),'frw');out.empty=edit(a.find((s,i)=>i!==0&&i!==3&&s.value),''); const choose=s=>[...s.options].find(o=>o.value&&!o.disabled&&o.value!==s.value)?.value;out.paladinSkill=edit(sa[0],choose(sa[0]));out.paladinPassive=edit(sp[0],choose(sp[0])); document.querySelector('#buildBox details').open=true; await wait(500);document.querySelector('#buildBox').scrollIntoView();await wait(500); out.selected=[...document.querySelectorAll('select[data-build]')].map(s=>({key:s.dataset.build,kind:s.dataset.kind,value:s.value,level:Number(s.closest('tr').querySelector('[data-build-lv]').value)}));return out;`);
    await sleep(1000); fs.writeFileSync(path.join(dir,'build.png'),(await win.webContents.capturePage()).toPNG());
    result.phase='write';
    await run(`document.querySelector('#write').click(); return true;`); await sleep(10000);
    result.after = await js(`({storage:JSON.parse(localStorage.getItem('d2-survivors/save/v1')),game:window.__d2autobot?.game?.save||null})`);
    result.phase='reload'; await win.loadURL(result.url).catch(e=>result.messages.push({phase:result.phase,navigation:String(e)})); await sleep(12000);
    await js(`import(${JSON.stringify(pages+'d2edit.js?v=reload')}).then(()=>true)`); await sleep(6000);
    result.reload = await js(`(async()=>{const wait=ms=>new Promise(r=>setTimeout(r,ms));for(let i=0;i<50&&!window.__d2autobot?.game;i++){document.body.dispatchEvent(new KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true}));await wait(500)}const g=window.__d2autobot?.game;const out={storage:JSON.parse(localStorage.getItem('d2-survivors/save/v1')),gameSave:g?.save};if(!g){out.error='無法取得遊戲物件';return out}try{if(g.state==='select'){if(g.frontend?.open&&!g.plainSelect().onPick){g.frontend.actions.play();await wait(3000)}if(!g.plainSelect().onPick){g.chooseClass();await wait(1500)}const s=g.plainSelect(),i=s.cards.findIndex(c=>c.dataset?.class==='sorceress');out.classIndex=i;if(i>=0){s.select(i);await wait(300);s.confirm(false)}}for(let i=0;i<40&&!g.world?.player;i++)await wait(500);out.state=g.state;out.gameBuild=g.build}catch(e){out.error=String(e.stack||e)}return JSON.parse(JSON.stringify(out))})()`);
  }).catch(e=>{result.error=String(e.stack||e)}).finally(finish);
}
