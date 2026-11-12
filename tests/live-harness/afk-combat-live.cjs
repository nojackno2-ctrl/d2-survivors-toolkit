// 用法：H_SEED=<解碼後的存檔 JSON 路徑> electron tests/live-harness/afk-combat-live.cjs [輸出.json]
// 驗證「掛機」（工具包選單）不影響打怪練等：
//   A) 正常戰鬥（輔助器戰鬥＋自動推進）一段時間，記錄等級、經驗相關欄位、擊殺數、主畫面渲染統計；
//   B) 從工具包選單點「掛機」（遊戲會被恢復，遮罩蓋住畫面）同樣時間，應持續打怪；主畫面渲染被略過，離屏渲染照常；
//   C) 點畫面喚醒後繼續戰鬥，遮罩移除、面板可見。
// 使用使用者存檔的解碼副本（H_SEED），隔離 Electron 設定檔；不改原檔。
const { app, BrowserWindow, session, net } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");
const PAGES = "https://nojackno2-ctrl.github.io/d2-survivors-toolkit/";
const OUT = process.argv.slice(2).find((a) => !a.startsWith("--") && !a.endsWith("electron.exe") && a !== ".");
// H_SEED：解碼後的存檔 JSON 路徑（使用者存檔副本）；未設定則用全新存檔（不讀任何存檔）。
const SEED_PATH = process.env.H_SEED || "";
const SEED = SEED_PATH ? fs.readFileSync(SEED_PATH, "utf8") : null;
const SECS = Number(process.env.H_SECS || 60);
const SHOT = process.env.H_SHOT || path.join(os.tmpdir(), "afk-combat.png");
// H_CHEAT=1：遊戲修改總開關＋怪物數量最大化＋一般怪物全部精英（高特效密度的測試場景）。version 設為極大值，避免舊版遷移覆寫 cheat 設定。
const CHEAT_SET = process.env.H_CHEAT ? `localStorage.setItem("d2autobot:settings", ${JSON.stringify(JSON.stringify({ version: 999, cheat: { enabled: true, maxMonsterDensity: true, allElites: true } }))});` : "";
const CHEAT_ON = process.env.H_CHEAT ? "true" : "false";
const OPT_SET = process.env.H_OPTS ? `localStorage.setItem("d2toolkit.perfopts.v1", ${JSON.stringify(process.env.H_OPTS)});` : "";
const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".html": "text/html", ".css": "text/css", ".svg": "image/svg+xml" };
app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "d2combat-")));
app.whenReady().then(async () => {
  let finished = false;
  const done = (result, code = 0) => {
    if (finished) return;
    finished = true;
    const json = JSON.stringify(result, null, 2);
    if (OUT) fs.writeFileSync(OUT, json + "\n"); else console.log(json);
    app.exit(code);
  };
  setTimeout(() => done({ error: "實機測試逾時" }, 1), 900000);
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  try {
    session.defaultSession.protocol.handle("https", (req) => {
      if (!req.url.startsWith(PAGES)) return net.fetch(req, { bypassCustomProtocolHandlers: true });
      const rel = decodeURIComponent(new URL(req.url).pathname.slice("/d2-survivors-toolkit/".length));
      const file = path.resolve(ROOT, rel);
      if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return new Response("not found", { status: 404 });
      return new Response(fs.readFileSync(file), { headers: { "content-type": (MIME[path.extname(file)] || "application/octet-stream") + "; charset=utf-8", "access-control-allow-origin": "*", "cache-control": "no-store" } });
    });
    // 節點端每秒取樣 renderer／GPU CPU%（與頁面 Date.now 同一時鐘，用來對齊各段）
    const cpuLog = [];
    const cpuTimer = setInterval(() => cpuLog.push({ t: Date.now(), m: app.getAppMetrics().map((x) => ({ type: x.type, cpu: x.cpu.percentCPUUsage })) }), 1000);
    const win = new BrowserWindow({ width: 1100, height: 800, show: true, webPreferences: { webSecurity: false, backgroundThrottling: false } });
    await win.loadURL("https://d2survivors.lol/play/").catch(() => {});
    await sleep(4000);
    await win.webContents.executeJavaScript(SEED
      ? `localStorage.setItem("d2-survivors/save/v1", ${JSON.stringify(SEED)}); localStorage.removeItem("d2autoforge.memory");`
      : `localStorage.removeItem("d2-survivors/save/v1"); localStorage.removeItem("d2autoforge.memory");`);
    await win.loadURL("https://d2survivors.lol/play/").catch(() => {});
    await sleep(4000);
    await win.webContents.executeJavaScript(`(()=>{const b=[...document.querySelectorAll("button")].find(x=>/hosted/i.test(x.textContent));if(b)b.click()})()`);
    await sleep(12000);
    const out = await win.webContents.executeJavaScript(`(async () => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      const trace = { phases: {} };
      // 輔助器：開戰鬥與自動推進（不開作弊）
      window.__d2autobotSwitches = { enabled: true, progressEnabled: true, cheat: ${CHEAT_ON} };
      // H_OPTS：效能開關（JSON），在載入工具包前寫入 localStorage
      ${CHEAT_SET}
      ${OPT_SET}
      await import(${JSON.stringify(PAGES + "d2edit.js?v=")} + Date.now());
      for (let i = 0; i < 120 && !window.__d2autobot?.game; i++) { document.body.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true })); await sleep(500); }
      for (let i = 0; i < 120 && window.__d2editLoading; i++) await sleep(500);
      const g = window.__d2autobot?.game;
      if (!g) throw new Error("找不到遊戲物件");
      // 職業選擇畫面：與其他實機腳本相同，選定職業後開局
      await sleep(2000);
      if (g.state === "select") {
        if (!g.plainSelect().onPick) { g.chooseClass(); await sleep(1500); }
        const select = g.plainSelect(), cls = ${JSON.stringify(process.env.H_CLASS || "sorceress")};
        const index = select.cards.findIndex(c => c.dataset?.class === cls);
        if (index >= 0) { select.select(index); await sleep(300); select.confirm(false); }
      }
      // 等待進入冒險（輔助器自動開局）
      for (let i = 0; i < 240 && g.state !== "playing"; i++) await sleep(500);
      trace.stateAtStart = g.state;
      if (g.state !== "playing") throw new Error("未進入冒險，state=" + g.state);
      await sleep(3000);
      const p = g.world?.player;
      trace.playerFieldsLike = Object.keys(p || {}).filter(k => /xp|exp|kill|level|lv/i.test(k));
      trace.worldFieldsLike = Object.keys(g.world || {}).filter(k => /kill|xp|exp/i.test(k));
      // 效果最大值監看（效果很短暫，每 5 秒的取樣抓不到）
      window.__fxMax = { total: 0, hidden: 0, flashes: 0, rings: 0, zones: 0 };
      setInterval(() => { const w = g.world || {}; let t = 0, h = 0; for (const k of ["flashes", "rings", "zones"]) for (const e of (w[k] || [])) if (e?.gfx) { t++; if (e.gfx.visible === false) h++; } const m = window.__fxMax; m.total = Math.max(m.total, t); m.hidden = Math.max(m.hidden, h); m.flashes = Math.max(m.flashes, (w.flashes || []).length); m.rings = Math.max(m.rings, (w.rings || []).length); m.zones = Math.max(m.zones, (w.zones || []).length); }, 100);
      // 探測：戰鬥中舞台物件的型別分布與具名容器（供「減少特效」與記憶體優化決策）
      {
        const counts = {}, named = {}; const st = g.app?.stage ? [g.app.stage] : []; let total = 0;
        while (st.length && total < 60000) { const o = st.pop(); total++; const k = o?.constructor?.name || "?"; counts[k] = (counts[k] || 0) + 1; if (o?.label) named[o.label] = (named[o.label] || 0) + 1; for (const c of (o?.children || [])) st.push(c); }
        trace.probe = { total, types: Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 30), labels: Object.entries(named).sort((a, b) => b[1] - a[1]).slice(0, 30), textures: g.app?.renderer?.texture?.managedTextures?.length ?? null, rendererType: g.app?.renderer?.type ?? null, resolution: g.app?.renderer?.resolution ?? null, keysOfWorld: Object.keys(g.world || {}).slice(0, 80) };
      }
      const readStats = () => {
        const pl = g.world?.player || {};
        const w = g.world || {};
        const pick = (o, re) => Object.fromEntries(Object.keys(o).filter(k => re.test(k)).map(k => [k, typeof o[k] === "number" ? o[k] : (typeof o[k] === "object" && o[k] ? "obj" : String(o[k]))]));
        const countObjs = (root) => { let n = 0; const st = root ? [root] : []; while (st.length && n < 50000) { const o = st.pop(); n++; for (const c of (o?.children || [])) st.push(c); } return n; };
        const fx = { total: 0, hidden: 0 }; for (const k of ["flashes", "rings", "zones"]) for (const e of (w[k] || [])) if (e?.gfx) { fx.total++; if (e.gfx.visible === false) fx.hidden++; }
        return { fx, lists: { flashes: (w.flashes || []).length, rings: (w.rings || []).length, zones: (w.zones || []).length }, textures: g.app?.renderer?.texture?.managedTextures?.length ?? null, objs: countObjs(g.app?.stage), heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null, kills: g.world?.kills ?? null, state: g.state, level: pl.level ?? null, hp: pl.hp ?? pl.life ?? null, playerStats: pick(pl, /xp|exp|kill|level/i), worldStats: pick(w, /kill|xp|exp|time/i), afkOn: !!document.getElementById("d2autoforge-afk"), stats: window.__d2afkStats ? { ...window.__d2afkStats } : null, t: Date.now() };
      };
      const run = async (name, secs, action) => {
        if (action) await action();
        const s0 = readStats(); const rows = [];
        for (let i = 0; i < secs; i += 5) { await sleep(5000); rows.push(readStats()); }
        const s1 = rows[rows.length - 1] || readStats();
        trace.phases[name] = { seconds: (s1.t - s0.t) / 1000, start: s0, end: s1, levelMin: Math.min(...rows.map(r => r.level ?? Infinity)), levelMax: Math.max(...rows.map(r => r.level ?? -Infinity)), stateSeen: [...new Set(rows.map(r => r.state))] };
      };
      await run("A_正常戰鬥", ${SECS});
      // 選單「掛機」：先暫停（工具包只在暫停時出現），再點選單項目（會恢復遊戲並遮罩）
      await run("B_掛機中", ${SECS}, async () => {
        for (let i = 0; i < 20 && !(document.body.classList.contains("frontend-over-run") || document.body.classList.contains("frontend-open") || (() => { const q = document.getElementById("paused"); return !!q && !q.classList.contains("hidden"); })()); i++) { try { g.pause(); } catch (e) {} await sleep(700); }
        document.getElementById("d2toolkit-launcher")?.click(); await sleep(400);
        const item = [...(document.getElementById("d2toolkit-menu")?.children || [])].find(c => c.textContent === "掛機");
        trace.afkMenuItemFound = !!item;
        item?.click(); await sleep(800);
      });
      trace.overlayDuringAfk = !!document.getElementById("d2autoforge-afk");
      // 喚醒
      const ov = document.getElementById("d2autoforge-afk");
      ov?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
      await sleep(1000);
      trace.overlayAfterWake = !!document.getElementById("d2autoforge-afk");
      await run("C_喚醒後戰鬥", Math.round(${SECS} / 2));
      // 深探針（結束時）：場景物件種類（label）、實際使用中的貼圖數、Pixi 管理的貼圖數、Text 數量
      {
        const labels = {}, texIn = new Set(); const st = [g.app.stage]; let n = 0, texts = 0;
        while (st.length && n < 200000) { const o = st.pop(); n++; const l = o.label || o.constructor?.name || "?"; labels[l] = (labels[l] || 0) + 1; if (o.texture) texIn.add(o.texture); if (typeof o.text === "string") texts++; for (const c of (o.children || [])) st.push(c); }
        const managed = g.app.renderer.texture?.managedTextures || [];
        const gcObj = g.app.renderer.gc;
        const gcInfo = { maxUnusedTime: gcObj?.maxUnusedTime, autoGC: managed.find(Boolean)?.autoGarbageCollect, gcKeys: gcObj ? Object.keys(gcObj).slice(0, 20) : null, gcNow: gcObj?.now ?? null, lastUsedSample: managed.slice(0, 3).map(t => t?._gcLastUsed ?? null) };
        const before = g.app.renderer.texture?.managedTextures?.length ?? null;
        try { gcObj?.run?.(); } catch (e) { gcInfo.runErr = String(e); }
        const after = g.app.renderer.texture?.managedTextures?.length ?? null;
        const mt = (g.app.renderer.texture?.managedTextures || []).filter(Boolean); const gcn = g.app.renderer.gc?.now;
        const usedSrc = new Set(); { const st2 = [g.app.stage]; let k = 0; while (st2.length && k < 200000) { const o = st2.pop(); k++; if (o?.texture?.source) usedSrc.add(o.texture.source); for (const c of (o?.children || [])) st2.push(c); } }
        const diag = { idleOver3s: mt.filter(t => gcn - (t._gcLastUsed ?? gcn) > 3000).length, withGpuData: mt.filter(t => t._gpuData && Object.keys(t._gpuData).length > 0).length, inUseNow: mt.filter(t => usedSrc.has(t)).length, lastUsedRange: [Math.min(...mt.map(t => t._gcLastUsed ?? 0)), Math.max(...mt.map(t => t._gcLastUsed ?? 0))], gcNow: gcn };
        trace.deepProbe = { diag, objects: n, texts, labels: Object.entries(labels).sort((a, b) => b[1] - a[1]).slice(0, 12), texturesInUse: texIn.size, managedTextures: managed.length, gcBeforeRun: before, gcAfterRun: after, gcInfo };
      }
      trace.finalStats = window.__d2afkStats ?? null;
      trace.fxMax = window.__fxMax;
      trace.errors = (window.__d2toolkitErrors || []);
      return trace;
    })()`);
    clearInterval(cpuTimer);
    // 依各段的時間範圍平均 CPU%
    out.cpuByPhase = {};
    for (const [name, ph] of Object.entries(out.phases || {})) {
      const rows = cpuLog.filter((r) => r.t >= ph.start.t && r.t <= ph.end.t);
      const agg = {};
      for (const r of rows) for (const m of r.m) (agg[m.type] ??= []).push(m.cpu);
      out.cpuByPhase[name] = { samples: rows.length, avg: Object.fromEntries(Object.entries(agg).map(([k, v]) => [k, +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(3)])) };
    }
    try {
      const img = await win.webContents.capturePage();
      fs.writeFileSync(SHOT, img.toPNG());
      out.shot = SHOT;
    } catch (e) { out.shot = "截圖失敗：" + String(e?.message || e); }
    done(out);
  } catch (e) { done({ error: String(e?.stack || e) }, 1); }
});
