// 用法：H_ITEM=裝備JSON H_SAVE=編號 H_CYCLES=10 electron hf-stats-live.cjs 輸出.json
// 地獄熔爐倍增率統計：隔離存檔，反覆「新 id 的裝備 → forgeTry 淬鍊到總數>=10 → hellforge」，逐次記錄。
const { app, BrowserWindow, session, net } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");
const PAGES = "https://nojackno2-ctrl.github.io/d2-survivors-toolkit/";
const OUT = process.argv.slice(2).find((a) => !a.startsWith("--") && !a.endsWith("electron.exe") && a !== ".");
const CLASS = process.env.H_CLASS || "sorceress";
const SAVE = Number(process.env.H_SAVE || 0), CYCLES = Number(process.env.H_CYCLES || 130), TARGET = Number(process.env.H_TARGET || 100), GAP = Number(process.env.H_GAP || 1000);
const ITEM = fs.readFileSync(process.env.H_ITEM, "utf8");
const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".html": "text/html", ".css": "text/css", ".svg": "image/svg+xml" };
const UD = fs.mkdtempSync(path.join(os.tmpdir(), "d2hfstats-"));
app.setPath("userData", UD);
const progress = (patch) => { const f = path.join(path.dirname(OUT || "."), "progress-" + SAVE + ".json"); try { fs.writeFileSync(f + ".part", JSON.stringify(Object.assign({ save: SAVE }, patch, { updated: new Date().toISOString() }))); fs.renameSync(f + ".part", f); } catch (e) {} };
const rec = { save: SAVE, item: null, userData: UD, startedAt: new Date().toISOString(), runs: [], errors: [], finished: false };
const flush = () => { if (OUT) fs.writeFileSync(OUT, JSON.stringify(rec, null, 2) + "\n"); };
app.whenReady().then(async () => {
  let finished = false;
  const done = (code = 0) => { if (finished) return; finished = true; rec.finished = code === 0; rec.endedAt = new Date().toISOString(); flush(); app.exit(code); };
  setTimeout(() => { rec.errors.push("總逾時"); done(1); }, 86400000);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    session.defaultSession.protocol.handle("https", (req) => {
      if (!req.url.startsWith(PAGES)) return net.fetch(req, { bypassCustomProtocolHandlers: true });
      const rel = decodeURIComponent(new URL(req.url).pathname.slice("/d2-survivors-toolkit/".length));
      const file = path.resolve(ROOT, rel);
      if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return new Response("not found", { status: 404 });
      return new Response(fs.readFileSync(file), { headers: { "content-type": (MIME[path.extname(file)] || "application/octet-stream") + "; charset=utf-8", "access-control-allow-origin": "*", "cache-control": "no-store" } });
    });
    const win = new BrowserWindow({ width: 900, height: 700, show: true, webPreferences: { webSecurity: false, backgroundThrottling: false } });
    await win.loadURL("https://d2survivors.lol/play/").catch(() => {});
    await sleep(4000);
    await win.webContents.executeJavaScript(`(()=>{const b=[...document.querySelectorAll("button")].find(x=>/hosted/i.test(x.textContent));if(b)b.click()})()`);
    await sleep(12000);
    const setup = await win.webContents.executeJavaScript(`(async () => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      await import(${JSON.stringify(PAGES + "d2edit.js?v=")} + Date.now());
      for (let i = 0; i < 120 && !window.__d2autobot?.game; i++) { document.body.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true })); await sleep(500); }
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
      return { state: g.state, cls: g.kit?.id };
    })()`);
    rec.setup = setup; flush();
    let limitedStreak = 0;
    for (let n = 1; n <= CYCLES; n++) {
      const id = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
      const r = await win.webContents.executeJavaScript(`(async () => {
        const sleep = ms => new Promise(r => setTimeout(r, ms));
        const g = window.__d2autobot.game, cls = g.kit.id;
        const ess = () => (g.save?.inventoryByClass?.[cls] || []).filter(i => i?.type === "essence" && i.base === "Burning Essence of Terror").reduce((s, i) => s + (i.count ?? 1), 0);
        const root = document.querySelector("#d2autobot-panel")?.shadowRoot;
        const toggle = (name, on) => { const b = root?.querySelector('[data-setting="' + name + '"]'); if (!b) throw new Error("找不到設定：" + name); if ((b.getAttribute("aria-checked") === "true") !== on) b.click(); };
        if (ess() < 45) { toggle("cheat.forgeMax", true); toggle("cheat.enabled", true); await sleep(2000); toggle("cheat.enabled", false); await sleep(1500); }
        const item = JSON.parse(${JSON.stringify(ITEM)}); item.id = ${JSON.stringify(id)};
        g.save.equippedByClass = g.save.equippedByClass || {}; g.save.equippedByClass[cls] = g.save.equippedByClass[cls] || {};
        g.save.equippedByClass[cls].weapon = item;
        g.anvil = item.id;
        const w = () => g.save.equippedByClass[cls].weapon;
        const sum = () => Object.values(w()?.forge?.t ?? {}).reduce((s, x) => s + x, 0);
        const act = (name) => g.forgeTry(cls, 1, name, () => {}).then(r => ({ ok: true, r }), e => ({ ok: false, err: String(e && e.message || e) }));
        const out = { itemId: item.id, essencesStart: ess(), temperTries: 0, temperOk: 0, temperFail: 0, temperErr: [] };
        let errStreak = 0;
        for (let k = 0; k < 80 && sum() < 10; k++) {
          if (ess() < 3) { out.note = "精華不足"; break; }
          const a = await act("temper"); out.temperTries++;
          const txt = a.ok ? (a.r && a.r.text) : a.err;
          if (a.ok && /Raised/i.test(txt || "")) { out.temperOk++; errStreak = 0; } else if (a.ok && /failed/i.test(txt || "")) { out.temperFail++; errStreak = 0; } else { out.temperErr.push(txt); errStreak++; if (errStreak >= 4) { out.note = "連續錯誤"; break; } await sleep(Math.min(60000, 3000 * 2 ** errStreak)); }
          await sleep(${GAP});
        }
        out.totalBefore = sum(); out.tBefore = JSON.parse(JSON.stringify(w()?.forge?.t ?? {}));
        if (out.totalBefore >= 10) {
          let h, tries = 0;
          for (; tries < 4; tries++) {
            h = await act("hellforge");
            if (h.ok && /^All tempers (doubled|lost)/i.test(String((h.r && h.r.text) || ""))) break;
            await sleep(Math.min(60000, 3000 * 2 ** tries));
          }
          out.hfTries = tries + 1;
          out.hfRet = h.ok ? h.r : h.err; out.hfOk = h.ok;
          await sleep(1200);
          out.totalAfter = sum(); out.tAfter = JSON.parse(JSON.stringify(w()?.forge?.t ?? {})); out.hf = w()?.forge?.hf ?? null;
        }
        out.essencesEnd = ess();
        return out;
      })()`).catch((e) => ({ error: String(e && e.message || e) }));
      r.n = n; r.at = new Date().toISOString();
      const txt = r.hfRet && (r.hfRet.text || (typeof r.hfRet === "string" ? r.hfRet : JSON.stringify(r.hfRet)));
      r.result = !r.hfOk ? (r.error ? "ERROR" : "NOT_RUN") : /^All tempers doubled/i.test(txt) ? "DOUBLED" : /^All tempers lost/i.test(txt) ? "LOST" : "INVALID:" + txt;
      r.contaminated = r.result !== "DOUBLED" && r.result !== "LOST";
      rec.runs.push(r); if (!rec.item) rec.item = "The Stone of Jordan / unique / Ring";
      const limitedTxt = (r.temperErr || []).concat([String(typeof r.hfRet === "string" ? r.hfRet : (r.hfRet && r.hfRet.text) || ""), String(r.error || "")]).some((t) => /No reply|No connection|429|rate/i.test(String(t)));
      const bad = r.contaminated;
      limitedStreak = bad && limitedTxt ? limitedStreak + 1 : 0;
      const valid = rec.runs.filter((x) => !x.contaminated);
      const nd = valid.filter((x) => x.result === "DOUBLED").length, nl = valid.length - nd;
      if (n % 5 === 0 || bad) flush();
      if (!bad && valid.length % 10 === 0) progress({ validDone: valid.length, attempts: n, doubled: nd, lost: nl, contaminated: n - valid.length });
      const inconsistent = !bad && ((r.result === "DOUBLED" && Object.keys(r.tAfter || {}).length === 0) || (r.result === "LOST" && Object.keys(r.tAfter || {}).length > 0));
      if ((bad && !limitedTxt) || inconsistent) { rec.errors.push("異常停止於第 " + n + " 件：" + r.result); rec.stopped = true; flush(); progress({ stopped: "anomaly", validDone: valid.length, attempts: n, doubled: nd, lost: nl }); done(2); return; }
      if (limitedStreak >= 3) { rec.errors.push("連續 3 件限流，暫停於第 " + n + " 件"); rec.stopped = true; flush(); progress({ stopped: "rate-limit", validDone: valid.length, attempts: n, doubled: nd, lost: nl }); done(3); return; }
      if (valid.length >= TARGET) { progress({ validDone: valid.length, attempts: n, doubled: nd, lost: nl, finished: true }); break; }
    }
    done(0);
  } catch (e) { rec.errors.push(String(e?.stack || e)); done(1); }
});
