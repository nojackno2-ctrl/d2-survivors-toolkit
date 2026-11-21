// 桌面版實機測試框架（取代網頁版 main.js／boot.js）：以工具包的 GameLink 啟動官方桌面遊戲，
// 隔離 userData（不碰使用者真實存檔），用 CDP 讀取狀態、模擬輸入，並注入本機 helper/input.js、helper/autobot.js。
// 環境變數：H_OUT 輸出資料夾、H_CLASS 職業、H_SEED 存檔（D2S1 文字或解碼後 JSON）、H_EXE 遊戲執行檔、
//   H_SETTINGS 輔助器設定 JSON、H_NOBOT=1 不載入輔助器、H_SECONDS 執行秒數（預設 120）。
// 用法：node tests/live-harness/desktop.cjs   （子行程不可帶 ELECTRON_RUN_AS_NODE）
const fs = require("fs"), path = require("path"), zlib = require("zlib");
const { GameLink } = require(path.join(__dirname, "..", "..", "editor", "game-link.js"));
const ROOT = path.resolve(__dirname, "..", "..");
const OUT = process.env.H_OUT || path.join(__dirname, "out-desktop");
const CLS = process.env.H_CLASS || "barbarian";
// 測試隔離：排行榜／回報目的地指到不通的本機位址，避免測試局上傳到官方（僅測試用）
process.env.D2S_LEADERBOARD_URL ||= "http://127.0.0.1:9"; process.env.D2S_REPORT_URL ||= "http://127.0.0.1:9/api/report";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => fs.appendFileSync(path.join(OUT, "log.txt"), new Date().toISOString().slice(11, 19) + " " + a.join(" ") + "\n");

function loadSeed(p) {
  if (!p) return null;
  if (!fs.existsSync(p)) { console.error("找不到 H_SEED 指定的檔案：" + p); process.exit(2); }
  const t = fs.readFileSync(p, "utf8").trim();
  if (!t.startsWith("D2S1:")) return t;
  return zlib.inflateSync(Buffer.from(t.slice(5).replace(/-/g, "+").replace(/_/g, "/"), "base64")).toString("utf8");
}

