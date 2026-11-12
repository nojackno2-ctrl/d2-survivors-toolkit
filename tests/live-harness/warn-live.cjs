// 用法：electron tests/live-harness/queue-source-live.cjs [輸出.json]
// 驗證「加入同名」一鍵加入序列、來源切換（角色背包／個人倉庫）在官方 /play/ 實機上的行為（全新存檔，不讀使用者存檔）。
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
        if (!g.plainSelect().onPick) { g.chooseClass(); await sleep(1500); }
        const select = g.plainSelect(), cls = ${JSON.stringify(CLASS)};
        const index = select.cards.findIndex(c => c.dataset?.class === cls);
        if (index < 0) throw new Error("找不到職業：" + cls);
        select.select(index); await sleep(300); select.confirm(false);
      }
      for (let i = 0; i < 120 && !g.world?.player && g.state !== "camp"; i++) await sleep(500);
      const cls = g.kit?.id;
      const gen = async (n) => { const r = await window.__d2editBackend.engine("generateMany", Array.from({ length: n }, () => ({ rarity: "unique", name: "Harlequin Crest", max: true, free: true })), true); return r.map(x => x?.item).filter(Boolean); };
      const bagTwo = await gen(2), stashOne = await gen(1);
      if (bagTwo.length < 2 || !stashOne.length) throw new Error("產生裝備失敗");
      g.save.inventoryByClass = g.save.inventoryByClass || {}; g.save.inventoryByClass[cls] = g.save.inventoryByClass[cls] || [];
      g.save.inventoryByClass[cls].push(...bagTwo);
      g.save.stashTabs = g.save.stashTabs || {}; g.save.stashTabs[cls] = g.save.stashTabs[cls] || [];
      g.save.stashTabs[cls].push(...stashOne);
      await sleep(500);
      g.forgeUp = true; await sleep(800);
      if (!document.querySelector("#af-start")) document.querySelector("#d2autoforge-panel")?.click();
      await sleep(600);
      return { cls, bag: bagTwo.length, stash: stashOne.length, panel: !!document.querySelector("#d2autoforge-panel"), invLen: (g.inventoryOf?.(cls)||[]).length, invRaw: (g.save.inventoryByClass[cls]||[]).length, panelText: (document.querySelector("#d2autoforge-panel")?.innerText||"").slice(0,300) };
    })()`);
    if (setup && setup.error) throw new Error(setup.error);
    const out = { setup };
    const exec = (code) => win.webContents.executeJavaScript(code);
    const click = async (p) => { win.webContents.sendInputEvent({ type: "mouseDown", x: p.x, y: p.y, button: "left", clickCount: 1 }); await sleep(40); win.webContents.sendInputEvent({ type: "mouseUp", x: p.x, y: p.y, button: "left", clickCount: 1 }); };
    const rectOf = (sel) => exec(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`);
    // 展開面板
    
    await sleep(800);
    out.beforeAdd = await exec(`({ rows: document.querySelectorAll("[data-addsame]").length, queue: window.__d2autoforgeUI.state.queue.length, label: document.querySelector("[data-addsame]")?.textContent })`);
    // 1) 真實點「加入同名」→ 兩件同名都應進序列
    const addP = await rectOf("[data-addsame]");
    if (addP) await click(addP);
    await sleep(500);
    out.afterAddSame = await exec(`({ queue: window.__d2autoforgeUI.state.queue.map(q => q.name), queueRows: document.querySelectorAll("[data-del]").length })`);
    // 2) 切到個人倉庫 → 清單應只剩倉庫裝備
    const stashP = await rectOf("[data-source=stash]");
    if (stashP) await click(stashP);
    await sleep(500);
    out.stashView = await exec(`({ source: window.__d2autoforgeUI.state.source, rows: [...document.querySelectorAll("[data-select]")].length, heading: [...document.querySelectorAll("#d2autoforge-panel b, [id=d2autoforge-panel] b")].map(b => b.textContent).join(" | ") })`);
    // 3) 倉庫裝備放上鐵砧後，真實點「開始」看遊戲是否接受
    const selP = await rectOf("[data-select]");
    if (selP) await click(selP);
    await sleep(800);
    out.anvilFromStash = await exec(`({ anvil: window.__d2autobot.game.anvil, itemLoaded: window.__d2autoforgeUI.state.itemId, lines: window.__d2autoforgeUI.state.lines.length })`);
    // 作弊補恐懼精華（隔離存檔，與 afk 測試相同做法）。
    out.cheat = await exec(`(async () => { try { const root = document.querySelector("#d2autobot-panel")?.shadowRoot; const tg = (n, on) => { const b = root?.querySelector('[data-setting="' + n + '"]'); if (!b) throw new Error("找不到設定：" + n); if ((b.getAttribute("aria-checked") === "true") !== on) b.click(); }; tg("cheat.forgeMax", true); tg("cheat.enabled", true); await new Promise(r => setTimeout(r, 2000)); tg("cheat.enabled", false); await new Promise(r => setTimeout(r, 1500)); return "cheat-ok"; } catch (e) { return "cheat-error: " + e.message; } })()`).then(v => { out.cheat = v; });
    // 清空序列（只測倉庫裝備），為它設定目標，再按「開始」看遊戲是否接受倉庫裝備。
    const qcP = await rectOf("#af-qclear");
    if (qcP) await click(qcP);
    await sleep(400);
    out.targetsSet = await exec(`(() => { const s = window.__d2autoforgeUI.state; const t = {}; s.lines.forEach((l, i) => t[l.key] = i === 0 ? 1 : 0); s.targets = t; localStorage.setItem("d2autoforge.memory", JSON.stringify({ [s.itemKey]: t })); return { key: s.itemKey, queue: s.queue.length, lines: s.lines.length }; })()`);
    await sleep(300);
    const startP = await rectOf("#af-start");
    if (startP) await click(startP);
    // loop() 啟動時會重置統計，所以要在開始後再把目標屬性的計數設為 199（再一次成功淬煉即達 200）。
    await sleep(300);
    out.presetKey = await exec(`(() => { const s = window.__d2autoforgeUI.state; const k = Object.keys(s.targets).find((x) => Number(s.targets[x]) > 0); s.sinceUp = { [k]: 199 }; return k; })()`);
    await sleep(Number(process.env.H_WARN_MS || 60000));
    out.afterStart = await exec(`({ running: window.__d2autoforgeUI.state.running, steps: window.__d2autoforgeUI.state.steps, result: window.__d2autoforgeUI.state.result, warn: window.__d2autoforgeUI.state.warn, sinceUp: window.__d2autoforgeUI.state.sinceUp, log: (window.__d2autoforgeUI.state.log || []).slice(-6) })`);
    await exec(`window.__d2autoforgeUI.stop()`);
    done(out);
  } catch (e) { done({ error: String(e?.stack || e) }, 1); }
});
