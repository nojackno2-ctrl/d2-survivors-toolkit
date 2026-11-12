// 掉落語料產生器（官方頁面實機）：呼叫遊戲真正的掉落函式 J8（修改器引擎 dropItems），依難度／來源／MF 分配，
// 每件用遊戲 itemFault 驗證、去重後以 NDJSON 追加寫檔，用於強化自動配裝。
// 用法：electron drop-corpus-live.cjs <職業> <件數> <輸出.ndjson>   （環境變數 H_SHOW＝顯示視窗）
// 只用隔離暫存設定檔，不碰任何存檔。
const { app, BrowserWindow, session, net } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path");
const [cls, countArg, out] = process.argv.slice(2).filter((a) => !a.startsWith("--") && !a.endsWith("electron.exe") && a !== ".");
const COUNT = Number(countArg), ROOT = path.resolve(__dirname, "..", ".."), PAGES = "https://nojackno2-ctrl.github.io/d2-survivors-toolkit/";
const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".html": "text/html" };
app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "d2corpus-")));

// 分配（可調）：難度、來源、魔法尋寶、各難度 ilvl 範圍（遊戲 Ake 表：普通 1–43、惡夢 36–66、地獄 67–85；來源再加 lift，封頂 99）
const DIFF = [["normal", 0.3], ["nightmare", 0.3], ["hell", 0.4]];
const ILVL = { normal: [1, 43], nightmare: [36, 66], hell: [67, 85] };
// 遊戲 VC／zC／BC：horde 稀有 boost 3；冠軍 1024/224；頭目 暗金 8、稀有 1024/224；幕末魔王最低稀有，暗金 1024/41
const SRC = [
  ["horde", 0.70, { minRarity: "magic", rareBoost: 3 }, 0],
  ["champion", 0.20, { minRarity: "magic", uniqueBoost: 1024 / 224, rareBoost: 1024 / 224 }, 2],
  ["superUnique", 0.08, { minRarity: "magic", uniqueBoost: 8, rareBoost: 1024 / 224 }, 3],
  ["actBoss", 0.02, { minRarity: "rare", uniqueBoost: 1024 / 41 }, 3],
];
const MFS = [[0, 0.4], [100, 0.3], [200, 0.2], [300, 0.1]];
const pick = (t) => { let r = Math.random(); for (const x of t) { r -= x[1]; if (r < 0) return x; } return t[t.length - 1]; };
const plan = (n) => Array.from({ length: n }, () => {
  const d = pick(DIFF)[0], s = pick(SRC), [lo, hi] = ILVL[d], base = lo + Math.floor(Math.random() * (hi - lo + 1));
  return { n: 1, difficulty: d, ilvl: Math.min(99, base + s[3]), mf: pick(MFS)[0], cls, boost: s[2], source: s[0] };
});

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1100, height: 800, show: !!process.env.H_SHOW, webPreferences: { webSecurity: false } });
  session.defaultSession.protocol.handle("https", (req) => {
    if (req.url.startsWith(PAGES)) {
      const rel = decodeURIComponent(new URL(req.url).pathname.slice("/d2-survivors-toolkit/".length)), file = path.join(ROOT, rel);
      if (!file.startsWith(ROOT) || !fs.existsSync(file)) return new Response("not found", { status: 404 });
      return new Response(fs.readFileSync(file), { headers: { "content-type": (MIME[path.extname(file)] ?? "application/octet-stream") + "; charset=utf-8", "access-control-allow-origin": "*", "cache-control": "no-store" } });
    }
    return net.fetch(req, { bypassCustomProtocolHandlers: true });
  });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const stat = { cls, target: COUNT, kept: 0, drawn: 0, dup: 0, fault: 0, error: 0, byRarity: {}, rawByRarity: {}, rawByDiffRarity: {}, byDiff: {}, bySource: {}, faultWhy: {}, errors: {} };
  const finish = (extra) => { fs.writeFileSync(out + ".stats.json", JSON.stringify({ ...stat, ...extra }, null, 1)); app.exit(0); };
  try {
    await win.loadURL("https://d2survivors.lol/play/").catch(() => {});
    await sleep(8000);
    await win.webContents.executeJavaScript(`(()=>{const b=[...document.querySelectorAll("button")].find((x)=>/hosted/i.test(x.textContent));if(b)b.click();return !!b})()`);
    await sleep(12000);
    await win.webContents.executeJavaScript(`import(${JSON.stringify(PAGES + "d2edit.js?v=" + Date.now())}).then(()=>new Promise(r=>setTimeout(r,4000)))`);
    const fd = fs.openSync(out, "w"), seen = new Set(), BATCH = 400;
    const key = (it) => JSON.stringify([it.base, it.rarity, it.name, it.mods, it.defense ?? null]);
    while (stat.kept < COUNT && stat.drawn < COUNT * 15) {
      const n = Math.min(BATCH, Math.ceil((COUNT - stat.kept) * 1.05) + 5);
      const res = await win.webContents.executeJavaScript(`window.__d2editBackend.engine("dropItems", ${JSON.stringify(plan(n))})`);
      if (!Array.isArray(res)) return finish({ error: "dropItems 無回應（簽章不符或未載入）", got: String(res).slice(0, 200) });
      let lines = "";
      for (const r of res) {
        stat.drawn++;
        if (r.error) { stat.error++; stat.errors[r.error.slice(0, 80)] = (stat.errors[r.error.slice(0, 80)] || 0) + 1; continue; }
        if (r.fault) { stat.fault++; const w = typeof r.fault === "string" ? r.fault : r.fault.why ?? JSON.stringify(r.fault); stat.faultWhy[w.slice(0, 80)] = (stat.faultWhy[w.slice(0, 80)] || 0) + 1; continue; }
        stat.rawByRarity[r.item.rarity] = (stat.rawByRarity[r.item.rarity] || 0) + 1; { const dk = r.ctx.difficulty + ":" + r.item.rarity; stat.rawByDiffRarity[dk] = (stat.rawByDiffRarity[dk] || 0) + 1; }
        if (process.env.H_RAW) { stat.kept++; continue; }
        const k = key(r.item);
        if (seen.has(k) || stat.kept >= COUNT) { if (seen.has(k)) stat.dup++; continue; }
        seen.add(k); stat.kept++;
        const it = r.item;
        stat.byRarity[it.rarity] = (stat.byRarity[it.rarity] || 0) + 1;
        stat.byDiff[r.ctx.difficulty] = (stat.byDiff[r.ctx.difficulty] || 0) + 1;
        stat.bySource[r.ctx.source] = (stat.bySource[r.ctx.source] || 0) + 1;
        lines += JSON.stringify({ ctx: r.ctx, item: it }) + "\n";
      }
      fs.writeSync(fd, lines);
      if (stat.drawn % 4000 < BATCH) console.log(cls, stat.kept + "/" + COUNT);
    }
    fs.closeSync(fd);
    finish({ ok: stat.kept >= COUNT });
  } catch (e) { finish({ error: String(e && e.stack || e) }); }
});
