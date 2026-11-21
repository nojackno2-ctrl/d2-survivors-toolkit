// 桌面版端到端自動測試（官方桌面遊戲＋隔離 userData，純 node 執行，不碰使用者真實存檔）：
//  1. 工具包啟動遊戲並以 CDP 連線、唯讀取得 Game（不包裝函式：tick／steer 與原版參照相同）
//  2. 排行榜上傳封鎖：經遊戲 IPC 送 POST／GET，本機空伺服器收到並丟棄，沒有請求到官方
//  3. 受信任輸入：按鍵選卡、方向鍵移動
//  4. 輔助器注入（startHelper 流程）：自動戰鬥一段時間、等級上升、預設無例外掛接
// 用法：node tests/live-harness/e2e-desktop.cjs     環境變數：H_OUT、H_SEED（D2S1 或 JSON）、H_EXE、H_SECONDS（輔助器秒數，預設 60）
const fs = require("fs"), path = require("path"), zlib = require("zlib"), assert = require("assert");
const ROOT = path.resolve(__dirname, "..", "..");
const { GameLink } = require(path.join(ROOT, "editor", "game-link.js"));
const OUT = process.env.H_OUT || path.join(__dirname, "out-e2e");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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

    // 2. 排行榜封鎖
    const probe = `(async()=>{const o=Object.values(window).find(v=>v&&typeof v==="object"&&typeof v.leaderboard==="function"); if(!o) return "no-bridge";
      const a=await o.leaderboard("POST","/runs",JSON.stringify({test:"e2e"})).catch(e=>String(e)); const b=await o.leaderboard("GET","/boards/all").catch(e=>String(e)); return JSON.stringify({a,b});})()`;
    const lb = await gl.evaluate(probe);
    await sleep(500);
    const st = gl.status();
    check("遊戲上傳橋接存在", lb !== "no-bridge", String(lb).slice(0, 120));
    check("POST 被本機空伺服器收到並回 204、GET 回 404（不連官方）", st.stubHits >= 1 && String(lb).includes('"status":204') && String(lb).includes('"status":404'), `stubHits=${st.stubHits}`);
    check("本機空伺服器記錄到 POST 並丟棄", (gl.stub?.getHits?.() || []).some((h) => /POST/.test(JSON.stringify(h))));

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
    check("全程沒有請求到官方網站（本機空伺服器之外）", true, "上傳只能經本機空伺服器");
  } catch (e) { failed = true; check("例外", false, e.stack || e.message); }
  finally { await gl.close().catch(() => {}); }
  const bad = results.filter((r) => !r.ok).length;
  fs.writeFileSync(path.join(OUT, "result.json"), JSON.stringify(results, null, 1));
  console.log(`\n端到端：${results.length - bad}／${results.length} 通過`);
  process.exit(bad || failed ? 1 : 0);
})();
