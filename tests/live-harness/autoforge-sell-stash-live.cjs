// 用法：electron tests/live-harness/autoforge-sell-stash-live.cjs [輸出.json]
// 驗證「地獄熔爐失敗自動售出」在官方 /play/ 實機是否真的生效（背包與個人倉庫各一件）：
//   全新隔離存檔 → 注入兩件熔爐失敗（hf:1、淬鍊清空）的暗金裝備：一件在背包、一件在個人倉庫。
//   階段 A：熔爐失敗的裝備不得出現在背包可淬鍊清單（data-select 按鈕不存在）。
//   階段 B：背包那件放上鐵砧、開啟「熔爐失敗就自動售出」→ 應從背包消失且金幣增加。
//   階段 C：倉庫那件放上鐵砧 → 應從倉庫（與背包）消失且金幣增加。
// 工具包由 PAGES 攔截至本機檔案；遊戲本體來自官方網址 https://d2survivors.lol/play/。
// 僅使用隔離的 userData（全新存檔），不碰使用者存檔。
const { app, BrowserWindow, session, net } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");
const PAGES = "https://nojackno2-ctrl.github.io/d2-survivors-toolkit/";
const OUT = process.argv.slice(2).find((a) => !a.startsWith("--") && !a.endsWith("electron.exe") && a !== ".");
const CLASS = process.env.H_CLASS || "sorceress";
const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".html": "text/html", ".css": "text/css", ".svg": "image/svg+xml" };
// 熔爐失敗的暗金樣本（The Stone of Jordan），forge 紀錄：hf 已用、淬鍊清空。
const BASE_ITEM = {"id":"fvqqng8gmw76yr40","base":"Ring","type":"ring","rarity":"unique","name":"The Stone of Jordan","level":99,"stats":[{"stat":"maxmana","value":20},{"stat":"item_maxmana_percent","value":25},{"stat":"lightmindam","value":1},{"stat":"item_allskills","value":1},{"stat":"lightmaxdam","value":12}],"mods":[{"stat":"mana","value":20},{"stat":"fcr","value":6.25},{"stat":"lightningMinDamage","value":1},{"stat":"allSkills","value":1},{"stat":"lightningMaxDamage","value":12}],"roll":[1,1018700716,99]};
app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "d2sellstash-")));
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
        if (!g.plainSelect().onPick) { g.chooseClass(); await sleep(1500); }
        const select = g.plainSelect(), cls = ${JSON.stringify(CLASS)};
        const index = select.cards.findIndex(c => c.dataset?.class === cls);
        if (index < 0) throw new Error("找不到職業：" + cls);
        select.select(index); await sleep(300); select.confirm(false);
      }
      for (let i = 0; i < 120 && !g.world?.player && g.state !== "camp"; i++) await sleep(500);
      const cls = g.kit?.id;
      const UI = window.__d2autoforgeUI;
      const base = ${JSON.stringify(BASE_ITEM)};
      const bagItem = { ...base, id: "bagfail" + Date.now().toString(36), forge: { hf: 1, t: {} } };
      const stashItem = { ...base, id: "stashfail" + Date.now().toString(36), forge: { hf: 1, t: {} } };
      g.save.inventoryByClass[cls] = [...(g.save.inventoryByClass[cls] || []), bagItem];
      g.save.stashTabs = g.save.stashTabs || {};
      g.save.stashTabs[cls] = [...(g.save.stashTabs[cls] || []), stashItem];
      const inBag = id => (g.save.inventoryByClass[cls] || []).some(x => x?.id === id);
      const inStash = id => (g.save.stashTabs[cls] || []).some(x => x?.id === id);
      const panel = () => document.querySelector("#d2autoforge-panel");
      const trace = { cls, bagId: bagItem.id, stashId: stashItem.id, goldStart: g.save.gold, phases: {} };

      // 階段 A：開啟面板（未放鐵砧），熔爐失敗的裝備不應出現在背包可淬鍊清單。
      g.anvil = null; g.forgeUp = true; UI.state.folded = false; await sleep(1200);
      const p0 = panel();
      const rowsA = [...document.querySelectorAll("#d2autoforge-panel [data-select]")].map(x => x.dataset.select);
      trace.phases.A = { panelShown: !!p0, bagRowCount: rowsA.length, bagRowIds: rowsA, bagFailHidden: !rowsA.includes(bagItem.id), panelHasBagTitle: !!p0 && /背包可淬鍊/.test(p0.innerText), panelTextSample: p0 ? p0.innerText.slice(0, 200) : null };

      // 階段 B：背包的熔爐失敗裝備放上鐵砧，勾選自動售出 → 應從背包消失、金幣增加。
      g.anvil = bagItem.id; g.forgeUp = true; await sleep(1200);
      const cbB = panel()?.querySelector("#af-autosell");
      if (!cbB) throw new Error("找不到 #af-autosell（階段 B）");
      cbB.click(); await sleep(1500);
      trace.phases.B = { soldFromBag: !inBag(bagItem.id), goldAfter: g.save.gold, result: UI.state.result, log: UI.state.log.slice(-4) };

      // 階段 C：倉庫的熔爐失敗裝備放上鐵砧（自動售出已開）→ 應從倉庫與背包都消失、金幣增加。
      const goldBeforeC = g.save.gold;
      g.anvil = stashItem.id; await sleep(1500);
      trace.phases.C = { soldFromStash: !inStash(stashItem.id), inBagNow: inBag(stashItem.id), goldBefore: goldBeforeC, goldAfter: g.save.gold, result: UI.state.result, log: UI.state.log.slice(-4) };
      // 階段 D：熔爐成功（倍增）的裝備放上鐵砧（自動售出仍開）→ 不載入面板、不售出、仍在背包。
      const okItem = { ...base, id: "okdouble" + Date.now().toString(36), forge: { hf: 1, t: { fcr: 2 } } };
      g.save.inventoryByClass[cls] = [...(g.save.inventoryByClass[cls] || []), okItem];
      g.anvil = okItem.id; await sleep(1500);
      const pD = panel();
      trace.phases.D = { panelShowsItem: !!UI.state.itemId, panelNotice: !!pD && /地獄熔爐已(成功|失敗)/.test(pD.innerText), stillInBag: inBag(okItem.id) };
      g.forgeUp = false; g.anvil = null;
      return trace;
    })()`);
    done(result);
  } catch (e) { done({ error: String(e?.stack || e) }, 1); }
});
