// 用法：H_SEED=使用者存檔副本.json H_CLASS=sorceress electron tests/live-harness/autoforge-roundrobin-live.cjs [輸出.json]
// 驗證自動淬鍊「10 件輪流」流程（helper/autoforge-ui.js 的 loop），以及手機版面板的排版。
// 只使用使用者存檔副本中「本來就有」的暗金／套裝／符文之語（不複製、不生成）。
// 若可用裝備不足 10 件，會把副本中其他容器（倉庫、傭兵）的同一類裝備搬進背包，僅在隔離副本內進行。
const { app, BrowserWindow, session, net } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");
const PAGES = "https://nojackno2-ctrl.github.io/d2-survivors-toolkit/";
const OUT = process.argv.slice(2).find((a) => !a.startsWith("--") && !a.endsWith("electron.exe") && a !== ".");
const CLASS = process.env.H_CLASS || "sorceress";
const SEED = fs.readFileSync(process.env.H_SEED, "utf8");
const SHOT = process.env.H_SHOT || path.join(os.tmpdir(), "autoforge-mobile.png");
const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".html": "text/html", ".css": "text/css", ".svg": "image/svg+xml" };
app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "d2roundrobin-")));
app.whenReady().then(async () => {
  let finished = false;
  const done = (result, code = 0) => {
    if (finished) return;
    finished = true;
    const json = JSON.stringify(result, null, 2);
    if (OUT) fs.writeFileSync(OUT, json + "\n");
    else console.log(json);
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
    const win = new BrowserWindow({ width: 1100, height: 800, show: true, webPreferences: { webSecurity: false, backgroundThrottling: false } });
    await win.loadURL("https://d2survivors.lol/play/").catch(() => {});
    await sleep(4000);
    await win.webContents.executeJavaScript(`localStorage.setItem("d2-survivors/save/v1", ${JSON.stringify(SEED)});`);
    await win.loadURL("https://d2survivors.lol/play/").catch(() => {});
    await sleep(4000);
    await win.webContents.executeJavaScript(`(()=>{const b=[...document.querySelectorAll("button")].find(x=>/hosted/i.test(x.textContent));if(b)b.click()})()`);
    await sleep(12000);
    const result = await win.webContents.executeJavaScript(`(async () => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      await import(${JSON.stringify(PAGES + "d2edit.js?v=")} + Date.now());
      for (let i = 0; i < 120 && !window.__d2autobot?.game; i++) { document.body.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true })); await sleep(500); }
      for (let i = 0; i < 60 && !window.__d2autoforgeUI; i++) await sleep(500);
      const bot = window.__d2autobot, g = bot?.game;
      if (!g) throw new Error("找不到遊戲物件");
      if (g.state === "select") {
        if (g.frontend?.open && !g.plainSelect().onPick) { g.frontend.actions.play(); await sleep(3000); }
        if (!g.plainSelect().onPick) { g.chooseClass(); await sleep(1500); }
        const select = g.plainSelect(), cls = ${JSON.stringify(CLASS)};
        const index = select.cards.findIndex(c => c.dataset?.class === cls);
        if (index < 0) throw new Error("找不到職業：" + cls);
        select.select(index); await sleep(300); select.confirm(false);
      }
      for (let i = 0; i < 120 && !g.world?.player && g.state !== "camp"; i++) await sleep(500);
      const cls = g.kit?.id;
      const essenceName = "Burning Essence of Terror";
      if (${JSON.stringify(process.env.H_CHECK_ONLY || "")} === "1") {
        await sleep(1500);
        return { checkOnly: true, cls, essences: (g.save?.inventoryByClass?.[cls] || []).filter(i => i?.type === "essence" && i.base === essenceName).reduce((s, i) => s + (i.count ?? 1), 0), panelShown: !!document.querySelector("#d2autoforge-panel") };
      }
      const essences = () => (g.save?.inventoryByClass?.[cls] || []).filter(i => i?.type === "essence" && i.base === essenceName).reduce((s, i) => s + (i.count ?? 1), 0);
      const root = document.querySelector("#d2autobot-panel")?.shadowRoot;
      const toggle = (name, enabled) => { const b = root?.querySelector('[data-setting="' + name + '"]'); if (!b) throw new Error("找不到設定：" + name); if ((b.getAttribute("aria-checked") === "true") !== enabled) b.click(); };
      toggle("cheat.forgeMax", true); toggle("cheat.enabled", true); await sleep(2000); toggle("cheat.enabled", false); await sleep(1000);
      const ok = it => it && ["unique", "set", "runeword"].includes(it.rarity) && Array.isArray(it.mods) && it.mods.length;
      // 1) 背包中可淬鍊的裝備；不足 10 件時，從同一副本的倉庫／傭兵搬入背包（僅隔離副本）
      const inv = () => g.save.inventoryByClass[cls] = g.save.inventoryByClass[cls] || [];
      let moved = 0;
      if (g.inventoryOf(cls).filter(ok).length < 10) {
        const pool = [];
        const walk = (v) => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === "object") { if (ok(v)) pool.push(v); else Object.values(v).forEach(walk); } };
        walk(g.save.stashTabs); walk(g.save.mercs);
        for (const it of pool) { if (g.inventoryOf(cls).filter(ok).length >= 10) break; if (!inv().includes(it)) { inv().push(it); moved++; } }
      }
      const cands = g.inventoryOf(cls).filter(ok).slice(0, 10);
      const slots = cands.map((it, k) => {
        const lines = window.__d2autoforgeUI.lines(it.id);
        const targets = {}; for (const l of lines) targets[l.key] = 0;
        if (lines[0]) targets[lines[0].key] = 1;
        return { id: it.id, name: (it.name || it.id) + " #" + (k + 1), targets };
      });
      const trace = { cls, candidates: cands.length, movedFromStashOrMerc: moved, essencesBefore: essences(), slots: slots.map(s => ({ name: s.name, targets: s.targets })) };
      if (!slots.length) throw new Error("背包中沒有可淬鍊裝備");
      // 2) 執行 10 件輪流（與面板相同的 loop）
      window.__d2autoforgeUI.start(slots, cls);
      const t0 = Date.now();
      for (let i = 0; i < 1500 && window.__d2autoforgeUI.state.running; i++) await sleep(500);
      const st = window.__d2autoforgeUI.state;
      trace.elapsedSec = Math.round((Date.now() - t0) / 1000);
      trace.running = st.running;
      trace.slotResults = st.slots.map(s => ({ name: s.name, done: s.done, steps: s.steps, result: s.result }));
      trace.log = st.log.slice(-80);
      trace.essencesAfter = essences();
      trace.forge = slots.map(s => { const x = (g.inventoryOf(cls) || []).find(v => v?.id === s.id); return { name: s.name, forge: x?.forge ?? null }; });
      // 3) 手機版面板：精華補回 99 讓面板顯示
      toggle("cheat.enabled", true); await sleep(2000); toggle("cheat.enabled", false); await sleep(1000);
      window.__d2autoforgeUI.state.slots = window.__d2autoforgeUI.state.slots.slice(0, 10);
      window.__d2autoforgeUI.state.msg = "手機版測試";
      trace.panelShown = !!document.querySelector("#d2autoforge-panel");
      return trace;
    })()`);
    // 手機版：模擬 375×812，截圖並量測面板是否超出畫面
    if (!result.error) {
      win.setContentSize(375, 812);
      await sleep(2500);
      const m = await win.webContents.executeJavaScript(`(() => { const p = document.querySelector("#d2autoforge-panel"); if (!p) return { panel: false, vw: innerWidth, vh: innerHeight, sw: document.documentElement.scrollWidth }; const r = p.getBoundingClientRect(); return { panel: true, rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right), bottom: Math.round(r.bottom) }, vw: innerWidth, vh: innerHeight, sw: document.documentElement.scrollWidth, overflowsRight: r.right > innerWidth, overflowsBottom: r.bottom > innerHeight }; })()`);
      result.mobile = m;
      const img = await win.webContents.capturePage();
      fs.writeFileSync(SHOT, img.toPNG());
      result.mobileShot = SHOT;
    }
    done(result);
  } catch (e) { done({ error: String(e?.stack || e) }, 1); }
});
