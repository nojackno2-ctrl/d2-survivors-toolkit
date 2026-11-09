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
        if (g.frontend?.open && !g.plainSelect().onPick) { g.frontend.actions.play(); await sleep(3000); }
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
    // 只開啟「遊戲修改總開關」與「恐怖燃燒精華數量 99」，其餘修改保持關閉。
    out.toggled = await exec(`(async () => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      const root = document.querySelector("#d2autobot-panel")?.shadowRoot;
      if (!root) return { error: "找不到輔助器面板" };
      const tab = [...root.querySelectorAll("button, [role=tab]")].find(b => /修改/.test(b.textContent || ""));
      if (tab) { tab.click(); await sleep(400); }
      const set = (name, on) => { const b = root.querySelector('[data-setting="' + name + '"]'); if (!b) return "missing:" + name; if ((b.getAttribute("aria-checked") === "true") !== on) b.click(); return (b.getAttribute("aria-checked") === "true") === on ? "ok" : "failed"; };
      return { master: set("cheat.enabled", true), forgeMax: set("cheat.forgeMax", true) };
    })()`);
    await sleep(2500);
    out.essence = await exec(`(() => {
      const g = window.__d2autobot?.game, cls = g?.kit?.id;
      const inv = g?.save?.inventoryByClass?.[cls] || [];
      const total = inv.filter(i => i?.type === "essence" && i.base === "Burning Essence of Terror").reduce((s, i) => s + (i.count ?? 1), 0);
      return { cls, total, stacks: inv.filter(i => i?.type === "essence").length };
    })()`);
    done(out);
  } catch (e) { done({ error: String(e?.stack || e) }, 1); }
});
