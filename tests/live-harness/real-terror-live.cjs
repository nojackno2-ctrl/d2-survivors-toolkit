// 用法：H_SEED=<解碼後的存檔 JSON 路徑> H_CLASS=sorceress [H_PAUSE=1] [H_SAMPLE_MS=200000] electron tests/live-harness/real-terror-live.cjs [輸出.json]
// 使用使用者存檔的解碼副本（H_SEED，不改原檔），隔離 Electron 設定檔。
// 走遊戲真實的恐懼階流程：自動模式「天梯 → 推關」，由輔助器接受恐懼層（world.terror 為遊戲原生物件，不手動設定）。
// 開啟持續召喚頭目（與 H_PAUSE=1 時的關卡時間暫停）後，記錄：真實 terror 物件、掉落來源、鑰匙／器官／精華是否進入
// 存檔（記憶體與 localStorage 皆統計），以及關卡是否因時間暫停等設定而被提早結束。
const { app, BrowserWindow, session, net } = require("electron");
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");
const PAGES = "https://nojackno2-ctrl.github.io/d2-survivors-toolkit/";
const OUT = process.argv.slice(2).find((a) => !a.startsWith("--") && !a.endsWith("electron.exe") && a !== ".");
const SEED_PATH = process.env.H_SEED || "";
const SEED = SEED_PATH ? fs.readFileSync(SEED_PATH, "utf8") : null;
const PAUSE_ON = process.env.H_PAUSE === "1";
const SAMPLE_MS = Number(process.env.H_SAMPLE_MS) || 200000;
const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".html": "text/html", ".css": "text/css", ".svg": "image/svg+xml" };
app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "d2terror-")));
app.whenReady().then(async () => {
  let finished = false;
  const done = (result, code = 0) => {
    if (finished) return;
    finished = true;
    const json = JSON.stringify(result, null, 2);
    if (OUT) fs.writeFileSync(OUT, json + "\n"); else console.log(json);
    app.exit(code);
  };
  setTimeout(() => done({ error: "實機測試逾時" }, 1), Number(process.env.H_TIMEOUT_MS) || 285000);
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
      if (!g) throw new Error("找不到遊戲物件：" + JSON.stringify(bot?.diagnostics?.()));
      if (g.state === "select") {
        if (g.frontend?.open && !g.plainSelect().onPick) { g.frontend.actions.play(); await sleep(3000); }
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
        if ((button.getAttribute("aria-checked") === "true") !== enabled) throw new Error("設定切換失敗：" + name);
      };
      const choose = (name, value) => {
        const el = root?.querySelector('[data-setting="' + name + '"]');
        if (!el) throw new Error("找不到選單：" + name);
        el.value = value; el.dispatchEvent(new Event("change", { bubbles: true }));
        if (el.value !== value) throw new Error("選單設定失敗：" + name + "=" + value);
      };
      const cls = g.kit?.id;
      const KEY_BASES = { pk1: "terrorKey", pk2: "hateKey", pk3: "destructionKey", mbr: "brain", dhn: "horn", bey: "eye" };
      // 遞迴統計存檔中的任務物品（pk1..bey），涵蓋角色背包與個人倉庫等所有位置。
      const countQuest = (root0) => {
        const counts = {}; const seen = new Set();
        const walk = (o) => {
          if (!o || typeof o !== "object" || seen.has(o)) return; seen.add(o);
          if (Array.isArray(o)) { o.forEach(walk); return; }
          if (o.type === "quest" && KEY_BASES[o.base] !== undefined) counts[o.base] = (counts[o.base] || 0) + 1;
          for (const k of Object.keys(o)) walk(o[k]);
        };
        walk(root0);
        return counts;
      };
      const memBefore = countQuest(g.save);
      // 在世界物件中尋找任務物品（地面掉落或玩家背包），記錄所在欄位名稱，判斷撿取是否成功。
      const findQuestPaths = (root0, maxDepth) => {
        const hits = []; const seen = new Set();
        const walk = (o, path, depth) => {
          if (!o || typeof o !== "object" || seen.has(o) || depth > maxDepth) return; seen.add(o);
          if (!Array.isArray(o) && o.type === "quest" && KEY_BASES[o.base] !== undefined) { hits.push({ path, base: o.base }); return; }
          if (Array.isArray(o)) { o.forEach((v, i) => { if (i < 50) walk(v, path + "[]", depth + 1); }); return; }
          for (const k of Object.keys(o)) { if (k === "dropLog" || k === "sprite" || k === "art") continue; walk(o[k], path + "." + k, depth + 1); }
        };
        walk(root0, "", 0);
        return hits.slice(0, 40);
      };
      const lsBefore = (() => { try { return countQuest(JSON.parse(localStorage.getItem("d2-survivors/save/v1") || "null")); } catch { return null; } })();
      // 啟用輔助器與自動推關（真實恐懼階）
      toggle("enabled", true); toggle("progressEnabled", true);
      choose("autoKind", "ladder"); await sleep(300);
      choose("ladderMode", "terror"); await sleep(300);
      toggle("cheat.enabled", true); toggle("cheat.invincible", true); toggle("cheat.oneHitKill", true); toggle("cheat.summonAllBosses", true);
      ${PAUSE_ON ? 'toggle("cheat.pauseStageTime", true);' : ""}
      const t0 = performance.now();
      let offDone = false;
      // 追蹤：記錄 actCleared（清場）與 die（死亡）的呼叫來源與當下首領狀態，不改變遊戲行為。
      const traceEvents = [];
      const stackTop = () => (new Error()).stack.split(String.fromCharCode(10)).slice(2, 5).map(x => x.trim().slice(0, 120)).join(" | ");
      const origActCleared = g.actCleared, origDie = g.die;
      const origTierVictory = g.tierVictory, origDieForGood = g.dieForGood, origVictory = g.victory;
      g.tierVictory = function (...args) { traceEvents.push({ kind: "tierVictory", at: Math.round((performance.now() - t0) / 1000), terror: this.world?.terror ? { tier: this.world.terror.tier } : null, stack: stackTop() }); return origTierVictory.apply(this, args); };
      g.dieForGood = function (...args) { traceEvents.push({ kind: "dieForGood", at: Math.round((performance.now() - t0) / 1000), terror: this.world?.terror ? { tier: this.world.terror.tier } : null, stack: stackTop() }); return origDieForGood.apply(this, args); };
      g.victory = function (...args) { traceEvents.push({ kind: "victory", at: Math.round((performance.now() - t0) / 1000), stack: stackTop() }); return origVictory.apply(this, args); };
      g.actCleared = function (...args) {
        const w2 = this.world;
        traceEvents.push({ kind: "actCleared", at: Math.round((performance.now() - t0) / 1000), args: args.map(x => typeof x === "boolean" ? x : typeof x), act: w2?.act ?? null, time: w2 ? +(w2.time).toFixed(1) : null, actTime: w2 ? +((w2.time ?? 0) - (w2.actStart ?? 0)).toFixed(1) : null, boss: w2?.boss ? { name: w2.boss.name, rank: w2.boss.rank, dead: !!w2.boss.dead } : null, actBoss: w2?.actBoss ? { name: w2.actBoss.name, dead: !!w2.actBoss.dead } : null, stack: stackTop() });
        return origActCleared.apply(this, args);
      };
      g.die = function (...args) {
        traceEvents.push({ kind: "die", at: Math.round((performance.now() - t0) / 1000), args: args.map(x => typeof x === "boolean" ? x : typeof x), tierClock: (() => { try { return JSON.parse(JSON.stringify(this.tierClock)); } catch { return null; } })(), terror: this.world?.terror ? { tier: this.world.terror.tier } : null, stack: stackTop() });
        return origDie.apply(this, args);
      };
      const timeline = [], stateChanges = [], collected = [];
      let lastState = g.state, lastWorld = g.world, lastIdx = 0, worldSwaps = 0, clearingSeen = 0, terrorSeen = null, actsSeen = new Set();
      const bossNames = {};
      while (performance.now() - t0 < ${SAMPLE_MS}) {
        const w = g.world;
        if (g.state !== lastState) { stateChanges.push({ at: Math.round((performance.now() - t0) / 1000), state: g.state }); lastState = g.state; }
        if (w !== lastWorld) { worldSwaps++; lastWorld = w; lastIdx = 0; }
        if (w) {
          if (!w.dropLog) w.dropLog = [];
          for (let k = lastIdx; k < w.dropLog.length; k++) collected.push(w.dropLog[k]);
          lastIdx = w.dropLog.length;
          if (w.terror && !terrorSeen) terrorSeen = { tier: w.terror.tier, level: w.terror.level, affixes: w.terror.affixes, uber: w.terror.uber ?? null, finale: !!w.terror.finale, cow: !!w.terror.cow };
          actsSeen.add(w.act);
          if (w.boss && !w.boss.dead) bossNames[w.boss.name] = (bossNames[w.boss.name] || 0) + 1;
        }
        if (!offDone && ${Number(process.env.H_OFF_AT_MS) || 0} > 0 && performance.now() - t0 >= ${Number(process.env.H_OFF_AT_MS) || 0}) { offDone = true; toggle("cheat.summonAllBosses", false); toggle("cheat.pauseStageTime", false); stateChanges.push({ at: Math.round((performance.now() - t0) / 1000), state: "OFF: summonAllBosses+pauseStageTime" }); }
        if (g.clearing) clearingSeen++;
        timeline.push({ pauseBtn: root?.querySelector('[data-setting="cheat.pauseStageTime"]')?.getAttribute("aria-checked") ?? null, cheatBtn: root?.querySelector('[data-setting="cheat.enabled"]')?.getAttribute("aria-checked") ?? null, actStart: w ? +(w.actStart).toFixed(1) : null, lastAction: bot.diagnostics()?.lastAction ?? null, t: Math.round((performance.now() - t0) / 1000), state: g.state, act: w?.act ?? null, terrorTier: w?.terror?.tier ?? null, time: w ? +(w.time).toFixed(1) : null, actTime: w ? +((w.time ?? 0) - (w.actStart ?? 0)).toFixed(1) : null, kills: w?.kills ?? null, clearing: !!g.clearing });
        await sleep(1000);
      }
      const bySource = {};
      for (const d of collected) bySource[d.source] = (bySource[d.source] || 0) + 1;
      const memAfter = countQuest(g.save);
      const lsAfter = (() => { try { return countQuest(JSON.parse(localStorage.getItem("d2-survivors/save/v1") || "null")); } catch { return null; } })();
      return {
        url: location.href, class: cls, pauseOn: ${PAUSE_ON},
        traceEvents,
        uberGuard: window.__d2uberGuard ?? null,
        finalState: g.state, stateChanges, worldSwaps, actsSeen: [...actsSeen],
        terrorSeen, clearingSeenSamples: clearingSeen,
        kills: g.world?.kills ?? null, bossNamesObserved: bossNames,
        dropTotal: collected.length, dropBySource: bySource,
        pandemoniumStorageNow: (() => { try { const o = JSON.parse(localStorage.getItem("d2-survivors/save/v1") || "null"); return o?.pandemonium ?? null; } catch { return "parse-error"; } })(),
        pandemoniumWorld: g.world?.pandemonium ?? null,
        pandemoniumSave: g.save?.pandemonium ?? null,
        pandemoniumHeroRun: g.save?.heroes?.[cls]?.run?.pandemonium ?? null,
        pandemoniumDoneSave: g.save?.pandemoniumDone ?? null,
        questPathsInWorldNow: findQuestPaths(g.world, 4),
        questPathsInSaveNow: findQuestPaths(g.save, 6),
        questCountMemoryBefore: memBefore, questCountMemoryAfter: memAfter,
        questCountStorageBefore: lsBefore, questCountStorageAfter: lsAfter,
        timelineSample: timeline.filter((_, i) => i % 10 === 0),
        timelineLast: timeline.slice(-5),
        diagnostics: bot.diagnostics()
      };
    })()`);
    done(result);
  } catch (e) { done({ error: String(e?.stack || e) }, 1); }
});
