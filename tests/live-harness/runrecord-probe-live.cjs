// 用法：H_SEED=<解碼後存檔 JSON> H_CLASS=sorceress electron tests/live-harness/runrecord-probe-live.cjs [輸出.json]
// 目的：在官方 /play/ 以隔離設定檔走真實恐懼階流程，遊玩一段時間後，直接呼叫遊戲自己的 runRecord()
// 取得「若上傳會送出的紀錄」（flags／notes／pace／debug／time…），不送出任何請求（/api 一律攔截並記錄本文）。
// 分三段取樣：A 開局 60 秒、B 開啟輔助器作弊後 30 秒（對照 tainted／debug／flags 是否改變）、C 存檔內 leaderboard 狀態。
const { app, BrowserWindow, session, net } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");
const PAGES = "https://nojackno2-ctrl.github.io/d2-survivors-toolkit/";
const OUT = process.argv.slice(2).find((a) => !a.startsWith("--") && !a.endsWith("electron.exe") && a !== ".");
const SEED_PATH = process.env.H_SEED || "";
const SEED = SEED_PATH ? fs.readFileSync(SEED_PATH, "utf8") : null;
const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".html": "text/html", ".css": "text/css", ".svg": "image/svg+xml" };
app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "d2rr-")));
app.whenReady().then(async () => {
  let finished = false;
  const blocked = [];
  const done = (result, code = 0) => {
    if (finished) return;
    finished = true;
    result.blockedApi = blocked;
    const json = JSON.stringify(result, null, 2);
    if (OUT) fs.writeFileSync(OUT, json + "\n"); else console.log(json);
    app.exit(code);
  };
  setTimeout(() => done({ error: "實機測試逾時" }, 1), Number(process.env.H_TIMEOUT_MS) || 280000);
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  try {
    session.defaultSession.protocol.handle("https", async (req) => {
      const u = new URL(req.url);
      if (u.hostname === "d2survivors.lol" && u.pathname.startsWith("/api/") && req.method !== "GET") {
        let body = null; try { body = await req.clone().text(); } catch {}
        blocked.push({ method: req.method, path: u.pathname, bytes: body ? body.length : 0, body: body ? body.slice(0, 6000) : null });
        return new Response("{}", { status: 503 });
      }
      if (!req.url.startsWith(PAGES)) return net.fetch(req, { bypassCustomProtocolHandlers: true });
      const rel = decodeURIComponent(u.pathname.slice("/d2-survivors-toolkit/".length));
      const file = path.resolve(ROOT, rel);
      if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return new Response("not found", { status: 404 });
      return new Response(fs.readFileSync(file), { headers: { "content-type": (MIME[path.extname(file)] || "application/octet-stream") + "; charset=utf-8", "access-control-allow-origin": "*", "cache-control": "no-store" } });
    });
    const win = new BrowserWindow({ width: 1100, height: 800, show: true, webPreferences: { webSecurity: false, backgroundThrottling: false } });
    await win.loadURL("https://d2survivors.lol/play/").catch(() => {});
    await sleep(4000);
    await win.webContents.executeJavaScript(SEED
      ? `localStorage.setItem("d2-survivors/save/v1", ${JSON.stringify(SEED)}); localStorage.removeItem("d2autoforge.memory");`
      : `localStorage.removeItem("d2-survivors/save/v1"); localStorage.removeItem("d2autoforge.memory");`);
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
      if (!g) throw new Error("找不到遊戲物件");
      if (g.state === "select") {
        if (!g.plainSelect().onPick) { g.chooseClass(); await sleep(1500); }
        const select = g.plainSelect(), cls = ${JSON.stringify(process.env.H_CLASS || "sorceress")};
        const index = select.cards.findIndex(c => c.dataset?.class === cls);
        if (index < 0) throw new Error("找不到職業：" + cls);
        select.select(index); await sleep(300); select.confirm(false);
      }
      for (let i = 0; i < 120 && !g.world?.player; i++) await sleep(500);
      const root = document.querySelector("#d2autobot-panel")?.shadowRoot;
      const toggle = (name, enabled) => {
        const button = root?.querySelector('[data-setting="' + name + '"]');
        if (!button) throw new Error("找不到設定：" + name);
        if ((button.getAttribute("aria-checked") === "true") !== enabled) button.click();
      };
      const choose = (name, value) => {
        const el = root?.querySelector('[data-setting="' + name + '"]');
        if (!el) throw new Error("找不到選單：" + name);
        el.value = value; el.dispatchEvent(new Event("change", { bubbles: true }));
      };
      toggle("enabled", true); toggle("progressEnabled", true);
      // 全新存檔通常尚未解鎖恐懼階，天梯／恐懼設定失敗時改走一般難度，不中止測試。
      const setup = [];
      try { choose("autoKind", "ladder"); await sleep(300); choose("ladderMode", "terror"); await sleep(300); setup.push("ladder/terror"); } catch (e) { setup.push("ladder 設定失敗：" + e.message); }
      const snap = (label) => {
        const out = { label, state: g.state, terror: g.world?.terror ? { tier: g.world.terror.tier } : null, time: g.world?.time, tainted: g.tainted, harnessCounts: g.harnessCounts };
        try {
          const rec = g.runRecord("probe0000000000000000");
          out.record = { v: rec.v, platform: rec.platform, build: rec.build, board: rec.board, time: rec.time, continued: rec.continued, level: rec.hero?.level, cls: rec.hero?.class ?? rec.cls, flags: rec.flags, notes: rec.notes, pace: rec.pace, keys: Object.keys(rec), gold: rec.hero?.gold };
        } catch (e) { out.recordError = String(e && e.stack || e).slice(0, 500); }
        try { out.leaderboardSave = g.save.leaderboard ? { off: g.save.leaderboard.off, edited: g.save.leaderboard.edited, imported: g.save.leaderboard.imported, rechecked: g.save.leaderboard.rechecked, hasId: !!g.save.leaderboard.id } : null; } catch {}
        try { out.page = g.page(); } catch {}
        try { out.nextCheck = g.nextCheck; const w = g.winRun(); out.winRun = { counts: w?.counts, whose: w?.whose }; } catch {}
        // 修改器「旗標檢查」用的資料：存檔中每個角色狀態的等級／經驗值／技能，並以官方公式驗算
        try {
          const cap = (lv) => Math.round((5 + 4 * (lv - 1) ** 1.35) * 1.1 ** Math.max(0, lv - 25) * 1.1 ** Math.max(0, lv - 89));
          out.xpProbe = [];
          for (const [cls, hero] of Object.entries(g.save.heroes ?? {})) for (const key of ["kept", "run"]) {
            const st = hero?.[key]; if (!st) continue;
            const lv = st.run?.level, xp = st.run?.xp, ids = (st.build?.skills ?? []).map(k => k.id);
            out.xpProbe.push({ cls, key, level: lv, xp, cap: Number.isInteger(lv) ? cap(lv) : null, xpOk: Number.isInteger(lv) ? (xp >= 0 && xp <= cap(lv) + 1) : null, skills: ids.length, dup: new Set(ids).size !== ids.length, mode: g.save.mode });
          }
          out.saveKeys = Object.keys(g.save ?? {});
          try {
            const ls = JSON.parse(localStorage.getItem("d2-survivors/save/v1") || "null");
            out.lsHeroes = ls ? Object.entries(ls.heroes ?? {}).map(([c, h]) => ({ c, keys: Object.keys(h ?? {}), kept: h?.kept ? { level: h.kept.run?.level, xp: h.kept.run?.xp, bl: h.kept.build?.level } : null, run: h?.run ? { level: h.run.run?.level, xp: h.run.run?.xp, bl: h.run.build?.level, hasRun: !!h.run.run } : null })) : null;
            out.lsMode = ls?.mode;
          } catch (e) { out.lsError = String(e); }
        } catch (e) { out.xpProbeError = String(e); }
        out.lsKeys = Object.keys(localStorage).filter(k => k.startsWith("d2s:"));
        out.checksQueue = (() => { try { return JSON.parse(localStorage.getItem("d2s:leaderboard-checks") || "[]").length; } catch { return null; } })();
        out.runQueue = (() => { try { return JSON.parse(localStorage.getItem("d2s:leaderboard-queue") || "[]").length; } catch { return null; } })();
        return out;
      };
      const samples = [];
      await sleep(20000); samples.push(snap("A1 開局約 20 秒"));
      await sleep(40000); samples.push(snap("A2 開局約 60 秒（未開作弊）"));
      toggle("cheat.enabled", true); toggle("cheat.invincible", true); toggle("cheat.oneHitKill", true);
      await sleep(30000); samples.push(snap("B 開啟無敵／秒殺作弊約 30 秒"));
      // C：用遊戲自己的 startDebugTier 直接進恐懼階（terrorDebug＝成績不計），只為取得恐懼階紀錄的欄位結構。
      try {
        toggle("cheat.enabled", false);
        g.startDebugTier(g.kit, 1);
        for (let i = 0; i < 60 && !g.world?.terror; i++) await sleep(500);
        await sleep(25000);
        samples.push(snap("C 恐懼階 1（startDebugTier，除錯＝不計榜）約 25 秒"));
      } catch (e) { samples.push({ label: "C 進入恐懼階失敗", recordError: String(e && e.stack || e).slice(0, 600) }); }
      return JSON.stringify({ cls: g.kit?.id, setup, seed: ${JSON.stringify(SEED ? "副本存檔" : "全新存檔")}, samples }, (k, v) => typeof v === "function" ? undefined : v);
    })()`);
    done({ ok: true, url: "https://d2survivors.lol/play/", ...JSON.parse(result) });
  } catch (error) {
    done({ error: String(error?.stack || error) }, 1);
  }
});
