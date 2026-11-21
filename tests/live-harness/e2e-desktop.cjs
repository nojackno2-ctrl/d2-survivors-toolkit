// 桌面版端到端自動測試（官方桌面遊戲＋隔離 userData，純 node 執行，不碰使用者真實存檔）：
//  1. 工具包啟動遊戲並以 CDP 連線、唯讀取得 Game（不包裝函式：tick／steer 與原版參照相同）
//  3. 受信任輸入：按鍵選卡、方向鍵移動
//  4. 輔助器注入（startHelper 流程）：自動戰鬥一段時間、等級上升、預設無例外掛接
// 用法：node tests/live-harness/e2e-desktop.cjs     環境變數：H_OUT、H_SEED（D2S1 或 JSON）、H_EXE、H_SECONDS（輔助器秒數，預設 60）
const fs = require("fs"), path = require("path"), zlib = require("zlib"), assert = require("assert");
const ROOT = path.resolve(__dirname, "..", "..");
const { GameLink } = require(path.join(ROOT, "editor", "game-link.js"));
const OUT = process.env.H_OUT || path.join(__dirname, "out-e2e");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 測試隔離：把遊戲的排行榜／回報目的地指到不通的本機位址，避免測試局上傳到官方（僅測試用，非產品功能）
process.env.D2S_LEADERBOARD_URL ||= "http://127.0.0.1:9"; process.env.D2S_REPORT_URL ||= "http://127.0.0.1:9/api/report";
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok: !!ok, detail }); console.log((ok ? "✔ " : "✘ ") + name + (detail ? "  " + detail : "")); };

