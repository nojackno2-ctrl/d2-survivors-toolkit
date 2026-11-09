// 用法：H_SEED=解碼後的存檔.json H_CLASS=sorceress H_OUT=輸出.json electron tests/live-harness/autoforge-latency-live.cjs
// 量測自動淬鍊面板「改下拉選單 → 面板重繪完成」的耗時（本地版程式、官方網址遊戲）。
//   1) 把副本中的一件暗金／套裝／符文之語放上鐵砧，面板自動對準；
//   2) 依序改變各條屬性的下拉選單值，每次以 performance.now() 量同步 onchange 的耗時，
//      並等兩幀（rAF）確認畫面已更新；
//   3) 回報耗時與面板上的機率文字，供與目標 50ms 比較。
const { app, BrowserWindow, session, net } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");
const PAGES = "https://nojackno2-ctrl.github.io/d2-survivors-toolkit/";
const OUT = process.env.H_OUT || null;
const CLASS = process.env.H_CLASS || "sorceress";
const SEED = fs.readFileSync(process.env.H_SEED, "utf8");
const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".html": "text/html", ".css": "text/css", ".svg": "image/svg+xml" };
app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "d2latency-")));
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
  setTimeout(() => done({ error: "實機測試逾時" }, 1), 600000);
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  try {
    // H_PUBLISHED=1：不攔截，直接載入 GitHub Pages 上已發布的工具包（等同玩家書籤）
    if (!process.env.H_PUBLISHED) session.defaultSession.protocol.handle("https", (req) => {
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
      const frames = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
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
      const ok = it => it && ["unique", "set", "runeword"].includes(it.rarity) && Array.isArray(it.mods) && it.mods.length;
      const item = (g.inventoryOf(cls) || []).find(ok) || Object.values(g.save.equippedByClass[cls] || {}).find(ok);
      if (!item) throw new Error("副本中沒有可淬鍊裝備");
      if (!g.forgeUp) g.forgeUp = true;
      g.anvil = item.id; await sleep(1800);
      const ui = window.__d2autoforgeUI;
      const panel = () => document.querySelector("#d2autoforge-panel");
      if (!panel()) throw new Error("面板未出現");
      // 面板預設收合（只剩圖示，無下拉選單）；收合時點面板即展開。
      if (ui.state.folded) { panel().click(); await sleep(500); }
      if (!panel()?.querySelector("select[data-key]")) throw new Error("展開後仍找不到下拉選單");
      const trace = { cls, item: { name: item.name, rarity: item.rarity }, lines: ui.lines(item.id).map(l => l.key + ":" + l.text), samples: [] };
      const keys = trace.lines.map(s => s.split(":")[0]);
      // 依序設定各條屬性的值（0 不限、X 禁止、1..5），每次量測同步重繪耗時與兩幀後的畫面更新時間
      const values = ["1", "3", "5", "X", "0", "2"];
      for (let round = 0; round < values.length; round++) {
        const key = keys[round % keys.length], v = values[round];
        const sel = () => panel()?.querySelector('select[data-key="' + key + '"]');
        const el = sel();
        if (!el) { trace.samples.push({ key, v, error: "找不到下拉選單" }); continue; }
        el.value = v;
        const t0 = performance.now();
        el.dispatchEvent(new Event("change"));
        const syncMs = performance.now() - t0;
        const t1 = performance.now();
        await frames();
        const frameMs = performance.now() - t1;
        const text = panel()?.textContent || "";
        const m = text.match(/每回合走到熔爐的機率[^\\n]*|此設定在[^\\n]*/);
        trace.samples.push({ key, v, syncMs: Math.round(syncMs * 10) / 10, twoFramesMs: Math.round(frameMs * 10) / 10, odds: m ? m[0].slice(0, 80) : "（無機率文字）" });
        await sleep(200);
      }
      const all = trace.samples.filter(s => typeof s.syncMs === "number").map(s => s.syncMs);
      trace.maxSyncMs = all.length ? Math.max(...all) : null;
      trace.avgSyncMs = all.length ? Math.round(all.reduce((a, b) => a + b, 0) / all.length * 10) / 10 : null;
      return trace;
    })()`);
    done(result);
  } catch (e) { done({ error: String(e?.stack || e) }, 1); }
});
