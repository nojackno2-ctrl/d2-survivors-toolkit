// 用法：electron tests/live-harness/afk-fresh-live.cjs [輸出.json]
// 同 afk-live.cjs，但使用全新存檔（不讀任何使用者存檔）：以修改器產生器做一件暗金放入背包，再執行淬鍊與掛機檢查。
// 驗證「掛機」按鈕（自動淬鍊面板）在官方網址實機上的行為：
//   1) 真實滑鼠點「掛機」→ 畫面出現全黑遮罩，且遮罩位於畫面最上層（中心點命中遮罩）；
//   2) 遮罩開啟期間自動淬鍊仍在執行（步數持續增加）；
//   3) 真實滑鼠點遮罩 → 遮罩移除、面板恢復可見。
const { app, BrowserWindow, session, net } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");
const PAGES = "https://nojackno2-ctrl.github.io/d2-survivors-toolkit/";
const OUT = process.argv.slice(2).find((a) => !a.startsWith("--") && !a.endsWith("electron.exe") && a !== ".");
const CLASS = process.env.H_CLASS || "sorceress";
const SEED = "";
// 可選：H_ITEM 指向一件裝備 JSON（暗金／套裝／符文之語），在副本存檔沒有時注入到裝備欄。
const ITEM = process.env.H_ITEM ? fs.readFileSync(process.env.H_ITEM, "utf8") : null;
const SHOT = process.env.H_SHOT || path.join(os.tmpdir(), "afk-black.png");
const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".html": "text/html", ".css": "text/css", ".svg": "image/svg+xml" };
app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "d2afk-")));
app.whenReady().then(async () => {
  let finished = false;
  const done = (result, code = 0) => {
    if (finished) return;
    finished = true;
    const json = JSON.stringify(result, null, 2);
    if (OUT) fs.writeFileSync(OUT, json + "\n"); else console.log(json);
    app.exit(code);
  };
  setTimeout(() => done({ error: "實機測試逾時" }, 1), 600000);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
    await win.webContents.executeJavaScript(`localStorage.removeItem("d2-survivors/save/v1"); localStorage.removeItem("d2autoforge.memory");`);
    await win.loadURL("https://d2survivors.lol/play/").catch(() => {});
    await sleep(4000);
    await win.webContents.executeJavaScript(`(()=>{const b=[...document.querySelectorAll("button")].find(x=>/hosted/i.test(x.textContent));if(b)b.click()})()`);
    await sleep(12000);
    const setup = await win.webContents.executeJavaScript(`(async () => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      await import(${JSON.stringify(PAGES + "d2edit.js?v=")} + Date.now());
      for (let i = 0; i < 120 && !window.__d2autobot?.game; i++) { document.body.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true })); await sleep(500); }
      for (let i = 0; i < 60 && !window.__d2autoforgeUI; i++) await sleep(500);
      const g = window.__d2autobot?.game;
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
      const ess = () => (g.save?.inventoryByClass?.[cls] || []).filter(i => i?.type === "essence" && i.base === "Burning Essence of Terror").reduce((s, i) => s + (i.count ?? 1), 0);
      // 測試存檔沒有恐懼精華時，用修改器的 cheat 補上（隔離存檔副本，不影響使用者原檔）。
      if (ess() < 5) {
        const root = document.querySelector("#d2autobot-panel")?.shadowRoot;
        const toggle = (name, on) => { const b = root?.querySelector('[data-setting="' + name + '"]'); if (!b) throw new Error("找不到設定：" + name); if ((b.getAttribute("aria-checked") === "true") !== on) b.click(); };
        toggle("cheat.forgeMax", true); toggle("cheat.enabled", true); await sleep(2000); toggle("cheat.enabled", false); await sleep(1500);
      }
      // 全新存檔：用修改器的產生器做一件暗金（不讀任何使用者存檔），放進背包。
      const gen = await window.__d2editBackend.engine("generateMany", [{ rarity: "unique", name: "Harlequin Crest", max: true, free: true }], true);
      const made = gen?.[0]?.item;
      if (!made) throw new Error("產生裝備失敗：" + JSON.stringify(gen?.[0] ?? null).slice(0, 300));
      g.save.inventoryByClass = g.save.inventoryByClass || {}; g.save.inventoryByClass[cls] = g.save.inventoryByClass[cls] || []; g.save.inventoryByClass[cls].push(made);
      let item = (g.inventoryOf(cls) || []).find(ok) || Object.values(g.save.equippedByClass[cls] || {}).find(ok);
      if (!item && ${JSON.stringify(ITEM)}) {
        const it = JSON.parse(${JSON.stringify(ITEM)}); it.id = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
        g.save.equippedByClass[cls] = g.save.equippedByClass[cls] || {}; g.save.equippedByClass[cls].weapon = it; item = it;
      }
      if (!item) throw new Error("副本中沒有可淬鍊裝備");
      g.anvil = item.id; if (!g.forgeUp) g.forgeUp = true;
      await sleep(1800);
      const lines = window.__d2autoforgeUI.lines(item.id);
      window.__d2autoforgeUI.state.targets = Object.fromEntries(lines.map(l => [l.key, 0]));
      window.__d2autoforgeUI.state.targets[lines[0].key] = 1;
      return { item: item.name, cls, panel: !!document.querySelector("#d2autoforge-panel") };
    })()`);
    if (setup && setup.error) throw new Error(setup.error);
    const rectOf = (sel) => win.webContents.executeJavaScript(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`);
    const click = async (p) => { win.webContents.sendInputEvent({ type: "mouseDown", x: p.x, y: p.y, button: "left", clickCount: 1 }); await sleep(40); win.webContents.sendInputEvent({ type: "mouseUp", x: p.x, y: p.y, button: "left", clickCount: 1 }); };
    const out = { setup };
    // 先真實點「開始」讓淬鍊跑起來，再點「掛機」
    // 面板預設收合：先點圖示展開，才會出現按鈕。
    await win.webContents.executeJavaScript(`(() => { if (!document.querySelector("#af-start")) document.querySelector("#d2autoforge-panel")?.click(); })()`);
    await sleep(800);
    const startP = await rectOf("#af-start");
    out.startBtn = startP;
    if (startP) await click(startP);
    await sleep(3000);
    out.runningBefore = await win.webContents.executeJavaScript(`({ running: window.__d2autoforgeUI.state.running, steps: window.__d2autoforgeUI.state.steps, result: window.__d2autoforgeUI.state.result, log: (window.__d2autoforgeUI.state.log || []).slice(-8) })`);
    out.afkBtn = "工具包選單：掛機";
    await win.webContents.executeJavaScript(`(async () => { const g = window.__d2autobot.game; const isPaused = () => document.body.classList.contains("frontend-over-run") || document.body.classList.contains("frontend-open") || (() => { const q = document.getElementById("paused"); return !!q && !q.classList.contains("hidden") && getComputedStyle(q).display !== "none"; })(); for (let i = 0; i < 20 && !isPaused(); i++) { try { g.pause(); } catch (e) {} await new Promise(r => setTimeout(r, 700)); } document.getElementById("d2toolkit-launcher")?.click(); await new Promise(r => setTimeout(r, 400)); [...(document.getElementById("d2toolkit-menu")?.children || [])].find(c => c.textContent === "掛機")?.click(); })()`);
    await sleep(800);
    await sleep(800);
    out.overlay = await win.webContents.executeJavaScript(`(() => {
      const o = document.querySelector("#d2autoforge-afk"); if (!o) return { exists: false };
      const r = o.getBoundingClientRect(); const hit = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
      return { exists: true, covers: Math.round(r.width) === innerWidth && Math.round(r.height) === innerHeight, bg: getComputedStyle(o).backgroundColor, hitIsOverlay: hit === o || o.contains(hit), zIndex: getComputedStyle(o).zIndex };
    })()`);
    const stepsA = await win.webContents.executeJavaScript(`window.__d2autoforgeUI.state.steps`);
    await sleep(8000);
    out.stepsDuringAfk = { start: stepsA, end: await win.webContents.executeJavaScript(`window.__d2autoforgeUI.state.steps`), running: await win.webContents.executeJavaScript(`window.__d2autoforgeUI.state.running`) };
    try { fs.writeFileSync(SHOT, (await win.webContents.capturePage()).toPNG()); out.shot = SHOT; } catch (e) { out.shot = "截圖失敗：" + e.message; }
    const ovP = { x: Math.round(await win.webContents.executeJavaScript("innerWidth/2")), y: Math.round(await win.webContents.executeJavaScript("innerHeight/2")) };
    await click(ovP);
    await sleep(800);
    out.afterWake = await win.webContents.executeJavaScript(`({ overlayGone: !document.querySelector("#d2autoforge-afk"), panelVisible: !!document.querySelector("#d2autoforge-panel") })`);
    // 停止，避免測試結束後仍在跑
    await win.webContents.executeJavaScript(`window.__d2autoforgeUI.stop()`);
    done(out);
  } catch (e) { done({ error: String(e?.stack || e) }, 1); }
});
