// 在官方網域的隔離瀏覽器中呼叫原版判斷函式；只加測試匯出，不修改判斷邏輯。
const { app, BrowserWindow, session, net } = require('electron');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const assets = path.join(root, 'game-bundles/20261105.3/assets');
const exportsByFile = {
  'ui-C7B1Ywhs.js': ['ie'],
  'saveTransfer-BTsCILil.js': ['OD', 'kD', 'DD', 'xj', 'sl', 'll', 'ul', 'uj', 'dj', 'TC', 'wC', '$c', 'il', 'nS'],
  'itemArt-BPHOVK4V.js': ['jre', 'Sl'],
};
const result = { url: 'https://d2survivors.lol/play/', kind: '官方函式隔離呼叫，非完整遊玩流程', hashes: {}, checks: [], blockedUploads: 0 };
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'd2-detection-rules-'));
app.setPath('userData', profile);
let win, done = false;
const finish = code => {
  if (done) return;
  done = true;
  const output = path.join(root, 'backups/detection-rules-20261112.json');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(result, null, 2), 'utf8');
  console.log(JSON.stringify({ output, count: result.checks.length, failures: result.checks.filter(x => !x.pass), error: result.error, hashes: result.hashes }));
  if (win && !win.isDestroyed()) win.destroy();
  app.exit(code);
};
setTimeout(() => { result.error = '驗證超過 100 秒'; finish(1); }, 100000).unref();
app.whenReady().then(async () => {
  session.defaultSession.protocol.handle('https', async request => {
    const url = new URL(request.url), file = path.posix.basename(url.pathname);
    if (url.hostname === 'd2survivors.lol' && url.pathname.startsWith('/api/leaderboard') && request.method !== 'GET') {
      result.blockedUploads++;
      return new Response('{}', { status: 403 });
    }
    const response = await net.fetch(request, { bypassCustomProtocolHandlers: true });
    if (url.hostname !== 'd2survivors.lol' || !exportsByFile[file]) return response;
    const bytes = Buffer.from(await response.arrayBuffer());
    const matches = bytes.equals(fs.readFileSync(path.join(assets, file)));
    result.hashes[file] = { status: response.status, matches, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
    if (!response.ok || !matches) throw Error('官方檔案已變動：' + file);
    const extra = '\nexport {' + exportsByFile[file].map((name, i) => name + ' as probe' + i).join(',') + '};';
    return new Response(bytes.toString('utf8') + extra, { headers: { 'content-type': 'text/javascript; charset=utf-8' } });
  });
  win = new BrowserWindow({ show: false, webPreferences: { backgroundThrottling: false } });
  await win.loadURL(result.url).catch(error => {
    if (error.code !== 'ERR_ABORTED') throw error;
  });
  // 初次造訪會轉至官方 setup；等轉址完成後，在同網域呼叫原版模組。
  await new Promise(resolve => setTimeout(resolve, 4000));
  result.checks = await win.webContents.executeJavaScript(`(async () => {
    const u = await import('/assets/ui-C7B1Ywhs.js');
    const s = await import('/assets/saveTransfer-BTsCILil.js');
    const a = await import('/assets/itemArt-BPHOVK4V.js');
    const [OD,kD,DD,fresh,sl,ll,ul,mark,recheck,gate,send,itemFault] = Array.from({length:12}, (_,i)=>s['probe'+i]);
    const checks=[], check=(name,actual,expected)=>checks.push({name,actual,expected,pass:JSON.stringify(actual)===JSON.stringify(expected)});
    check('沒有書籤與替換 API',u.probe0({}),null);
    check('書籤標記',u.probe0({__D2ZH:true,__D2ZH_VERSION:'probe'}),'the d2_zh.js bookmarklet probe');
    check('替換 WeakMap.get',u.probe0({WeakMap:{prototype:{get(){}}}}),'replaced WeakMap.get');
    const keys=['Storage','CanvasRenderingContext2D','EventTarget'];
    for(const [owner,method,label] of [['Storage','setItem','Storage.setItem'],['CanvasRenderingContext2D','drawImage','drawImage'],['CanvasRenderingContext2D','putImageData','putImageData'],['EventTarget','addEventListener','addEventListener']])
      check('替換 '+label,u.probe0({[owner]:{prototype:{[method](){}}}}),'replaced '+label);
    check('替換 requestAnimationFrame',u.probe0({requestAnimationFrame(){}}),'replaced requestAnimationFrame');
    check('替換像素比 getter',u.probe0(Object.defineProperty({},'devicePixelRatio',{get(){return 1}})),'replaced devicePixelRatio');
    const clean=fresh(),sealed=JSON.parse(DD(clean));
    check('原版新存檔檢查',sl(clean),[]);
    check('原版封印',OD(sealed),'sealed');
    check('原版封印可信',kD(sealed),false);
    check('金錢改動破壞封印',OD({...sealed,gold:sealed.gold+1}),'broken');
    check('版本 11 缺封印',kD({version:11}),true);
    check('版本 10 缺封印',kD({version:10}),false);
    check('版本 10 錯誤封印',kD({version:10,seal:'wrong'}),true);
    check('金錢上限接受',sl({...clean,gold:1e10}),[]);
    check('金錢超過上限',sl({...clean,gold:1e10+1}).length,1);
    check('負金錢在 sl 未擋',sl({...clean,gold:-1}),[]);
    check('非有限金錢',sl({...clean,gold:Infinity}).length,1);
    check('任務物品略過',itemFault({type:'quest'}),null);
    check('未解鎖翅膀卻穿戴',sl({...clean,light:{worn:{amazon:1}}}).length,1);
    check('翅膀碎片不足',sl({...clean,light:{wings:true,shards:9}}).length,1);
    check('翅膀碎片門檻',sl({...clean,light:{wings:true,shards:10}}),[]);
    const marked=fresh();mark(marked,['probe']);
    check('標記 edited',marked.leaderboard.edited,true);
    check('標記 rechecked',marked.leaderboard.rechecked,true);
    check('一般模式合法資料重新檢查',recheck(marked),true);
    check('重新檢查解除 edited',!!marked.leaderboard.edited,false);
    const hc={...fresh(),mode:'hc',leaderboard:{edited:true}};
    check('專家模式不自動解除',recheck(hc),false);
    const run={counts:true,tainted:false,harness:false},page={search:'',dev:false,webdriver:false};
    check('正常發送門檻',gate(run,page),true);
    for(const prop of ['tainted','harness'])check(prop+' 阻擋',gate({...run,[prop]:true},page),false);
    check('counts 關閉',gate({...run,counts:false},page),false);
    check('webdriver 阻擋',gate(run,{...page,webdriver:true}),false);
    check('關閉上傳',send(run,{leaderboard:{off:true}},page),false);
    check('edited 阻擋上傳',send(run,{leaderboard:{edited:true}},page),false);
    check('正常網址資格',a.probe0('',false,false),true);
    check('開發模式網址資格',a.probe0('',true,false),false);
    for(const key of a.probe1){check('網址存在 '+key,a.probe0('?'+key+'=false',false,false),false);check('發送拒絕 '+key,gate(run,{...page,search:'?'+key+'=false'}),false);}
    check('非清單參數',gate(run,{...page,search:'?language=zh-TW'}),true);
    return checks;
  })()`);
  finish(result.checks.every(x => x.pass) ? 0 : 1);
}).catch(error => { result.error = String(error.stack || error); finish(1); });
