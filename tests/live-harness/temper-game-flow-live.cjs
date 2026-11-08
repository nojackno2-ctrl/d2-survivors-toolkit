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
    const win = new BrowserWindow({ width: 1100, height: 800, show: true, webPreferences: { webSecurity: false, backgroundThrottling: false } });
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
      const essences = () => {
        const inv = g.save?.inventoryByClass?.[cls] || [];
        const st = inv.filter(i => i?.type === "essence" && i.base === essenceName);
        return st.reduce((s, i) => s + (i.count ?? 1), 0);
      };
      const root = document.querySelector("#d2autobot-panel")?.shadowRoot;
      const toggle = (name, enabled) => {
        const button = root?.querySelector('[data-setting="' + name + '"]');
        if (!button) throw new Error("找不到設定：" + name);
        if ((button.getAttribute("aria-checked") === "true") !== enabled) button.click();
        if ((button.getAttribute("aria-checked") === "true") !== enabled) throw new Error("設定切換失敗：" + name);
      };
      const wpn = () => g.save?.equippedByClass?.[cls]?.weapon;
      const stored = () => { try { return JSON.parse(localStorage.getItem("d2-survivors/save/v1")); } catch (e) { return null; } };
      const storedWeapon = () => stored()?.equippedByClass?.[cls]?.weapon ?? null;
      const snap = (w) => w ? { name: w.name, rarity: w.rarity, base: w.base, forge: w.forge ?? null, mods: (w.mods ?? []).length } : null;
      const trace = { state: g.state, cls };
      trace.before = { essences: essences(), weapon: snap(wpn()), stored: snap(storedWeapon()) };
      // 1) 作弊給精華（與 forge-essence-live 相同的方式）
      toggle("cheat.forgeMax", true); toggle("cheat.enabled", true);
      await sleep(2000);
      toggle("cheat.enabled", false);
      await sleep(1500);
      trace.afterCheat = { essences: essences() };
      // 2) 設定鐵砧物品並呼叫遊戲自己的 forgeTry（temper）
      // 全新存檔沒有可鍛造的物品：若有 H_ITEM（已去掉淬鍊、換新 ID 的副本），放進武器欄位
      if (!wpn() && ${JSON.stringify(process.env.H_ITEM_JSON || "")}) {
        g.save.equippedByClass = g.save.equippedByClass || {};
        g.save.equippedByClass[cls] = g.save.equippedByClass[cls] || {};
        g.save.equippedByClass[cls].weapon = JSON.parse(${JSON.stringify(process.env.H_ITEM_JSON || "null")});
        trace.injected = true;
      }
      const item = wpn();
      if (!item) throw new Error("沒有裝備武器可以鍛造");
      trace.anvilItem = { id: item.id, name: item.name, rarity: item.rarity };
      g.anvil = item.id;
      const total = () => Object.values(wpn()?.forge?.t ?? {}).reduce((s, n) => s + n, 0);
      const tries = [];
      const viaBackend = ${JSON.stringify(process.env.H_VIA || "")} === "backend";
      const act = (name) => (viaBackend ? window.__d2editBackend.forgeItem("softcore", item.id, name).then(r => (r.error ? { ok: false, err: r.error } : { ok: true, r: r.result })) : g.forgeTry(cls, 1, name, () => {}).then(r => ({ ok: true, r }), e => ({ ok: false, err: String(e && e.message || e) })));
      if (${JSON.stringify(process.env.H_PLAN || "")} === "hellforge") {
        // 連續淬鍊直到 10 次（或達到熔爐門檻），每次都是遊戲自己的鍛造流程
        for (let k = 0; k < 60 && total() < 10; k++) {
          const a = await act("temper");
          tries.push({ act: "temper", total: total(), essences: essences(), t: JSON.stringify(wpn()?.forge?.t ?? {}), ret: a.ok ? a.r : a.err });
          await sleep(300);
        }
        trace.reachedTen = total() >= 10;
        if (trace.reachedTen) {
          const h = await act("hellforge");
          tries.push({ act: "hellforge", total: total(), essences: essences(), ret: h.ok ? h.r : h.err });
          await sleep(1500);
        }
        trace.tries = tries;
        trace.afterHellforge = { essences: essences(), weapon: snap(wpn()), stored: snap(storedWeapon()) };
        trace.storedForgeRaw = storedWeapon()?.forge ?? null;
        trace.diagnostics = bot.diagnostics?.() ?? null;
        return trace;
      }
      let ret;
      try {
        ret = await g.forgeTry(cls, 1, "temper", () => {});
      } catch (e) { ret = { threw: String(e && e.message || e) }; }
      await sleep(3000);
      trace.forgeTryReturn = ret;
      trace.afterTemper = { essences: essences(), weapon: snap(wpn()), stored: snap(storedWeapon()) };
      trace.storedForgeRaw = storedWeapon()?.forge ?? null;
      trace.diagnostics = bot.diagnostics?.() ?? null;
      return trace;
    })()`);
    if (process.env.H_RELOAD && !result.error) {
      // 重新整理後讀回：遊戲是否保留（或以伺服器紀錄還原）淬鍊結果
      await win.loadURL("https://d2survivors.lol/play/").catch(() => {});
      await sleep(8000);
      const cls = result.cls;
      const after = await win.webContents.executeJavaScript(`(async () => {
        const sleep = ms => new Promise(r => setTimeout(r, ms));
        await import(${JSON.stringify(PAGES + "d2edit.js?v=")} + Date.now());
        for (let i = 0; i < 120 && !window.__d2autobot?.game; i++) { await sleep(500); }
        const g = window.__d2autobot?.game;
        let stored = null; try { stored = JSON.parse(localStorage.getItem("d2-survivors/save/v1")); } catch (e) {}
        const w = (save) => save?.equippedByClass?.[${JSON.stringify(cls)}]?.weapon ?? null;
        return { state: g?.state ?? null, storedForge: w(stored)?.forge ?? null, memoryForge: w(g?.save)?.forge ?? null, redNotice: [...document.querySelectorAll("*")].some(el => /存檔在遊戲外被修改|不會列入排名/.test(el.textContent || "") && el.children.length === 0) };
      })()`);
      result.afterReload = after;
    }
    done(result);
  } catch (e) { done({ error: String(e?.stack || e) }, 1); }
});
