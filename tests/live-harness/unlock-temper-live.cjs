// 用法：H_SEED=使用者存檔副本.json H_ITEM=解鎖裝備.json H_CLASS=sorceress electron tests/live-harness/unlock-temper-live.cjs [輸出.json]
// 實測「解鎖產生、從未淬鍊過的裝備」第一次淬鍊時，官方伺服器 POST /forge 的實際回應。
// 流程：使用者存檔副本（隔離設定檔，不改原檔）→ 作弊給 99 精華 → 把裝備放進背包 → 設為鐵砧 → 遊戲自己的 forgeTry(temper) 一次。
// 會攔截 /forge 的請求與回應並記錄。不啟動戰鬥、不結束一局，因此不會產生通關紀錄。
const { app, BrowserWindow, session, net } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");
const PAGES = "https://nojackno2-ctrl.github.io/d2-survivors-toolkit/";
const OUT = process.argv.slice(2).find((a) => !a.startsWith("--") && !a.endsWith("electron.exe") && a !== ".");
const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".html": "text/html", ".css": "text/css", ".svg": "image/svg+xml" };
const SEED = fs.readFileSync(process.env.H_SEED, "utf8");
const ITEM = fs.readFileSync(process.env.H_ITEM, "utf8");
const CLASS = process.env.H_CLASS || "sorceress";
app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "d2unlock-")));
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
  setTimeout(() => done({ error: "實機測試逾時" }, 1), 280000);
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  try {
    session.defaultSession.protocol.handle("https", (req) => {
      if (!req.url.startsWith(PAGES)) return net.fetch(req, { bypassCustomProtocolHandlers: true });
      const rel = decodeURIComponent(new URL(req.url).pathname.slice("/d2-survivors-toolkit/".length));
      const file = path.resolve(ROOT, rel);
      if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return new Response("not found", { status: 404 });
      return new Response(fs.readFileSync(file), { headers: { "content-type": (MIME[path.extname(file)] || "application/octet-stream") + "; charset=utf-8", "access-control-allow-origin": "*", "cache-control": "no-store" } });
    });
    // 主程序層級記錄 /forge 的請求與回應（不依賴頁面內的 fetch 包裝）
    const netLog = [];
    session.defaultSession.webRequest.onBeforeRequest((d, cb) => {
      if (d.method !== "GET") netLog.push({ phase: "request", url: d.url, method: d.method, body: (d.uploadData?.[0]?.bytes?.toString() || "").slice(0, 400) });
      cb({});
    });
    session.defaultSession.webRequest.onCompleted((d) => {
      if (d.url.includes("/forge")) netLog.push({ phase: "completed", url: d.url, status: d.statusCode });
    });
    session.defaultSession.webRequest.onErrorOccurred((d) => {
      if (d.url.includes("/forge")) netLog.push({ phase: "error", url: d.url, error: d.error });
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
      for (let i = 0; i < 120 && !window.__d2autobot?.game; i++) {
        document.body.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true }));
        await sleep(500);
      }
      const bot = window.__d2autobot, g = bot?.game;
      if (!g) throw new Error("找不到遊戲物件：" + JSON.stringify(bot?.diagnostics?.()));
      if (g.state === "select") {
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
      const toggle = (name, enabled) => {
        const button = root?.querySelector('[data-setting="' + name + '"]');
        if (!button) throw new Error("找不到設定：" + name);
        if ((button.getAttribute("aria-checked") === "true") !== enabled) button.click();
        if ((button.getAttribute("aria-checked") === "true") !== enabled) throw new Error("設定切換失敗：" + name);
      };
      const trace = { state: g.state, cls, essencesBefore: essences() };
      // 1) 作弊給 99 精華（與 forge-essence-live 相同方式）
      toggle("cheat.forgeMax", true); toggle("cheat.enabled", true);
      await sleep(2000);
      toggle("cheat.enabled", false);
      await sleep(1500);
      trace.essencesAfterCheat = essences();
      // 2) 攔截 /forge 的請求與回應
      const forgeLog = [];
      const realFetch = window.fetch.bind(window);
      window.fetch = async (u, o) => {
        const r = await realFetch(u, o);
        if (String(u).includes("/forge")) {
          let body = ""; try { body = (await r.clone().text()).slice(0, 600); } catch (e) {}
          forgeLog.push({ url: String(u), act: (() => { try { return JSON.parse(o?.body || "{}").act; } catch (e) { return null; } })(), status: r.status, body });
        }
        return r;
      };
      // 3) 把解鎖裝備放進背包（沒有任何淬鍊紀錄）並設為鐵砧
      // H_CONTROL=1：對照組，改用使用者存檔裡本來就裝備的武器（不注入解鎖裝備）
      const item = ${JSON.stringify(process.env.H_CONTROL ? "control" : "")} === "control"
        ? g.save.equippedByClass?.[cls]?.weapon
        : JSON.parse(${JSON.stringify(ITEM)});
      if (!item) throw new Error("沒有可用的鐵砧裝備");
      if (${JSON.stringify(process.env.H_CONTROL ? "control" : "")} !== "control") {
        g.save.inventoryByClass[cls] = g.save.inventoryByClass[cls] || [];
        g.save.inventoryByClass[cls].push(item);
      }
      trace.itemBefore = { id: item.id, name: item.name, rarity: item.rarity, forge: item.forge ?? null };
      g.anvil = item.id;
      // 4) 遊戲自己的淬鍊流程，只做一次
      let ret;
      try { ret = await g.forgeTry(cls, 1, "temper", () => {}); } catch (e) { ret = { threw: String(e && e.message || e) }; }
      await sleep(2500);
      window.fetch = realFetch;
      trace.forgeTryReturn = ret;
      trace.essencesAfterTemper = essences();
      trace.itemAfter = (() => { const it = (g.save.inventoryByClass[cls] || []).find(x => x?.id === item.id); return it ? { forge: it.forge ?? null } : null; })();
      trace.forgeRequests = forgeLog;
      trace.diagnostics = bot.diagnostics?.() ?? null;
      return trace;
    })()`);
    result.netLog = netLog;
    done(result);
  } catch (e) { done({ error: String(e?.stack || e) }, 1); }
});