function prepareProfile() {
  const real = path.join(process.env.APPDATA, "D2 Survivors"), prof = path.join(OUT, "profile");
  fs.mkdirSync(prof, { recursive: true });
  // 遊戲素材（約 2.4GB）以目錄連結共用，唯讀使用；其餘（localStorage、設定）都是獨立的
  const d2 = path.join(prof, "d2");
  if (!fs.existsSync(d2)) fs.symlinkSync(path.join(real, "d2"), d2, "junction");
  for (const f of ["desktop.json", "Preferences", "Local State"]) if (!fs.existsSync(path.join(prof, f)) && fs.existsSync(path.join(real, f))) fs.copyFileSync(path.join(real, f), path.join(prof, f));
  return prof;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "pid"), String(process.pid));
  const seed = loadSeed(process.env.H_SEED);
  const gl = new GameLink();
  const info = await gl.launch({ exePath: process.env.H_EXE || undefined, userDataDir: prepareProfile() });
  log("launched", JSON.stringify(info));
  const seededFlag = path.join(OUT, "seeded");
  if (seed && !fs.existsSync(seededFlag)) {
    await sleep(2500);
    await gl.evaluate(`localStorage.setItem("d2-survivors/save/v1", ${JSON.stringify(seed)}); 1`);
    fs.writeFileSync(seededFlag, "1"); log("seeded");
  }
  if (process.env.H_LANG) await gl.evaluate(`localStorage.setItem("d2s:lang", ${JSON.stringify(process.env.H_LANG)}); 1`);
  if (process.env.H_SETTINGS) await gl.evaluate(`localStorage.setItem("d2autobot:settings", ${JSON.stringify(process.env.H_SETTINGS)}); 1`);
  await gl.evaluate("location.reload(); 1"); await sleep(8000);
  await gl.enableInputBinding();
  for (let i = 0; i < 30 && !(await gl.exposeGame().catch(() => false)); i++) await sleep(1000);
  log("game exposed", await gl.evaluate("!!window.__d2autobotGame"));
  // 進入遊戲：沿用舊 boot.js 的原版流程（測試建檔用，產品流程不呼叫這些方法）
  const enter = `(async()=>{const sleep=ms=>new Promise(r=>setTimeout(r,ms));const g=window.__d2autobotGame;
    for(let i=0;i<40&&g.state!=="select"&&g.state!=="playing"&&g.state!=="camp";i++){document.body.dispatchEvent(new KeyboardEvent("keydown",{key:" ",code:"Space",bubbles:true}));await sleep(500);}
    if(g.state==="select"){ if(g.frontend?.open && !g.plainSelect().onPick){g.frontend.actions.play();await sleep(3000);} if(!g.plainSelect().onPick){g.chooseClass();await sleep(1500);}
      const s=g.plainSelect(),i=s.cards.findIndex(c=>c.dataset?.class===${JSON.stringify(CLS)}); s.select(i);await sleep(300);s.confirm(false);await sleep(1000);}
    return g.state;})()`;
  log("enter", await gl.evaluate(enter));
  if (!process.env.H_NOBOT) {
    const sw = JSON.stringify({ enabled: true, progressEnabled: true, cheat: false, ...(process.env.H_SWITCHES ? JSON.parse(process.env.H_SWITCHES) : {}) });
    await gl.injectScript(`window.__d2autobotSwitches=${sw};window.__d2gameBuild=${JSON.stringify(process.env.H_BUILD || "2026.1105.3")};`);
    const HD = process.env.H_HELPER_DIR || path.join(ROOT, "helper"); // H_HELPER_DIR 指向舊版輔助器時只載入該資料夾內存在的檔案（A/B 比較用）
    for (const f of ["input.js", "hooks.js", "autobot.js"]) if (fs.existsSync(path.join(HD, f))) await gl.injectScript(fs.readFileSync(path.join(HD, f), "utf8"));
    log("helper injected");
  }
  const end = Date.now() + Number(process.env.H_SECONDS || 120) * 1000;
  const census = new Map(); // H_CENSUS=1：統計世界／HUD 內出現過的文字，找出仍為英文的字串
  const CENSUS_JS = `(g)=>{if(!window.__census){window.__census=new Map();const seen=new Set();let found=null;const walk=(o,d)=>{if(found||!o||typeof o!=="object"||d>6||seen.has(o))return;seen.add(o);let adv;try{adv=o.advanceOf}catch{}if(typeof adv==="function"&&typeof o.measure==="function"){found=o;return;}let ks;try{ks=Object.keys(o).slice(0,80)}catch{return}for(const k of ks){let v;try{v=o[k]}catch{continue}if(v&&typeof v==="object")walk(v,d+1);}};walk(g,0);if(!found)return ["__no_font_instance__"];const P=Object.getPrototypeOf(found);window.__censusInstalled=true;for(const name of ["measure","wrapLines"]){const orig=P[name];if(typeof orig!=="function")continue;P[name]=function(e,...r){try{if(typeof e==="string")window.__census.set(e,(window.__census.get(e)||0)+1)}catch{}return orig.call(this,e,...r)}}}const out=[...window.__census.keys()];window.__census.clear();return out;}`;
  let n = 0, deaths = 0, lastState = "", minHp = 1, hpSum = 0, hpN = 0;
  while (Date.now() < end && gl.running) {
    try {
      const st = await gl.readSnapshot(`(g)=>{const w=g.world,p=w&&w.player;return {state:g.state,cls:g.kit&&g.kit.id,level:p&&p.level,hp:p?Math.round(p.life)+"/"+Math.round(p.maxLife):null,x:p&&Math.round(p.x),y:p&&Math.round(p.y),enemies:w&&w.enemies&&w.enemies.length,diag:window.__d2autobot&&window.__d2autobot.diagnostics?window.__d2autobot.diagnostics():null}}`);
      if (st.state === "dead" && lastState !== "dead") deaths++; lastState = st.state; const hpf = st.hp ? Number(st.hp.split("/")[0]) / Number(st.hp.split("/")[1]) : null; if (hpf != null && st.state === "playing") { minHp = Math.min(minHp, hpf); hpSum += hpf; hpN++; }
      fs.writeFileSync(path.join(OUT, "status.json"), JSON.stringify({ t: new Date().toISOString(), deaths, minHpFrac: Number(minHp.toFixed(3)), avgHpFrac: hpN ? Number((hpSum / hpN).toFixed(3)) : null, samples: hpN, ...st }, null, 1));
      if (process.env.H_CENSUS) { try { for (const t of await gl.readSnapshot(CENSUS_JS)) census.set(t, (census.get(t) || 0) + 1); } catch {} }
      if (n++ % 3 === 0) { const r = await gl.send("Page.captureScreenshot", { format: "png" }); const buf = Buffer.from(r.data, "base64"); fs.writeFileSync(path.join(OUT, "shot.png"), buf); if (process.env.H_SHOTS) fs.writeFileSync(path.join(OUT, `shot-${String(n).padStart(4, "0")}.png`), buf); }
    } catch (e) { log("err", e.message); }
    await sleep(500);
  }
  log("end");
  if (process.env.H_CENSUS) fs.writeFileSync(path.join(OUT, "census.json"), JSON.stringify([...census.entries()].map(([t, c]) => ({ t, c })), null, 1));
  await gl.close();
  process.exit(0);
})().catch((e) => { try { log("FATAL", e.stack || e.message); } catch {} console.error(e); process.exit(1); });
