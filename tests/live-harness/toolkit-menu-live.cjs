// 用法：electron tests/live-harness/toolkit-menu-live.cjs [輸出.json]   （H_SEED 可指定存檔副本，預設 backups/saves/test-fixture/save.json）
// 驗證「工具包」單一按鈕：
//   1) 暫停遊戲後，左上只剩「工具包」按鈕；輔助器、語言的舊按鈕被隱藏；
//   2) 點工具包 → 面板列出 自動淬鍊／輔助器／語言／修改器；
//   3) 從面板開啟自動淬鍊：不在恰西鐵砧（forgeUp=false）也能顯示，背包「選取」後裝備載入；
//   4) 收合後面板關閉；恢復遊戲後工具包按鈕隱藏。
// 只讀取與選取，不啟動淬鍊（不會呼叫伺服器）。隔離 Electron 設定檔，不碰使用者真實存檔。
const { app, BrowserWindow, session, net } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");
const PAGES = "https://nojackno2-ctrl.github.io/d2-survivors-toolkit/";
const OUT = process.argv.slice(2).find((a) => !a.startsWith("--") && !a.endsWith("electron.exe") && a !== ".");
const CLASS = process.env.H_CLASS || "sorceress";
const SEED_PATH = process.env.H_SEED || path.join(ROOT, "backups", "saves", "test-fixture", "save.json");
const SEED = fs.readFileSync(SEED_PATH, "utf8");
// 測試裝備（暗金戒指，僅注入隔離存檔的背包，不影響使用者存檔）
const ITEM_JSON = fs.readFileSync(process.env.H_ITEM || path.join(ROOT, "tests", "live-harness", "out", "hf-stats", "item.json"), "utf8");
const SHOT = process.env.H_SHOT || path.join(os.tmpdir(), "toolkit-menu.png");
const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".html": "text/html", ".css": "text/css", ".svg": "image/svg+xml" };
app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "d2toolkit-")));
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
    // 工具包網址攔截到本機檔案（等同玩家書籤載入待測版本）；遊戲本身仍是官方 d2survivors.lol/play/
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
      const trace = {};
      // 只開「自動戰鬥」（處理升級選卡），不開戰鬥輔助與作弊，避免干擾測試
      window.__d2autobotSwitches = { enabled: false, progressEnabled: true, cheat: false };
      await import(${JSON.stringify(PAGES + "d2edit.js?v=")} + Date.now());
      for (let i = 0; i < 120 && !window.__d2autobot?.game; i++) { document.body.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true })); await sleep(500); }
      for (let i = 0; i < 120 && window.__d2editLoading; i++) await sleep(500);
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
      await sleep(1500);
      const cls = g.kit?.id;
      trace.cls = cls; trace.state = g.state;
      g.save.inventoryByClass[cls] = g.save.inventoryByClass[cls] || [];
      g.save.inventoryByClass[cls].push(JSON.parse(${JSON.stringify(ITEM_JSON)}));
      trace.injectedItem = true;
      // 暫停：送出 Escape，若沒有反應就直接用遊戲的暫停入口
      const paused = () => document.body.classList.contains("frontend-over-run") || document.body.classList.contains("frontend-open") || (() => { const p = document.getElementById("paused"); return !!p && !p.classList.contains("hidden") && getComputedStyle(p).display !== "none"; })();
      for (let i = 0; i < 20 && !paused(); i++) {
        if (g.state === "levelUp") { try { g.hud?.closeLevelUp?.(); } catch (e) {} }
        else if (g.state === "playing" || g.state === "camp") { try { g.pause(); } catch (e) { trace.pauseErr = String(e); } }
        await sleep(700);
      }
      await sleep(800);
      trace.paused = paused();
      const vis = el => !!el && getComputedStyle(el).display !== "none";
      const launcher = document.getElementById("d2toolkit-launcher");
      trace.toolkitButton = vis(launcher);
      trace.toolkitText = launcher?.textContent || null;
      trace.oldAutobotButtonHidden = !vis(document.getElementById("d2autobot-launcher"));
      trace.oldLangButtonHidden = !vis(document.getElementById("d2lang-btn"));
      trace.featureIds = window.__d2toolkit?.features().map(f => f.id) || [];
      // 1) 開啟選單
      launcher?.click(); await sleep(400);
      const menu = document.getElementById("d2toolkit-menu");
      trace.menuOpen = vis(menu);
      trace.menuItems = [...(menu?.children || [])].map(c => c.textContent);
      // 2) 從選單開啟自動淬鍊（不在恰西鐵砧）
      const afItem = [...(menu?.children || [])].find(c => c.textContent === "自動淬鍊");
      trace.forgeUpBefore = !!g.forgeUp;
      afItem?.click(); await sleep(1200);
      const panel = document.getElementById("d2autoforge-panel");
      trace.afPanelShown = !!panel;
      trace.afHint = panel?.textContent.includes("背包可淬鍊") || false;
      const selectButtons = [...(panel?.querySelectorAll("[data-select]") || [])];
      trace.bagSelectButtons = selectButtons.length;
      // 3) 背包「選取」第一件
      if (selectButtons.length) { selectButtons[0].click(); await sleep(1800); }
      const st = window.__d2autoforgeUI?.state || {};
      trace.anvilSet = !!g.anvil;
      trace.itemAttached = !!st.itemId;
      trace.itemName = st.itemName || null;
      trace.lineCount = (st.lines || []).length;
      trace.startEnabled = !document.getElementById("d2autoforge-panel")?.querySelector("#af-start")?.disabled;
      trace.forgeUpStillFalse = !g.forgeUp;
      // 4) 收合即關閉
      document.getElementById("d2autoforge-panel")?.querySelector("#af-fold")?.click(); await sleep(900);
      trace.panelAfterFold = !!document.getElementById("d2autoforge-panel");
      // 5) 再從選單開「輔助器」，確認舊功能仍可由工具包開啟
      launcher?.click(); await sleep(300);
      const autobotItem = [...(document.getElementById("d2toolkit-menu")?.children || [])].find(c => c.textContent === "輔助器");
      autobotItem?.click(); await sleep(800);
      const host = document.getElementById("d2autobot-panel");
      trace.assistantPanelOpened = !!host?.shadowRoot?.querySelector(".backdrop") && !host.shadowRoot.querySelector(".backdrop").hidden;
      host?.shadowRoot?.querySelector("#close")?.click(); await sleep(500);
      // 6) 恢復遊戲：工具包按鈕應隱藏
      try { g.resume(); } catch (e) { trace.resumeErr = String(e); }
      await sleep(1500);
      trace.pausedAfterResume = paused();
      trace.toolkitButtonAfterResume = vis(document.getElementById("d2toolkit-launcher"));
      trace.errors = (window.__d2toolkitErrors || []);
      return trace;
    })()`);
    try {
      await sleep(300);
      const img = await win.webContents.capturePage();
      fs.writeFileSync(SHOT, img.toPNG());
      result.shot = SHOT;
    } catch (e) { result.shot = "截圖失敗：" + String(e?.message || e); }
    done(result);
  } catch (e) { done({ error: String(e?.stack || e) }, 1); }
});
