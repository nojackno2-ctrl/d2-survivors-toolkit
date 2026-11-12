// 用法：H_ITEM=<物品JSON> electron tests/live-harness/temper-editor-ui-live.cjs [輸出.json]
// 實機驗證「修改器介面」的淬鍊按鈕（iframe 內）：
//   全新隔離存檔 → 注入一件套裝武器副本（去掉淬鍊、換新 ID）→ 作弊給精華 → 開啟修改器（遊戲頁面的「修改器」按鈕）
//   → 在 iframe 內選到該物品 → 點「淬鍊」「清除淬鍊」（不點熔爐，避免隨機結果）→ 讀取介面狀態與遊戲存檔。
// 工具包由 PAGES 攔截至本機檔案；遊戲本體來自官方網址。僅使用隔離的 userData（全新存檔），不碰使用者存檔。
const { app, BrowserWindow, session, net } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");
const PAGES = "https://nojackno2-ctrl.github.io/d2-survivors-toolkit/";
const OUT = process.argv.slice(2).find((a) => !a.startsWith("--") && !a.endsWith("electron.exe") && a !== ".");
const CLASS = process.env.H_CLASS || "sorceress";
const ITEM_JSON = process.env.H_ITEM ? fs.readFileSync(process.env.H_ITEM, "utf8") : "null";
const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".html": "text/html", ".css": "text/css", ".svg": "image/svg+xml" };
app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "d2editui-")));
app.whenReady().then(async () => {
  let finished = false;
  const done = (result, code = 0) => {
    if (finished) return;
    finished = true;
    const json = JSON.stringify(result, null, 2);
    if (OUT) fs.writeFileSync(OUT, json + "\n"); else console.log(json);
    app.exit(code);
  };
  setTimeout(() => done({ error: "實機測試逾時" }, 1), 420000);
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
    const game = await win.webContents.executeJavaScript(`(async () => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      await import(${JSON.stringify(PAGES + "d2edit.js?v=")} + Date.now());
      for (let i = 0; i < 120 && !window.__d2autobot?.game; i++) {
        document.body.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true }));
        await sleep(500);
      }
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
      // 注入鐵砧物品（副本）
      const item = ${ITEM_JSON};
      if (item && !g.save?.equippedByClass?.[cls]?.weapon) {
        g.save.equippedByClass = g.save.equippedByClass || {};
        g.save.equippedByClass[cls] = g.save.equippedByClass[cls] || {};
        g.save.equippedByClass[cls].weapon = item;
      }
      // 作弊給精華
      const root = document.querySelector("#d2autobot-panel")?.shadowRoot;
      const toggle = (name, enabled) => {
        const button = root?.querySelector('[data-setting="' + name + '"]');
        if (!button) throw new Error("找不到設定：" + name);
        if ((button.getAttribute("aria-checked") === "true") !== enabled) button.click();
        if ((button.getAttribute("aria-checked") === "true") !== enabled) throw new Error("設定切換失敗：" + name);
      };
      toggle("cheat.forgeMax", true); toggle("cheat.enabled", true);
      await sleep(2000);
      toggle("cheat.enabled", false);
      await sleep(1500);
      // 暫停後才會出現修改器按鈕；直接呼叫遊戲頁的啟動按鈕（不依賴顯示狀態）
      const launcher = window.__d2editLauncher;
      if (!launcher) throw new Error("找不到修改器啟動按鈕");
      launcher.click();
      await sleep(4000);
      return { cls, itemId: g.save?.equippedByClass?.[cls]?.weapon?.id ?? null, essences: (g.save.inventoryByClass?.[cls] || []).filter(i => i?.base === "Burning Essence of Terror").reduce((s, i) => s + (i.count ?? 1), 0) };
    })()`);
    // 進入修改器 iframe（跨網域，用 webFrameMain 執行）
    const frames = win.webContents.mainFrame.framesInSubtree;
    const editor = frames.find(f => /editor\.html/.test(f.url));
    if (!editor) throw new Error("找不到修改器 iframe：" + JSON.stringify(frames.map(f => f.url)));
    await sleep(6000);
    const readState = () => editor.executeJavaScript(`(() => {
      const it = typeof EDIT_IT !== "undefined" ? EDIT_IT : null;
      const box = document.querySelector("#tpBox");
      return {
        forge: it ? (it.forge ?? null) : "no EDIT_IT",
        tpTemper: document.querySelector("#tpTemper") ? { disabled: document.querySelector("#tpTemper").disabled } : null,
        tpClean: document.querySelector("#tpClean") ? { disabled: document.querySelector("#tpClean").disabled } : null,
        tpHf: document.querySelector("#tpHf") ? { disabled: document.querySelector("#tpHf").disabled } : null,
        totalText: box?.querySelector(".tp-total")?.textContent ?? null,
        status: document.querySelector("#status")?.textContent ?? null,
      };
    })()`);
    const result = { game, initial: null, steps: [] };
    // 在 iframe 內選到該物品：依 itemId 找出所在容器與索引，設定 cur/sel 後重繪
    const select = await editor.executeJavaScript(`(() => {
      const id = ${JSON.stringify(game.itemId)};
      for (const c of containers()) {
        if (c.grp) continue;
        if (c.kind === "slots") {
          const o = c.obj(); const key = Object.keys(o).find(k => o[k] && o[k].id === id);
          if (key !== undefined) { cur = c.id; sel = key; refresh(); return { ok: true, container: c.id, key, kind: "slots" }; }
          continue;
        }
        const arr = c.arr();
        const idx = arr.findIndex(x => x && x.id === id);
        if (idx >= 0) { cur = c.id; sel = idx; refresh(); return { ok: true, container: c.id, idx }; }
      }
      return { ok: false };
    })()`);
    result.select = select;
    await sleep(2000);
    result.initial = await readState();
    // 覆寫 confirm，避免原生對話框阻塞
    await editor.executeJavaScript(`window.confirm = () => true; true`);
    // 1) 淬鍊一次
    await editor.executeJavaScript(`document.querySelector("#tpTemper").click(); true`);
    await sleep(6000);
    result.steps.push({ action: "temper", state: await readState() });
    // 2) 再淬鍊一次
    await editor.executeJavaScript(`document.querySelector("#tpTemper").click(); true`);
    await sleep(6000);
    result.steps.push({ action: "temper", state: await readState() });
    // 3) 清除淬鍊
    await editor.executeJavaScript(`document.querySelector("#tpClean").click(); true`);
    await sleep(6000);
    result.steps.push({ action: "clean", state: await readState() });
    // 遊戲存檔（localStorage）與記憶體
    result.stored = await win.webContents.executeJavaScript(`(() => {
      try { const s = JSON.parse(localStorage.getItem("d2-survivors/save/v1")); const w = s?.equippedByClass?.[${JSON.stringify(game.cls)}]?.weapon; return { forge: w?.forge ?? null, essences: (s?.inventoryByClass?.[${JSON.stringify(game.cls)}] || []).filter(i => i?.base === "Burning Essence of Terror").reduce((a, i) => a + (i.count ?? 1), 0) }; } catch (e) { return { error: String(e) }; }
    })()`);
    done(result);
  } catch (e) { done({ error: String(e?.stack || e) }, 1); }
});
