// 用法：H_SEED=<解碼後的存檔 JSON 路徑> electron tests/live-harness/perf-ab-live.cjs [輸出.json]
// 效能頁「掛機時略過主畫面繪製」與「掛機」的同場對照量測（官方 /play/、隔離設定檔、存檔副本，不改原檔）：
//   同一局遊戲內輪流切換各條件（每輪順序反轉以抵銷負載漂移），每個條件量 H_SECS 秒、共 H_ROUNDS 輪。
//   開關一律走真實介面（工具包選單 → 效能頁勾選 → 關閉效能頁；掛機走選單「掛機」），量測期間效能頁是關閉的。
// 指標：renderer／GPU 行程 CPU%（Electron getAppMetrics，每秒取樣）、影格間隔（rAF）、Pixi render 呼叫耗時、
//       JS 堆積、受管貼圖數、GPU 行程記憶體、場景物件數與擊殺數（負載對照用）。
//   每個條件的前後各量一段「基準」（基準 → 條件 → 基準 → 條件 …），條件只跟緊鄰的前後兩段基準平均比較，抵銷場景負載隨時間的漂移。
// 環境變數：H_SECS（每段秒數，預設 15）、H_ROUNDS（輪數，預設 2）、H_W／H_H（視窗內容大小，預設 1600×900）、H_CLASS（預設 sorceress）、
//   H_SCENE：normal（只開無敵，一般遊玩負載）／dense（怪物數量最大化＋全部精英）／heavy（再加 10 倍怪與最大掉寶，物件會持續堆積，邏輯吃滿 CPU）。
const { app, BrowserWindow, session, net } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");
const PAGES = "https://nojackno2-ctrl.github.io/d2-survivors-toolkit/";
const OUT = process.argv.slice(2).find((a) => !a.startsWith("--") && !a.endsWith("electron.exe") && a !== "." && !a.endsWith("perf-ab-live.cjs"));
const SEED = process.env.H_SEED ? fs.readFileSync(process.env.H_SEED, "utf8") : null;
const SECS = Number(process.env.H_SECS || 15), ROUNDS = Number(process.env.H_ROUNDS || 2), SETTLE = 4000;
const SCENE = process.env.H_SCENE || "dense";
const CHEATS = { normal: { enabled: true, invincible: true }, dense: { enabled: true, invincible: true, maxMonsterDensity: true, allElites: true }, heavy: { enabled: true, invincible: true, maxCrit: true, oneHitKill: true, maxSkills: true, maxMonsterDensity: true, monsterDensity10x: true, allElites: true, maxDropRate: true, maxGoldRate: true } }[SCENE];
if (!CHEATS) throw new Error("H_SCENE 只能是 normal／dense／heavy");
const W = Number(process.env.H_W || 1600), H = Number(process.env.H_H || 900);
const CORES = os.cpus().length, NOSET = !!process.env.H_NOSET;
const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".html": "text/html", ".css": "text/css", ".svg": "image/svg+xml" };
// 條件：s＝掛機時略過主畫面繪製、afk＝是否進入掛機。
// （2026-11-10 以前還有減少特效／記憶體整理／降低解析度三個開關，本腳本量出無效益後已自工具包移除；當時的結果記在 AI_HANDOFF.md。）
const CONDITIONS = {
  基準: { s: 1, afk: 0 },
  掛機_略過繪製: { s: 1, afk: 1 },
  掛機_不略過: { s: 0, afk: 1 },
};
for (const sw of ["disable-renderer-backgrounding", "disable-background-timer-throttling", "disable-backgrounding-occluded-windows"]) app.commandLine.appendSwitch(sw);
app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "d2perfab-")));
app.whenReady().then(async () => {
  let finished = false;
  const done = (result, code = 0) => { if (finished) return; finished = true; const json = JSON.stringify(result, null, 1); if (OUT) fs.writeFileSync(OUT, json + "\n"); else console.log(json); app.exit(code); };
  setTimeout(() => done({ error: "實機測試逾時" }, 1), (ROUNDS * (Object.keys(CONDITIONS).length * 2) * (SECS + 12) + 240) * 1000);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    session.defaultSession.protocol.handle("https", (req) => {
      if (!req.url.startsWith(PAGES)) return net.fetch(req, { bypassCustomProtocolHandlers: true });
      const rel = decodeURIComponent(new URL(req.url).pathname.slice("/d2-survivors-toolkit/".length));
      const file = path.resolve(ROOT, rel);
      if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return new Response("not found", { status: 404 });
      return new Response(fs.readFileSync(file), { headers: { "content-type": (MIME[path.extname(file)] || "application/octet-stream") + "; charset=utf-8", "access-control-allow-origin": "*", "cache-control": "no-store" } });
    });
    const cpuLog = [];
    const cpuTimer = setInterval(() => cpuLog.push({ t: Date.now(), m: app.getAppMetrics().map((x) => ({ type: x.type, cpu: x.cpu.percentCPUUsage, mem: x.memory?.workingSetSize ?? null })) }), 1000);
    const win = new BrowserWindow({ width: W, height: H, useContentSize: true, show: true, webPreferences: { webSecurity: false, backgroundThrottling: false } });
    const errors = [];
    win.webContents.on("console-message", (e, lvl, msg) => { if (lvl >= 3 && !/Electron Security/.test(msg)) errors.push(msg.slice(0, 200)); });
    const exec = (code) => win.webContents.executeJavaScript(code);
    await win.loadURL("https://d2survivors.lol/play/").catch(() => {});
    await sleep(4000);
    await exec(SEED ? `localStorage.setItem("d2-survivors/save/v1", ${JSON.stringify(SEED)}); 1` : `localStorage.removeItem("d2-survivors/save/v1"); 1`);
    await win.loadURL("https://d2survivors.lol/play/").catch(() => {});
    await sleep(4000);
    await exec(`(()=>{const b=[...document.querySelectorAll("button")].find(x=>/hosted/i.test(x.textContent));if(b)b.click()})()`);
    await sleep(12000);
    // 高密度場景：與 tests/live-harness/boot.js 相同的輔助器設定（自動戰鬥、推進、無敵、怪物數量最大化、全部精英）。
    const setup = await exec(`(async () => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      localStorage.removeItem("d2toolkit.perfopts.v1");
      const st = JSON.parse(localStorage.getItem("d2autobot:settings") || "{}");
      localStorage.setItem("d2autobot:settings", JSON.stringify({ ...st, version: 4, enabled: true, progressEnabled: true, cheat: { ...(st.cheat || {}), ...${JSON.stringify(CHEATS)} }, quest: { ...(st.quest || {}), autoProgress: true, autoStart: true, prioritizeBoss: true, farmDifficulty: "off" }, terror: { ...(st.terror || {}), mode: "off" } }));
      window.__d2autobotSwitches = { enabled: true, progressEnabled: true, cheat: true };
      await import(${JSON.stringify(PAGES + (process.env.H_ONLYBOT ? "helper/autobot.js?v=" : "d2edit.js?v="))} + Date.now()); // H_ONLYBOT=1：只載入輔助器（不載入 d2edit 與語言模組），用來區分記憶體成長來源；需搭配 H_NOSET=1
      for (let i = 0; i < 120 && !window.__d2autobot?.game; i++) { document.body.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true })); await sleep(500); }
      for (let i = 0; i < 120 && window.__d2editLoading; i++) await sleep(500);
      const g = window.__d2autobot?.game; if (!g) throw new Error("找不到遊戲物件");
      await sleep(2000);
      if (g.state === "select") {
        if (g.frontend?.open && !g.plainSelect().onPick) { g.frontend.actions.play(); await sleep(3000); }
        if (!g.plainSelect().onPick) { g.chooseClass(); await sleep(1500); }
        const select = g.plainSelect(), index = select.cards.findIndex(c => c.dataset?.class === ${JSON.stringify(process.env.H_CLASS || "sorceress")});
        if (index >= 0) { select.select(index); await sleep(300); select.confirm(false); }
      }
      for (let i = 0; i < 240 && g.state !== "playing"; i++) await sleep(500);
      if (g.state !== "playing") throw new Error("未進入冒險，state=" + g.state);
      await sleep(8000);
      // 量測器：rAF 影格間隔、Pixi render 呼叫耗時、每秒取樣的負載指標
      const r = g.app.renderer, orig = r.render, acc = { n: 0, ms: 0 };
      r.render = function (...a) { const t = performance.now(); try { return orig.apply(this, a); } finally { acc.ms += performance.now() - t; acc.n++; } };
      const countObjs = () => { let n = 0; const st = [g.app.stage]; while (st.length && n < 100000) { const o = st.pop(); n++; for (const c of (o?.children || [])) st.push(c); } return n; };
      let frames = null, last = 0, samples = null, timer = 0, base = null;
      const loop = (now) => { if (frames) { if (last) frames.push(now - last); last = now; } requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
      const snap = () => ({ objs: countObjs(), enemies: g.world?.enemies?.length ?? null, fx: ["flashes", "rings", "zones"].reduce((s, k) => s + (g.world?.[k]?.length || 0), 0), heap: performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null, tex: (r.texture?.managedTextures || []).filter(Boolean).length, state: g.state });
      window.__pm = {
        start() { frames = []; last = 0; samples = [snap()]; base = { n: acc.n, ms: acc.ms, kills: g.world?.kills ?? 0, t: performance.now() }; timer = setInterval(() => samples.push(snap()), 1000); return Date.now(); },
        stop() {
          clearInterval(timer); const f = frames.slice().sort((a, b) => a - b); frames = null;
          const secs = (performance.now() - base.t) / 1000, q = (p) => f.length ? f[Math.min(f.length - 1, Math.floor(f.length * p))] : null, avg = (k) => { const v = samples.map(s => s[k]).filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
          const n = acc.n - base.n, ms = acc.ms - base.ms;
          return { t: Date.now(), secs, fps: f.length / secs, frameAvg: f.reduce((a, b) => a + b, 0) / (f.length || 1), frameP95: q(0.95), frameP99: q(0.99), frameWorst: f[f.length - 1] ?? null, over33: f.filter(x => x > 33.4).length,
            renderCalls: n / secs, renderMsPerSec: ms / secs, renderMsPerCall: n ? ms / n : 0, kills: (g.world?.kills ?? 0) - base.kills, objs: avg("objs"), enemies: avg("enemies"), fx: avg("fx"), heap: avg("heap"), tex: avg("tex"), texEnd: samples[samples.length - 1].tex,
            playing: samples.filter(s => s.state === "playing").length / samples.length, resolution: r.resolution, canvas: [r.canvas?.width ?? r.view?.canvas?.width ?? null, r.canvas?.height ?? r.view?.canvas?.height ?? null], afk: !!document.getElementById("d2autoforge-afk"), opts: { ...window.__d2perfOpts } };
        },
        // 走真實介面切換：喚醒掛機 → 開效能頁勾選 → 關閉效能頁 →（需要時）選單「掛機」
        async set(c) {
          const menu = (re) => { document.getElementById("d2toolkit-launcher").click(); const it = [...document.querySelectorAll("#d2toolkit-menu div")].find(d => re.test(d.textContent)); it?.click(); return !!it; };
          document.getElementById("d2autoforge-afk")?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
          await sleep(300);
          if (!menu(/^(效能|Performance)$/)) throw new Error("選單沒有效能項目");
          await sleep(300);
          const cbs = [...document.querySelectorAll("#d2perf-page input[type=checkbox]")];
          if (cbs.length !== 1) throw new Error("效能頁開關數量不是 1：" + cbs.length);
          if (cbs[0].checked !== !!c.s) cbs[0].click();
          await sleep(200); window.__d2perfClose?.(); await sleep(200);
          if (c.afk) { if (!menu(/^(掛機|AFK)$/)) throw new Error("選單沒有掛機項目"); await sleep(500); }
          return { opts: { ...window.__d2perfOpts }, afk: !!document.getElementById("d2autoforge-afk"), perfPage: !!document.getElementById("d2perf-page") };
        },
      };
      let gl = null; try { const c = document.createElement("canvas").getContext("webgl2") || document.createElement("canvas").getContext("webgl"); const e = c.getExtension("WEBGL_debug_renderer_info"); gl = e ? c.getParameter(e.UNMASKED_RENDERER_WEBGL) : c.getParameter(c.RENDERER); } catch (e) { gl = String(e); }
      return { state: g.state, level: g.world?.player?.level, viewport: [innerWidth, innerHeight], dpr: devicePixelRatio, rendererType: r.type ?? r.name ?? null, resolution: r.resolution, gl };
    })()`);
    const rows = [];
    const names = Object.keys(CONDITIONS).filter((n) => n !== "基準");
    const measure = async (round, name) => {
      const applied = NOSET ? null : await exec(`window.__pm.set(${JSON.stringify(CONDITIONS[name])})`);
      await sleep(SETTLE);
      const t0 = await exec(`window.__pm.start()`);
      await sleep(SECS * 1000);
      const m = await exec(`window.__pm.stop()`);
      const cpu = cpuLog.filter((x) => x.t > t0 + 1000 && x.t <= m.t);
      const avgOf = (type, key) => { const v = cpu.map((x) => x.m.filter((p) => p.type === type).reduce((s, p) => s + (p[key] || 0), 0)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
      // percentCPUUsage 以全部邏輯核心為 100%；乘上核心數換算成「單一核心的百分比」
      const row = { round, name, applied, ...m, cpuTab: avgOf("Tab", "cpu") * CORES, cpuGpu: avgOf("GPU", "cpu") * CORES, memTabMB: avgOf("Tab", "mem") / 1024, memGpuMB: avgOf("GPU", "mem") / 1024 };
      rows.push(row); return row;
    };
    // H_NOSET=1：對照組，完全不碰效能頁與掛機，只連續量基準段（看記憶體等指標是否自己漂移）
    // H_AB="<開的 JS>|||<關的 JS>"：自訂對照（搭配 H_NOSET=1），奇數段執行前者（標為「實驗」）、偶數段執行後者（標為「基準」）
    const AB = process.env.H_AB ? process.env.H_AB.split("|||") : null;
    if (NOSET) { for (let i = 0; i < ROUNDS * 6 + (AB ? 1 : 0); i++) { if (AB) await exec(AB[i % 2 ? 0 : 1] + ";1"); const row = await measure(0, AB && i % 2 ? "實驗" : "基準"); row.live = await exec("window.__d2langLiveCount?.() ?? null"); } clearInterval(cpuTimer); return done({ setup, scene: SCENE, secs: SECS, noset: true, cores: CORES, rows, errors: errors.slice(0, 20) }); }
    for (let round = 0; round < ROUNDS; round++) {
      const order = round % 2 ? names.slice().reverse() : names.slice();
      await measure(round, "基準");
      for (const name of order) { await measure(round, name); await measure(round, "基準"); }
    }
    await exec(`window.__pm.set(${JSON.stringify(CONDITIONS.基準)})`);
    clearInterval(cpuTimer);
    // 彙整：每段條件與緊鄰前後兩段基準的平均比較（差 %）；另列基準段彼此之間的波動（雜訊底線）
    const metrics = ["cpuTab", "cpuGpu", "fps", "frameAvg", "frameP95", "frameP99", "over33", "renderMsPerSec", "renderMsPerCall", "renderCalls", "heap", "tex", "memTabMB", "memGpuMB", "objs", "enemies", "fx", "kills", "playing"];
    const summary = {}, fix = (x) => (x == null || !Number.isFinite(x) ? null : +x.toFixed(2));
    for (const name of names) {
      const idx = rows.map((x, i) => (x.name === name ? i : -1)).filter((i) => i >= 0);
      summary[name] = Object.fromEntries(metrics.map((k) => {
        const cond = idx.map((i) => rows[i][k]), base = idx.map((i) => (rows[i - 1][k] + rows[i + 1][k]) / 2);
        const pct = cond.map((v, j) => (base[j] ? (v / base[j] - 1) * 100 : null));
        return [k, { cond: cond.map(fix), base: base.map(fix), pct: pct.map(fix) }];
      }));
    }
    // 雜訊底線：把每段「夾在兩段基準中間的基準」也用同樣方法比一次（基準 vs 前後基準平均）
    const bIdx = rows.map((x, i) => (x.name === "基準" ? i : -1)).filter((i) => i >= 0);
    const noise = Object.fromEntries(metrics.map((k) => {
      const pct = []; for (let j = 1; j + 1 < bIdx.length; j++) { const b = (rows[bIdx[j - 1]][k] + rows[bIdx[j + 1]][k]) / 2; if (b) pct.push((rows[bIdx[j]][k] / b - 1) * 100); }
      return [k, { pct: pct.map(fix), maxAbs: fix(Math.max(...pct.map(Math.abs))) }];
    }));
    done({ setup, scene: SCENE, secs: SECS, rounds: ROUNDS, cores: CORES, summary, noise, rows, errors: errors.slice(0, 20) });
  } catch (e) { done({ error: String(e?.stack || e) }, 1); }
});
