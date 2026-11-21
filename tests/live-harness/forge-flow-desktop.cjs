// 桌面版自動淬鍊實際流程測試：用存檔裡有裝備的英雄（預設法師），以虛擬精華（cheat.forgeMax）把裝備放上鐵砧自動淬鍊。
// 環境變數：H_OUT、H_SEED（必填）、H_CLASS（預設 sorceress）。純 node 執行。
const fs = require("fs"), path = require("path"), zlib = require("zlib");
const ROOT = path.resolve(__dirname, "..", "..");
const { GameLink } = require(path.join(ROOT, "editor", "game-link.js"));
if (process.env.H_REAL_SERVER !== "1") process.env.D2S_LEADERBOARD_URL ||= "http://127.0.0.1:9";
process.env.D2S_REPORT_URL ||= "http://127.0.0.1:9/api/report";
const OUT = process.env.H_OUT || path.join(__dirname, "out-forge"), CLS = process.env.H_CLASS || "sorceress";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (!process.env.H_SEED) { console.error("需要 H_SEED（D2S1 或 JSON 存檔）"); process.exit(2); }
const t = fs.readFileSync(process.env.H_SEED, "utf8").trim();
const seed = t.startsWith("D2S1:") ? zlib.inflateSync(Buffer.from(t.slice(5).replace(/-/g, "+").replace(/_/g, "/"), "base64")).toString("utf8") : t;
(async () => {
  fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(path.join(OUT, "profile"), { recursive: true });
  const real = path.join(process.env.APPDATA, "D2 Survivors"), prof = path.join(OUT, "profile");
  fs.symlinkSync(path.join(real, "d2"), path.join(prof, "d2"), "junction");
  for (const f of ["desktop.json", "Preferences", "Local State"]) if (fs.existsSync(path.join(real, f))) fs.copyFileSync(path.join(real, f), path.join(prof, f));
  const gl = new GameLink(); let ok = false, detail = "";
  try {
    await gl.launch({ userDataDir: prof }); await sleep(2500);
    await gl.evaluate(`localStorage.setItem("d2-survivors/save/v1", ${JSON.stringify(seed)}); location.reload(); 1`); await sleep(8000);
    for (let i = 0; i < 30 && !(await gl.exposeGame().catch(() => false)); i++) await sleep(1000);
    await gl.startHelper({ root: ROOT, build: "2026.1105.3", switches: { enabled: false, progressEnabled: false, cheat: false }, waitMs: 30000 });
    await gl.evaluate(`(async()=>{const s=ms=>new Promise(r=>setTimeout(r,ms));const g=window.__d2autobotGame;
      for(let i=0;i<40&&g.state!=="select"&&g.state!=="playing"&&g.state!=="camp";i++){document.body.dispatchEvent(new KeyboardEvent("keydown",{key:" ",code:"Space",bubbles:true}));await s(500);}
      if(g.state==="select"){ if(g.frontend?.open&&!g.plainSelect().onPick){g.frontend.actions.play();await s(3000);} if(!g.plainSelect().onPick){g.chooseClass();await s(1500);}
        const p=g.plainSelect(),i=p.cards.findIndex(c=>c.dataset?.class===${JSON.stringify(CLS)});p.select(i);await s(300);p.confirm(false);await s(1000);}
      for(let i=0;i<60&&g.state==="loading";i++)await s(500); try{g.enterCamp()}catch(e){} await s(3500); return g.state})()`);
    await gl.helperSet("cheat.enabled", true); await gl.helperSet("cheat.forgeMax", true); await sleep(1500);
    const r = JSON.parse(await gl.evaluate(`(async()=>{
      const g=window.__d2autobotGame,u=window.__d2autoforgeUI,cls=g.kit&&g.kit.id; if(!u||!cls) return JSON.stringify({err:"no ui/cls"});
      g.forgeMode="temper"; try{ g.openCampTrade("forge",true) }catch(e){} await new Promise(r=>setTimeout(r,1500));
      const inv=[...((g.save.inventoryByClass&&g.save.inventoryByClass[cls])||[]),...((g.save.stashTabs&&g.save.stashTabs[cls])||[])];
      let pick=null,lines=[]; for(const it of inv){ if(!it||!it.id||it.type==="essence") continue; let l=[]; try{ l=u.lines(it.id) }catch(e){} if(l.length){pick=it;lines=l;break;} }
      if(!pick) return JSON.stringify({skipped:"無可淬鍊裝備",inv:inv.length,cls});
      const before=u.state.log.length; u.start([{id:pick.id,targets:{[lines[0].key]:1}}],cls);
      await new Promise(r=>setTimeout(r,15000));
      const out={cls,item:pick.name||pick.base,line:lines[0].text,msg:u.state.msg,log:u.state.log.slice(-5),grew:u.state.log.length>before};
      u.stop(); return JSON.stringify(out); })()`));
    detail = JSON.stringify(r).slice(0, 500); ok = !r.err && !r.skipped && r.grew === true;
    const rejected = /拒絕|異常|locked|錯誤|失敗/.test(String(r.msg || ""));
    console.log(ok ? "✔ 流程有執行（迴圈動作並留下紀錄）" + (rejected ? "；⚠ 但遊戲或伺服器拒絕了淬鍊，不代表淬鍊成功" : "") : "✘ 自動淬鍊流程未執行", detail);
  } catch (e) { console.log("✘ 例外", e.message); }
  await gl.close().catch(() => {}); process.exit(ok ? 0 : 1);
})();