function seedText() {
  const p = process.env.H_SEED; if (!p) return null;
  const t = fs.readFileSync(p, "utf8").trim();
  return t.startsWith("D2S1:") ? zlib.inflateSync(Buffer.from(t.slice(5).replace(/-/g, "+").replace(/_/g, "/"), "base64")).toString("utf8") : t;
}
function profile() {
  const real = path.join(process.env.APPDATA, "D2 Survivors"), prof = path.join(OUT, "profile");
  fs.mkdirSync(prof, { recursive: true });
  const d2 = path.join(prof, "d2"); if (!fs.existsSync(d2)) fs.symlinkSync(path.join(real, "d2"), d2, "junction");
  for (const f of ["desktop.json", "Preferences", "Local State"]) if (!fs.existsSync(path.join(prof, f)) && fs.existsSync(path.join(real, f))) fs.copyFileSync(path.join(real, f), path.join(prof, f));
  return prof;
}

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
  const gl = new GameLink();
  let failed = false;
  try {
    const info = await gl.launch({ exePath: process.env.H_EXE || undefined, userDataDir: profile() });
    check("啟動遊戲並以 CDP 連線", gl.attached && info.port > 0, `port ${info.port}`);
    await sleep(2500);
    const seed = seedText();
    if (seed) { await gl.evaluate(`localStorage.setItem("d2-survivors/save/v1", ${JSON.stringify(seed)}); location.reload(); 1`); await sleep(8000); }
    for (let i = 0; i < 30 && !(await gl.exposeGame().catch(() => false)); i++) await sleep(1000);
    check("唯讀取得 Game 實例", await gl.evaluate("!!window.__d2autobotGame"));

    // 3. 輸入
    await gl.evaluate(`(async()=>{const s=ms=>new Promise(r=>setTimeout(r,ms));const g=window.__d2autobotGame;
      for(let i=0;i<40&&g.state!=="select"&&g.state!=="playing";i++){document.body.dispatchEvent(new KeyboardEvent("keydown",{key:" ",code:"Space",bubbles:true}));await s(500);}
      if(g.state==="select"){ if(g.frontend?.open&&!g.plainSelect().onPick){g.frontend.actions.play();await s(3000);} if(!g.plainSelect().onPick){g.chooseClass();await s(1500);}
        const p=g.plainSelect(),i=p.cards.findIndex(c=>c.dataset?.class==="barbarian");p.select(i);await s(300);p.confirm(false);await s(1000);}return g.state})()`);
    let s0 = null;
    for (let i = 0; i < 80; i++) { s0 = await gl.readSnapshot("(g)=>g.state"); if (s0 === "levelUp" || s0 === "playing") break; await sleep(500); }
    console.log("  進場後狀態:", s0);
    for (let i = 0; i < 6 && (await gl.readSnapshot("(g)=>g.state")) === "levelUp"; i++) { await sleep(1500); await gl.key("Digit" + (1 + (i % 3)), "press", 80); await sleep(800); }
    check("按鍵選升級卡後進入戰鬥", (await gl.readSnapshot("(g)=>g.state")) === "playing", "初始 " + s0);
    const x0 = await gl.readSnapshot("(g)=>g.world.player.x");
    await gl.key("ArrowRight", "down"); await sleep(1200); await gl.key("ArrowRight", "up"); await sleep(300);
    const x1 = await gl.readSnapshot("(g)=>g.world.player.x");
    check("方向鍵按住可移動角色", x1 - x0 > 100, `Δx=${Math.round(x1 - x0)}`);

    // 4. 輔助器
    const h0 = await gl.readSnapshot("(g)=>({t:String(Object.getPrototypeOf(g).tick).length,s:String(Object.getPrototypeOf(g).steer).length})");
    const r = await gl.startHelper({ root: ROOT, build: "2026.1105.3", switches: { enabled: true, progressEnabled: true, cheat: false }, waitMs: 20000 });
    check("startHelper 注入成功", gl.status().helperInjected !== false, JSON.stringify(r || {}).slice(0, 80));
    const secs = Number(process.env.H_SECONDS || 60);
    await sleep(secs * 1000);
    const d = await gl.readSnapshot("(g)=>({lv:g.world&&g.world.player&&g.world.player.level,st:g.state,diag:window.__d2autobot&&window.__d2autobot.diagnostics()})");
    check("輔助器自動戰鬥且等級上升", d && d.lv >= 3, `Lv${d && d.lv} 狀態 ${d && d.st}`);
    check("輔助器輸入為受信任事件", d?.diag?.input?.trusted === true && d.diag.input.sent > 50, `sent=${d?.diag?.input?.sent}`);
    check("預設無例外掛接（開關全關）", Array.isArray(d?.diag?.hooks) && d.diag.hooks.every((n) => ["levelPool", "camp"].includes(n)), JSON.stringify(d?.diag?.hooks));
    const h1 = await gl.readSnapshot("(g)=>({t:String(Object.getPrototypeOf(g).tick).length,s:String(Object.getPrototypeOf(g).steer).length})");
    check("Game.prototype.tick／steer 與原版相同（未被包裝）", JSON.stringify(h0) === JSON.stringify(h1), JSON.stringify(h1));
    // 4b. 使用者核可的例外掛接：開關開啟才安裝、關閉即還原到原參照（真實遊戲）
    await gl.evaluate("(()=>{const g=window.__d2autobotGame;const P=Object.getPrototypeOf(g);window.__hk0={tick:P.tick,steer:P.steer,sort:Array.prototype.sort,push:Array.prototype.push};return 1})()");
    for (const [p, v] of [["cheat.enabled", true], ["cheat.invincible", true], ["cheat.pauseStageTime", true], ["cheat.maxXp", true]]) await gl.helperSet(p, v);
    await sleep(2500);
    const on = await gl.evaluate(`(()=>{const g=window.__d2autobotGame,P=Object.getPrototypeOf(g),a=window.__d2autobot,d=a.diagnostics(),pl=g.world&&g.world.player,desc=pl&&Object.getOwnPropertyDescriptor(pl,"life");return JSON.stringify({hooks:d.hooks,tickWrapped:P.tick!==window.__hk0.tick,steerSame:P.steer===window.__hk0.steer,lifeGuard:!!(desc&&desc.get)})})()`);
    const onJ = JSON.parse(on);
    check("例外開關開啟後才安裝掛接（無敵／停止關卡時間／經驗倍率）", ["invincible", "stageTime", "xp"].every((n) => onJ.hooks.includes(n)) && onJ.tickWrapped && onJ.lifeGuard && onJ.steerSame, on);
    // 作弊效果（真實遊戲）：無敵開啟時，嘗試扣血不生效；經驗倍率包住 gainXp 後仍可正常呼叫
    const eff = JSON.parse(await gl.evaluate(`(()=>{const g=window.__d2autobotGame,p=g.world.player,before=p.life;p.life=before-40;const afterHit=p.life;return JSON.stringify({before,afterHit})})()`));
    check("無敵實效：嘗試扣血 40 點後生命不變", eff.afterHit >= eff.before, JSON.stringify(eff));
    const q = await gl.readSnapshot("(g)=>{const d=window.__d2autobot.diagnostics();return d.quests?{total:d.quests.total,line:String(d.quests.line).slice(0,40)}:null}");
    check("任務模式：任務狀態可讀（總數>0）", q && q.total > 0, JSON.stringify(q));
    check("自動淬鍊面板腳本已載入（__d2autoforgeUI）", await gl.evaluate("typeof window.__d2autoforgeUI!==\"undefined\"||!!document.getElementById(\"d2autoforge-panel\")||typeof window.__d2autoforge!==\"undefined\""), "");
    for (const p of ["cheat.invincible", "cheat.pauseStageTime", "cheat.maxXp", "cheat.enabled"]) await gl.helperSet(p, false);
    await sleep(2500);
    const off = JSON.parse(await gl.evaluate(`(()=>{const g=window.__d2autobotGame,P=Object.getPrototypeOf(g),a=window.__d2autobot,d=a.diagnostics(),pl=g.world&&g.world.player,desc=pl&&Object.getOwnPropertyDescriptor(pl,"life");return JSON.stringify({hooks:d.hooks,tickSame:P.tick===window.__hk0.tick,steerSame:P.steer===window.__hk0.steer,sortSame:Array.prototype.sort===window.__hk0.sort,pushSame:Array.prototype.push===window.__hk0.push,lifeData:!!(desc&&"value" in desc)})})()`));
    check("例外開關關閉後函式與屬性還原為原參照", !off.hooks.some((n) => ["invincible", "stageTime", "xp"].includes(n)) && off.tickSame && off.steerSame && off.sortSame && off.pushSame && off.lifeData, JSON.stringify(off));

    // 5. 設定介面改由獨立應用提供：經 CDP 讀寫、遊戲內面板隱藏
    const st0 = await gl.helperSettings();
    check("獨立應用可讀輔助器設定", st0 && typeof st0.enabled === "boolean", `autoMode=${st0 && st0.autoMode}`);
    check("經 CDP 改設定會生效（自動模式→固定關卡）", (await gl.helperSet("autoMode", "fixedDifficulty")) === true && (await gl.helperSettings()).autoMode === "fixedDifficulty");
    check("遊戲內設定面板與「輔助」按鈕已隱藏", await gl.evaluate(`(()=>{const l=document.getElementById("d2autobot-launcher"),p=document.getElementById("d2autobot-panel");return !!document.getElementById("d2autobot-external-style")&&(!l||getComputedStyle(l).display==="none")&&(!p||getComputedStyle(p).display==="none")})()`));
    const live = await gl.helperLive();
    check("狀態浮窗資料可取得（等級／血量／動作）", live && live.level >= 1 && typeof live.hp === "string", JSON.stringify(live).slice(0, 80));
  } catch (e) { failed = true; check("例外", false, e.stack || e.message); }
  finally { await gl.close().catch(() => {}); }
  const bad = results.filter((r) => !r.ok).length;
  fs.writeFileSync(path.join(OUT, "result.json"), JSON.stringify(results, null, 1));
  console.log(`\n端到端：${results.length - bad}／${results.length} 通過`);
  process.exit(bad || failed ? 1 : 0);
})();
