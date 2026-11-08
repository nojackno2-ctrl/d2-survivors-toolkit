// 用法（自動淬鍊序列：同一件裝備複製 3 份，目標記憶依名稱共用，三件都會跑，見 helper/autoforge-ui.js）：H_ITEM=裝備JSON electron autoforge-live.cjs 輸出.json
// 用法：electron tests/live-harness/temper-game-flow-live.cjs [輸出.json]
// 驗證「遊戲自己的淬鍊流程」(Game.forgeTry) 在官方 /play/ 實機的結果：
//   全新隔離存檔 → 作弊給 99 顆恐怖燃燒精華 → 以起始武器當鐵砧物品 → forgeTry(cls, level, "temper")
//   → 檢查精華扣除、forge 紀錄、以及是否寫入 localStorage。
// 工具包由 PAGES 攔截至本機檔案；遊戲本體來自官方網址。僅使用隔離的 userData（全新存檔），不碰使用者存檔。
const { app, BrowserWindow, session, net } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");
const PAGES = "https://nojackno2-ctrl.github.io/d2-survivors-toolkit/";
const OUT = process.argv.slice(2).find((a) => !a.startsWith("--") && !a.endsWith("electron.exe") && a !== ".");
const CLASS = process.env.H_CLASS || "sorceress";
if (process.env.H_ITEM) process.env.H_ITEM_JSON = fs.readFileSync(process.env.H_ITEM, "utf8");
if (process.env.H_ITEM2) process.env.H_ITEM2_JSON = fs.readFileSync(process.env.H_ITEM2, "utf8");
const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".html": "text/html", ".css": "text/css", ".svg": "image/svg+xml" };
app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "d2gameflow-")));
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
      const items = [0,1,2].map(k => ({ ...JSON.parse(${JSON.stringify(process.env.H_ITEM_JSON || "null")}), id: "afq" + k + Date.now().toString(36) }));
      if (!items.length) throw new Error("缺少 H_ITEM");
      g.save.inventoryByClass = g.save.inventoryByClass || {};
      g.save.inventoryByClass[cls] = g.save.inventoryByClass[cls] || [];
      for (const it of items) g.save.inventoryByClass[cls].push(it);
      // 序列：目標依名稱共用記憶，三件都會跑；另外用面板「加入」按鈕實際點擊確認 UI。
      g.forgeUp = true; await sleep(1200);
      const p = document.querySelector("#d2autoforge-panel"); if (window.__d2autoforgeUI.state.folded) p.click(); await sleep(400);
      const addBtns = [...p.querySelectorAll("[data-add]")].map(x => x.dataset.add);
      p.querySelector("[data-add]")?.click(); await sleep(300);
      const trace = { cls, essencesBefore: essences(), bagListed: addBtns.length, queueAfterClick: window.__d2autoforgeUI.state.queue.length };
      const t = (it) => { const lines = window.__d2autoforgeUI.lines(it.id); const o = {}; for (const l of lines) o[l.key] = 0; if (lines[0]) o[lines[0].key] = 1; return o; };
      const ids = items.map(i => i.id);
      const targets = { [ids[0]]: t(items[0]), [ids[2]]: t(items[2]) };
      const t0 = Date.now();
      await window.__d2autoforgeUI.queueRun(ids, targets, cls);
      trace.elapsedSec = (Date.now() - t0) / 1000;
      trace.queue = window.__d2autoforgeUI.state.queue.map(q => q.name + " => " + q.status);
      const st = window.__d2autoforgeUI.state;
      trace.log = st.log.slice(-60);
      trace.running = st.running;
      trace.essencesAfter = essences();
      trace.forge = items.map(it => { const x = (g.inventoryOf?.(cls) || []).find(v => v?.id === it.id); return { name: it.name, forge: x?.forge ?? null }; });
      return trace;
    })()`);
    done(result);
  } catch (e) { done({ error: String(e?.stack || e) }, 1); }
});
