// 用法：H_SEED=使用者存檔副本.json H_CLASS=sorceress H_SHOT=截圖.png electron tests/live-harness/autoforge-single-live.cjs [輸出.json]
// 驗證「單件、直接操作鐵砧」版自動淬鍊：
//   1) 把副本中的一件真實暗金／套裝／符文之語放上鐵砧（不複製、不生成），面板自動對準它；
//   2) 以第一條屬性 ≥1 為目標執行到結束；
//   3) 移開再放回同一件，確認目標設定已從記憶帶入；
//   4) 手機寬度 375 下截圖並量測面板。
const { app, BrowserWindow, session, net } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");
const PAGES = "https://nojackno2-ctrl.github.io/d2-survivors-toolkit/";
const OUT = process.argv.slice(2).find((a) => !a.startsWith("--") && !a.endsWith("electron.exe") && a !== ".");
const CLASS = process.env.H_CLASS || "sorceress";
const SEED = fs.readFileSync(process.env.H_SEED, "utf8");
const SHOT = process.env.H_SHOT || path.join(os.tmpdir(), "autoforge-single-mobile.png");
const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".html": "text/html", ".css": "text/css", ".svg": "image/svg+xml" };
app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "d2single-")));
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
    await win.webContents.executeJavaScript(`localStorage.setItem("d2-survivors/save/v1", ${JSON.stringify(SEED)}); localStorage.removeItem("d2autoforge.memory");`);
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
      const essences = () => (g.save?.inventoryByClass?.[cls] || []).filter(i => i?.type === "essence" && i.base === essenceName).reduce((s, i) => s + (i.count ?? 1), 0);
      const root = document.querySelector("#d2autobot-panel")?.shadowRoot;
      const toggle = (name, enabled) => { const b = root?.querySelector('[data-setting="' + name + '"]'); if (!b) throw new Error("找不到設定：" + name); if ((b.getAttribute("aria-checked") === "true") !== enabled) b.click(); };
      toggle("cheat.forgeMax", true); toggle("cheat.enabled", true); await sleep(2000); toggle("cheat.enabled", false); await sleep(1000);
      const ok = it => it && ["unique", "set", "runeword"].includes(it.rarity) && Array.isArray(it.mods) && it.mods.length;
      const fresh = it => ok(it) && !it.forge; const item = (g.inventoryOf(cls) || []).find(fresh) || Object.values(g.save.equippedByClass[cls] || {}).find(fresh) || (g.inventoryOf(cls) || []).find(ok) || Object.values(g.save.equippedByClass[cls] || {}).find(ok);
      if (!item) throw new Error("副本中沒有可淬鍊裝備");
      const trace = { cls, item: { name: item.name, base: item.base, rarity: item.rarity, id: item.id }, essencesBefore: essences() };
      // 1) 放上鐵砧，等面板對準
      g.anvil = item.id; await sleep(1800);
      const st = window.__d2autoforgeUI.state;
      // 收合／展開按鈕：用真實點擊驗證（收合後不可被同一次點擊又展開）
      { if (!g.forgeUp) g.forgeUp = true; await sleep(800); const p = () => document.querySelector("#d2autoforge-panel");
        const f = []; f.push(st.folded); p()?.click(); await sleep(400); f.push(st.folded);
        p()?.querySelector("#af-fold")?.click(); await sleep(400); f.push(st.folded, p()?.offsetWidth);
        p()?.click(); await sleep(400); f.push(st.folded); trace.foldSeq = f; }
      trace.attachedName = st.itemName; trace.attachedTargetsBefore = { ...st.targets };
      // 2) 以第一條屬性 ≥1 執行到結束（hook 會寫入記憶）
      const lines = window.__d2autoforgeUI.lines(item.id);
      trace.lines = lines.map(l => l.key + ":" + l.text);
      window.__d2autoforgeUI.start([{ id: item.id, targets: { [lines[0].key]: ${Number(process.env.H_TGT || 1)} } }], cls);
      const t0 = Date.now();
      for (let i = 0; i < 1200 && window.__d2autoforgeUI.state.running; i++) await sleep(500);
      trace.elapsedSec = Math.round((Date.now() - t0) / 1000);
      trace.running = window.__d2autoforgeUI.state.running;
      trace.steps = window.__d2autoforgeUI.state.steps;
      trace.result = window.__d2autoforgeUI.state.result;
      trace.log = window.__d2autoforgeUI.state.log.slice(-40);
      trace.essencesAfter = essences();
      const after = (g.inventoryOf(cls) || []).find(v => v?.id === item.id) || g.save.equippedByClass[cls]?.[Object.keys(g.save.equippedByClass[cls] || {}).find(k => g.save.equippedByClass[cls][k]?.id === item.id)];
      trace.forgeAfter = after?.forge ?? null;
      // 3) 移開再放回同一件，確認記憶帶入
      g.anvil = null; await sleep(1500);
      g.anvil = item.id; await sleep(1800);
      trace.targetsAfterReput = { ...window.__d2autoforgeUI.state.targets };
      trace.memory = JSON.parse(localStorage.getItem("d2autoforge.memory") || "{}");
      trace.panelShown = !!document.querySelector("#d2autoforge-panel");
      return trace;
    })()`);
    if (!result.error) {
      win.setContentSize(375, 812);
      await sleep(2500);
      result.mobile = await win.webContents.executeJavaScript(`(() => { const p = document.querySelector("#d2autoforge-panel"); if (!p) return { panel: false }; const r = p.getBoundingClientRect(); return { panel: true, rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right), bottom: Math.round(r.bottom) }, vw: innerWidth, vh: innerHeight, overflowsRight: r.right > innerWidth, overflowsBottom: r.bottom > innerHeight, folded: /展開/.test(p.textContent) }; })()`);
      try {
        const img = await win.webContents.capturePage();
        fs.writeFileSync(SHOT, img.toPNG());
        result.mobileShot = SHOT;
      } catch (e) { result.mobileShot = "截圖失敗：" + String(e?.message || e); }
    }
    done(result);
  } catch (e) { done({ error: String(e?.stack || e) }, 1); }
});
