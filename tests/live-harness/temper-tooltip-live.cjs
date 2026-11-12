// 用法：electron tests/live-harness/temper-tooltip-live.cjs <存檔JSON路徑> [輸出前綴]
// 以使用者提供的存檔（已解碼的 JSON）在官方 /play/ 實機開啟角色畫面，把滑鼠移到法師武器上，截下淬鍊提示框。
// 工具包由 PAGES 攔截至本機檔案；遊戲本體來自官方網址。僅使用隔離的 userData，不碰使用者存檔。
const { app, BrowserWindow, session, net } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");
const PAGES = "https://nojackno2-ctrl.github.io/d2-survivors-toolkit/";
const ARGS = process.argv.slice(2).filter((a) => !a.endsWith("electron.exe") && a !== ".");
const SEED = ARGS[0];
const PREFIX = ARGS[1] || path.join(ROOT, "backups", "temper-tooltip");
const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".html": "text/html", ".css": "text/css", ".svg": "image/svg+xml" };
app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "d2tooltip-")));
app.whenReady().then(async () => {
  let finished = false;
  const done = (result, code = 0) => {
    if (finished) return;
    finished = true;
    const json = JSON.stringify(result, null, 2);
    fs.writeFileSync(PREFIX + ".json", json + "\n");
    app.exit(code);
  };
  setTimeout(() => done({ error: "實機測試逾時" }, 1), 240000);
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  try {
    const seed = fs.readFileSync(SEED, "utf8");
    JSON.parse(seed);
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
    await win.webContents.executeJavaScript(`localStorage.setItem("d2-survivors/save/v1", ${JSON.stringify(seed)});`);
    await win.loadURL("https://d2survivors.lol/play/").catch(() => {});
    await sleep(4000);
    await win.webContents.executeJavaScript(`(()=>{const b=[...document.querySelectorAll("button")].find(x=>/hosted/i.test(x.textContent));if(b)b.click()})()`);
    await sleep(10000);
    // 載入工具包並等待遊戲物件
    await win.webContents.executeJavaScript(`(async () => { await import(${JSON.stringify(PAGES + "d2edit.js?v=")} + Date.now()); })()`).catch(() => {});
    const state = await win.webContents.executeJavaScript(`(async () => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      for (let i = 0; i < 120 && !window.__d2autobot?.game; i++) { document.body.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true })); await sleep(500); }
      const g = window.__d2autobot?.game;
      if (!g) throw new Error("找不到遊戲物件");
      if (g.state === "select") {
        if (!g.plainSelect().onPick) { g.chooseClass(); await sleep(1500); }
        const select = g.plainSelect(), cls = g.kit?.id || "sorceress";
        const index = select.cards.findIndex(c => c.dataset?.class === cls);
        if (index >= 0) { select.select(index); await sleep(300); select.confirm(false); }
      }
      for (let i = 0; i < 120 && !g.world?.player && g.state !== "camp"; i++) await sleep(500);
      document.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyC", key: "c", bubbles: true }));
      await sleep(1500);
      const cands = [...document.querySelectorAll("*")].filter(el => {
        const t = (el.getAttribute("data-slot") || el.getAttribute("data-key") || el.className?.toString() || "") + " " + (el.id || "");
        return /weapon|slot|equip/i.test(t) && el.getBoundingClientRect().width > 0;
      }).slice(0, 40).map(el => ({ tag: el.tagName, cls: String(el.className).slice(0, 80), id: el.id, slot: el.getAttribute("data-slot"), rect: (r => [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)])(el.getBoundingClientRect()) }));
      return { state: g.state, cls: g.kit?.id, equippedWeapon: g.save?.equippedByClass?.[g.kit?.id]?.weapon?.name ?? null, candidates: cands };
    })()`);
    const shot = await win.webContents.capturePage();
    fs.writeFileSync(PREFIX + "-diag.png", shot.toPNG());
    // 把滑鼠移到武器欄中央，等提示框出現後截圖
    const rect = await win.webContents.executeJavaScript(`(() => { const r = document.querySelector('.slot[data-slot="weapon"]')?.getBoundingClientRect(); return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; })()`);
    if (!rect) throw new Error("找不到武器欄");
    for (let k = 0; k < 3; k++) { win.webContents.sendInputEvent({ type: "mouseMove", x: Math.round(rect.x), y: Math.round(rect.y) }); await sleep(250); }
    await sleep(1500);
    const hover = await win.webContents.capturePage();
    fs.writeFileSync(PREFIX + "-hover.png", hover.toPNG());
    const tip = await win.webContents.executeJavaScript(`(() => { const t = [...document.querySelectorAll('.tip, .tooltip, [class*="tip"]')].filter(e => e.offsetParent !== null && e.getBoundingClientRect().width > 0); return t.map(e => (e.className || "") + " | " + (e.innerText || e.textContent || "").slice(0, 400)); })()`);
    done({ ok: true, state, hoverAt: rect, tipElements: tip, screenshots: [PREFIX + "-diag.png", PREFIX + "-hover.png"] });
  } catch (e) {
    done({ error: String(e && e.stack || e) }, 1);
  }
});
