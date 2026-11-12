// 用法：electron tests/live-harness/larzuk-pause-live.cjs [輸出.json]
// 驗證兩項遊戲修改在官方 /play/ 實機是否生效：
//   1. cheat.larzukMax：拉蘇克精華（Larzuk's Essence）堆疊數量 99。
//   2. cheat.pauseStageTime：本關經過時間（world.time - world.actStart）在開啟期間不前進。
// 工具包由 PAGES 攔截至本機檔案；遊戲本體來自官方網址。僅使用隔離的 userData，不碰使用者存檔。
const { app, BrowserWindow, session, net } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");
const PAGES = "https://nojackno2-ctrl.github.io/d2-survivors-toolkit/";
const OUT = process.argv.slice(2).find((a) => !a.startsWith("--") && !a.endsWith("electron.exe") && a !== ".");
const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".html": "text/html", ".css": "text/css", ".svg": "image/svg+xml" };
app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "d2larzuk-")));
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
        if (!g.plainSelect().onPick) { g.chooseClass(); await sleep(1500); }
        const select = g.plainSelect(), cls = ${JSON.stringify(process.env.H_CLASS || "amazon")};
        const index = select.cards.findIndex(c => c.dataset?.class === cls);
        if (index < 0) throw new Error("找不到職業：" + cls);
        select.select(index); await sleep(300); select.confirm(false);
      }
      for (let i = 0; i < 120 && !g.world?.player; i++) await sleep(500);
      if (!g.world?.player) throw new Error("未進入遊戲：" + JSON.stringify(bot.diagnostics()));
      const root = document.querySelector("#d2autobot-panel")?.shadowRoot;
      const toggle = (name, enabled) => {
        const button = root?.querySelector('[data-setting="' + name + '"]');
        if (!button) throw new Error("找不到設定：" + name);
        if ((button.getAttribute("aria-checked") === "true") !== enabled) button.click();
        if ((button.getAttribute("aria-checked") === "true") !== enabled) throw new Error("設定切換失敗：" + name);
      };
      const cls = g.kit?.id;
      const essenceName = "Larzuk's Essence";
      const essence = () => {
        const inv = g.save?.inventoryByClass?.[cls] || [];
        const st = inv.filter(i => i?.type === "essence" && i.base === essenceName);
        return { stacks: st.length, total: st.reduce((s, i) => s + (i.count ?? 1), 0) };
      };
      const stage = () => {
        const w = g.world;
        return { time: w?.time, actStart: w?.actStart, actTime: (w?.time ?? 0) - (w?.actStart ?? 0), kills: w?.kills, enemies: w?.enemies?.length };
      };
      // 1. 拉蘇克精華
      const essenceBefore = essence();
      toggle("cheat.larzukMax", true); toggle("cheat.enabled", true);
      await sleep(2000);
      const essenceDuring = essence();
      toggle("cheat.enabled", false);
      await sleep(1500);
      const essenceAfter = essence();
      // 2. 關卡時間暫停：開啟期間 actTime 應停在 0 附近，world.time 仍前進
      // 遊戲若停在升級選卡（levelUp）時間不會前進，因此開啟戰鬥輔助讓角色進行遊戲。
      toggle("enabled", true); toggle("progressEnabled", true);
      for (let i = 0; i < 60 && g.state !== "playing"; i++) await sleep(500);
      await sleep(3000);
      const stateAtStart = g.state;
      toggle("cheat.pauseStageTime", true); toggle("cheat.enabled", true);
      await sleep(1000);
      const pauseA = stage();
      await sleep(8000);
      const pauseB = stage();
      toggle("cheat.enabled", false);
      await sleep(1500);
      const pauseOff = stage();
      await sleep(3000);
      const pauseOff2 = stage();
      return {
        url: location.href, class: cls, stateAtStart,
        essence: { before: essenceBefore, during: essenceDuring, after: essenceAfter },
        pause: { on_start: pauseA, on_8s_later: pauseB, off: pauseOff, off_3s_later: pauseOff2,
          worldTimeAdvancedWhileOn: +((pauseB.time ?? 0) - (pauseA.time ?? 0)).toFixed(2),
          actTimeAdvancedWhileOn: +((pauseB.actTime ?? 0) - (pauseA.actTime ?? 0)).toFixed(2) },
        diagnostics: bot.diagnostics()
      };
    })()`);
    done(result);
  } catch (e) { done({ error: String(e?.stack || e) }, 1); }
});
